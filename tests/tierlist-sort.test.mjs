import test from 'node:test';
import assert from 'node:assert/strict';
import {insertionBefore} from '../tierlist/sort.mjs';
import {tiermakerUrl} from '../tierlist/tiermaker.mjs';
import {emptyAlbum,validateAlbum} from '../tierlist/model.mjs';
const items=Array.from({length:6},(_,i)=>({id:String(i+1),left:(i%3)*76,top:Math.floor(i/3)*76,width:72,height:72}));
test('slot preview distinguishes both halves, row endings, wrapping and an empty row',()=>{
 assert.equal(insertionBefore([],0,0),null);
 assert.equal(insertionBefore(items,5,30),'1');
 assert.equal(insertionBefore(items,70,30),'2');
 assert.equal(insertionBefore(items,90,30),'2');
 assert.equal(insertionBefore(items,145,30),'3');
 assert.equal(insertionBefore(items,300,30),'4');
 assert.equal(insertionBefore(items,5,110),'4');
 assert.equal(insertionBefore(items,150,110),'6');
 assert.equal(insertionBefore(items,300,110),null);
});
test('TierMaker URL import rejects foreign origins and embedded credentials',()=>{
 assert.equal(tiermakerUrl('https://www.tiermaker.com/create/example-123?presentation=true#x'),'https://tiermaker.com/create/example-123');
 for(const value of ['not a URL','http://tiermaker.com/create/x','https://tiermaker.com.evil.test/create/x','https://user:pass@tiermaker.com/create/x','https://tiermaker.com:9090/create/x','https://tiermaker.com/login'])assert.throws(()=>tiermakerUrl(value));
});
test('embedded thumbnails are validated, optional and preserved in portable albums',()=>{
 const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=',album=emptyAlbum();
 album.images=[{id:'image1',label:'Image',data,thumb:data}];album.board.unranked=['image1'];
 assert.equal(validateAlbum(album).images[0].thumb,data);
 album.images[0].thumb='https://example.com/image.png';assert.throws(()=>validateAlbum(album));
});
