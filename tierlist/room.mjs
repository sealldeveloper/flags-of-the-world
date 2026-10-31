import {Transport, token} from '../uno/transport.mjs';
import {encodeInvite, decodeInvite} from './invite.mjs';
import {validateAlbum, validateBoard, cleanName, copy, MAX_BOARD} from './model.mjs';
import {encodeAlbum, decodeAlbum, verifyImages, previewAlbum} from './codec.mjs';
import {OriginalTransfer} from './progressive.mjs';
import {randomColour,cleanColour,validateEvent,boardChange,MAX_EVENTS} from './social.mjs';
const PROTOCOL=5;
const CHUNK = 24000, MAX_PLAYERS = 16;
const readResume = () => { try { return JSON.parse(sessionStorage.getItem('tierlist-resume') || 'null'); } catch { return null; } };
export const savedInvite = () => readResume()?.invite || '';
export class TierRoom {
  constructor({onState, onStatus, onError, onEvents=()=>{}}) {
    Object.assign(this,{onState,onStatus,onError,onEvents,peers:new Map(),players:new Map(),seats:new Map(),originalCache:new Map(),disposed:false,connected:false,retry:0,events:[],eventSerial:0});
  }
  async open(name, album = null, invite = '', color = null) {
    this.color=color===null?null:cleanColour(color);this.name = cleanName(name); this.isHost = !invite;
    if (this.isHost) {
      this.album = validateAlbum(album);
      if (!this.album.images.length) throw new Error('Add some images before hosting');
      this.onStatus('Preparing previews…');const previews=await previewAlbum(this.album);
      this.album.images.forEach((image,index)=>image.thumb=previews.images[index].data);this.album=validateAlbum(this.album);
      this.code=await encodeAlbum(previews);if(this.code.length>8*1024*1024)throw new Error('Lobby previews exceed the 8 MiB transfer limit.');
      this.originalTransfer=new OriginalTransfer(this.album,{host:true,send:(conn,message)=>this.send(conn,message),onPeerProgress:(conn,loaded)=>{const seat=this.peers.get(conn)?.seat,player=this.players.get(seat);if(player){player.originals=loaded;this.publishPresence(player);}}});
    } else {
      this.ticket=decodeInvite(invite);
      if(this.ticket.protocol!==PROTOCOL)throw new Error('This lobby uses an older version. Ask the host to refresh and share a new invite.');
    }
    if (this.disposed) return;
    this.onStatus('Connecting…');
    this.transport = await Transport.create(e=>this.event(e));
    if (this.disposed) { await this.transport.close(); return; }
    this.heartbeat = setInterval(()=>{
      if (this.isHost) {
        for (const [conn,p] of this.peers) {
          if (Date.now()-p.lastSeen>35000 || (!p.seat && Date.now()-p.created>12000)) this.transport.disconnect(conn);
          else this.send(conn,{type:'ping'});
        }
      } else if (this.connection) {
        if (Date.now()-this.lastSeen>35000) this.transport.disconnect(this.connection);
        else this.send(this.connection,{type:'ping'});
      }
    },8000);
    if (this.isHost) {
      this.self = token();this.hostId=this.self; this.connected = true;
      this.ticket = {...this.transport.address(),room:token(),secret:token()};
      decodeInvite(encodeInvite(this.ticket));
      this.players.set(this.self,{id:this.self,name:this.name,color:this.color || randomColour(),online:true,phase:'ready',progress:100,originals:this.album.images.length,seq:0,board:copy(this.album.board)});
      this.record(this.players.get(this.self),'activity','Started the lobby');
      this.onStatus('Hosting'); this.emit();
    } else {
      const saved = readResume(); this.resume = saved?.room === this.ticket.room ? saved.secret : null;
      await this.dial();
    }
  }
  inviteCode() {return encodeInvite(this.ticket);}
  invite() { return `${location.origin}${location.pathname}#join=${this.inviteCode()}`; }
  emit() {
    if (this.album && this.self && this.players.has(this.self)) this.onState({album:this.album,self:this.self,host:this.isHost,hostId:this.hostId,connected:this.connected,assets:this.originalTransfer?.state,players:[...this.players.values()]});
  }
  async dial() {
    if (this.disposed) return;
    this.onStatus(this.retry ? `Reconnecting (${this.retry}/4)…` : 'Connecting to host…');
    try {
      await this.transport.connect(this.ticket);
      if (!this.disposed && !this.welcomed) this.armTimeout();
    } catch { this.reconnect(); }
  }
  armTimeout() {
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(()=>{ if (this.connection) this.transport.disconnect(this.connection); else this.reconnect(); },25000);
  }
  reconnect() {
    if (this.disposed || this.retryTimer) return;
    this.assets?.abort();this.originalTransfer?.stop();clearTimeout(this.joinTimer);this.connection=null; this.welcomed=false; this.connected=false; this.emit();
    if (++this.retry>4) { this.onStatus('Disconnected · host unavailable'); this.onError('Host unavailable. Save or export your board to keep it.'); return; }
    this.onStatus(`Reconnecting (${this.retry}/4)…`);
    this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.dial();},500*2**this.retry);
  }
  send(conn, message) {
    if (this.disposed) return;
    try { this.transport.send(conn,{app:'tierlist',v:PROTOCOL,room:this.ticket.room,...message}); }
    catch { this.transport.disconnect(conn); }
  }
  event(e) {
    if (this.disposed) return;
    if (e.kind==='transportError') { this.connected=false;this.emit();this.onError('The iroh transport stopped. Leave and rejoin to reconnect.'); return; }
    if (e.kind==='connected') {
      if (this.isHost) this.peers.set(e.connection,{created:Date.now(),lastSeen:Date.now(),window:Date.now(),count:0,assetCount:0});
      else {
        if (e.peer!==this.ticket.host) { this.transport.disconnect(e.connection); return; }
        if (this.connection && this.connection!==e.connection) this.transport.disconnect(this.connection);
        this.connection=e.connection;this.lastSeen=Date.now();this.armTimeout();
        this.send(e.connection,{type:'join',name:this.name,color:this.color,capability:this.ticket.secret,resume:this.resume});
      }
    } else if (e.kind==='closed') {
      if (this.isHost) {
        const p=this.peers.get(e.connection);this.peers.delete(e.connection);this.originalTransfer?.drop(e.connection);
        if (p?.seat && ![...this.peers.values()].some(q=>q.seat===p.seat)) {
          const player=this.players.get(p.seat);
          if (player) { player.online=false;player.phase='offline';this.publishPresence(player);this.record(player,'activity',p.left?'Left the lobby':'Disconnected'); }
        }
      } else if (e.connection===this.connection) this.reconnect();
    } else if (e.kind==='message') {
      let message;
      try { message=JSON.parse(e.data); if (message?.app!=='tierlist' || message.v!==PROTOCOL || message.room!==this.ticket.room || typeof message.type!=='string') throw new Error(); }
      catch { this.transport.disconnect(e.connection);return; }
      if (this.isHost) this.hostMessage(e.connection,message);
      else if (e.connection===this.connection) {
        this.guestMessage(message).catch(error=>{
          if (!this.disposed && e.connection===this.connection) { this.onError(error.message);this.connected=false;this.emit();this.stop(); }
        });
      } else this.transport.disconnect(e.connection);
    }
  }
  hostMessage(conn,m) {
    const peer=this.peers.get(conn);if (!peer) return;
    peer.lastSeen=Date.now();
    if (Date.now()-peer.window>1000) {peer.window=Date.now();peer.count=0;peer.assetCount=0;}
    const original=m.type.startsWith('original-'),counter=original?'assetCount':'count';peer[counter]=(peer[counter]||0)+1;
    if (peer[counter]>(original?1024:160)) {this.transport.disconnect(conn);return;}
    if (m.type==='ping') {this.send(conn,{type:'pong'});return;}
    if (m.type==='pong') return;
    try {
      if (m.type==='join') {
        if (peer.seat || m.capability!==this.ticket.secret) throw new Error('Invalid lobby capability');
        const name=cleanName(m.name),color=m.color==null?null:cleanColour(m.color);let player;
        if (m.resume) {
          const seat=[...this.seats.entries()].find(([,secret])=>secret===m.resume)?.[0];
          player=this.players.get(seat);if (!player) throw new Error('That saved seat is no longer available');
          for (const [old,p] of this.peers) if (p.seat===seat) {p.seat=null;this.transport.disconnect(old);}
        } else {
          if (this.players.size>=MAX_PLAYERS) throw new Error('Lobby is full (16 players, including offline seats)');
          player={id:token(),name,color:color || randomColour([...this.players.values()].map(player=>player.color)),online:true,phase:'loading',progress:0,seq:0,board:copy(this.album.board)};
          this.players.set(player.id,player);this.seats.set(player.id,token());
        }
        peer.seat=player.id;player.online=true;player.phase='loading';player.progress=0;player.originals=0;player.name=name;player.color=color || player.color;peer.nextChunk=0;peer.historySent=false;peer.syncIndex=0;peer.syncIds=null;
        this.send(conn,{type:'welcome',self:player.id,hostId:this.self,resume:this.seats.get(player.id),length:this.code.length});
        this.broadcastRoster();
        this.publishPlayer(player,conn);
        this.record(player,'activity',m.resume?'Reconnected':'Joined the lobby');return;
      }
      if (!peer.seat) throw new Error('Join first');
      if (m.type==='chunk') {
        if (!Number.isInteger(m.index) || m.index!==peer.nextChunk || m.index*CHUNK>=this.code.length) throw new Error('Invalid tierlist chunk request');
        const index=peer.nextChunk++,player=this.players.get(peer.seat),progress=Math.min(100,Math.floor(peer.nextChunk*CHUNK/this.code.length*100)),phase=progress===100?'checking':'loading';
        if(phase!==player.phase || Math.floor(progress/10)>Math.floor(player.progress/10)){player.progress=progress;player.phase=phase;this.publishPresence(player);}
        this.send(conn,{type:'chunk',index,data:this.code.slice(index*CHUNK,(index+1)*CHUNK)});return;
      }
      if(m.type==='sync'){
        if(!Number.isInteger(m.index) || m.index!==peer.syncIndex || peer.nextChunk*CHUNK<this.code.length)throw new Error('Invalid board sync');
        if(!peer.syncIds)peer.syncIds=[...this.players.keys()];
        if(m.index>=peer.syncIds.length)throw new Error('Invalid board sync');
        const player=this.players.get(peer.syncIds[peer.syncIndex++]) || null;
        this.send(conn,{type:'snapshot',index:m.index,player,done:peer.syncIndex===peer.syncIds.length});return;
      }
      if(m.type==='ready'){
        if(!peer.syncIds || peer.syncIndex!==peer.syncIds.length)throw new Error('Finish loading before editing');
        const player=this.players.get(peer.seat);if(player.phase==='ready')return;
        player.phase='ready';player.progress=100;this.publishPresence(player);this.record(player,'activity','Ready');return;
      }
      if(m.type.startsWith('original-')){
        if(this.players.get(peer.seat)?.phase!=='ready')throw new Error('Finish loading previews before originals.');
        this.originalTransfer.hostMessage(conn,m).catch(()=>{if(!this.disposed&&this.peers.get(conn)===peer)this.send(conn,{type:'original-error'});});return;
      }
      if(m.type==='timeline'){if(!peer.historySent){peer.historySent=true;this.sendHistory(conn);}return;}
      if(m.type==='leave') {peer.left=true;this.seats.delete(peer.seat);this.transport.disconnect(conn);return;}
      if (m.type==='board') {
        const player=this.players.get(peer.seat);
        if(player.phase!=='ready')throw new Error('Finish loading before editing');
        if (!Number.isSafeInteger(m.seq) || m.seq<=player.seq || m.seq>player.seq+1000) throw new Error('Outdated board edit. Rejoin to sync');
        const next=validateBoard(m.board,this.album.images.map(i=>i.id)),change=boardChange(player.board,next,this.album.images);
        player.board=next;player.seq=m.seq;
        this.publishPlayer(player);if(change)this.record(player,'activity',change);return;
      }
      throw new Error('Unsupported lobby message');
    } catch (error) {
      this.send(conn,{type:'rejected',message:error.message});
      if (!peer.seat) setTimeout(()=>this.transport?.disconnect(conn),200);
    }
  }
  async guestMessage(m) {
    this.lastSeen=Date.now();
    if (m.type==='ping') {this.send(this.connection,{type:'pong'});return;}
    if (m.type==='pong') return;
    if (m.type==='welcome') {
      if (!/^[a-f0-9]{32}$/.test(m.hostId) || !/^[a-f0-9]{32}$/.test(m.self) || !/^[a-f0-9]{32}$/.test(m.resume) || !Number.isInteger(m.length) || m.length<10 || m.length>8*1024*1024) throw new Error('Invalid lobby welcome');
      this.self=m.self;this.hostId=m.hostId;this.resume=m.resume;this.welcomed=true;
      this.players.clear();this.roster=null;this.syncIndex=0;this.events=[];this.onEvents(this.events);this.length=m.length;this.parts=[];this.received=0;this.nextChunk=0;
      try { sessionStorage.setItem('tierlist-resume',JSON.stringify({room:this.ticket.room,secret:m.resume,invite:this.invite()})); } catch { /* In-memory resume still works. */ }
      this.send(this.connection,{type:'chunk',index:0});this.armTimeout();
    } else if (m.type==='roster') {
      if (!Array.isArray(m.ids) || m.ids.length>MAX_PLAYERS || m.ids.some(id=>!/^[a-f0-9]{32}$/.test(id))) throw new Error('Invalid roster');
      this.roster=new Set(m.ids);
      for (const id of this.players.keys()) if (!this.roster.has(id)) this.players.delete(id);
      this.emit();
    } else if (m.type==='player') {
      this.receivePlayer(m.player);if(this.connected)this.emit();
    } else if(m.type==='presence'){
      const presence=this.validatePresence(m.player),player=this.players.get(m.player.id);
      if(player){Object.assign(player,presence);if(this.connected)this.emit();}
    } else if(m.type==='snapshot'){
      if(!this.syncing || m.index!==this.syncIndex || typeof m.done!=='boolean')throw new Error('Invalid board snapshot');
      if(m.player)this.receivePlayer(m.player);this.syncIndex++;
      if(!m.done){if(this.syncIndex>=MAX_PLAYERS)throw new Error('Too many player boards');this.send(this.connection,{type:'sync',index:this.syncIndex});}
      else {
        if(!this.players.has(this.self) || !this.players.has(this.hostId))throw new Error('Missing a lobby board');
        for(const p of this.players.values())p.board=validateBoard(p.board,this.album.images.map(i=>i.id));
        clearTimeout(this.joinTimer);this.syncing=false;this.connected=true;this.retry=0;
        Object.assign(this.players.get(this.self),{phase:'ready',progress:100});
        this.send(this.connection,{type:'ready'});this.onStatus('Connected');this.emit();this.send(this.connection,{type:'timeline'});this.originalTransfer?.start();
      }
    } else if (m.type==='chunk') {
      if (!this.welcomed || m.index!==this.nextChunk || typeof m.data!=='string' || m.data.length!==Math.min(CHUNK,this.length-this.received)) throw new Error('Invalid tierlist transfer');
      this.parts.push(m.data);this.received+=m.data.length;this.nextChunk++;this.armTimeout();
      this.onStatus(`Loading previews… ${Math.floor(this.received/this.length*100)}%`);
      if (this.received<this.length) this.send(this.connection,{type:'chunk',index:this.nextChunk});
      else {
        const connection=this.connection,code=this.parts.join('');this.parts=[];
        clearTimeout(this.joinTimer);this.assets?.abort();const assets=this.assets=new AbortController();
        this.onStatus('Checking previews…');const album=await verifyImages(await decodeAlbum(code),{signal:assets.signal});
        if (this.disposed || connection!==this.connection) return;
        this.album=album;this.originalTransfer?.stop();
        this.originalTransfer=new OriginalTransfer(album,{send:(_conn,message)=>this.send(this.connection,message),cache:this.originalCache,onProgress:()=>{const self=this.players.get(this.self);if(self)self.originals=this.originalTransfer.loaded;if(this.connected)this.emit();}});
        for (const p of this.players.values()) p.board=validateBoard(p.board,album.images.map(i=>i.id));
        this.syncing=true;this.syncIndex=0;this.onStatus('Syncing player boards…');this.send(this.connection,{type:'sync',index:0});
      }
    } else if(m.type.startsWith('original-')){
      if(!this.connected||!this.originalTransfer)throw new Error('Load previews before originals.');
      try{await this.originalTransfer.guestMessage(m);}catch(error){this.originalTransfer.fail(error);}
    } else if(m.type==='history') {
      if(!Array.isArray(m.events) || m.events.length>12)throw new Error('Invalid lobby history');
      for(const event of m.events)this.receiveEvent(event);
    } else if(m.type==='event')this.receiveEvent(m.event);
    else if (m.type==='rejected') {
      this.onError(typeof m.message==='string'?m.message.slice(0,200):'Host rejected the request');
      this.connected=false;this.emit();await this.stop();this.onStatus('Disconnected · leave to try again');
    } else if (m.type==='ended') {
      this.connected=false;this.emit();this.onStatus('Lobby ended');
      try {sessionStorage.removeItem('tierlist-resume');} catch {}
      await this.stop();
    }
  }
  validatePresence(p) {
    if(!p || !/^[a-f0-9]{32}$/.test(p.id) || typeof p.online!=='boolean' || !['loading','checking','ready','offline'].includes(p.phase) || !Number.isInteger(p.progress) || p.progress<0 || p.progress>100 || (p.phase==='offline')===p.online || (p.phase==='ready' && p.progress!==100))throw new Error('Invalid player status');
    const originals=p.originals??0;if(!Number.isInteger(originals)||originals<0||originals>(this.album?.images.length??100000))throw new Error('Invalid original-image progress.');
    return {online:p.online,phase:p.phase,progress:p.progress,originals};
  }
  receivePlayer(p) {
    const presence=this.validatePresence(p);
    if(!Number.isSafeInteger(p.seq) || p.seq<0 || !p.board || JSON.stringify(p.board).length>MAX_BOARD)throw new Error('Invalid player state');
    if(this.roster && !this.roster.has(p.id))return;
    const previous=this.players.get(p.id);if(!previous && this.players.size>=MAX_PLAYERS)throw new Error('Too many players');
    const next={id:p.id,name:cleanName(p.name),color:cleanColour(p.color),...presence,seq:p.seq,board:this.album?validateBoard(p.board,this.album.images.map(i=>i.id)):p.board};
    if(previous && previous.seq>p.seq){Object.assign(previous,presence);return;}
    this.players.set(p.id,next);
  }
  publishPresence(player) {
    this.emit();const {id,online,phase,progress,originals=0}=player;
    for(const [conn,p] of this.peers)if(p.seat)this.send(conn,{type:'presence',player:{id,online,phase,progress,originals}});
  }
  broadcastRoster() {
    const m={type:'roster',ids:[...this.players.keys()]};
    for (const [conn,p] of this.peers) if (p.seat) this.send(conn,m);
  }
  publishPlayer(player,exclude=null) {
    this.emit();
    for (const [conn,p] of this.peers) if (p.seat && conn!==exclude) this.send(conn,{type:'player',player});
  }
  update(board) {
    if (this.disposed || !this.connected) throw new Error('Reconnect before editing your board');
    const player=this.players.get(this.self),next=validateBoard(board,this.album.images.map(i=>i.id));
    const change=this.isHost?boardChange(player.board,next,this.album.images):'';
    player.board=next;player.seq++;
    if (this.isHost) {this.publishPlayer(player);if(change)this.record(player,'activity',change);}
    else {this.send(this.connection,{type:'board',seq:player.seq,board:next});this.emit();}
  }
  remove(playerId) {
    if (!this.isHost || playerId===this.self) return;
    for (const [conn,p] of this.peers) if (p.seat===playerId) {
      p.seat=null;this.send(conn,{type:'ended'});setTimeout(()=>this.transport?.disconnect(conn),200);
    }
    const player=this.players.get(playerId);if(player)this.record(this.players.get(this.self),'activity',`Removed ${player.name}`);
    this.players.delete(playerId);this.seats.delete(playerId);this.broadcastRoster();this.emit();
  }
  receiveEvent(value) {
    const event=validateEvent(value);
    if(this.events.some(previous=>previous.id===event.id))return;
    this.events.push(event);this.events.sort((a,b)=>a.id-b.id);
    this.events=this.events.slice(-MAX_EVENTS);this.onEvents(this.events);
  }
  record(player,kind,text) {
    const details=typeof text==='string'?{text:text.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,600)}:text;
    const event=validateEvent({id:++this.eventSerial,time:Date.now(),kind,actor:player.id,name:player.name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim() || 'Player',color:player.color || '#4d8abf',...details});
    this.receiveEvent(event);
    for(const [conn,peer] of this.peers)if(peer.seat)this.send(conn,{type:'event',event});
  }
  sendHistory(conn) {for(let index=0;index<this.events.length;index+=6)this.send(conn,{type:'history',events:this.events.slice(index,index+6)});}
  async stop() {
    if (this.disposed) return;
    this.disposed=true;this.connected=false;this.assets?.abort();this.originalTransfer?.stop();clearInterval(this.heartbeat);
    clearTimeout(this.joinTimer);clearTimeout(this.retryTimer);
    await this.transport?.close();
  }
  async leave() {
    if(this.isHost){this.record(this.players.get(this.self),'activity','Ended the lobby');for(const [conn,p] of this.peers)if(p.seat)this.send(conn,{type:'ended'});}
    else if(this.connection && !this.disposed)this.send(this.connection,{type:'leave'});
    try {sessionStorage.removeItem('tierlist-resume');} catch {}
    await new Promise(resolve=>setTimeout(resolve,150));await this.stop();
  }
}
