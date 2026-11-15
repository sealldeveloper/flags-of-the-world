// Real iroh RTTs shared by the host; sidebar measurements never rebuild focused controls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:18765',out=process.env.SCREENSHOT_DIR||'/tmp/tierlist-latency';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser'});try{
 fs.mkdirSync(out,{recursive:true});const errors=[];
 async function instrument(p){await p.evaluate(async()=>{const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;TierRoom.prototype.emit=function(){window.testRoom=this;emit.call(this);};});}
 async function page(){const p=await browser.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/tierlist/');await instrument(p);return p;}
 const host=await page(),guest=await page();
 await host.evaluate(async()=>{const {emptyAlbum}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');const album=emptyAlbum(),c=document.createElement('canvas');c.width=c.height=32;c.getContext('2d').fillRect(0,0,32,32);album.name='Measured sidebar ping';album.images=[{id:'image',label:'Test image',data:c.toDataURL('image/png')}];album.board.unranked=['image'];await saveAlbum(album);});
 await host.reload();await instrument(host);await host.getByRole('button',{name:'Open',exact:true}).click();await host.locator('#host').click();await host.locator('#host-name').fill('Host');await host.locator('#host-form button[type=submit]').click();await host.waitForFunction(()=>window.testRoom?.connected);
 const hostId=await host.evaluate(()=>window.testRoom.self),invite=await host.locator('#invite-output').inputValue();
 async function join(p,name){await p.goto(invite);await p.locator('#join-name').fill(name);await p.locator('#confirm-join').click();await p.waitForFunction(()=>window.testRoom?.connected);}
 await join(guest,'Guest with a longer display name');const guestId=await guest.evaluate(()=>window.testRoom.self);
 for(const p of [host,guest]){await p.waitForFunction(id=>Number.isInteger(window.testRoom.latency[id]),guestId);assert.match(await p.locator(`[data-player="${guestId}"] .player-ping`).textContent(),/ · \d+ ms/);assert.equal(await p.locator(`[data-player="${hostId}"] .player-ping`).textContent(),' · 0 ms');assert.match(await p.locator(`[data-player="${guestId}"] .player-ping`).getAttribute('title'),/Round-trip.*host/);}
 await host.waitForFunction(()=>[...window.testRoom.players.values()].every(p=>p.phase==='ready'&&p.originals===1));
 const control=await host.locator(`#players [data-player="${guestId}"] .player-select`).elementHandle();await control.focus();
 // Trigger a second real probe without fabricating its return time or response.
 const measuredAt=await host.evaluate(async id=>{const r=window.testRoom,entry=[...r.peers].find(([,peer])=>peer.seat===id);const measuredAt=entry[1].measuredAt;r.ping(...entry);return measuredAt;},guestId);
 await host.waitForFunction(({id,measuredAt})=>[...window.testRoom.peers.values()].find(p=>p.seat===id).measuredAt>measuredAt,{id:guestId,measuredAt});assert(await control.evaluate(node=>node===document.activeElement));
 const late=await page();await join(late,'Late guest');await late.waitForFunction(id=>Number.isInteger(window.testRoom.latency[id]),guestId);await host.waitForFunction(()=>[...window.testRoom.players.values()].every(p=>p.phase==='ready'&&p.originals===1&&Number.isInteger(window.testRoom.latency[p.id])));
 for(const [width,height]of [[1920,1080],[1024,768],[390,844]])for(const theme of ['light','dark']){await host.setViewportSize({width,height});await host.evaluate(t=>PuzzleTheme.setPreference(t),theme);await host.locator('#players').scrollIntoViewIfNeeded();assert(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await host.screenshot({path:`${out}/sidebar-${width}-${theme}.png`});}
 // A disconnected seat keeps its sidebar row but drops the last measured ping.
 await guest.evaluate(()=>window.testRoom.transport.close());await host.waitForFunction(id=>window.testRoom.players.get(id)?.online===false,guestId);await late.waitForFunction(id=>window.testRoom.latency[id]===null,guestId);assert.equal(await host.locator(`#players [data-player="${guestId}"] .player-ping`).textContent(),' · — ms');await host.screenshot({path:out+'/sidebar-offline.png'});
 // Test-only missing-sample state: no invented zero before a probe completes.
 await host.evaluate(id=>{window.testRoom.latency={...window.testRoom.latency,[id]:null};window.testRoom.emit();},await late.evaluate(()=>window.testRoom.self));await host.screenshot({path:out+'/sidebar-measuring.png'});
 assert.deepEqual(errors,[]);console.log('PASS real three-peer RTTs in host/guest sidebars, late-join latency map, 0 ms local host, focus-stable refresh, offline/missing samples, responsive light/dark screenshots.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
