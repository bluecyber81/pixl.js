// Run against a production build. All radio operations are simulated.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {PIXLINK_UUIDS as cp} from '../src/lib/pixlink.js';
import {REMOTE_UUIDS as nus} from '../src/lib/remote-control.js';
import {installPixLinkPeripheral} from './pixlink-test-peripheral.mjs';

const runtime=process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright';
const {chromium}=await import(runtime);
const base=process.argv[3]||'/';
const server=await preview({base,build:{outDir:path.resolve(process.argv[2]||'dist')},preview:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  for(const locale of ['de-DE','en-GB']){
    const page=await browser.newPage({locale,serviceWorkers:'block'});
    try {
      const de=locale==='de-DE';
      page.setDefaultTimeout(8000);
      await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await page.addInitScript(installPixLinkPeripheral,{cp,nus});
      await page.goto(origin+base);
      await page.locator('.workspace-nav [aria-controls="remote-workspace"]').click();
      const protocol=page.locator('.protocol-picker select');
      await protocol.selectOption('pixlink');
      const section=page.locator('.pixlink');
      const connect=section.getByRole('button',{name:de?'PixLink-Gerät auswählen':'Choose PixLink device'});
      const enable=section.getByRole('button',{name:de?'Steuerung übernehmen':'Take control'});
      const keys=section.locator('.keys button');
      const files=section.getByRole('button',{name:de?'Dateiübertragung öffnen':'Open file transfer'});
      assert.equal(await page.evaluate(()=>window.testPixLink.selections.length),0);
      await page.evaluate(()=>{window.testPixLink.wrongService=true;});
      await connect.click();
      await section.getByRole('alert').filter({hasText:de?'Dienst':'service'}).waitFor();
      await page.evaluate(()=>{window.testPixLink.wrongService=false;});
      await connect.click();await enable.waitFor();
      assert(await keys.first().isDisabled());
      await page.evaluate(()=>{window.testPixLink.modeStatus=1;});
      await enable.click();
      await section.getByRole('alert').filter({hasText:de?'abgelehnt':'rejected'}).waitFor();
      await page.evaluate(()=>{window.testPixLink.modeStatus=null;});
      await connect.click();await enable.click();
      await keys.nth(1).click();
      await section.getByText(de?'Tastendruck und Loslassen wurden gesendet. Prüfe die Reaktion am Display.':'Button press and release sent. Check the device display for the result.').waitFor();
      await page.evaluate(()=>window.testPixLink.device.gatt.disconnect());
      await section.getByRole('alert').filter({hasText:de?'getrennt':'dropped'}).waitFor();
      await connect.click();await enable.click();
      await section.getByText(de?'Der Steuermodus war bereits aktiv.':'Control mode was already active.').waitFor();
      await files.click();
      await page.waitForFunction(()=>window.testPixLink.writes.filter(a=>a[0]==='nus'&&a[1]===16).length===2);
      await page.getByText('2.27.11',{exact:false}).first().waitFor();
      await page.locator('.file-name-action[data-file-name^="E:/"]').click();
      await page.locator('.file-name-action[data-file-name="Proof.txt"]').dblclick();
      const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:de?'Datei speichern':'Save file',exact:true}).click()]);
      assert.equal(download.suggestedFilename(),'Proof.txt');
      assert.deepEqual([...await readFile(await download.path())],[17,34,51]);
      const result=await page.evaluate(()=>({writes:window.testPixLink.writes,connected:window.testPixLink.device.gatt.connected}));
      assert(result.connected);
      assert.deepEqual(result.writes.filter(a=>a[0]==='cp'&&a[1]===3),[['cp',3,0,0,0,0,1,0],['cp',3,0,0,0,0,0,0]]);
      assert.deepEqual(result.writes.filter(a=>a[0]==='nus').map(a=>a[1]),[1,16,3,1,16,22,18,20,19]);
      console.log(locale+' passed: explicit picker, wrong service, declined mode, key/release, disconnect and same-link file handshake, folder and byte-verified download');
    } catch(error) {console.error(await page.evaluate(()=>({writes:window.testPixLink?.writes,body:document.body.innerText.slice(-4000)})));throw error;} finally {await page.context().close();}
  }
}finally{try{await browser?.close();}finally{await server.close();}}
