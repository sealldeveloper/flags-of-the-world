import {DiveTimeline,projectDepth,mix} from './motion.mjs';
import {OceanCanvas} from './ocean.mjs';
import {TIERS} from './model.mjs';
const $=id=>document.getElementById(id);
const COLORS={plankton:'#8fa3c4',tooclever:'#ff9f43',schooler:'#4de3ff',rare:'#ff5252',deepcut:'#9d7bff',krillion:'#ffd166'};

export class DivePresentation {
  constructor(root){
    this.root=root;this.timeline=new DiveTimeline();this.animations=new Set();this.ghosts=new Set();this.frameId=null;this.lastTime=null;this.lastPaint=0;this.lastKind='idle';this.lastState=null;this.mascot=null;this.paused=false;this.lowPower=false;
    this.preference=matchMedia('(prefers-reduced-motion: reduce)');this.ocean=new OceanCanvas($('ocean-canvas'),()=>this.wake());this.available=!!this.ocean.ctx;
    root.classList.toggle('live-ocean',this.available);root.dataset.renderer=this.available?'live':'fallback';
    this.preference.addEventListener('change',()=>this.setOptions({lowPower:this.lowPower}));
    this.observer=new ResizeObserver(()=>{this.needsResize=true;this.wake();});this.observer.observe(root);
    document.addEventListener('visibilitychange',()=>{this.lastTime=null;if(document.hidden){if(this.frameId!==null)cancelAnimationFrame(this.frameId);this.frameId=null;this.pauseAnimations(true);}else{this.pauseAnimations(!!document.querySelector('dialog[open]'));this.wake();}});
    this.resize();document.fonts?.ready.then(()=>{this.needsResize=true;this.wake();});
  }
  get reduced(){return this.lowPower||this.preference.matches;}
  get transitioning(){return this.timeline.sample().plunging&&!this.reduced;}
  reset(){
    for(const animation of this.animations)animation.cancel();this.animations.clear();for(const ghost of this.ghosts)ghost.remove();this.ghosts.clear();this.timeline.reset();this.lastState=null;this.lastKind='idle';this.mascot=null;this.root.dataset.motion='idle';this.root.classList.remove('is-plunging');$('next').disabled=false;
    if(this.frameId!==null)cancelAnimationFrame(this.frameId);this.frameId=null;this.lastTime=null;this.ocean.bubbles.length=0;this.ocean.sparks.length=0;
  }
  setOptions({lowPower=false}={}){
    const wasReduced=this.reduced;this.lowPower=!!lowPower;this.root.dataset.renderer=this.available?(this.reduced?'still':'live'):'fallback';
    if(this.reduced){for(const animation of this.animations)animation.cancel();for(const ghost of this.ghosts)ghost.remove();this.ghosts.clear();this.root.classList.remove('is-plunging');$('next').disabled=false;this.lastKind='idle';}
    if(this.lastState)this.timeline.setState(this.lastState,{reduced:this.reduced});this.root.classList.toggle('motion-counters',!this.reduced);if(wasReduced!==this.reduced)this.lastTime=null;this.paint(this.timeline.sample(),0);this.wake();
  }
  resize(){
    this.needsResize=false;const width=this.root.clientWidth,height=this.root.clientHeight,changed=width!==this.width||height!==this.height;this.width=width;this.height=height;
    const cardHeight=$('question').hidden?this.cardHeight||150:$('question').offsetHeight;this.cardHeight=cardHeight;
    this.timeline.resize(width,height,cardHeight);if(changed){this.ocean.resize(width,height);this.mascot=null;}if(this.reduced)this.timeline.snap();
  }
  animate(element,frames,options){
    if(this.reduced||!element?.animate)return;
    const animation=element.animate(frames,{duration:500,easing:'cubic-bezier(.22,1,.36,1)',...options});this.animations.add(animation);
    animation.finished.then(()=>this.animations.delete(animation),()=>this.animations.delete(animation));return animation;
  }
  leaveQuestion(){
    if(this.reduced||$('question').hidden)return;
    const ghost=$('question').cloneNode(true);ghost.removeAttribute('id');for(const child of ghost.querySelectorAll('[id]'))child.removeAttribute('id');ghost.removeAttribute('aria-labelledby');ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.classList.add('motion-ghost');this.root.appendChild(ghost);this.ghosts.add(ghost);
    const animation=this.animate(ghost,[{opacity:1,transform:'translateX(-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-28px) scale(.9)',filter:'blur(2px)'}],{duration:600,easing:'ease-in',fill:'forwards'});
    const remove=()=>{ghost.remove();this.ghosts.delete(ghost);};animation?.finished.then(remove,remove);
  }
  beforeRender(state){
    if(state.phase==='feedback'&&this.lastState?.phase==='answering')this.leaveQuestion();
  }
  render(state){
    const prior=this.lastState;this.resize();const event=this.timeline.setState(state,{reduced:this.reduced});this.lastState={...state,results:[...state.results]};
    this.root.dataset.tier=state.phase==='feedback'?(state.results.at(-1)?.tier||'miss'):'';this.root.classList.toggle('motion-counters',!this.reduced);this.root.classList.toggle('is-plunging',this.transitioning);$('next').disabled=this.transitioning;
    if(event==='descend'){
      this.animate($('question'),[{opacity:0,transform:'translate(-50%,46px) scale(.92)'},{opacity:1,transform:'translate(-50%,0) scale(1)'}],{duration:700,delay:450,easing:'cubic-bezier(.2,1.5,.4,1)',fill:'backwards'});
      if(prior?.phase==='intro')this.animate($('hud'),[{opacity:0,transform:'translateY(-80px)'},{opacity:1,transform:'translateY(0)'}],{duration:600,easing:'cubic-bezier(.34,1.56,.64,1)'});
    }
    if(state.phase==='answering'&&prior?.phase==='preview')this.animate($('answer-form'),[{transform:'translateY(120%)'},{transform:'translateY(0)'}],{duration:550,easing:'cubic-bezier(.34,1.56,.64,1)'});
    if(event==='plunge'){
      const result=state.results.at(-1);$('answer-chip').textContent=result.answer||result.rawAnswer||'';this.root.dataset.tier=result.tier||'miss';this.root.style.setProperty('--motion-tier',COLORS[result.tier]||'#8fa3c4');this.root.style.setProperty('--tier',COLORS[result.tier]||'#8fa3c4');this.buildTierLines();
      const frame=this.timeline.sample();this.ocean.bubble(this.width/2,this.height-100,frame,12);
    }
    if(event==='surface'&&state.phase==='done')this.animate($('done'),[{opacity:0,transform:'translateY(24px)'},{opacity:1,transform:'translateY(0)'}],{duration:800});
    this.lastKind=this.timeline.sample().kind;this.paint(this.timeline.sample(),0);this.wake();
  }
  buildTierLines(){
    $('tier-lines').replaceChildren(...Object.entries(TIERS).map(([id,tier])=>{const line=document.createElement('div');line.className='tier-line';line.dataset.tier=id;line.style.setProperty('--line-color',tier.color);const label=document.createElement('span'),image=document.createElement('img');image.src=new URL('./assets/'+id+'.png',import.meta.url);image.alt='';label.append(image,document.createTextNode(tier.name.toUpperCase()+' · '+tier.score));line.append(label);return line;}));
  }
  landed(frame){
    this.root.classList.remove('is-plunging');$('next').disabled=false;
    this.animate($('feedback'),[{opacity:0,scale:.5},{opacity:1,scale:1}],{duration:800,easing:'cubic-bezier(.2,1.7,.4,1)'});
    this.animate($('next-wrap'),[{opacity:0,translate:'0 30px'},{opacity:1,translate:'0 0'}],{duration:500,easing:'cubic-bezier(.34,1.56,.64,1)'});
    this.animate($('score').parentElement,[{scale:1},{scale:1.25,offset:.35},{scale:1}],{duration:500,delay:frame.tier==='krillion'?1000:0});
    this.ocean.burst(this.width/2,projectDepth(frame.depth,frame.camera,this.height),frame,COLORS[frame.tier]||'#8fa3c4',frame.tier==='krillion'?45:22);
    if(frame.tier==='krillion')this.animate($('mascot-image'),[{transform:'rotate(0) translateY(0) scale(1)'},{transform:'rotate(-140deg) translateY(-36px) scale(1.15)',offset:.3},{transform:'rotate(-280deg) translateY(-16px) scale(1.2)',offset:.6},{transform:'rotate(-360deg) translateY(0) scale(1)'}],{duration:1200,easing:'cubic-bezier(.65,0,.35,1)'});
  }
  pauseAnimations(paused){for(const animation of this.animations){if(paused&&animation.playState==='running')animation.pause();else if(!paused&&animation.playState==='paused')animation.play();}}
  wake(){if(!this.lastState||document.hidden||this.frameId!==null)return;this.frameId=requestAnimationFrame(time=>this.step(time));}
  step(now){
    this.frameId=null;if(document.hidden||!this.lastState)return;
    const paused=!!document.querySelector('dialog[open]');if(paused!==this.paused){this.paused=paused;this.pauseAnimations(paused);}const resized=this.needsResize;if(resized)this.resize();
    const dt=this.lastTime===null?0:Math.min(100,Math.max(0,now-this.lastTime));this.lastTime=now;
    const frame=this.reduced?this.timeline.sample():this.timeline.advance(paused?0:dt);
    if(this.lastKind==='plunge'&&!frame.plunging&&!this.reduced)this.landed(frame);this.lastKind=frame.kind;
    if(resized||now-this.lastPaint>=30||this.reduced){this.paint(frame,paused?0:dt/1000);this.lastPaint=now;}
    if(!this.reduced)this.wake();else this.lastTime=null;
  }
  paint(frame,dt){
    this.root.dataset.motion=frame.kind;this.root.dataset.motionProgress=String(frame.fraction??1);this.root.classList.toggle('is-plunging',frame.plunging&&!this.reduced);
    if(this.available)this.ocean.draw(frame,dt,{still:this.reduced});if(!frame.phase)return;
    const camera=frame.camera,w=this.width,h=this.height;
    this.root.classList.toggle('deep-spotlight',!this.reduced&&frame.tier==='deepcut'&&(frame.plunging||frame.kind==='landed'&&frame.landingElapsed<2300));this.root.style.setProperty('--light-x',(w/2)+'px');this.root.style.setProperty('--light-y',projectDepth(frame.plunging?frame.chipDepth:frame.depth,camera,h)+'px');
    $('surface').style.translate=`0 ${projectDepth(0,camera,h)-(h/2+90)}px`;
    if(!this.available)$('scene').style.opacity='1';
    if(['preview','answering'].includes(frame.phase))$('question').style.top=projectDepth(frame.depth,camera,h)+'px';
    const score=String(Math.round(frame.score)),depth=Math.round(frame.depth).toLocaleString()+'m';if($('score').dataset.display!==score){$('score').dataset.display=score;$('score-motion').textContent=score;}if($('depth').dataset.display!==depth){$('depth').dataset.display=depth;$('depth-motion').textContent=depth;}
    if(frame.plunging){
      const sway=frame.tier==='plankton'?Math.sin(frame.fraction*7)*36:Math.sin(frame.fraction*16)*(1-frame.fraction)*14;
      $('answer-chip').style.transform=`translate(calc(-50% + ${sway}px),${projectDepth(frame.chipDepth,camera,h)}px) rotate(${sway*.35}deg)`;
      for(const line of $('tier-lines').children){const tier=TIERS[line.dataset.tier],depth=frame.base+tier.score*10;line.style.transform=`translateY(${projectDepth(depth,camera,h)}px)`;line.classList.toggle('passed',frame.chipDepth>depth-4);}
    }
    let x,y,rotation=0;
    if(frame.phase==='intro'){x=w*.72;y=projectDepth(0,camera,h)+105;}
    else if(frame.kind==='descend'){x=w*.72;y=h*.4;rotation=6;}
    else if(frame.plunging){x=Math.min(w/2-(w<700?24:0)+95,w-44);y=projectDepth(frame.chipDepth,camera,h)-14;rotation=24;}
    else if(frame.phase==='feedback'&&frame.tier==='krillion'){
      const feedback=$('feedback'),icon=$('feedback-icon');x=feedback.offsetLeft+feedback.offsetWidth/2-(w>=700?feedback.offsetWidth/2:0);if(w>=700)x=w/2-24;
      y=feedback.offsetTop+icon.offsetHeight/2; // Ignore the banner's temporary scale animation.
    }else if(frame.phase==='feedback'){x=w*.16;y=h*.28;rotation=-8;}
    else{x=48;y=h-168;}
    if(!this.mascot||this.reduced)this.mascot={x,y,rotation};else{const fraction=1-Math.exp(-2.6*dt);for(const [key,target]of Object.entries({x,y,rotation}))this.mascot[key]=mix(this.mascot[key],target,fraction);}
    const size=frame.phase==='feedback'&&frame.tier==='krillion'&&!frame.plunging?(w<700?66:88):64;$('mascot').style.width=size+'px';$('mascot').style.height=size+'px';$('mascot').style.transform=`translate3d(${this.mascot.x-size/2}px,${this.mascot.y-size/2}px,0) rotate(${this.mascot.rotation}deg)`;
    this.root.classList.toggle('gold-mascot',frame.phase==='feedback'&&frame.tier==='krillion'&&!frame.plunging);
    this.root.style.setProperty('--ocean-vignette',Math.min(.72,.25+Math.max(0,camera)/2400));
  }
  type(){if(!this.reduced){const box=$('answer').getBoundingClientRect(),root=this.root.getBoundingClientRect();this.ocean.bubble(box.left-root.left+12,box.bottom-root.top-10,this.timeline.sample(),2);this.wake();}}
  reject(){this.animate($('answer-form'),[{translate:'0 0'},{translate:'-8px 0',offset:.2},{translate:'7px 0',offset:.45},{translate:'-4px 0',offset:.7},{translate:'0 0'}],{duration:400,easing:'linear'});}
  correction(){this.animate($('correction'),[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:180});}
}
