import{mediaSource,mediaImageUrl}from'./media-source.mjs';
import{parseYoutube,parseYoutubeContinuation,parseSpotify}from'./media-parse.mjs';
export class MediaReadError extends Error{constructor(status,message){super(message);this.status=status;}}
const PAGE_LIMIT=8*1024*1024,IMAGE_LIMIT=25*1024*1024;
async function body(response,limit,signal){
 if(Number(response.headers.get('Content-Length'))>limit){await response.body?.cancel().catch(()=>{});throw new MediaReadError(502,'The public source exceeds the import size limit.');}const reader=response.body?.getReader();if(!reader)throw new MediaReadError(502,'The public source returned an empty response.');const chunks=[];let size=0;
 try{while(true){signal.throwIfAborted();const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new MediaReadError(502,'The public source exceeds the import size limit.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}return new Blob(chunks,{type:(response.headers.get('Content-Type')||'').split(';')[0].toLowerCase()});
}
async function read(url,signal,{json=null,image=false,allowMissing=false}={}){
 let response;try{response=await fetch(url,{method:json?'POST':'GET',redirect:'manual',signal,credentials:'omit',headers:{Accept:image?'image/jpeg,image/png,image/webp':json?'application/json':'text/html','Accept-Language':'en','User-Agent':'tierlist-public-import/1.0 (+https://puzzle.seall.dev/tierlist/)',...(json?{'Content-Type':'application/json'}:{})},...(json?{body:JSON.stringify(json)}:{})});}catch{throw new MediaReadError(502,'The public source could not be reached. Try again.');}
 if(allowMissing&&response.status===404){await response.body?.cancel().catch(()=>{});return null;}
 if(!response.ok||response.status>=300){await response.body?.cancel().catch(()=>{});throw new MediaReadError(502,'The source is unavailable, private or temporarily blocking public imports. No sign-in or browser checks are bypassed.');}
 const type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase(),allowed=image?['image/jpeg','image/png','image/webp']:json?['application/json']:['text/html'];if(!allowed.includes(type)){await response.body?.cancel().catch(()=>{});throw new MediaReadError(502,'The source returned an unsupported response type.');}return body(response,image?IMAGE_LIMIT:PAGE_LIMIT,signal);
}
export function mediaCursor(source,cursor,version){
 if(cursor===undefined&&version===undefined)return null;
 if(source.kind!=='youtube'||typeof cursor!=='string'||!cursor.length||cursor.length>4096||/[\x00-\x20]/.test(cursor)||typeof version!=='string'||!/^2\.[0-9.]{8,40}$/.test(version))throw new Error('Invalid public playlist page request.');return{cursor,version};
}
export async function loadMediaManifest(value,signal,options={}){
 const source=mediaSource(value),page=mediaCursor(source,options.cursor,options.version);let result;
 if(page){const blob=await read('https://www.youtube.com/youtubei/v1/browse',signal,{json:{context:{client:{clientName:'WEB',clientVersion:page.version,hl:'en'}},continuation:page.cursor}});let data;try{data=JSON.parse(await blob.text());}catch{throw new MediaReadError(502,'YouTube returned invalid playlist metadata.');}const next=parseYoutubeContinuation(data);return{kind:'youtube',source:source.url,id:source.id,items:next.items,unavailable:next.skipped,warnings:next.skipped?[`${next.skipped} unavailable videos were skipped.`]:[],next:next.continuation?{cursor:next.continuation,version:page.version}:null};}
 const url=source.kind==='youtube'?source.url:'https://open.spotify.com/embed/album/'+source.id,blob=await read(url,signal),document=await blob.text();result=source.kind==='youtube'?parseYoutube(document,source.url):parseSpotify(document,source.url);
 const{continuation,client,skipped,...manifest}=result;return{...manifest,unavailable:skipped||0,next:continuation?{cursor:continuation,version:client.clientVersion}:null};
}
export async function loadMediaImage(value,signal){
 const url=mediaImageUrl(value),variants=[url];if(url.startsWith('https://i.ytimg.com/')&&url.endsWith('/maxresdefault.jpg'))variants.push(url.replace('/maxresdefault.jpg','/sddefault.jpg'),url.replace('/maxresdefault.jpg','/hqdefault.jpg'));
 for(const variant of variants){const blob=await read(variant,signal,{image:true,allowMissing:true});if(blob)return blob;}throw new MediaReadError(502,'This entry does not expose usable artwork.');
}
