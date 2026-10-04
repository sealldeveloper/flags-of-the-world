// Real service workers and a persistent Chromium profile. All progress is disposable.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=process.env.BASE_URL||'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR||'/tmp/puzzle-app';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'puzzle-app-test-'));
const options={executablePath:process.env.CHROMIUM_PATH,headless:true,colorScheme:'dark',reducedMotion:'reduce',viewport:{width:390,height:844},args:['--mute-audio']};
fs.mkdirSync(out,{recursive:true});
const day='2026-10-02',home=base+'/?date='+day;
async function network(context){await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());}
async function library(p,url=home){await p.goto(url);await p.waitForSelector('.daily-card');await p.waitForFunction(()=>!document.getElementById('save-day').disabled);}
async function status(p,game,value){await p.waitForSelector(`[data-game="${game}"][data-status="${value}"]`);}
async function snapshot(p,name){await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' horizontal overflow');await p.screenshot({path:path.join(out,name+'.png'),fullPage:!(await p.locator('dialog[open]').count()),animations:'disabled'});}
async function solveCrossword(p){await p.evaluate(()=>{state.userGrid=state.solution.map(row=>row.map(value=>value==='#'?'':value));fullRedraw();checkWin();});}
(async()=>{
 let context;
 try{
  context=await chromium.launchPersistentContext(profile,options);await network(context);
  // Exercise the manual install help deterministically; this is not an OS install UI test.
  await context.addInitScript(()=>addEventListener('beforeinstallprompt',event=>{event.preventDefault();event.stopImmediatePropagation();}));
  let p=context.pages()[0]||await context.newPage();p.setDefaultTimeout(30000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await library(p);await p.waitForFunction(()=>document.getElementById('daily-message').textContent.includes('3/3 downloaded'));
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await p.locator('.daily-card').count(),3);for(const game of ['crossword','mini','connections'])await status(p,game,'not-started');
  assert.equal(await p.locator('#daily-total').textContent(),'0 of 3 finished');
  assert.equal(await p.locator('section:has(#quiz-heading) .card').count(),2);
  assert.equal(await p.locator('section:has(#social-heading) .card').count(),3);
  assert.equal(await p.locator('#daily-grid a[href*="seattle"]').count(),0);
  const cdp=await context.newCDPSession(p),manifest=await cdp.send('Page.getAppManifest'),installability=await cdp.send('Page.getInstallabilityErrors');
  assert.equal(JSON.parse(manifest.data).display,'standalone');assert.deepEqual(installability.installabilityErrors,[]);
  await p.locator('#install-app').click();assert(await p.locator('#install-help').isVisible());await snapshot(p,'install-help');await p.locator('#install-help button').click();
  // Actual entry and native saves, followed by controlled completion fixtures.
  await p.locator('[data-game="mini"] .card-link').click();await p.waitForSelector('#puzzle-layout:not(.hidden)');await p.locator('#crossword-grid').press('A');
  assert((await p.evaluate(()=>JSON.parse(localStorage.getItem('nyt-mini-xw-progress-2026-10-02')).dailySummary.filled))>0);
  await solveCrossword(p);await p.goBack();await status(p,'mini','completed');
  await p.locator('[data-game="crossword"] .card-link').click();await p.waitForSelector('#puzzle-layout:not(.hidden)');await p.locator('#crossword-grid').press('A');await p.goBack();await status(p,'crossword','in-progress');
  // Responsive and theme states, including hover/focus and the nested archive scroll.
  for(const [width,height]of [[1920,1080],[1024,768],[390,844],[320,740]]){
   await p.setViewportSize({width,height});
   for(const theme of ['light','dark']){await p.emulateMedia({colorScheme:theme});await snapshot(p,`library-${width}-${theme}`);}
  }
  await p.setViewportSize({width:390,height:844});await p.locator('#save-day').hover();await snapshot(p,'download-hover');
  await p.locator('#save-day').focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');assert(await p.locator('#save-day').evaluate(e=>e.matches(':focus-visible')));await snapshot(p,'download-focus');
  await p.locator('#daily-history summary').click();await p.waitForSelector('#history-rows tr');await snapshot(p,'archive-left');
  await p.locator('.history-scroll').evaluate(e=>e.scrollLeft=e.scrollWidth);await snapshot(p,'archive-right');
  await p.locator('#history-filter').selectOption('saved');await p.waitForFunction(()=>[...document.querySelectorAll('#history-rows tr')].every(row=>!row.lastChild.textContent.startsWith('0/')));
  // Connections pending loss stays unfinished and continuation resumes the correct mode.
  await p.locator('[data-game="connections"] .card-link').click();await p.waitForSelector('#game:not(.hidden)');
  for(let i=0;i<4;i++)await p.evaluate(async i=>{const c=state.puzzle.categories;state.selected=new Set([c[0].cards[i].id,c[1].cards[0].id,c[2].cards[0].id,c[3].cards[0].id]);await submitGuess();},i);
  await library(p);await status(p,'connections','in-progress');assert.match(await p.locator('[data-game="connections"]').textContent(),/Choose how to continue/);
  await p.locator('[data-game="connections"] .card-link').click();await p.locator('#continue-easy').click();await library(p);assert.match(await p.locator('[data-game="connections"] .card-link').getAttribute('href'),/mode=easy/);
  await p.locator('[data-game="connections"] .card-link').click();await p.waitForSelector('#game:not(.hidden)');
  for(let i=0;i<4;i++)await p.evaluate(async i=>{state.selected=new Set(state.puzzle.categories[i].cards.map(card=>card.id));await submitGuess();},i);
  await library(p);await status(p,'connections','completed');assert.match(await p.locator('[data-game="connections"]').textContent(),/easy mode/);
  await p.locator('[data-game="crossword"] .card-link').click();await p.waitForSelector('#puzzle-layout:not(.hidden)');await solveCrossword(p);await library(p);
  await p.waitForFunction(()=>document.getElementById('daily-total').textContent==='3 of 3 finished');
  await p.locator('#daily-history summary').click();await p.locator('#history-filter').selectOption('finished');await p.waitForSelector(`#history-rows tr[data-date="${day}"]`);await snapshot(p,'all-finished');
  // Another tab can undo progress; the dashboard must stop counting it as complete.
  const other=await context.newPage();await other.goto(base+'/crossword-nytmini/?puzzle='+day);await other.waitForSelector('#puzzle-layout:not(.hidden)');
  await other.evaluate(()=>{outer:for(let r=0;r<state.height;r++)for(let c=0;c<state.width;c++)if(!isBlack(r,c)){state.userGrid[r][c]='';break outer;}fullRedraw();});await status(p,'mini','in-progress');
  await solveCrossword(other);await status(p,'mini','completed');await other.close();
  // A legacy completed save is recognised without modifying that saved record.
  const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../crossword-nytmini/puzzles/2026/10/2026-10-01.json'),'utf8'));
  const w=old.body[0].dimensions.width,h=old.body[0].dimensions.height;
  const legacy={userGrid:Array.from({length:h},(_,r)=>Array.from({length:w},(_,c)=>(old.body[0].cells[r*w+c]?.answer||'').replaceAll('/','').trim().toUpperCase()))};
  await p.evaluate(saved=>localStorage.setItem('nyt-mini-xw-progress-2026-10-01',JSON.stringify(saved)),legacy);
  await library(p,base+'/?date=2026-10-01');await status(p,'mini','completed');assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('nyt-mini-xw-progress-2026-10-01'))),legacy);
  // Cached pages/data survive offline navigation, including not-yet-played days.
  await context.setOffline(true);await library(p);await p.waitForFunction(()=>document.getElementById('daily-total').textContent==='3 of 3 finished');
  assert.equal(await p.evaluate(()=>fetch('/__uncached_probe__').then(()=>false).catch(()=>true)),true);
  await p.locator('[data-game="connections"] .card-link').click();await p.waitForSelector('#game:not(.hidden)');assert(await p.evaluate(()=>state.completed));
  await library(p,base+'/?date=2026-09-01');await p.waitForFunction(()=>document.getElementById('daily-message').textContent.includes('0/3 downloaded'));await snapshot(p,'not-downloaded-offline');
  await p.locator('[data-game="mini"] .card-link').click();await p.waitForSelector('#error-overlay:not(.hidden)');await snapshot(p,'missing-puzzle-offline');
  const cached=await p.evaluate(async()=>{const result=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())result.push(request.url);return result;});assert(!cached.some(url=>/\/(uno|uno-transport|docs|scripts)\//.test(url)));
  assert.deepEqual(errors,[]);await context.close();context=null;
  // Cold restart, not just a same-tab cache hit, with the network already offline.
  context=await chromium.launchPersistentContext(profile,options);await context.setOffline(true);p=context.pages()[0]||await context.newPage();p.setDefaultTimeout(30000);
  await library(p);await p.waitForFunction(()=>document.getElementById('daily-total').textContent==='3 of 3 finished');await snapshot(p,'cold-restart-offline');
  await p.locator('[data-game="mini"] .card-link').click();await p.waitForSelector('#puzzle-layout:not(.hidden)');assert(await p.evaluate(()=>JSON.parse(localStorage.getItem('nyt-mini-xw-progress-2026-10-02')).dailySummary.complete));
  await context.close();context=null;
  console.log('PASS installability, real service-worker shell/data, offline and cold restart, native/legacy progress, completion/continuation, cross-tab updates, archive filters and responsive themes.');
  // Browser denial of both save and cache APIs must remain a usable online page.
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try{
   const denied=await browser.newContext({serviceWorkers:'block',colorScheme:'light'});await network(denied);
   await denied.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked');};Storage.prototype.setItem=()=>{throw new Error('blocked');};Object.defineProperty(window,'caches',{value:{open:async()=>{throw new Error('quota');}}});});
   const q=await denied.newPage(),failures=[];q.on('pageerror',error=>failures.push(error.message));await library(q);await q.waitForFunction(()=>document.getElementById('daily-message').textContent.includes('0/3 downloaded'));assert.match(await q.locator('#storage-message').textContent(),/blocked/);assert.deepEqual(failures,[]);await snapshot(q,'blocked-storage');await denied.close();
  }finally{await browser.close();}
  console.log('PASS blocked progress/cache storage without false offline claims.');
 }finally{if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1)});
