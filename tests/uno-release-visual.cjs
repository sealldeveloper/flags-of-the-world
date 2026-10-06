// Real browser/iroh host. A test-only retained UNO window permits visual inspection.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.SCREENSHOT_DIR||'/tmp/uno-release-controls';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});try{
 const p=await b.newPage({viewport:{width:1024,height:900}});p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto((process.env.BASE_URL||'http://127.0.0.1:18764')+'/uno/');await p.evaluate(async()=>{const {Room}=await import('./room.mjs');const open=Room.prototype.open;Room.prototype.open=function(...a){window.r=this;return open.apply(this,a);};});
 await p.locator('#name').fill('Visual host');await p.locator('#create').click();await p.locator('#room').waitFor({state:'visible'});await p.locator('#add-bot').click();
 async function shot(name){await p.screenshot({path:`${out}/${name}.png`});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 for(const [w,h]of [[1920,1080],[1024,900],[390,844],[320,740]]){await p.setViewportSize({width:w,height:h});for(const theme of ['light','dark']){
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.locator('#edit-profile').click();await p.locator('#avatar-colour').fill('#459dcc');await p.locator('.avatar-option:has([value="diamonds"])').click();await shot(`profile-${w}-${theme}`);
  await p.locator('.avatar-option:has([value="crosses"])').click();await p.locator('.avatar-option:has([value="crosses"]) input').focus();await shot(`crosses-focus-${w}-${theme}`);await p.locator('#profile-cancel').click();
 }}
 await p.setViewportSize({width:1024,height:900});await p.locator('#start').click();await p.waitForFunction(()=>document.body.dataset.presenting!=='true'&&r.view?.revealMs===0);
 await p.evaluate(async()=>{const {createDeck}=await import('./engine.mjs');clearTimeout(r.botTimer);clearTimeout(r.settleTimer);const s=r.state,d=createDeck();const take=(c,v)=>d.splice(d.findIndex(q=>q.colour===c&&q.value===v),1)[0];s.players[0].hand=[take('red','4'),take('blue','1')];s.players[1].hand=[take('green','2'),take('blue','3')];s.players[1].bot=false;Object.assign(s,{deck:d,discard:[take('red','5')],colour:'red',phase:'playing',turn:0,drawn:null,debt:0,unoWindow:null,effects:null,round:s.round+1});s.revision++;r.actionTiming=null;r.broadcast();});
 await p.locator('#hand .red.symbol-4').click();await p.locator('#call-uno').waitFor({state:'visible'});
 // Keep this test-owned snapshot open only for the screenshots. Runtime deadlines
 // are tested without alteration by uno-release-browser.cjs and unit tests.
 await p.evaluate(()=>{clearTimeout(r.settleTimer);r.actionTiming.catchFrom=performance.now()+600000;r.actionTiming.unoUntil=r.actionTiming.catchFrom+5000;});
 for(const [w,h]of [[1920,1080],[1024,900],[390,844],[320,740]]){await p.setViewportSize({width:w,height:h});for(const theme of ['light','dark']){
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.locator('#call-uno').hover();await shot(`uno-hover-${w}-${theme}`);await p.locator('#call-uno').focus();await shot(`uno-focus-${w}-${theme}`);
  assert(await p.locator('#call-uno').isVisible());const geometry=await p.evaluate(()=>{const a=document.querySelector('#call-uno').getBoundingClientRect(),buttons=[...document.querySelectorAll('.playing .site-header button,.playing .site-header>a')].map(e=>e.getBoundingClientRect());return {fits:a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,header:buttons.every(r=>r.bottom<=52),overlap:[...document.querySelectorAll('#hand .card')].some(e=>{const q=e.getBoundingClientRect();return Math.min(a.right,q.right)>Math.max(a.left,q.left)&&Math.min(a.bottom,q.bottom)>Math.max(a.top,q.top);})};});assert(geometry.fits&&geometry.header&&!geometry.overlap,JSON.stringify(geometry));
 }}
 await p.keyboard.press('Space');await p.waitForFunction(()=>r.state.players[0].unoCalled);assert(await p.locator('#call-uno').isHidden());assert.deepEqual(errors,[]);await p.locator('#settings-toggle').click();await p.locator('#leave').click();console.log('PASS profile/colour/pattern and big UNO hover/focus at four sizes, both themes; keyboard UNO; no overlaps or browser errors');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
