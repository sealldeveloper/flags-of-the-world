# Verification

2026-10-31 UTC, local preview at `http://127.0.0.1:18764/tierlist/`.

## Results

- `node --test tests/*.test.mjs`: **172 passed, 0 failed**. Existing puzzle/UNO regressions plus Worker origin/field/size restrictions, readable bounded JSON errors, portable data, sorting, v4 invitations, selected colours, attribution, filename sanitization/datetimes, both aggregate scoring methods, tie handling, readiness/authorship, history bounds and complete group-image layout. Export palettes are checked against `assets/theme.css`.
- `python3 tests/tiermaker-server.test.py`: **8 passed**. Cover metadata/hero paths, restricted URLs/redirects, traversal, source metadata/ordering, modern media asset paths, mismatched roots, templates over 1,000 images, saved-list extraction and variations.
- `tests/tierlist-sort-zoom.cjs`: **passed**. Actual native and CDP touch sorting, insertion previews, cancellation, persistence, a toolbar-free overlay, continuous non-preset wheel zoom, cursor anchoring, panning, actual touch pinch, keyboard controls, image-click retention and outside-click/Escape dismissal.
- `tests/tierlist-states.cjs`: **passed**. Hover/focus/selection, inline tier controls, disabled boundaries, deletion, keyboard/touch ranking, dense mobile content, Help, invalid imports, independent duplicate imports and byte-budget rejection.
- `tests/tierlist-browser.cjs`: **passed**. Compression, ordering, saved rankings, named/datetime `.tierlist` download, text/file round-trips, real three-player iroh play, multi-chunk assets, independent tiers, late join, resume, the named copy dialog and closure.
- `tests/tiermaker-browser.cjs`: **passed**. Live legacy/category imports plus the exact Choose Your Weapon template with all 18 compressed images, portable exports, persistence and foreign-URL rejection.
- `tests/tiermaker-batch.cjs`: **passed**. Two real public templates imported together, canonical duplicate suppression, invalid-batch preflight with no fetch, independent saved records, cancellation after a completed fixture import and retry of only the remaining URL. The follow-up also imports two fixture templates together with Catbox selected, verifies original upload bytes, deduplicates a third equivalent URL, saves two independent hosted tierlists and makes zero remote image downloads.
- `tests/app-update-browser.cjs`: **passed**. Interrupted installs, explicit updates, save/theme/cache retention, stalled-network fallback, unknown-route isolation and offline Tier List creation/editing/persistence.
- `tests/tierlist-lobby-v2.cjs`: **passed** with **16 simultaneous real players and 23 public relay sockets** across the complete run. Includes complete light/dark PNG exports at full capacity.
- `tests/tierlist-tools.cjs`: **passed**, using **4 real relay sockets**. The focused suite covers chosen colours, seconds, both summary methods, in-button clipboard feedback, source-only copying, live-library navigation, creating cancellation, named files, host/guest PNG generation and cleanup. The latest follow-up explicitly verifies Disband lobby for the host, including library browsing, and Leave lobby for guests, including after host closure.
- `tests/tierlist-remote.cjs`: **passed** with real iroh peers and a deterministic Catbox relay fixture. Decline/remember/resume, embedded previews without remote downloads, malicious host URLs/thumbnails, redirects, 4000-pixel originals, blob-backed rendering, group PNGs, code-import cancellation, original-byte file/TierMaker uploads, malicious relay responses, cancellation, rate limiting and Local fallback were exercised. No live provider writes occur in this suite. The earlier Imgur acceptance remains historical evidence, not the current upload UI.
- `tests/tierlist-cover.cjs`: **passed in Chromium and matching Playwright Firefox**. File/existing-image covers, reset/default, reload, independent portable copies, actual lobby transfer/copy, imported TierMaker hero covers, missing/foreign covers, stopped batches and hash-based resume after reload. Maximum-length labels and wrapping error states were captured and visually inspected in light/dark desktop, tablet and mobile views.
- Separate unreadable-network and delayed-initialization checks: **passed in Chromium and Firefox**. An unreadable upload response makes one attempt, adds no images, restores retryable controls and displays a useful error. A player name entered before module initialization is retained.
- JavaScript syntax, Python compilation and `git diff --check`: **passed**.

## Multiplayer and navigation

Every peer in the full-capacity suite must display exactly 16 Everyone cards, 80 tier rows and 128 images for its four-tier/eight-image fixture. Unranked remains present for each player. All 16 seats concurrently place items and independently rename/recolour tiers. Board contents converge byte-for-byte with their owners, and exact DOM counts are rechecked after updates.

Other covered states include loading/checking/ready/offline, individually requested late-join snapshots, a rejected 17th join, offline capacity reservation, reload/resume, removing active/offline seats, rejecting a restored revoked resume capability, replacement joins and host closure. Application tests use real public relays, not a simulated game transport.

The focused navigation checks keep host and guests connected while the host browses the library and edits a separate local tierlist. Peer updates must not replace typed local text or change the route. Return to lobby restores the live board. Host closure must not throw a browsing guest out of their local editor. Only Disband lobby for the host or Leave lobby for a guest leaves or disbands the room.

Copy tierlist is explicitly checked against the immutable starting board, not a participant’s current board. The named result includes the host’s attribution and preserves it in portable exports. Per-player copy buttons are absent. The Creating lobby dialog is exercised while transport creation is deliberately paused, then cancelled. The real late-created transport must close rather than becoming an orphan.

## Ratings and image exports

Unit fixtures cover shared and opposing preferences, different category counts, one-tier boards, sparse votes, unranked abstentions, loading exclusion and completed offline participants. The ordered version preserves category dominance while factoring in left-to-right position. Ties remain explicit and additional tied items are expandable.

Both PNG themes are generated from one frozen snapshot. Actual exports were downloaded for three-player and 16-player lobbies. Host and guest outputs were byte-identical per theme, including across the final repeated acceptance runs. The full-capacity images are **2696×4150 pixels**, with all names, categories, current placements, Unranked, both sets of highest/lowest results, the coloured icon and `Tier List on puzzle.seall.dev` footer. Native-size top/bottom crops and full three-player images were visually inspected in both themes. No rows, items or labels were omitted to make the image fit.

The focused browser suite checks that host and guest can both generate the images, both themes already exist before selection, switching does not regenerate them, expected player/category text was drawn, theme background pixels match the app, downloads are valid PNGs and object URLs are revoked after closing. Layout tests check all board rectangles for overlap and reject unreadably large output rather than silently dropping content. Output is bounded to 24 million pixels and 30,000 pixels per edge.

## Visual matrix and boundaries

Chromium on Linux, light/dark themes, at 1920×1080, 1024×768, 390×844 and 320×740. Grid/List image ordering also uses a taller native-drag viewport so both source and target are visible. Representative screenshots were opened with the image viewer, with contact sheets used to scan the larger matrices and native-size crops used where text was small.

Fixtures include 120-character tierlist/copy names, 40-character player/author names, 100-character category names, 160-character image labels, deliberate line breaks, unbroken text, black/white category colours and dense 16-seat rosters. URL inputs have a 2,048-character per-URL budget and 32,768-character batch budget. The invite field is checked at 5,000 characters. Portable-code/decompression limits are separately unit-tested.

Changed states include colour selection, prominent creating progress, creating cancellation, library return banners, grouped controls, green copy success/hover, clipboard failure, empty/live/tied summaries, attribution, named-copy errors, named downloads, batch validation/progress, PNG theme selection/scrolling and the plain image overlay. Header text is checked not to wrap. Document-level horizontal overflow is checked throughout.

Fixes found through these runs include duplicate comparison cards during keyed updates, textareas that needed refitting after viewport changes, autosave feedback moving the Return button during a click, stale library contents appearing before refresh and an oversized export heading hiding controls on narrow screens. Corrected input and modal states were recaptured after the relevant fixes.

## Cover and relay-recovery follow-up

Cover data is optional, embedded PNG/WebP, limited to 256 pixels per edge and 64 KiB of encoded data. New model tests verify portable-copy preservation, unchanged rankings, old-file compatibility and rejection of remote/SVG/oversized covers. Python tests cover modern TierMaker hero metadata and foreign/malformed metadata refusal. The first unit attempt hit the previously observed unrelated UNO floating-point assertion at `3000.0000000000005` versus `3000`. A rerun passed without changing UNO code.

A live headless-Firefox Local import of `https://tiermaker.com/create/love-heart-cheat-code-tier-list-16864667` imported all **11 images and its actual cover**, with no warnings. The copied cover is **205×205**, 13,007 encoded characters, and was visually inspected. It is the template's social/hero artwork, not a fallback to its first ranked image.

The original Catbox failure was freshly reproduced in Firefox against that same URL. The relay returned **HTTP 429 without Access-Control-Allow-Origin**, which Firefox exposed as `NetworkError when attempting to fetch resource`. This was an external relay refusal, not a failure to extract the template. `cors.tools` was separately refused by Catbox with HTTP 412 / Invalid uploader. `api.cors.lol` returned another CORS-hidden HTTP 429. Neither alternate is integrated, and there is no silent transport failover or account/key workaround. A final live retest of the exact template still received the relay's CORS-hidden 429. It now reported relay unavailability/rate limiting and 0 of 11 confirmed images instead of the raw Firefox error. The live hosted import remains externally blocked. This must not be presented as a successfully completed live Catbox import.

The current upload path paces requests, records confirmed public links by source-content hash for 24 hours, pauses remaining templates on a relay failure and explains how to retry or choose Local storage. An unreadable response can still leave an unknown anonymous upload. Recovery tests cover content reuse, clearing the cache, persisted-host validation, source ordering, original-byte preservation and retrying after a partial failure without reuploading confirmed originals. These changes improve failure handling, not the public relay's availability.

## Cloudflare upload Worker preparation

The dedicated `tierlist/upload-worker/` config accepts uploads only from `https://puzzle.seall.dev`. Localhost, `127.0.0.1`, missing/null origins and lookalikes are deliberately refused. Ten Node policy tests passed, covering CORS/preflights, fixed path/destination, method/query/field restrictions, credential/filename stripping, exact image bytes, body/header/dimension limits, rate-limit fail-closed behavior, redirects and bounded validated upstream replies. Worker-handled production-origin failures retain readable CORS headers.

`wrangler deploy --config tierlist/upload-worker/wrangler.toml --dry-run` passed with the production-only origin and 120-per-60-second rate-limit binding. This is a local bundle/configuration check, not a live Cloudflare or Catbox acceptance test. Actual deployment is blocked by the existing Wrangler OAuth grant expiring with `invalid_grant`. No unverified Worker URL has been substituted into the client. The client still uses the older public relay until deployment and a live upload are verified. Client error handling now recognizes bounded, known Worker JSON errors without trusting arbitrary proxy error text.

The existing crossword Worker and all account/DNS/billing settings are unchanged. This Worker does not provide TierMaker's separate read helper. The static site alone cannot enable production TierMaker URL imports.

## Lobby-label and batch-import follow-up

The host exit control now reads Disband lobby, while guest controls remain Leave lobby. The focused three-player suite passed with four real relay sockets, including actual disband/guest-leave actions and background library navigation. Host and guest actions were visually inspected in both themes at desktop, tablet, 390-pixel and 320-pixel widths.

The TierMaker input remains multiline and now explicitly says to paste one or more URLs, one per line, with a two-line placeholder and accessible help association. Both the existing live two-template Local import and the new two-template Catbox fixture batch passed. Catbox batch input was visually checked in both themes at 1920×1080, 1024×768, 390×844 and 320×740. The 154-test JavaScript suite and final syntax/whitespace checks also passed.

## Catbox follow-up

The Client ID fields and configurable Client ID meta tag are removed from both upload paths. Local remains the default. Selecting Catbox reveals the public-relay, anonymous-deletion and hosting-availability warnings. Legacy Imgur management appears only when this browser has existing receipts. Portable Imgur image links remain supported through the exact old allowlist.

`tests/tierlist-catbox.test.mjs` covers the exact Catbox allowlist, filename/path/host/port/query/fragment/whitespace attacks, original PNG bytes, bounded embedded previews, one fixed multipart relay destination with no account fields or original filename, rotated-JPEG normalization, bounded/invalid upload responses, cancellation without false deletion claims, old-consent migration, direct original downloads, cached metadata mismatch and ordered TierMaker imports. Existing remote-security and legacy Imgur unit tests also remain passing. A separate real-browser preparation test used a 400×250 JPEG with EXIF orientation 6. The result was a correctly rotated 250×400 PNG, verified by decoded dimensions and a known blue corner pixel.

The current real-browser suite uses a Catbox-hosted 4000×2000 fixture with embedded previews. Joining, ranking and group exports download zero remote images. Opening the overlay fetches the full original directly from Catbox and renders at its actual resolution. Declining permission causes zero remote requests and cannot persist the checkbox. Remembered permission survives reload/resume, but never bypasses URL, thumbnail or redirect checks. A foreign relay response is rejected without fetching its destination. Cancelling a held upload prevents the second file, adds nothing locally and explicitly warns that an already-sent anonymous upload cannot be deleted. A 429 response terminates cleanly, and switching back to Local still works.

The changed upload selectors, import dialog, warning, remembered checkbox, progress, disabled, invalid-response and cancellation states were captured at 1920×1080, 1024×768, 390×844 and 320×740 in both themes. Maximum-length tierlist names are included. Screenshots were visually inspected, with contact sheets and native-size mobile views. Geometry checks found no document-level horizontal overflow. The final follow-up passed again and produced 98 screenshots, including the bottoms of upload pages so narrow-screen progress/cancellation controls are covered below the fold. Those extra captures were visually inspected in contact sheets and native-size mobile views.

A separate live Chromium probe uploaded a generated 16×16 PNG anonymously through `cors.eu.org` to Catbox, read the returned URL, then fetched the image directly from Catbox. Both responses were HTTP 200 and the downloaded bytes matched the upload exactly. No account, key, extension or locally hosted upload endpoint was used. This proves observed compatibility for that probe, not long-term relay/provider availability, all file types/sizes, commercial-use approval or permanent retention. The live application check also successfully uploaded a generated 4000×2000 PNG through the actual file-input UI, displayed the consent dialog before any image download, rendered embedded previews without contacting Catbox, then downloaded the original directly for the viewer. The downloaded bytes matched the source exactly. Its private local receipt is `/tmp/tierlist-catbox-app-live-receipt.json`. Earlier live attempts were refused with HTTP 412. The exact cause was not established, and the same request later succeeded without a production-code fix. This is evidence of intermittent service behavior, not a resolved reliability bug. Uploads remain best-effort with no automatic retries. The app presents a finite error and Local fallback.

## Historical Imgur acceptance

`tests/tierlist-remote.test.mjs` adds 11 tests for exact HTTPS `i.imgur.com` URLs, hostile host/userinfo/port/path/query/fragment variants, bounded dimensions, foreign embedded-thumbnail rejection, public-only portable data, zero requests on decline, checkbox persistence only after approval, remembered-consent validation, redirect/type/byte/dimension failures before decoding, animation/JPEG header handling, hidden album requests and verified unlisted responses. Anonymous upload bytes are checked against the original PNG. Public album responses fail closed. Cancellation must preserve in-flight upload deletion keys before rollback. A concurrent TierMaker failure must wait for outstanding writes before cleanup and retain the original API error.

The browser suite uses a real iroh host and isolated guests. A guest that declines downloads makes zero Imgur requests, even after checking Don't ask me again. An accepted guest initially downloads only thumbnails, then obtains the actual 4000×2000 image when opening the overlay. Remembered approval survives reload/resume. Hostile lobby documents are injected into the real chunk transport, including a same-origin private target, a foreign thumbnail and an Imgur redirect to a private target. A previously remembered preference must never bypass validation. The forbidden target receives zero requests, and raw remote URLs never become native image sources.

A fixture Imgur API verifies `privacy=hidden`, absence of gallery publication, album/image `in_gallery=false`, public URL validation, original 4000×2000 PNG bytes for file and TierMaker uploads and private deletion keys kept only in the uploader's browser. The guest generates canvas exports from validated thumbnail blobs without tainting. Management deletes both images and albums, not only the album container. The final browser run also refused an API album whose privacy was public before any image POST, checked that failure progress terminates, and cancelled a deliberately held image upload. Its deletion key was captured and cleaned up with no images added or downloaded.

The warning, upload selector, TierMaker import selector and upload-management states are checked in both themes at desktop/tablet/mobile sizes. Long management titles and contained dialog scrolling are included. The remembered preference can be reset under Help. The shell includes the storage and image-policy modules for offline local authoring.

**Live Imgur upload/deletion was never certified.** Those historical tests used fixtures and unit mocks. New uploads now use Catbox instead and do not offer Client ID fields. Legacy management and portable-image compatibility remain. Provider retention, availability and terms are external constraints. See `README.md` for current Catbox privacy and cancellation limits.

## Artifacts

- `/tmp/tierlist-cover-accepted-chromium/`, `/tmp/tierlist-cover-release-firefox/` (successful cover/retry captures)
- `/tmp/tierlist-cover-accepted-chromium-review-*.jpg`, `/tmp/tierlist-cover-release-firefox-review-*.jpg` (visually inspected contact sheets)
- `/tmp/tierlist-cover-network-chromium/`, `/tmp/tierlist-cover-network-firefox/` and their `-review-1.jpg` sheets (visually inspected unreadable-network errors, both themes)
- `/tmp/tierlist-cover-local-accepted/`, `/tmp/tierlist-cover-sort-accepted/`, `/tmp/tierlist-cover-batch-accepted/`, `/tmp/tierlist-cover-remote-accepted/`, `/tmp/tierlist-cover-offline-accepted/`
- `/tmp/tierlist-cover-accepted-units.txt` (earlier 161-test acceptance)
- `/tmp/tierlist-worker-units.txt` (172-test follow-up, all passing)
- `/tmp/tierlist-staged-release-units.txt` (172 tests passing from the scoped publishing tree, excluding unrelated local edits, plus 8 Python helper tests)
- `/tmp/tierlist-loveheart-copied-cover.png` (visually inspected live imported cover)
- `/tmp/tierlist-loveheart-local-cover-result.json` (public-source Local import evidence)
- `/tmp/tierlist-disband-accepted/` (host/guest label, real-lobby tools and visual acceptance)
- `/tmp/tierlist-multi-import-accepted/` (live Local and fixture Catbox batch imports)
- `/tmp/tierlist-label-batch-review-*.jpg` (visually inspected follow-up contact sheets)
- `/tmp/tierlist-catbox-accepted/` (first Catbox real-lobby, relay-fixture and visual acceptance)
- `/tmp/tierlist-catbox-final/` (final acceptance and full scroll-surface captures)
- `/tmp/tierlist-catbox-review-*.jpg` (visually inspected contact sheets)
- `/tmp/tierlist-catbox-local/`, `/tmp/tierlist-catbox-sort/`, `/tmp/tierlist-catbox-batch/`, `/tmp/tierlist-catbox-offline/` (follow-up regressions)
- `/tmp/tierlist-catbox-final-units.txt`
- `/tmp/tierlist-imgur-final/` (final remote security, cancellation, failure-recovery and visual suite)
- `/tmp/tierlist-imgur-accepted/` (remote security/visual suite)
- `/tmp/tierlist-imgur-second/` (completed real-lobby/fixture API run)
- `/tmp/tierlist-imgur-local/`
- `/tmp/tierlist-imgur-sort/`
- `/tmp/tierlist-imgur-batch/`
- `/tmp/tierlist-imgur-offline/`
- `/tmp/tierlist-imgur-tools/`
- `/tmp/tierlist-imgur-states/`
- `/tmp/tierlist-imgur-large/`
- `/tmp/tierlist-v4-tools-final/`
- `/tmp/tierlist-release-v4-large/` (16 players and full PNG exports)
- `/tmp/tierlist-v4-review/` (contact sheets and native-size PNG crops)
- `/tmp/tierlist-v4-overlay-final/`
- `/tmp/tierlist-v4-states-final/`
- `/tmp/tierlist-v4-import-final/`
- `/tmp/tierlist-v4-live-accepted/`
- `/tmp/tierlist-v4-batch-accepted/`
- `/tmp/tierlist-v4-offline-accepted/`

Earlier development failures are superseded by the successful acceptance runs. These are local development artifacts, not deployed assets.

## Limits

- Isolated contexts use Linux Chromium and Playwright Firefox. Firefox acceptance here is limited to the dedicated cover, upload-error and delayed-initialization follow-ups, not the entire regression matrix. Physical iOS/Android, Safari, cross-network NAT combinations, long background sessions and mobile OS suspension are not certified.
- Public relays and TierMaker remain external dependencies. The host must keep its tab open. Guest reload can resume a seat, but host reload ends the room.
- PNG output has explicit size/readability limits and is a locally rendered representation, not a pixel-for-pixel capture of browser chrome.
- Saved-list extraction/variations are fixture-tested, not certified for every public TierMaker URL format.
- GitHub Pages cannot run the optional import helper. Production imports need separately deployed same-origin endpoints and ingress rate limiting.
- Old thumbnail-only images cannot regain lost detail without re-uploading.
- Internal IndexedDB/API identifiers remain compatible while visible wording uses Tierlists.
- This static-editor release includes only Tier List code, its tests, the navigation card and shell-cache integration. Worker deployment and upload-target cutover remain blocked on Wrangler reauthorization and a successful live upload. Unrelated local edits and pre-existing untracked work are preserved. Remote daily-puzzle archives were fast-forwarded without changing any local feature diff.
