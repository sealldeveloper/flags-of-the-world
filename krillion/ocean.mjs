import {projectDepth,clamp,mix} from './motion.mjs';
const STOPS=[[0,'#1d5580'],[150,'#123a5e'],[350,'#0b1526'],[800,'#081020'],[1400,'#050a14'],[2600,'#03070f'],[5200,'#02050b']];
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function waterColor(depth){
  for(let i=1;i<STOPS.length;i++)if(depth<=STOPS[i][0]){const [a,from]=STOPS[i-1],[b,to]=STOPS[i],t=clamp((depth-a)/(b-a));return 'rgb('+rgb(from).map((n,j)=>Math.round(mix(n,rgb(to)[j],t))).join(',')+')';}
  return STOPS.at(-1)[1];
}
function fish(ctx,x,y,size,direction){ctx.save();ctx.translate(x,y);ctx.scale(direction,1);ctx.beginPath();ctx.ellipse(0,0,size,size*.44,0,0,Math.PI*2);ctx.moveTo(-size,0);ctx.lineTo(-size*1.7,-size*.55);ctx.lineTo(-size*1.7,size*.55);ctx.closePath();ctx.fill();ctx.restore();}

export class OceanCanvas {
  constructor(canvas,wake){
    this.canvas=canvas;try{this.ctx=canvas.getContext('2d',{alpha:false});}catch{this.ctx=null;}this.snow=[];this.bubbles=[];this.sparks=[];this.previousCamera=null;this.frames=0;
    this.images={};
    if(this.ctx)for(const [key,file]of Object.entries({sky:'ocean-sky.webp',top:'ocean-top.webp',mid:'ocean-mid.webp',trench:'ocean-trench.webp',floor:'water-bg.webp',krill:'krillion.png',schooler:'schooler.png'})){
      const image=new Image();image.onload=wake;image.src=new URL('./assets/'+file,import.meta.url);this.images[key]=image;
    }
  }
  resize(width,height){
    if(!this.ctx)return;
    this.width=width;this.height=height;const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(2100000/(width*height)));
    this.canvas.width=Math.max(1,Math.round(width*ratio));this.canvas.height=Math.max(1,Math.round(height*ratio));this.ctx.setTransform(ratio,0,0,ratio,0,0);
    this.ctx.imageSmoothingEnabled=false;this.snow=Array.from({length:Math.min(110,Math.round(width*height/5000))},()=>({x:Math.random()*width,y:Math.random()*height,size:.6+Math.random()*2,parallax:.35+Math.random(),phase:Math.random()*7}));
  }
  bubble(x,y,frame,count=1){for(let i=0;i<count&&this.bubbles.length<90;i++)this.bubbles.push({x:x+(Math.random()-.5)*24,depth:frame.camera+(y-this.height/2)/2,size:1+Math.random()*3,age:0,phase:Math.random()*6});}
  burst(x,y,frame,color,count=20){for(let i=0;i<count&&this.sparks.length<150;i++){const angle=Math.random()*Math.PI*2,speed=25+Math.random()*90;this.sparks.push({x,depth:frame.camera+(y-this.height/2)/2,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed/2,age:0,life:.6+Math.random()*.8,color});}}
  draw(frame,dt=0,{still=false}={}){
    const c=this.ctx;if(!c)return;const w=this.width,h=this.height,time=still?0:frame.time/1000,screen=depth=>projectDepth(depth,frame.camera,h),dy=this.previousCamera===null?0:2*(frame.camera-this.previousCamera);this.previousCamera=frame.camera;
    const gradient=c.createLinearGradient(0,0,0,h);for(const [offset,depth]of [[0,frame.camera-h/4],[.5,frame.camera],[1,frame.camera+h/4]])gradient.addColorStop(offset,waterColor(depth));c.fillStyle=gradient;c.fillRect(0,0,w,h);
    for(const [key,start,end,alpha]of [['top',40,470,.45],['mid',480,2620,.5],['trench',2950,7060,.55]]){
      const image=this.images[key],top=screen(start),bottom=screen(end);if(!image?.complete||!image.naturalWidth||bottom<0||top>h)continue;
      const tile=w*image.naturalHeight/image.naturalWidth;c.save();c.beginPath();c.rect(0,top,w,bottom-top);c.clip();c.globalAlpha=alpha;
      for(let y=top+Math.floor(Math.max(0,-top)/tile)*tile;y<Math.min(h,bottom);y+=tile)c.drawImage(image,0,y,w,tile+1);c.restore();
      for(const [edge,depth,reverse]of [[top,start,false],[bottom-120,end,true]])if(edge<h&&edge+120>0){const fade=c.createLinearGradient(0,edge,0,edge+120),color=waterColor(depth);fade.addColorStop(reverse?1:0,color);fade.addColorStop(reverse?0:1,color.startsWith('#')?color+'00':color.replace('rgb(','rgba(').replace(')',',0)'));c.fillStyle=fade;c.fillRect(0,edge,w,120);}
    }
    const surface=screen(0);
    if(surface>-20){const sky=this.images.sky;c.fillStyle='#81cbe8';c.fillRect(0,0,w,Math.max(0,surface));if(sky?.complete&&sky.naturalWidth){const sh=w*sky.naturalHeight/sky.naturalWidth;c.drawImage(sky,0,surface+6-sh,w,sh);}
      c.beginPath();c.moveTo(0,surface);for(let x=0;x<=w+8;x+=8)c.lineTo(x,surface+3*Math.sin(x*.02+time*1.6)+2*Math.sin(x*.011-time));c.lineTo(w,surface+30);c.lineTo(0,surface+30);c.closePath();c.fillStyle=waterColor(0);c.fill();c.beginPath();for(let x=0;x<=w+8;x+=8){const y=surface+3*Math.sin(x*.02+time*1.6)+2*Math.sin(x*.011-time);x?c.lineTo(x,y):c.moveTo(x,y);}c.strokeStyle='#e8f1ff99';c.lineWidth=2;c.stroke();
    }
    const floor=this.images.floor,floorY=screen(7010);if(floor?.complete&&floor.naturalWidth&&floorY<h&&floorY+h>0){c.globalAlpha=.7;c.drawImage(floor,0,floorY,w,w*floor.naturalHeight/floor.naturalWidth);c.globalAlpha=1;}
    c.fillStyle='rgba(4,9,18,.85)';const schoolY=screen(85);if(schoolY>-80&&schoolY<h+80)for(let i=0;i<9;i++)fish(c,(time*26+i*46+i*i*7)%(w+360)-180,schoolY+Math.sin(time*2+i)*12+i%3*14,8,1);
    c.fillStyle='rgba(4,9,18,.7)';if(frame.camera>20)for(let i=0;i<4;i++){const direction=i%2?1:-1,x=((time*(14+i*5)*direction+i*w*.31)%(w+100)+(w+100))%(w+100)-50;fish(c,x,h*.5+Math.sin(time+i*2)*10+(i-1.5)*h*.18,7+i*2,direction);}
    for(const [depth,count,color]of [[800,20,'77,227,255'],[4400,9,'255,93,143']]){const y=screen(depth);if(y>-80&&y<h+80)for(let i=0;i<count;i++){c.fillStyle=`rgba(${color},${.15+.15*(1+Math.sin(time*3+i))})`;c.fillRect(w*(.08+i*.84/count),y+Math.sin(time+i*.55)*22+i%3*5,2,2);}}
    if(!still)for(const p of this.snow){p.y=((p.y-dy*p.parallax+dt*8)%(h+20)+h+20)%(h+20)-10;p.x=((p.x+Math.sin(time*.6+p.phase)*dt*9)%(w+20)+w+20)%(w+20)-10;c.fillStyle=`rgba(200,220,255,${.1+p.parallax*.13})`;c.fillRect(p.x,p.y,p.size,p.size);}
    if(frame.tier==='rare'&&!still&&(frame.plunging||frame.kind==='landed'&&frame.landingElapsed<1400)){const age=frame.plunging?frame.fraction:1+frame.landingElapsed/1400,fade=frame.plunging ? .35 : .5*clamp(1-frame.landingElapsed/1400);for(let i=0;i<10;i++){const angle=i*2.4,radius=25+((age*90+i*19)%110),x=w/2+Math.cos(angle)*radius,y=screen(frame.plunging?frame.chipDepth:frame.depth)+Math.sin(angle)*radius*.55,size=20+(i%4)*12+age*8,ink=c.createRadialGradient(x,y,0,x,y,size);ink.addColorStop(0,`rgba(60,4,14,${fade})`);ink.addColorStop(1,'rgba(20,0,6,0)');c.fillStyle=ink;c.fillRect(x-size,y-size,size*2,size*2);}}
    if(frame.plunging&&frame.tier==='tooclever'&&!still){const image=this.images.schooler;for(let i=0;i<9;i++){const progress=clamp((frame.fraction*3-i*.11)/1.7),direction=i%2?1:-1,x=mix(direction>0?-60:w+60,direction>0?w+60:-60,progress),y=h*.42+Math.sin(i*3+progress*Math.PI)*70;if(image?.complete&&image.naturalWidth){c.save();c.translate(x,y);c.scale(direction,1);c.drawImage(image,-21,-21,42,42);c.restore();}}}
    if(frame.plunging&&frame.tier==='schooler')for(let i=0;i<6;i++){const image=this.images.schooler;if(image?.complete&&image.naturalWidth)c.drawImage(image,w/2+(i%2?1:-1)*(50+i*9)-16,screen(frame.chipDepth)+(i-3)*13+Math.sin(time*4+i)*5,32,32);}
    if(frame.tier==='krillion'&&(frame.plunging||frame.kind==='landed'&&frame.landingElapsed<2400)&&!still){const image=this.images.krill,fade=frame.plunging?1:clamp(1-(frame.landingElapsed-1000)/1400),radius=45+(1-fade)*170;for(let i=0;i<14;i++)if(image?.complete&&image.naturalWidth){const angle=i*Math.PI*2/14+time*(i%2?1:-1);c.globalAlpha=fade*.85;c.drawImage(image,w/2+Math.cos(angle)*radius-11,screen(frame.plunging?frame.chipDepth:frame.depth)+Math.sin(angle)*radius*.6-11,22,22);}c.globalAlpha=1;}
    for(let i=this.bubbles.length-1;i>=0;i--){const p=this.bubbles[i];p.age+=dt;p.depth-=dt*20;if(p.age>3){this.bubbles.splice(i,1);continue;}c.beginPath();c.strokeStyle=`rgba(200,235,255,${.5*(1-p.age/3)})`;c.lineWidth=1;c.arc(p.x+Math.sin(time*3+p.phase)*3,screen(p.depth),p.size,0,Math.PI*2);c.stroke();}
    for(let i=this.sparks.length-1;i>=0;i--){const p=this.sparks[i];p.age+=dt;if(p.age>p.life){this.sparks.splice(i,1);continue;}p.x+=p.vx*dt;p.depth+=p.vy*dt;p.vx*=Math.exp(-2.4*dt);p.vy*=Math.exp(-2.4*dt);c.globalAlpha=1-p.age/p.life;c.fillStyle=p.color;c.fillRect(p.x,screen(p.depth),3,3);}c.globalAlpha=1;
    // Continuous ruler movement follows the same camera as the artwork/chip.
    const edge=w-14,min=frame.camera-h/4,max=frame.camera+h/4;c.strokeStyle='rgba(125,147,184,.55)';c.lineWidth=1;c.beginPath();c.moveTo(edge,Math.max(0,surface));c.lineTo(edge,h);c.stroke();c.font='13px VT323, monospace';c.textAlign='right';
    for(let depth=Math.max(0,Math.floor(min/10)*10);depth<=max;depth+=10){const y=screen(depth),major=depth%100===0;c.beginPath();c.moveTo(edge-(major?16:depth%50===0?10:5),y);c.lineTo(edge,y);c.stroke();if(major){c.fillStyle='#8ca3bd';c.fillText((depth?'-':'')+depth.toLocaleString()+'m',edge-21,y+4);}}
    if(frame.round>0||frame.phase==='feedback'){const y=screen(frame.plunging?frame.base:frame.depth);if(y>-10&&y<h+10){c.fillStyle='#ff5d8f';c.fillText('YOU',edge-24,y+4);c.beginPath();c.moveTo(edge+3,y);c.lineTo(edge+11,y-5);c.lineTo(edge+11,y+5);c.closePath();c.fill();}}
    this.canvas.dataset.camera=frame.camera.toFixed(2);this.canvas.dataset.frame=String(++this.frames);
  }
}
