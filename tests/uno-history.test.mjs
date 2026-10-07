import test from 'node:test';
import assert from 'node:assert/strict';
import {RecentActions} from '../uno/history.mjs';
const view=(revision=1,notice='Player drew one card.')=>({phase:'playing',round:1,revision,effects:{revision},notice,hand:[{id:'private-card'}]});
test('recent actions ignore animation frames, lobby and duplicate snapshots',()=>{
 const h=new RecentActions(50,()=>1700000000000);assert.equal(h.record(view(),true),false);assert.equal(h.record({...view(),phase:'lobby'}),false);
 assert.equal(h.record(view()),true);assert.equal(h.record(view()),false);
 assert.equal(h.record({...view(),revision:9}),false);assert.equal(h.entries.length,1);
 assert.deepEqual(h.entries[0],{round:1,text:'Player drew one card.',timestamp:1700000000000});
});
test('distinct actions with identical text and UNO calls are retained',()=>{
 const h=new RecentActions();h.record(view());h.record(view(2));h.record({...view(2),revision:3,notice:'Player called UNO!'});
 assert.equal(h.entries.length,3);assert.equal(h.entries[0].text,'Player called UNO!');
});
test('history is bounded, newest first and reset between rooms',()=>{
 const h=new RecentActions();for(let i=1;i<=70;i++)h.record(view(i,`Action ${i}`));
 assert.equal(h.entries.length,50);assert.equal(h.entries[0].text,'Action 70');assert.equal(h.entries.at(-1).text,'Action 21');
 assert(!JSON.stringify(h.entries).includes('private-card'));h.reset();assert.deepEqual(h.entries,[]);assert(h.record(view()));
});
test('round boundaries and final results remain visible',()=>{
 const h=new RecentActions();h.record(view());h.record({...view(),phase:'finished',notice:'Player won the round!'});h.record({...view(),round:2});
 assert.equal(h.entries.length,3);assert.equal(h.entries[0].round,2);assert.equal(h.entries[1].text,'Player won the round!');
});
