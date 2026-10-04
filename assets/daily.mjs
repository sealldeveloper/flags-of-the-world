// Daily puzzle data and progress. Existing game saves remain the source of truth.
export const DATA_CACHE = 'puzzle-daily-data-v1';
const API = 'https://nyt-crossword-proxy.my-account-306.workers.dev';
export const GAMES = Object.freeze([
  {id:'crossword', name:'NYT Crossword', path:'/crossword-nyt/', prefix:'nyt-xw-progress-', api:`${API}/nyt/daily`, icon:'✏️'},
  {id:'mini', name:'NYT Mini', path:'/crossword-nytmini/', prefix:'nyt-mini-xw-progress-', api:`${API}/nyt/mini`, icon:'▦'},
  {id:'connections', name:'NYT Connections', path:'/connections-nyt/', prefix:'nyt-connections-v1:', api:`${API}/nyt/connections`, icon:'🟨'},
]);
export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0,4)) >= 1900 &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
}
export function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate()+days); return today(date);
}
export function gameFor(id) {
  const game = GAMES.find(game=>game.id===id); if (!game) throw new Error('Unknown daily game.'); return game;
}
export function puzzlePath(game, date) {
  if (!validDate(date)) throw new Error('Invalid puzzle date.');
  return `${game.path}puzzles/${date.slice(0,4)}/${date.slice(5,7)}/${date}.json`;
}
export function playUrl(game, date, mode = 'standard') {
  const query = new URLSearchParams(game.id==='connections'?{date,mode}:{puzzle:date});
  return game.path + '?' + query;
}
export function validatePuzzle(game, date, data) {
  // Malformed server/cache payloads must be rejected, not break cache recovery.
  try {
  if(data?.assets!=null && (!Array.isArray(data.assets) || data.assets.some(asset=>typeof asset?.uri!=='string')))return false;
  if (game.id==='connections') {
    const cards = data?.categories?.flatMap(category=>category.cards||[]);
    return data?.status==='OK' && data.print_date===date && data.categories.length===4 && cards?.length===16 &&
      data.categories.every(category=>typeof category?.title==='string' && Array.isArray(category.cards) && category.cards.length===4 && category.cards.every(card=>typeof card?.content==='string' && card.content.trim())) &&
      new Set(cards.map(card=>card.content)).size===16;
  }
  const body=data?.body?.[0], dimensions=body?.dimensions;
  return data?.publicationDate===date && Number.isInteger(dimensions?.width) && dimensions.width>0 && dimensions.width<=100 &&
    Number.isInteger(dimensions?.height) && dimensions.height>0 && dimensions.height<=100 &&
    Array.isArray(body.cells) && body.cells.length===dimensions.width*dimensions.height && body.cells.every(cell=>!cell || typeof cell==='object' && (cell.answer===undefined || typeof cell.answer==='string') && (cell.moreAnswers?.valid==null || Array.isArray(cell.moreAnswers.valid))) &&
    Array.isArray(body.clues) && body.clues.every(clue=>Array.isArray(clue?.text) && clue.text.every(text=>typeof text?.plain==='string')) &&
    Array.isArray(body.clueLists) && ['Across','Down'].every(name=>body.clueLists.some(list=>list.name===name && Array.isArray(list.clues) && list.clues.every(index=>Number.isInteger(index) && index>=0 && index<body.clues.length)));
  } catch(_) { return false; }
}
async function cache() { try { return await caches.open(DATA_CACHE); } catch (_) { return null; } }
async function cachedJSON(path) {
  try { const response=await (await cache())?.match(path); return response ? await response.json() : null; } catch (_) { return null; }
}
async function storeJSON(path, data) {
  try {
    const target=await cache(); if (!target) return false;
    await target.put(path,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
    return true;
  } catch (_) { return false; }
}
async function request(url, signal, consume) {
  const timeout=new AbortController(), abort=()=>timeout.abort();
  signal?.addEventListener('abort',abort,{once:true});
  if (signal?.aborted) abort();
  const timer=setTimeout(abort,10000);
  try {
    const response=await fetch(url,{signal:timeout.signal,cache:'no-cache'});
    if (!response.ok) throw new Error(response.status===404?'This puzzle is not available yet.':`Puzzle request failed (${response.status}).`);
    return await consume(response);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
}
const fetchJSON=(url,signal)=>request(url,signal,response=>response.json());
async function storeAssets(game,data,signal) {
  const target=await cache();
  for(const asset of data.assets||[]) {
    try {
      const url=new URL(asset.uri,new URL(game.path,location.origin));
      if(url.origin!==location.origin || !url.pathname.startsWith(game.path+'puzzles/') || !/\.(png|webp|svg|jpe?g)$/i.test(url.pathname) || !target || await target.match(url))continue;
      await request(url,signal,async response=>{if(response.headers.get('Content-Type')?.startsWith('image/'))await target.put(url,response);});
    } catch(_) { /* A missing image leaves the offline-ready indicator false. */ }
  }
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
}
export async function loadManifest(game) {
  const path=`${game.path}puzzles/manifest.json`;
  try {
    const data=await fetchJSON(path);
    if (!Array.isArray(data)) throw new Error('Invalid archive list.');
    const dates=data.filter(validDate); await storeJSON(path,dates); return dates;
  } catch (_) { const data=await cachedJSON(path); return Array.isArray(data)?data.filter(validDate):[]; }
}
export async function cachedPuzzle(game, date) {
  const data=await cachedJSON(puzzlePath(game,date)); return validatePuzzle(game,date,data)?data:null;
}
export async function loadPuzzle(id, date, {signal, api, refresh=false} = {}) {
  const game=gameFor(id), path=puzzlePath(game,date);
  const saved=await cachedPuzzle(game,date);
  if (signal?.aborted) throw new DOMException('Aborted','AbortError');
  if (saved && !refresh) {await storeAssets(game,saved,signal);return saved;}
  let data, error;
  for (const url of [path,`${api||game.api}/${date}`]) {
    try {
      data=await fetchJSON(url,signal);
      if (!validatePuzzle(game,date,data)) throw new Error('The service returned an invalid puzzle or a different date.');
      break;
    } catch (err) { data=null; error=err; if (signal?.aborted) throw err; }
  }
  if (!data) {
    if(saved)return saved;
    if(typeof navigator!=='undefined' && navigator.onLine===false)throw new Error('This puzzle is not downloaded. Connect to download it first.');
    throw error||new Error('Puzzle unavailable. Connect to download it first.');
  }
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  await storeJSON(path,data);
  await storeAssets(game,data,signal);
  return data;
}
export async function offlineReady(game,date) {
  const data=await cachedPuzzle(game,date); if(!data)return false;
  const target=await cache();
  for(const asset of data.assets||[]) {
    try {
      const url=new URL(asset.uri,new URL(game.path,location.origin));
      if(url.origin!==location.origin || !await target?.match(url))return false;
    } catch(_){return false;}
  }
  return true;
}
export async function downloadedDates() {
  try {
    const keys=await (await cache())?.keys()||[];
    return [...new Set(keys.map(request=>new URL(request.url).pathname.match(/\/(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter(validDate))];
  } catch (_) { return []; }
}
export function readSaved(storage, key) { try { return JSON.parse(storage.getItem(key)||'null'); } catch (_) { return null; } }
export function savedDates(storage) {
  try {
    const dates=[];
    for(let i=0;i<storage.length;i++) {
      const key=storage.key(i),game=GAMES.find(game=>key?.startsWith(game.prefix));
      if(game) {const date=key.slice(game.prefix.length).split(':')[0];if(validDate(date))dates.push(date);}
    }
    return [...new Set(dates)];
  } catch(_) { return []; }
}
const empty = () => ({status:'not-started',label:'Not started',detail:'Ready when you are',done:false,mode:'standard'});
export function connectionsStatus(standard, easy) {
  const attempts=[['standard',standard],['easy',easy]].map(([mode,saved])=>{
    const result={...empty(),mode,updatedAt:Number(saved?.updatedAt)||0,continued:saved?.continuedFromStandard===true}; if(!saved||typeof saved!=='object')return result;
    const solved=new Set((Array.isArray(saved.solved)?saved.solved:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<4)).size;
    const guesses=Array.isArray(saved.guesses)?saved.guesses.filter(g=>Array.isArray(g)&&g.length===4).length:0;
    const hints=Array.isArray(saved.reveals)?saved.reveals.length:0;
    if(solved===4)return {...result,status:'completed',label:'Completed',detail:`${guesses} guesses · ${mode} mode`,done:true};
    if(saved.lost && (saved.answersRevealed===true || saved.answersRevealed===undefined))return {...result,status:'revealed',label:'Answers revealed',detail:`${solved}/4 groups found · ${mode} mode`,done:true};
    if(guesses||solved||hints||saved.lost)return {...result,status:'in-progress',label:'In progress',detail:saved.lost?'Choose how to continue':`${solved}/4 groups found · ${mode} mode`};
    return result;
  });
  const rank={'completed':4,'in-progress':3,'revealed':2,'not-started':0};
  return attempts.sort((a,b)=>rank[b.status]-rank[a.status] || b.updatedAt-a.updatedAt || Number(b.continued)-Number(a.continued))[0];
}
// Same answer/rebus/alternative rules as the NYT adapters, for older saves.
export function crosswordSummary(saved, puzzle) {
  const body=puzzle?.body?.[0], width=body?.dimensions?.width;
  if(!body||!Array.isArray(saved?.userGrid))return null;
  let total=0,filled=0,correct=0,assisted=0;
  for(let index=0;index<body.cells.length;index++) {
    const cell=body.cells[index]; if(!cell?.answer)continue;
    const clean=value=>String(value).replaceAll('/','').trim().toUpperCase();
    let answer=clean(cell.answer);
    const alternatives=(cell.moreAnswers?.valid||[]).map(clean);
    if(!answer)answer=alternatives.find(value=>/^[A-Z]$/.test(value))||'';
    if(!answer)continue;
    const r=Math.floor(index/width),c=index%width,entered=saved.userGrid[r]?.[c]||'';
    if(!cell.answer.trim() && cell.moreAnswers?.valid)alternatives.push('');
    total++;if(entered)filled++;if(entered===answer||alternatives.includes(entered))correct++;
    if(saved.revealed?.[r]?.[c])assisted++;
  }
  return {version:1,total,filled,complete:total>0&&correct===total,assisted};
}
export function crosswordStatus(saved, summary=saved?.dailySummary) {
  if(!saved||!Array.isArray(saved.userGrid))return empty();
  const valid=summary?.version===1 && Number.isInteger(summary.total)&&summary.total>0&&Number.isInteger(summary.filled)&&summary.filled>=0&&summary.filled<=summary.total;
  if(valid&&summary.complete===true)return {...empty(),status:'completed',label:'Completed',done:true,detail:summary.assisted?'Completed with reveals':'All squares correct'};
  const filled=valid?summary.filled:saved.userGrid.flat().filter(value=>typeof value==='string'&&value.length>0).length;
  if(filled||saved.timerSec>0)return {...empty(),status:'in-progress',label:'In progress',detail:valid?`${filled}/${summary.total} squares filled`:'Saved progress'};
  return empty();
}
export async function progress(game,date,storage) {
  const saved=readSaved(storage,game.prefix+date);
  if(game.id==='connections')return connectionsStatus(saved,readSaved(storage,game.prefix+date+':easy'));
  if(saved?.userGrid && !saved.dailySummary) {
    try {return crosswordStatus(saved,crosswordSummary(saved,await loadPuzzle(game.id,date)));}catch(_){/* Keep legacy progress visible, never guess completion. */}
  }
  return crosswordStatus(saved);
}
