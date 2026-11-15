// Compatibility pointer dragging, NOT native DnD proof. Real iroh peers and trusted input.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18779',out=process.env.EVIDENCE_DIR || '/tmp/tierlist-pointer-drag';
fs.mkdirSync(out,{recursive:true});const evidence={cases:[],limitations:['Controlled native cancellation is not a reproduction of the reported OS-specific failure.','Headless Linux Chromium; actual Edge and physical pen hardware unavailable.']};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'});try{
 async function page(native){const p=await browser.newPage({viewport:{width:1280,height:1000},hasTouch:true,serviceWorkers:'block'});p.setDefaultTimeout(30000);if(process.env.SORT_BASELINE_DIR)for(const file of ['ui.mjs','style.css'])await p.route('**/tierlist/'+file,route=>route.fulfill({path:process.env.SORT_BASELINE_DIR+'/'+file,contentType:file.endsWith('mjs')?'text/javascript':'text/css'}));await p.goto(base+'/tierlist/'+(native?'?drag=native':''));return p;}
 async function hook(p){await p.evaluate(async()=>{
  const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;TierRoom.prototype.emit=function(){window.testRoom=this;emit.call(this);};
  window.trace=[];window.cancelNative=true;
  document.addEventListener('dragstart',event=>{if(window.cancelNative)event.preventDefault();},true);
  for(const kind of ['dragstart','drop','pointerdown','pointerup','pointercancel'])document.addEventListener(kind,event=>{if(window.trace.length<100)window.trace.push({kind,trusted:event.isTrusted,prevented:event.defaultPrevented,pointer:event.pointerType});});
 });}
 async function setup(native){
  const h=await page(native);await h.evaluate(async()=>{
   const {emptyAlbum}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs'),a=emptyAlbum(),c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillRect(0,0,32,32);a.name='Owned pointer fixture';a.board.tiers=a.board.tiers.slice(0,3);a.board.tiers[0].name='Keep custom category';
   for(let n=0;n<6;n++){a.images.push({id:'image-'+n,label:'Fixture '+n,data:c.toDataURL()});a.board.tiers[0].items.push('image-'+n);}await saveAlbum(a);
  });await h.reload();await hook(h);await h.getByRole('button',{name:'Open',exact:true}).click();await h.locator('#host').click();await h.locator('#host-name').fill('Fixture Host');await h.locator('#host-form button[type=submit]').click();await h.waitForFunction(()=>window.testRoom?.connected);
  const g=await page(native);await hook(g);const invite=await h.locator('#invite-output').inputValue();await g.evaluate(v=>location.hash=new URL(v).hash,invite);await g.locator('#join-name').fill('Fixture Guest');await g.locator('#confirm-join').click();await g.waitForFunction(()=>window.testRoom?.connected&&!!document.querySelector('#board .editable'));
  return {h,g};
 }
 const state=p=>p.evaluate(()=>({connected:window.testRoom.connected,disposed:window.testRoom.disposed,seq:window.testRoom.players.get(window.testRoom.self).seq,board:structuredClone(window.testRoom.players.get(window.testRoom.self).board)}));
 const tile=p=>p.locator('#board [data-image="image-0"]'),zone=(p,n)=>p.locator('#board [data-drop-tier]').nth(n);
 async function points(p,n){await tile(p).scrollIntoViewIfNeeded();await zone(p,n).scrollIntoViewIfNeeded();const a=await tile(p).boundingBox(),b=await zone(p,n).boundingBox();return{sx:a.x+a.width/2,sy:a.y+a.height/2,x:b.x+35,y:b.y+35};}
 // Negative control: trusted native startup is explicitly canceled on real host and guest.
 {
  const {h,g}=await setup(true);
  for(const [p,label]of [[h,'host'],[g,'guest']]){
   const before=await state(p),pt=await points(p,1),cdp=await p.context().newCDPSession(p);
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.sx,y:pt.sy});
   await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:pt.sx,y:pt.sy,button:'left',buttons:1,clickCount:1});
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.sx+16,y:pt.sy,button:'left',buttons:1});
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y,button:'left',buttons:1});
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x,y:pt.y,button:'left',buttons:0,clickCount:1});
   const trace=await p.evaluate(()=>window.trace);assert(trace.some(e=>e.kind==='dragstart'&&e.trusted&&e.prevented),label+': controlled native cancellation occurred');assert.equal((await state(p)).seq,before.seq);
   evidence.cases.push({label,kind:'controlled native cancellation',trace});await cdp.detach();
  }
  await h.close();await g.close();
 }
 const {h,g}=await setup(false);
 for(const [p,label]of [[h,'host'],[g,'guest']]){
  async function bounded(action){let timer;try{return await Promise.race([action(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native startup blocked instead of compatibility pointer movement')),5000);})]);}finally{clearTimeout(timer);}}
  async function begin(n){const pt=await points(p,n);await p.evaluate(()=>window.trace=[]);await p.mouse.move(pt.sx,pt.sy);await p.mouse.down();await bounded(()=>p.mouse.move(pt.sx+16,pt.sy,{steps:4}));await p.mouse.move(pt.x,pt.y,{steps:8});return pt;}
  async function move(n,name,spuriousNativeEnd=false){const before=await state(p);await begin(n);if(spuriousNativeEnd)await tile(p).dispatchEvent('dragend');if(name==='trusted mouse pointer under native cancellation rule')await p.screenshot({path:out+'/'+label+'-pointer.png'});await p.mouse.up();const after=await state(p),trace=await p.evaluate(()=>window.trace);
   assert.equal(after.seq,before.seq+1);assert(after.board.tiers[n].items.includes('image-0'));assert.equal(after.board.tiers[0].name,'Keep custom category');assert(after.connected&&!after.disposed);
   assert(trace.some(e=>e.kind==='pointerdown'&&e.trusted&&e.pointer==='mouse'));assert(!trace.some(e=>e.kind==='dragstart'),'compatibility path bypasses native startup');
   const own=await p.evaluate(()=>({id:window.testRoom.self,seq:window.testRoom.players.get(window.testRoom.self).seq}));await h.waitForFunction(({id,seq})=>window.testRoom.players.get(id)?.seq===seq,own);
   assert.equal(await p.locator('.touch-ghost,.sort-slot,.sort-origin').count(),0);assert(await tile(p).evaluate(n=>n.draggable));evidence.cases.push({label,kind:name,connected:after.connected,disposed:after.disposed,seq:after.seq,trace});
  }
  await move(1,'trusted mouse pointer under native cancellation rule');await move(0,'return pointer');
  await move(1,'pointer survives synthetic native dragend',true);await move(0,'synthetic native cancellation return');
  // Selection must not break startup; keyboard here only selects, it does not move the card.
  await tile(p).press('Enter');await move(1,'selected-source pointer');await move(0,'selected return');
  // Escape before the movement threshold must not turn mouseup into a click-move.
  await tile(p).press('Enter');const armed=await state(p),other=p.locator('#board [data-image="image-1"]'),otherRect=await other.boundingBox();
  await p.mouse.move(otherRect.x+20,otherRect.y+20);await p.mouse.down();await p.keyboard.press('Escape');await p.mouse.up();await p.waitForTimeout(400);assert.equal((await state(p)).seq,armed.seq,'armed Escape suppresses click-move');await p.locator('#cancel-selection').click();evidence.cases.push({label,kind:'pre-threshold Escape cancellation'});
  for(const cancel of ['Escape','outside','blur']){
   const before=await state(p);await begin(1);
   if(cancel==='Escape')await p.keyboard.press('Escape');
   if(cancel==='outside')await p.mouse.move(5,100);
   if(cancel==='blur')await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
   await p.mouse.up();await p.waitForTimeout(400);assert.deepEqual((await state(p)).board,before.board,cancel+': never auto-commit');assert.equal((await state(p)).seq,before.seq);assert.equal(await p.locator('.touch-ghost,.sort-slot,.sort-origin').count(),0);assert(await tile(p).evaluate(n=>n.draggable));evidence.cases.push({label,kind:cancel+' cancellation'});
  }
  await p.waitForTimeout(550);await tile(p).click();await p.waitForTimeout(400);assert.equal(await tile(p).getAttribute('aria-pressed'),'true');await p.locator('#cancel-selection').click();
  await tile(p).dblclick();await p.locator('#image-dialog').waitFor({state:'visible'});await p.keyboard.press('Escape');
  await tile(p).press('Enter');await zone(p,1).locator('..').locator('.place-here').press('Enter');assert((await state(p)).board.tiers[1].items.includes('image-0'));
  await move(0,'after cancel click doubleclick keyboard');
  await p.locator('#tab-everyone').click();assert(await p.locator('#comparison [data-image]').evaluateAll(nodes=>nodes.length>0&&nodes.every(n=>!n.draggable)));await p.locator('#tab-rank').click();
  // Real CDP pen and touch input use the same pointer path, not native DnD.
  for(const pointer of ['pen','touch']){
   const before=await state(p),pt=await points(p,1),cdp=await p.context().newCDPSession(p);
   if(pointer==='pen'){
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:pt.sx,y:pt.sy,button:'left',buttons:1,clickCount:1,pointerType:'pen'});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y,button:'left',buttons:1,pointerType:'pen'});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x,y:pt.y,button:'left',buttons:0,clickCount:1,pointerType:'pen'});
   }else{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pt.sx,y:pt.sy,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pt.x,y:pt.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await state(p)).seq,before.seq,'trusted touch cancel never commits');assert.equal(await p.locator('.touch-ghost,.sort-slot,.sort-origin').count(),0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pt.sx,y:pt.sy,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pt.x,y:pt.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }
   assert.equal((await state(p)).seq,before.seq+1);assert((await state(p)).board.tiers[1].items.includes('image-0'));await cdp.detach();await move(0,pointer+' return');evidence.cases.push({label,kind:'trusted CDP '+pointer});
  }
 }
 console.log('PASS '+evidence.cases.length+' focused controls: canceled native startup, pointer host receipts, cancellation, click/doubleclick/keyboard, CDP pen/touch.');
}finally{fs.writeFileSync(out+'/evidence.json',JSON.stringify(evidence,null,2));await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
