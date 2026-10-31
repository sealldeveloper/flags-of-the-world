import {contrastInk} from './social.mjs';
const $=selector=>document.querySelector(selector);
const el=(tag,className='',text='')=>{const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
export class Activity {
  constructor({onLocate}) {this.onLocate=onLocate;this.events=[];}
  setEvents(events) {this.events=events;this.render();}
  render() {
    const feed=$('#activity-feed');if(!feed.getClientRects().length)return;
    const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<40,scroll=feed.scrollTop;
    const ids=new Set(this.events.map(event=>String(event.id)));
    for(const child of [...feed.children])if(!child.dataset.event || !ids.has(child.dataset.event))child.remove();
    if(!this.events.length){if(!feed.firstChild)feed.append(el('p','feed-empty','No activity yet.'));return;}
    const existing=new Set([...feed.children].map(node=>node.dataset.event));
    for(const event of this.events){
      if(existing.has(String(event.id)))continue;
      const entry=el('article','feed-event'),heading=el('div','event-heading'),text=el('p','event-text'),time=el('time','',new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
      entry.dataset.event=String(event.id);entry.style.setProperty('--player-color',event.color);time.dateTime=new Date(event.time).toISOString();
      heading.append(el('span','player-dot'),el('strong','',event.name),time);
      if(event.parts)for(const part of event.parts){
        if(part.type==='text'){text.append(document.createTextNode(part.text));continue;}
        const link=el('button','activity-ref',part.label);link.type='button';link.dataset.reference=part.type;link.dataset.target=part.id;
        link.style.setProperty('--reference-color',part.color);link.style.setProperty('--reference-bg',contrastInk(part.color));
        link.title=`Find ${part.label} on ${event.name}’s tierlist`;link.addEventListener('click',()=>this.onLocate(event,part));text.append(link);
      }else text.textContent=event.text;
      entry.append(heading,text);const following=[...feed.children].find(node=>Number(node.dataset.event)>event.id);feed.insertBefore(entry,following || null);
    }
    feed.scrollTop=nearBottom?feed.scrollHeight:scroll;
  }
  reset() {this.events=[];this.render();}
}
