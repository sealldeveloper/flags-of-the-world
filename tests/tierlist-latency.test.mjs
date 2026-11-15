import test from 'node:test';
import assert from 'node:assert/strict';
import {TierRoom} from '../tierlist/room.mjs';
import {emptyAlbum,copy} from '../tierlist/model.mjs';
const hostId='a'.repeat(32),guestId='b'.repeat(32),offlineId='c'.repeat(32);
function host(){
 const states=[],messages=[],room=new TierRoom({onState:s=>states.push(s),onStatus:()=>{},onError:()=>{}});
 Object.assign(room,{isHost:true,self:hostId,hostId,connected:true,album:emptyAlbum(),ticket:{room:'test'}});
 for(const [id,online]of [[hostId,true],[guestId,true],[offlineId,false]])room.players.set(id,{id,name:id,color:'#4d8abf',online,phase:online?'ready':'offline',progress:100,seq:0,board:copy(room.album.board)});
 room.peers.set('peer',{seat:guestId,window:Date.now(),count:0});room.send=(conn,message)=>messages.push({conn,...message});room.transport={disconnect:()=>{},close:async()=>{}};
 return {room,peer:room.peers.get('peer'),messages,states};
}
test('ping measures a matching fresh nonce with a monotonic clock, not client-provided milliseconds',t=>{
 let now=100;t.mock.method(performance,'now',()=>now);const {room,peer,messages,states}=host();room.ping('peer',peer);const nonce=peer.probe.nonce;assert.match(nonce,/^[a-f0-9]{32}$/);
 room.ping('peer',peer);assert.equal(messages.length,1,'no overlapping probes');now=223.4;
 room.hostMessage('peer',{type:'pong',nonce:'forged',ms:1});assert.equal(peer.rtt,undefined);
 room.hostMessage('peer',{type:'pong',nonce,ms:1});assert.equal(peer.rtt,123);assert.equal(peer.probe,null);assert.deepEqual(room.latency,{[hostId]:0,[guestId]:123,[offlineId]:null});assert.equal(states.at(-1).latency[guestId],123);
 const count=messages.length;room.hostMessage('peer',{type:'pong',nonce});assert.equal(messages.length,count,'duplicate cannot refresh measurement');assert(room.events.length===0,'pings do not add activity events');
});
test('unmeasured, expired, offline, removed and pre-join peers never show a fabricated zero',t=>{
 let now=100;t.mock.method(performance,'now',()=>now);const {room,peer,messages}=host();room.publishLatency();assert.equal(room.latency[guestId],null);
 room.ping('peer',peer);now=200;room.hostMessage('peer',{type:'pong',nonce:peer.probe.nonce});assert.equal(room.latency[guestId],100);
 now=35200;room.publishLatency();assert.equal(room.latency[guestId],null);
 peer.rtt=100;peer.measuredAt=now;room.players.get(guestId).online=false;room.publishLatency();assert.equal(room.latency[guestId],null);
 room.players.delete(guestId);room.publishLatency();assert(!Object.hasOwn(room.latency,guestId));
 const noSeat={};room.ping('pending',noSeat);assert.deepEqual(messages.at(-1),{conn:'pending',type:'ping'});assert(!noSeat.probe);
});
test('expired or invalid elapsed samples are rejected and rounded measurements stay within wire bounds',t=>{
 let now=100;t.mock.method(performance,'now',()=>now);const {room,peer}=host();
 for(const elapsed of [-1,35000,Infinity,NaN]){now=100;room.ping('peer',peer);now=100+elapsed;room.hostMessage('peer',{type:'pong',nonce:peer.probe.nonce});assert.equal(peer.rtt,undefined);}
 now=100;room.ping('peer',peer);now=35099.8;room.hostMessage('peer',{type:'pong',nonce:peer.probe.nonce});assert.equal(peer.rtt,34999);
});
test('guests echo only bounded nonce probes, validate host latency maps and clear on reconnect/stop',async()=>{
 const {room}=host(),messages=[];room.isHost=false;room.self=guestId;room.connection='host';room.send=(_conn,m)=>messages.push(m);
 await room.guestMessage({type:'ping',nonce:'d'.repeat(32)});assert.deepEqual(messages.pop(),{type:'pong',nonce:'d'.repeat(32)});
 for(const nonce of [undefined,'x'.repeat(100),{},'not-a-nonce']){await room.guestMessage({type:'ping',nonce});assert.deepEqual(messages.pop(),{type:'pong'});}
 const values={[hostId]:0,[guestId]:120,[offlineId]:null};await room.guestMessage({type:'latency',values});assert.deepEqual(room.latency,values);
 for(const values of [null,[],{bad:1},{[guestId]:-1},{[guestId]:35000},{[guestId]:1.5},{[guestId]:'10'},{[guestId]:Infinity},Object.fromEntries(Array.from({length:17},(_,n)=>[n.toString(16).padStart(32,'0'),0]))])await assert.rejects(room.guestMessage({type:'latency',values}),/Invalid player latency/);
 room.retry=4;room.reconnect();assert.deepEqual(room.latency,{});room.latency=values;await room.stop();assert.deepEqual(room.latency,{});
});
