# Discord Tier List invite preview

GitHub Pages cannot render dynamic Open Graph tags from the private `#join` fragment. This **separate, stateless** Cloudflare Worker renders a metadata landing page at:

```
https://puzzle-invites.my-account-306.workers.dev/tierlist?owner=PUBLIC_NAME&title=PUBLIC_TITLE#join=PRIVATE_CODE
```

The dedicated Worker was deployed on 2026-11-15 (version `f2b0acc7-36c1-4ef0-97a8-4b89b5c0cbb7`). A live Discordbot-UA fetch verified HTTP 200, the exact synthetic title, no redirect, and the byte-identical bundled PNG in 0.18 seconds combined. Frontend integration also passed a real iroh clipboard/landing/resume flow with 169 HTTP URLs checked and no fragment leakage. This is not proof of Discord's actual rendered card or title-click fragment retention.

Discord is the first supported preview consumer. Its HTTP crawler receives escaped server-rendered `og:title` **Join OWNER in voting on TITLE**, description, site name, type, canonical public URL and a fixed PNG. Bots are never HTTP-redirected. Browsers use a CSP-hashed, fixed script to preserve a structurally valid invite fragment and `location.replace` **only** to `https://puzzle.seall.dev/tierlist/#join=…`. The app decodes and checks the actual invite/protocol. Missing/invalid fragments stay on an accessible page with a fixed-site link; without JavaScript users can paste the complete invite into the app.

## Existing open lobbies and direct-link fallback

An already-open host tab may still copy the old `https://puzzle.seall.dev/tierlist/#join=…` format. Its fragment cannot supply personalized metadata to an HTTP crawler. The app now serves a generic Open Graph fallback for direct links, while personalized cards use the dedicated Worker URL.

Without restarting the host, open **https://puzzle-invites.my-account-306.workers.dev/make**, enter the public owner/title, and paste the existing invite. This static client-only builder creates the same fragment-bearing preview URL as a refreshed client. The private code never appears in the builder's HTTP URL, requests, form submissions, storage or logs. There is deliberately no submitting form; JavaScript and clipboard operations stay local. Share the generated complete URL as a normal link, not Discord's `<angle-bracket>` suppressed-preview format. Discord can cache old blank previews for about 30 minutes, so an older direct URL may remain blank after metadata changes.

## Public/private boundary

- **Owner and tierlist title are intentionally public**, sanitized query metadata visible to Discord, Cloudflare, recipients and any HTTP logs/caches. They are caller-supplied, **not authenticated**, not proof of host identity and not a lobby-liveness check. Anyone can construct these public metadata links. No signatures or room registry exist. The actual app validates the private invite and authenticates peers independently.
- The private code (including endpoint, room and capability) stays **exclusively in the fragment**, which browsers do not send in HTTP requests. It is absent from OG/canonical tags, images, server fetches and application logs. The Worker never reads/reflects a request fragment, fetches upstream, forwards cookies, stores data, or uses telemetry. Cloudflare still sees normal public HTTP request metadata; recipients/Discord receive the full shared link, including its private fragment. Fragments are not a way to hide the invite from its intended recipients or the chat service itself.
- `/tierlist` accepts exactly one `owner` (40 UTF-16 code units maximum) and one `title` (120 maximum), bounded total query length, valid percent/UTF-8 encoding, nonempty normalized Unicode without controls/bidi overrides or unpaired surrogates. HTML-sensitive characters are escaped, not evaluated. Unknown/duplicate keys fail closed. Public output is independent of User-Agent, cookies or request headers.
- `/icon.png` serves only a bundled static copy of `assets/app-icon-512.png`, verified byte-identical by tests. No query keys or remote image URLs are accepted. The site-hosted PNG returned Cloudflare 403 during validation, so the card deliberately does not depend on that origin for its image.
- All routes accept GET/HEAD only. No uploads, generic proxy, storage, bindings, authentication, third-party assets or redirect destinations. No existing TierMaker/crossword Worker, account policy, DNS, routes or billing changes.
- CSP, `no-referrer`, noindex/nofollow/noarchive, nosniff and permissions headers apply. HTML caches for 60 seconds in browsers/300 seconds shared; the static icon caches for one day. Errors are no-store. Discord may cache cards independently.

`TierRoom.invite()` looks up the **host's player record**, never the local guest name, and the source lobby album title. Before guest metadata loads (notably welcome/resume), or if metadata cannot be sanitized, it returns the legacy direct app fragment link. Copy/share and any QR consumers of `invite()` receive the same format; code-only copying is unchanged. Local and alternate-origin lobbies always retain direct links so guests never leave their app origin for production. Existing direct-link and code decoding remains unchanged. No protocol version is hardcoded in the helper/navigation: current and future numeric `TL` versions are passed to the app for validation. Generated preview URLs are capped at 2048 characters (including the fragment); maximum Unicode owner/title and longest supported endpoint are tested. Normalization expansion is bounded, and any future oversized code falls back to a direct link instead of truncation.

### Discord consumer limits

The [official Discord link preview documentation](https://docs.discord.com/developers/link-previews/overview) requires 2xx HTML and fetching within 10 seconds including the image, and excludes URLs longer than 2048 characters. Discord may trim the title to 70 bytes/three lines and description to 350 bytes; the full requested phrase is emitted in **both** fields but long Unicode names/titles may still be visually trimmed by Discord. Discord caches previews for approximately 30 minutes independently of our cache headers. `og:url` is supplied without private data but is not in the documented consumed-tag table. The original shared link includes the private fragment; **fragment retention when clicking Discord's rendered title remains unverified** and needs a real consumer check. The [official Embed Debugger](https://discord.com/developers/embeds) may allow a post-deployment rendering check with synthetic public metadata and no private fragment, if available without new authorization; it has not been used here.

## Integration and deployment — parent only

1. Review/merge these changes with the independently owned protocol update. **Add `/tierlist/invite-preview.mjs` to the service-worker shell assets and bump the shell version** in the integration branch; this child intentionally does not change `sw.js`.
2. Validate locally and dry-run:
   ```sh
   node --test tests/tierlist-invite-preview.test.mjs tests/tierlist.test.mjs tests/tierlist-latency.test.mjs tests/tierlist-assets.test.mjs
   WRANGLER_SEND_METRICS=false wrangler deploy --config tierlist/invite-worker/wrangler.toml --dry-run --outdir /tmp/puzzle-invites-dry-run
   ```
3. Parent publishes **only this new Worker**, before publishing the app's new share-link generation. Confirm the configured owned account and dedicated workers.dev hostname; do not repurpose another Worker or change policies/routes/DNS. No secrets or bindings are needed:
   ```sh
   WRANGLER_SEND_METRICS=false wrangler deploy --config tierlist/invite-worker/wrangler.toml
   ```
   This is a proposed parent command, **not executed by the child**. If the hostname cannot be used, stop for approval rather than silently selecting a new architecture.
4. Fetch a synthetic public-only URL using a Discordbot User-Agent, without an actual invite code, and check exact OG title, canonical URL without fragment, HTTP 200/no Location, headers and image:
   ```sh
   curl -A 'Discordbot/2.0' 'https://puzzle-invites.my-account-306.workers.dev/tierlist?owner=Preview%20Tester&title=Sample%20Tierlist'
   curl --fail -I 'https://puzzle-invites.my-account-306.workers.dev/icon.png'
   ```
   Check image bytes/dimensions, production image availability and combined HTML/image fetch time under Discord's 10-second limit. Never put a real invite in curl/HTTP queries, command logs or screenshots.
5. Publish the app with the SW update. A real browser must copy a new live lobby link, follow it through the Worker and join the same host/room. Check HTTP requests/Referer contain no private code. Retest guest re-sharing and resume.
6. **Actual Discord unfurl remains unverified.** No authorized channel was supplied; no Discord messages were sent and no bot token was accessed. Bot-UA/OG validation is not an actual Discord UI unfurl. A user-provided authorized test channel is needed for that final check after deployment.

Rollback: revert the app's `inviteLink` integration (and corresponding SW module entry/version as appropriate) so new shares use direct fragment links. Keep the dedicated Worker alive to preserve already-shared preview links; it has no state to migrate. For a faulty Worker release, parent can roll back its own version with Cloudflare tooling. Removing the Worker breaks previously shared landing links, although their fragment codes can still be pasted into the app. Do not alter other Workers.

## Reproducible local browser validation

```sh
python3 tierlist/server.py --port 18771
WRANGLER_SEND_METRICS=false wrangler dev --config tierlist/invite-worker/wrangler.toml --local --ip 127.0.0.1 --port 18772
PLAYWRIGHT_MODULE=/home/n/.cache/uv/archive-v0/S_0dpj2EZIGsC4tY3Gxn0/playwright/driver/package node tests/tierlist-invite-preview-browser.cjs
```

The Playwright harness maps only the declared app/Worker origins to those local servers. Real iroh relays connect isolated host/guest browsers. Other HTTP origins are blocked. It verifies real clipboard sharing, existing-lobby navigation, guest shares using the host's name, welcome-time direct resume fallback, seat reconnect, exact Unicode/escaped DOM/Discordbot OG, candidate image bytes, CSP script execution, malicious/duplicate/missing fragments, invalid query fallback, responsive long-text wrapping and all observed HTTP URLs/Referers. The cross-origin landing performs a full document navigation: browser harnesses must wait for the fixed app URL and instrument `TierRoom` **after** that navigation, before clicking Join. Initial guest-page instrumentation is lost, which must not be mistaken for a runtime join failure. Existing local harnesses remain isolated through the direct-link fallback; production regressions need an appropriate post-navigation hook. Private values are kept only in process memory and are not written to the JSON report or screenshots. Evidence is emitted under `/tmp/tierlist-invite-preview/`. The landing surface uses a fixed light palette, semantic HTML and a keyboard-visible link; there is no new app UI or theme state.
