# Relay and TierMaker regression checks — 2026-11-15

## Relay compatibility

Rebuilt the shared browser-only iroh 1.0 transport with an explicit map of the same four public n0 relays, using non-trailing-dot HTTPS/WSS hostnames. Invites retain their original dotted identities and relay indexes; the Rust boundary still validates the exact allowlist before dialing. Discovery remains disabled. Versioned JS/WASM URLs and app-shell v22 prevent stale generated assets from being mixed.

Evidence:

- Original transport works on the current network, but deliberately blocking dotted relay hosts reproduces `Could not reach an iroh relay. Check your connection and retry.`
- Rebuilt transport passes that same filtered-host regression in **Chromium and Firefox**: real authenticated peer connection, compact invite, message delivery, no dotted network requests, no discovery requests, arbitrary destinations rejected.
- Locked release WASM build and all **211 final combined Node regression tests** passed.
- Full Tier List browser flow passed: local editing/persistence/import/export, real three-peer lobby, multi-chunk album transfer, independent rankings, late join, resume, copy after full originals transfer, and host closure (four canonical relay sockets). The initial legacy harness only allowed 30 seconds for resumed originals; it now explicitly waits for transfer completion and asserts canonical socket URLs.
- Service-worker update regression passed, including explicit update activation, preserved saves/themes/data, offline Tier List authoring and actual offline lossless WASM encoding. The first attempt lacked an installed default Playwright Chromium; rerunning with the existing system Chromium passed.
- `tests/relay-browser.cjs` is the executable network regression. `uno-transport/README.md` documents the reproducible build.

The affected users' exact network/browser configurations and branded Microsoft Edge were not available. This verifies the hostname compatibility fix, not every possible external relay outage or network restriction. No security service, DNS rule or CORS policy was disabled.

## TierMaker

The deployed read Worker is already version `5952abf6-947f-4e37-a8f9-1652057fe269` (confirmed with Wrangler). It includes the first-party template referrer fix. This change brings that previously uncommitted fix and its tests/documentation into the repository, rather than redeploying an unchanged working Worker.

All seven supplied URLs were freshly read through the real production Worker. Every manifest, all **78 images**, and all six published covers returned successfully (POSITION supplies no importable cover). Chromium also decoded and embedded the real images, saved seven independent albums, and reopened the complete library after reload with no page errors or cover warnings. Candidate static files were mirrored at the production origin for that library-level check; Worker CORS and upstream reads were real.

| Template slug | Images |
| --- | ---: |
| choose-your-weapon-tier-list-16864667 | 18 |
| nothing-but-thieves--moral-panic-17761722 | 11 |
| sevish-rhythm-and-xen-18347937 | 13 |
| victory-tier-list-16864667 | 11 |
| position-19290294 | 8 |
| red-sails-16783767 | 12 |
| persona-non-grata---superbird-in-sterillo-18347937 | 5 |

`tests/tiermaker-batch-live.cjs` **passed against the actual production site without static mirroring**: the real multiline import dialog imported all seven URLs, embedded all 78 images and six published covers, then preserved all seven albums after reload. It optionally supports `MIRROR_URL` for candidate static assets. One initial harness assertion raced the asynchronous library refresh after the import button re-enabled; it now waits for the dialog to close. This was a test synchronization correction, not a product change. The next run completed all imports but exposed an incorrect test assumption that POSITION publishes a cover; its manifest has no cover field, so the test now requires only the six covers actually supplied.
