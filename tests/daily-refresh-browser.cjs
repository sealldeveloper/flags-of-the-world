// DOM/state assertions only. No screenshots or image generation; all puzzle data is synthetic.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:18781',today='2026-10-03',previous='2026-10-02';
function comparable(saved){const value=JSON.parse(saved);delete value.updatedAt;delete value.timerSec;return value;}
async function responsive(p){for(const width of [390,1024]){await p.setViewportSize({width,height:844});assert(await p.locator('#daily-availability').isVisible());const geometry=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(n=>({id:n.id,tag:n.tagName,class:n.className,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})).filter(n=>n.right>innerWidth+1||n.left<-1).slice(0,20)}));assert(geometry.scroll<=geometry.width,JSON.stringify(geometry));}await p.setViewportSize({width:1280,height:900});}
const games={crossword:{path:'crossword-nyt',key:'nyt-xw-progress-',query:'puzzle'},mini:{path:'crossword-nytmini',key:'nyt-mini-xw-progress-',query:'puzzle'},connections:{path:'connections-nyt',key:'nyt-connections-v1:',query:'date'}};
function fixture(game,date){
 if(game==='connections')return {status:'OK',print_date:date,id:1,editor:'Synthetic fixture',categories:Array.from({length:4},(_,i)=>({title:'Fixture group '+i,cards:Array.from({length:4},(_,j)=>({content:`GROUP${i} ITEM${j}`,position:i*4+j}))}))};
 return {publicationDate:date,constructors:['Synthetic fixture'],body:[{dimensions:{width:3,height:3},cells:Array.from({length:9},()=>({answer:'A'})),clues:Array.from({length:6},(_,i)=>({label:String(i+1),text:[{plain:'Synthetic clue '+i}]})),clueLists:[{name:'Across',clues:[0,1,2]},{name:'Down',clues:[3,4,5]}]}]};
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser'});try{
 async function setup(available){
  const context=await browser.newContext({serviceWorkers:'block',timezoneId:'Australia/Sydney'});
  await context.addInitScript(()=>{const RealDate=Date;let now=RealDate.parse('2026-10-03T01:00:00Z');class TestDate extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}window.Date=TestDate;window.jumpTime=ms=>{now+=ms;};});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   const game=Object.keys(games).find(id=>url.pathname.startsWith('/'+games[id].path+'/puzzles/'))||({'daily':'crossword',mini:'mini',connections:'connections'}[url.pathname.match(/^\/nyt\/(daily|mini|connections)\//)?.[1]]);
   if(game){
    if(url.pathname.endsWith('manifest.json'))return route.fulfill({json:[previous]});
    const date=url.pathname.match(/(\d{4}-\d{2}-\d{2})(?:\.json)?$/)?.[1];
    return date===previous || date===today&&available[game]?route.fulfill({json:fixture(game,date)}):route.fulfill({status:404,body:'Not yet available'});
   }
   return url.origin===new URL(base).origin?route.continue():route.abort();
  });
  const p=await context.newPage();p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));return {context,p,errors};
 }
 for(const [game,config]of Object.entries(games).filter(([id])=>!process.env.ONLY_GAME||id===process.env.ONLY_GAME)){
  const available={crossword:false,mini:false,connections:false},{context,p,errors}=await setup(available);
  await p.goto(`${base}/${config.path}/?${config.query}=${today}&daily=1`);
  const ready=game==='connections'?'#game:not(.hidden)':'#puzzle-layout:not(.hidden)';await p.locator(ready).waitFor();
  const current=()=>p.evaluate(game=>game==='connections'?state.date:state.puzzleId,game);
  assert.equal(await current(),previous);assert((await p.locator('#daily-availability').innerText()).includes('Showing latest available'));assert.equal(new URL(p.url()).searchParams.get(config.query),previous);await responsive(p);
  if(game==='connections')await p.evaluate(async()=>{state.selected=new Set([0,4,8,12].map(i=>state.puzzle.cards[i].id));await submitGuess();});
  else await p.locator('#crossword-grid').press('X');
  const saved=await p.evaluate(key=>localStorage.getItem(key),config.key+previous);assert(saved);
  available[game]=true;await p.evaluate(()=>{jumpTime(61000);dispatchEvent(new Event('focus'));});await p.getByRole('button',{name:'Open new puzzle',exact:true}).waitFor();await responsive(p);
  assert.equal(await current(),previous,'publication must not replace an active board');assert.equal(await p.evaluate(key=>localStorage.getItem(key),config.key+previous),saved);
  await p.getByRole('button',{name:'Open new puzzle',exact:true}).click();await p.waitForFunction(({game,today})=>(game==='connections'?state.date:state.puzzleId)===today,{game,today});
  assert.deepEqual(comparable(await p.evaluate(key=>localStorage.getItem(key),config.key+previous)),comparable(saved),'old progress remains under old date (timestamps/timer may advance)');
  await p.goto(`${base}/${config.path}/?${config.query}=${previous}`);await p.locator(ready).waitFor();assert.equal(await current(),previous);await p.evaluate(()=>{jumpTime(61000);dispatchEvent(new Event('focus'));});assert.equal(await current(),previous,'explicit archive date stays pinned');
  await p.goto(`${base}/${config.path}/?${config.query}=2026-10-01`);await p.locator(game==='connections'?'#error-state:not(.hidden)':'#error-overlay:not(.hidden)').waitFor();assert(!new URL(p.url()).searchParams.has('daily'));
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+game+': unavailable local date→labelled actual-date fallback; publication notification; no automatic board switch or lost save; exact archive errors');
 }
 const available={crossword:false,mini:false,connections:true},{context,p,errors}=await setup(available);await p.goto(base+'/');await p.waitForFunction(()=>document.querySelector('[data-game="mini"] .card-link')?.textContent.includes('Play latest'));
 for(const game of ['crossword','mini']){assert((await p.locator(`[data-game="${game}"]`).innerText()).includes('Latest available: '+previous));assert.equal(new URL(await p.locator(`[data-game="${game}"] a`).getAttribute('href'),base).searchParams.get('daily'),'1');}
 assert(!(await p.locator('[data-game="connections"]').innerText()).includes('Not available yet'));
 available.crossword=available.mini=true;await p.evaluate(()=>{jumpTime(61000);dispatchEvent(new Event('focus'));});await p.waitForFunction(()=>document.querySelector('#daily-message').textContent.includes('3/3 downloaded'));assert(!await p.locator('#daily-grid').innerText().then(text=>text.includes('Play latest')));assert.deepEqual(errors,[]);await context.close();
 console.log('PASS Sydney homepage mixed publication times refresh on focus, all current links marked daily, no false same-date completion');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
