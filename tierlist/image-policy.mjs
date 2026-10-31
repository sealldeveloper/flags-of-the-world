// Peer-controlled image links never become native network-backed image sources.
export const MAX_REMOTE_EDGE=8192,MAX_REMOTE_PIXELS=24000000,MAX_REMOTE_BYTES=25*1024*1024;
export function imgurImageUrl(value){
  if(typeof value!=='string' || value!==value.trim() || !/^https:\/\/i\.imgur\.com\/[A-Za-z0-9]{5,16}\.(?:png|jpe?g|webp)$/.test(value))throw new Error('Remote images must use a direct HTTPS i.imgur.com image URL.');
  return value;
}
export function catboxImageUrl(value){
  if(typeof value!=='string' || value!==value.trim() || !/^https:\/\/files\.catbox\.moe\/[a-z0-9]{6,16}\.(?:png|jpe?g|webp)$/.test(value))throw new Error('Remote images must use a direct HTTPS files.catbox.moe image URL.');
  return value;
}
export function remoteImageUrl(value){
  if(typeof value==='string' && value.startsWith('https://i.imgur.com/'))return imgurImageUrl(value);
  return catboxImageUrl(value);
}
export const remotePreviewUrl=value=>remoteImageUrl(value).startsWith('https://i.imgur.com/')?imgurPreviewUrl(value):value;
export const isRemoteImage=image=>typeof image?.data==='string' && !image.data.startsWith('data:');
export const imgurPreviewUrl=value=>imgurImageUrl(value).replace(/\.(png|jpe?g|webp)$/,'m.$1');
export function remoteDimensions(value){
  const {width,height}=value;
  if(!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || Math.max(width,height)>MAX_REMOTE_EDGE || width*height>MAX_REMOTE_PIXELS)throw new Error('Remote images exceed the 8,192 pixel edge or 24 million pixel limit.');
  return {width,height};
}
export function rasterHeader(bytes,mime){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),word=(at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));let width,height;
  if(mime==='image/png' && bytes.length>=33 && word(0,8)==='\x89PNG\r\n\x1a\n' && word(12,4)==='IHDR'){
    width=view.getUint32(16);height=view.getUint32(20);
    for(let at=8;at+12<=bytes.length;){const length=view.getUint32(at);if(word(at+4,4)==='acTL')throw new Error('Animated remote images are not supported.');if(length>bytes.length-at-12)break;at+=length+12;}
  }else if(mime==='image/webp' && bytes.length>=30 && word(0,4)==='RIFF' && word(8,4)==='WEBP'){
    const type=word(12,4);
    if(type==='VP8 ' && word(23,3)==='\x9d\x01\x2a'){width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff;}
    else if(type==='VP8L' && bytes[20]===0x2f){const bits=view.getUint32(21,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
    else if(type==='VP8X'){if(bytes[20]&2)throw new Error('Animated remote images are not supported.');width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
  }else if(mime==='image/jpeg' && bytes[0]===255 && bytes[1]===216){
    for(let at=2;at+3<bytes.length;){if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217 || marker===218)break;if(marker===1 || (marker>=208 && marker<=215))continue;if(at+2>bytes.length)break;const length=view.getUint16(at);if(length<2 || at+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length>=8){height=view.getUint16(at+3);width=view.getUint16(at+5);break;}at+=length;}
  }
  if(!width || !height)throw new Error('Expected a static PNG, JPEG or WebP image.');
  return remoteDimensions({width,height});
}
