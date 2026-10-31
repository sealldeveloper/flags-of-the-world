import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wrapLines,layoutGroupImage,IMAGE_PALETTES} from '../tierlist/group-image.mjs';
const context=()=>({font:'14px sans-serif',measureText(text){return {width:Array.from(text).length*(Number(this.font.match(/(\d+)px/)?.[1]) || 14)*.6};}});
const snapshot=count=>({name:'A maximum tierlist title '.repeat(6).slice(0,120),images:Array.from({length:12},(_,index)=>({id:'i'+index,label:'Image '+index})),players:Array.from({length:count},(_,index)=>({name:('Player '+index+' W'.repeat(30)).slice(0,40),color:'#112233',phase:'ready',progress:100,board:{tiers:Array.from({length:5},(_,tier)=>({id:'tier'+tier,name:('Long category name '+tier+' ').repeat(8).slice(0,100),color:'#ff7f7f',items:tier===index%5?['i0','i1','i2']:[]})),unranked:Array.from({length:9},(_,at)=>'i'+(at+3))}}))});
test('canvas text wraps names without dropping characters or overflowing the allotted width',()=>{
 const ctx=context(),text='W'.repeat(100);const lines=wrapLines(ctx,text,100);assert.equal(lines.join(''),text);assert(lines.every(line=>ctx.measureText(line).width<=100));
 assert.deepEqual(wrapLines(ctx,'First\nSecond',200),['First','Second']);
});
test('all sixteen independent boards include names, every category and every image including Unranked',()=>{
 const value=snapshot(16),layout=layoutGroupImage(context(),value);assert.equal(layout.players.length,16);assert(layout.width>2000);
 for(const board of layout.players){assert.equal(board.rows.length,6);assert.equal(board.rows.flatMap(row=>row.items).length,12);assert(board.rows.at(-1).id==='unranked');assert(board.height>0);assert(board.y+board.height<layout.footerY);}
 for(let first=0;first<layout.players.length;first++)for(let second=first+1;second<layout.players.length;second++){
  const a=layout.players[first],b=layout.players[second];assert(a.x+640<=b.x || b.x+640<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
 }
 assert.equal(layout.methods.length,2);assert(layout.methods.every(method=>method.sides.length===2));assert(layout.width*layout.height*layout.scale**2<=24000001);
});
test('exported image palettes stay aligned with the shared stylesheet in both themes',()=>{
 const css=readFileSync(new URL('../assets/theme.css',import.meta.url),'utf8'),blocks={light:css.match(/:root\s*\{([^}]+)\}/)[1],dark:css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]};
 for(const theme of['light','dark'])for(const key of['bg','surface','inset','text','muted','border']){
  let value=blocks[theme].match(new RegExp('--site-'+key+':(#[a-f0-9]+)'))[1];if(value.length===4)value='#'+[...value.slice(1)].map(char=>char+char).join('');assert.equal(IMAGE_PALETTES[theme][key],value);
 }
});
test('both image themes match the app palettes and oversized exports fail rather than silently omitting boards',()=>{
 assert.equal(IMAGE_PALETTES.dark.bg,'#1a1f2e');assert.equal(IMAGE_PALETTES.light.bg,'#f5f7fb');
 const value=snapshot(16);for(const player of value.players)player.board.tiers=Array.from({length:2000},(_,index)=>({id:String(index),name:'W'.repeat(100),color:'#ffffff',items:[]}));
 assert.throws(()=>layoutGroupImage(context(),value),/too large for a readable single image/);
});
