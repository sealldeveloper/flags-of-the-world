import test from 'node:test';
import assert from 'node:assert/strict';
import {imgurImageUrl,imgurPreviewUrl,rasterHeader} from '../tierlist/image-policy.mjs';
import {emptyAlbum,validateAlbum} from '../tierlist/model.mjs';
import {encodeAlbum,decodeAlbum,verifyImages} from '../tierlist/codec.mjs';
import {authorizeRemote,setRemoteConsentPrompt,fetchRemoteBlob,resetRemoteConsent} from '../tierlist/remote-images.mjs';
import {ImgurUpload,listImgurUploads} from '../tierlist/imgur.mjs';
import {importTiermaker} from '../tierlist/tiermaker.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=','base64');
const image=(name='Abc1234')=>({id:name,label:name,data:`https://i.imgur.com/${name}.png`,width:1,height:1});
const album=picture=>{const value=emptyAlbum();value.images=[picture];value.board.unranked=[picture.id];return value;};
function environment(){const previous={fetch:globalThis.fetch,localStorage:globalThis.localStorage,createImageBitmap:globalThis.createImageBitmap},store=new Map();globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});return {store,restore(){Object.assign(globalThis,previous);}};}
const json=data=>new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
test('remote image URLs are exact direct HTTPS Imgur links, not a general URL allowlist',()=>{
 assert.equal(imgurPreviewUrl('https://i.imgur.com/Abc1234.png'),'https://i.imgur.com/Abc1234m.png');
 for(const url of ['http://i.imgur.com/Abc1234.png','https://imgur.com/Abc1234','https://i.imgur.com.evil.test/Abc1234.png','https://i.imgur.com@evil.test/Abc1234.png','https://i.imgur.com:443/Abc1234.png','https://i.imgur.com./Abc1234.png','https://i.imgur.com/../Abc1234.png','https://i.imgur.com/%41bc1234.png','https://i.imgur.com/Abc1234.svg','https://i.imgur.com/Abc1234.gif','https://i.imgur.com/Abc1234.png?redirect=evil','https://i.imgur.com/Abc1234.png#x','https://127.0.0.1/a.png','file:///tmp/a.png','blob:https://i.imgur.com/Abc1234.png',' https://i.imgur.com/Abc1234.png'])assert.throws(()=>imgurImageUrl(url),/direct HTTPS/);
});
test('remote dimensions are bounded and peer thumbnails must remain embedded rasters',()=>{
 const value=album(image());assert.equal(validateAlbum(value).images[0].width,1);
 for(const change of [{width:8193},{width:8192,height:8192},{width:0},{height:1.2},{thumb:'https://evil.test/a.png'},{data:'https://example.com/a.png'}])assert.throws(()=>validateAlbum({...value,images:[{...value.images[0],...change}]}));
});
test('remote codes carry public image links, never private Imgur management fields',async()=>{
 const value=album({...image(),deletehash:'privateSecret',clientId:'privateClient'});value.imgurDeletionKey='privateAlbumKey';const result=await decodeAlbum(await encodeAlbum(value));assert.equal(result.images[0].data,value.images[0].data);assert(!JSON.stringify(result).includes('private'));
});
test('declining downloads makes zero requests, including with the checkbox checked',async()=>{
 const env=environment();let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('Unexpected fetch');};setRemoteConsentPrompt(async()=>({allow:false,remember:true}));
 try{await assert.rejects(verifyImages(album(image('Decline123'))),/declined/);assert.equal(requests,0);assert.equal(env.store.size,0);await assert.rejects(fetchRemoteBlob(image('Decline123')),/permission/);}finally{env.restore();}
});
test('consent precedes fetch, remember survives future checks and never disables URL validation',async()=>{
 const env=environment();let prompts=0,requests=0;setRemoteConsentPrompt(async()=>{prompts++;assert.equal(requests,0);return {allow:true,remember:true};});
 globalThis.fetch=async(url,options)=>{requests++;assert(url.startsWith('https://i.imgur.com/'));assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');return new Response(png,{headers:{'content-type':'image/png'}});};
 try{await verifyImages(album(image('Consent123')),{forceConsent:true});assert.equal(prompts,1);await authorizeRemote([image('Future1234')],{force:true});assert.equal(prompts,1);assert.equal(env.store.get('tierlist-remote-images-allowed-v2'),'1');await assert.rejects(verifyImages(album({...image('Bad12345'),data:'https://evil.test/Bad12345.png'})),/direct HTTPS/);assert.equal(requests,1);resetRemoteConsent();setRemoteConsentPrompt(async()=>{prompts++;return {allow:true};});await authorizeRemote([image('Consent123')],{force:true});assert.equal(prompts,2);}finally{env.restore();}
});
test('remote downloads reject redirected, oversized, wrong-type and oversized-decoded responses',async()=>{
 const env=environment();env.store.set('tierlist-remote-images-allowed-v2','1');let decodes=0;globalThis.createImageBitmap=async()=>{decodes++;throw new Error('Decoder must not run');};
 const enormous=Buffer.from(png);enormous.writeUInt32BE(100000,16);
 const responses=[()=>{const response=new Response(png,{headers:{'content-type':'image/png'}});Object.defineProperty(response,'redirected',{value:true});return response;},()=>new Response(png,{headers:{'content-type':'image/png','content-length':String(30*1024*1024)}}),()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}}),()=>new Response(enormous,{headers:{'content-type':'image/png'}})];
 try{for(const [index,response] of responses.entries()){globalThis.fetch=async()=>response();await assert.rejects(fetchRemoteBlob(image('Invalid'+index),{preview:true}));}assert.equal(decodes,0);}finally{env.restore();}
});
test('raster preflight rejects animation and recognizes JPEG before decoding',()=>{
 const animated=Buffer.concat([png,Buffer.from([0,0,0,0,97,99,84,76,0,0,0,0])]);assert.throws(()=>rasterHeader(animated,'image/png'),/Animated/);
 const jpeg=Uint8Array.from([255,216,255,192,0,11,8,0,2,0,3,1,1,17,0,255,217]);assert.deepEqual(rasterHeader(jpeg,'image/jpeg'),{width:3,height:2});
});
test('anonymous Imgur sessions request hidden albums, verify unlisted status and retain deletion keys locally',async()=>{
 const env=environment(),calls=[];let uploadBytes;
 globalThis.fetch=async(url,options)=>{calls.push([url,options.method]);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Client-ID TestClient1234');
  if(options.method==='DELETE')return json(true);
  if(url.endsWith('/album') && options.method==='POST'){assert.equal(options.body.get('privacy'),'hidden');return json({id:'Album123',deletehash:'AlbumDeletionSecret'});}
  if(url.endsWith('/image')){assert.equal(options.body.get('album'),'AlbumDeletionSecret');uploadBytes=Buffer.from(await options.body.get('image').arrayBuffer());return json({id:'Image123',deletehash:'ImageDeletionSecret',link:'https://i.imgur.com/Image123.png',width:1,height:1,in_gallery:false});}
  return json({id:'Album123',privacy:'hidden',in_gallery:false});
 };
 try{const session=await ImgurUpload.create('TestClient1234','Test album');const result=await session.add(new File([png],'original.png',{type:'image/png'}),'Original');await session.commit();assert.deepEqual(uploadBytes,png);assert.equal(result.data,'https://i.imgur.com/Image123.png');assert.equal(listImgurUploads()[0].images[0].deleteHash,'ImageDeletionSecret');assert(!JSON.stringify(await decodeAlbum(await encodeAlbum(album(result)))).includes('DeletionSecret'));await session.rollback();assert.equal(listImgurUploads().length,0);assert(calls.some(([url,method])=>url.endsWith('/image/ImageDeletionSecret')&&method==='DELETE'));assert(!calls.some(([url])=>url.includes('/gallery')));}finally{env.restore();}
});
test('cancelling an in-flight upload retains its receipt before cleanup instead of losing the deletion key',async()=>{
 const env=environment(),controller=new AbortController();let entered,release;const enteredPromise=new Promise(resolve=>entered=resolve),released=new Promise(resolve=>release=resolve);const deleted=[];
 globalThis.fetch=async(url,options)=>{
  if(options.method==='DELETE'){deleted.push(url);return json(true);}
  if(url.endsWith('/album')&&options.method==='POST')return json({id:'CancelAlbum',deletehash:'CancelAlbumKey'});
  if(url.endsWith('/image')){assert.equal(options.signal.aborted,false);entered();await released;return json({id:'CancelImage',deletehash:'CancelImageKey',link:'https://i.imgur.com/CancelImage.png',width:1,height:1,in_gallery:false});}
  return json({id:'CancelAlbum',privacy:'hidden',in_gallery:false});
 };
 try{const session=await ImgurUpload.create('TestClient1234','Cancel');const adding=session.add(new File([png],'image.png',{type:'image/png'}),'Image',{signal:controller.signal});await enteredPromise;controller.abort();release();await assert.rejects(adding);assert.equal(listImgurUploads()[0].images[0].deleteHash,'CancelImageKey');await session.rollback();assert.equal(deleted.length,2);}finally{env.restore();}
});
test('TierMaker upload failures drain in-flight writes before deleting known images and preserve the real API error',async()=>{
 const env=environment();let release,posted,failure;const delayed=new Promise(resolve=>release=resolve),started=new Promise(resolve=>posted=resolve),failed=new Promise(resolve=>failure=resolve),deleted=[];
 globalThis.fetch=async(url,options={})=>{
  if(url.startsWith('/tierlist-import'))return new Response(JSON.stringify({name:'Pool',images:[{id:'one',label:'First',url:'https://tiermaker.com/images/chart/chart/a/one.png'},{id:'two',label:'Second',url:'https://tiermaker.com/images/chart/chart/a/two.png'}],tiers:[]}),{headers:{'content-type':'application/json'}});
  if(url.startsWith('/tierlist-image'))return new Response(png,{headers:{'content-type':'image/png'}});
  if(options.method==='DELETE'){deleted.push(url);return json(true);}
  if(url.endsWith('/album') && options.method==='POST')return json({id:'PoolAlbum',deletehash:'PoolAlbumKey'});
  if(url.endsWith('/image')){if(options.body.get('title')==='Second'){await started;failure();return new Response('Rate limit',{status:429});}posted();await delayed;return json({id:'PoolImage',deletehash:'PoolImageKey',link:'https://i.imgur.com/PoolImage.png',width:1,height:1,in_gallery:false});}
  return json({id:'PoolAlbum',privacy:'hidden',in_gallery:false});
 };
 try{const importing=importTiermaker('https://tiermaker.com/create/pool',{storage:'imgur',clientId:'TestClient1234'});const rejected=assert.rejects(importing,/429/);await failed;await new Promise(resolve=>setImmediate(resolve));assert.equal(deleted.length,0);release();await rejected;assert(deleted.some(url=>url.endsWith('/image/PoolImageKey')));assert.equal(listImgurUploads().length,0);}finally{env.restore();}
});
test('public albums fail closed and are removed, never silently accepted as unlisted',async()=>{
 const env=environment();let deleted=0;globalThis.fetch=async(url,options)=>{if(options.method==='DELETE'){deleted++;return json(true);}return options.method==='POST'?json({id:'Public123',deletehash:'PublicDeletionKey'}):json({id:'Public123',privacy:'public',in_gallery:true});};
 try{await assert.rejects(ImgurUpload.create('TestClient1234','Wrong privacy'),/unlisted/);assert.equal(deleted,1);assert.equal(listImgurUploads().length,0);}finally{env.restore();}
});
