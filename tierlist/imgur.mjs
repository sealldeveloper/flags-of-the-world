import {id} from './model.mjs';
import {imgurImageUrl,remoteDimensions,rasterHeader,MAX_REMOTE_BYTES} from './image-policy.mjs';
const RECEIPTS='tierlist-imgur-uploads',CLIENT='tierlist-imgur-client-id';
export function imgurClientId(value){if(typeof value!=='string' || !/^[A-Za-z0-9]{10,64}$/.test(value.trim()))throw new Error('Enter a registered Imgur Client ID. Do not enter a client secret.');return value.trim();}
export function rememberedImgurClient(){try{return localStorage.getItem(CLIENT) || '';}catch{return '';}}
export function rememberImgurClient(value){try{localStorage.setItem(CLIENT,imgurClientId(value));}catch{}}
export function listImgurUploads(){try{return JSON.parse(localStorage.getItem(RECEIPTS) || '[]');}catch{throw new Error('Could not read your Imgur upload receipts.');}}
function receipt(value,remove=false){const records=listImgurUploads().filter(row=>row.localId!==value.localId);if(!remove)records.push(value);try{localStorage.setItem(RECEIPTS,JSON.stringify(records));}catch{throw new Error('Could not keep the private Imgur deletion keys in this browser.');}}
const opaque=value=>typeof value==='string' && /^[A-Za-z0-9]{5,128}$/.test(value);
async function api(client,path,{method='GET',body,signal}={}){
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal?.throwIfAborted();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(),25000);
  try{
    const response=await fetch('https://api.imgur.com/3/'+path,{method,body,signal:controller.signal,headers:{Authorization:'Client-ID '+imgurClientId(client)},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',mode:'cors'});
    if(method==='DELETE' && [204,404].includes(response.status))return true;
    if(!response.ok || response.redirected)throw new Error(`Imgur request failed (${response.status}).`);
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error('Imgur response is too large.');parts.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
    const result=JSON.parse(await new Blob(parts).text());if(result.success!==true)throw new Error('Imgur did not accept the request.');return result.data;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function originalUpload(file){
  if(!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type) || file.size>MAX_REMOTE_BYTES)throw new Error('Use an image file up to 25 MiB.');
  const bitmap=await createImageBitmap(file);
  try{
    const dimensions=remoteDimensions(bitmap);let original=false;
    if(['image/png','image/jpeg'].includes(file.type))try{rasterHeader(new Uint8Array(await file.arrayBuffer()),file.type);original=true;}catch{}
    if(original)return {file,...dimensions};
    // Preserve resolution and decoded pixels for formats Imgur cannot accept directly.
    const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
    try{canvas.getContext('2d').drawImage(bitmap,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob || blob.size>MAX_REMOTE_BYTES)throw new Error('The full-resolution PNG exceeds 25 MiB.');return {file:new File([blob],'image.png',{type:'image/png'}),...dimensions};}
    finally{canvas.width=canvas.height=1;}
  }finally{bitmap.close();}
}
export class ImgurUpload {
  static async create(client,title,{signal}={}){
    client=imgurClientId(client);const form=new FormData();form.set('privacy','hidden');form.set('title',title.slice(0,120));
    signal?.throwIfAborted();const data=await api(client,'album',{method:'POST',body:form});
    if(!opaque(data?.id) || !opaque(data?.deletehash))throw new Error('Imgur returned an invalid album receipt.');
    const session=new ImgurUpload({localId:id(),albumId:data.id,albumDeleteHash:data.deletehash,images:[],title,clientId:client,created:Date.now(),complete:false});
    try{receipt(session.record);await session.verify(signal);return session;}catch(error){await session.rollback().catch(()=>{});throw error;}
  }
  constructor(record){this.record=record;}
  async verify(signal){const data=await api(this.record.clientId,'album/'+this.record.albumId,{signal});if(data.id!==this.record.albumId || data.in_gallery!==false || !['hidden','secret'].includes(data.privacy))throw new Error('Imgur did not confirm that the album is unlisted.');}
  async add(file,label,{signal}={}){
    signal?.throwIfAborted();const source=await originalUpload(file);signal?.throwIfAborted();const form=new FormData();form.set('image',source.file);form.set('type','file');form.set('album',this.record.albumDeleteHash);form.set('title',label.slice(0,160));
    // Finish in-flight writes even after cancellation to retain their deletion keys.
    const data=await api(this.record.clientId,'image',{method:'POST',body:form});
    // Save the deletion key before validating the public fields, so failures can roll back.
    if(!opaque(data?.id) || !opaque(data?.deletehash))throw new Error('Imgur returned an invalid image receipt.');
    this.record.images.push({id:data.id,deleteHash:data.deletehash});receipt(this.record);
    signal?.throwIfAborted();if(data.in_gallery!==false)throw new Error('Imgur did not confirm an unlisted image.');
    const url=imgurImageUrl(data.link),dimensions=remoteDimensions(data);if(!url.startsWith('https://i.imgur.com/'+data.id+'.'))throw new Error('Imgur returned an unexpected image URL.');
    return {id:id(),label:label.trim().slice(0,160) || 'Image',data:url,...dimensions};
  }
  async commit(signal){await this.verify(signal);this.record.complete=true;receipt(this.record);}
  async rollback(){this.record.complete=false;return deleteImgurUpload(this.record);}
}
export async function deleteImgurUpload(record){
  const remaining=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,record.images.length)},async()=>{while(cursor<record.images.length){const image=record.images[cursor++];if(!opaque(image.deleteHash)){remaining.push(image);continue;}try{await api(record.clientId,'image/'+image.deleteHash,{method:'DELETE'});}catch{remaining.push(image);}}}));
  record.images=remaining;
  if(!remaining.length && opaque(record.albumDeleteHash))try{await api(record.clientId,'album/'+record.albumDeleteHash,{method:'DELETE'});receipt(record,true);return;}catch{}
  receipt(record);throw new Error('Some Imgur uploads could not be removed. Retry in Imgur uploads.');
}
