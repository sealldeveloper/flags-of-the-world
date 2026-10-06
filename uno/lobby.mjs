import {AVATAR_COLOURS, AVATAR_PATTERNS, cleanName, paintAvatar} from './profiles.mjs';
const $=id=>document.getElementById(id);
export class LobbyControls {
  constructor({getRoom,command}) {
    this.getRoom=getRoom; this.command=command;
    for(const [group,items] of [['pattern',AVATAR_PATTERNS],['colour',AVATAR_COLOURS]]) for(const item of items){
      const label=document.createElement('label');label.className='avatar-option';
      const input=document.createElement('input');input.type='radio';input.name=`avatar-${group}`;input.value=item.id;input.required=true;
      const sample=document.createElement('span');sample.className=group==='pattern'?'seat-avatar pattern-thumb':'colour-swatch';sample.setAttribute('aria-hidden','true');
      if(group==='pattern')sample.dataset.pattern=item.id;else sample.style.backgroundColor=item.hex;
      const text=document.createElement('span');text.textContent=item.label;label.append(input,sample,text);$(`avatar-${group}s`).append(label);
      input.onchange=()=>this.preview();
    }
    $('profile-name').oninput=()=>this.preview();
    $('edit-profile').onclick=()=>this.openProfile();
    $('profile-form').onsubmit=e=>{e.preventDefault();this.saveProfile();};
    $('profile-cancel').onclick=()=>$('profile-dialog').close();
    $('profile-dialog').oncancel=e=>{if(this.saving)e.preventDefault();};
    $('show-invite').onclick=()=>this.openShare();
    $('close-invite').onclick=()=>$('invite-panel').close();
    $('invite-panel').onclose=()=>{$('show-invite').setAttribute('aria-expanded','false');this.clearQR();};
    for(const id of ['copy-invite','copy-link'])$(id).onclick=()=>this.copy();
    $('native-share').hidden=typeof navigator.share!=='function';
    $('native-share').onclick=async()=>{
      const room=this.getRoom();if(!room||room.disposed||!this.online)return;
      try{await navigator.share({title:'Join my ScuffedUNO iroh lobby',url:room.invite()});}
      catch(e){if(e.name!=='AbortError')$('share-status').textContent='Sharing is unavailable. Copy the invite link instead.';}
    };
    $('toggle-qr').onclick=()=>this.toggleQR();
    window.addEventListener('resize',()=>this.sizeQR());
  }
  selection(){return {colour:document.querySelector('[name="avatar-colour"]:checked')?.value,pattern:document.querySelector('[name="avatar-pattern"]:checked')?.value};}
  preview(){
    const avatar=this.selection();if(!avatar.colour||!avatar.pattern)return;
    paintAvatar($('profile-preview'),avatar);
    $('profile-preview-name').textContent=$('profile-name').value.trim()||'Your name';
    for(const el of document.querySelectorAll('#avatar-patterns .pattern-thumb'))paintAvatar(el,{colour:avatar.colour,pattern:el.dataset.pattern});
  }
  openProfile(){
    if(!this.me||!this.online||this.pending||this.view.phase==='playing')return;
    this.saving=null;this.profileBusy(false);$('profile-error').textContent='';
    $('profile-name').value=this.me.name;
    for(const group of ['colour','pattern'])for(const input of document.querySelectorAll(`[name="avatar-${group}"]`))input.checked=input.value===this.me.avatar[group];
    this.preview();$('profile-dialog').showModal();
  }
  profileBusy(busy){$('profile-fields').disabled=busy;$('profile-save').disabled=busy;$('profile-cancel').disabled=busy;$('profile-save').textContent=busy?'Saving…':'Save profile';}
  saveProfile(){
    if(this.saving||!this.online||this.pending||this.view.phase==='playing'||!$('profile-form').reportValidity())return;
    let name;try{name=cleanName($('profile-name').value);}catch(e){$('profile-error').textContent=e.message;return;}
    const avatar=this.selection();
    if(name===this.me.name&&avatar.colour===this.me.avatar.colour&&avatar.pattern===this.me.avatar.pattern){$('profile-dialog').close();return;}
    this.saving={name,avatar};this.profileBusy(true);$('profile-error').textContent='';
    this.command({type:'profile',name,avatar});
  }
  onError(message){if(message&&this.saving){this.saving=null;this.profileBusy(false);$('profile-error').textContent=message;}}
  update(view,{online,pending}){
    const room=this.getRoom();if(this.room!==room){this.reset();this.room=room;}
    this.view=view;this.online=online;this.pending=pending;this.me=view.players.find(p=>p.id===view.self);
    const unavailable=!online||room.disposed;
    $('edit-profile').hidden=view.phase==='playing';$('edit-profile').disabled=unavailable||pending;
    for(const id of ['show-invite','copy-invite','copy-link','native-share','toggle-qr'])$(id).disabled=unavailable;
    $('invite-output').value=room.invite();
    const url=new URL(room.invite());
    $('local-invite-warning').hidden=url.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!url.hostname.endsWith('.localhost');
    if(this.me){$('name').value=this.me.name;localStorage.setItem('uno-name',this.me.name);}
    if(this.saving&&this.me.name===this.saving.name&&this.me.avatar.colour===this.saving.avatar.colour&&this.me.avatar.pattern===this.saving.avatar.pattern){this.saving=null;this.profileBusy(false);$('profile-dialog').close();}
    if(unavailable||view.phase==='playing'){
      this.saving=null;this.profileBusy(false);if($('profile-dialog').open)$('profile-dialog').close();
    }
    if(unavailable&&$('invite-panel').open)$('invite-panel').close();
  }
  openShare(){
    const room=this.getRoom();if(!room||room.disposed||!this.online)return;
    $('share-status').textContent='';$('invite-output').value=room.invite();
    if(!$('invite-panel').open)$('invite-panel').showModal();
    $('show-invite').setAttribute('aria-expanded','true');
  }
  async copy(){
    const room=this.getRoom();if(!room||room.disposed||!this.online)return;
    try{
      await navigator.clipboard.writeText(room.invite());
      if(this.getRoom()!==room||room.disposed)return;
      $('share-status').textContent='Invite link copied.';$('copy-invite').textContent='Copied';clearTimeout(this.copyTimer);
      this.copyTimer=setTimeout(()=>{$('copy-invite').textContent='Copy link';},1600);
    }catch{
      if(this.getRoom()!==room||room.disposed)return;
      this.openShare();$('share-status').textContent='Clipboard unavailable. Select and copy the link below.';$('invite-output').focus();$('invite-output').select();
    }
  }
  sizeQR(){
    if(!this.qrWanted||!this.qrModules||!$('invite-qr').clientWidth)return;
    // Whole CSS pixels per module avoid blurred/uneven cells on narrow screens.
    const cell=Math.max(1,Math.floor(Math.min(360,$('invite-qr').clientWidth)/this.qrModules));
    $('qr-image').style.width=`${cell*this.qrModules}px`;
  }
  clearQR(){this.qrWanted=false;this.qrModules=null;$('qr-image').style.width='';$('invite-qr').hidden=true;$('qr-image').removeAttribute('src');$('qr-status').textContent='';$('toggle-qr').textContent='Show QR code';$('toggle-qr').setAttribute('aria-expanded','false');}
  async toggleQR(){
    if(this.qrWanted){this.clearQR();return;}
    const room=this.getRoom();if(!room||room.disposed||!this.online)return;
    this.qrWanted=true;$('invite-qr').hidden=false;$('qr-status').textContent='Generating QR code locally…';$('toggle-qr').textContent='Hide QR code';$('toggle-qr').setAttribute('aria-expanded','true');
    try{
      const {default:qrcode}=await import('./vendor/qrcode/qrcode.mjs');
      if(!this.qrWanted||this.getRoom()!==room||room.disposed||!$('invite-panel').open)return;
      const qr=qrcode(0,'M');qr.addData(room.invite(),'Byte');qr.make();
      this.qrModules=qr.getModuleCount()+8;this.sizeQR();
      $('qr-image').onload=()=>{if(this.qrWanted&&$('invite-panel').open)$('qr-image').scrollIntoView({block:'nearest'});};
      $('qr-image').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr.createSvgTag({cellSize:4,margin:16}).replace('<svg ','<svg shape-rendering="crispEdges" '));
      $('qr-status').textContent='The QR code contains the same private iroh invite link. No QR service is contacted.';
    }catch{if(this.getRoom()===room&&this.qrWanted)$('qr-status').textContent='Could not generate the QR code. Copy the invite link instead.';}
  }
  reset(){
    this.saving=null;clearTimeout(this.copyTimer);$('copy-invite').textContent='Copy link';
    for(const id of ['profile-dialog','invite-panel'])if($(id).open)$(id).close();
    $('invite-output').value='';this.clearQR();
  }
}
