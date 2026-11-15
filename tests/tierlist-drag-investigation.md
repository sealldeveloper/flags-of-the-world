# Multiplayer drag investigation (base fa9d6b2)

## Changes and claim boundary

Ranking now defaults to primary mouse/pen/touch **pointer dragging**, bypassing native HTML5/platform drag startup. `?drag=native` retains native mouse dragging for explicit comparison. Ordinary click, double-click zoom, and keyboard Place here remain independent. Escape, outside release, blur, hidden document, pointer cancellation/lost capture and board replacement cancel rather than commit. The original ownership/readiness checks remain; Everyone stays read-only. No repair resets placements or custom category names.

The affected user's persistent OS-specific failure after hard refresh was **not reproduced on their actual platform**. The pointer path is a compatibility repair for native-drag failure, not a claim that its unknown platform cause was found. Actual Edge and physical pen/touch hardware were unavailable.

## Proven current-release native failures

1. **Preview moves an accepted target away.** On both real iroh host and guest, at 390px, put 16 cards in the first tier (last wrapped row contains one), three in the next, then empty tiers. Drag the last source card to the bottom of the second empty destination area. Accepted trusted dragover mutates layout: absolute source removal shrinks the source tier by 64px. Without further pointer motion, five 100ms samples change `elementFromPoint` from intended tier 2 to tier 3 while the slot remains in 2. Release produces dragend but no drop; own seq stays zero, connected/editable remain true. Place here immediately works. Fix: retain the dimmed source footprint and use an absolute, non-layout-changing insertion caret.
2. **Selection cleanup cancels startup.** Select a card first, then drag. `startSort` hid the selection bar and Place here controls during trusted dragstart. Source y changed 585.5 → 519.5 before dragstart returned; Chromium immediately emitted trusted dragend, no dragover/drop, seq unchanged. This also made Playwright's native-drag interception wait indefinitely; the regression bounds input at 10s and saves the trace. Reproduced on real host and guest. Fix: defer selection DOM cleanup until sort ends.
3. **Duplicated guest tabs repeatedly replace each other.** Copied resume capability remained reusable, so established persistent retries caused alternating takeovers/read-only periods. This did **not** disable host dragging. A valid resume now synchronously rotates only that seat's token, preserves seat/board/seq, revokes the old peer's ownership, sends an additive seat-replaced notice, and disconnects within 200ms. Updated displaced clients stop; older guests ignoring the notice stop on the existing stale-capability rejection. No protocol bump, host reset, token-history registry, or offline-reclaim behavior.

These explain reproducible failure sequences, not every report of permanently blocked native startup.

## Focused commands

Serve the worktree on 18779; set `PLAYWRIGHT_MODULE` and optionally `CHROMIUM_PATH` as for the other browser suites.

```sh
node tests/tierlist-pointer-drag.cjs
node tests/tierlist-drag-hover.cjs
SELECTED_SOURCE=1 node tests/tierlist-drag-hover.cjs
node --test tests/tierlist*.test.mjs
```

Pointer suite uses two separate synthetic owned lobbies: negative controls explicitly cancel trusted native dragstart on both actual peers; then the default pointer mode succeeds on both actual peers under that same installed cancellation rule, with trusted mouse input and exact host receipt. It checks Escape/outside cancellation, controlled blur notification, click/doubleclick/keyboard, CDP pen and touch, and actual CDP touch cancellation. Pointer movement is **not labelled native DnD**. The same pointer suite routed to baseline assets fails its real movement assertion (`seq 0 !== 1`), while the compatibility implementation passes. It also checks Escape before the movement threshold with another card selected, so release cannot accidentally become a click-move. Blur notification is controlled JS, not physical OS focus loss.

Hover suite explicitly selects `?drag=native`. It checks both real peers × 390/1024/1280 × light/dark, unchanged source position/dimensions, stationary hit testing, trusted accepted native drop, exact own +1 seq, host receipt and category-name preservation. `SELECTED_SOURCE=other` selects another card instead. No synthetic successful DragEvents are used.

For baseline validation, write only `ui.mjs` and `style.css` from fa9d6b2 to a temporary directory and set `SORT_BASELINE_DIR` to that directory. The ordinary hover regression fails on stationary target stability. `EXPECT_UNSTABLE=1` instead asserts the precise failure and successful Place here workaround. Selected-source baseline fails the bounded native-start check; `DRAG_ROLE=guest` isolates guest evidence.

## Evidence and coverage

Evidence lives outside the repository, contains synthetic fixtures only, and excludes invitations, room/endpoint identifiers, capabilities and wire message bodies. Event traces are bounded. Relevant directories:

- `/tmp/tierlist-drag-hover-before`: deterministic canceled-drop traces on host and guest.
- `/tmp/tierlist-drag-hover-baseline-regression`: same regression fails with routed baseline assets.
- `/tmp/tierlist-drag-selected-before` and `...-selected-guest-before`: trusted startup cancellation and source geometry.
- `/tmp/tierlist-drag-hover-final` and `/tmp/tierlist-drag-selected-after`: 12 cases each passed before the compatibility continuation; source position and dimensions unchanged.
- `/tmp/tierlist-hover-pointer-release`: final native-comparison 12-case pass.
- `/tmp/tierlist-pointer-drag`: final focused compatibility controls and receipts.
- `/tmp/tierlist-drag-stress-full`: 237 pre-fix trusted movement checks with live-target retargeting; this broad stress alone missed the stationary/selected failures.
- `/tmp/tierlist-drag-stress-final`: 239 pre-compatibility native/touch movement checks passed after geometry fixes: 40 rounds of real peer edits during gestures, all 24-card out/restore sweeps, narrow mouse/touch, Escape, Everyone/modal/export/Back/Rank loops, three real resumes, 42s frozen/offline guest, and stable duplicate takeover/current-token resume/stale rejection. This was **two real simultaneous seats**, not 16 real peers.
- `/tmp/tierlist-drag-stress-legacy`: 163 analogous checks with baseline guest room code ignoring the new notice; stale rejection stopped it. Protocol 5/6 behavior is additionally covered by unit tests.

Native sort/zoom, readiness/early-roster/reconnect browser suites and retry-recovery browser suite also passed during investigation. Async local saves do not set lobby busy; busy-changing imports/cover operations are outside the editable lobby route. Network outages and Everyone read-only state were classified separately, never counted as the connected-native failure.

CSS preview screenshots at 390/1024/1280 in both themes were reviewed, including keyboard focus and the caret. Physical OS drag behavior, actual Edge, and the original user's post-release confirmation remain unverified. No service-worker edits, publication, or deployment were made.
