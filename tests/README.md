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

Uses committed archive puzzles, a fresh browser profile, and a stub for the remote crossword list. No production progress is changed. Covers single-step Enter/Tab navigation (including locked clues, reverse navigation, and input bubbling), typing/deletion, native button activation, mobile keys, wide touch-tablet input, Connections standard/easy persistence, more than four mistakes, loss, completion, sharing labels, reset, and horizontal overflow. Captures all three crossword sources and Connections in light/dark at 1920, 1024, 390, and 320 pixels, plus crossword tools, scrolled clues, modal, loading, and error states. Review screenshots visually after CSS changes.

Connections easy and standard use separate per-date saves. The original standard storage keys remain unchanged. The selected difficulty is remembered across puzzle changes/reloads; easy results are labelled as such.
