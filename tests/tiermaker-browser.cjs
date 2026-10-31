const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR || '/tmp/tiermaker-import';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true}),p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/tierlist/');await p.locator('#import').click();await p.locator('#method-tiermaker').click();
 await p.locator('#tiermaker-url').fill('https://example.com/create/test');await p.locator('#import-tiermaker').click();await p.waitForFunction(()=>document.querySelector('#tiermaker-error').textContent.includes('tiermaker.com'));assert.equal(await p.locator('.album-card').count(),0);
 for(const width of [1280,390]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`${out}/url-import-${width}.png`,fullPage:true});}
 await p.locator('#tiermaker-url').fill('https://tiermaker.com/create/rock-paper-scissors');await p.locator('#import-tiermaker').click();await p.locator('#workspace').waitFor({state:'visible',timeout:90000});
 assert.equal(await p.locator('#album-name').inputValue(),'Rock Paper Scissors');assert.equal(await p.locator('#board [data-image]').count(),3);
 await p.screenshot({path:`${out}/imported-mobile.png`,fullPage:true});
 await p.locator('#export').click();await p.waitForFunction(()=>document.querySelector('#code').value.startsWith('TIER1.'));const code=await p.locator('#code').inputValue();
 const album=await p.evaluate(async code=>(await import('./codec.mjs')).decodeAlbum(code),code);assert.equal(album.images.length,3);assert(album.images.every(image=>/^data:image\/(webp|png);base64,/.test(image.data)));assert(album.description.includes('https://tiermaker.com/create/rock-paper-scissors'));assert.equal(album.board.unranked.length,3);
 await p.locator('[data-close="code-dialog"]').click();await p.locator('#back').click();await p.locator('#library').waitFor({state:'visible'});
 await p.locator('#import').click();await p.locator('#method-tiermaker').click();await p.locator('#tiermaker-url').fill('https://tiermaker.com/categories/funny/rock-paper-scissors');await p.locator('#import-tiermaker').click();await p.locator('#workspace').waitFor({state:'visible',timeout:90000});
 assert.equal(await p.locator('#album-name').inputValue(),'Rock Paper Scissors');await p.locator('#back').click();await p.locator('#library').waitFor({state:'visible'});assert.equal(await p.locator('.album-card').count(),2);
 await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.album-card').length===2);
 await p.locator('#import').click();await p.locator('#method-tiermaker').click();await p.locator('#tiermaker-url').fill('https://tiermaker.com/create/choose-your-weapon-tier-list-16864667');await p.locator('#import-tiermaker').click();await p.locator('#workspace').waitFor({state:'visible',timeout:120000});
 assert.equal(await p.locator('#album-name').inputValue(),'Choose Your Weapon');assert.equal(await p.locator('#board [data-image]').count(),18);await p.screenshot({path:`${out}/choose-your-weapon-import.png`,fullPage:true});
 await p.locator('#export').click();await p.waitForFunction(()=>document.querySelector('#code').value.startsWith('TIER1.'));const weapon=await p.evaluate(async()=>(await import('./codec.mjs')).decodeAlbum(document.querySelector('#code').value));assert.equal(weapon.images.length,18);assert.equal(new Set(weapon.images.map(image=>image.id)).size,18);assert(weapon.images.every(image=>/^data:image\/(webp|png);base64,/.test(image.data)));
 assert.deepEqual(errors,[]);console.log('PASS: live legacy template/category imports and the exact Choose Your Weapon modern asset-path template with all 18 compressed images, portable exports, independent persistence and foreign-URL rejection.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
