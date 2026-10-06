// Ordered, recipient-private presentation of an already validated host action.
// Game authority stays in the engine; animation never invents or submits moves.
export const TIMING = Object.freeze({deal:400,draw:800,play:1100,select:1000,outbound:1000,pause:500,inbound:1000,rotate:1500,settle:600,jump:1500,unoCall:3000,unoCatch:5000});
export function effectDuration(effects) {
  return (effects?.events || []).reduce((ms,e)=>ms+(e.kind==='deal'?e.count*TIMING.deal:e.kind==='draw'?e.count*TIMING.draw:e.kind==='play'?TIMING.play:e.kind==='swap'?TIMING.select+TIMING.outbound+TIMING.pause+TIMING.inbound+TIMING.settle:e.kind==='rotate'?TIMING.select+TIMING.rotate+TIMING.settle:0),TIMING.settle);
}
export function presentationFrames(previous,next,reduced=false) {
  const hold=()=>next.phase==='playing'&&next.revealMs>0?[{duration:next.revealMs,view:{...next,presentation:{kind:'wait'},legal:[]}}]:[];
  if (!previous || previous.self!==next.self || !next.effects || (previous.round===next.round&&previous.effects?.revision===next.effects.revision)) return hold();
  const dealing=next.effects.events.some(e=>e.kind==='deal');
  if(!dealing&&(previous.phase!=='playing'||previous.round!==next.round))return hold();
  let hand=dealing?[]:previous.hand.map(c=>({...c})), top=dealing?next.top:previous.top, colour=dealing?next.colour:previous.colour;
  const counts=new Map(previous.players.map(p=>[p.id,dealing?0:p.count])), frames=[];
  const stage=(presentation,duration)=>frames.push({duration,view:{...next,phase:'playing',turn:presentation.player||presentation.from||next.turn,winner:null,top,colour,hand:hand.map(c=>({...c})),players:next.players.map(p=>({...p,count:counts.get(p.id)??p.count})),legal:[],drawn:null,presentation}});
  for(const e of (next.effects.events||[]).slice(0,8)) {
    if(e.kind==='deal') {
      for(let i=1;i<=e.count;i++) {
        hand=next.hand.slice(0,i);next.players.forEach(p=>counts.set(p.id,i));
        stage({kind:'deal',step:i,total:e.count},TIMING.deal);
      }
    } else if(e.kind==='draw') {
      for(let i=0;i<Math.min(108,e.count);i++) {
        if(e.player===next.self&&e.cards?.[i])hand.push({...e.cards[i]});
        counts.set(e.player,(counts.get(e.player)||0)+1);
        stage({kind:'draw',player:e.player,step:i+1,total:e.count},TIMING.draw);
      }
    } else if(e.kind==='play') {
      if(e.player===next.self)hand=hand.filter(c=>c.id!==e.card.id);
      counts.set(e.player,Math.max(0,(counts.get(e.player)||0)-1));top=e.card;colour=e.colour;
      stage({kind:'play',player:e.player},TIMING.play);
    } else if(e.kind==='swap') {
      for(const phase of ['select','outbound','pause','inbound'])stage({kind:'swap',from:e.from,to:e.to,phase},TIMING[phase]);
      const from=counts.get(e.from);counts.set(e.from,counts.get(e.to));counts.set(e.to,from);
      if([e.from,e.to].includes(next.self))hand=next.hand.map(c=>({...c}));
      stage({kind:'swap',from:e.from,to:e.to,phase:'settle'},TIMING.settle);
    } else if(e.kind==='rotate') {
      const direction=e.direction===-1?-1:1;
      stage({kind:'rotate',direction,phase:'select'},TIMING.select);
      stage({kind:'rotate',direction,phase:'flight'},TIMING.rotate);
      next.players.forEach(p=>counts.set(p.id,p.count));hand=next.hand.map(c=>({...c}));
      stage({kind:'rotate',direction,phase:'settle'},TIMING.settle);
    }
  }
  stage({kind:'settle'},TIMING.settle);
  return frames;
}
export class TablePresentation {
  constructor(render,{reduced=false}={}) { this.render=render;this.reduced=reduced;this.reset(); }
  reset() { clearTimeout(this.timer);this.queue=[];this.busy=false;this.window=false;this.current=null;this.frameView=null;this.latest=null;this.online=false;this.pending=false;this.serial=(this.serial||0)+1; }
  receive(view,online=true,pending=false) {
    if(!view)return;
    if(this.latest&&this.latest.self!==view.self)this.reset();
    this.online=online;this.pending=pending;
    if(!online){this.reset();this.latest=this.current=view;this.render(view,false,false,false);return;}
    if(this.latest?.revision===view.revision) {
      this.latest=view;
      if(this.window&&!(view.jumpWindowMs>0)){clearTimeout(this.timer);this.window=this.busy=false;this.current=view;this.render(view,online,pending,false);this.next();}
      else if(this.window)this.render(this.frameView,online,pending,false);
      else if(!this.busy){this.current=view;this.render(view,online,pending,false);}
      return;
    }
    if(this.window){clearTimeout(this.timer);this.window=this.busy=false;this.serial++;}
    this.latest=view;this.queue.push(view);
    if(!this.busy)this.next();
  }
  next() {
    const next=this.queue.shift();if(!next)return;
    const frames=presentationFrames(this.current,next,this.reduced),serial=this.serial;
    const duration=frames.reduce((ms,f)=>ms+f.duration,0),windowMs=Math.max(0,(next.jumpWindowMs||0)-duration);
    if(windowMs>0&&!next.unoWindow)frames.push({duration:windowMs,view:{...next,presentation:{kind:'jump-window'},legal:next.self===next.turn?[]:next.legal}});
    this.busy=frames.length>0;
    const advance=()=>{
      if(serial!==this.serial)return;
      const frame=frames.shift();
      if(frame){this.frameView=frame.view;this.window=frame.view.presentation?.kind==='jump-window';if(this.window)this.current=next;this.render(frame.view,this.online,this.pending,!this.window);this.timer=setTimeout(advance,frame.duration);}
      else {this.current=next;this.busy=this.window=false;this.render(this.latest?.revision===next.revision?this.latest:next,this.online,this.pending,false);this.next();}
    };
    advance();
  }
}
