// Verify the production UI with synthetic names, wake locks and DFU radio boundaries.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [dist, base, report] = process.argv.slice(2);
assert.ok(dist && report && ['/', '/pixl.js/'].includes(base));
const build = path.resolve(dist);
const libraries = new URL('../src/lib/', import.meta.url);
const helperNames = ['sync-plan.js', 'safe-upload.js', 'portable-names.js'];
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    let file;
    if (pathname.startsWith('/parser/')) {
      const name = pathname.slice('/parser/'.length);
      assert.ok(helperNames.includes(name));
      file = fileURLToPath(new URL(name, libraries));
    } else {
      assert.ok(pathname.startsWith(base));
      file = path.resolve(build, pathname.slice(base.length) || 'index.html');
      assert.ok(file.startsWith(build + path.sep));
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE, headless: true });
const checks = [], errors = [];
const origin = 'http://127.0.0.1:' + server.address().port;
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 740 }, locale: 'de-DE' });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(origin + base);
  await page.locator('.version-context').waitFor();
  assert.match(await page.title(), /3\.39\.4$/);
  await page.evaluate(() => document.querySelector('#app')._vnode.component.proxy.show_workspace('update'));
  const candidateUrl = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip';
  const candidate = page.locator('.firmware-candidate');
  await candidate.locator('summary').click();
  assert.equal(await candidate.locator('a').getAttribute('href'), candidateUrl);
  assert.match(await candidate.innerText(), /Funktionstest am Gerät steht aus/);
  checks.push({ feature:'candidate download offered separately in Update' });
  for (const lang of ['de_DE','en_US']) {
    for (const [names, code, de, en] of [
      [['Link.bin','link.bin'], 'SYNC_COLLISION','denselben Zielpfad','same destination path'],
      [['CON.bin'], 'NAME_PORTABLE','Wähle einen anderen Namen','Choose a different name'],
      [['<b>Test.bin'], 'NAME_PORTABLE','Wähle einen anderen Namen','Choose a different name'],
      [['x'.repeat(80)], 'NAME_LIMIT', 'Erlaubt sind höchstens', 'The limit is'],
      [['e\u0301.bin'], 'NAME_NORMALIZATION','andere Unicode-Schreibweise','different Unicode spelling']
    ]) {
      const observation = await page.evaluate(async ({ names, lang }) => {
        const { createSyncPlan } = await import('/parser/sync-plan.js');
        let reads = 0;
        const read = () => { ++reads; throw Error('unexpected read'); };
        const app = document.querySelector('#app')._vnode.component.proxy;
        app.$i18n.locale = lang;
        try {
          await createSyncPlan({ rootPath:'E:/', deviceKey:'browser-synthetic', files:names.map(name=>({name,size:1,arrayBuffer:read})), readDirectory:read, readFile:read, assertSession(){} });
        } catch (error) {
          app.show_transfer_error(error);
          return { code: error.code, reads };
        }
        throw Error('invalid input accepted');
      }, { names, lang });
      assert.deepEqual(observation, { code, reads:0 });
      const message = page.locator('.el-message').filter({hasText:lang==='de_DE'?de:en}).filter({hasText:names[0]}).last();
      await message.waitFor();
      const text = await message.innerText();
      assert.ok(names.every(name => text.includes(name)));
      assert.equal(await message.locator('b').count(), 0);
      if (code === 'NAME_NORMALIZATION') assert.ok(text.includes('é.bin'));
      const box = await message.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 361, text);
      assert.ok(await message.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      checks.push({ lang, code, text, reads:0 });
    }
  }
  await page.addInitScript(() => {
    const state = window.probe = { requests:0, releases:0, chooserActive:false };
    Object.defineProperty(navigator, 'bluetooth', { configurable:true, value:{ requestDevice(){} } });
    Object.defineProperty(navigator, 'wakeLock', { configurable:true, value:{ request:async () => {
      ++state.requests;
      await new Promise(resolve=>{state.grant = resolve;});
      return { addEventListener(){}, release(){ ++state.releases; } };
    }}});
  });
  await page.goto(origin + base + 'dfu/web.html');
  assert.equal(await page.locator('details a').getAttribute('href'), candidateUrl);
  assert.ok(await page.locator('#button').isDisabled());
  assert.equal(await page.locator('#bundled option').count(), 2);
  assert.match(await page.locator('#bundled option').last().innerText(), /DE3\.63/);
  checks.push({ feature:'separate candidate link, stable built-in app and idle device selector' });
  if (process.env.ALLMIIBO_CANDIDATE_OTA) {
    await page.locator('#file').setInputFiles(process.env.ALLMIIBO_CANDIDATE_OTA);
    await page.waitForFunction(() => document.querySelector('#package-target').textContent.includes('Zähler 637'));
    assert.match(await page.locator('#package-target').innerText(), /Hardwarefeld 52.*0x0126/);
    assert.equal(await page.evaluate(() => probe.requests), 0);
    checks.push({ feature:'production parser accepted explicit App 637 ZIP without device selection' });
  }
  await page.locator('#bundled').selectOption({ index:1 });
  await page.locator('#load-bundled').click();
  await page.waitForFunction(() => !document.querySelector('#button').disabled && document.querySelector('#package-target').textContent.includes('Zähler 635'));
  await page.evaluate(() => {
    const state = window.probe;
    SecureDfu.prototype.requestDevice = function() { state.chooserActive = navigator.userActivation.isActive; return {}; };
    SecureDfu.prototype.update = async function() {
      this.dispatchEvent('phase','transfer');
      await new Promise(resolve=>{state.finish = resolve;});
      this.dispatchEvent('phase','verify');
      this.dispatchEvent('phase','finalize');
      this.lastResult = { transferVerified:true,executeAcknowledged:true,localDisconnectRequested:true };
    };
  });
  await page.locator('#button').click();
  await page.waitForFunction(()=>probe.requests===1 && typeof probe.grant==='function');
  assert.ok(await page.evaluate(()=>probe.chooserActive));
  await page.evaluate(()=>probe.finish());
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Übertragung bestätigt'));
  await page.evaluate(()=>probe.grant());
  await page.waitForFunction(()=>probe.releases===1);
  assert.ok(await page.locator('#awake-panel').isHidden());
  checks.push({ dfu:'real selection click, current activation, transfer confirmation, release of late wake lock', scope:'simulated radio and wake provider' });
  assert.deepEqual(errors,[]);
  await writeFile(report,JSON.stringify({ base, chrome:browser.version(), checks, errors },null,2));
  console.log(checks.length,'browser checks passed');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
