// Portable data model. All imports and peer edits cross these validators.
import {remoteImageUrl,isRemoteImage,remoteDimensions} from './image-policy.mjs';
export const VERSION = 1;
export const MAX_DOCUMENT = 16 * 1024 * 1024;
export const MAX_BOARD = 48 * 1024; // Fits the shared iroh transport's 64 KiB frame.
export const MAX_IMAGE_EDGE = 1920; // Zoom viewer: up to 960 CSS pixels at 2×.
export const MAX_THUMB_EDGE = 256;
export const MAX_IMAGE_DATA = 2 * 1024 * 1024;
export const MAX_COVER_DATA = 64 * 1024;
export const id = () => crypto.randomUUID();
const fail = message => { throw new Error(message); };
const text = (value, max, field, empty = false) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`Invalid ${field}`);
  return value.trim();
};
const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : fail('Invalid identifier');
export const cleanName = value => text(value, 40, 'player name');
export const defaults = () => ['S','A','B','C','D'].map((name, i) => ({id:id(), name, color:['#ff7f7f','#ffbf7f','#ffdf7f','#ffff7f','#bfff7f'][i], items:[]}));
export function emptyAlbum() {
  return {v:VERSION, id:id(), name:'Untitled tierlist', description:'', images:[], board:{tiers:defaults(), unranked:[]}};
}
export function validateBoard(value, imageIds) {
  if (!value || !Array.isArray(value.tiers) || !value.tiers.length || !Array.isArray(value.unranked)) fail('A board needs at least one tier and an unranked tray');
  if (JSON.stringify(value).length > MAX_BOARD) fail('This board is too large to sync (48 KiB limit)');
  const rows = new Set(), placed = new Set(), known = new Set(imageIds);
  const items = list => {
    if (!Array.isArray(list)) fail('Invalid tier items');
    return list.map(item => {
      if (!known.has(item) || placed.has(item)) fail('Images must appear exactly once on a board');
      placed.add(item); return item;
    });
  };
  const tiers = value.tiers.map(t => {
    if (!t || rows.has(t.id) || t.id === 'unranked') fail('Duplicate or reserved tier identifier');
    rows.add(key(t.id));
    if (!/^#[0-9a-fA-F]{6}$/.test(t.color)) fail('Invalid tier colour');
    return {id:t.id, name:text(t.name, 100, 'tier name'), color:t.color.toLowerCase(), items:items(t.items)};
  });
  const unranked = items(value.unranked);
  if (placed.size !== known.size) fail('The board is missing images');
  const result = {tiers, unranked};
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BOARD) fail('This board is too large to sync (48 KiB limit)');
  return result;
}
// Embedded raster headers are inspected before decoding. Remote URLs have a separate exact-provider allowlist.
export function imageDimensions(data, maxEdge = MAX_IMAGE_EDGE) {
  if (typeof data !== 'string' || data.length > MAX_IMAGE_DATA || !/^data:image\/(webp|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) fail('Expected a small embedded WebP or PNG image');
  let bytes;
  try { bytes = Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0)); } catch { fail('Invalid image encoding'); }
  const s = (at, n) => String.fromCharCode(...bytes.slice(at, at+n));
  const v = new DataView(bytes.buffer);
  let width, height;
  if (data.startsWith('data:image/png;') && bytes.length >= 33 && s(0,8) === '\x89PNG\r\n\x1a\n' && s(12,4) === 'IHDR') {
    width = v.getUint32(16); height = v.getUint32(20);
  } else if (data.startsWith('data:image/webp;') && bytes.length >= 30 && s(0,4) === 'RIFF' && s(8,4) === 'WEBP') {
    const type = s(12,4);
    if (type === 'VP8 ' && s(23,3) === '\x9d\x01\x2a') { width = v.getUint16(26,true) & 0x3fff; height = v.getUint16(28,true) & 0x3fff; }
    else if (type === 'VP8L' && bytes[20] === 0x2f) { const bits = v.getUint32(21,true); width = (bits & 0x3fff)+1; height = ((bits >>> 14) & 0x3fff)+1; }
    else if (type === 'VP8X') { width = 1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16); height = 1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16); }
  }
  if (!width || !height || Math.max(width,height) > maxEdge) fail(`Images must be at most ${maxEdge} pixels on either edge`);
  return {width,height};
}
export function coverDimensions(data) {
  if(typeof data!=='string' || data.length>MAX_COVER_DATA)fail('Cover image exceeds the 64 KiB limit');
  return imageDimensions(data,MAX_THUMB_EDGE);
}
export function validateAlbum(value) {
  if (!value || value.v !== VERSION || !Array.isArray(value.images)) fail('Unsupported tierlist version');
  if (JSON.stringify(value).length > MAX_DOCUMENT) fail('Tierlist exceeds the 16 MiB limit');
  const ids = new Set();
  const images = value.images.map(image => {
    if (!image || ids.has(image.id)) fail('Duplicate image');
    ids.add(key(image.id));
    const dimensions = isRemoteImage(image)?(remoteImageUrl(image.data),remoteDimensions(image)):imageDimensions(image.data);
    if (image.thumb !== undefined) imageDimensions(image.thumb, MAX_THUMB_EDGE);
    return {id:image.id, label:text(image.label, 160, 'image label'), data:image.data, ...dimensions, ...(image.thumb === undefined ? {} : {thumb:image.thumb})};
  });
  const album = {v:VERSION, id:key(value.id), name:text(value.name, 120, 'tierlist name'), description:text(value.description, 1000, 'description', true), images, board:validateBoard(value.board, ids)};
  if(value.cover!==undefined){coverDimensions(value.cover);album.cover=value.cover;}
  if(value.copiedFrom!==undefined)album.copiedFrom=cleanName(value.copiedFrom);
  if (new TextEncoder().encode(JSON.stringify(album)).length > MAX_DOCUMENT) fail('Tierlist exceeds the 16 MiB limit');
  return album;
}
export function moveImage(board, image, target, before = null) {
  const result = structuredClone(board);
  const lists = [...result.tiers.map(t => t.items), result.unranked];
  if (!lists.some(list => list.includes(image))) fail('Unknown image');
  if (image === before) return result;
  const destination = target === 'unranked' ? result.unranked : result.tiers.find(t => t.id === target)?.items;
  if (!destination) fail('Unknown tier');
  for (const list of lists) { const at = list.indexOf(image); if (at >= 0) list.splice(at,1); }
  const at = destination.indexOf(before);
  destination.splice(at < 0 ? destination.length : at, 0, image);
  return result;
}
export function removeTier(board, tierId) {
  if (board.tiers.length <= 1) fail('Keep at least one tier');
  const result = structuredClone(board), index = result.tiers.findIndex(t => t.id === tierId);
  if (index < 0) fail('Unknown tier');
  result.unranked.push(...result.tiers.splice(index,1)[0].items);
  return result;
}
export function freshBoard(album) {
  return {tiers:album.board.tiers.map(t => ({...t, items:[]})), unranked:album.images.map(i => i.id)};
}
export const copy = value => structuredClone(value);
