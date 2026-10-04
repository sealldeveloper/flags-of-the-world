// Native textbox integration in touch-enabled browsers; not OS keyboard/device certification.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:18764';
const out = process.env.SCREENSHOT_DIR || '/tmp/crossword-native';
fs.mkdirSync(out, {recursive:true});
(async () => {
 for (const [engine, executablePath] of [[chromium, process.env.CHROMIUM_PATH], ...(process.env.FIREFOX_PATH ? [[firefox, process.env.FIREFOX_PATH]] : [])]) {
  const browser = await engine.launch({executablePath, headless:true});
  try {
   for (const [route, query] of [['crossword-nyt','2026-10-02'],['crossword-nytmini','2026-10-02'],['crossword-seattle','260322']]) {
    const p = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}), errors=[];
    p.on('pageerror', e=>errors.push(e.message));
    await p.route('https://nyt-crossword-proxy.*/**', r=>r.fulfill({status:200,body:''}));
    await p.goto(`${base}/${route}/?puzzle=${query}`); await p.waitForSelector('#puzzle-layout:not(.hidden)');
    await p.locator('.xw-cell:not(.black)').first().tap();
    assert.equal(await p.evaluate(()=>document.activeElement.id),'xw-mobile-input');
    assert.equal(await p.locator('#xw-mobile-input').getAttribute('inputmode'),'text');
    assert.equal(await p.locator('#xw-mobile-input').getAttribute('enterkeyhint'),'next');
    assert.equal(await p.locator('#xw-keyboard').count(),0);
    assert(await p.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingBottom)<20),'no old keyboard spacer');
    async function reset() { await p.evaluate(()=>{
      state.userGrid.forEach(row=>row.fill('')); state.locked.forEach(row=>row.fill(false)); state.lockMode=false; state.overtype=true;
      const word=getFullWordList().find(w=>(w.dir==='across'?state.acrossMap:state.downMap)[w.num].length>=4);
      jumpToWord(word); updateAllCellVisuals();
    }); }
    const letters = () => p.evaluate(()=>getCurrentWordCells().map(({r,c})=>state.userGrid[r][c]));
    await reset(); await p.keyboard.insertText('ab'); assert.deepEqual((await letters()).slice(0,3),['A','B','']);
    // Normal hardware keydown + browser input must insert once, even capital C.
    await p.keyboard.press('Shift+C'); assert.deepEqual((await letters()).slice(0,4),['A','B','C','']);
    await p.keyboard.press('Backspace'); assert.deepEqual((await letters()).slice(0,4),['A','B','','']);
    // Mobile keyboards can send beforeinput without a useful keydown.
    assert(await p.evaluate(()=>!document.getElementById('xw-mobile-input').dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}))));
    assert.deepEqual((await letters()).slice(0,3),['A','','']);
    // Non-cancelable deletion falls back to input; the sentinel permits repeated deletes.
    await p.evaluate(()=>{const i=document.getElementById('xw-mobile-input'); i.value=''; i.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));});
    assert.deepEqual((await letters()).slice(0,3),['','','']);
    for (const finalInputFirst of [false,true]) {
      await reset();
      await p.evaluate(first=>{
        const i=document.getElementById('xw-mobile-input'); i.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        i.value='\u200bde'; i.dispatchEvent(new InputEvent('input',{bubbles:true,data:'de',inputType:'insertCompositionText',isComposing:true}));
        if(state.userGrid.flat().some(Boolean)) throw Error('Provisional IME text must not enter the grid');
        if(first)i.dispatchEvent(new InputEvent('input',{bubbles:true,data:'de',inputType:'insertFromComposition'}));
        i.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'de'}));
        if(!first)i.dispatchEvent(new InputEvent('input',{bubbles:true,data:'de',inputType:'insertFromComposition'}));
      },finalInputFirst);
      assert.deepEqual((await letters()).slice(0,4),['D','E','',''],'composition commits once');
    }
    const index=()=>p.evaluate(()=>getFullWordList().findIndex(w=>w.num===getCurrentWordIndex_num()&&w.dir===state.direction));
    let before=await index(); await p.keyboard.press('Enter'); assert.equal(await index(),before+1);
    await p.getByRole('button',{name:'Previous clue',exact:true}).tap(); assert.equal(await index(),before);
    assert.equal(await p.evaluate(()=>document.activeElement.id),'xw-mobile-input');
    await p.getByRole('button',{name:'Next clue',exact:true}).tap(); assert.equal(await index(),before+1);
    const dir=await p.evaluate(()=>state.direction); await p.getByRole('button',{name:'Switch direction',exact:true}).tap();
    assert.notEqual(await p.evaluate(()=>state.direction),dir);
    await p.locator('.site-theme-select').focus(); assert.equal(await p.evaluate(()=>document.activeElement.className),'site-theme-select','do not reopen a dismissed keyboard');
    let fullHeightCellSize;
    for (const [width,height] of [[1024,768],[390,844],[320,740],[390,390]]) {
      await p.setViewportSize({width,height});
      for(const theme of ['light','dark']) {
        await p.emulateMedia({colorScheme:theme}); await p.evaluate(()=>PuzzleTheme.setPreference('system'));
        await p.locator('.xw-cell:not(.black)').last().tap();
        assert.equal(await p.evaluate(()=>document.activeElement.id),'xw-mobile-input');
        await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `${engine.name()} ${route} ${width}x${height} ${theme}: horizontal overflow`);
        if (width > 768) assert(await p.evaluate(()=>{
          const toolbar=document.getElementById('toolbar'),clue=document.getElementById('active-clue-bar');
          return toolbar.scrollHeight<=toolbar.clientHeight+1 && clue.getBoundingClientRect().top>=toolbar.getBoundingClientRect().bottom-1 && document.documentElement.scrollHeight<=innerHeight+1;
        }), 'tablet toolbar must not overlap the clue or force page scrolling');
        const size=await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--cell-size'));
        if(width===390&&height===844) fullHeightCellSize=size;
        if(width===390&&height===390) assert.equal(size,fullHeightCellSize,'keyboard-sized viewport must not collapse the grid, including 21×21 puzzles');
        await p.screenshot({path:`${out}/${engine.name()}-${route}-${width}x${height}-${theme}.png`,animations:'disabled'});
      }
    }
    await reset(); await p.evaluate(()=>showModal('i','Test dialog','Typing must not alter the puzzle here.'));
    await p.evaluate(()=>{const i=document.getElementById('xw-mobile-input');i.value='\u200bz';i.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));});
    assert.equal(await p.evaluate(()=>state.userGrid.flat().filter(Boolean).length),0);
    assert.deepEqual(errors,[]); await p.close();
    console.log(`PASS ${engine.name()} ${route}: native focus/text/delete/composition, navigation, no dock, responsive themes.`);
   }
  } finally { await browser.close(); }
 }
})().catch(e=>{console.error(e);process.exit(1)});
