// Deterministic lobby layout + real Activity renderer. No relay connection is needed
// to verify native scrollbars, so this fixture never starts multiplayer transport.
// Firefox's headless build hides scrollbars. Use BROWSER=firefox HEADED=1 with
// a display (or Xvfb). Disable GTK overlay scrollbars for visible evidence.
const playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18764';
const browserName=process.env.BROWSER || 'chromium';
const out=process.env.SCREENSHOT_DIR || '/tmp/tierlist-activity-scrollbar';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 // Playwright hides Chromium scrollbars by default in headless mode.
 const browser=await playwright[browserName].launch({headless:process.env.HEADED!=='1',ignoreDefaultArgs:['--hide-scrollbars'],firefoxUserPrefs:{'widget.gtk.overlay-scrollbars.enabled':false},executablePath:browserName==='chromium'?(process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'):process.env.FIREFOX_PATH});
 try {
  const context=await browser.newContext({viewport:{width:1920,height:1080},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
  const p=await context.newPage(),errors=[],externalRequests=[],report=[];
  p.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith(base+'/') || url.startsWith('data:'))return route.continue();
   externalRequests.push(url);return route.abort();
  });
  await p.goto(base+'/tierlist/');
  await p.evaluate(async()=>{
   const {emptyAlbum,id}=await import('./model.mjs'),{saveAlbum}=await import('./storage.mjs');
   const album=emptyAlbum();album.name='Activity scrollbar regression';
   const canvas=document.createElement('canvas');canvas.width=canvas.height=48;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#4d8abf';ctx.fillRect(0,0,48,48);
   const image={id:id(),label:'Example image',data:canvas.toDataURL('image/png')};
   album.images.push(image);album.board.unranked.push(image.id);await saveAlbum(album);
  });
  await p.reload();await p.getByRole('button',{name:'Open',exact:true}).click();
  await p.evaluate(async()=>{
   document.querySelector('#workspace').classList.add('in-lobby');
   for(const id of ['lobby-details','activity-panel','tab-everyone'])document.getElementById(id).hidden=false;
   for(const id of ['host','tab-images'])document.getElementById(id).hidden=true;
   document.querySelector('#connection').textContent='Connected · fixture';
   const player=document.createElement('div');player.className='player';player.style.setProperty('--player-color','#4d8abf');player.textContent='Player 1';document.querySelector('#players').append(player);
   const {Activity}=await import('./activity.mjs');
   window.activityFixture=new Activity({onLocate(){window.activityReferenceClicked=true;}});
   window.activityEvents=Array.from({length:79},(_,index)=>({id:index+1,name:index%3===0?'Player with a longer display name':'Player '+(index%3+1),color:'#4d8abf',time:1800000000000+index*1000,
    parts:[{type:'text',text:'Moved '},{type:'image',id:'fixture-image',label:index%4===0?'An image with a longer descriptive name':'Example image',color:'#1764ad'},{type:'text',text:' into '},{type:'tier',id:'fixture-tier',label:'A tier',color:'#598d4e'}]}));
   window.activityFixture.setEvents(window.activityEvents);
  });
  const feed=p.locator('#activity-feed');
  async function settle(){await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
  async function shot(label,panel=false){
   await settle();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': document overflow');
   const path=`${out}/${label}.png`;
   if(panel)await p.locator('#activity-panel').screenshot({path});else await p.screenshot({path});
   return path;
  }
  for(const [width,height] of [[1920,1080],[1024,768],[390,844]])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height});await p.emulateMedia({colorScheme:theme});
   await p.waitForFunction(value=>document.documentElement.dataset.theme===value,theme);
   assert.equal(await p.evaluate(value=>matchMedia(`(prefers-color-scheme: ${value})`).matches,theme),true);
   await p.evaluate(()=>{document.activeElement.blur();window.activityFixture.setEvents(window.activityEvents);});
   await feed.scrollIntoViewIfNeeded();await settle();
   const metrics=await feed.evaluate(node=>{
    const style=getComputedStyle(node);
    return {width:style.scrollbarWidth,color:style.scrollbarColor,overflow:style.overflowY,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,gutter:node.offsetWidth-node.clientWidth,role:node.getAttribute('role'),live:node.getAttribute('aria-live'),tabIndex:node.tabIndex};
   });
   assert.equal(metrics.width,'thin');
   const expectedColor=await p.evaluate(()=>{const probe=document.createElement('div');probe.style.scrollbarColor='var(--site-muted) var(--site-inset)';document.body.append(probe);const value=getComputedStyle(probe).scrollbarColor;probe.remove();return value;});
   assert.equal(metrics.color,expectedColor);assert.equal(metrics.overflow,'auto');
   assert(metrics.scrollHeight>metrics.clientHeight);assert(metrics.scrollWidth<=metrics.clientWidth);
   assert(metrics.gutter>0,'scrollbar gutter must be visible in visual evidence');
   assert.equal(metrics.role,'log');assert.equal(metrics.live,'polite');assert.equal(metrics.tabIndex,0);
   for(const selector of ['html','#players','#code','#group-preview']){
    const style=await p.locator(selector).evaluate(node=>({width:getComputedStyle(node).scrollbarWidth,color:getComputedStyle(node).scrollbarColor}));
    assert.deepEqual(style,{width:'auto',color:'auto'},selector+': scrollbar styling must stay scoped');
   }
   await feed.evaluate(node=>node.scrollTop=0);
   const label=`${browserName}-${width}-${theme}`,screenshots=[];
   screenshots.push(await shot(label+'-top',true));
   // Keyboard scrolling keeps the existing inset focus outline visible.
   await feed.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');await p.keyboard.press('ArrowDown');
   await p.waitForFunction(()=>document.querySelector('#activity-feed').scrollTop>0);
   assert(await feed.evaluate(node=>node.matches(':focus-visible')));
   assert.equal(await feed.evaluate(node=>getComputedStyle(node).outlineWidth),'2px');
   // Native key scrolling can animate independently of prefers-reduced-motion.
   await p.waitForTimeout(250);
   await feed.evaluate(node=>node.scrollTop=(node.scrollHeight-node.clientHeight)/2);
   screenshots.push(await shot(label+'-middle-focus'));
   // Incoming activity must not drag a reader who has scrolled away from the end.
   await p.evaluate(()=>window.activityFixture.render());
   const middle=await feed.evaluate(node=>node.scrollTop);
   await p.evaluate(()=>window.activityFixture.setEvents([...window.activityEvents,{id:80,name:'Player 2',color:'#4d8abf',time:1800000080000,text:'Reordered tiers'}]));
   assert(Math.abs(await feed.evaluate(node=>node.scrollTop)-middle)<=1);
   await feed.hover();const beforeWheel=await feed.evaluate(node=>node.scrollTop);
   await p.mouse.wheel(0,160);await p.waitForFunction(before=>document.querySelector('#activity-feed').scrollTop>before,beforeWheel);
   await feed.evaluate(node=>node.scrollTop=node.scrollHeight);
   screenshots.push(await shot(label+'-bottom',true));
   await feed.evaluate(node=>node.scrollTop=0);
   const reference=feed.locator('.activity-ref').first();await reference.focus();await p.keyboard.press('Enter');
   assert(await p.evaluate(()=>window.activityReferenceClicked));
   assert.equal(await reference.evaluate(node=>getComputedStyle(node).outlineStyle),'solid');
   if(browserName==='chromium' && width===390){
    await feed.scrollIntoViewIfNeeded();await feed.evaluate(node=>node.scrollTop=0);
    const box=await feed.boundingBox(),cdp=await context.newCDPSession(p);
    const x=box.x+box.width/2,y=box.y+box.height*.7;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*20}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await p.waitForFunction(()=>document.querySelector('#activity-feed').scrollTop>0);await cdp.detach();
    await p.waitForTimeout(1000); // Finish native touch inertia before the next theme.
   }
   report.push({browser:browserName,width,height,theme,metrics,screenshots});
  }
  // Modern Chromium prefers the standards. Reset them only in this test to
  // exercise the WebKit fallback used by older Chrome/Edge releases.
  if(browserName==='chromium'){
   await p.evaluate(()=>document.activeElement.blur());
   const fallback=await p.addStyleTag({content:'#activity-feed { scrollbar-width: auto; scrollbar-color: auto }'});
   await p.setViewportSize({width:1920,height:1080});
   for(const theme of ['light','dark']){
    await p.emulateMedia({colorScheme:theme});await feed.scrollIntoViewIfNeeded();await feed.evaluate(node=>node.scrollTop=0);await p.mouse.move(0,0);await settle();
    const style=await feed.evaluate(node=>({width:getComputedStyle(node,'::-webkit-scrollbar').width,track:getComputedStyle(node,'::-webkit-scrollbar-track').backgroundColor,thumb:getComputedStyle(node,'::-webkit-scrollbar-thumb').backgroundColor}));
    assert.equal(style.width,'10px');assert.notEqual(style.track,style.thumb);
    const rest=await shot(`chromium-fallback-${theme}`,true),box=await feed.boundingBox();
    await p.mouse.move(box.x+box.width-5,box.y+10);
    const hover=await shot(`chromium-fallback-${theme}-hover`,true);
    report.push({fallback:true,theme,style,screenshots:[rest,hover]});
   }
   await fallback.evaluate(node=>node.remove());
  }
  await p.emulateMedia({forcedColors:'active'});await settle();
  assert.equal(await feed.evaluate(node=>getComputedStyle(node).scrollbarColor),'auto');
  assert.equal(await feed.evaluate(node=>getComputedStyle(node).scrollbarWidth),'auto');
  await feed.focus();assert.equal(await feed.evaluate(node=>getComputedStyle(node).outlineStyle),'solid');
  report.push({forcedColors:true,screenshots:[await shot(`${browserName}-forced-colors`,true)]});
  await p.emulateMedia({forcedColors:'none'});
  // Short/empty logs keep native overflow:auto, without an unnecessary scrollbar.
  for(const events of [[],[{id:1,name:'Player 1',color:'#4d8abf',time:1800000000000,text:'Joined the lobby'}]]){
   await p.evaluate(events=>window.activityFixture.setEvents(events),events);
   assert(await feed.evaluate(node=>node.scrollHeight===node.clientHeight));
  }
  assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);
  fs.writeFileSync(`${out}/${browserName}-report.json`,JSON.stringify(report,null,2));
  console.log(`PASS ${browserName}: scoped theme-aware activity scrollbars, 6 viewport/theme combinations, keyboard/wheel scrolling, references, reader scroll retention, forced colors and empty/short logs. Evidence: ${out}`);
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
