import {imageDimensions} from './model.mjs';
const dialog=document.querySelector('#image-dialog'),stage=document.querySelector('#image-stage'),picture=document.querySelector('#zoom-image'),pointers=new Map();
let image=null,scale=1,fitScale=1,panX=0,panY=0,fitted=true,dragged=false,suppressClickUntil=0,previousFocus=null;
const fitValue=()=>Math.min(2,(stage.clientWidth-48)/image.width,stage.clientHeight*.5/image.height);
function render(){
  if(!image)return;
  const width=image.width*scale,height=image.height*scale;
  panX=Math.max(24-width/2-stage.clientWidth/2,Math.min(stage.clientWidth/2-24+width/2,panX));
  panY=Math.max(24-height/2-stage.clientHeight/2,Math.min(stage.clientHeight/2-24+height/2,panY));
  picture.style.left=`${stage.clientWidth/2+panX}px`;picture.style.top=`${stage.clientHeight/2+panY}px`;
  picture.style.transform=`translate(-50%,-50%) scale(${scale})`;picture.dataset.scale=String(scale);
}
function zoom(next,x=stage.clientWidth/2,y=stage.clientHeight/2){
  if(!image)return;const value=Math.max(fitScale*.1,Math.min(fitScale*16,next)),ratio=value/scale;
  panX=x-(x-stage.clientWidth/2-panX)*ratio-stage.clientWidth/2;
  panY=y-(y-stage.clientHeight/2-panY)*ratio-stage.clientHeight/2;
  scale=value;fitted=Math.abs(scale-fitScale)<1e-9;render();
}
function fit(){if(!image)return;fitScale=fitValue();scale=fitScale;panX=panY=0;fitted=true;render();}
export function openImage(value){
  if(!value.data.startsWith('blob:'))imageDimensions(value.data);
  else if(new URL(value.data).origin!==location.origin)throw new Error('Invalid local image.');
  showImage(value,value.data);
}
export function refreshImage(images){
  if(!dialog.open||!image)return;const next=images.find(value=>value.id===image.id);if(!next)return;
  if(next.data===image.data){image=next;document.querySelector('#image-load-status').textContent=next.originalPending?'Preview shown. Full-resolution image is loading…':'';return;}
  imageDimensions(next.data);const factor=image.width/next.width;scale*=factor;image=next;picture.src=next.data;picture.style.width=`${next.width}px`;picture.style.height=`${next.height}px`;fitScale=fitValue();fitted=Math.abs(scale-fitScale)<1e-9;document.querySelector('#image-load-status').textContent='';render();
}
function showImage(value,source){
  document.querySelector('#image-load-status').textContent=value.originalPending?'Preview shown. Full-resolution image is loading…':'';
  previousFocus=document.activeElement;image=value;picture.src=source;picture.alt=value.label;picture.style.width=`${value.width}px`;picture.style.height=`${value.height}px`;document.querySelector('#image-title').textContent=value.label;
  pointers.clear();dragged=false;suppressClickUntil=0;if(!dialog.open)dialog.showModal();fit();stage.focus({preventScroll:true});
}
dialog.addEventListener('close',()=>{if(dialog.open)return;document.querySelector('#image-load-status').textContent='';pointers.clear();image=null;picture.removeAttribute('src');stage.classList.remove('panning');if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});});
stage.addEventListener('wheel',event=>{
  event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1),rect=stage.getBoundingClientRect();
  zoom(scale*Math.exp(-delta*.002),event.clientX-rect.left,event.clientY-rect.top);
},{passive:false});
dialog.addEventListener('click',event=>{
  if(!event.detail || performance.now()<suppressClickUntil)return;const rect=picture.getBoundingClientRect();
  if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();
});
stage.addEventListener('dblclick',event=>event.preventDefault());
stage.addEventListener('pointerdown',event=>{
  if(event.button!==0 || (event.target!==picture && !pointers.size))return;
  event.preventDefault();stage.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});stage.classList.add('panning');
});
stage.addEventListener('pointermove',event=>{
  const previous=pointers.get(event.pointerId);if(!previous)return;
  const before=[...pointers.values()];pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const after=[...pointers.values()];
  if(Math.hypot(event.clientX-previous.x,event.clientY-previous.y)>1)dragged=true;
  if(after.length===2){
    const distance=points=>Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),old=distance(before),rect=stage.getBoundingClientRect();
    const oldX=(before[0].x+before[1].x)/2,oldY=(before[0].y+before[1].y)/2;
    if(old>0)zoom(scale*distance(after)/old,oldX-rect.left,oldY-rect.top);
    panX+=(after[0].x+after[1].x)/2-oldX;panY+=(after[0].y+after[1].y)/2-oldY;render();
  }else if(after.length===1){panX+=event.clientX-previous.x;panY+=event.clientY-previous.y;render();}
});
for(const type of['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,event=>{
  if(!pointers.has(event.pointerId))return;pointers.delete(event.pointerId);if(dragged)suppressClickUntil=performance.now()+300;
  if(!pointers.size){dragged=false;stage.classList.remove('panning');}
});
dialog.addEventListener('keydown',event=>{
  if(['+','=','-','0','Home'].includes(event.key)){event.preventDefault();if(event.key==='0'||event.key==='Home')fit();else zoom(scale*Math.exp(event.key==='-'?-.15:.15));}
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown',' '].includes(event.key)){
    event.preventDefault();if(event.key==='ArrowLeft')panX+=40;if(event.key==='ArrowRight')panX-=40;if(event.key==='ArrowUp')panY+=40;if(event.key==='ArrowDown')panY-=40;render();
  }
});
addEventListener('resize',()=>{if(!dialog.open || !image)return;if(fitted)fit();else{fitScale=fitValue();scale=Math.max(fitScale*.1,Math.min(fitScale*16,scale));render();}});
