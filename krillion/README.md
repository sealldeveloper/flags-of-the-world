# Krillion public daily archive

A standalone player for public daily dives preserved from [Krillion](https://krillion.io/). The first capture is 2026-11-02, dive #110: seven prompts and 122,994 canonical answers with their published tiers, scores and optional quips.

## Daily preservation

`.github/workflows/archive-krillion.yml` runs at 04:15, 05:15, 09:15 and 17:15 UTC. The first two times cover midnight New York in either DST offset. Later runs retry transient failures and capture public corrections. GitHub schedules can be delayed and are not a guarantee of uninterrupted capture.

The workflow uses only these anonymous public endpoints:

- `https://krillion.io/api/today`
- `https://krillion.io/api/reveal?date=YYYY-MM-DD`, for the date returned by `today`

It does not enumerate historical/paid archives, query accounts, submit guesses, record scores or use cookies, API keys or payment tokens. A missing or incomplete answer sheet fails the job instead of committing a non-playable archive.

Each date has a small `puzzles/YYYY/MM/YYYY-MM-DD.json` record. Full public answer sheets are stored in immutable, SHA-256-addressed `puzzles/banks/*.json.gz` files. Repeated answer banks deduplicate across dates. The first day's 7.3 MB answer sheet occupies about 845 KB compressed. New source corrections retain prior banks and Git history records previous date revisions. No existing dates are removed.

The job commits only `krillion/puzzles/`, rebases before pushing, and explicitly requests a legacy GitHub Pages build. This is necessary because a push made with `GITHUB_TOKEN` does not automatically trigger a Pages build. No new repository secrets are needed. Permissions are limited to repository contents and Pages writes.

```sh
node --test tests/krillion.test.mjs
node krillion/archive.mjs
```

`--fixture-dir DIR` reads `today.json` and `reveal.json` from an explicit local fixture/capture directory for reproducible maintenance tests. It is not used by scheduled production captures.

## Playback

The browser reads only this repository's files. A worker decompresses and verifies both compressed and expanded SHA-256 hashes, builds the answer indices, scores guesses, and searches answer sheets. Large pools are not rendered into the DOM wholesale. Answer-sheet lists show 100 rows at a time.

The player preserves seven rounds, three-second previews, 25-second answer windows, retrying rejected answers, original tier scores, a 700-point maximum and ten metres per point. Drafts, pauses, results and settings are browser-local and separated by date. Archive replay is permitted. Reloads restore valid progress. Opening menus pauses the local timer.

Service-worker shell v19 includes the player, font, sprites and ocean artwork. Successfully validated answer banks are saved in the existing puzzle-data cache. After a dive's answer sheets have loaded and the app shell is installed, playback can continue offline. Browser storage can be unavailable, evicted or cleared. GitHub remains the durable archive, not browser storage.

### Matching boundary

The public reveal response contains canonical accepted answers and their scores, not the private server's complete alias/correction implementation. Offline matching supports case, Unicode compatibility normalization and whitespace normalization. It deliberately does not invent fuzzy matches or claim that every typo/alias accepted by the live server is reproduced. The private correction control is visibly unavailable. Live player popularity, percentiles, accounts, purchases and multiplayer are not fabricated. Links for those services open the original site.

## Visual preservation and attribution

The daily-game presentation follows Krillion's ocean layout, VT323 font, pixel controls, score/depth HUD, prompt cards, answer dock, tiers, result sheet and wardrobe presentation. The player is independently implemented. The original ocean renderer is not vendored: its environmental canvas-layer poses are preserved as lossless WebP scenes at 1920×1080, 1024×768, 390×844 and 320×740. DOM question and outcome UI are not baked into the scenes. This preserves the original artwork while allowing future prompts and answers to render independently. It is not a byte-identical copy of the original animated application.

`assets/sources.json` records original asset URLs and hashes. `assets/scene-sources.json` records canvas layer, viewport, phase and local hash for each reference-rendered scene. Reference captures use isolated browser contexts and the anonymous public answer-sheet fixture. They do not send source-game submissions. Original game/artwork credit remains with Krillion. VT323 is distributed under the included `assets/VT323-OFL.txt`. No original analytics, advertising scripts, account code or payment code are included.

## Browser verification

```sh
# Run in another terminal
python3 tierlist/server.py --port 18774

export PLAYWRIGHT_MODULE=/path/to/playwright
export CHROMIUM_PATH=/path/to/chromium
node tests/krillion-browser.cjs
BROWSER=firefox node tests/krillion-browser.cjs
node tests/krillion-errors.cjs
SERVICE_WORKERS=allow node tests/krillion-browser.cjs
```

`BASE_URL` selects a preview or production origin. `SCREENSHOT_DIR` selects the visual evidence directory. Browser tests use the actual archived answer banks and verify local scoring, retries, paused menus, all rounds, answer search, persistence, responsive dialogs and original-style views. The service-worker variant checks actual offline playback. Physical mobile devices and unpublished private-server matching behavior are outside the verification scope.
