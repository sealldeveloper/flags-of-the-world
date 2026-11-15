// Reproduce layout-driven target loss using trusted native DnD and two real iroh peers.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18779',out=process.env.EVIDENCE_DIR || '/tmp/tierlist-drag-hover';
const evidence={expectedUnstable:!!process.env.EXPECT_UNSTABLE,selectedSource:process.env.SELECTED_SOURCE || false,cases:[]};fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'});try{
 async function page(){const p=await browser.newPage({viewport:{width:390,height:1100},hasTouch:true,serviceWorkers:'block'});p.setDefaultTimeout(60000);
  if(process.env.SORT_BASELINE_DIR)for(const file of ['ui.mjs','style.css'])await p.route('**/tierlist/'+file,route=>route.fulfill({path:process.env.SORT_BASELINE_DIR+'/'+file,contentType:file.endsWith('mjs')?'text/javascript':'text/css'}));
  await p.goto(base+'/tierlist/?drag=native');return p;}
 async function hook(p){await p.evaluate(async()=>{
  const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;TierRoom.prototype.emit=function(){window.testRoom=this;emit.call(this);};
  window.trace=[];window.targetPoint=null;
  const index=node=>window.zoneIndices?.get(node) ?? [...document.querySelectorAll('#board [data-drop-tier]')].indexOf(node);
  window.inspectHover=()=>{const pt=window.targetPoint,source=document.querySelector('#board [data-image="image-15"]'),r=source?.getBoundingClientRect(),room=window.testRoom;
   return {connected:room?.connected,disposed:room?.disposed,editable:!!document.querySelector('#board .editable'),seq:room?.players.get(room.self)?.seq,sourceConnected:source?.isConnected,source:{x:r?.x,y:r?.y,width:r?.width,height:r?.height},origin:!!document.querySelector('#board .sort-origin'),slotTier:index(document.querySelector('#board .sort-slot')?.parentElement),hitTier:pt?index(document.elementFromPoint(pt.x,pt.y)?.closest('#board [data-drop-tier]')):null,zoneRects:[...document.querySelectorAll('#board [data-drop-tier]')].map(n=>{const {x,y,width,height}=n.getBoundingClientRect();return{x,y,width,height};})};};
  for(const kind of ['dragstart','dragover','drop','dragend'])document.addEventListener(kind,event=>{if(window.trace.length<100)window.trace.push({kind,trusted:event.isTrusted,prevented:event.defaultPrevented,types:[...event.dataTransfer.types],effect:event.dataTransfer.effectAllowed,dropEffect:event.dataTransfer.dropEffect,eventTier:index(event.target.closest('[data-drop-tier]')),...window.inspectHover()});});
 });}
 async function input(p,label,action){let timer;try{await Promise.race([action(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native input timed out: '+label)),10000);})]);}catch(error){evidence.blocked={label,trace:await p.evaluate(()=>window.trace),state:await p.evaluate(()=>window.inspectHover())};throw error;}finally{clearTimeout(timer);}}
 const h=await page();await h.evaluate(async()=>{
  const {emptyAlbum}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs'),album=emptyAlbum();album.name='Stationary hover fixture';album.board.tiers=album.board.tiers.slice(0,4);album.board.tiers[0].name='Preserve custom category';
  for(let i=0;i<21;i++){const c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillRect(0,0,32,32);const image={id:'image-'+i,label:'Fixture '+i,data:c.toDataURL()};album.images.push(image);(i<16?album.board.tiers[0].items:i<19?album.board.tiers[1].items:album.board.unranked).push(image.id);}await saveAlbum(album);
 });await h.reload();await hook(h);await h.getByRole('button',{name:'Open',exact:true}).click();await h.locator('#host').click();await h.locator('#host-name').fill('Fixture Host');await h.locator('#host-form button[type=submit]').click();await h.waitForFunction(()=>window.testRoom?.connected);
 const g=await page();await hook(g);const invite=await h.locator('#invite-output').inputValue();await g.evaluate(invite=>location.hash=new URL(invite).hash,invite);await g.locator('#join-name').fill('Fixture Guest');await g.locator('#confirm-join').click();await g.waitForFunction(()=>window.testRoom?.connected&&!!document.querySelector('#board .editable'));
 for(const [p,label]of [[h,'host'],[g,'guest']].filter(([,label])=>!process.env.DRAG_ROLE||process.env.DRAG_ROLE===label))for(const width of process.env.EXPECT_UNSTABLE?[390]:[390,1024,1280])for(const theme of process.env.EXPECT_UNSTABLE?['light']:['light','dark']){
  await p.setViewportSize({width,height:1100});await p.evaluate(theme=>PuzzleTheme.setPreference(theme),theme);
  const tile=p.locator('#board [data-image="image-15"]'),target=p.locator('#board [data-drop-tier]').nth(2);
  if(process.env.SELECTED_SOURCE)await (process.env.SELECTED_SOURCE==='other'?p.locator('#board [data-image="image-20"]'):tile).press('Enter');
  const names=await p.evaluate(()=>window.testRoom.players.get(window.testRoom.self).board.tiers.map(t=>t.name));
  await target.scrollIntoViewIfNeeded();const a=await tile.boundingBox(),b=await target.boundingBox(),point={x:b.x+35,y:b.y+b.height-8};assert(a.y>=0&&point.y<1100);
  await p.evaluate(point=>{window.trace=[];window.targetPoint=point;window.zoneIndices=new Map([...document.querySelectorAll('#board [data-drop-tier]')].map((n,i)=>[n,i]));},point);const before=await p.evaluate(()=>window.inspectHover());evidence.preInput={label,width,theme,before,sourcePoint:a,targetPoint:point};
  await input(p,'approach',()=>p.mouse.move(a.x+a.width/2,a.y+a.height/2));await input(p,'down',()=>p.mouse.down());await input(p,'start',()=>p.mouse.move(a.x+a.width/2+12,a.y+a.height/2,{steps:4}));
  await input(p,'target',()=>p.mouse.move(point.x,point.y));await input(p,'stationary over',()=>p.mouse.move(point.x,point.y));const frames=[];
  // No pointer motion: sample immediately and across native stationary-hover frames.
  for(let n=0;n<5;n++){frames.push(await p.evaluate(()=>window.inspectHover()));await p.waitForTimeout(100);}
  await p.screenshot({path:`${out}/${label}-${width}-${theme}-hover.png`});
  await input(p,'release',()=>p.mouse.up());const trace=await p.evaluate(()=>window.trace),after=await p.evaluate(()=>window.inspectHover());
  const result={label,width,theme,before,frames,trace,after};evidence.cases.push(result);fs.writeFileSync(out+'/evidence.json',JSON.stringify(evidence,null,2));
  assert(trace.some(e=>e.kind==='dragstart'&&e.trusted&&e.types.includes('text/x-tier-image')),'trusted custom dragstart');
  if(process.env.EXPECT_UNSTABLE){
   assert(trace.some(e=>e.kind==='dragover'&&e.trusted&&e.prevented&&e.eventTier===2&&e.hitTier!==2),'accepted native target displaced solely by preview');
   assert(frames.some(f=>f.hitTier!==2),'stationary pointer no longer over intended target');
   // The click workaround independently proves readiness/editability at the time of failure.
   await p.locator('#board [data-image="image-20"]').press('Enter');await p.locator('#board .place-here').nth(2).press('Enter');
   assert(await p.evaluate(()=>window.testRoom.players.get(window.testRoom.self).board.tiers[2].items.includes('image-20')),'Place here still edits');
  }else{
   assert(frames.every(f=>f.hitTier===2),'preview must not move intended target away from a stationary pointer');
   assert(trace.some(e=>e.kind==='drop'&&e.trusted&&e.prevented&&e.eventTier===2),'drop must reach intended target');
   assert(await p.evaluate(()=>window.testRoom.players.get(window.testRoom.self).board.tiers[2].items.includes('image-15')),'intended tier receives card');
   assert.equal(after.seq,before.seq+1,'exactly one ranking edit');
   const own=await p.evaluate(()=>({id:window.testRoom.self,seq:window.testRoom.players.get(window.testRoom.self).seq}));
   await h.waitForFunction(({id,seq})=>window.testRoom.players.get(id)?.seq===seq,own);
   assert.deepEqual(await p.evaluate(()=>window.testRoom.players.get(window.testRoom.self).board.tiers.map(t=>t.name)),names,'category names preserved');
   assert(frames.every(f=>JSON.stringify(f.source)===JSON.stringify(before.source)),'source position and dimensions remain intact');
   assert.deepEqual(trace.find(e=>e.kind==='dragstart').source,before.source,'native dragstart must not reflow its source');
   await tile.press('Enter');await p.screenshot({path:`${out}/${label}-${width}-${theme}-keyboard.png`});await p.locator('#board .place-here').first().press('Enter');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no document overflow');
  }
 }
 console.log('PASS '+(process.env.EXPECT_UNSTABLE?'reproduced accepted target moving away while stationary; Place here still works':'stable stationary target and native drop')+' on real connected host AND guest');
}finally{fs.writeFileSync(out+'/evidence.json',JSON.stringify(evidence,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
