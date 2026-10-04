// One installable, same-origin app. Existing game pages remain independently usable.
(() => {
  'use strict';
  const status=document.getElementById('app-status'),install=document.getElementById('install-app'),update=document.getElementById('app-update');
  const message=text=>{if(status)status.textContent=text;};
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let prompt=null,registration=null;
  function installState(){if(install)install.hidden=installed();}
  function theme(){const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=document.documentElement.dataset.theme==='dark'?'#1a1f2e':'#f5f7fb';}
  installState();theme();addEventListener('puzzle-theme-change',theme);
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;installState();});
  addEventListener('appinstalled',()=>{prompt=null;if(install)install.hidden=true;message('App installed. Download daily puzzles before going offline.');});
  install?.addEventListener('click',async()=>{
    if(prompt){const event=prompt;prompt=null;try{await event.prompt();await event.userChoice;}catch(_){document.getElementById('install-help')?.showModal();}}
    else document.getElementById('install-help')?.showModal();
  });
  document.getElementById('keep-downloads')?.addEventListener('click',async()=>{
    const output=document.getElementById('storage-message');
    try{const granted=await navigator.storage?.persist?.();output.textContent=granted?'Persistent storage granted. You can still remove data through browser settings.':'This browser did not grant persistent storage. Keep important progress backed up; downloads may be cleared.';}
    catch(_){output.textContent='Persistent storage is unavailable. Downloads may be cleared by your browser.';}
  });
  const connection=()=>message(navigator.onLine?'Offline app pages are ready. Daily puzzles work offline once downloaded; online-only artwork, media and buzzers still need a connection.':'You are offline. Open a downloaded daily puzzle or reconnect to get more.');
  if(!isSecureContext||!('serviceWorker' in navigator)){message('Installing and offline app pages require HTTPS and a browser with service-worker support. You can still play online.');return;}
  navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(reg=>{
    registration=reg;
    function waiting(){if(update)update.hidden=!reg.waiting;}
    waiting();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',waiting));
    return navigator.serviceWorker.ready;
  }).then(()=>{connection();addEventListener('online',connection);addEventListener('offline',connection);}).catch(()=>message('Offline setup failed or storage is blocked. Games remain available online; retry by reloading.'));
  update?.addEventListener('click',()=>{
    if(!registration?.waiting)return;
    navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
    registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
  });
})();
