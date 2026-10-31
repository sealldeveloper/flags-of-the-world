const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR || '/tmp/tierlist-sort-zoom';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true});
 const p=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true}),errors=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/tierlist/');
 await p.evaluate(async()=>{
  const {emptyAlbum}=await import('./model.mjs'),{compressImage}=await import('./codec.mjs'),{saveAlbum}=await import('./storage.mjs');
  const album=emptyAlbum();album.name='Sorting and zoom';
  for(let n=0;n<12;n++) {
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;const ctx=canvas.getContext('2d');ctx.fillStyle=['#5566aa','#aa6633','#227766'][n%3];ctx.fillRect(0,0,1200,900);ctx.fillStyle='#fff';ctx.font='bold 300px sans-serif';ctx.fillText(String(n+1),430,550);
   const blob=await new Promise(r=>canvas.toBlob(r,'image/png')),image=await compressImage(new File([blob],`Image ${n+1}.png`,{type:'image/png'}));album.images.push(image);
   album.board.tiers[n<8?0:1].items.push(image.id);
  }
  await saveAlbum(album);
 });
 await p.reload();await p.getByRole('button',{name:'Open',exact:true}).click();
 const row=n=>p.locator('#board .tier-row').nth(n),ids=async n=>row(n).locator('[data-image]').evaluateAll(nodes=>nodes.map(n=>n.dataset.image));
 let expected=await ids(0);
 function moved(list,image,before=null){const next=list.filter(id=>id!==image),at=next.indexOf(before);next.splice(at<0?next.length:at,0,image);return next;}
 async function begin(image,target,side='left') {
  const source=p.locator(`#board [data-image="${image}"]`);await source.scrollIntoViewIfNeeded();
  const a=await source.boundingBox(),b=await target.boundingBox();
  await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();
  await p.mouse.move(a.x+a.width/2+12,a.y+a.height/2,{steps:4});
  const x=side==='right'?b.x+b.width-5:b.x+5,y=b.y+b.height/2;
  await p.mouse.move(x,y,{steps:12});await p.mouse.move(x+1,y);
  await p.locator('#board .sort-slot').waitFor({state:'visible'});
 }
 async function preview(before,name){assert.equal(await p.locator('#board .sort-slot').getAttribute('data-before'),before || '');await p.screenshot({path:`${out}/${name}.png`,fullPage:true});}
 async function drop(image,before,name){await preview(before,name);await p.mouse.up();expected=moved(expected,image,before);assert.deepEqual(await ids(0),expected);assert.equal(await p.locator('.sort-slot').count(),0);}
 let moving=expected[0],before=expected[2];await begin(moving,p.locator(`[data-image="${before}"]`));await drop(moving,before,'before-image-desktop');
 moving=expected[1];before=expected[4];await begin(moving,p.locator(`[data-image="${expected[3]}"]`),'right');await drop(moving,before,'after-image-desktop');
 moving=expected[0];await begin(moving,row(0).locator('.tiles'),'right');await drop(moving,null,'end-of-tier-desktop');
 const cancelled=[...expected];await begin(expected.at(-1),row(0).locator('[data-image]').first());await p.keyboard.press('Escape');await p.mouse.up();assert.deepEqual(await ids(0),cancelled);assert.equal(await p.locator('.sort-slot').count(),0);
 // Cross-tier insertion uses the same preview and exact before-image target.
 const other=await ids(1);moving=expected[0];before=other[1];await begin(moving,p.locator(`[data-image="${before}"]`));await preview(before,'cross-tier-desktop');await p.mouse.up();expected=expected.filter(id=>id!==moving);assert.deepEqual(await ids(1),moved(other,moving,before));
 // Wrapped row insertion with actual touch events, not synthetic drag/drop events.
 await p.setViewportSize({width:390,height:844});await row(0).scrollIntoViewIfNeeded();
 moving=expected[0];before=expected[4];const source=await p.locator(`[data-image="${moving}"]`).boundingBox(),target=await p.locator(`[data-image="${before}"]`).boundingBox(),cdp=await p.context().newCDPSession(p);
 const sx=source.x+30,sy=source.y+30,tx=target.x+5,ty=target.y+target.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
 for(let n=1;n<=10;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+(tx-sx)*n/10,y:sy+(ty-sy)*n/10,id:1}]});
 await preview(before,'wrapped-slot-touch');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expected=moved(expected,moving,before);assert.deepEqual(await ids(0),expected);
 await p.waitForTimeout(550); // Allow the deliberate ghost-click suppression window to expire.
 const untouched=await ids(0);await row(0).locator('[data-image]').first().dblclick();await p.locator('#image-dialog').waitFor({state:'visible'});assert.deepEqual(await ids(0),untouched,'double-click must not change the board');
 assert((await p.locator('#zoom-image').getAttribute('src')).startsWith('data:image/webp;'));await p.waitForFunction(()=>document.querySelector('#zoom-image').naturalWidth===1200);
 assert.equal(await p.locator('#image-dialog button,#zoom-level').count(),0);
 const scale=()=>p.locator('#zoom-image').evaluate(node=>Number(node.dataset.scale)),stage=p.locator('#image-stage');let beforeScale=await scale();
 await p.locator('#zoom-image').click();assert(await p.locator('#image-dialog').isVisible());const anchorBefore=await p.locator('#zoom-image').boundingBox();
 await p.mouse.move(140,380);await p.mouse.wheel(0,-13);await p.waitForFunction(value=>Number(document.querySelector('#zoom-image').dataset.scale)>value,beforeScale);assert(Math.abs(await scale()-beforeScale*Math.exp(.026))<1e-8);
 const anchorAfter=await p.locator('#zoom-image').boundingBox();assert(Math.abs(anchorAfter.x+(140-anchorBefore.x)/anchorBefore.width*anchorAfter.width-140)<.5);assert(Math.abs(anchorAfter.y+(380-anchorBefore.y)/anchorBefore.height*anchorAfter.height-380)<.5);
 beforeScale=await scale();await p.mouse.wheel(0,-27);await p.waitForFunction(value=>Number(document.querySelector('#zoom-image').dataset.scale)>value,beforeScale);assert(Math.abs(await scale()-beforeScale*Math.exp(.054))<1e-8);
 beforeScale=await scale();await p.mouse.wheel(0,-400);await p.waitForFunction(value=>Number(document.querySelector('#zoom-image').dataset.scale)>value,beforeScale);
 for(const theme of ['light','dark']){await p.evaluate(t=>PuzzleTheme.setPreference(t),theme);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${out}/zoom-mobile-${theme}.png`});}
 const bounds=await stage.boundingBox(),oldLeft=await p.locator('#zoom-image').evaluate(node=>node.getBoundingClientRect().left);
 await p.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await p.mouse.down();await p.mouse.move(bounds.x+bounds.width/2-50,bounds.y+bounds.height/2-40,{steps:8});await p.mouse.up();assert(await p.locator('#zoom-image').evaluate(node=>node.getBoundingClientRect().left)<oldLeft);
 await p.keyboard.press('0');const pinchScale=await scale();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:155,y:422,id:1},{x:235,y:422,id:2}]});
 for(let index=1;index<=6;index++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:155-index*6,y:422,id:1},{x:235+index*6,y:422,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(await scale()>pinchScale);assert(await p.locator('#image-dialog').isVisible());
 await p.keyboard.press('Escape');assert(await p.locator('#image-dialog').isHidden());assert.deepEqual(await ids(0),untouched);
 await p.locator('#tab-images').click();await p.locator('.image-card img').first().dblclick();await p.locator('#image-dialog').waitFor({state:'visible'});
 await p.setViewportSize({width:1280,height:900});await p.keyboard.press('0');await p.keyboard.press('+');await p.screenshot({path:`${out}/zoom-desktop.png`});await p.keyboard.press('0');await p.mouse.click(2,2);await p.locator('#image-dialog').waitFor({state:'hidden'});
 await p.locator('#tab-rank').click();await p.locator('#back').click();await p.locator('#library').waitFor({state:'visible'});await p.reload();await p.getByRole('button',{name:'Open',exact:true}).click();assert.deepEqual(await ids(0),expected);
 assert.deepEqual(errors,[]);console.log('PASS: native desktop drag before/after/end, same-tier reorder, cross-tier insertion, cancel, wrapped-row touch preview, persistence, double-click without ranking side effects, toolbar-free full-resolution overlay, continuous cursor-anchored wheel zoom, pan, actual touch pinch, keyboard, outside-click dismissal and responsive viewer.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
