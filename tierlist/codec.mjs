import {validateAlbum, MAX_DOCUMENT, MAX_IMAGE_EDGE, MAX_THUMB_EDGE, MAX_IMAGE_DATA, imageDimensions, coverDimensions, MAX_COVER_DATA, id} from './model.mjs';
import {isRemoteImage} from './image-policy.mjs';
import {authorizeRemote,fetchRemoteBlob} from './remote-images.mjs';
export const PREFIX = 'TIER1.';
export const MAX_CODE = 24 * 1024 * 1024;
const encoder = new TextEncoder();
async function bounded(stream, max) {
  const reader = stream.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > max) throw new Error('Tierlist exceeds the size limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(()=>{}); throw error; }
  const bytes = new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  return bytes;
}
function base64(bytes) {
  let text = '';
  for (let i=0;i<bytes.length;i+=16384) text += String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(text).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export async function encodeAlbum(input) {
  const album = validateAlbum(input), bytes = encoder.encode(JSON.stringify(album));
  const compressed = await bounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), MAX_DOCUMENT);
  return PREFIX + base64(compressed);
}
export async function decodeAlbum(input) {
  if (typeof input !== 'string' || input.length > MAX_CODE) throw new Error('Tierlist code is too large');
  const code = input.trim();
  if (!code.startsWith(PREFIX) || !/^[A-Za-z0-9_-]+$/.test(code.slice(PREFIX.length))) throw new Error('Paste a TIER1 tierlist code, not a lobby invite');
  try {
    const bytes = Uint8Array.from(atob(code.slice(PREFIX.length).replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0));
    const expanded = await bounded(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_DOCUMENT);
    return validateAlbum(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(expanded)));
  } catch (error) { throw new Error(`Cannot import tierlist: ${error.message}`); }
}
export async function verifyImages(input,options={}) {
  const album=validateAlbum(input);
  await authorizeRemote(album.images,{signal:options.signal,force:options.forceConsent});
  for (const image of [...(album.cover?[{label:'Tierlist cover',data:album.cover}]:[]),...album.images]) {
    options.signal?.throwIfAborted();
    if(isRemoteImage(image))await fetchRemoteBlob(image,{preview:true,signal:options.signal});
    for (const data of [...(!isRemoteImage(image)?[image.data]:[]), ...(image.thumb ? [image.thumb] : [])]) {
      const dimensions=imageDimensions(data), blob=await (await fetch(data)).blob(), bitmap=await createImageBitmap(blob);
      const valid=bitmap.width===dimensions.width && bitmap.height===dimensions.height;
      bitmap.close();
      if (!valid) throw new Error(`Cannot decode image: ${image.label}`);
    }
  }
  return album;
}
export async function compressCover(file) {
  const image=await compressImage(file,{maxData:MAX_COVER_DATA}),data=image.thumb || image.data;
  coverDimensions(data);return data;
}
export async function compressImage(file,{maxData=MAX_IMAGE_DATA}={}) {
  if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type)) throw new Error(`${file.name}: use PNG, JPEG, WebP, GIF, AVIF or BMP`);
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: source image exceeds 25 MiB`);
  const bitmap = await createImageBitmap(file);
  try {
    const budget=Math.max(512,Math.min(MAX_IMAGE_DATA,Math.floor(maxData))),thumbnailBudget=Math.max(256,Math.floor(budget*.2));
    const encode = (edge,limit) => {
      let ratio=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      while (true) {
        canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        const data=canvas.toDataURL('image/webp',.82);
        if (data.length<=limit) return data;
        if(canvas.width===1 && canvas.height===1)throw new Error('Could not compress this image enough.');
        ratio*=.8;
      }
    };
    const data=encode(MAX_IMAGE_EDGE,budget-thumbnailBudget),dimensions=imageDimensions(data);
    return {id:id(),label:(file.name.replace(/\.[^.]+$/,'').trim() || 'Image').slice(0,160),data,...dimensions,
      ...(Math.max(dimensions.width,dimensions.height)>MAX_THUMB_EDGE?{thumb:encode(MAX_THUMB_EDGE,thumbnailBudget)}:{})};
  } finally { bitmap.close(); }
}
