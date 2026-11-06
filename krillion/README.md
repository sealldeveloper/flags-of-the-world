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

Service-worker shell v21 includes the player, font, sprites and ocean artwork. Successfully validated answer banks are saved in the existing puzzle-data cache. After a dive's answer sheets have loaded and the app shell is installed, playback can continue offline. Browser storage can be unavailable, evicted or cleared. GitHub remains the durable archive, not browser storage.

### Matching boundary

The public reveal response contains canonical accepted answers and their scores, not the private server's complete alias/correction implementation. Existing exact matches keep their original case/Unicode-compatibility/whitespace handling. Local autocorrect additionally considers accent, punctuation, article, spacing and English plural variants. Unicode letters are retained, including non-Latin names. A bounded adjacent-transposition/edit-distance matcher permits one edit for names of 5–8 characters and at most two when both spellings have at least nine characters. Equal-distance or normalized collisions are declined.

Every non-exact match is a suggestion, not an accepted answer. Confirm it with a second Enter or the Use answer button before the 25-second timer expires. Editing the guess cancels the suggestion. Pending suggestions survive reloads and are checked again against the archived bank. An unconfirmed suggestion earns no points on timeout. The settings switch can disable local autocorrect and return to strict matching.

The matcher is independently implemented and runs in the existing answer worker, including offline. It uses only our archived canonical answers, not Krillion Free's code, private dictionary, server or score assignments. Confirmation awards the matched archived answer's unchanged official tier and score. No semantic aliases, new valid answers or rarity values are invented. This approximates typo correction, not Krillion's complete private alias behavior. Live player popularity, percentiles, accounts, purchases and multiplayer are not fabricated. Links for those services open the original site.

## Visual preservation and attribution

The daily-game presentation follows Krillion's ocean layout, VT323 font, pixel controls, score/depth HUD, prompt cards, answer dock, tiers, result sheet and wardrobe presentation. The player and animation renderer are independently implemented, not a vendored copy of the original application.

Normal playback now uses a continuously scrolling 2D ocean rather than swapping still scenes. Unchanged original sky, upper-ocean, mid-ocean and trench artwork is combined with independently drawn waves, fish, marine snow, bubbles, depth rulers and tier effects. The camera descends over 2.4 seconds with cubic easing and damped follow-through. Accepted answers sink through tier markers for the observed original durations: 3.4 seconds for Plankton, 3 seconds for Too Clever and Schooler, 3.4 seconds for Rare, 4.3 seconds for Deep Cut, and 4.6 seconds for One in a Krillion. A miss takes 0.9 seconds. Card/dock entrances, landed banners, companion movement, score/depth counting and the return to the surface are animated separately.

`motion.mjs` is a presentation-only timeline. Results are saved immediately and retain their original points. Plunge effects run after the answer window has closed, never consume the next round's time, and do not alter the three-second preview or 25-second answer window. The next-round control unlocks on landing. Restored feedback does not replay the plunge. Menus pause the visual timeline, hidden pages stop the render loop, and reduced-motion/low-power settings finish active effects immediately with static rendering. Counter overlays are hidden from assistive technology, while the actual saved score remains accessible.

The original environmental canvas poses are still preserved as lossless WebP fallback scenes at 1920×1080, 1024×768, 390×844 and 320×740. DOM question/outcome UI is not baked into those scenes. The animated reconstruction follows the original motion style and observed timings, not every random particle, seasonal effect, sound or exact animation frame.

`assets/sources.json` records original asset URLs and hashes. `assets/ocean-sources.json` records unchanged source URLs and hashes for the four live ocean artwork layers. `assets/scene-sources.json` records canvas layer, viewport, phase and local hash for each reference-rendered scene. Reference captures use isolated browser contexts and the anonymous public answer-sheet fixture. They do not send source-game submissions. Original game/artwork credit remains with Krillion. VT323 is distributed under the included `assets/VT323-OFL.txt`. No original analytics, advertising scripts, account code or payment code are included.

## Browser verification

```sh
# Run in another terminal
python3 tierlist/server.py --port 18774

export PLAYWRIGHT_MODULE=/path/to/playwright
export CHROMIUM_PATH=/path/to/chromium
node tests/krillion-browser.cjs
BROWSER=firefox node tests/krillion-browser.cjs
node tests/krillion-errors.cjs
node tests/krillion-corrections.cjs
node tests/krillion-motion.cjs
BROWSER=firefox node tests/krillion-motion.cjs
SERVICE_WORKERS=allow node tests/krillion-browser.cjs
```

`BASE_URL` selects a preview or production origin. `SCREENSHOT_DIR` selects the visual evidence directory. Browser tests use the actual archived answer banks and verify local scoring, retries, paused menus, all rounds, answer search, persistence, responsive dialogs and original-style views. The service-worker variant checks actual offline playback. Motion tests additionally use actual archived answers for available tiers and a separately labelled synthetic Too Clever fixture when that tier is absent from the public reveal. They cover tier-duration effects, continuous depth/camera changes, pause/visibility behavior, live preference changes, and reduced-motion/low-power operation. Physical mobile devices, long OS suspension and unpublished private-server matching behavior are outside the verification scope.
