import {id,MAX_THUMB_EDGE} from './model.mjs';
import {catboxImageUrl,remoteDimensions,rasterHeader,MAX_REMOTE_BYTES} from './image-policy.mjs';
// Fixed destination and relay. Neither peers nor imported documents can select an upload target.
export const CATBOX_UPLOAD='https://cors.eu.org/https://catbox.moe/user/api.php';
const WORKER_ERRORS=new Set(['upload_too_large','upload_timeout','multipart_required','missing_file','invalid_multipart','service_unavailable','origin_not_allowed','upload_rate_limited','fileupload_only','unsupported_image','invalid_image','catbox_redirect','catbox_rate_limited','catbox_refused','invalid_catbox_reply','empty_catbox_reply','catbox_unreachable']);
const CACHE_KEY='tierlist-catbox-recent-uploads',CACHE_AGE=24*60*60*1000,recent=new Map();let nextUploadAt=0;
export function clearCatboxUploadCache(){recent.clear();nextUploadAt=0;try{localStorage.removeItem(CACHE_KEY);}catch{}}
function cachedUploads(){
  try{const text=localStorage.getItem(CACHE_KEY) || '[]';if(text.length<=512*1024){const records=JSON.parse(text);if(Array.isArray(records) && records.length<=2048)for(const record of records)try{if(/^[a-f0-9]{64}$/.test(record.hash) && Number.isFinite(record.created) && Date.now()-record.created<CACHE_AGE && record.created<=Date.now()){catboxImageUrl(record.data);remoteDimensions(record);recent.set(record.hash,{hash:record.hash,data:record.data,width:record.width,height:record.height,created:record.created});}}catch{}}}catch{}
  for(const [key,record] of recent)if(Date.now()-record.created>=CACHE_AGE)recent.delete(key);
  while(recent.size>2048)recent.delete(recent.keys().next().value);return recent;
}
function rememberUpload(hash,data,source){
  const records=cachedUploads();records.delete(hash);records.set(hash,{hash,data,width:source.width,height:source.height,created:Date.now()});while(records.size>2048)records.delete(records.keys().next().value);
  try{localStorage.setItem(CACHE_KEY,JSON.stringify([...records.values()]));}catch{} // Current-tab reuse still works if persistence is blocked.
}
async function uploadTurn(signal){
  signal?.throwIfAborted();const now=Date.now(),start=Math.max(now,nextUploadAt);nextUploadAt=start+1500;
  if(start<=now)return;
  await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);},timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},start-now);signal?.addEventListener('abort',abort,{once:true});});signal?.throwIfAborted();
}
export async function prepareCatboxImage(file,{maxThumbData=16384}={}){
  if(!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type) || !file.size || file.size>MAX_REMOTE_BYTES)throw new Error('Use an image file up to 25 MiB.');
  let original=false,header;
  if(['image/png','image/jpeg','image/webp'].includes(file.type))try{header=rasterHeader(new Uint8Array(await file.arrayBuffer()),file.type);original=true;}catch{}
  const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');
  try{
    const dimensions=remoteDimensions(bitmap);
    if(header && (header.width!==dimensions.width || header.height!==dimensions.height)){
      // EXIF rotation swaps decoded JPEG dimensions. Flatten that orientation without downscaling.
      if(file.type==='image/jpeg' && header.width===dimensions.height && header.height===dimensions.width)original=false;
      else throw new Error('Invalid source image dimensions.');
    }
    let source=file;
    if(!original){
      canvas.width=dimensions.width;canvas.height=dimensions.height;canvas.getContext('2d').drawImage(bitmap,0,0);
      source=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!source || source.size>MAX_REMOTE_BYTES)throw new Error('The full-resolution PNG exceeds 25 MiB.');
    }
    const budget=Math.max(256,Math.min(16384,Math.floor(maxThumbData)));let ratio=Math.min(1,MAX_THUMB_EDGE/Math.max(bitmap.width,bitmap.height)),thumb;
    while(true){
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      thumb=canvas.toDataURL('image/webp',.82);if(thumb.length<=budget)break;
      if(canvas.width===1 && canvas.height===1)throw new Error('Could not create a small image preview.');ratio*=.8;
    }
    return {file:source,thumb,...dimensions};
  }finally{bitmap.close();canvas.width=canvas.height=1;}
}
export async function uploadCatboxImage(file,label,{signal,maxThumbData}={}){
  signal?.throwIfAborted();const source=await prepareCatboxImage(file,{maxThumbData});signal?.throwIfAborted();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await source.file.arrayBuffer()))].map(byte=>byte.toString(16).padStart(2,'0')).join(''),cached=cachedUploads().get(hash);
  signal?.throwIfAborted();
  if(cached && cached.width===source.width && cached.height===source.height)return {id:id(),label:label.trim().slice(0,160) || 'Image',data:cached.data,width:source.width,height:source.height,thumb:source.thumb};
  await uploadTurn(signal);
  const form=new FormData();form.set('reqtype','fileupload');form.set('fileToUpload',source.file,'image.'+({ 'image/jpeg':'jpg','image/webp':'webp' }[source.file.type] || 'png'));
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason),timer=setTimeout(()=>controller.abort(new Error('Catbox upload relay timed out. An anonymous upload may remain.')),90000);
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const response=await fetch(CATBOX_UPLOAD,{method:'POST',body:form,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',mode:'cors'});
    if(response.redirected){await response.body?.cancel().catch(()=>{});throw new Error('The upload service unexpectedly redirected the request.');}
    if(Number(response.headers.get('content-length'))>2048){await response.body?.cancel().catch(()=>{});throw new Error('Invalid Catbox upload response.');}
    const reader=response.body?.getReader();if(!reader)throw new Error('Empty Catbox upload response.');const chunks=[];let size=0;
    try{while(true){controller.signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048)throw new Error('Invalid Catbox upload response.');chunks.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}
    controller.signal.throwIfAborted();const text=(await new Blob(chunks).text()).trim();
    if(!response.ok){let message=`Catbox upload relay request failed (${response.status}). Wait before retrying, or choose Local storage.`;try{const problem=JSON.parse(text);if(WORKER_ERRORS.has(problem.code) && typeof problem.error==='string' && problem.error.length<=300)message=problem.error;}catch{}throw new Error(message);}
    const data=catboxImageUrl(text);
    rememberUpload(hash,data,source);signal?.throwIfAborted();
    return {id:id(),label:label.trim().slice(0,160) || 'Image',data,width:source.width,height:source.height,thumb:source.thumb};
  }catch(error){
    if(signal?.aborted)throw error;
    let problem=controller.signal.aborted?controller.signal.reason:error;
    if(error instanceof TypeError || error.name==='NetworkError')problem=new Error('The Catbox upload relay is unavailable, rate limited or blocked by the browser. Wait before retrying, or choose Local storage.');
    problem.pauseBatch=true;throw problem;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
