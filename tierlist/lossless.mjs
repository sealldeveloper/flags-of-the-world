let worker,active,serial=0,idle;const queue=[];
function pump(){
 if(active||!queue.length)return;clearTimeout(idle);active=queue.shift();
 try{
  if(!worker){worker=new Worker(new URL('./lossless-worker.mjs',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(!active||data.id!==active.id)return;const task=active;active=null;clearTimeout(task.timer);if(data.error)task.reject(new Error(data.error));else task.resolve(new Blob([data.bytes],{type:'image/webp'}));if(queue.length)pump();else idle=setTimeout(()=>{worker?.terminate();worker=null;},10000);};worker.onerror=()=>{worker?.terminate();worker=null;const task=active;active=null;clearTimeout(task?.timer);task?.reject(new Error('Lossless image encoder failed.'));pump();};}
  active.timer=setTimeout(()=>{worker?.terminate();worker=null;const task=active;active=null;task?.reject(new Error('Lossless image encoding timed out.'));pump();},90000);
  worker.postMessage({id:active.id,bitmap:active.bitmap,requireOpaque:active.requireOpaque},[active.bitmap]);
 }catch(error){const task=active;active=null;clearTimeout(task?.timer);task.bitmap?.close();task.reject(error);pump();}
}
export async function encodeLossless(bitmap,{requireOpaque=false}={}){
 if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')throw new Error('Background image encoding is unavailable.');
 const copy=await createImageBitmap(bitmap);return new Promise((resolve,reject)=>{queue.push({id:++serial,bitmap:copy,requireOpaque,resolve,reject});pump();});
}
