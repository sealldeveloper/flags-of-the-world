import {INVITE_PREVIEW} from '../invite-preview.mjs';
// This static page processes the capability only in browser memory, never HTTP/storage.
export const BUILDER_SCRIPT = String.raw`(() => {
  const get = id => document.getElementById(id);
  const clean = (value, max) => {
    if (!value || value.length > max || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) return null;
    try { encodeURIComponent(value); } catch { return null; }
    const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
    return text && text.length <= max ? text : null;
  };
  const generate = () => {
    get('error').textContent = ''; get('result').hidden = true; get('output').value = '';
    const owner = clean(get('owner').value, 40), title = clean(get('title').value, 120);
    if (!owner || !title) { get('error').textContent = 'Enter a name up to 40 characters and a tierlist name up to 120 characters.'; return; }
    let code = get('invite').value.trim();
    if (code.length > 5000) { get('error').textContent = 'The invite is too long.'; return; }
    if (code.includes('#')) code = code.slice(code.indexOf('#') + 1);
    if (code.startsWith('join=')) code = code.slice(5);
    if (!/^(?:TL[1-9][0-9]*\.|TLOBBY1\.)[A-Za-z0-9_-]+$/.test(code)) { get('error').textContent = 'Paste the complete Tier List invite link or code.'; return; }
    const url = new URL(${JSON.stringify(INVITE_PREVIEW)});
    url.search = new URLSearchParams({owner, title}); url.hash = 'join=' + code;
    if (url.href.length > 2048) { get('error').textContent = 'This link is too long for Discord. Shorten the public name or tierlist name.'; return; }
    get('output').value = url.href; get('result').hidden = false; get('copy').textContent = 'Copy complete invite'; get('copy').focus();
  };
  get('generate').addEventListener('click', generate);
  for (const id of ['owner','title','invite']) get(id).addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); generate(); } });
  get('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(get('output').value); get('copy').textContent = 'Copied'; }
    catch { get('output').focus(); get('output').select(); get('error').textContent = 'Select and copy the complete link below.'; }
  });
})();`;
export const BUILDER_BODY = `<main><h1>Make a Discord lobby invite</h1>
<p>Keep the host tab and lobby open. Paste the existing invite to make a preview link without resetting the lobby.</p>
<p>The private join code stays in this browser and in the final link’s fragment. The owner and tierlist names are public preview text.</p>
<label for="owner">Lobby owner name</label><input id="owner" maxlength="40" autocomplete="off" spellcheck="false">
<label for="title">Tierlist name</label><input id="title" maxlength="120" autocomplete="off" spellcheck="false">
<label for="invite">Existing invite link or code</label><textarea id="invite" rows="3" maxlength="5000" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
<button id="generate" type="button">Make Discord invite</button><p id="error" role="alert"></p>
<section id="result" hidden><label for="output">Complete private invite</label><input id="output" readonly autocomplete="off" spellcheck="false"><button id="copy" type="button">Copy complete invite</button><p>Post this as a normal link in Discord, not wrapped in angle brackets. Discord may cache previews for about 30 minutes.</p></section>
<noscript><p>JavaScript must be enabled. Nothing is sent when you type or paste into this page.</p></noscript>
<p><a href="https://puzzle.seall.dev/tierlist/" rel="noreferrer">Open Tier List</a></p></main>`;
