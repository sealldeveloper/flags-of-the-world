export const VERSION=1;
export const ANSWER_MS=25000,PREVIEW_MS=3000;
export const TIERS=Object.freeze({
 plankton:{name:'Plankton',score:10,depth:.08,color:'var(--tier-plankton)',emoji:'🫧'},
 tooclever:{name:'Too Clever',score:15,depth:.18,color:'var(--tier-tooclever)',emoji:'🤡'},
 schooler:{name:'Schooler',score:30,depth:.36,color:'var(--tier-schooler)',emoji:'🐟'},
 rare:{name:'Rare',score:60,depth:.6,color:'var(--tier-rare)',emoji:'🦑'},
 deepcut:{name:'Deep Cut',score:85,depth:.82,color:'var(--tier-deepcut)',emoji:'🏮'},
 krillion:{name:'One in a Krillion',score:100,depth:.97,color:'var(--tier-krillion)',emoji:'🌟'},
});
export function validDate(value){return typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function etDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function dayNumber(date){if(!validDate(date))throw Error('Invalid puzzle date');return Math.round((Date.parse(date+'T12:00:00Z')-Date.parse('2026-07-16T12:00:00Z'))/86400000)+1;}
export function canonical(value){return String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');}
export function validatePublic(today,reveal){
 if(!validDate(today?.date)||today.dayNumber!==dayNumber(today.date)||reveal?.date!==today.date||!Number.isFinite(Date.parse(today.resetsAt)))throw Error('The public puzzle date or number is invalid');
 if(!Array.isArray(today.prompts)||today.prompts.length!==7||!Array.isArray(reveal.prompts)||reveal.prompts.length!==7||new Set(today.prompts.map(p=>p.id)).size!==7)throw Error('Expected seven public prompts');
 for(const prompt of today.prompts){
  const sheet=reveal.prompts.find(p=>p.id===prompt.id);
  if(!/^p[1-7]$/.test(prompt.id)||typeof prompt.text!=='string'||!prompt.text.trim()||prompt.text.length>2000||sheet?.text!==prompt.text||!Array.isArray(sheet.answers)||sheet.answers.length<1||sheet.answers.length>500000)throw Error('Incomplete or mismatched public answer sheet');
  for(const answer of sheet.answers)if(typeof answer?.answer!=='string'||!answer.answer.trim()||answer.answer.length>2000||!Object.hasOwn(TIERS,answer.tier)||answer.score!==TIERS[answer.tier].score||answer.quip!=null&&(typeof answer.quip!=='string'||answer.quip.length>10000))throw Error('Invalid public answer or score');
 }
 return true;
}
export function answerIndex(answers){const index=new Map;for(const answer of answers){const key=canonical(answer.answer);if(!index.has(key))index.set(key,answer);}return index;}
export function outcome(prompt,index,raw){const hit=raw?index.get(canonical(raw)):null;return{promptId:prompt.id,promptText:prompt.text,rawAnswer:raw||null,answer:hit?.answer||null,tier:hit?.tier||null,score:hit?.score||0,...hit?.quip?{quip:hit.quip}:{}};}
export function total(results){return results.reduce((sum,result)=>sum+result.score,0);}
export function bearing(score){return score>=450?'One in a krillion. Trench dweller. Absurd.':score>=351?'Deep cut. Seriously deep dive.':score>=251?'Rare. Below the thermocline. Nice.':score>=151?'Schooler. Swimming with the school.':'Plankton. Plenty of ocean left down there.';}
export function validSave(value,puzzle){
 if(value?.version!==VERSION||value.date!==puzzle.date||!Array.isArray(value.results)||value.results.length>7||!Number.isInteger(value.round)||value.round<0||value.round>6||!['intro','preview','answering','feedback','done'].includes(value.phase))return false;
 if(value.results.some((r,i)=>r?.promptId!==puzzle.prompts[i]?.id||r.promptText!==puzzle.prompts[i]?.text||!(r.tier===null&&r.score===0||Object.hasOwn(TIERS,r.tier)&&TIERS[r.tier].score===r.score)))return false;
 if(value.phase==='intro')return value.round===0&&value.results.length===0;
 if(value.phase==='done')return value.round===6&&value.results.length===7;
 if(value.phase==='feedback')return value.results.length===value.round+1;
 return value.results.length===value.round&&typeof value.endsAt==='number'&&Number.isFinite(value.endsAt)&&value.endsAt>0&&(value.pausedAt==null||typeof value.pausedAt==='number'&&Number.isFinite(value.pausedAt));
}
