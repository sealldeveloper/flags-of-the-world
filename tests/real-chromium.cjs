// Connect to an isolated ordinary headed Chromium without Playwright's focus/visibility overrides.
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
exports.launch=async function(chromium){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'puzzle-real-tabs-'));
 const child=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium-browser',['--no-sandbox','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--ozone-platform=x11','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{env:{...process.env,WAYLAND_DISPLAY:''},stdio:['ignore','ignore','pipe']});
 let browser;
 try{
  const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Isolated browser startup timed out')),20000);child.stderr.on('data',chunk=>{output+=chunk.toString();const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}if(output.length>16384)output=output.slice(-8192);});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Isolated browser exited during startup'));});});
  browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});
  const context=browser.contexts()[0];await context.setDefaultTimeout(30000);
  return {browser,context,async close(){await browser.close().catch(()=>{});if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}};
 }catch(error){child.kill('SIGKILL');fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});throw error;}
};
