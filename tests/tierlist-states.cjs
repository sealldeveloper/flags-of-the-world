const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR || '/tmp/tierlist-states';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true}),p=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(base+'/tierlist/');
 await p.evaluate(async()=>{
  const {emptyAlbum,id}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');const album=emptyAlbum();album.name='Dense album and interaction states';
  for(let n=0;n<30;n++) {const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle=['#6655aa','#aa6633','#227766'][n%3];ctx.fillRect(0,0,80,80);ctx.fillStyle='#fff';ctx.font='24px sans-serif';ctx.fillText(String(n+1),20,50);const image={id:id(),label:`A detailed label for image number ${n+1}`,data:canvas.toDataURL('image/webp',.82)};album.images.push(image);album.board.unranked.push(image.id);}
  await saveAlbum(album);
 });
 await p.reload();await p.getByRole('button',{name:'Open',exact:true}).click();
 async function shot(name){assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');await p.screenshot({path:`${out}/${name}.png`,fullPage:true});}
 for(const width of [1920,1024,390,320]) {
  await p.setViewportSize({width,height:900});
  for(const theme of ['light','dark']) {
   await p.evaluate(t=>PuzzleTheme.setPreference(t),theme);
   await p.locator('#add-tier').hover();await shot(`hover-${width}-${theme}`);
   await p.locator('#board .tile').first().focus();await shot(`focus-${width}-${theme}`);
   await p.locator('#board .tile').first().press('Enter');assert(await p.locator('#selection-bar').isVisible());await shot(`selected-${width}-${theme}`);
   await p.locator('#cancel-selection').click();
   await p.getByRole('button',{name:'Edit tier S',exact:true}).click();await shot(`tier-dialog-${width}-${theme}`);
   await p.locator('[data-close="tier-dialog"]').click();
   assert(await p.getByRole('button',{name:'Move tier S up',exact:true}).isDisabled());await p.getByRole('button',{name:'Move tier S down',exact:true}).click();
   await p.getByRole('button',{name:'Move tier S up',exact:true}).click();
  }
 }
 await p.setViewportSize({width:390,height:844});
 await p.locator('#board .tile').first().focus();await p.keyboard.press('Enter');
 await p.locator('#board .place-here').first().focus();await p.keyboard.press('Enter');
 assert.equal(await p.locator('#board .tier-row').first().locator('.tile').count(),1);
 // Touch drag from S into A, with both rows simultaneously in view.
 await p.locator('#board .tier-row').first().scrollIntoViewIfNeeded();
 const source=await p.locator('#board .tier-row').first().locator('.tile').boundingBox(),target=await p.locator('#board .tier-row').nth(1).locator('.tiles').boundingBox();
 const cdp=await p.context().newCDPSession(p),sx=source.x+30,sy=source.y+30,tx=target.x+40,ty=target.y+35;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
 for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+(tx-sx)*n/8,y:sy+(ty-sy)*n/8,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await p.locator('#board .tier-row').nth(1).locator('.tile').count(),1);
 assert.equal(await p.locator('.touch-ghost').count(),0);
 await shot('touch-drag-mobile');
 await p.getByRole('button',{name:'Edit tier A',exact:true}).click();await p.locator('#tier-delete').click();
 assert.equal(await p.locator('#board .tile').count(),30);assert.equal(await p.locator('#board .tier-row').count(),5);
 await p.locator('#reset').click();assert.equal(await p.locator('#board .tier-row').last().locator('.tile').count(),30);
 await p.locator('#tab-images').click();await p.locator('.image-card').first().getByRole('button',{name:'Remove',exact:true}).click();assert.equal(await p.locator('.image-card').count(),29);
 await p.locator('#tab-rank').click();assert.equal(await p.locator('#board .tile').count(),29);
 await p.locator('#back').click();await p.locator('.help summary').click();await shot('help-mobile');
 await p.locator('#join').click();assert((await p.locator('#error').textContent()).includes('Paste a lobby invite'));await shot('missing-invite');
 await p.locator('#import').click();await p.locator('#code').fill('TIER1.invalid');await p.locator('#import-code').click();await p.waitForFunction(()=>document.querySelector('#code-error').textContent.length>0);await shot('import-error-mobile');
 await p.locator('[data-close="code-dialog"]').click();
 // Import does not silently overwrite an album with the same ID.
 await p.getByRole('button',{name:'Open',exact:true}).click();await p.locator('#export').click();await p.waitForFunction(()=>document.querySelector('#code').value.startsWith('TIER1.'));const code=await p.locator('#code').inputValue();await p.locator('[data-close="code-dialog"]').click();await p.locator('#back').click();
 await p.locator('#import').click();await p.locator('#code').fill(code);await p.locator('#import-code').click();await p.locator('#workspace').waitFor({state:'visible'});await p.locator('#back').click();await p.locator('#library').waitFor({state:'visible'});assert.equal(await p.locator('.album-card').count(),2);
 // A full board rejects another tier without opening a settings dialog for a missing row.
 await p.evaluate(async()=>{
  const {emptyAlbum,id,MAX_BOARD}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');const album=emptyAlbum();album.name='Board limit';
  while(true){const next=structuredClone(album.board);next.tiers.push({id:id(),name:'New tier',color:'#b5c7eb',items:[]});if(new TextEncoder().encode(JSON.stringify(next)).length>MAX_BOARD)break;album.board=next;}
  await saveAlbum(album);
 });
 await p.reload();await p.locator('.album-card').filter({hasText:'Board limit'}).getByRole('button',{name:'Open',exact:true}).click();
 const count=await p.locator('#board .tier-row').count();await p.locator('#add-tier').click();assert((await p.locator('#error').textContent()).includes('48 KiB'));assert.equal(await p.locator('#board .tier-row').count(),count);assert(await p.locator('#tier-dialog').isHidden());
 assert.deepEqual(errors,[]);console.log('PASS: hover, focus, selection, row dialogs, disabled boundaries, category move/delete, keyboard ranking, actual CDP touch drag, dense mobile layouts, help, import errors, safe duplicate import and board-size rejection.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
