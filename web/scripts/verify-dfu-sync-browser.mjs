// Verify the production UI with synthetic names, wake locks and DFU radio boundaries.
import assert from 'node:assert/strict';
import { checkSyncHistoryBrowser } from './check-sync-history-browser.mjs';
import { parseStartupDiagnostics } from '../src/lib/startup-diagnostics.js';
import {parseBuildDiagnostics} from '../src/lib/lcd-build-diagnostics.js';
import {diagnosticSnapshot} from '../tests/fixtures/diagnostic-overview-data.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [dist, base, report] = process.argv.slice(2);
assert.ok(dist && report && ['/', '/pixl.js/'].includes(base));
const build = path.resolve(dist);
const libraries = new URL('../src/lib/', import.meta.url);
const webVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const firmwareCache = JSON.parse(await readFile(new URL('../tests/fixtures/PXST_v4_App657.json', import.meta.url), 'utf8'));
const helperNames = ['sync-plan.js', 'sync-history.js', 'unique-json.js', 'safe-upload.js', 'portable-names.js', 'backup.js', 'raw-metadata.js', 'zip-crc32.js'];
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
async function runChecks() {
  checks.push(await checkSyncHistoryBrowser(browser, origin + base));
  if (process.argv.includes('--history-only')) {
    await writeFile(report, JSON.stringify({base,chrome:browser.version(),checks},null,2));
    console.log('Folder comparison browser check passed');
    return;
  }
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
  await page.locator('.board-buttons').getByRole('button', { name:'LCD', exact:true }).click();
  const releases = [
    ['Allmiibo_LCD_DE3_65_637_NUR_APP.zip', 'DE3.65', 637],
    ['Allmiibo_LCD_DE3_72_645_NUR_APP.zip', 'DE3.72', 645],
    ['Allmiibo_LCD_DE3_73_App646_TEST_DFU.zip', 'DE3.73', 646],
    ['Allmiibo_LCD_DE3_74_647_NUR_APP.zip', 'DE3.74', 647],
    ['Allmiibo_LCD_DE3_75_648_NUR_APP.zip', 'DE3.75', 648],
    ['Allmiibo_LCD_DE3_76_649_NUR_APP.zip', 'DE3.76', 649],
    ['Allmiibo_LCD_DE3_77_650_NUR_APP.zip', 'DE3.77', 650],
    ['Allmiibo_LCD_DE3_81_654_NUR_APP.zip', 'DE3.81', 654],
    ['Allmiibo_LCD_DE3_84_657_NUR_APP.zip', 'DE3.84', 657, 'de3.84-lcd-test1-app'],
    ['Allmiibo_LCD_DE3_80_653_NUR_APP.zip', 'DE3.80', 653],
    ['Allmiibo_LCD_DE3_79_652_NUR_APP.zip', 'DE3.79', 652],
  ];
  const update = page.locator('.firmware-packages');
  for (const [file, version, counter] of releases) {
    const row = update.locator('.package').filter({ has: page.locator('strong', { hasText: version }) });
    assert.equal(await row.locator('a[download]').getAttribute('href'), base + 'firmware/' + file);
    assert.ok((await row.innerText()).includes('Zähler ' + counter));
    assert.match(await row.innerText(), counter === 654 ? /Stabile Ausgabe · Z19\/Z20\/Z21/ : [637,647,648].includes(counter) ? /Frühere stabile Ausgabe/ : /Testversion/);
    checks.push({ feature:'listed application available from Update', version, counter });
  }
  const comboAsset = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip';
  for (const [locale, guide, title] of [
    ['de-DE','index.html','Android-Komplettpaket mit Z21 und Anleitung'],
    ['en-GB','en.html','Full Android package with Z21 and instructions'],
  ]) {
    const guideContext = await browser.newContext({locale, viewport:{width:390,height:840}});
    try {
      const guidePage = await guideContext.newPage();
      await guidePage.goto(origin + base);
      await guidePage.locator('.version-context').waitFor();
      const home = guidePage.locator('.lcd-downloads');
      await home.waitFor();
      const appAsset = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip';
      for (const width of [390, 1280]) {
        await guidePage.setViewportSize({width, height:840});
        assert.ok(await home.getByRole('link', {name:/App654/}).isVisible());
        assert.equal(await home.getByRole('link', {name:/App654/}).getAttribute('href'), appAsset);
        assert.equal(await home.getByRole('link', {name:/App657/}).getAttribute('href'), 'https://github.com/bluecyber81/pixl.js/releases/download/de3.84-lcd-test1/Allmiibo_LCD_DE3_84_657_NUR_APP.zip');
        assert.ok(await home.getByRole('link', {name:/Android/}).isVisible());
        assert.equal(await home.getByRole('link', {name:/Android/}).getAttribute('href'), comboAsset);
        assert.ok(await home.evaluate(el => el.scrollWidth <= el.clientWidth));
      }
      await guidePage.setViewportSize({width:390, height:840});
      checks.push({locale, feature:'Disconnected home offers both distinct LCD phone downloads at 390 and 1280 px'});
      await guidePage.evaluate(() => document.querySelector('#app')._vnode.component.proxy.show_workspace('update'));
      const picker = guidePage.locator('.firmware-board-choice');
      const lcd = picker.getByRole('button', {name:'LCD',exact:true});
      const oled = picker.getByRole('button', {name:'OLED',exact:true});
      await picker.waitFor();
      assert.equal(await picker.locator('.dfu-page-link, .oled-trial, .firmware-packages').count(), 0);
      await oled.click();
      const trial = picker.locator('.oled-trial');
      const oledZip = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_APP.zip';
      assert.equal(await trial.locator('a[href$=".zip"]').getAttribute('href'), oledZip);
      assert.equal(await trial.locator('a[href*="guide/"]').getAttribute('href'), base + 'guide/' + guide + '#oled');
      assert.equal(await picker.locator('.dfu-page-link').getAttribute('href'), base + 'dfu/web.html?package=de3.87-oled-t6-app#board=OLED');
      assert.equal(await picker.locator('.firmware-packages').count(), 0);
      await guidePage.evaluate(() => { Object.assign(document.querySelector('#app')._vnode.component.proxy, {
        connected:true, firmwareVersion:'2.27.11', bootInfo:null
      }); });
      await trial.waitFor({state:'detached'});
      await guidePage.evaluate(() => { document.querySelector('#app')._vnode.component.proxy.firmwareVersion = '2.22.0-DE3.81-OLEDt1'; });
      await trial.waitFor();
      assert.ok(await lcd.isDisabled());
      assert.equal(await guidePage.locator('.lcd-downloads a:visible').count(), 0);
      await guidePage.evaluate(() => { document.querySelector('#app')._vnode.component.proxy.bootInfo = { softDeviceValid:true, softDeviceVariant:112, softDeviceVersion:7003000, softDeviceFwid:0x0126 }; });
      await trial.locator('[role=status]').waitFor();
      assert.equal(await trial.locator('[href$=".zip"]').count(), 0);
      for (const version of ['2.22.0-DE3.81-OLEDt2','2.22.0-DE3.81-OLEDt3','2.22.0-DE3.84-OLEDt4']) {
        await guidePage.evaluate(version => Object.assign(document.querySelector('#app')._vnode.component.proxy, {firmwareVersion:version, bootInfo:null}) && true, version);
        assert.equal(await trial.locator('a[href$=".zip"]').getAttribute('href'), oledZip);
        assert.ok(await lcd.isDisabled());
      }
      await guidePage.evaluate(() => { document.querySelector('#app')._vnode.component.proxy.bootInfo = {settingsCrcValid:true, applicationCounter:85}; });
      await trial.locator('[role=status]').waitFor();
      assert.equal(await trial.locator('[href$=".zip"]').count(), 0);
      for (const version of ['2.23.0-DE3.91-OLEDt10']) {
        await guidePage.evaluate(version => Object.assign(document.querySelector('#app')._vnode.component.proxy, {firmwareVersion:version, bootInfo:null}) && true, version);
        await trial.locator('[role=status]').waitFor();
        assert.ok(await lcd.isDisabled());
        assert.equal(await picker.locator('[href$=".zip"], .dfu-page-link, .firmware-packages').count(), 0);
      }
      await guidePage.evaluate(() => {
        const app = document.querySelector('#app')._vnode.component.proxy;
        app.show_workspace('device');
        app.firmwareVersion = '2.22.0-DE3.81-OLEDt3';
      });
      for (const [voltageValid,lipoMode,chargingActive,label] of [
        [true,false,false,'info.unknown'], [false,true,false,'info.unknown'],
        [true,true,false,'workflow.powerInactive'], [true,true,true,'workflow.powerActive']
      ]) {
        const charging = await guidePage.evaluate(async ({voltageValid,lipoMode,chargingActive,label}) => {
          const app = document.querySelector('#app')._vnode.component.proxy;
          app.powerState = 'available';
          app.powerInfo = {sampleCollected:true,batteryMillivolts:voltageValid ? 3790 : null,voltageValid,lipoMode,chargingActive};
          await app.$nextTick();
          const row = [...document.querySelectorAll('.power-diagnostics dt')].find(el => el.textContent === app.$t('workflow.powerCharging'));
          return [row?.nextElementSibling?.textContent,app.$t(label)];
        }, {voltageValid,lipoMode,chargingActive,label});
        assert.equal(charging[0],charging[1]);
      }
      checks.push({locale,feature:'OLED charging display distinguishes unsupported mode, missing voltage, active and inactive'});
      const captured = firmwareCache.cases.find(row => row.label === 'mounted-with-room');
      const capturedStartup = parseStartupDiagnostics(Uint8Array.from(Buffer.from(captured.payloadHex, 'hex')));
      await guidePage.evaluate(({version, startup}) => {
        const app = document.querySelector('#app')._vnode.component.proxy;
        app.read_startup_diagnostics = async () => startup;
        app.firmwareVersion = version;
      }, {version:firmwareCache.firmware, startup:capturedStartup});
      const startupPanel = guidePage.locator('.startup-diagnostics');
      await startupPanel.locator('.actions button').first().click();
      const mountProfile = startupPanel.locator('.mount-profile');
      await mountProfile.waitFor();
      const mountReadings = await mountProfile.innerText();
      for (const value of ['3 / 8','256 B','79 ms']) assert.ok(mountReadings.includes(value), value);
      assert.match(mountReadings,/50\s*%/);
      checks.push({locale,feature:'LCD App657 displays linked ARM cache readings and eligible hit rate'});
      const capture=JSON.parse(await readFile(new URL('../tests/fixtures/PXBI_App657.json',import.meta.url),'utf8'));
      const sdk=capture.states.find(r=>r.scenario==='sdk');
      const build=parseBuildDiagnostics(Buffer.from(sdk.payloadHex,'hex'));
      const snapshot=structuredClone(diagnosticSnapshot());
      snapshot.sections.boot.data.applicationCounter=657;
      snapshot.sections.build={state:'available',observedAt:snapshot.completedAt,data:build,errorCode:null};
      await guidePage.evaluate(data=>{
        const app=document.querySelector('#app')._vnode.component.proxy;
        app.firmwareVersion='2.22.0-DE3.84';app.fullDiagnosticSnapshot=data;
      },snapshot);
      const card=guidePage.locator('article[data-section="build"]');
      await card.waitFor();
      await card.locator('details > summary').click();
      const display=await card.innerText();
      for (const value of ['Nordic SDK',capture.sourceId,'12345678','23457']) assert.ok(display.includes(value),value);
      assert.match(display,/Passend|Match/);
      await guidePage.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
        configurable:true, value:{writeText: async value => { window.copiedSourceId = value; }}
      }));
      await card.getByRole('button', {name:/SourceID/}).click();
      assert.equal(await guidePage.evaluate(() => window.copiedSourceId), capture.sourceId);
      await guidePage.locator('.build-reference > summary').click();
      assert.match(await guidePage.locator('.build-reference').innerText(), /17\.11\.2026|17 November 2026/);
      checks.push({locale,feature:'copy the running firmware SourceID and display the dated LCD owner report'});
      checks.push({locale,feature:'App657 displays compiled SourceID, matching package profile and retained fault from real Cortex fixture'});

      const oledCapture=JSON.parse(await readFile(new URL('../tests/fixtures/PXBI_OLED_App84.json',import.meta.url),'utf8'));
      const oledBuild=parseBuildDiagnostics(Buffer.from(oledCapture.states.find(r=>r.scenario==='sdk').payloadHex,'hex'),'OLED');
      snapshot.sections.boot.data.applicationCounter=84;
      snapshot.sections.build.data=oledBuild;
      await guidePage.evaluate(data=>{
        const app=document.querySelector('#app')._vnode.component.proxy;
        app.firmwareVersion='2.22.0-DE3.84-OLEDt4';app.fullDiagnosticSnapshot=data;
      },snapshot);
      const oledDisplay=await card.innerText();
      for (const value of ['OLED','Nordic SDK',oledCapture.sourceId]) assert.ok(oledDisplay.includes(value),value);
      assert.match(oledDisplay,/Passend|Match/);
      assert.match(await guidePage.locator('.build-reference').innerText(),/Hardwareprüfung.*aus|Hardware acceptance.*pending/);
      assert.doesNotMatch(await guidePage.locator('.build-reference').innerText(),/17 November 2026|17\.11\.2026/);
      await card.getByRole('button',{name:/SourceID/}).click();
      assert.equal(await guidePage.evaluate(()=>window.copiedSourceId),oledCapture.sourceId);
      checks.push({locale,feature:'OLED App84 displays and copies firmware declaration and fault from linked Cortex fixture with matching package reference'});

      await guidePage.evaluate(() => document.querySelector('#app')._vnode.component.proxy.show_workspace('update'));
      await guidePage.evaluate(() => { Object.assign(document.querySelector('#app')._vnode.component.proxy, {
        firmwareVersion:'2.22.0-DE3.81', bootInfo:null
      }); });
      await trial.waitFor({state:'detached'});
      assert.ok(await oled.isDisabled());
      checks.push({locale,feature:'manual, unknown, OLED and LCD firmware choices; phone links, board changes and incompatible readback'});
      const applicationRow = guidePage.locator('.firmware-packages .package').filter({hasText:'2.22.0-DE3.81'});
      const guideLink = applicationRow.getByRole('link',{name:title});
      assert.equal(await guideLink.getAttribute('href'), base + 'guide/' + guide + '#android-de381');
      await guideLink.click();
      await guidePage.waitForURL(origin + base + 'guide/' + guide + '#android-de381');
      const heading = guidePage.locator('#android-de381');
      await heading.waitFor();
      assert.match(await heading.innerText(), /DE3\.81.*Z21/);
      const section = guidePage.locator('#bootloader');
      const systemLink = section.locator('a[href="' + comboAsset + '"]');
      assert.ok(await systemLink.isVisible());
      const requirements = await systemLink.locator('..').innerText();
      for (const value of ['Z21','Nordic Secure DFU','0x77000','0x7E000','0x7F000','0x0103','0x0126','Z15','Z17','App654']) {
        assert.ok(requirements.includes(value), value);
      }
      assert.match(requirements, /unter 21|below 21/);
      assert.equal(await guidePage.locator('#android-de380').count(), 1);
      const appLink = section.locator('a[download][href$="Allmiibo_LCD_DE3_81_654_NUR_APP.zip"]');
      assert.match(await appLink.locator('..').innerText(), /Z19.*Z20.*Z21.*654/s);
      assert.equal(await appLink.evaluate(a => new URL(a.href).pathname), base + 'firmware/Allmiibo_LCD_DE3_81_654_NUR_APP.zip');
      checks.push({locale,feature:'Android Z21 combo guide and DE3.81 application-only choice', guide, externalAssetUrl:comboAsset});
    } finally {
      await guideContext.close();
    }
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
  for (const [file] of releases.filter(([, , counter]) => [637, 648, 654].includes(counter))) {
    assert.equal(await page.locator('a[download][href$="' + file + '"]').getAttribute('href'), '../firmware/' + file);
  }
  assert.ok(await page.locator('#button').isDisabled());
  assert.deepEqual(await page.locator('#bundled option').evaluateAll(options => options.map(option => option.value).sort()),
    ['', ...releases.map(([, version, , id]) => id || version.toLowerCase() + '-lcd-app')].sort());
  assert.match(await page.locator('#bundled option[value="de3.74-lcd-app"]').innerText(), /DE3\.74.*Fr\u00fchere stabile Ausgabe/);
  assert.match(await page.locator('#bundled option[value="de3.65-lcd-app"]').innerText(), /DE3\.65.*Frühere stabile Ausgabe/);
  assert.match(await page.locator('#bundled option[value="de3.72-lcd-app"]').innerText(), /DE3\.72.*Testversion/);
  assert.match(await page.locator('#bundled option[value="de3.81-lcd-app"]').innerText(), /DE3\.81.*Stabile Ausgabe.*Z19\/Z20\/Z21/);
  assert.match(await page.locator('#bundled option[value="de3.73-lcd-app"]').innerText(), /DE3\.73.*Testversion/);
  for (const id of ['de3.76-lcd-app', 'de3.77-lcd-app', 'de3.79-lcd-app', 'de3.80-lcd-app']) {
    assert.match(await page.locator('#bundled option[value="' + id + '"]').innerText(), /Testversion.*Z19/);
  }
  checks.push({ feature:'stable and preview releases in local DFU chooser and idle device selector' });
  if (process.env.ALLMIIBO_CANDIDATE_OTA) {
    await page.locator('#file').setInputFiles(process.env.ALLMIIBO_CANDIDATE_OTA);
    const selected = releases.find(([file]) => file === path.basename(process.env.ALLMIIBO_CANDIDATE_OTA));
    assert.ok(selected, 'selected ZIP must have an explicitly tested package counter');
    const [, , counter] = selected;
    await page.waitForFunction(counter => document.querySelector('#package-target').textContent.includes('Zähler ' + counter), counter);
    assert.match(await page.locator('#package-target').innerText(), /Hardwarefeld 52.*0x0126/);
    assert.equal(await page.evaluate(() => probe.requests), 0);
    checks.push({ feature:'production parser accepted explicit ZIP without device selection', counter });
  }
  for (const [, version, counter, packageId] of releases) {
    const id = packageId || version.toLowerCase() + '-lcd-app';
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
}
try { await runChecks(); } finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
