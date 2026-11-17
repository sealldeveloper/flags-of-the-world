# Multiplayer tab-suspension recovery

## Reproduction and root cause

On the unchanged current release, suspend a real connected guest browser tab for 45 seconds. The host removes its timed-out peer and retains the offline player's board. When the guest wakes, buffered `presence`, original-transfer and `ping` frames from the old socket are delivered. Those pings set `lastSeen` to the current time even though the host has no corresponding connection anymore.

The guest still says **Connected**, has an editable Rank board, and applies a trusted pointer move optimistically (local revision 2→3). The host remains at revision 2 with zero connected peers, and receives no move for at least 20 seconds. Bringing the host foreground does not repair it. The existing foreground handler refuses to dial while `connected` or `connection` is still set, and the fresh timestamp postpones heartbeat recovery.

This is a stale transport/session-state failure, separate from earlier native drag geometry bugs. Ordinary short tab switching does not reproduce this particular failure.

## Fix

- Record the actual hidden duration, independent of received-message timestamps. An established guest returning after at least 25 seconds renews the connection and resumes its existing authenticated seat before editing is enabled.
- On a genuine lifecycle freeze, detach the old connection and stop its transfer before suspension. Do not retry while frozen. Otherwise buffered original-transfer frames arriving between `resume` and `visibilitychange` could run against a half-paused session.
- A visible resume immediately dials; old-connection frames are ignored through the existing connection-ID checks. All added listeners are removed on stop.
- No new lobby, host-role change, protocol bump, template reset, same-name implicit takeover or authentication relaxation. The existing host-acknowledged ranking, category names, ordering and settings are retained. Wire 5 and 6 use the existing resume handshake.

## Why a new browser harness was needed

Playwright ordinarily forces focus/visibility for its pages. Even headed `bringToFront` tests could leave both documents reporting `visible`, so that was not evidence of browser tab hiding. `real-chromium.cjs` launches an isolated ordinary headed Chrome, uses X11 under Xvfb, and attaches with `connectOverCDP({noDefaults:true})`. The test asserts genuine trusted hidden/visible transitions and uses real iroh peers and trusted pointer input. Temporary profiles are removed, and private lobby/seat credentials stay out of evidence and HTTP.

Independent-browser scenarios use distinct browser processes/profiles for host and guest. Every successful movement must reach **both** peers, not merely increment the acting player's optimistic revision. Explicit CDP freezing is a controlled suspension test, not a claim about exact Memory Saver timing or physical OS sleep.

## Commands

```sh
node --test tests/tierlist-tab-recovery.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/driver/package \
  TAB_ROUNDS=16 FREEZE_SECONDS=45 \
  xvfb-run -a -s '-screen 0 1600x1600x24' node tests/tierlist-tab-lifecycle-browser.cjs
```

Optional: `SEPARATE_GUEST=1 HIDE_SECONDS=30` checks ordinary long-hidden returns in independent browsers. `FREEZE_ROLE=host EDIT_DURING_HOST_FREEZE=1` also checks active guest edits while the host cannot process them; these local-only interim moves are not counted as delivered until the host's exact board is verified after wake.

## Evidence

- `/tmp/tierlist-guest-wake-diagnostic/report.json`: repeated baseline failure, stale Connected UI, buffered ping timestamps, host peer removal, missed edit and unsuccessful host-foreground control.
- `/tmp/tierlist-rapid-tabs-before/report.json`: 148 successful trusted moves after short genuine switches, interruptions/release elsewhere, Rank/Everyone, library and local-album returns; no claim that these positive cases reproduce the long-suspension bug.
- Earlier candidate: guest 45-second suspension and host 45-second suspension passed with both-peer receipts, including a host/guest pair in separate browser processes.
- Final candidate: `/tmp/tierlist-tabs-final-verified/report.json` passed **198** real movements after genuine tab/view switches, interrupted drags, rapid return after release elsewhere, and 45-second guest/host freezes; exact board delivery checked on both peers. System Chromium 148.
- `/tmp/tierlist-hidden-independent-final/report.json` passed **6** movements with independent Chrome for Testing 145 processes and ordinary 30-second hidden returns (no explicit freezing).
- `/tmp/tierlist-active-edits-host-suspension/report.json` passed: an active guest's three interim local moves while its independent host was frozen for 45 seconds were verified against the host's exact final board after wake; eight total movement checks in that scenario. No speculative pending-board replay or authentication changes were needed.
- Unit regressions cover buffered stale timestamps, freeze/transfer detachment, listener cleanup, short switches, and saved seats initialized while hidden. A transient, correctly labelled reconnect must finish before testing movement; this is not counted as an editable-board failure.
- The first large run's failure was a harness assertion attempting to drag while correctly Reconnecting, plus a temporary-profile cleanup race. The final harness waits for actual editability (still reproduces the stale-green baseline) and retries filesystem cleanup after Chrome exits.
- **267 repository unit tests passed**, including hidden-before-initialization and pre-ready saved-seat recovery.
- Live production: `/tmp/tierlist-tabs-production-verified/report.json` passed **18** real movements with independent host/guest browser processes, genuine tab hiding and 45-second suspension of each role. The live source and shell v32 were separately fetched and checked.
- An unchanged TL5 host accepted an old guest's app update/reload, same-seat/same-board resume, pointer moves, fresh updated joins and automatic reconnect against production; the host was not reset. Category editing remained available; only unsupported tier-exclusion editing stayed disabled.
- Actual Windows Edge and physical touch/pen devices remain unverified.
