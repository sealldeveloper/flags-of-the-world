// Full round/rematch test with real host endpoint and a host-run rules-engine bot.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const out=process.env.SCREENSHOT_DIR||'/tmp/uno-visual';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--enable-unsafe-swiftshader']});const p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());
 await p.goto((process.env.BASE_URL||'http://127.0.0.1:18764')+'/uno/');await p.locator('#name').fill('Long player name for mobile test');await p.locator('#create').click();await p.waitForSelector('#room:not([hidden])',{timeout:60000});
 await p.locator('#add-bot').click();await p.locator('#sevenZero').check();await p.locator('#stack2').check();await p.locator('#start').click();
 let turns=0,dialogs=0;
 while(turns<500){
  await p.waitForFunction(()=>document.body.dataset.presenting!=='true'&&document.querySelector('#room').dataset.effect!=='jump-window'&&document.querySelector('#room').dataset.autoDraw!=='true');
  if((await p.locator('#phase-title').textContent()).includes('wins!'))break;turns++;
  const revision=Number(await p.locator('#room').getAttribute('data-revision'));
  if(await p.locator('#call-uno').isVisible())await p.locator('#call-uno').click();
  else if(await p.locator('#turn-label').textContent()==='Your turn'){
   const cards=p.locator('#hand .card:not(:disabled)');
   if(await cards.count()){
    const special=p.locator('#hand .card.wild:not(:disabled)');await (await special.count()?special.first():cards.first()).click();
    if(await p.locator('#choice').isVisible()){
     dialogs++;await p.screenshot({path:`${out}/round-dialog-${dialogs}.png`,fullPage:true});await p.locator('#choices button').first().click();
    }
   }else if(await p.locator('#pass').isVisible())await p.locator('#pass').click();else if(await p.locator('#draw').isEnabled())await p.locator('#draw').click();
  }
  await p.waitForFunction(rev=>Number(document.querySelector('#room').dataset.revision)>rev,revision,{timeout:15000});
 }
 assert(turns<500,'round must terminate');
 assert.equal(await p.locator('#players-home').evaluate(e=>e.firstElementChild.id),'players','returning from the table keeps Add Bot after the player tiles');
 await p.screenshot({path:`${out}/round-complete.png`,fullPage:true});
 assert(await p.locator('#round-result').isVisible());
 await p.locator('#result-rematch').click();await p.waitForFunction(()=>document.querySelector('#phase-title').textContent==='Round 2');
 await p.waitForFunction(()=>document.body.dataset.presenting!=='true');assert.equal(await p.locator('#hand .card').count(),7);await p.screenshot({path:`${out}/rematch.png`,fullPage:true});
 await p.locator('#settings-toggle').click();await p.locator('#leave').click();await browser.close();console.log(`PASS: completed ${turns} turn updates, ${dialogs} choice dialogs, and rematch (7–0 + stacking).`);
})().catch(e=>{console.error(e);process.exit(1)});
