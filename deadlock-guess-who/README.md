# Deadlock Guess Who roster

The board contains 44 released heroes, including the City Never Sleeps additions: Baba, Deadman Danny, Nurse Harrow, Rat King, Solomon and Violet.

## Text and artwork provenance

The six additions use Deadlock Wiki page revisions 215550, 215598, 215641, 215646, 215788 and 215724 respectively. Hero names, traits, opening descriptions, four ability names and every nonempty ability-description section are copied from those pages. Only markup/reference markers are removed and whitespace is collapsed. No summaries, role text, tags or ability explanations are authored or synthesized. Multiple ability modes, such as both parts of Violet's Living Ink, are retained.

`data/city-never-sleeps-sources.json` records exact rendered HTML excerpts, page/revision links, source HTML hashes, artwork URLs, file hashes and dimensions. `data/deadlock.json` carries per-hero and per-ability source links. The wiki's text is attributed under CC BY-NC-SA 4.0, matching the existing visible source credit. Game artwork is by Valve and is downloaded from the wiki's published files, not generated.

The Static Assets API used by the older roster was unavailable during this update. New entries therefore use the internal `hero_…` keys present on the wiki's game-data ability cards as stable application IDs. Numeric game IDs are not guessed. All 38 existing hero records and their saved IDs are unchanged.

Each new hero has a local 120×200 roster portrait, 128×128 headshot, full-resolution transparent showcase, the wiki-supplied infobox background and four original PNG ability icons. Showcase/portrait/background files are encoded as lossless WebP without resizing. The background source is the wiki's existing infobox thumbnail. Runtime rendering fetches local assets only, not the wiki or a game-data API.

## Maintenance

The importer requires Python, Beautiful Soup 4 and Pillow only when maintaining the static data. None is needed in the browser.

```sh
# Inspect current/pinned source revisions without changing the roster
python3 deadlock-guess-who/update-roster.py --source-dir /tmp/deadlock-wave-source

# Apply the six sourced entries and download their published artwork
python3 deadlock-guess-who/update-roster.py --source-dir /tmp/deadlock-wave-source --apply
```

The cache directory stores the MediaWiki parse responses and downloaded source PNGs. Existing response files keep their pinned revisions. To deliberately refresh source revisions, use a new empty cache directory. Review all changed source excerpts before publication. The importer replaces only its six named entries and leaves every other hero unchanged.

## Verification

```sh
node --test tests/*.test.mjs
python3 tests/deadlock-sources.test.py
export PLAYWRIGHT_MODULE=/path/to/playwright
export CHROMIUM_PATH=/path/to/chromium
node tests/deadlock-roster.cjs
BROWSER=firefox node tests/deadlock-roster.cjs
```

The source tests compare every new description/name/trait directly with the captured wiki HTML, verify all eight asset files per hero and guard the unchanged legacy roster with a canonical digest. Browser tests cover 44 secret-picker/board entries, each new secret, the random pool, elimination/restore/reset, reload and old saved IDs. They compare visible description/ability text exactly and verify real local portraits, backgrounds, showcase art and icons in both themes at desktop, tablet and mobile viewport sizes. Physical mobile devices and future upstream wiki/game changes are not certified.
