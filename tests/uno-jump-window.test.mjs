import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../uno/room.mjs';
import {newRoom,createDeck} from '../uno/engine.mjs';
import {TIMING,TablePresentation} from '../uno/presentation.mjs';
function fixture(){
 const r=new Room({onView(){},onStatus(){},onError(){}}),s=r.state=newRoom({id:'h',name:'Host'});r.self='h';
 const deck=createDeck(),take=(colour,value)=>{const i=deck.findIndex(c=>c.colour===colour&&c.value===value);assert(i>=0);return deck.splice(i,1)[0];};
 s.players.push(...['b','c'].map(id=>({id,name:id,connected:true,ready:true,hand:[],bot:false})));
 s.players.forEach((p,i)=>p.hand=['red','blue','green'].map(colour=>take(colour,String(i+1))));
 Object.assign(s,{phase:'playing',round:1,deck,discard:[take('red','9')],colour:'red'});s.rules.jumpIn=true;
 const play=()=>r.execute('h',{type:'play',cardId:s.players[0].hand[0].id},s.revision);
 return {r,s,take,play};
}
test('no matching hand means zero jump delay, no client jump phase, and next turn immediately after animation',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {r,s,play}=fixture(),seen=[],presenter=new TablePresentation(v=>seen.push(v));presenter.receive(r.snapshotFor('b'));play();r.updateTurnClock();
 assert.equal(r.actionTiming.jumpUntil,0);assert.equal(r.snapshotFor('b').jumpWindowMs,0);assert(Math.abs(r.turnClock.start-r.actionTiming.revealUntil)<5);
 presenter.receive(r.snapshotFor('b'));t.mock.timers.tick(TIMING.play);t.mock.timers.tick(TIMING.settle);
 assert(!presenter.busy);assert(seen.every(v=>v.presentation?.kind!=='jump-window'));presenter.reset();
 r.actionTiming.revealUntil=performance.now()-1;
 assert.doesNotThrow(()=>r.execute('b',{type:'play',cardId:s.players[1].hand[0].id},s.revision));
});
for(const bot of [false,true])test(`exact out-of-turn match opens the window for a ${bot?'bot':'human'} without revealing their hand`,()=>{
 const {r,s,take,play}=fixture();const match=take('red','1');match.id='private-jump-match';s.players[2].hand.push(match);s.players[2].bot=bot;play();r.updateTurnClock();
 assert.equal(r.actionTiming.jumpUntil-r.actionTiming.revealUntil,TIMING.jump);assert(Math.abs(r.turnClock.start-r.actionTiming.jumpUntil)<5);
 const other=r.snapshotFor('b');assert(other.jumpWindowMs>0);assert(other.players.every(p=>!('hand' in p)));assert(!JSON.stringify(other).includes(match.id));
 r.actionTiming.revealUntil=performance.now()-1;assert.throws(()=>r.execute('b',{type:'draw'},s.revision),/Jump-in window/);
 r.execute('c',{type:'play',cardId:match.id},s.revision);assert.equal(s.lastPlayedBy,'c');
});
test('an exact match belonging only to the next normal player does not delay their turn',()=>{
 const {r,s,take,play}=fixture();s.players[1].hand.push(take('red','1'));play();assert.equal(s.turn,1);assert.equal(r.actionTiming.jumpUntil,0);
});
test('a disconnected matching player cannot cause a jump delay',()=>{
 const {r,s,take,play}=fixture();s.players[2].hand.push(take('red','1'));s.players[2].connected=false;play();assert.equal(r.actionTiming.jumpUntil,0);
});
test('the player who just played may still jump with their second identical card',()=>{
 const {r,s,take,play}=fixture();s.players[0].hand.push(take('red','1'));play();assert.equal(r.actionTiming.jumpUntil-r.actionTiming.revealUntil,TIMING.jump);
});
test('matching cards do not override disabled jump-in or the separate UNO window',()=>{
 for(const uno of [false,true]){const {r,s,take,play}=fixture();s.players[2].hand.push(take('red','1'));if(uno)s.deck.push(s.players[0].hand.pop());else s.rules.jumpIn=false;play();assert.equal(r.actionTiming.jumpUntil,0);if(uno)assert(s.unoWindow);}
});
