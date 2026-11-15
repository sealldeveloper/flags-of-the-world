import test from 'node:test';
import assert from 'node:assert/strict';
import {TierRoom} from '../tierlist/room.mjs';
import {emptyAlbum,copy} from '../tierlist/model.mjs';
const seat='a'.repeat(32),oldSecret='b'.repeat(32),capability='c'.repeat(32);
function host(){
 const r=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}}),sent=[],disconnected=[];
 const album=emptyAlbum();album.board.tiers[0].name='Preserve custom category';
 const player={id:seat,name:'Fixture',color:'#5566aa',online:true,phase:'ready',progress:100,seq:37,board:copy(album.board)};
 Object.assign(r,{isHost:true,self:'d'.repeat(32),ticket:{secret:capability},album,code:'fixture-code',transport:{disconnect:c=>disconnected.push(c)}});
 r.players.set(seat,player);r.seats.set(seat,oldSecret);
 r.send=(conn,message)=>sent.push({conn,message});
 for(const method of ['broadcastRoster','publishPlayer','record','publishLatency','ping'])r[method]=()=>{};
 const peer=seat=>({seat,lastSeen:Date.now(),window:Date.now(),count:0,assetCount:0});
 r.peers.set('old',peer(seat));r.peers.set('new',peer(null));
 return {r,sent,disconnected,player,peer};
}
test('accepted resume rotates capability before welcome, preserves seat/seq/category/board, and rejects displaced legacy retries',async t=>{
 const timers=[];t.mock.method(globalThis,'setTimeout',(fn,delay)=>{timers.push({fn,delay});return timers.length;});
 for(const protocol of [5,6]){
  const {r,sent,disconnected,player,peer}=host();r.protocol=protocol;const before=copy(player.board);
  r.hostMessage('new',{type:'join',name:'Fixture',capability,resume:oldSecret});
  const welcome=sent.find(s=>s.conn==='new'&&s.message.type==='welcome')?.message;
  assert(welcome);assert.notEqual(welcome.resume,oldSecret,'one-time resume must revoke the displaced tab');
  assert.equal(welcome.resume,r.seats.get(seat));assert.equal(welcome.self,seat);assert.equal(r.players.size,1);
  assert.equal(player.seq,37);assert.deepEqual(player.board,before);assert.equal(r.peers.get('old').seat,null);
  assert(sent.some(s=>s.conn==='old'&&s.message.type==='seat-replaced'));
  timers.splice(0).forEach(timer=>{assert(timer.delay<=200);timer.fn();});assert(disconnected.includes('old'));
  // An older guest ignores the additive notice, then tries its stale resume after disconnect.
  r.peers.set('stale-retry',peer(null));r.hostMessage('stale-retry',{type:'join',name:'Fixture',capability,resume:oldSecret});
  assert(sent.some(s=>s.conn==='stale-retry'&&s.message.type==='rejected'));
  assert(!sent.some(s=>s.conn==='stale-retry'&&s.message.type==='welcome'));
  assert.equal(r.peers.get('new').seat,seat);assert.equal(r.players.size,1);assert.deepEqual(player.board,before);
  // A normal subsequent resume using the latest capability still retains this same board.
  r.peers.set('next-resume',peer(null));r.hostMessage('next-resume',{type:'join',name:'Fixture',capability,resume:welcome.resume});
  assert.equal(r.peers.get('next-resume').seat,seat);assert.equal(player.seq,37);assert.deepEqual(player.board,before);
 }
});
test('updated displaced guest stops retries and retains its ranking for export; legacy rejection also stops',async()=>{
 for(const type of ['seat-replaced','rejected']){
  const errors=[],statuses=[],r=new TierRoom({onState:()=>{},onStatus:s=>statuses.push(s),onError:e=>errors.push(e)});
  const board=emptyAlbum().board;r.players.set(seat,{id:seat,board,seq:37});Object.assign(r,{self:seat,connected:true,wasConnected:true,resume:oldSecret,transport:{close:async()=>{}}});
  r.retryTimer=setTimeout(()=>{},30000);await r.guestMessage({type,message:'That saved seat is no longer available'});
  assert.equal(r.disposed,true);assert.equal(r.connected,false);assert.equal(r.players.get(seat).board,board);assert.equal(r.players.get(seat).seq,37);
  assert.equal(errors.length,1);assert(statuses.at(-1).includes(type==='seat-replaced'?'another tab':'Disconnected'));
  r.reconnect();assert.equal(r.connected,false,'disposed tab cannot restart its retry loop');
 }
});
