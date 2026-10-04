// Connections-only real-browser checks; local archived puzzle, no remote service required.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR||'/tmp/connections-features';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
  p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${base}/connections-nyt/?date=2026-10-02&mode=standard`);await p.waitForSelector('#game:not(.hidden)');
  const categories=await p.evaluate(()=>state.puzzle.categories),ids=categories.map(c=>c.cards.map(c=>c.id));
  async function guess(cards){await p.locator('#deselect-button').evaluate(b=>{if(!b.disabled)b.click();});for(const id of cards)await p.locator(`[data-card-id="${id}"]`).click();await p.locator('#submit-button').click();await p.waitForFunction(()=>!state.transitioning);}
  async function screenshot(name){const modal=await p.locator('#result-overlay').isVisible();await p.screenshot({path:`${out}/${name}.png`,fullPage:!modal,animations:'disabled'});if(modal){assert(await p.locator('.result-icon').evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.getBoundingClientRect().height)<1),'result icon must not shrink into an ellipse');assert(await p.evaluate(()=>{const box=document.querySelector('.result-box').getBoundingClientRect(),actions=document.querySelector('.result-actions').getBoundingClientRect();return actions.top>=box.top&&actions.bottom<=box.bottom-4;}),'result actions must be fully visible');}}
  const oneAway=[...ids[0].slice(0,3),ids[1][0]],far=[ids[0][3],ids[1][1],ids[2][0],ids[3][0]];
  await guess(oneAway);await guess(far);
  assert.equal(await p.locator('#guess-count').textContent(),'2');
  assert.deepEqual(await p.locator('.history-guess-heading span').allTextContents(),['One away','Not one away']);
  assert.deepEqual(await p.locator('.history-guess').first().locator('.history-words li').allTextContents(),oneAway.map(id=>categories.flatMap(c=>c.cards).find(c=>c.id===id).content));
  assert.equal(await p.locator('#guess-history [class*="category-"]').count(),0,'history must not expose word/category colours');
  assert(!/2 away|3 away|two away|three away/i.test(await p.locator('#guess-history').textContent()));
  await guess([...oneAway].reverse());assert.equal(await p.locator('#guess-count').textContent(),'2');assert.match(await p.locator('#status-message').textContent(),/already tried/);
  await p.getByRole('button',{name:'Reveal purple category name'}).click();assert.equal(await p.locator('[data-reveal-index="3"] .hint-title').textContent(),categories[3].title);
  assert.equal(await p.locator('.word-card').count(),16);assert.equal(await p.locator('.solved-group').count(),0);assert.equal(await p.locator('#guess-count').textContent(),'2');
  await p.reload();await p.waitForSelector('#game:not(.hidden)');assert.equal(await p.locator('#guess-count').textContent(),'2');assert.equal(await p.locator('[data-reveal-index="3"] .hint-title').textContent(),categories[3].title);
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem(progressKey())).guessCount),2);
  for(const [width,height]of [[1920,1080],[1024,768],[390,844],[320,740]]){
   await p.setViewportSize({width,height});
   for(const theme of ['light','dark']){
    await p.evaluate(theme=>applyTheme(theme),theme);
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const boxes=await p.evaluate(()=>{const b=document.querySelector('.game-board').getBoundingClientRect(),n=document.querySelector('.play-notes').getBoundingClientRect();return {board:{x:b.x,right:b.right,bottom:b.bottom},notes:{x:n.x,right:n.right,top:n.top,margin:getComputedStyle(document.querySelector('.play-notes')).marginTop},innerWidth,columns:getComputedStyle(document.querySelector('#game')).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert(!boxes.overflow);assert(boxes.notes.right<=width&&boxes.board.right<=width);if(width>900)assert(boxes.notes.x>=boxes.board.right+20);else assert(boxes.notes.top>=boxes.board.bottom+20,JSON.stringify({width,theme,...boxes}));
    await screenshot(`history-${width}-${theme}`);
   }
  }
  await p.setViewportSize({width:1024,height:768});await p.getByRole('button',{name:'Reveal yellow category name'}).hover();await screenshot('hint-hover');
  await p.getByRole('button',{name:'Reveal blue category name'}).focus();await p.keyboard.press('Shift+Tab');assert(await p.getByRole('button',{name:'Reveal green category name'}).evaluate(e=>e.matches(':focus-visible')));await screenshot('hint-keyboard-focus');
  console.log('PASS: exact persisted guesses/count, duplicate prevention, spoiler-free feedback, category-name-only hints, responsive side/below history and themes.');
  await guess(ids[1]);assert.deepEqual(await p.evaluate(()=>state.solved),[1]);
  await guess([ids[0][0],ids[2][1],ids[2][2],ids[3][1]]);
  await guess([ids[0][1],ids[2][0],ids[3][2],ids[3][3]]);
  assert(await p.locator('#continue-easy').isVisible());assert.equal(await p.locator('.solved-group').count(),1);assert.equal(await p.locator('.word-card').count(),12);
  assert.equal(await p.locator('#share-preview').inputValue(),'');assert(!await p.locator('#share-button').isVisible());assert.equal(await p.locator('[data-reveal-index="0"] .hint-title').count(),0);assert.equal(await p.locator('[data-reveal-index="2"] .hint-title').count(),0);
  const before=await p.evaluate(()=>({guesses:state.guesses,solved:state.solved,reveals:state.reveals,wordOrder:state.wordOrder}));
  for(const width of [1024,390,320]){await p.setViewportSize({width,height:width>500?768:740});await screenshot(`loss-offer-${width}`);}
  await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'result-close');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'continue-easy');
  await p.reload();await p.waitForSelector('#continue-easy:not(.hidden)');assert.equal(await p.locator('.solved-group').count(),1,'reload cannot reveal answers');
  // Existing easy-mode attempts are not silently discarded.
  await p.evaluate(()=>localStorage.setItem(`${STORAGE_PREFIX}:${state.date}:easy`,JSON.stringify({guesses:[[1,2,3,4]]})));
  p.once('dialog',d=>d.dismiss());await p.locator('#continue-easy').click();assert.equal(await p.evaluate(()=>state.easyMode),false);
  p.once('dialog',d=>d.accept());await p.locator('#continue-easy').click();assert(await p.locator('#easy-mode').isChecked());
  assert.deepEqual(await p.evaluate(()=>({guesses:state.guesses,solved:state.solved,reveals:state.reveals,wordOrder:state.wordOrder})),before);
  assert(await p.evaluate(()=>!state.lost&&!state.answersRevealed&&state.continuedFromStandard));assert.equal(await p.locator('.word-card').count(),12);await screenshot('continued-easy-mobile');
  await p.reload();await p.waitForSelector('#game:not(.hidden)');assert(await p.evaluate(()=>state.easyMode&&state.continuedFromStandard&&state.guesses.length===5));
  await guess([ids[0][2],ids[2][2],ids[3][1],ids[3][2]]);assert(!await p.evaluate(()=>state.lost));
  for(const index of [3,0,2])await guess(ids[index]);
  assert.match(await p.locator('#result-summary').textContent(),/easy mode with 5 mistakes/);
  const share=await p.locator('#share-preview').inputValue();assert.match(share,/Easy mode \(continued from standard\)/);assert.match(share,/9 guesses/);assert.match(share,/Category reveals: 🟪/);assert.match(share,/Found order: 🟩🟪🟨🟦 \(4\/4\)/);assert.match(share,/https:\/\/puzzle\.seall\.dev\/connections-nyt\/\?date=2026-10-02&mode=easy/);
  assert.equal(share.split('\n').filter(l=>/^[🟨🟩🟦🟪]+$/u.test(l)).length,9);assert.equal(share.split('\n')[7],'💡🟪 Category name revealed');
  for(const category of categories){assert(!share.includes(category.title));for(const card of category.cards)assert(!share.includes(card.content));}
  for(const [width,height]of [[1440,900],[390,844],[320,560]]){await p.setViewportSize({width,height});for(const theme of ['light','dark']){await p.evaluate(theme=>applyTheme(theme),theme);await screenshot(`share-${width}-${theme}`);assert(await p.evaluate(()=>document.querySelector('.result-box').getBoundingClientRect().right<=innerWidth));}}
  await p.context().grantPermissions(['clipboard-read','clipboard-write']);await p.locator('#share-button').click();assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),share);
  await p.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Denied');}}});document.execCommand=()=>false;});await p.locator('#share-button').click();assert.match(await p.locator('#share-status').textContent(),/blocked/);assert.equal(await p.locator('#share-preview').evaluate(e=>e.selectionEnd-e.selectionStart),share.length);await screenshot('share-manual-copy');
  await p.keyboard.press('Escape');await p.reload();await p.waitForSelector('#game:not(.hidden)');await p.locator('#view-results').click();assert.equal(await p.locator('#share-preview').inputValue(),share);await p.locator('#result-close').click();
  console.log('PASS: no-spoiler loss offer/reload, overwrite confirmation, exact standard→easy transfer, unlimited extra guesses, ordered emoji share/hints/mode/link, clipboard and manual-copy fallback, result reopening.');
  // Standard save remains intact; explicitly choosing reveal exposes the remaining groups.
  await p.locator('#easy-mode').uncheck();assert(await p.evaluate(()=>state.lost&&!state.answersRevealed&&state.guesses.length===5));await p.locator('#view-results').click();await p.locator('#reveal-answers').click();await p.waitForFunction(()=>!state.transitioning);assert.equal(await p.locator('.solved-group').count(),4);assert.equal(await p.locator('.revealed-group').count(),3);assert.match(await p.locator('#share-preview').inputValue(),/revealed by choice/);assert.match(await p.locator('#share-preview').inputValue(),/Found order: 🟩 \(1\/4\)/);await screenshot('explicit-loss-reveal');await p.locator('#result-close').click();
  p.once('dialog',d=>d.accept());await p.locator('#reset-button').click();assert.equal(await p.locator('#guess-count').textContent(),'0');assert.equal(await p.locator('.history-guess').count(),0);assert.equal(await p.locator('.hint-title').count(),0);assert.equal(await p.locator('.word-card').count(),16);
  // Legacy progress and malformed records: preserve valid history, reject unknown/repeated ids.
  await p.evaluate(ids=>localStorage.setItem(progressKey(),JSON.stringify({guesses:[ids,ids.slice().reverse(),['missing','0','1','2'],['0','0','1','2']],solved:[],mistakesRemaining:3})),oneAway);
  await p.reload();await p.waitForSelector('#game:not(.hidden)');assert.equal(await p.locator('#guess-count').textContent(),'1');assert.equal(await p.locator('.history-guess-heading span').textContent(),'One away');
  // Persist accepted correct guesses before their normal-motion animation can be interrupted.
  await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(ids=>{state.selected=new Set(ids);submitGuess();},ids[1]);await p.reload();await p.waitForSelector('#game:not(.hidden)');assert.deepEqual(await p.evaluate(()=>state.solved),[1]);assert.equal(await p.locator('#guess-count').textContent(),'2');
  await p.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};});await guess([ids[0][3],ids[2][0],ids[2][2],ids[3][0]]);assert.match(await p.locator('#storage-status').textContent(),/Couldn’t save/);assert(!await p.evaluate(()=>state.transitioning));
  assert.deepEqual(errors,[]);console.log('PASS: opt-in answer reveal, isolated standard save, reset, legacy/malformed-save recovery, animation-interruption persistence and storage-failure handling.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
