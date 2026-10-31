import{mediaSource,mediaImageUrl,MAX_MEDIA_ITEMS,checkedItems}from'./media-source.mjs';
import{TIERMAKER_READ}from'./tiermaker.mjs';
import{emptyAlbum,validateAlbum,MAX_DOCUMENT}from'./model.mjs';
import{compressImage,compressCover}from'./codec.mjs';
export function mediaHelperUrl(path,value,origin=globalThis.location?.origin,next=null){
 if(!['/media-import','/media-image'].includes(path))throw new Error('Invalid collection import route.');const params=new URLSearchParams({url:value});if(next){params.set('cursor',next.cursor);params.set('version',next.version);}return(origin==='https://puzzle.seall.dev'?TIERMAKER_READ:'')+path+'?'+params;
}
async function responseBlob(response,max,signal){
 if(Number(response.headers.get('Content-Length'))>max){await response.body?.cancel().catch(()=>{});throw new Error('The source exceeds the import size limit.');}const reader=response.body?.getReader();if(!reader)throw new Error('The source returned an empty response.');const chunks=[];let size=0;try{while(true){signal?.throwIfAborted();const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('The source exceeds the import size limit.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}return new Blob(chunks,{type:response.headers.get('Content-Type')||''});
}
async function request(path,value,signal,next){
 const response=await fetch(mediaHelperUrl(path,value,undefined,next),{signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',mode:'cors'});if(response.redirected)throw new Error('The collection reader unexpectedly redirected.');
 if(!response.ok){let message='The collection could not be read.';try{const body=JSON.parse(await(await responseBlob(response,2048,signal)).text());if(typeof body.error==='string'&&body.error.length<=300)message=body.error;}catch{}throw new Error(message);}return responseBlob(response,path==='/media-image'?25*1024*1024:1024*1024,signal);
}
function checkedPage(page,source){
 if(page?.kind!==source.kind||page.source!==source.url||page.id!==source.id||!Array.isArray(page.items))throw new Error('The source returned no public items or unsupported metadata.');checkedItems(page.items);
 return page.items.map(item=>{if(typeof item.name!=='string'||!item.name.trim()||item.name.length>160||typeof item.artist!=='string'||item.artist.length>160||typeof item.id!=='string'||!(source.kind==='youtube'?/^[A-Za-z0-9_-]{11}$/:/^[A-Za-z0-9]{22}$/).test(item.id))throw new Error('The source returned an invalid item.');return{id:item.id,name:item.name,artist:item.artist,image:mediaImageUrl(item.image)};});
}
export async function readMediaCollection(value,{kind,signal,onProgress=()=>{}}={}){
 const source=mediaSource(value,kind),items=[],warnings=[],seen=new Set();let page=null,next=null,name='',cover=null,artist='',reportedTotal=null,unavailable=0,hiddenUnavailable=false;
 for(let index=0;index<10;index++){
  signal?.throwIfAborted();onProgress(items.length?`Reading playlist… ${items.length} entries`:'Reading public collection…');page=JSON.parse(await(await request('/media-import',source.url,signal,next)).text());items.push(...checkedPage(page,source));checkedItems(items);
  if(Number.isInteger(page.unavailable)&&page.unavailable>=0&&page.unavailable<=MAX_MEDIA_ITEMS)unavailable+=page.unavailable;
  if(index===0){if(Number.isInteger(page.reportedTotal)&&page.reportedTotal>=0){reportedTotal=page.reportedTotal;if(reportedTotal>MAX_MEDIA_ITEMS)throw new Error(`Use a collection with at most ${MAX_MEDIA_ITEMS} entries. No partial tierlist was created.`);}hiddenUnavailable=page.hiddenUnavailable===true;if(typeof page.name!=='string'||!page.name.trim()||page.name.length>120)throw new Error('The source returned an invalid collection name.');name=page.name;cover=page.cover?mediaImageUrl(page.cover):items[0]?.image||null;artist=typeof page.artist==='string'?page.artist.slice(0,160):'';}
  if(Array.isArray(page.warnings))for(const text of page.warnings.slice(0,10))if(typeof text==='string')warnings.push(text.slice(0,300));
  next=page.next;if(!next||(reportedTotal!==null&&items.length+unavailable===reportedTotal))break;if(source.kind!=='youtube'||typeof next.cursor!=='string'||!next.cursor.length||next.cursor.length>4096||typeof next.version!=='string'||!/^2\.[0-9.]{8,40}$/.test(next.version)||seen.has(next.cursor))throw new Error('Invalid playlist pagination. No partial tierlist was created.');seen.add(next.cursor);
  if(items.length>=MAX_MEDIA_ITEMS||index===9)throw new Error(`Use a playlist with at most ${MAX_MEDIA_ITEMS} entries. No partial tierlist was created.`);
 }
 if(!items.length)throw new Error('This collection exposes no public items. No tierlist was created.');if(reportedTotal>items.length+unavailable){if(!hiddenUnavailable)throw new Error('YouTube returned an incomplete playlist. No partial tierlist was created.');warnings.push(`${reportedTotal-items.length} entries were not exposed publicly by YouTube and were not added.`);}return{...source,name,artist,cover:cover||items[0].image,items,warnings:[...new Set(warnings)]};
}
function lines(context,text,width){
 const result=[];let line='';for(const char of Array.from(text)){if(char==='\n'){result.push(line);line='';continue;}if(line&&context.measureText(line+char).width>width){const space=line.lastIndexOf(' ');if(space>line.length*.4){result.push(line.slice(0,space));line=line.slice(space+1)+char;}else{result.push(line);line=char;}}else line+=char;}if(line)result.push(line);return result;
}
export async function namedMediaCard(item,index,provider,bitmap){
 const canvas=document.createElement('canvas'),width=bitmap?.width||640,padding=Math.max(16,Math.round(width*.045)),font=Math.max(28,Math.round(width*.07)),small=Math.max(18,Math.round(width*.035));canvas.width=width;let context=canvas.getContext('2d');context.font=`600 ${font}px system-ui, sans-serif`;const title=lines(context,item.name,width-padding*2);context.font=`${small}px system-ui, sans-serif`;const artist=lines(context,item.artist,width-padding*2),numberHeight=Math.round(width*.13),artHeight=bitmap?.height||0,footer=padding*3+numberHeight+title.length*Math.ceil(font*1.25)+artist.length*Math.ceil(small*1.35);canvas.height=artHeight+footer;
 try{
  context=canvas.getContext('2d');context.fillStyle='#f4f4f4';context.fillRect(0,0,width,canvas.height);if(bitmap)context.drawImage(bitmap,0,0);context.textBaseline='top';let y=artHeight+padding;context.fillStyle='#595959';context.font=`600 ${Math.round(numberHeight*.68)}px system-ui, sans-serif`;context.fillText(String(index+1).padStart(2,'0'),padding,y);context.textAlign='right';context.font=`${small}px system-ui, sans-serif`;context.fillText(provider==='spotify'?'Spotify':'YouTube',width-padding,y+small*.4);context.textAlign='left';y+=numberHeight;context.fillStyle='#151515';context.font=`600 ${font}px system-ui, sans-serif`;for(const line of title){context.fillText(line,padding,y);y+=Math.ceil(font*1.25);}y+=padding*.5;context.fillStyle='#595959';context.font=`${small}px system-ui, sans-serif`;for(const line of artist){context.fillText(line,padding,y);y+=Math.ceil(small*1.35);}const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create a named image.');return new File([blob],`${index+1}.png`,{type:'image/png'});
 }finally{canvas.width=canvas.height=1;}
}
export async function createMediaTierlist(value,{kind,name='',signal,onProgress=()=>{}}={}){
 const collection=await readMediaCollection(value,{kind,signal,onProgress}),album=emptyAlbum();album.name=name.trim().slice(0,120)||collection.name;album.description=`${collection.url}\n${collection.artist?collection.artist+'\n':''}Named cards generated locally from public ${collection.kind==='youtube'?'YouTube playlist':'Spotify album'} metadata. No audio or video was downloaded.`.slice(0,1000);
 let shared=null,sharedBlob=null,missing=0,bytes=0;const warnings=[...collection.warnings];
 try{
  if(collection.kind==='spotify')try{sharedBlob=await request('/media-image',collection.cover,signal);shared=await createImageBitmap(sharedBlob);signal?.throwIfAborted();}catch(error){signal?.throwIfAborted();}
  for(const[index,item]of collection.items.entries()){
   signal?.throwIfAborted();onProgress(`Creating named images… ${index+1}/${collection.items.length}`);let bitmap=shared,blob=sharedBlob;
   try{
    if(collection.kind==='youtube')try{blob=await request('/media-image',item.image,signal);bitmap=await createImageBitmap(blob);signal?.throwIfAborted();}catch(error){signal?.throwIfAborted();}
    if(!bitmap)missing++;if(!album.cover&&bitmap&&blob)try{album.cover=await compressCover(new File([blob],'cover',{type:blob.type.split(';')[0]}));}catch{signal?.throwIfAborted();}
    const file=await namedMediaCard(item,index,collection.kind,bitmap);signal?.throwIfAborted();const image=await compressImage(file);signal?.throwIfAborted();image.id=`m${index.toString(36)}`;image.label=(`${index+1}. ${item.name}`).slice(0,160);bytes+=new TextEncoder().encode(JSON.stringify(image)).length;if(bytes>MAX_DOCUMENT-65536-(album.cover?.length||0))throw new Error('Generated images exceed the 128 MiB tierlist limit. Use a smaller collection. No partial tierlist was created.');album.images.push(image);album.board.unranked.push(image.id);
   }finally{if(collection.kind==='youtube')bitmap?.close();}
  }
  if(missing)warnings.push(`${missing} artwork image${missing===1?' was':'s were'} unavailable. Named cards were created instead.`);signal?.throwIfAborted();return{album:validateAlbum(album),warnings};
 }finally{shared?.close();}
}
