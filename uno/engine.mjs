// Pure game rules. The host owns this state; never transmit it directly.
import {DEFAULT_RULES} from './rules.mjs';
import {defaultAvatar} from './profiles.mjs';
export const COLOURS = ['red', 'yellow', 'green', 'blue'];
export const MAX_PLAYERS = 8;
export const cardLabel = c => `${c.colour === 'wild' ? '' : c.colour + ' '}${({skip:'Skip', reverse:'Reverse', draw2:'Draw two', wild:'Wild', draw4:'Wild draw four'})[c.value] ?? c.value}`;
export const cardMark = c => ({skip:'⊘', reverse:'⇄', draw2:'+2', wild:'W', draw4:'+4'})[c.value] ?? c.value;
export function randomIndex(max) {
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('Invalid random bound');
  const limit = 0x100000000 - (0x100000000 % max);
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}
export function shuffle(cards, random = randomIndex) {
  for (let i = cards.length - 1; i > 0; i--) { const j = random(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
export function createDeck() {
  const deck = [];
  const add = (colour, value) => deck.push({ id: String(deck.length), colour, value });
  for (const colour of COLOURS) {
    add(colour, '0');
    for (const value of ['1','2','3','4','5','6','7','8','9','skip','reverse','draw2']) { add(colour, value); add(colour, value); }
  }
  for (let i = 0; i < 4; i++) { add('wild', 'wild'); add('wild', 'draw4'); }
  return deck;
}
export function newRoom(host) {
  return { phase:'lobby', players:[{...host, avatar:defaultAvatar(), ready:true, connected:true, bot:false, hand:[]}], rules:{...DEFAULT_RULES}, revision:0, round:0, deck:[], discard:[], turn:0, direction:1, debt:0, drawn:null, colour:null, winner:null, notice:'Invite friends or add bots to start.' };
}
export function player(state, id) { const p = state.players.find(p => p.id === id); if (!p) throw new Error('Seat not found'); return p; }
export function startRound(state, random = randomIndex, force = false) {
  if (state.phase === 'playing') throw new Error('Round already started');
  if (state.players.length < 2) throw new Error('At least two players are needed');
  if (state.players.some(p => !p.connected || (!force && !p.ready))) throw new Error('Everyone must be connected and ready');
  state.deck = shuffle(createDeck(), random);
  for (const p of state.players) { p.hand = state.deck.splice(-7); p.unoCalled=false; }
  const first = state.deck.findIndex(c => /^\d$/.test(c.value));
  state.discard = [state.deck.splice(first, 1)[0]];
  state.colour = state.discard[0].colour;
  state.phase = 'playing'; state.turn = 0; state.direction = 1; state.debt = 0; state.drawn = null; state.winner = null; state.round++;
  state.lastPlayedBy = null; state.unoWindow = null; state.revision++;
  state.effects = {revision:state.revision,events:[{kind:'deal',count:7}]}; state.notice = 'Dealing seven cards to each player.';
}
const advance = (s, steps = 1) => { s.turn = (s.turn + s.direction * steps + s.players.length * 2) % s.players.length; s.drawn = null; };
function takeCards(s, p, count, random, effects = []) {
  const received = [];
  for (let i = 0; i < count; i++) {
    if (!s.deck.length && s.discard.length > 1) { const top = s.discard.pop(); s.deck = shuffle(s.discard, random); s.discard = [top]; }
    if (!s.deck.length) break;
    const card = s.deck.pop(); p.hand.push(card); p.unoCalled=false; received.push(card);
  }
  if (received.length) effects.push({kind:'draw',player:p.id,count:received.length,cards:received.map(c=>({...c}))});
  return received;
}
export function legalCard(s, p, c) {
  if (s.phase !== 'playing' || s.unoWindow || !p.connected || !s.players[s.turn]?.connected) return false;
  if (s.players[s.turn].id !== p.id) {
    const top=s.discard.at(-1);
    return !!s.rules.jumpIn && !s.debt && !s.drawn && /^\d$/.test(c.value) && c.colour===top.colour && c.value===top.value;
  }
  if (s.drawn && c.id !== s.drawn) return false;
  if (s.debt) return !!s.rules.stack2 && ['draw2','draw4'].includes(c.value) && s.discard.at(-1).value === c.value;
  if (c.value === 'draw4') return !p.hand.some(other => other.colour === s.colour);
  return c.colour === 'wild' || c.colour === s.colour || c.value === s.discard.at(-1).value;
}
// The second-last play retains its actor's turn until the bounded UNO window ends.
export function finishUnoTurn(s) {
  if (!s.unoWindow) return;
  s.turn=s.unoWindow.nextTurn; s.unoWindow=null; s.revision++;
}
export function callUno(s,id) {
  const p=player(s,id);
  if(s.phase!=='playing'||!p.connected||s.players[s.turn].id!==id||s.unoWindow?.player!==id)throw new Error('Call UNO on your turn after playing your second-last card');
  if(p.hand.length!==1||p.unoCalled)throw new Error('UNO is not available');
  p.unoCalled=true;s.notice=`${p.name} called UNO!`;finishUnoTurn(s);
}
export function catchUno(s,id,target,random=randomIndex) {
  const caller=player(s,id),p=player(s,target);
  if(s.phase!=='playing'||!caller.connected||id===target||s.unoWindow?.player!==target||p.hand.length!==1||p.unoCalled)throw new Error('There is no missed UNO to catch');
  const events=[];takeCards(s,p,2,random,events);finishUnoTurn(s);
  s.notice=`${caller.name} caught ${p.name} missing UNO — draw two!`;
  s.effects={revision:s.revision,events};
}
export function applyAction(s, id, action, random = randomIndex) {
  if (s.phase !== 'playing') throw new Error('No active round');
  if (s.unoWindow) throw new Error('Wait for the UNO call window');
  const p = player(s, id);
  if (!action || typeof action !== 'object') throw new Error('Invalid action');
  if (s.players[s.turn].id !== id && action.type !== 'play') throw new Error('It is not your turn');
  if (!p.connected || !s.players[s.turn].connected) throw new Error('The current player is disconnected');
  const effects=[];
  if (action.type === 'draw') {
    if (s.drawn) throw new Error('Play the drawn card or pass');
    const debt = s.debt;
    let count=0, playable=null;
    if (debt) { count=takeCards(s,p,debt,random,effects).length; s.debt=0; }
    else do {
      const [card]=takeCards(s,p,1,random,effects);
      if (!card) break;
      count++;
      if (legalCard(s,p,card)) { playable=card; break; }
    } while (s.rules.drawUntilPlayable);
    s.notice = `${p.name} drew ${count} card${count === 1 ? '' : 's'}.`;
    if (playable) {
      s.drawn=playable.id;
      if (s.rules.forcePlay && playable.colour!=='wild' && !(s.rules.sevenZero && playable.value==='7')) {
        const notice=s.notice; play(s,p,{cardId:playable.id},random,effects); s.notice=`${notice} ${s.notice}`;
      }
    } else advance(s);
  } else if (action.type === 'pass') {
    if (!s.drawn) throw new Error('Draw before passing');
    if (s.rules.forcePlay) throw new Error('Force play is on: play the drawn card');
    advance(s); s.notice = `${p.name} passed.`;
  } else if (action.type === 'play') play(s,p,action,random,effects);
  else throw new Error('Unknown action');
  // Collapse consecutive draws into one ordered, privately filtered sequence.
  const events=[];
  for(const effect of effects){const previous=events.at(-1);if(effect.kind==='draw'&&previous?.kind==='draw'&&previous.player===effect.player){previous.cards.push(...effect.cards);previous.count+=effect.count;}else events.push(effect);}
  s.revision++; s.effects={revision:s.revision,events};
}
function play(s,p,action,random,effects) {
    const id=p.id, jumping=s.players[s.turn].id!==id;
    const index = p.hand.findIndex(c => c.id === action.cardId);
    if (index < 0 || !legalCard(s, p, p.hand[index])) throw new Error('That card cannot be played');
    const card = p.hand[index];
    if (card.colour === 'wild' && !COLOURS.includes(action.colour)) throw new Error('Choose a colour');
    const swap = s.rules.sevenZero && card.value === '7';
    const target = swap ? s.players.find(q => q.id === action.target && q.id !== id) : null;
    if (swap && !target) throw new Error('Choose another player to swap with');
    if (action.uno!==undefined && action.uno!==false)throw new Error('Call UNO after playing your second-last card');
    const hadTwo=p.hand.length===2;
    // All play/choice validation occurs before mutation, including a jump-in.
    if (jumping) s.turn=s.players.findIndex(q=>q.id===id);
    s.lastPlayedBy=id;
    effects.push({kind:'play',player:id,card:{...card},colour:card.colour==='wild'?action.colour:card.colour});
    if(swap)effects.push({kind:'swap',from:id,to:target.id});
    if(s.rules.sevenZero&&card.value==='0')effects.push({kind:'rotate',direction:s.direction});
    p.hand.splice(index, 1); p.unoCalled=p.hand.length===1&&p.bot===true; s.discard.push(card); s.drawn = null;
    s.colour = card.colour === 'wild' ? action.colour : card.colour;
    s.notice = `${p.name} ${jumping ? 'jumped in with' : 'played'} ${cardLabel(card)}.`;
    if (swap) { [p.hand, target.hand] = [target.hand, p.hand]; p.unoCalled=target.unoCalled=false; s.notice += ` Swapped hands with ${target.name}.`; }
    if (s.rules.sevenZero && card.value === '0') {
      const hands = s.players.map(q => q.hand);
      s.players.forEach((q, i) => { q.hand = hands[(i - s.direction + s.players.length) % s.players.length]; q.unoCalled=false; });
      s.notice += ' Hands rotated.';
    }
    for(const q of s.players)if(q.bot&&q.hand.length===1)q.unoCalled=true;
    if(p.unoCalled)s.notice+=' UNO!';
    let steps = 1;
    if (card.value === 'reverse') { s.direction *= -1; if (s.players.length === 2) steps = 2; }
    if (card.value === 'skip') steps = 2;
    if (card.value === 'draw2') s.debt += 2;
    if (card.value === 'draw4') s.debt += 4;
    advance(s, steps);
    const winner = s.players.find(q => !q.hand.length);
    if (!winner && hadTwo && p.hand.length===1 && !p.bot && !swap && !(s.rules.sevenZero&&card.value==='0')) {
      s.unoWindow={player:id,nextTurn:s.turn};s.turn=s.players.findIndex(q=>q.id===id);
    }
    if (winner) {
      if (s.debt) { takeCards(s, s.players[s.turn], s.debt, random, effects); s.debt = 0; }
      s.winner = winner.id; s.phase = 'finished'; s.notice = `${winner.name} won the round!`;
    }
}
export function viewFor(s, id) {
  const p = player(s, id);
  return {
    phase:s.phase, revision:s.revision, round:s.round, rules:{...s.rules},
    players:s.players.map((q,i) => ({id:q.id, name:q.name, avatar:{...(q.avatar || defaultAvatar(i))}, ready:q.ready, connected:q.connected, bot:q.bot, count:q.hand.length, unoCalled:q.hand.length===1&&q.unoCalled===true})),
    self:id, host:s.players[0].id, hand:p.hand.map(c => ({...c})),
    top:s.discard.length ? {...s.discard.at(-1)} : null, turn:s.players[s.turn]?.id,
    direction:s.direction, colour:s.colour, debt:s.debt, drawn:s.drawn && s.players[s.turn]?.id === id ? s.drawn : null,
    winner:s.winner, notice:s.notice, lastPlayedBy:s.lastPlayedBy || null,
    unoWindow:s.unoWindow?{player:s.unoWindow.player}:null,
    legal:p.hand.filter(c => legalCard(s, p, c)).map(c => c.id),
    effects:s.effects ? {revision:s.effects.revision,events:s.effects.events.map(e=>e.kind==='draw'?{kind:e.kind,player:e.player,count:e.count,...(e.player===id?{cards:e.cards.map(c=>({...c}))}:{})}:{...e,...(e.card?{card:{...e.card}}:{})})} : null,
  };
}
export function botAction(s, id) {
  const p = player(s, id);
  const card = p.hand.find(c => legalCard(s, p, c));
  if (!card) return {type:s.drawn ? 'pass' : 'draw'};
  const colour = [...COLOURS].sort((a,b) => p.hand.filter(c => c.colour === b).length - p.hand.filter(c => c.colour === a).length)[0];
  const target = s.players.filter(q => q.id !== id).sort((a,b) => a.hand.length - b.hand.length)[0].id;
  return {type:'play', cardId:card.id, colour, target};
}
