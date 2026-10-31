import {tiermakerPublicUrl,parseTiermakerPage,tiermakerManifest} from './parse.mjs';
import{mediaSource,mediaImageUrl}from'../media-source.mjs';
import{loadMediaManifest,loadMediaImage,mediaCursor,MediaReadError}from'../media-reader.mjs';
const ORIGIN='https://puzzle.seall.dev',MAX_PAGE=2*1024*1024,MAX_IMAGE=25*1024*1024;
class ReadError extends Error{constructor(status,message){super(message);this.status=status;}}
function reply(origin,status,body,type='application/json; charset=utf-8'){
 const headers=new Headers({'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'});
 if(origin)headers.set('Access-Control-Allow-Origin',origin);if(status===429){headers.set('Retry-After','60');headers.set('Access-Control-Expose-Headers','Retry-After');}
 return new Response(type.startsWith('application/json')?JSON.stringify(body):body,{status,headers});
}
async function bytes(response,limit,signal,asBlob=false){
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel().catch(()=>{});throw new ReadError(502,'TierMaker response exceeds the import size limit.');}
 const reader=response.body?.getReader();if(!reader)throw new ReadError(502,'TierMaker returned an empty response.');
 const chunks=[];let size=0;try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new ReadError(502,'TierMaker response exceeds the import size limit.');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 if(asBlob)return new Blob(chunks);
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}return data;
}
export async function fetchTiermaker(value,kind,signal){
 let url=tiermakerPublicUrl(value,kind);
 for(let hop=0;hop<4;hop++){
  signal.throwIfAborted();let upstream;
  try{upstream=await fetch(url,{method:'GET',redirect:'manual',signal,headers:{Accept:kind==='image'?'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp':kind==='page'?'text/html':'application/json,text/plain','User-Agent':'tierlist-import/1.0 (+https://puzzle.seall.dev/tierlist/)'}});}
  catch{throw new ReadError(502,'TierMaker could not be reached. Try again.');}
  if(upstream.status>=300&&upstream.status<400){
   await upstream.body?.cancel().catch(()=>{});const location=upstream.headers.get('Location');if(!location)throw new ReadError(502,'TierMaker returned an invalid redirect.');
   url=tiermakerPublicUrl(new URL(location,url).href,kind);continue;
  }
  if(!upstream.ok){await upstream.body?.cancel().catch(()=>{});throw new ReadError(502,[401,403].includes(upstream.status)?'TierMaker blocked this import or the list is not public.':'TierMaker could not load this template.');}
  const type=(upstream.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const supported=kind==='image'?['image/png','image/jpeg','image/webp','image/gif','image/avif','image/bmp']:kind==='page'?['text/html']:['application/json','text/plain','text/html'];
  if(!supported.includes(type)){await upstream.body?.cancel().catch(()=>{});throw new ReadError(502,'TierMaker returned an unsupported response type.');}
  return {data:await bytes(upstream,kind==='image'?MAX_IMAGE:MAX_PAGE,signal,kind==='image'),type};
 }
 throw new ReadError(502,'Too many TierMaker redirects.');
}
export async function loadTiermakerManifest(value,signal){
 const source=tiermakerPublicUrl(value),parts=new URL(source).pathname.split('/').filter(Boolean),pageUrl=parts.length===3&&parts[0]==='categories'?'https://tiermaker.com/create/'+parts[2]:source;
 const document=await fetchTiermaker(pageUrl,'page',signal),page=parseTiermakerPage(new TextDecoder().decode(document.data),source);
 const query=new URLSearchParams({type:'templates-v2',id:page.slug,lastEdited:page.edited,variation:page.variation});
 const result=await fetchTiermaker('https://tiermaker.com/api/?'+query,'api',signal);let data;
 try{data=JSON.parse(new TextDecoder().decode(result.data));}catch{throw new ReadError(502,'TierMaker did not return an image list.');}
 return tiermakerManifest(page,data);
}
export default{async fetch(request,env){
 const origin=request.headers.get('Origin')===ORIGIN?ORIGIN:null;if(!origin)return reply(null,403,{error:'This website is not allowed to import.',code:'origin_not_allowed'});
 const url=new URL(request.url);
 if(!['/tierlist-import','/tierlist-image','/media-import','/media-image'].includes(url.pathname))return reply(origin,404,{error:'Not found.',code:'not_found'});
 if(request.method==='OPTIONS'){
  const headers=(request.headers.get('Access-Control-Request-Headers')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(request.headers.get('Access-Control-Request-Method')!=='GET'||headers.some(x=>x!=='content-type'))return reply(origin,403,{error:'This import request is not allowed.',code:'preflight_not_allowed'});
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers','Cache-Control':'no-store'}});
 }
 if(request.method!=='GET'){const result=reply(origin,405,{error:'Use GET for public imports.',code:'method_not_allowed'});result.headers.set('Allow','GET, OPTIONS');return result;}
 const media=url.pathname.startsWith('/media-'),value=url.searchParams.get('url'),kind=url.pathname.endsWith('-image')?'image':'page',keys=[...url.searchParams.keys()];let options={};
 try{
  if(url.search.length>8192||url.searchParams.getAll('url').length!==1||keys.some(key=>!((media&&kind==='page'?['url','cursor','version']:['url']).includes(key)))||new Set(keys).size!==keys.length)throw new Error('Supply one approved public source URL.');
  if(media){if(kind==='image')mediaImageUrl(value);else{const source=mediaSource(value);options={cursor:url.searchParams.get('cursor')??undefined,version:url.searchParams.get('version')??undefined};mediaCursor(source,options.cursor,options.version);}}else tiermakerPublicUrl(value,kind);
 }catch(error){return reply(origin,400,{error:media?error.message:'Use an approved HTTPS TierMaker template or image URL.',code:'invalid_request'});}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  if(!env.READ_RATE?.limit)throw new ReadError(503,'Import protection is not configured.');let rate;
  try{rate=await env.READ_RATE.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});}catch{throw new ReadError(503,'Import protection is unavailable. Try again.');}
  if(!rate.success)return reply(origin,429,{error:'Too many import requests. Wait before retrying.',code:'rate_limited'});
  if(media){if(kind==='page')return reply(origin,200,await loadMediaManifest(value,controller.signal,options));const image=await loadMediaImage(value,controller.signal);return reply(origin,200,image,image.type);}
  if(kind==='page')return reply(origin,200,await loadTiermakerManifest(value,controller.signal));
  const image=await fetchTiermaker(value,'image',controller.signal);return reply(origin,200,image.data,image.type);
 }catch(error){const known=error instanceof ReadError||error instanceof MediaReadError,message=controller.signal.aborted?'Public import timed out. Try again.':known?error.message:error?.constructor===Error?error.message.slice(0,200):'The source returned invalid collection metadata.';return reply(origin,known?error.status:400,{error:message,code:media?'media_failed':'tiermaker_failed'});}
 finally{clearTimeout(timer);}
}};
