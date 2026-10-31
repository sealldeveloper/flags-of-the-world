import test from 'node:test';
import assert from 'node:assert/strict';
import {catboxImageUrl,remoteImageUrl} from '../tierlist/image-policy.mjs';
import {prepareCatboxImage,uploadCatboxImage,CATBOX_UPLOAD,clearCatboxUploadCache} from '../tierlist/catbox.mjs';
import {emptyAlbum,validateAlbum} from '../tierlist/model.mjs';
import {verifyImages,encodeAlbum,decodeAlbum} from '../tierlist/codec.mjs';
import {authorizeRemote,setRemoteConsentPrompt,fetchRemoteBlob} from '../tierlist/remote-images.mjs';
import {importTiermaker} from '../tierlist/tiermaker.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=','base64'),thumb='data:image/png;base64,'+png.toString('base64');
const image=(name='abc123')=>({id:name,label:'Original',data:`https://files.catbox.moe/${name}.png`,width:1,height:1,thumb});
function env(){const keys=['fetch','localStorage','createImageBitmap','document'],previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),store=new Map();globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>thumb,toBlob:callback=>callback(new Blob([png],{type:'image/png'}))})};clearCatboxUploadCache();return {store,restore(){clearCatboxUploadCache();Object.assign(globalThis,previous);}};}
const file=()=>new File([png],'private-original-name.png',{type:'image/png'});
function album(picture=image()){const value=emptyAlbum();value.images=[picture];value.board.unranked=[picture.id];return value;}
test('Catbox allowlist accepts only exact static image filenames and preserves legacy Imgur links',()=>{
 assert.equal(catboxImageUrl('https://files.catbox.moe/abc123.webp'),'https://files.catbox.moe/abc123.webp');assert.equal(remoteImageUrl('https://i.imgur.com/Abc1234.png'),'https://i.imgur.com/Abc1234.png');
 for(const value of ['http://files.catbox.moe/abc123.png','https://catbox.moe/abc123.png','https://files.catbox.moe.evil.test/abc123.png','https://files.catbox.moe@127.0.0.1/abc123.png','https://files.catbox.moe:443/abc123.png','https://files.catbox.moe./abc123.png','https://files.catbox.moe//abc123.png','https://files.catbox.moe/../abc123.png','https://files.catbox.moe/%61bc123.png','https://files.catbox.moe/abc123.png?next=http://127.0.0.1','https://files.catbox.moe/abc123.png#x','https://files.catbox.moe/abc123.gif','https://files.catbox.moe/abc123.svg','https://files.catbox.moe/abc123.html','https://cors.eu.org/https://files.catbox.moe/abc123.png',' https://files.catbox.moe/abc123.png','https://files.catbox.moe/abc123.png\n','https://files.catbox.moe/abc123.png\r\n'])assert.throws(()=>remoteImageUrl(value));
 assert.throws(()=>validateAlbum(album({...image(),thumb:'https://files.catbox.moe/abc123.png'})));
});
test('Catbox preparation preserves original PNG bytes and creates a separate bounded embedded preview',async()=>{
 const e=env();try{const source=await prepareCatboxImage(file());assert.deepEqual(Buffer.from(await source.file.arrayBuffer()),png);assert.equal(source.width,1);assert.equal(source.thumb,thumb);}finally{e.restore();}
});
test('rotated JPEGs flatten their orientation at full resolution rather than publishing inconsistent dimensions',async()=>{
 const e=env(),jpeg=Uint8Array.from([255,216,255,192,0,11,8,0,2,0,3,1,1,17,0,255,217]);globalThis.createImageBitmap=async()=>({width:2,height:3,close(){}});
 const canvas={getContext:()=>({drawImage(){}}),toDataURL:()=>thumb,toBlob(callback){const bytes=Buffer.from(png);bytes.writeUInt32BE(this.width,16);bytes.writeUInt32BE(this.height,20);callback(new Blob([bytes],{type:'image/png'}));}};globalThis.document={createElement:()=>canvas};
 try{const result=await prepareCatboxImage(new File([jpeg],'rotated.jpg',{type:'image/jpeg'}));assert.equal(result.file.type,'image/png');assert.equal(result.width,2);assert.equal(result.height,3);const bytes=Buffer.from(await result.file.arrayBuffer());assert.equal(bytes.readUInt32BE(16),2);assert.equal(bytes.readUInt32BE(20),3);}finally{e.restore();}
});
test('anonymous Catbox uploads use one fixed relay, no credentials or account fields, and validate the returned URL',async()=>{
 const e=env();let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,CATBOX_UPLOAD);assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.headers,undefined);assert.equal(options.body.get('reqtype'),'fileupload');assert.equal(options.body.get('userhash'),null);assert.equal(options.body.get('fileToUpload').name,'image.png');assert.deepEqual(Buffer.from(await options.body.get('fileToUpload').arrayBuffer()),png);return new Response('https://files.catbox.moe/abc123.png\n');};
 try{const result=await uploadCatboxImage(file(),'Original');assert.equal(result.data,image().data);assert.equal(result.thumb,thumb);assert.equal(calls,1);assert.equal(e.store.size,1);assert(![...e.store.values()].some(value=>value.includes('private-original-name')));assert(!JSON.stringify(await decodeAlbum(await encodeAlbum(album(result)))).includes('cors.eu.org'));}finally{e.restore();}
});
test('Catbox upload responses reject foreign destinations, redirects, errors and oversized bodies without retries',async()=>{
 const e=env();let calls=0;try{for(const response of [()=>new Response('https://evil.test/a.png'),()=>new Response('https://files.catbox.moe/abc123.svg'),()=>new Response('https://files.catbox.moe/abc123.png?x=1'),()=>new Response('x'.repeat(2049)),()=>new Response('blocked',{status:429}),()=>{const r=new Response(image().data);Object.defineProperty(r,'redirected',{value:true});return r;}]){globalThis.fetch=async()=>{calls++;return response();};await assert.rejects(uploadCatboxImage(file(),'Refused'));}assert.equal(calls,6);}finally{e.restore();}
});
test('Catbox cancellation makes no further writes and does not pretend remote uploads were deleted',async()=>{
 const e=env(),controller=new AbortController();let calls=0,release,entered;const pause=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);globalThis.fetch=async()=>{calls++;entered();await pause;return new Response(image().data);};
 try{const adding=uploadCatboxImage(file(),'Cancelled',{signal:controller.signal}),rejected=assert.rejects(adding);await started;controller.abort();release();await rejected;await assert.rejects(uploadCatboxImage(file(),'Not sent',{signal:controller.signal}));assert.equal(calls,1);}finally{e.restore();}
});
test('completed original uploads are reused by content hash, but clearing the cache permits a new upload',async()=>{
 const e=env();let requests=0;globalThis.fetch=async()=>new Response(`https://files.catbox.moe/ca000${++requests}.png`);
 try{const first=await uploadCatboxImage(file(),'First'),second=await uploadCatboxImage(file(),'Second');assert.equal(requests,1);assert.equal(first.data,second.data);assert.notEqual(first.id,second.id);assert.equal(second.label,'Second');assert([...e.store.values()].some(value=>value.includes(first.data)));clearCatboxUploadCache();await uploadCatboxImage(file(),'Third');assert.equal(requests,2);}finally{e.restore();}
});
test('known Worker errors stay readable, while arbitrary proxy error payloads are not trusted',async()=>{
 const e=env();try{globalThis.fetch=async()=>new Response(JSON.stringify({code:'catbox_refused',error:'Catbox rejected uploads from this Worker network.'}),{status:502,headers:{'content-type':'application/json'}});await assert.rejects(uploadCatboxImage(file(),'Rejected'),error=>{assert.equal(error.message,'Catbox rejected uploads from this Worker network.');assert.equal(error.pauseBatch,true);return true;});globalThis.fetch=async()=>new Response(JSON.stringify({code:'unknown',error:'untrusted private text'}),{status:502});await assert.rejects(uploadCatboxImage(file(),'Rejected'),error=>{assert(error.message.includes('(502)'));assert(!error.message.includes('private text'));return true;});}finally{e.restore();}
});
test('persisted upload reuse cannot introduce an unapproved image host',async()=>{
 const e=env();let posts=0;const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',png))].map(byte=>byte.toString(16).padStart(2,'0')).join('');e.store.set('tierlist-catbox-recent-uploads',JSON.stringify([{hash,data:'https://evil.test/private.png',width:1,height:1,created:Date.now()}]));globalThis.fetch=async url=>{posts++;assert.equal(url,CATBOX_UPLOAD);return new Response('https://files.catbox.moe/sa0001.png');};
 try{const fresh=await import('../tierlist/catbox.mjs?persisted-policy-test');const result=await fresh.uploadCatboxImage(file(),'Safe');assert.equal(result.data,'https://files.catbox.moe/sa0001.png');assert.equal(posts,1);}finally{e.restore();}
});
test('network errors identify the upload relay and pause the batch without automatic retries',async()=>{
 const e=env();let requests=0;globalThis.fetch=async()=>{requests++;const error=new Error('NetworkError when attempting to fetch resource.');error.name='NetworkError';throw error;};
 try{await assert.rejects(uploadCatboxImage(file(),'Failure'),error=>{assert(error.message.includes('upload relay'));assert(error.message.includes('rate limited'));assert.equal(error.pauseBatch,true);return true;});assert.equal(requests,1);}finally{e.restore();}
});
test('retrying a failed TierMaker import reuses completed originals instead of reuploading them',async()=>{
 const e=env(),different=Buffer.concat([png,Buffer.from('different image bytes')]);let posts=0;
 globalThis.fetch=async(url)=>{if(url.startsWith('/tierlist-import'))return new Response(JSON.stringify({name:'Retry',images:[{id:'one',url:'https://tiermaker.com/images/chart/chart/a/one.png'},{id:'two',url:'https://tiermaker.com/images/chart/chart/a/two.png'}],tiers:[]}));if(url.startsWith('/tierlist-image'))return new Response(url.includes('two.png')?different:png,{headers:{'content-type':'image/png'}});assert.equal(url,CATBOX_UPLOAD);posts++;if(posts===2)throw new TypeError('Failed to fetch');return new Response(`https://files.catbox.moe/re000${posts}.png`);};
 try{await assert.rejects(importTiermaker('https://tiermaker.com/create/retry',{storage:'catbox'}),error=>{assert(error.message.includes('1 of 2 images completed'));assert.equal(error.pauseBatch,true);return true;});assert.equal(posts,2);const result=await importTiermaker('https://tiermaker.com/create/retry',{storage:'catbox'});assert.equal(posts,3);assert.deepEqual(result.images.map(image=>image.data),['https://files.catbox.moe/re0001.png','https://files.catbox.moe/re0003.png']);}finally{e.restore();}
});
test('TierMaker cover metadata becomes an embedded cover, while foreign covers are rejected before image downloads',async()=>{
 const e=env();let cover='https://tiermaker.com/images/media/hero_images/2024/1/sample/cover.png',reads=0,posts=0;
 globalThis.fetch=async url=>{if(url.startsWith('/tierlist-import'))return new Response(JSON.stringify({name:'Cover',cover,images:[{id:'one',url:'https://tiermaker.com/images/chart/chart/a/one.png'}],tiers:[]}));if(url.startsWith('/tierlist-image')){reads++;return new Response(png,{headers:{'content-type':'image/png'}});}assert.equal(url,CATBOX_UPLOAD);posts++;return new Response('https://files.catbox.moe/co0001.png');};
 try{const result=await importTiermaker('https://tiermaker.com/create/cover',{storage:'catbox'});assert.equal(result.cover,thumb);assert.equal(result.images.length,1);assert.equal(posts,1);assert.equal(reads,2);cover='https://evil.test/cover.png';await assert.rejects(importTiermaker('https://tiermaker.com/create/cover',{storage:'catbox'}),/Invalid TierMaker image URL/);assert.equal(reads,2);assert.equal(posts,1);}finally{e.restore();}
});
test('old provider-only consent does not silently authorize Catbox, and decline fetches nothing',async()=>{
 const e=env();e.store.set('tierlist-remote-images-allowed','1');let prompts=0,requests=0;globalThis.fetch=async()=>{requests++;throw new Error('Unexpected download');};setRemoteConsentPrompt(async({hosts})=>{prompts++;assert.deepEqual(hosts,['files.catbox.moe']);return {allow:false,remember:true};});
 try{await assert.rejects(verifyImages(album(image('dec123'))),/declined/);assert.equal(prompts,1);assert.equal(requests,0);assert.equal(e.store.get('tierlist-remote-images-allowed-v2'),undefined);}finally{e.restore();}
});
test('embedded Catbox previews avoid full-image downloads while enlargement fetches directly with dimension checks',async()=>{
 const e=env();let downloads=0;setRemoteConsentPrompt(async()=>({allow:true,remember:true}));globalThis.fetch=async(url,options)=>{if(url.startsWith('data:'))return new Response(png,{headers:{'content-type':'image/png'}});downloads++;assert(url.startsWith('https://files.catbox.moe/'));assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');return new Response(png,{headers:{'content-type':'image/png'}});};
 try{const picture=image('prv123');await verifyImages(album(picture));assert.equal(downloads,0);await fetchRemoteBlob(picture);assert.equal(downloads,1);await assert.rejects(fetchRemoteBlob({...picture,width:2}),/dimensions/);await assert.rejects(authorizeRemote([{...picture,data:'https://evil.test/a.png'}]));assert.equal(downloads,1);}finally{e.restore();}
});
test('TierMaker Catbox mode preserves original bytes and source order without albums or an API key',async()=>{
 const e=env();let uploads=0;globalThis.fetch=async(url,options={})=>{if(url.startsWith('/tierlist-import'))return new Response(JSON.stringify({name:'Catbox template',images:[{id:'one',url:'https://tiermaker.com/images/chart/chart/a/one.png'},{id:'two',url:'https://tiermaker.com/images/chart/chart/a/two.png'}],tiers:[]}));if(url.startsWith('/tierlist-image'))return new Response(png,{headers:{'content-type':'image/png'}});assert.equal(url,CATBOX_UPLOAD);assert.deepEqual(Buffer.from(await options.body.get('fileToUpload').arrayBuffer()),png);return new Response(`https://files.catbox.moe/abc12${++uploads}.png`);};
 try{const value=await importTiermaker('https://tiermaker.com/create/catbox',{storage:'catbox'});assert.equal(uploads,1);assert.deepEqual(value.images.map(i=>i.data),['https://files.catbox.moe/abc121.png','https://files.catbox.moe/abc121.png']);assert.deepEqual(value.board.unranked,['i0','i1']);assert(value.images.every(i=>i.thumb===thumb));}finally{e.restore();}
});
