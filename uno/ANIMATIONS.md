# Original-style animation pass

The motion reference is ScuffedUNO's public `852.fbf3c5e3.js` renderer/animator bundle and its game-event orchestration, inspected on 2026-10-06 (UTC), alongside its live entry/lobby. SHA-256 of that reference bundle: `a934e0c236c0e9f28a84bedbfd3c24bb94c9c5cad11468916d4d279dbef76e34`. Its application bundles are **not** shipped here. `scene.mjs`, `effects.mjs` and the presentation sequencing are locally authored adapters for recipient-filtered iroh views, not a copy of the original Socket.IO application. Existing artwork attribution and redistribution uncertainty still apply.

## Coverage

| Original reference | Local equivalent |
| --- | --- |
| `giveCard`, opening game setup | Curved deck-to-hand flight and face/back orientation; opening launches overlap at 100 ms intervals across every seat. Seven cards finish travelling in 1.6 seconds, then settle for 250 ms. Ordinary draws take a full second each. |
| `playCard` | Rising curved toss, accelerating into the discard in 500 ms; source position, world orientation **and size** are preserved instead of spawning an already-shrunken card. A 600 ms presentation stage leaves landing time. |
| Hand positioning / `orderCards` | Existing hand cards reflow over 450 ms as cards arrive/leave. There is no separate manual card-sort command. |
| `changePlayDirection` | An 800 ms fade-out, direction flip, and fade-in of the centered rotating arrow ring, after the reverse card lands. |
| `skipAlert`, `reverseAlert`, `zeroAlert` | White-outlined public callouts with a 300 ms pop, hold, and exit. Action-card cues last 1.6 seconds; 7/0 selection uses the existing selection phase. |
| `unoAlert` | A public UNO burst at the calling player's seat, without changing post-play UNO/catch rules or revealing their remaining card. |
| `open/closeColorPicker`, `open/closeColorWheel` | Accessible modal choices with 300 ms / 50 ms staggered entrance and reversed exit on selection. The wild travels with its neutral face, then shows its chosen colour and a four-colour callout after landing. Escape/cancellation remains immediate; stale choices cannot close a newer chooser. |
| `create/addTo/destroyStackCount`, `giveStack` | A growing public debt badge, +2/+4 callout and travelling draw-count penalty. Ordinary multi-card draws also show their public count. Counts disappear after payment; no private identities are included. |
| `open/closeSevenAlert`, `pickHandSevenAlert` | Animated choice controls, public seven/swap callout and existing actor/target arrow. |
| `swapHands`, `swapAllHands`, `giveHand` | Curved, size-aware card-back fans move between the fixed seats; selected hands remain masked until the private recipient hand settles. Existing two-flight/pause and simultaneous directional-rotation semantics remain. |
| Hover / tint | Raised highlighted cards and a gradual 800 ms inactive-hand tint transition; drawn-card controls remain keyboard accessible. |
| `winRevealHands` / results | Results entrance after all required card/transfer phases, with public counts only. **Opponent hands are never revealed.** |
| `zoomInCamera`, `zoomOutCamera` | Intentionally not copied: camera framing and seats stay fixed on turn changes. |

## Centering and motion preference

The discard is horizontally centered in the usable table, rather than positioning it at 42% of the viewport to balance the draw deck. The draw deck is offset to its right. The direction ring follows the discard, including narrow screens, and is capped at 180 pixels to stay clear of the central status. Dense tables use numbered turn labels; on narrow six-to-eight-seat tables the full notice stays in history rather than obscuring the pile. Central status is visually hidden during card flights but its live-region text remains available. Cached settled pile/seat bounds keep status labels from following a flying mesh.

Reduced motion removes flights, ring rotation and pulsing/translating callouts, while retaining readable static cues, ordered phases, host deadlines, UNO timing and private hand boundaries. Explicit Motion settings apply to both WebGL and choice/result entrance effects.

Application/invite protocol **3** and first-party asset query `v=20261006c` prevent mixing clients with different deal/cue schedules. Refresh every tab and create a fresh room; the Rust/WASM transport itself is unchanged.

## Verification entry points

- `node --test tests/uno-*.test.mjs`: engine/privacy/authority plus fast-deal, action-cue ordering and exact host/presentation duration agreement.
- `tests/uno-animation-browser.cjs`: real iroh host and WebGL, controlled host-owned deals, paused presentation clocks to capture actual in-flight meshes, source-size checks, overlapping launch intervals, action cues/transfers, centering, deck hover, animated choices/stale-exit cancellation and reduced motion across four viewports.
- `tests/uno-release-browser.cjs`: unpaused real-peer pacing, duplicate snapshots, UNO/catches, jump-ins, stable seats, winner timing and rematch.
- `tests/uno-release-visual.cjs`, `tests/uno-toolbar.cjs`, `tests/uno-round.cjs`: responsive controls and a natural full round/rematch.

Fresh original-game automation did not complete: reference capture attempts hit ad-loading, bot-acknowledgement and inspector/module-loading synchronization problems. The motion comparison therefore relies on inspected original code, not a claimed complete fresh original-game playthrough. Local rendering is directly browser-tested and visually reviewed.

Test-only instrumentation is not a production endpoint. Reference inspection is not a claim of exact pixel parity or of reproducing original team, account, lobby, card-sort, camera-zoom or opponent-hand-reveal behavior. Physical-device/Safari and cross-network limitations in `TESTING.md` remain.
