import {emptyAlbum, validateAlbum, validateBoard, moveImage, removeTier, freshBoard, copy, id, MAX_DOCUMENT, coverDimensions} from './model.mjs';
import {compressImage, compressCover, encodeAlbum, decodeAlbum, verifyImages, MAX_CODE} from './codec.mjs';
import {listAlbums, saveAlbum, deleteAlbum} from './storage.mjs';
import {TierRoom, savedInvite} from './room.mjs';
import {insertionBefore} from './sort.mjs';
import {openImage} from './viewer.mjs';
import {importTiermaker,tiermakerUrls} from './tiermaker.mjs';
import {Activity} from './activity.mjs';
import {contrastInk,randomColour,cleanColour} from './social.mjs';
import {RatingPanel} from './rating-panel.mjs';
import {flashButton,resetFeedback} from './feedback.mjs';
import {tierlistFilename} from './files.mjs';
import {GroupExport} from './group-export.mjs';
import {isRemoteImage} from './image-policy.mjs';
import {authorizeRemote,setImageSource,setRemoteConsentPrompt,mayLoadRemote,resetRemoteConsent,fetchRemoteBlob} from './remote-images.mjs';
import {listImgurUploads,deleteImgurUpload} from './imgur.mjs';
import {uploadCatboxImage,clearCatboxUploadCache} from './catbox.mjs';
const $ = selector => document.querySelector(selector);
const el = (tag, className='', text='') => {const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
const button = (text, action, className='') => {const node=el('button',className,text);node.type='button';node.addEventListener('click',action);return node;};
const imageElement = image => {const node=new Image();setImageSource(node,image);node.alt=image.label;node.width=image.width;node.height=image.height;return node;};
let album=null, room=null, state=null, selected=null, activeTab='rank', tierId=null, dirty=false, busy=false, libraryRecords=[], saveTimer, generation=0, renderedSeq=-1, saveChain=Promise.resolve(), sort=null, clickTimer, suppressClickUntil=0;
let rosterSignature='',joinInvite='',imageLayout='grid',highlight=null,highlightTimer;
let lobbyState=null,viewingLobby=false,lobbyTab='rank',lobbyScroll=0,lobbySelected=null,lobbyStatus='',exportFilename='',copyDraft=null,copyOrigin=null,copySaving=false;
const activity=new Activity({onLocate:locateActivity});
const ratings=new RatingPanel($('#rating-modes'),openImage);
new GroupExport(()=>lobbyState?{name:lobbyState.album.name,images:lobbyState.album.images,players:lobbyState.players}:null);
const status = text => {$('#status').textContent=text;if($('#join-dialog').open)$('#join-status').textContent=text;};
const error = value => {const text=value?.message || String(value);$('#error').textContent=text;$('#error').hidden=false;if($('#join-dialog').open)$('#join-error').textContent=text;};
const clearError = () => {$('#error').hidden=true;$('#error').textContent='';$('#join-error').textContent='';};
const attempt = action => async(...args) => {try {await action(...args);} catch(e){error(e);}};
function currentBoard() {return state ? state.players.find(p=>p.id===state.self)?.board : album?.board;}
const canEdit = () => !!album && !busy && (!state || (state.connected && !room?.disposed));
let remoteRequest;
function finishRemote(allow){
  const request=remoteRequest;if(!request)return;remoteRequest=null;request.signal?.removeEventListener('abort',request.abort);
  const remember=allow && $('#remote-remember').checked;if($('#remote-dialog').open)$('#remote-dialog').close();request.resolve({allow,remember});
}
setRemoteConsentPrompt(({count,hosts,signal})=>new Promise(resolve=>{
  $('#remote-remember').checked=false;const abort=()=>finishRemote(false);remoteRequest={resolve,signal,abort};signal?.addEventListener('abort',abort,{once:true});
  $('#remote-title').textContent=`Download ${count} remote image${count===1?'':'s'}?`;$('#remote-hosts').textContent=`Images download directly from ${hosts.join(' and ')}. These hosts receive your IP address when an image downloads.`;$('#remote-dialog').showModal();$('#remote-cancel').focus();
}));
$('#remote-allow').addEventListener('click',()=>finishRemote(true));$('#remote-cancel').addEventListener('click',()=>finishRemote(false));
$('#remote-dialog').addEventListener('cancel',event=>{event.preventDefault();finishRemote(false);});$('#remote-dialog').addEventListener('close',()=>{if(!$('#remote-dialog').open)finishRemote(false);});
$('#reset-remote-warning').addEventListener('click',()=>{resetRemoteConsent();flashButton($('#reset-remote-warning'),'Warning reset');});
$('#clear-upload-cache').addEventListener('click',()=>{clearCatboxUploadCache();flashButton($('#clear-upload-cache'),'Cache cleared');});
for(const prefix of ['images','tiermaker']){
  $('#'+prefix+'-storage').addEventListener('change',()=>{const remote=$('#'+prefix+'-storage').value==='catbox';$('#'+prefix+'-remote-settings').hidden=!remote;$('#'+prefix+'-storage-help').textContent=remote?'Originals stay on Catbox. Tierlists share links and small previews instead of full images.':'Stored in the tierlist and sent by the host. Images are compressed.';});
}
try{$('#manage-imgur').hidden=!listImgurUploads().length;}catch{}
function renderImgurUploads(){
  const list=$('#imgur-uploads-list');list.replaceChildren();const records=listImgurUploads();if(!records.length)list.append(el('p','empty','No Imgur uploads from this browser.'));
  for(const record of records){const row=el('section','imgur-upload-record'),link=el('a','','Open album');link.href='https://imgur.com/a/'+encodeURIComponent(record.albumId);link.target='_blank';link.rel='noopener noreferrer';row.append(el('h3','',record.title),el('p','hint',`${record.images.length} image${record.images.length===1?'':'s'}${record.complete?'':' · Incomplete upload'}`),link,button('Delete images and album',async event=>{
    if(!confirm('Delete this Imgur album and its images? Shared tierlists will lose these images.'))return;const control=event.currentTarget;control.disabled=true;
    try{await deleteImgurUpload(record);renderImgurUploads();}catch(problem){$('#imgur-uploads-error').textContent=problem.message;control.disabled=false;}
  },'danger'));list.append(row);}
}
$('#manage-imgur').addEventListener('click',attempt(()=>{$('#imgur-uploads-error').textContent='';renderImgurUploads();$('#imgur-uploads-dialog').showModal();}));
function presentAlbum() {return validateAlbum({...album,board:currentBoard()});}
async function refreshLibrary() {
  try {libraryRecords=(await listAlbums()).map(validateAlbum);renderLibrary();}
  catch(e) {error(e);libraryRecords=[];renderLibrary();}
}
function renderLibrary() {
  const list=$('#albums');list.replaceChildren();
  if (!libraryRecords.length) {list.append(el('p','empty','No tierlists yet.'));return;}
  for (const item of libraryRecords) {
    const card=el('article','album-card');
    card.append(item.cover?imageElement({data:item.cover,...coverDimensions(item.cover),label:item.name}):item.images[0]?imageElement(item.images[0]):el('div','album-placeholder'));
    const body=el('div');body.append(el('h3','',item.name),el('p','',`${item.images.length} image${item.images.length===1?'':'s'}`));
    if(item.copiedFrom)body.append(el('p','copied-from',`Copied from ${item.copiedFrom}`));
    const actions=el('div','actions');
    actions.append(button('Open',attempt(()=>openAlbum(item)),'primary'),button('Export',attempt(()=>showExport(item))),button('Delete',attempt(async()=>{
      if (!confirm(`Delete “${item.name}”?`)) return;
      await deleteAlbum(item.id);await refreshLibrary();
    }),'danger'));
    body.append(actions);card.append(body);list.append(card);
  }
}
function rememberLobby() {if(viewingLobby && lobbyState){lobbyTab=activeTab;lobbyScroll=scrollY;lobbySelected=selected;}viewingLobby=false;clearTouch();clearSort();}
async function openAlbum(value) {
  if(busy)return;const next=validateAlbum(value);await authorizeRemote(next.images);await persist();rememberLobby();
  generation++;album=next;state=null;selected=null;dirty=false;activeTab='rank';clearError();$('#cover-status').textContent='';
  $('#library').hidden=true;$('#workspace').hidden=false;syncWorkspace();renderBoard();renderImages();setTab('rank');
  status('');
}
function syncWorkspace() {
  if (!album) return;
  $('#album-title').textContent=album.name;$('#album-title').hidden=!state;$('#album-summary').textContent=`${album.images.length} image${album.images.length===1?'':'s'}`;
  $('#album-name').value=album.name;$('#copy-attribution').hidden=!album.copiedFrom;$('#copy-attribution').textContent=album.copiedFrom?`Copied from ${album.copiedFrom}`:'';
  if(!$('#host-name').value)$('#host-name').value=$('#player-name').value;
  $('#workspace').classList.toggle('in-lobby',!!state);
  $('#album-fields').hidden=!!state;$('#host').hidden=!!room;$('#back').hidden=false;
  $('#lobby-details').hidden=!state;$('#tab-images').hidden=!!state;$('#tab-everyone').hidden=!state;$('#save-copy').hidden=!state;$('#group-export').hidden=!state;
  $('#activity-panel').hidden=!state;renderLobbyBar();renderCover();
  $('#load-remote-images').hidden=!album.images.some(image=>isRemoteImage(image) && !mayLoadRemote(image.data));$('#album-name').readOnly=busy;$('#images-storage').disabled=busy;for(const input of $('#image-grid').querySelectorAll('textarea'))input.readOnly=busy;
  $('#host').disabled=busy || !album.images.length;$('#export').disabled=busy;$('#add-tier').disabled=!canEdit();$('#reset').disabled=!canEdit();
  const self=state?.players.find(player=>player.id===state.self);$('#board-title').classList.toggle('player-heading',!!self);
  if(self){$('#board-title').style.setProperty('--player-color',self.color);$('#board-title').replaceChildren(el('span','player-dot'),el('span','','Your tier list'));}
  else $('#board-title').textContent='Your tier list';
}
function renderCover() {
  if(!album || state)return;
  const image=album.cover?{data:album.cover,...coverDimensions(album.cover),label:album.name}:album.images[0],preview=$('#cover-preview');
  preview.replaceChildren(image?imageElement(image):el('span','','No cover'));
  $('#cover-upload').disabled=busy;$('#reset-cover').disabled=busy || !album.cover;
  const source=$('#cover-source');source.replaceChildren(new Option('Use an existing image',''));
  album.images.forEach((image,index)=>source.add(new Option(`${index+1}. ${image.label}`,image.id)));source.disabled=busy || !album.images.length;
}
async function updateCover(read) {
  if(!album || state || busy)return;
  const version=generation;busy=true;syncWorkspace();$('#cover-status').textContent='Preparing cover…';clearError();
  try{const cover=await read();if(generation!==version)return;album=validateAlbum({...album,cover});queueSave();$('#cover-status').textContent='Cover updated.';}
  catch(problem){$('#cover-status').textContent=`The cover was not changed. ${problem.message}`;error(problem);}
  finally{busy=false;$('#cover-upload').value='';syncWorkspace();}
}
$('#cover-upload').addEventListener('change',()=>{const file=$('#cover-upload').files[0];if(file)updateCover(()=>compressCover(file));});
$('#cover-source').addEventListener('change',()=>{
  const image=album?.images.find(image=>image.id===$('#cover-source').value);if(!image)return;
  updateCover(async()=>{let blob;if(isRemoteImage(image) && !image.thumb){await authorizeRemote([image]);blob=await fetchRemoteBlob(image,{preview:true});}else blob=await (await fetch(image.thumb || image.data)).blob();return compressCover(new File([blob],'cover',{type:blob.type}));});
});
$('#reset-cover').addEventListener('click',()=>{if(!album || state || busy)return;delete album.cover;queueSave();renderCover();$('#cover-status').textContent=album.images.length?'Using the first image.':'No cover image.';});
function queueSave() {
  dirty=true;clearTimeout(saveTimer);status('Saving…');
  saveTimer=setTimeout(()=>persist().catch(error),350);
}
async function persist() {
  clearTimeout(saveTimer);
  if (!album || state || !dirty) return saveChain;
  const value=validateAlbum(album),version=generation;dirty=false;
  saveChain=saveChain.catch(()=>{}).then(()=>saveAlbum(value)).then(()=>{
    if (version===generation && !dirty && !state) status('Saved');
  }).catch(e=>{if(version===generation)dirty=true;error(e);throw e;});
  return saveChain;
}
function changeBoard(next) {
  try {
    if (!canEdit()) return false;
    const validated=validateBoard(next,album.images.map(i=>i.id));
    selected=null;
    if (state) room.update(validated);
    else {album.board=validated;queueSave();syncWorkspace();renderBoard();}
    return true;
  } catch(e) {error(e);return false;}
}
function buildBoard(board, editable=false) {
  const node=el('div',editable?'tier-board editable':'tier-board'), images=new Map(album.images.map(i=>[i.id,i]));
  for (const row of [...board.tiers,{id:'unranked',name:'Unranked',items:board.unranked}]) {
    const container=el('div','tier-row');container.dataset.tier=row.id;
    const label=el('div','tier-label');
    if (row.color) {label.style.setProperty('--tier-bg',row.color);label.style.setProperty('--tier-ink',contrastInk(row.color));}
    if (editable && row.id!=='unranked') {
      const edit=button('',()=>editTier(row.id),'tier-name'),mark=el('span','tier-edit-mark','✎');
      mark.setAttribute('aria-hidden','true');edit.append(el('span','tier-name-text',row.name),mark);
      edit.title=`Edit ${row.name}`;edit.setAttribute('aria-label',`Edit tier ${row.name}`);label.append(edit);
    } else label.append(el('strong','',row.name));
    if (editable && selected) label.append(button('Place here',()=>changeBoard(moveImage(currentBoard(),selected,row.id)),'place-here'));
    const tiles=el('div','tiles');tiles.dataset.dropTier=row.id;
    for (const imageId of row.items) {
      const image=images.get(imageId);if(!image)continue;
      const tile=button('',event=>{
        if(event.detail && performance.now()<suppressClickUntil)return;
        if(!editable) {if(event.detail===0)openImage(image);return;}
        if(event.detail>1)return;
        clearTimeout(clickTimer);
        const activate=()=>{
          if(selected && selected!==imageId)changeBoard(moveImage(currentBoard(),selected,row.id,imageId));
          else {selected=selected===imageId?null:imageId;renderSelection();}
        };
        if(event.detail===0)activate();else clickTimer=setTimeout(activate,350);
      },'tile');
      tile.addEventListener('dblclick',()=>{clearTimeout(clickTimer);selected=null;renderSelection();openImage(image);});
      tile.addEventListener('keydown',event=>{if(event.altKey && event.key==='Enter'){event.preventDefault();clearTimeout(clickTimer);openImage(image);}});
      tile.dataset.image=imageId;tile.title=image.label;tile.setAttribute('aria-label',`${image.label}, ${row.name}`);
      tile.draggable=editable;tile.setAttribute('aria-pressed',String(selected===imageId && editable));tile.append(imageElement(image));
      if (!editable) tile.tabIndex=-1;
      if (editable) {
        tile.addEventListener('dragstart',event=>{clearTimeout(clickTimer);event.dataTransfer.setData('text/x-tier-image',imageId);event.dataTransfer.effectAllowed='move';startSort(imageId,tile);});
        tile.addEventListener('dragend',clearSort);
        tile.addEventListener('pointerdown',event=>touchStart(event,imageId));
      }
      tiles.append(tile);
    }
    if (editable) {
      tiles.addEventListener('click',event=>{if(selected && !event.target.closest('[data-image]'))changeBoard(moveImage(currentBoard(),selected,row.id));});
      tiles.addEventListener('dragover',event=>{if(sort && event.dataTransfer.types.includes('text/x-tier-image')){event.preventDefault();event.dataTransfer.dropEffect='move';previewSort(tiles,event.clientX,event.clientY);}});
      tiles.addEventListener('drop',event=>{
        event.preventDefault();if(!sort || event.dataTransfer.getData('text/x-tier-image')!==sort.image)return;
        previewSort(tiles,event.clientX,event.clientY);commitSort();
      });
    }
    container.append(label,tiles);
    if(editable && row.id!=='unranked'){
      const rail=el('div','tier-moves'),at=board.tiers.findIndex(tier=>tier.id===row.id);
      for(const [delta,mark,name] of [[-1,'↑','up'],[1,'↓','down']]){
        const move=button(mark,()=>moveTier(row.id,delta));move.dataset.move=name;move.title=`Move ${name}`;move.setAttribute('aria-label',`Move tier ${row.name} ${name}`);move.disabled=delta<0?at===0:at===board.tiers.length-1;rail.append(move);
      }
      container.append(rail);
    }
    node.append(container);
  }
  return node;
}
function renderBoard() {
  clearTimeout(clickTimer);clearSort();
  if (!album || !currentBoard()) return;
  $('#board').replaceChildren(buildBoard(currentBoard(),canEdit()));$('#empty-board').hidden=album.images.length>0;renderSelection();applyHighlight();
}
function renderSelection() {
  $('#selection-bar').hidden=!selected;
  $('#selection-text').textContent=selected?album.images.find(i=>i.id===selected)?.label:'';
  for(const tile of $('#board').querySelectorAll('[data-image]'))tile.setAttribute('aria-pressed',String(tile.dataset.image===selected));
  for(const row of $('#board').querySelectorAll('[data-tier]')) {
    const label=row.querySelector('.tier-label'),place=label.querySelector('.place-here');
    if(!selected || !canEdit())place?.remove();
    else if(!place)label.append(button('Place here',()=>changeBoard(moveImage(currentBoard(),selected,row.dataset.tier)),'place-here'));
  }
}
function startSort(image,source) {
  clearSort();selected=null;renderSelection();
  const slot=el('div','tile sort-slot');slot.setAttribute('aria-hidden','true');slot.append(imageElement(album.images.find(i=>i.id===image)));
  sort={image,source,slot,zone:null,before:null};
}
function clearSlot() {
  if(!sort)return;
  sort.slot.remove();sort.source.classList.remove('sort-origin');sort.zone=null;
}
function clearSort() {clearSlot();sort=null;}
function previewSort(zone,x,y) {
  if(!sort || !zone || !canEdit())return;
  if(sort.zone===zone) {
    const rect=sort.slot.getBoundingClientRect();
    if(x>=rect.left && x<=rect.right && y>=rect.top && y<=rect.bottom)return;
  }
  const tiles=[...zone.querySelectorAll('[data-image]')].filter(tile=>tile!==sort.source);
  const items=tiles.map(tile=>({id:tile.dataset.image,...rectOf(tile)}));
  const before=insertionBefore(items,x,y),target=tiles.find(tile=>tile.dataset.image===before) || null;
  sort.slot.remove();sort.source.classList.add('sort-origin');zone.insertBefore(sort.slot,target);
  sort.zone=zone;sort.before=before;sort.slot.dataset.before=before || '';
}
function rectOf(node) {const {left,top,width,height}=node.getBoundingClientRect();return {left,top,width,height};}
function commitSort() {
  if(!sort?.zone){clearSort();return;}
  const {image,before,zone}=sort;clearSort();changeBoard(moveImage(currentBoard(),image,zone.dataset.dropTier,before));
}
document.addEventListener('dragover',event=>{if(sort && !event.target.closest('#board [data-drop-tier]'))clearSlot();});
function playerStatus(player) {return !player.online?'Offline':player.phase==='loading'?`Loading assets · ${player.progress}%`:player.phase==='checking'?'Checking assets':'Ready';}
function renderComparison() {
  if(!state)return;ratings.render(album.images,state.players);const container=$('#comparison'),previous=new Map([...container.children].map(node=>[node.dataset.player,node]));
  const cards=state.players.map(player=>{
    const signature=JSON.stringify([player.seq,player.online,player.phase,player.progress,player.name,player.color]),old=previous.get(player.id);
    if(old?.dataset.signature===signature)return old;
    const card=el('article','comparison-card'),heading=el('h3','player-heading'),name=el('span','comparison-name',player.name+(player.id===state.self?' (you)':''));
    card.dataset.player=player.id;card.dataset.signature=signature;card.style.setProperty('--player-color',player.color);
    heading.append(el('span','player-dot'),name,el('small','',playerStatus(player)));card.append(heading,buildBoard(player.board));return card;
  });
  // Keyed updates do not detach unaffected boards or reset their focus/scroll state.
  const desired=new Set(cards);for(const child of [...container.children])if(!desired.has(child))child.remove();
  cards.forEach((card,index)=>{if(container.children[index]!==card)container.insertBefore(card,container.children[index] || null);});applyHighlight();
}
function highlightNode() {
  if(!highlight || !state)return null;
  const root=highlight.actor===state.self && activeTab==='rank'?$('#board'):$('#comparison').querySelector(`[data-player="${highlight.actor}"]`);
  if(!root)return null;
  return highlight.type==='image'?root.querySelector(`[data-image="${highlight.id}"]`):highlight.type==='tier'?root.querySelector(`[data-tier="${highlight.id}"]`):root;
}
function applyHighlight() {for(const node of document.querySelectorAll('.activity-highlight'))node.classList.remove('activity-highlight');highlightNode()?.classList.add('activity-highlight');}
function locateActivity(event,reference) {
  const player=state?.players.find(player=>player.id===event.actor);if(!player){status('This player is no longer in the lobby.');return;}
  setTab(player.id===state.self?'rank':'everyone');highlight={actor:player.id,type:reference.type,id:reference.id};
  let node=highlightNode();if(!node){highlight.type='board';node=highlightNode();status('That tier was deleted. Showing the player’s current tierlist.');}
  else if(reference.type==='image'){
    const tier=player.board.tiers.find(row=>row.items.includes(reference.id));status(`${reference.label} is now in ${tier?.name || 'Unranked'} on ${player.name}’s tierlist.`);
  }else status(`Showing ${reference.label} on ${player.name}’s tierlist.`);
  applyHighlight();if(node){node.tabIndex=-1;node.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});node.focus({preventScroll:true});}
  clearTimeout(highlightTimer);highlightTimer=setTimeout(()=>{highlight=null;applyHighlight();},6000);
}
function setTab(tab) {
  clearTimeout(clickTimer);activeTab=tab;
  for (const name of ['rank','images','everyone']) {$('#'+name+'-view').hidden=name!==tab;$(`[data-tab="${name}"]`).setAttribute('aria-pressed',String(name===tab));}
  $('#controls-hint').textContent=tab==='rank'?'Drag to rank · Double-click to zoom':tab==='images'?'Drag to reorder · Double-click to zoom':'Double-click to zoom';
  if (tab==='everyone')renderComparison();if(tab==='images')renderImages();if(tab==='rank'){renderBoard();activity.render();}
}
function editTier(value) {
  if(!canEdit())return;tierId=value;
  const board=currentBoard(),row=board.tiers.find(t=>t.id===value);
  if(!row)return;$('#tier-name').value=row.name;$('#tier-color').value=row.color;
  $('#tier-delete').disabled=board.tiers.length===1;
  $('#tier-dialog').showModal();
}
$('#tier-form').addEventListener('submit',event=>{
  event.preventDefault();const board=copy(currentBoard()),row=board.tiers.find(t=>t.id===tierId);
  row.name=$('#tier-name').value.trim();row.color=$('#tier-color').value;
  if(!row.name)return;changeBoard(board);$('#tier-dialog').close();
});
function moveTier(value,delta) {
  if(!canEdit())return;const board=copy(currentBoard()),at=board.tiers.findIndex(tier=>tier.id===value);
  if(at<0 || at+delta<0 || at+delta>=board.tiers.length)return;
  [board.tiers[at],board.tiers[at+delta]]=[board.tiers[at+delta],board.tiers[at]];
  if(changeBoard(board)){
    const row=$('#board').querySelector(`[data-tier="${value}"]`),control=row?.querySelector(`[data-move="${delta<0?'up':'down'}"]`);
    (control?.disabled?row.querySelector('.tier-name'):control)?.focus({preventScroll:true});
  }
}
$('#tier-delete').addEventListener('click',()=>{changeBoard(removeTier(currentBoard(),tierId));$('#tier-dialog').close();});
$('#add-tier').addEventListener('click',()=>{const board=copy(currentBoard()),row={id:id(),name:'New tier',color:'#b5c7eb',items:[]};board.tiers.push(row);if(changeBoard(board))editTier(row.id);});
$('#reset').addEventListener('click',()=>{if(confirm('Unrank all images?'))changeBoard(freshBoard({...album,board:currentBoard()}));});
$('#cancel-selection').addEventListener('click',()=>{selected=null;renderBoard();});
let touch=null;
function clearTouch() {
  if(!touch)return;
  touch.ghost?.remove();clearSort();touch=null;
}
function touchStart(event,image) {
  if (event.pointerType!=='touch' || !canEdit())return;
  touch={image,x:event.clientX,y:event.clientY,pointer:event.pointerId,target:event.currentTarget};event.currentTarget.setPointerCapture(event.pointerId);
}
document.addEventListener('pointermove',event=>{
  if(!touch || touch.pointer!==event.pointerId)return;
  if(!touch.ghost && Math.hypot(event.clientX-touch.x,event.clientY-touch.y)<8)return;
  event.preventDefault();
  if(!touch.ghost) {clearTimeout(clickTimer);startSort(touch.image,touch.target);touch.ghost=imageElement(album.images.find(i=>i.id===touch.image));touch.ghost.className='touch-ghost';document.body.append(touch.ghost);}
  touch.ghost.style.left=event.clientX+'px';touch.ghost.style.top=event.clientY+'px';
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-drop-tier]');
  if(target)previewSort(target,event.clientX,event.clientY);else clearSlot();
  if(event.clientY<60)scrollBy(0,-12);else if(event.clientY>innerHeight-60)scrollBy(0,12);
},{passive:false});
document.addEventListener('pointerup',event=>{
  if(!touch || touch.pointer!==event.pointerId)return;
  if(touch.ghost) {
    const zone=document.elementFromPoint(event.clientX,event.clientY)?.closest('#board [data-drop-tier]');
    suppressClickUntil=performance.now()+500;
    if(zone){previewSort(zone,event.clientX,event.clientY);commitSort();}
  }
  clearTouch();
});
document.addEventListener('pointercancel',clearTouch);
function reorderImages(imageId,beforeId) {
  if(state || busy)return;
  const index=album.images.findIndex(i=>i.id===imageId);if(index<0 || imageId===beforeId)return;
  const next=copy(album),[image]=next.images.splice(index,1),before=next.images.findIndex(i=>i.id===beforeId);
  next.images.splice(before<0?next.images.length:before,0,image);
  const unranked=new Set(next.board.unranked);next.board.unranked=next.images.filter(i=>unranked.has(i.id)).map(i=>i.id);
  album=next;queueSave();renderImages();renderBoard();
}
function renderImages() {
  const grid=$('#image-grid');grid.replaceChildren();if(!album)return;
  if(!album.images.length){grid.append(el('p','empty','No images yet.'));return;}
  for(const [index,image] of album.images.entries()) {
    const card=el('article','image-card'),preview=imageElement(image),handle=button('⠿',()=>{},'image-drag-handle');card.draggable=true;card.dataset.albumImage=image.id;
    handle.draggable=true;handle.title='Drag to reorder';handle.setAttribute('aria-label',`Drag image ${index+1} to reorder`);handle.addEventListener('pointerdown',event=>startImageTouch(event,image.id));card.append(handle,preview);
    preview.tabIndex=0;preview.setAttribute('role','button');preview.title=image.label;preview.setAttribute('aria-label',`Enlarge ${image.label}`);
    preview.addEventListener('dblclick',()=>openImage(image));preview.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openImage(image);}});
    const label=el('label'),input=el('textarea');input.rows=3;input.value=image.label;input.maxLength=160;
    input.addEventListener('input',()=>fitImageName(input));input.setAttribute('aria-label',`Label for image ${index+1}`);
    input.addEventListener('change',()=>{if(state || busy)return;image.label=input.value.trim() || 'Image';queueSave();renderCover();renderBoard();});label.append(input);card.append(label);
    const actions=el('div','actions');
    const earlier=button('←',()=>reorderImages(image.id,album.images[index-1]?.id));earlier.title='Move image earlier';earlier.setAttribute('aria-label',`Move image ${index+1} earlier`);earlier.disabled=index===0;
    const later=button('→',()=>reorderImages(image.id,album.images[index+2]?.id));later.title='Move image later';later.setAttribute('aria-label',`Move image ${index+1} later`);later.disabled=index===album.images.length-1;
    actions.append(earlier,later,button('Remove',()=>{
      if(state || busy)return;
      album.images=album.images.filter(i=>i.id!==image.id);album.board.unranked=album.board.unranked.filter(i=>i!==image.id);
      for(const tier of album.board.tiers)tier.items=tier.items.filter(i=>i!==image.id);
      queueSave();syncWorkspace();renderImages();renderBoard();
    },'danger'));card.append(actions);
    card.addEventListener('dragstart',event=>{if(event.target.closest('input,textarea,button:not(.image-drag-handle)')){event.preventDefault();return;}event.dataTransfer.setData('text/x-album-image',image.id);event.dataTransfer.effectAllowed='move';card.classList.add('image-dragging');});
    card.addEventListener('dragend',clearImageDrop);
    card.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('text/x-album-image')){event.preventDefault();previewImageDrop(card,event.clientX,event.clientY);}});
    card.addEventListener('drop',event=>{event.preventDefault();const moving=event.dataTransfer.getData('text/x-album-image'),before=previewImageDrop(card,event.clientX,event.clientY);clearImageDrop();if(moving)reorderImages(moving,before);});grid.append(card);
  }
  grid.classList.toggle('image-list',imageLayout==='list');requestAnimationFrame(()=>grid.querySelectorAll('textarea').forEach(fitImageName));
}
function fitImageName(input) {input.style.height='auto';input.style.height=Math.max(64,input.scrollHeight+2)+'px';}
let imageGridWidth=0;
new ResizeObserver(([entry])=>{const width=entry.contentRect.width;if(width>0 && width!==imageGridWidth){imageGridWidth=width;$('#image-grid').querySelectorAll('textarea').forEach(fitImageName);}}).observe($('#image-grid'));
function clearImageDrop() {for(const node of document.querySelectorAll('.image-drop-before,.image-drop-after,.image-dragging'))node.classList.remove('image-drop-before','image-drop-after','image-dragging');}
function previewImageDrop(card,x,y) {
  for(const node of document.querySelectorAll('.image-drop-before,.image-drop-after'))node.classList.remove('image-drop-before','image-drop-after');
  const rect=card.getBoundingClientRect(),after=imageLayout==='list'?y>rect.top+rect.height/2:x>rect.left+rect.width/2;
  card.classList.add(after?'image-drop-after':'image-drop-before');const at=album.images.findIndex(image=>image.id===card.dataset.albumImage);return after?album.images[at+1]?.id || null:card.dataset.albumImage;
}
let imageTouch=null;
function startImageTouch(event,image) {if(event.pointerType!=='touch' || busy || state)return;imageTouch={image,pointer:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}
document.addEventListener('pointermove',event=>{if(!imageTouch || event.pointerId!==imageTouch.pointer)return;event.preventDefault();const card=document.elementFromPoint(event.clientX,event.clientY)?.closest('.image-card');if(card){imageTouch.moved ||= Math.hypot(event.clientX-imageTouch.x,event.clientY-imageTouch.y)>8;imageTouch.before=previewImageDrop(card,event.clientX,event.clientY);}if(event.clientY<60)scrollBy(0,-12);else if(event.clientY>innerHeight-60)scrollBy(0,12);},{passive:false});
document.addEventListener('pointerup',event=>{if(!imageTouch || event.pointerId!==imageTouch.pointer)return;const drag=imageTouch;imageTouch=null;clearImageDrop();if(drag.moved && drag.before!==undefined)reorderImages(drag.image,drag.before);});
document.addEventListener('pointercancel',()=>{imageTouch=null;clearImageDrop();});
for(const layout of ['grid','list'])$('#images-'+layout).addEventListener('click',()=>{imageLayout=layout;for(const option of ['grid','list'])$('#images-'+option).setAttribute('aria-pressed',String(option===layout));renderImages();});
$('#upload').addEventListener('change',attempt(async()=>{
  if(!album || state || busy)return;
  const files=[...$('#upload').files];if(!files.length)return;
  busy=true;clearError();syncWorkspace();$('#upload').disabled=true;
  const version=generation,errors=[];
  if($('#images-storage').value==='catbox'){
    const controller=uploadController=new AbortController();let savedRemote=false;
    $('#cancel-upload').hidden=false;
    try{
      const plannedIds=files.map(()=>id()),maxThumbData=Math.floor((MAX_DOCUMENT-new TextEncoder().encode(JSON.stringify(album)).length-65536)/files.length)-1024;
      if(maxThumbData<256)throw new Error('This tierlist is too large to add these images.');
      validateBoard({...album.board,unranked:[...album.board.unranked,...plannedIds]},[...album.images.map(image=>image.id),...plannedIds]);await persist();
      const added=[];
      for(const [index,file] of files.entries()){controller.signal.throwIfAborted();$('#upload-status').textContent=`Uploading ${index+1} of ${files.length}: ${file.name}`;const image=await uploadCatboxImage(file,(file.name.replace(/\.[^.]+$/,'').trim() || 'Image').slice(0,160),{signal:controller.signal,maxThumbData});image.id=plannedIds[index];added.push(image);}
      controller.signal.throwIfAborted();
      const next=copy(album);next.images.push(...added);next.board.unranked.push(...added.map(image=>image.id));const saved=await saveAlbum(validateAlbum(next));album=saved;dirty=false;savedRemote=true;
      $('#upload-status').textContent=`Added ${added.length} Catbox images.`;
      await authorizeRemote(added,{signal:controller.signal});
    }catch(problem){
      if(!savedRemote)$('#upload-status').textContent=(controller.signal.aborted?'Upload cancelled.':'Upload failed. No images were added.')+' Anonymous uploads already sent cannot be deleted.';
      if(!controller.signal.aborted)error(problem);
    }
    finally{busy=false;uploadController=null;$('#cancel-upload').hidden=true;$('#upload').disabled=false;$('#upload').value='';syncWorkspace();renderImages();renderBoard();}
    return;
  }
  try {
    for(const [index,file] of files.entries()) {
      $('#upload-status').textContent=`Compressing ${index+1} of ${files.length}: ${file.name}`;
      try {
        const image=await compressImage(file);if(generation!==version)return;
        const next=copy(album);next.images.push(image);next.board.unranked.push(image.id);album=validateAlbum(next);
      } catch(e){errors.push(e.message);}
    }
    queueSave();renderImages();renderBoard();
    $('#upload-status').textContent=errors.length?`${errors.length} images could not be added.`:'';
    if(errors.length)error(errors.slice(0,5).join(' '));
  } finally {busy=false;$('#upload').disabled=false;$('#upload').value='';syncWorkspace();renderBoard();}
}));
$('#album-name').addEventListener('change',()=>{
  album.name=$('#album-name').value.trim() || 'Untitled tierlist';queueSave();syncWorkspace();
});
for(const tab of ['rank','images','everyone'])$(`[data-tab="${tab}"]`).addEventListener('click',()=>setTab(tab));
$('#new').addEventListener('click',attempt(async()=>{const next=await saveAlbum(emptyAlbum());await openAlbum(next);}));
async function showLibrary() {
  if(busy)return;await persist();rememberLobby();await refreshLibrary();generation++;album=null;state=null;selected=null;$('#workspace').hidden=true;$('#library').hidden=false;status('');lockLibrary();
}
async function returnToLobby() {
  if(!room || !lobbyState || busy)return;await persist();generation++;viewingLobby=true;state=lobbyState;album=state.album;selected=lobbySelected;dirty=false;rosterSignature='';clearError();
  $('#library').hidden=true;$('#workspace').hidden=false;syncWorkspace();renderPlayers();setTab(lobbyTab);renderedSeq=state.players.find(player=>player.id===state.self)?.seq;status('');
  requestAnimationFrame(()=>scrollTo(0,lobbyScroll));
}
$('#back').addEventListener('click',attempt(showLibrary));$('#return-lobby').addEventListener('click',attempt(returnToLobby));
let importController,uploadController,codeController;
$('#cancel-upload').addEventListener('click',()=>{uploadController?.abort();$('#upload-status').textContent='Cancelling upload…';});
$('#load-remote-images').addEventListener('click',attempt(async()=>{await authorizeRemote(album.images);syncWorkspace();renderBoard();renderImages();if(activeTab==='everyone'){ratings.reset();renderComparison();}}));
function setImportMethod(method) {
  importController?.abort();codeController?.abort();codeController=null;$('#import-code').disabled=false;$('#code-fields').hidden=method!=='code';$('#tiermaker-fields').hidden=method!=='tiermaker';
  $('#method-code').setAttribute('aria-pressed',String(method==='code'));$('#method-tiermaker').setAttribute('aria-pressed',String(method==='tiermaker'));
}
$('#method-code').addEventListener('click',()=>{setImportMethod('code');$('#code-title').textContent='Import tierlist';});
$('#method-tiermaker').addEventListener('click',()=>{setImportMethod('tiermaker');$('#code-title').textContent='Import tierlists';$('#tiermaker-url').focus();});
$('#code-dialog').addEventListener('close',()=>{if(!$('#code-dialog').open){importController?.abort();codeController?.abort();}});
$('#import-tiermaker').addEventListener('click',async()=>{
  importController?.abort();const controller=new AbortController();importController=controller;
  const imported=[],failures=[],warnings=[];let sources=null,pending=null,finished=false,singleResult=null;
  const storage=$('#tiermaker-storage').value;
  $('#import-tiermaker').disabled=true;$('#import-tiermaker').textContent='Importing…';$('#tiermaker-url').readOnly=true;$('#tiermaker-storage').disabled=true;$('#tiermaker-error').textContent='';$('#tiermaker-progress').textContent='';
  try {
    sources=tiermakerUrls($('#tiermaker-url').value);pending=new Set(sources);
    for(const [index,source] of sources.entries()){
      controller.signal.throwIfAborted();
      try {
        const next=await importTiermaker(source,{storage,signal:controller.signal,onWarning:text=>warnings.push(text),onProgress:text=>{if(importController===controller)$('#tiermaker-progress').textContent=sources.length===1?text:`Tierlist ${index+1} of ${sources.length} · ${text}`;}});
        controller.signal.throwIfAborted();
        try{const saved=await saveAlbum(next,true);imported.push({id:saved.id,name:saved.name});if(sources.length===1)singleResult=saved;pending.delete(source);}
        catch(problem){failures.push(`Could not save locally: ${problem.message}${storage==='catbox'?' Anonymous uploads already sent cannot be deleted.':''}`);break;}
      }catch(problem){if(controller.signal.aborted)throw problem;failures.push(`${source}: ${problem.message}`);if(problem.pauseBatch)break;}
    }
    controller.signal.throwIfAborted();finished=true;
    if(pending.size){$('#tiermaker-error').textContent=failures.join('\n');$('#tiermaker-progress').textContent=`${imported.length} imported · ${pending.size} remaining. Retry the remaining URLs.`;}
  }catch(problem){if(!controller.signal.aborted)$('#tiermaker-error').textContent=problem.message;}
  finally{
    if(importController===controller){$('#import-tiermaker').disabled=false;$('#import-tiermaker').textContent='Import';$('#tiermaker-url').readOnly=false;$('#tiermaker-storage').disabled=false;if(pending)$('#tiermaker-url').value=[...pending].join('\n');if(controller.signal.aborted || (finished && !pending.size))$('#tiermaker-progress').textContent='';}
    if(imported.length){await refreshLibrary();if(controller.signal.aborted && !$('#library').hidden)status(`Imported ${imported.length} tierlist${imported.length===1?'':'s'}.`);}
  }
  if(finished && !pending.size && imported.length && importController===controller && $('#code-dialog').open){
    $('#code-dialog').close();if(sources.length===1)try{await openAlbum(singleResult);}catch(problem){error(problem);status('Tierlist saved. Remote images were not loaded.');return;}status((sources.length===1?'Imported.':`Imported ${imported.length} tierlists.`)+(warnings.length?` ${warnings.length} cover${warnings.length===1?' could':'s could'} not be copied. Choose a cover in Images.`:''));
  }
});
function codeMode(importing) {
  setImportMethod('code');$('#import-methods').hidden=!importing;$('#tiermaker-error').textContent='';
  $('#code-title').textContent=importing?'Import tierlist':'Export tierlist';$('#code-filename').hidden=importing;$('#code-filename').textContent='';resetFeedback($('#copy-code'));
  $('#code-help').textContent=importing?'Paste a code or open a text file.':'Includes images, tiers and ordering.';
  $('#code').readOnly=!importing;$('#code').value='';$('#code-error').textContent='';$('#code-size').textContent='';
  $('#import-code').hidden=!importing;$('#import-file-label').hidden=!importing;$('#copy-code').hidden=importing;$('#download-code').hidden=importing;
  $('#code-dialog').showModal();
}
async function showExport(value) {
  codeMode(false);exportFilename=tierlistFilename(value.name);$('#code-filename').textContent=exportFilename;$('#code-help').textContent='Preparing code…';$('#copy-code').disabled=true;$('#download-code').disabled=true;
  try {
    const code=await encodeAlbum(value);$('#code').value=code;$('#code-size').textContent=`${code.length.toLocaleString()} characters`;
    $('#code-help').textContent=value.images.some(isRemoteImage)?'Includes remote image links, small previews, tiers and ordering. Originals need an internet connection.':'Includes images, tiers and ordering.';
  } catch(e){$('#code-error').textContent=e.message;}
  finally {$('#copy-code').disabled=false;$('#download-code').disabled=false;}
}
$('#import').addEventListener('click',()=>codeMode(true));$('#export').addEventListener('click',attempt(()=>showExport(presentAlbum())));
$('#import-code').addEventListener('click',async()=>{
  codeController?.abort();const controller=codeController=new AbortController();
  $('#import-code').disabled=true;$('#code-error').textContent='';$('#code-size').textContent='Checking tierlist and images…';
  try {
    const next=await verifyImages(await decodeAlbum($('#code').value),{signal:controller.signal});controller.signal.throwIfAborted();
    const saved=await saveAlbum(next,true);
    if(controller.signal.aborted){await refreshLibrary();return;}
    $('#code-dialog').close();await openAlbum(saved);status('Imported');
  } catch(e){if(!controller.signal.aborted && codeController===controller){$('#code-error').textContent=e.message;$('#code-size').textContent='No tierlist was imported.';}}
  finally {if(codeController===controller)$('#import-code').disabled=false;}
});
$('#import-file').addEventListener('change',async()=>{
  const file=$('#import-file').files[0];if(!file)return;
  if(file.size>MAX_CODE){$('#code-error').textContent='Tierlist code file is too large.';return;}
  $('#code').value=await file.text();$('#code-size').textContent=`${file.size.toLocaleString()} bytes`;$('#import-file').value='';
});
async function copyText(value,input) {
  try {await navigator.clipboard.writeText(value);return true;}
  catch {input.focus();input.select();return false;}
}
$('#copy-code').addEventListener('click',async()=>{if(await copyText($('#code').value,$('#code')))flashButton($('#copy-code'),'Code copied');else $('#code-size').textContent='Select and copy the code manually.';});
$('#download-code').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([$('#code').value],{type:'application/x-tierlist'})),link=el('a');link.href=url;link.download=exportFilename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
for(const close of document.querySelectorAll('[data-close]'))close.addEventListener('click',()=>$('#'+close.dataset.close).close());
function renderLobbyBar() {
  $('#lobby-bar').hidden=!lobbyState;$('#return-lobby').hidden=viewingLobby;$('#return-lobby').disabled=busy;
  $('#leave').textContent=lobbyState?.host?'Disband lobby':'Leave lobby';
  $('#lobby-presence').textContent=lobbyState?(lobbyState.connected?`${lobbyState.players.length} player${lobbyState.players.length===1?'':'s'}`:lobbyStatus || 'Reconnecting…'):'';
  $('.join-panel').hidden=!!lobbyState;$('.library-layout').classList.toggle('has-lobby',!!lobbyState);
}
function lockLibrary() {
  for(const selector of ['#new','#import'])$(selector).disabled=busy;
  for(const selector of ['#join','#resume','#player-color'])$(selector).disabled=!!room || busy;
  $('#join-color').disabled=!!room || busy;renderLobbyBar();
}
async function beginRoom(invite='') {
  if(room || busy)return;clearError();await persist();
  const name=$(invite?'#player-name':'#host-name').value.trim();
  if(!name){error('Enter your player name before connecting.');return;}
  const color=cleanColour($('#player-color').value);
  try {localStorage.setItem('tierlist-name',name);localStorage.setItem('tierlist-color',color);} catch {}
  busy=true;lockLibrary();$('#join-name').readOnly=true;if(album)syncWorkspace();
  const previous=album;viewingLobby=true;lobbyTab='rank';lobbyScroll=0;lobbySelected=null;lobbyState=null;lobbyStatus='';activity.reset();ratings.reset();$('#cancel-join').hidden=false;
  const current=new TierRoom({onState:next=>{
    if(room!==current)return;
    const newSelf=next.players.find(player=>player.id===next.self),first=!lobbyState;
    lobbyState=next;renderLobbyBar();if(!viewingLobby)return;
    state=next;album=next.album;selected=first?null:selected;
    if(first)rosterSignature='';
    $('#library').hidden=true;$('#workspace').hidden=false;syncWorkspace();renderPlayers();
    if(first)setTab('rank');
    if(next.connected){$('#join-dialog').close();$('#creating-dialog').close();status('');}
    if(first || renderedSeq!==newSelf?.seq || !next.connected)renderBoard();
    renderedSeq=newSelf?.seq;$('#cancel-join').hidden=true;
    if(activeTab==='everyone')renderComparison();
    if(!$('#invite-fallback').open)$('#invite-output').value=current.invite();
  },onStatus:text=>{if(room!==current)return;lobbyStatus=text;$('#connection').textContent=text;renderLobbyBar();if(viewingLobby && !lobbyState){if($('#creating-dialog').open)$('#creating-status').textContent=text;else status(text);}},onError:problem=>{
    if(room!==current)return;error(problem);
    if(!lobbyState){room=null;viewingLobby=false;busy=false;current.stop().catch(()=>{});$('#creating-dialog').close();status('');lockLibrary();$('#confirm-join').disabled=false;$('#join-name').readOnly=false;$('#cancel-join').hidden=true;if(album){syncWorkspace();renderBoard();}}
  },onEvents:events=>{if(room===current)activity.setEvents(events);}});
  room=current;
  try {await current.open(name,invite?null:presentAlbum(),invite,color);}
  catch(problem) {
    await current.stop();
    if(room===current){room=null;state=null;lobbyState=null;viewingLobby=false;album=previous;$('#creating-dialog').close();error(problem);status('Could not connect');}
  } finally {
    if(room===current || !room){busy=false;lockLibrary();if(album){syncWorkspace();renderBoard();}$('#cancel-join').hidden=!room || !!lobbyState;$('#confirm-join').disabled=!!room;$('#join-name').readOnly=!!room;}
  }
}
function renderPlayers() {
  if(!state)return;
  const signature=JSON.stringify([state.host,state.players.map(player=>[player.id,player.name,player.color,player.online,player.phase,player.progress])]);
  if(signature===rosterSignature)return;rosterSignature=signature;
  const container=$('#players');container.replaceChildren();
  for(const player of state.players) {
    const self=player.id===state.self,chip=el('div',`player${player.online?'':' offline'}`);
    chip.dataset.player=player.id;chip.style.setProperty('--player-color',player.color);
    const select=button('',()=>locateActivity({actor:player.id},{type:'board',id:'board',label:player.name}),'player-select'),name=el('span','player-name',player.name+(self?' (you)':''));
    select.title=`Show ${player.name}’s tierlist`;name.append(el('small','player-status',playerStatus(player)));
    select.append(el('span','player-dot'),name);chip.append(select);
    if(state.host && !self){const remove=button('✕',()=>{if(confirm(`Remove ${player.name} and their board?`))room.remove(player.id);},'remove-player danger');remove.setAttribute('aria-label',`Remove ${player.name}`);chip.append(remove);}
    container.append(chip);
  }
}
function openJoinPrompt(invite) {
  if(room){error('Leave the current lobby before opening another invite.');return;}
  clearError();joinInvite=invite;importController?.abort();
  for(const selector of ['#code-dialog','#host-dialog','#image-dialog'])if($(selector).open)$(selector).close();
  if(!$('#join-dialog').open){$('#join-name').value=$('#player-name').value;$('#join-status').textContent='';$('#confirm-join').disabled=false;$('#join-name').readOnly=false;$('#join-dialog').showModal();}
  $('#join-name').focus();
}
async function cancelJoin() {
  if(lobbyState)return;
  const current=room;room=null;viewingLobby=false;busy=false;if(current)await current.stop();
  joinInvite='';lockLibrary();if(album){syncWorkspace();renderBoard();}$('#cancel-join').hidden=true;$('#confirm-join').disabled=false;$('#join-name').readOnly=false;$('#join-dialog').close();$('#creating-dialog').close();
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);status('');
}
$('#join-form').addEventListener('submit',attempt(async event=>{event.preventDefault();$('#player-name').value=$('#join-name').value;$('#confirm-join').disabled=true;await beginRoom(joinInvite);}));
$('#cancel-join-dialog').addEventListener('click',attempt(cancelJoin));
$('#join-dialog').addEventListener('close',()=>{if(!$('#join-dialog').open && !lobbyState && room)cancelJoin().catch(error);});
$('#host').addEventListener('click',()=>{$('#host-dialog').showModal();$('#host-name').focus();});
$('#host-form').addEventListener('submit',attempt(async event=>{
  event.preventDefault();if(!$('#host-name').value.trim()){$('#host-name').setCustomValidity('Enter your name.');$('#host-name').reportValidity();return;}
  $('#host-dialog').close();$('#creating-status').textContent='Preparing tierlist…';$('#creating-dialog').showModal();
  try{await beginRoom();}finally{if(!room || lobbyState)$('#creating-dialog').close();}
}));
$('#host-name').addEventListener('input',()=>$('#host-name').setCustomValidity(''));
$('#cancel-creating').addEventListener('click',attempt(cancelJoin));$('#creating-dialog').addEventListener('close',()=>{if(!$('#creating-dialog').open && !lobbyState && room)cancelJoin().catch(error);});
$('#join').addEventListener('click',attempt(()=>{const invite=$('#invite-input').value.trim();if(!invite)throw new Error('Paste a lobby invite to join.');return beginRoom(invite);}));
$('#resume').addEventListener('click',()=>openJoinPrompt(savedInvite()));
$('#cancel-join').addEventListener('click',attempt(cancelJoin));
async function shareInvite(code=false) {
  if(!room)return;const value=code?room.inviteCode():room.invite();
  resetFeedback($(code?'#copy-invite-code':'#copy-invite'));
  try {await navigator.clipboard.writeText(value);flashButton($(code?'#copy-invite-code':'#copy-invite'),code?'Code copied':'Link copied');}
  catch {$('#invite-output').value=value;if(!$('#invite-fallback').open)$('#invite-fallback').showModal();$('#invite-output').focus();$('#invite-output').select();}
}
$('#copy-invite').addEventListener('click',()=>shareInvite());$('#copy-invite-code').addEventListener('click',()=>shareInvite(true));
function openCopy() {
  if(!state || !lobbyState || copySaving)return;
  const host=lobbyState.players.find(player=>player.id===lobbyState.hostId);if(!host)throw new Error('The lobby author is unavailable.');
  copyDraft=validateAlbum({...lobbyState.album,copiedFrom:host.name});copyOrigin=$('#save-copy');$('#copy-name').value=copyDraft.name;$('#copy-source').textContent=`Copied from ${copyDraft.copiedFrom}`;$('#copy-error').textContent='';$('#confirm-copy').disabled=false;$('#copy-dialog').showModal();$('#copy-name').focus();$('#copy-name').select();
}
$('#save-copy').addEventListener('click',attempt(()=>openCopy()));
$('#copy-dialog').addEventListener('close',()=>{if(!$('#copy-dialog').open){copyDraft=null;copyOrigin=null;}});
$('#copy-name').addEventListener('input',()=>{$('#copy-error').textContent='';});
$('#copy-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!copyDraft || copySaving)return;const name=$('#copy-name').value.trim();if(!name){$('#copy-error').textContent='Enter a tierlist name.';return;}
  const draft=copyDraft,origin=copyOrigin;copySaving=true;$('#confirm-copy').disabled=true;$('#copy-error').textContent='';
  try {await saveAlbum({...draft,name},true);await refreshLibrary();if(copyDraft===draft){$('#copy-dialog').close();if(origin?.isConnected)flashButton(origin,'Saved');}}
  catch(problem){if(copyDraft===draft)$('#copy-error').textContent=problem.message;}
  finally{copySaving=false;$('#confirm-copy').disabled=false;}
});
async function leaveLobby() {
  const current=room;if(!current)return;
  const prompt=!lobbyState?'Cancel this connection?':lobbyState.host?'End the lobby for everyone?':'Leave this lobby?';
  if(!confirm(prompt))return;await persist();
  if(lobbyState)await current.leave();else await current.stop();
  if(room!==current)return;
  room=null;state=null;lobbyState=null;viewingLobby=false;album=null;selected=null;busy=false;generation++;activeTab='rank';rosterSignature='';activity.reset();ratings.reset();clearTimeout(highlightTimer);highlight=null;
  resetFeedback($('#copy-invite'));resetFeedback($('#copy-invite-code'));
  $('#workspace').hidden=true;$('#workspace').classList.remove('in-lobby');$('#library').hidden=false;$('#resume').hidden=true;lockLibrary();await refreshLibrary();
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);status('');
}
$('#leave').addEventListener('click',attempt(leaveLobby));
addEventListener('beforeunload',event=>{if((room && !room.disposed) || dirty || uploadController || $('#import-tiermaker').disabled || $('#import-code').disabled){event.preventDefault();event.returnValue='';}});
addEventListener('pagehide',()=>{if(dirty)persist().catch(()=>{});});
try {if(!$('#player-name').value)$('#player-name').value=localStorage.getItem('tierlist-name') || '';} catch {}
let preferredColour=randomColour();try{preferredColour=cleanColour(localStorage.getItem('tierlist-color'));}catch{}
for(const selector of ['#player-color','#join-color','#host-color']){
  $(selector).value=preferredColour;$(selector).addEventListener('input',event=>{for(const other of ['#player-color','#join-color','#host-color'])$(other).value=event.target.value;});
}
$('#host-name').value=$('#player-name').value;status('');$('#resume').hidden=!savedInvite();
function joinFromLocation(){if(location.hash.startsWith('#join=') && !(room && joinInvite===location.href))openJoinPrompt(location.href);}
addEventListener('hashchange',joinFromLocation);
await refreshLibrary();joinFromLocation();
