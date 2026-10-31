// Real iroh relay integration, local persistence, portable codes and visual checks.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL || 'http://127.0.0.1:18764',out=process.env.SCREENSHOT_DIR || '/tmp/tierlist-visual';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',headless:true});
  const errors=[],sockets=[];
  async function page(name) {
    const p=await browser.newPage({viewport:{width:1280,height:900}});p.setDefaultTimeout(30000);
    p.on('pageerror',e=>errors.push(e.message));p.on('websocket',ws=>sockets.push(ws.url()));p.on('dialog',d=>d.accept());
    await p.goto(base+'/tierlist/');await p.locator('#albums .empty').waitFor({state:'visible'});if(name)await p.locator('#player-name').fill(name);return p;
  }
  async function capture(p,name,matrix=false) {
    for(const [width,height] of matrix?[[1920,1080],[1024,768],[390,844],[320,740]]:[[1280,900]]) {
      await p.setViewportSize({width,height});
      for(const theme of matrix?['light','dark']:['light']) {
        await p.evaluate(theme=>window.PuzzleTheme.setPreference(theme),theme);
        assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow ${width}`);
        assert(!/[—;]/.test(await p.locator('body').innerText()),`${name} contains banned interface punctuation`);
        await p.screenshot({path:`${out}/${name}-${width}-${theme}.png`,fullPage:true});
      }
    }
    await p.setViewportSize({width:1280,height:900});
  }
  const host=await page('Host'),guest=await page('Guest'),late=await page('Late arrival');
  await capture(host,'library-empty',true);
  await host.locator('#new').click();await host.locator('#confirm-new').click();await host.locator('#workspace').waitFor({state:'visible'});
  await capture(host,'empty-editor');
  await host.locator('#album-name').fill('A deliberately long album title for a very opinionated group of reviewers');await host.locator('#album-name').blur();
  const fixtures=await host.evaluate(()=>{
    const files=[];
    for(let n=0;n<8;n++) {
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=600;const ctx=canvas.getContext('2d');
      ctx.fillStyle=['#d74c4c','#238975','#3464a5','#c27b25','#9a55ad','#568a29','#256f95','#b94b78'][n];ctx.fillRect(0,0,900,600);
      ctx.fillStyle='#fff';ctx.font='bold 180px sans-serif';ctx.textAlign='center';ctx.fillText(String(n+1),450,365);
      // Noisy edges ensure the album crosses the bounded network chunk size.
      let seed=100+n;for(let i=0;i<12000;i++){seed=(seed*1664525+1013904223)>>>0;ctx.fillStyle=`#${(seed&0xffffff).toString(16).padStart(6,'0')}`;ctx.fillRect(seed%900,(seed>>>10)%600,3,3);}
      files.push(canvas.toDataURL('image/png').split(',')[1]);
    }
    return files;
  });
  await host.locator('#tab-images').click();
  await host.locator('#upload').setInputFiles(fixtures.map((data,i)=>({name:`Image ${i+1}.png`,mimeType:'image/png',buffer:Buffer.from(data,'base64')})));
  await host.waitForFunction(()=>!document.querySelector('#upload').disabled && document.querySelectorAll('.image-card').length===8);
  assert.equal(await host.locator('.image-card').count(),8);
  await host.locator('.image-card textarea').first().fill('The first image with a longer descriptive label');await host.locator('.image-card textarea').first().blur();
  await host.getByRole('button',{name:'Move image 1 later',exact:true}).click();
  await capture(host,'album-images',true);
  await host.locator('#tab-rank').click();
  const first=host.locator('#board .tile').first(),s=host.locator('#board .tiles').first();
  await first.dragTo(s);assert.equal(await s.locator('.tile').count(),1);
  await host.locator('#board .tier-row').last().locator('.tile').first().click();await host.locator('#board .place-here').nth(1).click();
  for(let n=0;n<4;n++) {
    await host.locator('#add-tier').click();await host.locator('#tier-name').fill(n===0?'A longer category with its own custom name':`Custom ${n+1}`);
    await host.locator('#tier-color').fill(n===0?'#17234a':'#d4b8ee');await host.locator('#tier-form button[type=submit]').click();
  }
  await host.getByRole('button',{name:'Edit tier S',exact:true}).click();await host.locator('#tier-name').fill('Best');await host.locator('#tier-form button[type=submit]').click();
  await capture(host,'solo-board',true);
  await host.locator('#export').click();await host.waitForFunction(()=>document.querySelector('#code').value.startsWith('TIER1.'));
  const code=await host.locator('#code').inputValue();assert(code.length>24000,'fixture must span multiple network chunks');
  const original=await host.evaluate(async code=>{const {decodeAlbum}=await import('./codec.mjs');return decodeAlbum(code);},code);
  assert(original.images.every(i=>i.width<=8192&&i.height<=8192&&/^data:image\/(png|jpeg|webp);/.test(i.data)&&i.thumb?.startsWith('data:image/')));
  assert.equal(original.board.tiers.length,9);assert.equal(original.board.tiers[0].items.length,1);
  await capture(host,'export-dialog');
  const downloadPromise=host.waitForEvent('download');await host.locator('#download-code').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^A deliberately long album title.*-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.tierlist$/);assert.equal(fs.readFileSync(await download.path(),'utf8'),code);
  await host.locator('[data-close="code-dialog"]').click();
  await host.reload();await host.locator('#albums .album-card').first().getByRole('button',{name:'Open',exact:true}).click();
  assert.equal(await host.locator('#board .tile').count(),8);assert.equal(await host.locator('#board .tier-row').count(),10);
  await guest.locator('#import').click();await guest.locator('#code').fill('TIER1.invalid');await guest.locator('#import-code').click();await guest.waitForFunction(()=>document.querySelector('#code-error').textContent.length>0);await capture(guest,'invalid-import');
  await guest.locator('#import-file').setInputFiles({name:'tierlist.txt',mimeType:'text/plain',buffer:Buffer.from(code)});await guest.waitForFunction(()=>document.querySelector('#code').value.length>1000);await guest.locator('#import-code').click();await guest.locator('#workspace').waitFor({state:'visible'});
  assert.equal(await guest.locator('#board .tile').count(),8);await guest.locator('#back').click();await capture(guest,'library-saved');
  console.log('Local creation, compression, ranking, persistence, import, export and file roundtrip passed');
  await host.locator('#tab-images').click();await host.locator('#host').click();await host.locator('#host-name').fill('Host');await capture(host,'host-dialog');await host.locator('#host-form button[type=submit]').click();await host.locator('#lobby-details').waitFor({state:'visible',timeout:60000});
  assert(await host.locator('#images-view').isHidden(),'hosting from Images must switch to the ranking view');
  const invite=await host.locator('#invite-output').inputValue();assert(invite.includes('#join=TL5.'));
  await guest.locator('#invite-input').fill(invite);await guest.locator('#join').click();await guest.locator('#lobby-details').waitFor({state:'visible',timeout:90000});
  await host.waitForFunction(()=>document.querySelectorAll('#players .player').length===2);
  await guest.locator('#board .tier-row').last().locator('.tile').first().click();await guest.locator('#board .place-here').nth(2).click();
  await guest.getByRole('button',{name:'Edit tier B',exact:true}).click();await guest.locator('#tier-name').fill('Guest only');await guest.locator('#tier-color').fill('#003322');await guest.locator('#tier-form button[type=submit]').click();
  await host.locator('#tab-everyone').click();await host.waitForFunction(()=>document.querySelector('#comparison').textContent.includes('Guest only'));
  assert.equal(await host.locator('#board .tier-name').filter({hasText:'Guest only'}).count(),0,'guest must not edit host board');
  await late.locator('#invite-input').fill(invite);await late.locator('#join').click();await late.locator('#lobby-details').waitFor({state:'visible',timeout:90000});await late.locator('#tab-everyone').click();await late.waitForFunction(()=>document.querySelector('#comparison').textContent.includes('Guest only'));
  await capture(host,'everyone-live',true);await capture(guest,'guest-board');
  await guest.reload();await guest.locator('#resume').click();await guest.locator('#confirm-join').click();await guest.locator('#lobby-details').waitFor({state:'visible',timeout:90000});
  assert.equal(await guest.getByRole('button',{name:'Edit tier Guest only',exact:true}).count(),1);
  assert.equal(await host.locator('#players .player').count(),3);
  await guest.locator('#save-copy').click();await guest.locator('#copy-name').fill('My saved ranking');await guest.locator('#confirm-copy').click();await guest.locator('#copy-dialog').waitFor({state:'hidden'});
  await host.locator('#leave').click();await guest.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('Lobby ended'));
  await capture(guest,'host-ended');assert(await guest.locator('#add-tier').isDisabled());
  await guest.locator('#leave').click();await guest.locator('#library').waitFor({state:'visible'});assert.equal(await guest.locator('.album-card').count(),2);
  assert(sockets.length>=4);assert(sockets.every(url=>new URL(url).hostname.endsWith('.relay.n0.iroh.link.')));
  assert.deepEqual(errors,[]);console.log(`PASS: real iroh host, multi-chunk album transfer, three peers, independent tiers, live ranking, late join, resume and host close. ${sockets.length} relay sockets.`);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
