import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,createDeck,applyAction,callUno,catchUno,finishUnoTurn,legalCard,viewFor} from '../uno/engine.mjs';
import {Room} from '../uno/room.mjs';
import {TIMING,effectDuration,presentationFrames} from '../uno/presentation.mjs';
import {validateAvatar,AVATAR_PATTERNS,avatarHex} from '../uno/profiles.mjs';
function fixture(){const s=newRoom({id:'h',name:'Host'});for(const id of ['g','z'])s.players.push({id,name:id,ready:true,connected:true,bot:false,hand:[]});const d=createDeck(),take=(colour,value)=>d.splice(d.findIndex(c=>c.colour===colour&&c.value===value),1)[0];s.players[0].hand=[take('red','4'),take('blue','1')];s.players[1].hand=[take('red','4'),take('blue','4'),take('green','2')];s.players[2].hand=[take('green','3'),take('blue','3')];s.discard=[take('red','5')];Object.assign(s,{phase:'playing',round:1,colour:'red',deck:d});const r=new Room({onView:()=>{},onStatus:()=>{},onError:()=>{}});r.state=s;r.self='h';return {s,r};}
test('only host can force start, readiness bypass does not bypass connection/minimum/phase gates',()=>{
 const {s,r}=fixture();s.phase='lobby';s.players[1].ready=false;assert.throws(()=>r.execute('h',{type:'start'}));assert.throws(()=>r.execute('g',{type:'start',force:true}));s.players[1].connected=false;assert.throws(()=>r.execute('h',{type:'start',force:true}));s.players[1].connected=true;
 r.execute('h',{type:'start',force:true});assert.equal(s.phase,'playing');assert(s.players.every(p=>p.hand.length===7));assert(r.timing().revealMs>3000);assert.throws(()=>r.execute('h',{type:'start',force:true}));assert.throws(()=>r.execute('h',{type:'draw'},s.revision),/moving/);
 const single=fixture();single.s.phase='lobby';single.s.players.length=1;assert.throws(()=>single.r.execute('h',{type:'start',force:true}));
});
test('second-last play keeps the actor turn; call then advances; all other actions are blocked',()=>{
 const {s,r}=fixture();r.execute('h',{type:'play',cardId:s.players[0].hand[0].id},s.revision);assert.equal(s.turn,0);assert.equal(s.unoWindow.player,'h');assert.throws(()=>r.execute('h',{type:'uno'},s.revision),/land/);r.actionTiming.revealUntil=performance.now()-1;assert.throws(()=>r.execute('g',{type:'uno'},s.revision));assert.throws(()=>r.execute('h',{type:'draw'},s.revision),/UNO/);r.execute('h',{type:'uno'},s.revision);assert.equal(s.turn,1);assert(s.players[0].unoCalled);assert.equal(s.unoWindow,null);assert.throws(()=>callUno(s,'h'));
});
test('catch is gated by grace/time/revision/ownership; +2 is private, conserved and paced',()=>{
 const {s,r}=fixture();r.execute('h',{type:'play',cardId:s.players[0].hand[0].id},s.revision);const before=JSON.stringify(s);assert.throws(()=>r.execute('g',{type:'catch-uno',target:'h'},s.revision));assert.equal(JSON.stringify(s),before);
 r.actionTiming.revealUntil=performance.now()-2;r.actionTiming.catchFrom=performance.now()-1;
 assert.throws(()=>r.execute('h',{type:'catch-uno',target:'h'},s.revision));assert.throws(()=>r.execute('g',{type:'catch-uno',target:'z'},s.revision));assert.throws(()=>r.execute('g',{type:'catch-uno',target:'h'},s.revision-1));
 r.execute('g',{type:'catch-uno',target:'h'},s.revision);assert.equal(s.players[0].hand.length,3);assert.equal(s.turn,1);assert.equal(s.unoWindow,null);assert(r.timing().revealMs>2000);assert.throws(()=>r.execute('z',{type:'catch-uno',target:'h'},s.revision));
 assert.equal(viewFor(s,'g').effects.events[0].cards,undefined);assert.equal(viewFor(s,'h').effects.events[0].cards.length,2);
 const all=[...s.deck,...s.discard,...s.players.flatMap(p=>p.hand)];assert.equal(all.length,108);assert.equal(new Set(all.map(c=>c.id)).size,108);
});
test('uncaught window expiry advances once; late or duplicate catches never penalize',()=>{
 const {s,r}=fixture();r.execute('h',{type:'play',cardId:s.players[0].hand[0].id},s.revision);r.actionTiming.unoUntil=performance.now()-1;assert.throws(()=>r.execute('g',{type:'catch-uno',target:'h'},s.revision));finishUnoTurn(s);const rev=s.revision;finishUnoTurn(s);assert.equal(s.revision,rev);assert.equal(s.turn,1);assert.equal(s.players[0].hand.length,1);assert.throws(()=>catchUno(s,'g','h'));
});
test('jump-in is exact colour AND value, including after a UNO window, never arbitrary same number',()=>{
 const {s}=fixture();s.rules.jumpIn=true;applyAction(s,'h',{type:'play',cardId:s.players[0].hand[0].id});assert(!legalCard(s,s.players[1],s.players[1].hand[0]));finishUnoTurn(s);s.turn=2;
 assert(legalCard(s,s.players[1],s.players[1].hand[0]));assert(!legalCard(s,s.players[1],s.players[1].hand[1]));const before=JSON.stringify(s);assert.throws(()=>applyAction(s,'g',{type:'play',cardId:s.players[1].hand[1].id}));assert.equal(JSON.stringify(s),before);
});
test('deal/play/draw presentation duration equals host lock, including reduced motion',()=>{
 const {s,r}=fixture();s.phase='lobby';const previous=viewFor(s,'h');r.execute('h',{type:'start'});const next=r.snapshotFor('h');
 for(const reduced of [false,true]){const frames=presentationFrames(previous,next,reduced);assert.equal(frames.reduce((n,f)=>n+f.duration,0),effectDuration(s.effects));assert.deepEqual(frames.slice(0,7).map(f=>f.view.hand.length),[1,2,3,4,5,6,7]);assert(frames.every(f=>f.view.legal.length===0));}
 assert(TIMING.play>=1000&&TIMING.draw>=700&&TIMING.rotate>=1400);
});
test('custom colour is strict 6-digit hex or a legacy preset; pattern remains allowlisted',()=>{
 assert.deepEqual(validateAvatar({colour:'#A1B2C3',pattern:'hearts'}),{colour:'#a1b2c3',pattern:'hearts'});assert.equal(avatarHex('orange'),'#ff3b00');assert.equal(AVATAR_PATTERNS.length,12);
 for(const colour of ['red;url(x)','#fff','transparent',null,{},'#gggggg'])assert.throws(()=>validateAvatar({colour,pattern:'stars'}));assert.throws(()=>validateAvatar({colour:'#112233',pattern:'../evil'}));
});
