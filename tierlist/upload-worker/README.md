# Catbox upload Worker

A deliberately narrow upload gateway, not a general CORS proxy. It forwards one anonymous static image to `https://catbox.moe/user/api.php` and returns only a validated `https://files.catbox.moe/…` image URL.

## Policy

- Only `Origin: https://puzzle.seall.dev` may upload or preflight. Localhost, `127.0.0.1`, missing/null origins, alternate ports and lookalike domains are refused.
- `POST /upload` accepts exactly `reqtype=fileupload` and one `fileToUpload` file. URLs, userhashes, account operations, duplicate fields, other methods, paths and query parameters are refused.
- Static PNG, JPEG and WebP files are limited to 25 MiB, 8,192 pixels per edge and 24 million pixels. Raster headers must be recognizable within the first 1 MiB. The client converts other supported formats before upload.
- The complete multipart request is bounded to the image limit plus 64 KiB of overhead, including when Content-Length is missing. Incoming uploads time out after 45 seconds and the Catbox request after another 30 seconds.
- Incoming cookies, authorization, Origin, referrer, custom upstream headers and original filenames are not forwarded. The outgoing form and headers are constructed afresh. Cloudflare can still attach its own network metadata.
- Catbox redirects are never followed. Replies are bounded to 2 KiB and validated before being returned. Catbox refusals, invalid responses and Worker-handled errors include CORS headers for the allowed origin.
- The rate-limit binding applies an approximate 120 requests per minute per connecting IP, per Cloudflare location. It fails closed if the binding is unavailable. This is not a strict global quota.
- `GET /health` exposes only a static service identifier and liveness status. It does not contact Catbox.
- No upload bytes, credentials or receipts are stored by this Worker. Application request logging is disabled. Cloudflare and Catbox still operate their own infrastructure and policies.

**CORS is not authentication.** A non-browser client can forge Origin. The fixed target, field restrictions, size bounds and rate limiter reduce abuse, but a public anonymous upload service is not abuse-proof. Consider additional Cloudflare controls before advertising the endpoint broadly. Do not upload sensitive material. Anonymous Catbox uploads cannot be deleted and an interrupted response can leave an unknown upload.

The Worker removes dependence on `cors.eu.org`, not Catbox's own limits or restrictions. Catbox can reject Cloudflare's outgoing network. Cloudflare platform errors and account quotas can also occur before Worker code can add CORS headers. A successful live browser upload must be observed before treating the integration as working.

## Deploy

Use the existing account in `wrangler.toml`. No Catbox API key or account is required. The deployment owner needs a valid Wrangler login.

```sh
wrangler whoami
# If the saved OAuth grant has expired
wrangler login

wrangler deploy --config tierlist/upload-worker/wrangler.toml --dry-run
wrangler deploy --config tierlist/upload-worker/wrangler.toml
```

Before the first deployment, check that `puzzle-tierlist-catbox` is not an unrelated existing Worker. Do not modify the crossword Worker, DNS, site routes, account plan or billing configuration.

Point the client at the deployed `/upload` URL only after testing from the real `https://puzzle.seall.dev` origin. Local preview uploads are intentionally forbidden. Tests may mock the upload response, but that is not a live-origin acceptance test.

```sh
node --test tests/tierlist-upload-worker.test.mjs
```

GitHub Pages cannot execute `tierlist/server.py`. This Catbox-only Worker intentionally does not implement the separate TierMaker page/image read helper. Publishing the static editor does not, by itself, enable production TierMaker URL imports.
