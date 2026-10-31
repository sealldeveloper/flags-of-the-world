import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../tierlist/upload-worker/worker.mjs';
const ORIGIN='https://puzzle.seall.dev',ENDPOINT='https://worker.example/upload';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=','base64');
function env(success=true){return {ALLOWED_ORIGINS:JSON.stringify([ORIGIN]),UPLOAD_RATE:{limit:async()=>({success})}};}
function upload({origin=ORIGIN,form,headers={},path=ENDPOINT}={}){form ||= new FormData();if(![...form.keys()].length){form.set('reqtype','fileupload');form.set('fileToUpload',new File([png],'private-name.png',{type:'image/png'}));}return new Request(path,{method:'POST',body:form,headers:{...(origin===null?{}:{Origin:origin}),...headers}});}
async function refused(request,status,options=env()){let calls=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected upstream request');};try{const response=await worker.fetch(request,options);assert.equal(response.status,status);assert.equal(calls,0);if(request.headers.get('Origin')===ORIGIN)assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);else assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);return await response.json();}finally{globalThis.fetch=previous;}}
test('worker CORS permits only the production origin, never localhost, suffixes or missing/null origins',async()=>{
 for(const origin of ['http://127.0.0.1:18764','http://localhost:18764','https://puzzle.seall.dev.evil.test','http://puzzle.seall.dev','null',null])await refused(upload({origin}),403);
});
test('production preflights succeed, but arbitrary methods and request headers are refused',async()=>{
 const request=new Request(ENDPOINT,{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}}),response=await worker.fetch(request,env());assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal(response.headers.get('Access-Control-Allow-Methods'),'POST');assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
 await refused(new Request(ENDPOINT,{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'DELETE'}}),403);await refused(new Request(ENDPOINT,{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-Upstream-Authorization'}}),403);
});
test('no target URL, query parameter, alternate path or GET upload turns this into a general proxy',async()=>{
 await refused(upload({path:ENDPOINT+'?url=https://127.0.0.1/'}),404);await refused(upload({path:'https://worker.example/https://catbox.moe/user/api.php'}),404);await refused(new Request(ENDPOINT,{headers:{Origin:ORIGIN}}),405);
});
test('rate limits and missing protection bindings fail closed with production CORS headers',async()=>{
 const body=await refused(upload(),429,env(false));assert.equal(body.code,'upload_rate_limited');await refused(upload(),503,{ALLOWED_ORIGINS:JSON.stringify([ORIGIN])});
});
test('only two anonymous file-upload fields are accepted, without URLs, userhashes or duplicates',async()=>{
 for(const kind of ['userhash','urlupload','deletefiles','duplicate','string']){const form=new FormData();form.set('reqtype',kind==='urlupload'?'urlupload':kind==='deletefiles'?'deletefiles':'fileupload');form.set('fileToUpload',kind==='string'?'https://example.com/image.png':new File([png],'image.png',{type:'image/png'}));if(kind==='userhash')form.set('userhash','secret');if(kind==='duplicate')form.append('reqtype','urlupload');await refused(upload({form}),400);}
});
test('unsupported image types and invalid or oversized raster dimensions never reach Catbox',async()=>{
 const oversized=Buffer.from(png);oversized.writeUInt32BE(100000,16);
 for(const [bytes,type,status]of[[png,'image/svg+xml',415],[Buffer.from('<svg/>'),'image/png',422],[oversized,'image/png',422]]){const form=new FormData();form.set('reqtype','fileupload');form.set('fileToUpload',new File([bytes],'image.png',{type}));await refused(upload({form}),status);}
});
test('declared and actual request sizes are bounded before forwarding',async()=>{
 await refused(upload({headers:{'Content-Length':String(30*1024*1024)}}),413);
 const request=new Request(ENDPOINT,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'multipart/form-data; boundary=test'},body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(26*1024*1024));controller.close();}}),duplex:'half'});await refused(request,413);
});
test('valid uploads preserve file bytes and forward only to the fixed Catbox endpoint with fresh headers',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://catbox.moe/user/api.php');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Origin,undefined);assert.equal(options.headers['X-Upstream-Cookie'],undefined);assert.equal(options.body.get('reqtype'),'fileupload');assert.equal(options.body.get('userhash'),null);assert.equal(options.body.get('fileToUpload').name,'image.png');assert.deepEqual(Buffer.from(await options.body.get('fileToUpload').arrayBuffer()),png);return new Response('https://files.catbox.moe/ab0001.png\n');};
 try{const response=await worker.fetch(upload({headers:{Cookie:'private cookie',Authorization:'Bearer private','X-Upstream-Cookie':'private'}}),env());assert.equal(response.status,200);assert.equal(await response.text(),'https://files.catbox.moe/ab0001.png');assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
test('Catbox errors, redirects, invalid returned URLs and large replies all retain production CORS',async()=>{
 const previous=globalThis.fetch;try{for(const [result,status,code]of[[()=>new Response('slow down',{status:429}),429,'catbox_rate_limited'],[()=>new Response('Invalid uploader',{status:412}),502,'catbox_refused'],[()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}}),502,'catbox_redirect'],[()=>new Response('https://evil.test/image.png'),502,'invalid_catbox_reply'],[()=>new Response('https://files.catbox.moe/ab0001.svg'),502,'invalid_catbox_reply'],[()=>new Response('x'.repeat(2049)),502,'invalid_catbox_reply']]){let calls=0;globalThis.fetch=async()=>{calls++;return result();};const response=await worker.fetch(upload(),env());assert.equal(response.status,status);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal((await response.json()).code,code);assert.equal(calls,1);}}finally{globalThis.fetch=previous;}
});
test('upstream network failures remain readable, without leaking exceptions or incoming credentials',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('private failure with secret');};try{const response=await worker.fetch(upload(),env());assert.equal(response.status,502);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);const text=await response.text();assert(!text.includes('private failure'));assert(!text.includes('secret'));assert(text.includes('catbox_unreachable'));}finally{globalThis.fetch=previous;}
});
