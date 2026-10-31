import {remoteImageUrl,remotePreviewUrl,isRemoteImage,rasterHeader,MAX_REMOTE_BYTES} from './image-policy.mjs';
import {imageDimensions,MAX_THUMB_EDGE} from './model.mjs';
const KEY='tierlist-remote-images-allowed-v2',granted=new Set(),cache=new Map();let prompt,queue=Promise.resolve(),cacheBytes=0;
export const PLACEHOLDER='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%2364748b"/%3E%3C/svg%3E';
export function setRemoteConsentPrompt(handler){prompt=handler;}
export function remembersRemoteConsent(){try{return localStorage.getItem(KEY)==='1';}catch{return false;}}
export function resetRemoteConsent(){try{localStorage.removeItem(KEY);}catch{}}
export function mayLoadRemote(url){remoteImageUrl(url);return remembersRemoteConsent() || granted.has(url);}
export async function authorizeRemote(images,{signal,force=false}={}){
  const urls=[...new Set(images.filter(isRemoteImage).map(image=>remoteImageUrl(image.data)))];if(!urls.length)return;
  signal?.throwIfAborted();if(remembersRemoteConsent() || (!force && urls.every(url=>granted.has(url))))return;
  const task=queue.catch(()=>{}).then(async()=>{
    signal?.throwIfAborted();if(remembersRemoteConsent())return;
    if(!prompt)throw new Error('Remote image downloads require permission.');
    const answer=await prompt({count:urls.length,hosts:[...new Set(urls.map(url=>new URL(url).hostname))],signal});signal?.throwIfAborted();
    if(!answer?.allow)throw new Error('Remote image downloads were declined.');
    for(const url of urls)granted.add(url);
    if(answer.remember)try{localStorage.setItem(KEY,'1');}catch{}
  });queue=task;return task;
}
export async function boundedImageResponse(response,max,signal){
  if(!response.ok || response.redirected)throw new Error('The image request failed or was redirected.');
  const declared=Number(response.headers.get('content-length'));if(declared>max){await response.body?.cancel().catch(()=>{});throw new Error('Image exceeds the download limit.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty image response.');const chunks=[];let length=0;
  try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max)throw new Error('Image exceeds the download limit.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(length);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
  return {bytes,mime:(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()};
}
export async function fetchRemoteBlob(image,{preview=false,signal}={}){
  const full=remoteImageUrl(image.data);if(!mayLoadRemote(full))throw new Error('Remote image downloads require permission.');
  signal?.throwIfAborted();
  if(preview && image.thumb){imageDimensions(image.thumb,MAX_THUMB_EDGE);return (await fetch(image.thumb,{signal})).blob();}
  const thumbnail=preview && full.startsWith('https://i.imgur.com/'),url=preview?remotePreviewUrl(full):full,key=(thumbnail?'preview:':'full:')+url;
  signal?.throwIfAborted();
  if(cache.has(key)){const result=cache.get(key);if(!thumbnail && (result.width!==image.width || result.height!==image.height))throw new Error('The remote image dimensions have changed.');cache.delete(key);cache.set(key,result);return result.blob;}
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason),timer=setTimeout(()=>controller.abort(new Error('Remote image download timed out.')),25000);
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const response=await fetch(url,{signal:controller.signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',mode:'cors'}),{bytes,mime}=await boundedImageResponse(response,thumbnail?2*1024*1024:MAX_REMOTE_BYTES,controller.signal),dimensions=rasterHeader(bytes,mime);
    if(thumbnail && Math.max(dimensions.width,dimensions.height)>640)throw new Error('The image host returned an oversized thumbnail.');
    if(!thumbnail && (dimensions.width!==image.width || dimensions.height!==image.height))throw new Error('The remote image dimensions have changed.');
    const blob=new Blob([bytes],{type:mime}),bitmap=await createImageBitmap(blob);
    try{if(bitmap.width!==dimensions.width || bitmap.height!==dimensions.height)throw new Error('Invalid image dimensions.');}finally{bitmap.close();}
    controller.signal.throwIfAborted();
    // Cache bytes only. Native image elements receive short-lived blob URLs, never remote URLs.
    while(cacheBytes+blob.size>64*1024*1024 && cache.size){const first=cache.keys().next().value;cacheBytes-=cache.get(first).blob.size;cache.delete(first);}
    if(cache.has(key))cacheBytes-=cache.get(key).blob.size;cache.set(key,{blob,...dimensions});cacheBytes+=blob.size;return blob;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
let observer,cleanupObserver;const observed=new Set();
export function setImageSource(node,image){
  node.referrerPolicy='no-referrer';node.loading='lazy';
  if(!isRemoteImage(image)){node.src=image.thumb || image.data;return;}
  remoteImageUrl(image.data);node.src=image.thumb || PLACEHOLDER;
  if(image.thumb || !mayLoadRemote(image.data))return;
  const load=async()=>{
    try{const blob=await fetchRemoteBlob(image,{preview:true});if(!node.isConnected)return;const url=URL.createObjectURL(blob);node.src=url;node.decode().catch(()=>{}).finally(()=>URL.revokeObjectURL(url));}
    catch{node.title='Remote image unavailable';node.dataset.imageError='true';}
  };
  if(typeof IntersectionObserver==='undefined'){queueMicrotask(load);return;}
  observer ||= new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);observed.delete(entry.target);const action=entry.target.remoteImageLoad;delete entry.target.remoteImageLoad;action?.();}},{rootMargin:'300px'});
  if(!cleanupObserver){cleanupObserver=new MutationObserver(records=>{if(records.some(record=>record.removedNodes.length))for(const element of observed)if(!element.isConnected){observer.unobserve(element);observed.delete(element);delete element.remoteImageLoad;}});cleanupObserver.observe(document.body,{childList:true,subtree:true});}
  node.remoteImageLoad=load;observed.add(node);observer.observe(node);
}
