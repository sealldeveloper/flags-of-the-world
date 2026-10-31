import{mediaSource,mediaImageUrl,jsonAfter,findObject,mediaText,checkedItems}from'./media-source.mjs';
const VIDEO=/^[A-Za-z0-9_-]{11}$/;
function tokenFrom(view){let command=findObject(view,'continuationCommand');for(let i=0;i<3&&command;i++){if(typeof command.token==='string'&&command.token.length<=65536)return command.token;command=findObject(command,'continuationCommand');}return null;}
export function youtubeEntries(root){
 const stack=[root],items=[];let continuation=null,skipped=0,count=0;
 while(stack.length){if(++count>100000)throw new Error('YouTube playlist metadata is too complex.');const node=stack.pop();if(!node||typeof node!=='object')continue;
  if(node.horizontalShelfViewModel||node.shelfRenderer||node.richShelfRenderer)continue;
  const next=node.continuationItemRenderer||node.continuationItemViewModel;if(next){continuation=tokenFrom(next)||continuation;continue;}
  const old=node.playlistVideoRenderer,modern=node.lockupViewModel;
  if(old||modern){const row=old||modern;if(modern&&row.contentType!=='LOCKUP_CONTENT_TYPE_VIDEO')continue;const id=old?row.videoId:row.contentId,title=mediaText(old?row.title:row.metadata?.lockupMetadataViewModel?.title).trim();
   if(!VIDEO.test(id||'')||!title||row.isPlayable===false||['[Private video]','[Deleted video]','Private video','Deleted video'].includes(title)){skipped++;continue;}
   const artist=old?mediaText(row.shortBylineText):mediaText(row.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text);
   items.push({id,name:title.slice(0,160),artist:artist.slice(0,160),image:`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`});checkedItems(items);continue;
  }
  const children=Object.values(node);for(let i=children.length-1;i>=0;i--)if(children[i]&&typeof children[i]==='object')stack.push(children[i]);
 }
 return{items,continuation,skipped};
}
export function parseYoutube(document,value){
 const source=mediaSource(value,'youtube'),data=jsonAfter(document,/(?:var\s+)?ytInitialData\s*=\s*(?=\{)/),tabs=data.contents?.twoColumnBrowseResultsRenderer?.tabs,tab=Array.isArray(tabs)?tabs.find(value=>value.tabRenderer?.selected)?.tabRenderer||tabs.find(value=>value.tabRenderer)?.tabRenderer:null;
 const root=tab?.content||data.contents?.singleColumnBrowseResultsRenderer,metadata=data.metadata?.playlistMetadataRenderer;
 if(!root||!metadata||typeof metadata.title!=='string')throw new Error('This YouTube playlist is unavailable, private or cannot be read publicly.');
 const legacy=findObject(root,'playlistVideoListRenderer'),sections=findObject(root,'sectionListRenderer')?.contents,section=Array.isArray(sections)?sections.find(value=>value.itemSectionRenderer):null;
 const page=youtubeEntries(legacy?.contents||section?.itemSectionRenderer?.contents||root),warnings=[];if(page.skipped)warnings.push(`${page.skipped} unavailable videos were skipped.`);
 if(data.alerts?.some(alert=>/unavailable|hidden/i.test(mediaText(alert.alertWithButtonRenderer?.text)||mediaText(alert.alertRenderer?.text))))warnings.push('YouTube hides some unavailable videos. Only publicly exposed entries are included.');
 let client=null;if(page.continuation){const config=jsonAfter(document,/ytcfg\.set\(\s*(?=\{)/),value=config.INNERTUBE_CONTEXT?.client;if(value?.clientName!=='WEB'||typeof value.clientVersion!=='string'||!/^2\.[0-9.]{8,40}$/.test(value.clientVersion))throw new Error('YouTube pagination metadata changed. No partial tierlist was created.');client={clientName:'WEB',clientVersion:value.clientVersion};}
 const stats=findObject(data.sidebar,'playlistSidebarPrimaryInfoRenderer')?.stats,count=Array.isArray(stats)?stats.map(mediaText).join(' ').match(/(?:^|\s)([\d,]+) videos?(?:\s|$)/):null,reportedTotal=count?Number(count[1].replaceAll(',','')):null;
 return{kind:'youtube',source:source.url,id:source.id,name:metadata.title.slice(0,120),items:page.items,continuation:page.continuation,client,warnings,skipped:page.skipped,reportedTotal,hiddenUnavailable:warnings.some(value=>value.includes('YouTube hides'))};
}
export function parseYoutubeContinuation(data){
 const append=findObject(data.onResponseReceivedActions||data.onResponseReceivedEndpoints||data,'appendContinuationItemsAction');if(!append||!Array.isArray(append.continuationItems))throw new Error('YouTube could not continue this playlist. No partial tierlist was created.');return youtubeEntries(append.continuationItems);
}
export function parseSpotify(document,value){
 const source=mediaSource(value,'spotify'),data=jsonAfter(document,/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>/i),entity=data.props?.pageProps?.state?.data?.entity;
 if(entity?.type!=='album'||entity.id!==source.id||!Array.isArray(entity.trackList)||!entity.trackList.length)throw new Error('This Spotify album does not expose a public track list.');
 const artwork=entity.visualIdentity?.image;if(!Array.isArray(artwork)||!artwork.length)throw new Error('This Spotify album does not expose artwork.');const images=artwork.map(image=>({url:mediaImageUrl(image.url),size:Number(image.maxWidth)||0})).sort((a,b)=>b.size-a.size),image=images[0].url;
 const items=entity.trackList.map(track=>{const match=typeof track.uri==='string'&&track.uri.match(/^spotify:track:([A-Za-z0-9]{22})$/);if(!match||typeof track.title!=='string'||!track.title.trim())throw new Error('Spotify returned incomplete track metadata.');return{id:match[1],name:track.title.trim().slice(0,160),artist:(typeof track.subtitle==='string'?track.subtitle:entity.subtitle||'').slice(0,160),image};});checkedItems(items);
 const declared=entity.totalTracks??entity.numTracks;if(declared!==undefined&&declared!==items.length)throw new Error('Spotify returned an incomplete album. No partial tierlist was created.');
 return{kind:'spotify',source:source.url,id:source.id,name:(entity.title||entity.name||'Spotify album').slice(0,120),artist:typeof entity.subtitle==='string'?entity.subtitle.slice(0,160):'',cover:image,items,warnings:[]};
}
