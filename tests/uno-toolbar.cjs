// Real browser and iroh host; dense public-history notices below are test-only fixtures.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.SCREENSHOT_DIR||'/tmp/uno-toolbar';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});
 try {
  const p=await b.newPage({viewport:{width:390,height:844}}),errors=[];
  p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto((process.env.BASE_URL||'http://127.0.0.1:18764')+'/uno/');
  async function shot(name){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`${out}/${name}.png`});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow');
   for(const el of await p.locator('dialog[open]').all()){const r=await el.boundingBox(),v=p.viewportSize();assert(r.x>=0&&r.y>=0&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,'dialog bounds');}
  }
  async function setTheme(t){if(await p.locator('html').getAttribute('data-theme')!==t){await p.locator('#settings-toggle').click();await p.locator('#theme').click();await p.locator('#settings-close').click();}}
  const sizes=[[1920,1080],[1024,768],[390,844],[320,740]];
  for(const [w,h]of sizes){await p.setViewportSize({width:w,height:h});for(const t of ['light','dark']){
   await setTheme(t);assert(await p.locator('#puzzles-link').isVisible());assert(await p.locator('#history-toggle').isHidden());
   await p.locator('#settings-toggle').hover();await shot(`entry-${w}-${t}`);await p.locator('#settings-toggle').click();await p.locator('#motion').focus();await shot(`settings-entry-${w}-${t}`);await p.keyboard.press('Escape');await p.waitForFunction(()=>document.querySelector('#settings-toggle').getAttribute('aria-expanded')==='false');
   assert.equal(await p.locator('#settings-toggle').getAttribute('aria-expanded'),'false');assert.equal(await p.evaluate(()=>document.activeElement.id),'settings-toggle');
  }}
  await p.evaluate(async()=>{const {Room}=await import('./room.mjs');const open=Room.prototype.open;Room.prototype.open=function(...a){window.r=this;return open.apply(this,a);};const bc=Room.prototype.broadcast;Room.prototype.broadcast=function(...a){const result=bc.apply(this,a);clearTimeout(this.botTimer);return result;};});
  await p.locator('#name').fill('Toolbar host');await p.locator('#create').click();await p.locator('#room').waitFor({state:'visible'});
  assert(await p.locator('#puzzles-link').isHidden());assert(await p.locator('.status-row').isHidden());await p.locator('#history-toggle').click();assert(await p.locator('#history-empty').isVisible());await shot('history-empty');await p.locator('#history-close').click();
  await p.locator('#add-bot').click();await p.locator('#start').click();await p.waitForFunction(()=>document.body.dataset.presenting!=='true'&&r.view?.revealMs===0);await p.locator('#scene[data-rendered="true"]').waitFor();
  // Test long/wrapped hostile-looking display names as text, bounded to 50 entries.
  await p.evaluate(()=>{clearTimeout(r.botTimer);clearTimeout(r.settleTimer);r.actionTiming=null;r.state.effects=null;r.state.turn=1;for(let i=1;i<=55;i++){r.state.notice=`Action ${i}: A very long player name <img src=x onerror=alert(1)> played a card, reversed direction and passed the turn to another player.`;r.state.revision++;r.broadcast();}});
  assert.equal(await p.locator('#action-history li').count(),50);assert.equal(await p.locator('#action-history img').count(),0);assert(await p.locator('#hand-help').isHidden());
  for(const [w,h]of sizes){await p.setViewportSize({width:w,height:h});for(const t of ['light','dark']){
   await setTheme(t);await p.locator('#history-toggle').focus();await shot(`game-${w}-${t}`);
   assert(await p.locator('#motion').isHidden());assert(await p.locator('#credits').isHidden());assert(await p.locator('#theme').isHidden());
   await p.locator('#settings-toggle').click();await p.locator('#theme').hover();await shot(`settings-game-${w}-${t}`);
   const old=await p.locator('#motion').getAttribute('aria-pressed');await p.locator('#motion').click();assert.notEqual(await p.locator('#motion').getAttribute('aria-pressed'),old);await p.locator('#motion').click();
   await p.locator('#theme').click();assert.notEqual(await p.locator('html').getAttribute('data-theme'),t);await p.locator('#theme').click();await p.locator('#settings-close').click();
   await p.locator('#history-toggle').click();await p.locator('#action-history').evaluate(e=>e.scrollTop=0);await p.locator('#history-close').focus();await shot(`history-top-${w}-${t}`);
   await p.locator('#action-history').evaluate(e=>e.scrollTop=e.scrollHeight);await shot(`history-bottom-${w}-${t}`);await p.keyboard.press('Escape');await p.waitForFunction(()=>document.activeElement.id==='history-toggle');
   assert.equal(await p.evaluate(()=>document.activeElement.id),'history-toggle');await p.locator('#action-history').evaluate(e=>e.scrollTop=0);
  }}
  await p.locator('#settings-toggle').click();await p.locator('#credits').click();assert(await p.locator('#credits-dialog').isVisible());await shot('credits-mobile');await p.locator('#credits-dialog button').click();assert.equal(await p.evaluate(()=>document.activeElement.id),'settings-toggle');
  await p.evaluate(()=>r.onStatus('Reconnecting (1/4)…'));assert(await p.locator('.status-row').isVisible());await shot('reconnecting-mobile');await p.evaluate(()=>r.onStatus('Hosting · iroh connected'));assert(await p.locator('.status-row').isHidden());
  await p.locator('#settings-toggle').click();await p.locator('#leave').click();await p.locator('#entry').waitFor({state:'visible'});assert(await p.locator('#puzzles-link').isVisible());assert(await p.locator('#history-toggle').isHidden());assert.equal(await p.locator('#action-history li').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS cog settings, mobile history, both themes/four viewports, bounded text-only history, empty/dense/scroll states, keyboard/Escape/focus, connection warning and room cleanup');
 } finally {await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
