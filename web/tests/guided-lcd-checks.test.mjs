import test from 'node:test';
import assert from 'node:assert/strict';
import {lcdCheckCases,cleanLcdObservations,summarizeLcdObservations} from '../src/lib/guided-lcd-checks.js';
import {createGuidedReport,parseGuidedReport,serializeGuidedDraft,parseGuidedDraft} from '../src/lib/guided-device-check.js';

const at='2026-01-01T00:00:00.000Z', options={webVersion:'3.55.6',locale:'en'};
function row(caseId,source='manual-device'){return {caseId,source,outcome:'ok',note:'recorded',recordedAt:at,imported:false};}
test('LCD matrix has unique bilingual rows for orientation/input, four games, dim and both DFU stages',()=>{
  assert.deepEqual(['controls','games','dim','dfu'].map(group=>lcdCheckCases.filter(r=>r.module===group).length),[4,16,8,12]);
  assert.equal(new Set(lcdCheckCases.map(r=>r.id)).size,40);
  for(const r of lcdCheckCases) assert.ok(r.labels.length===2 && r.labels.every(Boolean));
});
test('LCD local draft preserves observation provenance; export and re-import cannot claim a new hardware test',()=>{
  const id=lcdCheckCases[0].id, rows=[row(id),row(id,'host-test'),row(id,'device-readback')];
  const state={lcdObservations:rows};
  const d=serializeGuidedDraft(state);
  assert.equal(JSON.parse(d).schemaVersion,3);
  const draft=parseGuidedDraft(d);
  const report=createGuidedReport({...options,...draft});
  assert.equal(report.coverage.configurationCasesObserved,0);
  assert.deepEqual(report.lcdCoverage,{totalCases:40,localDeviceCases:1,hostTests:1,readbacks:1,imported:0});
  const imported=parseGuidedReport(JSON.stringify(report));
  assert.deepEqual(Object.values(imported.lcdObservations),rows.map(x=>({...x,imported:true})));
  const repeat=createGuidedReport({...options,...imported});
  assert.deepEqual(repeat.lcdCoverage,{totalCases:40,localDeviceCases:0,hostTests:0,readbacks:0,imported:3});
  const legacy={...report,schemaVersion:2};
  assert.deepEqual(parseGuidedReport(JSON.stringify(legacy)).lcdObservations,{});
  assert.equal(summarizeLcdObservations({}).localDeviceCases,0);
});
test('LCD rejects future timestamps, duplicates or malformed sources without carrying false evidence into reports',()=>{
  const x=row('dim/idle');
  for(const v of [[x,x],[{...x,caseId:'dim/unknown'}],[{...x,source:'auto'}],[{...x,note:'a'.repeat(1001)}],
    [{...x,recordedAt:'bad'}],[{...x,imported:'false'}],[{...x,outcome:'invalid'}]]) {
    assert.throws(()=>cleanLcdObservations(v));
  }
  assert.throws(()=>serializeGuidedDraft({lcdObservations:[{...x,recordedAt:'2099-01-01T00:00:00.000Z'}]},at));
  const report=createGuidedReport({...options,lcdObservations:[x]});
  assert.throws(()=>parseGuidedReport(JSON.stringify({...report,lcdObservations:{}})));
});
