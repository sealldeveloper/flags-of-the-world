# ScuffedUNO iroh edition

Static browser card game with group lobbies for **2–8 players**, including bots. Multiplayer uses the locally compiled **iroh 1.0.0** WASM module. There is no custom signaling service, game API, WebRTC fallback, or database.

## Run locally

From the repository root:

```sh
python3 -m http.server 18764 --bind 127.0.0.1
```

Open <http://127.0.0.1:18764/uno/>. Enter a name, create a group lobby, and share the invite with another browser window/profile that can reach the same static URL. Everyone marks themselves ready; the host deals. Bots can fill empty seats.

`localhost` links are only usable on the same computer. For actual phones or other computers, serve these same static assets from an HTTPS origin reachable by everyone (or use a trusted local HTTPS development server). A plain remote LAN HTTP address is not a supported secure browser origin. Loading the assets does not host the game logic—the host's tab does.

Published at <https://puzzle.seall.dev/uno/>. Local preview remains available without deployment.

## Implemented

- Private group invite links open the name-and-join flow directly; eight seats, readiness, host-only rule/start/seat controls. **Force start** skips readiness for connected players only, never the two-player minimum or connection requirement.
- Self-service lobby names and mix-and-match avatars: a native colour picker × twelve patterns, distinct automatic defaults, live preview, and authoritative peer updates. Changes are locked during play; profiles survive guest resume without accounts.
- Share the self-contained iroh invite by copying, an available native share sheet, or an optional locally generated QR code. The QR contains exactly the same invite, never a shortened URL or a third-party QR-service link.
- Original 108-card-style deck, seven-card hands, normal/wild/action cards, colour selection, turn direction, draw/pass, deck recycling, round end and rematch.
- Single-click/tap normal card play and deck drawing—no select-then-confirm step. A playable newly drawn card gets **Play / Keep** buttons directly above it. Force play removes Keep and automatically plays ordinary draws; wild colour and 7-swap choices still require a dialog. Enter/Space activate focused buttons/cards; Cancel/Escape leaves a required choice pending.
- Stable turn-independent camera/hand framing; inactive cards dim without resizing the hand. Legal out-of-turn jump-in cards remain bright. Compact avatar/name/count HUDs use numeric application-level RTT to the host instead of fake signal bars. Host/local bots show `0 ms` (no network hop); unmeasured or disconnected peers show `— ms`.
- Draws arrive one card at a time. A 7 shows an actor-to-target arrow, pauses on the selection, then exchanges the hands in two flights with a 500 ms pause between them. A 0 with 7–0 enabled shows direction-aware arrows and simultaneously passes every hand as card backs before revealing the recipient's new private hand. The host enforces presentation delays and a 1.5-second jump-in opportunity after eligible numeric plays.
- The original ScuffedUNO **UNO** button artwork appears only after your second-last card lands, on your retained turn. Three seconds are reserved for your call, followed by a five-second catch window. An opponent can catch a missed call for two cards; the first host-validated call/catch wins. No pre-arming or out-of-turn calls. Bots call automatically. Transfers and new rounds clear obsolete calls.
- A recipient-specific **You won / You lost this round** dialog opens after the final card/hand-transfer animation, with public card counts, host rematch and guest waiting guidance. Results can be dismissed and reopened from the lobby.
- Five independent switches: jump-ins, 7–0, draw till playable, force play, and stacking (+2 on +2 / +4 on +4). The lobby uses the original ScuffedUNO rule illustrations in its three-column selector, with grayscale off states, colour on states, short captions, and keyboard-operable checkboxes. The original's “Draw To Play” caption maps to draw till playable here.
- Compact cog Settings for motion, theme, credits and leaving a room. A hamburger opens the last 50 public action notices observed by this tab; history is memory-only, newest first, and never contains private draw identities. Healthy connection details stay in Settings; connection problems remain visible. The puzzles link is main-menu-only.
- Host-run bots using the same legal action path as people.
- Recipient-filtered snapshots: guests receive their own hand, not the deck or other hands.
- Authenticated iroh endpoint connections; random join and seat-resume capabilities.
- Duplicate command protection, stale revision rejection, bounded messages/queues, join timeout, heartbeat/retry, guest reload/resume, host close notices.
- Pauses for a disconnected current player; host may replace an offline seat with a bot during play.
- Actual ScuffedUNO classic atlas, logo, and default avatar assets, served locally. A Three.js/WebGL presentation adapter replaces the CSS imitation with dimensional cards, perspective camera, glowing direction arrows, animated dealing/plays, opponent hands, and projected keyboard-operable card/deck hit targets. Light/dark lobby themes and wild colour/7-swap dialogs remain.
- Separate **IROH EDITION** logo badge, prominent original-author attribution to **Freddie Nelson**, original-game/creator links, and an in-game Credits dialog. The unmodified upstream logo is retained separately.
- No original Socket.IO client, account management, ads, shop, login, telemetry, or backend APIs. Three.js is vendored locally under MIT; no runtime CDN requests.

## Deliberate limits

- **Asset redistribution permission is unverified.** See `assets/scuffeduno/README.md` and the original-file hash/URL manifest. Publication was requested by the operator; attribution is not a licence claim.
- WebGL is required for the 3D table. Browser/device visual verification is recorded in `TESTING.md`; this is not a claim of complete original-game feature parity.
- **Public iroh relays are required for browser traffic.** These are not custom game servers, but this is not infrastructure-free. Address discovery is disabled; an invite carries the host endpoint and an allowlisted iroh relay URL.
- The host is trusted and can inspect every hand/deck in developer tools. This is casual play, not cryptographic anti-cheat.
- Host reload/closure ends the room; no host migration. Keep the host tab foregrounded, particularly on mobile.
- No accounts, lobby directory, persistent rooms, chat, spectators, short-code lookup, or cumulative scoring.
- Except when responding to a +4 stack, +4 is disallowed while holding the current colour; no bluff/challenge mechanic. People call UNO after their second-last play; bots call automatically. A missed-UNO catch adds two cards during the bounded catch window.
- Joining a new seat during an active round is disallowed. Existing seats can resume with their private per-tab capability.
- A failed browser/network should show a real error; there is no simulated multiplayer/offline transport fallback.

## Lobby controls and house rules

**Your profile** changes only your own display name, colour, and pattern. Changes are confirmed by the host, do not reset readiness, and are allowed in the lobby or between rounds. All peers see the same profile in both the lobby and the 3D table. Names are rendered as text; colours are strict six-digit hex values (legacy preset IDs are also accepted), and patterns are an allowlisted enum, never arbitrary CSS or image URLs. The unchanged original orange/dots avatar remains available; the additional local patterns retain the original border.

**Share lobby** reveals the private link. **Show QR code** generates its QR locally using vendored `qrcode-generator` 2.0.4 (MIT). Guests can share the same host invite. Treat both link and QR as room credentials. `localhost` links/QRs cannot bring another physical device to this static site: use a shared HTTPS origin for that. No relay can make an otherwise unreachable static page accessible.

The rule selector and Start Game button sit together beside the large player/avatar and Add Bot tiles. Mobile stacks the options above the players instead of copying the original's clipped tabbed layout. **Rule details & how to play** expands the full descriptions; each checkbox also has an accessible description and visible focus/checked indicator. Public lobbies, team modes, login, adverts, and chat remain absent.

All rule switches default **off**. Only the host changes them, between rounds; changes reset guest readiness.

| Switch | Behaviour |
| --- | --- |
| Jump-ins | An identical colour **and number** can be played out of turn. After the play/swap animation finishes, a host-enforced 1.5-second window blocks the next player's ordinary move but permits legal jumpers. Normal turn actions then unlock; an unchanged matching discard can still be jumped on. Play continues after the jumper. No jumps on wild/action cards, during draw penalties, or during drawn-card choices. First valid host-accepted move wins a race; stale moves are rejected. |
| 7–0 | A 7 swaps hands with a chosen player; a 0 rotates hands. Swaps/rotation resolve before winner detection. |
| Draw till playable | One deck click draws until the first newly drawn playable card, or exhaustion. Each arrival is shown individually, including hand counts; previously held cards do not stop drawing. Without force play, use **Play / Keep** above the newly drawn card. Keep retains it and ends the turn. |
| Force play | A playable drawn card must be played. Ordinary cards play automatically. Wilds and 7-swap cards open the required chooser; dismissing it keeps the card pending, not passed. This switch alone still draws only one card. |
| Stacking | +2 stacks on +2; +4 stacks on +4, regardless of held colours when responding to that penalty. No mixing. A penalty is paid automatically when there is no legal stack; otherwise choose a matching stack or click the deck to accept the penalty. Payment consumes the turn; draw-till/force-play do not extend it. |

The engine validates each action atomically; recipient-private presentation events then reveal individual draws and staged swaps in order. New actions are locked until the sequence finishes, and bots respect the same pacing. A turn with no legal play automatically draws; mandatory penalties do too unless a legal stack remains available. Draw identities are sent only to their owner; other players receive counts. Reduced-motion removes flight/dash motion, not the fair timing or ordered state changes. Ping samples use nonce-matched iroh application ping/pong messages and do not change the game revision.

These are the defined preview semantics, not a claim that every original ScuffedUNO edge case has been reproduced.

## Build the WASM module

The generated `wasm/transport.js` and `wasm/transport_bg.wasm` are served locally alongside the page. To rebuild:

1. Install Rust with `wasm32-unknown-unknown` (the initial build used rustc 1.99.0).
2. Install **wasm-bindgen-cli 0.2.122**, matching `uno-transport/Cargo.toml`.
3. Run `bash scripts/build-uno.sh` from the repository root.

The script compiles the lockfile with browser randomness configured, then emits `--target web` bindings. No runtime CDN imports or npm bundle is required. The Rust transport source is in `../uno-transport/`; its build cache is ignored. Tool installation for this development session lives under `/tmp/puzzle-uno-tools`, without changing shell startup files.

## Tests

```sh
node --test tests/uno-*.test.mjs
# Current release regression (real iroh peers + WebGL):
node tests/uno-release-browser.cjs
node tests/uno-release-visual.cjs
node tests/uno-toolbar.cjs
node tests/uno-round.cjs
# With the local static server running and Playwright installed; older feature suites
# may contain assertions for superseded pre-armed UNO/profile/header controls:
node tests/uno-browser.cjs
node tests/uno-3d.cjs
node tests/uno-controls.cjs
node tests/uno-lobby-visual.cjs
node tests/uno-presentation.cjs
node tests/uno-finish-browser.cjs
# Also requires @zxing/library for independent QR decoding:
node tests/uno-lobby-rules.cjs
node tests/uno-credits.cjs
node tests/uno-states.cjs
node tests/uno-round.cjs
# Optional second-engine check (requires Playwright Firefox):
node tests/uno-firefox.cjs
```

Browser-test overrides: `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `FIREFOX_PATH`, `BASE_URL`, `SCREENSHOT_DIR`, `ZXING_MODULE` (optional absolute path to a test-only ZXing decoder).

Engine tests cover deck conservation, 2–8 player games, rule combinations, illegal/stale/duplicate commands, private views, and invite validation. The browser integration test uses **real public iroh relay connections** between isolated browser contexts, not a mocked transport. It exercises group admission, readiness/rules, private dealing, turns, guest reload/resume, room close, full lobbies, bot turns, and viewport/theme screenshots. Its network tests require relay availability.

The lobby/rules browser test uses real iroh peers for profile changes, resume, share/QR admission, and rules. It decodes rendered QR pixels with independent ZXing code. Rule edge cases use explicitly constructed, host-owned deals with the production engine and real peer snapshots; these are test-only fixtures, not application endpoints or a network fallback. Native-share payload handling is tested with an OS-share stub, not a physical phone share sheet. The pure tests cover all 32 rule combinations and card conservation.

Browser emulation is not physical-device certification; iOS backgrounding and cross-network play still need testing on actual devices.

## Architecture references

The transport follows the public endpoint/router and Rust-to-WASM approach documented in the official [iroh browser echo example](https://github.com/n0-computer/iroh-examples/tree/main/browser-echo). The presentation uses the actual classic assets from [ScuffedUNO](https://scuffeduno.online/) with a new local renderer adapter, not its application bundles. Asset origins and licence uncertainty are documented in `assets/scuffeduno/`. Three.js 0.160.1 and the required addons are pinned in `vendor/three/manifest.json`, with their MIT licence retained. Locally hosted fonts come from the Google Fonts repository and are distributed under the SIL Open Font License; their notices are in `fonts/`. There are no runtime font/CDN requests. Other dependencies retain their respective licences.
