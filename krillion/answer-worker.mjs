import{answerIndex,outcome,canonical}from'./model.mjs';import{readBank,checkPuzzle}from'./reader.mjs';
let puzzle=null,banks=[],indices=[];
self.onmessage=async({data})=>{const{id,type}=data;try{
 if(type==='load'){puzzle=checkPuzzle(data.puzzle);banks=[];indices=[];const base=new URL('./puzzles/',self.location.href);for(const prompt of puzzle.prompts){const answers=await readBank(prompt,base);banks.push(answers);indices.push(answerIndex(answers));self.postMessage({type:'progress',loaded:banks.length,total:7});}self.postMessage({id,ok:true,result:true});return;}
 if(!puzzle||banks.length!==7||!Number.isInteger(data.round)||data.round<0||data.round>=7)throw Error('Answer sheets are not ready.');
 if(type==='guess'){const raw=typeof data.raw==='string'?data.raw.slice(0,256):'';self.postMessage({id,ok:true,result:outcome(puzzle.prompts[data.round],indices[data.round],raw)});return;}
 if(type==='answers'){const query=canonical(data.search||''),tier=typeof data.tier==='string'?data.tier:'all',matches=banks[data.round].filter(answer=>(tier==='all'||answer.tier===tier)&&(!query||canonical(answer.answer).includes(query))),offset=Math.max(0,Math.min(500000,Number(data.offset)||0));self.postMessage({id,ok:true,result:{total:matches.length,offset,answers:matches.slice(offset,offset+100)}});return;}
 throw Error('Unknown archive operation.');
 }catch(error){self.postMessage({id,ok:false,error:error.message||'The answer sheet could not be read.'});}};
