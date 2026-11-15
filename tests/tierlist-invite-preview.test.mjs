import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {inviteLink, INVITE_PREVIEW, previewText} from '../tierlist/invite-preview.mjs';
import {encodeInvite, decodeInvite} from '../tierlist/invite.mjs';
import {TierRoom} from '../tierlist/room.mjs';
import worker from '../tierlist/invite-worker/worker.mjs';
const ticket = {host:'a'.repeat(64), relay:'https://use1-1.relay.n0.iroh.link./', room:'b'.repeat(32), secret:'c'.repeat(32)};
const code = encodeInvite(ticket);
const link = (owner='Zoë & 李',title='Cats < Dogs "🐈"') => inviteLink({code, owner, title, direct:'https://puzzle.seall.dev/tierlist/'});
const request = (url, options={}) => worker.fetch(new Request(url, options));

test('inviteLink publishes only owner/title; private capability remains fragment-only and old decoding works', () => {
  const url = new URL(link());
  assert.equal(url.origin + url.pathname, INVITE_PREVIEW);
  assert.deepEqual([...url.searchParams], [['owner','Zoë & 李'],['title','Cats < Dogs "🐈"']]);
  assert.equal(url.hash, `#join=${code}`);
  assert.deepEqual(decodeInvite(url.href), decodeInvite(code));
  assert.deepEqual(decodeInvite(`https://puzzle.seall.dev/tierlist/#join=${code}`), decodeInvite(code));
  assert(!url.search.includes(code));
});

test('TierRoom uses actual host, source album title, and safe direct fallback during guest welcome/resume', () => {
  const oldLocation=globalThis.location;globalThis.location={origin:'https://puzzle.seall.dev',pathname:'/tierlist/'};
  try {
    const room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});
    Object.assign(room,{ticket,name:'Guest',hostId:'host',self:'guest'});
    assert.equal(room.invite(),`https://puzzle.seall.dev/tierlist/#join=${code}`);
    room.album={name:'Source album'};
    assert.equal(new URL(room.invite()).origin,'https://puzzle.seall.dev');
    room.players.set('guest',{name:'Guest'});room.players.set('host',{name:'Actual host'});
    const url=new URL(room.invite());
    assert.equal(url.searchParams.get('owner'),'Actual host');assert.equal(url.searchParams.get('title'),'Source album');
    room.isHost=true;room.name='Unrelated local value';
    assert.equal(new URL(room.invite()).searchParams.get('owner'),'Actual host');
    for(const protocol of [5,6]){room.protocol=protocol;const shared=new URL(room.invite());assert(shared.hash.startsWith(`#join=TL${protocol}.`));assert.equal(decodeInvite(shared.href).protocol,protocol);}
  } finally { if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation; }
});

test('bounded Unicode sanitization normalizes names without enabling HTML/script injection', async () => {
  assert.equal(previewText('  Jose\u0301  李  ',40),'José 李');
  for(const value of ['',null,{},'a'.repeat(41),'x\n<script>','x\u202ey','\ud800']) assert.equal(previewText(value,40),null);
  const response=await request(link('A </script><script> & "',"<img src=x onerror='evil'> 🐈"));
  const html=await response.text();assert.equal(response.status,200);
  assert(html.includes('Join A &lt;/script&gt;&lt;script&gt; &amp; &quot; in voting on &lt;img src=x onerror=&#39;evil&#39;&gt; 🐈'));
  assert.equal((html.match(/<script>/g)||[]).length,1);
  assert(!html.includes('<img src=x'));assert(!html.includes(code));
});

test('Discordbot receives deterministic readable OG without redirect, cookies or private URL', async () => {
  const [bot,browser]=await Promise.all([request(link(),{headers:{'User-Agent':'Discordbot/2.0',Cookie:'private=hidden'}}),request(link())]);
  assert.equal(bot.status,200);assert.equal(bot.headers.get('location'),null);assert.equal(bot.headers.get('set-cookie'),null);
  const html=await bot.text();assert.equal(html,await browser.text());
  assert(html.includes('property="og:title" content="Join Zoë &amp; 李 in voting on Cats &lt; Dogs &quot;🐈&quot;"'));
  assert(html.includes(new URL('/icon.png', INVITE_PREVIEW).href));
  const canonical=html.match(/property="og:url" content="([^"]+)"/)[1];assert(!canonical.includes('#'));assert(!canonical.includes(code));
  for(const value of [ticket.host,ticket.room,ticket.secret,code,'private=hidden'])assert(!html.includes(value));
  assert.equal(bot.headers.get('Referrer-Policy'),'no-referrer');assert.match(bot.headers.get('X-Robots-Tag'),/noindex/);
  const hash=createHash('sha256').update(html.match(/<script>([\s\S]+)<\/script>/)[1]).digest('base64');
  assert(bot.headers.get('Content-Security-Policy').includes(`script-src 'sha256-${hash}'`));
  assert.match(bot.headers.get('Cache-Control'),/max-age=60/);
  const head=await request(link(),{method:'HEAD'});assert.equal(await head.text(),'');assert.deepEqual([...head.headers],[...browser.headers]);
});

test('unknown/duplicate/malformed/oversized queries and unsupported methods fail closed', async () => {
  const queries=['','owner=A','owner=A&title=B&owner=C','owner=A&title=B&title=C','owner=A&title=B&join=secret','owner=A&title=B&url=https://evil.test','owner=A&title=%','owner=A&title=%C0%AF','owner=A&title=%ED%A0%80','owner=A&title=%00','owner=%E2%80%AE&title=B',`owner=${'a'.repeat(41)}&title=B`,`owner=A&title=${'b'.repeat(121)}`,`owner=A&title=${'b'.repeat(2401)}`];
  for(const query of queries){const r=await request(`${INVITE_PREVIEW}?${query}`);assert.equal(r.status,400,query);const html=await r.text();assert(!html.includes('property="og:'));assert(!html.includes('<script>'));assert(!html.includes('evil.test'));assert.equal(r.headers.get('Cache-Control'),'no-store');}
  assert.equal((await request(INVITE_PREVIEW.replace('/tierlist','/elsewhere'))).status,404);
  for(const method of ['POST','PUT','OPTIONS','DELETE']){const r=await request(link(),{method});assert.equal(r.status,405);assert.equal(r.headers.get('Allow'),'GET, HEAD');}
});

test('static navigation accepts only a bounded invite fragment and fixed destination, including future protocol codes', async () => {
  const html=await (await request(link())).text(),script=html.match(/<script>([\s\S]+)<\/script>/)[1];
  const run = hash => {
    const navigations=[],anchor={href:'https://puzzle.seall.dev/tierlist/'};
    const location={hash,replace:destination=>navigations.push(destination)};
    new Function('location','document',script)(location,{getElementById:()=>anchor});
    return {navigations,anchor};
  };
  for(const fragment of [`#join=${code}`,'#join=TL99.abc_DEF-123','#join=TLOBBY1.abcd']){
    const {navigations,anchor}=run(fragment);assert.deepEqual(navigations,[`https://puzzle.seall.dev/tierlist/${fragment}`]);assert.equal(anchor.href,navigations[0]);
  }
  for(const fragment of ['', '#join=javascript:alert(1)', '#join=https://evil.test', `#join=${code}&url=https://evil.test`,`#join=${code}&join=${code}`,`#join=${code}%0a`,`#join=TL99.${'x'.repeat(5000)}`,'#join=//evil.test','#url=https://evil.test']){
    const {navigations,anchor}=run(fragment);assert.deepEqual(navigations,[]);assert.equal(anchor.href,'https://puzzle.seall.dev/tierlist/');
  }
});

test('fixed Worker image is byte-identical to the public app icon, GET/HEAD only, with no query inputs', async () => {
  const url=new URL('/icon.png',INVITE_PREVIEW).href;
  const response=await request(url),expected=await readFile(new URL('../assets/app-icon-512.png',import.meta.url));
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(response.headers.get('Cache-Control'),'public, max-age=86400');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);
  const head=await request(url,{method:'HEAD'});assert.equal(await head.text(),'');assert.deepEqual([...head.headers],[...response.headers]);
  assert.equal((await request(url+'?url=https://evil.test')).status,400);
  assert.equal((await request(url+'?owner=A&title=B')).status,400);
  assert.equal((await request(url,{method:'POST'})).status,405);
});

test('maximum Unicode metadata and longest supported endpoint stay within Discord URL bounds', () => {
  const longestCode=encodeInvite({...ticket,host:'z'.repeat(64)});
  for(const [owner,title]of [['李'.repeat(40),'猫'.repeat(120)],['🐈'.repeat(20),'🐈'.repeat(60)],['\u0344'.repeat(20),'\u0344'.repeat(60)]]){
    const url=new URL(inviteLink({code:longestCode,owner,title,direct:'https://puzzle.seall.dev/tierlist/'}));
    assert.equal(url.origin,new URL(INVITE_PREVIEW).origin);assert(url.href.length<=2048);assert.equal(url.hash,`#join=${longestCode}`);
  }
  assert.equal(previewText('\u0344'.repeat(40),40),null,'NFC expansion is bounded after normalization');
  const oversized=inviteLink({code:'x'.repeat(2048),owner:'Owner',title:'Title',direct:'https://puzzle.seall.dev/tierlist/'});
  assert.equal(new URL(oversized).origin,'https://puzzle.seall.dev','future oversized codes safely fall back, never truncate');
});

test('local and alternate-origin lobbies remain isolated with legacy direct fragment links', () => {
  for(const direct of ['http://127.0.0.1:18771/tierlist/','http://localhost:18771/tierlist/','https://example.test/tierlist/']){
    assert.equal(inviteLink({code,owner:'Owner',title:'Title',direct}),`${direct}#join=${code}`);
  }
});
