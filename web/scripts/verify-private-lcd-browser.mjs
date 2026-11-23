// Actual built private browser UI; synthetic observations only, no device access.
// PLAYWRIGHT_MODULE and CHROME_EXECUTABLE select an existing browser runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {preview} from 'vite';
import {diagnosticSnapshot} from '../tests/fixtures/diagnostic-overview-data.mjs';
import {lcdPreview, lcdPreviews} from '../public/dfu/lcd-private-reference.mjs';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {parseMtuDiagnostics} from '../src/lib/device-extra-diagnostics.js';

const linkFixture = JSON.parse(await fs.readFile(new URL('../tests/fixtures/ble-link-diagnostic-v2.json', import.meta.url), 'utf8'));
const linkObservation = parseMtuDiagnostics(new Uint8Array(Buffer.from(linkFixture.responsePayloadHex, 'hex')));

const [dist, output] = process.argv.slice(2);
assert.ok(dist && output, 'Usage: node scripts/verify-private-lcd-browser.mjs <dist> <evidence-directory>');
await fs.access(path.join(dist, 'index.html'));
await fs.mkdir(output, {recursive:true});
const webVersion = JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const base = path.basename(path.resolve(dist)) === 'dist-pages' ? '/pixl.js/' : '/';
assert.equal(lcdPreview.artifactStatus,'experimental-signed-application','App668 final package is still pending');
assert.equal(getMigrationCapacityTarget('de395').approved,true,'App668 linked capacity binding is still pending');
const privatePackages = lcdPreviews.map(reference => {
  const profile = {668:'de395',667:'de394',665:'de392',664:'de391'}[reference.applicationCounter];
  const match = /^2\.22\.0-DE3\.(\d+)$/u.exec(reference.firmwareVersion);
  assert.ok(profile && match, 'Every private package has an explicit capacity profile');
  return {reference,profile,name:`Allmiibo_LCD_DE3_${match[1]}_${reference.applicationCounter}_NUR_APP.zip`};
});
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await preview({base,build:{outDir:path.resolve(dist)},preview:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const startUrl = origin + base;
let browser;
const results=[], shots=[];
async function screenshot(page, name) {
  const file=path.join(output,name+'.png');
  await page.screenshot({path:file,fullPage:true,animations:'disabled'});
  shots.push({file:name+'.png',sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')});
}
async function fits(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
}
try {
  browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  for (const width of [390,1280]) {
    const context=await browser.newContext({viewport:{width,height:900},locale:'de-DE',serviceWorkers:'block'});
    try {
      const errors=[];
      await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
      await context.addInitScript(()=>{
        window.__bleCalls=0;
        Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>{window.__bleCalls++;throw Error('Synthetic test forbids hardware');}}});
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(startUrl);await page.locator('.version-context').waitFor();
      const versionContext = await page.locator('.version-context').innerText();
      assert.ok(versionContext.includes(webVersion));
      assert.match(versionContext,/LCD DE3\.95 \/ App668/);
      for (const {reference,profile} of privatePackages) {
        const snapshot=diagnosticSnapshot();
        snapshot.sections.boot.data.applicationCounter=reference.applicationCounter;
        if (reference.applicationCounter === 668) snapshot.sections.mtu.data = linkObservation;
        snapshot.sections.build={state:'available',observedAt:snapshot.completedAt,errorCode:null,data:{schemaVersion:1,board:'LCD',sourceId:reference.sourceId,previousFault:null}};
        Object.assign(snapshot.sections.storage.data.layout,getMigrationCapacityTarget(profile).layout,{mounted:true});
        await page.evaluate(({reference,snapshot})=>{
          const app=document.querySelector('#app')._vnode.component.proxy;window.__ui=app;
          Object.assign(app,{connected:true,firmwareVersion:reference.firmwareVersion,fullDiagnosticSnapshot:snapshot,language:'de_DE'});
          app.$i18n.locale='de_DE';app.show_workspace('device');
        },{reference,snapshot});
        const card=page.locator('article[data-section="build"]');await card.waitFor();
        assert.match(await card.innerText(),/Passend/);
        const details=card.locator('details');
        if(await details.count() && !await details.first().evaluate(el=>el.open))await details.first().locator('summary').click();
        assert.ok((await card.innerText()).includes(reference.sourceId));
        const comparison=page.locator('.build-reference');
        if(!await comparison.evaluate(el=>el.open))await comparison.locator('summary').click();
        const shown=await comparison.innerText();
        assert.ok(shown.includes(reference.firmwareVersion+' / '+reference.applicationCounter));
        assert.ok(shown.includes(reference.applicationBinSha256));
        assert.match(shown,/Hardwareprüfung.*steht aus/);
        const mtuCard=page.locator('article[data-section="mtu"]');
        const mtuText=await mtuCard.innerText();
        if (reference.applicationCounter === 668) {
          assert.match(mtuText,/Ausgehandeltes Verbindungsintervall/);
          assert.match(mtuText,/20 ms/);
          assert.match(mtuText,/2M \/ 2M/);
          assert.match(mtuText,/keine gemessene Dateiübertragungsgeschwindigkeit/);
        } else assert.doesNotMatch(mtuText,/Ausgehandeltes Verbindungsintervall|Aktueller Funkmodus/);
        await fits(page);await screenshot(page,`app${reference.applicationCounter}-diagnostics-${width}`);
      }
      await page.evaluate(()=>window.__ui.show_workspace('backup'));
      const migration=page.locator('.migration-panel');await migration.waitFor();
      if(!await migration.evaluate(el=>el.open))await migration.locator(':scope > summary').click();
      const selector=migration.locator('select');
      assert.equal(await selector.inputValue(),'de395');
      assert.deepEqual(await selector.locator('option').evaluateAll(items=>items.slice(0,4).map(el=>({value:el.value,text:el.textContent}))),[{value:'de395',text:'DE3.95 / 668'},{value:'de394',text:'DE3.94 / 667'},{value:'de392',text:'DE3.92 / 665'},{value:'de391',text:'DE3.91 / 664'}]);
      await selector.selectOption('de391');assert.equal(await selector.inputValue(),'de391');
      await selector.selectOption('de392');assert.equal(await selector.inputValue(),'de392');
      await selector.selectOption('de394');assert.equal(await selector.inputValue(),'de394');
      await selector.selectOption('de395');
      await fits(page);await screenshot(page,`app668-capacity-${width}`);
      assert.equal(await page.evaluate(()=>window.__bleCalls),0);
      await page.goto(new URL('dfu/web.html',startUrl).href);
      await page.locator('#file').waitFor();
      await page.waitForFunction(()=>!document.querySelector('#file').disabled);
      assert.match(await page.locator('.eyebrow').innerText(),/App668/);
      const download = await page.locator('#lcd-preview-download a').getAttribute('href');
      const response = await page.request.get(new URL(download,page.url()).href);
      assert.equal(response.status(),200);
      assert.equal(createHash('sha256').update(await response.body()).digest('hex'),lcdPreview.otaSha256);
      for(const {reference,name} of privatePackages){
        await page.locator('#file').setInputFiles(path.join(dist,'firmware',name));
        await page.waitForFunction(version=>document.querySelector('#status')?.textContent.includes('Privates LCD-Prüfpaket')&&document.querySelector('#status')?.textContent.includes(version),reference.firmwareVersion);
        assert.match(await page.locator('#package-target').innerText(),new RegExp(String(reference.applicationCounter)));
        assert.equal(await page.locator('#button').isEnabled(),true);
        await fits(page);await screenshot(page,`app${reference.applicationCounter}-dfu-${width}`);
      }
      await page.locator('#board-profile').selectOption('OLED');
      await page.locator('#file').setInputFiles(path.join(dist,'firmware','Allmiibo_LCD_DE3_94_667_NUR_APP.zip'));
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('anderen Display'));
      assert.equal(await page.locator('#button').isEnabled(),false);
      assert.equal(await page.evaluate(()=>window.__bleCalls),0);
      await page.goto(new URL('licenses/index.html',startUrl).href);
      const sourceName = 'LCD_DE3_95_App668_Simulatorquellen.zip';
      const sourceLink = page.locator('a[href="../sources/' + sourceName + '"]');
      assert.equal(await sourceLink.count(),1);
      assert.match(await sourceLink.innerText(),/DE3\.95 \/ App668/);
      const sourceResponse = await page.request.get(new URL(await sourceLink.getAttribute('href'),page.url()).href);
      assert.equal(sourceResponse.status(),200);
      assert.equal(createHash('sha256').update(await sourceResponse.body()).digest('hex'),
        createHash('sha256').update(await fs.readFile(new URL('../public/sources/' + sourceName,import.meta.url))).digest('hex'));
      assert.deepEqual(errors,[]);
      results.push({width,app668BuildReference:true,app667Retained:true,app665Retained:true,app664Retained:true,privatePackageRecognition:true,downloadHashVerified:true,sourceDownloadHashVerified:true,oledRejected:true,capacityProfilesSeparate:true,syntheticMtuV2Rendered:true,legacyMtuV1Preserved:true,noHorizontalOverflow:true,bluetoothRequests:0});
    } finally {await context.close();}
  }
  const report={passed:true,webVersion,deploymentBase:base,browser:browser.version(),deviceAccess:false,fixture:'synthetic rendered observations and actual signed local OTA files',results,screenshots:shots};
  await fs.writeFile(path.join(output,'PRIVATE_LCD_BROWSER.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
