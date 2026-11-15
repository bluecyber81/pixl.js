// Exercise the real diagnosis UI with synthetic, already-read device values.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {diagnosticSnapshot} from '../tests/fixtures/diagnostic-overview-data.mjs';

const [dist, evidence] = process.argv.slice(2);
assert.ok(dist && evidence,'Supply the production root build and an output directory.');
await fs.mkdir(evidence,{recursive:true});
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await preview({base:'/', build:{outDir:path.resolve(dist)}, preview:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
const origin = 'http://127.0.0.1:'+server.httpServer.address().port;
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});
const results = [];
try {
  for (const [locale,width] of [['de-DE',1280],['en-GB',390]]) {
    const de = locale === 'de-DE';
    const context = await browser.newContext({locale,viewport:{width,height:850},serviceWorkers:'block'});
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror',err=>errors.push(err.message));
      await page.route('**/*',route=>route.request().url().startsWith(origin+'/') ? route.continue() : route.abort());
      await page.goto(origin);
      await page.locator('.workspace-nav [aria-controls="device-overview"]').click();
      await page.locator('.guided-check-panel > summary').click();
      const panel = page.locator('.guided-check');
      const button = (german,english) => panel.getByRole('button',{name:de?german:english,exact:true});
      const takeBefore = button('Vorher-Aufnahme übernehmen','Attach before snapshot');
      const takeAfter = button('Nachher-Aufnahme übernehmen','Attach after snapshot');
      const exportReport = button('Prüfbericht als JSON','Export check report as JSON');
      await panel.waitFor();
      assert.equal(await takeBefore.isDisabled(),true);
      assert.equal(await exportReport.isDisabled(),true);

      const fixture = structuredClone(diagnosticSnapshot());
      fixture.sections.boot.data.applicationCounter=647;
      const setSnapshot = async snapshot => page.evaluate(data=>{
        const app=document.querySelector('#app')._vnode.component.proxy;
        Object.assign(app,{connected:!!data,firmwareVersion:data?'2.22.0-DE3.74':null,fullDiagnosticSnapshot:data});
      },snapshot);
      await setSnapshot(fixture);
      await takeBefore.click();
      await setSnapshot(null);
      await panel.locator('.field-grid select').nth(0).selectOption('de');
      await panel.locator('.field-grid select').nth(1).selectOption('on');
      await panel.locator('.check-row select').nth(0).selectOption('source-list-same-figure');
      await panel.locator('.field-grid select').nth(2).selectOption('amiibo-database');
      await panel.locator('.check-row select').nth(1).selectOption('main-menu');
      await page.locator('.workspace-nav [aria-controls="file-workspace"]').click();
      await page.locator('.workspace-nav [aria-controls="device-overview"]').click();
      assert.match(await panel.locator('.check-row ~ p[role=status]').innerText(),/2 \/ 4/);

      // A reconnect alone must not turn the first diagnostic read into an "after" measurement.
      await setSnapshot(fixture);
      assert.equal(await takeAfter.isDisabled(),true);
      const after = structuredClone(fixture);
      after.startedAt=after.completedAt=new Date().toISOString();
      for(const section of Object.values(after.sections)) section.observedAt=after.completedAt;
      await setSnapshot(after);
      await takeAfter.click();
      await setSnapshot(null);
      const prefix=panel.locator('.source-prefix input');
      await prefix.fill('b5793');
      assert.equal(await exportReport.isDisabled(),true);
      await prefix.fill('000000000000');
      assert.match(await panel.locator('#source-prefix-result').innerText(),de?/weichen/:/differ/);
      await prefix.fill('B5793142353E');
      assert.match(await panel.locator('#source-prefix-result').innerText(),de?/passen/:/match/);
      assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1 &&
        document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
      await exportReport.click();
      const body = await page.locator('#diagnostic-json').inputValue(), report=JSON.parse(body);
      assert.equal(report.reportType,'guided-device-check');
      assert.equal(report.diagnosticReads.before.snapshot.completedAt,fixture.completedAt);
      assert.equal(report.diagnosticReads.after.snapshot.completedAt,after.completedAt);
      assert.equal(report.diagnosticReads.after.buildIdentity.applicationHashVerified,false);
      assert.deepEqual([report.manualSourceId.prefix,report.manualSourceId.comparison,report.manualSourceId.referenceRead,
        report.manualSourceId.fullSourceIdVerified,report.manualSourceId.applicationHashVerified],
        ['b5793142353e','prefix-match','after',false,false]);
      assert.equal(report.manualObservations.filter(row=>row.matchesExpectation===true).length,1);
      assert.equal(report.manualObservations.filter(row=>row.matchesExpectation===false).length,1);
      assert.equal(report.manualObservations.filter(row=>row.observed===null).length,2);
      assert.equal(report.reportLanguage,de?'de':'en');
      const pending=page.waitForEvent('download');
      await page.getByRole('button',{name:de?'Browser-Download versuchen':'Try browser download',exact:true}).click();
      const download=await pending;
      assert.ok(download.suggestedFilename().startsWith(de?'Allmiibo-Geraetepruefung-':'Allmiibo-Device-check-'));
      assert.equal(await fs.readFile(await download.path(),'utf8'),body);
      await page.getByRole('dialog').getByRole('button',{name:de?'Schließen':'Close',exact:true}).last().click();
      await button('Neuen Bericht beginnen','Start a new report').click();
      await button('Entwurf behalten','Keep draft').click();
      assert.equal(await exportReport.isEnabled(),true);
      await button('Neuen Bericht beginnen','Start a new report').click();
      await button('Entwurf verwerfen','Discard draft').click();
      assert.equal(await exportReport.isDisabled(),true);
      assert.deepEqual(errors,[]);
      results.push({locale,width,device:'simulated snapshots',reported:2,untested:2,actualJsonDownload:true,
        manualSourcePrefix:'invalid, differing and matching prefix checked',applicationHashVerified:false});
    } finally {await context.close();}
  }
  await fs.writeFile(path.join(evidence,'guided-device-check.json'),JSON.stringify({browser:browser.version(),results},null,2)+'\n');
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
