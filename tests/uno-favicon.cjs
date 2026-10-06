const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});try{
 const page=await browser.newPage();const response=await page.goto((process.env.BASE_URL||'http://127.0.0.1:18764')+'/uno/');assert.equal(response.status(),200);
 const files=JSON.parse(fs.readFileSync(path.join(__dirname,'../uno/assets/scuffeduno/favicon-provenance.json'))).files;
 assert.equal(await page.locator('link[rel="icon"]').count(),files.length);
 for(const f of files){const size=f.dimensions.join('x'),icon=page.locator(`link[rel="icon"][sizes="${size}"]`);assert.equal(await icon.getAttribute('href'),'./assets/scuffeduno/'+f.file);assert.equal(await icon.getAttribute('type'),'image/png');
 const r=await page.request.get(new URL(await icon.getAttribute('href'),page.url()).href);assert.equal(r.status(),200);assert(r.headers()['content-type'].includes('image/png'));const data=await r.body();assert.equal(data.length,f.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),f.sha256);
 }
 console.log('PASS UNO-only 16/32px favicon declarations, image MIME and exact upstream hashes');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
