export const MAX_EVENTS=80,MAX_EVENT_TEXT=600;
const COLOURS=['#bd5948','#4d8abf','#9b62b2','#598d4e','#c49330','#7470c7','#b65f8a','#39998d','#b1773c','#698cbb','#b55f64','#878342','#648b85','#986b48','#8775a4','#697c45'];
const identifier=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const cleanText=(value,max)=>{if(typeof value!=='string' || !value.trim() || value.length>max || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value))throw new Error('Invalid activity text');return value;};
const safeText=value=>value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim() || 'Unnamed';
export function randomColour(used=[]) {
  const available=COLOURS.filter(colour=>!used.includes(colour)),pool=available.length?available:COLOURS;
  return pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length];
}
export function cleanColour(value) {
  if(typeof value!=='string' || !/^#[0-9a-f]{6}$/i.test(value))throw new Error('Invalid player colour');
  return value.toLowerCase();
}
// The same black/white contrast choice works for category backgrounds and coloured text.
export function contrastInk(color) {
  const rgb=cleanColour(color).slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.179?'#000000':'#ffffff';
}
export function validateEvent(event) {
  if(!event || !Number.isSafeInteger(event.id) || event.id<1 || !Number.isSafeInteger(event.time) || event.time<0 || event.time>8640000000000000 || event.kind!=='activity' || !/^[a-f0-9]{32}$/.test(event.actor))throw new Error('Invalid lobby event');
  const result={id:event.id,time:event.time,kind:'activity',actor:event.actor,name:cleanText(event.name,40),color:cleanColour(event.color),text:cleanText(event.text,MAX_EVENT_TEXT)};
  if(event.parts!==undefined){
    if(!Array.isArray(event.parts) || !event.parts.length || event.parts.length>12)throw new Error('Invalid activity references');
    result.parts=event.parts.map(part=>{
      if(part?.type==='text')return {type:'text',text:cleanText(part.text,MAX_EVENT_TEXT)};
      if(!part || !['image','tier','board'].includes(part.type) || !identifier(part.id))throw new Error('Invalid activity reference');
      return {type:part.type,id:part.id,label:cleanText(part.label,part.type==='image'?160:100),color:cleanColour(part.color)};
    });
    if(result.parts.map(part=>part.type==='text'?part.text:part.label).join('')!==result.text)throw new Error('Invalid activity summary');
  }
  return result;
}
const words=text=>({type:'text',text});
const tierRef=row=>({type:'tier',id:row.id,label:safeText(row.name),color:row.color || '#667085'});
const boardRef=()=>({type:'board',id:'board',label:'tiers',color:'#667085'});
const change=(...parts)=>({text:parts.map(part=>part.type==='text'?part.text:part.label).join(''),parts});
export function boardChange(before,after,images) {
  const previous=new Map(before.tiers.map(row=>[row.id,row])),next=new Map(after.tiers.map(row=>[row.id,row]));
  const added=after.tiers.filter(row=>!previous.has(row.id)),removed=before.tiers.filter(row=>!next.has(row.id));
  if(added.length)return change(words('Added tier '),tierRef(added[0]));
  if(removed.length)return change(words('Deleted tier '),tierRef(removed[0]),...(removed[0].items.length?[words(' and moved its images to '),tierRef({id:'unranked',name:'Unranked'})]:[]));
  for(const row of after.tiers){const old=previous.get(row.id);if(row.name!==old.name)return change(words('Renamed '),tierRef(old),words(' to '),tierRef(row));if(row.color!==old.color)return change(words('Changed the colour of '),tierRef(row));}
  if(before.tiers.map(row=>row.id).join()!==after.tiers.map(row=>row.id).join())return change(words('Reordered '),boardRef());
  const positions=board=>new Map([...board.tiers,{id:'unranked',name:'Unranked',items:board.unranked}].flatMap(row=>row.items.map(id=>[id,row])));
  const old=positions(before),now=positions(after),moved=[...now].filter(([id,row])=>old.get(id)?.id!==row.id);
  if(moved.length===1){const [id,to]=moved[0],label=safeText(images.find(image=>image.id===id)?.label || 'Image');return change(words('Moved '),{type:'image',id,label,color:to.color || '#667085'},words(' from '),tierRef(old.get(id)),words(' to '),tierRef(to));}
  if(moved.length)return change(words(`Moved ${moved.length} images`),...(moved.every(([,to])=>to.id==='unranked')?[words(' to '),tierRef({id:'unranked',name:'Unranked'})]:[words(' between '),boardRef()]));
  for(const row of [...after.tiers,{id:'unranked',name:'Unranked',items:after.unranked}]){
    const earlier=row.id==='unranked'?before.unranked:previous.get(row.id).items;
    if(earlier.join()!==row.items.join())return change(words('Reordered images in '),tierRef(row));
  }
  return null;
}
