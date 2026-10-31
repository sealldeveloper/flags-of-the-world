import test from 'node:test';
import assert from 'node:assert/strict';
import {groupRatings} from '../tierlist/ratings.mjs';
import {tierlistFilename} from '../tierlist/files.mjs';
import {emptyAlbum,validateAlbum} from '../tierlist/model.mjs';
import {encodeAlbum,decodeAlbum} from '../tierlist/codec.mjs';
const images=['a','b','c','d'].map(id=>({id}));
const voter=(rows,other={})=>({phase:'ready',progress:100,board:{tiers:rows.map(items=>({items})),unranked:images.map(image=>image.id).filter(id=>!rows.flat().includes(id))},...other});
const ids=values=>values.map(value=>value.id);
test('tier-only results share ties while left-to-right preference distinguishes them',()=>{
 const result=groupRatings(images,[voter([['a','b'],['c']]),voter([['a','b'],['c']])]);
 assert.deepEqual(ids(result.tiers.highest),['a','b']);assert.deepEqual(ids(result.tiers.lowest),['c']);
 assert.deepEqual(ids(result.ordered.highest),['a']);assert.deepEqual(ids(result.ordered.lowest),['c']);
 assert.equal(result.tiers.highest[0].votes,2);assert.equal(result.tiers.highest[0].tiers,1);assert.equal(result.ordered.highest[0].ordered,.875);
});
test('opposing placements average equally and ties are explicit rather than arbitrarily broken',()=>{
 const result=groupRatings(images,[voter([['a'],['b']]),voter([['b'],['a']])]);
 for(const mode of['tiers','ordered']){assert.deepEqual(ids(result[mode].highest),['a','b']);assert.deepEqual(ids(result[mode].lowest),['a','b']);}
});
test('unranked and loading seats do not vote, completed offline rankings do',()=>{
 const result=groupRatings(images,[voter([['a'],['b']]),voter([['b'],['a']],{phase:'loading',progress:90}),voter([['b'],['a']],{phase:'checking'}),voter([['a'],['b']],{phase:'offline'}),voter([['b'],['a']],{phase:'offline',progress:50})]);
 assert.equal(result.voters,2);assert.deepEqual(ids(result.tiers.highest),['a']);assert.equal(result.tiers.highest[0].votes,2);
 assert.deepEqual(groupRatings(images,[voter([[],[]])]).tiers,{highest:[],lowest:[]});
});
test('different category counts normalize to comparable top and bottom preferences',()=>{
 const result=groupRatings(images,[voter([['a'],[],[],['b']]),voter([['a'],['b']])]);
 assert.equal(result.tiers.highest[0].tiers,1);assert.equal(result.tiers.lowest[0].tiers,0);
 assert.deepEqual(ids(result.ordered.highest),['a']);assert.deepEqual(ids(result.ordered.lowest),['b']);
});
test('one category ties in tier-only mode and still supports ordering',()=>{
 const result=groupRatings(images,[voter([['a','b','c']])]);assert.equal(result.tiers.highest.length,3);
 assert(result.tiers.highest.every(value=>value.tiers===.5));assert.deepEqual(ids(result.ordered.highest),['a']);assert.deepEqual(ids(result.ordered.lowest),['c']);
});
test('sparse votes remain visible and source ordering is only a stable presentation order for ties',()=>{
 const result=groupRatings(images,[voter([['a'],[]]),voter([['b'],[]])]);
 assert.deepEqual(ids(result.tiers.highest),['a','b']);assert(result.tiers.highest.every(value=>value.votes===1));
 assert.deepEqual(ids(groupRatings([...images].reverse(),[voter([['a','b'],[]])]).tiers.highest),['b','a']);
});
test('16 dense independent boards produce complete deterministic results',()=>{
 const many=Array.from({length:200},(_,index)=>({id:'image'+index})),players=Array.from({length:16},()=>({phase:'ready',progress:100,board:{tiers:[{items:many.slice(0,100).map(image=>image.id)},{items:many.slice(100).map(image=>image.id)}],unranked:[]}}));
 const result=groupRatings(many,players);assert.equal(result.tiers.highest.length,100);assert.equal(result.tiers.lowest.length,100);
 assert.equal(result.ordered.highest[0].id,'image0');assert.equal(result.ordered.lowest[0].id,'image199');assert.equal(result.ordered.highest[0].votes,16);
});
test('exports include the tierlist name, UTC date and time with seconds and a custom extension',()=>{
 const now=new Date('2026-10-31T01:02:03.456Z');assert.equal(tierlistFilename('Choose Your Weapon',now),'Choose Your Weapon-2026-10-31T01-02-03-456Z.tierlist');
 assert.equal(tierlistFilename('Name.tierlist',now),'Name-2026-10-31T01-02-03-456Z.tierlist');
 for(const name of['../bad/<name>:?*|\\','CON','..',' ', '中'.repeat(120),'🦈'.repeat(120)]){
  const filename=tierlistFilename(name,now);assert(filename.endsWith('.tierlist'));assert(!/[<>:"/\\|?*\u0000-\u001f]/.test(filename));assert(Buffer.byteLength(filename)<255);assert(!filename.startsWith('CON-'));
 }
});
test('copy attribution survives validation, browser storage format and portable exports',async()=>{
 const value=emptyAlbum();value.copiedFrom='Host with a name';const checked=validateAlbum(value);assert.equal(checked.copiedFrom,value.copiedFrom);
 assert.deepEqual(await decodeAlbum(await encodeAlbum(checked)),checked);
 assert.throws(()=>validateAlbum({...value,copiedFrom:'x'.repeat(41)}));assert.throws(()=>validateAlbum({...value,copiedFrom:' '}));
 assert(!('copiedFrom' in validateAlbum(emptyAlbum())));
});
