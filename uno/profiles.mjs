// Lobby-only, allowlisted appearance metadata. Never accept remote asset URLs or CSS.
export const AVATAR_COLOURS = [
  {id:'orange', label:'Orange', hex:'#ff3b00'}, {id:'pink', label:'Pink', hex:'#cf2478'},
  {id:'blue', label:'Blue', hex:'#1674cb'}, {id:'green', label:'Green', hex:'#188347'},
  {id:'purple', label:'Purple', hex:'#8547c7'}, {id:'gold', label:'Gold', hex:'#b98600'},
  {id:'red', label:'Red', hex:'#cc2639'}, {id:'teal', label:'Teal', hex:'#008587'},
];
export const AVATAR_PATTERNS = [
  {id:'dots', label:'Dots'}, {id:'stripes', label:'Stripes'}, {id:'waves', label:'Waves'},
  {id:'checker', label:'Checker'}, {id:'rings', label:'Rings'}, {id:'crosses', label:'Crosses'},
  {id:'diamonds', label:'Diamonds'}, {id:'zigzag', label:'Zigzag'},
];
export function cleanName(name) {
  if (typeof name !== 'string') throw new Error('Enter a display name');
  const value = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!value || value.length > 32) throw new Error('Names must be 1–32 characters');
  return value;
}
export function validateAvatar(avatar) {
  if (!avatar || !AVATAR_COLOURS.some(c => c.id === avatar.colour) || !AVATAR_PATTERNS.some(p => p.id === avatar.pattern)) throw new Error('Choose a supported avatar colour and pattern');
  return {colour:avatar.colour, pattern:avatar.pattern};
}
export function defaultAvatar(index = 0) {
  return {colour:AVATAR_COLOURS[index % AVATAR_COLOURS.length].id, pattern:AVATAR_PATTERNS[index % AVATAR_PATTERNS.length].id};
}
export function nextAvatar(players) {
  for (let offset=0; offset<AVATAR_PATTERNS.length; offset++) for (let i=0; i<AVATAR_COLOURS.length; i++) {
    const avatar={colour:AVATAR_COLOURS[i].id, pattern:AVATAR_PATTERNS[(i+offset)%AVATAR_PATTERNS.length].id};
    if (!players.some(p => p.avatar?.colour===avatar.colour && p.avatar?.pattern===avatar.pattern)) return avatar;
  }
  return defaultAvatar();
}
export function paintAvatar(element, avatar) {
  const {colour,pattern}=validateAvatar(avatar);
  element.dataset.colour=colour; element.dataset.pattern=pattern;
  element.style.setProperty('--avatar-colour',AVATAR_COLOURS.find(c=>c.id===colour).hex);
  element.style.setProperty('--avatar-pattern',`url('./assets/avatars/${pattern}.svg')`);
}
