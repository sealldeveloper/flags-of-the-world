const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18767',out=process.env.SCREENSHOT_DIR || '/tmp/tierlist-activity-repeat';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true}),errors=[],sockets=[];
 try {
  async function instrument(p){await p.evaluate(async()=>{const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;TierRoom.prototype.emit=function(){window.testRoom=this;emit.call(this);};});}
  async function page(){const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));p.on('websocket',ws=>sockets.push(ws.url()));await p.goto(base+'/tierlist/');await instrument(p);return p;}
  async function ready(p){await p.waitForFunction(()=>window.testRoom?.connected);await p.locator('#lobby-details').waitFor({state:'visible'});}
  const host=await page(),guest=await page();
  await host.evaluate(async()=>{
   const {emptyAlbum,id}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');const album=emptyAlbum();album.name='Consecutive activity';album.board.tiers=album.board.tiers.slice(0,2);
   for(let index=0;index<9;index++){
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle=['#34648f','#9a4c32','#29734d'][index%3];ctx.fillRect(0,0,160,100);ctx.fillStyle='#fff';ctx.font='bold 48px sans-serif';ctx.fillText(String(index+1),60,65);
    const image={id:id(),label:`Image ${index+1}`,data:canvas.toDataURL('image/webp')};album.images.push(image);(index<6?album.board.tiers[Math.floor(index/3)].items:album.board.unranked).push(image.id);
   }
   await saveAlbum(album);
  });
  await host.reload();await instrument(host);await host.getByRole('button',{name:'Open',exact:true}).click();await host.locator('#host').click();await host.locator('#host-name').fill('Host');await host.locator('#host-form button[type=submit]').click();await ready(host);
  const invite=await host.locator('#invite-output').inputValue();
  async function join(p,name){await p.goto(invite);await p.locator('#join-name').fill(name);await p.locator('#confirm-join').click();await ready(p);await host.waitForFunction(()=>[...window.testRoom.players.values()].every(player=>player.phase==='ready'));}
  await join(guest,'Guest');await guest.waitForFunction(()=>window.testRoom.events.some(event=>event.text==='Ready'));
  const start=await host.evaluate(()=>window.testRoom.events.at(-1).id),guestId=await guest.evaluate(()=>window.testRoom.self);
  // Actual accessible board controls generate the normal guest -> host board messages.
  async function reorder(p,tier){
   const before=await host.evaluate(()=>window.testRoom.events.at(-1).id),row=p.locator('#board .tier-row').nth(tier),old=await row.locator('[data-image]').evaluateAll(nodes=>nodes.map(node=>node.dataset.image));
   await row.locator('[data-image]').first().press('Enter');await row.locator('.place-here').click();
   assert.deepEqual(await row.locator('[data-image]').evaluateAll(nodes=>nodes.map(node=>node.dataset.image)),[...old.slice(1),old[0]]);
   await host.waitForFunction(id=>window.testRoom.events.at(-1).id>id,before);const id=await host.evaluate(()=>window.testRoom.events.at(-1).id);await guest.waitForFunction(id=>window.testRoom.events.some(event=>event.id===id),id);return id;
  }
  for(let index=0;index<3;index++)await reorder(guest,0);
  const groupedId=start+1;
  for(const p of [host,guest]){
   const entry=p.locator(`#activity-feed [data-event="${groupedId}"]`);assert.equal(await entry.locator('.event-repeat').textContent(),'3×');assert.equal(await entry.locator('.event-repeat').getAttribute('aria-label'),'Repeated 3 times');assert((await entry.locator('.event-repeat').ariaSnapshot()).includes('img "Repeated 3 times"'));
   const latest=await p.evaluate(()=>window.testRoom.events.at(-1).time);assert.equal(await entry.locator('time').getAttribute('datetime'),new Date(latest).toISOString());assert.equal(await p.locator('#activity-feed .feed-event').count(),start+1);
  }
  // Keep the existing reference node/focus as the same aggregate grows.
  const reference=await host.locator(`#activity-feed [data-event="${groupedId}"] .activity-ref`).elementHandle();await reference.focus();
  await reorder(guest,0);assert(await reference.evaluate(node=>node===document.activeElement));assert.equal(await host.locator(`#activity-feed [data-event="${groupedId}"] .event-repeat`).textContent(),'4×');
  await reorder(host,0);await reorder(guest,1);await reorder(guest,0);await reorder(guest,0);
  await guest.locator('#board .tier-name').first().click();await guest.locator('#tier-name').fill('Best');await guest.locator('#tier-form button[type=submit]').click();await host.waitForFunction(()=>window.testRoom.events.at(-1).text==='Renamed S to Best');
  await reorder(guest,0);await reorder(guest,0);await reorder(guest,2);await reorder(guest,2);
  const expected=[4,1,1,2,1,2,2];
  for(const p of [host,guest]){
   assert.deepEqual(await p.evaluate(start=>[...document.querySelectorAll('#activity-feed .feed-event')].filter(node=>Number(node.dataset.event)>start).map(node=>Number(node.querySelector('.event-repeat')?.textContent.replace('×','') || 1)),start),expected);
   const events=await p.evaluate(start=>window.testRoom.events.filter(event=>event.id>start),start);assert.equal(events.length,13);assert(events.every(event=>!('count' in event)));assert(events.slice(0,4).every(event=>event.actor===guestId && event.text==='Reordered images in S'));
  }
  // Reference buttons still locate the actor's tier from a coalesced row.
  await host.locator(`#activity-feed [data-event="${groupedId}"] .activity-ref`).click();await host.locator('#everyone-view').waitFor({state:'visible'});assert.equal(await host.locator('#comparison .activity-highlight').count(),1);await host.locator('#tab-rank').click();
  // A new peer receives raw bounded history and derives exactly the same groups.
  const late=await page();await join(late,'Late guest');await late.waitForFunction(()=>window.testRoom.events.some(event=>event.text==='Renamed S to Best'));
  assert.equal(await late.locator(`#activity-feed [data-event="${groupedId}"] .event-repeat`).textContent(),'4×');
  for(const [width,height] of [[1920,1080],[1024,768],[390,844]])for(const theme of ['light','dark']){
   await host.setViewportSize({width,height});await host.evaluate(theme=>PuzzleTheme.setPreference(theme),theme);await host.locator('#activity-panel').scrollIntoViewIfNeeded();await host.locator('#activity-feed').evaluate(node=>node.scrollTop=0);assert(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await host.screenshot({path:`${out}/multiplayer-repeat-${width}-${theme}.png`});
  }
  await host.locator('#activity-feed').evaluate(node=>node.scrollTop=node.scrollHeight);await host.screenshot({path:`${out}/multiplayer-repeat-mobile-bottom.png`});
  assert.deepEqual(errors,[]);assert(sockets.length>=3);console.log(`PASS real multiplayer: 13 host-derived board events -> counts ${expected}; latest timestamp, accessible badge, stable focus, tier/user/intervening-action boundaries, Unranked, references and late-join history. ${sockets.length} relay sockets. Screenshots: ${out}`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
