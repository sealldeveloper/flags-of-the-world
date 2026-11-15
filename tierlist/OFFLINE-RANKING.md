# Explicit offline ranking recovery

An updated host offers **Take over offline ranking** when an updated guest joins with no usable saved resume capability and an unoccupied offline seat has the same name. Nothing is claimed until the guest selects a specific seat and presses that button. **Join with a new seat** and Cancel remain separate choices (new seats are disabled at the normal 16-seat limit). A valid saved resume still automatically uses the existing seat, without a recovery prompt.

## Matching and authority

Names must pass the existing `cleanName` validator (string, at most 40 UTF-16 code units before trimming, nonempty after JavaScript `trim()`). Recovery compares those trimmed names after Unicode **NFC** normalization, **case-sensitively**. It does not case-fold, collapse interior whitespace, strip accents, or use compatibility/confusable matching. For example, composed `Café` and decomposed `Cafe\u0301` match; `CAFÉ` does not. Display colour is not part of matching.

This is a **private invite-holder convenience, not identity verification**. Anyone with the valid lobby invite and a matching name can explicitly claim an offline ranking. Names, player IDs, colours and the displayed seat metadata are not authentication credentials. Do not share an invite beyond people you trust. No accounts, identity service, host takeover or host migration are introduced.

Only after checking the lobby capability does the host reveal candidates. The offer is scoped to its connection, random single-use nonce, original name/colour and offered IDs. The host rechecks that the selected player still exists, is not host/self, is strictly offline, has no active peer seat and still matches the name. The first valid choice synchronously occupies the seat; later racing choices are rejected. Client-provided boards, online flags and choice-time colours are ignored.

A successful takeover preserves the player ID, entire board (tiers, placements, ordering, exclusion flags), sequence, and immutable album/source attribution. As clearly stated in the prompt, the newly chosen display colour replaces the seat's old colour (a programmatic join with no chosen colour keeps the old one). The supplied cleaned name becomes its display name, consistent with ordinary resume. The host rotates the seat's resume capability before welcoming the claimant. The old capability cannot silently resume it. A still-present ranking left explicitly (whose previous resume was already revoked) is also eligible; removed rankings are not. The welcome stores the new capability through the existing session-storage resume path. Capabilities are not included in offers, DOM, activity history, test reports or screenshots. Activity says “Took over the offline ranking”.

Multiple candidates show separate radio choices with seat number, original colour hex, ranked count, revision and a short public player-ID prefix. These distinguish seats without implying ownership verification. Selecting a new seat never changes an offline board. A full lobby can reclaim a seat without allocating a seventeenth player; ordinary capacity rules are unchanged.

## Compatibility and bounded waiting

This is additive on existing **wire 5 and 6**. A new guest advertises `offlineRanking: true` in the normal join only when it has a choice callback. A supporting host may respond with `offline-ranking-offer`; only that response authorizes the guest to send `offline-ranking-choice`. Old hosts ignore the additive join field and follow their original join/resume path; old guests do not receive new message types. Invites retain the running room's wire version, and legacy TL5 tier-exclusion editing remains disabled. There is **no protocol bump or host reset**.

Already-loaded old hosts cannot acquire recovery retroactively: fresh guests can still join/resume/edit them normally, but no takeover is available there. An invalid saved resume against an old host retains its existing rejection behavior, rather than entering an unsupported-message reconnect loop. Against a supporting host it may lead to an explicit offer or ordinary new-seat join; it never proves ownership of the old seat.

Offers expire after 90 seconds regardless of heartbeats, with a maximum of 16 simultaneous pending offers per host. They reserve no seat. Host heartbeat sweeps enforce that fixed deadline instead of the former 12-second unjoined deadline while a choice is pending; all other pending peers keep the original bound. Guests allow 95 seconds for transport cleanup and continue normal heartbeats. Nonce/connection/generation checks discard stale async choices after reconnect/cancel/replacement; UI callbacks are also scoped to the current room. A failed choice is terminal for that pending connection and can be retried through a fresh join.

## Reproduction

```sh
node --test tests/tierlist*.test.mjs
python3 -m http.server 18777
PLAYWRIGHT_MODULE=/path/to/playwright/driver/package \
  BASE_URL=http://127.0.0.1:18777 \
  node tests/tierlist-offline-ranking-browser.cjs
```

The dedicated unit suite checks malformed flags/IDs/nonces, invite validation, NFC/case matching, online/occupied/host/removed protection, races, capability rotation, sequence/board/source preservation, multiple choices, capacity, legacy non-advertising joins and stale async callbacks. The browser script uses actual iroh old-room guests and new-browser contexts, native DnD, persisted new resumes, cancel/new-seat, stale raced offers and unchanged historical TL5 assets (`d15c7ba`) and pre-feature TL6 room code (`75b7afb`). Its 16-seat/long-name matrix is explicitly a deterministic host-state fixture, **not 16 simultaneous live transport connections**. Screenshots and the capability-free report go to `/tmp/tierlist-offline-ranking` by default. No test modifies service-worker versions or deploys assets.

## Checked implementation evidence

Local verification passed all **237 repository JavaScript tests**, including **10 dedicated recovery authority/lifecycle tests**, plus the dedicated real-Chromium/iroh browser script. The latter passed recovery after an old guest drops, a 17-second modal wait beyond the old unjoined deadline, native drag synchronization, rotated-secret resume, stale-secret isolation, online-name new seats, explicit cancel/new-seat, raced claims, rejected host/removed targets, inline-join error retry, full-seat reclamation, and historical TL5/TL6 interoperability without resetting either host.

The final browser run produced **39 screenshots** covering light/dark 1440×900, 1024×768 and 390×844 choice, keyboard focus, selected/hover, loading/disabled, error, and long/multiple/full-capacity states (top and bottom). Geometry assertions found no horizontal document/dialog overflow; bounded contact sheets were visually inspected. Local artifacts: `/tmp/tierlist-offline-ranking-verified/report.json` and adjacent PNG/contact-sheet files. This certifies Chromium desktop automation and mobile-sized viewports, not physical mobile devices or Firefox. The full-capacity scenario uses real iroh for the claimant with a deterministic 16-seat host-state fixture, not sixteen live guest connections.
