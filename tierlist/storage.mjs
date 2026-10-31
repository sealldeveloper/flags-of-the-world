import {validateAlbum, id} from './model.mjs';
let database;
function db() {
  return database ||= new Promise((resolve,reject)=>{
    const request = indexedDB.open('puzzle-tierlist',1);
    request.onupgradeneeded = () => request.result.createObjectStore('albums',{keyPath:'id'});
    request.onsuccess = () => { request.result.onversionchange=()=>request.result.close(); resolve(request.result); };
    request.onerror = () => reject(new Error('Browser storage unavailable. Export a code to keep your tierlist.'));
    request.onblocked = () => reject(new Error('Close other Tier List tabs to upgrade local storage.'));
  });
}
async function transaction(mode, action) {
  const database = await db();
  return new Promise((resolve,reject)=>{
    const tx = database.transaction('albums',mode), request = action(tx.objectStore('albums'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('Could not save locally (storage may be full or blocked). Export your tierlist code.'));
  });
}
export async function listAlbums() {
  const records = await transaction('readonly', store=>store.getAll());
  return records.sort((a,b)=>b.updated-a.updated);
}
export async function saveAlbum(input, asCopy = false) {
  const album = validateAlbum(input);
  if (asCopy) album.id = id();
  await transaction('readwrite', store=>store.put({...album,updated:Date.now()}));
  return album;
}
export const deleteAlbum = albumId => transaction('readwrite',store=>store.delete(albumId));
