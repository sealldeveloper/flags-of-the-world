// Real WebGL + iroh host; state/clock instrumentation is test-only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.SCREENSHOT_DIR||'/tmp/uno-turn-ui';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});let p;try{
 p=await browser.newPage({viewport:{width:1024,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto((process.env.BASE_URL||'http://127.0.0.1:18764')+'/uno/');await p.evaluate(async()=>{
  const {Room}=await import('./room.mjs'),{CardTable}=await import('./scene.mjs'),{TablePresentation}=await import('./presentation.mjs');
  const open=Room.prototype.open;Room.prototype.open=function(...a){window.r=this;return open.apply(this,a);};
  const update=CardTable.prototype.update;CardTable.prototype.update=function(...a){window.table=this;return update.apply(this,a);};
  const next=TablePresentation.prototype.next;TablePresentation.prototype.next=function(...a){window.presenter=this;return next.apply(this,a);};
  const bc=Room.prototype.broadcast;Room.prototype.broadcast=function(...a){const result=bc.apply(this,a);clearTimeout(this.botTimer);return result;};
  window.freeze=()=>{clearTimeout(presenter.timer);clearTimeout(r.botTimer);clearTimeout(r.settleTimer);clearTimeout(r.turnTimer);};
 });
 await p.locator('#name').fill('Player with a long name');await p.locator('#create').click();await p.locator('#room').waitFor({state:'visible'});await p.locator('#add-bot').click();await p.locator('#start').click();await p.waitForFunction(()=>window.table?.active&&document.body.dataset.presenting==='false');
 async function fixture(seats=4,turn=0){await p.evaluate(async({seats,turn})=>{
  freeze();presenter.reset();const {createDeck}=await import('./engine.mjs'),{DEFAULT_RULES}=await import('./rules.mjs');const s=r.state;s.phase='lobby';while(s.players.length<seats)r.execute(r.self,{type:'bot'});s.players=s.players.slice(0,seats);const deck=createDeck(),take=(c,v)=>deck.splice(deck.findIndex(x=>x.colour===c&&x.value===v),1)[0];
  s.players.forEach((q,i)=>{q.hand=[take('red',String(i+1)),take('blue',String(i+1)),take('green',String(i+1))];q.unoCalled=false;q.connected=true;});
  Object.assign(s,{phase:'playing',round:s.round+1,turn,deck,discard:[take('red','9')],colour:'red',direction:1,debt:0,drawn:null,unoWindow:null,winner:null,effects:null,rules:{...DEFAULT_RULES},notice:'Controlled visual check'});s.revision++;r.actionTiming=null;r.broadcast();freeze();
 },{seats,turn});await p.waitForFunction(()=>table.view.round===r.state.round);}
 async function shot(name){await p.screenshot({path:`${out}/${name}.png`});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 for(const [width,height,theme]of [[1920,1080,'light'],[1024,900,'dark'],[390,844,'light'],[320,740,'dark']]){
  await p.setViewportSize({width,height});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await fixture(8);
  await p.waitForFunction(()=>[...table.cards.values()].some(m=>m.userData.front.material.color.r<.6));
  assert.equal(await p.locator('#turn-order').count(),0);assert(await p.locator('.seat-name').allTextContents().then(names=>names.every(n=>!/^\d+\./.test(n))));
  assert(await p.evaluate(()=>[...table.players.values()].every(g=>Math.abs(g.quaternion.dot(table.camera.quaternion))<.999)));
  assert(await p.evaluate(()=>[...table.cards].every(([id,m])=>r.view.legal.includes(id)?m.userData.targetTint===1:m.userData.targetTint===.52)));
  await shot(`seats-${width}`);
  await fixture(3);await p.evaluate(()=>{const s=r.state,find=(c,v)=>{const i=s.deck.findIndex(x=>x.colour===c&&x.value===v);return s.deck.splice(i,1)[0];};const cards=[find('blue','6'),find('green','6'),find('red','6')];s.deck.push(...cards.reverse());s.rules.drawUntilPlayable=true;r.execute(r.self,{type:'draw'},s.revision);r.broadcast();});
  await p.waitForFunction(()=>table.view.drawn&&document.body.dataset.presenting==='false');
  const held=await p.evaluate(()=>{freeze();const m=table.cards.get(table.view.drawn);return {y:m.position.y,normal:[...table.cards.values()].filter(x=>x!==m).map(x=>x.position.y),cues:table.effects.pulses.map(x=>x.kind)};});assert(held.y>10&&held.normal.every(y=>y<1));assert(!held.cues.includes('draw'));await shot(`held-card-${width}`);
  await p.locator('#pass').click();await p.waitForFunction(()=>!table.view.drawn&&document.body.dataset.presenting==='false');await p.waitForFunction(()=>[...table.cards.values()].every(m=>Math.abs(m.position.y)<1));await shot(`kept-card-${width}`);
 }
 // A real jump-in must arrive within the host window; expired actions cannot mutate.
 await p.setViewportSize({width:1024,height:900});await fixture(3,2);await p.evaluate(()=>{const s=r.state;s.rules.jumpIn=true;const top=s.deck.splice(s.deck.findIndex(c=>c.colour==='red'&&c.value==='1'),1)[0];s.discard.push(top);s.effects={revision:++s.revision,events:[{kind:'play',player:s.players[1].id,card:top,colour:'red'}]};r.pace();r.actionTiming.revealUntil=performance.now()-1;r.actionTiming.jumpUntil=performance.now()+1500;presenter.reset();r.broadcast();});
 await p.locator('#jump-prompt').waitFor({state:'visible'});await p.waitForFunction(()=>[...table.cards].some(([id,m])=>table.view.legal.includes(id)&&m.position.y>1));await shot('jump-in-raised');await p.locator('#hand .red.symbol-1').click();await p.waitForFunction(()=>r.state.lastPlayedBy===r.self);assert.equal(await p.evaluate(()=>r.state.players[0].hand.length),2);
 await fixture(3,2);await p.evaluate(()=>{const s=r.state;s.rules.jumpIn=true;s.discard.push(s.deck.splice(s.deck.findIndex(c=>c.colour==='red'&&c.value==='1'),1)[0]);const before=JSON.stringify(s);try{r.execute(r.self,{type:'play',cardId:s.players[0].hand[0].id},s.revision);throw Error('accepted expired jump');}catch(e){if(!/window is closed/.test(e.message))throw e;}if(JSON.stringify(s)!==before)throw Error('mutated expired jump');});
 // Turn timer is host-authoritative and can finish an unanswered wild choice.
 await fixture(3);await p.evaluate(()=>{r.turnClock.start=performance.now()-r.turnClock.duration-1;r.broadcast();});await p.waitForFunction(()=>r.state.players[0].hand.length===2);await p.waitForFunction(()=>document.body.dataset.presenting==='false');
 await p.locator('#history-toggle').click();assert(await p.locator('#action-history time').count()>0);await shot('timestamp-history');await p.locator('#history-close').click();
 assert.deepEqual(errors,[]);await p.locator('#settings-toggle').click();await p.locator('#leave').click();console.log('PASS names, numeric count/ping, 3D seats, playable-only tint, held/kept card, bounded jump highlight/click, forced turn expiry, timestamp history; four viewports');
 }catch(e){if(p)await p.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw e;}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
