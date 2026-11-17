import test from 'node:test';
import assert from 'node:assert/strict';
import {TierRoom} from '../tierlist/room.mjs';
import {Transport} from '../uno/transport.mjs';
import {encodeInvite} from '../tierlist/invite.mjs';
const ticket={host:'a'.repeat(64),relay:'https://aps1-1.relay.n0.iroh.link./',room:'b'.repeat(32),secret:'c'.repeat(32)};
async function setup(t,{hidden=false}={}){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),handlers=new Map(),removed=[],closed=[];let now=1000;
 const document={visibilityState:hidden?'hidden':'visible',addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:(type,fn)=>removed.push(type)};
 Object.defineProperty(globalThis,'document',{configurable:true,value:document});t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 t.mock.method(Date,'now',()=>now);t.mock.method(Transport,'create',async()=>({close:async()=>{},disconnect:conn=>closed.push(conn)}));
 const r=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});let dials=0;r.dial=async()=>{dials++;};await r.open('Fixture guest',null,encodeInvite({...ticket,protocol:5}));
 Object.assign(r,{wasConnected:true,connected:true,connection:'old',resume:'d'.repeat(32)});const board={tiers:[{name:'Keep category',items:['fixture']}],unranked:[]};r.players.set('self',{board,seq:37});
 t.after(()=>r.stop());return {r,board,document,handlers,removed,closed,get dials(){return dials;},advance:ms=>{now+=ms;}};
}
test('long hidden tab reconnects despite buffered stale pings refreshing lastSeen; short switch does not',async t=>{
 const f=await setup(t);f.document.visibilityState='hidden';f.handlers.get('visibilitychange')();f.advance(500);f.document.visibilityState='visible';f.handlers.get('visibilitychange')();assert.equal(f.dials,1);assert.deepEqual(f.closed,[]);
 f.document.visibilityState='hidden';f.handlers.get('visibilitychange')();f.advance(45000);f.r.lastSeen=Date.now();f.document.visibilityState='visible';f.handlers.get('visibilitychange')();assert.equal(f.dials,2);assert.deepEqual(f.closed,['old']);assert.equal(f.r.connected,false);assert.equal(f.r.connection,null);assert.equal(f.r.resume,'d'.repeat(32));assert.equal(f.r.players.get('self').board,f.board);assert.equal(f.r.players.get('self').seq,37);
});
test('a saved seat already joining in a hidden tab also renews on return before its first ready snapshot',async t=>{
 const f=await setup(t,{hidden:true});Object.assign(f.r,{wasConnected:false,connected:false});f.advance(45000);f.r.lastSeen=Date.now();f.document.visibilityState='visible';f.handlers.get('visibilitychange')();assert.equal(f.dials,2);assert.deepEqual(f.closed,['old']);assert.equal(f.r.resume,'d'.repeat(32));assert.equal(f.r.players.get('self').board,f.board);
});
test('queued original frames from the pre-freeze socket are ignored before foreground resume',async t=>{
 const f=await setup(t);let frames=0;f.r.guestMessage=async()=>{frames++;throw new Error('Old transfer must not run');};
 f.handlers.get('freeze')();f.r.event({kind:'message',connection:'old',data:JSON.stringify({app:'tierlist',v:5,room:ticket.room,type:'original-meta'})});assert.equal(frames,0);assert.equal(f.r.disposed,false);assert.equal(f.r.players.get('self').board,f.board);f.handlers.get('resume')();assert.equal(f.dials,2);
});
test('freeze disables stale editing, resume renews only guest connection and cleans lifecycle listeners',async t=>{
 const f=await setup(t);f.handlers.get('freeze')();assert.equal(f.r.connected,false);assert.equal(f.r.connection,null);assert.equal(f.r.players.get('self').board,f.board);f.handlers.get('resume')();assert.equal(f.dials,2);assert.deepEqual(f.closed,['old']);await f.r.stop();assert(f.removed.includes('freeze'));assert(f.removed.includes('resume'));f.handlers.get('resume')();f.handlers.get('visibilitychange')();assert.equal(f.dials,2);
});
