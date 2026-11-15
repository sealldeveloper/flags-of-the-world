import test from 'node:test';
import assert from 'node:assert/strict';
import {TierRoom} from '../tierlist/room.mjs';
import {emptyAlbum,copy} from '../tierlist/model.mjs';
const id=n=>n.toString(16).padStart(32,'0'),hostId=id(1),seatId=id(2),oldSecret=id(100);
function setup(){
 const sent=[],errors=[],room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:e=>errors.push(e)});
 Object.assign(room,{isHost:true,self:hostId,hostId,album:emptyAlbum(),ticket:{room:id(90),secret:id(91)},code:'preview-code'});
 room.album.name='Immutable source album';room.album.copiedFrom='Original creator';
 room.album.images=[{id:'first'},{id:'second'},{id:'third'}];room.album.board.tiers[0].items=['second','first'];room.album.board.unranked=['third'];room.album.board.tiers[0].excludeFromRatings=true;
 for(const [key,online,name] of [[hostId,true,'Host'],[seatId,false,'Café']])room.players.set(key,{id:key,name,color:'#112233',online,phase:online?'ready':'offline',progress:100,originals:0,seq:27,board:copy(room.album.board)});
 room.players.get(seatId).board.tiers[0].name='Custom offline category';room.players.get(seatId).board.tiers[1].name='Another saved category';room.players.get(seatId).board.tiers[0].color='#386641';
 room.seats.set(seatId,oldSecret);room.transport={disconnect:()=>{},close:async()=>{}};
 room.send=(conn,m)=>sent.push({conn,...m});
 const peer=conn=>room.peers.set(conn,{created:Date.now(),lastSeen:Date.now(),window:Date.now(),count:0});
 const join=(conn,fields={})=>{peer(conn);room.hostMessage(conn,{type:'join',capability:room.ticket.secret,name:' Café ',color:'#abcdef',offlineRanking:true,...fields});return sent.findLast(m=>m.conn===conn && m.type==='offline-ranking-offer');};
 const claim=(conn,offer,target=seatId,fields={})=>room.hostMessage(conn,{type:'offline-ranking-choice',nonce:offer.nonce,target,...fields});
 return {room,sent,errors,join,claim,peer};
}
test('explicit opt-in matches trimmed NFC case-sensitively regardless of colour, preserving ID, board, sequence and source while rotating capability',()=>{
 const {room,sent,join,claim}=setup(),board=copy(room.players.get(seatId).board),album=copy(room.album);
 const offer=join('claimant');assert(offer);assert.equal(room.players.size,2);assert.equal(room.players.get(seatId).online,false);assert(!JSON.stringify(offer).includes(oldSecret));assert(!JSON.stringify(offer).includes(room.ticket.secret));
 claim('claimant',offer);const welcome=sent.find(m=>m.type==='welcome'),player=room.players.get(seatId);
 assert.equal(welcome.self,seatId);assert.notEqual(welcome.resume,oldSecret);assert.equal(room.seats.get(seatId),welcome.resume);assert.equal(player.seq,27);assert.deepEqual(player.board,board);assert.deepEqual(room.album,album);assert.equal(player.color,'#abcdef');assert.equal(player.online,true);assert.equal(room.players.size,2);assert.equal(room.events.at(-1).text,'Took over the offline ranking');assert(!JSON.stringify(room.events).includes(welcome.resume));
 // The old capability can no longer silently resume the reclaimed board.
 join('stale',{resume:oldSecret});assert.notEqual(room.peers.get('stale').seat,seatId);
});
test('valid resume is automatic without an offer; legacy guests and hosts retain ordinary join shape',()=>{
 const {room,sent,join}=setup();join('resumer',{resume:oldSecret});assert.equal(room.peers.get('resumer').seat,seatId);assert(!sent.some(m=>m.type==='offline-ranking-offer'));assert.notEqual(room.seats.get(seatId),oldSecret);assert.equal(room.seats.get(seatId),sent.find(m=>m.type==='welcome').resume);
 for(const flag of [undefined,false,1,'true',{},[]]){const f=setup();f.join('legacy',{offlineRanking:flag});assert.equal(f.room.players.size,3);assert(!f.sent.some(m=>m.type==='offline-ranking-offer'));}
});
test('revoked resume never silently creates a fresh seat, but matching offline recovery stays explicit',()=>{
 for(const mode of ['online','removed','other-name']){
  const f=setup();f.room.seats.set(seatId,id(101));
  if(mode==='online')Object.assign(f.room.players.get(seatId),{online:true,phase:'ready'});
  if(mode==='removed')f.room.players.delete(seatId);
  if(mode==='other-name')f.room.players.get(seatId).name='Someone else';
  const before=copy([...f.room.players.values()]);assert.equal(f.join('stale',{resume:oldSecret}),undefined);
  const rejection=f.sent.find(m=>m.conn==='stale'&&m.type==='rejected');assert.equal(rejection.reason,'resume-unavailable');assert.equal(f.room.peers.get('stale').seat,undefined);assert.deepEqual([...f.room.players.values()],before);
 }
 const f=setup(),board=copy(f.room.players.get(seatId).board);f.room.seats.set(seatId,id(101));const offer=f.join('recovery',{resume:oldSecret});assert(offer);f.claim('recovery',offer);assert.equal(f.room.players.size,2);assert.equal(f.room.peers.get('recovery').seat,seatId);assert.deepEqual(f.room.players.get(seatId).board,board);
});
test('case is not folded, online/occupied/host/removed seats never qualify and wrong invite reveals nothing',()=>{
 for(const mutate of [r=>{r.players.get(seatId).name='CAFÉ';},r=>{r.players.get(seatId).online=true;},r=>{r.peers.set('active',{seat:seatId});},r=>{r.hostId=seatId;},r=>{r.players.delete(seatId);},r=>{r.players.get(seatId).phase='ready';}]){
  const f=setup();mutate(f.room);assert.equal(f.join('guest'),undefined);assert.notEqual(f.room.peers.get('guest').seat,seatId);
 }
 const f=setup();f.join('attacker',{capability:'wrong'});assert.equal(f.room.peers.get('attacker').offer,null);assert(!f.sent.some(m=>m.type==='offline-ranking-offer'));assert.equal(f.room.players.size,2);
});
test('multiple choices are distinct, new seat is explicit, and full 16-seat lobby can reclaim without allocating',()=>{
 const f=setup();for(let n=3;n<=16;n++){const p=copy(f.room.players.get(seatId));p.id=id(n);f.room.players.set(p.id,p);f.room.seats.set(p.id,id(n+100));}
 const offer=f.join('guest');assert.equal(offer.candidates.length,15);assert.equal(new Set(offer.candidates.map(p=>p.id)).size,15);assert.equal(offer.canJoinNew,false);f.claim('guest',offer,id(9));assert.equal(f.room.players.size,16);assert.equal(f.room.peers.get('guest').seat,id(9));
 const g=setup(),choice=g.join('new');g.claim('new',choice,null);assert.equal(g.room.players.size,3);assert.notEqual(g.room.peers.get('new').seat,seatId);assert.equal(g.room.players.get(seatId).online,false);assert.equal(g.room.seats.get(seatId),oldSecret);
 const full=setup();for(let n=3;n<=16;n++)full.room.players.set(id(n),{id:id(n),online:true,name:'Other'});full.join('plain',{offlineRanking:false});assert.match(full.sent.at(-1).message,/full/);assert.equal(full.room.players.size,16);
});
test('nonce, connection, target bounds, expiry and membership are authoritative; rejected choices cannot be retried',()=>{
 for(const change of [{nonce:id(999)},{nonce:true},{target:true},{target:1},{target:'x'.repeat(10000)},{target:hostId},{target:id(999)}]){
  const f=setup(),offer=f.join('claim');f.claim('claim',offer,seatId,change);assert.equal(f.room.players.get(seatId).online,false);assert.equal(f.room.seats.get(seatId),oldSecret);assert.equal(f.room.peers.get('claim').rejected,true);f.claim('claim',offer);assert.equal(f.room.players.get(seatId).online,false);
 }
 for(const mutate of [r=>{r.peers.get('claim').offer.expires=Date.now()-1;},r=>{r.players.delete(seatId);},r=>{r.players.get(seatId).online=true;},r=>{r.peers.set('active',{seat:seatId});},r=>{r.players.get(seatId).name='Other';},r=>{r.hostId=seatId;}]){
  const f=setup(),offer=f.join('claim');mutate(f.room);f.claim('claim',offer);assert.equal(f.room.peers.get('claim').seat,undefined);assert.equal(f.room.seats.get(seatId),oldSecret);
 }
 const f=setup(),a=f.join('a'),b=f.join('b');f.claim('b',a);assert.equal(f.room.peers.get('b').seat,undefined);f.claim('a',a);assert.equal(f.room.peers.get('a').seat,seatId);assert.notEqual(a.nonce,b.nonce);
});
test('two claims have exactly one winner, and client board/color/flags cannot overwrite the target',()=>{
 const f=setup(),a=f.join('a'),b=f.join('b'),board=copy(f.room.players.get(seatId).board);
 f.claim('a',a,seatId,{board:{tiers:[]},color:'#000000',offline:true});f.claim('b',b);
 assert.equal(f.room.peers.get('a').seat,seatId);assert.equal(f.room.peers.get('b').seat,undefined);assert.equal(f.room.players.get(seatId).color,'#abcdef');assert.deepEqual(f.room.players.get(seatId).board,board);
});
test('guest validates bounded offers and stale async decisions cannot send on a new connection or after stop',async()=>{
 const f=setup(),offer=f.join('wire'),messages=[];let resolve;
 const guest=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{},onJoinOffer:o=>o?new Promise(r=>resolve=r):undefined});guest.connection='host';guest.send=(conn,m)=>messages.push({conn,...m});guest.transport={disconnect:()=>{},close:async()=>{}};
 for(const malformed of [{canJoinNew:1},{expiresIn:Infinity},{nonce:[]},{candidates:[{...offer.candidates[0],id:true}]},{candidates:[{...offer.candidates[0],seq:1.5}]},{candidates:[offer.candidates[0],offer.candidates[0]]}])await assert.rejects(guest.guestMessage({...offer,...malformed}),/Invalid/);
 const pending=guest.guestMessage(offer);guest.connection='new-host';resolve(seatId);await pending;assert.equal(messages.length,0);await guest.stop();
 const g=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{},onJoinOffer:o=>o?new Promise(r=>resolve=r):undefined});g.connection='host';g.send=(...args)=>messages.push(args);g.transport={close:async()=>{}};const stopped=g.guestMessage(offer);await g.stop();resolve(seatId);await stopped;assert.equal(messages.length,0);
});

test('an explicitly left but still-present offline ranking can be claimed even after its old resume was revoked',()=>{
 const f=setup();f.room.seats.delete(seatId);const offer=f.join('new');assert(offer);f.claim('new',offer);assert.equal(f.room.peers.get('new').seat,seatId);assert.match(f.room.seats.get(seatId),/^[a-f0-9]{32}$/);assert.equal(f.room.players.size,2);
});
test('typed unavailable-resume rejection clears only this saved credential and never resets its board',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');let stored;
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>JSON.stringify(stored),removeItem:()=>{stored=null;}}});
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);else delete globalThis.sessionStorage;});
 for(const mode of ['same','other-room','newer-secret','untyped']){
  const room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}}),board=emptyAlbum().board;board.tiers[0].name='Preserved category';
  Object.assign(room,{ticket:{room:id(90)},resume:oldSecret,self:seatId,connected:true,transport:{close:async()=>{}}});room.players.set(seatId,{id:seatId,seq:27,board});
  stored={room:mode==='other-room'?id(99):id(90),secret:mode==='newer-secret'?id(102):oldSecret};
  await room.guestMessage({type:'rejected',reason:mode==='untyped'?undefined:'resume-unavailable',message:'Saved seat unavailable'});
  assert.equal(stored===null,mode==='same');assert.equal(room.disposed,true);assert.equal(room.players.get(seatId).board,board);assert.equal(room.players.get(seatId).seq,27);
 }
});
test('pending offer count and lifetime are bounded without reserving seats',()=>{
 const f=setup();for(let n=0;n<16;n++){const offer=f.join('pending'+n);assert(offer);const pending=f.room.peers.get('pending'+n);assert(pending.offer.expires<=Date.now()+90000);assert.equal(pending.seat,undefined);}
 assert.equal(f.join('overflow'),undefined);assert.match(f.sent.at(-1).message,/pending choices/);assert.equal(f.room.players.size,2);
});
test('replacement connection invalidates a pending offer before closing its old connection',async()=>{
 const f=setup(),offer=f.join('wire'),messages=[],closed=[];let resolve;
 const guest=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{},onJoinOffer:o=>o?new Promise(r=>resolve=r):undefined});
 Object.assign(guest,{connection:'old',ticket:{host:'host',room:'room',secret:id(900)},name:'Café',color:'#abcdef'});
 guest.send=(conn,m)=>messages.push({conn,...m});guest.transport={disconnect:conn=>{closed.push(conn);guest.event({kind:'closed',connection:conn});},close:async()=>{}};
 const pending=guest.guestMessage(offer);guest.event({kind:'connected',connection:'replacement',peer:'host'});resolve(seatId);await pending;
 assert.deepEqual(closed,['old']);assert.equal(guest.connection,'replacement');assert.equal(guest.joinOffer,null);assert.equal(guest.retry,0);assert.equal(messages.filter(m=>m.type==='join').length,1);assert(!messages.some(m=>m.type==='offline-ranking-choice'));await guest.stop();
});
