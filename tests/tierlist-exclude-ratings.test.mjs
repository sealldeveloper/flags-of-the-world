import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyAlbum,validateAlbum,validateBoard,copy,freshBoard,moveImage} from '../tierlist/model.mjs';
import {encodeAlbum,decodeAlbum} from '../tierlist/codec.mjs';
import {groupRatings} from '../tierlist/ratings.mjs';
import {boardChange} from '../tierlist/social.mjs';
import {coalesceActivityEvents} from '../tierlist/activity.mjs';
import {layoutGroupImage} from '../tierlist/group-image.mjs';
import {TierRoom} from '../tierlist/room.mjs';
const images=['a','b','c'].map(id=>({id,label:id}));
const player=tiers=>({phase:'ready',progress:100,board:{tiers,unranked:[]}});
const row=(items,excludeFromRatings=false)=>({items,excludeFromRatings});
test('validateBoard defaults old tiers to included, preserves booleans and rejects malformed exclusion types',()=>{
 const album=emptyAlbum(),legacy=validateAlbum(album);
 assert(legacy.board.tiers.every(tier=>!tier.excludeFromRatings));
 assert.deepEqual(legacy,album);
 for(const flag of [true,false]){const board=copy(album.board);board.tiers[0].excludeFromRatings=flag;assert.equal(validateBoard(board,[]).tiers[0].excludeFromRatings,flag);assert.equal(validateAlbum({...album,board}).board.tiers[0].excludeFromRatings,flag);}
 for(const flag of [null,undefined,0,1,'false','true',[],{}]){const board=copy(album.board);board.tiers[0].excludeFromRatings=flag;assert.throws(()=>validateBoard(board,[]),/Invalid tier ratings exclusion/);assert.throws(()=>validateAlbum({...album,board}),/Invalid tier ratings exclusion/);}
});
test('exclusion survives portable album, copying, fresh boards and image moves without mutating source',async()=>{
 const source=emptyAlbum(),album=copy(source);album.board.tiers[2].excludeFromRatings=true;album.board.tiers[3].excludeFromRatings=false;
 const checked=validateAlbum(album);assert.deepEqual(await decodeAlbum(await encodeAlbum(checked)),checked);
 const fresh=freshBoard(checked);assert.equal(fresh.tiers[2].excludeFromRatings,true);fresh.tiers[2].excludeFromRatings=false;assert.equal(checked.board.tiers[2].excludeFromRatings,true);assert(!source.board.tiers[2].excludeFromRatings);
 const board={tiers:[{id:'one',name:'One',color:'#112233',items:['a'],excludeFromRatings:true}],unranked:['b']};
 assert.equal(moveImage(board,'b','one').tiers[0].excludeFromRatings,true);assert.deepEqual(board.tiers[0].items,['a']);
});
test('excluded tiers abstain independently for mixed votes in both rating modes',()=>{
 const result=groupRatings(images,[player([row(['a']),row(['b'],true),row(['c'])]),player([row(['b']),row(['a','c'],true),row([])])]);
 for(const mode of ['tiers','ordered']){assert.deepEqual(result[mode].highest.map(v=>v.id),['a','b']);assert.deepEqual(result[mode].lowest.map(v=>v.id),['c']);assert(result[mode].highest.every(v=>v.votes===1));}
 assert.equal(result.tiers.highest[0].tiers,1);assert.equal(result.tiers.lowest[0].tiers,0);
});
test('excluded top, middle and bottom tiers never change eligible category count or index',()=>{
 const base=groupRatings(images,[player([row(['a']),row(['b','c'])])]);
 for(const at of [0,1,2]){const tiers=[row(['a']),row(['b','c'])];tiers.splice(at,0,row([],true));assert.deepEqual(groupRatings(images,[player(tiers)]),base);}
 const one=groupRatings(images,[player([row([],true),row(['a','b']),row(['c'],true)])]);
 assert(one.tiers.highest.every(v=>v.tiers===.5));assert.equal(one.ordered.highest[0].ordered,.75);assert.equal(one.ordered.lowest[0].ordered,.25);
});
test('all excluded, empty eligible and zero eligible tiers produce no ranked images or NaN',()=>{
 for(const tiers of [[row(['a','b','c'],true)],[row(['a','b','c'],true),row([])],[]]){
  const result=groupRatings(images,[player(tiers)]);assert.deepEqual(result,{voters:1,tiers:{highest:[],lowest:[]},ordered:{highest:[],lowest:[]}});assert(!JSON.stringify(result).includes('null'));
 }
});
test('group image retains excluded tier colour, location and items with visible indication and eligible summaries',()=>{
 const tiers=[{id:'a',name:'Keep',color:'#123456',items:['a']},{id:'b',name:'Abstain',color:'#abcdef',items:['b','c'],excludeFromRatings:true}];
 const ctx={font:'',measureText(text){return {width:text.length*7};}},layout=layoutGroupImage(ctx,{name:'Album',images,players:[{...player(tiers),name:'Player',color:'#112233'}]});
 const excluded=layout.players[0].rows[1];assert.equal(excluded.color,'#abcdef');assert.deepEqual(excluded.items,['b','c']);assert(excluded.lines.join(' ').includes('Excluded from group ratings'));
 for(const method of layout.methods)for(const side of method.sides)assert.deepEqual(side.items.map(item=>item.id),['a']);
});
test('boardChange describes exclusion toggles separately from image reorders',()=>{
 const before=emptyAlbum().board,after=copy(before);after.tiers[0].excludeFromRatings=true;
 const excluded=boardChange(before,after,[]),included=boardChange(after,before,[]);assert.equal(excluded.text,'Excluded tier S from group ratings');assert.equal(included.text,'Included tier S in group ratings');
 const explicitFalse=copy(before);explicitFalse.tiers[0].excludeFromRatings=false;assert.equal(boardChange(before,explicitFalse,[]),null);
 const reorder={kind:'activity',id:1,actor:'actor',name:'Name',color:'#112233',parts:[{type:'text',text:'Reordered images in '},{type:'tier',id:before.tiers[0].id,label:'S',color:'#ff7f7f'}]};
 assert.equal(coalesceActivityEvents([reorder,{...reorder,id:2,...excluded},{...reorder,id:3}]).length,3);
});
test('TierRoom accepts exclusion only for sender, propagates it through snapshots and rejects malformed peer updates',()=>{
 const album=emptyAlbum(),hostId='a'.repeat(32),guestId='b'.repeat(32),messages=[];
 const room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});Object.assign(room,{album,isHost:true,self:hostId,connected:true,code:'x',ticket:{room:'c'.repeat(32),secret:'d'.repeat(32)},transport:{send:(id,message)=>messages.push({id,...message}),disconnect:()=>{}}});
 for(const id of [hostId,guestId])room.players.set(id,{id,name:id===hostId?'Host':'Guest',color:'#112233',online:true,phase:'ready',progress:100,seq:0,board:copy(album.board)});
 room.peers.set('guest',{seat:guestId,nextChunk:1,syncIndex:0,lastSeen:Date.now(),window:Date.now(),count:0});
 const board=copy(album.board);board.tiers[0].excludeFromRatings=true;room.hostMessage('guest',{type:'board',seq:1,board,actor:hostId});
 assert.equal(room.players.get(guestId).board.tiers[0].excludeFromRatings,true);assert(!room.players.get(hostId).board.tiers[0].excludeFromRatings);assert(!album.board.tiers[0].excludeFromRatings);assert.equal(room.events.at(-1).text,'Excluded tier S from group ratings');
 room.hostMessage('guest',{type:'sync',index:0});room.hostMessage('guest',{type:'sync',index:1});const snapshot=messages.filter(m=>m.type==='snapshot').at(-1).player;
 const receiver=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});receiver.album=album;receiver.receivePlayer(snapshot);assert.equal(receiver.players.get(guestId).board.tiers[0].excludeFromRatings,true);
 board.tiers[0].excludeFromRatings='true';room.hostMessage('guest',{type:'board',seq:2,board});assert.equal(messages.at(-1).type,'rejected');assert.equal(room.players.get(guestId).seq,1);
});
