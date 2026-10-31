import test from 'node:test';
import assert from 'node:assert/strict';
import {randomColour,cleanColour,contrastInk,validateEvent,boardChange,MAX_EVENTS} from '../tierlist/social.mjs';
import {encodeInvite,decodeInvite} from '../tierlist/invite.mjs';
import {encodeTicket} from '../uno/transport.mjs';
import {emptyAlbum,copy,moveImage,removeTier,id} from '../tierlist/model.mjs';
import {TierRoom} from '../tierlist/room.mjs';
const a='a'.repeat(32),b='b'.repeat(32),png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=';
function host() {
 const messages=[],disconnected=[],album=emptyAlbum();album.images=[{id:'i1',label:'One',data:png},{id:'i2',label:'Two',data:png}];album.board.unranked=['i1','i2'];
 const room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});
 Object.assign(room,{album,code:'x'.repeat(60000),isHost:true,self:a,connected:true,ticket:{room:'c'.repeat(32),secret:'d'.repeat(32)},transport:{send:(id,message)=>messages.push({id,...message}),disconnect:id=>disconnected.push(id)}});
 room.players.set(a,{id:a,name:'Host',color:'#4d8abf',online:true,phase:'ready',progress:100,seq:0,board:copy(album.board)});
 room.players.set(b,{id:b,name:'Guest',color:'#bd5948',online:true,phase:'ready',progress:100,seq:0,board:copy(album.board)});
 room.peers.set('peer',{seat:b,nextChunk:0,syncIndex:0,syncIds:null,lastSeen:Date.now(),window:Date.now(),count:0});return {room,messages,disconnected};
}
test('16 seat colours remain distinct and category text contrasts against its backing',()=>{
 const used=[];for(let index=0;index<16;index++){const color=randomColour(used);assert.equal(cleanColour(color),color);assert(!used.includes(color));used.push(color);}
 for(const value of ['red','url(https://example.com)'])assert.throws(()=>cleanColour(value));
 assert.equal(contrastInk('#ffffff'),'#000000');assert.equal(contrastInk('#000000'),'#ffffff');
});
test('compact v4 invites roundtrip every relay, identify older protocols and reject malformed data',async()=>{
 for(const region of ['use1-1','usw1-1','euc1-1','aps1-1']){
  const ticket={host:'0123456789abcdef'.repeat(4),relay:`https://${region}.relay.n0.iroh.link./`,room:a,secret:b};
  const code=encodeInvite(ticket),decoded=decodeInvite(code);assert.equal(code.length,91);assert.equal(decoded.protocol,5);
  for(const key of ['host','relay','room','secret'])assert.equal(decoded[key],ticket[key]);
  assert.equal(decodeInvite('https://example.test/tierlist/#join='+code).secret,b);
  const old=code.replace('TL5.','TL2.');assert.equal(decodeInvite(old).protocol,2);
  await assert.rejects(new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}}).open('Name',null,old),/older version/);
  const legacy='TLOBBY1.'+encodeTicket({...ticket,v:5,app:'tierlist'});assert.equal(decodeInvite(legacy).protocol,1);
 }
 for(const code of ['TL5.','TL5.AAAA','TL5.!!!'])assert.throws(()=>decodeInvite(code));
});
test('structured activity includes full maximum-length item/tier names and safe identifiers',()=>{
 const {room}=host(),old=copy(room.album.board);old.tiers[0].name='中'.repeat(100);room.album.images[0].label='界'.repeat(160);
 const next=moveImage(old,'i1',old.tiers[0].id),details=boardChange(old,next,room.album.images);
 const event=validateEvent({id:1,time:Date.now(),kind:'activity',actor:a,name:'H'.repeat(40),color:'#4d8abf',...details});
 assert(event.text.includes('界'.repeat(160)));assert.equal(event.parts.find(part=>part.type==='image').id,'i1');assert.equal(event.parts.at(-1).color,old.tiers[0].color);
 for(const patch of [{actor:'someone'},{kind:'chat'},{color:'red'},{parts:[{type:'tier',id:'bad"]',label:'A',color:'#ffffff'}]},{parts:[{type:'text',text:'Mismatch'}]}])assert.throws(()=>validateEvent({...event,...patch}));
});
test('activity references cover placement, reorder, rename, colour, delete, add and no-op',()=>{
 const {room}=host(),old=room.album.board;assert.equal(boardChange(old,copy(old),room.album.images),null);
 let next=moveImage(old,'i1',old.tiers[0].id);assert.equal(boardChange(old,next,room.album.images).text,'Moved One from Unranked to S');
 assert.equal(boardChange(next,removeTier(next,next.tiers[0].id),room.album.images).text,'Deleted tier S and moved its images to Unranked');
 next=moveImage(old,'i2','unranked','i1');assert.equal(boardChange(old,next,room.album.images).parts.at(-1).id,'unranked');
 next=copy(old);next.tiers.reverse();assert.equal(boardChange(old,next,room.album.images).parts.at(-1).type,'board');
 next=copy(old);next.tiers[0].name='Best';assert.equal(boardChange(old,next,room.album.images).text,'Renamed S to Best');
 next=copy(old);next.tiers[0].color='#112233';assert.equal(boardChange(old,next,room.album.images).parts.at(-1).color,'#112233');
 next=copy(old);next.tiers.push({id:id(),name:'Added',color:'#000000',items:[]});assert.equal(boardChange(old,next,room.album.images).text,'Added tier Added');
});
test('events are derived from the connection-bound board, never claimed actor or reference fields',()=>{
 const {room}=host(),next=moveImage(room.album.board,'i1',room.album.board.tiers[0].id);
 room.hostMessage('peer',{type:'board',seq:1,board:next,actor:a,parts:[{type:'tier',id:'fake'}]});
 assert.equal(room.events[0].actor,b);assert.equal(room.events[0].name,'Guest');assert.equal(room.events[0].parts[1].id,'i1');
});
test('history is bounded, ordered, deduplicated and safely framed with worst-case Unicode references',()=>{
 const {room,messages}=host(),player=room.players.get(a),label='中'.repeat(160),parts=[{type:'text',text:'Moved '},{type:'image',id:'i1',label,color:'#ffffff'}];
 for(let index=0;index<100;index++)room.record(player,'activity',{text:'Moved '+label,parts});
 assert.equal(room.events.length,MAX_EVENTS);messages.length=0;room.sendHistory('peer');
 assert(messages.every(message=>new TextEncoder().encode(JSON.stringify(message)).length<65536));
 const guest=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});
 for(const event of [...room.events].reverse()){guest.receiveEvent(event);guest.receiveEvent(event);}
 assert.deepEqual(guest.events.map(event=>event.id),room.events.map(event=>event.id));
});
test('asset progress is host-derived, ready is gated on complete bounded board sync',()=>{
 const {room,messages}=host(),player=room.players.get(b);player.phase='loading';player.progress=0;
 room.hostMessage('peer',{type:'ready'});assert.equal(messages.at(-1).type,'rejected');assert.equal(player.phase,'loading');
 for(let index=0;index<3;index++)room.hostMessage('peer',{type:'chunk',index});assert.equal(player.phase,'checking');assert.equal(player.progress,100);
 messages.length=0;room.hostMessage('peer',{type:'sync',index:0});assert.equal(messages.filter(message=>message.type==='snapshot').length,1);assert.equal(messages.at(-1).done,false);
 room.hostMessage('peer',{type:'sync',index:1});assert.equal(messages.at(-1).done,true);
 room.hostMessage('peer',{type:'ready'});assert.equal(player.phase,'ready');assert.equal(room.events.at(-1).text,'Ready');
 room.event({kind:'closed',connection:'peer'});assert.equal(player.phase,'offline');assert.equal(player.online,false);
});
test('all 16 seats sync individually, reject overflow, retain offline seats and revoke removed resumes',()=>{
 const {room,messages}=host();room.players.delete(b);room.peers.clear();
 for(let index=1;index<16;index++){
  const conn='peer'+index;room.peers.set(conn,{created:Date.now(),lastSeen:Date.now(),window:Date.now(),count:0});
  room.hostMessage(conn,{type:'join',name:'Guest'+index,capability:room.ticket.secret});
 }
 assert.equal(room.players.size,16);assert.equal(new Set([...room.players.values()].map(player=>player.color)).size,16);
 room.peers.set('extra',{lastSeen:Date.now(),window:Date.now(),count:0});room.hostMessage('extra',{type:'join',name:'Overflow',capability:room.ticket.secret});assert.match(messages.at(-1).message,/full/);
 const seat=room.peers.get('peer1').seat,secret=room.seats.get(seat);room.remove(seat);assert(!room.seats.has(seat));
 room.hostMessage('extra',{type:'join',name:'Removed',capability:room.ticket.secret,resume:secret});assert.match(messages.at(-1).message,/no longer available/);
 room.hostMessage('extra',{type:'join',name:'Replacement',capability:room.ticket.secret});assert.equal(room.players.size,16);
});
test('chosen colours are validated, applied to authenticated seats and can be reselected on resume',()=>{
 const {room,messages,disconnected}=host();room.players.delete(b);room.peers.clear();
 room.peers.set('chosen',{lastSeen:Date.now(),window:Date.now(),count:0});room.hostMessage('chosen',{type:'join',name:'Chosen',color:'#AA00FF',capability:room.ticket.secret});
 const seat=room.peers.get('chosen').seat,secret=room.seats.get(seat);assert.equal(room.players.get(seat).color,'#aa00ff');assert(messages.some(message=>message.type==='welcome' && message.hostId===a));
 room.peers.set('resume',{lastSeen:Date.now(),window:Date.now(),count:0});room.hostMessage('resume',{type:'join',name:'Chosen',color:'#001122',capability:room.ticket.secret,resume:secret});
 assert.equal(room.peers.get('resume').seat,seat);assert.equal(room.players.get(seat).color,'#001122');assert(disconnected.includes('chosen'));
 room.peers.set('invalid',{lastSeen:Date.now(),window:Date.now(),count:0});room.hostMessage('invalid',{type:'join',name:'Bad',color:'url(x)',capability:room.ticket.secret});assert.equal(messages.at(-1).type,'rejected');assert.equal(room.players.size,2);
});
test('stale snapshots never roll back newer boards and invalid presence is rejected',()=>{
 const {room}=host(),guest=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}}),player=copy(room.players.get(b));
 guest.album=room.album;guest.receivePlayer({...player,seq:3});guest.receivePlayer({...player,seq:1,phase:'loading',progress:0});assert.equal(guest.players.get(b).seq,3);assert.equal(guest.players.get(b).phase,'loading');
 assert.throws(()=>guest.receivePlayer({...player,phase:'ready',progress:5}));assert.throws(()=>guest.receivePlayer({...player,phase:'offline',online:true}));
 guest.roster=new Set([a]);guest.receivePlayer(player);assert.equal(guest.players.size,1);
});
