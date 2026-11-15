// Real iroh peers with trailing-dot hosts deliberately blocked, as on filtered networks.
// Never mock a successful relay response or connection.
const {chromium,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:18765';
(async()=>{
 for(const name of (process.env.RELAY_BROWSERS||'chromium').split(',')){
  const engine={chromium,firefox}[name];assert(engine,'Unknown browser');
  const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser'}:process.env.FIREFOX_PATH?{executablePath:process.env.FIREFOX_PATH}:{})});
  try{
   const context=await browser.newContext(),requests=[],sockets=[],errors=[];
   await context.route('https://*.relay.n0.iroh.link./**',route=>route.fulfill({status:403,body:'Trailing-dot host blocked'}));
   await context.routeWebSocket('wss://*.relay.n0.iroh.link./**',ws=>ws.close({code:1008,reason:'Trailing-dot host blocked'}));
   context.on('request',request=>requests.push(request.url()));
   const host=await context.newPage(),guest=await context.newPage();
   for(const page of [host,guest]){page.on('pageerror',error=>errors.push(error.message));page.on('websocket',ws=>sockets.push(ws.url()));await page.goto(base+'/tierlist/');}
   const create=page=>page.evaluate(async()=>{const {Transport}=await import('/uno/transport.mjs');window.relayEvents=[];window.transport=await Transport.create(event=>window.relayEvents.push(event));return window.transport.address();});
   const [address]=await Promise.all([create(host),create(guest)]);
   assert.match(address.relay,/^https:\/\/(use1-1|usw1-1|euc1-1|aps1-1)\.relay\.n0\.iroh\.link\.\/$/,'Keep legacy invite identity');
   const ticket=await host.evaluate(async address=>{const {encodeInvite,decodeInvite}=await import('/tierlist/invite.mjs');return decodeInvite(encodeInvite({...address,room:'a'.repeat(32),secret:'b'.repeat(32)}));},address);
   await guest.evaluate(ticket=>window.transport.connect(ticket),ticket);
   for(const page of [host,guest])await page.waitForFunction(()=>window.relayEvents.some(e=>e.kind==='connected'),{},{timeout:30000});
   await guest.evaluate(()=>window.transport.send(window.relayEvents.find(e=>e.kind==='connected').connection,{test:'browser-relay-regression'}));
   await host.waitForFunction(()=>window.relayEvents.some(e=>e.kind==='message'&&JSON.parse(e.data).test==='browser-relay-regression'),{},{timeout:30000});
   await assert.rejects(guest.evaluate(()=>window.transport.node.connect('a'.repeat(64),'https://127.0.0.1/')),/Unsupported iroh relay/);
   assert(sockets.length>=2,'Uses real WebSocket relays');
   assert(sockets.every(url=>/^wss:\/\/(use1-1|usw1-1|euc1-1|aps1-1)\.relay\.n0\.iroh\.link\/relay$/.test(url)),JSON.stringify(sockets));
   assert(!requests.some(url=>url.includes('.iroh.link./')),'No trailing-dot browser requests');
   assert(!requests.some(url=>url.includes('/pkarr')),'No discovery service');assert.deepEqual(errors,[]);
   await Promise.all([host,guest].map(page=>page.evaluate(()=>window.transport.close())));
   console.log(`PASS ${name}: real peer message with dotted hosts blocked, legacy compact invite, canonical HTTPS/WSS, discovery off and arbitrary relay refused.`);
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exit(1)});
