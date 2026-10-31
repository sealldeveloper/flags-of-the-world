// Real public iroh relays, 16 isolated browser contexts, maximum-length fields and visual UAT.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR || '/tmp/tierlist-activity-large';fs.mkdirSync(out,{recursive:true});
const title=('A general purpose tierlist with the longest supported title and deliberately dense content ').repeat(2).slice(0,120);
const palette=['#bd5948','#4d8abf','#9b62b2','#598d4e','#c49330','#7470c7','#b65f8a','#39998d','#b1773c','#698cbb','#b55f64','#878342','#648b85','#986b48','#8775a4','#697c45'];
const name=index=>(`Player ${String(index).padStart(2,'0')} `+(index===1?'W'.repeat(40):'with a maximum length display name')).slice(0,40);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true});
 const errors=[],sockets=[],pages=[];
 try {
  async function page(){const p=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});pages.push(p);p.setDefaultTimeout(60000);p.on('pageerror',error=>errors.push(error.message));p.on('websocket',ws=>sockets.push(ws.url()));p.on('dialog',dialog=>dialog.accept());await p.goto(base+'/tierlist/');await instrument(p);return p;}
  async function instrument(p){await p.evaluate(async()=>{const {TierRoom}=await import('./room.mjs'),emit=TierRoom.prototype.emit;TierRoom.prototype.emit=function(){window.testRoom=this;window.observedPhases ||= new Set();for(const player of this.players.values())window.observedPhases.add(player.phase);emit.call(this);};});}
  async function shot(p,label,fullPage=false){await p.evaluate(()=>new Promise(requestAnimationFrame));if(await p.locator('#images-view').isVisible())await p.waitForFunction(()=>[...document.querySelectorAll('.image-card textarea')].every(node=>node.scrollHeight<=node.clientHeight+2));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' horizontal overflow');await p.screenshot({path:`${out}/${label}.png`,fullPage});}
  async function matrix(p,label,fullPage=false){for(const [width,height] of[[1920,1080],[1024,768],[390,844],[320,740]])for(const theme of['light','dark']){await p.setViewportSize({width,height});await p.evaluate(value=>PuzzleTheme.setPreference(value),theme);await shot(p,`${label}-${width}-${theme}`,fullPage);}await p.setViewportSize({width:1920,height:1080});}
  async function ready(p){await p.locator('#lobby-details').waitFor({state:'visible',timeout:120000});await p.waitForFunction(()=>window.testRoom?.connected && [...window.testRoom.players.values()].find(player=>player.id===window.testRoom.self)?.phase==='ready');}
  const host=await page();
  await host.evaluate(async()=>{
   const {emptyAlbum,id}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');const album=emptyAlbum();
   album.name='Fixture tierlist';album.board.tiers=album.board.tiers.slice(0,4);
   album.board.tiers.forEach((tier,index)=>{tier.name=(index===1?'W'.repeat(100):`Category ${index+1} with the longest supported name for checking wrapped category labels `.repeat(2)).slice(0,99)+'X';tier.color=['#ffffff','#000000','#ffff7f','#173050'][index];});
   for(let index=0;index<8;index++){
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=128;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(192,128);let seed=index+1;
    for(let at=0;at<pixels.data.length;at+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[at]=seed&255;pixels.data[at+1]=(seed>>>8)&255;pixels.data[at+2]=(seed>>>16)&255;pixels.data[at+3]=255;}ctx.putImageData(pixels,0,0);
    const image={id:id(),label:(index===0?'LongImageName'.repeat(15):`Image ${index+1} with a long descriptive name for a game character or another general purpose object `.repeat(2)).slice(0,160),data:canvas.toDataURL('image/webp',.8)};album.images.push(image);album.board.unranked.push(image.id);
   }
   album.board.tiers[0].items.push(album.board.unranked.shift());await saveAlbum(album);const other=emptyAlbum();other.name='Another local tierlist';await saveAlbum(other);
  });
  await host.reload();await instrument(host);await host.locator('.album-card').filter({hasText:'Fixture tierlist'}).getByRole('button',{name:'Open',exact:true}).click();
  await host.locator('#album-name').fill(title);await host.locator('#album-name').blur();assert.equal(await host.locator('#album-name').inputValue(),title);
  await host.locator('#tab-images').click();assert.equal(await host.locator('.image-card textarea').first().inputValue().then(value=>value.length),160);
  const originalOrder=await host.locator('.image-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.albumImage));
  // Actual native drag via explicit handles, not synthetic drop events.
  await host.locator('.image-drag-handle').nth(7).dragTo(host.locator('.image-card').first(),{targetPosition:{x:8,y:70}});
  assert.equal(await host.locator('.image-card').first().getAttribute('data-album-image'),originalOrder[7]);
  await host.locator('#images-list').click();assert(await host.locator('#image-grid').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length===1));
  await host.setViewportSize({width:1920,height:2200});await host.evaluate(()=>new Promise(requestAnimationFrame));await host.evaluate(()=>scrollTo(0,0));
  await host.evaluate(()=>{window.dragTrace=[];for(const type of['dragstart','drop'])document.addEventListener(type,event=>window.dragTrace.push({type,id:event.target.closest('.image-card')?.dataset.albumImage,x:event.clientX,y:event.clientY,scroll:scrollY}),true);});
  const lastHeight=await host.locator('.image-card').last().evaluate(node=>node.clientHeight);await host.locator('.image-drag-handle').first().dragTo(host.locator('.image-card').last(),{targetPosition:{x:8,y:lastHeight-4}});
  await shot(host,'list-native-drop',true);assert.deepEqual(await host.locator('.image-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.albumImage)),originalOrder,JSON.stringify(await host.evaluate(()=>window.dragTrace)));
  // Multiline names remain editable, fully visible and portable.
  const multiline=('First line for a general purpose image\nSecond line with a very long descriptive image name ').repeat(2).slice(0,160);
  await host.locator('.image-card textarea').first().fill(multiline);await host.locator('.image-card textarea').first().blur();
  for(const layout of['grid','list']){await host.locator('#images-'+layout).click();await matrix(host,'images-'+layout,true);assert(await host.locator('.image-card textarea').evaluateAll(nodes=>nodes.every(node=>node.scrollHeight<=node.clientHeight+2)));}
  await host.setViewportSize({width:390,height:844});await host.locator('#images-list').click();await host.locator('.image-card').first().evaluate(node=>node.scrollIntoView({block:'start'}));
  const client=await host.context().newCDPSession(host),from=await host.locator('.image-drag-handle').first().boundingBox(),target=await host.locator('.image-card').nth(1).boundingBox();
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x+12,y:from.y+15}]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+50,y:target.y+target.height-8}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await host.locator('.image-card').nth(1).getAttribute('data-album-image'),originalOrder[0]);await host.getByRole('button',{name:'Move image 2 earlier',exact:true}).click();
  await host.locator('#tab-rank').click();assert.equal(await host.locator('#board .tier-row').first().locator('.tile').getAttribute('data-image'),originalOrder[0]);
  await host.locator('#board .tier-name').first().click();assert.equal((await host.locator('#tier-name').inputValue()).length,100);await shot(host,'tier-name-max-mobile');await host.locator('[data-close="tier-dialog"]').click();
  await host.locator('#host').click();await host.locator('#host-name').fill(name(0));await host.locator('#host-color').fill(palette[0]);await shot(host,'host-name-max-mobile');await host.locator('#host-form button[type=submit]').click();await ready(host);
  assert(await host.locator('#activity-panel').isVisible());assert.equal(await host.locator('#watch-panel,#conversation-panel,#chat-form').count(),0);
  const invite=await host.locator('#invite-output').inputValue(),code=invite.split('#join=')[1];assert(code.startsWith('TL5.'));assert(code.length<=140);assert(await host.locator('#invite-output').isHidden());
  await host.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedInvite=value;}}}));await host.locator('#copy-invite').click();assert.equal(await host.evaluate(()=>window.copiedInvite),invite);await host.locator('#copy-invite-code').click();assert.equal(await host.evaluate(()=>window.copiedInvite),code);
  await host.setViewportSize({width:1920,height:1080});
  async function join(index,slow=false){const p=await page();await p.evaluate(async slow=>{if(!slow)return;const {TierRoom}=await import('./room.mjs'),receive=TierRoom.prototype.guestMessage;TierRoom.prototype.guestMessage=async function(message){if(message.type==='chunk')await new Promise(resolve=>setTimeout(resolve,70));return receive.call(this,message);};},slow);await p.goto(invite);await p.locator('#join-dialog').waitFor({state:'visible'});await p.locator('#join-name').fill(name(index));await p.locator('#join-color').fill(palette[index%16]);if(index===1){await shot(p,'join-name-max');}await p.locator('#confirm-join').click();return p;}
  const first=await join(1,true);await host.waitForFunction(()=>[...window.testRoom.players.values()].some(player=>player.phase==='loading'));
  await shot(host,'assets-loading');await ready(first);await host.waitForFunction(()=>[...window.testRoom.players.values()].every(player=>player.phase==='ready'));
  assert(await host.evaluate(()=>window.observedPhases.has('checking') && window.observedPhases.has('ready')));
  const second=await join(2);await ready(second);await host.waitForFunction(()=>document.querySelectorAll('#players .player').length===3);
  const peers=[host,first,second];
  // Three-player regression, each independent board updates while Activity stays open.
  const hostBoard=await host.locator('#board .tier-board').elementHandle();
  await Promise.all([first,second].map(async(p,index)=>{await p.locator('#board .tier-row').last().locator('.tile').first().press('Enter');await p.locator('#board .place-here').nth(index+1).click();}));
  await host.waitForFunction(()=>window.testRoom.events.filter(event=>event.parts?.some(part=>part.type==='image')).length>=2);
  assert(await hostBoard.evaluate(node=>node===document.querySelector('#board .tier-board')));
  await host.locator('#activity-feed .activity-ref[data-reference="image"]').last().click();assert(await host.locator('#everyone-view').isVisible());
  await host.waitForFunction(()=>document.querySelectorAll('#comparison .comparison-card').length===3);
  assert.equal(await host.locator('#comparison [data-tier="unranked"]').count(),3);assert.equal(await host.locator('#comparison .activity-highlight[data-image]').count(),1);
  for(const p of peers){await p.locator('#tab-everyone').click();assert.equal(await p.locator('#comparison .comparison-card').count(),3);assert.equal(await p.locator('#comparison .tile').count(),24);}
  await matrix(host,'three-everyone',true);await host.locator('#tab-rank').click();await matrix(host,'three-rank',true);
  assert(await host.locator('#activity-feed .activity-ref').evaluateAll(nodes=>nodes.every(node=>node.style.getPropertyValue('--reference-color') && ['#ffffff','#000000'].includes(node.style.getPropertyValue('--reference-bg')))));
  await host.locator('#activity-feed .activity-ref').last().focus();await shot(host,'activity-reference-focus');
  // Scrolled Activity does not jump while friends make more edits.
  await first.locator('#tab-rank').click();for(let index=0;index<8;index++)await first.locator('#board .tier-moves button').nth(1).click();
  await host.waitForFunction(()=>window.testRoom.events.filter(event=>event.text==='Reordered tiers').length>=8);
  await host.locator('#activity-feed').evaluate(feed=>feed.scrollTop=0);await first.locator('#board .tier-moves button').nth(1).click();await host.waitForFunction(()=>window.testRoom.events.filter(event=>event.text==='Reordered tiers').length>=9);
  assert.equal(await host.locator('#activity-feed').evaluate(feed=>feed.scrollTop),0);
  // Join the remaining 13 seats in small concurrent batches using real endpoints.
  for(let index=3;index<16;index+=3){const batch=await Promise.all(Array.from({length:Math.min(3,16-index)},(_,at)=>join(index+at)));await Promise.all(batch.map(ready));peers.push(...batch);}
  await host.waitForFunction(()=>window.testRoom.players.size===16 && [...window.testRoom.players.values()].every(player=>player.phase==='ready'));
  for(const p of peers){await p.waitForFunction(()=>window.testRoom.players.size===16);await p.locator('#tab-everyone').click();assert.equal(await p.locator('#comparison .comparison-card').count(),16);assert.equal(await p.locator('#comparison [data-tier="unranked"]').count(),16);assert.equal(await p.locator('#comparison .tile').count(),128);}
  const colours=await host.locator('#players .player').evaluateAll(nodes=>nodes.map(node=>node.style.getPropertyValue('--player-color')));assert.equal(new Set(colours).size,16);
  // All seats independently edit their board, without losing anyone else's rows.
  await Promise.all(peers.map(async(p,index)=>{await p.locator('#tab-rank').click();await p.locator('#board .tier-row').last().locator('.tile').first().press('Enter');await p.locator('#board .place-here').nth(index%4).click();await p.locator('#board .tier-name').first().click();await p.locator('#tier-name').fill((`Player ${index} independently edited category `+'Long category name '.repeat(8)).slice(0,100));await p.locator('#tier-color').fill(index%2?'#000000':'#ffffff');await p.locator('#tier-form button[type=submit]').click();}));
  await host.waitForFunction(()=>[...window.testRoom.players.values()].every(player=>player.seq>=1));
  const expected=Object.fromEntries(await Promise.all(peers.map(p=>p.evaluate(()=>[window.testRoom.self,JSON.stringify(window.testRoom.players.get(window.testRoom.self).board)]))));
  await Promise.all(peers.map(p=>p.waitForFunction(expected=>Object.entries(expected).every(([id,board])=>JSON.stringify(window.testRoom.players.get(id)?.board)===board),expected)));
  for(const p of peers){await p.locator('#tab-everyone').click();assert.equal(await p.locator('#comparison .comparison-card').count(),16);assert.equal(await p.locator('#comparison .tile').count(),128);assert.equal(await p.locator('#comparison .tier-row').count(),80);}
  console.log('PASS 16 real peers, complete three-player/16-player Everyone boards and simultaneous independent updates');
  await host.locator('#tab-everyone').click();
  for(const [width,height] of[[1920,1080],[1024,768],[390,844],[320,740]])for(const theme of['light','dark']){
   await host.setViewportSize({width,height});await host.evaluate(value=>PuzzleTheme.setPreference(value),theme);
   for(const part of['top','middle','bottom']){await host.evaluate(part=>scrollTo(0,part==='top'?0:part==='middle'?document.documentElement.scrollHeight/2:document.documentElement.scrollHeight),part);await shot(host,`sixteen-everyone-${width}-${theme}-${part}`);}
   assert(await host.locator('#comparison .tier-label').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)));
  }
  await host.locator('#tab-rank').click();await matrix(host,'sixteen-rank');
  await host.locator('#group-export').click();await host.locator('#group-options').waitFor({state:'visible',timeout:120000});
  for(const theme of['light','dark']){
   await host.locator('#group-'+theme).click();const downloading=host.waitForEvent('download');await host.locator('#download-group').click();const download=await downloading;assert(download.suggestedFilename().endsWith(`-everyone-${theme}.png`));fs.writeFileSync(`${out}/sixteen-players-${theme}.png`,fs.readFileSync(await download.path()));
   for(const part of['top','middle','bottom']){await host.locator('#group-preview').evaluate((node,part)=>node.scrollTop=part==='top'?0:part==='middle'?node.scrollHeight/2:node.scrollHeight,part);await shot(host,`sixteen-group-${theme}-${part}`);}
  }
  await host.locator('[data-close="group-dialog"]').click();
  const overflow=await join(16);await overflow.waitForFunction(()=>document.querySelector('#join-error').textContent.includes('full'));assert(await overflow.locator('#join-dialog').isVisible());await shot(overflow,'lobby-full');
  const firstId=await first.evaluate(()=>window.testRoom.self),firstColour=await host.locator(`#players [data-player="${firstId}"]`).getAttribute('style');
  await first.reload();await instrument(first);await first.locator('#join-dialog').waitFor({state:'visible'});await first.locator('#confirm-join').click();await ready(first);
  await host.waitForFunction(id=>window.testRoom.players.get(id)?.phase==='ready',firstId);assert.equal(await host.locator(`#players [data-player="${firstId}"]`).getAttribute('style'),firstColour);
  await first.waitForFunction(()=>document.querySelector('#activity-feed').textContent.includes('Reordered'));
  await first.locator('#back').click();await first.locator('#library').waitFor({state:'visible'});assert(await first.locator('#return-lobby').isVisible());assert(await first.evaluate(()=>window.testRoom.connected));await first.locator('#leave').click();await host.waitForFunction(id=>window.testRoom.players.get(id)?.phase==='offline',firstId);
  // A full lobby still reserves offline seats. Removing one revokes its old resume.
  await overflow.locator('#confirm-join').click();await overflow.waitForFunction(()=>document.querySelector('#join-error').textContent.includes('full'));
  await host.setViewportSize({width:1920,height:1080});await host.locator(`#players [data-player="${firstId}"] .remove-player`).click();await host.waitForFunction(()=>window.testRoom.players.size===15);
  await first.goto(invite);await first.locator('#join-name').fill(name(1));await first.locator('#confirm-join').click();await ready(first);await host.waitForFunction(()=>window.testRoom.players.size===16);
  const secondId=await second.evaluate(()=>window.testRoom.self),revoked=await second.evaluate(()=>sessionStorage.getItem('tierlist-resume'));
  await host.locator(`#players [data-player="${secondId}"] .remove-player`).click();await second.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('Lobby ended'));
  await second.evaluate(value=>sessionStorage.setItem('tierlist-resume',value),revoked);await second.reload();await instrument(second);await second.locator('#confirm-join').click();await second.waitForFunction(()=>document.querySelector('#join-error').textContent.includes('no longer available'));
  const replacement=await join(17);await ready(replacement);await host.waitForFunction(()=>window.testRoom.players.size===16);
  await host.locator('#back').click();await host.locator('#library').waitFor({state:'visible'});assert(await host.evaluate(()=>window.testRoom.connected));await host.locator('#leave').click();await first.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('Lobby ended'));assert(await first.locator('#add-tier').isDisabled());
  await host.locator('.album-card').filter({hasText:'Another local tierlist'}).getByRole('button',{name:'Open',exact:true}).click();await host.locator('#back').click();await host.locator('#import').click();await host.locator('#method-tiermaker').click();await host.locator('#tiermaker-url').fill('https://tiermaker.com/create/'+ 'x'.repeat(2020));await host.setViewportSize({width:320,height:740});await shot(host,'import-url-max-mobile');
  const field=await host.locator('#tiermaker-url').boundingBox(),submit=await host.locator('#import-tiermaker').boundingBox();assert(submit.y>=field.y+field.height+10);
  await host.locator('[data-close="code-dialog"]').click();await host.locator('#invite-input').fill('x'.repeat(5000));await host.locator('#player-name').fill(name(0));await shot(host,'invite-max-mobile');
  assert(!/albums?|chat|watching/i.test(await host.locator('body').innerText()));assert.deepEqual(errors,[]);assert(sockets.length>=18);
  console.log(`PASS maximum input lengths, Grid/List native and touch ordering, multiline labels, linked/contrasting activity, loading/checking/ready/offline states, resume, capacity/removal, closure and responsive CSS. ${sockets.length} real relay sockets.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
