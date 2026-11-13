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
const webVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const helperNames = ['sync-plan.js', 'safe-upload.js', 'portable-names.js', 'backup.js', 'raw-metadata.js', 'zip-crc32.js'];
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    let file;
    if (pathname === '/fixtures/memory-vfs.mjs') {
      file = fileURLToPath(new URL('../tests/helpers/memory-vfs.mjs', import.meta.url));
    } else if (pathname.startsWith('/parser/')) {
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
  const clearMessages = async () => {
    await page.evaluate(() => document.querySelector('#app')._vnode.component.proxy.$message.closeAll());
    await page.waitForFunction(() => !document.querySelector('.el-message'));
  };
  await page.locator('.version-context').waitFor();
  assert.equal(await page.title(), 'Allmiibo Dateimanager ' + webVersion);
  await page.evaluate(() => document.querySelector('#app')._vnode.component.proxy.show_workspace('update'));
  const finalFile = 'Allmiibo_LCD_DE3_65_637_NUR_APP.zip';
  const previewFile = 'Allmiibo_LCD_DE3_73_App646_TEST_DFU.zip';
  const earlierFile = 'Allmiibo_LCD_DE3_72_645_NUR_APP.zip';
  const update = page.locator('.firmware-packages');
  for (const [file, version, counter] of [[finalFile, 'DE3.65', 637], [previewFile, 'DE3.73', 646], [earlierFile, 'DE3.72', 645]]) {
    const row = update.locator('.package').filter({ has: page.locator('strong', { hasText: version }) });
    assert.equal(await row.locator('a[download]').getAttribute('href'), base + 'firmware/' + file);
    assert.ok((await row.innerText()).includes('Zähler ' + counter));
    if (counter !== 637) assert.match(await row.innerText(), /Testversion/);
    checks.push({ feature:'listed application available from Update', version, counter });
  }
  for (const lang of ['de_DE','en']) {
    await page.evaluate(lang => {
      const app = document.querySelector('#app')._vnode.component.proxy;
      app.$i18n.locale = lang;
      app.show_workspace('backup');
    }, lang);
    const hint = page.locator('.workspace-description:visible');
    const lifetime = lang === 'de_DE'
      ? ['Mit der Option zur gespeicherten Fortsetzung', 'nach dem Schließen oder Neuladen', 'Ohne die Option geht der Zwischenstand verloren']
      : ['If you enable saved backups', 'resume after closing or reloading', 'Otherwise the checkpoint is lost'];
    await hint.filter({hasText:lifetime[0]}).waitFor();
    const visibleHint = await hint.innerText();
    for (const phrase of lifetime) assert.ok(visibleHint.includes(phrase), phrase);
    checks.push({lang,feature:'persistent and tab-only backup lifetimes visible before a backup'});
    const observed = await page.evaluate(async () => {
      const {createBackup, createBackupCheckpoint} = await import('/parser/backup.js');
      const {memoryVfs} = await import('/fixtures/memory-vfs.mjs');
      const vfs = memoryVfs(), deviceKey = 'synthetic-browser-device';
      vfs.put('E:/a.bin', [1,2]); vfs.put('E:/b.bin', [3]);
      const options = {...vfs.api, rootPath:'E:/', firmwareVersion:'2.21.0-DE3.8', deviceKey};
      options.checkpointState = createBackupCheckpoint(options);
      const abort = new AbortController();
      try { await createBackup({...options, signal:abort.signal, onProgress: p => { if (p.filesDone === 1) abort.abort(); }}); }
      catch (error) { if (error.name !== 'AbortError') throw error; }
      const retained = options.checkpointState.summary().files;
      vfs.disconnect(); vfs.reconnect(); vfs.put('E:/a.bin', [9,9]); vfs.log.length = 0;
      const resumed = await createBackup(options);
      const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.of(9,9))), n=>n.toString(16).padStart(2,'0')).join('');
      return {retained, changed:resumed.manifest.entries[0].sha256 === expected, reused:resumed.manifest.resume.reusedFiles,
        reads:vfs.log.filter(op=>op.op==='read').length, writes:vfs.log.filter(op=>['write','rename','remove','meta','mkdir'].includes(op.op)).length};
    });
    assert.deepEqual(observed, {retained:1,changed:true,reused:0,reads:2,writes:0});
    checks.push({lang,feature:'legacy backup resumes after reconnect with current bytes, including a same-size change',...observed});
    const before = await page.locator('.el-message').count();
    await page.evaluate(() => {
      const app = document.querySelector('#app')._vnode.component.proxy;
      app.show_transfer_error('cancel'); app.show_transfer_error('close');
    });
    assert.ok(await page.locator('.el-message').count() <= before);
    await page.evaluate(() => document.querySelector('#app')._vnode.component.proxy.show_transfer_error({code:'toString',message:'Unbekannt <em>Ω</em>'}));
    const fallback = page.locator('.el-message').filter({hasText:'Unbekannt <em>Ω</em>'}).last();
    await fallback.waitFor();
    assert.equal(await fallback.locator('em').count(),0);
    checks.push({lang,feature:'unknown code retained as literal text and dismissals silent'});
    for (const changed of ['target', 'local']) {
      await clearMessages();
      const observation = await page.evaluate(async ({changed,lang}) => {
        const {createSyncPlan,createSyncJob,executeSyncJob} = await import('/parser/sync-plan.js');
        const {localFile,memoryVfs} = await import('/fixtures/memory-vfs.mjs');
        const vfs = memoryVfs(), name = 'ä'.repeat(20) + '.bin', path = 'E:/' + name;
        vfs.put(path, [5,6]); vfs.put('E:/Untouched.bin', [1,2,3]);
        const options = {...vfs.api,rootPath:'E:/',deviceKey:'browser-test',files:[localFile(name,[7,8])]};
        const plan = await createSyncPlan(options);
        if (plan.summary.change !== 1) throw Error('expected one replaceable file');
        if (changed === 'target') vfs.put(path, [5,9]);
        else options.files = [localFile(name,[7,9])];
        const before = JSON.stringify([...vfs.nodes]);
        const app = document.querySelector('#app')._vnode.component.proxy;
        app.$i18n.locale = lang;
        try {
          await executeSyncJob({...options,plan,job:createSyncJob(plan),uploadFile(){throw Error('unexpected upload')}});
        } catch (error) {
          app.show_transfer_error(error);
          return {code:error.code, intact:before===JSON.stringify([...vfs.nodes]),
            mutations:vfs.log.filter(op=>['write','rename','remove','meta','mkdir'].includes(op.op)).length};
        }
        throw Error('modified source or destination accepted');
      }, {changed,lang});
      const code = changed === 'target' ? 'SYNC_STALE' : 'SYNC_LOCAL_CHANGED';
      assert.deepEqual(observation, {code,intact:true,mutations:0});
      const fragment = lang === 'de_DE' ? (changed==='target'?'erneut vergleichen':'erneut auswählen')
        : (changed==='target'?'Compare again':'Select the files again');
      const message = page.locator('.el-message').filter({hasText:fragment}).last();
      await message.waitFor();
      assert.ok(await message.evaluate(el=>el.scrollWidth <= el.clientWidth + 1));
      const screenshot = path.parse(report).name + '-' + lang + '-' + code + '.png';
      await message.screenshot({path:path.join(path.dirname(report),screenshot),animations:'disabled'});
      const contrast = await message.evaluate(el => {
        const luminance = rgb => {
          const values = rgb.match(/\d+/g).map(value => Number(value) / 255)
            .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
          return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
        };
        const background = luminance(getComputedStyle(el).backgroundColor);
        const foreground = luminance(getComputedStyle(el.querySelector('.el-message__content')).color);
        return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05);
      });
      assert.ok(contrast >= 4.5);
      const box = await message.boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 361 && box.y + box.height <= 741, JSON.stringify(box));
      checks.push({ lang, code, text:await message.innerText(), screenshot, contrast, ...observation });
    }
    for (const [names, code, de, en] of [
      [['Link.bin','link.bin'], 'SYNC_COLLISION','denselben Zielpfad','same destination path'],
      [['CON.bin'], 'NAME_PORTABLE','Wähle einen anderen Namen','Choose a different name'],
      [['<b>Test.bin'], 'NAME_PORTABLE','Wähle einen anderen Namen','Choose a different name'],
      [['x'.repeat(80)], 'NAME_LIMIT', 'Erlaubt sind höchstens', 'The limit is'],
      [['e\u0301.bin'], 'NAME_NORMALIZATION','andere Unicode-Schreibweise','different Unicode spelling']
    ]) {
      await clearMessages();
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
  for (const [lang, onlyDevice, different] of [['de_DE','Nur auf dem Gerät','Inhalt verschieden'], ['en','Device only','Different contents']]) {
    await page.evaluate(async lang => {
      const { createSyncPlan } = await import('/parser/sync-plan.js');
      const { memoryVfs, localFile, metadata } = await import('/fixtures/memory-vfs.mjs');
      const vfs = memoryVfs();
      vfs.nodes.set('E:/tags/series', {type:1, meta:metadata()});
      vfs.put('E:/tags/series/remote.bin', [1]);
      vfs.put('E:/tags/shared.bin', [2]);
      const app = document.querySelector('#app')._vnode.component.proxy;
      app.$i18n.locale = lang;
      app.syncRoot = 'E:/tags'; app.syncFilter = 'all'; app.syncPage = 1;
      app.syncPlan = await createSyncPlan({...vfs.api, rootPath:app.syncRoot, deviceKey:'synthetic', files:[localFile('shared.bin',[3])]});
      app.syncDialog = true;
    }, lang);
    const filters = page.locator('.sync-filter:visible');
    await filters.getByRole('button', {name:onlyDevice + ' (1)', exact:true}).click();
    const rows = page.locator('.sync-plan:visible .sync-entry');
    assert.equal(await rows.count(), 1);
    assert.match(await rows.innerText(), /series\/remote\.bin/);
    assert.equal(await rows.locator('input[type="checkbox"]').count(), 0);
    assert.ok(await rows.getByRole('button', {name:lang === 'de_DE' ? 'Geräteversion speichern' : 'Save device copy'}).count());
    await filters.getByRole('button', {name:different + ' (1)', exact:true}).click();
    assert.match(await rows.innerText(), /shared\.bin/);
    assert.equal(await rows.locator('input[type="checkbox"]').count(), 1);
    await page.evaluate(() => document.querySelector('#app')._vnode.component.proxy.invalidate_sync());
    checks.push({lang, feature:'mobile folder comparison lists nested device-only and different-content paths, filters and separate save action'});
    await page.evaluate(() => {
      const app = document.querySelector('#app')._vnode.component.proxy;
      app.connected = true; app.deviceNickname = 'Family 🦊'; app.nicknameDraft = app.deviceNickname;
      app.nicknameReady = true; app.show_workspace('device');
    });
    await page.locator('.device-nickname-form:visible').waitFor();
    assert.equal(await page.locator('#device-nickname').inputValue(), 'Family 🦊');
    assert.ok((await page.locator('.quick-status .connection-pill').innerText()).includes('Family 🦊'));
    assert.equal(await page.locator('.device-card .device-name').textContent(), 'Family 🦊');
    await page.evaluate(() => document.querySelector('#app')._vnode.component.proxy.show_workspace('update'));
    const updateName = page.locator('.device-nickname-context:visible');
    assert.ok((await updateName.innerText()).includes(lang === 'de_DE' ? 'Verbundenes Gerät: Family 🦊' : 'Connected device: Family 🦊'));
    await page.evaluate(() => {
      const app = document.querySelector('#app')._vnode.component.proxy;
      app.connected = false; app.clear_device_nickname();
    });
    assert.equal(await page.locator('.device-nickname-context').count(), 0);
    assert.equal(await page.locator('.connected-nickname').count(), 0);
    checks.push({lang, feature:'locally named device visible in mobile status, sidebar, diagnostic editor and before DFU, cleared on disconnect'});
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
  for (const file of [finalFile, previewFile]) {
    assert.equal(await page.locator('a[download][href$="' + file + '"]').getAttribute('href'), '../firmware/' + file);
  }
  assert.ok(await page.locator('#button').isDisabled());
  assert.equal(await page.locator('#bundled option').count(), 4);
  assert.match(await page.locator('#bundled option[value="de3.65-lcd-app"]').innerText(), /DE3\.65/);
  assert.match(await page.locator('#bundled option[value="de3.72-lcd-app"]').innerText(), /DE3\.72.*Testversion/);
  assert.match(await page.locator('#bundled option[value="de3.73-lcd-app"]').innerText(), /DE3\.73.*Testversion/);
  checks.push({ feature:'stable and preview releases in local DFU chooser and idle device selector' });
  if (process.env.ALLMIIBO_CANDIDATE_OTA) {
    await page.locator('#file').setInputFiles(process.env.ALLMIIBO_CANDIDATE_OTA);
    const counter = path.basename(process.env.ALLMIIBO_CANDIDATE_OTA) === previewFile ? 646 : path.basename(process.env.ALLMIIBO_CANDIDATE_OTA) === earlierFile ? 645 : 637;
    await page.waitForFunction(counter => document.querySelector('#package-target').textContent.includes('Zähler ' + counter), counter);
    assert.match(await page.locator('#package-target').innerText(), /Hardwarefeld 52.*0x0126/);
    assert.equal(await page.evaluate(() => probe.requests), 0);
    checks.push({ feature:'production parser accepted explicit ZIP without device selection', counter });
  }
  for (const [id, counter] of [['de3.65-lcd-app', 637], ['de3.72-lcd-app', 645], ['de3.73-lcd-app', 646]]) {
    await page.locator('#bundled').selectOption(id);
    await page.locator('#load-bundled').click();
    await page.waitForFunction(counter => !document.querySelector('#button').disabled && document.querySelector('#package-target').textContent.includes('Zähler ' + counter), counter);
    checks.push({ feature:'production parser loaded bundled ZIP and reached device selection', counter });
  }
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
