// Actual iroh connections and browser-generated mouse DnD; no synthetic DragEvents.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18768';
const out=process.env.EVIDENCE_DIR || '/tmp/tierlist-guest-drag';
const scenario=process.env.DRAG_SCENARIO || 'all';
fs.mkdirSync(out,{recursive:true});
const evidence={scenario,snapshots:[],drags:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'});
 try {
  async function page(){
   const p=await browser.newPage({viewport:{width:1280,height:1100},reducedMotion:'reduce',hasTouch:true,serviceWorkers:'block'});
   p.setDefaultTimeout(90000);p.on('pageerror',error=>evidence.errors.push(error.message));
   await p.goto(base+'/tierlist/?drag=native');
   await p.evaluate(async()=>{
    const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;
    window.emissions=[];window.dragTrace=[];
    TierRoom.prototype.emit=function(){
     window.dragRoom=this;emit.call(this);
     if(this.latency[this.self]===17)window.sawLatencyMarker=true;
     if(this.album && this.players.has(this.self))window.emissions.push({connected:this.connected,seq:this.players.get(this.self).seq,editable:!!document.querySelector('#board .editable')});
    };
    for(const kind of ['dragstart','dragover','drop','dragend'])document.addEventListener(kind,event=>{
     window.dragTrace.push({kind,target:event.target.tagName,types:[...event.dataTransfer.types],defaultPrevented:event.defaultPrevented,trusted:event.isTrusted});
    });
   });
   return p;
  }
  async function host(){
   const p=await page();
   await p.evaluate(async()=>{
    const {emptyAlbum}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');
    const album=emptyAlbum();album.name='Guest native drag regression';album.board.tiers=album.board.tiers.slice(0,2);
    for(let index=0;index<6;index++){
     const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;
     const context=canvas.getContext('2d');context.fillStyle=['#5566aa','#aa6633','#227766'][index%3];context.fillRect(0,0,400,300);context.fillStyle='#fff';context.font='90px sans-serif';context.fillText(String(index),140,180);
     const image={id:'image-'+index,label:'Image '+index,data:canvas.toDataURL('image/png')};album.images.push(image);
     (index<3?album.board.tiers[0].items:album.board.unranked).push(image.id);
    }
    await saveAlbum(album);
   });
   // Reload would discard instrumentation, so refresh the library through its normal navigation.
   await p.reload();
   await p.evaluate(async()=>{
    const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit,send=TierRoom.prototype.send;
    TierRoom.prototype.emit=function(){window.dragRoom=this;emit.call(this);};
    // Delay genuine wire messages only: expose an incomplete sync or a pending original.
    TierRoom.prototype.send=function(conn,message){
     const name=this.players.get(this.peers.get(conn)?.seat)?.name;
     if(message.type==='snapshot' && message.done && name===window.holdSnapshotFor){
      window.holdSnapshotFor=null;window.releaseSnapshot=()=>send.call(this,conn,message);
      this.broadcastRoster();return;
     }
     return send.call(this,conn,message);
    };
    const {OriginalTransfer}=await import('./progressive.mjs'),hostMessage=OriginalTransfer.prototype.hostMessage;
    window.originalWaiters=[];window.holdOriginals=true;
    OriginalTransfer.prototype.hostMessage=async function(conn,message){
     if(message.type==='original-chunk' && window.holdOriginals)await new Promise(resolve=>window.originalWaiters.push(resolve));
     return hostMessage.call(this,conn,message);
    };
   });
   await p.getByRole('button',{name:'Open',exact:true}).click();await p.locator('#host').click();
   await p.locator('#host-name').fill('Host');await p.locator('#host-form button[type=submit]').click();
   await p.waitForFunction(()=>window.dragRoom?.connected);
   return p;
  }
  async function join(h,name,holdChunks=false){
   const p=await page();
   if(holdChunks)await p.evaluate(async()=>{
    const {TierRoom}=await import('./room.mjs'),receive=TierRoom.prototype.guestMessage;
    TierRoom.prototype.guestMessage=async function(message){
     if(message.type==='chunk' && !window.releaseChunks){window.chunkHeld=true;await new Promise(resolve=>window.releaseChunks=resolve);}
     return receive.call(this,message);
    };
   });
   const invite=await h.locator('#invite-output').inputValue();
   await p.evaluate(invite=>location.hash=new URL(invite).hash,invite);
   await p.locator('#join-name').fill(name);await p.locator('#confirm-join').click();return p;
  }
  async function ready(p){await p.waitForFunction(()=>window.dragRoom?.connected && !document.querySelector('#add-tier').disabled);}
  async function snapshot(p,label){
   const value=await p.evaluate(()=>({connected:window.dragRoom.connected,self:window.dragRoom.self,seq:window.dragRoom.players.get(window.dragRoom.self).seq,editable:!!document.querySelector('#board .editable'),draggable:[...document.querySelectorAll('#board [data-image]')].every(node=>node.draggable),originalsComplete:window.dragRoom.originalTransfer?.state.complete}));
   evidence.snapshots.push({label,...value});console.log(label,JSON.stringify(value));return value;
  }
  async function board(p){return p.evaluate(()=>structuredClone(window.dragRoom.players.get(window.dragRoom.self).board));}
  async function visibleBoard(p){return p.locator('#board [data-drop-tier]').evaluateAll(nodes=>nodes.map(node=>({tier:node.dataset.dropTier,images:[...node.querySelectorAll('[data-image]')].map(tile=>tile.dataset.image)})));}
  const tiles=(p,tier)=>p.locator(`#board [data-drop-tier="${tier}"]`);
  const tile=(p,image)=>p.locator(`#board [data-image="${image}"]`);
  async function mouseDrag(p,source,target,side='left'){
   await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
   const a=await source.boundingBox(),b=await target.boundingBox();assert(a&&b);
   await p.evaluate(()=>window.dragTrace=[]);
   await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();
   await p.mouse.move(a.x+a.width/2+14,a.y+a.height/2,{steps:5});
   const x=side==='right'?b.x+b.width-5:b.x+5,y=b.y+b.height/2;
   await p.mouse.move(x,y,{steps:12});await p.mouse.move(x+1,y);
  }
  async function finishDrag(p,label,accepted=true){
   await p.mouse.up();
   const trace=await p.evaluate(()=>window.dragTrace);evidence.drags.push({label,trace});
   if(accepted){
    assert(trace.some(event=>event.kind==='dragstart'&&event.trusted&&event.types.includes('text/x-tier-image')),label+': trusted custom dragstart');
    assert(trace.some(event=>event.kind==='dragover'&&event.defaultPrevented&&event.types.includes('text/x-tier-image')),label+': accepted dragover');
    assert(trace.some(event=>event.kind==='drop'&&event.defaultPrevented&&event.trusted),label+': accepted native drop');
   }else assert(!trace.some(event=>event.types.includes('text/x-tier-image')),label+': no editable payload');
  }
  async function rankMoves(p,label){
   let current=await board(p);const first=current.tiers[0].id,second=current.tiers[1].id;
   let items=current.tiers[0].items;const moving=items[0];
   await mouseDrag(p,tile(p,moving),tile(p,items[2]));await finishDrag(p,label+' same tier');
   assert.deepEqual((await board(p)).tiers[0].items,[items[1],moving,...items.slice(2)]);
   await mouseDrag(p,tile(p,moving),tiles(p,second));await finishDrag(p,label+' across tiers');
   assert.deepEqual((await board(p)).tiers[1].items,[moving]);
   await mouseDrag(p,tile(p,moving),tiles(p,'unranked'),'right');await finishDrag(p,label+' to Unranked');
   assert.equal((await board(p)).unranked.at(-1),moving);
   await mouseDrag(p,tile(p,moving),tiles(p,first),'right');await finishDrag(p,label+' from Unranked');
   assert.equal((await board(p)).tiers[0].items.at(-1),moving);
  }
  if(scenario==='all'||scenario==='reconnect'){
   const h=await host(),g=await join(h,'Guest');await ready(g);
   const initial=await snapshot(g,'fresh ready, originals pending');assert(initial.draggable);assert.equal(initial.originalsComplete,false);
   await rankMoves(g,'fresh pending');
   // Presence, roster, ping/latency and original completion must not cancel an active drag.
   let current=await board(g);const moving=current.tiers[0].items[0],source=await tile(g,moving).elementHandle(),root=await g.locator('#board .tier-board').elementHandle();
   await mouseDrag(g,tile(g,moving),tiles(g,current.tiers[1].id));
   await g.locator('#board .sort-slot').waitFor({state:'visible'});
   await h.evaluate(()=>{
    const r=window.dragRoom;r.broadcastRoster();r.publishPresence(r.players.get(r.self));
    for(const [conn,peer]of r.peers)if(peer.seat)r.send(conn,{type:'latency',values:{[peer.seat]:17}});
    window.holdOriginals=false;window.originalWaiters.splice(0).forEach(resolve=>resolve());
   });
   await g.waitForFunction(()=>window.dragRoom.originalTransfer.state.complete&&window.sawLatencyMarker);
   assert(await root.evaluate(node=>node===document.querySelector('#board .tier-board')),'progress/roster/latency retain board');
   assert(await source.evaluate(node=>node.isConnected),'active drag source survives');
   assert.equal(await g.locator('#board .sort-slot').count(),1);
   await finishDrag(g,'active drag survives background state');assert.deepEqual((await board(g)).tiers[1].items,[moving]);
   // Return it so each ranking exercise starts with three images in the first tier.
   await mouseDrag(g,tile(g,moving),tiles(g,current.tiers[0].id),'right');await finishDrag(g,'restore first tier');
   const before=await snapshot(g,'before actual disconnect');
   await h.evaluate(()=>window.holdSnapshotFor='Guest');
   const old=await g.evaluate(()=>{const r=window.dragRoom,connection=r.connection;r.transport.disconnect(connection);return connection;});
   await g.waitForFunction(()=>window.dragRoom.connected===false);
   const disconnected=await snapshot(g,'disconnected');assert.equal(disconnected.draggable,false);
   const readonly=await g.locator('#board .tier-board').elementHandle(),unchanged=await visibleBoard(g);
   await h.waitForFunction(()=>!!window.releaseSnapshot);
   const readonlyStable=await readonly.evaluate(node=>node===document.querySelector('#board .tier-board'));
   await mouseDrag(g,tile(g,moving),tiles(g,current.tiers[1].id));await finishDrag(g,'disconnected read only',false);assert.deepEqual(await visibleBoard(g),unchanged);
   await h.evaluate(()=>{window.releaseSnapshot();window.releaseSnapshot=null;});
   await g.waitForFunction(old=>window.dragRoom.connected&&window.dragRoom.connection!==old,old);
   const resumed=await snapshot(g,'actual auto-resume, unchanged seq');assert.equal(resumed.seq,before.seq);assert.equal(resumed.self,before.self);
   await g.screenshot({path:out+'/resumed-before-drag.png',fullPage:true});
   await rankMoves(g,'resumed');assert(resumed.draggable,'resumed board must regain drag handlers');
   assert(readonlyStable,'incomplete resume roster retains read-only board');
   await g.locator('#tab-everyone').click();
   assert(await g.locator('#comparison [data-image]').evaluateAll(nodes=>nodes.length>0&&nodes.every(node=>!node.draggable)));
   const comparison=g.locator('#comparison .comparison-card').first(),comparisonBoard=await board(g);
   await mouseDrag(g,comparison.locator('.tile').first(),comparison.locator('.tiles').nth(1));await finishDrag(g,'Everyone read only',false);assert.deepEqual(await board(g),comparisonBoard);
   await g.locator('#tab-rank').click();
   // Keyboard activation still uses the existing selection/place-here route.
   current=await board(g);const keyboardImage=current.unranked[0];await tile(g,keyboardImage).press('Enter');await g.locator('#board .place-here').nth(1).press('Enter');
   assert((await board(g)).tiers[1].items.includes(keyboardImage));
   // Exercise the resumed guest's touch handlers with actual browser touch input too.
   await tile(g,keyboardImage).scrollIntoViewIfNeeded();await tiles(g,'unranked').scrollIntoViewIfNeeded();
   const a=await tile(g,keyboardImage).boundingBox(),b=await tiles(g,'unranked').boundingBox(),cdp=await g.context().newCDPSession(g);
   const sx=a.x+30,sy=a.y+30,tx=b.x+40,ty=b.y+b.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
   for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+(tx-sx)*step/8,y:sy+(ty-sy)*step/8,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert((await board(g)).unranked.includes(keyboardImage));assert.equal(await g.locator('.touch-ghost,.sort-slot').count(),0);
   await snapshot(g,'resumed guest keyboard and actual touch ranked');
   await g.screenshot({path:out+'/resumed-editable.png',fullPage:true});
   await h.close();await g.close();
  }
  if(scenario==='all'||scenario==='early'){
   const h=await host(),g=await join(h,'Early guest',true);await g.waitForFunction(()=>window.chunkHeld);
   // A later join makes this fresh guest's self snapshot non-final in normal sync order.
   const later=await join(h,'Later guest');await ready(later);
   await h.evaluate(()=>window.holdSnapshotFor='Early guest');await g.evaluate(()=>window.releaseChunks());
   await h.waitForFunction(()=>!!window.releaseSnapshot);
   await g.waitForFunction(()=>window.emissions.some(value=>!value.connected));
   const early=await snapshot(g,'fresh join roster before final snapshot');assert.equal(early.connected,false);assert.equal(early.draggable,false);
   await h.evaluate(()=>{window.releaseSnapshot();window.releaseSnapshot=null;});await ready(g);
   const readyState=await snapshot(g,'fresh join after final snapshot, unchanged seq');assert.equal(readyState.seq,early.seq);
   await g.screenshot({path:out+'/early-join-before-drag.png',fullPage:true});
   await rankMoves(g,'early-roster ready pending originals');assert(readyState.draggable,'early read-only render must become editable');
   await g.screenshot({path:out+'/early-join-editable.png',fullPage:true});
   await h.close();await g.close();await later.close();
  }
  assert.deepEqual(evidence.errors,[]);console.log('PASS guest native mouse drag scenario: '+scenario+' (see snapshots and trusted DnD traces in evidence JSON).');
 }catch(error){evidence.failure=error.stack;throw error;}
 finally{fs.writeFileSync(out+'/evidence-'+scenario+'.json',JSON.stringify(evidence,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
