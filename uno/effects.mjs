// Locally authored equivalents of ScuffedUNO's public action callouts.
// Inputs contain public actions/counts only; no opponent card faces are read.
import * as THREE from './vendor/three/three.module.js';
import {TIMING} from './presentation.mjs';
const COLOURS={red:'#ed2035',yellow:'#ffe034',green:'#10b660',blue:'#25a8ed'};
export class ActionEffects {
  constructor(table) { this.table=table;this.textures=new Map();this.pulses=[];this.seen=new Set();this.called=new Map(); }
  texture(kind,colour,label) {
    const key=JSON.stringify([kind,colour,label]);if(this.textures.has(key))return this.textures.get(key);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;
    const c=canvas.getContext('2d');c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
    const text=(value,y,size,fill)=>{c.font=`900 ${size}px Poppins, Arial, sans-serif`;c.lineWidth=19;c.strokeStyle='#350b08';c.strokeText(value,256,y,460);c.lineWidth=9;c.strokeStyle='#fff';c.strokeText(value,256,y,460);c.fillStyle=fill;c.fillText(value,256,y,460);};
    if(kind==='colour'||kind==='draw4') {
      ['red','yellow','green','blue'].forEach((name,i)=>{const a=i*Math.PI/2;c.beginPath();c.moveTo(256,130);c.arc(256,130,110,a,a+Math.PI/2);c.closePath();c.fillStyle=COLOURS[name];c.fill();c.strokeStyle='#fff';c.lineWidth=5;c.stroke();});
      text(kind==='draw4'?'+4':colour.toUpperCase(),137,kind==='draw4'?110:64,'#fff');
    } else text({skip:'⊘',reverse:'⇄',seven:'7 ↔',zero:'↻',uno:'UNO!'}[kind]||label,135,kind==='uno'?132:150,COLOURS[colour]||'#ffda35');
    const caption={skip:'SKIP',reverse:'REVERSE',seven:'SWAP HANDS',zero:'PASS HANDS',uno:'ONE CARD',draw2:'DRAW TWO',draw4:colour.toUpperCase(),colour:'COLOUR CHOSEN',draw:'DRAW CARDS'}[kind]||'';
    if(caption)text(caption,268,49,'#fff');
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.set(key,texture);return texture;
  }
  add(key,kind,{colour='yellow',label='',player=null,travel=false,duration=TIMING.cue}={}) {
    if(this.seen.has(key))return;this.seen.add(key);
    // A round has at most a bounded number of retained effect identities.
    if(this.seen.size>256)this.seen.delete(this.seen.values().next().value);
    const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture(kind,colour,label),transparent:true,depthTest:false,depthWrite:false}));
    mesh.renderOrder=10;mesh.userData.actionCue=kind;this.table.scene.add(mesh);
    this.pulses.push({mesh,kind,player,travel,start:performance.now(),duration});
  }
  update(view) {
    if(this.round!==view.round){this.clear();this.seen.clear();this.called.clear();this.round=view.round;}
    const e=view.presentation,key=`${view.round}:${view.effects?.revision??view.revision}`;
    if(e?.kind==='cue')this.add(key+':cue',e.cue.kind,{colour:e.cue.colour,label:e.cue.kind==='draw2'?'+2':''});
    if(e?.kind==='swap'&&e.phase==='select')this.add(key+':seven','seven',{colour:view.colour,duration:TIMING.select});
    if(e?.kind==='rotate'&&e.phase==='select')this.add(key+':zero','zero',{colour:view.colour,duration:TIMING.select});
    if(e?.kind==='draw'&&e.step===1&&e.total>1)this.add(key+':draw','draw',{label:`+${e.total}`,player:e.player,travel:true,duration:TIMING.draw});
    if(!e)for(const p of view.players){
      if(p.unoCalled&&!this.called.get(p.id))this.add(`${key}:uno:${p.id}`,'uno',{player:p.id});
      this.called.set(p.id,!!p.unoCalled);
    }
  }
  anchor(player) {
    const t=this.table;
    if(!player)return {x:t.w/2,y:t.tableCentreY-(t.w<600?64:90)};
    const b=t.seatBounds?.get(player);return b&&Number.isFinite(b.top)?{x:(b.left+b.right)/2,y:Math.max(155,b.top-55)}:{x:t.w/2,y:t.h*.65};
  }
  frame(time) {
    const t=this.table;
    this.pulses=this.pulses.filter(p=>{
      const progress=Math.max(0,(time-p.start)/p.duration);if(progress>=1){t.scene.remove(p.mesh);p.mesh.material.dispose();return false;}
      const elapsed=time-p.start,edge=Math.min(300,p.duration/3),grow=Math.min(1,elapsed/edge),shrink=Math.min(1,(p.duration-elapsed)/edge);
      const back=x=>1+2.70158*(x-1)**3+1.70158*(x-1)**2;
      const factor=t.reduced?1:Math.max(0,back(grow)*shrink);
      const a=this.anchor(p.travel?null:p.player),b=this.anchor(p.player),u=t.reduced?1:Math.min(1,progress*1.4);
      const x=p.travel?a.x+(b.x-a.x)*u:a.x,y=p.travel?a.y+(b.y-a.y)*u:a.y+(t.reduced?0:18*(1-factor));
      const width=Math.min(185,t.w*.38),units=2*140*Math.tan(t.camera.fov*Math.PI/360)/t.h;
      p.mesh.position.copy(t.screenPoint(x,y,140));p.mesh.scale.set(width*units*factor,width*.625*units*factor,1);p.mesh.material.opacity=t.reduced?1:Math.min(1,shrink*2);
      return true;
    });
  }
  clear(){for(const p of this.pulses){this.table.scene.remove(p.mesh);p.mesh.material.dispose();}this.pulses=[];}
}
