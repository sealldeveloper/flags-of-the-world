# Browser game transport

Source for `uno/wasm/transport.js` and `uno/wasm/transport_bg.wasm`, shared by UNO and Tier List. Build with Rust's `wasm32-unknown-unknown` target and wasm-bindgen CLI **0.2.122**:

```sh
bash scripts/build-uno.sh
```

Dependencies are locked. `.cargo/config.toml` selects the browser randomness backend. No discovery/directory service is enabled. Peer authentication, protocol, 16-connection bound and 64 KiB frame limit are unchanged.

## Relay hostname compatibility

The iroh 1.0 defaults use trailing-dot relay hostnames. Some browser/network filters reject these HTTPS probes or WSS upgrades, sometimes returning a 403 without CORS headers. Explicitly configure the same four trusted n0 relays with ordinary, non-dotted hostnames for browser network traffic, including connections made from invites.

Keep the old dotted URL as the invite identity. Tier List's compact codes store the relay index, and existing UNO tickets also contain dotted URLs. Validate the exact trusted invite URL **before** selecting its canonical browser URL. Do not accept arbitrary hosts or patch global browser networking APIs.

`uno/transport.mjs` versions both generated assets so an updated JS wrapper cannot load an older cached WASM binary. Change that version when rebuilding an incompatible transport.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node tests/relay-browser.cjs
# Optional Firefox with an installed Playwright-compatible binary:
RELAY_BROWSERS=chromium,firefox FIREFOX_PATH=/path/to/firefox \
  PLAYWRIGHT_MODULE=/path/to/playwright node tests/relay-browser.cjs
```

The browser regression deliberately denies dotted relay HTTPS/WSS requests, then exchanges a message over real public iroh relays using a legacy-format Tier List invite. It also checks that discovery stays disabled and arbitrary relay destinations remain rejected. The pre-fix WASM fails this scenario with its relay-unreachable timeout; no successful relay response is mocked.
