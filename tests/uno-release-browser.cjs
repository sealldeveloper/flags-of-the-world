// Real iroh peers and real WebGL. Rare deals are explicit test-only host fixtures.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR||'/tmp/uno-release';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});const pages=[],errors=[];
 try{
  async function page(){const p=await browser.newPage({viewport:{width:1024,height:900}});pages.push(p);p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
  async function instrument(p){await p.evaluate(async()=>{
   const {Room}=await import('./room.mjs'),{CardTable}=await import('./scene.mjs');
   const open=Room.prototype.open;Room.prototype.open=function(...args){window.r=this;return open.apply(this,args);};
   const broadcast=Room.prototype.broadcast;Room.prototype.broadcast=function(...args){const x=broadcast.apply(this,args);if(window.controlled)clearTimeout(this.botTimer);return x;};
   const update=CardTable.prototype.update;CardTable.prototype.update=function(...args){window.table=this;return update.apply(this,args);};
   window.controlled=true;
  });}
  async function idle(p){await p.waitForFunction(()=>document.body.dataset.presenting!=='true'&&!r.pending&&r.view?.revealMs<=0);}
  async function shot(p,name){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`${out}/${name}.png`,fullPage:!(await p.locator('body').evaluate(e=>e.classList.contains('playing')))});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');}
  const host=await page();await host.goto(base+'/uno/');await instrument(host);await host.locator('#name').fill('Host');await host.locator('#create').click();await host.locator('#room').waitFor({state:'visible'});
  const invite=await host.locator('#invite-output').inputValue(),guest=await page();await guest.goto(invite);await instrument(guest);
  assert.equal(await guest.locator('#entry-title').textContent(),'Join your group');assert(await guest.locator('.join-block').isHidden());assert.equal(await guest.locator('#create').textContent(),'Join group lobby');await shot(guest,'invite-name');
  await guest.locator('#name').fill('Guest');await guest.locator('#create').click();await guest.locator('#room').waitFor({state:'visible'});await host.waitForFunction(()=>r.state.players.length===2);
  assert(await host.locator('#start').isDisabled());assert(await host.locator('#force-start').isVisible());
  assert.equal(await host.locator('.seat-status[data-ready="true"]').count(),1);assert.equal(await host.locator('.seat-status[data-ready="false"]').count(),1);
  await guest.locator('#edit-profile').click();assert.equal(await guest.locator('#avatar-patterns input').count(),12);await guest.locator('#avatar-colour').fill('#39b9d4');await guest.locator('.avatar-option:has([value="diamonds"])').click();await shot(guest,'profile-diamonds');await guest.locator('.avatar-option:has([value="crosses"])').click();await shot(guest,'profile-crosses');await guest.locator('#profile-save').click();await guest.locator('#profile-dialog').waitFor({state:'hidden'});
  await host.waitForFunction(()=>r.state.players[1].avatar.colour==='#39b9d4');await shot(host,'ready-not-ready');
  await host.locator('#force-start').click();await host.locator('#scene[data-rendered="true"]').waitFor();await host.waitForFunction(()=>document.body.dataset.presenting==='true');
  assert(await host.locator('#draw').isDisabled());for(const p of [host,guest])await idle(p);
  console.log('PASS invite name/join, profile colour/patterns, host force-start, paced initial deal');
  async function fixture({seats=3,rule={},hands,turn=0,direction=1}={}){
   for(const p of [host,guest])await idle(p);
   const rev=await host.evaluate(async o=>{const {createDeck}=await import('./engine.mjs'),{DEFAULT_RULES}=await import('./rules.mjs');const s=r.state;clearTimeout(r.botTimer);clearTimeout(r.settleTimer);r.actionTiming=null;s.effects=null;s.unoWindow=null;s.phase='lobby';while(s.players.length<o.seats)r.execute(r.self,{type:'bot'});s.players=s.players.slice(0,o.seats);
    const deck=createDeck(),take=([colour,value])=>{const i=deck.findIndex(c=>c.colour===colour&&c.value===value);if(i<0)throw Error('invalid test deal');return deck.splice(i,1)[0];};s.discard=[take(['red','5'])];s.colour='red';
    s.players.forEach((p,i)=>{p.hand=(o.hands?.[i]||[['red',String((i+1)%10)],['blue',String((i+1)%10)],['green',String((i+1)%10)]]).map(take);p.unoCalled=false;p.ready=true;});
    Object.assign(s,{deck,phase:'playing',round:s.round+1,rules:{...DEFAULT_RULES,...o.rule},turn:o.turn,direction:o.direction,debt:0,drawn:null,winner:null,lastPlayedBy:null,notice:'Controlled deal'});s.revision++;r.broadcast();return s.revision;
   },{seats,rule,hands,turn,direction});
   for(const p of [host,guest]){await p.waitForFunction(rev=>r.view.revision===rev,rev);await idle(p);}
  }
  await fixture({hands:[[['red','1'],['blue','1']]]});await host.locator('#hand .symbol-1.red').click();await host.waitForFunction(()=>table.animations.length>0&&document.querySelector('#room').dataset.effect==='play');
  const proof=await host.evaluate(()=>{const a=table.animations.find(a=>a.mesh.userData.id===r.state.discard.at(-1).id);if(!a)return null;table.frame(a.startTime+a.duration*.35);const pos=a.mesh.position.clone();r.broadcast();return {duration:a.duration,inFlight:a.mesh.userData.flying,unchanged:a.mesh.position.distanceTo(pos)<.001,travels:a.start.distanceTo(a.target)>1};});
  assert(proof?.inFlight&&proof.unchanged&&proof.travels,JSON.stringify(proof));assert(proof.duration>=900);assert(await host.locator('#draw').isDisabled());await idle(host);assert(await host.locator('#call-uno').isVisible());assert(await guest.locator('#call-uno').isHidden());await host.locator('#call-uno').click();await host.waitForFunction(()=>r.state.players[0].unoCalled);assert.equal(await host.evaluate(()=>r.state.turn),1);assert(await host.locator('#call-uno').isHidden());
  assert.match(await host.locator('#action-history').textContent(),/Host called UNO!/);assert.match(await host.locator('#action-history').textContent(),/Host played .*1/);
  console.log('PASS live mesh travel, duplicate snapshot preservation, motion gate, own-turn post-play UNO and public action history');
  await fixture({hands:[[['red','1'],['blue','1']]]});await host.locator('#hand .symbol-1.red').click();await idle(host);assert(await guest.locator('#catch-uno').isHidden());await guest.locator('#catch-uno').waitFor({state:'visible'});console.log('catch-window',await host.evaluate(()=>r.timing()));await guest.locator('#catch-uno').click();await host.waitForFunction(()=>r.state.players[0].hand.length===3&&!r.state.unoWindow);for(const p of [host,guest])await idle(p);assert.equal(await host.evaluate(()=>r.state.turn),1);
  console.log('PASS delayed missed-UNO challenge, authoritative two-card penalty and paced draws');
  await fixture({direction:-1,rule:{jumpIn:true},hands:[[['red','4'],['blue','1'],['yellow','2']],[['blue','4'],['red','4'],['green','1']]]});await host.locator('#hand .red.symbol-4').click();await guest.waitForFunction(()=>document.querySelector('#room').dataset.effect==='jump-window');assert(await guest.locator('#hand .blue.symbol-4').isDisabled());assert(!(await guest.locator('#hand .red.symbol-4').isDisabled()));await guest.locator('#hand .red.symbol-4').click();await host.waitForFunction(()=>r.state.lastPlayedBy===r.state.players[1].id);for(const p of [host,guest])await idle(p);
  console.log('PASS exact red-4 jump-in, rejected blue-4');
  for(const seats of [2,4,8]){
   await fixture({seats});
   for(const [w,h] of [[1920,1080],[1024,900],[390,844],[320,740]]){
    await host.setViewportSize({width:w,height:h});
    for(const theme of ['light','dark']){await host.evaluate(t=>document.documentElement.dataset.theme=t,theme);await shot(host,`table-${seats}-${w}-${theme}`);}
    const geometry=await host.evaluate(()=>{const t=table;return [...t.players].map(([id,g])=>{const b=t.bounds(g),el=document.querySelector(`[data-seat-id="${id}"]`),r=el.getBoundingClientRect();return {id,x:(b.left+b.right)/2,hudX:r.x+r.width/2,gap:b.top-r.bottom,top:r.top,bottom:b.bottom,left:r.left,right:r.right};});});
    for(const g of geometry){assert(Math.abs(g.x-g.hudX)<6,JSON.stringify(g));assert(g.gap>=-1&&g.gap<24,JSON.stringify(g));assert(g.top>=100&&g.left>=0&&g.right<=w+1,JSON.stringify(g));}
    assert(await host.evaluate(()=>{const a=document.querySelector('#table-status').getBoundingClientRect();return [...document.querySelectorAll('#players .seat')].every(e=>{const b=e.getBoundingClientRect();return Math.min(a.right,b.right)<=Math.max(a.left,b.left)+1||Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top)+1;});}),'turn status must not overlap player HUDs');
    const before=await host.evaluate(()=>[...table.players].map(([id,g])=>[id,g.position.toArray()]));await host.evaluate(()=>{r.state.turn=(r.state.turn+1)%r.state.players.length;r.state.revision++;r.broadcast();});assert.deepEqual(await host.evaluate(()=>[...table.players].map(([id,g])=>[id,g.position.toArray()])),before);
   }
  }
  console.log('PASS 2/4/8 stable seats, HUD-to-deck alignment, viewport/theme captures');
  await host.setViewportSize({width:1024,height:900});await fixture({rule:{sevenZero:true},hands:[[['red','0'],['blue','1'],['green','1']]]});await host.locator('#hand .red.symbol-0').click();await host.waitForFunction(()=>document.querySelector('#room').dataset.effectPhase==='flight');assert.equal(await host.evaluate(()=>table.animations.filter(a=>a.mesh.userData.rotationGhost).length),3);await shot(host,'rotation-flight');for(const p of [host,guest])await idle(p);
  await fixture({hands:[[['red','1']]]});await host.locator('#hand .red.symbol-1').click();assert(await host.locator('#round-result').isHidden());await host.locator('#round-result').waitFor({state:'visible'});assert.equal(await host.locator('#round-result').getAttribute('data-outcome'),'win');await host.locator('#result-rematch').click();for(const p of [host,guest])await idle(p);assert.equal(await host.locator('#hand .card').count(),7);
  assert.deepEqual(errors,[]);console.log('PASS rotation motion, delayed winner and rematch; no browser errors');await host.locator('#settings-toggle').click();await host.locator('#leave').click();
 }catch(e){for(const [i,p] of pages.entries()){await p.screenshot({path:`${out}/failure-${i}.png`}).catch(()=>{});console.error(await p.evaluate(()=>({error:document.querySelector('#error').textContent,effect:document.querySelector('#room').dataset,notice:document.querySelector('#notice').textContent})).catch(()=>null));}throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
