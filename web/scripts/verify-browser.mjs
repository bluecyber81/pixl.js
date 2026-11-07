// Render the exact production bundle in an isolated browser. Synthetic UI
// observations only: this script cannot connect to or write a real device.
// PLAYWRIGHT_MODULE: absolute path to an already installed playwright/index.mjs
// CHROME_EXECUTABLE: optional absolute path to Chrome/Chromium.
// node scripts/verify-browser.mjs <dist-directory> <evidence-directory> [base-path]
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {diagnosticSnapshot} from '../tests/fixtures/diagnostic-overview-data.mjs';
import { createBackup, createBackupCheckpoint } from '../src/lib/backup.js';
import { memoryVfs } from '../tests/helpers/memory-vfs.mjs';
import { UPDATE_TARGET } from '../src/lib/update-target.js';

const root=path.resolve(process.argv[2]||'dist'),output=path.resolve(process.argv[3]||'browser-evidence');
const base=process.argv[4]||'/';
assert.match(base,/^\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*$/,'a local deployment base path is required');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const packageInfo=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url)));
const releaseInfo=UPDATE_TARGET.application;
const firmwareCatalog=JSON.parse(await fs.readFile(new URL('../src/data/firmware-releases.json',import.meta.url)));
const applicationPackage=firmwareCatalog.packages.find(entry=>entry.version===releaseInfo.version&&entry.counter===releaseInfo.counter);
assert.ok(applicationPackage?.applicationOnly,'browser check requires the current bound application-only package');
await fs.mkdir(output,{recursive:true});
const hashes={};
async function hashTree(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const p=path.join(dir,e.name);if(e.isDirectory())await hashTree(p);else if(e.isFile())hashes[path.relative(root,p).replaceAll('\\','/')]=createHash('sha256').update(await fs.readFile(p)).digest('hex');
}}
await hashTree(root);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.zip':'application/zip','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith(base))throw Error('outside deployment base');
  const suffix=pathname.slice(base.length);
  const p=path.resolve(root,suffix.endsWith('/')?suffix+'index.html':suffix||'index.html');
  if(!p.startsWith(root+path.sep))throw Error('outside test root');
  const bytes=await fs.readFile(p);
  const headers={'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':bytes.length};
  // Bind this specific response to the bytes served. Chrome can discard a
  // streamed body before Playwright retrieves a second copy over CDP.
  if(path.extname(p)==='.zip') headers['X-Test-Payload-SHA256']=createHash('sha256').update(bytes).digest('hex');
  res.writeHead(200,headers);res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
const errors=[],screenshots=[],checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const snapshot=diagnosticSnapshot();
snapshot.sections.drives.data=[{label:'E',status:0,totalBytes:2097152,freeBytes:1093632}];
Object.assign(snapshot.sections.startup.data,{schemaVersion:3,storageDetailMask:3,storageElapsedMilliseconds:[2100,2180],
 mount:{scope:'last-packedfs-mount',flags:23,result:0,configureMilliseconds:100,scanMilliseconds:2000,
 physicalReadAttempts:500,physicalReadBytes:128000,cacheHits:850,cacheMisses:450,bypassReads:50,physicalReadErrors:0}});
// Exercise the real ZIP writer and resume verification before submitting the
// resulting archive as a UI observation. Only the file source is synthetic.
async function resumedTwoFileBackup() {
 const source = memoryVfs();
 source.put('E:/a.bin', [1,2,3]);
 source.put('E:/b.bin', [4,5,6,7,8]);
 const identity = { rootPath: 'E:/', deviceKey: 'synthetic-device', firmwareVersion: releaseInfo.version };
 const options = { ...identity, checkpointState: createBackupCheckpoint(identity),
  readDirectory: source.api.readDirectory, readFile: source.api.readFile,
  readFileDigest: file => createHash('sha256').update(source.nodes.get(file).bytes).digest('hex') };
 const controller = new AbortController();
 await assert.rejects(createBackup({ ...options, signal: controller.signal,
  onProgress: value => { if (value.filesDone === 1) controller.abort(); } }), { name: 'AbortError' });
 source.log.length = 0;
 const { blob, filename, manifest } = await createBackup(options);
 assert.deepEqual(source.log.filter(entry => entry.op === 'read').map(entry => entry.args[0]), ['E:/b.bin']);
 assert.equal(manifest.files, 2);
 assert.equal(manifest.resume.reusedFiles, 1);
 return { filename, manifest, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}
async function shot(page,name,locator){
 const target=path.join(output,name+'.png');
 // Avoid scrolling a tall card under the mobile sticky navigation. Capture
 // its actual document rectangle from scroll position zero instead.
 await page.evaluate(()=>window.scrollTo(0,0));
 const clip=locator?await locator.boundingBox():null;
 if(locator)assert.ok(clip,name+' screenshot target must be visible');
 await page.screenshot({path:target,animations:'disabled',fullPage:true,...(clip?{clip}:{})});
 screenshots.push({file:name+'.png',sha256:createHash('sha256').update(await fs.readFile(target)).digest('hex')});
}
async function noOverflow(page,name){check(name+' fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
try{
 const backupFixture = await resumedTwoFileBackup();
 for(const [kind,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,locale:'de-DE',deviceScaleFactor:1,serviceWorkers:'block'});
  // Replacement supplied before any application JS runs. No operating-system
  // chooser or adapter is reachable even if an unintended button is clicked.
  await context.addInitScript(()=>{
   window.__testBleRequests=0;
   Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>{window.__testBleRequests++;throw new Error('Synthetic browser test: no hardware allowed');}}});
  });
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
  let page=await context.newPage();page.on('pageerror',error=>errors.push({kind,message:error.message}));
  await page.goto(origin+base);await page.locator('.version-context').waitFor();
  check(kind+' current browser version',await page.locator('.version-context').innerText().then(s=>s.includes(packageInfo.version)));
  await page.evaluate(({data,version})=>{
   const app=document.querySelector('#app')._vnode.component.proxy;window.__ui=app;
   Object.assign(app,{connected:true,connBtnText:'Trennen',connBtnType:'success',firmwareVersion:version,driveInfo:[{label:'E',status:0,totalBytes:2097152,freeBytes:1093632}],fullDiagnosticSnapshot:data});
   app.show_workspace('device');
  },{data:snapshot,version:releaseInfo.version});
  for(const [samples,label]of [[0,'zero'],[1,'one'],[null,'unknown']]){
   await page.evaluate(({data,samples})=>{data.sections.runtime.data.memorySamples=samples;window.__ui.fullDiagnosticSnapshot=data;window.__ui.runtimeInfo=data.sections.runtime.data;window.__ui.runtimeState='available';},{data:structuredClone(snapshot),samples});
   const ram=page.locator('[data-section="runtime"]');await ram.locator('.sample-note').waitFor();
   const expected=samples===0?'Noch keine Speicherstichprobe':samples===1?'Nur 1 Speicherstichprobe':'Stichprobenzahl nicht verfügbar';
   await page.waitForFunction(expected=>document.querySelector('[data-section="runtime"] .sample-note')?.textContent.includes(expected),expected);
   check(kind+' RAM '+label+' evidence visible',await ram.locator('.sample-note').isVisible());
   check(kind+' single runtime panel '+label+' evidence',await page.locator('.runtime-info .sample-note').innerText().then(s=>s.includes(expected)));
   await noOverflow(page,kind+' diagnostic '+label);await shot(page,kind+'-diagnostic-'+label,page.locator('.diagnostic-overview'));
   if(samples===1)await shot(page,kind+'-runtime-single',page.locator('.runtime-info').first());
  }
  await page.evaluate(data=>{const app=window.__ui,now=performance.now();app.fullDiagnosticBusy=true;app.fullDiagnosticProgress={completed:1,total:8,startedAt:now-12000,updatedAt:now-10000,sections:{runtime:data.sections.runtime}};app.readClock=now;},snapshot);
  await page.locator('.read-progress').waitFor();
  check(kind+' ongoing diagnostic read cannot be started twice',await page.getByRole('button',{name:'Diagnose wird gelesen …',exact:true}).isDisabled());
  check(kind+' ongoing diagnostic hides the previous completion time',await page.locator('.diagnostic-overview .snapshot-time').count()===0);
  await shot(page,kind+'-diagnostic-reading',page.locator('.diagnostic-overview'));
  await page.evaluate(()=>{window.__ui.fullDiagnosticBusy=false;window.__ui.fullDiagnosticProgress=null;});
  await page.locator('[data-section="startup"] .mount-profile > summary').click();
  check(kind+' mount profile rendered',await page.locator('[data-section="startup"]').innerText().then(s=>s.includes('128000 B')&&s.includes('kein Messzeitpunkt')));
  await shot(page,kind+'-mount-details',page.locator('[data-section="startup"]'));
  await page.locator('[data-section="startup"] .mount-profile > summary').click();
  await page.evaluate(data=>{window.__ui.bootInfo={...data.sections.boot.data,chipVariantRaw:0x41414530,
   applicationCounter:634,bootloaderCounter:18,bootRegionSha256:'c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade'};window.__ui.bootState='available';window.__ui.show_workspace('update');},snapshot);
  const bootCard=page.locator('.update-check .check-grid > article').nth(2);
  await bootCard.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.update-check .check-grid > article:nth-child(3)')?.textContent.includes('Z18-Rückkehrpaket erkannt'));
  check(kind+' Z18 is explicitly matched as unchanged Z15 rollback code',await bootCard.evaluate(el=>el.classList.contains('match')&&el.textContent.includes('keine neue Bootloader-Implementierung')));
  await noOverflow(page,kind+' Z18 profile');await shot(page,kind+'-z18-rollback',bootCard);
  await page.evaluate(()=>{window.__ui.bootInfo=null;window.__ui.bootState='unknown';window.__ui.show_workspace('device');});
  await page.evaluate(()=>{window.__ui.language='ja_JP';window.__ui.$i18n.locale='ja_JP';});
  await page.waitForFunction(()=>document.querySelector('.sample-note')?.textContent.includes('Sample count unavailable'));
  check(kind+' non-German diagnostic fallback',await page.locator('[data-section="runtime"] .sample-note').innerText().then(s=>s.includes('Sample count unavailable')));
  await page.evaluate(()=>{window.__ui.language='de_DE';window.__ui.$i18n.locale='de_DE';window.__ui.show_workspace('backup');window.__ui.current_dir='';
   // Mock only the folder-read boundary; the production picker, state guards,
   // action handlers and rendered buttons remain unchanged.
   window.__folderReads=[];
   window.__ui.reload_folder=async function(){window.__folderReads.push(this.current_dir);this.backupDriveOpenError=false;this.table_loading=true;await new Promise(resolve=>window.__folderReadDone=resolve);this.table_loading=false;this.listingError=window.__folderReadFail?'Synthetic read failed':null;this.tableData=[];};
   window.__ui.reload_drive=async function(){this.current_dir='';this.listingError=false;this.tableData=[];};
  });
  await page.locator('.backup-drive-picker button').first().waitFor();
  await shot(page,kind+'-backup-select-drive');
  await page.locator('.backup-drive-picker button').first().click();
  check(kind+' read-only drive picker invokes E root',await page.evaluate(()=>JSON.stringify(window.__folderReads)==='["E:/"]'));
  check(kind+' pending listing disables backup',await page.getByRole('button',{name:'Ordner sichern (ZIP)',exact:true}).isDisabled());
  check(kind+' folder loading is explained',await page.locator('#backup-workspace .workspace-content > p[role="status"]').innerText().then(s=>s.includes('Laufwerk wird geöffnet')));
  await shot(page,kind+'-backup-reading');
  await page.evaluate(()=>window.__folderReadDone());
  await page.waitForFunction(()=>window.__ui.table_loading===false);
  check(kind+' folder read enables backup',await page.getByRole('button',{name:'Ordner sichern (ZIP)',exact:true}).isEnabled());
  check(kind+' picker did not start a backup',await page.evaluate(()=>!window.__ui.backingUp&&window.__ui.transfer===null));
  await noOverflow(page,kind+' backup');await shot(page,kind+'-backup-ready');
  await page.evaluate(({ filename, manifest, bytes }) => {
   window.__ui.lastBackup = { filename, manifest, blob: new Blob([Uint8Array.from(bytes)], {type:'application/zip'}),
    sessionGeneration: window.__ui.sessionGeneration };
  }, backupFixture);
  const readyZip = page.locator('.backup-ready').filter({hasText:backupFixture.filename});
  await readyZip.waitFor();
  check(kind+' completed ZIP shows fresh and verified reused files with the correct byte totals in German',
   (await readyZip.innerText()).includes('1 Datei frisch vom Gerät gelesen (5 B)') &&
   (await readyZip.innerText()).includes('1 Datei nach Prüfsummenvergleich wiederverwendet (3 B)'));
  await noOverflow(page,kind+' completed backup');await shot(page,kind+'-backup-result',readyZip);
  await page.evaluate(()=>{window.__ui.language='en';window.__ui.$i18n.locale='en';});
  await readyZip.getByRole('button',{name:'Save backup ZIP',exact:true}).waitFor();
  const englishSummary=await readyZip.innerText();
  check(kind+' completed ZIP shows fresh and verified reused files with the correct byte totals in English',
   englishSummary.includes('1 file read from the device (5 B)') &&
   englishSummary.includes('1 file reused after checksum verification (3 B)'));
  const downloadPromise = page.waitForEvent('download');
  await readyZip.getByRole('button',{name:'Save backup ZIP',exact:true}).click();
  const download = await downloadPromise;
  check(kind+' save downloads the exact resumed two-file ZIP',
   download.suggestedFilename() === backupFixture.filename &&
   (await fs.readFile(await download.path())).equals(Buffer.from(backupFixture.bytes)));
  await readyZip.getByRole('button',{name:'Dismiss',exact:true}).click();
  check(kind+' discarding the ZIP clears its summary',await readyZip.count() === 0);
  await page.evaluate(()=>{window.__ui.language='de_DE';window.__ui.$i18n.locale='de_DE';});
  await page.evaluate(()=>{window.__ui.current_dir='';window.__folderReadFail=true;});
  await page.locator('.backup-drive-picker button').first().click();await page.evaluate(()=>window.__folderReadDone());
  await page.waitForFunction(()=>window.__ui.current_dir==='');
  check(kind+' failed listing restores drive selection',await page.locator('.backup-drive-picker button').first().isEnabled());
  check(kind+' folder failure is visible in Backup',await page.locator('#backup-workspace .workspace-content > p[role="alert"]').innerText().then(s=>s.includes('nicht geöffnet')));
  await shot(page,kind+'-backup-retry');
  await page.evaluate(()=>{window.__ui.show_workspace('device');window.__ui.runtimeInfo=null;window.__ui.fullDiagnosticSnapshot.sections.runtime={state:'failed',observedAt:new Date().toISOString(),data:null,errorCode:'RESPONSE_INVALID'};});
  await page.waitForFunction(()=>!document.querySelector('[data-section="runtime"] .sample-note'));
  check(kind+' failed read removes old RAM evidence',await page.locator('[data-section="runtime"]').innerText().then(s=>s.includes('Abfrage fehlgeschlagen')));
  await shot(page,kind+'-diagnostic-error',page.locator('.diagnostic-overview'));
  await page.locator('button[aria-controls="update-workspace"]').click();
  const card = page.locator('.firmware-packages .package').filter({has:page.getByText(applicationPackage.version, {exact:true})});
  const opensUpdater = page.waitForEvent('popup');
  await card.locator('.actions a[target="_blank"]').click();
  page = await opensUpdater;
  page.on('pageerror',error=>errors.push({kind,message:error.message}));
  await page.locator('#bundled option').nth(1).waitFor({state:'attached'});
  check(kind+' firmware card opens its own verified catalogue entry', await page.locator('#bundled').inputValue() === applicationPackage.id);
  check(kind+' package link awaits explicit loading', await page.locator('#button').isDisabled());
  await page.locator('#load-bundled:not([disabled])').waitFor();
  const packageResponsePromise=page.waitForResponse(response=>new URL(response.url()).pathname===base+'firmware/'+applicationPackage.file);
  await page.locator('#load-bundled').click();await page.locator('#button:not([disabled])').waitFor({timeout:30000});
  const packageResponse=await packageResponsePromise;
  check(kind+' exact current application ZIP bytes were served', packageResponse.ok() &&
    await packageResponse.headerValue('x-test-payload-sha256')===applicationPackage.sha256 &&
    Number(await packageResponse.headerValue('content-length'))===applicationPackage.bytes);
  check(kind+' DFU package validated before any hardware selection',await page.locator('#status').innerText().then(s=>s.length>0));
  check(kind+' exact current application ZIP was validated',await page.locator('#status').innerText().then(s=>s.includes(applicationPackage.version)&&s.includes('Paketidentität per SHA-256 bestätigt')));
  check(kind+' parsed DFU target matches current counter',await page.locator('#package-target').innerText().then(s=>s.includes(`Zähler ${releaseInfo.counter} ·`)&&s.includes('0x0126')));
  await noOverflow(page,kind+' application DFU');await shot(page,kind+'-dfu-ready');
  await page.locator('#file').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('not a firmware archive')});
  await page.locator('#button[disabled]').waitFor();await shot(page,kind+'-dfu-invalid');
  check(kind+' no real Bluetooth request',await page.evaluate(()=>window.__testBleRequests===0));
  await context.close();
 }
 check('no browser runtime errors',errors.length===0);
}finally{
 await fs.writeFile(path.join(output,'browser-evidence.json'),JSON.stringify({schema:1,generatedAt:new Date().toISOString(),
  scope:'Exact production bundle rendered in isolated Chrome with synthetic Vue observations, a mocked folder listing and a resumed two-file fixture ZIP; no hardware test.',
  browser:browser.version(),buildRoot:root,deploymentBase:base,filesSha256:hashes,checks,screenshots,errors},null,2));
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify({checks:checks.length,screenshots:screenshots.length,errors:errors.length,output}));
