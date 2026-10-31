import {encodeTicket, decodeTicket} from '../uno/transport.mjs';
const RELAYS=['use1-1','usw1-1','euc1-1','aps1-1'].map(region=>`https://${region}.relay.n0.iroh.link./`);
const alphabet='abcdefghijklmnopqrstuvwxyz234567';
const hex = bytes => [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g),value=>parseInt(value,16));
function unbase32(text) {
  const bytes=[];let bits=0,value=0;
  for(const char of text){value=(value<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
  return Uint8Array.from(bytes);
}
function base32(bytes) {
  let bits=0,value=0,result='';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(value>>>bits)&31];}}
  if(bits)result+=alphabet[(value<<(5-bits))&31];return result;
}
const checked = ticket => ({...decodeTicket(encodeTicket({...ticket,v:5})),app:'tierlist'});
// Pack endpoint bytes, relay index and capabilities instead of a JSON invite.
// Normal endpoint IDs produce a 91-character code. No lookup service is involved.
export function encodeInvite(input) {
  const ticket=checked(input),relay=RELAYS.indexOf(ticket.relay);
  let kind,host;
  if(/^[a-f0-9]{64}$/.test(ticket.host)){kind=0;host=unhex(ticket.host);}
  else if(/^[a-z2-7]{52}$/.test(ticket.host) && base32(unbase32(ticket.host))===ticket.host){kind=1;host=unbase32(ticket.host);}
  else {kind=2;host=new TextEncoder().encode(ticket.host);}
  const bytes=Uint8Array.from([(relay<<2)|kind,...(kind===2?[host.length]:[]),...host,...unhex(ticket.room),...unhex(ticket.secret)]);
  return 'TL4.'+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function decodeInvite(input) {
  if(typeof input!=='string' || input.length>5000)throw new Error('Invalid lobby invite');
  let code=input.trim();
  if(code.includes('#'))code=new URLSearchParams(code.slice(code.indexOf('#')+1)).get('join') || '';
  if(code.startsWith('TLOBBY1.')) {
    const raw=code.slice(8),ticket=decodeTicket(raw),original=JSON.parse(atob(raw.replaceAll('-','+').replaceAll('_','/')));
    if(original.app!=='tierlist')throw new Error('Wrong lobby application');
    return {...ticket,app:'tierlist',protocol:1};
  }
  if(!/^TL[234]\./.test(code) || !/^[A-Za-z0-9_-]+$/.test(code.slice(4)))throw new Error('Paste a Tier List invite link or code');
  let bytes;
  try {bytes=Uint8Array.from(atob(code.slice(4).replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));}
  catch {throw new Error('Invalid lobby code');}
  const relay=bytes[0]>>>2,kind=bytes[0]&3,start=kind===2?2:1,length=kind===2?bytes[1]:32;
  if(relay>=RELAYS.length || kind>2 || !length || bytes.length!==start+length+32)throw new Error('Invalid lobby code');
  const hostBytes=bytes.slice(start,start+length),host=kind===0?hex(hostBytes):kind===1?base32(hostBytes):new TextDecoder().decode(hostBytes);
  return {...checked({host,relay:RELAYS[relay],room:hex(bytes.slice(start+length,start+length+16)),secret:hex(bytes.slice(start+length+16))}),protocol:Number(code[2])};
}
