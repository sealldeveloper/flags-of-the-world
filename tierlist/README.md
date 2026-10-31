# Tier List

A browser-local, general-purpose tierlist editor at `/tierlist/`, linked beside UNO in the games library. Multiplayer uses UNO's existing iroh transport unchanged, with no game backend, accounts or short-code database. Optional TierMaker imports use a restricted public-fetch helper.

## Use

1. Create a tierlist and add images under Images. Choose Local (embedded) or Catbox (original resolution) before selecting files. Local is the default. Catbox requires no account or API key and uploads through the public cors.eu.org relay. Choose Grid or List. Drag an image or its handle to reorder, with a before/after insertion marker. Touch dragging uses the handle. Arrow buttons provide a keyboard-friendly alternative. Reordering changes the source order and Unranked tray without changing existing rankings.
2. Image names use automatically growing multiline textareas, limited to 160 characters. Tierlist titles allow 120 characters, tier names 100 and player names 40. Long names wrap rather than overflowing panels.
3. Under Rank, drag images between or within tiers. The placeholder shows the exact insertion slot, including wrapped rows. Alternatively select an image and choose Place here or another image to insert before it. Tab and Enter or Space support the same flow.
4. Double-click an image for a toolbar-free overlay over a darkened page. Wheel zoom is continuous and anchored to the cursor, with no preset zoom levels. Touch pinch and dragging support zoom/pan. Click outside the image or press Escape to close. Keyboard +/− adjusts zoom and 0 resets the fit. Alt+Enter opens a focused ranking image. Authoring previews open with Enter or Space.
5. Up/down controls on each tier's right edge reorder it. Click its name to rename, recolour or delete it. Deleted tiers return their images to Unranked. At least one tier must remain. There is no fixed category count, within the board byte budget.
6. Solo changes automatically save in IndexedDB. Export a `TIER1.` code (self-contained for local images, public image references and small previews for hosted images) or `<tierlist name>-<UTC datetime>.tierlist` backup, including seconds and milliseconds. Names are sanitized and byte-bounded for common filesystems. Import accepts `.tierlist` and older `.txt` backups and creates an independent copy, never overwriting existing data.
7. Hosting and joining ask for a name and chosen player colour, including shared-link prompts. Colour choices are validated and remembered locally, and can be reselected on resume. Duplicate colours are allowed, with names and authenticated seats remaining distinct. A prominent cancellable Creating lobby dialog reports progress. Lobby management groups Copy link, Copy code and the exit action separately from the tierlist controls. Hosts see Disband lobby, while guests see Leave lobby. Successful clipboard buttons briefly turn green and change their own labels, without adding top-left status text. Clipboard failures open a selectable fallback.
8. The roster shows Loading assets with progress, Checking assets, Ready or Offline beneath each player. An authenticated seat is visible while it downloads, not only after joining completes.
9. In a lobby, Rank shows only your editable board and an automatically open Activity panel. There is no Watching panel or chat. Everyone shows every player's independent tiers, including Unranked. Roster buttons navigate to that player's board.
10. Activity timestamps include seconds and retain the most recent 80 events in memory. Item and category names are clickable and use the category colour as text against a contrasting backing. Clicking locates, focuses and temporarily highlights the item or tier on its owner's current board. A moved item is located at its current position. Deleted tiers fall back to the current board, and removed seats report that they are unavailable. Activity scrolling stays in place when reading older entries.
11. Tierlists opens the library without leaving or pausing the lobby. The prominent Return to lobby button restores your live board and view. You can create, import and edit local tierlists while peers continue playing. Live updates never overwrite the local editor. Only Disband lobby for the host or Leave lobby for a guest leaves or disbands the room. Host closure ends the room without navigating a browsing guest away from their local work.
12. Copy tierlist opens a naming dialog and copies only the immutable source from when the lobby began, including its original categories and placements. It never copies a participant’s changed rankings. The saved copy displays Copied from with the host’s name, preserved in portable exports. Individual player boards do not have copy buttons. Export can still back up your own current board.
13. Everyone includes live highest/lowest summaries both by tier alone and by tier plus left-to-right preference. Shared ties are explicit, with additional tied items expandable and vote counts visible. Group image creates complete light/dark PNG exports of all players, current categories and placements, group ratings and the app branding.

## Cover images

Under Images, Choose cover imports a file, or Use an existing image selects a ranked/unranked source image. Use first image restores the automatic library preview. Covers are independent of rankings and do not add an item to the board. They are stored as embedded static PNG/WebP data, at most 256 pixels per edge and 64 KiB of encoded data, regardless of the main image-storage choice.

Covers persist in browser saves, portable files, independent copies and the immutable lobby source. Joining validates and decodes the cover with the other assets. Peer-controlled covers cannot be remote URLs, SVG or oversized data. Old files without a cover continue using their first image.

TierMaker imports copy the approved first-party `og:image` or `twitter:image` cover, including modern `/images/media/hero_images/` paths. It is downloaded through the existing restricted read helper and compressed into the portable tierlist, not uploaded to Catbox. If the cover is unavailable, images still import and a warning says to choose a cover under Images. Foreign/malformed metadata is never a fetch destination.

## Group ratings and images

Each ranked item receives one equally weighted score per eligible player. Unranked is an abstention rather than a last-place vote. Loading/checking seats and incomplete offline transfers are excluded, while completed offline rankings remain included. With T tiers and zero-based tier position t, tier-only preference is `1 - t/(T-1)`, or 0.5 for a one-tier board. Including order gives `1 - (t + (i+0.5)/n)/T`, where i is the zero-based item position and n is the number of items in that tier. The latter keeps all items in a higher tier ahead of every item in a lower tier. Results average each item’s available votes, report the vote count and share ties within a small floating-point tolerance. Sparse votes are not silently treated as a consensus.

Group image snapshots the complete current lobby at the moment it is requested. Any participant can generate it. Both theme versions are generated locally before selection, with the current app theme selected first. The exported PNG includes the tierlist title, every player’s name, their independent category names, all placed/unranked images in their exact order, both sets of highest/lowest results and Tier List on puzzle.seall.dev with the coloured app icon. All tied results are included in the image rather than collapsed. Choosing the opposite theme never changes the site theme or requires regeneration.

Image generation uses embedded raster thumbnails or consented, validated hosted images and the first-party icon. Remote images are fetched into validated blobs before canvas use, preventing canvas tainting and unchecked native URL redirects. There is no screenshot service, uploaded lobby data or third-party font dependency. Output scales to at most 24 million pixels and 30,000 pixels per edge. Exports requiring more than 4× downscaling fail clearly rather than silently omitting players or items. Cancelled jobs release image resources and object URLs. Download filenames include the source name, UTC datetime, Everyone suffix and chosen theme. Clicking the preview opens the same simple image overlay.

## Data and compatibility

`TIER1.` codes remain gzip-compressed UTF-8 JSON encoded as URL-safe base64. They include image data, labels, source ordering, tiers, rankings and optional copied-from attribution. Remote references are accepted only as exact direct HTTPS `files.catbox.moe` raster URLs, or legacy `i.imgur.com` images, with bounded declared dimensions. SVG and all other remote hosts are rejected. Optional embedded thumbnails remain strictly validated local PNG/WebP data. Strict validators check identifiers, names, colours, raster headers/dimensions, image decoding, board conservation and byte budgets. All peer-controlled text renders as text, never HTML.

Tierlists are limited to 16 MiB of expanded JSON, boards to 48 KiB of UTF-8 JSON. Each image must appear exactly once across tiers and Unranked. Existing browser saves and portable codes remain compatible. Internal `Album` API names, IndexedDB store names and DOM identifiers are retained solely for compatibility, not as user-facing terminology.

New locally stored images are re-encoded as WebP at quality 0.82, with a PNG fallback. Full images retain up to 1920 pixels on the longest edge and a 2 MiB embedded-data budget. A separate thumbnail retains up to 256 pixels. Smaller images are not enlarged. Aspect ratio and transparency are preserved, not original metadata or animation. Uploads accept PNG, JPEG, WebP, GIF, AVIF and BMP up to 25 MiB per source file. Detail lost in old thumbnail-only saves requires re-uploading.

## Catbox storage and remote-image security

Both file uploads and TierMaker imports offer Local (embedded) and Catbox (original resolution). Nothing is uploaded unless Catbox is selected. No owner/player account, Client ID, API key, extension or self-hosted upload service is required. A fixed HTTPS multipart POST goes through `https://cors.eu.org/https://catbox.moe/user/api.php`, with `reqtype=fileupload` and `fileToUpload`. No `userhash`, cookies, authentication or original filenames are sent. The relay is used only for uploads, never for image downloads. Peers cannot choose a relay or upload destination.

The selector warns before file selection/import that both operators can access the uploaded files. The relay receives the browser's IP address and may forward identifying request metadata to Catbox. Catbox sees the relay's connection. The app omits cookies and referrers, but cannot control the relay's own forwarding, logging or upstream redirect policy. Do not upload sensitive material. Anyone with a direct link can view an image. Links are not private or a guarantee of permanent hosting. Catbox requires prior approval for commercial hotlinking/CDN use. Its FAQ allows removal of anonymous files after prolonged inactivity. The public relay warns that high request volumes may be blocked. Neither service has an application availability guarantee. If either refuses a request, Local storage remains available.

Static PNG, JPEG and WebP originals are uploaded without local resizing or recompression. JPEGs whose EXIF orientation swaps the decoded dimensions are flattened to full-resolution PNGs so their stored dimensions stay correct. Other supported formats and animated inputs also become a static full-resolution PNG of their first decoded frame. Sources and converted uploads must stay within 25 MiB, an 8,192 pixel edge and 24 million pixels. Each image also gets a separately compressed embedded preview, at most 256 pixels and normally at most 16 KiB of encoded data. Document-derived preview budgets keep large imports bounded. New upload requests are sequential and paced at least 1.5 seconds apart to reduce bursts through the public relay. Completed originals are reused by SHA-256 content hash for 24 hours, up to 2,048 recent entries, including across file/template imports and reloads when local storage is available. Only public Catbox links, dimensions, timestamps and hashes are cached, not credentials, filenames or source bytes. Help → Clear upload cache resets reuse without deleting hosted files. No automatic retries, transport failover, album API, publication endpoint or account registration is used.

Tierlists carry public image URLs, dimensions, labels, small previews and rankings, not full-resolution image bytes. Players can rank from embedded previews without contacting Catbox. Enlargement downloads the original directly from `files.catbox.moe`, subject to consent. Group PNG exports use validated embedded previews where available. Legacy Imgur files remain readable and use their existing thumbnail service. The in-memory download cache is limited to 64 MiB. Hosted files are not self-contained original-quality offline backups.

Before authorizing remote originals when joining or opening a remote tierlist, the warning names the exact approved hosts and explains that downloads reveal the browser's IP address to them. Cancel causes no remote download. Embedded previews can still display because they are already part of the tierlist. Only affirmative approval can save Don't ask me again. The preference can be reset under Help. A new lobby asks again unless it is set. The old Imgur-only preference does not silently authorize the newly supported provider. Selecting upload authorizes that upload, not subsequent downloads.

The complete document is validated before permission or network access. The only accepted remote shapes are `https://files.catbox.moe/<6–16 lowercase alphanumeric characters>.<png|jpg|jpeg|webp>` and legacy `https://i.imgur.com/<5–16 alphanumeric characters>.<png|jpg|jpeg|webp>`. No ports, credentials, alternate hosts, paths, encoded tricks, queries, fragments, SVG, GIF or foreign thumbnails are accepted. Relay responses must contain an approved Catbox URL and are limited to 2 KiB. Upload errors are not automatically retried or treated as successful local saves. Relay/network failures pause the rest of the batch instead of sending every remaining template into the same outage. Retry retains unfinished URLs and reuses confirmed upload links. A failed response cannot prove that the last anonymous upload never reached Catbox.

Image downloads use CORS, `credentials=omit`, `referrerPolicy=no-referrer` and `redirect=error`. Redirects are refused even between approved destinations. Types, byte limits, raster headers, dimensions and decoding are checked before blob-backed display or canvas use. Native image elements never receive raw remote URLs. Full dimensions must match the portable metadata. Legacy provider thumbnails are limited to 2 MiB and 640 pixels. Remote animations are refused. Cancelling a join/import aborts pending consent and downloads. The handshake timeout pauses during consent.

**Anonymous Catbox uploads cannot be deleted by the app.** Cancellation aborts outstanding requests and prevents further files, but an upload may already have reached either operator even if the response is lost. Failed/cancelled imports retain previously completed local tierlists. They do not claim to roll back remote uploads. Explicit retries reuse confirmed uploads, but a request whose response was lost can still create a duplicate. Removing a tierlist or image locally does not remove its hosted file.

Existing private Imgur deletion receipts remain browser-local and are never shared. Help shows Legacy Imgur uploads only when such receipts exist, retaining access to their former deletion controls. New UI uploads do not use Imgur or ask for its Client ID.

## TierMaker imports

Import accepts codes, text files and public HTTPS TierMaker create/category/list URLs. Legacy `/images/chart/chart/` and modern `/images/media/template_images/` assets are supported. There is no fixed image-count cutoff. For local storage, per-image compression budgets are derived from the remaining document budget. Catbox mode uploads original-resolution sources through the public relay, with separately compressed previews, retaining source ordering and rankings. The exact Choose Your Weapon template imports all 18 images. Storage and board byte budgets still apply.

Paste multiple TierMaker URLs with one per line. URLs are validated before fetching and canonical duplicates are imported only once per batch. Templates import sequentially, retaining the existing per-template image-worker bound. Each completed tierlist is saved independently. Batch completion returns to the library, while a single import opens its result. Cancellation or partial failure keeps completed imports and leaves only unfinished/failed URLs ready to retry. Storage failures stop the batch instead of downloading more data. Each URL is limited to 2,048 characters and the whole list to 32,768.

Imports preserve the title, images and source order. Saved lists exposing public ranking data also preserve tier names, colours and placements. Each import creates an independent copy and records the source URL. Nothing is saved until every image succeeds.

TierMaker does not grant this browser origin cross-origin access. `server.py` serves static files plus `/tierlist-import` and `/tierlist-image`. It performs only public, unauthenticated HTTPS reads, forwards no credentials, validates every URL/redirect against exact host/path allowlists and never executes scripts. Responses, concurrency and timeouts are bounded. It is not a general CORS proxy.

**GitHub Pages cannot execute the optional helper.** Production URL imports require separately deployed same-origin HTTPS endpoints with appropriate ingress rate limits. The editor, code imports/exports and iroh multiplayer work as static pages without it.

## Networking

Application envelopes use `app: tierlist`, `v: 4` and a random room capability, separate from UNO. `TL4.` binary invites pack endpoint bytes, relay index and capabilities into normally 91 characters. No discovery service is involved. Older `TL3.`, `TL2.` and `TLOBBY1.` invites are identified but require a refreshed host and a new lobby.

The host binds edits to authenticated connection seats, validates boards and generates structured activity references from those validated changes. Clients cannot claim another event author or inject arbitrary activity references. Increasing board sequence numbers prevent stale/replayed edits. The host remains trusted and can observe or modify room data.

The shared transport limits frames to 64 KiB and outgoing queues to 32 frames. Transfers use sequential, guest-requested 24,000-character chunks. After asset verification, guests request each player's current board individually rather than receiving an unbounded full-room burst. Only then can a seat become Ready and edit. Presence updates are lightweight and host-derived. History is bounded and batched. New roster members and board updates remain live during sync, and stale snapshots cannot replace a newer board.

The limit is 16 seats including host and retained offline players. Reloading guests resume their seat, colour and board using a private per-tab capability. Removing a seat revokes that capability. Heartbeats, timeouts and four bounded reconnect attempts detect failed peers. There is no host migration or persistent room state.

Public iroh relays and connectivity are required for multiplayer. Use shared HTTPS for other devices, since localhost invites work only on the same computer. Browser background throttling, mobile OS suspension and relay availability remain external constraints. No WebRTC fallback, runtime CDN library or game API is used.

## Verification

```sh
python3 tierlist/server.py --port 18764
node --test tests/*.test.mjs
python3 tests/tiermaker-server.test.py
export PLAYWRIGHT_MODULE=/path/to/playwright
export CHROMIUM_PATH=/path/to/chromium
node tests/tierlist-browser.cjs
node tests/tierlist-states.cjs
node tests/tierlist-sort-zoom.cjs
node tests/tiermaker-browser.cjs
node tests/tiermaker-batch.cjs
node tests/tierlist-lobby-v2.cjs
node tests/tierlist-tools.cjs
node tests/tierlist-remote.cjs
node tests/tierlist-cover.cjs
BROWSER=firefox FIREFOX_PATH=/path/to/playwright/firefox node tests/tierlist-cover.cjs
node tests/app-update-browser.cjs
```

The lobby suite uses real relays and isolated browser contexts, including a full 16-seat lobby, a rejected 17th join, simultaneous edits, late join, reconnect, removal and closure. It exercises maximum-length fields, multiline labels, native/touch image ordering, activity links and responsive screenshots in both themes. Overrides are `BASE_URL`, `SCREENSHOT_DIR`, `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`. See `TESTING.md` for observed results and limitations.

The shared service worker caches the editor and modules for offline authoring. WASM loads only when multiplayer starts. Browser saves can be evicted, so export important tierlists. Interface text uses neither em dashes nor semicolons. User-provided labels and external puzzle content are not rewritten.
