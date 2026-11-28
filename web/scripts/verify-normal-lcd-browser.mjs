// Local production-build smoke check. No real Bluetooth device is reachable.
// node scripts/verify-normal-lcd-browser.mjs <dist> <evidence-directory> <base-path>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {lcdFinal680 as lcdRelease, lcdFinal680Package as entry} from '../public/dfu/lcd-app680-reference.mjs';
import {lcdPreviewPackage670} from '../public/dfu/lcd-private-reference.mjs';
import {lcdTest677} from '../public/dfu/lcd-app677-reference.mjs';
import {lcdTest676} from '../public/dfu/lcd-app676-reference.mjs';

const [directory, evidence, base] = process.argv.slice(2);
assert.ok(directory && evidence && ['/', '/pixl.js/'].includes(base), 'Expected dist, evidence directory and normal root or Pages base');
const root = path.resolve(directory), output = path.resolve(evidence);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const version = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
assert.equal(version, '3.68.0-beta.6');
assert.equal(lcdRelease.artifactStatus, 'stable-signed-application');
assert.equal(lcdRelease.firmwareChannel, 'normal');
assert.equal(entry.id, 'de4.2-lcd-app');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
await fs.mkdir(output, {recursive:true});
async function manifest() {
  const files = [];
  async function walk(dir) {
    for (const item of await fs.readdir(dir, {withFileTypes:true})) {
      const name = path.join(dir, item.name);
      if (item.isDirectory()) await walk(name);
      else if (item.isFile()) { const bytes = await fs.readFile(name); files.push({path:path.relative(root,name).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)}); }
    }
  }
  await walk(root);
  return files.sort((a,b) => a.path.localeCompare(b.path, 'en'));
}
const before = await manifest();
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.zip':'application/zip','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff':'font/woff','.woff2':'font/woff2'};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    assert.ok(pathname.startsWith(base));
    const suffix = pathname.slice(base.length);
    const filename = path.resolve(root, suffix.endsWith('/') ? suffix + 'index.html' : suffix || 'index.html');
    assert.ok(filename.startsWith(root + path.sep));
    const bytes = await fs.readFile(filename);
    response.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});
    response.end(bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const startUrl = origin + base;
const results = [], screenshots = [], failures = [];
let browser;
const check = (name, condition) => { assert.ok(condition, name); results.push(name); };
async function screenshot(page, name) {
  const filename = name + '.png';
  await page.screenshot({path:path.join(output,filename),fullPage:true,animations:'disabled'});
  screenshots.push({path:filename,sha256:sha(await fs.readFile(path.join(output,filename)))});
}
try {
  browser = await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE ? {executablePath:process.env.CHROME_EXECUTABLE} : {})});
  for (const width of [390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},locale:'de-DE',serviceWorkers:'block'});
    try {
      let bluetoothCalls = 0;
      await context.exposeFunction('__recordUnexpectedBluetoothRequest', () => { bluetoothCalls++; });
      await context.route('**/*', route => route.request().url().startsWith(origin + '/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'bluetooth', {configurable:true,value:{requestDevice:async () => {
          await window.__recordUnexpectedBluetoothRequest(); throw Error('This local smoke check cannot access Bluetooth');
        }}});
      });
      const page = await context.newPage(), errors = [], packageRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.zip')) packageRequests.push(request.url()); });
      await page.goto(startUrl);
      await page.locator('.version-context').waitFor();
      const contextText = await page.locator('.version-context').innerText();
      check(`${width}: normal browser/version header`, contextText.includes(version) && /LCD DE4\.2 \/ App680/.test(contextText) && !/TEST1|test\.2/.test(contextText));
      const download = page.locator('.lcd-downloads a[href$="' + entry.file + '"]').first();
      await download.waitFor();
      check(`${width}: current application link uses the checked immutable phone download`, await download.getAttribute('href') === 'https://github.com/bluecyber81/pixl.js/releases/download/de4.2/' + entry.file);
      check(`${width}: retained combo has its own App662 explanation`, /ältere App662/.test(await page.locator('.lcd-downloads').first().innerText()));
      // Exercise bundled bytes locally; the external phone endpoint has a separate HTTP check.
      const response = await page.request.get(new URL('firmware/' + entry.file, startUrl).href);
      const downloaded = await response.body();
      check(`${width}: local application ZIP matches the pinned phone package`, response.status() === 200 && sha(downloaded) === lcdRelease.otaSha256 && downloaded.length === lcdRelease.otaBytes);
      check(`${width}: file manager fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await screenshot(page, `start-${width}`);
      await page.locator('.workspace-nav button[aria-controls="backup-workspace"]').click();
      const migration = page.locator('.migration-panel');
      await migration.waitFor();
      if (!await migration.evaluate(element => element.open)) await migration.locator(':scope > summary').click();
      check(`${width}: normal capacity default`, await migration.locator('select').inputValue() === 'de42');
      check(`${width}: normal capacity label`, await migration.locator('option').first().textContent() === 'DE4.1 / 678');
      check(`${width}: no migration needed for existing PFS1`, /normale Firmware verwendet weiterhin PFS1/.test(await migration.innerText()));
      packageRequests.length = 0;
      await page.goto(new URL('dfu/web.html', startUrl).href);
      await page.waitForFunction(id => document.querySelector('#bundled')?.value === id, entry.id);
      check(`${width}: single normal DFU default`, await page.locator('#bundled option[value="' + entry.id + '"]').count() === 1);
      check(`${width}: navigation does not load an OTA`, packageRequests.length === 0);
      check(`${width}: direct normal action available`, await page.locator('#load-lcd-preview').isEnabled());
      check(`${width}: no device action before validation`, await page.locator('#button').isDisabled());
      check(`${width}: actual source branch`, await page.locator('#profile-source').getAttribute('href') === 'https://github.com/bluecyber81/pixl.js/tree/de4.2');
      await page.locator('#load-lcd-preview').click();
      await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Paketidentität per SHA-256 bestätigt.'));
      check(`${width}: one explicit local OTA request`, packageRequests.length === 1 && packageRequests[0] === new URL('firmware/' + entry.file, startUrl).href);
      const target = await page.locator('#package-target').innerText();
      check(`${width}: normal verified init target without private label`, new RegExp('Zähler ' + lcdRelease.applicationCounter + '(?:\\D|$)').test(target) && !/Privates LCD-Prüfpaket/.test(target));
      check(`${width}: device choice remains a separate action`, await page.locator('#button').isEnabled());
      check(`${width}: DFU page fits viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await screenshot(page, `dfu-checked-${width}`);
      for (const ref of [lcdTest676, lcdTest677]) {
        const candidateId = ref.firmwareVersion.split('-')[1].toLowerCase() + '-lcd-app-test1';
        await page.locator('#bundled').selectOption(candidateId);
        check(`${width}: App${ref.applicationCounter} clearly identified as a test`, /Testversion/.test(await page.locator('#bundled option:checked').innerText()));
        check(`${width}: switching to App${ref.applicationCounter} clears readiness`, await page.locator('#button').isDisabled());
        const testPackage = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/firmware/Allmiibo_LCD_' + ref.firmwareVersion.split('-')[1].replace('.', '_') + '_' + ref.applicationCounter + '_NUR_APP.zip'));
        await page.locator('#load-bundled').click();
        const testBytes = await (await testPackage).body();
        check(`${width}: App${ref.applicationCounter} download matches signed release bytes`, testBytes.length === ref.otaBytes && sha(testBytes) === ref.otaSha256);
        await page.waitForFunction(() => document.querySelector('#button') && !document.querySelector('#button').disabled);
        check(`${width}: verified App${ref.applicationCounter} reports its own counter`, (new RegExp("Zähler " + ref.applicationCounter + "(?:\\D|$)")).test(await page.locator('#package-target').innerText()));
      }
      await page.locator('#board-profile').selectOption('OLED');
      check(`${width}: OLED hides the normal LCD direct action`, await page.locator('#lcd-preview-download').isHidden());
      check(`${width}: board change clears readiness`, await page.locator('#button').isDisabled());
      packageRequests.length = 0;
      await page.goto(new URL('dfu/web.html?package=' + lcdPreviewPackage670.id, startUrl).href);
      await page.waitForFunction(id => document.querySelector('#bundled')?.value === id, lcdPreviewPackage670.id);
      check(`${width}: old App670 deep link stays distinct`, await page.locator('#bundled option[value="' + lcdPreviewPackage670.id + '"]').count() === 1);
      check(`${width}: old test handoff retains isolated path`, new URL(await page.locator('#android-dfu-link').getAttribute('href')).searchParams.get('file') === 'https://bluecyber81.github.io/pixl.js/test/app670/firmware/' + lcdPreviewPackage670.file);
      check(`${width}: retained navigation has no implicit OTA`, packageRequests.length === 0);
      check(`${width}: no Bluetooth device access across all navigations`, bluetoothCalls === 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  assert.deepEqual(await manifest(), before, 'the checked distribution must remain unchanged');
} catch (error) { failures.push(error.stack || String(error)); process.exitCode = 1; }
finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(output, 'NORMAL_BROWSER.json'), JSON.stringify({schema:1,passed:failures.length === 0,webVersion:version,basePath:base,
    firmwareVersion:lcdRelease.firmwareVersion,applicationCounter:lcdRelease.applicationCounter,otaSha256:lcdRelease.otaSha256,otaBytes:lcdRelease.otaBytes,
    scriptSha256:sha(await fs.readFile(new URL(import.meta.url))),distribution:before,checks:results,screenshots,failures,
    limits:['Local built assets only; the external phone link is checked as a destination, not fetched. Public HTTP delivery is verified separately.','Fresh isolated Chromium contexts; Bluetooth device access is replaced with a rejecting test function.','No App680 hardware acceptance, throughput measurement or DFU transfer.']}, null, 2) + '\n');
  console.log(JSON.stringify({passed:failures.length === 0,checks:results.length,report:path.join(output,'NORMAL_BROWSER.json'),failures}, null, 2));
}
