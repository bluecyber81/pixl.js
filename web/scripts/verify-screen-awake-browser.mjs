// Exact compiled Vue application in isolated installed Chrome. Wake Lock and
// visibility events are simulated, real Bluetooth and outside requests blocked.
// No physical phone, operating-system power policy, real transfer or NFC proof.
// node scripts/verify-screen-awake-browser.mjs <dist> <evidence> [base-path]
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root=path.resolve(process.argv[2]||'dist'), output=path.resolve(process.argv[3]||'browser-awake-evidence');
const base=process.argv[4]||'/';
assert.match(base,/^\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*$/);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
await fs.mkdir(output,{recursive:true});
const filesSha256={}, checks=[],screenshots=[],layouts=[],errors=[],externalAttempts=[];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
async function hashTree(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 const filename=path.join(dir,entry.name);
 if(entry.isDirectory())await hashTree(filename);
 else if(entry.isFile())filesSha256[path.relative(root,filename).replaceAll('\\','/')]=sha256(await fs.readFile(filename));
}}
await hashTree(root);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(!pathname.startsWith(base))throw Error('outside base');
 const suffix=pathname.slice(base.length),filename=path.resolve(root,suffix.endsWith('/')?suffix+'index.html':suffix||'index.html');
 if(!filename.startsWith(root+path.sep))throw Error('outside root');
 res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});
 res.end(await fs.readFile(filename));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
async function shot(page,name){
 await page.evaluate(()=>window.scrollTo(0,0));
 const panel=page.locator('.screen-awake'),clip=await panel.boundingBox();assert.ok(clip);
 const filename=path.join(output,name+'.png');
 await page.screenshot({path:filename,fullPage:true,clip,animations:'disabled'});
 screenshots.push({file:name+'.png',sha256:sha256(await fs.readFile(filename))});
}
async function fits(page,name){
 const layout=await page.evaluate(()=>{
  const p=document.querySelector('.screen-awake');
  return {viewport:innerWidth,document:document.documentElement.scrollWidth,panelClient:p.clientWidth,panelScroll:p.scrollWidth,
   outside:[p,...p.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1);}).map(e=>e.tagName)};
 });layouts.push({name,...layout});
 check(name+' no horizontal overflow',layout.document<=layout.viewport+1&&layout.panelScroll<=layout.panelClient+1&&layout.outside.length===0);
}
async function message(page,text){await page.waitForFunction(text=>document.querySelector('.screen-awake > span')?.textContent.includes(text),text);}
async function setState(page,values){await page.evaluate(values=>{Object.assign(window.__ui,values);},values);}
async function state(page){return page.evaluate(()=>({requests:window.__wake.requests.length,releaseCalls:window.__wake.sentinels.reduce((n,s)=>n+s.releaseCalls,0),held:window.__wake.sentinels.filter(s=>!s.released).length,bleRequests:window.__testBleRequests}));}
async function contextFor(viewport,mode,kind){
 const context=await browser.newContext({viewport,locale:'de-DE',deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addInitScript(({mode})=>{
  window.__testBleRequests=0;
  Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>{window.__testBleRequests++;throw Error('No hardware in synthetic browser test');},getDevices:async()=>[]}});
  let visibility='visible';
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>visibility!=='visible'});
  class Sentinel extends EventTarget{
   released=false;releaseCalls=0;
   externalRelease(){if(!this.released){this.released=true;this.dispatchEvent(new Event('release'));}}
   async release(){this.releaseCalls++;this.externalRelease();}
  }
  const w=window.__wake={mode,requests:[],sentinels:[],pending:[],show(value){visibility=value?'visible':'hidden';document.dispatchEvent(new Event('visibilitychange'));},resolveNext(){const pending=this.pending.shift();if(!pending)throw Error('No pending request');const s=new Sentinel();this.sentinels.push(s);pending.resolve(s);}};
  const api=mode==='unsupported'?{}:{request:async type=>{
   w.requests.push(type);
   if(w.mode==='deny')throw new DOMException('Simulated policy denial','NotAllowedError');
   if(w.mode==='pending')return new Promise((resolve,reject)=>w.pending.push({resolve,reject}));
   const s=new Sentinel();w.sentinels.push(s);return s;
  }};
  Object.defineProperty(navigator,'wakeLock',{configurable:true,value:api});
 },{mode});
 await context.route('**/*',route=>{
  const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
  externalAttempts.push({kind,url});return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push({kind,message:e.message}));
 await page.goto(origin+base);await page.locator('.version-context').waitFor();
 check(kind+' web version 3.40.0',(await page.locator('.version-context').innerText()).includes('3.40.0'));
 await page.evaluate(()=>{window.__ui=document.querySelector('#app')._vnode.component.proxy;window.__ui.show_workspace('backup');});
 return {context,page};
}
let failure=null;
try{
 for(const [kind,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  {
   const {context,page}=await contextFor(viewport,'accept',kind+'-supported');
   check(kind+' initially idle without request',(await state(page)).requests===0&&await page.locator('.screen-awake').count()===0);
   await setState(page,{backingUp:true});
   check(kind+' disconnected operation does not acquire',(await state(page)).requests===0&&await page.locator('.screen-awake').count()===0);
   await setState(page,{connected:true});await message(page,'hält das Display');
   check(kind+' lock bound to connected active operation',(await state(page)).requests===1&&(await state(page)).held===1);
   check(kind+' limitation foreground and manual lock visible',(await page.locator('.screen-awake small').innerText()).includes('Tab im Vordergrund')&&(await page.locator('.screen-awake small').innerText()).includes('Sperren kann Bluetooth unterbrechen'));
   check(kind+' default checkbox enabled and checked',await page.locator('.screen-awake input').isEnabled()&&await page.locator('.screen-awake input').isChecked());
   await fits(page,kind+' active');await shot(page,kind+'-active');
   const input=page.locator('.screen-awake input');await input.focus();await page.keyboard.press('Space');await message(page,'Wachhalten ausgeschaltet');
   check(kind+' keyboard opt-out releases lock',(await state(page)).held===0&&(await state(page)).releaseCalls===1);
   check(kind+' opt-out keeps operation running',await page.evaluate(()=>window.__ui.backingUp&&window.__ui.connected));
   check(kind+' no retry while disabled',await page.locator('.screen-awake button').count()===0);
   await fits(page,kind+' disabled');await shot(page,kind+'-disabled');
   await input.check();await message(page,'hält das Display');
   check(kind+' re-enable acquires once',(await state(page)).requests===2);
   await page.evaluate(()=>window.__wake.sentinels.at(-1).externalRelease());await message(page,'System hat Wachhalten beendet');
   await page.waitForTimeout(180);
   check(kind+' spontaneous release never loops',(await state(page)).requests===2&&(await state(page)).held===0);
   check(kind+' released state exposes explicit retry',await page.getByRole('button',{name:'Erneut versuchen',exact:true}).isEnabled());
   await fits(page,kind+' released');await shot(page,kind+'-released');
   await page.getByRole('button',{name:'Erneut versuchen',exact:true}).click();await message(page,'hält das Display');
   check(kind+' explicit retry acquires once',(await state(page)).requests===3);
   await page.evaluate(()=>window.__wake.show(false));await message(page,'Tab war nicht sichtbar');
   check(kind+' hiding releases lock',(await state(page)).held===0);
   await fits(page,kind+' hidden');await shot(page,kind+'-hidden');
   await page.evaluate(()=>window.__wake.show(true));await message(page,'hält das Display');
   check(kind+' returning visible reacquires once',(await state(page)).requests===4);
   await setState(page,{backingUp:false});await page.locator('.screen-awake').waitFor({state:'detached'});
   check(kind+' completed operation releases lock',(await state(page)).held===0);
   for(const [flag,value]of [['fullDiagnosticBusy',true],['startupBusy',true],['collectionBusy',true],['searchBusy',true],['migrationBusy',true],['syncing',true],['zipBusy',true],['pendingUploads',1],['pendingDownloads',1]]){
    const before=(await state(page)).requests;await setState(page,{[flag]:value});await message(page,'hält das Display');
    check(kind+' '+flag+' acquires',(await state(page)).requests===before+1);
    await setState(page,{[flag]:typeof value==='number'?0:false});await page.locator('.screen-awake').waitFor({state:'detached'});
    check(kind+' '+flag+' releases',(await state(page)).held===0);
   }
   await setState(page,{backingUp:true});await message(page,'hält das Display');
   await setState(page,{language:'en_US'});await message(page,'keeping the screen awake');
   check(kind+' English limitation visible',(await page.locator('.screen-awake small').innerText()).includes('Manually locking the screen may interrupt Bluetooth'));
   await fits(page,kind+' English');await shot(page,kind+'-active-en');
   await setState(page,{connected:false});await page.locator('.screen-awake').waitFor({state:'detached'});
   check(kind+' disconnect releases lock',(await state(page)).held===0);
   await setState(page,{connected:true});await message(page,'keeping the screen awake');
   await page.evaluate(()=>document.querySelector('#app')._vnode.component.appContext.app.unmount());
   check(kind+' app unmount releases lock',(await state(page)).held===0);
   check(kind+' supported no real Bluetooth',(await state(page)).bleRequests===0);
   await context.close();
  }
  for(const mode of ['unsupported','deny','pending']){
   const label=kind+'-'+mode,{context,page}=await contextFor(viewport,mode,label);
   await setState(page,{connected:true,backingUp:true});
   if(mode==='unsupported'){
    await message(page,'nicht verfügbar');check(label+' no browser request',(await state(page)).requests===0);
    check(label+' no misleading retry',await page.locator('.screen-awake button').count()===0);
    await fits(page,label);await shot(page,label);
    await page.locator('.screen-awake input').uncheck();await message(page,'ausgeschaltet');
    await page.locator('.screen-awake input').check();await message(page,'nicht verfügbar');
   }else if(mode==='deny'){
    await message(page,'nicht erlaubt');check(label+' permission refusal visible',(await state(page)).requests===1);
    await page.waitForTimeout(180);check(label+' no automatic retry loop',(await state(page)).requests===1);
    await fits(page,label);await shot(page,label);
    await page.evaluate(()=>window.__wake.mode='accept');await page.getByRole('button',{name:'Erneut versuchen',exact:true}).click();await message(page,'hält das Display');
    check(label+' explicit retry recovers',(await state(page)).requests===2&&(await state(page)).held===1);
   }else{
    await message(page,'angefordert');check(label+' pending does not claim held',(await state(page)).held===0);
    await fits(page,label);await shot(page,label);
    await page.locator('.screen-awake input').uncheck();await message(page,'ausgeschaltet');
    await page.evaluate(()=>window.__wake.resolveNext());await page.waitForFunction(()=>window.__wake.sentinels[0]?.released);
    check(label+' late grant after opt-out released',(await state(page)).releaseCalls===1&&(await state(page)).held===0);
    await page.evaluate(()=>window.__wake.mode='accept');await page.locator('.screen-awake input').check();await message(page,'hält das Display');
    check(label+' opt-in after stale resolution recovers',(await state(page)).requests===2&&(await state(page)).held===1);
   }
   check(label+' work continues regardless of wake lock',await page.evaluate(()=>window.__ui.backingUp&&window.__ui.connected));
   await setState(page,{backingUp:false});await page.locator('.screen-awake').waitFor({state:'detached'});
   check(label+' completion leaves no held lock',(await state(page)).held===0);
   check(label+' no real Bluetooth',(await state(page)).bleRequests===0);await context.close();
  }
 }
 check('no browser runtime errors',errors.length===0);
}catch(error){failure={name:error.name,message:error.message,stack:error.stack};throw error;}
finally{
 await fs.writeFile(path.join(output,'screen-awake-browser-evidence.json'),JSON.stringify({schema:1,generatedAt:new Date().toISOString(),scope:'Exact compiled Vue application; synthetic active-operation flags, Wake Lock API and visibility changes. All external requests and real Bluetooth blocked; no phone power-policy or actual transfer test.',browser:browser.version(),buildRoot:root,deploymentBase:base,filesSha256,checks,screenshots,layouts,errors,externalAttempts,failure},null,2));
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify({checks:checks.length,screenshots:screenshots.length,errors:errors.length,output}));
