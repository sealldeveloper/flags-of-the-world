import test from 'node:test';
import assert from 'node:assert/strict';
import {tiermakerPublicUrl,parseTiermakerPage,tiermakerManifest} from '../tierlist/tiermaker-worker/parse.mjs';
import worker from '../tierlist/tiermaker-worker/worker.mjs';
const ORIGIN='https://puzzle.seall.dev',SOURCE='https://tiermaker.com/create/sample-123';
const PAGE=`<meta property="og:title" content="Create a Sample &amp; friends Tier List"><meta name="description" content="A public template"><meta property="og:image" content="/images/templates/sample-123/cover.png"><script>dateLastEdited="2026-10-30 10:00:00";tierSystem.initList("", "sample-123", "");</script>`;
const env={READ_RATE:{limit:async()=>({success:true})}};
const request=(path='/tierlist-import',value=SOURCE,origin=ORIGIN,method='GET')=>new Request('https://worker.example'+path+'?url='+encodeURIComponent(value),{method,headers:origin?{Origin:origin}:{}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=','base64');
test('TierMaker worker URL policy rejects arbitrary hosts, credentials, traversal, private routes and API queries',()=>{
 assert.equal(tiermakerPublicUrl('https://www.tiermaker.com/create/sample-123?x=1#foo'),SOURCE);
 assert.equal(tiermakerPublicUrl('https://tiermaker.com/images/media/hero_images/2024/12/x/cover..png','image'),'https://tiermaker.com/images/media/hero_images/2024/12/x/cover..png');
 for(const value of ['http://tiermaker.com/create/x','https://tiermaker.com.evil.test/create/x','https://127.0.0.1/create/x','https://tiermaker.com@localhost/create/x','https://tiermaker.com:9999/create/x','https://tiermaker.com/login/','https://tiermaker.com/create/../admin','https://tiermaker.com/create/%2e%2e/admin','https://tiermaker.com/create/%252e%252e/admin','https://tiermaker.com/create/a\\b','https://tiermaker.com/create/a\nb'])assert.throws(()=>tiermakerPublicUrl(value),value);
 for(const value of ['https://localhost/images/chart/a.png','https://tiermaker.com/images/chart/../admin.png','https://tiermaker.com/images/chart/%252e%252e/admin.png','https://tiermaker.com/includes/a.php','https://tiermaker.com/api/'])assert.throws(()=>tiermakerPublicUrl(value,'image'),value);
 assert.throws(()=>tiermakerPublicUrl('https://tiermaker.com/api/?type=delete&id=1','api'));
});
test('TierMaker page metadata, safe literals and hero covers match the local helper',()=>{
 const page=parseTiermakerPage(PAGE,SOURCE);assert.equal(page.name,'Sample & friends');assert.equal(page.edited,'2026-10-30 10:00:00');assert.equal(page.cover,'https://tiermaker.com/images/templates/sample-123/cover.png');
 assert.equal(parseTiermakerPage(PAGE.replace('initList("", "sample-123", "")',"initList('', 'sample-123', 'variation_1')"),SOURCE).variation,'variation_1');
 assert.equal(parseTiermakerPage(PAGE.replace('/images/templates/sample-123/cover.png','https://evil.test/cover.png'),SOURCE).cover,'');
 assert.throws(()=>parseTiermakerPage('<script>globalThis.badExecuted=true</script>',SOURCE));assert.equal(globalThis.badExecuted,undefined);
 assert.throws(()=>parseTiermakerPage(PAGE.replace('"sample-123"','globalThis.badExecuted=true'),SOURCE));
});
test('TierMaker legacy/modern images, ordering, labels, saved placements and >1000 images are preserved',()=>{
 const page=parseTiermakerPage(PAGE,SOURCE),manifest=tiermakerManifest(page,['sample-123','b.png','a.png']);assert.deepEqual(manifest.images.map(x=>x.label),['b','a']);assert.equal(manifest.cover,page.cover);
 const modern=tiermakerManifest(page,['/media/template_images/2024/123/sample-123','01.png']);assert.equal(modern.images[0].url,'https://tiermaker.com/images/media/template_images/2024/123/sample-123/01.png');
 assert.equal(tiermakerManifest(page,['sample-123',...Array(1001).fill('a.png')]).images.length,1001);
 page.code='sample-123==<b>Best</b>|3|2|1==Other|0';assert.deepEqual(tiermakerManifest(page,['sample-123','a.png','b.png','c.png']).tiers[0],{name:'Best',color:'#ffff7f',items:['2','1']});
 for(const data of [[],['wrong','a.png'],['sample-123','https://evil.test/a.png'],['sample-123','../other/a.png'],['sample-123',{id:1,src:'a.png'},{id:1,src:'b.png'}]])assert.throws(()=>tiermakerManifest(page,data));
 page.code='sample-123==S|0|1|1';assert.throws(()=>tiermakerManifest(page,['sample-123','a.png']));
});
test('TierMaker read Worker refuses other origins, writes, paths and duplicate/extra query fields without fetching',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Must not fetch');};
 try{
  for(const origin of ['http://127.0.0.1:18764','http://localhost:18764','https://puzzle.seall.dev.evil.test','null',null]){const response=await worker.fetch(request('/tierlist-import',SOURCE,origin),env);assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);}
  for(const [req,status]of[[request('/tierlist-import',SOURCE,ORIGIN,'POST'),405],[request('/proxy'),404],[request('/tierlist-import','https://127.0.0.1/private'),400],[request('/tierlist-image','https://tiermaker.com/login/'),400],[new Request('https://worker.example/tierlist-import?url='+encodeURIComponent(SOURCE)+'&url='+encodeURIComponent(SOURCE),{headers:{Origin:ORIGIN}}),400],[new Request('https://worker.example/tierlist-import?url='+encodeURIComponent(SOURCE)+'&extra=1',{headers:{Origin:ORIGIN}}),400]]){const response=await worker.fetch(req,env);assert.equal(response.status,status);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);}
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('production GET preflights work, rate limits and missing bindings fail closed with readable CORS',async()=>{
 const preflight=await worker.fetch(new Request('https://worker.example/tierlist-import',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'GET'}}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),ORIGIN);
 const denied=await worker.fetch(new Request('https://worker.example/tierlist-import',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST'}}),env);assert.equal(denied.status,403);
 for(const [options,status]of[[{},503],[{READ_RATE:{limit:async()=>({success:false})}},429]]){const response=await worker.fetch(request(),options);assert.equal(response.status,status);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);}
});
test('live-shaped page/API data uses only anonymous GETs and internally constructed templates-v2 queries',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Origin,undefined);if(url===SOURCE)return new Response(PAGE,{headers:{'content-type':'text/html'}});const api=new URL(url);assert.equal(api.origin,'https://tiermaker.com');assert.equal(api.pathname,'/api/');assert.equal(api.searchParams.get('type'),'templates-v2');assert.equal(api.searchParams.get('id'),'sample-123');assert.equal(api.searchParams.get('lastEdited'),'2026-10-30 10:00:00');return new Response(JSON.stringify(['sample-123','a.png','b.png']),{headers:{'content-type':'application/json'}});};
 try{const response=await worker.fetch(request(),env);assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal((await response.json()).images.length,2);assert.equal(calls.length,2);}finally{globalThis.fetch=original;}
});
test('images are byte-exact, while upstream redirects, unsupported MIME and size violations are refused',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(png,{headers:{'content-type':'image/png'}});const image=await worker.fetch(request('/tierlist-image','https://tiermaker.com/images/chart/chart/sample-123/a.png'),env);assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  for(const result of [()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}}),()=>new Response(png,{headers:{'content-type':'image/svg+xml'}}),()=>new Response(png,{headers:{'content-type':'image/png','content-length':String(26*1024*1024)}}),()=>new Response(new Uint8Array(25*1024*1024+1),{headers:{'content-type':'image/png'}})]){let calls=0;globalThis.fetch=async()=>{calls++;return result();};const response=await worker.fetch(request('/tierlist-image','https://tiermaker.com/images/chart/chart/sample-123/a.png'),env);assert(response.status>=400);assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal(calls,1);}
 }finally{globalThis.fetch=original;}
});
