#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Requires a Rust toolchain with wasm32-unknown-unknown and wasm-bindgen 0.2.122.
# No npm install or runtime server is required.
if [[ "$(wasm-bindgen --version)" != "wasm-bindgen 0.2.122" ]]; then
  echo 'Install wasm-bindgen-cli 0.2.122 (must match Cargo.toml).' >&2; exit 1
fi
(cd uno-transport && cargo build --target wasm32-unknown-unknown --release --locked)
mkdir -p uno/wasm
wasm-bindgen uno-transport/target/wasm32-unknown-unknown/release/scuffed_cards_transport.wasm --target web --out-dir uno/wasm --out-name transport --no-typescript
