import test from 'node:test';
import assert from 'node:assert/strict';
import {TIMING,dealDuration,effectDuration,presentationFrames,playCue} from '../uno/presentation.mjs';
const card=value=>({id:'played',colour:['wild','draw4'].includes(value)?'wild':'red',value});
const before={phase:'playing',round:1,self:'a',revision:1,hand:[card('1'),{id:'kept',colour:'blue',value:'2'}],players:[{id:'a',count:2},{id:'b',count:3}],top:{id:'old',colour:'red',value:'5'},colour:'red',turn:'a',debt:0};
for(const value of ['skip','reverse','draw2','draw4','wild'])test(`${value} lands before its public cue; host and reduced-motion durations agree`,()=>{
 const c=card(value),events=[{kind:'play',player:'a',card:c,colour:'red'}];
 const after={...before,turn:'b',revision:2,hand:[before.hand[1]],players:[{id:'a',count:1},{id:'b',count:3}],top:c,debt:value==='draw2'?2:value==='draw4'?4:0,effects:{revision:2,events},legal:[]};
 for(const reduced of [false,true]){const frames=presentationFrames(before,after,reduced);assert.deepEqual(frames.map(f=>f.view.presentation.kind),['play','cue','settle']);assert.equal(frames[0].duration,TIMING.play);assert.equal(frames[1].duration,TIMING.cue);assert.equal(frames.reduce((n,f)=>n+f.duration,0),effectDuration(after.effects));assert.equal(frames[0].view.debt,0);assert.equal(frames[1].view.debt,after.debt);assert(frames.every(f=>f.view.legal.length===0));assert(frames.every(f=>f.view.turn==='a'));assert.deepEqual(frames[1].view.presentation.cue,{kind:value==='wild'?'colour':value,colour:'red'});assert(frames.every(f=>f.view.players.every(p=>!('hand' in p))));}
});
test('opening deal overlaps seven 100ms launches rather than seven full draw flights',()=>{
 assert.equal(dealDuration(7),1600);assert.equal(effectDuration({events:[{kind:'deal',count:7}]}),1850);assert(dealDuration(7)<7*TIMING.draw/3);
});
test('ordinary number plays do not invent action cues or extra host pauses',()=>{assert.equal(playCue({card:card('5'),colour:'red'}),null);assert.equal(effectDuration({events:[{kind:'play',player:'a',card:card('5'),colour:'red'}]}),TIMING.play+TIMING.settle);});
