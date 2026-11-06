import test from 'node:test';
import assert from 'node:assert/strict';
import {DESCENT_MS,PLUNGE_MS,DiveTimeline,projectDepth,questionTop,restingCamera} from '../krillion/motion.mjs';
import {waterColor} from '../krillion/ocean.mjs';
import {TIERS,PREVIEW_MS,ANSWER_MS} from '../krillion/model.mjs';
const state=(phase='intro',results=[],round=0,date='2026-11-05')=>({version:1,date,phase,round,results,endsAt:123456,draft:'unchanged'});
const result=tier=>({tier,score:tier?TIERS[tier].score:0,answer:tier?'Preserved answer':null});
function timeline(){const t=new DiveTimeline();t.resize(390,844,150);return t;}
function advance(t,ms,step=16){while(ms>0){const n=Math.min(ms,step);t.advance(n);ms-=n;}return t.sample();}

test('observed original motion durations do not change three-second previews or answer deadlines',()=>{
 assert.equal(DESCENT_MS,2400);assert.equal(PREVIEW_MS,3000);assert.equal(ANSWER_MS,25000);
 assert.deepEqual(PLUNGE_MS,{plankton:3400,tooclever:3000,schooler:3000,rare:3400,deepcut:4300,krillion:4600,miss:900});
});
test('first load and restored feedback immediately use the correct saved pose and score',()=>{
 const t=timeline();assert.equal(t.setState(state()),'restore');assert.equal(t.sample().camera,-45);
 t.reset();t.resize(390,844,150);t.setState(state('feedback',[result('krillion')]));assert.equal(t.sample().kind,'idle');assert.equal(t.sample().camera,1030);assert.equal(t.sample().score,100);
});
test('descent moves continuously and settles before the preserved answer clock starts',()=>{
 const t=timeline();t.setState(state());t.setState(state('preview'));assert.equal(t.sample().camera,-45);
 const early=advance(t,600).camera,middle=advance(t,600).camera;assert(early>-45&&early<middle);
 const settled=advance(t,1800);assert(Math.abs(settled.camera-restingCamera('answering',0,390,844,150))<1);
 assert(Math.abs(projectDepth(0,settled.camera,844)-175)<2);
});
test('preview to answering does not restart or snap the camera animation',()=>{
 const t=timeline();t.setState(state());t.setState(state('preview'));advance(t,2900);const before=t.sample().camera,elapsed=t.elapsed;t.setState(state('answering'));assert.equal(t.elapsed,elapsed);assert.equal(t.sample().camera,before);
});
test('each sourced tier gets a finite plunge before its points visually settle',()=>{
 for(const tier of Object.keys(TIERS)){
  const t=timeline();t.setState(state('answering'));const game=state('feedback',[result(tier)]),unchanged=JSON.stringify(game);t.setState(game);
  assert(t.sample().plunging);assert.equal(t.sample().score,0);advance(t,PLUNGE_MS[tier]-16);assert(t.sample().plunging,tier);assert.equal(t.sample().score,0);
  advance(t,32);assert(!t.sample().plunging);assert.equal(t.sample().kind,'landed');advance(t,2500);assert.equal(t.sample().score,TIERS[tier].score);assert.equal(Math.round(t.sample().depth),TIERS[tier].score*10);assert.equal(JSON.stringify(game),unchanged);
 }
});
test('a miss animates without inventing points or adding to the saved depth',()=>{
 const t=timeline(),prior=result('rare');t.setState(state('answering',[prior],1));t.setState(state('feedback',[prior,result(null)],1));advance(t,2500);assert.equal(t.sample().score,60);assert.equal(t.sample().depth,600);assert.equal(Math.round(t.sample().camera),670);
});
test('gold celebration delays only the visual counters, never the recorded score',()=>{
 const t=timeline();t.setState(state('answering'));const saved=state('feedback',[result('krillion')]);t.setState(saved);advance(t,5000);assert.equal(t.sample().score,0);assert.equal(t.sample().depth,0);assert.equal(saved.results[0].score,100);advance(t,2500);assert.equal(t.sample().score,100);assert.equal(t.sample().depth,1000);
});
test('reduced motion and low-power snapping finish an in-flight effect without losing results',()=>{
 const t=timeline();t.setState(state('answering'));const saved=state('feedback',[result('deepcut')]);t.setState(saved);advance(t,1200);t.setState(saved,{reduced:true});assert.equal(t.sample().kind,'idle');assert.equal(t.sample().score,85);assert.equal(t.sample().depth,850);assert.equal(t.sample().camera,880);
});
test('pausing presentation time does not skip a plunge or mutate answer deadlines',()=>{
 const t=timeline();t.setState(state('answering'));const saved=state('feedback',[result('schooler')]);t.setState(saved);advance(t,1000);const frame=t.sample();for(let i=0;i<100;i++)t.advance(0);assert.deepEqual(t.sample(),frame);assert.equal(saved.endsAt,123456);advance(t,2200);assert.equal(t.sample().kind,'landed');
});
test('switching dates cancels old motion and restores the selected saved dive',()=>{
 const t=timeline();t.setState(state('answering'));t.setState(state('feedback',[result('rare')]));advance(t,1200);t.setState(state('answering',[],0,'2026-11-04'));assert.equal(t.sample().kind,'idle');assert.equal(t.sample().score,0);assert.equal(t.sample().camera,123.5);
});
test('camera damping remains consistent across different animation frame rates',()=>{
 function at(rate){const t=timeline();t.setState(state());t.setState(state('preview'));return advance(t,1800,1000/rate).camera;}
 assert(Math.abs(at(30)-at(60))<2);assert(Math.abs(at(60)-at(120))<2);
});
test('responsive card positioning and world projection retain readable controls',()=>{
 assert.equal(questionTop(390,844,150),175);assert.equal(questionTop(1920,1080,150),210);assert.equal(questionTop(320,540,320),105);assert.equal(projectDepth(1000,1030,844),362);
});
test('the surface return is continuous, bounded and independent of result interaction',()=>{
 const t=timeline();t.setState(state('feedback',[result('krillion')]));t.setState(state('done',[result('krillion')],6));assert.equal(t.sample().kind,'surface');assert(t.plan.duration>=2500&&t.plan.duration<=9000);advance(t,10000);assert.equal(t.sample().score,100);assert(Math.abs(t.sample().camera+45)<.01);
});
test('ocean colours interpolate through the original depth palette',()=>{
 assert.equal(waterColor(0),'rgb(29,85,128)');assert.equal(waterColor(150),'rgb(18,58,94)');assert.equal(waterColor(9000),'#02050b');assert.match(waterColor(1000),/^rgb\(\d+,\d+,\d+\)$/);
});
