import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../uno/room.mjs';
import {newRoom,createDeck} from '../uno/engine.mjs';
import {presentationFrames,TablePresentation,TIMING} from '../uno/presentation.mjs';
test('client deadlines account for relay latency and acknowledgements never restart them',()=>{
 const seen=[],p=new TablePresentation(v=>seen.push(v)),v={self:'h',turn:'h',phase:'playing',revision:1,round:1,hand:[],players:[],legal:[],jumpWindowMs:0,turnMs:30000,latencyMs:400};
 p.receive(v);const first=seen.at(-1).turnDeadline;assert(first-performance.now()<29601);p.receive(v,true,true);assert.equal(seen.at(-1).turnDeadline,first);assert.equal(TIMING.jump,3000);p.reset();
});
function fixture(){const r=new Room({onView:()=>{},onStatus:()=>{},onError:()=>{}}),s=r.state=newRoom({id:'h',name:'Host'});r.self='h';const deck=createDeck(),take=(c,v)=>deck.splice(deck.findIndex(x=>x.colour===c&&x.value===v),1)[0];s.players.push(...['b','c'].map(id=>({id,name:id,connected:true,ready:true,hand:[],bot:false})));s.players.forEach((p,i)=>p.hand=[take('red',String(i+1)),take('blue',String(i+1)),take('green',String(i+1))]);Object.assign(s,{phase:'playing',round:1,deck,discard:[take('red','9')],colour:'red'});return {r,s,take};}
test('turn clock is stable across acknowledgements; starts after reveal/jump and resets on a new decision',()=>{
 const {r,s}=fixture();r.updateTurnClock();const clock=r.turnClock;assert.equal(clock.duration,30000);r.updateTurnClock();assert.equal(r.turnClock,clock);s.revision++;r.updateTurnClock();assert.equal(r.turnClock,clock);
 r.execute('h',{type:'play',cardId:s.players[0].hand[0].id},s.revision);r.updateTurnClock();assert.notEqual(r.turnClock,clock);assert(r.turnClock.start>=performance.now()+r.timing().revealMs-5);
 s.players[s.turn].connected=false;r.updateTurnClock();assert.equal(r.turnClock,null);s.players[s.turn].connected=true;r.updateTurnClock();assert(r.turnClock);
 s.unoWindow={player:'h'};r.updateTurnClock();assert.equal(r.turnClock,null);
});
test('expired human action is rejected atomically, automatic authority can resolve it',()=>{
 const {r,s}=fixture();r.updateTurnClock();r.turnClock.start=performance.now()-31000;const before=JSON.stringify(s),action={type:'play',cardId:s.players[0].hand[0].id};assert.throws(()=>r.execute('h',action,s.revision),/timer expired/);assert.equal(JSON.stringify(s),before);r.automaticMove=true;r.execute('h',action,s.revision);assert.equal(s.players[0].hand.length,2);
});
test('room exposes and accepts exact jump only during the bounded post-animation window',()=>{
 const {r,s,take}=fixture();s.rules.jumpIn=true;s.discard.push(take('red','1'));s.turn=2;s.effects={revision:1,events:[{kind:'play',player:'b',card:s.discard.at(-1),colour:'red'}]};r.pace();const action={type:'play',cardId:s.players[0].hand[0].id};assert.throws(()=>r.execute('h',action,s.revision),/moving/);r.actionTiming.revealUntil=performance.now()-1;r.actionTiming.jumpUntil=performance.now()-1;assert.deepEqual(r.snapshotFor('h').legal,[]);const before=JSON.stringify(s);assert.throws(()=>r.execute('h',action,s.revision),/window is closed/);assert.equal(JSON.stringify(s),before);r.actionTiming.jumpUntil=performance.now()+1500;assert(r.snapshotFor('h').legal.includes(action.cardId));r.execute('h',action,s.revision);assert.equal(s.lastPlayedBy,'h');
});
test('draw presentation shows individual arrivals without a future total and holds only the playable final draw',()=>{
 const {r,s,take}=fixture();s.rules.drawUntilPlayable=true;const previous=r.snapshotFor('h');s.deck.push(take('red','6'),take('blue','6'),take('green','6'));r.execute('h',{type:'draw'},s.revision);const next=r.snapshotFor('h'),frames=presentationFrames(previous,next),draws=frames.filter(f=>f.view.presentation.kind==='draw');assert.equal(draws.length,3);assert(draws.every(f=>!('total' in f.view.presentation)));assert(draws.slice(0,-1).every(f=>f.view.presentation.heldCard===null));assert.equal(draws.at(-1).view.presentation.heldCard,next.drawn);assert.equal(frames.at(-1).view.presentation.heldCard,next.drawn);assert(r.snapshotFor('b').effects.events.every(e=>!e.cards));
});
