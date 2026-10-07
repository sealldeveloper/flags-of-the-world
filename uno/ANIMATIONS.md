# Original-style animation pass

The motion reference is ScuffedUNO's public `852.fbf3c5e3.js` renderer/animator bundle and its game-event orchestration, inspected on 2026-10-06 (UTC), alongside its live entry/lobby. SHA-256 of that reference bundle: `a934e0c236c0e9f28a84bedbfd3c24bb94c9c5cad11468916d4d279dbef76e34`. Its application bundles are **not** shipped here. `scene.mjs`, `effects.mjs` and the presentation sequencing are locally authored adapters for recipient-filtered iroh views, not a copy of the original Socket.IO application. Existing artwork attribution and redistribution uncertainty still apply.

## Coverage

| Original reference | Local equivalent |
| --- | --- |
| `giveCard`, opening game setup | Curved deck-to-hand flight and face/back orientation; opening launches overlap at 100 ms intervals across every seat. Seven cards finish travelling in 1.6 seconds, then settle for 250 ms. Ordinary draws take a full second each. |
| `playCard` | Rising curved toss, accelerating into the discard in 500 ms; source position, world orientation **and size** are preserved instead of spawning an already-shrunken card. A 600 ms presentation stage leaves landing time. |
| Hand positioning / `orderCards` | Existing hand cards reflow over 450 ms as cards arrive/leave. There is no separate manual card-sort command. |
| `changePlayDirection` | An 800 ms fade-out, direction flip, and fade-in of the centered rotating arrow ring, after the reverse card lands. |
| `skipAlert`, `reverseAlert`, `zeroAlert` | Extruded Three.js symbols with coloured faces and fading side walls, using the original ring/slash, paired-arrow, and Rubik number geometry patterns; 300 ms pop, hold, and exit. Action-card cues last 1.6 seconds; 7/0 selection uses the existing selection phase. |
| `unoAlert` | A public UNO burst at the calling player's seat, without changing post-play UNO/catch rules or revealing their remaining card. |
| `open/closeColorPicker`, `open/closeColorWheel` | A raised four-sector colour wheel with accessible modal hit regions, keyboard selection and cancellation. The wild travels with its neutral face, then shows its chosen colour and raises that sector after landing. Escape/cancellation remains immediate; stale choices cannot close a newer chooser. |
| `create/addTo/destroyStackCount`, `giveStack` | A growing public debt badge and extruded +2/+4 symbols. Draws arrive individually: the future draw-until-playable total is never announced by an effect. Counts disappear after payment; no private identities are included. |
| `open/closeSevenAlert`, `pickHandSevenAlert` | A giant coloured extruded 7 with clickable arrows pointing toward candidate seats; public selection points toward the chosen player. A giant coloured 0 precedes the all-hand rotation. |
| `swapHands`, `swapAllHands`, `giveHand` | Curved, size-aware card-back fans move between the fixed seats; selected hands remain masked until the private recipient hand settles. Seven-swaps use one shared one-second flight: both fans leave together on opposite curved paths, retain source geometry/size, and settle together. All-hand rotation remains simultaneous. |
| Hover / tint | Only legal cards brighten, even on your turn. Exact jump-in cards lift during the host-bounded window with a shrinking Jump in! bar. A playable final draw stays separate until Keep or Play; drawn-card controls remain keyboard accessible. |
| `winRevealHands` / results | Results entrance after all required card/transfer phases, with public counts only. **Opponent hands are never revealed.** |
| `zoomInCamera`, `zoomOutCamera` | Intentionally not copied: camera framing and seats stay fixed on turn changes. |

## Centering and motion preference

The supplied ScuffedUNO four-player screenshot guides the layout: side hands flank the arrows, the far hand is above them, and the draw pile sits in the upper-left gap between seats, outside the rotating arrow sweep. Wide two-to-five-seat tables put the local placard beside the unchanged-size hand and centre the playable area at 55% of the viewport. Narrow/crowded tables retain centred framing. Deck placement checks complete hand/placard bounds and the entire rotating arrow envelope, not merely the currently visible arcs. Cards retain the existing size budgets; opponent cards have separated thin layers rather than intersecting thick, independently yawed slabs. Player placards retain plain names, orange current-turn / blue waiting headers, numeric card counts and colour-coded numerical ping. Direction, turn and last-action text are not drawn over the board; public actions remain in history.

Motion defaults **on**, including when the OS requests reduced motion; a saved explicit Off setting is respected. Turning Motion off removes flights, ring rotation and pulsing/translating callouts, while retaining readable static cues, ordered phases, host deadlines, UNO timing and private hand boundaries. Explicit Motion settings apply to both WebGL and choice/result entrance effects.

Application/invite protocol **5** and first-party asset query `v=20261006e` prevent mixing clients with different deal/cue schedules. Refresh every tab and create a fresh room; the Rust/WASM transport itself is unchanged.

## Turn deadlines and provenance

The host gives each normal turn or drawn-card decision 30 seconds, beginning after mandatory animation/jump windows. At expiry it selects a legal move using the same validated bot-action policy. Disconnected seats pause; duplicate snapshots do not restart the clock. UNO call/catch windows retain their separate deadlines. The jump window is strictly three seconds; the host rejects late out-of-turn plays. Client deadlines account for measured RTT (delivery and return), and acknowledgements never restart their countdown. History timestamps are local observation times, retained only in this tab.

The geometry ports use the original `me` (skip), `Ae` (reverse), `ve`/`fe` (wheel), `Ie`/`Me` (7/arrows), `Ee` (0), and `Se` (extruded Rubik text) classes as reference. Original application bundles/socket handlers are not shipped. `Rubik_Bold.json` is served locally from the original font URL, SHA-256 `0206cfc29d1659b9a1c8da8576261045bbfd6d6641399ceb1d7ee6e4eaf278a7`; the Rubik OFL is included. Three.js r160 FontLoader uses the existing Three.js MIT licence. ScuffedUNO artwork/code redistribution permission remains unverified; Freddie Nelson attribution is preserved.

## Verification entry points

- `node --test tests/uno-*.test.mjs`: engine/privacy/authority plus fast-deal, action-cue ordering and exact host/presentation duration agreement.
- `tests/uno-animation-browser.cjs`: real iroh host and WebGL, controlled host-owned deals, paused presentation clocks to capture actual in-flight meshes, source-size checks, overlapping launch intervals, action cues/transfers, centering, deck hover, animated choices/stale-exit cancellation and reduced motion across four viewports.
- `tests/uno-board-layout.cjs`: full seven-card hands for four players, viewer plus four bots, and eight players; reference-size/desktop/tablet/mobile captures; complete arrow-sweep, deck, hand and placard collision assertions; default motion and persisted Off.
- `tests/uno-turn-ui.cjs`: player placards, tint, held/kept draws, jump cue/click/expiry, automatic turn deadline and timestamp history across four viewports.
- `tests/uno-release-browser.cjs`: unpaused real-peer pacing, duplicate snapshots, UNO/catches, jump-ins, stable seats, winner timing and rematch.
- `tests/uno-release-visual.cjs`, `tests/uno-toolbar.cjs`, `tests/uno-round.cjs`: responsive controls and a natural full round/rematch.

Fresh original-game automation did not complete: reference capture attempts hit ad-loading, bot-acknowledgement and inspector/module-loading synchronization problems. The motion comparison therefore relies on inspected original code, not a claimed complete fresh original-game playthrough. Local rendering is directly browser-tested and visually reviewed.

Test-only instrumentation is not a production endpoint. Reference inspection is not a claim of exact pixel parity or of reproducing original team, account, lobby, card-sort, camera-zoom or opponent-hand-reveal behavior. Physical-device/Safari and cross-network limitations in `TESTING.md` remain.
