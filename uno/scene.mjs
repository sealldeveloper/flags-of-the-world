// Local Three.js presentation adapter. Receives only the recipient-filtered view;
// never reads Room.state, transports, the deck, or opponents' card identities.
import * as THREE from './vendor/three/three.module.js';
import {Reflector} from './vendor/three/addons/objects/Reflector.js';
import {EffectComposer} from './vendor/three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from './vendor/three/addons/postprocessing/ShaderPass.js';
import {TIMING} from './presentation.mjs';

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
const dimWhite = new THREE.MeshBasicMaterial({color:0x858585});
const outlineShape=roundedShape(6,9.3,.8);outlineShape.holes.push(roundedShape(5.6,8.9,.68));
const outlineGeometry=new THREE.ShapeGeometry(outlineShape,16);
const outlineMaterial=new THREE.MeshBasicMaterial({color:0xffd64e,side:THREE.DoubleSide});

export class CardTable {
  constructor(canvas, {onError = ()=>{}} = {}) {
    this.canvas=canvas; this.onError=onError; this.active=false; this.cards=new Map(); this.players=new Map();
    this.textures=new Map(); this.texturePromises=[]; this.faces=new Map(); this.discards=[]; this.animations=[]; this.hover=null;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    this.reflector=new Reflector(new THREE.PlaneGeometry(500,500),{textureWidth:1024,textureHeight:1024,clipBias:.2,color:0x888888,multisample:0});
    const target=this.reflector.getRenderTarget();target.depthTexture=new THREE.DepthTexture(1024,1024);
    target.depthTexture.type=THREE.UnsignedIntType;
    this.reflector.material.uniforms.tDepth={value:target.depthTexture};
    this.reflector.material.fragmentShader=`
      #include <packing>
      uniform sampler2D tDiffuse; uniform sampler2D tDepth; varying vec4 vUv;
      void main(){
        vec4 reflection=texture2DProj(tDiffuse,vUv);
        float depth=texture2DProj(tDepth,vUv).x;
        float linearDepth=viewZToOrthographicDepth(perspectiveDepthToViewZ(depth,0.1,300.0),0.1,300.0);
        gl_FragColor=vec4(reflection.rgb,clamp(1.0-linearDepth*12000.0,0.0,0.65));
        #include <colorspace_fragment>
      }`;
    this.reflector.material.transparent=true;
    const before=this.reflector.onBeforeRender;
    this.reflector.onBeforeRender=(renderer,scene,camera,...rest)=>{
      const visible=this.hand.visible;this.hand.visible=false;
      try{before.call(this.reflector,renderer,scene,camera,...rest);}finally{this.hand.visible=visible;}
    };
    this.reflector.rotation.x=-PI/2;this.scene.add(this.reflector);
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
    this.ready=Promise.all(this.texturePromises);
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
    const effectKey=`${view.round}:${view.revision}:${view.presentation?.kind}:${view.presentation?.phase}:${view.presentation?.step}`;
    if(effectKey!==this.effectKey){for(const a of this.animations){a.mesh.position.copy(a.target);a.mesh.quaternion.copy(a.targetRotation);a.mesh.userData.flying=false;}this.animations=[];this.effectKey=effectKey;}
    const source=this.cards.get(view.top?.id)||this.players.get(view.lastPlayedBy || previous?.turn)?.children.at(-1);
    const playedFrom=source?.getWorldPosition(new V()), playedRotation=source?.getWorldQuaternion(new THREE.Quaternion());
    let newDiscard=null;
    if(previous?.self!==view.self)this.round=null;
    this.view=view;this.canAct=online&&!pending&&view.phase==='playing'&&(view.turn===view.self||view.legal.length>0);
    if(!this.canAct||!view.legal.includes(this.hover))this.hover=null;
    if(!this.active){this.active=true;this.lastTime=performance.now();this.frameId=requestAnimationFrame(this.tick);}
    const count=view.players.length;
    this.scale=count>5?Math.max(.8,2.2-.1*(count-5)):2.35;
    this.width=5.6*this.scale;this.height=8.9*this.scale;
    this.radius=Math.min(130,70+6*(count-1));this.floor=-this.height/2;
    this.reflector.position.y=this.floor;
    if(this.playerCount!==count){
      this.playerCount=count;
      for(const child of [...this.ring.children]){this.ring.remove(child);child.geometry.dispose();child.material.dispose();}
      const radius=2.3*this.width,weight=radius/16*this.scale;
      this.ring.add(this.arc(radius,weight,0),this.arc(radius,weight,PI));
      this.ring.position.set(0,this.floor+.1,-26);
      this.deck.clear();
      const deckScale=this.deckParameters().scale;
      const block=this.card(null,deckScale);block.children[0].scale.z=35;block.children[1].position.z=.9;
      this.deck.add(block);this.deck.rotation.set(-PI/2,0,0);
    }
    const live=new Set(view.hand.map(c=>c.id));
    for(const [id,card] of this.cards)if(!live.has(id)){this.hand.remove(card);this.cards.delete(id);}
    for(const c of view.hand){
      if(!this.cards.has(c.id)){const mesh=this.card(c,this.scale);mesh.userData.id=c.id;this.hand.add(mesh);this.cards.set(c.id,mesh);added.push(mesh);}
      const mesh=this.cards.get(c.id);mesh.scale.setScalar(this.scale);
      const dim=!online||(view.turn!==view.self&&!view.legal.includes(c.id));
      mesh.userData.front.material=this.material(cardAsset(c),dim);mesh.userData.back.material=this.material(new URL('back.png',ASSETS).href,dim);mesh.userData.body.material=dim?dimWhite:white;
      mesh.userData.dim=dim;mesh.userData.outline.visible=this.hover===c.id;
    }
    const ids=new Set(view.players.filter(p=>p.id!==view.self).map(p=>p.id));
    for(const [id,group] of this.players)if(!ids.has(id)){this.scene.remove(group);this.players.delete(id);}
    for(const p of view.players.filter(p=>p.id!==view.self)){
      if(!this.players.has(p.id)){const group=new THREE.Group();this.scene.add(group);this.players.set(p.id,group);}
      const group=this.players.get(p.id),n=Math.min(40,p.count);
      while(group.children.length>n)group.remove(group.children.at(-1));
      while(group.children.length<n){const card=this.card(null,this.scale);group.add(card);added.push(card);}
      const spacing=this.width*Math.min(4-.2*(count-2),Math.max(0,n-1))/Math.max(1,n);
      group.children.forEach((card,i)=>{card.scale.setScalar(this.scale);card.position.set((i-(n-1)/2)*spacing,0,-i*.15);});
    }
    if(this.round!==view.round){this.round=view.round;this.pile.clear();this.discards=[];}
    if(view.top&&this.discards.at(-1)?.userData.id!==view.top.id){
      const card=this.card(view.top,this.scale,view.top.colour==='wild'?view.colour:undefined);
      card.userData.id=view.top.id;card.rotation.set(PI/2,0,PI/2+Math.sin(view.revision*2.39)*PI/6);
      card.position.set(Math.sin(view.revision)*.4,.12+this.discards.length*.08,Math.cos(view.revision)*.4);
      this.pile.add(card);this.discards.push(card);newDiscard=card;
      if(this.discards.length>10){this.pile.remove(this.discards.shift());this.discards.forEach((c,i)=>c.position.y=.12+i*.08);}
    }
    this.pile.position.set(0,this.floor,-26);
    this.layout();this.bindTargets();this.updateSwap();
    if(!this.reduced&&!['swap','rotate'].includes(view.presentation?.kind)){
      const deckPosition=this.deck.getWorldPosition(new V()),deckRotation=this.deck.getWorldQuaternion(new THREE.Quaternion());
      added.forEach((mesh,i)=>this.fly(mesh,deckPosition,deckRotation,i*32,view.presentation?.kind==='draw'?330:500));
      if(newDiscard&&playedFrom&&previous?.round===view.round)this.fly(newDiscard,playedFrom,playedRotation);
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
    const w=innerWidth,h=innerHeight;this.w=w;this.h=h;
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
    const n=this.view.hand.length,spacing=Math.min(this.width,span/Math.max(1,n));
    this.view.hand.forEach((c,i)=>{const mesh=this.cards.get(c.id);mesh.position.set(((n-1)/2-i)*spacing,0,i*.015);});
    const others=this.view.players.filter(p=>p.id!==this.view.self);
    const start=-Math.min(85,47+5*(this.playerCount-1))*PI/180;
    others.forEach((p,i)=>{
      const angle=others.length===1?0:start+(-2*start)*i/(others.length-1),group=this.players.get(p.id);
      group.position.set(-Math.sin(angle)*this.radius,0,-Math.cos(angle)*this.radius);group.lookAt(new V(0,0,this.camera.position.z));
    });
    const d=this.deckParameters();this.deck.position.set(-Math.sin(d.angle)*d.dist,this.floor+d.scale*.9,-Math.cos(d.angle)*d.dist);this.deck.rotation.set(-PI/2,0,-d.angle*d.rotation);
    this.scene.updateMatrixWorld(true);
    if(w<h){
      const objects=[this.deck,...this.players.values()];
      const extent=Math.max(...objects.map(obj=>{const b=this.bounds(obj);return Math.max(w/2-b.left,b.right-w/2);}));
      if(extent>w/2-12){
        this.camera.zoom*=((w/2-12)/extent);this.camera.updateProjectionMatrix();
        const visibleHeight=2*distance*Math.tan(this.camera.fov*PI/360)/this.camera.zoom;
        this.hand.position.set(0,0,-distance);this.hand.rotation.set(0,0,0);this.camera.updateMatrixWorld(true);
        this.hand.lookAt(new V(0,18,-5));this.hand.translateY(-visibleHeight/2+this.height*.67+5);
        this.scene.updateMatrixWorld(true);
      }
    }
    // Table framing must not shrink the local hand to the size of remote seats.
    if(w<=600&&this.view.hand.length){
      const measured=this.bounds(this.hand),factor=Math.min(3,(w*.9)/(measured.right-measured.left),Math.min(160,h*.2)/(measured.bottom-measured.top));
      this.hand.scale.setScalar(factor);this.scene.updateMatrixWorld(true);
    }
    // Leave room for the play hint and optional Pass button, not a confirmation bar.
    const handBottom=this.bounds(this.hand).bottom, desiredBottom=h-(w>1200?16:65);
    const pixelsPerUnit=h*this.camera.zoom/(2*distance*Math.tan(this.camera.fov*PI/360));
    if(Number.isFinite(handBottom))this.hand.position.y+=(handBottom-desiredBottom)/pixelsPerUnit;
    this.scene.updateMatrixWorld(true);
    this.projectControls();
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
    const status=document.getElementById('table-status');if(status){const hand=this.bounds(this.hand),pile=this.bounds(this.pile),handTop=Number.isFinite(hand.top)?hand.top:this.h-100;status.style.top=`${Math.max(this.h*.4,Math.min(Math.max(pile.bottom+14,this.h*.54),handTop-status.offsetHeight-(decision&&!decision.hidden?decision.offsetHeight+24:18)))}px`;}
    for(const p of this.view.players){
      if(p.id===this.view.self)continue;
      const group=this.players.get(p.id),anchor=this.project(group.position.clone().add(new V(0,this.height*1.35,0)));
      const el=document.querySelector(`#players [data-seat-id="${CSS.escape(p.id)}"]`);
      if(el&&this.view.players.length>=4){el.style.left='';el.style.top='';continue;}
      if(el){const half=el.offsetWidth/2;el.style.left=`${Math.max(half+12,Math.min(this.w-half-12,anchor.x))}px`;el.style.top=`${Math.max(116,anchor.y-el.offsetHeight-8)}px`;}
    }
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
    if(effect.kind==='swap')swap.setAttribute('d',effect.phase==='inbound'?path(effect.to,effect.from):path(effect.from,effect.to));
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
        fan.position.copy(destination);fan.lookAt(this.camera.position);this.swapGhosts.add(fan);
        if(n&&!this.reduced)this.fly(fan,positions.get(p.id),fan.quaternion.clone(),0,TIMING.rotate);
      });
      return;
    }
    if(e?.kind!=='swap'||!['outbound','pause','inbound'].includes(e.phase))return;
    const from=group(e.from),to=group(e.to);if(!from||!to)return;
    const a=from.getWorldPosition(new V()),b=to.getWorldPosition(new V());
    from.visible=false;if(e.phase==='inbound')to.visible=false;
    const ghost=(destination,source,animate,count)=>{const fan=new THREE.Group(),n=Math.min(12,count);fan.userData.swapGhost=true;for(let i=0;i<n;i++){const card=this.card(null,this.scale);card.position.set((i-(n-1)/2)*this.width*.25,0,i*.1);fan.add(card);}fan.position.copy(destination);fan.lookAt(this.camera.position);this.swapGhosts.add(fan);if(animate&&!this.reduced)this.fly(fan,source,fan.quaternion.clone(),0,TIMING.outbound);};
    ghost(b.clone().add(new V(0,3,0)),a,e.phase==='outbound',this.view.players.find(p=>p.id===e.from).count);
    if(e.phase==='inbound')ghost(a,b,true,this.view.players.find(p=>p.id===e.to).count);
  }
  bindTargets(){
    for(const button of document.querySelectorAll('#hand .card')){
      button.onpointerenter=()=>this.setHover(button.disabled?null:button.dataset.cardId);
      button.onpointerleave=()=>this.setHover(null);button.onfocus=button.onpointerenter;button.onblur=button.onpointerleave;
    }
  }
  setHover(id){this.hover=id;}
  fly(mesh,from,rotation,delay=0,duration=500){
    mesh.parent.updateWorldMatrix(true,false);
    const target=mesh.position.clone(),targetRotation=mesh.quaternion.clone();
    const start=mesh.parent.worldToLocal(from.clone());
    const parentRotation=mesh.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const startRotation=parentRotation.multiply(rotation);
    mesh.position.copy(start);mesh.quaternion.copy(startRotation);mesh.userData.flying=true;
    this.animations.push({mesh,start,target,startRotation,targetRotation,startTime:performance.now()+delay,duration});
  }
  frame(time=performance.now()){
    const dt=Math.min(50,time-(this.lastTime||time));this.lastTime=time;
    if(!this.reduced)this.ring.rotation.y-=dt*.00075*(this.view?.direction||1);
    this.ring.scale.x=this.view?.direction===1?-1:1;
    this.animations=this.animations.filter(a=>{
      if(!a.mesh.parent){a.mesh.userData.flying=false;return false;}
      const progress=Math.max(0,Math.min(1,(time-a.startTime)/a.duration)),ease=progress*progress*(3-2*progress);
      a.mesh.position.lerpVectors(a.start,a.target,ease);a.mesh.position.y+=Math.sin(progress*PI)*12;
      a.mesh.quaternion.slerpQuaternions(a.startRotation,a.targetRotation,ease);
      if(progress===1){a.mesh.userData.flying=false;return false;}return true;
    });
    for(const [id,card] of this.cards){card.userData.outline.visible=id===this.hover;if(card.userData.flying)continue;const target=id===this.hover&&id!==this.view.drawn?this.height/6:0;card.position.y=this.reduced?target:THREE.MathUtils.lerp(card.position.y,target,Math.min(1,dt/100));}
    this.draw();
  }
  draw(){
    if(!this.active)return;
    const background=this.scene.background;this.scene.background=null;this.reflector.visible=false;
    this.camera.layers.set(1);this.bloom.render();this.camera.layers.set(0);
    this.scene.background=background;this.reflector.visible=true;this.composer.render();this.canvas.dataset.rendered='true';
  }
  stop(){this.active=false;cancelAnimationFrame(this.frameId);this.frameId=0;}
}
