import {contrastInk} from './social.mjs';
import {groupRatings} from './ratings.mjs';
import {imageDimensions,MAX_THUMB_EDGE} from './model.mjs';
const FONT='system-ui, sans-serif',PAD=32,GAP=24,BOARD=640,LABEL=130,TILE=52;
export const IMAGE_PALETTES={
  light:{bg:'#f5f7fb',surface:'#ffffff',inset:'#e6ebf2',text:'#182133',muted:'#556173',border:'#bcc8d8'},
  dark:{bg:'#1a1f2e',surface:'#2d3748',inset:'#4a5568',text:'#e0e6ed',muted:'#a9b2c0',border:'#64748b'}
};
export function wrapLines(ctx,value,width){
  const lines=[];
  for(const paragraph of String(value).split('\n')){
    let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(line && ctx.measureText(line+' '+word).width<=width){line+=' '+word;continue;}
      if(line){lines.push(line);line='';}
      for(const char of word){if(line && ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
    }
    lines.push(line);
  }
  return lines.length?lines:[''];
}
const font=(ctx,size,weight=400)=>{ctx.font=`${weight} ${size}px ${FONT}`;};
export function layoutGroupImage(ctx,snapshot){
  const columns=Math.min(snapshot.players.length,snapshot.players.length>9?4:snapshot.players.length>4?3:2),width=PAD*2+columns*BOARD+(columns-1)*GAP;
  font(ctx,32,700);const title=wrapLines(ctx,snapshot.name,width-PAD*2-60),header=PAD+Math.max(44,title.length*40)+24;
  let y=header,rowHeight=0;const players=[];
  snapshot.players.forEach((player,index)=>{
    if(index && index%columns===0){y+=rowHeight+GAP;rowHeight=0;}
    font(ctx,20,700);const name=wrapLines(ctx,player.name,BOARD-24),status=player.phase==='ready'?'':player.phase==='offline'?'Offline':'Loading assets';
    const heading=name.length*26+(status?20:0)+16;
    const rows=[...player.board.tiers,{id:'unranked',name:'Unranked',items:player.board.unranked}].map(row=>{
      font(ctx,14,700);const lines=wrapLines(ctx,row.name,LABEL-16),perLine=Math.max(1,Math.floor((BOARD-LABEL-12)/(TILE+4)));
      return {...row,lines,perLine,height:Math.max(64,lines.length*19+16,Math.ceil(row.items.length/perLine)*(TILE+4)+12)};
    });
    const height=heading+rows.reduce((sum,row)=>sum+row.height,0);players.push({player,x:PAD+(index%columns)*(BOARD+GAP),y,name,status,heading,rows,height});rowHeight=Math.max(rowHeight,height);
  });
  y+=rowHeight+40;const footerY=y,ratings=groupRatings(snapshot.images,snapshot.players),known=new Map(snapshot.images.map(image=>[image.id,image]));
  const methodWidth=(width-PAD*2-GAP)/2,itemWidth=(methodWidth-16)/2,methods=[];let footerHeight=0;
  for(const [index,mode] of ['tiers','ordered'].entries()){
    const sides=['highest','lowest'].map(side=>{
      const values=ratings[mode][side];let height=0;
      const items=values.map(value=>{font(ctx,13,500);const image=known.get(value.id),lines=wrapLines(ctx,image.label,itemWidth-54),item={...value,image,lines,y:height,height:Math.max(52,lines.length*18+26)};height+=item.height+8;return item;});
      return {side,items,height:Math.max(52,height),label:side==='highest'?'Highest rated':'Lowest rated'};
    });
    const height=Math.max(...sides.map(side=>side.height));footerHeight=Math.max(footerHeight,height);
    methods.push({mode,x:PAD+index*(methodWidth+GAP),width:methodWidth,itemWidth,sides});
  }
  const height=footerY+100+footerHeight+90,scale=Math.min(1,30000/height,30000/width,Math.sqrt(24000000/(width*height)));
  if(!Number.isFinite(scale) || scale<.25)throw new Error('This lobby is too large for a readable single image. Try fewer items.');
  return {width,height,scale,title,players,footerY,methods};
}
function textLines(ctx,lines,x,y,lineHeight){for(const line of lines){ctx.fillText(line,x,y);y+=lineHeight;}}
function contain(ctx,image,x,y,width,height){
  if(!image)return;const ratio=Math.min(width/image.width,height/image.height);ctx.drawImage(image,x+(width-image.width*ratio)/2,y+(height-image.height*ratio)/2,image.width*ratio,image.height*ratio);
}
async function thumbnails(images,signal){
  const map=new Map();
  try{
    for(const image of images){
      signal?.throwIfAborted();const data=image.thumb || image.data;imageDimensions(data,image.thumb?MAX_THUMB_EDGE:undefined);const blob=await(await fetch(data,{signal})).blob(),ratio=Math.min(1,56/Math.max(image.width,image.height));
      const bitmap=await createImageBitmap(blob,{resizeWidth:Math.max(1,Math.round(image.width*ratio)),resizeHeight:Math.max(1,Math.round(image.height*ratio)),resizeQuality:'high'});map.set(image.id,bitmap);
    }
    return map;
  }catch(error){for(const bitmap of map.values())bitmap.close();throw error;}
}
async function paint(snapshot,layout,palette,art,icon,signal){
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(layout.width*layout.scale);canvas.height=Math.ceil(layout.height*layout.scale);
  try{
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not create the group image.');ctx.scale(layout.scale,layout.scale);ctx.textBaseline='top';ctx.imageSmoothingQuality='high';
    ctx.fillStyle=palette.bg;ctx.fillRect(0,0,layout.width,layout.height);ctx.drawImage(icon,PAD,PAD,40,40);
    ctx.fillStyle=palette.text;font(ctx,32,700);textLines(ctx,layout.title,PAD+60,PAD,40);
    for(const [index,board] of layout.players.entries()){
      signal?.throwIfAborted();const {player,x,y}=board;
      ctx.fillStyle=player.color;ctx.beginPath();ctx.arc(x+5,y+12,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle=palette.border;ctx.stroke();
      ctx.fillStyle=palette.text;font(ctx,20,700);textLines(ctx,board.name,x+20,y,26);
      if(board.status){ctx.fillStyle=palette.muted;font(ctx,13);ctx.fillText(board.status,x+20,y+board.name.length*26);}
      let rowY=y+board.heading;
      for(const row of board.rows){
        ctx.fillStyle=palette.surface;ctx.fillRect(x,rowY,BOARD,row.height);ctx.fillStyle=row.color || palette.inset;ctx.fillRect(x,rowY,LABEL,row.height);
        ctx.fillStyle=row.color?contrastInk(row.color):palette.text;font(ctx,14,700);textLines(ctx,row.lines,x+8,rowY+(row.height-row.lines.length*19)/2,19);
        row.items.forEach((id,at)=>{
          const tx=x+LABEL+6+(at%row.perLine)*(TILE+4),ty=rowY+6+Math.floor(at/row.perLine)*(TILE+4);
          ctx.fillStyle=palette.bg;ctx.fillRect(tx,ty,TILE,TILE);contain(ctx,art.get(id),tx,ty,TILE,TILE);
        });
        ctx.strokeStyle=palette.border;ctx.lineWidth=1;ctx.strokeRect(x+.5,rowY+.5,BOARD-1,row.height-1);rowY+=row.height;
      }
      if(index%4===3)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const y=layout.footerY;ctx.fillStyle=palette.text;font(ctx,22,700);ctx.fillText('Group ratings',PAD,y);
    ctx.fillStyle=palette.muted;font(ctx,13);ctx.fillText('Unranked and loading players are excluded. Ties are shared.',PAD,y+30);
    for(const method of layout.methods){
      ctx.fillStyle=palette.text;font(ctx,17,700);ctx.fillText(method.mode==='tiers'?'Tiers only':'Tiers + left-to-right',method.x,y+60);
      method.sides.forEach((side,index)=>{
        const x=method.x+index*(method.itemWidth+16);ctx.fillStyle=palette.text;font(ctx,14,700);ctx.fillText(side.label+(side.items.length>1?` · ${side.items.length} tied`:''),x,y+88);
        if(!side.items.length){ctx.fillStyle=palette.muted;font(ctx,13);ctx.fillText('No ranked images yet.',x,y+118);}
        for(const item of side.items){
          const iy=y+118+item.y;contain(ctx,art.get(item.id),x,iy,40,40);ctx.fillStyle=palette.text;font(ctx,13,500);textLines(ctx,item.lines,x+50,iy,18);
          ctx.fillStyle=palette.muted;font(ctx,12);ctx.fillText(`${item.votes} ranking${item.votes===1?'':'s'}`,x+50,iy+item.lines.length*18+3);
        }
      });
    }
    ctx.drawImage(icon,PAD,layout.height-48,24,24);ctx.fillStyle=palette.muted;font(ctx,17,500);ctx.fillText('Tier List on puzzle.seall.dev',PAD+34,layout.height-45);
    signal?.throwIfAborted();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('The group image could not be encoded.');signal?.throwIfAborted();
    return {blob,width:canvas.width,height:canvas.height};
  }finally{canvas.width=canvas.height=1;}
}
export async function renderGroupImages(snapshot,{signal,onProgress=()=>{},first='light'}={}){
  if(!snapshot.players.length)throw new Error('There are no player boards to export.');
  const metrics=document.createElement('canvas').getContext('2d'),layout=layoutGroupImage(metrics,snapshot);let art;
  try{
    onProgress('Preparing images…');art=await thumbnails(snapshot.images,signal);const icon=new Image();icon.src=new URL('./icon.svg',import.meta.url).href;await icon.decode();signal?.throwIfAborted();
    const result={};for(const theme of[first,first==='light'?'dark':'light']){onProgress(`Generating ${theme} image…`);result[theme]=await paint(snapshot,layout,IMAGE_PALETTES[theme],art,icon,signal);}return result;
  }finally{if(art)for(const bitmap of art.values())bitmap.close();}
}
