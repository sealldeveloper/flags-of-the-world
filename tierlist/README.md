# Tier List

A self-contained tierlist editor at `/tierlist/`, linked beside UNO. Images live inside browser saves, portable files and lobby transfers. There are no hosted image links, image-upload services, player accounts or discovery database. Multiplayer reuses `../uno/transport.mjs` unchanged.

## Images and files

Add image files under Images. PNG, JPEG, WebP, GIF, AVIF and BMP inputs are supported within these bounds:

- 25 MiB per source or retained encoded image
- 8,192 pixels per edge and 24 million decoded pixels
- 128 MiB expanded tierlist JSON and a 176 MiB portable-code limit
- 48 KiB per player board

Full-resolution images are never silently resized to fit a budget. Already compressed static JPEG/WebP originals are kept without another lossy encode. Ordinary opaque PNGs are compared with a full-resolution lossless WebP encoding, retaining the smaller supported file. Transparent, higher-bit-depth and colour-profiled PNGs retain their original bytes to avoid browser colour/alpha conversion or precision loss. JPEG EXIF orientation is included in dimension validation so rotated originals can retain their original bytes. Other supported formats, animated inputs and any source requiring normalization are flattened at full decoded resolution into lossless WebP or PNG. Animation is not retained. Encoded metadata is not guaranteed to survive conversion. Retained originals can include camera/location metadata, which also travels with portable files and lobby participants.

The pinned, locally vendored jSquash/libwebp encoder runs in a browser Worker with lossless mode, exact colours, full alpha quality and no near-lossless quantization. No runtime CDN is used. See `vendor/webp/SOURCE.md` for versions, integrity and licenses. If the optimizer is unavailable, a valid original is retained or a full-resolution PNG is used, never a lossy fallback. Existing JPEG/WebP files may already be smaller than any lossless re-encoding.

Each image also has a derived preview, normally at most 256 pixels and 16 KiB. Previews may use lossy compression and are deliberately separate from the original. Ranking uses previews. Double-click opens the embedded original, or the temporary preview while its original is still transferring.

Portable `TIER1.` files use lossless gzip compression and contain image bytes, previews, names, cover, source ordering, categories and rankings. Downloads use a sanitized tierlist name plus a UTC timestamp. Import creates an independent copy. Browser data can be evicted, so export important files.

Only embedded static PNG/JPEG/WebP image data is accepted in files or peer documents. SVG, external URLs, arbitrary blob URLs and remote thumbnails are rejected before fetching or rendering. Existing local saves remain compatible. Older saves containing hosted-only images are not deleted or silently downgraded to their previews, but cannot be opened as local-only tierlists. The library reports unsupported records without hiding valid local saves. Removing the old upload feature does not delete files previously hosted elsewhere.

## Covers

Choose cover imports a file, Use an existing image selects an image from the tierlist, and Use first image resets the automatic library cover. Covers do not add ranking items or change placements. They are embedded PNG/WebP previews, limited to 256 pixels per edge and 64 KiB, and survive files, independent copies and lobby transfers.

## Editing and viewing

- Tierlist titles allow 120 characters, player/author names 40, tier names 100 and image labels 160. Labels wrap and image-name textareas grow with their contents.
- Under Images, Grid/List layouts, native dragging, touch handles and keyboard arrows change source order without changing rankings.
- Under Rank, drag to a before/after insertion marker, or select an image and choose Place here or a destination image. All moves conserve every image exactly once across tiers and Unranked.
- Rename, recolour, reorder and delete tiers with their inline controls. Deleting a tier returns its images to Unranked. At least one tier remains.
- Double-click enlargement starts at no more than half the viewport height and twice a small image's natural size. It does not fill the screen by default. Wheel zoom is continuous and cursor-anchored, with panning, touch pinch, keyboard zoom and Escape/outside-click dismissal. A preview upgrades to its original without jumping the current zoom geometry.

## Preview-first multiplayer

`TL5.` invitations use protocol 5 and normally remain 91 characters. Older invites require a refreshed host and a new invite. The shared UNO transport, relay allowlist, authenticated connections and 64 KiB frame bound are unchanged.

The host first sends a bounded self-contained preview tierlist. The guest decodes previews, syncs player boards and becomes Ready before original transfers start. Joining therefore does not wait for every full-resolution image. Boards, activity and other players remain live while originals arrive passively.

After readiness, the guest requests one original and one 24,000-character chunk at a time. Original payloads are gzip-compressed, bounded, identified by image ID and dimensions, and SHA-256 checked before decoding and atomically replacing a preview. Progress is independent of ranking readiness. Invalid originals leave the existing preview usable rather than installing unverified data. Verified originals can be reused during an in-tab reconnect.

An open viewer upgrades automatically when its original is ready. Save-copy and full-quality portable export wait until all originals are present, so they never misrepresent a preview-only file as a complete backup. Group PNGs can use embedded previews immediately. If original transfer pauses, the lobby remains usable and the UI explains that rejoining is needed to retry. The host must remain connected to supply missing originals.

There are 16 seats including retained offline seats. Guests can resume within the session. Host reload ends a lobby. No host migration, chat, game server, discovery service or WebRTC fallback is used. Public relay connectivity, background throttling and mobile suspension remain external constraints.

Each player ranks independently. Activity retains 80 bounded events, with timestamps including seconds and authenticated, clickable item/tier references. Everyone shows every player's own tiers, placements and Unranked. Chosen player colours are validated, duplicate colours are permitted, and the host controls removals.

Browsing the library or editing a local tierlist does not leave the lobby. Return to lobby restores the live view, and incoming updates never replace typed local edits. Hosts see Disband lobby and guests see Leave lobby. Named copies use the immutable starting tierlist and authenticated host attribution, not another player's edited board.

## Ratings and group images

Unranked abstains. Each eligible ready or completed-offline player contributes equally. With `T` tiers and zero-based tier `t`, tier-only score is `1 - t/(T-1)`, or `0.5` for one tier. Including left-to-right order uses `1 - (t + (i+0.5)/n)/T`. Ties within a small tolerance are explicit, with vote counts and expandable tied results.

Group image freezes the current lobby and creates both light/dark PNGs locally. It includes all players, categories, exact placements, Unranked, both summaries and app branding. No screenshot or upload service is used. Output is bounded to 24 million pixels, 30,000 pixels per edge and at most 4x downscaling, failing clearly rather than dropping content. Filenames include UTC time and theme. Object URLs and image resources are cleaned up after use.

## TierMaker imports

Paste one or more public HTTPS TierMaker create/category/list URLs, one per line. Sources are preflight-validated and canonical duplicates are removed. Templates import sequentially, with one full-resolution image processed at a time per template to bound memory, retaining source order and any exposed saved-list categories/placements. All image bytes and the first-party social/hero cover are downloaded and embedded locally. There is no image-upload step. The app preserves the resolution of the public source supplied by TierMaker without adding lossy compression, but cannot recover detail absent from that source. Previously reduced local saves need re-importing to regain detail when a better source is available.

Completed templates are saved independently. Cancellation preserves completed saves and retains unfinished URLs for retry. Missing covers warn without losing a successful image import. Foreign image/cover metadata is never fetched.

On `https://puzzle.seall.dev`, public reads use the separate restricted `https://puzzle-tierlist-tiermaker.my-account-306.workers.dev` Worker. It accepts only that production origin, exact first-party public page/image paths and internally constructed templates-v2 API requests. It forwards no credentials, executes no page scripts, validates every redirect and has byte/deadline/rate limits. It does not store imports or accept uploads. Cloudflare and TierMaker can see their respective network requests. See `tiermaker-worker/README.md`.

GitHub Pages cannot execute Python. Local preview instead uses `server.py` for the same restricted read endpoints. Local file editing, portable imports/exports and iroh play do not depend on a TierMaker service. Provider availability and future page-format changes cannot be guaranteed.

## Development

```sh
python3 tierlist/server.py --port 18764
node --test tests/*.test.mjs
python3 tests/tiermaker-server.test.py
export PLAYWRIGHT_MODULE=/path/to/playwright
export CHROMIUM_PATH=/path/to/chromium
node tests/tierlist-browser.cjs
node tests/tierlist-sort-zoom.cjs
node tests/tierlist-states.cjs
node tests/tiermaker-batch.cjs
node tests/tierlist-cover.cjs
node tests/tierlist-progressive.cjs
BROWSER=firefox node tests/tierlist-progressive.cjs
node tests/tierlist-tools.cjs
node tests/tierlist-lobby-v2.cjs
node tests/app-update-browser.cjs
```

The shared service worker includes the browser-side lossless encoder and its WASM for offline image preparation. Transport WASM loads only when multiplayer starts. See `TESTING.md` for actual verification and remaining limits. Interface copy uses no em dashes or semicolons, without rewriting user labels or external content.
