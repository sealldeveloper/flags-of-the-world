import test from 'node:test';
import assert from 'node:assert/strict';
import {TierRoom} from '../tierlist/room.mjs';
import {encodeInvite,decodeInvite} from '../tierlist/invite.mjs';
import {Transport} from '../uno/transport.mjs';
const ticket={host:'a'.repeat(64),relay:'https://aps1-1.relay.n0.iroh.link./',room:'b'.repeat(32),secret:'c'.repeat(32)};
test('updated guests join using the running host protocol and keep TL5/TL6 invite identity across reconnects',async t=>{
 const sent=[];t.mock.method(Transport,'create',async()=>({send:(conn,message)=>sent.push({conn,message}),close:async()=>{},disconnect:()=>{}}));
 for(const protocol of [5,6]){
  const room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});let dialled=0;room.dial=async()=>{dialled++;};
  const code=encodeInvite({...ticket,protocol});assert.equal(decodeInvite(code).protocol,protocol);
  try{await room.open('Updated guest',null,code);assert.equal(dialled,1);assert.equal(room.protocol,protocol);assert.equal(room.inviteCode(),code);room.send('existing-host',{type:'ping'});assert.equal(sent.at(-1).message.v,protocol);
   let received=false;room.connection='existing-host';room.guestMessage=async()=>{received=true;};room.event({kind:'message',connection:'existing-host',data:JSON.stringify({app:'tierlist',v:protocol,room:ticket.room,type:'pong'})});assert(received);
   room.retry=4;room.reconnect();assert.equal(room.protocol,protocol);assert.equal(room.inviteCode(),code);
  }finally{await room.stop();}
 }
});
test('new hosts default to the latest protocol without rewriting explicit running-host versions',()=>{
 assert(encodeInvite(ticket).startsWith('TL6.'));assert(encodeInvite({...ticket,protocol:5}).startsWith('TL5.'));
 for(const protocol of [0,4,7,'5',null])assert.throws(()=>encodeInvite({...ticket,protocol}),/Unsupported lobby protocol/);
});
