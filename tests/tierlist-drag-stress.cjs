// Current-release investigation: real iroh peers and trusted mouse/CDP touch input.
// Evidence deliberately excludes invitations, room/peer IDs, resume tokens and message bodies.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18779';
const out=process.env.EVIDENCE_DIR || '/tmp/tierlist-drag-stress';
const rounds=Number(process.env.STRESS_ROUNDS || 30);
fs.mkdirSync(out,{recursive:true});
const evidence={baseRelease:'fa9d6b2',rounds,drags:[],checks:[],errors:[],limitations:['Headless Chromium, not actual Edge or physical touch hardware.']};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'});
 try {
  async function instrument(p){
   await p.evaluate(async()=>{
    const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;
    TierRoom.prototype.emit=function(){window.stressRoom=this;return emit.call(this);};
    window.trace=[];window.source=null;window.replacements=0;
    const bounds=node=>{if(!node)return null;const {x,y,width,height}=node.getBoundingClientRect();return {x,y,width,height,connected:node.isConnected,draggable:node.draggable};};
    window.dragState=()=>{const r=window.stressRoom,root=document.querySelector('#board .tier-board');return {connected:r?.connected,disposed:r?.disposed,seq:r?.players.get(r.self)?.seq,editable:root?.classList.contains('editable'),controlsEditable:!document.querySelector('#add-tier').disabled,allDraggable:[...document.querySelectorAll('#board [data-image]')].every(n=>n.draggable),source:bounds(window.source),slot:!!document.querySelector('#board .sort-slot'),origin:!!document.querySelector('#board .sort-origin'),replacements:window.replacements,visibility:document.visibilityState};};
    const record=value=>{if(window.trace.length<400)window.trace.push(value);};
    for(const kind of ['dragstart','dragenter','dragover','drop','dragend','pointercancel','pointerdown','pointermove','pointerup'])document.addEventListener(kind,event=>{
     if(kind==='dragstart'||kind==='pointerdown')window.source=event.target.closest?.('#board [data-image]');
     const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('#board [data-drop-tier]');
     record({kind,x:event.clientX,y:event.clientY,hitTier:[...document.querySelectorAll('#board [data-drop-tier]')].indexOf(hit),trusted:event.isTrusted,prevented:event.defaultPrevented,pointer:event.pointerType,types:[...(event.dataTransfer?.types || [])],effect:event.dataTransfer?.effectAllowed,dropEffect:event.dataTransfer?.dropEffect,target:event.target.closest?.('#board')?'own-board':event.target.closest?.('#comparison')?'comparison':'outside',...window.dragState()});
    });
    new MutationObserver(records=>{if(records.some(r=>r.target===document.querySelector('#board') && r.removedNodes.length)){window.replacements++;record({kind:'board-replaced',...window.dragState()});}}).observe(document.querySelector('#board'),{childList:true});
   });
  }
  async function page(hasTouch,legacy=false){
   const p=await browser.newPage({viewport:{width:1280,height:1100},hasTouch,serviceWorkers:'block',reducedMotion:'reduce'});
   p.setDefaultTimeout(60000);p.on('pageerror',()=>evidence.errors.push('pageerror (content omitted)'));
   if(legacy)await p.route('**/tierlist/room.mjs',route=>route.fulfill({path:process.env.LEGACY_GUEST_ROOM,contentType:'text/javascript'}));
   await p.goto(base+'/tierlist/?drag=native');return p;
  }
  const h=await page(true);
  await h.evaluate(async()=>{
   const {emptyAlbum}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');
   const album=emptyAlbum();album.name='Owned synthetic drag stress';album.board.tiers=album.board.tiers.slice(0,4);
   for(let index=0;index<24;index++){
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const c=canvas.getContext('2d');c.fillStyle=['#5566aa','#aa6633','#227766'][index%3];c.fillRect(0,0,160,120);c.fillStyle='#fff';c.font='32px sans-serif';c.fillText(String(index),50,75);
    const image={id:'image-'+index,label:'Fixture '+index,data:canvas.toDataURL('image/png')};album.images.push(image);
    (index<17?album.board.tiers[0].items:index<20?album.board.tiers[1].items:album.board.unranked).push(image.id);
   }await saveAlbum(album);
  });
  await h.reload();await instrument(h);
  await h.getByRole('button',{name:'Open',exact:true}).click();await h.locator('#host').click();await h.locator('#host-name').fill('Fixture Host');await h.locator('#host-form button[type=submit]').click();
  await h.waitForFunction(()=>window.stressRoom?.connected);
  async function join(hasTouch,name,resume,legacy=false){
   const p=await page(hasTouch,legacy);await instrument(p);
   if(resume)await p.evaluate(value=>sessionStorage.setItem('tierlist-resume',value),resume);
   const invite=await h.locator('#invite-output').inputValue();await p.evaluate(invite=>location.hash=new URL(invite).hash,invite);
   await p.locator('#join-name').fill(name);await p.locator('#confirm-join').click();await ready(p);return p;
  }
  async function ready(p){await p.waitForFunction(()=>window.stressRoom?.connected && !!document.querySelector('#board .editable') && !document.querySelector('#add-tier').disabled);}
  const g=await join(false,'Fixture Guest',null,!!process.env.LEGACY_GUEST_ROOM);
  const board=p=>p.evaluate(()=>structuredClone(window.stressRoom.players.get(window.stressRoom.self).board));
  const tile=(p,id)=>p.locator(`#board [data-image="${id}"]`);
  const zone=(p,id)=>p.locator(`#board [data-drop-tier="${id}"]`);
  async function receipt(p){
   const own=await p.evaluate(()=>({id:window.stressRoom.self,seq:window.stressRoom.players.get(window.stressRoom.self).seq}));
   await h.waitForFunction(({id,seq})=>window.stressRoom.players.get(id)?.seq===seq,own);
   return own.seq;
  }
  async function startMouse(p,image,target){
   await tile(p,image).scrollIntoViewIfNeeded();const a=await tile(p,image).boundingBox();
   await p.evaluate(()=>{window.trace=[];window.source=null;});
   await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(a.x+a.width/2+14,a.y+a.height/2,{steps:5});
   await target.scrollIntoViewIfNeeded();const b=await target.boundingBox();const x=b.x+Math.min(38,b.width/2),y=b.y+Math.min(38,b.height/2);
   await p.mouse.move(x,y,{steps:12});await p.mouse.move(x+1,y);
   for(let n=0;n<3;n++){
    await target.scrollIntoViewIfNeeded();const live=await target.boundingBox();
    await p.mouse.move(live.x+Math.min(38,live.width/2)+n%2,live.y+Math.min(38,live.height/2));
   }
   return {x:x+1,y};
  }
  async function finish(p,label,image,tier,kind='mouse'){
   const trace=await p.evaluate(()=>window.trace),after=await board(p),state=await p.evaluate(()=>window.dragState());
   const success=(tier==='unranked'?after.unranked:after.tiers.find(t=>t.id===tier).items).includes(image);
   const entry={label,kind,success,hostSeq:await receipt(p),state,trace,destinationIndex:after.tiers.findIndex(t=>t.id===tier),actualIndex:after.tiers.findIndex(t=>t.items.includes(image))};evidence.drags.push(entry);if(process.env.VERBOSE)console.log(label,success?'PASS':'FAIL');
   fs.writeFileSync(out+'/evidence.json',JSON.stringify(evidence,null,2));
   assert(success,label+': destination must contain moved image');
   if(kind==='mouse'){
    assert(trace.some(e=>e.kind==='dragstart'&&e.trusted&&e.types.includes('text/x-tier-image')),label+': trusted custom dragstart');
    assert(trace.some(e=>e.kind==='dragover'&&e.trusted&&e.prevented),label+': accepted dragover');
    assert(trace.some(e=>e.kind==='drop'&&e.trusted&&e.prevented),label+': trusted accepted drop');
   }else assert(trace.some(e=>e.kind==='pointerdown'&&e.trusted&&e.pointer==='touch'),label+': trusted CDP touch');
   assert(!state.origin&&!state.slot,label+': cleaned sorting state');
  }
  async function mouseMove(p,label,index=0,whileActive){
   await ready(p);const before=await board(p),from=index%2===0?before.tiers[0].items:before.tiers[2].items;
   const image=from[Math.floor(index/2)%from.length],tier=index%2===0?before.tiers[2].id:before.tiers[0].id;assert(image,label+': fixture source');
   const seq=await p.evaluate(()=>window.stressRoom.players.get(window.stressRoom.self).seq);
   await startMouse(p,image,zone(p,tier));if(whileActive)await whileActive();
   await p.mouse.up();await finish(p,label,image,tier);assert.equal(await receipt(p),seq+1,label+': exactly one edit');
  }
  async function touchMove(p,label,index){
   const before=await board(p),from=index%2===0?before.tiers[0].items:before.tiers[2].items;
   const image=index%2===0?from.at(-1):from[0],tier=index%2===0?before.tiers[2].id:before.tiers[0].id;
   await tile(p,image).scrollIntoViewIfNeeded();await zone(p,tier).scrollIntoViewIfNeeded();
   const a=await tile(p,image).boundingBox(),b=await zone(p,tier).boundingBox(),cdp=await p.context().newCDPSession(p),sx=a.x+30,sy=a.y+30,tx=b.x+35,ty=index%2===0?b.y+35:b.y+b.height-38;
   assert(sy>0&&sy<1100&&ty>0&&ty<1100,label+': both touch endpoints visible');
   await p.evaluate(()=>{window.trace=[];window.source=null;});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
   for(let n=1;n<=12;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+(tx-sx)*n/12,y:sy+(ty-sy)*n/12,id:1}]});
   // Live previews can resize intermediate wrapped tiers; aim at the current visible target,
   // not stale pre-gesture coordinates (which can now belong to another tier).
   for(let n=0;n<3;n++){
    await zone(p,tier).scrollIntoViewIfNeeded();const live=await zone(p,tier).boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:live.x+35,y:index%2===0?live.y+35:live.y+live.height-38,id:1}]});
   }
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await finish(p,label,image,tier,'touch');await cdp.detach();
  }
  // Run both real peers' edits during the other's live gestures, with roster/ping/activity traffic.
  for(let n=0;n<rounds;n++){
   for(const [p,other,label]of [[h,g,'host'],[g,h,'guest']]){
    await mouseMove(p,`${label} repeated ${n}`,n,async()=>{
     const otherBoard=await board(other);
     await other.evaluate(tier=>{const r=window.stressRoom,b=structuredClone(r.players.get(r.self).board);b.tiers[1].name='Fixture tier '+tier;r.update(b);},n);
     await h.evaluate(()=>{const r=window.stressRoom;r.broadcastRoster();r.publishLatency();for(const [conn,peer]of r.peers)if(peer.seat)r.ping(conn,peer);});
     await receipt(other);assert(await p.locator('#board .sort-slot').count(),'active gesture retained');
    });
   }
  }
  evidence.checks.push('Repeated real peer edits, roster, ping, activity: both own boards remain editable; exact +1 seq and host receipt per mouse drop.');
  // Sweep every synthetic card on both peers, including Unranked and a previously empty tier.
  for(const p of [h,g])for(let n=0;n<24;n++){
   const before=await board(p),image='image-'+n,original=before.tiers.find(t=>t.items.includes(image))?.id || 'unranked';
   const destination=original===before.tiers[3].id?'unranked':before.tiers[3].id;
   for(const tier of [destination,original]){
    await startMouse(p,image,zone(p,tier));await p.mouse.up();await finish(p,`${p===h?'host':'guest'} all-card sweep ${n} ${tier===original?'restore':'out'}`,image,tier);
   }
  }
  // Mixed-input desktop, narrow wrapped boards, and recovery from Escape.
  for(const p of [h,g]){
   const label=p===h?'host':'guest';await p.setViewportSize({width:390,height:1100});
   for(let n=0;n<8;n++)await mouseMove(p,`${label} narrow mouse ${n}`,n);
   for(let n=0;n<8;n++)await touchMove(p,`${label} narrow touch ${n}`,n);
   await p.setViewportSize({width:1280,height:1100});
   let before=await board(p);await startMouse(p,before.tiers[0].items[0],zone(p,before.tiers[2].id));await p.keyboard.press('Escape');await p.mouse.up();assert.deepEqual(await board(p),before);assert.equal(await p.locator('#board .sort-slot,.sort-origin').count(),0);
   await mouseMove(p,`${label} after Escape`,0);await mouseMove(p,`${label} restore Escape`,1);
   before=await board(p);const image=before.unranked[0];await tile(p,image).press('Enter');await p.locator('#board .place-here').nth(1).press('Enter');assert((await board(p)).tiers[1].items.includes(image));await receipt(p);
   evidence.checks.push(label+': Escape cancellation + next trusted mouse drop; independent keyboard place-here route.');
  }
  // Read-only comparison is intentional, including the player's own comparison card.
  for(const p of [h,g]){
   await p.locator('#tab-everyone').click();assert(await p.locator('#comparison [data-image]').evaluateAll(nodes=>nodes.length>0&&nodes.every(n=>!n.draggable)));
   await p.locator('#tab-rank').click();await mouseMove(p,'after Everyone return '+(p===h?'host':'guest'),0);await mouseMove(p,'restore Everyone '+(p===h?'host':'guest'),1);
   await p.locator('#group-export').click();await p.locator('#group-dialog').waitFor({state:'visible'});await p.keyboard.press('Escape');
   const before=await board(p);await tile(p,before.tiers[0].items[0]).dblclick();await p.locator('#image-dialog').waitFor({state:'visible'});await p.keyboard.press('Escape');
   await p.locator('#back').click();await p.locator('#return-lobby').click();await ready(p);
   await mouseMove(p,'after export zoom Back return '+(p===h?'host':'guest'),0);await mouseMove(p,'restore modal loop '+(p===h?'host':'guest'),1);
  }
  // Real disconnection/reconnection is classified separately, never counted as a connected drag failure.
  for(let n=0;n<3;n++){
   if(process.env.VERBOSE)console.log('disconnect cycle',n);
   const old=await g.evaluate(()=>{const r=window.stressRoom,c=r.connection;r.transport.disconnect(c);return c;});
   await g.waitForFunction(()=>!window.stressRoom.connected);assert.equal(await g.locator('#board [draggable=true]').count(),0);
   await mouseMove(h,'host while guest disconnected '+n,0);await mouseMove(h,'host restore during outage '+n,1);
   await g.waitForFunction(old=>window.stressRoom.connected&&window.stressRoom.connection!==old,old);await ready(g);
   await mouseMove(g,'resumed guest '+n,0);await mouseMove(g,'restore resumed guest '+n,1);
  }
  // Browser network suspension plus real lifecycle visibility (not dispatched JS events).
  if(process.env.VERBOSE)console.log('offline freeze begin');
  const cdp=await g.context().newCDPSession(g);
  await g.context().setOffline(true);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await new Promise(r=>setTimeout(r,42000));await cdp.send('Page.setWebLifecycleState',{state:'active'});await g.context().setOffline(false);await cdp.detach();await ready(g);
  await mouseMove(g,'after offline freeze wake',0);await mouseMove(g,'restore offline freeze wake',1);
  // Duplicated-tab resume capability: keep the private value in memory only.
  if(process.env.VERBOSE)console.log('duplicate resume begin');
  const resume=await g.evaluate(()=>sessionStorage.getItem('tierlist-resume'));
  const preserved=await board(g),preservedSeq=await receipt(g);
  const duplicate=await join(true,'Fixture duplicate',resume);
  const seats=await h.evaluate(()=>window.stressRoom.players.size);
  if(!process.env.EXPECT_DUPLICATE_CHURN)await g.waitForFunction(()=>window.stressRoom.disposed);
  const samples=[];
  for(let n=0;n<14;n++){
   samples.push({original:await g.evaluate(()=>window.dragState()),duplicate:await duplicate.evaluate(()=>window.dragState()),host:await h.evaluate(()=>window.dragState())});
   await new Promise(r=>setTimeout(r,1000));
  }
  evidence.duplicate={seats,samples};
  assert.equal(seats,2,'duplicate resumes the existing seat, never creates another');
  assert.deepEqual(await board(duplicate),preserved,'takeover preserves all placements and category names');assert.equal(await receipt(duplicate),preservedSeq);
  await mouseMove(h,'host during duplicate resume',0);await mouseMove(h,'host restore after duplicate resume',1);
  if(process.env.EXPECT_DUPLICATE_CHURN){
   assert(samples.some(s=>!s.duplicate.connected),'old release reproduces repeated displacement');
   await duplicate.close();await ready(g);await mouseMove(g,'guest after duplicate closed',0);
  }else{
   assert(samples.every(s=>s.original.disposed&&!s.original.connected&&s.duplicate.connected&&!s.duplicate.disposed),'newest valid resume wins without oscillation');
   assert.match(await g.locator('#connection').textContent(),process.env.LEGACY_GUEST_ROOM?/Disconnected/:/another tab/);
   const latest=await duplicate.evaluate(()=>sessionStorage.getItem('tierlist-resume'));
   const resumed=await join(true,'Fixture latest resume',latest);await duplicate.waitForFunction(()=>window.stressRoom.disposed);
   assert.deepEqual(await board(resumed),preserved);assert.equal(await receipt(resumed),preservedSeq);
   await mouseMove(resumed,'latest capability resumes preserved seat',0);await mouseMove(resumed,'latest resume restore',1);
   await duplicate.close();
   const stale=await page(false);await instrument(stale);await stale.evaluate(value=>sessionStorage.setItem('tierlist-resume',value),resume);
   const invite=await h.locator('#invite-output').inputValue();await stale.evaluate(value=>location.hash=new URL(value).hash,invite);await stale.locator('#join-name').fill('Fixture stale tab');await stale.locator('#confirm-join').click();
   await stale.waitForFunction(()=>window.stressRoom?.disposed);assert.equal(await h.evaluate(()=>window.stressRoom.players.size),2,'stale capability cannot fork a new seat');
   await mouseMove(resumed,'winner remains editable after stale retry',0);await stale.close();
   evidence.checks.push('Duplicate capability takeover is stable for14s; stale retry rejected, current-token resume retains exact board/category names/seq; host untouched.');
  }
  assert.deepEqual(evidence.errors,[]);console.log('PASS '+evidence.drags.length+' trusted movement checks; see '+out+'/evidence.json');
 }catch(error){evidence.failure=error.stack;throw error;}
 finally{fs.writeFileSync(out+'/evidence.json',JSON.stringify(evidence,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
