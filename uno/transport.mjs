const RELAYS = new Set(['use1-1', 'usw1-1', 'euc1-1', 'aps1-1'].map(region => `https://${region}.relay.n0.iroh.link./`));
export function encodeTicket(ticket) { return btoa(JSON.stringify(ticket)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export function decodeTicket(input) {
  if (typeof input !== 'string' || input.length > 4096) throw new Error('Invite is too long');
  let raw = input.trim();
  if (raw.includes('#')) raw = new URLSearchParams(raw.slice(raw.indexOf('#') + 1)).get('join') || '';
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Paste a full invite link or ticket');
  let t;
  try { t = JSON.parse(atob(raw.replaceAll('-','+').replaceAll('_','/'))); } catch { throw new Error('Invalid invite'); }
  if(t?.v!==3)throw new Error('This invite uses an older game version. Refresh and ask the host for a new lobby link.');
  if (!t || typeof t.host !== 'string' || !/^[a-z0-9]{52,64}$/.test(t.host) ||
      !RELAYS.has(t.relay) || !/^[a-f0-9]{32}$/.test(t.room) || !/^[a-f0-9]{32}$/.test(t.secret)) throw new Error('Unsupported or invalid invite');
  return {v:3, host:t.host, relay:t.relay, room:t.room, secret:t.secret};
}
export const token = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2,'0')).join('');
export class Transport {
  static async create(onEvent) {
    let module;
    try { module = await import('./wasm/transport.js'); await module.default(); }
    catch { throw new Error('iroh WASM could not load. Build it with scripts/build-uno.sh and serve this page over HTTP(S).'); }
    const transport = new Transport();
    transport.node = await module.GameTransport.create();
    transport.reader = transport.node.events().getReader();
    transport.onEvent = onEvent;
    transport.read();
    return transport;
  }
  async read() {
    try {
      while (true) { const {value,done} = await this.reader.read(); if (done) break; this.onEvent(value); }
    } catch { if (!this.closed) this.onEvent({kind:'transportError'}); }
  }
  address() { return {host:this.node.endpoint_id(), relay:this.node.relay_url()}; }
  connect(ticket) { return this.node.connect(ticket.host, ticket.relay); }
  send(connection, message) { this.node.send(connection, JSON.stringify(message)); }
  disconnect(connection) { this.node.disconnect(connection); }
  async close() { this.closed = true; await this.node.close(); }
}
