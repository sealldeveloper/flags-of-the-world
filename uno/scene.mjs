// Local Three.js presentation adapter. Receives only the recipient-filtered view;
// never reads Room.state, transports, the deck, or opponents' card identities.
import * as THREE from './vendor/three/three.module.js';
import {EffectComposer} from './vendor/three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from './vendor/three/addons/postprocessing/ShaderPass.js';
import {TIMING} from './presentation.mjs';
import {ActionEffects} from './effects.mjs';

const ASSETS = new URL('./assets/scuffeduno/', import.meta.url);
const V = THREE.Vector3, PI = Math.PI;
export function cardAsset(card, activeColour) {
  const colour = card.colour === 'wild' ? (activeColour || 'wild') : card.colour;
  return new URL(`${colour}-${card.value}.png`, ASSETS).href;
}
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w/2+r,-h/2); s.lineTo(w/2-r,-h/2);
  s.absarc(w/2-r,-h/2+r,r,-PI/2,0,false); s.lineTo(w/2,h/2-r);
  s.absarc(w/2-r,h/2-r,r,0,PI/2,false); s.lineTo(-w/2+r,h/2);
  s.absarc(-w/2+r,h/2-r,r,PI/2,PI,false); s.lineTo(-w/2,-h/2+r);
  s.absarc(-w/2+r,-h/2+r,r,PI,PI*1.5,false); return s;
}
const shape = roundedShape(5.6,8.9,.68);
const faceGeometry = new THREE.ShapeGeometry(shape,16);
const uv = faceGeometry.attributes.uv, pos = faceGeometry.attributes.position;
for(let i=0;i<uv.count;i++) uv.setXY(i,(pos.getX(i)+2.8)/5.6,(pos.getY(i)+4.45)/8.9);
const edgeGeometry = new THREE.ExtrudeGeometry(shape,{depth:.05,bevelEnabled:false,curveSegments:16});
edgeGeometry.translate(0,0,-.025);
// Keep only the side walls: coplanar white caps otherwise fight the textured faces.
const sideGroup=edgeGeometry.groups.find(group=>group.materialIndex===1);
edgeGeometry.clearGroups();edgeGeometry.addGroup(sideGroup.start,sideGroup.count,0);
edgeGeometry.setDrawRange(sideGroup.start,sideGroup.count);
const white = new THREE.MeshBasicMaterial({color:0xffffff});
const outlineShape=roundedShape(6,9.3,.8);outlineShape.holes.push(roundedShape(5.6,8.9,.68));
const outlineGeometry=new THREE.ShapeGeometry(outlineShape,16);
const outlineMaterial=new THREE.MeshBasicMaterial({color:0xffd64e,side:THREE.DoubleSide,transparent:true});

export class CardTable {
  constructor(canvas, {onError = ()=>{}} = {}) {
    this.canvas=canvas; this.onError=onError; this.active=false; this.cards=new Map(); this.players=new Map();
    this.textures=new Map(); this.texturePromises=[]; this.faces=new Map(); this.discards=[]; this.animations=[]; this.hover=null;
    this.reduced=localStorage.getItem('uno-motion')==='off';
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(70,1,.1,300); this.scene.add(this.camera);
    const bg=document.createElement('canvas'); bg.width=bg.height=1024;
    const ctx=bg.getContext('2d'), gradient=ctx.createRadialGradient(512,512,0,512,512,614.4);
    gradient.addColorStop(0,'#8f0402'); gradient.addColorStop(1,'#500201');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,1024);
    this.scene.background=new THREE.CanvasTexture(bg);this.scene.background.colorSpace=THREE.SRGBColorSpace;
    this.hand=new THREE.Group();this.camera.add(this.hand);
    this.swapGhosts=new THREE.Group();this.scene.add(this.swapGhosts);
    this.pile=new THREE.Group();this.scene.add(this.pile);
    this.deck=new THREE.Group();this.scene.add(this.deck);
    this.ring=new THREE.Group();this.scene.add(this.ring);
    this.effects=new ActionEffects(this);
    // No mirror pass: projected seat geometry intersected the old reflector and
    // produced floating card fragments. Avoid its extra full-scene render too.
    const renderTarget=()=>new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(innerWidth,innerHeight,THREE.UnsignedIntType)});
    this.bloom=new EffectComposer(this.renderer,renderTarget()); this.bloom.renderToScreen=false;
    this.bloom.addPass(new RenderPass(this.scene,this.camera));
    this.bloom.addPass(new UnrealBloomPass(new THREE.Vector2(512,512),.25,0,.7));
    this.composer=new EffectComposer(this.renderer,renderTarget());this.composer.addPass(new RenderPass(this.scene,this.camera));
    const composite=new ShaderPass({uniforms:{tDiffuse:{value:null},glow:{value:null}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform sampler2D tDiffuse;uniform sampler2D glow;varying vec2 vUv;void main(){gl_FragColor=texture2D(tDiffuse,vUv)+texture2D(glow,vUv);\n#include <colorspace_fragment>\n}'
    });
    composite.uniforms.glow.value=this.bloom.renderTarget2.texture;
    this.composer.addPass(composite);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.stop();this.onError('The 3D graphics context was lost. Leave and rejoin the room to reload it.');});
    this.resize=()=>{if(this.active)this.layout();};window.addEventListener('resize',this.resize);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&this.active){this.lastTime=performance.now();if(!this.frameId)this.frameId=requestAnimationFrame(this.tick);}});
    this.tick=time=>{this.frameId=0;if(!this.active||document.hidden)return;this.frame(time);this.frameId=requestAnimationFrame(this.tick);};
    // Warm the complete classic deck once. A newly dealt face must never flash black.
    const faces=[];
    for(const colour of ['red','green','yellow','blue'])for(const value of [...'1234567890','draw2','skip','reverse'])faces.push(`${colour}-${value}.png`);
    for(const colour of ['wild','red','green','yellow','blue'])for(const value of ['wild','draw4'])faces.push(`${colour}-${value}.png`);
    for(const file of [...faces,'back.png'])this.texture(new URL(file,ASSETS).href);
    this.ready=Promise.all([...this.texturePromises,this.effects.ready]);
  }
  texture(url) {
    if(!this.textures.has(url)) {
      const complete=new Promise((resolve,reject)=>{
        const tex=new THREE.TextureLoader().load(url,()=>{resolve();this.draw();},undefined,()=>reject(new Error('A local ScuffedUNO texture could not load. Refresh the page.')));
        tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
        this.textures.set(url,tex);
      });
      this.texturePromises.push(complete);
    }
    return this.textures.get(url);
  }
  material(url,dim=false){const key=`${url}:${dim}`;if(!this.faces.has(key))this.faces.set(key,new THREE.MeshBasicMaterial({map:this.texture(url),color:dim?0x858585:0xffffff}));return this.faces.get(key);}
  card(data,scale=1,colour) {
    const group=new THREE.Group(), body=new THREE.Mesh(edgeGeometry,white);
    const back=new THREE.Mesh(faceGeometry,this.material(new URL('back.png',ASSETS).href));back.position.z=.026;
    const front=new THREE.Mesh(faceGeometry,this.material(data?cardAsset(data,colour):new URL('back.png',ASSETS).href));front.position.z=-.026;front.rotation.y=PI;
    const outline=new THREE.Mesh(outlineGeometry,outlineMaterial);outline.position.z=-.04;outline.layers.enable(1);outline.visible=false;
    group.add(body,back,front,outline);group.scale.setScalar(scale);group.userData.front=front;group.userData.back=back;group.userData.body=body;group.userData.outline=outline;
    return group;
  }
  arc(radius,width,offset){
    const positions=[],colours=[],color=new THREE.Color(0xe1b264).multiplyScalar(1.8);
    const point=(angle,r)=>[Math.sin(angle+offset)*r,0,Math.cos(angle+offset)*r];
    const tri=(a,b,c,aa,ab,ac)=>{positions.push(...a,...b,...c);for(const alpha of [aa,ab,ac])colours.push(color.r*alpha,color.g*alpha,color.b*alpha);};
    for(let i=0;i<72;i++){
      const a=i/72*1.8,b=(i+1)/72*1.8,ia=point(a,radius-width/2),oa=point(a,radius+width/2),ib=point(b,radius-width/2),ob=point(b,radius+width/2);
      tri(ia,oa,ib,i/72,i/72,(i+1)/72);tri(oa,ob,ib,i/72,(i+1)/72,(i+1)/72);
    }
    tri(point(1.8,radius-width*1.25),point(1.8,radius+width*1.25),point(1.8+width*2.5/radius,radius),1,1,1);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
    const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));mesh.layers.enable(1);return mesh;
  }
  update(view,{online,pending}={}) {
    const previous=this.view, added=[];
    const effectKey=JSON.stringify([view.round,view.self,view.turn,view.direction,view.legal,online,view.hand.map(c=>c.id),view.players.map(p=>[p.id,p.count]),view.top?.id,view.colour,view.drawn,view.presentation?.heldCard,view.presentation?.kind,view.presentation?.phase,view.presentation?.step]);
    // Pending/ack/latency and UNO snapshots must not teleport an in-flight mesh
    // back to its layout target. Rebind the rebuilt DOM without rebuilding geometry.
    if(this.active&&effectKey===this.effectKey){this.view=view;this.canAct=online&&!pending&&(!view.presentation||view.presentation.kind==='jump-window')&&view.phase==='playing';this.effects.update(view);this.bindTargets();this.projectControls();return;}
    if(effectKey!==this.effectKey){for(const a of this.animations){a.mesh.position.copy(a.target);a.mesh.quaternion.copy(a.targetRotation);a.mesh.scale.copy(a.targetScale);a.mesh.visible=true;a.mesh.userData.flying=false;}this.animations=[];this.effectKey=effectKey;}
    const pose=mesh=>({position:mesh.getWorldPosition(new V()),rotation:mesh.getWorldQuaternion(new THREE.Quaternion()),scale:mesh.getWorldScale(new V())});
    const oldPoses=new Map([...this.cards.values(),...[...this.players.values()].flatMap(g=>g.children)].map(mesh=>[mesh,pose(mesh)]));
    const source=this.cards.get(view.top?.id)||this.players.get(view.presentation?.player || view.lastPlayedBy || previous?.turn)?.children.at(-1);
    const playedPose=source?pose(source):null;
    if(previous?.round!==view.round||previous?.self!==view.self){for(const mesh of this.cards.values())this.disposeTint(mesh);this.hand.clear();this.cards.clear();for(const g of this.players.values())g.clear();this.displayDirection=view.direction;this.directionTween=null;}
    this.hand.userData.player=view.self;
    let newDiscard=null;
    if(previous?.self!==view.self)this.round=null;
    this.view=view;this.canAct=online&&!pending&&view.phase==='playing'&&(view.turn===view.self||view.legal.length>0);
    if(!this.canAct||!view.legal.includes(this.hover))this.hover=null;
    if(!this.active){this.active=true;this.lastTime=performance.now();this.frameId=requestAnimationFrame(this.tick);}
    const count=view.players.length;
    this.scale=count>5?Math.max(.8,2.2-.1*(count-5)):2.35;
    this.width=5.6*this.scale;this.height=8.9*this.scale;
    this.radius=Math.min(130,70+6*(count-1));this.floor=-this.height/2;
    if(this.playerCount!==count){
      this.playerCount=count;
      for(const child of [...this.ring.children]){this.ring.remove(child);child.geometry.dispose();child.material.dispose();}
      const radius=2.3*this.width,weight=radius/16*this.scale;
      this.ring.add(this.arc(radius,weight,0),this.arc(radius,weight,PI));
      this.ring.position.set(0,this.floor+.1,-26);
      this.deck.clear();
      const deckScale=this.deckParameters().scale;
      const block=this.card(null,deckScale);block.children[0].scale.z=35;block.children[1].position.z=.9;
      const top=this.card(null,deckScale);top.userData.baseZ=deckScale*.94;top.position.z=top.userData.baseZ;top.userData.outline.position.z=.04;
      this.deck.add(block,top);this.deck.rotation.set(-PI/2,0,0);
    }
    const live=new Set(view.hand.map(c=>c.id));
    for(const [id,card] of this.cards)if(!live.has(id)){this.hand.remove(card);this.cards.delete(id);this.disposeTint(card);}
    for(const c of view.hand){
      if(!this.cards.has(c.id)){const mesh=this.card(c,this.scale);mesh.userData.id=c.id;mesh.userData.privateTint=true;for(const key of ['front','back','body'])mesh.userData[key].material=mesh.userData[key].material.clone();this.hand.add(mesh);this.cards.set(c.id,mesh);added.push(mesh);}
      const mesh=this.cards.get(c.id);mesh.scale.setScalar(this.scale);
      const dim=!online||(view.presentation?.kind!=='deal'&&!view.legal.includes(c.id)),tint=dim?.52:1;
      mesh.userData.front.material.map=this.texture(cardAsset(c));
      if(mesh.userData.targetTint!==tint){mesh.userData.tintFrom=mesh.userData.front.material.color.r;mesh.userData.tintStart=performance.now();mesh.userData.targetTint=tint;}
      mesh.userData.dim=dim;mesh.userData.outline.visible=this.hover===c.id;
    }
    const ids=new Set(view.players.filter(p=>p.id!==view.self).map(p=>p.id));
    for(const [id,group] of this.players)if(!ids.has(id)){this.scene.remove(group);this.players.delete(id);}
    for(const p of view.players.filter(p=>p.id!==view.self)){
      if(!this.players.has(p.id)){const group=new THREE.Group();this.scene.add(group);this.players.set(p.id,group);}
      const group=this.players.get(p.id),n=Math.min(40,p.count);group.userData.player=p.id;
      while(group.children.length>n)group.remove(group.children.at(-1));
      while(group.children.length<n){const card=this.card(null,this.scale);group.add(card);added.push(card);}
      const spacing=this.width*Math.min(4-.2*(count-2),Math.max(0,n-1))/Math.max(1,n);
      group.children.forEach((card,i)=>{const fan=i-(n-1)/2;card.scale.setScalar(this.scale);card.position.set(fan*spacing,-Math.abs(fan)*this.height*.018,-i*.10);card.rotation.set(0,0,-fan*.015);card.userData.body.scale.z=1;});
    }
    if(this.round!==view.round){this.round=view.round;this.pile.clear();this.discards=[];}
    if(view.top&&this.discards.at(-1)?.userData.id!==view.top.id){
      const card=this.card(view.top,this.scale,view.top.colour==='wild'?view.colour:undefined);
      card.userData.id=view.top.id;card.rotation.set(PI/2,0,PI/2+Math.sin(view.revision*2.39)*PI/6);
      card.position.set(Math.sin(view.revision)*.4,.12+this.discards.length*.08,Math.cos(view.revision)*.4);
      this.pile.add(card);this.discards.push(card);newDiscard=card;
      if(this.discards.length>10){this.pile.remove(this.discards.shift());this.discards.forEach((c,i)=>c.position.y=.12+i*.08);}
    }
    const topCard=this.discards.at(-1);
    if(topCard&&view.top?.colour==='wild')topCard.userData.front.material=this.material(cardAsset(view.top,view.colour));
    this.pile.position.set(0,this.floor,-26);
    this.layout();this.bindTargets();this.updateSwap();this.effects.update(view);
    const effect=view.presentation;
    if(effect?.kind==='cue'&&effect.cue.kind==='reverse'&&this.displayDirection!==view.direction&&!this.directionTween)this.directionTween={start:performance.now(),from:this.displayDirection,to:view.direction};
    else if(!effect&&this.displayDirection!==view.direction&&!this.directionTween)this.displayDirection=view.direction;
    if(!this.reduced&&!['swap','rotate'].includes(effect?.kind)){
      const deckPose=pose(this.deck.children.at(-1));
      if(['deal','draw'].includes(effect?.kind))added.forEach(mesh=>this.fly(mesh,deckPose.position,deckPose.rotation,effect.kind==='deal'?mesh.parent.children.indexOf(mesh)*TIMING.deal:0,effect.kind==='deal'?TIMING.dealFlight:TIMING.draw-100,{kind:effect.kind,sourceScale:deckPose.scale}));
      if(newDiscard&&playedPose&&effect?.kind==='play')this.fly(newDiscard,playedPose.position,playedPose.rotation,0,TIMING.play-100,{kind:'play',sourceScale:playedPose.scale});
      if(previous?.round===view.round)for(const [mesh,from] of oldPoses){if(mesh.parent&&mesh!==source&&!added.includes(mesh)&&mesh.getWorldPosition(new V()).distanceTo(from.position)>.01)this.fly(mesh,from.position,from.rotation,0,TIMING.reflow,{kind:'reflow',sourceScale:from.scale});}
    }
    this.draw();
  }
  deckParameters(){
    let scale=1.2*this.scale,dist=this.radius,angle=50*PI/180,rotation=.7;
    switch(this.playerCount){
      case 2:dist*=1.3;angle+=8*PI/180;rotation=-1.4;scale=1.05*this.scale;break;
      case 3:dist*=1.15;angle=0;rotation=0;break;
      case 4:dist*=1.55;angle-=14*PI/180;rotation=-1.3;scale*=1.05;break;
      case 5:dist*=1.67;angle-=4*PI/180;rotation=.8;scale*=1.1;break;
      case 6:dist*=1.55;scale*=1.1;break;
      case 7:dist*=1.58;angle+=8*PI/180;scale*=1.16;rotation=.57;break;
      default:dist*=1.52;angle+=10*PI/180;scale*=1.2;rotation=.5;
    }
    return {scale,dist,angle,rotation};
  }
  layout(){
    if(!this.view)return;
    const w=innerWidth,h=innerHeight;this.w=w;this.h=h;this.ring.visible=true;
    this.renderer.setSize(w,h,false);this.bloom.setSize(w/2,h/2);this.composer.setSize(w,h);
    // Turn ownership must never change the camera, hand size, or perspective.
    this.camera.aspect=w/h;this.camera.zoom=1;
    // Match the original landscape camera, and widen portrait framing instead of clipping seats.
    this.camera.fov=w<h?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(35*PI/180)/(w/h))):70;
    this.camera.position.set(0,72,50);this.camera.lookAt(0,18,-5);
    this.camera.translateZ(6+(this.playerCount>5?1.5*this.playerCount:0));this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
    const distance=27*this.scale;this.hand.scale.setScalar(1);this.hand.position.set(0,0,-distance);this.hand.rotation.set(0,0,0);
    this.camera.updateMatrixWorld(true);this.hand.lookAt(new V(0,18,-5));
    const frustumHeight=2*distance*Math.tan(this.camera.fov*PI/360)/this.camera.zoom;
    this.hand.translateY(-frustumHeight/2+this.height*.67+5);
    // Screen-space fit keeps every card selectable, including an unusually large hand.
    const span=Math.min(this.width*6,2*distance*Math.tan(this.camera.fov*PI/360)*this.camera.aspect/this.camera.zoom*.86);
    const held=this.view.drawn||this.view.presentation?.heldCard;
    const regular=this.view.hand.filter(c=>c.id!==held),n=regular.length,spacing=Math.min(this.width,span/Math.max(1,n));
    regular.forEach((c,i)=>{const mesh=this.cards.get(c.id);mesh.position.set(((n-1)/2-i)*spacing,0,i*.015);mesh.userData.baseY=0;});
    if(held){const mesh=this.cards.get(held);mesh.scale.setScalar(this.scale);mesh.position.set(0,0,.3);mesh.userData.baseY=0;}
    // Rotate the fixed lobby order around the viewer, never around the current turn.
    const selfIndex=this.view.players.findIndex(p=>p.id===this.view.self);
    const ordered=[...this.view.players.slice(selfIndex),...this.view.players.slice(0,selfIndex)];
    const hudWidth=this.hudWidth=Math.min(this.playerCount>5?140:180,Math.max(74,w*(this.playerCount>5?.22:.27)));
    const centreY=125+(h-300)/2,rx=Math.min(w*.38,w/2-hudWidth/2-8),ry=this.playerCount>5?Math.max(80,(h-300)*(w<600?.38:.35)):Math.max(40,Math.min((h-360)*.40,centreY-(w<600?200:240)));
    ordered.slice(1).forEach((p,i)=>{
      const angle=2*PI*(i+1)/this.playerCount,group=this.players.get(p.id);
      group.scale.setScalar(1);
      // Reference table: side hands flank a clear centre, with the far hand above it.
      // Five seats means the viewer plus four bots, not four seats total.
      const slots={2:[[.5,.32]],3:[[.22,.36],[.80,.36]],4:[[.19,.46],[.55,.28],[.86,.46]],5:[[w>=900?.13:.16,.55],[.30,.28],[w>=900?.70:.76,.28],[w>=900?.92:.87,.55]]};
      const slot=slots[this.playerCount]?.[i],x=slot?w*slot[0]:w/2-rx*Math.sin(angle),y=slot?h*slot[1]:centreY+ry*Math.cos(angle);
      group.position.copy(this.screenPoint(x,Math.max(w<600?220:250,y),150));group.quaternion.copy(this.camera.quaternion);group.rotateX(-.55);group.rotateY(Math.sin(angle)*.25);group.rotateZ(Math.sin(angle)*.42);
      this.scene.updateMatrixWorld(true);
      const b=this.bounds(group),targetWidth=Math.min(this.playerCount>5?140:180,w*(this.playerCount>5?.22:.28)),targetHeight=this.playerCount>5?45:w<600?55:90;
      if(p.count)group.scale.setScalar(Math.min(targetWidth/(b.right-b.left),targetHeight/(b.bottom-b.top)));
      const fitted=this.bounds(group),dx=fitted.left<12?12-fitted.left:fitted.right>w-12?w-12-fitted.right:0;
      if(dx)group.position.add(this.screenPoint(x+dx,y,150).sub(this.screenPoint(x,y,150)));
    });
    const d=this.deckParameters();this.deck.position.set(-Math.sin(d.angle)*d.dist,this.floor+d.scale*.9,-Math.cos(d.angle)*d.dist);this.deck.rotation.set(-PI/2,0,-d.angle*d.rotation);
    this.scene.updateMatrixWorld(true);
    // Table framing must not shrink the local hand to the size of remote seats.
    if(w<=600&&this.view.hand.length){
      const measured=this.bounds(this.hand),factor=Math.min(3,(w*.9)/(measured.right-measured.left),Math.min(160,h*.2)/(measured.bottom-measured.top));
      this.hand.scale.setScalar(factor);this.scene.updateMatrixWorld(true);
    }
    // Leave room for the play hint and optional Pass button, not a confirmation bar.
    const handBottom=this.bounds(this.hand).bottom, desiredBottom=h-(w>1200?16:w>=900?24:65);
    const pixelsPerUnit=h*this.camera.zoom/(2*distance*Math.tan(this.camera.fov*PI/360));
    if(Number.isFinite(handBottom))this.hand.position.y+=(handBottom-desiredBottom)/pixelsPerUnit;
    if(w>=900&&this.playerCount<=5)this.hand.position.x=w*.05/pixelsPerUnit;
    else this.hand.position.x=0;
    this.scene.updateMatrixWorld(true);
    // The discard, not the midpoint between the two piles, is the table centre.
    this.tableCentreX=w>=900&&this.playerCount<=5?w*.55:w/2;
    this.tableCentreY=this.playerCount<=5?h*(w<600?.48:.53):centreY-15;
    const pileWidth=w<600?Math.max(44,w*.12):Math.min(120,w*.075);
    this.deck.rotation.set(-PI/2,0,-.25);
    for(const [group,x,width] of [[this.pile,this.tableCentreX,pileWidth],[this.deck,w*.36,pileWidth*.82]]){
      group.scale.setScalar(1);group.position.copy(this.screenPoint(x,this.tableCentreY,150));this.scene.updateMatrixWorld(true);
      const b=this.bounds(group);if(Number.isFinite(b.left))group.scale.setScalar(width/(b.right-b.left));
    }
    this.ring.position.copy(this.pile.position);this.ring.scale.setScalar(1);
    const angle=this.ring.rotation.y;this.ring.rotation.y=0;this.scene.updateMatrixWorld(true);
    const ringBox=this.bounds(this.ring);this.ringScale=(w<600?Math.min(180,Math.max(115,w*.32)):Math.min(420,Math.max(240,w*.28)))/(ringBox.right-ringBox.left);
    this.ring.scale.setScalar(this.ringScale);this.ring.rotation.y=angle;
    this.scene.updateMatrixWorld(true);this.pileBounds=this.bounds(this.pile);
    this.seatBounds=new Map(this.view.players.map(p=>[p.id,this.bounds(p.id===this.view.self?this.hand:this.players.get(p.id))]));
    if(held){const mesh=this.cards.get(held);mesh.scale.setScalar(this.scale*.78);const b=this.bounds(mesh),width=b.right-b.left,height=b.bottom-b.top,handTop=this.seatBounds.get(this.view.self).top;const world=this.screenPoint(Math.min(w-width/2-10,w*.76),handTop-height/2-14,distance);mesh.position.copy(this.hand.worldToLocal(world));mesh.userData.baseY=mesh.position.y;}
    // Reserve the entire rotating arrow sweep, not just its current two visible arcs.
    this.ringBounds=this.ringEnvelope();
    this.projectControls();this.fitRing();this.positionDeck();this.projectControls();
  }
  ringEnvelope(){
    const radius=Math.max(...this.ring.children.flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>Math.hypot(m.geometry.attributes.position.getX(i),m.geometry.attributes.position.getZ(i)))));
    const circle=Array.from({length:64},(_,i)=>this.project(this.ring.localToWorld(new V(Math.cos(i*PI/32)*radius,0,Math.sin(i*PI/32)*radius))));
    return {left:Math.min(...circle.map(p=>p.x)),right:Math.max(...circle.map(p=>p.x)),top:Math.min(...circle.map(p=>p.y)),bottom:Math.max(...circle.map(p=>p.y))};
  }
  fitRing(){
    const occupied=[...[...this.seatBounds].map(([id,b])=>id===this.view.self?{...b,top:b.top-(b.bottom-b.top)/6}:b),...[...document.querySelectorAll('#players .seat')].map(el=>el.getBoundingClientRect())];
    const clashes=b=>occupied.some(a=>a.right+8>b.left&&a.left-8<b.right&&a.bottom+8>b.top&&a.top-8<b.bottom);
    if(!clashes(this.ringBounds))return;
    const column=occupied.filter(b=>b.left<this.tableCentreX+40&&b.right>this.tableCentreX-40);
    const top=Math.max(120,...column.filter(b=>b.bottom<this.tableCentreY).map(b=>b.bottom+12));
    const bottom=Math.min(this.h-100,...column.filter(b=>b.top>this.tableCentreY).map(b=>b.top-12));
    // Only the arrows adapt to a short/crowded table. Never shrink anyone's cards.
    const factor=Math.min(1,(bottom-top)/(this.ringBounds.bottom-this.ringBounds.top));
    this.ringScale*=Math.max(.35,factor);this.ring.scale.setScalar(this.ringScale);this.ringBounds=this.ringEnvelope();
    const shift=Math.max(top-this.ringBounds.top,Math.min(0,bottom-this.ringBounds.bottom)),delta=this.screenPoint(this.tableCentreX,this.tableCentreY+shift,150).sub(this.screenPoint(this.tableCentreX,this.tableCentreY,150));
    this.pile.position.add(delta);this.ring.position.copy(this.pile.position);this.tableCentreY+=shift;
    for(let i=0;i<20;i++){this.ringBounds=this.ringEnvelope();if(!clashes(this.ringBounds))break;this.ringScale*=.96;this.ring.scale.setScalar(this.ringScale);}
    this.pileBounds=this.bounds(this.pile);
  }
  positionDeck(){
    const w=this.w,h=this.h,box=this.bounds(this.deck),width=box.right-box.left,height=box.bottom-box.top;
    const occupied=[this.ringBounds,...this.seatBounds.values(),...[...document.querySelectorAll('#players .seat')].map(el=>el.getBoundingClientRect())];
    // Prefer the reference's upper-left gap between the left and far seats.
    const preferred={x:w*(this.playerCount===5&&w<600?.5:.36),y:h*.28};
    const candidates=[preferred];
    for(let y=118+height/2;y<h*.62;y+=12)for(let x=10+width/2;x<w-width/2-10;x+=12)candidates.push({x,y});
    const fits=({x,y})=>occupied.every(b=>x+width/2+10<=b.left||x-width/2-10>=b.right||y+height/2+10<=b.top||y-height/2-10>=b.bottom);
    const best=candidates.filter(fits).sort((a,b)=>Math.hypot(a.x-preferred.x,a.y-preferred.y)-Math.hypot(b.x-preferred.x,b.y-preferred.y))[0];
    if(best){const centre={x:(box.left+box.right)/2,y:(box.top+box.bottom)/2};this.deck.position.add(this.screenPoint(best.x,best.y,150).sub(this.screenPoint(centre.x,centre.y,150)));this.deck.updateMatrixWorld(true);}
  }
  screenPoint(x,y,depth) {
    const height=2*depth*Math.tan(this.camera.fov*PI/360)/this.camera.zoom;
    return this.camera.localToWorld(new V((x/this.w-.5)*height*this.camera.aspect,(.5-y/this.h)*height,-depth));
  }
  project(v){const p=v.clone().project(this.camera);return {x:(p.x+1)*this.w/2,y:(1-p.y)*this.h/2};}
  bounds(object){
    object.updateWorldMatrix(true,true);const points=[];
    object.traverse(node=>{
      if(!node.isMesh||!node.visible||node.geometry===outlineGeometry)return;
      if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
      const box=node.geometry.boundingBox;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(this.project(new V(x,y,z).applyMatrix4(node.matrixWorld)));
    });
    return {left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
  }
  place(el,b){if(!el)return;Object.assign(el.style,{left:`${b.left}px`,top:`${b.top}px`,width:`${Math.max(1,b.right-b.left)}px`,height:`${Math.max(1,b.bottom-b.top)}px`});}
  projectControls(){
    const entries=this.view.hand.map(c=>({id:c.id,box:this.bounds(this.cards.get(c.id))})).sort((a,b)=>a.box.left-b.box.left);
    entries.forEach(({id,box},i)=>{const next=entries[i+1];if(next)box.right=Math.min(box.right,next.box.left+2);box.left=Math.max(1,Math.min(this.w-2,box.left));box.right=Math.max(box.left+1,Math.min(this.w-1,box.right));this.place(document.querySelector(`#hand [data-card-id="${CSS.escape(id)}"]`),box);});
    const deckBox=this.bounds(this.deck), cx=(deckBox.left+deckBox.right)/2, cy=(deckBox.top+deckBox.bottom)/2;
    const width=Math.min(this.w,Math.max(44,deckBox.right-deckBox.left)), height=Math.min(this.h,Math.max(44,deckBox.bottom-deckBox.top));
    const left=Math.max(0,Math.min(this.w-width,cx-width/2)), top=Math.max(0,Math.min(this.h-height,cy-height/2));
    this.place(document.getElementById('draw'),{left,right:left+width,top,bottom:top+height});
    const debt=document.getElementById('debt');if(debt){debt.style.left=`${Math.max(8,Math.min(this.w-debt.offsetWidth-8,cx-debt.offsetWidth/2))}px`;debt.style.top=`${Math.max(110,top-28)}px`;}
    const decision=document.getElementById('drawn-decision'),drawn=this.cards.get(this.view.drawn);
    if(decision&&drawn&&!decision.hidden){const b=this.bounds(drawn);decision.style.left=`${Math.max(8,Math.min(this.w-decision.offsetWidth-8,(b.left+b.right-decision.offsetWidth)/2))}px`;decision.style.top=`${Math.max(116,b.top-decision.offsetHeight-12)}px`;}
    for(const p of this.view.players){
      const self=p.id===this.view.self,group=self?this.hand:this.players.get(p.id),b=this.seatBounds?.get(p.id)||this.bounds(group),anchor=self?{x:Number.isFinite(b.left)?(b.left+b.right)/2:this.w/2,y:this.h-100}:this.project(group.position);
      const el=document.querySelector(`#players [data-seat-id="${CSS.escape(p.id)}"]`);
      if(el){el.style.width=`${this.hudWidth}px`;const half=el.offsetWidth/2,side=self&&this.w>=900&&this.playerCount<=5,beside=side&&b.left>this.hudWidth+24;el.style.left=`${Math.max(half+4,Math.min(this.w-half-4,side?this.w*.13:anchor.x))}px`;el.style.bottom='auto';el.style.top=`${beside?Math.min(this.h-el.offsetHeight-24,b.top+12):Math.max(110,(Number.isFinite(b.top)?b.top:anchor.y)-(self&&Number.isFinite(b.top)?(b.bottom-b.top)/6:0)-el.offsetHeight-8)}px`;}
    }
    // When a full-size hand leaves no room beside it, keep its placard above
    // the hand but slide into a clear horizontal gap, not onto a lower bot.
    const selfEl=document.querySelector(`#players [data-seat-id="${CSS.escape(this.view.self)}"]`);
    if(selfEl&&this.w>=900&&this.playerCount<=5){
      const b=selfEl.getBoundingClientRect(),own=this.seatBounds.get(this.view.self);
      const occupied=[...this.seatBounds.values(),...[...document.querySelectorAll('#players .seat')].filter(el=>el!==selfEl).map(el=>el.getBoundingClientRect()),...(this.ringBounds?[this.ringBounds]:[])];
      occupied.push({...own,top:own.top-(own.bottom-own.top)/6});
      const fits=x=>occupied.every(a=>x+b.width/2+8<=a.left||x-b.width/2-8>=a.right||b.bottom+8<=a.top||b.top-8>=a.bottom);
      const origin=b.left+b.width/2,candidates=[origin];for(let x=b.width/2+12;x<this.w-b.width/2-12;x+=8)candidates.push(x);
      const x=candidates.filter(fits).sort((a,b)=>Math.abs(a-origin)-Math.abs(b-origin))[0];if(x!==undefined)selfEl.style.left=`${x}px`;
    }
    const status=document.getElementById('table-status');if(status){
      const pile=this.pileBounds||this.bounds(this.pile),self=document.querySelector(`#players [data-seat-id="${CSS.escape(this.view.self)}"]`).getBoundingClientRect();
      const bottom=decision&&!decision.hidden?Math.min(self.top,parseFloat(decision.style.top))-10:self.top-10;
      status.style.top=`${Math.max(pile.bottom+10,Math.min(Math.max(pile.bottom+16,this.h*.54),bottom-status.offsetHeight))}px`;
      status.classList.toggle('status-crowded',pile.bottom+10+status.offsetHeight>bottom);
    }
    const prompt=document.getElementById('jump-prompt');
    if(prompt&&!prompt.hidden){const boxes=this.view.legal.map(id=>this.cards.get(id)).filter(Boolean).map(m=>this.bounds(m));if(boxes.length){const b=boxes[0];prompt.style.left=`${Math.max(8,Math.min(this.w-prompt.offsetWidth-8,(b.left+b.right-prompt.offsetWidth)/2))}px`;prompt.style.top=`${Math.max(110,b.top-prompt.offsetHeight-10)}px`;}}
    this.projectSwapArrow();
  }
  projectSwapArrow(){
    const svg=document.getElementById('swap-arrow'),effect=this.view?.presentation;
    if(!svg)return;
    const show=['swap','rotate'].includes(effect?.kind)&&effect.phase!=='settle';svg.toggleAttribute('hidden',!show);if(!show)return;
    const anchor=id=>{const el=document.querySelector(`#players [data-seat-id="${CSS.escape(id)}"] .seat-avatar`),r=el?.getBoundingClientRect();if(r?.width)return {x:r.x+r.width/2,y:r.y+r.height/2,radius:r.width/2};const b=this.bounds(this.hand);return Number.isFinite(b.top)?{x:(b.left+b.right)/2,y:b.top-8,radius:0}:{x:this.w/2,y:this.h-95,radius:0};};
    const path=(from,to)=>{
      const a=anchor(from),b=anchor(to);
      const bend=Math.min(this.h-170,Math.max(210,(a.y+b.y)/2-90));
      const centre={x:(a.x+b.x)/2,y:bend};
      const trim=p=>{const dx=centre.x-p.x,dy=centre.y-p.y,d=Math.hypot(dx,dy)||1;return {x:p.x+dx/d*(p.radius+10),y:p.y+dy/d*(p.radius+10)};};
      const start=trim(a),end=trim(b);
      return `M ${start.x} ${start.y} Q ${centre.x} ${centre.y} ${end.x} ${end.y}`;
    };
    svg.setAttribute('viewBox',`0 0 ${this.w} ${this.h}`);
    const swap=document.getElementById('swap-path'),rotation=document.getElementById('rotate-paths');
    swap.style.display=effect.kind==='swap'?'':'none';rotation.replaceChildren();
    if(effect.kind==='swap'){swap.setAttribute('d',path(effect.from,effect.to));swap.setAttribute('marker-start',swap.getAttribute('marker-end')||'url(#arrow-head)');}
    else this.view.players.forEach((p,i,players)=>{
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','path');
      arrow.setAttribute('d',path(p.id,players[(i+effect.direction+players.length)%players.length].id));
      rotation.append(arrow);
    });
  }
  updateSwap(){
    this.hand.visible=true;for(const group of this.players.values())group.visible=true;
    this.swapGhosts.clear();const e=this.view.presentation;
    const group=id=>id===this.view.self?this.hand:this.players.get(id);
    if(e?.kind==='rotate'&&e.phase==='flight') {
      const players=this.view.players;
      // Only card backs travel. Final private identities arrive at the settle stage.
      const positions=new Map(players.map(p=>[p.id,group(p.id).getWorldPosition(new V())]));
      players.forEach((p,i)=>{
        const source=group(p.id),destination=positions.get(players[(i+e.direction+players.length)%players.length].id);
        source.visible=false;
        const fan=new THREE.Group(),n=Math.min(12,p.count);fan.userData.rotationGhost=true;fan.userData.from=p.id;
        fan.userData.to=players[(i+e.direction+players.length)%players.length].id;
        for(let j=0;j<n;j++){const card=this.card(null,this.scale);card.position.set((j-(n-1)/2)*this.width*.25,0,j*.1);fan.add(card);}
        fan.position.copy(destination);fan.lookAt(this.camera.position);fan.scale.copy(group(fan.userData.to).getWorldScale(new V()));this.swapGhosts.add(fan);
        if(n&&!this.reduced)this.fly(fan,positions.get(p.id),fan.quaternion.clone(),0,TIMING.rotate,{kind:'rotate',sourceScale:source.getWorldScale(new V())});
      });
      return;
    }
    if(e?.kind!=='swap'||e.phase!=='flight')return;
    const from=group(e.from),to=group(e.to);if(!from||!to)return;
    const a=from.getWorldPosition(new V()),b=to.getWorldPosition(new V());
    from.visible=false;to.visible=false;
    const startTime=performance.now();
    const ghost=(destination,source,animate,count,sourceGroup,targetGroup)=>{
      const fan=new THREE.Group();fan.userData.swapGhost=true;
      // Copy only public geometry/transforms, replacing every face with a back.
      for(const original of sourceGroup.children.slice(0,40)){const card=this.card(null,original.scale.x);card.position.copy(original.position);card.quaternion.copy(original.quaternion);fan.add(card);}
      fan.position.copy(destination);fan.quaternion.copy(targetGroup.getWorldQuaternion(new THREE.Quaternion()));fan.scale.copy(targetGroup.getWorldScale(new V()));this.swapGhosts.add(fan);
      if(animate&&!this.reduced){this.fly(fan,source,sourceGroup.getWorldQuaternion(new THREE.Quaternion()),0,TIMING.swap,{kind:'swap',sourceScale:sourceGroup.getWorldScale(new V())});this.animations.at(-1).startTime=startTime;}
    };
    ghost(b,a,true,this.view.players.find(p=>p.id===e.from).count,from,to);
    ghost(a,b,true,this.view.players.find(p=>p.id===e.to).count,to,from);
  }
  bindTargets(){
    const deck=document.getElementById('draw');if(deck){deck.onpointerenter=deck.onfocus=()=>{this.deckHover=!deck.disabled;};deck.onpointerleave=deck.onblur=()=>{this.deckHover=false;};}
    for(const button of document.querySelectorAll('#hand .card')){
      button.onpointerenter=()=>this.setHover(button.disabled?null:button.dataset.cardId);
      button.onpointerleave=()=>this.setHover(null);button.onfocus=button.onpointerenter;button.onblur=button.onpointerleave;
    }
  }
  setHover(id){this.hover=id;}
  disposeTint(mesh){if(mesh.userData.privateTint)for(const key of ['front','back','body'])mesh.userData[key].material.dispose();}
  fly(mesh,from,rotation,delay=0,duration=500,{kind='transfer',sourceScale}={}){
    mesh.parent.updateWorldMatrix(true,false);
    const target=mesh.position.clone(),targetRotation=mesh.quaternion.clone(),targetScale=mesh.scale.clone();
    const end=mesh.getWorldPosition(new V()),distance=from.distanceTo(end);
    const start=mesh.parent.worldToLocal(from.clone());
    const parentRotation=mesh.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const startRotation=parentRotation.multiply(rotation),startScale=sourceScale?sourceScale.clone().divide(mesh.parent.getWorldScale(new V())):targetScale.clone();
    const up=kind==='swap'?end.clone().sub(from).cross(this.camera.getWorldDirection(new V())).normalize():new V(0,1,0).applyQuaternion(this.camera.quaternion),lift=Math.max(8,Math.min(45,distance*.32));
    const controls=kind==='reflow'?[start,target]:[start,mesh.parent.worldToLocal(from.clone().lerp(end,.22).addScaledVector(up,lift*.7)),mesh.parent.worldToLocal(from.clone().lerp(end,.65).addScaledVector(up,lift)),target];
    const curve=kind==='reflow'?null:new THREE.CatmullRomCurve3(controls,false,'catmullrom',.35);
    mesh.position.copy(start);mesh.quaternion.copy(startRotation);mesh.scale.copy(startScale);mesh.userData.flying=true;mesh.visible=delay===0;
    this.animations.push({mesh,start,target,startRotation,targetRotation,startScale,targetScale,curve,kind,owner:mesh.parent.userData.player,startTime:performance.now()+delay,duration});
  }
  frame(time=performance.now()){
    const dt=Math.min(50,time-(this.lastTime||time));this.lastTime=time;
    let ringAlpha=1;
    if(this.directionTween){const d=this.directionTween,p=Math.min(1,(time-d.start)/800);this.displayDirection=this.reduced||p>=.5?d.to:d.from;ringAlpha=this.reduced?1:Math.abs(p*2-1);if(p===1)this.directionTween=null;}
    if(!this.reduced)this.ring.rotation.y-=dt*.00075*(this.displayDirection||1);
    this.ring.scale.x=(this.displayDirection===1?-1:1)*(this.ringScale||1);
    for(const arc of this.ring.children)arc.material.opacity=ringAlpha;
    this.animations=this.animations.filter(a=>{
      if(!a.mesh.parent){a.mesh.userData.flying=false;return false;}
      if(time<a.startTime&&!this.reduced){a.mesh.visible=false;return true;}a.mesh.visible=true;
      const progress=this.reduced?1:Math.max(0,Math.min(1,(time-a.startTime)/a.duration)),ease=a.kind==='play'?progress*progress:progress*progress*(3-2*progress);
      if(a.curve)a.mesh.position.copy(a.curve.getPoint(ease));else a.mesh.position.lerpVectors(a.start,a.target,ease);
      a.mesh.quaternion.slerpQuaternions(a.startRotation,a.targetRotation,ease);a.mesh.scale.lerpVectors(a.startScale,a.targetScale,ease);
      if(a.kind==='swap'){
        // Opposite lanes must remain visible even on portrait screens. Translate
        // the travelling fan at its actual depth; never shrink it to fit.
        const b=this.bounds(a.mesh),dx=b.left<8?8-b.left:b.right>this.w-8?this.w-8-b.right:0,dy=b.top<100?100-b.top:b.bottom>this.h-8?this.h-8-b.bottom:0;
        if(dx||dy){const world=a.mesh.getWorldPosition(new V()),depth=-this.camera.worldToLocal(world.clone()).z;world.add(this.screenPoint(dx,dy,depth).sub(this.screenPoint(0,0,depth)));a.mesh.position.copy(a.mesh.parent.worldToLocal(world));}
      }
      if(progress===1){a.mesh.position.copy(a.target);a.mesh.userData.flying=false;return false;}return true;
    });
    this.effects.frame(time);
    outlineMaterial.opacity=this.reduced?1:.82+.18*Math.sin(time/180);
    const deckTop=this.deck.children.at(-1),deckTarget=this.deckHover&&this.canAct&&this.view.turn===this.view.self&&!this.view.drawn&&!this.view.autoDraw&&!this.view.presentation?1:0;
    if(deckTop){const data=deckTop.userData;if(data.hoverTarget!==deckTarget){data.hoverFrom=data.hoverAmount||0;data.hoverTarget=deckTarget;data.hoverStart=time;}
      const p=this.reduced?1:Math.min(1,Math.max(0,(time-data.hoverStart)/300));data.hoverAmount=THREE.MathUtils.lerp(data.hoverFrom,deckTarget,1-(1-p)**2);
      deckTop.position.z=data.baseZ+data.hoverAmount*this.scale;deckTop.rotation.x=data.hoverAmount*-.12;data.outline.visible=!!deckTarget;
    }
    for(const [id,card] of this.cards){
      const data=card.userData,p=this.reduced?1:Math.min(1,Math.max(0,(time-data.tintStart)/800)),tint=THREE.MathUtils.lerp(data.tintFrom,data.targetTint,1-(1-p)**2);
      for(const key of ['front','back','body'])data[key].material.color.setScalar(tint);
      const jump=this.canAct&&!this.view.unoWindow&&this.view.turn!==this.view.self&&this.view.jumpDeadline>time&&this.view.legal.includes(id);
      data.outline.visible=(id===this.hover||jump)&&this.view.legal.includes(id);if(data.flying)continue;
      const target=(data.baseY||0)+((id===this.hover||jump)&&id!==this.view.drawn?this.height/6:0);
      if(data.hoverTarget!==target){data.hoverFrom=card.position.y;data.hoverTarget=target;data.hoverStart=time;}
      const hp=Math.min(1,Math.max(0,(time-data.hoverStart)/300));card.position.y=this.reduced?target:THREE.MathUtils.lerp(data.hoverFrom,target,1-(1-hp)**2);
    }
    this.projectControls();this.draw();
  }
  draw(){
    if(!this.active)return;
    const background=this.scene.background;this.scene.background=null;
    this.camera.layers.set(1);this.bloom.render();this.camera.layers.set(0);
    this.scene.background=background;this.composer.render();this.canvas.dataset.rendered='true';
  }
  stop(){this.active=false;cancelAnimationFrame(this.frameId);this.frameId=0;}
}
