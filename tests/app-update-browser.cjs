// Isolated in-memory deployment versions; never rewrites the repository or a live site.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=process.env.SCREENSHOT_DIR||'/tmp/puzzle-app-updates';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
let version='v1',failInstall=false,stall=false;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
 if(stall&&pathname==='/flags/')return;
 if(pathname==='/uncached-probe'){res.end('not an app route');return;}
 if(failInstall&&pathname==='/assets/app-icon-512.png'){res.writeHead(503);res.end();return;}
 let relative=pathname.endsWith('/')?pathname+'index.html':pathname;
 const file=path.resolve(root,'.'+relative);
 if(!file.startsWith(root+path.sep)||/^\/(uno|uno-transport|docs|scripts)(\/|$)/.test(pathname)){res.writeHead(404);res.end();return;}
 try{
  let body=await fs.readFile(file);
  if(pathname==='/sw.js')body=Buffer.from(body.toString().replace("SHELL='puzzle-app-shell-v1'",`SHELL='puzzle-app-shell-${version}'`));
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch(_){res.writeHead(404);res.end();}
});
async function update(page){return page.evaluate(async()=>{
 const reg=await navigator.serviceWorker.getRegistration();
 const done=new Promise(resolve=>reg.addEventListener('updatefound',()=>{
  const worker=reg.installing;
  worker.addEventListener('statechange',()=>{if(['installed','redundant'].includes(worker.state))resolve(worker.state);});
 },{once:true}));
 await reg.update();return done;
});}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 try{
  await fs.mkdir(out,{recursive:true});const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'});
  await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  const p=await context.newPage();p.setDefaultTimeout(30000);
  await p.goto(base+'/?date=2026-10-02');await p.waitForFunction(()=>navigator.serviceWorker.controller&&document.querySelector('#daily-message').textContent.includes('3/3 downloaded'));
  await p.locator('[data-game="mini"] .card-link').click();await p.waitForSelector('#puzzle-layout:not(.hidden)');await p.locator('#crossword-grid').press('B');
  const saved=await p.evaluate(()=>localStorage.getItem('nyt-mini-xw-progress-2026-10-02'));
  await p.goto(base+'/?date=2026-10-02');await p.waitForSelector('[data-game="mini"][data-status="in-progress"]');
  await p.evaluate(async()=>{await(await caches.open('unrelated-app-cache')).put('/unrelated-marker',new Response('keep'));window.PuzzleTheme.setPreference('dark');});
  // An incomplete new shell must never replace a usable installed app.
  version='v2';failInstall=true;assert.equal(await update(p),'redundant');
  assert(await p.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();return !reg.waiting&&reg.active.state==='activated'&&(await caches.keys()).includes('puzzle-app-shell-v1');}));
  await context.setOffline(true);await p.reload();await p.waitForSelector('[data-game="mini"][data-status="in-progress"]');await context.setOffline(false);
  // Successful installation waits for the explicit update action; no automatic reload.
  version='v3';failInstall=false;assert.equal(await update(p),'installed');await p.waitForSelector('#app-update:not([hidden])');
  assert(await p.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting));
  await p.locator('#app-update').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'waiting-update.png'),animations:'disabled'});
  await Promise.all([p.waitForNavigation(),p.locator('#app-update').click()]);await p.waitForSelector('[data-game="mini"][data-status="in-progress"]');
  const keys=await p.evaluate(()=>caches.keys());assert(keys.includes('puzzle-app-shell-v3'));assert(!keys.includes('puzzle-app-shell-v1'));assert(!keys.includes('puzzle-app-shell-v2'));assert(keys.includes('puzzle-daily-data-v1'));assert(keys.includes('unrelated-app-cache'));
  assert.equal(await p.evaluate(()=>localStorage.getItem('nyt-mini-xw-progress-2026-10-02')),saved);assert.equal(await p.evaluate(()=>window.PuzzleTheme.preference),'dark');
  assert.equal(await p.evaluate(async()=>await(await(await caches.open('unrelated-app-cache')).match('/unrelated-marker')).text()),'keep');
  // A connected-but-stalled navigation falls back to its downloaded page, bounded by 5s.
  stall=true;const began=Date.now();await p.goto(base+'/flags/');assert(Date.now()-began<12000);assert.equal(await p.title(),'Flag Game');stall=false;
  // Unknown URLs neither enter app caches nor receive a misleading home-page fallback.
  assert.equal(await p.evaluate(()=>fetch('/uncached-probe').then(response=>response.text())),'not an app route');
  await context.setOffline(true);assert(await p.evaluate(()=>fetch('/uncached-probe').then(()=>false).catch(()=>true)));
  await p.goto(base+'/?date=2026-10-02');await p.waitForSelector('[data-game="mini"][data-status="in-progress"]');assert.match(await p.locator('#daily-message').textContent(),/3\/3 downloaded/);
  await context.close();console.log('PASS interrupted install, explicit waiting-update activation, native save/theme/data/unrelated cache retention, stalled-network fallback and unknown-route isolation.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exit(1);});
