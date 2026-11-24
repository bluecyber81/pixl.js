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
  window.testRemote = {receipts, name:'Pixl.Remote', caps:15, photoStatus:0, delayReply:false, finish:null};
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
  Object.defineProperty(navigator,'bluetooth',{value:{requestDevice:async()=>{
    if(window.testRemote.cancelPicker)throw new DOMException('No device selected','NotFoundError');
    device.name=window.testRemote.name;
    return device;
  }}});
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
      const footer = page.locator('footer.source-footer');
      const version = JSON.parse(await fs.readFile(path.join(dist, 'release.json'), 'utf8')).version;
      const de = locale === 'de-DE';
      const links = [
        ['Windows ' + version + ' (ZIP)', 'https://bluecyber81.github.io/pixl.js/downloads/web' + version + '/Allmiibo_Dateimanager_' + version.replaceAll('.', '_') + '_Portable.zip'],
        [de ? 'Quellcode ' + version + ' (ZIP)' : version + ' source code (ZIP)', 'https://github.com/bluecyber81/pixl.js/archive/refs/tags/web' + version + '.zip'],
        [de ? 'Archiv: LCD DE3.89 / App662 · Prüfpaket (ZIP)' : 'Archive: LCD DE3.89 / App662 · test kit (ZIP)', 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_DE3_89_App662_Pruefpaket.zip'],
        [de ? 'OLED DE3.87 / App86 · Prüfpaket (ZIP)' : 'OLED DE3.87 / App86 · test kit (ZIP)', 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_Pruefpaket.zip'],
      ];
      for (const [name, href] of links) {
        assert.equal(await footer.getByRole('link', { name, exact:true }).getAttribute('href'), href);
      }
      const nav = page.locator('.workspace-nav [aria-controls="remote-workspace"]');
      await nav.click();
      const section = page.locator('.remote-control'), pad = section.locator('.remote-pad');
      const connect=section.getByRole('button',{name:locale==='de-DE'?'Fernbedienung verbinden':'Connect remote'});
      await page.evaluate(()=>{window.testRemote.cancelPicker=true;});
      await connect.click();
      await section.getByRole('status').filter({hasText:locale==='de-DE'?'Kein Gerät ausgewählt':'No device selected'}).waitFor();
      assert.equal(await section.getByRole('alert').count(),0);
      assert.deepEqual(await page.evaluate(()=>window.testRemote.receipts),[]);
      await page.evaluate(()=>{window.testRemote.cancelPicker=false;window.testRemote.name='Other UART';});
      await connect.click();
      await section.getByRole('alert').filter({hasText:locale==='de-DE'?'Bluetooth-Seriendienst':'Bluetooth serial devices'}).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.testRemote.receipts),[]);
      await page.evaluate(name=>{window.testRemote.name=name;},locale==='de-DE'?'Pixl.Remote':'Pixl.Rem');
      await connect.click();
      const disconnect = section.locator('.remote-connection button');
      await disconnect.focus();
      await page.keyboard.press('ArrowRight'); // No global shortcut.
      await page.keyboard.press('Tab');
      const status = section.getByRole('button',{name:locale==='de-DE'?'Verbindung prüfen':'Check connection'});
      const photo=section.getByRole('button',{name:locale==='de-DE'?'Displaybild aktualisieren':'Refresh screen'});
      assert.equal(await photo.count(),0);
      assert.equal(await section.getByRole('checkbox').count(),0);
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
      const autoPhoto=section.getByRole('checkbox',{name:locale==='de-DE'?'Displayfoto nach Tastendruck automatisch aktualisieren':'Refresh screen automatically after button presses'});
      assert.equal(await autoPhoto.isChecked(),false);
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
      const originalPng = await image.getAttribute('src');
      const scales = photoBox.getByRole('group',{name:locale==='de-DE'?'Bildgröße':'Image scale'});
      const scale = n => scales.getByRole('button',{name:n+'×',exact:true});
      async function checkScale(n) {
        await page.waitForFunction(()=>document.querySelector('.remote-control')?.classList.contains('remote-compact')===window.matchMedia('(max-width: 600px)').matches);
        const options = photoBox.locator('details.photo-options');
        if (await options.count() && !await options.evaluate(el => el.open)) {
          await options.locator('summary').click();
        }
        await page.waitForFunction(({selector,width}) => {
          const el = document.querySelector(selector);
          return el?.getBoundingClientRect().width === width && el.getBoundingClientRect().height === width / 2;
        }, {selector:'.remote-photo img',width:128*n});
        assert.equal(await scale(n).getAttribute('aria-pressed'),'true');
        assert.equal(await image.getAttribute('src'),originalPng);
        assert.equal(await photoBox.getByRole('link').getAttribute('href'),originalPng);
      }
      await checkScale(3);
      await scale(1).click(); await checkScale(1);
      await scale(2).click(); await checkScale(2);
      await scale(3).click();
      await page.setViewportSize({width:375,height:800});
      await photoBox.locator('details.photo-options').waitFor();
      assert.equal(await photoBox.locator('details.photo-options').evaluate(el => el.open), false);
      assert.equal(await pad.getByRole('button').count(),4);
      const mobileButtons=await pad.getByRole('button').evaluateAll(buttons=>buttons.map(el=>{
        const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
      }));
      assert(mobileButtons.every(r=>r.width>=44 && r.height>=44));
      assert(mobileButtons.every(r=>Math.abs(r.y-mobileButtons[0].y)<1));
      assert((await image.boundingBox()).y < (await pad.boundingBox()).y);
      if(process.env.REMOTE_MOBILE_SCREENSHOT_DIR) await section.screenshot({path:path.join(process.env.REMOTE_MOBILE_SCREENSHOT_DIR,locale+'-mobile.png')});
      await checkScale(2); assert.equal(await scale(3).isDisabled(),true);
      await page.setViewportSize({width:1240,height:850});
      await checkScale(3);
      await page.setViewportSize({width:375,height:800});
      await checkScale(2);
      const photoBounds=await image.boundingBox(),sectionBounds=await section.boundingBox();
      assert(photoBounds.x>=sectionBounds.x && photoBounds.x+photoBounds.width<=sectionBounds.x+sectionBounds.width+1);
      assert((await photo.boundingBox()).height>=44);
      if(locale==='de-DE' && process.env.REMOTE_SCREENSHOT_OUTPUT)await section.screenshot({path:process.env.REMOTE_SCREENSHOT_OUTPUT});
      const rotate=photoBox.getByRole('button',{name:locale==='de-DE'?'Um 180° drehen':'Rotate 180°'});
      await rotate.click();assert.deepEqual(await readCorners(),[128,64,0,255]);
      const [download]=await Promise.all([page.waitForEvent('download'),photoBox.getByRole('link').click()]);
      assert.equal(download.suggestedFilename(),'Allmiibo-Display.png');
      const png = await fs.readFile(await download.path());
      assert.equal(png.readUInt32BE(16),128); assert.equal(png.readUInt32BE(20),64);
      assert.equal(png.toString('base64'),(await image.getAttribute('src')).split(',')[1]);
      await pad.focus();await page.keyboard.press('ArrowRight');
      assert.deepEqual(await page.evaluate(()=>window.testRemote.receipts.slice(9)),[
        [0,0],...[0,16,32,48,64,80,96,112].map(offset=>[5,offset]),[2,2]
      ]);
      const retainedPhoto=await image.getAttribute('src');
      const retainedTime=await photoBox.locator('time').getAttribute('datetime');
      await page.evaluate(()=>{window.testRemote.photoStatus=1;});
      await photo.click();
      await photoBox.getByRole('status').filter({hasText:locale==='de-DE'?'gerade kein Displayfoto':'could not provide a screenshot'}).waitFor();
      assert.equal(await image.getAttribute('src'),retainedPhoto);
      assert.equal(await photoBox.locator('time').getAttribute('datetime'),retainedTime);
      assert.equal(await photoBox.getByRole('link').getAttribute('href'),retainedPhoto);
      await page.evaluate(()=>{window.testRemote.photoStatus=0;});
      await photo.click();
      await page.waitForFunction(()=>document.querySelector('.remote-photo')?.getAttribute('aria-busy')==='false');
      await image.waitFor();assert.deepEqual(await readCorners(),[128,64,0,255]);
      await rotate.click();assert.deepEqual(await readCorners(),[128,64,255,0]);
      // Automatic mode only starts after an acknowledged navigation key.
      await autoPhoto.check();
      const beforeAuto=await page.evaluate(()=>window.testRemote.receipts.length);
      await page.evaluate(()=>{window.testRemote.delayReply=true;});
      await pad.getByRole('button',{name:locale==='de-DE'?'Rechts':'Right',exact:true}).click();
      await page.waitForFunction(()=>!!window.testRemote.finish);
      await page.waitForTimeout(350);
      assert.deepEqual(await page.evaluate(n=>window.testRemote.receipts.slice(n),beforeAuto),[[2,2]]);
      await page.evaluate(()=>{window.testRemote.delayReply=false;window.testRemote.finish();window.testRemote.finish=null;});
      await page.waitForFunction(n=>window.testRemote.receipts.length===n+9,beforeAuto);
      await image.waitFor();assert.deepEqual(await readCorners(),[128,64,255,0]);
      await page.waitForTimeout(1100); // No idle loop or retry after the one complete frame.
      assert.deepEqual(await page.evaluate(n=>window.testRemote.receipts.slice(n),beforeAuto),[
        [2,2],...[0,16,32,48,64,80,96,112].map(offset=>[5,offset])
      ]);
      if(locale==='de-DE' && process.env.REMOTE_AUTO_SCREENSHOT_OUTPUT)await section.screenshot({path:process.env.REMOTE_AUTO_SCREENSHOT_OUTPUT});
      // Turning the option off cancels its one pending picture, not the key.
      const beforeOff=await page.evaluate(()=>window.testRemote.receipts.length);
      await pad.getByRole('button').first().click();
      await autoPhoto.uncheck();await page.waitForTimeout(1100);
      assert.deepEqual(await page.evaluate(n=>window.testRemote.receipts.slice(n),beforeOff),[[2,0]]);
      // Session teardown also discards a queued capture and removes old pixels.
      await autoPhoto.check();
      const beforeDisconnect=await page.evaluate(()=>window.testRemote.receipts.length);
      await pad.getByRole('button').nth(1).click();
      await disconnect.click();await page.waitForTimeout(1100);
      assert.equal(await section.getByRole('img').count(),0);
      assert.deepEqual(await page.evaluate(n=>window.testRemote.receipts.slice(n),beforeDisconnect),[[2,1]]);
      await page.goto(origin+base+'dfu/web.html');
      const trial=page.locator('#lcd-downloads p').filter({hasText:locale==='de-DE'?'LCD-Testversion DE3.87 / App660':'LCD test release DE3.87 / App660'});
      assert.equal(await trial.count(),1);
      assert.match(await trial.innerText(),locale==='de-DE'?/Praxistest für diesen neuen Build ist noch offen/:/Physical testing of this new build is still pending/);
      assert.doesNotMatch(await trial.innerText(),/App657|successful practical use|praktischen Betrieb bestätigt/);
      await trial.getByRole('link',{name:locale==='de-DE'?'Installation und Prüfung':'Installation and testing'}).click();
      await page.waitForURL(origin+base+(locale==='de-DE'?'guide/#lcd-de387':'guide/en.html#lcd-de387'));
      assert.equal(await page.locator('#lcd-de387').count(),1);
      console.log(locale+' passed: STATUS, timeout, keyboard, legacy fallback, on-demand remote LCD photo, pixel orientation, rotation, PNG download, optional acknowledged-key auto photo, cancellation and disconnect');
    } finally {await page.context().close();}
  }
} finally {
  try {await browser?.close();} finally {await server.close();}
}
