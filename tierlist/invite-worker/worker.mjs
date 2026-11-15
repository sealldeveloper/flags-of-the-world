import {INVITE_PREVIEW, previewText} from '../invite-preview.mjs';
import {ICON} from './icon.mjs';
import {BUILDER_SCRIPT,BUILDER_BODY} from './builder.mjs';

const SITE = 'https://puzzle.seall.dev/tierlist/';
const IMAGE = new URL('/icon.png', INVITE_PREVIEW).href;
// Static script: no public metadata or HTTP URL is ever used as a destination.
// The app remains responsible for decoding/version-checking the private code.
const LANDING_SCRIPT = `(() => {
  const fragment = location.hash;
  if (fragment.length > 5010 || !/^#join=(?:TL[1-9][0-9]*\\.|TLOBBY1\\.)[A-Za-z0-9_-]+$/.test(fragment)) return;
  const destination = 'https://puzzle.seall.dev/tierlist/' + fragment;
  document.getElementById('continue').href = destination;
  location.replace(destination);
})();`;
const escapeHTML = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function metadata(url) {
  if (url.search.length > 2400) return null;
  // URLSearchParams otherwise silently repairs malformed percent escapes/UTF-8.
  try { decodeURIComponent(url.search.replaceAll('+', ' ')); } catch { return null; }
  const params = url.searchParams;
  if ([...params.keys()].length !== 2 || params.getAll('owner').length !== 1 || params.getAll('title').length !== 1) return null;
  const owner = previewText(params.get('owner'), 40), title = previewText(params.get('title'), 120);
  if (!owner || !title) return null;
  const canonical = new URL(INVITE_PREVIEW);
  canonical.search = new URLSearchParams({owner, title});
  return {heading:`Join ${owner} in voting on ${title}`, canonical:canonical.href};
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const builder=url.pathname==='/make' && !url.search;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(builder?BUILDER_SCRIPT:LANDING_SCRIPT));
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    const headers = {
      'Content-Type':'text/html; charset=utf-8',
      'Content-Security-Policy':`default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff',
      'X-Robots-Tag':'noindex, nofollow, noarchive',
      'Cache-Control':'public, max-age=60, s-maxage=300',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
    };
    if (['GET','HEAD'].includes(request.method) && url.pathname === '/icon.png' && !url.search) {
      return new Response(request.method === 'HEAD' ? null : ICON, {headers:{...headers,'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});
    }
    let status = 200, data = null;
    if (!['GET','HEAD'].includes(request.method)) { status = 405; headers.Allow = 'GET, HEAD'; }
    else if (url.pathname === '/make') {
      if(url.search)status=400;
      else {
        const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Make a Discord lobby invite</title><style>:root{font-family:system-ui,sans-serif;color:#182133;background:#f5f7fb}*{box-sizing:border-box}body{max-width:42rem;margin:2rem auto;padding:0 1.25rem;line-height:1.5}h1{font-size:1.5rem}label{display:block;font-weight:600;margin:1rem 0 .35rem}input,textarea{display:block;width:100%;font:inherit;padding:.65rem;border:1px solid #bcc8d8;border-radius:4px;background:#fff;color:#182133}button{font:inherit;min-height:40px;margin-top:1rem;padding:.5rem .8rem;border:1px solid #1769aa;border-radius:4px;background:#1769aa;color:#fff;cursor:pointer}a{color:#1769aa}button:focus-visible,input:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #1769aa;outline-offset:3px}#error{color:#b42318}p{overflow-wrap:anywhere}[hidden]{display:none!important}</style></head><body>${BUILDER_BODY}<script>${BUILDER_SCRIPT}</script></body></html>`;
        return new Response(request.method==='HEAD'?null:html,{headers});
      }
    }
    else if (url.pathname === '/icon.png') status = 400;
    else if (url.pathname !== '/tierlist') status = 404;
    else { data = metadata(url); if (!data) status = 400; }
    if (status !== 200) headers['Cache-Control'] = 'no-store';
    const heading = escapeHTML(data?.heading || 'Tier List invite unavailable');
    const description = escapeHTML(data?.heading || 'Open the full invite link shared by the host to join a live Tier List lobby.');
    const og = data ? `<meta property="og:title" content="${heading}">
<meta property="og:description" content="${description}">
<meta property="og:site_name" content="Puzzle · Tier List">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHTML(data.canonical)}">
<meta property="og:image" content="${IMAGE}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:image:alt" content="Puzzle app icon">` : '';
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex, nofollow, noarchive">
<title>${heading}</title>
${og}
<style>:root{font-family:system-ui,sans-serif;color:#202124;background:#fff}body{max-width:42rem;margin:3rem auto;padding:0 1.5rem;line-height:1.6;overflow-wrap:anywhere}h1{font-size:1.5rem;line-height:1.3}a{color:#174ea6;display:inline-block;padding:.5rem 0}a:focus-visible{outline:3px solid #174ea6;outline-offset:4px}</style>
</head><body><main><h1>${heading}</h1>
<p>Use the complete invite link shared by the host to join their lobby. If you are not taken there automatically, ask the host for a new link.</p>
<p><a id="continue" href="${SITE}" rel="noreferrer">Open Tier List</a></p>
<p><a href="/make" rel="noreferrer">Make a Discord preview from an existing invite</a></p>
<noscript><p>JavaScript is needed to join the lobby. Open Tier List and paste the complete invite link into Join lobby.</p></noscript>
</main>${data ? `<script>${LANDING_SCRIPT}</script>` : ''}</body></html>`;
    return new Response(request.method === 'HEAD' ? null : html, {status, headers});
  }
};
