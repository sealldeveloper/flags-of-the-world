# Restricted TierMaker read Worker

GitHub Pages cannot execute the local Python helper. This separate Worker supplies `/tierlist-import?url=…` and `/tierlist-image?url=…` for the production editor. It never uploads to Catbox and does not alter the crossword Worker.

Only `https://puzzle.seall.dev` may read or preflight. There are no write routes, credentials, account sessions, arbitrary fetch targets or script evaluation. Pages are limited to exact HTTPS TierMaker create/category/list paths. Image reads are limited to first-party template/hero asset paths. The internal templates-v2 API request is constructed from validated page data, not caller-selected API parameters. Redirects are manually checked against the same URL policy before following.

Pages/API replies are bounded to 2 MiB, images to 10 MiB and the whole request to 45 seconds. Origin, query, method, MIME and body-size validation fail closed. Errors for the production origin include CORS. The Cloudflare binding permits approximately 600 requests per minute per connecting IP per location. CORS is not authentication and non-browser callers can forge Origin. The fixed target/path limits and rate limiter reduce abuse, not eliminate it.

No data or credentials are stored. Application logging is disabled. Cloudflare and TierMaker can still see their network requests. Only public data is supported. Provider restrictions, Cloudflare platform limits and remote format changes remain external constraints.

```sh
node --test tests/tiermaker-worker.test.mjs
wrangler deploy --config tierlist/tiermaker-worker/wrangler.toml --dry-run
wrangler deploy --config tierlist/tiermaker-worker/wrangler.toml
```

Check that the dedicated Worker name is unused before the first deployment. Use the returned deployment URL in the production client only after a real manifest/image import succeeds. Other origins keep using the local same-origin helper. Do not change account billing, DNS or the existing crossword Worker.
