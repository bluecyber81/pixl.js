// Run against the production root build. Chrome uses an isolated profile and a loopback HTTP server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';

const [dist, evidence, legacyFile] = process.argv.slice(2);
assert.ok(dist && evidence, 'Supply the production root build and an output directory; a schema 1 report is optional.');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
await fs.mkdir(evidence, {recursive:true});
const recordedAt = '2026-01-01T12:00:00.000Z';
const fixture = {schemaVersion:1, reportType:'guided-device-check', fileManagerVersion:'3.52.0', reportLanguage:'de',
  exportedAt:'2026-01-01T12:02:00.000Z', diagnosticReads:{before:null,after:null}, manualSourceId:null,
  manualObservations:['file-emulator','amiibo-database'].flatMap(origin =>
    [['return-to-list','source-list-same-figure'],['sleep-and-wake','same-active-figure']].map(([route,observed]) =>
      ({origin, route, observed, recordedAt, deviceLanguage:'de', resumeSetting:'on'})))};
const legacy = legacyFile ? JSON.parse(await fs.readFile(legacyFile,'utf8')) : fixture;
assert.equal(legacy.schemaVersion,1);
assert.equal(legacy.manualObservations.length,4);

let failing = false;
const statuses = [];
const server = await preview({base:'/', build:{outDir:path.resolve(dist)}, preview:{host:'127.0.0.1',port:0,open:false},
  logLevel:'error', plugins:[{name:'guided-chunk-fault-for-test', configurePreviewServer(instance) {
    instance.middlewares.use((req,res,next) => {
      if (!/^\/assets\/GuidedDeviceCheck-[\w-]+\.js(?:\?.*)?$/.test(req.url)) return next();
      res.on('finish',() => statuses.push(res.statusCode));
      if (!failing) return next();
      res.writeHead(503,{'Cache-Control':'no-store','Content-Type':'text/plain'});
      res.end('Service unavailable');
    });
  }}]});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const results = [];
const failures = [];
let browser;
async function navigate(page) {
  await page.goto(origin);
  await page.locator('.workspace-nav [aria-controls="device-overview"]').click();
  const details = page.locator('.guided-check-panel:not(.guided-comparison)');
  if (!await details.evaluate(element => element.open)) await details.locator(':scope > summary').click();
  return details;
}
async function openTab(context) {
  const page = await context.newPage();
  const details = await navigate(page);
  await details.locator('.guided-check').waitFor();
  return page;
}
async function exportReport(page,de) {
  await page.locator('.guided-check').getByRole('button',{name:de?'Prüfbericht als JSON':'Export check report as JSON',exact:true}).first().click();
  const report = JSON.parse(await page.locator('#diagnostic-json').inputValue());
  await page.getByRole('dialog').getByRole('button',{name:de?'Schließen':'Close',exact:true}).last().click();
  return report;
}
async function discard(page) {
  const panel = page.locator('.guided-check');
  await panel.getByRole('button',{name:'Start a new report',exact:true}).click();
  await panel.getByRole('button',{name:'Discard draft',exact:true}).click();
}
const expectedRoutes = ['return-to-list','sleep-and-wake'];
async function tabs(context) {
  const [a,b] = await Promise.all([openTab(context), openTab(context)]);
  // Both tabs start with the same (empty) branch. One action per tab must survive closure of both.
  await Promise.all([a.locator('.check-row select').nth(0).selectOption('source-list-same-figure'),
    b.locator('.check-row select').nth(1).selectOption('same-active-figure')]);
  for (const page of [a,b]) await page.locator('.guided-open-draft').first().waitFor();
  await Promise.all([a.close(),b.close()]);
  const reopened = await openTab(context);
  const first = await exportReport(reopened,false);
  await reopened.locator('.guided-open-draft').first().click();
  const second = await exportReport(reopened,false);
  assert.equal(first.manualObservations.length,1);
  assert.equal(second.manualObservations.length,1);
  assert.deepEqual([first,second].map(report => report.manualObservations[0].route).sort(), expectedRoutes);
  // Delete one branch. A normal reload must select the other, without a phantom conflict.
  await discard(reopened);
  await reopened.close();
  const remaining = await openTab(context);
  assert.equal(await remaining.locator('.guided-open-draft').count(),0);
  assert.deepEqual((await exportReport(remaining,false)).manualObservations,first.manualObservations);

  // A second open copy of the same draft must not wipe newer edits from the first tab.
  const stale = await openTab(context);
  await remaining.locator('.check-row select').nth(0).selectOption('main-menu');
  const newer = await exportReport(remaining,false);
  await discard(stale);
  const fresh = await openTab(context);
  assert.deepEqual((await exportReport(fresh,false)).manualObservations,newer.manualObservations);
  const keys = () => fresh.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('allmiibo.guided-device-check.')).sort());
  const beforeLanguage = await keys();
  await fresh.locator('.header-language button').click();
  await fresh.getByRole('menuitem',{name:'Deutsch',exact:true}).click();
  assert.equal((await exportReport(fresh,true)).reportLanguage,'de');
  assert.deepEqual(await keys(),beforeLanguage);
  return {bothConcurrentEditsRecovered:true,discardPreservesOtherDraft:true,staleDiscardPreservesNewerEdit:true,languageSwitchPreservesDraft:true};
}
async function storageFailure(context) {
  await context.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if (key.startsWith('allmiibo.guided-device-check.') && window.failGuidedSave) {
        throw new DOMException('Test storage capacity','QuotaExceededError');
      }
      return set.call(this,key,value);
    };
  });
  const page=await openTab(context);
  const panel=page.locator('.guided-check');
  await page.evaluate(()=>{window.failGuidedSave=true;});
  await panel.locator('.check-row select').first().selectOption('source-list-same-figure');
  const download=page.waitForEvent('download');
  await panel.getByRole('button',{name:'Save draft as JSON',exact:true}).click();
  const draftFile=await download;
  const saved=await fs.readFile(await draftFile.path());
  assert.equal(JSON.parse(saved).draftType,'guided-device-check-draft');
  const restored=await openTab(context);
  const input=restored.locator('.guided-check input[type=file]');
  await input.setInputFiles({name:'check-draft.json',mimeType:'application/json',buffer:saved});
  const report=await exportReport(restored,false);
  assert.deepEqual(report.manualObservations.map(row=>[row.route,row.observed,row.observationSource]),
    [['return-to-list','source-list-same-figure','imported-manual-report']]);
  return {quotaErrorDisplayed:true,downloadedDraftReimported:true};
}
async function compareReports(page,de,report) {
  const details=page.locator('.guided-comparison');
  await details.locator('summary').click();
  const panel=details.locator('.report-comparison');
  const input=panel.locator('input[type=file]');
  const asFile=(name,data)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  // Selection order is reversed to require sorting by the original export time.
  await input.setInputFiles([asFile('new.json',report),asFile('old.json',legacy)]);
  const cards=panel.locator('.comparison-cards');
  await cards.locator('li').nth(1).waitFor();
  const sizes=await cards.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,documentWidth:document.documentElement.scrollWidth}));
  assert.ok(sizes.width>0 && sizes.scrollWidth===sizes.width && sizes.documentWidth===320,JSON.stringify(sizes));
  assert.equal(await cards.locator('dd').count(),10);
  assert.equal(await panel.locator('.table-scroll').isVisible(),false);
  await page.screenshot({path:path.join(evidence,'report-comparison-'+(de?'de':'en')+'-mobile.png')});
  const original=page.viewportSize();
  await page.setViewportSize({width:1280,height:900});
  await panel.getByRole('table').getByRole('row').nth(2).waitFor();
  assert.equal(await cards.isVisible(),false);
  await page.setViewportSize(original);
  async function downloadComparison() {
    const downloaded=page.waitForEvent('download');
    await panel.getByRole('button',{name:de?'Vergleich als JSON speichern':'Save comparison as JSON'}).click();
    return JSON.parse(await fs.readFile(await (await downloaded).path(),'utf8'));
  }
  const saved=await downloadComparison();
  assert.equal(saved.reportType,'guided-device-check-comparison');
  assert.equal(saved.samePhysicalDeviceVerified,false);
  assert.deepEqual(saved.reports.map(row=>[row.exportedAt,row.baseCases,row.configurations]),
    [[legacy.exportedAt,4,0],[report.exportedAt,4,0]]);
  assert.deepEqual(saved.reports[1].comparison.changed,[]);
  assert.equal(saved.reports[1].comparison.sharedConfigurations,0);
  await input.setInputFiles([asFile('invalid.json',{})]);
  await panel.getByRole('alert').waitFor();
  assert.match(await panel.textContent(),de?/vorherige.*Vergleich/i:/previous.*compar/i);
  assert.deepEqual(await downloadComparison(),saved);
  return {jsonDownloaded:true,mobileCards:sizes,desktopTable:true,invalidSelectionLabelsPriorResult:true};
}
async function recoveryAndLayout(context,locale) {
  const de = locale.startsWith('de');
  statuses.length=0;
  failing=true;
  const page=await context.newPage();
  const details=await navigate(page);
  const alert=details.getByRole('alert');
  await alert.waitFor();
  const retry=details.getByRole('button',{name:de?'Erneut laden':'Try again',exact:true});
  await retry.focus();
  await page.keyboard.press('Enter');
  await alert.getByText(de?/Auch das erneute/:/failed again/).waitFor();
  const failedAttempts=[...statuses];
  assert.ok(failedAttempts.some(code=>code===503) && failedAttempts.every(code=>code===503));
  failing=false;
  await retry.focus();
  await page.keyboard.press('Enter');
  const panel=details.locator('.guided-check');
  await panel.waitFor();
  assert.equal(statuses.at(-1),200);
  await panel.locator('input[type="file"]').setInputFiles({name:'schema-1.json', mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  const history=panel.locator('.history');
  if (!await history.evaluate(element=>element.open)) await history.locator('summary').click();
  await history.locator('li').nth(3).waitFor();
  const report=await exportReport(page,de);
  assert.equal(report.schemaVersion,2);
  assert.equal(report.importedReport.schemaVersion,1);
  assert.equal(report.manualObservations.length,4);
  for (const input of legacy.manualObservations) {
    const row=report.manualObservations.find(item=>item.origin===input.origin && item.route===input.route);
    assert.ok(row);
    assert.equal(row.observed,input.observed);
    assert.equal(row.recordedAt,input.recordedAt);
    assert.equal(row.animationSetting,null);
    assert.equal(row.observationSource,'imported-manual-report');
  }
  assert.equal(report.coverage.configurationCasesObserved,0);
  assert.equal(report.coverage.configurationCasesTotal,32);
  assert.equal(report.coverage.matchingExpectations,4);
  await page.addStyleTag({content:':root{font-size:200% !important}'});
  const widths=await panel.evaluate(element=>{
    const root=document.documentElement;
    const bounds=element.getBoundingClientRect();
    const overflowing=[...element.querySelectorAll('button,input,select,textarea,summary,h4,p,label,li,strong,span')]
      .filter(child=>child.getClientRects().length && getComputedStyle(child).position!=='absolute')
      .filter(child=>{const box=child.getBoundingClientRect(); return box.left < bounds.left-1 || box.right > bounds.right+1;})
      .map(child=>child.tagName+'.'+child.className);
    return {viewport:root.clientWidth,pageWidth:root.scrollWidth,panelWidth:element.clientWidth,
      panelScrollWidth:element.scrollWidth,rootFont:getComputedStyle(root).fontSize,overflowing};
  });
  await panel.locator('.top-actions button').first().focus();
  await page.keyboard.press('Tab');
  assert.ok(await panel.locator('.top-actions button').last().evaluate(el=>el.matches(':focus-visible')));
  assert.equal(widths.viewport,320);
  assert.equal(widths.rootFont,'32px');
  assert.ok(widths.pageWidth<=321 && widths.panelScrollWidth<=widths.panelWidth+1,JSON.stringify(widths));
  assert.deepEqual(widths.overflowing,[]);
  const comparison=await compareReports(page,de,report);
  return {failedChunkStatuses:failedAttempts,recoveredChunkStatus:statuses.at(-1),schema1Rows:4,fullySpecifiedCases:0,widths,focusVisible:true,comparison};
}

async function run(name,locale,test) {
  const context=await browser.newContext({locale,viewport:{width:320,height:900},serviceWorkers:'block'});
  const errors=[];
  try {
    await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    context.setDefaultTimeout(8000);
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    const data=await test(context,locale);
    assert.deepEqual(errors,[]);
    results.push({name,locale,...data});
  } catch(error) {
    failures.push({name,locale,message:error.message});
  } finally { failing=false; await context.close(); }
}
try {
  browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.CHROME_EXECUTABLE});
  await run('concurrent drafts','en-GB',tabs);
  await run('quota and draft-file recovery','en-GB',storageFailure);
  for(const locale of ['de-DE','en-GB']) await run('legacy import, HTTP 503 and large text',locale,recoveryAndLayout);
  const outcome={browser:browser.version(),results,failures};
  await fs.writeFile(path.join(evidence,'guided-recovery-browser.json'),JSON.stringify(outcome,null,2)+'\n');
  console.log(JSON.stringify(outcome));
  assert.equal(failures.length,0,'See guided-recovery-browser.json for scenario failures.');
} finally {
  if(browser) await browser.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
