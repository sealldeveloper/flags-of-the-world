const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR || '/tmp/tiermaker-batch';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];p.setDefaultTimeout(120000);p.on('pageerror',error=>errors.push(error.message));p.on('dialog',dialog=>dialog.accept());await p.goto(base+'/tierlist/');
  let importRequests=0;p.on('request',request=>{if(new URL(request.url()).pathname==='/tierlist-import')importRequests++;});
  async function open(){await p.locator('#import').click();await p.locator('#method-tiermaker').click();}
  await open();await p.locator('#tiermaker-url').fill('https://tiermaker.com/create/rock-paper-scissors\nhttps://example.com/create/foreign');await p.locator('#import-tiermaker').click();await p.waitForFunction(()=>document.querySelector('#tiermaker-error').textContent.includes('URL 2:'));assert.equal(importRequests,0);await p.screenshot({path:`${out}/batch-validation.png`});
  const sources='https://tiermaker.com/create/rock-paper-scissors\nhttps://tiermaker.com/create/choose-your-weapon-tier-list-16864667\nhttps://www.tiermaker.com/create/rock-paper-scissors';
  await p.locator('#tiermaker-url').fill(sources);await p.locator('#import-tiermaker').click();assert(await p.locator('#tiermaker-url').evaluate(node=>node.readOnly));await p.locator('#code-dialog').waitFor({state:'hidden'});
  await p.waitForFunction(()=>document.querySelectorAll('.album-card').length===2);assert(await p.locator('#library').isVisible());assert.equal(importRequests,2);
  const actual=await p.evaluate(async()=>{const {listAlbums}=await import('./storage.mjs');return (await listAlbums()).map(value=>({id:value.id,name:value.name,images:value.images.length}));});assert.deepEqual(actual.map(value=>value.images).sort((a,b)=>a-b),[3,18]);assert.equal(new Set(actual.map(value=>value.id)).size,2);
  await p.screenshot({path:`${out}/two-live-imports.png`,fullPage:true});
  // Deterministic cancellation after one successful import. No fixture URL reaches TierMaker.
  const fixture=await p.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#286b77';ctx.fillRect(0,0,64,64);return canvas.toDataURL('image/png').split(',')[1];});
  let held=false,release,block=true,reached;const heldRequest=new Promise(resolve=>reached=resolve);
  await p.route('**/tierlist-import?*',async route=>{
   const source=new URL(route.request().url()).searchParams.get('url');if(!source.includes('batch-fixture-'))return route.continue();
   const second=source.endsWith('-two');if(second && block){held=true;await new Promise(resolve=>{release=resolve;reached();});}
   try{await route.fulfill({contentType:'application/json',body:JSON.stringify({name:second?'Batch fixture two':'Batch fixture one',images:[{id:'image',label:'Fixture',url:'https://tiermaker.com/images/chart/chart/batch-fixture/image.png'}],tiers:[]})});}catch{}
  });
  await p.route('**/tierlist-image?*',route=>{const source=new URL(route.request().url()).searchParams.get('url');return source.includes('/batch-fixture/')?route.fulfill({contentType:'image/png',body:Buffer.from(fixture,'base64')}):route.continue();});
  await open();await p.locator('#tiermaker-url').fill('https://tiermaker.com/create/batch-fixture-one\nhttps://tiermaker.com/create/batch-fixture-two');await p.locator('#import-tiermaker').click();
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Second fixture request was not reached')),120000);heldRequest.then(()=>{clearTimeout(timeout);resolve();});});assert(held);assert((await p.locator('#tiermaker-progress').textContent()).includes('2 of 2'));
  for(const [width,height] of[[1280,900],[390,844],[320,740]])for(const theme of['light','dark']){await p.setViewportSize({width,height});await p.evaluate(value=>PuzzleTheme.setPreference(value),theme);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${out}/batch-progress-${width}-${theme}.png`});}
  await p.locator('[data-close="code-dialog"]').click();block=false;release();await p.waitForFunction(()=>document.querySelectorAll('.album-card').length===3);assert.equal(await p.locator('#tiermaker-url').inputValue(),'https://tiermaker.com/create/batch-fixture-two');
  await open();assert.equal(await p.locator('#tiermaker-url').inputValue(),'https://tiermaker.com/create/batch-fixture-two');await p.locator('#import-tiermaker').click();await p.locator('#workspace').waitFor({state:'visible'});assert.equal(await p.locator('#album-name').inputValue(),'Batch fixture two');await p.locator('#back').click();await p.waitForFunction(()=>document.querySelectorAll('.album-card').length===4);
  // The same multiline batch flow must also upload originals with Catbox selected.
  let uploads=0,remoteDownloads=0;
  p.on('request',request=>{if(request.url().startsWith('https://files.catbox.moe/'))remoteDownloads++;});
  await p.route('https://cors.eu.org/**',async route=>{
   const request=route.request(),cors={'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'Content-Type'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});assert.equal(request.url(),'https://cors.eu.org/https://catbox.moe/user/api.php');assert.equal(request.method(),'POST');
   const body=request.postDataBuffer(),original=Buffer.from(fixture,'base64'),at=body.indexOf(original);assert(at>=0,'Catbox batch must send original PNG bytes');assert(!body.includes(Buffer.from('userhash')));
   return route.fulfill({headers:cors,contentType:'text/plain',body:`https://files.catbox.moe/bt000${++uploads}.png`});
  });
  await open();await p.locator('#tiermaker-storage').selectOption('catbox');await p.locator('#tiermaker-url').fill('https://tiermaker.com/create/batch-fixture-one\nhttps://tiermaker.com/create/batch-fixture-two\nhttps://www.tiermaker.com/create/batch-fixture-one');
  assert.equal(await p.locator('#tiermaker-url').evaluate(node=>node.tagName),'TEXTAREA');assert((await p.locator('#tiermaker-url-help').innerText()).includes('one or more URLs'));
  for(const [width,height] of[[1920,1080],[1024,768],[390,844],[320,740]])for(const theme of['light','dark']){await p.setViewportSize({width,height});await p.evaluate(value=>PuzzleTheme.setPreference(value),theme);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${out}/catbox-batch-input-${width}-${theme}.png`});}
  await p.locator('#import-tiermaker').click();await p.locator('#code-dialog').waitFor({state:'hidden'});await p.waitForFunction(()=>document.querySelectorAll('.album-card').length===6);assert(await p.locator('#library').isVisible());assert.equal(uploads,1);assert.equal(remoteDownloads,0);
  const hosted=await p.evaluate(async()=>(await (await import('./storage.mjs')).listAlbums()).filter(album=>album.images.some(image=>image.data.startsWith('https://files.catbox.moe/'))));assert.equal(hosted.length,2);assert.equal(new Set(hosted.map(album=>album.id)).size,2);assert(hosted.every(album=>album.images.length===1&&album.images[0].thumb.startsWith('data:image/')));await p.screenshot({path:`${out}/catbox-two-saved-tierlists.png`,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS two real TierMaker sources with deduplication, preflight URL rejection, separate saved tierlists, bounded progress, cancellation preserving completed imports and retrying only remaining URLs, plus a two-template original-byte Catbox fixture batch with deduplication and no remote image downloads.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
