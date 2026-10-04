// Published routes only. External flag images use an SVG fixture; fonts, the
// remote Scattergories site and buzzin/CDN availability are not under test.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR||'/tmp/published-themes';
fs.mkdirSync(out,{recursive:true});
const routes=['/','/crossword/','/crossword-nyt/?puzzle=2026-10-02','/crossword-nytmini/?puzzle=2026-10-02','/crossword-seattle/?puzzle=260322','/connections-nyt/?date=2026-10-02','/flags/','/tld/','/deadlock-guess-who/','/scattegories/','/scattegories/local/','/jeopardy/','/jeopardy/display.html'];
async function network(context){await context.route('**/*',r=>{
 const url=r.request().url();
 if(url.startsWith(base)||url.startsWith('data:'))return r.continue();
 if(/countryflags|flagcdn/.test(url))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><path fill="#24457d" d="M0 0h100v180H0z"/><path fill="#fff" d="M100 0h100v180H100z"/><path fill="#a32d3b" d="M200 0h100v180H200z"/></svg>'});
 if(url.includes('nyt-crossword-proxy'))return r.fulfill({status:200,body:''});
 return r.abort();
});}
async function ready(p,route){
 if(/^\/crossword-/.test(route))await p.waitForSelector('#puzzle-layout:not(.hidden)');
 if(route.startsWith('/connections'))await p.waitForSelector('#game:not(.hidden)');
 if(route==='/flags/')await p.waitForSelector('#loading-overlay.hidden',{state:'attached'});
 if(route==='/tld/')await p.waitForFunction(()=>document.querySelector('#current-tld').textContent.length>0);
 if(route==='/deadlock-guess-who/')await p.waitForSelector('#game-view:not(.hidden)');
}
async function frame(p){await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function shot(p,name){await frame(p);await p.screenshot({path:`${out}/${name}.png`,fullPage:true,animations:'disabled'});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: horizontal overflow`);}
async function scheme(p,value){await p.emulateMedia({colorScheme:value});await p.waitForFunction(v=>document.documentElement.dataset.theme===v,value);}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--mute-audio']});
 try{
  for(const route of routes.slice(Number(process.env.THEME_FROM||0))){
   const context=await browser.newContext({colorScheme:'dark',reducedMotion:'reduce'});await network(context);
   // Old automatic/migrated preferences must not pin any published route.
   await context.addInitScript(()=>{localStorage.setItem('puzzle-theme-v1','light');localStorage.setItem('xw-theme','light');});
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   await p.goto(base+route);await ready(p,route);
   const name=route.split('?')[0].replace(/^\//,'').replaceAll('/','-')||'home';
   assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark',`${route}: system initial dark`);
   assert.equal(await p.evaluate(()=>PuzzleTheme.preference),'system',`${route}: system is the default despite old preferences`);
   if(await p.locator('.site-theme-select').count())assert.equal(await p.locator('.site-theme-select').inputValue(),'system');
   assert.equal(await p.evaluate(()=>localStorage.getItem('puzzle-theme-v2')),null,'automatic startup must not pin a preference');
   if(route==='/deadlock-guess-who/'){
    for(const theme of ['light','dark']){await scheme(p,theme);await p.setViewportSize({width:390,height:844});await shot(p,`${name}secret-setup-${theme}`);}
    await p.locator('.secret-picker-card').first().click();
   }
   if(route==='/jeopardy/display.html'){
    for(const theme of ['light','dark']){await scheme(p,theme);await shot(p,`${name}-audio-${theme}`);}
    await p.locator('#audio-prompt').click();
   }
   for(const [width,height]of [[1920,1080],[1024,768],[390,844],[320,740]]){
    await p.setViewportSize({width,height});
    for(const theme of ['light','dark']){
     await scheme(p,theme);await shot(p,`${name}-${width}-${theme}`);
     if(route==='/deadlock-guess-who/'){
      assert(await p.evaluate(()=>document.querySelector('.header-title').getBoundingClientRect().right<=document.querySelector('.site-theme-picker').getBoundingClientRect().left-4),'Deadlock title must not overlap theme controls');
      if(theme==='light')assert(await p.locator('.roster-pane').evaluate(e=>getComputedStyle(e,'::after').backgroundColor===getComputedStyle(e).backgroundColor),'roster decoration must follow the light palette');
     }
     if(route==='/scattegories/local/')assert(await p.evaluate(()=>document.getElementById('increase-count').getBoundingClientRect().right<=document.querySelector('.categories-panel').getBoundingClientRect().right),'category stepper must not be clipped');
     const colour=await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
     const channels=colour.match(/\d+/g).slice(0,3).map(Number),mean=channels.reduce((a,b)=>a+b,0)/3;
     assert(theme==='light'?mean>190:mean<90,`${route} ${theme}: body did not adapt (${colour})`);
    }
   }
   assert.equal(await p.evaluate(()=>localStorage.getItem('puzzle-theme-v2')),null,'OS changes do not save an override');
   // Deliberate choice survives OS changes and reload. Returning to System is explicit.
   if(await p.locator('.site-theme-select').count()){
    await p.locator('.site-theme-select').selectOption('light');await p.emulateMedia({colorScheme:'dark'});
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    await p.reload();await ready(p,route);assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'light');
    // Deadlock deliberately reopens its setup dialog after every reload; the
    // header is inert until a secret is selected, so don't focus behind it.
    if(route==='/deadlock-guess-who/'){await p.locator('.secret-picker-card').first().click();await frame(p);}
    assert.equal(await p.evaluate(()=>localStorage.getItem('puzzle-theme-v2')),'light');
    await p.locator('.site-theme-select').selectOption('system');await scheme(p,'dark');
    await p.locator('.site-theme-select').focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');
    assert(await p.locator('.site-theme-select').evaluate(e=>e.matches(':focus-visible')));
    await shot(p,`${name}-theme-focus`);
   }
   // Interactive surfaces in both palettes.
   for(const theme of ['light','dark']){
    await scheme(p,theme);await p.setViewportSize({width:390,height:844});
    if(route==='/flags/'||route==='/tld/'){
     await p.locator('#country-input').fill('not a country');await p.locator('#country-input').press('Enter');await shot(p,`${name}-incorrect-${theme}`);
     if(route==='/tld/'){await p.locator('#hint-btn').click();await shot(p,`${name}-hint-${theme}`);}
     await p.locator('#pause-btn').click();await shot(p,`${name}-paused-${theme}`);await p.keyboard.press('Escape');
     await p.locator('#give-up-btn').click();await shot(p,`${name}-results-${theme}`);await p.locator('#play-again-btn').click();
    }
    if(route==='/deadlock-guess-who/'){
     await p.locator('.card-face').first().click();await p.locator('.inspect-hero').first().click();await shot(p,`${name}-hero-${theme}`);
     await p.locator('#hero-panel').evaluate(e=>e.scrollTop=e.scrollHeight);await shot(p,`${name}-hero-bottom-${theme}`);
     await p.locator('#close-hero-panel').click();await shot(p,`${name}-eliminated-${theme}`);
    }
    if(route==='/scattegories/local/'){
     await p.locator('#open-about').click();await shot(p,`${name}-about-${theme}`);await p.locator('#about-dialog .dialog-close').click();
     await p.evaluate(()=>document.getElementById('list-dialog').showModal());await shot(p,`${name}-editor-${theme}`);await p.locator('#list-dialog .dialog-close').click();
     await p.locator('#play-toggle').click();await shot(p,`${name}-running-${theme}`);await p.locator('#play-toggle').click();
    }
    if(route==='/jeopardy/'){
     await p.evaluate(()=>{setup.boards[0].categories[0].name='Theme fixture';setup.boards[0].categories[0].clues[0].question='A long clue to check wrapping and contrast on small screens.';setup.boards[0].categories[0].clues[0].answer='A readable answer';setup.finalJeopardy={category:'Final category',question:'A final question with enough detail to wrap.',answer:'Final answer'};switchTab('setup');});
     await p.locator('.cat-header .toggle').first().click();await shot(p,`${name}-category-editor-${theme}`);
     await p.getByRole('button',{name:'Game',exact:true}).click();await p.locator('.mini-cell').first().click();await shot(p,`${name}-preview-${theme}`);
     await p.evaluate(()=>{game.currentClue={col:0,row:0};game.answerRevealed=true;game.clueResults={0:'correct',1:'incorrect'};game.displayMode='clue';renderGameTab();});await shot(p,`${name}-answer-results-${theme}`);
     assert(await p.locator('.result-row').evaluateAll(rows=>rows.every(row=>{const r=row.getBoundingClientRect();return [...row.querySelectorAll('button')].every(button=>button.getBoundingClientRect().right<=r.right);})), 'result buttons must stay inside their row');
     await p.evaluate(()=>setDisplayMode('final'));await shot(p,`${name}-final-${theme}`);
     await p.getByRole('button',{name:'Show Question',exact:true}).click();await shot(p,`${name}-final-question-${theme}`);
     await p.getByRole('button',{name:'Reveal Phase',exact:true}).click();await shot(p,`${name}-final-reveal-${theme}`);
     await p.evaluate(()=>{setDisplayMode('board');switchTab('setup');});
    }
   }
   if(route==='/jeopardy/display.html'){
    const control=await context.newPage();await control.goto(base+'/jeopardy/');
    await control.evaluate(()=>{setup.teams=[{name:'Team One'},{name:'Team Two'}];game.scores=[1200,-200];setup.boards[0].categories[0].question='';setup.boards[0].categories[0].name='Theme fixture';setup.boards[0].categories[0].clues[0].question='An audience clue that wraps across the screen';setup.boards[0].categories[0].clues[0].answer='Readable answer';setup.finalJeopardy={category:'Final category',question:'A final question to check the audience display.',answer:'Final answer'};game.revealedCategories[0]=[true,true,true,true,true];});
    for(const theme of ['light','dark']){
     await p.emulateMedia({colorScheme:theme});await p.evaluate(()=>PuzzleTheme.setPreference('system'));
     for(const [width,height]of [[1920,1080],[1024,768],[390,844]]){
      await p.setViewportSize({width,height});
      for(const mode of ['logo','board','clue','daily-double','final','winner','blank']){
       await control.evaluate(mode=>{game.buzzerOrder=mode==='clue'?['Team One','Team Two']:[];game.buzzerLocked=mode!=='board';if(mode==='clue'||mode==='daily-double'){game.currentClue={col:0,row:0};game.answerRevealed=true;game.wager=400;}setDisplayMode(mode);if(mode==='final'){game.final.phase='reveal';game.final.categoryRevealed=true;game.final.teams.forEach((t,i)=>Object.assign(t,{wager:200,answer:'The answer',wagerRevealed:true,answerRevealed:true,result:i?'incorrect':'correct'}));broadcast();}},mode);
       await p.waitForFunction(mode=>state?.displayMode===mode,mode);await shot(p,`audience-${mode}-${width}-${theme}`);
       if(mode==='clue')assert(await p.evaluate(()=>document.getElementById('buzz-order').getBoundingClientRect().top>=document.querySelector('.screen-container').getBoundingClientRect().bottom),'buzzer order must not cover the clue');
       if(mode==='board')assert(await p.evaluate(()=>document.getElementById('buzzer-badge').getBoundingClientRect().bottom<=document.querySelector('.screen-container').getBoundingClientRect().top),'buzzer badge must not cover category headings');
      }
     }
    }
   }
   assert.deepEqual(errors,[],route);await context.close();console.log(`PASS themes/controls/layout: ${route}`);
  }
  // Cross-tab propagation, ignored legacy defaults, and preserved game settings.
  const c=await browser.newContext({colorScheme:'dark'});await network(c);
  const a=await c.newPage(),b=await c.newPage();await a.goto(base);await b.goto(base+'/crossword/');
  await a.locator('.site-theme-select').selectOption('light');await b.waitForFunction(()=>PuzzleTheme.current==='light');
  await b.goto(base+'/index.html');assert.equal(await b.evaluate(()=>document.documentElement.dataset.sitePage),'home');assert.equal(await b.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(245, 247, 251)');
  await b.locator('.site-theme-select').selectOption('system');await a.waitForFunction(()=>PuzzleTheme.current==='dark');
  await a.evaluate(()=>{localStorage.removeItem('puzzle-theme-v2');localStorage.setItem('puzzle-theme-v1','dark');localStorage.setItem('xw-theme','dark');});
  await a.emulateMedia({colorScheme:'light'});
  for(const route of routes.filter(route=>/^\/(crossword-|connections-)/.test(route))){
   await a.goto(base+route);await ready(a,route);
   assert.equal(await a.evaluate(()=>PuzzleTheme.current),'light');
   assert.equal(await a.locator('.site-theme-select').inputValue(),'system');
   assert.deepEqual(await a.evaluate(()=>['puzzle-theme-v2','puzzle-theme-v1','xw-theme'].map(key=>localStorage.getItem(key))),[null,'dark','dark']);
  }
  await a.locator('.site-theme-select').selectOption('dark');await a.reload();await ready(a,'/connections-nyt/');
  assert.equal(await a.evaluate(()=>PuzzleTheme.current),'dark','new explicit choices survive reload');
  await a.locator('.site-theme-select').selectOption('system');await a.reload();assert.equal(await a.evaluate(()=>PuzzleTheme.current),'light');
  for(const inverted of [true,false]){
   await a.emulateMedia({colorScheme:inverted?'light':'dark'});
   await a.evaluate(inverted=>{localStorage.removeItem('puzzle-theme-v2');localStorage.setItem('scattegories-v1',JSON.stringify({inverted,count:8,initialSeconds:180,timerDefaultVersion:2,palette:2,categories:['Animals','Cities','Foods','Plants','Films','Books','Sports','Tools']}));},inverted);
   await a.goto(base+'/scattegories/local/');assert.equal(await a.evaluate(()=>PuzzleTheme.current),inverted?'light':'dark');
   assert.equal(await a.locator('.site-theme-select').inputValue(),'system');
   assert.deepEqual(await a.evaluate(()=>{const s=JSON.parse(localStorage.getItem('scattegories-v1'));return [s.count,s.initialSeconds,s.palette,s.categories.length];}),[8,180,2,8]);
   assert.equal(await a.evaluate(()=>localStorage.getItem('puzzle-theme-v2')),null);
  }
  await c.close();
  const denied=await browser.newContext({colorScheme:'dark'});await network(denied);
  await denied.addInitScript(()=>{for(const method of ['getItem','setItem','removeItem'])Storage.prototype[method]=()=>{throw new DOMException('Blocked','SecurityError');};});
  for(const route of ['/','/crossword-nytmini/?puzzle=2026-10-02','/connections-nyt/?date=2026-10-02']){
   const p=await denied.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+route);await ready(p,route);
   assert.equal(await p.evaluate(()=>PuzzleTheme.current),'dark');await p.locator('.site-theme-select').selectOption('light');assert.equal(await p.evaluate(()=>PuzzleTheme.current),'light');assert.deepEqual(errors,[]);await p.close();
  }
  await denied.close();console.log('PASS cross-tab choice, System defaults despite old preferences, preserved game settings, explicit overrides, return to system and blocked storage.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
