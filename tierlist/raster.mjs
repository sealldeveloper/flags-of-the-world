export const MAX_IMAGE_BYTES=25*1024*1024,MAX_RASTER_EDGE=8192,MAX_RASTER_PIXELS=24000000;
export function rasterDimensions({width,height},maxEdge=MAX_RASTER_EDGE){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||Math.max(width,height)>maxEdge||width*height>MAX_RASTER_PIXELS)throw new Error(`Images must fit within ${maxEdge} pixels per edge and 24 million pixels.`);return{width,height};
}
function exifOrientation(bytes){
 if(bytes.length<14||String.fromCharCode(...bytes.subarray(0,6))!=='Exif\0\0')return null;
 const little=bytes[6]===73&&bytes[7]===73;if(!little&&!(bytes[6]===77&&bytes[7]===77))return null;const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint16(8,little)!==42)return null;const at=6+v.getUint32(10,little);if(at<14||at+2>bytes.length)return null;const count=v.getUint16(at,little);
 for(let i=0;i<Math.min(count,256);i++){const entry=at+2+i*12;if(entry+12>bytes.length)break;if(v.getUint16(entry,little)===274&&v.getUint16(entry+2,little)===3&&v.getUint32(entry+4,little)===1){const value=v.getUint16(entry+8,little);return value>=1&&value<=8?value:null;}}
 return null;
}
// Read only container headers, skipping pixel/metadata blocks without decoding an entire base64 image on the UI thread.
export function rasterHeaderAt(read,length,mime,maxEdge=MAX_RASTER_EDGE){
 const head=read(0,Math.min(33,length)),word=(bytes,at,n)=>String.fromCharCode(...bytes.subarray(at,at+n)),view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width,height;
 if(mime==='image/png'&&length>=33&&word(head,0,8)==='\x89PNG\r\n\x1a\n'&&word(head,12,4)==='IHDR'){
  width=view(head).getUint32(16);height=view(head).getUint32(20);rasterDimensions({width,height},maxEdge);
  let count=0;for(let at=8;at+12<=length;){if(++count>4096)throw new Error('Image container has too many chunks.');const chunk=read(at,8),size=view(chunk).getUint32(0),type=word(chunk,4,4);if(type==='acTL')throw new Error('Embedded images must be static.');if(size>length-at-12)break;if(type==='IEND')break;at+=size+12;}
 }else if(mime==='image/webp'&&length>=30&&word(head,0,4)==='RIFF'&&word(head,8,4)==='WEBP'){
  const type=word(head,12,4),v=view(head);
  if(type==='VP8 '&&word(head,23,3)==='\x9d\x01\x2a'){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff;}
  else if(type==='VP8L'&&head[20]===0x2f){const bits=v.getUint32(21,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
  else if(type==='VP8X'){width=1+head[24]+(head[25]<<8)+(head[26]<<16);height=1+head[27]+(head[28]<<8)+(head[29]<<16);rasterDimensions({width,height},maxEdge);if(head[20]&2)throw new Error('Embedded images must be static.');}
 }else if(mime==='image/jpeg'&&head[0]===255&&head[1]===216){
  let count=0,orientation=null;for(let at=2;at+3<length;){if(++count>4096)throw new Error('Image container has too many segments.');let chunk=read(at,2);if(chunk[0]!==255)break;at++;let fill=0;while(read(at,1)[0]===255){if(++fill>32)throw new Error('Invalid JPEG marker.');at++;}const marker=read(at++,1)[0];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;if(at+2>length)break;chunk=read(at,Math.min(8,length-at));const size=view(chunk).getUint16(0);if(size<2||at+size>length)break;if(marker===225&&orientation===null)orientation=exifOrientation(read(at+2,size-2));if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8){height=view(chunk).getUint16(3);width=view(chunk).getUint16(5);}at+=size;}
  if(orientation>=5)[width,height]=[height,width];
 }
 if(!width||!height)throw new Error('Expected an embedded static PNG, JPEG or WebP image.');return rasterDimensions({width,height},maxEdge);
}
export const rasterHeader=(bytes,mime,maxEdge=MAX_RASTER_EDGE)=>rasterHeaderAt((at,count)=>bytes.subarray(at,at+count),bytes.byteLength,mime,maxEdge);
