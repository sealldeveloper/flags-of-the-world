// Public collection metadata only. Never execute page scripts or extract account/session credentials.
export const MAX_MEDIA_ITEMS=500;
const VIDEO=/^[A-Za-z0-9_-]{11}$/,ALBUM=/^[A-Za-z0-9]{22}$/,LIST=/^[A-Za-z0-9_-]{10,80}$/;
export function mediaSource(value,expected){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\\]/.test(value.trim()))throw new Error('Paste a public YouTube playlist or Spotify album URL.');
 let url;try{url=new URL(value.trim());}catch{throw new Error('Paste a public YouTube playlist or Spotify album URL.');}
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new Error('Use a public HTTPS playlist or album URL.');
 let result;
 if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname)){
  const list=url.searchParams.getAll('list');if(list.length!==1||!LIST.test(list[0])||/^(RD|MM)/.test(list[0])||!((url.hostname!=='youtu.be'&&['/playlist','/watch'].includes(url.pathname))||(url.hostname==='youtu.be'&&VIDEO.test(url.pathname.slice(1)))))throw new Error('Use a public YouTube playlist URL with a list ID. Mixes and private lists are not supported.');
  result={kind:'youtube',id:list[0],url:'https://www.youtube.com/playlist?list='+list[0]};
 }else if(url.hostname==='open.spotify.com'){
  const match=url.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?album\/([A-Za-z0-9]{22})\/?$/i);if(!match||!ALBUM.test(match[1]))throw new Error('Use an open.spotify.com album URL, not a track or playlist.');result={kind:'spotify',id:match[1],url:'https://open.spotify.com/album/'+match[1]};
 }else throw new Error('Use a youtube.com playlist or open.spotify.com album URL.');
 if(expected&&result.kind!==expected)throw new Error(expected==='youtube'?'Paste a YouTube playlist URL.':'Paste a Spotify album URL.');return result;
}
export function mediaImageUrl(value){
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\\%]/.test(value))throw new Error('Invalid collection artwork URL.');let url;try{url=new URL(value);}catch{throw new Error('Invalid collection artwork URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)throw new Error('Invalid collection artwork URL.');
 if(url.hostname==='i.ytimg.com'&&/^\/vi\/[A-Za-z0-9_-]{11}\/(?:maxresdefault|sddefault|hqdefault|mqdefault|default)\.jpg$/.test(url.pathname))return url.href;
 if(['i.scdn.co','image-cdn-ak.spotifycdn.com','image-cdn-fa.spotifycdn.com'].includes(url.hostname)&&/^\/image\/[a-f0-9]{40}$/.test(url.pathname))return url.href;
 throw new Error('Only first-party YouTube thumbnails and Spotify artwork can be read.');
}
export function jsonAfter(text,pattern){
 const match=pattern.exec(text);if(!match)throw new Error('This public page does not expose collection metadata.');const start=match.index+match[0].length;
 const end=text.indexOf('</script>',start);if(end!==-1)try{return JSON.parse(text.slice(start,end).trim().replace(/;$/,''));}catch{}
 let depth=0,quoted=false,escaped=false;for(let at=start;at<text.length;at++){const char=text[at];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;}else if(char==='"')quoted=true;else if(char==='{'||char==='[')depth++;else if(char==='}'||char===']'){if(--depth===0)return JSON.parse(text.slice(start,at+1));}}throw new Error('Incomplete public collection metadata.');
}
export function findObject(root,key){
 const stack=[root];let count=0;while(stack.length){if(++count>100000)throw new Error('Collection metadata is too complex.');const node=stack.pop();if(!node||typeof node!=='object')continue;if(Object.hasOwn(node,key))return node[key];const children=Object.values(node);for(let i=children.length-1;i>=0;i--)if(children[i]&&typeof children[i]==='object')stack.push(children[i]);}return null;
}
export const mediaText=value=>typeof value==='string'?value:typeof value?.simpleText==='string'?value.simpleText:typeof value?.content==='string'?value.content:Array.isArray(value?.runs)?value.runs.map(run=>typeof run?.text==='string'?run.text:'').join(''):'';
export function checkedItems(items){if(items.length>MAX_MEDIA_ITEMS)throw new Error(`Use a collection with at most ${MAX_MEDIA_ITEMS} items. No partial tierlist was created.`);return items;}
