import encode from './vendor/webp/encode.js';
self.onmessage=async({data:{id,bitmap,requireOpaque}})=>{
 let canvas;
 try{
  canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);bitmap.close();
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  if(requireOpaque)for(let at=3;at<pixels.data.length;at+=4)if(pixels.data[at]!==255)throw new Error('Retain the original PNG to preserve transparent pixels.');
  const bytes=await encode(pixels,{lossless:1,near_lossless:100,exact:1,quality:100,alpha_quality:100,method:4,low_memory:1,thread_level:0});
  self.postMessage({id,bytes},[bytes]);
 }catch{bitmap?.close();self.postMessage({id,error:'Lossless WebP encoding is unavailable.'});}
 finally{if(canvas)canvas.width=canvas.height=1;}
};
