// Exercise the real diagnosis UI with synthetic, already-read device values.
// Run against the newly built root bundle. A successful result is a browser UI
// check, never a physical Allmiibo, Bluetooth, NFC or display measurement.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {diagnosticSnapshot} from '../tests/fixtures/diagnostic-overview-data.mjs';

const [dist, evidence] = process.argv.slice(2);
assert.ok(dist && evidence, 'Supply the production root build and an output directory.');
await fs.mkdir(evidence, {recursive:true});
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await preview({base:'/', build:{outDir:path.resolve(dist)}, preview:{host:'127.0.0.1',port:0,open:false}, logLevel:'error'});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const draftKey = 'allmiibo.guided-device-check.draft.v2';
const results = [];
let browser;
try {
  browser = await chromium.launch({headless:true, chromiumSandbox:true, executablePath:process.env.CHROME_EXECUTABLE});
  for (const [locale, width] of [['de-DE',1280], ['en-GB',320]]) {
    const de = locale === 'de-DE', pick = (german, english) => de ? german : english;
    const context = await browser.newContext({locale, viewport:{width,height:850}, serviceWorkers:'block'});
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
      const panel = page.locator('.guided-check');
      const button = (german, english) => panel.getByRole('button', {name:pick(german,english),exact:true});
      // Labels include option text in some accessibility engines, so match their
      // stable leading label rather than relying on a select's position.
      const field = (german, english) => panel.getByRole('combobox', {name:new RegExp('^' + pick(german,english))});
      const app = () => field('Geöffnete App', 'App under test');
      const language = () => field('Gerätesprache', 'Device language');
      const resume = () => field('„App fortsetzen“ am Gerät', '“Resume app” on the device');
      const animation = () => field('Animation am Gerät', 'Animation on the device');
      const back = () => field('Zurück zur Liste', 'Back to list');
      const wake = () => field('Schlafen und aufwachen', 'Sleep and wake');
      const takeBefore = button('Vorher-Aufnahme übernehmen', 'Attach before snapshot');
      const takeAfter = button('Nachher-Aufnahme übernehmen', 'Attach after snapshot');
      // The same export action is deliberately available above and below the form.
      const exportButton = button('Prüfbericht als JSON', 'Export check report as JSON').first();
      const openPanel = async () => {
        await page.locator('.workspace-nav [aria-controls="device-overview"]').click();
        const details = page.locator('.guided-check-panel:not(.guided-comparison)');
        if (!await details.evaluate(element => element.open)) await details.locator(':scope > summary').click();
        await panel.waitFor();
      };
      const closePreview = () => page.getByRole('dialog').getByRole('button', {name:pick('Schließen','Close'),exact:true}).last().click();
      const exportPreview = async () => {
        await exportButton.click();
        const body = await page.locator('#diagnostic-json').inputValue();
        return {body, report:JSON.parse(body)};
      };
      const importBody = body => panel.locator('input[type="file"]').setInputFiles({
        name:'Allmiibo-device-check.json', mimeType:'application/json', buffer:Buffer.from(body),
      });
      await page.goto(origin);
      await openPanel();
      assert.equal(await takeBefore.isDisabled(), true);
      assert.equal(await exportButton.isDisabled(), true);

      const fixture = structuredClone(diagnosticSnapshot());
      fixture.sections.boot.data.applicationCounter = 648;
      const setSnapshot = snapshot => page.evaluate(data => {
        const app = document.querySelector('#app')._vnode.component.proxy;
        Object.assign(app, {connected:!!data, firmwareVersion:data ? '2.22.0-DE3.75' : null, fullDiagnosticSnapshot:data});
      }, snapshot);
      await setSnapshot(fixture);
      await takeBefore.click();
      await setSnapshot(null);
      await app().selectOption('file-emulator');
      await language().selectOption('de');
      await resume().selectOption('on');
      await animation().selectOption('on');
      await back().selectOption('source-list-same-figure');
      const note = '<img src=x onerror="window.guidedUnexpected=true"> & manual note';
      await panel.getByRole('textbox', {name:pick('Notiz (optional)','Note (optional)'),exact:true}).fill(note);
      await app().selectOption('amiibo-database');
      await language().selectOption('en');
      await resume().selectOption('off');
      await animation().selectOption('off');
      await wake().selectOption('no-response');
      assert.equal(await panel.getByRole('progressbar').evaluate(element => element.value), 2);
      assert.equal(await panel.getByRole('progressbar').evaluate(element => element.max), 32);
      assert.equal(await panel.locator('.history img').count(), 0);
      assert.equal(await page.evaluate(() => window.guidedUnexpected), undefined);
      assert.ok((await panel.locator('.history').textContent()).includes(note));

      // Visiting another workspace must not discard the current draft.
      await page.locator('.workspace-nav [aria-controls="file-workspace"]').click();
      await openPanel();
      assert.equal(await app().inputValue(), 'amiibo-database');
      assert.equal(await wake().inputValue(), 'no-response');
      assert.equal(await panel.getByRole('progressbar').evaluate(element => element.value), 2);

      // A reconnect alone cannot turn the first read into an after measurement.
      await setSnapshot(fixture);
      assert.equal(await takeAfter.isDisabled(), true);
      const after = structuredClone(fixture);
      after.startedAt = after.completedAt = new Date().toISOString();
      for (const section of Object.values(after.sections)) section.observedAt = after.completedAt;
      await setSnapshot(after);
      await takeAfter.click();
      await setSnapshot(null);
      const prefix = panel.getByRole('textbox', {name:new RegExp('^' + pick('Source-ID vom Display','Source ID from the display'))});
      await prefix.fill('9bc7');
      assert.equal(await exportButton.isDisabled(), true);
      await prefix.fill('000000000000');
      assert.match(await panel.locator('#source-prefix-result').innerText(), de ? /weichen/ : /differ/);
      await prefix.fill('9BC7578A46F2');
      assert.match(await panel.locator('#source-prefix-result').innerText(), de ? /passen/ : /match/);
      assert.ok(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1 &&
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      const first = await exportPreview(), report = first.report;
      assert.equal(report.schemaVersion, 2);
      assert.equal(report.reportType, 'guided-device-check');
      assert.equal(report.diagnosticReads.before.snapshot.completedAt, fixture.completedAt);
      assert.equal(report.diagnosticReads.after.snapshot.completedAt, after.completedAt);
      assert.equal(report.diagnosticReads.after.buildIdentity.applicationHashVerified, false);
      assert.deepEqual([report.manualSourceId.prefix, report.manualSourceId.comparison, report.manualSourceId.referenceRead,
        report.manualSourceId.fullSourceIdVerified, report.manualSourceId.applicationHashVerified],
      ['9bc7578a46f2','prefix-match','after',false,false]);
      assert.equal(report.manualObservations.length, 2);
      assert.equal(report.coverage.configurationCasesObserved, 2);
      assert.equal(report.coverage.configurationCasesUntested, 30);
      assert.equal(report.coverage.matchingExpectations, 1);
      assert.equal(report.coverage.differentExpectations, 1);
      assert.equal(report.coverage.untestedBaseCases.length, 2);
      assert.equal(report.reportLanguage, de ? 'de' : 'en');
      assert.equal(report.samePhysicalDeviceVerified, false);
      const pendingDownload = page.waitForEvent('download');
      await page.getByRole('button', {name:pick('Browser-Download versuchen','Try browser download'),exact:true}).click();
      const download = await pendingDownload;
      assert.ok(download.suggestedFilename().startsWith(de ? 'Allmiibo-Geraetepruefung-' : 'Allmiibo-Device-check-'));
      assert.equal(await fs.readFile(await download.path(), 'utf8'), first.body);
      await closePreview();

      // A real navigation/reload reconstructs the component from its saved draft.
      await page.waitForFunction(key => Object.keys(localStorage).some(item => item === key || item.startsWith(key + '.rev.')), draftKey);
      await page.reload();
      await openPanel();
      assert.equal(await panel.locator('.draft-status').innerText(), pick('Entwurf wiederhergestellt','Draft restored'));
      assert.equal(await app().inputValue(), 'amiibo-database');
      assert.equal(await language().inputValue(), 'en');
      assert.equal(await resume().inputValue(), 'off');
      assert.equal(await animation().inputValue(), 'off');
      assert.equal(await wake().inputValue(), 'no-response');
      const restored = await exportPreview();
      assert.deepEqual(restored.report.manualObservations, report.manualObservations);
      assert.deepEqual(restored.report.diagnosticReads, report.diagnosticReads);
      assert.deepEqual(restored.report.manualSourceId, report.manualSourceId);
      assert.ok(restored.report.exportedAt > report.exportedAt);
      await closePreview();

      // Invalid imports and a cancelled replacement retain all existing evidence.
      await importBody('{invalid JSON');
      await panel.getByRole('alert').waitFor();
      const unchanged = await exportPreview();
      assert.deepEqual(unchanged.report.manualObservations, report.manualObservations);
      await closePreview();
      await importBody(first.body);
      await panel.getByRole('group', {name:pick('Bericht übernehmen','Use imported report'),exact:true}).waitFor();
      await button('Aktuellen Entwurf behalten','Keep current draft').click();
      const cancelled = await exportPreview();
      assert.deepEqual(cancelled.report.manualObservations, report.manualObservations);
      await closePreview();
      await importBody(first.body);
      await button('Bericht übernehmen','Use imported report').click();
      const roundTrip = await exportPreview();
      assert.deepEqual(roundTrip.report.manualObservations,
        report.manualObservations.map(row => ({...row,observationSource:'imported-manual-report'})));
      assert.deepEqual(roundTrip.report.diagnosticReads, report.diagnosticReads);
      assert.equal(roundTrip.report.importedReport.exportedAt, report.exportedAt);
      assert.equal(roundTrip.report.importedReport.schemaVersion, 2);
      assert.equal(roundTrip.report.manualSourceId.applicationHashVerified, false);
      assert.equal(roundTrip.report.samePhysicalDeviceVerified, false);
      await closePreview();

      await button('Neuen Bericht beginnen','Start a new report').click();
      await button('Entwurf behalten','Keep draft').click();
      assert.equal(await exportButton.isEnabled(), true);
      await button('Neuen Bericht beginnen','Start a new report').click();
      await button('Entwurf verwerfen','Discard draft').click();
      assert.equal(await exportButton.isDisabled(), true);
      await page.waitForFunction(key => !Object.keys(localStorage).some(item => item === key || item.startsWith(key + '.rev.')), draftKey);
      await page.reload();
      await openPanel();
      assert.equal(await exportButton.isDisabled(), true);
      assert.equal(await panel.getByRole('progressbar').evaluate(element => element.value), 0);
      // Supplementary LCD observations use a fresh offline draft with three independent sources.
      const lcd = panel.locator('.lcd-checks');
      await lcd.locator('summary').click();
      const group = field('Prüfbereich','Check group');
      const lcdCase = field('Prüffall','Test case');
      const source = field('Quelle des Ergebnisses','Source of result');
      const outcome = field('Beobachtetes Ergebnis','Observed outcome');
      for (const [key,count] of [['controls',4],['games',16],['dim',8],['dfu',12]]) {
        await group.selectOption(key);
        assert.equal(await lcdCase.locator('option').count(),count);
      }
      await lcdCase.selectOption('dfu/system/disconnect/checkpoint');
      for (const kind of ['manual-device','host-test','device-readback']) {
        await source.selectOption(kind);
        await outcome.selectOption('ok');
        await lcd.getByRole('textbox').fill('offset=4096, crc=0x12345678 (fixture)');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth+1));
      const extended=await exportPreview();
      assert.equal(extended.report.schemaVersion,3);
      assert.deepEqual(extended.report.lcdCoverage,{totalCases:40,localDeviceCases:1,hostTests:1,readbacks:1,imported:0});
      await closePreview();
      await page.reload();
      await openPanel();
      const reopened=await exportPreview();
      assert.deepEqual(reopened.report.lcdObservations,extended.report.lcdObservations);
      await closePreview();
      await importBody(extended.body);
      await button('Bericht übernehmen','Use imported report').click();
      const imported=await exportPreview();
      assert.deepEqual(imported.report.lcdCoverage,{totalCases:40,localDeviceCases:0,hostTests:0,readbacks:0,imported:3});
      assert.ok(imported.report.lcdObservations.every(row => row.imported && row.note.includes('fixture')));
      await closePreview();
      await lcd.locator('summary').click();
      await group.selectOption('dfu');
      await lcdCase.selectOption('dfu/system/disconnect/checkpoint');
      await source.selectOption('manual-device');
      await button('Erneut beobachtet','Observed again').click();
      const renewed=await exportPreview();
      assert.deepEqual(renewed.report.lcdCoverage,{totalCases:40,localDeviceCases:1,hostTests:0,readbacks:0,imported:2});
      assert.equal(renewed.report.lcdObservations.find(r=>!r.imported).note,'');
      await closePreview();
      assert.deepEqual(errors, []);
      results.push({locale, width, device:'synthetic snapshots; no physical device', schemaVersion:2, supplementalSchema:3, lcdCases:40, lcdEvidenceSources:3, importsCountAsNewHardware:false,
        reported:2, knownConfigurations:2, untestedConfigurations:30, actualJsonDownload:true,
        localDraftSurvivedReload:true, invalidImportKeptDraft:true, importReplacementConfirmed:true,
        jsonImportExportRoundTrip:true, importedTimestampsPreserved:true, discardSurvivedReload:true,
        manualSourcePrefix:'invalid, differing and matching prefix checked', applicationHashVerified:false});
    } finally { await context.close(); }
  }
  await fs.writeFile(path.join(evidence, 'guided-device-check.json'), JSON.stringify({browser:browser.version(), results},null,2) + '\n');
  console.log(JSON.stringify(results));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
