import test from 'node:test';
import assert from 'node:assert/strict';
import {coalesceActivityEvents} from '../tierlist/activity.mjs';
import {boardChange,validateEvent,MAX_EVENTS} from '../tierlist/social.mjs';
import {emptyAlbum,copy} from '../tierlist/model.mjs';
import {TierRoom} from '../tierlist/room.mjs';
const actor='a'.repeat(32),otherActor='b'.repeat(32);
function event(id,patch={}) {
  return validateEvent({id,time:1000+id,kind:'activity',actor,name:'Player',color:'#4d8abf',text:'Reordered images in S',parts:[{type:'text',text:'Reordered images in '},{type:'tier',id:'top',label:'S',color:'#112233'}],...patch});
}
test('coalesceActivityEvents folds only consecutive same-actor same-tier image reorders, retaining latest time and stable first ID',()=>{
  const events=[event(1),event(2),event(3)],original=structuredClone(events),grouped=coalesceActivityEvents(events);
  assert.equal(grouped.length,1);assert.equal(grouped[0].count,3);assert.equal(grouped[0].id,1);assert.equal(grouped[0].lastId,3);assert.equal(grouped[0].time,1003);
  assert.deepEqual(events,original);
});
test('coalesceActivityEvents separates users, tier IDs, missing IDs, legacy summaries and other operations',()=>{
  const differentTier=event(2,{parts:[{type:'text',text:'Reordered images in '},{type:'tier',id:'another',label:'S',color:'#112233'}]});
  for(const middle of [event(2,{actor:otherActor}),differentTier,event(2,{text:'Ready',parts:undefined}),event(2,{parts:undefined}),event(2,{text:'Reordered tiers',parts:[{type:'text',text:'Reordered '},{type:'board',id:'board',label:'tiers',color:'#112233'}]})]){
    assert.deepEqual(coalesceActivityEvents([event(1),middle,event(3)]).map(value=>value.count),[1,1,1]);
  }
  assert.equal(coalesceActivityEvents([event(1),event(3)]).length,2);
  for(const patch of [{name:'Renamed player'},{color:'#998877'},{text:'Reordered images in New',parts:[{type:'text',text:'Reordered images in '},{type:'tier',id:'top',label:'New',color:'#112233'}]}])assert.equal(coalesceActivityEvents([event(1),event(2,patch)]).length,2);
  for(const text of ['Ready','Changed the colour of S','Moved 2 images between tiers'])assert.equal(coalesceActivityEvents([event(1,{text,parts:undefined}),event(2,{text,parts:undefined})]).length,2);
});
test('coalesceActivityEvents uses category IDs rather than final order and supports Unranked',()=>{
  for(const scope of ['tier','unranked']){
    const album=emptyAlbum(),before=album.board;
    if(scope==='tier')before.tiers[0].items=['one','two','three'];else before.unranked=['one','two','three'];
    let board=before;const events=[];
    for(let index=1;index<=3;index++){
      const next=copy(board),items=scope==='tier'?next.tiers[0].items:next.unranked;items.push(items.shift());
      events.push(event(index,boardChange(board,next,[])));board=next;
    }
    const grouped=coalesceActivityEvents(events);assert.equal(grouped.length,1);assert.equal(grouped[0].count,3);assert.equal(grouped[0].parts[1].id,scope==='tier'?before.tiers[0].id:'unranked');
  }
});
test('activity aggregation keeps raw room history bounded and recounts sorted, deduplicated history after eviction',()=>{
  const room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});
  for(let id=1;id<=MAX_EVENTS+5;id++)room.receiveEvent(event(id));
  assert.equal(room.events.length,MAX_EVENTS);assert.equal(coalesceActivityEvents(room.events)[0].count,MAX_EVENTS);assert.equal(coalesceActivityEvents(room.events)[0].id,6);
  assert(room.events.every(value=>!('count' in value)));
  const guest=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});
  for(const value of [...room.events].reverse()){guest.receiveEvent(value);guest.receiveEvent(value);}
  assert.deepEqual(coalesceActivityEvents(guest.events),coalesceActivityEvents(room.events));
});
