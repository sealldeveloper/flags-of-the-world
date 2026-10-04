# Installable games app and daily library

The site is one installable **PWA**, using the existing game pages within the same app scope rather than embedding or rewriting their game engines. The manifest is `/app.webmanifest`, the service worker is `/sw.js`, and every published game references the manifest. HTTPS is required outside localhost. Chromium can offer an install prompt; the home page also explains Safari's Add to Home Screen / Add to Dock flow. Browser support varies. Installing does not create an account or sync saves between browsers or devices.

## Daily games

Only **NYT Crossword**, **NYT Mini**, and **NYT Connections** appear in the daily checklist. The selected day has three cards, individual progress, and a finished count. The archive shows dated progress and download counts, with filters and bounded pages. Dates use the device's local calendar. Seattle's syndicated NYT reprints are a separate archive; Flags and Country TLDs are quizzes; Jeopardy, Scattergories and Deadlock Guess Who are party/social games.

Downloading is not playing: an unplayed downloaded puzzle remains **Not started**. Partial input is **In progress**. A correctly filled crossword or all four Connections groups is **Completed**. Reveals are disclosed, not presented as unaided solves. Connections' pending standard-loss choice remains unfinished; explicitly revealed answers are a finished attempt, labelled **Answers revealed**. Easy continuation links back to easy mode. Completion in either mode counts, while the actual standard/easy saves remain separate.

Existing save keys are unchanged: `nyt-xw-progress-DATE`, `nyt-mini-xw-progress-DATE`, and `nyt-connections-v1:DATE[:easy]`. Crossword saves gain a small `dailySummary`, computed using the game's actual answer checks, plus an update timestamp. Older crossword saves are checked against downloaded puzzle data; if that data cannot be obtained, the library says **Saved progress**, never guesses that a filled grid is correct. The library does not overwrite those saves. Reset, undo, imported progress and cross-tab updates are reflected through the existing save records.

## Offline data

`assets/daily.mjs` validates the requested date and puzzle shape before storing archive/API responses in **`puzzle-daily-data-v1`** Cache Storage. API results use the same canonical URL as archived JSON, so live puzzles also work later offline. Manifest lists are refreshed online and retained for offline use. Published same-origin crossword overlays are saved with their puzzle; a missing overlay prevents claiming the entire puzzle is downloaded.

The selected day's available puzzles are saved when the library is opened online. “Save this day offline” also keeps unplayed puzzles. Opening a daily game stores its puzzle. Historical dates are not downloaded wholesale; archive paging only needs puzzle data to verify old saved crossword progress. Nothing fetches new days while the app is closed. An unavailable day, failed request or storage quota failure never marks a game completed or falsely promises a downloaded copy.

The service worker precaches published game pages and local scripts/styles. External artwork (flags and Deadlock), remote buzzers, fonts and third-party media are not promised offline. The local Scattergories game works without the original external site. Seattle puzzles and local Jeopardy media are cached when requested. Unknown routes, third-party requests, non-GET/range requests and unpublished work are outside the fetch allowlists.

Storage can be cleared or evicted by the browser. The home page offers a **user-initiated** persistent-storage request and reports whether it was granted. It does not promise permanent retention. Cache failures do not erase native progress. There is no background mass download, account, new server, or remote progress upload.

## Updates

Bump `SHELL` in `sw.js` when publishing subsequent app-asset changes. Installation must cache the complete allowlisted shell before activation. A waiting update is activated only when the home-page **Update app** button is used or the old app closes naturally. Activation deletes only older `puzzle-app-shell-*` caches, never puzzle data, native progress, theme choices or unrelated caches. The service-worker registration uses `updateViaCache: 'none'`. Normal online visits use current pages/assets; the update button controls worker activation, not a frozen game-code version. Stalled shell requests fall back to downloaded copies after a five-second header timeout. If Cache Storage is blocked, network responses still work.

## Verification

- `node --test tests/daily.test.mjs` checks dates, progress semantics, migration interpretation, cache validation/fallback/failure and the precache allowlist. Run with different `TZ` values for date boundaries.
- `node tests/app-browser.cjs` exercises real service-worker installation, normal-profile Chromium installability diagnostics, offline reload/navigation and browser restart, actual saves, legacy progress, cross-tab updates, responsive themes and storage failures in disposable profiles.
- `node tests/app-update-browser.cjs` uses an isolated loopback server and in-memory worker versions to test interrupted installs, explicit waiting-update activation, cache/save preservation, stalled requests and unknown-route isolation. See `../tests/README.md` for browser setup.
- Headless checks do not certify the physical iOS/Android install UI, home-screen launch, or OS-level storage retention.
