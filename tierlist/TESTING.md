# Tier List verification

## Local-only release

This release removes hosted-image controls, remote-image rendering, upload clients and the upload Worker. The TierMaker Worker remains read-only. Image originals retain their source resolution, with no new lossy compression. Independent compressed previews are used for ranking and preview-first lobby readiness.

### Automated model and policy checks

The final scoped indexed tree, exported without unrelated working-tree edits, passed **156 JavaScript tests and 8 Python helper tests**. `git diff --cached --check` also passed. The scoped runtime/test snapshot was `c91e638fdc283a2855acb9e2623297d91acffe7a`. Subsequent release-note updates do not change the verified code.

`tests/tierlist-assets.test.mjs` checks embedded-only validation, original dimensions, lossless portable/asset round trips, preview documents without original bytes, bounded multi-chunk transfer, atomic installation, bad metadata/order/checksums, interruption/cache reuse, independent message budgets, unchanged original JPEG bytes, EXIF rotation with later XMP metadata and original preservation for higher-bit-depth/colour-profiled PNGs.

The synthetic PNG/JPEG fixtures and mocked decoder in these unit tests are structural tests, not pixel-quality evidence. Real browser tests below provide the separate decoded-pixel proof. Existing board, sorting, ratings, group-image, activity, invite and TierMaker parser/policy suites remain in the regression set. Parser fixtures include templates over 1,000 entries, modern asset paths, saved-list order and variations. This does not claim a live 1,000-image import bypasses provider rate limits.

### Real browsers and iroh

Accepted working-tree runs:

- **Chromium and Firefox progressive images:** an actual 4,000×2,000 PNG is imported through the UI. Decoded RGBA SHA-256 remains identical, dimensions are retained and the stored original is no larger than the input. A separate direct lossless WebP Worker encode proves the actual vendored encoder works, rather than merely exercising its PNG fallback. A transparent PNG also retains its original bytes exactly.
- **Original JPEG orientation:** actual Chromium/Firefox decoding of an EXIF-6 JPEG gives the expected 250×400 visual dimensions and blue corner, while retaining its original JPEG bytes.
- **Preview-first readiness:** a real iroh host deliberately holds the first original chunk. The guest becomes Ready, ranks an image and synchronizes that board to the host while still using a small preview. Full-quality export and source-copy controls remain disabled until originals finish.
- **Automatic viewer upgrade:** releasing the original upgrades the already-open image to 4,000 pixels without reopening it. Width remains 410 pixels and its centre remains fixed. The rounded 205×102 preview changes the displayed height from 204 to 205 pixels when corrected to the original 2:1 aspect ratio. The assertion allows this measured one-pixel rounding correction, not a zoom reset.
- **Modest enlargement:** both themes at 1920, 1024, 390 and 320 pixels remain at most half the viewport height and twice the source's natural size on initial fit. Wheel, cursor anchoring, pan, actual touch pinch, keyboard and dismissal regressions passed.
- **Legacy compatibility in both browsers:** supported old embedded saves open, remote-only records remain stored, remote portable files are rejected and no hosted-image request occurs.
- **Editor and files:** local creation, independent imports, file/code round trips, reload, source ordering, tier editing, conservation, keyboard, native/touch insertion, long names and maximum board sizes passed.
- **Covers in both browsers:** file/existing-image/default controls, persistence, portable copies, actual lobby transfer and completed-source copies passed. Unavailable/foreign TierMaker cover fixtures do not fetch foreign metadata or lose valid images.
- **Actual TierMaker batches:** live sources import independently as embedded originals, with source order and covers, canonical deduplication, preflight rejection and cancellation retaining completed saves. Network assertions observed no hosting writes.
- **Multiplayer tools:** chosen colours, second-resolution activity, both rating methods, ties, named downloads, immutable source attribution, library/local editing during a live lobby, cancelled creation and complete branded light/dark group PNGs from host and guest passed.
- **Capacity:** 16 actual iroh peers, simultaneous independent boards, complete Everyone views, offline states, resume, removal and closure passed. The capacity run observed 34 real relay sockets across its connection/reconnection scenarios.
- **App lifecycle:** interrupted installation keeps the old usable shell. Waiting updates require explicit activation. Native saves, theme, daily data and unrelated caches survive. Stalled navigation falls back within its bound, unknown routes stay isolated and offline Tier List editing/persistence passed.

The final scoped candidate repeated progressive images and compatibility in both browsers, then the complete installation/update/offline suite. All passed, including an actual lossless WASM encode while offline. Pending-original progress, disabled controls, completed zoom, covers and legacy warnings were visually inspected at native size and in both-theme desktop/tablet/mobile matrices. New production acceptance is performed after Pages publication, not inferred from these local runs.

## Production evidence

The half-height viewer change was separately published in `4860c70`. Pages build `41191833426` succeeded. Actual published Chromium/Firefox tests passed in both themes and all four viewport widths. Contact sheets and native mobile captures were visually inspected.

The production TierMaker service is `https://puzzle-tierlist-tiermaker.my-account-306.workers.dev`, restricted to `https://puzzle.seall.dev`, fixed first-party destinations and GET/OPTIONS. It has no upload or storage API. Version `448d9694-394e-4c4a-b4dc-84831232b44f` deploys the tested 25 MiB read limit, with all seven Worker policy/parser tests passing before deployment. The exact Choose Your Weapon source supplies 18 images. Sample source PNGs are actually 300×300, not higher-resolution images that the app can reconstruct. The alternate raw `/media/template_images/` paths did not supply usable images through the read service. Imports preserve the actual provided resolution instead of inventing detail.

The former Catbox upload Worker was successfully deleted. No Imgur or R2 service was enabled. Historical upload/proxy tests are not evidence for this local-only release and their obsolete source/tests have been removed.

## Reproduction commands

```sh
node --test tests/*.test.mjs
python3 tests/tiermaker-server.test.py
export PLAYWRIGHT_MODULE=/path/to/playwright
export CHROMIUM_PATH=/path/to/chromium
node tests/tierlist-browser.cjs
node tests/tierlist-sort-zoom.cjs
node tests/tierlist-states.cjs
node tests/tierlist-cover.cjs
BROWSER=firefox node tests/tierlist-cover.cjs
node tests/tiermaker-batch.cjs
node tests/tierlist-progressive.cjs
BROWSER=firefox node tests/tierlist-progressive.cjs
node tests/tierlist-compat.cjs
node tests/tierlist-tools.cjs
node tests/tierlist-lobby-v2.cjs
node tests/app-update-browser.cjs
```

`BASE_URL` selects another preview or production origin where supported. Screenshot directories are configurable with `SCREENSHOT_DIR`. Use Playwright's installed Firefox executable, not a hard-coded mismatched build.

## Limits and remaining boundaries

- 25 MiB per image, 8,192 pixels per edge, 24 million decoded pixels and 128 MiB expanded tierlist JSON. Excessive originals are rejected, never silently resized. Covers stay at most 256 pixels/64 KiB. Animation is flattened.
- A lobby's encoded preview document is bounded to 8 MiB. Original requests are sequential with 24,000-character chunks, bounded decompression, metadata/SHA-256/decode checks and atomic installation. A stalled original request times out separately from board readiness. The lossless optimizer also has a deadline and lossless fallback.
- Export/copy gates wait for validated originals. Group images can use previews and retain their own 24-million-pixel/30,000-edge/4x-downscale output bounds.
- The host must stay online for missing originals. A transfer failure preserves usable previews and ranking. Rejoining retries, and automatic in-tab reconnects can reuse verified originals. Host reload still ends the lobby.
- Unsupported remote-only saves remain stored and are not fetched or silently replaced with low-resolution previews. Existing reduced-quality local images cannot regain lost detail without re-importing a better source.
- TierMaker availability, rate limits and HTML/API changes are external constraints. The read Worker uses approximate 600/minute per-IP/location protection, a 45-second deadline, 2 MiB page/API limits and a 25 MiB image limit. CORS is not authentication, but this restricted service cannot upload arbitrary content.
- Physical Android/iOS devices, Safari, all NAT combinations and long OS suspension are not certified. Synthetic mouse/mobile viewport tests do not substitute for those devices.
