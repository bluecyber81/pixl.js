// Production Vue and BLE, with an isolated synthetic, read-only peripheral.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { installReadOnlyPeripheral } from './check-device-search-csv-browser.mjs';

const [dist, output, base = '/'] = process.argv.slice(2);
assert.ok(dist && output, 'Supply production build and screenshot directory.');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await preview({base, build: {outDir:path.resolve(dist)}, preview:{host:'127.0.0.1', port:0, open:false}, logLevel:'error'});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const fixture = {files:{}, capacity:{total:2097152,free:1138688}, firmwareVersion:'2.22.0-DE3.79',
  powerDiagnostics:[80,88,80,68,1,16,31,0,0,0,0,0,0x5b,0x10,180,0],
  flashDiagnostics:[80,88,74,70,1,12,3,0,235,64,21,0]};
let browser;
try {
  await mkdir(output, {recursive:true});
  browser = await chromium.launch({headless:true, chromiumSandbox:true, executablePath:process.env.CHROME_EXECUTABLE});
  for (const [locale,width] of [['de-DE',390],['en-GB',1200]]) {
    const de = locale === 'de-DE';
    const context = await browser.newContext({locale, viewport:{width,height:850}, acceptDownloads:true, serviceWorkers:'block'});
    try {
      await context.addInitScript(installReadOnlyPeripheral, fixture);
      await context.route('**/*', route => route.request().url().startsWith(origin + '/') || route.request().url().startsWith('blob:')
        ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      async function capture(panel, name) {
        await panel.evaluate(el => {
          const sticky = document.querySelector('.workspace-nav');
          const overlap = getComputedStyle(sticky).display === 'grid' ? sticky.getBoundingClientRect().height : 0;
          window.scrollBy({top:el.getBoundingClientRect().top - overlap - 8,behavior:'instant'});
        });
        await panel.screenshot({path:path.join(output, name + '-' + locale + '.png')});
      }
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(12_000);
      await page.goto(origin + base);
      await page.locator('.header-tools').getByRole('button',{name:de ? 'Verbinden' : 'Connect',exact:true}).click();
      await page.locator('.version-context').getByText(fixture.firmwareVersion,{exact:true}).waitFor();
      await page.locator('.workspace-nav [aria-controls="device-overview"]').click();
      const area = page.locator('.battery-history');
      const start = area.getByRole('button',{name:de ? 'Aufzeichnung starten' : 'Start recording'});
      await start.waitFor();
      const reads = () => page.evaluate(() => window.testPeripheral.commands.filter(({cmd}) => cmd === 8).length);
      assert.equal(await reads(),0);
      await start.click();
      await area.locator('svg circle').waitFor({state:'attached'});
      await area.locator('details summary').click();
      await area.getByRole('cell',{name:de ? 'Lädt' : 'Charging',exact:true}).waitFor();
      assert.equal(await reads(),1);
      const downloadEvent = page.waitForEvent('download');
      await area.getByRole('button',{name:de ? 'CSV speichern' : 'Save CSV'}).click();
      const download = await downloadEvent;
      assert.match(download.suggestedFilename(), /\.csv$/);
      const bytes = await readFile(await download.path(),'utf8');
      assert.match(bytes,/time_utc;battery_mV;charging_active;entry;pause_reason\r\n/);
      assert.match(bytes,/;4187;true;reading;\r\n/);
      assert.equal((await area.boundingBox()).width <= width,true);
      assert.ok(await area.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await capture(area, 'Akkuverlauf');
      await area.getByRole('button',{name:de ? 'Aufzeichnung stoppen' : 'Stop recording'}).click();
      const hardware = page.locator('.board-profile');
      await hardware.getByRole('button',{name:de ? 'Flash-Kennung auslesen' : 'Read flash ID'}).click();
      await hardware.getByText(/TsingTeng/).waitFor();
      assert.match(await hardware.innerText(), /EB 40 15/i);
      await hardware.locator('summary').click();
      const label = hardware.getByRole('checkbox');
      assert.equal(await label.isChecked(), false);
      async function storageFailure(method, enabled) {
        await page.evaluate(({method, enabled}) => {
          if (!enabled) { Storage.prototype[method] = window.testStorageMethod; return; }
          const original = Storage.prototype[method];
          window.testStorageMethod = original;
          Storage.prototype[method] = function (key,...args) {
            if (key.endsWith('.battery-label.v1')) throw new DOMException('Storage unavailable','SecurityError');
            return original.call(this,key,...args);
          };
        }, {method,enabled});
      }
      await storageFailure('setItem',true);
      await label.click();
      await hardware.getByRole('status').waitFor();
      assert.equal(await label.isChecked(),false);
      await storageFailure('setItem',false);
      await label.check();
      await hardware.getByText(de ? /Quelle: bestätigter Akkuaufdruck/ : /Source: confirmed battery label/).waitFor();
      await storageFailure('removeItem',true);
      await label.click();
      await hardware.getByRole('status').waitFor();
      assert.equal(await label.isChecked(),true);
      await storageFailure('removeItem',false);
      await label.uncheck();
      await capture(hardware, 'Hardwareprofil');
      assert.deepEqual(await page.evaluate(() => window.testPeripheral.violations),[]);
      assert.deepEqual(errors,[]);
      console.log(locale + ' ' + width + 'px: INFO 0x08, voltage, charging, CSV, layout, JEDEC read and battery-label opt-in passed.');
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await server.close();
}
