import test from 'node:test';
import assert from 'node:assert/strict';
import {TierRoom} from '../tierlist/room.mjs';
import {Transport} from '../uno/transport.mjs';
import {encodeInvite} from '../tierlist/invite.mjs';
const ticket={host:'a'.repeat(64),relay:'https://aps1-1.relay.n0.iroh.link./',room:'b'.repeat(32),secret:'c'.repeat(32)};
function room(){const errors=[],r=new TierRoom({onState:()=>{},onStatus:()=>{},onError:e=>errors.push(e)});r.isHost=false;return{r,errors};}
test('established and saved seats keep retrying beyond four failures with bounded backoff',t=>{
 const timers=[];t.mock.method(globalThis,'setTimeout',(fn,delay)=>{timers.push({fn,delay});return timers.length;});t.mock.method(globalThis,'clearTimeout',()=>{});
 for(const state of [{wasConnected:true},{resume:'saved-seat-capability'}]){const{r,errors}=room();Object.assign(r,state,{retry:4});r.reconnect();assert(r.retryTimer);assert.equal(errors.length,0);assert.equal(timers.at(-1).delay,16000);r.retryTimer=null;r.retry=100;r.reconnect();assert.equal(timers.at(-1).delay,30000);assert.equal(errors.length,0);}
 const {r,errors}=room();r.retry=4;r.reconnect();assert.equal(r.retryTimer,undefined);assert.equal(errors.length,1,'unknown initial invites still have a bounded failure');
});
test('retry delay never overflows or grows past 30 seconds',()=>{const{r}=room();for(const retry of [0,1,4,6,100,100000]){r.retry=retry;assert(r.retryDelay()>=500&&r.retryDelay()<=30000);}});
test('foreground/online recovery retries immediately when idle, never duplicates in-flight/online work, and cleans up listeners',async t=>{
 const original=globalThis.document,handlers=new Map(),removed=[];globalThis.document={visibilityState:'hidden',addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:(type,fn)=>removed.push([type,fn])};t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
 t.mock.method(Transport,'create',async()=>({connect:async()=>{},close:async()=>{}}));const{r}=room();let calls=0;r.dial=async()=>{calls++;};await r.open('Guest',null,encodeInvite({...ticket,protocol:5}));assert.equal(calls,1);r.retryTimer=setTimeout(()=>{},30000);r.retry=8;
 handlers.get('visibilitychange')();assert.equal(calls,1);globalThis.document.visibilityState='visible';handlers.get('visibilitychange')();assert.equal(calls,2);assert.equal(r.retryTimer,null);assert.equal(r.retry,0);
 for(const patch of [{connected:true},{connection:'in-flight'},{dialing:true}]){Object.assign(r,{connected:false,connection:null,dialing:false},patch);r.onConnectionAvailable();assert.equal(calls,2);}
 Object.assign(r,{connected:false,connection:null,dialing:false});r.onConnectionAvailable();assert.equal(calls,3);await r.stop();assert(removed.some(([type,fn])=>type==='visibilitychange'&&fn===r.onVisible));r.onConnectionAvailable();assert.equal(calls,3);
});
