import test from 'node:test';
import assert from 'node:assert/strict';
import {compareGuidedReportFiles} from '../src/lib/guided-report-comparison.js';
import {createGuidedReport,recordDeviceObservation} from '../src/lib/guided-device-check.js';

function report(day, observed='same-active-figure', animationSetting='off', legacy=false) {
  const when = '2025-01-0'+day+'T01:00:00.000Z';
  const row = recordDeviceObservation({origin:'file-emulator',route:'sleep-and-wake',deviceLanguage:'de',resumeSetting:'on',
    animationSetting, outcome:observed,note:'private note'},when);
  const data = createGuidedReport({webVersion:'3.52.0',locale:'de',observations:[row]});
  data.exportedAt=when;
  if (legacy) { data.schemaVersion=1; delete data.manualObservations[0].animationSetting; }
  return new Blob([JSON.stringify(data)]);
}
test('sorts by export time and compares only identical known configurations',async()=>{
  const result=await compareGuidedReportFiles([report(3,'different-active-figure'),report(1),report(2,'same-active-figure','on')]);
  assert.equal(result.reports[0].comparison,null);
  assert.equal(result.reports[1].comparison.sharedConfigurations,0);
  assert.equal(result.reports[2].comparison.sharedConfigurations,0);
  const pair=await compareGuidedReportFiles([report(3,'main-menu'),report(1)]);
  assert.deepEqual(pair.reports[1].comparison.changed,[{configuration:'file-emulator/sleep-and-wake/de/on/off',previous:'same-active-figure',current:'main-menu'}]);
  assert.equal(pair.reports[1].differed,1);
  assert.equal(pair.samePhysicalDeviceVerified,false);
  assert.doesNotMatch(JSON.stringify(pair),/private note|diagnosticReads/);
});
test('legacy observations count as routes with unspecified animation, and equal dates have no delta',async()=>{
  const {reports}=await compareGuidedReportFiles([report(1,'same-active-figure','off',true),report(1)]);
  assert.equal(reports[0].baseCases,1); assert.equal(reports[0].configurations,0);
  assert.equal(reports[1].comparison,null);
});
test('checks bounds before reading and rejects invalid documents',async()=>{
  const valid=report(1);
  for(const files of [[],[valid],Array(9).fill(valid),[valid,{size:1048577,text(){assert.fail('oversize read');}}],[valid,new Blob(['{}'])]]) {
    await assert.rejects(compareGuidedReportFiles(files));
  }
});
test('tied export times never select an arbitrary neighbour for changes',async()=>{
  const tied = [report(2), report(2,'main-menu')];
  for (const order of [tied,[...tied].reverse()]) {
    const {reports} = await compareGuidedReportFiles([report(1), ...order, report(3), report(4)]);
    assert.deepEqual(reports.slice(0,4).map(row => row.comparison), [null,null,null,null]);
    assert.equal(reports[4].comparison.sharedConfigurations,1);
  }
});
