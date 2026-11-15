import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {BUILDER_SCRIPT} from '../tierlist/invite-worker/builder.mjs';
import worker from '../tierlist/invite-worker/worker.mjs';
import {INVITE_PREVIEW} from '../tierlist/invite-preview.mjs';
import {encodeInvite,decodeInvite} from '../tierlist/invite.mjs';
const ticket={host:'a'.repeat(64),relay:'https://use1-1.relay.n0.iroh.link./',room:'b'.repeat(32),secret:'c'.repeat(32)};
test('existing-invite builder is fixed static GET/HEAD HTML with a matching CSP and no submitting form',async()=>{
 const url=new URL('/make',INVITE_PREVIEW),response=await worker.fetch(new Request(url)),html=await response.text();assert.equal(response.status,200);assert(html.includes('id="invite"'));assert(!/<form\b/i.test(html));assert(html.includes('Keep the host tab and lobby open'));
 const hash=createHash('sha256').update(BUILDER_SCRIPT).digest('base64');assert(response.headers.get('content-security-policy').includes(`sha256-${hash}`));assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(await(await worker.fetch(new Request(url,{method:'HEAD'}))).text(),'');
 const rejected=await worker.fetch(new Request(url+'?invite=PRIVATE_SENTINEL'));assert.equal(rejected.status,400);assert(!(await rejected.text()).includes('PRIVATE_SENTINEL'));assert.equal((await worker.fetch(new Request(url,{method:'POST'}))).status,405);
});
test('builder converts running TL5/TL6 links locally, copies complete private fragments, and clears invalid results',async()=>{
 const nodes=new Map(),events=new Map(),copied=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,textContent:'',addEventListener:(type,fn)=>events.set(id+':'+type,fn),focus(){},select(){}});return nodes.get(id);};
 new Function('document','navigator',BUILDER_SCRIPT)({getElementById:node},{clipboard:{writeText:async value=>copied.push(value)}});
 node('owner').value='Existing host';node('title').value='Existing tierlist';
 for(const protocol of [5,6]){const code=encodeInvite({...ticket,protocol});node('invite').value='https://puzzle.seall.dev/tierlist/#join='+code;events.get('generate:click')();const url=new URL(node('output').value);assert.equal(url.origin,new URL(INVITE_PREVIEW).origin);assert.equal(url.searchParams.get('owner'),'Existing host');assert.equal(decodeInvite(url.href).protocol,protocol);assert.equal(url.hash,'#join='+code);assert(!url.search.includes(code));assert.equal(node('result').hidden,false);await events.get('copy:click')();assert.equal(copied.at(-1),url.href);}
 for(const invalid of ['https://evil.invalid/','#join=TL6.abc&join=TL6.def','javascript:alert(1)']){node('invite').value=invalid;events.get('generate:click')();assert.equal(node('result').hidden,true);assert.equal(node('output').value,'');assert(node('error').textContent);}
});
test('old direct app links have generic server-rendered OG fallback without exposing private invite data',async()=>{
 const html=await readFile(new URL('../tierlist/index.html',import.meta.url),'utf8');assert(html.includes('property="og:title" content="Join a Tier List lobby"'));assert(html.includes('property="og:image"'));assert(!html.includes('property="og:url"'),'do not replace fragment-bearing original link with a canonical fragmentless join target');
});
