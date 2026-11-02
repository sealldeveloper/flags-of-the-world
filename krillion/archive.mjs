// Archive only the two anonymous public daily responses. No accounts or paid archives.
import{readFile,writeFile,mkdir,readdir,rename}from'node:fs/promises';
import{fileURLToPath}from'node:url';import path from'node:path';import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';
import{validatePublic,validDate,etDate}from'./model.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function readPublic(url,{fetcher=fetch}={}){
 const target=new URL(url);if(target.origin!=='https://krillion.io'||target.username||target.password||target.hash||!['/api/today','/api/reveal'].includes(target.pathname)||target.pathname==='/api/today'&&target.search||target.pathname==='/api/reveal'&&([...target.searchParams.keys()].join(',')!=='date'||!validDate(target.searchParams.get('date'))))throw Error('Only anonymous public daily endpoints are allowed');
 const response=await fetcher(target,{redirect:'error',signal:AbortSignal.timeout(45000),headers:{Accept:'application/json','Cache-Control':'no-cache','User-Agent':'Daily puzzle preservation (+https://puzzle.seall.dev/krillion/)'}});
 if(!response.ok)throw Error(`Public daily request failed (${response.status})`);
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>64*1024*1024)throw Error('Public answer sheet exceeds 64 MiB');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function atomic(file,bytes){await mkdir(path.dirname(file),{recursive:true});const temp=file+'.tmp';await writeFile(temp,bytes);await rename(temp,file);}
export async function archive({root=path.join(ROOT,'puzzles'),today,reveal,now=new Date()}={}){
 const live=today==null;today??=await readPublic('https://krillion.io/api/today');if(live&&today.date!==etDate(now))throw Error('The public daily response is stale or has a different New York date');reveal??=await readPublic('https://krillion.io/api/reveal?date='+encodeURIComponent(today.date));validatePublic(today,reveal);
 const prompts=[];let newBanks=0;
 for(const prompt of today.prompts){
  const sheet=reveal.prompts.find(p=>p.id===prompt.id),raw=Buffer.from(JSON.stringify({version:1,text:sheet.text,answers:sheet.answers})),hash=digest(raw),compressed=gzipSync(raw,{level:9,mtime:0}),file=`banks/${hash}.json.gz`,target=path.join(root,file);
  try{const existing=await readFile(target);if(digest(existing)!==digest(compressed))throw Error('An immutable answer bank does not match its hash');}catch(error){if(error.code!=='ENOENT')throw error;await atomic(target,compressed);newBanks++;}
  prompts.push({...prompt,bank:file,rawSha256:hash,sha256:digest(compressed),bytes:compressed.length,expandedBytes:raw.length,answerCount:sheet.answers.length});
 }
 const content={version:1,date:today.date,dayNumber:today.dayNumber,resetsAt:today.resetsAt,prompts},contentSha256=digest(JSON.stringify(content)),filename=`${today.date.slice(0,4)}/${today.date.slice(5,7)}/${today.date}.json`,target=path.join(root,filename);
 let previous;try{previous=JSON.parse(await readFile(target,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const changed=previous?.contentSha256!==contentSha256;
 if(changed)await atomic(target,JSON.stringify({...content,contentSha256,capturedAt:now.toISOString(),source:{name:'Krillion',url:'https://krillion.io/',today:'https://krillion.io/api/today',reveal:'https://krillion.io/api/reveal?date='+today.date},matching:'Public canonical answer sheet. Private server aliases, corrections and live popularity are not exported.'},null,2)+'\n');
 const entries=[];
 for(const year of(await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()&&/^20\d\d$/.test(d.name)))for(const month of(await readdir(path.join(root,year.name),{withFileTypes:true})).filter(d=>d.isDirectory()&&/^\d\d$/.test(d.name)))for(const file of(await readdir(path.join(root,year.name,month.name))).filter(f=>/^20\d\d-\d\d-\d\d\.json$/.test(f))){const date=file.slice(0,-5);if(!validDate(date))continue;const data=JSON.parse(await readFile(path.join(root,year.name,month.name,file),'utf8'));if(data.date!==date||data.version!==1||data.prompts.length!==7)throw Error('Invalid existing archive metadata');entries.push({date,dayNumber:data.dayNumber,file:`${year.name}/${month.name}/${file}`,contentSha256:data.contentSha256,answerCount:data.prompts.reduce((sum,p)=>sum+p.answerCount,0)});}
 entries.sort((a,b)=>b.date.localeCompare(a.date));await atomic(path.join(root,'manifest.json'),JSON.stringify({version:1,source:'https://krillion.io/',puzzles:entries},null,2)+'\n');
 return{date:today.date,changed,newBanks,answers:prompts.reduce((sum,p)=>sum+p.answerCount,0),compressedBytes:prompts.reduce((sum,p)=>sum+p.bytes,0)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const fixture=process.argv.indexOf('--fixture-dir'),data=fixture>=0?{today:JSON.parse(await readFile(path.join(process.argv[fixture+1],'today.json'),'utf8')),reveal:JSON.parse(await readFile(path.join(process.argv[fixture+1],'reveal.json'),'utf8'))}:{};console.log(JSON.stringify(await archive(data),null,2));}catch(error){console.error('Krillion archive failed: '+error.message);process.exitCode=1;}
}
