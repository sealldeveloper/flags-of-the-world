import {Transport, token, encodeTicket, decodeTicket} from './transport.mjs';
import {newRoom, MAX_PLAYERS, startRound, applyAction, viewFor, botAction, legalCard, callUno, catchUno, finishUnoTurn} from './engine.mjs';
import {cleanName, validateAvatar, nextAvatar} from './profiles.mjs';
import {validateRules} from './rules.mjs';
import {effectDuration, TIMING} from './presentation.mjs';
const readResume = () => { try { return JSON.parse(sessionStorage.getItem('uno-resume') || 'null'); } catch { return null; } };
export const savedInvite = () => readResume()?.invite || '';
export class Room {
  constructor({onView, onStatus, onError, onLatency=()=>{}}) {
    Object.assign(this, {onView, onStatus, onError, onLatency, latency:{}, peers:new Map(), seats:new Map(), view:null, disposed:false, pending:null, retry:0});
  }
  async open(name, invite = '') {
    this.name = cleanName(name); this.isHost = !invite;
    this.onStatus('Connecting to an iroh relay…');
    this.ticket = invite ? decodeTicket(invite) : null;
    this.transport = await Transport.create(e => this.event(e));
    if (this.disposed) { await this.transport.close(); return; }
    this.heartbeat = setInterval(() => {
      if (this.isHost) {
        for (const [id,p] of this.peers) {
          if (Date.now() - p.lastSeen > 35000 || (!p.seat && Date.now() - p.created > 10000)) this.transport.disconnect(id);
          else this.ping(id,p);
        }
      } else if (this.connection) {
        if (Date.now() - this.lastSeen > 35000) this.transport.disconnect(this.connection);
        else this.send(this.connection, {type:'ping'});
      }
    }, 8000);
    if (this.isHost) {
      this.self = token(); this.state = newRoom({id:this.self, name:this.name});
      this.ticket = {v:5, ...this.transport.address(), room:token(), secret:token()};
      decodeTicket(encodeTicket(this.ticket));
      this.onStatus('Hosting · iroh connected'); this.broadcast();
    } else {
      const saved = readResume(); this.resume = saved?.room === this.ticket.room ? saved.secret : null;
      await this.dial();
    }
  }
  invite() { return `${location.origin}${location.pathname}#join=${encodeTicket(this.ticket)}`; }
  async dial() {
    if (this.disposed) return;
    this.onStatus(this.retry ? `Reconnecting (${this.retry}/4)…` : 'Connecting to host…');
    try {
      await this.transport.connect(this.ticket);
      if (this.disposed) return;
      clearTimeout(this.joinTimer);
      // The greeting can arrive before connect()'s promise resumes in JS.
      if (!this.joined) this.joinTimer = setTimeout(() => {
        if (this.connection) this.transport.disconnect(this.connection);
        else this.reconnect();
      }, 15000);
    } catch { this.reconnect(); }
  }
  reconnect() {
    clearTimeout(this.joinTimer); clearTimeout(this.retryTimer);
    if (this.disposed) return;
    this.connection = null; this.pending = null; this.joined = false;
    this.latency={};this.onLatency(this.latency);
    this.onView(this.view, false);
    if (++this.retry > 4) { this.onStatus('Disconnected · host unavailable'); this.onError('Could not reconnect. The host may have closed the tab. Leave and try the invite again.'); return; }
    this.onStatus(`Reconnecting (${this.retry}/4)…`);
    this.retryTimer = setTimeout(() => this.dial(), 500 * 2 ** this.retry);
  }
  send(id, message) {
    try { this.transport.send(id, {v:5, room:this.ticket?.room, ...message}); }
    catch { this.transport.disconnect(id); }
  }
  ping(id,p) {
    if(p.probe&&performance.now()-p.probe.start<30000)return;
    p.probe={nonce:token(),start:performance.now()};this.send(id,{type:'ping',nonce:p.probe.nonce});
  }
  publishLatency() {
    if(!this.state)return;
    const values=Object.fromEntries(this.state.players.map(p=>[p.id,p.id===this.self||p.bot?0:p.connected?([...this.peers.values()].find(q=>q.seat===p.id)?.rtt??null):null]));
    const signature=JSON.stringify(values);if(signature===this.latencySignature)return;
    this.latencySignature=signature;this.latency=values;this.onLatency(values);
    for(const [id,p]of this.peers)if(p.seat)this.send(id,{type:'latency',values});
  }
  timing() {
    const t=this.actionTiming;
    const now=performance.now(),valid=t&&t.round===this.state.round&&t.revision===this.state.effects?.revision;
    return valid?{revealMs:Math.max(0,t.revealUntil-now),jumpWindowMs:Math.max(0,t.jumpUntil-now),unoCatchable:!!this.state.unoWindow&&now>=t.catchFrom&&now<t.unoUntil,unoMs:this.state.unoWindow?Math.max(0,t.unoUntil-now):0}:{revealMs:0,jumpWindowMs:0,unoCatchable:false,unoMs:0};
  }
  pace() {
    const s=this.state,revealUntil=performance.now()+effectDuration(s.effects),played=s.effects?.events.find(e=>e.kind==='play');
    const jump=s.phase==='playing'&&s.rules.jumpIn&&played&&/^\d$/.test(played.card.value)&&!s.debt&&!s.drawn&&!s.unoWindow;
    this.actionTiming={round:s.round,revision:s.effects.revision,revealUntil,jumpUntil:jump?revealUntil+TIMING.jump:0,catchFrom:revealUntil+TIMING.unoCall,unoUntil:revealUntil+TIMING.unoCall+TIMING.unoCatch};
  }
  updateTurnClock() {
    const s=this.state,p=s.players[s.turn],timing=this.timing();
    if(s.phase!=='playing'||s.unoWindow||!p?.connected){this.turnClock=null;return;}
    const key=JSON.stringify([s.round,s.effects?.revision,s.turn,s.drawn]);
    if(this.turnClock?.key!==key)this.turnClock={key,start:performance.now()+Math.max(timing.revealMs,timing.jumpWindowMs),duration:30000};
  }
  snapshotFor(id) {
    const current=this.state.players[this.state.turn],timing=this.timing(),view=viewFor(this.state,id);
    if(id!==current?.id&&timing.jumpWindowMs<=0)view.legal=[];
    const clock=this.turnClock,now=performance.now();
    return {...view,...timing,turnMs:clock?Math.max(0,clock.start+clock.duration-now):0,turnDuration:clock?.duration||30000,autoDraw:!!(this.state.phase==='playing'&&!this.state.unoWindow&&!this.state.drawn&&current?.connected&&!current.hand.some(c=>legalCard(this.state,current,c)))};
  }
  event(e) {
    if (this.disposed) return;
    if (e.kind === 'transportError') { this.onError('iroh connection stopped. Leave and reconnect.'); return; }
    if (e.kind === 'connected') {
      if (this.isHost) this.peers.set(e.connection, {peer:e.peer, created:Date.now(), lastSeen:Date.now(), count:0, window:Date.now()});
      else {
        if (e.peer !== this.ticket.host) { this.transport.disconnect(e.connection); return; }
        if (this.connection && this.connection !== e.connection) this.transport.disconnect(this.connection);
        this.connection = e.connection; this.lastSeen = Date.now();
        this.send(e.connection, {type:'join', name:this.name, capability:this.ticket.secret, resume:this.resume});
      }
    } else if (e.kind === 'closed') {
      if (this.isHost) {
        const p = this.peers.get(e.connection); this.peers.delete(e.connection);
        if (p?.seat && ![...this.peers.values()].some(q => q.seat === p.seat)) {
          const seat = this.state.players.find(q => q.id === p.seat);
          if (seat && !seat.bot) { seat.connected = false; seat.ready = false; this.state.revision++; this.broadcast(); }
        }
      } else if (e.connection === this.connection) this.reconnect();
    } else if (e.kind === 'message') {
      let m;
      try { m = JSON.parse(e.data); if (!m || m.v !== 5 || m.room !== this.ticket.room || typeof m.type !== 'string') throw new Error(); }
      catch { this.transport.disconnect(e.connection); return; }
      if (this.isHost) this.hostMessage(e.connection, m);
      else if (e.connection === this.connection) this.guestMessage(m);
      else this.transport.disconnect(e.connection);
    }
  }
  hostMessage(id, m) {
    const p = this.peers.get(id); if (!p) return;
    p.lastSeen = Date.now();
    if (Date.now() - p.window > 1000) { p.window = Date.now(); p.count = 0; }
    if (++p.count > 25) { this.transport.disconnect(id); return; }
    if (m.type === 'ping') { this.send(id, {type:'pong',nonce:typeof m.nonce==='string'&&m.nonce.length<=32?m.nonce:undefined}); return; }
    if (m.type === 'pong') {
      if(p.probe&&m.nonce===p.probe.nonce){const rtt=performance.now()-p.probe.start;p.probe=null;if(rtt>=0&&rtt<35000){p.rtt=Math.round(rtt);this.publishLatency();}}
      return;
    }
    try {
      if (m.type === 'join') {
        if (p.seat) throw new Error('Already joined');
        if (m.capability !== this.ticket.secret) throw new Error('Wrong room capability');
        const name = cleanName(m.name);
        let seat;
        if (m.resume) {
          const session = [...this.seats.entries()].find(([,s]) => s.secret === m.resume);
          if (!session) throw new Error('That seat is no longer available');
          seat = this.state.players.find(q => q.id === session[0]);
          if (!seat || seat.bot) throw new Error('That seat is no longer available');
          // Transfer the authenticated seat; revoke every prior connection.
          for (const [otherId,other] of this.peers) if (other.seat === seat.id) { other.seat = null; this.transport.disconnect(otherId); }
        } else {
          if (this.state.phase === 'playing') throw new Error('Round in progress. Join after this round.');
          if (this.state.players.length >= MAX_PLAYERS) throw new Error('Lobby is full (8 players)');
          seat = {id:token(), name, avatar:nextAvatar(this.state.players), hand:[], ready:false, connected:true, bot:false};
          this.state.players.push(seat);
          this.seats.set(seat.id, {secret:token(), commands:new Map()});
        }
        seat.connected = true; p.seat = seat.id;
        this.state.revision++;
        this.send(id, {type:'welcome', self:seat.id, resume:this.seats.get(seat.id).secret});
        this.broadcast(); this.ping(id,p); return;
      }
      if (!p.seat) throw new Error('Join the lobby first');
      if (m.type !== 'command' || typeof m.id !== 'string' || !/^[a-f0-9]{32}$/.test(m.id)) throw new Error('Invalid command');
      const cache = this.seats.get(p.seat).commands;
      if (cache.has(m.id)) { this.send(id, cache.get(m.id)); this.send(id, {type:'snapshot', view:this.snapshotFor(p.seat)}); return; }
      let error = null;
      try { this.execute(p.seat, m.action, m.revision); } catch (e) { error = e.message; }
      const ack = {type:'ack', id:m.id, error}; cache.set(m.id, ack);
      if (cache.size > 64) cache.delete(cache.keys().next().value);
      this.send(id, ack); this.broadcast();
    } catch (e) {
      this.send(id, {type:'rejected', message:e.message});
      // Give the rejection a chance to flush; never allow an unauthenticated seat.
      if (!p.seat) setTimeout(() => this.transport.disconnect(id), 250);
    }
  }
  guestMessage(m) {
    this.lastSeen = Date.now();
    if (m.type === 'ping') { this.send(this.connection, {type:'pong',nonce:typeof m.nonce==='string'&&m.nonce.length<=32?m.nonce:undefined}); return; }
    if (m.type === 'pong') return;
    if (m.type === 'latency') { this.latency=Object.fromEntries(Object.entries(m.values||{}).slice(0,8).map(([id,ms])=>[id,Number.isInteger(ms)&&ms>=0&&ms<35000?ms:null]));this.onLatency(this.latency);return; }
    if (m.type === 'welcome') {
      this.self = m.self; this.resume = m.resume; this.retry = 0; this.joined = true; clearTimeout(this.joinTimer);
      sessionStorage.setItem('uno-resume', JSON.stringify({room:this.ticket.room, secret:m.resume, invite:this.invite()}));
      this.onStatus('Connected · iroh');
    } else if (m.type === 'snapshot') {
      if (m.view?.self !== this.self || !Array.isArray(m.view.hand) || !Array.isArray(m.view.players)) return;
      this.view = {...m.view,latencyMs:this.latency[this.self]||0}; this.onView(this.view, true, !!this.pending);
    } else if (m.type === 'ack') {
      if (m.id === this.pending) { clearTimeout(this.commandTimer); this.pending = null; }
      if (m.error) this.onError(m.error);
      this.onView(this.view, true, false);
    } else if (m.type === 'rejected' || m.type === 'roomClosed') {
      this.onError(m.message || 'The host ended the room.'); this.onStatus('Room closed');
      this.stop(); sessionStorage.removeItem('uno-resume'); this.onView(this.view, false);
    }
  }
  execute(id, a, revision) {
    if (!a || typeof a !== 'object') throw new Error('Invalid action');
    const s = this.state, p = s.players.find(q => q.id === id);
    if (!p) throw new Error('Unknown seat');
    if (a.type === 'profile') {
      if (a.target !== undefined || !p.connected || p.bot) throw new Error('Only your own connected profile can be changed');
      if (s.phase === 'playing') throw new Error('Change your profile between rounds');
      const name=cleanName(a.name), avatar=validateAvatar(a.avatar);
      p.name=name; p.avatar=avatar; s.revision++; return;
    }
    if (a.type === 'ready') {
      if (s.phase === 'playing' || typeof a.ready !== 'boolean') throw new Error('Cannot change readiness now');
      p.ready = a.ready; s.revision++; return;
    }
    if (a.type==='uno') {
      if(a.target!==undefined||revision!==s.revision)throw new Error('The table changed. Call UNO again.');
      if(this.timing().revealMs>0||this.timing().unoMs<=0)throw new Error('Wait for your second-last card to land');
      callUno(s,id);return;
    }
    if(a.type==='catch-uno') {
      if(revision!==s.revision||!this.timing().unoCatchable)throw new Error('The missed-UNO catch window is closed');
      catchUno(s,id,a.target);this.pace();return;
    }
    if (['play','draw','pass'].includes(a.type)) {
      if (revision !== s.revision) throw new Error('The table changed. Please choose again.');
      const timing=this.timing();
      if(timing.revealMs>0)throw new Error('Wait for the cards to finish moving.');
      if(timing.jumpWindowMs>0&&s.players[s.turn].id===id)throw new Error('Jump-in window: wait before taking your normal turn.');
      if(s.players[s.turn].id!==id&&timing.jumpWindowMs<=0)throw new Error('The jump-in window is closed.');
      if(!this.automaticMove&&id===s.players[s.turn].id&&this.turnClock&&performance.now()>=this.turnClock.start+this.turnClock.duration)throw new Error('Your turn timer expired.');
      applyAction(s, id, a);
      this.pace();return;
    }
    if (id !== this.self) throw new Error('Only the host can do that');
    if (a.type === 'start') {
      if(a.force!==undefined&&typeof a.force!=='boolean')throw new Error('Invalid force-start flag');
      startRound(s,undefined,a.force===true);this.pace();
    }
    else if (a.type === 'bot') {
      if (s.phase === 'playing' || s.players.length >= MAX_PLAYERS) throw new Error('Cannot add a bot now');
      s.players.push({id:token(), name:`Bot ${s.players.filter(p => p.bot).length + 1}`, avatar:nextAvatar(s.players), bot:true, ready:true, connected:true, hand:[]}); s.revision++;
    } else if (a.type === 'rules') {
      if (s.phase === 'playing') throw new Error('Cannot change rules now');
      s.rules = validateRules(a);
      s.players.forEach(q => { q.ready = q.bot || q.id === this.self; }); s.revision++;
    } else if (a.type === 'remove') {
      const target = s.players.find(q => q.id === a.target && q.id !== this.self);
      if (!target) throw new Error('Invalid seat');
      if (s.phase === 'playing' && target.connected) throw new Error('Only disconnected players can be replaced during a round');
      this.seats.delete(target.id);
      for (const [conn,q] of this.peers) if (q.seat === target.id) {
        q.seat = null; this.send(conn, {type:'roomClosed', message:'The host removed your seat.'}); setTimeout(() => this.transport.disconnect(conn), 250);
      }
      if (s.phase === 'playing') { target.bot = true; target.connected = true; target.ready = true; target.name = `${target.name.slice(0,22)} (bot)`; }
      else s.players = s.players.filter(q => q !== target);
      s.revision++;
    } else throw new Error('Unknown action');
  }
  command(action) {
    if (this.disposed || !this.view) return;
    if (this.isHost) {
      try { this.execute(this.self, action, this.state.revision); this.broadcast(); } catch (e) { this.onError(e.message); }
    } else if (this.connection && !this.pending) {
      this.pending = token(); this.send(this.connection, {type:'command', id:this.pending, revision:this.view.revision, action});
      this.onView(this.view, true, true);
      this.commandTimer = setTimeout(() => { if (this.pending && this.connection) this.transport.disconnect(this.connection); }, 12000);
    }
  }
  broadcast() {
    if(this.state.unoWindow&&this.timing().unoMs<=0)finishUnoTurn(this.state);
    this.updateTurnClock();
    this.publishLatency();
    this.view = this.snapshotFor(this.self); this.onView(this.view, true);
    for (const [conn,p] of this.peers) if (p.seat) this.send(conn, {type:'snapshot', view:this.snapshotFor(p.seat)});
    clearTimeout(this.botTimer);clearTimeout(this.settleTimer);clearTimeout(this.turnTimer);
    const timing=this.timing(),wait=Math.max(timing.revealMs,timing.jumpWindowMs,timing.unoMs);
    const now=performance.now();
    const milestones=[timing.revealMs,timing.jumpWindowMs,timing.unoMs,this.state.unoWindow?this.actionTiming.catchFrom-now:0].filter(ms=>ms>0);
    if(milestones.length)this.settleTimer=setTimeout(()=>{if(!this.disposed)this.broadcast();},Math.min(...milestones)+10);
    const current = this.state.players[this.state.turn],forced=this.view.autoDraw;
    const jumper=timing.revealMs<=0&&timing.jumpWindowMs>0?this.state.players.find(p=>p.bot&&p.connected&&p.id!==current?.id&&p.hand.some(c=>legalCard(this.state,p,c))):null;
    const actor=jumper||(forced?current:current?.bot ? current : null);
    if(this.turnClock&&!actor){
      const clock=this.turnClock;
      this.turnTimer=setTimeout(()=>{
        if(this.disposed||this.turnClock!==clock||!current.connected)return;
        try {this.automaticMove=true;this.execute(current.id,botAction(this.state,current.id),this.state.revision);this.broadcast();}
        catch {this.onError('Timed move could not finish.');}
        finally {this.automaticMove=false;}
      },Math.max(0,clock.start+clock.duration-performance.now())+10);
    }
    if (this.state.phase === 'playing' && !this.state.unoWindow && actor) this.botTimer = setTimeout(() => {
      if (this.disposed) return;
      try { this.execute(actor.id,forced&&!jumper?{type:'draw'}:botAction(this.state,actor.id),this.state.revision);this.broadcast(); }
      catch { this.onError('Automatic move could not finish. End the room and report this state.'); }
    }, jumper?Math.min(700,timing.jumpWindowMs/2):wait+(forced?450:700));
  }
  async stop() {
    if (this.disposed) return;
    this.disposed = true;this.latency={};this.onLatency(this.latency);
    clearInterval(this.heartbeat);
    for (const key of ['botTimer','turnTimer','settleTimer','joinTimer','retryTimer','commandTimer']) clearTimeout(this[key]);
    await this.transport?.close();
  }
  async leave() {
    if (this.isHost) for (const id of this.peers.keys()) this.send(id, {type:'roomClosed', message:'The host ended the room.'});
    sessionStorage.removeItem('uno-resume');
    // Flush the explicit close notice before shutting down QUIC.
    await new Promise(resolve => setTimeout(resolve, 150)); await this.stop();
  }
}
