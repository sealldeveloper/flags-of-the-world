import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyAlbum,validateAlbum,imageDimensions} from '../tierlist/model.mjs';
import {previewAlbum,encodeAlbum,decodeAlbum,encodeAsset,decodeAsset,compressImage} from '../tierlist/codec.mjs';
import {OriginalTransfer,ASSET_CHUNK} from '../tierlist/progressive.mjs';
import {TierRoom} from '../tierlist/room.mjs';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=','base64'),tiny='data:image/png;base64,'+bytes.toString('base64');
function full(seed=0x51a9d32f){const data=Buffer.concat([Buffer.from(bytes),Buffer.alloc(100000)]);data.writeUInt32BE(4000,16);data.writeUInt32BE(2000,20);let state=seed;for(let i=bytes.length;i<data.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;data[i]=state>>>24;}return'data:image/png;base64,'+data.toString('base64');}
function album(data=full()){const value=emptyAlbum();value.images=[{id:'original',label:'Original',data,thumb:tiny}];value.board.unranked=['original'];return validateAlbum(value);}
function decoder(){const previous=globalThis.createImageBitmap;globalThis.createImageBitmap=async blob=>{const data='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');return{...imageDimensions(data),close(){}};};return()=>{globalThis.createImageBitmap=previous;};}
test('only embedded raster images are accepted, including full-resolution originals and local previews',()=>{
 const value=album();assert.equal(value.images[0].width,4000);assert.equal(value.images[0].height,2000);
 for(const data of ['https://files.catbox.moe/abc123.png','https://i.imgur.com/Abc1234.png','https://example.com/a.png','blob:https://example.com/1','data:image/svg+xml;base64,PHN2Zz4='])assert.throws(()=>validateAlbum(album(data)),/embedded/);
});
test('portable files preserve complete originals with lossless gzip and independent previews',async()=>{
 const value=album(),code=await encodeAlbum(value);assert.deepEqual(await decodeAlbum(code),value);const asset=await encodeAsset(value.images[0].data);assert(asset.length>ASSET_CHUNK);assert.equal(await decodeAsset(asset),value.images[0].data);
});
test('lobby preview files are small and do not contain the original image bytes',async()=>{
 const original=album(),preview=await previewAlbum(original);assert.equal(preview.images[0].data,tiny);assert.equal(preview.images[0].width,1);assert.equal(original.images[0].width,4000);assert.equal(preview.board.unranked[0],'original');assert((await encodeAlbum(preview)).length<(await encodeAlbum(original)).length);
});
test('originals transfer only after preview readiness and are checked before an atomic image upgrade',async()=>{
 const restore=decoder();try{
  const source=album(),preview=await previewAlbum(source);let finish,reject,release;const held=[],completed=new Promise((a,b)=>{finish=a;reject=b;});let host,guest,hold=true,maxChunk=0;
  const deliver=message=>queueMicrotask(()=>guest.guestMessage(message).catch(reject));
  host=new OriginalTransfer(source,{host:true,send:(_conn,message)=>{if(message.type==='original-chunk'){maxChunk=Math.max(maxChunk,message.data.length);if(hold){held.push(message);release();return;}}deliver(message);}});
  guest=new OriginalTransfer(preview,{send:(_conn,message)=>queueMicrotask(()=>host.hostMessage('peer',message).catch(reject)),onProgress:state=>{if(state.complete)finish();}});
  const reached=new Promise(resolve=>release=resolve);guest.start();await reached;assert.equal(guest.state.complete,false);assert.equal(preview.images[0].width,1);assert.equal(preview.images[0].originalPending,true);
  hold=false;for(const message of held)deliver(message);await completed;assert.equal(guest.state.complete,true);assert.equal(preview.images[0].data,source.images[0].data);assert.equal(preview.images[0].width,4000);assert.equal(preview.images[0].height,2000);assert(maxChunk<=ASSET_CHUNK);host.stop();guest.stop();
 }finally{restore();}
});
test('interrupted transfers retain verified originals and reuse their cache before fetching missing images',async()=>{
 const restore=decoder(),cache=new Map(),guests=new Map();let host;try{
  const source=album();source.images.push({...source.images[0],id:'second',data:full(0x73bd1201)});source.board.unranked.push('second');let held,finish,reject;const interrupted=new Promise(resolve=>held=resolve),complete=new Promise((resolve,no)=>{finish=resolve;reject=no;});let reused=0,newChunks=0;
  host=new OriginalTransfer(source,{host:true,send:(conn,message)=>{if(conn==='first'&&message.type==='original-chunk'&&message.index===1){held();return;}if(conn==='second'&&message.type==='original-chunk')newChunks++;queueMicrotask(()=>guests.get(conn).guestMessage(message).catch(reject));}});
  const first=new OriginalTransfer(await previewAlbum(source),{cache,send:(_conn,message)=>queueMicrotask(()=>host.hostMessage('first',message).catch(reject))});guests.set('first',first);first.start();await interrupted;assert.equal(first.loaded,1);assert.equal(cache.size,1);assert.equal(first.state.complete,false);first.stop();host.drop('first');
  const second=new OriginalTransfer(await previewAlbum(source),{cache,send:(_conn,message)=>{if(message.type==='original-done'&&message.skip)reused++;queueMicrotask(()=>host.hostMessage('second',message).catch(reject));},onProgress:state=>{if(state.complete)finish();}});guests.set('second',second);second.start();await complete;assert.equal(reused,1);assert(newChunks>0);assert.deepEqual(second.album.images.map(image=>image.data),source.images.map(image=>image.data));assert.equal(second.loaded,2);
 }finally{host?.stop();for(const guest of guests.values())guest.stop();restore();}
});
test('background originals reject unsolicited metadata, bad dimensions, corrupt checksums and invalid ordering',async()=>{
 const preview=await previewAlbum(album()),transfer=new OriginalTransfer(preview,{send(){}});transfer.start();
 for(const change of [{index:1},{id:'other'},{length:1000000000},{hash:'not a digest'},{width:100000}])await assert.rejects(transfer.guestMessage({type:'original-meta',index:0,id:'original',length:100,rawLength:tiny.length,hash:'a'.repeat(64),width:1,height:1,...change}));
 transfer.stop();
});
test('a corrupt original checksum never replaces a usable preview',async()=>{
 const preview=await previewAlbum(album()),transfer=new OriginalTransfer(preview,{send(){}}),code=await encodeAsset(tiny);transfer.start();
 await transfer.guestMessage({type:'original-meta',index:0,id:'original',length:code.length,rawLength:tiny.length,hash:'b'.repeat(64),width:1,height:1});
 await assert.rejects(transfer.guestMessage({type:'original-chunk',index:0,offset:0,data:code}),/checksum/);assert.equal(preview.images[0].data,tiny);assert.equal(transfer.state.loaded,0);transfer.stop();
});
test('background chunk traffic cannot exhaust the independent board and heartbeat message budget',()=>{
 const room=new TierRoom({onState(){},onStatus(){},onError(){}}),peer={seat:'self',window:Date.now(),count:0,assetCount:0},closed=[];room.peers.set('connection',peer);room.players.set('self',{phase:'ready'});room.originalTransfer={hostMessage:async()=>{}};room.transport={disconnect:conn=>closed.push(conn)};room.send=()=>{};
 for(let i=0;i<250;i++)room.hostMessage('connection',{type:'original-chunk'});for(let i=0;i<160;i++)room.hostMessage('connection',{type:'ping'});assert.deepEqual(closed,[]);room.hostMessage('connection',{type:'ping'});assert.deepEqual(closed,['connection']);
 peer.count=0;closed.length=0;for(let i=250;i<1025;i++)room.hostMessage('connection',{type:'original-chunk'});assert.deepEqual(closed,['connection']);
});
test('EXIF rotation is validated without re-encoding JPEG originals, including later XMP segments',async()=>{
 const jpeg=Buffer.from([255,216,255,192,0,11,8,7,208,15,160,1,1,17,0,255,217]),exif=Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000','hex');
 const segment=body=>{const prefix=Buffer.from([255,225,0,0]);prefix.writeUInt16BE(body.length+2,2);return Buffer.concat([prefix,body]);};const rotated=Buffer.concat([jpeg.subarray(0,2),segment(exif),segment(Buffer.from('later XMP metadata')),jpeg.subarray(2)]),data='data:image/jpeg;base64,'+rotated.toString('base64');assert.deepEqual(imageDimensions(data),{width:2000,height:4000});
 const previous={createImageBitmap:globalThis.createImageBitmap,document:globalThis.document};globalThis.createImageBitmap=async()=>({width:2000,height:4000,close(){}});globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>tiny})};try{const result=await compressImage(new File([rotated],'rotated.jpg',{type:'image/jpeg'}));assert.equal(result.data,data);assert.equal(result.width,2000);assert.equal(result.height,4000);}finally{Object.assign(globalThis,previous);}
});
test('higher-bit-depth and colour-profile PNG originals bypass 8-bit browser re-encoding',async()=>{
 const previous={createImageBitmap:globalThis.createImageBitmap,document:globalThis.document,Worker:globalThis.Worker,OffscreenCanvas:globalThis.OffscreenCanvas};let calls=0;const bitmap={width:4000,height:2000,close(){}};globalThis.createImageBitmap=async source=>{calls++;if(source===bitmap)throw new Error('Must not copy these pixels into the 8-bit encoder.');return bitmap;};globalThis.Worker=class{};globalThis.OffscreenCanvas=class{};globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>tiny})};
 try{const sixteen=Buffer.from(full().split(',')[1],'base64');sixteen[24]=16;const raw=Buffer.from(full().split(',')[1],'base64'),profile=Buffer.from([0,0,0,1,105,67,67,80,0,0,0,0,0]);for(const bytes of[sixteen,Buffer.concat([raw.subarray(0,33),profile,raw.subarray(33)])]){calls=0;const result=await compressImage(new File([bytes],'original.png',{type:'image/png'}));assert.equal(result.data,'data:image/png;base64,'+bytes.toString('base64'));assert.equal(calls,1);}}
 finally{Object.assign(globalThis,previous);}
});
test('lossless source preparation retains original resolution and original JPEG bytes',async()=>{
 const previous={createImageBitmap:globalThis.createImageBitmap,document:globalThis.document};globalThis.createImageBitmap=async()=>({width:4000,height:2000,close(){}});globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>tiny})};
 const jpeg=Uint8Array.from([255,216,255,192,0,11,8,7,208,15,160,1,1,17,0,255,217]);
 try{const result=await compressImage(new File([jpeg],'original.jpg',{type:'image/jpeg'}));assert.equal(result.width,4000);assert.equal(result.height,2000);assert.deepEqual(Buffer.from(result.data.split(',')[1],'base64'),Buffer.from(jpeg));assert.equal(result.thumb,tiny);}finally{Object.assign(globalThis,previous);}
});
