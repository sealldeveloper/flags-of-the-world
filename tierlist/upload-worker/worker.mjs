import {catboxImageUrl,rasterHeader,MAX_REMOTE_BYTES} from '../image-policy.mjs';

const UPSTREAM='https://catbox.moe/user/api.php';
const MAX_BODY=MAX_REMOTE_BYTES+65536,MAX_REPLY=2048,MAX_HEADER=1024*1024;
class UploadError extends Error {
  constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
function origins(env){
  const values=JSON.parse(env.ALLOWED_ORIGINS || '[]');
  if(!Array.isArray(values) || !values.length || values.some(value=>typeof value!=='string' || new URL(value).origin!==value))throw new Error('Invalid origin configuration');
  return new Set(values);
}
function reply(origin,status,body,{json=true,retry=false}={}){
  const headers=new Headers({'Content-Type':json?'application/json; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'});
  if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Expose-Headers','Retry-After');}
  if(retry)headers.set('Retry-After','60');
  return new Response(json?JSON.stringify(body):body,{status,headers});
}
async function multipart(request){
  if(Number(request.headers.get('content-length'))>MAX_BODY)throw new UploadError(413,'upload_too_large','Upload exceeds the 25 MiB image limit.');
  const type=request.headers.get('content-type') || '';
  if(type.length>256 || !/^multipart\/form-data\s*;\s*boundary=(?:"[^"\r\n]{1,200}"|[^\s;\r\n]{1,200})\s*$/i.test(type))throw new UploadError(415,'multipart_required','Send a multipart image upload.');
  if(!request.body)throw new UploadError(400,'missing_file','Choose one image to upload.');
  const reader=request.body.getReader();let size=0,failure,controller;
  const stream=new ReadableStream({
    start(value){controller=value;},
    async pull(output){
      try{const {done,value}=await reader.read();if(done){output.close();return;}size+=value.byteLength;if(size>MAX_BODY){failure=new UploadError(413,'upload_too_large','Upload exceeds the 25 MiB image limit.');output.error(failure);await reader.cancel().catch(()=>{});return;}output.enqueue(value);}
      catch(error){failure ||= error;output.error(error);}
    },
    cancel(reason){return reader.cancel(reason);}
  });
  const timer=setTimeout(()=>{failure=new UploadError(408,'upload_timeout','The image upload took too long.');controller.error(failure);reader.cancel().catch(()=>{});},45000);
  try{return await new Response(stream,{headers:{'Content-Type':type}}).formData();}
  catch{throw failure instanceof UploadError?failure:new UploadError(400,'invalid_multipart','The image upload could not be read.');}
  finally{clearTimeout(timer);}
}
async function smallText(response,signal){
  if(Number(response.headers.get('content-length'))>MAX_REPLY){await response.body?.cancel().catch(()=>{});throw new UploadError(502,'invalid_catbox_reply','Catbox returned an invalid upload response.');}
  const reader=response.body?.getReader();if(!reader)throw new UploadError(502,'empty_catbox_reply','Catbox returned an empty upload response.');
  const parts=[];let size=0;
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_REPLY)throw new UploadError(502,'invalid_catbox_reply','Catbox returned an invalid upload response.');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  return (await new Blob(parts).text()).trim();
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),incoming=request.headers.get('Origin');let allowed;
    try{allowed=origins(env);}catch{return reply(null,503,{error:'Upload service is not configured.',code:'service_unavailable'});}
    const origin=allowed.has(incoming)?incoming:null;
    if(url.pathname==='/health' && !url.search && request.method==='GET')return reply(origin,200,{ok:true,service:'tierlist-catbox-upload'});
    if(url.pathname!=='/upload' || url.search)return reply(origin,404,{error:'Not found.',code:'not_found'});
    if(!origin)return reply(null,403,{error:'This website is not allowed to upload.',code:'origin_not_allowed'});
    if(request.method==='OPTIONS'){
      const method=request.headers.get('Access-Control-Request-Method'),headers=(request.headers.get('Access-Control-Request-Headers') || '').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
      if(method!=='POST' || headers.some(value=>value!=='content-type'))return reply(origin,403,{error:'This upload request is not allowed.',code:'preflight_not_allowed'});
      return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers','Cache-Control':'no-store'}});
    }
    if(request.method!=='POST'){const response=reply(origin,405,{error:'Use POST to upload an image.',code:'method_not_allowed'});response.headers.set('Allow','POST, OPTIONS');return response;}
    try{
      if(!env.UPLOAD_RATE?.limit)throw new UploadError(503,'service_unavailable','Upload protection is not configured.');
      const {success}=await env.UPLOAD_RATE.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'});
      if(!success)return reply(origin,429,{error:'Too many uploads. Wait before retrying.',code:'upload_rate_limited'},{retry:true});
      const form=await multipart(request),entries=[...form.entries()],file=form.get('fileToUpload');
      if(entries.length!==2 || form.get('reqtype')!=='fileupload' || entries.some(([key])=>!['reqtype','fileToUpload'].includes(key)) || !file || typeof file==='string')throw new UploadError(400,'fileupload_only','Only anonymous image-file uploads are allowed.');
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new UploadError(415,'unsupported_image','Use a static PNG, JPEG or WebP image.');
      if(!file.size || file.size>MAX_REMOTE_BYTES)throw new UploadError(413,'upload_too_large','Use one image up to 25 MiB.');
      try{rasterHeader(new Uint8Array(await file.slice(0,MAX_HEADER).arrayBuffer()),file.type);}catch{throw new UploadError(422,'invalid_image','The image header or dimensions are not supported.');}
      const body=new FormData();body.set('reqtype','fileupload');body.set('fileToUpload',file,'image.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type]));
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try{
        // Fresh headers and a fixed target. Never forward browser cookies, credentials, Origin, or arbitrary URLs.
        // Workers uses manual redirects. The runtime does not implement redirect:error.
        const response=await fetch(UPSTREAM,{method:'POST',body,headers:{Accept:'text/plain','User-Agent':'TierList-Catbox-Upload/1.0 (+https://puzzle.seall.dev/tierlist/)'},redirect:'manual',signal:controller.signal});
        if(response.status>=300 && response.status<400){await response.body?.cancel().catch(()=>{});throw new UploadError(502,'catbox_redirect','Catbox unexpectedly redirected the upload.');}
        const text=await smallText(response,controller.signal);
        if(!response.ok){
          if(response.status===429)return reply(origin,429,{error:'Catbox is rate limiting uploads. Wait before retrying.',code:'catbox_rate_limited'},{retry:true});
          const message=text==='Invalid uploader'?'Catbox rejected uploads from this Worker network.':'Catbox refused the image upload.';
          return reply(origin,502,{error:message,code:'catbox_refused',upstreamStatus:response.status});
        }
        let image;try{image=catboxImageUrl(text);}catch{throw new UploadError(502,'invalid_catbox_reply','Catbox did not return an approved image URL.');}
        return reply(origin,200,image,{json:false});
      }finally{clearTimeout(timer);}
    }catch(error){return reply(origin,error instanceof UploadError?error.status:502,{error:error instanceof UploadError?error.message:'The upload service could not reach Catbox. An interrupted upload may remain.',code:error instanceof UploadError?error.code:'catbox_unreachable'});}
  }
};
