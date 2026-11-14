// Production-bundle keyboard test. The browser uses a synthetic PX v1 peripheral.
// Run from web/: node scripts/verify-remote-keyboard-browser.mjs <dist> [base path]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {REMOTE_UUIDS} from '../src/lib/remote-control.js';

function installPeripheral(uuids) {
  const receipts = [], rx = new EventTarget(), tx = {properties:{write:true}};
  const device = new EventTarget();
  window.testRemote = {receipts, caps:15, photoStatus:0, delayReply:false, finish:null};
  rx.startNotifications = rx.stopNotifications = async () => rx;
  tx.writeValueWithResponse = async ([p,x,ver,op,lo,hi,arg]) => {
    receipts.push([op,arg]);
    const ack = () => {
      const photoStatus=op===5?window.testRemote.photoStatus:0;
      const lcd=op===5 && !photoStatus, length=lcd?Math.min(128,1024-arg*8):0;
      const bytes=new Uint8Array(12+length);
      bytes.set([p,x,ver,128|op,lo,hi,photoStatus,1,window.testRemote.caps,0,lcd?arg:0,length]);
      for(let i=0;i<length;i++){
        const offset=arg*8+i;
        bytes[12+i]=(offset*37+Math.floor(offset/128))&255; // Same synthetic test frame as the C wire vectors.
      }
      rx.value = new DataView(bytes.buffer);
      rx.dispatchEvent(new Event('characteristicvaluechanged'));
    };
    if (window.testRemote.delayReply) window.testRemote.finish = ack;
    else ack();
  };
  const service = {async getCharacteristic(uuid) {
    if (uuid === uuids.notify) return rx;
    if (uuid === uuids.write) return tx;
    throw Error('Unexpected test characteristic');
  }};
  device.gatt = {
    connected:false,
    async connect() { this.connected=true; return {getPrimaryService:async id => {
      if (id !== uuids.service) throw Error('Unexpected test service');
      return service;
    }}; },
    disconnect() {
      this.connected=false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    }
  };
  Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>device}});
}

const dist = path.resolve(process.argv[2] || 'dist'), base = process.argv[3] || '/';
await fs.access(path.join(dist,'index.html'));
const runtime = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const {chromium} = await import(runtime);
const server = await preview({base, build:{outDir:dist}, preview:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
const origin = 'http://127.0.0.1:'+server.httpServer.address().port;
let browser;
try {
  browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
  for (const locale of ['de-DE','en-GB']) {
    const page = await browser.newPage({locale,serviceWorkers:'block'});
    try {
      page.setDefaultTimeout(5000);
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.addInitScript(installPeripheral,REMOTE_UUIDS);
      await page.goto(origin+base);
      const nav = page.locator('.workspace-nav [aria-controls="remote-workspace"]');
      await nav.click();
      const section = page.locator('.remote-control'), pad = section.locator('.remote-pad');
      await section.getByRole('button',{name:locale==='de-DE'?'Fernbedienung verbinden':'Connect remote'}).click();
      const disconnect = section.locator('.remote-connection button');
      await disconnect.focus();
      await page.keyboard.press('ArrowRight'); // No global shortcut.
      await page.keyboard.press('Tab');
      const status = section.getByRole('button',{name:locale==='de-DE'?'Verbindung prüfen':'Check connection'});
      const photo=section.getByRole('button',{name:locale==='de-DE'?'Displaybild aktualisieren':'Refresh screen'});
      assert.equal(await photo.count(),0);
      assert(await status.evaluate(el=>el===document.activeElement));
      await page.evaluate(()=>{window.testRemote.delayReply=true;});
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>!!window.testRemote.finish);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter'); // Pending status must not queue another command.
      await page.evaluate(()=>{window.testRemote.delayReply=false;window.testRemote.finish();window.testRemote.finish=null;});
      await section.getByText(locale==='de-DE'?/Die Fernbedienung hat um \d\d:\d\d:\d\d geantwortet/:/The remote responded at \d{1,2}:\d\d:\d\d/).waitFor();
      assert(await status.evaluate(el=>el===document.activeElement));
      await page.keyboard.press('Tab');
      assert(await pad.evaluate(el=>el===document.activeElement));
      await page.keyboard.down('ArrowRight');
      await page.keyboard.down('ArrowRight'); // Browser generates repeat=true.
      await page.keyboard.up('ArrowRight');
      await section.getByText(locale==='de-DE'?'Das Gerät hat den Tastendruck „Rechts“ bestätigt.':'The device acknowledged the Right press.',{exact:true}).waitFor();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+ArrowLeft');
      await page.keyboard.press('Tab');
      const left = pad.getByRole('button').first();
      assert(await left.evaluate(el=>el===document.activeElement));
      await page.evaluate(()=>{window.testRemote.delayReply=true;});
      await page.keyboard.down('Enter'); // Native activation must send Left once, not Center.
      await page.waitForFunction(()=>!!window.testRemote.finish);
      await page.keyboard.down('Enter');
      await page.keyboard.press('ArrowRight'); // Busy: no queued input.
      await page.evaluate(()=>{window.testRemote.delayReply=false; window.testRemote.finish();});
      await page.keyboard.down('Enter'); // Held even across acknowledgement.
      await page.keyboard.up('Enter');
      assert(await left.evaluate(el=>el===document.activeElement));
      await page.keyboard.press('Space'); // Native button activation remains available.
      await section.getByText(locale==='de-DE'?'Das Gerät hat den Tastendruck „Links“ bestätigt.':'The device acknowledged the Left press.',{exact:true}).waitFor();
      await disconnect.click();
      await nav.focus();
      await page.keyboard.press('ArrowRight');
      assert.deepEqual(await page.evaluate(()=>window.testRemote.receipts),[
        [0,0],[0,0],[2,2],[2,1],[3,0],[2,0],[2,0]
      ]);
      await section.getByRole('button',{name:locale==='de-DE'?'Fernbedienung verbinden':'Connect remote'}).click();
      await page.evaluate(()=>{window.testRemote.delayReply=true;});
      await status.click();
      await section.getByRole('alert').filter({hasText:locale==='de-DE'?'nicht rechtzeitig auf die Verbindungsprüfung':'did not respond to the connection check'}).waitFor({timeout:10000});
      assert.equal(await status.count(),0);
      assert.equal(await section.getByText(/Die Fernbedienung hat um|The remote responded at/).count(),0);
      assert.deepEqual(await page.evaluate(()=>window.testRemote.receipts.slice(7)),[[0,0],[0,0]]);
      await page.evaluate(()=>{Object.assign(window.testRemote,{caps:63,delayReply:false,finish:null});});
      await section.getByRole('button',{name:locale==='de-DE'?'Fernbedienung verbinden':'Connect remote'}).click();
      const photoBox=section.locator('.display-photo');
      await photo.click();
      const image=photoBox.getByRole('img');
      await image.waitFor();
      const readCorners=()=>image.evaluate(async el=>{
        await el.decode();
        const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
        const ctx=canvas.getContext('2d');ctx.drawImage(el,0,0);
        return [el.naturalWidth,el.naturalHeight,ctx.getImageData(0,0,1,1).data[0],ctx.getImageData(127,63,1,1).data[0]];
      });
      assert.deepEqual(await readCorners(),[128,64,255,0]);
      await page.setViewportSize({width:375,height:800});
      const photoBounds=await image.boundingBox(),sectionBounds=await section.boundingBox();
      assert(photoBounds.x>=sectionBounds.x && photoBounds.x+photoBounds.width<=sectionBounds.x+sectionBounds.width+1);
      assert((await photo.boundingBox()).height>=44);
      if(locale==='de-DE' && process.env.REMOTE_SCREENSHOT_OUTPUT)await section.screenshot({path:process.env.REMOTE_SCREENSHOT_OUTPUT});
      const rotate=photoBox.getByRole('button',{name:locale==='de-DE'?'Um 180° drehen':'Rotate 180°'});
      await rotate.click();assert.deepEqual(await readCorners(),[128,64,0,255]);
      const [download]=await Promise.all([page.waitForEvent('download'),photoBox.getByRole('link').click()]);
      assert.equal(download.suggestedFilename(),'Allmiibo-LCD.png');
      await pad.focus();await page.keyboard.press('ArrowRight');
      assert.deepEqual(await page.evaluate(()=>window.testRemote.receipts.slice(9)),[
        [0,0],...[0,16,32,48,64,80,96,112].map(offset=>[5,offset]),[2,2]
      ]);
      await page.evaluate(()=>{window.testRemote.photoStatus=1;});
      await photo.click();
      await photoBox.getByRole('status').filter({hasText:locale==='de-DE'?'gerade kein Displayfoto':'could not provide a screenshot'}).waitFor();
      assert.equal(await image.count(),0);assert.equal(await photoBox.locator('time').count(),0);
      assert.equal(await photoBox.getByRole('link').count(),0);
      await page.evaluate(()=>{window.testRemote.photoStatus=0;});
      await photo.click();await image.waitFor();assert.deepEqual(await readCorners(),[128,64,255,0]);
      await disconnect.click();assert.equal(await section.getByRole('img').count(),0);
      console.log(locale+' passed: STATUS, timeout, keyboard, legacy fallback, on-demand remote LCD photo, pixel orientation, rotation, PNG download and disconnect');
    } finally {await page.context().close();}
  }
} finally {
  try {await browser?.close();} finally {await server.close();}
}
