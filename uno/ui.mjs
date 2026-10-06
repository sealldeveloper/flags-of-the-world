import {Room, savedInvite} from './room.mjs';
import {COLOURS, cardLabel, MAX_PLAYERS} from './engine.mjs';
import {RULES} from './rules.mjs';
import {paintAvatar} from './profiles.mjs';
import {LobbyControls} from './lobby.mjs';
import {TablePresentation} from './presentation.mjs';
const $ = id => document.getElementById(id);
let room = null, view = null, online = false, pending = false, cardAction = null;
let table3d = null, sceneLoading = null, lobbyControls = null, lastForcedChoice = null, animating = false;
let unoArmed=false, resultRound=null;
const presentation = new TablePresentation(render,{reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});
function pingText(ms){return Number.isInteger(ms)?`${ms} ms`:'— ms';}
function updateLatency(values){for(const el of document.querySelectorAll('#players .seat')){const ping=el.querySelector('.seat-ping');if(ping)ping.textContent=pingText(values[el.dataset.seatId]);}}
async function syncScene() {
  if (view?.phase !== 'playing') { table3d?.stop(); $('scene-loading').hidden = true; return; }
  if (!table3d) {
    $('scene-loading').hidden = false;
    sceneLoading ||= import('./scene.mjs').then(async ({CardTable}) => { const scene = new CardTable($('scene'), {onError:error}); await scene.ready; table3d = scene; return scene; });
    try { await sceneLoading; }
    catch (e) { sceneLoading = null; $('scene-loading').textContent = '3D graphics unavailable. WebGL and the local game assets are required.'; error(`Cannot load the 3D table: ${e.message}`); return; }
  }
  if (view?.phase !== 'playing') { table3d.stop(); $('scene-loading').hidden = true; return; }
  table3d.update(view, {online,pending});
  document.body.classList.add('scene-ready'); $('scene-loading').hidden = true;
}
function error(message = '') { $('error').textContent = message; $('error').hidden = !message; lobbyControls?.onError(message); }
function theme(value) { document.documentElement.dataset.theme = value; localStorage.setItem('xw-theme', value); $('theme').textContent = value === 'dark' ? 'Light theme' : 'Dark theme'; }
theme(localStorage.getItem('xw-theme') || 'light');
$('theme').onclick = () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$('credits').onclick = () => $('credits-dialog').showModal();
$('name').value = localStorage.getItem('uno-name') || '';
$('resume').hidden = !savedInvite();
function readIncomingInvite() {
  const incoming = new URLSearchParams(location.hash.slice(1)).get('join');
  if (!incoming) return;
  $('invite-input').value = incoming;
  history.replaceState(null, '', location.pathname + location.search);
  if (room && !room.disposed) error('An invite was opened. Leave your current room before joining it.');
}
readIncomingInvite();
window.addEventListener('hashchange', readIncomingInvite);
function busy(value) { for (const id of ['create','join','resume','name','invite-input']) $(id).disabled = value; }
async function enter(invite = '') {
  if (!$('entry-form').reportValidity()) return;
  error(); busy(true);
  const current = new Room({onView:(...args)=>presentation.receive(...args), onLatency:updateLatency, onStatus:text => { $('connection').textContent = text; }, onError:error});
  room = current;
  try {
    localStorage.setItem('uno-name', $('name').value.trim());
    await current.open($('name').value, invite);
    if (room === current) { $('leave').hidden = false; $('leave').textContent = current.isHost ? 'End room' : 'Leave room'; }
  } catch (e) {
    error(e.message); await current.stop();
    if (room === current) room = null;
    $('connection').textContent = 'Not connected'; busy(false);
  }
}
$('entry-form').onsubmit = e => { e.preventDefault(); enter(); };
$('join').onclick = () => {
  if (!$('invite-input').value.trim()) { error('Paste an invite link first.'); $('invite-input').focus(); return; }
  enter($('invite-input').value);
};
$('resume').onclick = () => enter(savedInvite());
$('leave').onclick = async () => {
  if (room?.isHost && !confirm('End this room for everyone?')) return;
  await room?.leave(); presentation.reset(); lobbyControls?.reset(); room = null; view = null; lastForcedChoice = null; animating=false; unoArmed=false;resultRound=null;$('round-result').close();document.body.dataset.presenting='false';
  $('room').hidden = true; $('entry').hidden = false; $('leave').hidden = true; $('resume').hidden = true;
  document.body.classList.remove('playing','scene-ready','dense-table'); table3d?.stop(); $('scene-loading').hidden = true;
  $('connection').textContent = 'Not connected'; busy(false); error();
};
const command = action => { if(animating&&['play','draw','pass'].includes(action.type))return; error(); room?.command(action); };
lobbyControls = new LobbyControls({getRoom:()=>room, command});
// Match the original lobby's illustrated grid and ordering; transport/rule keys stay unchanged.
const lobbyRules = [
  ['stack2','Stacking','stacking'], ['forcePlay','Force Play','force-play'],
  ['drawUntilPlayable','Draw To Play','draw-to-play'], ['jumpIn','Jump In','jump-in'],
  ['sevenZero','7–0','seven-zero'],
];
for (const [key,label,asset] of lobbyRules) {
  const {help}=RULES.find(rule=>rule.key===key);
  const toggle=document.createElement('label'); toggle.className='rule-tile'; toggle.title=help;
  const input=document.createElement('input'); input.type='checkbox'; input.id=key; input.setAttribute('aria-describedby',`rule-detail-${key}`);
  const art=document.createElement('span'); art.className='rule-art';
  const image=document.createElement('img'); image.src=`./assets/scuffeduno/rules/${asset}.png`; image.alt=''; image.draggable=false;
  const checked=document.createElement('span'); checked.className='rule-state'; checked.textContent='✓'; checked.setAttribute('aria-hidden','true');
  const caption=document.createElement('span'); caption.className='rule-caption'; caption.textContent=label;
  art.append(image,checked); toggle.append(input,art,caption); $('rule-toggles').append(toggle);
  const term=document.createElement('dt'), detail=document.createElement('dd'); term.textContent=label; detail.id=`rule-detail-${key}`; detail.textContent=help; $('rule-descriptions').append(term,detail);
  input.onchange=()=>command({type:'rules',...Object.fromEntries(RULES.map(({key})=>[key,$(key).checked]))});
}
$('add-bot').onclick = () => command({type:'bot'});
$('start').onclick = () => command({type:'start'});
$('ready').onclick = () => command({type:'ready', ready:!view.players.find(p => p.id === view.self).ready});
$('draw').onclick = () => command({type:'draw'});
$('pass').onclick = () => command({type:'pass'});
$('drawn-play').onclick = () => {if(view?.drawn)playCard(view.drawn);};
$('call-uno').onclick=()=>{
  if(!online||pending||animating||view?.phase!=='playing')return;
  if(view.hand.length===1)command({type:'uno'});
  else if(view.hand.length===2){unoArmed=!unoArmed;render(view,online,pending,animating);}
};
$('result-close').onclick=()=>{$('round-result').close();$('show-results').focus();};
$('show-results').onclick=()=>$('round-result').showModal();
$('result-rematch').onclick=()=>command({type:'start'});
function roundResult(v) {
  $('show-results').hidden=v.phase!=='finished';
  if(v.phase!=='finished'){if($('round-result').open)$('round-result').close();return;}
  const won=v.self===v.winner,winner=v.players.find(p=>p.id===v.winner);
  $('round-result').dataset.outcome=won?'win':'loss';
  $('result-round').textContent=`Round ${v.round} complete`;
  $('result-title').textContent=won?'You won!':'You lost this round';
  $('result-summary').textContent=won?'You finished with no cards.':`${winner?.name||'Another player'} finished with no cards.`;
  $('result-players').replaceChildren(...[...v.players].sort((a,b)=>(b.id===v.winner)-(a.id===v.winner)).map(p=>{
    const li=document.createElement('li'),name=document.createElement('span'),count=document.createElement('strong');
    name.textContent=p.name+(p.id===v.self?' (you)':'');count.textContent=p.id===v.winner?'Winner':`${p.count} card${p.count===1?'':'s'}`;
    li.append(name,count);return li;
  }));
  const host=v.self===v.host;
  $('result-rematch').hidden=!host;$('result-rematch').disabled=$('start').disabled||pending;
  $('result-help').textContent=!online?'The connection is unavailable. Reconnect or leave the room.':host?($('start').disabled?'Everyone must be connected and ready for another round.':'Play again with this group and the same rules.'): 'Waiting for the host to deal another round. You can return to the lobby meanwhile.';
  const key=`${room.ticket.room}:${v.round}`;
  if(resultRound!==key){resultRound=key;if(!$('round-result').open)$('round-result').showModal();}
}
function makeCard(c, interactive = false) {
  const el = document.createElement(interactive ? 'button' : 'div'); el.className = `card ${c.colour} symbol-${c.value}`;
  if (interactive) { el.type = 'button'; el.dataset.cardId = c.id; }
  el.setAttribute('aria-label', cardLabel(c));
  const image = document.createElement('img'); image.alt = ''; image.draggable = false;
  image.src = `./assets/scuffeduno/${c.colour}-${c.value}.png`;
  el.append(image); return el;
}
function render(v, connected = true, waiting = false, presenting = false) {
  if (!v) return;
  const previousRevision = view?.revision;
  const enteringGame = view?.phase !== 'playing' && v.phase === 'playing';
  if(!view||view.round!==v.round||view.self!==v.self||view.hand.map(c=>c.id).join(',')!==v.hand.map(c=>c.id).join(','))unoArmed=false;
  view = v; online = connected; pending = waiting; animating=presenting;
  document.body.dataset.presenting=String(presenting);
  $('room').dataset.effect=v.presentation?.kind||''; $('room').dataset.effectPhase=v.presentation?.phase||''; $('room').dataset.autoDraw=String(!!v.autoDraw);
  if ($('choice').open && (previousRevision !== v.revision || !connected || waiting || v.phase !== 'playing' || !v.legal.includes(cardAction?.cardId))) $('choice').close('stale');
  $('entry').hidden = true; $('room').hidden = false; $('leave').hidden = false;
  $('room').dataset.revision = String(v.revision); $('room').dataset.self = v.self;
  const playing = v.phase === 'playing';
  $('room').classList.toggle('in-game', playing);
  document.body.classList.toggle('playing', playing);
  document.body.classList.toggle('dense-table', playing && v.players.length >= 4);
  const playerHome = playing ? $('opponent-zone') : $('players-home');
  if ($('players').parentElement !== playerHome) playerHome.prepend($('players'));
  lobbyControls.update(v,{online,pending});
  const host = v.self === v.host;
  const me = v.players.find(p => p.id === v.self);
  const current = v.players.find(p => p.id === v.turn);
  $('phase-title').textContent = v.phase === 'lobby' ? 'Waiting for players' : v.phase === 'finished' ? `${v.players.find(p => p.id === v.winner)?.name} wins!` : `Round ${v.round}`;
  $('room-label').textContent = `Private group · ${room.ticket.room.slice(0,8)}`;
  $('lobby-name').textContent = `${v.players.find(p=>p.id===v.host)?.name || 'Host'}'s Room`;
  $('seat-count').textContent = `${v.players.length} / ${MAX_PLAYERS}`;
  $('rules-instruction').textContent = host ? '(click to toggle)' : '(host chooses)';
  $('players').replaceChildren();
  for (const p of v.players) {
    const li = document.createElement('li'); li.className = `seat${v.phase === 'playing' && p.id === v.turn ? ' current' : ''}${p.id === v.self ? ' self' : ''}`;
    const avatar = document.createElement('span'); avatar.className = 'seat-avatar'; avatar.setAttribute('aria-hidden','true'); paintAvatar(avatar,p.avatar);
    li.append(avatar);
    li.dataset.seatId = p.id;
    li.classList.toggle('swap-source',v.presentation?.kind==='swap'&&v.presentation.from===p.id);
    li.classList.toggle('swap-target',v.presentation?.kind==='swap'&&v.presentation.to===p.id);
    const info = document.createElement('div'); info.className = 'seat-info';
    const name = document.createElement('span'); name.className = 'seat-name'; name.textContent = p.name + (p.id === v.self ? ' (you)' : '');
    const status = document.createElement('span'); status.className = 'seat-status';
    status.textContent = `${p.id === v.host ? 'Host · ' : ''}${p.bot ? 'Bot' : !p.connected ? 'Disconnected' : v.phase === 'playing' ? 'Connected' : p.ready ? 'Ready' : 'Not ready'}${v.phase === 'playing' && p.unoCalled ? ' · UNO!' : ''}`;
    name.title = name.textContent;
    info.append(name,status); li.append(info);
    const fan = document.createElement('div'); fan.className = 'opponent-fan'; fan.setAttribute('aria-hidden','true');
    const backs = Math.min(p.count,7);
    for (let i=0;i<backs;i++) {
      const back = document.createElement('span'); back.className = 'card-back';
      back.style.setProperty('--fan-angle', `${(i-(backs-1)/2)*5}deg`); fan.append(back);
    }
    li.append(fan);
    const meta=document.createElement('div');meta.className='seat-meta';
    if (v.phase !== 'lobby') { const count = document.createElement('span'); count.className = 'seat-count'; count.textContent = p.unoCalled?'UNO!':`${p.count} card${p.count===1?'':'s'}`; meta.append(count); }
    const ping=document.createElement('span');ping.className='seat-ping';ping.textContent=pingText(room?.latency?.[p.id]);ping.title=p.bot?'Local bot: no network hop':p.id===v.host?'Host: local authority, no network hop':'Measured round-trip to the host over iroh';meta.append(ping);li.append(meta);
    if (host && p.id !== v.host && (v.phase !== 'playing' || !p.connected)) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = v.phase === 'playing' ? 'Use bot' : 'Remove'; remove.disabled = !online;
      remove.setAttribute('aria-label', `${remove.textContent}: ${p.name}`);
      remove.onclick = () => command({type:'remove', target:p.id}); li.append(remove);
    }
    $('players').append(li);
  }
  $('add-bot').hidden = !host || v.phase === 'playing'; $('add-bot').disabled = !online || v.players.length >= MAX_PLAYERS;
  $('start').hidden = !host || v.phase === 'playing'; $('start').textContent = v.phase === 'finished' ? 'Deal another round' : 'Start Game';
  $('start').disabled = !online || v.players.length < 2 || v.players.some(p => !p.ready || !p.connected);
  $('ready').hidden = host || v.phase === 'playing'; $('ready').textContent = me?.ready ? 'Unready' : 'Ready'; $('ready').disabled = !online || pending;
  $('lobby-help').textContent = !online ? (room.disposed ? 'This room has closed. Leave to create or join another lobby.' : 'Connection lost. Moves are paused while reconnecting.') : v.phase === 'playing' ? 'Keep the host tab open. Disconnected players can be replaced with bots.' : 'Everyone must be ready to deal. Share the invite with your group.';
  for (const {key} of RULES) { $(key).checked = v.rules[key]; $(key).disabled = !host || !online || v.phase === 'playing'; }
  $('rules-panel').hidden = v.phase === 'playing';
  $('table').hidden = v.phase === 'lobby';
  roundResult(v);
  if (v.phase === 'lobby') { syncScene(); return; }
  const jumpWindow=v.presentation?.kind==='jump-window';
  const canPlay = online && !pending && !animating && v.phase === 'playing' && !(jumpWindow&&v.turn===v.self);
  const turn = canPlay && v.turn === v.self, jumping = canPlay && !turn && v.legal.length > 0;
  $('call-uno').disabled=!online||pending||animating||!playing||![1,2].includes(v.hand.length)||me.unoCalled;
  $('call-uno').textContent=me.unoCalled?'Called ✓':unoArmed?'Armed ✓':'UNO!';
  $('call-uno').setAttribute('aria-pressed',String(unoArmed||me.unoCalled));
  $('call-uno').setAttribute('aria-label',me.unoCalled?'UNO called':unoArmed?'UNO armed for your next play — press to cancel':v.hand.length===2?'Arm UNO for your next play':'Call UNO');
  $('turn-label').textContent = v.phase === 'finished' ? 'Round complete' : !online ? (room.disposed ? 'Room closed' : 'Reconnecting…') : !current?.connected ? `Waiting for ${current?.name} to reconnect` : v.turn === v.self ? 'Your turn' : jumping ? 'Jump in — exact match!' : `${current?.name}'s turn`;
  $('direction').textContent = v.direction === 1 ? 'Clockwise →' : '← Counterclockwise';
  $('direction-orbit').classList.toggle('reversed', v.direction === -1);
  $('self-name').textContent = `${me.name} · your hand`;
  const name=id=>v.players.find(p=>p.id===id)?.name||'Player',effect=v.presentation;
  $('notice').textContent = effect?.kind==='draw'?`${name(effect.player)} draws a card (${effect.step}).`:effect?.kind==='swap'?`${name(effect.from)} → ${name(effect.to)} · ${effect.phase==='select'?'Selected for a hand swap':effect.phase==='pause'?'Returning the other hand next…':'Swapping hands…'}`:effect?.kind==='rotate'?`All hands pass ${effect.direction===1?'clockwise':'counterclockwise'}${effect.phase==='select'?' — get ready.':'…'}`:jumpWindow?'Jump-in window — match the colour and number.':v.autoDraw?`${current.name} ${v.debt?`draws ${v.debt} automatically`:'has no playable card — drawing automatically'}.`:v.notice;
  $('discard').replaceChildren(...(v.top ? [makeCard(v.top)] : []));
  $('current-colour').textContent = `${current?.name||'Player'}'s turn`;
  $('current-colour').setAttribute('aria-label',`${current?.name||'Player'}'s turn. Current colour: ${v.colour}.`);
  $('debt').textContent = v.debt ? `+${v.debt} cards` : '';
  $('draw').disabled = !turn || !!v.drawn || v.autoDraw;
  $('draw').textContent = v.autoDraw?(v.debt?`Drawing ${v.debt} automatically`:'Drawing automatically'):v.debt ? `Draw ${v.debt} cards` : v.rules.drawUntilPlayable ? 'Draw until playable' : 'Draw a card';
  $('drawn-decision').hidden = !v.drawn || animating || !online;
  $('drawn-play').disabled = !turn;
  $('pass').hidden = !v.drawn || v.rules.forcePlay; $('pass').disabled = !turn;
  $('hand-count').textContent = `(${v.hand.length})`;
  $('hand-help').textContent = v.autoDraw&&v.turn===v.self ? (v.debt?'Drawing the forced penalty automatically.':'No playable cards — drawing automatically.') : v.drawn ? (v.rules.forcePlay ? 'Play the drawn card — force play is on.' : 'Play or keep the drawn card.') : jumping ? 'Tap the identical card to jump in.' : turn ? (v.legal.length ? 'Tap a card to play. Tap the deck to draw.' : 'No playable cards — tap the deck to draw.') : 'Your cards are private to you and the host.';
  // Retain scroll position when snapshots refresh the hand.
  const scroll = $('hand').scrollLeft;
  const focused = document.activeElement?.dataset?.cardId;
  $('hand').replaceChildren();
  for (const c of v.hand) {
    const card = makeCard(c, true); card.disabled = !canPlay || !v.legal.includes(c.id);
    const i = v.hand.indexOf(c), middle = (v.hand.length-1)/2;
    card.style.setProperty('--card-angle', `${Math.max(-9,Math.min(9,(i-middle)*2.5))}deg`);
    card.style.setProperty('--card-rise', `${Math.min(12,Math.abs(i-middle)*2)}px`);
    card.onclick = () => playCard(c.id);
    $('hand').append(card);
  }
  $('hand').scrollLeft = scroll;
  if (focused) $('hand').querySelector(`[data-card-id="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
  syncScene();
  if (turn && !animating && v.drawn && v.rules.forcePlay) {
    const key=`${room.ticket.room}:${v.revision}:${v.drawn}`;
    if (lastForcedChoice !== key) { lastForcedChoice=key; queueMicrotask(()=>playCard(v.drawn)); }
  }
  if (enteringGame) window.scrollTo(0,0);
}
async function choose(title, options) {
  $('choice-title').textContent = title; $('choices').replaceChildren();
  for (const [value,label] of options) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; if (COLOURS.includes(value)) button.dataset.colour = value; button.onclick = () => $('choice').close(value); $('choices').append(button); }
  $('choice').returnValue = ''; $('choice').showModal();
  return new Promise(resolve => $('choice').addEventListener('close', () => resolve($('choice').returnValue), {once:true}));
}
async function playCard(cardId) {
  if (cardAction || animating || !online || pending || view?.phase !== 'playing' || !view.legal.includes(cardId)) return;
  const card = view.hand.find(c => c.id === cardId); if (!card) return;
  // One activation plays a card. Only wilds and 7-swap require a choice;
  // keep that attempt locked until the dialog's close event settles.
  const attempt = cardAction = {room, revision:view.revision, cardId};
  const action = {type:'play', cardId, uno:unoArmed};
  try {
    if (card.colour === 'wild') {
      action.colour = await choose('Choose the next colour', COLOURS.map(c => [c,c[0].toUpperCase()+c.slice(1)]));
      if (!COLOURS.includes(action.colour)) return;
    }
    if (view?.rules.sevenZero && card.value === '7') {
      action.target = await choose('Swap hands with…', view.players.filter(p => p.id !== view.self).map(p => [p.id,`${p.name} · ${p.count} cards`]));
      if (!view?.players.some(p => p.id === action.target && p.id !== view.self)) return;
    }
    if (room !== attempt.room || view?.revision !== attempt.revision || !online || pending || !view.legal.includes(cardId)) {
      error('The table changed. Tap your card again.'); return;
    }
    command(action);
  } finally {
    if (cardAction === attempt) cardAction = null;
  }
}
window.addEventListener('beforeunload', e => { if (room && !room.disposed) { e.preventDefault(); e.returnValue = ''; } });
