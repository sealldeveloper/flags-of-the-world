// Real iroh host/guest; candidate Worker and app emulate their declared public origins locally.
// No invite URLs or private codes are printed or persisted in evidence.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const app=process.env.BASE_URL || 'http://127.0.0.1:18771',worker=process.env.INVITE_WORKER_URL || 'http://127.0.0.1:18772';
const site='https://puzzle.seall.dev',out=process.env.EVIDENCE_DIR || '/tmp/tierlist-invite-preview';
(async()=>{
 const {INVITE_PREVIEW}=await import('../tierlist/invite-preview.mjs');
 const previewOrigin=new URL(INVITE_PREVIEW).origin;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'});
 fs.mkdirSync(out,{recursive:true});const errors=[],requests=[],blocked=[],snapshots=[];
 try {
  async function context(options={}){
   const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900},...options});
   await ctx.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!['http:','https:'].includes(url.protocol))return route.continue();
    requests.push({url:req.url(),referer:req.headers().referer || ''});
    if(url.origin===site || url.origin===previewOrigin){
     const response=await route.fetch({url:(url.origin===site?app:worker)+url.pathname+url.search});
     return route.fulfill({response});
    }
    if(/^https:\/\/(?:use1-1|usw1-1|euc1-1|aps1-1)\.relay\.n0\.iroh\.link\.?\//.test(req.url()))return route.continue();
    blocked.push(url.origin);return route.abort();
   });
   ctx.on('page',p=>{p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(e.message));});
   return ctx;
  }
  async function instrument(p){await p.evaluate(async()=>{const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;TierRoom.prototype.emit=function(){window.testRoom=this;emit.call(this);};});}
  const hostCtx=await context({permissions:['clipboard-read','clipboard-write']}),host=await hostCtx.newPage();
  await host.goto(site+'/tierlist/');
  const owner='Zoë & 李 <host>',title='Cats < Dogs "🐈"';
  await host.evaluate(async title=>{const {emptyAlbum}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');const album=emptyAlbum(),canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);album.name=title;album.images=[{id:'image',label:'Local test image',data:canvas.toDataURL('image/png')}];album.board.unranked=['image'];await saveAlbum(album);},title);
  await host.reload();await instrument(host);await host.getByRole('button',{name:'Open',exact:true}).click();await host.locator('#host').click();await host.locator('#host-name').fill(owner);await host.locator('#host-form button[type=submit]').click();await host.waitForFunction(()=>window.testRoom?.connected);
  await host.locator('#copy-invite').click();const invite=await host.evaluate(()=>navigator.clipboard.readText()),parsed=new URL(invite),code=parsed.hash.slice(6);
  assert.equal(parsed.origin,previewOrigin);assert.equal(parsed.searchParams.get('owner'),owner);assert.equal(parsed.searchParams.get('title'),title);
  const secrets=await host.evaluate(()=>[window.testRoom.ticket.host,window.testRoom.ticket.room,window.testRoom.ticket.secret]);
  // Existing host tabs can convert a direct link without restarting the lobby.
  const maker=await hostCtx.newPage();await maker.goto(previewOrigin+'/make');
  await maker.locator('#owner').fill(owner);await maker.locator('#title').fill(title);await maker.locator('#invite').fill(site+'/tierlist/#join='+code);await maker.locator('#generate').click();
  assert((await maker.locator('#output').inputValue())===invite,'builder preserves complete invite');await maker.locator('#copy').click();await maker.getByRole('button',{name:'Copied',exact:true}).waitFor();assert((await maker.evaluate(()=>navigator.clipboard.readText()))===invite,'builder copies the same fragment-only link');assert(await host.evaluate(()=>window.testRoom.connected));
  // Redact private fields only for UI captures; never persist real capability screenshots.
  await maker.locator('#invite').fill('');await maker.locator('#output').evaluate(node=>node.type='password');
  for(const [width,height]of [[1440,900],[1024,768],[390,844]]){await maker.setViewportSize({width,height});assert(await maker.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const capture=`${out}/builder-${width}-redacted.png`;await maker.screenshot({path:capture});snapshots.push(capture);}await maker.close();
  // Crawler-like browser: scripts disabled, exact HTML metadata available without a redirect.
  const botCtx=await context({javaScriptEnabled:false,userAgent:'Discordbot/2.0'}),bot=await botCtx.newPage();
  const response=await bot.goto(invite);assert.equal(response.status(),200);assert.equal(new URL(bot.url()).origin,previewOrigin);
  assert.equal(await bot.locator('meta[property="og:title"]').getAttribute('content'),`Join ${owner} in voting on ${title}`);
  assert.equal(await bot.locator('meta[property="og:description"]').getAttribute('content'),`Join ${owner} in voting on ${title}`);
  const canonical=await bot.locator('meta[property="og:url"]').getAttribute('content');assert(!canonical.includes('#'));assert(!canonical.includes(code));
  const image=await bot.locator('meta[property="og:image"]').getAttribute('content');assert.equal(image,previewOrigin+'/icon.png');
  const imagePage=await botCtx.newPage(),imageResponse=await imagePage.goto(image);
  assert.equal(imageResponse.status(),200);assert.equal(imageResponse.headers()['content-type'],'image/png');
  assert.deepEqual(await imageResponse.body(),fs.readFileSync(path.join(__dirname,'../assets/app-icon-512.png')));await imagePage.close();
  assert(!(await response.text()).includes(code));
  const directBot=await botCtx.newPage();await directBot.goto(site+'/tierlist/#join='+code);assert.equal(await directBot.locator('meta[property="og:title"]').getAttribute('content'),'Join a Tier List lobby');await directBot.close();
  for(const [width,height]of [[1440,900],[1024,768],[390,844]]){
   await bot.setViewportSize({width,height});await bot.locator('#continue').focus();
   assert(await bot.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const path=`${out}/fallback-${width}.png`;await bot.screenshot({path});snapshots.push(path);
  }
  const guestCtx=await context({permissions:['clipboard-read','clipboard-write']}),guest=await guestCtx.newPage();
  await guest.goto(invite);await guest.waitForURL(site+'/tierlist/#join=*');await instrument(guest);
  await guest.locator('#join-name').fill('Guest, not owner');await guest.locator('#confirm-join').click();await guest.waitForFunction(()=>window.testRoom?.connected);
  assert.equal(await guest.evaluate(()=>window.testRoom.ticket.room),secrets[1]);
  assert.equal(await guest.evaluate(()=>window.testRoom.players.get(window.testRoom.hostId).name),owner);
  await guest.locator('#copy-invite').click();const guestInvite=await guest.evaluate(()=>navigator.clipboard.readText());assert.equal(guestInvite,invite);
  const resume=await guest.evaluate(()=>JSON.parse(sessionStorage.getItem('tierlist-resume')).invite);
  assert.equal(new URL(resume).hash,parsed.hash);assert.equal(new URL(resume).origin,site,'welcome-time resume safely uses direct fallback');
  // A full browser reload follows the original fragment and reconnects the existing seat.
  const seat=await guest.evaluate(()=>window.testRoom.self);
  await guest.reload();await instrument(guest);await guest.locator('#confirm-join').click();await guest.waitForFunction(()=>window.testRoom?.connected);
  assert.equal(await guest.evaluate(()=>window.testRoom.self),seat);
  // Missing/invalid fragments stay put with a fixed-site fallback and never become redirects.
  const fallbackCtx=await context(),fallback=await fallbackCtx.newPage();
  for(const fragment of ['', '#join=https://evil.invalid',`#join=${code}&join=${code}`,'#join=javascript:alert(1)']){
   await fallback.goto(INVITE_PREVIEW+'?owner=Host&title=Tierlist'+fragment);
   assert.equal(new URL(fallback.url()).origin,previewOrigin);assert.equal(await fallback.locator('#continue').getAttribute('href'),site+'/tierlist/');
  }
  await fallback.setViewportSize({width:390,height:844});
  await fallback.goto(INVITE_PREVIEW+'?'+new URLSearchParams({owner:'李'.repeat(40),title:'🐈'.repeat(60)}));
  assert(await fallback.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await fallback.screenshot({path:out+'/long-unicode-mobile.png'});snapshots.push(out+'/long-unicode-mobile.png');
  await fallback.goto(INVITE_PREVIEW+'?owner=%3Cscript%3Ealert(1)%3C%2Fscript%3E&title=%F0%9F%90%88');
  assert.equal(await fallback.locator('h1').textContent(),'Join <script>alert(1)</script> in voting on 🐈');
  await fallback.setViewportSize({width:390,height:844});await fallback.locator('#continue').hover();await fallback.screenshot({path:out+'/malicious-text-mobile.png'});snapshots.push(out+'/malicious-text-mobile.png');
  await fallback.goto(INVITE_PREVIEW+'?owner=Host&title=Tierlist&url=https://evil.invalid');assert.equal(await fallback.locator('h1').textContent(),'Tier List invite unavailable');
  await fallback.screenshot({path:out+'/invalid-query-mobile.png'});snapshots.push(out+'/invalid-query-mobile.png');
  // Check every observed HTTP URL and Referer, not just landing requests. Never persist those URLs.
  for(const r of requests){assert(!r.url.includes('#'));for(const secret of [code,...secrets]){assert(!r.url.includes(secret));assert(!r.referer.includes(secret));}}
  assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  const evidence={result:'passed',realIrohPeers:2,existingSeatResumed:true,clipboardRoundTrip:true,hostMetadata:true,discordBotOg:true,candidateOgImageByteIdentical:true,actualDiscordUnfurl:'not tested; no authorized channel supplied',httpRequestsChecked:requests.length,fragmentInHttpRequests:false,unexpectedOrigins:blocked,pageErrors:errors,snapshots};
  fs.writeFileSync(out+'/report.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
