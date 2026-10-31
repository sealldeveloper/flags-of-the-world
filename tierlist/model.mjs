// Portable data model. All imports and peer edits cross these validators.
import {rasterHeaderAt,MAX_RASTER_EDGE,MAX_IMAGE_BYTES} from './raster.mjs';
export const VERSION = 1;
export const MAX_DOCUMENT = 128 * 1024 * 1024;
export const MAX_BOARD = 48 * 1024; // Fits the shared iroh transport's 64 KiB frame.
export const MAX_IMAGE_EDGE = MAX_RASTER_EDGE;
export const MAX_THUMB_EDGE = 256;
export const MAX_IMAGE_DATA = 35 * 1024 * 1024;
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
// File imports and peer assets must be self-contained rasters, never network URLs.
export function imageDimensions(data, maxEdge = MAX_IMAGE_EDGE) {
  if(typeof data!=='string'||data.length>MAX_IMAGE_DATA||!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))fail('Expected an embedded PNG, JPEG or WebP image. External image URLs are not supported.');
  if(maxEdge<=MAX_THUMB_EDGE&&(!/^data:image\/(webp|png);/.test(data)||data.length>64*1024))fail('Expected a small embedded PNG or WebP preview.');
  const start=data.indexOf(',')+1,encoded=data.length-start;if(encoded%4)fail('Invalid image encoding');
  const length=encoded/4*3-(data.endsWith('==')?2:data.endsWith('=')?1:0);if(length>MAX_IMAGE_BYTES)fail('Embedded image exceeds 25 MiB.');
  const read=(at,count)=>{const first=Math.floor(at/3)*4,last=Math.ceil((at+count)/3)*4,offset=at%3;let bytes;try{bytes=Uint8Array.from(atob(data.slice(start+first,start+last)),c=>c.charCodeAt(0));}catch{fail('Invalid image encoding');}return bytes.subarray(offset,offset+count);};
  return rasterHeaderAt(read,length,data.slice(5,data.indexOf(';')),maxEdge);
}
export function coverDimensions(data) {
  if(typeof data!=='string' || data.length>MAX_COVER_DATA)fail('Cover image exceeds the 64 KiB limit');
  return imageDimensions(data,MAX_THUMB_EDGE);
}
export function validateAlbum(value) {
  if (!value || value.v !== VERSION || !Array.isArray(value.images)) fail('Unsupported tierlist version');
  if (JSON.stringify(value).length > MAX_DOCUMENT) fail('Tierlist exceeds the 128 MiB limit');
  const ids = new Set();
  const images = value.images.map(image => {
    if (!image || ids.has(image.id)) fail('Duplicate image');
    ids.add(key(image.id));
    const dimensions = imageDimensions(image.data);
    if (image.thumb !== undefined) imageDimensions(image.thumb, MAX_THUMB_EDGE);
    return {id:image.id, label:text(image.label, 160, 'image label'), data:image.data, ...dimensions, ...(image.thumb === undefined ? {} : {thumb:image.thumb})};
  });
  const album = {v:VERSION, id:key(value.id), name:text(value.name, 120, 'tierlist name'), description:text(value.description, 1000, 'description', true), images, board:validateBoard(value.board, ids)};
  if(value.cover!==undefined){coverDimensions(value.cover);album.cover=value.cover;}
  if(value.copiedFrom!==undefined)album.copiedFrom=cleanName(value.copiedFrom);
  if (new TextEncoder().encode(JSON.stringify(album)).length > MAX_DOCUMENT) fail('Tierlist exceeds the 128 MiB limit');
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
