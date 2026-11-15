import {contrastInk} from './social.mjs';
const $=selector=>document.querySelector(selector);
const el=(tag,className='',text='')=>{const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
// Only this exact host-derived summary has an unambiguous action and tier scope.
const reorderTier=event=>event.kind==='activity' && event.parts?.length===2 && event.parts[0].type==='text' && event.parts[0].text==='Reordered images in ' && event.parts[1].type==='tier'?event.parts[1]:null;
// Counts describe only the retained history; raw room events and wire data stay untouched.
export function coalesceActivityEvents(events) {
  const grouped=[];
  for(const event of events){
    const previous=grouped.at(-1),tier=reorderTier(event),previousTier=previous && reorderTier(previous);
    if(tier && previousTier && event.id===previous.lastId+1 && event.actor===previous.actor && event.name===previous.name && event.color===previous.color && tier.id===previousTier.id && tier.label===previousTier.label && tier.color===previousTier.color){
      grouped[grouped.length-1]={...event,id:previous.id,lastId:event.id,count:previous.count+1};
    }else grouped.push({...event,lastId:event.id,count:1});
  }
  return grouped;
}
export class Activity {
  constructor({onLocate}) {this.onLocate=onLocate;this.events=[];}
  setEvents(events) {this.events=coalesceActivityEvents(events);this.render();}
  render() {
    const feed=$('#activity-feed');if(!feed.getClientRects().length)return;
    const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<40,scroll=feed.scrollTop;
    const ids=new Set(this.events.map(event=>String(event.id)));
    for(const child of [...feed.children])if(!child.dataset.event || !ids.has(child.dataset.event))child.remove();
    if(!this.events.length){if(!feed.firstChild)feed.append(el('p','feed-empty','No activity yet.'));return;}
    const existing=new Map([...feed.children].map(node=>[node.dataset.event,node]));
    for(const event of this.events){
      const current=existing.get(String(event.id));
      if(current){this.updateRepeat(current,event);continue;}
      const entry=el('article','feed-event'),heading=el('div','event-heading'),text=el('p','event-text'),time=el('time');
      entry.dataset.event=String(event.id);entry.style.setProperty('--player-color',event.color);
      heading.append(el('span','player-dot'),el('strong','',event.name),time);
      if(event.parts)for(const part of event.parts){
        if(part.type==='text'){text.append(document.createTextNode(part.text));continue;}
        const link=el('button','activity-ref',part.label);link.type='button';link.dataset.reference=part.type;link.dataset.target=part.id;
        link.style.setProperty('--reference-color',part.color);link.style.setProperty('--reference-bg',contrastInk(part.color));
        link.title=`Find ${part.label} on ${event.name}’s tierlist`;link.addEventListener('click',()=>this.onLocate(event,part));text.append(link);
      }else text.textContent=event.text;
      entry.append(heading,text);this.updateRepeat(entry,event);const following=[...feed.children].find(node=>Number(node.dataset.event)>event.id);feed.insertBefore(entry,following || null);
    }
    feed.scrollTop=nearBottom?feed.scrollHeight:scroll;
  }
  updateRepeat(entry,event) {
    const time=entry.querySelector('time');time.dateTime=new Date(event.time).toISOString();time.textContent=new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    let repeat=entry.querySelector('.event-repeat');
    if(event.count>1){
      if(!repeat){repeat=el('span','event-repeat');entry.querySelector('.event-text').append(' ',repeat);}
      repeat.textContent=`${event.count}×`;repeat.setAttribute('role','img');repeat.setAttribute('aria-label',`Repeated ${event.count} times`);repeat.title=`Repeated ${event.count} times`;
    }else repeat?.remove();
  }
  reset() {this.events=[];this.render();}
}
