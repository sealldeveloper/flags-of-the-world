import {renderGroupImages} from './group-image.mjs';
import {tierlistFilename} from './files.mjs';
import {openImage} from './viewer.mjs';
const $=selector=>document.querySelector(selector);
export class GroupExport {
  constructor(getSnapshot){
    this.getSnapshot=getSnapshot;this.urls={};this.run=0;
    $('#group-export').addEventListener('click',()=>this.open());$('#group-dialog').addEventListener('close',()=>{if(!$('#group-dialog').open)this.reset();});
    for(const theme of['light','dark'])$('#group-'+theme).addEventListener('click',()=>this.select(theme));
    $('#download-group').addEventListener('click',()=>{if(!this.urls[this.theme])return;const link=document.createElement('a');link.href=this.urls[this.theme];link.download=this.base+`-everyone-${this.theme}.png`;link.click();});
    const preview=()=>{const image=this.images?.[this.theme];if(image)openImage({data:this.urls[this.theme],label:this.name,width:image.width,height:image.height});};
    $('#group-preview-image').addEventListener('click',preview);$('#group-preview-image').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();preview();}});
  }
  async open(){
    const value=this.getSnapshot();if(!value)return;this.reset();const run=this.run,snapshot=structuredClone(value),controller=new AbortController();this.controller=controller;this.name=snapshot.name;this.base=tierlistFilename(snapshot.name).replace(/\.tierlist$/,'');
    const first=document.documentElement.dataset.theme==='dark'?'dark':'light';this.theme=first;$('#group-error').textContent='';$('#group-progress').textContent='Preparing images…';$('#group-options').hidden=true;$('#group-preview').hidden=true;
    $('#group-dialog').showModal();
    try{
      const images=await renderGroupImages(snapshot,{signal:controller.signal,first,onProgress:text=>{if(run===this.run)$('#group-progress').textContent=text;}});
      if(run!==this.run)return;this.images=images;for(const theme of['light','dark'])this.urls[theme]=URL.createObjectURL(images[theme].blob);
      $('#group-progress').textContent='';$('#group-options').hidden=false;$('#group-preview').hidden=false;this.select(first);
    }catch(error){if(run===this.run && !controller.signal.aborted){$('#group-progress').textContent='';$('#group-error').textContent=error.message;}}
  }
  select(theme){
    if(!this.urls[theme])return;this.theme=theme;
    for(const value of['light','dark'])$('#group-'+value).setAttribute('aria-pressed',String(value===theme));
    const preview=$('#group-preview-image');preview.src=this.urls[theme];preview.alt=`Everyone’s tierlists in the ${theme} theme`;preview.dataset.theme=theme;
  }
  reset(){this.run++;this.controller?.abort();for(const url of Object.values(this.urls))URL.revokeObjectURL(url);this.urls={};this.images=null;$('#group-preview-image').removeAttribute('src');}
}
