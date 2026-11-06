// Independent presentation timeline, based on observed public Krillion motion.
// No animation state is written to the game save or used for scoring/deadlines.
export const DESCENT_MS = 2400;
export const PLUNGE_MS = Object.freeze({plankton:3400,tooclever:3000,schooler:3000,rare:3400,deepcut:4300,krillion:4600,miss:900});
export const clamp = value => Math.max(0, Math.min(1, value));
export const mix = (from, to, fraction) => from + (to - from) * fraction;
export const easeDive = value => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
export const easeOut = value => 1 - (1 - value) ** 3;
export const projectDepth = (depth, camera, height) => height / 2 + 2 * (depth - camera);
export function questionTop(width, height, cardHeight = 150) {
  return Math.max(105, Math.min(width < 700 ? 175 : 210, height - 135 - cardHeight));
}
export function restingCamera(phase, depth, width, height, cardHeight, tier) {
  if (phase === 'intro' || phase === 'done') return -45;
  if (phase === 'feedback') return depth + (tier ? 30 : 70);
  return depth + (height / 2 - questionTop(width, height, cardHeight)) / 2;
}

export class DiveTimeline {
  constructor() { this.reset(); }
  reset() { this.key = ''; this.game = null; this.plan = null; this.elapsed = 0; this.camera = -45; this.time = 0; }
  resize(width, height, cardHeight = 150) { this.width = width; this.height = height; this.cardHeight = cardHeight; }
  setState(state, {reduced = false} = {}) {
    const key = `${state.date}:${state.phase}:${state.round}:${state.results.length}`;
    this.reduced = reduced;
    if (key === this.key) { if (reduced) this.snap(); return null; }
    const old = this.game, prior = this.sample(), sum = state.results.reduce((n, r) => n + r.score, 0), last = state.results.at(-1);
    this.game = {phase:state.phase,round:state.round,score:sum,depth:10*sum,tier:last?.tier,base:10*(sum-(state.phase === 'feedback' ? last?.score || 0 : 0))};
    this.key = key;
    if (!old || this.date !== state.date || reduced) { this.date = state.date; this.snap(); return 'restore'; }
    this.date = state.date;
    if (state.phase === 'preview' && (old.phase !== 'preview' || old.round !== state.round)) {
      this.plan = {kind:'descend',duration:DESCENT_MS,from:this.camera,scoreFrom:prior.score,depthFrom:prior.depth};
    } else if (state.phase === 'feedback' && old.phase !== 'feedback') {
      this.plan = {kind:'plunge',duration:PLUNGE_MS[last?.tier || 'miss'],from:this.camera,scoreFrom:sum-(last?.score||0),depthFrom:this.game.base};
    } else if (state.phase === 'done') {
      this.plan = {kind:'surface',duration:Math.min(9000,Math.max(2500,3*Math.max(0,this.camera))),from:this.camera,scoreFrom:sum,depthFrom:10*sum};
    } else if (state.phase === 'intro') {
      this.plan = {kind:'surface',duration:1600,from:this.camera,scoreFrom:0,depthFrom:0};
    } else return null; // Preview -> answering must not restart the dive.
    this.elapsed = 0;
    return this.plan.kind;
  }
  snap() {
    this.plan = null; this.elapsed = 0;
    if (this.game) this.camera = restingCamera(this.game.phase,this.game.depth,this.width,this.height,this.cardHeight,this.game.tier);
  }
  advance(milliseconds) {
    // Time is supplied only while visible/unpaused. Substeps keep damping stable
    // across different frame rates and deterministic browser-test clocks.
    let remaining = Math.max(0, Math.min(250, milliseconds));
    while (remaining > 0) {
      const step = Math.min(16, remaining); remaining -= step; this.elapsed += step; this.time += step;
      const target = this.targetCamera();
      this.camera = this.reduced ? target : mix(this.camera,target,1-Math.exp(-6*step/1000));
      if (Math.abs(this.camera-target) < .002) this.camera = target;
    }
    return this.sample();
  }
  targetCamera() {
    const g = this.game, p = this.plan;
    if (!g) return -45;
    const rest = restingCamera(g.phase,g.depth,this.width,this.height,this.cardHeight,g.tier);
    if (!p) return rest;
    const fraction = clamp(this.elapsed/p.duration);
    if (p.kind === 'descend') return mix(p.from,rest,easeDive(fraction));
    if (p.kind === 'surface') return mix(p.from,-45,easeOut(fraction));
    if (!g.tier) return mix(p.from,rest,easeOut(fraction));
    return mix(g.base+90,g.depth,g.tier === 'plankton' ? (1-Math.cos(Math.PI*fraction))/2 : easeDive(fraction))+30;
  }
  sample() {
    const g = this.game, p = this.plan;
    if (!g) return {camera:this.camera,score:0,depth:0,kind:'idle',plunging:false,time:this.time};
    let score = g.score, depth = g.depth, kind = 'idle', fraction = 1;
    if (p) {
      fraction = clamp(this.elapsed/p.duration);
      kind = fraction < 1 ? p.kind : p.kind === 'plunge' ? 'landed' : 'idle';
      if (p.kind === 'plunge') {
        const landingTime = this.elapsed-p.duration, gold = g.tier === 'krillion';
        score = mix(p.scoreFrom,g.score,1-(1-clamp((landingTime-(gold?1000:0))/(gold?1100:700)))**4);
        depth = gold ? mix(g.base,g.depth,1-(1-clamp((landingTime-1350)/880))**2) : mix(g.base,g.depth,g.tier === 'plankton' ? (1-Math.cos(Math.PI*fraction))/2 : easeDive(fraction));
      } else if (p.kind === 'descend') {
        score = mix(p.scoreFrom,g.score,easeOut(clamp(this.elapsed/700)));
        depth = mix(p.depthFrom,g.depth,easeOut(clamp(this.elapsed/700)));
      }
    }
    const progression = g.tier === 'plankton' ? (1-Math.cos(Math.PI*fraction))/2 : easeDive(fraction);
    return {...g,camera:this.camera,score,depth,kind,fraction,plunging:kind==='plunge',chipDepth:mix(g.base+90,g.depth,progression),time:this.time,landingElapsed:p?.kind==='plunge'?Math.max(0,this.elapsed-p.duration):0};
  }
}
