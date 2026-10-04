'use strict';
// Bump the shell version when changing app assets. Never expire puzzle data here.
const SHELL='puzzle-app-shell-v1', DATA='puzzle-daily-data-v1';
const PAGES=['/','/crossword/','/crossword-nyt/','/crossword-nytmini/','/crossword-seattle/','/connections-nyt/','/flags/','/tld/','/deadlock-guess-who/','/scattegories/','/scattegories/local/','/jeopardy/','/jeopardy/display.html'];
const ASSETS=[
  '/app.webmanifest','/favicon.svg','/assets/theme.js','/assets/theme.css','/assets/app.js','/assets/library.mjs','/assets/library.css','/assets/daily.mjs',
  '/assets/app-icon-192.png','/assets/app-icon-512.png','/assets/app-icon-maskable-512.png',
  '/crossword/script.js','/crossword/style.css','/crossword/favicon.svg',
  '/connections-nyt/script.js','/connections-nyt/style.css','/connections-nyt/favicon.svg',
  '/flags/script.js','/flags/style.css','/flags/favicon.svg','/tld/script.js','/tld/style.css','/tld/favicon.svg',
  '/deadlock-guess-who/script.js','/deadlock-guess-who/style.css','/deadlock-guess-who/favicon.svg','/deadlock-guess-who/data/deadlock.json',
  '/scattegories/script.js','/scattegories/style.css','/scattegories/favicon.svg','/scattegories/local/script.js','/scattegories/local/style.css',
  '/jeopardy/favicon.svg',
];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll([...PAGES,...ASSETS]))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('puzzle-app-shell-')&&key!==SHELL)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
function pagePath(path){return path==='/index.html'?'/':path.endsWith('/index.html')?path.slice(0,-10):path;}
async function openCache(name){try{return await caches.open(name);}catch(_){return null;}}
async function matchCache(cache,key){try{return await cache?.match(key);}catch(_){return null;}}
async function networkFirst(request,key,cacheName){
  const cache=await openCache(cacheName),controller=new AbortController();
  // A stalled connection must not strand already-downloaded app pages.
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch(request,{signal:controller.signal});
    clearTimeout(timer); // Only bound time-to-headers, not large media body downloads.
    if(response.ok){try{await cache?.put(key,response.clone());}catch(_){}return response;}
    return await matchCache(cache,key)||response;
  }catch(error){const saved=await matchCache(cache,key);if(saved)return saved;throw error;}
  finally{clearTimeout(timer);}
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||request.headers.has('range'))return;
  const path=pagePath(url.pathname);
  // Explicit published-route allowlists: unpublished work and third parties are untouched.
  if(request.mode==='navigate'&&PAGES.includes(path)){
    event.respondWith(networkFirst(request,path,SHELL));return;
  }
  if(ASSETS.includes(url.pathname)){
    event.respondWith(networkFirst(request,url.pathname,SHELL));return;
  }
  if(/^\/(crossword-nyt|crossword-nytmini|connections-nyt)\/puzzles\//.test(url.pathname)){
    // The daily module validates JSON and saves API fallbacks under these same URLs.
    event.respondWith((async()=>{
      const cache=await openCache(DATA),saved=await matchCache(cache,url.pathname);
      if(saved && request.cache!=='no-cache' && request.cache!=='reload')return saved;
      try {const response=await fetch(request);return response.ok?response:saved||response;}
      catch(error){if(saved)return saved;throw error;}
    })());return;
  }
  if(/^\/crossword-seattle\/puzzles\/(manifest\.json|\d{4}\/\d{2}\/\d{6}\.txt)$/.test(url.pathname)||/^\/jeopardy\/media\//.test(url.pathname)){
    event.respondWith(networkFirst(request,url.pathname,DATA));
  }
});
