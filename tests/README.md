# Puzzle browser regression

Serve the repository with a static web server, install Playwright outside the site output (or supply `PLAYWRIGHT_MODULE`), and run:

```sh
python3 -m http.server 18763 --bind 127.0.0.1
# In a second terminal:
node tests/puzzle-browser.cjs
```

Optional environment variables:

- `BASE_URL` (default `http://127.0.0.1:18763`)
- `PLAYWRIGHT_MODULE` (absolute path to an existing Playwright install)
- `CHROMIUM_PATH` (custom browser executable)
- `SCREENSHOT_DIR` (default `/tmp/puzzle-visual`)

Uses committed archive puzzles, a fresh browser profile, and a stub for the remote crossword list. No production progress is changed. Covers single-step Enter/Tab navigation (including locked clues, reverse navigation, and input bubbling), typing/deletion, native button activation, inline mobile clue navigation, phone and wide touch-tablet input, Connections standard/easy persistence, more than four mistakes, loss, completion, sharing labels, reset, and horizontal overflow. Captures all three crossword sources and Connections in light/dark at 1920, 1024, 390, and 320 pixels, plus crossword tools, scrolled clues, modal, loading, and error states. Review screenshots visually after CSS changes.

Connections easy and standard use separate per-date saves. The original standard storage keys remain unchanged. The selected difficulty is remembered across puzzle changes/reloads; easy results are labelled as such.

## Focused suites

These scripts default to port **18764**; set `BASE_URL` to your actual server URL. They use the same Playwright/Chromium environment variables above.

- `node tests/connections-browser.cjs`: exact guess history/counts, non-spoiling hints, standard-loss decision, continuation/overwrite confirmation, ordered share text, clipboard fallback, legacy saves and interrupted-animation persistence. Screenshots: `/tmp/connections-features`.
- `node tests/crossword-native-input.cjs`: all three crossword sources with touch enabled; native textbox focus, browser text insertion, capital letters, keydown and keydown-less deletion, composition-event orders, inline navigation, modal guards, and 1024/390/320/short-viewport captures. Set `FIREFOX_PATH` to also run Firefox. Screenshots: `/tmp/crossword-native`. Headless touch emulation does **not** certify a physical iOS/Android keyboard or its viewport behaviour.
- `node tests/themes-browser.cjs`: every published local game/launcher and Jeopardy audience display; OS light/dark changes, remembered manual choices, return to System, cross-tab propagation, System defaults despite old theme settings, denied theme storage, responsive screenshots and representative interactive states. Screenshots: `/tmp/published-themes`. External country-flag images use a deterministic SVG fixture, and unrelated remote services/fonts are blocked; this is not a CDN, remote Scattergories or buzzer integration test.

All use disposable browser profiles and local archives, not production progress. None include unpublished games. Review the generated screenshots; passing geometry assertions alone is not visual confirmation.

## Installable app and daily library

- `TZ=Australia/Sydney node --test tests/daily.test.mjs` (also run with `TZ=America/Los_Angeles`): local-calendar boundaries, every archived daily payload, exact-date validation, old/new progress, Connections continuation/reveal outcomes, download fallback, cancellation, quota failures, overlay retries, and cache-update isolation.
- `node tests/app-browser.cjs`: same browser environment and port **18764** as above. Uses a temporary **persistent Chromium profile**, real service workers and Cache Storage, and Chromium installability diagnostics. Checks unplayed downloads, native crossword saves, Connections standard→easy outcomes, old saves, cross-tab changes, history filters, offline navigation and a cold browser restart, blocked storage, install help, responsive light/dark layouts, focus and hover. Screenshots default to `/tmp/puzzle-app`. The profile is removed after the test; existing user profiles are not used.

- `node tests/app-update-browser.cjs`: starts its own loopback server with in-memory deployment versions. Verifies an interrupted install, a waiting update that needs an explicit click, survival of puzzle data/native saves/theme choices/unrelated caches, stalled-network fallback and unknown-route isolation. It never rewrites site files; screenshots default to `/tmp/puzzle-app-updates`.

The browser test does not click a real operating-system install sheet or certify physical iOS/Android installation. Party-game external artwork/media and remote buzzers are not offline guarantees. See `../assets/APP.md` for cache boundaries and update behaviour.
