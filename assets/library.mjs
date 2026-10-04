import {GAMES,today,validDate,shiftDate,playUrl,loadManifest,loadPuzzle,progress,offlineReady,downloadedDates,savedDates} from './daily.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
let storage;try{storage=localStorage;storage.getItem('puzzle-theme-v2');}catch(_){$('storage-message').textContent='Progress storage is blocked in this browser. Your game progress may not survive closing it.';}
let currentToday=today(), selected=new URLSearchParams(location.search).get('date');
let followsToday=!validDate(selected)||selected>currentToday,dates=[],shown=14,generation=0,historyGeneration=0;
if(followsToday)selected=currentToday;
function controls(){ $('daily-date').value=selected;$('daily-date').max=currentToday;$('next-day').disabled=selected>=currentToday; }
function dateLabel(date){return new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});}
async function refreshDates(){
  const loaded=await Promise.all(GAMES.map(async game=>[game.id,await loadManifest(game)]));
  dates=[...new Set([currentToday,...loaded.flatMap(([,values])=>values),...savedDates(storage),...await downloadedDates()])].filter(date=>date<=currentToday).sort().reverse();
}
async function statusFor(game,date){
  const [state,offline]=await Promise.all([progress(game,date,storage),offlineReady(game,date)]);
  return {...state,offline,game};
}
function makeCard(item,date){
  const card=node('article',undefined,'card daily-card');card.dataset.game=item.game.id;card.dataset.status=item.status;
  const top=node('span',item.game.icon,'card-icon');top.setAttribute('aria-hidden','true');
  const title=node('h3',item.game.name),badge=node('span',item.label,`status-badge ${item.status}`),detail=node('p',item.detail,'card-details');
  const link=node('a',item.done?'View puzzle →':item.status==='in-progress'?'Continue →':'Play →','card-link');link.href=playUrl(item.game,date,item.mode);
  const offline=node('small',item.offline?'Downloaded for offline play':navigator.onLine?'Not downloaded':'Not downloaded — connect to play','offline-label');
  const heading=node('div',undefined,'daily-card-heading'),actions=node('div',undefined,'daily-card-actions');
  heading.append(top,title);actions.append(link,offline);card.append(heading,badge,detail,actions);return card;
}
async function renderDay(download=false,refresh=false){
  const run=++generation,date=selected;controls();
  if(download){$('save-day').disabled=true;$('daily-message').textContent='Saving available puzzles for this day…';}
  let failures=[];
  if(download){
    await Promise.all(GAMES.map(async game=>{try{await loadPuzzle(game.id,date,{refresh});}catch(_){failures.push(game.name);}}));
  }
  const items=await Promise.all(GAMES.map(game=>statusFor(game,date)));
  if(run!==generation){if(download&&date===selected)renderDay(false).catch(showError);return;}
  const focusedGame=document.activeElement?.closest('.daily-card')?.dataset.game;
  $('daily-grid').replaceChildren(...items.map(item=>makeCard(item,date)));
  if(focusedGame)$('daily-grid').querySelector(`[data-game="${focusedGame}"] .card-link`)?.focus({preventScroll:true});
  const finished=items.filter(item=>item.done).length,saved=items.filter(item=>item.offline).length;
  $('daily-total').textContent=`${finished} of 3 finished`;
  $('save-day').disabled=false;
  $('daily-message').textContent=`${dateLabel(date)} · ${saved}/3 downloaded.${failures.length?' Not available: '+failures.join(', ')+'. Try again when online or after publication.':saved<3?' Connect and save this day for offline play.':''}`;
  if($('daily-history').open)await renderHistory();
}
async function renderHistory(){
  const run=++historyGeneration,filter=$('history-filter').value;
  const candidates=[...new Set([...dates,selected,...savedDates(storage),...await downloadedDates()])].filter(date=>date<=currentToday).sort().reverse();
  const rows=[];
  // A bounded page avoids downloading an entire back catalogue to recognise legacy saves.
  for(const date of candidates.slice(0,shown)){
    const states=await Promise.all(GAMES.map(game=>statusFor(game,date)));
    if(run!==historyGeneration)return;
    const done=states.every(item=>item.done),saved=states.filter(item=>item.offline).length;
    if(filter==='finished'&&!done||filter==='unfinished'&&done||filter==='saved'&&!saved)continue;
    const row=node('tr');row.dataset.date=date;
    const day=node('td'),link=node('a',dateLabel(date));link.href='/?date='+date;
    link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();chooseDate(date);$('daily-heading').scrollIntoView({block:'start'});});day.append(link);row.append(day);
    for(const item of states){const cell=node('td'),play=node('a',item.label);play.href=playUrl(item.game,date,item.mode);play.title=item.detail;play.dataset.status=item.status;cell.append(play);row.append(cell);}
    row.append(node('td',`${saved}/3 saved`));rows.push(row);
  }
  const focusedHref=document.activeElement?.closest('#history-rows a')?.href;
  $('history-rows').replaceChildren(...rows);
  if(focusedHref)[...$('history-rows').querySelectorAll('a')].find(link=>link.href===focusedHref)?.focus({preventScroll:true});
  $('history-empty').hidden=rows.length>0;$('history-empty').textContent='No loaded days match this filter. Show more days to look further back.';
  $('more-days').hidden=candidates.length<=shown;
}
function chooseDate(date,follow=false,updateURL=true){
  if(!validDate(date)||date>today())return;
  selected=date;followsToday=follow;controls();
  if(updateURL){const url=new URL(location.href);if(follow)url.searchParams.delete('date');else url.searchParams.set('date',date);history.pushState(null,'',url);}
  renderDay(navigator.onLine).catch(showError);
}
function showError(error){$('daily-message').textContent=`Could not update the daily library. ${error.message||'Please try again.'}`;$('save-day').disabled=false;}
async function refreshActive(){
  const next=today(),changed=next!==currentToday;
  if(changed){currentToday=next;if(followsToday)selected=next;await refreshDates();}
  await renderDay(changed&&followsToday&&navigator.onLine);
}
$('daily-date').addEventListener('change',()=>{if(validDate($('daily-date').value)&&$('daily-date').value<=today())chooseDate($('daily-date').value);else controls();});
$('previous-day').addEventListener('click',()=>chooseDate(shiftDate(selected,-1)));
$('next-day').addEventListener('click',()=>chooseDate(shiftDate(selected,1)));
$('today').addEventListener('click',()=>chooseDate(today(),true));
$('save-day').addEventListener('click',()=>renderDay(true,true).catch(showError));
$('daily-history').addEventListener('toggle',()=>{if($('daily-history').open)renderHistory().catch(showError);});
$('history-filter').addEventListener('change',()=>renderHistory().catch(showError));
$('more-days').addEventListener('click',()=>{shown+=14;renderHistory().catch(showError);});
addEventListener('popstate',()=>{const date=new URLSearchParams(location.search).get('date');chooseDate(validDate(date)?date:today(),!date,false);});
addEventListener('pageshow',event=>{if(event.persisted)refreshActive().catch(showError);});
addEventListener('focus',()=>refreshActive().catch(showError));
addEventListener('storage',event=>{if(event.key===null||GAMES.some(game=>event.key?.startsWith(game.prefix)))refreshActive().catch(showError);});
addEventListener('online',()=>{refreshDates().then(()=>renderDay(true)).catch(showError);});
addEventListener('offline',()=>renderDay(false).catch(showError));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshActive().catch(showError);});
setInterval(()=>{if(!document.hidden&&today()!==currentToday)refreshActive().catch(showError);},60000);
controls();
await refreshDates();
await renderDay(navigator.onLine).catch(showError);
