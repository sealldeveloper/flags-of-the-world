# Restricted public-source read Worker

GitHub Pages cannot execute the local Python/Node preview helpers. The existing `puzzle-tierlist-tiermaker` Worker provides production reads for TierMaker, public YouTube playlists and Spotify albums. Images/cards are embedded locally in the browser. No image hosting, upload API, user account service or persistent source store is provided. The crossword Worker is unchanged.

## Routes

Only `https://puzzle.seall.dev` may read or preflight. Client routes accept GET and OPTIONS only:

- `/tierlist-import?url=…`: exact public HTTPS TierMaker create/category/list paths, with an internally constructed templates-v2 API read
- `/tierlist-image?url=…`: first-party TierMaker template/hero asset paths
- `/media-import?url=…`: a public YouTube playlist or Spotify album URL
- `/media-import?url=…&cursor=…&version=…`: one validated YouTube continuation page
- `/media-image?url=…`: fixed YouTube thumbnail variants or Spotify artwork paths

Each query key must occur once. Unknown keys, destinations, methods, credentials and private routes fail before fetching. Source tracking parameters are discarded. TierMaker redirects are revalidated against its existing policy. Collection/artwork redirects are refused. YouTube thumbnail variants fall back only when missing with HTTP 404, not after a block or sign-in requirement.

The YouTube reader parses the public page's JSON as data, including legacy/video view-model layouts. Playlist continuation is scoped to the video list, not its unrelated recommendations. Another page is read through one fixed anonymous `https://www.youtube.com/youtubei/v1/browse` POST using public client-version/continuation metadata. Its body cannot select another endpoint, edit a playlist, upload or act on an account. Spotify parses the public album embed track list and artwork. Cookies, access tokens, visitor identifiers, arbitrary request headers and audio/video URLs are never forwarded to clients or used for playback. No page script is evaluated and no login/browser checks are bypassed.

## Bounds and privacy

TierMaker pages/API replies are limited to 2 MiB. Collection pages are limited to 8 MiB and each continuation is a separate bounded request. Images are limited to 25 MiB. Every request has a 45-second deadline. The client bounds collections to 500 entries and the normal 128 MiB tierlist limit. Source count/pagination failures never become silently truncated successful imports.

Origin, query, method, MIME, redirect and body validation fail closed. Errors for the production origin include CORS. The existing Cloudflare binding permits approximately 600 requests per minute per connecting IP/location, shared across reads. CORS is not authentication and non-browser callers can forge Origin. The fixed destination/path limits and rate protection reduce abuse, not eliminate it.

No imported images, manifests or credentials are persisted by the application. Cloudflare manages temporary rate counters. Application logging is disabled, but Cloudflare and the source providers can see their network requests. Only public data is supported. Provider restrictions, remote format changes, rate limits and Cloudflare platform limits remain external constraints.

```sh
node --test tests/tiermaker-worker.test.mjs tests/tierlist-media.test.mjs
wrangler deploy --config tierlist/tiermaker-worker/wrangler.toml --dry-run
wrangler deploy --config tierlist/tiermaker-worker/wrangler.toml
```

Use the existing dedicated Worker/account and verify real metadata, pagination and images after deployment. Other origins retain the same-origin local helper. Do not change billing, DNS, account plans or the crossword Worker.
