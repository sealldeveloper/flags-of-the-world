# Daily publication refresh

The homepage follows the browser's local calendar. Sources need not publish that date simultaneously: a reader ahead of UTC/New York can have tomorrow's Connections while the matching Crossword/Mini are not available. Previously only Connections prefetched tomorrow, the archive ran once daily, and homepage links requested the absent date exactly.

## Contract

- Today's homepage links carry `daily=1`. Direct game entry also follows the current local day. A dated link equal to today's local date retains this compatibility behavior for older homepage tabs.
- `loadLatestPuzzle` always checks the requested date first. It may then try yesterday and the latest earlier manifest date (at most three distinct dates). Responses retain their actual publication date and are cached only under that date. No failed/incorrect-date payload is cached as today's puzzle.
- The displayed date, URL, picker, and save key identify the actual loaded puzzle. A visible status explains a fallback. Explicit historical date loads remain exact and show an error rather than silently changing dates.
- A daily tab rechecks on return/visibility/online and every minute. A newly available puzzle produces an **Open new puzzle** action instead of replacing a board in progress. The current save is flushed when the user chooses to switch. The homepage refreshes availability on return after a minute and while visible every five minutes.
- A successful download for an earlier date does not count as finishing/downloading the requested homepage date. Cards label the available date explicitly.
- All three archives prefetch tomorrow and retry the prior seven dates hourly at minute 17. Exact publication-date validation rejects wrong-day payloads. Archive runs are serialized and rebase their data commit over unrelated main-branch changes. Krillion remains manual-only.

## Checks

`node --test tests/daily.test.mjs tests/krillion-retirement.test.mjs`

`PLAYWRIGHT_MODULE=/path/to/playwright BASE_URL=http://127.0.0.1:18781 node tests/daily-refresh-browser.cjs`

The browser test uses only synthetic researcher-authored puzzle data and DOM/state assertions. It creates no screenshots or images. It exercises Sydney's ahead-of-UTC calendar, per-game publication failures and subsequent release, actual-date fallback/save isolation, progress-preserving opt-in switches, pinned archives, mobile/tablet geometry/notice visibility, and mixed homepage availability refreshing on focus. It does not assert that every source publishes on the same schedule or that a genuine upstream outage can be eliminated.
