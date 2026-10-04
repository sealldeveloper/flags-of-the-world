# Connections

Static daily Connections with local archive / live-service fallback.

## Progress and hints

- Guesses (including their selected word IDs and order), total guess count, found groups, word order, and category-name reveals persist in this browser's local storage, separately for each date and mode. Existing `nyt-connections-v1` saves are retained.
- The incorrect-guess panel sits alongside the board on desktop and below it on narrow screens. It shows the actual words and only **One away** / **Not one away**—never a two-/three-away count or per-word category colours.
- Each colour can reveal its **category name only**, without selecting, removing, or solving its words. Reveals do not count as guesses and are recorded at their place in the attempt's timeline.
- Standard mode stops after four mistakes **without exposing the remaining answers**. Choose **Continue in easy mode** to retain every guess, found group, word position, and hint; or explicitly **Reveal answers** to end the attempt. A pending choice survives reload.
- Continuing preserves the standard save and writes the carried attempt into the separate easy-mode save. If an easy attempt already exists, replacing it requires confirmation. Easy mode then allows unlimited further tries. Results disclose that the run continued from standard.
- Reset clears only the current date/mode. Older lost saves are treated as already revealed, because the previous version showed their answers automatically.
- Accepted guesses are saved before animations. Storage failures are reported rather than silently claiming progress was saved. Saves are local to this browser, not synced across devices.

## Sharing

After completion (or an explicit loss reveal), **View / share results** reopens a copyable plain-text message containing every guess as a colour-emoji row, the found order, guess/mistake totals, hint events, mode/continuation status, and a public `https://puzzle.seall.dev/connections-nyt/` link for that date and mode. No answer words or category titles are included. Before a loss decision, the share preview stays empty to avoid exposing colour associations.

Clipboard copying has a visible selectable-text fallback. The message remains available after reloading a completed puzzle. `?mode=easy` and `?mode=standard` select the linked mode without erasing either saved attempt.

## Browser verification

Serve the repository root locally, then run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright \
CHROMIUM_PATH=/path/to/chrome \
BASE_URL=http://127.0.0.1:18764 \
node tests/connections-browser.cjs
```

The test uses the local 2026-10-02 archive, actual card/button interactions, 1920/1024/390/320 layouts, both themes, keyboard controls, save/reload/migration, both loss choices, progress transfer, duplicate guesses, clipboard and storage failure cases, and normal-motion interruption. Screenshots default to `/tmp/connections-features` and require visual review. It does not run or alter UNO.
