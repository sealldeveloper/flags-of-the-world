import {MAX_DOCUMENT,MAX_IMAGE_DATA,imageDimensions,validateAlbum} from './model.mjs';
import {rasterDimensions} from './raster.mjs';
import {encodeAsset,decodeAsset,assetHash,verifyImageData} from './codec.mjs';
export const ASSET_CHUNK=24000;
// One requested original/chunk at a time. Board traffic continues on the same unchanged transport.
export class OriginalTransfer{
 constructor(album,{host=false,send,onImage=()=>{},onProgress=()=>{},onPeerProgress=()=>{},cache=new Map()}){
  Object.assign(this,{album,host,send,onImage,onProgress,onPeerProgress,cache,peers:new Map(),payloads:new Map(),loaded:host?album.images.length:0,total:album.images.length,revision:0,disposed:false,error:'',parts:[],received:0,encodedBytes:new TextEncoder().encode(JSON.stringify(album)).length});
  this.controller=new AbortController();
 }
 get state(){return{loaded:this.loaded,total:this.total,complete:this.loaded===this.total,percent:this.meta?Math.min(100,Math.floor(this.received/this.meta.length*100)):0,error:this.error,revision:this.revision};}
 emit(){this.onProgress(this.state);}
 request(message){clearTimeout(this.timer);this.timer=setTimeout(()=>this.fail(new Error('Original image transfer stalled.')),45000);this.send(null,message);}
 start(){if(this.host||this.disposed)return;for(const image of this.album.images)image.originalPending=true;this.emit();this.next();}
 next(){if(this.disposed||this.error)return;if(this.loaded>=this.total){this.expected='done';this.emit();return;}this.expected='meta';this.meta=null;this.parts=[];this.received=0;this.request({type:'original-next',index:this.loaded});}
 async payload(index){
  if(!this.payloads.has(index)){const image=this.album.images[index],task=(async()=>({code:await encodeAsset(image.data),hash:await assetHash(image.data),image}))();this.payloads.set(index,task);task.catch(()=>this.payloads.delete(index));}
  return this.payloads.get(index);
 }
 async hostMessage(conn,message){
  if(!this.host||this.disposed)throw new Error('Invalid original transfer.');let peer=this.peers.get(conn);if(!peer){peer={next:0,current:null};this.peers.set(conn,peer);}
  if(message.type==='original-next'){
   if(peer.current||message.index!==peer.next||!Number.isInteger(message.index)||message.index<0||message.index>=this.total)throw new Error('Invalid original image request.');
   peer.current={index:message.index,offset:0,pending:true};const payload=await this.payload(message.index);if(this.disposed||this.peers.get(conn)!==peer)return;
   peer.current={index:message.index,offset:0,payload};const {image,code,hash}=payload;
   this.send(conn,{type:'original-meta',index:message.index,id:image.id,length:code.length,rawLength:image.data.length,hash,width:image.width,height:image.height});return;
  }
  const current=peer.current;if(!current||current.pending||message.index!==current.index)throw new Error('Request an original image first.');
  if(message.type==='original-chunk'){
   if(!Number.isInteger(message.offset)||message.offset!==current.offset||message.offset>=current.payload.code.length)throw new Error('Invalid original chunk request.');
   const offset=current.offset,data=current.payload.code.slice(offset,offset+ASSET_CHUNK);current.offset+=data.length;this.send(conn,{type:'original-chunk',index:current.index,offset,data});return;
  }
  if(message.type==='original-done'){
   if(message.skip===true?current.offset!==0:current.offset!==current.payload.code.length)throw new Error('Finish the original image before acknowledging it.');
   peer.next++;peer.current=null;this.onPeerProgress(conn,peer.next,this.total);return;
  }
  throw new Error('Invalid original transfer message.');
 }
 async guestMessage(message){
  if(this.host||this.disposed||this.error)return;clearTimeout(this.timer);
  if(message.type==='original-error'){this.fail(new Error('Full-resolution images could not be loaded.'));return;}
  if(message.type==='original-meta'){
   if(this.expected!=='meta'||message.index!==this.loaded||message.id!==this.album.images[this.loaded]?.id||!Number.isInteger(message.length)||message.length<1||message.length>MAX_IMAGE_DATA||!Number.isInteger(message.rawLength)||message.rawLength<20||message.rawLength>MAX_IMAGE_DATA||!/^[a-f0-9]{64}$/.test(message.hash))throw new Error('Invalid original image metadata.');
   rasterDimensions(message);this.expected='checking';this.meta=message;
   const cached=this.cache.get(message.hash),existing=cached||this.album.images[this.loaded].data;
   if(await assetHash(existing)===message.hash){await this.accept(existing,true);return;}
   if(this.disposed||this.error)return;this.expected='chunk';this.request({type:'original-chunk',index:this.loaded,offset:0});this.emit();return;
  }
  if(message.type!=='original-chunk'||this.expected!=='chunk'||!this.meta||message.index!==this.loaded||message.offset!==this.received||typeof message.data!=='string'||message.data.length!==Math.min(ASSET_CHUNK,this.meta.length-this.received)||!/^[A-Za-z0-9_-]+$/.test(message.data))throw new Error('Invalid original image chunk.');
  const previous=Math.floor(this.received/this.meta.length*20);this.parts.push(message.data);this.received+=message.data.length;
  if(this.received<this.meta.length){this.request({type:'original-chunk',index:this.loaded,offset:this.received});if(Math.floor(this.received/this.meta.length*20)!==previous)this.emit();return;}
  this.expected='checking';const data=await decodeAsset(this.parts.join(''));this.parts=[];await this.accept(data,false);
 }
 async accept(data,skip){
  const meta=this.meta,index=this.loaded;if(this.disposed||this.error)return;
  if(data.length!==meta.rawLength||await assetHash(data)!==meta.hash)throw new Error('The original image checksum did not match.');
  const dimensions=imageDimensions(data);if(dimensions.width!==meta.width||dimensions.height!==meta.height)throw new Error('Invalid original image dimensions.');
  await verifyImageData(data,{signal:this.controller.signal});if(this.disposed||this.error)return;
  const previous=this.album.images[index],delta=data.length-previous.data.length;if(this.encodedBytes+delta>MAX_DOCUMENT-65536)throw new Error('Original images exceed the tierlist size limit.');
  const image={...previous,data,...dimensions,originalPending:false};
  if(index+1===this.total)validateAlbum({...this.album,images:this.album.images.map((item,at)=>at===index?image:item)});
  this.encodedBytes+=delta;this.album.images[index]=image;this.cache.set(meta.hash,data);this.loaded++;this.revision++;this.meta=null;this.onImage(index,image);
  this.send(null,{type:'original-done',index,skip});this.emit();setTimeout(()=>this.next(),0);
 }
 fail(error){if(this.disposed)return;clearTimeout(this.timer);this.error=(error?.message||'Original image transfer failed.').slice(0,200);this.controller.abort();this.parts=[];this.emit();}
 drop(conn){this.peers.delete(conn);}
 stop(){this.disposed=true;clearTimeout(this.timer);this.controller.abort();this.parts=[];this.peers.clear();this.payloads.clear();}
}
