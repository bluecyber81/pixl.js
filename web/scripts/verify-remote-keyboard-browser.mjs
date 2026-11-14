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
  window.testRemote = {receipts, delayReply:false, finish:null};
  rx.startNotifications = rx.stopNotifications = async () => rx;
  tx.writeValueWithResponse = async ([p,x,ver,op,lo,hi,arg]) => {
    receipts.push([op,arg]);
    const ack = () => {
      rx.value = new DataView(Uint8Array.of(p,x,ver,128|op,lo,hi,0,1,15,0,0,0).buffer);
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
      console.log(locale+' passed: manual STATUS, local time and timeout, focus, named device acknowledgement, held key, busy state, native buttons, disconnect');
    } finally {await page.context().close();}
  }
} finally {
  try {await browser?.close();} finally {await server.close();}
}
