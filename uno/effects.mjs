// Three.js ports of ScuffedUNO's public action geometry and pop/hold/exit timing.
// See ANIMATIONS.md for upstream methods, attribution and redistribution caveat.
// Only recipient-filtered cards and public seat positions enter this adapter.
import * as THREE from './vendor/three/three.module.js';
import {FontLoader} from './vendor/three/addons/loaders/FontLoader.js';
import {TIMING} from './presentation.mjs';
const COLOURS={red:0xff1007,yellow:0xffff00,green:0x39ce0c,blue:0x009def};
const PI=Math.PI;
function arrow(){const s=new THREE.Shape();s.moveTo(-1,-4);s.lineTo(1,-4);s.lineTo(1,1);s.lineTo(2.8,1);s.lineTo(0,4);s.lineTo(-2.8,1);s.lineTo(-1,1);s.closePath();return s;}
export class ActionEffects {
  constructor(table) {
    this.table=table;this.pulses=[];this.seen=new Set();this.called=new Map();
    this.ready=new FontLoader().loadAsync(new URL('./assets/scuffeduno/Rubik_Bold.json',import.meta.url).href).then(font=>{this.font=font;});
  }
  extrude(shape,colour,depth=3){
    const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:32});
    const face=new THREE.MeshBasicMaterial({color:colour,transparent:true,opacity:.92});
    const side=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{colour:{value:new THREE.Color(colour).multiplyScalar(.65)},depth:{value:depth},opacity:{value:1}},vertexShader:'varying float height; uniform float depth; void main(){height=clamp(position.z/depth,0.,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float height;uniform vec3 colour;uniform float opacity;void main(){gl_FragColor=vec4(colour,height*.85*opacity);\n#include <colorspace_fragment>\n}'});
    const mesh=new THREE.Mesh(geometry,[face,side]);mesh.userData.baseOpacity=.92;return mesh;
  }
  text(text,colour,depth=4){const mesh=this.extrude(this.font.generateShapes(text,10),colour,depth);mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;mesh.geometry.translate(-(b.max.x+b.min.x)/2,-(b.max.y+b.min.y)/2,0);return mesh;}
  model(kind,colour='yellow',label=''){
    const group=new THREE.Group(),c=COLOURS[colour]||COLOURS.yellow;
    if(kind==='colour'||kind==='draw4'){
      ['red','yellow','green','blue'].forEach((name,i)=>{const s=new THREE.Shape(),a=-PI*.75+i*PI/2;s.moveTo(0,0);s.absarc(0,0,5,a,a+PI/2,false);s.lineTo(0,0);const m=this.extrude(s,COLOURS[name],6);m.position.set(Math.cos(a+PI/4)*.35,Math.sin(a+PI/4)*.35,0);m.userData.colour=name;m.userData.hitPoint=new THREE.Vector3(Math.cos(a+PI/4)*3.2,Math.sin(a+PI/4)*3.2,6);group.add(m);});
      if(kind==='draw4'){const text=this.text('+4',0xffffff,1);text.scale.setScalar(.65);text.position.z=7;group.add(text);}
    }else if(kind==='skip'){
      const s=new THREE.Shape();s.absarc(0,0,5,0,PI*2);const hole=new THREE.Path();hole.absarc(0,0,3.4,0,PI*2,true);s.holes.push(hole);group.add(this.extrude(s,c,2));const bar=new THREE.Shape();bar.moveTo(-4.6,-.8);bar.lineTo(4.6,-.8);bar.lineTo(4.6,.8);bar.lineTo(-4.6,.8);bar.closePath();const slash=this.extrude(bar,c,2);slash.rotation.z=PI/4;group.add(slash);
    }else if(kind==='reverse'){
      for(const sign of [-1,1]){const m=this.extrude(arrow(),c,4);m.position.x=sign*1.8;m.rotation.z=sign===1?0:PI;group.add(m);}
    }else group.add(this.text({seven:'7',zero:'0',draw2:'+2',uno:'UNO'}[kind]||label,c,kind==='uno'?2:4));
    group.rotation.x=-.5;group.userData.actionCue=kind;return group;
  }
  add(key,kind,{colour='yellow',label='',player=null,duration=TIMING.cue,target=null}={}) {
    if(this.seen.has(key))return;this.seen.add(key);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value);
    const mesh=this.model(kind,colour,label);this.table.scene.add(mesh);
    if(kind==='seven'&&target){const a=this.extrude(arrow(),COLOURS[colour]||COLOURS.yellow,1);a.scale.setScalar(.5);a.position.x=8;a.userData.target=target;mesh.add(a);}
    this.pulses.push({mesh,kind,colour,player,start:performance.now(),duration});
  }
  stackNumber(total){
    const mesh=this.text(`+${total}`,0xffffff,1.2);mesh.material[0].opacity=1;mesh.material[1].dispose();mesh.material[1]=new THREE.MeshBasicMaterial({color:0x210038});
    mesh.renderOrder=101;for(const m of mesh.material){m.transparent=true;m.depthTest=false;m.depthWrite=false;}
    mesh.geometry.computeBoundingBox();mesh.userData.baseScale=Math.min(1,16/(mesh.geometry.boundingBox.max.x-mesh.geometry.boundingBox.min.x));mesh.scale.setScalar(mesh.userData.baseScale);mesh.position.y=-2;return mesh;
  }
  createStack(total){
    const mesh=new THREE.Group(),shape=new THREE.Shape();shape.moveTo(-5,-9);shape.lineTo(5,-9);shape.lineTo(12,9);shape.lineTo(-12,9);shape.closePath();
    const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,uniforms:{opacity:{value:1},bottom:{value:new THREE.Color(0x9229ef)},top:{value:new THREE.Color(0x571ba8)}},vertexShader:'varying float height;void main(){height=clamp((position.y+9.)/18.,0.,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float height;uniform float opacity;uniform vec3 bottom;uniform vec3 top;void main(){gl_FragColor=vec4(mix(bottom,top,height),(.68*(1.-height))*opacity);\n#include <colorspace_fragment>\n}'});
    const highlight=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.5,bevelEnabled:false}),material);highlight.position.z=-1;highlight.renderOrder=100;mesh.add(highlight);
    const label=this.text('STACKING',0xd79aff,.35);label.scale.setScalar(.23);label.position.set(0,4.8,0);label.renderOrder=101;for(const m of label.material){m.depthTest=false;m.depthWrite=false;}mesh.add(label);
    const number=this.stackNumber(total);mesh.add(number);mesh.userData.actionCue='stack';this.table.scene.add(mesh);
    this.stack={mesh,highlight,label,number,total,displayed:total,stage:'enter',start:performance.now()};
  }
  updateStack(view){
    const total=Math.max(0,view.debt||0),s=this.stack;
    if(total){
      if(!s||['give','exit'].includes(s.stage)){if(s)this.dispose(s.mesh);this.createStack(total);}
      else if(s.total!==total){s.total=total;s.stage='change';s.start=performance.now();}
    }else if(s&&!['give','exit'].includes(s.stage)){
      s.stage=view.presentation?.kind==='draw'?'give':'exit';s.target=view.presentation?.player;s.start=performance.now();
    }
  }
  frameStack(time){
    const s=this.stack;if(!s)return;const t=this.table,elapsed=Math.max(0,time-s.start),a=this.anchor(null),pop=x=>1+2.70158*(x-1)**3+1.70158*(x-1)**2;
    if((t.reduced&&['give','exit'].includes(s.stage))||(s.stage==='give'&&elapsed>=1000)||(s.stage==='exit'&&elapsed>=400)){this.dispose(s.mesh);this.stack=null;return;}
    let factor=1,numberScale=1,x=a.x,y=t.playerCount>5?t.tableCentreY-10:a.y-22;
    if(s.stage==='enter'){const p=t.reduced?1:Math.min(1,elapsed/400);factor=Math.max(.001,pop(p));y+=35*(1-p);if(p===1)s.stage='hold';}
    if(s.stage==='change'){
      if((elapsed>=400||t.reduced)&&s.displayed!==s.total){s.mesh.remove(s.number);this.dispose(s.number);s.number=this.stackNumber(s.total);s.mesh.add(s.number);s.displayed=s.total;}
      numberScale=t.reduced?1:elapsed<400?Math.max(.001,1-elapsed/400):Math.max(.001,pop(Math.min(1,(elapsed-400)/400)));if(elapsed>=800||t.reduced)s.stage='hold';
    }
    if(s.stage==='give'){
      const p=elapsed/1000,end=this.anchor(s.target),ease=p*p*(3-2*p);x+=(end.x-x)*ease;y+=(end.y-y)*ease;numberScale=p<.7?1-p*.3:Math.max(.001,(1-p)/.3*.79);s.highlight.material.uniforms.opacity.value=Math.max(0,1-p*2);s.label.visible=false;
    }
    if(s.stage==='exit')factor=Math.max(.001,1-elapsed/400);
    s.number.scale.setScalar(s.number.userData.baseScale*numberScale);s.mesh.visible=!this.choice;
    this.position(s.mesh,x,y,Math.min(190,t.w*.4,t.playerCount>5?(t.ringBounds.right-t.ringBounds.left)*.9:Infinity),factor);
  }
  update(view) {
    if(this.round!==view.round||this.self!==view.self){this.clear();this.seen.clear();this.called.clear();this.round=view.round;this.self=view.self;}
    const e=view.presentation,key=`${view.round}:${view.effects?.revision??view.revision}`;
    this.updateStack(view);
    if(e?.kind==='cue'&&!['draw2','draw4'].includes(e.cue.kind))this.add(key+':cue',e.cue.kind,{colour:e.cue.colour});
    if(e?.kind==='swap'&&e.phase==='select')this.add(key+':seven','seven',{colour:view.colour,duration:TIMING.select,target:e.to});
    if(e?.kind==='rotate'&&e.phase==='select')this.add(key+':zero','zero',{colour:view.colour,duration:TIMING.select});
    // Draws are shown one at a time. Never reveal the eventual draw-until total.
    if(!e)for(const p of view.players){if(p.unoCalled&&!this.called.get(p.id))this.add(`${key}:uno:${p.id}`,'uno',{player:p.id});this.called.set(p.id,!!p.unoCalled);}
  }
  anchor(player){const t=this.table;if(!player)return {x:t.tableCentreX,y:t.tableCentreY-25};const b=t.seatBounds?.get(player);return b&&Number.isFinite(b.top)?{x:(b.left+b.right)/2,y:Math.max(155,b.top-55)}:{x:t.w/2,y:t.h*.65};}
  position(mesh,x,y,pixels,factor=1){const t=this.table;mesh.position.copy(t.screenPoint(x,y,100));mesh.quaternion.copy(t.camera.quaternion);mesh.rotateX(-.5);mesh.scale.setScalar(1);mesh.updateWorldMatrix(true,true);const b=t.bounds(mesh);mesh.scale.setScalar(pixels/Math.max(1,b.right-b.left));for(let i=0;i<6;i++){const box=t.bounds(mesh);mesh.scale.multiplyScalar(pixels/Math.max(1,box.right-box.left));}mesh.scale.multiplyScalar(factor);}
  showChoice(kind,colour,options){
    this.closeChoice();const mesh=this.model(kind,colour);this.table.scene.add(mesh);const targets=[];
    if(kind==='seven')for(const [id]of options){const a=this.extrude(arrow(),COLOURS[colour]||COLOURS.yellow,1);a.scale.setScalar(.42);a.userData.target=id;mesh.add(a);targets.push(a);}
    else targets.push(...mesh.children.filter(m=>m.userData.colour));
    this.choice={mesh,kind,targets,start:performance.now()};this.frame(performance.now());
  }
  pick(x,y){if(!this.choice)return null;const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/this.table.w*2-1,1-y/this.table.h*2),this.table.camera);const hit=ray.intersectObjects(this.choice.targets,false)[0]?.object;return hit?.userData.target||hit?.userData.colour||null;}
  closeChoice(){if(this.choice){this.dispose(this.choice.mesh);this.choice=null;}}
  dispose(mesh){this.table.scene.remove(mesh);mesh.traverse(m=>{m.geometry?.dispose();for(const material of Array.isArray(m.material)?m.material:m.material?[m.material]:[])material.dispose();});}
  frame(time) {
    const t=this.table;this.frameStack(time);
    this.pulses=this.pulses.filter(p=>{
      const elapsed=time-p.start,progress=Math.max(0,elapsed/p.duration);if(progress>=1){this.dispose(p.mesh);return false;}
      const edge=Math.min(300,p.duration/3),grow=Math.min(1,elapsed/edge),shrink=Math.min(1,(p.duration-elapsed)/edge),back=x=>1+2.70158*(x-1)**3+1.70158*(x-1)**2;
      const factor=t.reduced?1:Math.max(.001,back(grow)*shrink),a=this.anchor(p.player);
      this.position(p.mesh,a.x,a.y,Math.min(250,t.w*.42),factor);
      if(p.kind==='colour'||p.kind==='draw4')for(const m of p.mesh.children)if(m.userData.colour===p.colour)m.position.z=t.reduced?1.2:Math.max(0,Math.sin(Math.min(1,progress*1.5)*PI))*2;
      for(const m of p.mesh.children)if(m.userData.target){const b=this.anchor(m.userData.target),angle=Math.atan2(-(b.y-a.y),b.x-a.x);m.position.set(Math.cos(angle)*8,Math.sin(angle)*8,2);m.rotation.z=angle-PI/2;}
      return true;
    });
    if(this.choice){const {mesh,kind,targets}=this.choice,a=this.anchor(null);
      for(const m of targets)if(m.userData.target){const b=this.anchor(m.userData.target),angle=Math.atan2(-(b.y-a.y),b.x-a.x);m.position.set(Math.cos(angle)*9,Math.sin(angle)*9,2);m.rotation.z=angle-PI/2;}
      this.position(mesh,a.x,a.y,Math.min(kind==='seven'?310:240,t.w*.7));
      for(const m of targets){const value=m.userData.target||m.userData.colour,point=t.project(m.localToWorld((m.userData.hitPoint||new THREE.Vector3(0,1,1)).clone())),button=[...document.querySelectorAll('#choices button')].find(el=>el.dataset.value===value);if(!button)continue;const width=t.w<600?44:64,height=44;Object.assign(button.style,{left:`${Math.max(4,Math.min(t.w-width-4,point.x-width/2))}px`,top:`${Math.max(145,Math.min(t.h-height-65,point.y-height/2))}px`,width:`${width}px`,height:`${height}px`});}
    }
  }
  clear(){for(const p of this.pulses)this.dispose(p.mesh);this.pulses=[];if(this.stack)this.dispose(this.stack.mesh);this.stack=null;this.closeChoice();}
}
