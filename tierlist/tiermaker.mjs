import {emptyAlbum,id,validateAlbum,MAX_DOCUMENT} from './model.mjs';
import {compressImage,compressCover} from './codec.mjs';
import {ImgurUpload,imgurClientId} from './imgur.mjs';
import {uploadCatboxImage} from './catbox.mjs';
export const TIERMAKER_READ='https://puzzle-tierlist-tiermaker.my-account-306.workers.dev';
export function tiermakerHelperUrl(path,url,origin=globalThis.location?.origin){
  if(!['/tierlist-import','/tierlist-image'].includes(path))throw new Error('Invalid TierMaker helper route.');
  return `${origin==='https://puzzle.seall.dev'?TIERMAKER_READ:''}${path}?url=${encodeURIComponent(url)}`;
}
export function tiermakerUrl(value) {
  if(typeof value!=='string' || value.length>2048)throw new Error('TierMaker URLs must be at most 2,048 characters.');
  let url;
  try {url=new URL(value.trim());} catch {throw new Error('Enter a TierMaker URL.');}
  if(url.protocol!=='https:' || !['tiermaker.com','www.tiermaker.com'].includes(url.hostname) || url.username || url.password || (url.port && url.port!=='443') || !/^\/(create|categories|list)\//.test(url.pathname))throw new Error('Use an HTTPS tiermaker.com template or tier list URL.');
  url.hostname='tiermaker.com';url.search='';url.hash='';return url.href;
}
export function tiermakerUrls(value) {
  if(typeof value!=='string' || value.length>32768)throw new Error('The URL list is too long.');
  const lines=value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);if(!lines.length)throw new Error('Enter at least one TierMaker URL.');
  return [...new Set(lines.map((line,index)=>{try{return tiermakerUrl(line);}catch(error){throw new Error(`URL ${index+1}: ${error.message}`);}}))];
}
export function tiermakerImageUrl(value,cover=false) {
  if(typeof value!=='string' || value.length>2048)throw new Error('Invalid TierMaker image URL.');
  let url;try{url=new URL(value);}catch{throw new Error('Invalid TierMaker image URL.');}
  const path=cover?/^\/(images\/(chart|templates|media\/(template_images|hero_images))|media\/(template_images|hero_images))\//:/^\/(images\/(chart|templates|media\/template_images)|media\/template_images)\//;
  if(url.origin!=='https://tiermaker.com' || url.username || url.password || url.search || url.hash || !path.test(url.pathname))throw new Error('Invalid TierMaker image URL.');
  return url.href;
}
async function boundedResponse(response,max,signal) {
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {
    while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('TierMaker response is too large.');chunks.push(value);}
  } catch(error){await reader.cancel().catch(()=>{});throw error;}
  return new Blob(chunks,{type:response.headers.get('content-type') || ''});
}
async function request(path,url,signal) {
  const response=await fetch(tiermakerHelperUrl(path,url),{signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',mode:'cors'});
  if(response.redirected)throw new Error('The TierMaker import service unexpectedly redirected the request.');
  if(!response.ok){
    let message='TierMaker import failed.';
    try{const problem=JSON.parse(await(await boundedResponse(response,2048,signal)).text());if(typeof problem.error==='string' && problem.error.length<=300)message=problem.error;}catch{if(response.status===404)message='URL import is not enabled on this host.';}
    throw new Error(message);
  }
  return response;
}
export async function importTiermaker(value,{signal,onProgress=()=>{},storage='local',clientId='',onUpload=()=>{},onWarning=()=>{}}={}) {
  if(!['local','catbox','imgur'].includes(storage))throw new Error('Invalid image storage option.');if(storage==='imgur')imgurClientId(clientId);
  const source=tiermakerUrl(value),controller=new AbortController(),abort=()=>controller.abort(signal.reason);
  if(signal?.aborted)signal.throwIfAborted();signal?.addEventListener('abort',abort,{once:true});
  const active=controller.signal;let upload,firstError,finished=0,total=0,uploadAttempted=false;
  try {
    onProgress('Loading template…');
    const response=await request('/tierlist-import',source,active),blob=await boundedResponse(response,2*1024*1024,active),manifest=JSON.parse(await blob.text());
    if(typeof manifest.name!=='string' || !Array.isArray(manifest.images) || !manifest.images.length || !Array.isArray(manifest.tiers))throw new Error('Unsupported TierMaker template.');
    const sources=manifest.images.map(entry=>tiermakerImageUrl(entry?.url)),coverUrl=manifest.cover===undefined?null:tiermakerImageUrl(manifest.cover,true);
    const album=emptyAlbum();album.name=manifest.name.slice(0,120);album.description=`${source}\n${manifest.description || ''}`.slice(0,1000);total=manifest.images.length;
    if(coverUrl){
      onProgress('Copying cover…');
      try{const response=await request('/tierlist-image',coverUrl,active),blob=await boundedResponse(response,10*1024*1024,active);album.cover=await compressCover(new File([blob],'cover',{type:blob.type.split(';')[0]}));}
      catch(error){active.throwIfAborted();onWarning('The TierMaker cover could not be copied. Choose a cover in Images.');}
    }
    if(storage==='imgur'){onProgress('Creating unlisted Imgur album…');upload=await ImgurUpload.create(clientId,album.name,{signal:active});}
    const available=MAX_DOCUMENT-65536-(album.cover?.length || 0),images=new Array(total),mapping=new Map(),imageBudget=Math.max(512,Math.floor(available/total)-512);let cursor=0,bytes=0;
    const workers=await Promise.allSettled(Array.from({length:Math.min(storage==='catbox'?1:3,images.length)},async()=>{try{
      while(cursor<images.length){
        active.throwIfAborted();const index=cursor++,entry=manifest.images[index];
        const response=await request('/tierlist-image',sources[index],active),blob=await boundedResponse(response,10*1024*1024,active);
        const type=blob.type.split(';')[0],file=new File([blob],`image-${index+1}.${type.split('/')[1]}`,{type}),label=typeof entry.label==='string' && entry.label.trim()?entry.label.trim().slice(0,160):`Image ${index+1}`;
        if(storage==='catbox')uploadAttempted=true;
        const image=upload?await upload.add(file,label,{signal:active}):storage==='catbox'?await uploadCatboxImage(file,label,{signal:active,maxThumbData:imageBudget}):await compressImage(file,{maxData:imageBudget});active.throwIfAborted();
        image.id=`i${index.toString(36)}`;
        image.label=typeof entry.label==='string' && entry.label.trim()?entry.label.trim().slice(0,160):`Image ${index+1}`;
        bytes+=new TextEncoder().encode(JSON.stringify(image)).length;if(bytes>available)throw new Error('Tierlist exceeds the 16 MiB limit.');
        images[index]=image;const key=String(entry.id);if(mapping.has(key))throw new Error('Duplicate TierMaker image.');mapping.set(key,image.id);
        onProgress(`${upload || storage==='catbox'?'Uploading images…':'Importing images…'} ${++finished}/${images.length}`);
      }
    }catch(error){firstError ||= error;controller.abort();throw error;}}));
    const failed=workers.find(result=>result.status==='rejected');if(failed)throw firstError || failed.reason;
    album.images=images;
    if(manifest.tiers.length)album.board.tiers=manifest.tiers.map(row=>({id:id(),name:row.name,color:row.color,items:row.items.map(item=>mapping.get(String(item)))}));
    const ranked=new Set(album.board.tiers.flatMap(row=>row.items));album.board.unranked=images.map(image=>image.id).filter(key=>!ranked.has(key));
    active.throwIfAborted();const result=validateAlbum(album);if(upload){await upload.commit(active);active.throwIfAborted();onUpload(upload);}return result;
  } catch(error){controller.abort();if(upload){onProgress('Removing incomplete Imgur uploads…');try{await upload.rollback();}catch(cleanup){throw new Error(`${error.message} ${cleanup.message}`);}}if(storage==='catbox' && uploadAttempted && !signal?.aborted)throw Object.assign(new Error(`${error.message} ${finished} of ${total} images completed. Retry reuses completed uploads. An interrupted anonymous upload may still remain on Catbox.`),{pauseBatch:error.pauseBatch});throw error;}
  finally{signal?.removeEventListener('abort',abort);}
}
