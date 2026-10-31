import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyAlbum, validateAlbum, validateBoard, moveImage, removeTier, freshBoard, copy, id, MAX_DOCUMENT} from '../tierlist/model.mjs';
import {encodeAlbum, decodeAlbum} from '../tierlist/codec.mjs';
import {encodeInvite, decodeInvite} from '../tierlist/invite.mjs';
import {TierRoom} from '../tierlist/room.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8V8AAAAASUVORK5CYII=';
function fixture() {
  const album=emptyAlbum();album.name='Albums 🦈 and Unicode';
  album.images=Array.from({length:12},(_,i)=>({id:id(),label:`Image ${i}`,data:png}));album.board.unranked=album.images.map(i=>i.id);
  return validateAlbum(album);
}
test('TierMaker default names and colours',()=>{
  assert.deepEqual(emptyAlbum().board.tiers.map(({name,color})=>[name,color]),[['S','#ff7f7f'],['A','#ffbf7f'],['B','#ffdf7f'],['C','#ffff7f'],['D','#bfff7f']]);
});
test('self-contained codes preserve Unicode, all images, row and image ordering',async()=>{
  const album=fixture();album.board=moveImage(album.board,album.images[2].id,album.board.tiers[0].id);
  album.board=moveImage(album.board,album.images[1].id,album.board.tiers[0].id,album.images[2].id);
  album.board.tiers.reverse();album.board.tiers[0].name='Very particular category 🦈';album.board.tiers[0].color='#123456';
  const code=await encodeAlbum(album);assert(code.startsWith('TIER1.'));assert.deepEqual(await decodeAlbum(code),album);
});
test('optional embedded cover images survive portable copies without changing rankings or old files',async()=>{
 const album=fixture(),original=copy(album.board);album.cover=png;album.coverUrl='https://evil.test/cover.png';const validated=validateAlbum(album);assert.equal(validated.cover,png);assert(!('coverUrl' in validated));assert.deepEqual(validated.board,original);assert.deepEqual(await decodeAlbum(await encodeAlbum(validated)),validated);assert(!('cover' in validateAlbum(fixture())));
});
test('cover images reject remote URLs, SVG, oversized data and oversized dimensions before rendering',()=>{
 const album=fixture();for(const cover of ['https://files.catbox.moe/abc123.png','https://i.imgur.com/Abc1234.png','https://evil.test/cover.png','data:image/svg+xml;base64,PHN2Zz4=',png+'A'.repeat(65536),null,{}])assert.throws(()=>validateAlbum({...album,cover}));
 const bytes=Buffer.from(png.split(',')[1],'base64');bytes.writeUInt32BE(257,16);assert.throws(()=>validateAlbum({...album,cover:'data:image/png;base64,'+bytes.toString('base64')}),/256/);
});
test('more than the default five categories are supported and independent',()=>{
  const album=fixture(),other=copy(album.board);
  for(let n=0;n<60;n++)album.board.tiers.push({id:id(),name:`Custom ${n}`,color:'#aabbcc',items:[]});
  assert.equal(validateAlbum(album).board.tiers.length,65);assert.equal(other.tiers.length,5);
});
test('moves conserve every image and can reorder within a row',()=>{
  const album=fixture(),all=album.images.map(i=>i.id);let board=album.board;
  for(let i=0;i<300;i++) {
    board=moveImage(board,all[i%all.length],i%6===5?'unranked':board.tiers[i%5].id);
    validateBoard(board,all);
  }
  board=moveImage(board,all[0],board.tiers[0].id);board=moveImage(board,all[1],board.tiers[0].id,all[0]);
  assert.deepEqual(board.tiers[0].items.slice(-2),[all[1],all[0]]);
  assert.deepEqual(moveImage(board,all[0],board.tiers[0].id,all[0]),board);
});
test('deleting categories returns their contents to the tray, keeping at least one',()=>{
  const album=fixture();let board=moveImage(album.board,album.images[0].id,album.board.tiers[0].id);
  board=removeTier(board,board.tiers[0].id);assert(board.unranked.includes(album.images[0].id));
  while(board.tiers.length>1)board=removeTier(board,board.tiers[0].id);
  assert.throws(()=>removeTier(board,board.tiers[0].id));validateBoard(board,album.images.map(i=>i.id));
  assert.equal(freshBoard(album).unranked.length,12);
});
test('validators reject missing, duplicate, unknown images and hostile image/CSS inputs',()=>{
  const album=fixture();
  const missing=copy(album);missing.board.unranked.pop();assert.throws(()=>validateAlbum(missing),/missing/);
  const duplicate=copy(album);duplicate.board.unranked.push(duplicate.board.unranked[0]);assert.throws(()=>validateAlbum(duplicate),/exactly once/);
  const unknown=copy(album);unknown.board.unranked[0]='nope';assert.throws(()=>validateAlbum(unknown));
  for(const data of ['https://example.com/x.png','data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA']) {
    const bad=copy(album);bad.images[0].data=data;assert.throws(()=>validateAlbum(bad));
  }
  const badColor=copy(album);badColor.board.tiers[0].color='url(https://example.com)';assert.throws(()=>validateAlbum(badColor));
  const duplicateTier=copy(album);duplicateTier.board.tiers[1].id=duplicateTier.board.tiers[0].id;assert.throws(()=>validateAlbum(duplicateTier));
  const reservedTier=copy(album);reservedTier.board.tiers[0].id='unranked';assert.throws(()=>validateAlbum(reservedTier));
  const tooBig=copy(album),bytes=Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));new DataView(bytes.buffer).setUint32(16,10000);
  tooBig.images[0].data='data:image/png;base64,'+btoa(String.fromCharCode(...bytes));assert.throws(()=>validateAlbum(tooBig),/1920/);
});
test('bad codes and decompression bombs are bounded',async()=>{
  for(const code of ['TIER1.bad','not a code','TLOBBY1.something','TIER2.abc'])await assert.rejects(decodeAlbum(code));
  const gzip=new Blob([' '.repeat(MAX_DOCUMENT+1)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes=new Uint8Array(await new Response(gzip).arrayBuffer());
  await assert.rejects(decodeAlbum('TIER1.'+Buffer.from(bytes).toString('base64url')),/size limit/);
});
test('lobby invites are namespaced, relay allowlisted and separate from album codes',()=>{
  const ticket={host:'a'.repeat(52),relay:'https://aps1-1.relay.n0.iroh.link./',room:'a'.repeat(32),secret:'b'.repeat(32)};
  const encoded=encodeInvite(ticket);assert.equal(decodeInvite(encoded).room,ticket.room);
  assert.equal(decodeInvite('https://example.test/tierlist/#join='+encoded).host,ticket.host);
  assert.throws(()=>decodeInvite(encodeInvite({...ticket,relay:'https://127.0.0.1/'})));
  assert.throws(()=>decodeInvite('TIER1.abc'));assert.throws(()=>decodeInvite(encoded.slice(8)));
});
test('host only accepts the authenticated sender board, not another player or replay',()=>{
  const album=fixture(),messages=[],a='a'.repeat(32),b='b'.repeat(32);
  const room=new TierRoom({onState:()=>{},onStatus:()=>{},onError:()=>{}});
  Object.assign(room,{album,isHost:true,self:a,connected:true,ticket:{room:'c'.repeat(32)},transport:{send:(id,m)=>messages.push({id,...m}),disconnect:()=>{}}});
  for(const playerId of [a,b])room.players.set(playerId,{id:playerId,name:playerId[0],online:true,phase:'ready',progress:100,seq:0,board:copy(album.board)});
  room.peers.set('connection',{seat:b,lastSeen:Date.now(),window:Date.now(),count:0});
  const edited=moveImage(album.board,album.images[0].id,album.board.tiers[0].id);
  room.hostMessage('connection',{type:'board',target:a,seq:1,board:edited});
  assert.deepEqual(room.players.get(a).board,album.board);assert.deepEqual(room.players.get(b).board,edited);
  room.hostMessage('connection',{type:'board',seq:1,board:album.board});assert.equal(messages.at(-1).type,'rejected');
  assert.equal(room.players.get(b).seq,1);
  const invalid=copy(edited);invalid.unranked=[];
  room.hostMessage('connection',{type:'board',seq:2,board:invalid});assert.equal(messages.at(-1).type,'rejected');assert.equal(room.players.get(b).seq,1);
});
