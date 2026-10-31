// Public TierMaker data only. Never execute page scripts or evaluate JavaScript literals.
const SLUG='[A-Za-z0-9][A-Za-z0-9_-]{0,250}';
const PAGE=new RegExp('^/(?:create/'+SLUG+'|(?:categories|list)/[A-Za-z0-9][A-Za-z0-9_/-]{1,500})/?$');
const IMAGE=/^\/(?:images\/(?:chart|templates|media\/(?:template_images|hero_images))|media\/(?:template_images|hero_images))\/[A-Za-z0-9_./ ()+-]+$/i;
const PALETTE=['#ff7f7f','#ffbf7f','#ffdf7f','#ffff7f','#bfff7f','#7fff7f','#7fffff','#7fbfff','#7f7fff','#ff7fff','#bf7fbf','#3b3b3b','#858585','#cfcfcf','#f7f7f7'];
export function tiermakerPublicUrl(value,kind='page'){
 if(typeof value!=='string'||value.length>2048)throw new Error('Invalid TierMaker URL.');
 const raw=value.trim();if(/[\\\u0000-\u001f\u007f]/.test(raw))throw new Error('Invalid TierMaker URL.');
 const authority=/^https:\/\/(?:www\.)?tiermaker\.com(?::443)?(?=\/|[?#]|$)/i.exec(raw);if(!authority)throw new Error('Use an HTTPS tiermaker.com URL.');
 let path;try{path=decodeURIComponent(raw.slice(authority[0].length).split(/[?#]/,1)[0]||'/');}catch{throw new Error('Invalid TierMaker path.');}
 if(/[\\%\u0000-\u001f\u007f]/.test(path)||path.split('/').some(part=>part==='.'||part==='..'))throw new Error('Invalid TierMaker path.');
 const url=new URL(raw);if(url.username||url.password||!['tiermaker.com','www.tiermaker.com'].includes(url.hostname)||url.protocol!=='https:'||(url.port&&url.port!=='443'))throw new Error('Use an HTTPS tiermaker.com URL.');
 if(kind==='image'){if(!IMAGE.test(path))throw new Error('Only TierMaker template images can be imported.');}
 else if(kind==='api'){
  const keys=[...url.searchParams.keys()];
  if(path!=='/api/'||keys.length!==4||new Set(keys).size!==4||keys.some(key=>!['type','id','lastEdited','variation'].includes(key))||url.searchParams.get('type')!=='templates-v2'||!new RegExp('^'+SLUG+'$').test(url.searchParams.get('id'))||!/^[-0-9 :]{0,40}$/.test(url.searchParams.get('lastEdited'))||!/^[A-Za-z0-9_-]{0,100}$/.test(url.searchParams.get('variation')))throw new Error('Invalid TierMaker API request.');
 }else if(kind!=='page'||!PAGE.test(path))throw new Error('Use a TierMaker template or saved tier list URL.');
 url.hostname='tiermaker.com';url.pathname=path;url.hash='';if(kind!=='api')url.search='';return url.href;
}
function entities(value){
 const names={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
 return String(value).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt|nbsp);/gi,(all,key)=>{if(key[0]!=='#')return names[key.toLowerCase()];const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';});
}
function plain(value){return entities(String(value).replace(/<[^>]*>/g,'')).trim();}
function literal(value){
 if(!value)return '';let result='';
 for(let i=1;i<value.length-1;i++){
  let ch=value[i];if(ch!=='\\'){if(ch==='\r'||ch==='\n')throw new Error('Unsupported TierMaker template metadata.');result+=ch;continue;}
  ch=value[++i];const simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0','\\':'\\','"':'"',"'":"'",'/':'/'};
  if(Object.hasOwn(simple,ch))result+=simple[ch];
  else if(ch==='x'||ch==='u'){const length=ch==='x'?2:4,hex=value.slice(i+1,i+1+length);if(!new RegExp('^[0-9a-f]{'+length+'}$','i').test(hex))throw new Error('Unsupported TierMaker template metadata.');result+=String.fromCharCode(parseInt(hex,16));i+=length;}
  else throw new Error('Unsupported TierMaker template metadata.');
 }
 return result;
}
export function parseTiermakerPage(document,source){
 if(typeof document!=='string'||new TextEncoder().encode(document).length>2*1024*1024)throw new Error('TierMaker page exceeds the import size limit.');
 const meta=Object.create(null);
 for(const tag of document.matchAll(/<meta(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi)){
  const attrs=Object.create(null);for(const item of tag[0].slice(5,-1).matchAll(/([^\s=<>\/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>'"=]+)))?/g))attrs[item[1].toLowerCase()]=entities(item[2]??item[3]??item[4]??'');
  const key=attrs.property||attrs.name;if(key)meta[key.toLowerCase()]=attrs.content||'';
 }
 const quoted=String.raw`("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`;
 const match=new RegExp(String.raw`tierSystem\.initList\(\s*${quoted}\s*,\s*${quoted}\s*(?:,\s*${quoted})?\s*\)`).exec(document);
 if(!match)throw new Error('This TierMaker page does not expose an importable template.');
 const [code,slug,variation]=match.slice(1).map(literal);
 if(!new RegExp('^'+SLUG+'$').test(slug)||!/^[A-Za-z0-9_-]{0,100}$/.test(variation))throw new Error('Unsupported TierMaker template identifier.');
 const edited=/dateLastEdited\s*=\s*['"]([0-9 :\-]{1,40})['"]/.exec(document)?.[1]||'';
 let title=plain(meta['og:title']||/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(document)?.[1]||'');
 title=title.replace(/^Create (?:a|an)\s+/i,'').replace(/\s*(?:Tier List(?: Maker)?| - TierMaker)\s*$/i,'').replace(/\s*Tier List\s*$/i,'').trim();
 let cover='';try{const candidate=meta['og:image']||meta['twitter:image'];if(candidate)cover=tiermakerPublicUrl(new URL(candidate,source).href,'image');}catch{}
 return {name:(title||slug.replaceAll('-',' ')).slice(0,120),description:plain(meta.description||'').slice(0,1000),slug,variation,code,edited,source,cover};
}
export function tiermakerManifest(page,data){
 if(!Array.isArray(data)||data.length<2||typeof data[0]!=='string')throw new Error('Unsupported TierMaker image list.');
 let base;
 if(data[0]===page.slug)base='https://tiermaker.com/images/chart/chart/'+page.slug+'/';
 else{
  const root=new URL(data[0],'https://tiermaker.com/');
  if(root.origin!=='https://tiermaker.com'||root.username||root.password||root.search||root.hash||!new RegExp('^/media/template_images/[0-9]{4}/[0-9]+/'+page.slug+'$').test(root.pathname))throw new Error('Unsupported TierMaker asset path.');
  base='https://tiermaker.com/images'+root.pathname+'/';
 }
 const seen=new Set(),images=data.slice(1).map((entry,index)=>{
  const object=entry!==null&&typeof entry==='object'&&!Array.isArray(entry),src=object?entry.src:entry,rawId=object?(entry.id??index+1):index+1;
  if(typeof src!=='string'||src.length>2048||!(typeof rawId==='string'||Number.isSafeInteger(rawId)))throw new Error('Invalid TierMaker image entry.');
  const id=String(rawId);if(!id||id.length>2048||seen.has(id))throw new Error('Invalid TierMaker image entry.');seen.add(id);
  // Validate relative paths before URL resolution can erase traversal segments.
  let decoded;try{decoded=decodeURIComponent(src);}catch{throw new Error('Invalid TierMaker image entry.');}
  if(/[\\%\u0000-\u001f\u007f]/.test(decoded)||decoded.split(/[/?#]/).some(part=>part==='.'||part==='..'))throw new Error('Invalid TierMaker image entry.');
  const url=tiermakerPublicUrl(new URL(src,base).href,'image');let label=object?plain(entry.name||entry.label||''):'';
  if(!label)label=decodeURIComponent(new URL(url).pathname.split('/').pop()).replace(/\.[^.]*$/,'').replaceAll('-',' ').replaceAll('_',' ');
  return{id,url,label:label.slice(0,160)||'Image '+(index+1)};
 });
 const placed=new Set(),tiers=[];
 if(page.code){
  const rows=page.code.split('==');if(rows.shift()!==page.slug)throw new Error('Unsupported TierMaker saved ranking.');
  for(const [index,row]of rows.entries()){
   const values=row.split('|');if(values.length<2||!/^[-+]?\d+$/.test(values[1].trim()))throw new Error('Invalid TierMaker saved ranking.');
   let color=Number(values[1]);if(color===-1)color=index;if(!Number.isInteger(color)||color<0||color>=PALETTE.length)throw new Error('Unsupported TierMaker row colour.');
   const items=values.slice(2);for(const item of items){if(!seen.has(item)||placed.has(item))throw new Error('Invalid image placement in TierMaker ranking.');placed.add(item);}
   tiers.push({name:plain(values[0]).slice(0,100)||'Tier '+(index+1),color:PALETTE[color],items});
  }
 }
 return{name:page.name,description:page.description,source:page.source,images,tiers,...(page.cover?{cover:page.cover}:{})};
}
