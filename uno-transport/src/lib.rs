//! Small, bounded, browser-only game transport. All peer bytes travel via iroh.
use std::{collections::HashMap, sync::{Arc, Mutex}, time::Duration};
use anyhow::{Result, bail};
use async_channel::{Sender, Receiver};
use iroh::{Endpoint, EndpointAddr, RelayMap, RelayMode, endpoint::Connection, protocol::{Router, ProtocolHandler, AcceptError}};
use n0_future::{StreamExt, task, time::timeout};
use serde::Serialize;
use wasm_bindgen::prelude::*;

const ALPN: &[u8] = b"puzzle.seall.dev/scuffed-cards/1";
const MAX_FRAME: usize = 65536;
const RELAYS: [&str; 4] = ["use1-1.relay.n0.iroh.link.", "usw1-1.relay.n0.iroh.link.", "euc1-1.relay.n0.iroh.link.", "aps1-1.relay.n0.iroh.link."];

// Keep existing invite identities, but use ordinary browser hostnames on the wire.
// Trailing-dot HTTPS/WebSocket hosts can be blocked by browser/network filters;
// a blocked /ping response without CORS prevents iroh from selecting a relay.
fn browser_relay(host: &str) -> iroh::RelayUrl {
    format!("https://{}/", host.trim_end_matches('.')).parse().expect("fixed relay URL")
}

#[derive(Serialize)]
struct Event { kind: &'static str, connection: String, peer: String, data: String }
struct Peer { outgoing: Sender<Vec<u8>>, connection: Connection }
struct Shared { peers: HashMap<String, Peer>, serial: u64 }
#[derive(Clone)]
struct Protocol { shared: Arc<Mutex<Shared>>, events: Sender<Event> }

impl std::fmt::Debug for Protocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.debug_struct("GameProtocol").finish_non_exhaustive() }
}
impl Protocol {
    async fn run(&self, connection: Connection, incoming: bool) -> Result<()> {
        let id = {
            let mut s = self.shared.lock().unwrap();
            if s.peers.len() >= 16 { connection.close(1u8.into(), b"room full"); bail!("Connection limit"); }
            s.serial += 1;
            s.serial.to_string()
        };
        let remote = connection.remote_id().to_string();
        let (tx, rx) = async_channel::bounded::<Vec<u8>>(32);
        self.shared.lock().unwrap().peers.insert(id.clone(), Peer { outgoing: tx, connection: connection.clone() });
        let result = async {
            let (mut send, mut recv) = timeout(Duration::from_secs(10), async {
                if incoming { connection.accept_bi().await } else { connection.open_bi().await }
            }).await??;
            // open_bi is lazy: send an empty protocol preamble so the acceptor sees it.
            if !incoming { send.write_all(&0u32.to_be_bytes()).await?; }
            self.events.send(Event { kind: "connected", connection: id.clone(), peer: remote.clone(), data: String::new() }).await?;
            let writer_connection = connection.clone();
            let writer = task::spawn(async move {
                while let Ok(bytes) = rx.recv().await {
                    if send.write_all(&(bytes.len() as u32).to_be_bytes()).await.is_err() || send.write_all(&bytes).await.is_err() { break; }
                }
                writer_connection.close(0u8.into(), b"writer closed");
            });
            let read_result: Result<()> = async {
                loop {
                    let mut prefix = [0u8; 4];
                    timeout(Duration::from_secs(45), recv.read_exact(&mut prefix)).await??;
                    let len = u32::from_be_bytes(prefix) as usize;
                    if len == 0 { continue; }
                    if len > MAX_FRAME { bail!("Frame too large"); }
                    let mut bytes = vec![0; len];
                    timeout(Duration::from_secs(15), recv.read_exact(&mut bytes)).await??;
                    let data = String::from_utf8(bytes)?;
                    self.events.send(Event { kind: "message", connection: id.clone(), peer: remote.clone(), data }).await?;
                }
            }.await;
            writer.abort();
            read_result
        }.await;
        self.shared.lock().unwrap().peers.remove(&id);
        connection.close(0u8.into(), b"closed");
        // Do not put transport errors, credentials, or payloads in browser logs.
        let _ = self.events.send(Event { kind: "closed", connection: id, peer: remote, data: String::new() }).await;
        result
    }
}
impl ProtocolHandler for Protocol {
    async fn accept(&self, connection: Connection) -> std::result::Result<(), AcceptError> {
        let _ = self.run(connection, true).await;
        Ok(())
    }
}

#[wasm_bindgen]
pub struct GameTransport { router: Router, protocol: Protocol, receiver: Receiver<Event> }

#[wasm_bindgen]
impl GameTransport {
    pub async fn create() -> std::result::Result<GameTransport, JsError> {
        console_error_panic_hook::set_once();
        let relays: RelayMap = RELAYS.iter().map(|host| browser_relay(host)).collect();
        let endpoint = Endpoint::builder(iroh::endpoint::presets::N0)
            .relay_mode(RelayMode::Custom(relays))
            .clear_address_lookup() // Invite contains the relay: no discovery/directory service.
            .alpns(vec![ALPN.to_vec()]).bind().await.map_err(js_err)?;
        if timeout(Duration::from_secs(25), endpoint.online()).await.is_err() {
            endpoint.close().await;
            return Err(JsError::new("Could not reach an iroh relay. Check your connection and retry."));
        }
        let (events, receiver) = async_channel::bounded(128);
        let protocol = Protocol { shared: Arc::new(Mutex::new(Shared { peers: HashMap::new(), serial: 0 })), events };
        let router = Router::builder(endpoint).accept(ALPN, protocol.clone()).spawn();
        Ok(Self { router, protocol, receiver })
    }
    pub fn endpoint_id(&self) -> String { self.router.endpoint().id().to_string() }
    pub fn relay_url(&self) -> String {
        // Compact Tier List codes encode this allowlisted relay's index, not its URL.
        // Preserve the old dotted identity so existing UNO and Tier List invites work.
        self.router.endpoint().addr().relay_urls().next().and_then(|url| {
            RELAYS.iter().find(|host| browser_relay(host) == *url).map(|host| format!("https://{host}/"))
        }).unwrap_or_default()
    }
    pub fn events(&self) -> wasm_streams::readable::sys::ReadableStream {
        let stream = self.receiver.clone().map(|event| serde_wasm_bindgen::to_value(&event).map_err(|e| JsValue::from_str(&e.to_string())));
        wasm_streams::ReadableStream::from_stream(stream).into_raw()
    }
    pub async fn connect(&self, endpoint: String, relay: String) -> std::result::Result<(), JsError> {
        let relay: iroh::RelayUrl = relay.parse().map_err(js_err)?;
        // A pasted ticket cannot dial arbitrary URLs on the user's network.
        let host = RELAYS.iter().find(|host| relay.to_string() == format!("https://{host}/"))
            .ok_or_else(|| JsError::new("Unsupported iroh relay in invite"))?;
        let address = EndpointAddr::new(endpoint.parse().map_err(js_err)?).with_relay_url(browser_relay(host));
        let connection = timeout(Duration::from_secs(20), self.router.endpoint().connect(address, ALPN)).await.map_err(js_err)?.map_err(js_err)?;
        let protocol = self.protocol.clone();
        task::spawn(async move { let _ = protocol.run(connection, false).await; });
        Ok(())
    }
    pub fn send(&self, id: String, text: String) -> std::result::Result<(), JsError> {
        if text.len() > MAX_FRAME { return Err(JsError::new("Message too large")); }
        let s = self.protocol.shared.lock().unwrap();
        let peer = s.peers.get(&id).ok_or_else(|| JsError::new("Not connected"))?;
        peer.outgoing.try_send(text.into_bytes()).map_err(|_| JsError::new("Peer is not keeping up"))
    }
    pub fn disconnect(&self, id: String) {
        if let Some(peer) = self.protocol.shared.lock().unwrap().peers.get(&id) { peer.connection.close(0u8.into(), b"left room"); }
    }
    pub async fn close(&self) { let _ = self.router.shutdown().await; self.protocol.events.close(); }
}
fn js_err(error: impl std::fmt::Display) -> JsError { JsError::new(&error.to_string()) }
