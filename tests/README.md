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
- `node tests/crossword-focus-browser.cjs`: defaults to port **18775**; all three playable sources at 1920/1024/390 in light/dark. Covers native Tab/Shift+Tab board entry, single-clue navigation, cell-focused rings, click/typing/deletion/arrows, button rings/native activation, date/dropdown puzzle switches, and touch-native-input focus. Bounded screenshots and focus rectangles: `/tmp/crossword-focus/after`. No keyboard handlers or tab stops are changed.
- `node tests/crossword-native-input.cjs`: all three crossword sources with touch enabled; native textbox focus, browser text insertion, capital letters, keydown and keydown-less deletion, composition-event orders, inline navigation, modal guards, and 1024/390/320/short-viewport captures. Set `FIREFOX_PATH` to also run Firefox. Screenshots: `/tmp/crossword-native`. Headless touch emulation does **not** certify a physical iOS/Android keyboard or its viewport behaviour.
- `node tests/crossword-shortcuts.cjs`: defaults to port **18776**. Native Chromium Shift shortcuts on desktop and touch-capable profiles, repeated route/date/archive switches, focus and async-load matrix, ordinary letters/navigation and editable/browser-shortcut guards. No screenshots or production/provider writes. See the reproduction and coverage below.
- `node tests/themes-browser.cjs`: every published local game/launcher and Jeopardy audience display; OS light/dark changes, remembered manual choices, return to System, cross-tab propagation, System defaults despite old theme settings, denied theme storage, responsive screenshots and representative interactive states. Screenshots: `/tmp/published-themes`. External country-flag images use a deterministic SVG fixture, and unrelated remote services/fonts are blocked; this is not a CDN, remote Scattergories or buzzer integration test.

All use disposable browser profiles and local archives, not production progress. None include unpublished games. Review the generated screenshots; passing geometry assertions alone is not visual confirmation.

## Crossword Shift shortcut regression

`/crossword/` is the launcher; `/crossword-nyt/`, `/crossword-nytmini/`, and `/crossword-seattle/` share `crossword/script.js` and the same keyboard help. There is one document keydown listener; puzzle loading replaces grid cells, not that listener. No rebinding was needed.

Pre-fix reproduction (base `75b7afb`): open `/crossword-nytmini/?puzzle=2026-10-02` with a touch-capable browser profile, click a playable cell, fill a word, then hold Shift and press physical W. Repeat after selecting `2026-10-01`, then `2026-10-02`. Board clicks focus `#xw-mobile-input` on these devices (including touch laptops with hardware keyboards). The keydown handler delegated printable text to that input **before** checking shortcuts, and explicitly excluded it from Shift actions. Trusted native events were:

```text
keydown Shift / ShiftLeft, shiftKey=true, target=xw-mobile-input
keydown W / KeyW, shiftKey=true, defaultPrevented=false
beforeinput W → input W → grid overwritten, no check-word flash
```

The desktop grid target passed the same sequence; explicitly focusing the gameplay textbox on desktop reproduced the failure too. This explains focus-dependent behaviour, rather than evidence of a listener lost during puzzle switching. The new matrix failed pre-fix at `crossword-nyt touch=false pass=0 focus=native KeyW: must not insert shortcut letter`. After the fix, the same native keydown is prevented, no text events follow, the grid/selection are unchanged, and check-word feedback appears. Casing-dependent matching was also corrected: Shift with a lowercase `key` still invokes the action, and native Ctrl+Shift+Z emits uppercase `Z` and now redoes correctly. Shortcuts use the current event's modifiers, not global held-key state or physical key codes (the documented letters remain keyboard-layout-sensitive).

Coverage uses actual Playwright keyboard down/press/up events, not dispatched KeyboardEvents:

| Combination | Asserted result |
| --- | --- |
| Shift+W (including repeats, incomplete word, lowercase key) | Correct/wrong clue-bar feedback when filled; never inserts W or moves selection |
| Shift+C | Check all locks the correctly filled word; grid letters unchanged |
| Shift+P | Partial check marks wrong word cells; grid letters unchanged |
| Shift+Tab / Shift+Enter | Previous clue, once per press |
| Ctrl+Shift+Z | Redoes the undone letter |
| Ctrl+Shift+Backspace | Clears word including intersections; Ctrl+Backspace preserves intersections |

No Shift reveal shortcut is documented; reveal remains a toolbar action. The matrix covers all three playable sources, desktop and touch-capable profiles, two full route passes, pointer/Tab/across-clue/down-clue focus, return from settings/dialog, explicit native gameplay input focus, repeated date/select/archive navigation, a held local archive response, and Shift held across puzzle/focus changes. Assertions check trusted event/modifier/target/default evidence plus actual action UI/state, not just function spies. It also checks unmodified W, upper/lowercase letters, Shift+other letters, uppercase native text without Shift, Backspace, arrows, Space, Enter/Tab, undo, editable inputs/textarea/contenteditable/dialog entry, and Ctrl/Meta/Alt chord guards. Tests use disposable profiles, committed archive puzzles and a blocked remote list; service workers are blocked in the matrix so no stale app cache can substitute code. Headless Chromium is not certification of physical mobile keyboards, OS Caps Lock, alternate keyboard layouts, Safari/Firefox, or browser-chrome shortcuts.

## Installable app and daily library

- `node --test tests/krillion-retirement.test.mjs`: Krillion is absent from the home/shared daily catalogue, all other listings remain, archival automation is manual-only, other games retain their daily fetch schedule, and historical Krillion routes/data/assets remain available.
- `TZ=Australia/Sydney node --test tests/daily.test.mjs` (also run with `TZ=America/Los_Angeles`): local-calendar boundaries, every archived daily payload, exact-date validation, old/new progress, Connections continuation/reveal outcomes, download fallback, cancellation, quota failures, overlay retries, and cache-update isolation.
- `node tests/app-browser.cjs`: same browser environment and port **18764** as above. Uses a temporary **persistent Chromium profile**, real service workers and Cache Storage, and Chromium installability diagnostics. Checks unplayed downloads, native crossword saves, Connections standard→easy outcomes, old saves, cross-tab changes, history filters, offline navigation and a cold browser restart, blocked storage, install help, responsive light/dark layouts, focus and hover. Screenshots default to `/tmp/puzzle-app`. The profile is removed after the test; existing user profiles are not used.

- `node tests/app-update-browser.cjs`: starts its own loopback server with in-memory deployment versions. Verifies an interrupted install, a waiting update that needs an explicit click, survival of puzzle data/native saves/theme choices/unrelated caches, stalled-network fallback and unknown-route isolation. It never rewrites site files; screenshots default to `/tmp/puzzle-app-updates`.

The browser test does not click a real operating-system install sheet or certify physical iOS/Android installation. Party-game external artwork/media and remote buzzers are not offline guarantees. See `../assets/APP.md` for cache boundaries and update behaviour.
