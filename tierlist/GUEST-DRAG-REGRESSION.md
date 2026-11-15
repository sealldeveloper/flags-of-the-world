# Guest drag readiness regression

## Cause and fix

The UI previously refreshed the ranking board on first state, self sequence change,
or any disconnected state. Disconnecting rendered a read-only board. Automatic
resume restored `connected` without changing the self sequence, so that same board
kept its non-draggable tiles and missing drag/pointer handlers, despite enabled
editor controls.

A fresh join can hit the same problem: a roster received after the self snapshot
but before the final board snapshot emits a disconnected state with usable album
and self data. The final snapshot changes readiness, not sequence. The regression
makes this ordering deterministic with a later joining player and delayed wire
messages, using the real iroh transport and normal room handlers.

`renderBoard` now records the album ID, self ID, sequence and editability actually
rendered. State emissions rebuild only when those inputs change. Roster, latency,
presence and original-image progress do not replace an unchanged board or cancel
an active drag, including while the board is read-only during reconnection.

The observed Chromium failure was **no native dragstart**, not a URI/image drag.
Nested images already have `pointer-events: none` in the existing stylesheet.
No image, style, room protocol or service-worker change is needed.

## Reproduce and validate

Serve the repository root, with its existing transport WASM files available:

```sh
python3 -m http.server 18768 --bind 127.0.0.1
export BASE_URL=http://127.0.0.1:18768
export PLAYWRIGHT_MODULE=/path/to/playwright
export CHROMIUM_PATH=/usr/bin/chromium-browser
export EVIDENCE_DIR=/tmp/tierlist-guest-drag
node tests/tierlist-guest-drag.cjs
```

The test uses isolated browser contexts and public iroh relays. It temporarily
holds actual preview/snapshot/original wire messages to expose readiness states;
it does not replace the transport or dispatch synthetic drag events. Explicit
mouse input drives native DnD. Document-level traces assert trusted dragstart and
drop events, `text/x-tier-image` payload types and prevented dragover/drop defaults.

Coverage:

- Fresh ready guest: same-tier reorder, cross-tier moves, to/from Unranked while
  originals remain pending.
- Roster, presence, latency and full original completion during an active native
  drag: identical board/source nodes and a usable drop preview.
- Actual transport disconnect plus automatic in-tab resume: same self and
  sequence, restored native drag handlers and all four ranking moves.
- Disconnected and Everyone boards remain noneditable.
- Resumed guest keyboard selection/placement and actual CDP touch ranking.
- Fresh-join early roster: read-only before final snapshot, editable afterwards
  at the same sequence, with all four native ranking moves.

`DRAG_SCENARIO=reconnect` or `DRAG_SCENARIO=early` selects one scenario. JSON
snapshots and drag traces are written even on failure, along with successful
scenario screenshots. Both scenarios fail against the original UI: readiness is
true but `draggable` is false, and the actual mouse attempt has no custom
`dragstart`. Both pass after the fix.

Additional checks:

```sh
node --test tests/*.test.mjs
node tests/tierlist-sort-zoom.cjs
node tests/tierlist-states.cjs
node tests/tierlist-progressive.cjs
node tests/tierlist-browser.cjs
```

The first four checks passed (215 unit tests, native sorting, actual touch,
keyboard and progressive originals). The existing general browser suite reaches
host closure but fails its unrelated punctuation assertion on the existing
`Ready · — ms` ping placeholder. The same failure was reproduced on the original
UI. A temporary diagnostic copy skipping only that host-ended punctuation check
completed the remaining real-transport browser assertions; the tracked test was
not changed.

These are headless Chromium checks, not certification of physical mobile devices,
Safari/Firefox, every NAT/relay environment or a deployed service-worker update.
