import {validateAlbum,MAX_DOCUMENT,MAX_THUMB_EDGE,MAX_IMAGE_DATA,imageDimensions,coverDimensions,MAX_COVER_DATA,id} from './model.mjs';
import {rasterHeader,rasterDimensions,MAX_IMAGE_BYTES} from './raster.mjs';
export const PREFIX='TIER1.',MAX_CODE=176*1024*1024;
const encoder=new TextEncoder();
async function bounded(stream,max){
 const reader=stream.getReader(),chunks=[];let size=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('Tierlist exceeds the size limit');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function base64(bytes){if(typeof bytes.toBase64==='function')return bytes.toBase64();let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
const url64=bytes=>base64(bytes).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function unbase64(text){text=text.replaceAll('-','+').replaceAll('_','/');return typeof Uint8Array.fromBase64==='function'?Uint8Array.fromBase64(text):Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
export async function encodeAlbum(input){const album=validateAlbum(input),bytes=encoder.encode(JSON.stringify(album));return PREFIX+url64(await bounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),MAX_DOCUMENT));}
export async function decodeAlbum(input){
 if(typeof input!=='string'||input.length>MAX_CODE)throw new Error('Tierlist code is too large');const code=input.trim();
 if(!code.startsWith(PREFIX)||!/^[A-Za-z0-9_-]+$/.test(code.slice(PREFIX.length)))throw new Error('Paste a TIER1 tierlist code, not a lobby invite');
 try{return validateAlbum(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(new Blob([unbase64(code.slice(PREFIX.length))]).stream().pipeThrough(new DecompressionStream('gzip')),MAX_DOCUMENT))));}catch(error){throw new Error(`Cannot import tierlist: ${error.message}`);}
}
export async function verifyImageData(data,{signal}={}){
 signal?.throwIfAborted();const dimensions=imageDimensions(data),blob=await(await fetch(data,{signal})).blob(),bitmap=await createImageBitmap(blob);
 try{if(bitmap.width!==dimensions.width||bitmap.height!==dimensions.height)throw new Error('Embedded image dimensions do not match its decoded pixels.');}finally{bitmap.close();}
 signal?.throwIfAborted();return dimensions;
}
export async function verifyImages(input,options={}){
 const album=validateAlbum(input);for(const image of [...(album.cover?[{label:'Tierlist cover',data:album.cover}]:[]),...album.images])for(const data of[image.data,...(image.thumb?[image.thumb]:[])])await verifyImageData(data,options);return album;
}
function preview(bitmap,limit=16384){
 let ratio=Math.min(1,MAX_THUMB_EDGE/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');
 try{while(true){canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/webp',.82);if(data.length<=limit)return data;if(canvas.width===1&&canvas.height===1)throw new Error('Could not create a small embedded preview.');ratio*=.8;}}finally{canvas.width=canvas.height=1;}
}
async function losslessPng(bitmap){const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;try{canvas.getContext('2d').drawImage(bitmap,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not encode a lossless image.');return blob;}finally{canvas.width=canvas.height=1;}}
function pngCanOptimize(bytes){
 if(bytes[24]>8)return false;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 for(let at=8;at+12<=bytes.length;){const size=view.getUint32(at),type=String.fromCharCode(...bytes.subarray(at+4,at+8));if(['iCCP','gAMA','cHRM','cICP','mDCv','cLLi'].includes(type)||size>bytes.length-at-12)return false;if(type==='IEND')break;at+=size+12;}return true;
}
async function sourceHeader(file){
 if(['image/png','image/jpeg','image/webp'].includes(file.type))try{const bytes=new Uint8Array(await file.arrayBuffer());return{...rasterHeader(bytes,file.type),pngCanOptimize:file.type==='image/png'&&pngCanOptimize(bytes)};}catch(error){if(!/Expected an embedded static|Embedded images must be static/.test(error.message))throw error;}
 if(file.type==='image/gif'||file.type==='image/bmp'){const bytes=new Uint8Array(await file.slice(0,32).arrayBuffer()),v=new DataView(bytes.buffer);if(file.type==='image/gif'&&bytes.length>=10&&String.fromCharCode(...bytes.subarray(0,3))==='GIF')rasterDimensions({width:v.getUint16(6,true),height:v.getUint16(8,true)});if(file.type==='image/bmp'&&bytes.length>=26&&bytes[0]===66&&bytes[1]===77)rasterDimensions(v.getUint32(14,true)===12?{width:v.getUint16(18,true),height:v.getUint16(20,true)}:{width:Math.abs(v.getInt32(18,true)),height:Math.abs(v.getInt32(22,true))});}
 return null;
}
export async function compressCover(file){
 if(!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type)||file.size>MAX_IMAGE_BYTES)throw new Error('Choose an image file up to 25 MiB.');
 await sourceHeader(file);const bitmap=await createImageBitmap(file);try{rasterDimensions(bitmap);const data=preview(bitmap,MAX_COVER_DATA);coverDimensions(data);return data;}finally{bitmap.close();}
}
export async function compressImage(file,{maxData=MAX_IMAGE_DATA}={}){
 if(!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type))throw new Error(`${file.name}: use PNG, JPEG, WebP, GIF, AVIF or BMP`);
 if(!file.size||file.size>MAX_IMAGE_BYTES)throw new Error(`${file.name}: source image exceeds 25 MiB`);
 const header=await sourceHeader(file),bitmap=await createImageBitmap(file);try{
  const dimensions=rasterDimensions(bitmap),thumb=preview(bitmap),budget=Math.max(512,Math.min(MAX_IMAGE_DATA,Math.floor(maxData)));
  const original=header&&header.width===bitmap.width&&header.height===bitmap.height?file:null;
  let source=original;
  if(!original||(file.type==='image/png'&&header.pngCanOptimize)){
   let optimized;try{optimized=await(await import('./lossless.mjs')).encodeLossless(bitmap,{requireOpaque:!!original&&file.type==='image/png'});}catch{}
   if(!optimized&&!original)optimized=await losslessPng(bitmap);
   if(optimized&&(!source||optimized.size<source.size))source=optimized;
  }
  if(!source||source.size>MAX_IMAGE_BYTES)throw new Error('The full-resolution lossless image exceeds 25 MiB. Use a smaller original.');
  const data='data:'+source.type+';base64,'+base64(new Uint8Array(await source.arrayBuffer()));
  if(data.length+thumb.length>budget)throw new Error('The full-resolution image does not fit the tierlist size limit. No resizing was applied.');
  const checked=imageDimensions(data);if(checked.width!==dimensions.width||checked.height!==dimensions.height)throw new Error('Invalid full-resolution image dimensions.');
  return{id:id(),label:(file.name.replace(/\.[^.]+$/,'').trim()||'Image').slice(0,160),data,...dimensions,thumb};
 }finally{bitmap.close();}
}
export async function previewAlbum(input){
 const album=validateAlbum(input),images=[];
 const budget=Math.max(512,Math.min(16384,Math.floor((4*1024*1024-65536)/Math.max(1,album.images.length))-512));
 for(const image of album.images){let data=image.thumb;if(!data||data.length>budget){if(image.width<=MAX_THUMB_EDGE&&image.height<=MAX_THUMB_EDGE&&image.data.length<=budget&&!image.data.startsWith('data:image/jpeg;'))data=image.data;else{const bitmap=await createImageBitmap(await(await fetch(image.thumb||image.data)).blob());try{data=preview(bitmap,budget);}finally{bitmap.close();}}}images.push({id:image.id,label:image.label,data,...imageDimensions(data,MAX_THUMB_EDGE),thumb:data});}
 return validateAlbum({...album,images});
}
export async function encodeAsset(data){imageDimensions(data);return url64(await bounded(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip')),MAX_IMAGE_DATA));}
export async function decodeAsset(code){if(typeof code!=='string'||code.length>MAX_IMAGE_DATA||!/^[A-Za-z0-9_-]+$/.test(code))throw new Error('Invalid original image transfer.');const data=new TextDecoder('utf-8',{fatal:true}).decode(await bounded(new Blob([unbase64(code)]).stream().pipeThrough(new DecompressionStream('gzip')),MAX_IMAGE_DATA));imageDimensions(data);return data;}
export async function assetHash(data){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(data)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
