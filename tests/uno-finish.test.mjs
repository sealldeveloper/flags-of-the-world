import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,applyAction,viewFor,callUno,startRound} from '../uno/engine.mjs';
import {presentationFrames,effectDuration,TIMING,TablePresentation} from '../uno/presentation.mjs';
import {Room} from '../uno/room.mjs';
const card=(id,value='2',colour='red')=>({id,value,colour});
function fixture(n=3){const s=newRoom({id:'a',name:'Alice'});for(let i=1;i<n;i++)s.players.push({id:String(i),name:`Player ${i}`,connected:true,ready:true,bot:false,hand:[]});s.players.forEach((p,i)=>{p.hand=Array.from({length:i+2},(_,j)=>card(`${i}-${j}`));p.unoCalled=false;});s.phase='playing';s.round=1;s.colour='red';s.discard=[card('top','5')];s.deck=[card('draw','9')];return s;}
test('0 presents every private hand rotation in both directions, for 2–8 seats',()=>{
 for(let n=2;n<=8;n++)for(const direction of [-1,1]){
  const s=fixture(n);s.rules.sevenZero=true;s.direction=direction;s.players[0].hand[0]=card('zero','0');
  const before=s.players.map(p=>viewFor(s,p.id));applyAction(s,'a',{type:'play',cardId:'zero'});
  for(let i=0;i<n;i++){
   const next=viewFor(s,s.players[i].id),frames=presentationFrames(before[i],next);
   assert.deepEqual(frames.map(f=>f.view.presentation.phase||f.view.presentation.kind),['play','select','flight','settle','settle']);
   assert.equal(frames[1].view.presentation.direction,direction);assert.equal(frames[2].duration,TIMING.rotate);
   assert.equal(effectDuration(next.effects),frames.reduce((ms,f)=>ms+f.duration,0));
   const old=before[i].hand.filter(c=>c.id!=='zero');assert.deepEqual(frames[2].view.hand,old);
   assert.deepEqual(frames[3].view.hand,next.hand);assert(next.players.every(p=>!('hand' in p)));
   assert.deepEqual(next.effects.events[1],{kind:'rotate',direction});
  }
 }
});
test('last-card 0 waits for the complete rotation before displaying the recipient winner',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const s=fixture();s.rules.sevenZero=true;s.players[0].hand=[card('zero','0')];
 const seen=[],presenter=new TablePresentation(v=>seen.push(v));presenter.receive(viewFor(s,'a'));
 applyAction(s,'a',{type:'play',cardId:'zero'});assert.equal(s.winner,'1');presenter.receive(viewFor(s,'a'));
 for(const delay of [TIMING.play,TIMING.select,TIMING.rotate]){assert.equal(seen.at(-1).phase,'playing');assert.equal(seen.at(-1).winner,null);t.mock.timers.tick(delay);}
 assert.equal(seen.at(-1).presentation.phase,'settle');t.mock.timers.tick(TIMING.settle);t.mock.timers.tick(TIMING.settle);
 assert.equal(seen.at(-1).phase,'finished');assert.equal(seen.at(-1).winner,'1');presenter.reset();
});
test('UNO only after own second-last card, keeps own turn until the call',()=>{
 const s=fixture();assert.throws(()=>callUno(s,'a'));s.players[1].hand=[card('only')];assert.throws(()=>callUno(s,'1'));
 applyAction(s,'a',{type:'play',cardId:'0-0'});assert.equal(s.turn,0);assert.equal(s.unoWindow.player,'a');
 const counts=s.players.map(p=>p.hand.length);callUno(s,'a');assert.equal(s.turn,1);assert.equal(s.unoWindow,null);assert.equal(viewFor(s,'1').players[0].unoCalled,true);assert.deepEqual(s.players.map(p=>p.hand.length),counts);assert.throws(()=>callUno(s,'a'));
});
test('pre-arming is rejected atomically and drawing clears an old call',()=>{
 const s=fixture(),before=JSON.stringify(s);
 for(const uno of [true,'yes'])assert.throws(()=>applyAction(s,'a',{type:'play',cardId:'0-0',uno}),/after playing/);
 assert.equal(JSON.stringify(s),before);applyAction(s,'a',{type:'play',cardId:'0-0'});callUno(s,'a');
 s.turn=0;applyAction(s,'a',{type:'draw'});assert.equal(s.players[0].unoCalled,false);
});
test('hand transfers and rematches clear calls; bots announce their one-card hands',()=>{
 for(const value of ['7','0']){const s=fixture();s.rules.sevenZero=true;s.players[0].hand[0]=card('special',value);s.players[1].hand=[card('one')];s.players[1].unoCalled=true;applyAction(s,'a',{type:'play',cardId:'special',target:'1'});assert(s.players.every(p=>!p.unoCalled));}
 const s=fixture();s.players[0].bot=true;applyAction(s,'a',{type:'play',cardId:'0-0'});assert.equal(s.players[0].unoCalled,true);s.phase='finished';startRound(s,()=>0);assert(s.players.every(p=>!p.unoCalled&&p.hand.length===7));
});
test('host authorizes UNO only after the animation and rejects stale/foreign calls',()=>{
 const s=fixture(),r=new Room({onView:()=>{},onStatus:()=>{},onError:()=>{}});r.state=s;r.self='a';s.rules.jumpIn=true;
 r.execute('a',{type:'play',cardId:'0-0'},s.revision);const timing={...r.actionTiming};
 assert.throws(()=>r.execute('a',{type:'uno',target:'1'},s.revision),/table changed/);assert.throws(()=>r.execute('a',{type:'uno'},s.revision-1),/table changed/);
 assert.throws(()=>r.execute('a',{type:'uno'},s.revision),/land/);assert.throws(()=>r.execute('1',{type:'draw'},s.revision),/moving/);
 r.actionTiming.revealUntil=performance.now()-1;r.execute('a',{type:'uno'},s.revision);assert.equal(s.turn,1);assert.equal(r.actionTiming.unoUntil,timing.unoUntil);
});
