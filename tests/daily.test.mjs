import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {GAMES,today,validDate,shiftDate,gameFor,puzzlePath,playUrl,validatePuzzle,crosswordSummary,crosswordStatus,connectionsStatus,readSaved,savedDates,loadPuzzle,loadManifest,offlineReady,DATA_CACHE} from '../assets/daily.mjs';
const fixture=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const mini=fixture('../crossword-nytmini/puzzles/2026/10/2026-10-02.json');
const connections=fixture('../connections-nyt/puzzles/2026/10/2026-10-02.json');
const date='2026-10-02';
const storage=entries=>({length:Object.keys(entries).length,key:i=>Object.keys(entries)[i],getItem:key=>entries[key]??null});
function solvedGrid(puzzle){const b=puzzle.body[0],w=b.dimensions.width;return Array.from({length:b.dimensions.height},(_,r)=>Array.from({length:w},(_,c)=>(b.cells[r*w+c]?.answer||'').replaceAll('/','').trim().toUpperCase()));}
function cacheHarness(t){
 const old={fetch:globalThis.fetch,caches:globalThis.caches,location:globalThis.location},entries=new Map();
 const cache={match:async key=>entries.get(String(key))?.clone(),put:async(key,response)=>entries.set(String(key),response.clone()),keys:async()=>[...entries.keys()].map(key=>({url:new URL(key,'http://localhost').href}))};
 globalThis.caches={open:async name=>{assert.equal(name,DATA_CACHE);return cache;}};globalThis.location=new URL('http://localhost/');
 t.after(()=>Object.assign(globalThis,old));return {entries,cache};
}
test('local calendar dates, leap years and day stepping',()=>{
 assert.equal(today(new Date(2026,9,2,23,59)),date);assert(validDate('2024-02-29'));assert(!validDate('2026-02-29'));
 for(const invalid of ['2026-13-01','2026-02-30','foo','2026-1-01','0001-01-01',null])assert(!validDate(invalid));
 assert.equal(shiftDate('2026-01-01',-1),'2025-12-31');assert.equal(shiftDate('2026-10-04',1),'2026-10-05');
});
test('only the three true dailies have status keys and dated routes',()=>{
 assert.deepEqual(GAMES.map(game=>game.id),['crossword','mini','connections']);assert.throws(()=>gameFor('seattle'));
 assert.equal(puzzlePath(gameFor('mini'),date),'/crossword-nytmini/puzzles/2026/10/2026-10-02.json');
 assert.equal(playUrl(gameFor('connections'),date,'easy'),'/connections-nyt/?date=2026-10-02&mode=easy');
 assert.throws(()=>puzzlePath(gameFor('mini'),'../../no'));
});
test('daily downloads validate shape and exact publication date',()=>{
 assert(validatePuzzle(gameFor('mini'),date,mini));assert(validatePuzzle(gameFor('connections'),date,connections));
 assert(!validatePuzzle(gameFor('mini'),'2026-10-03',mini));assert(!validatePuzzle(gameFor('connections'),'2026-10-03',connections));
 assert(!validatePuzzle(gameFor('mini'),date,{body:[]}));assert(!validatePuzzle(gameFor('connections'),date,{status:'OK',categories:[]}));
 for(const categories of [{},[null],42])assert.equal(validatePuzzle(gameFor('connections'),date,{...connections,categories}),false);
 assert.equal(validatePuzzle(gameFor('mini'),date,{...mini,assets:{}}),false);
});
test('every committed daily archive passes the download validator',()=>{
 for(const game of GAMES){
  const dates=fixture('..'+game.path+'puzzles/manifest.json');
  for(const date of dates)assert(validatePuzzle(game,date,fixture('..'+puzzlePath(game,date))),`${game.id} ${date}`);
 }
});
test('empty and downloaded-only puzzles are not started',()=>{
 assert.equal(crosswordStatus(null).status,'not-started');assert.equal(crosswordStatus({userGrid:[['','']]}).status,'not-started');
 assert.equal(connectionsStatus(null,null).status,'not-started');
});
test('legacy completed crosswords are recognised; full but wrong grids are not',()=>{
 const saved={userGrid:solvedGrid(mini)},summary=crosswordSummary(saved,mini);
 assert(summary.complete);assert.equal(crosswordStatus(saved,summary).status,'completed');
 saved.userGrid[0][0]='WRONG';assert.equal(crosswordStatus(saved,crosswordSummary(saved,mini)).status,'in-progress');
});
test('revealed squares and alternative/rebus answers are represented honestly',()=>{
 const puzzle={body:[{dimensions:{width:3,height:1},cells:[{answer:'KIT/KAT'},{answer:' ',moreAnswers:{valid:['A','']}},{answer:'B',moreAnswers:{valid:['C']}}]}]};
 const saved={userGrid:[['KITKAT','','C']],revealed:[[true,false,false]]};
 const summary=crosswordSummary(saved,puzzle);assert.equal(summary.complete,true);assert.equal(summary.assisted,1);
 assert.equal(crosswordStatus(saved,summary).detail,'Completed with reveals');
});
test('invalid completion metadata cannot mark an empty grid complete',()=>{
 assert.equal(crosswordStatus({userGrid:[['']],dailySummary:{version:1,total:0,filled:0,complete:true}}).done,false);
 assert.equal(crosswordStatus({userGrid:[['A']]}).label,'In progress');
});
test('Connections pending loss is unfinished; explicit and legacy reveal are finished',()=>{
 const lost={lost:true,solved:[0],guesses:[[1,2,3,4]],answersRevealed:false};
 assert.equal(connectionsStatus(lost,null).done,false);assert.match(connectionsStatus(lost,null).detail,/Choose/);
 assert.equal(connectionsStatus({...lost,answersRevealed:true},null).status,'revealed');
 assert.equal(connectionsStatus({lost:true},null).done,true);
});
test('easy continuation resumes easy; completion in either mode counts',()=>{
 const standard={lost:true,answersRevealed:false,guesses:[[1,2,3,4]]};
 assert.equal(connectionsStatus(standard,{guesses:[[1,2,3,4]],continuedFromStandard:true}).mode,'easy');
 const complete={solved:[0,1,2,3],guesses:[]};assert(connectionsStatus(complete,standard).done);assert(connectionsStatus(standard,complete).done);
 assert.equal(connectionsStatus({solved:[0,0,0,0]},null).done,false);
 assert.equal(connectionsStatus({...standard,updatedAt:20},{guesses:[[1,2,3,4]],continuedFromStandard:true,updatedAt:10}).mode,'standard');
});
test('saved date indexing is scoped, malformed-data safe, and read-only',()=>{
 const entries={'nyt-xw-progress-2026-10-02':'{}','nyt-connections-v1:2026-10-01:easy':'{}','xw-progress-260322':'{}','nyt-mini-xw-progress-2026-02-30':'{}','unrelated':'{}'};
 assert.deepEqual(savedDates(storage(entries)).sort(),['2026-10-01','2026-10-02']);assert.equal(readSaved(storage({bad:'{'}),'bad'),null);
 assert.deepEqual(savedDates({get length(){throw new Error('blocked');}}),[]);
});
test('archive miss falls back to API and persists the response at the canonical date URL',async t=>{
 const {entries}=cacheHarness(t),requests=[];
 globalThis.fetch=async url=>{requests.push(String(url));return String(url).startsWith('/')?new Response('missing',{status:404}):Response.json(mini);};
 assert.deepEqual(await loadPuzzle('mini',date),mini);assert.equal(requests.length,2);
 assert(entries.has(puzzlePath(gameFor('mini'),date)));assert(await offlineReady(gameFor('mini'),date));
 globalThis.fetch=async()=>{throw new Error('offline');};assert.deepEqual(await loadPuzzle('mini',date),mini);
});
test('malformed cached puzzles can recover from a valid network response',async t=>{
 const {cache}=cacheHarness(t);await cache.put(puzzlePath(gameFor('connections'),date),Response.json({...connections,categories:{}}));
 globalThis.fetch=async()=>Response.json(connections);assert.deepEqual(await loadPuzzle('connections',date),connections);
});
test('invalid or wrong-day responses never become an offline puzzle',async t=>{
 const {entries}=cacheHarness(t);globalThis.fetch=async()=>Response.json({...mini,publicationDate:'2026-10-03'});
 await assert.rejects(loadPuzzle('mini',date),/different date/);assert.equal(entries.size,0);assert.equal(await offlineReady(gameFor('mini'),date),false);
});
test('quota failure leaves online play working without claiming an offline copy',async t=>{
 const {cache}=cacheHarness(t);cache.put=async()=>{throw new Error('quota');};globalThis.fetch=async()=>Response.json(mini);
 assert.deepEqual(await loadPuzzle('mini',date),mini);assert.equal(await offlineReady(gameFor('mini'),date),false);
});
test('aborted loads do not fetch or overwrite data',async t=>{
 cacheHarness(t);globalThis.fetch=async()=>{throw new Error('must not fetch');};const controller=new AbortController();controller.abort();
 await assert.rejects(loadPuzzle('mini',date,{signal:controller.signal}),{name:'AbortError'});
});
test('manifests refresh online and remain available offline',async t=>{
 cacheHarness(t);globalThis.fetch=async()=>Response.json([date,'bad']);assert.deepEqual(await loadManifest(gameFor('mini')),[date]);
 globalThis.fetch=async()=>{throw new Error('offline');};assert.deepEqual(await loadManifest(gameFor('mini')),[date]);
});
test('missing overlays are retried before claiming complete offline availability',async t=>{
 const {cache}=cacheHarness(t),data={...mini,assets:[{uri:'./puzzles/2026/10/example.png'}]};
 await cache.put(puzzlePath(gameFor('mini'),date),Response.json(data));
 globalThis.fetch=async()=>{throw new Error('offline');};
 await loadPuzzle('mini',date);assert.equal(await offlineReady(gameFor('mini'),date),false);
 globalThis.fetch=async()=>new Response('image',{headers:{'Content-Type':'image/png'}});
 await loadPuzzle('mini',date);assert.equal(await offlineReady(gameFor('mini'),date),true);
});
test('activation removes only old shell caches, preserving puzzle data and unrelated caches',async()=>{
 const handlers={},deleted=[],scope={self:{addEventListener:(name,handler)=>handlers[name]=handler,clients:{claim:async()=>{}}},caches:{keys:async()=>['puzzle-app-shell-old','puzzle-app-shell-v1',DATA_CACHE,'unrelated'],delete:async key=>deleted.push(key)}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),scope);
 let done;handlers.activate({waitUntil:promise=>done=promise});await done;assert.deepEqual(deleted,['puzzle-app-shell-old']);
});
test('service-worker cache denial does not block online responses',async()=>{
 const scope={self:{addEventListener(){}},caches:{open:async()=>{throw new Error('blocked');}},fetch:async()=>new Response('online'),AbortController,setTimeout,clearTimeout};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),scope);
 assert.equal(await(await scope.networkFirst('/','/','shell')).text(),'online');
});
test('service-worker stalled requests fall back to a saved response',async()=>{
 const scope={self:{addEventListener(){}},caches:{open:async()=>({match:async()=>new Response('saved')})},fetch:(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')))),AbortController,setTimeout:fn=>setTimeout(fn,0),clearTimeout};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),scope);
 assert.equal(await(await scope.networkFirst('/','/','shell')).text(),'saved');
});
test('shell precache is complete and excludes all unpublished work',()=>{
 const scope={self:{addEventListener(){}},Set};vm.createContext(scope);
 vm.runInContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8')+'\nthis.files=[...PAGES,...ASSETS];',scope);
 for(const path of scope.files){assert(!/uno|\/docs\/|\/scripts\//.test(path),path);assert(fs.existsSync(new URL('..'+(path.endsWith('/')?path+'index.html':path),import.meta.url)),path);}
 const manifest=fixture('../app.webmanifest');assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert(manifest.icons.some(icon=>icon.sizes==='192x192'));assert(manifest.icons.some(icon=>icon.sizes==='512x512'));
});
