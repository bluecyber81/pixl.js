import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticSnapshot } from './fixtures/diagnostic-overview-data.mjs';
import { canAttachAfter, captureDeviceEvidence, compareManualSourcePrefix, createGuidedReport, normalizeSourcePrefix,
  recordDeviceObservation, observationKey, parseGuidedReport, serializeGuidedDraft, parseGuidedDraft,
  summarizeGuidedObservations, expectedReturn,
  GUIDED_MAX_BYTES, GUIDED_MAX_SNAPSHOT_BYTES, GUIDED_MAX_OBSERVATIONS } from '../src/lib/guided-device-check.js';

const sample = {origin:'amiibo-database', route:'return-to-list', outcome:'source-list-same-figure', deviceLanguage:'en', resumeSetting:'on'};

test('Device outcomes distinguish source list, selected figure and untested paths',()=>{
  const result = recordDeviceObservation(sample);
  assert.equal(result.matchesExpectation,true);
  assert.equal(result.deviceLanguage,'en');
  assert.equal(recordDeviceObservation({...sample,outcome:'source-list-different-figure'}).matchesExpectation,false);
  assert.equal(recordDeviceObservation({...sample,outcome:'not-tested'}),null);
  assert.equal(recordDeviceObservation({...sample,origin:'custom-origin'}),null);
  assert.equal(recordDeviceObservation({...sample,route:'constructor'}),null);
  const report = createGuidedReport({locale:'de_DE',webVersion:'test',observations:{'amiibo-database/return-to-list':result}});
  assert.equal(report.reportLanguage,'de');
  // Schema 2 stores actual observations; explicit coverage preserves untested routes.
  assert.equal(report.schemaVersion,2);
  assert.equal(report.manualObservations.length,1);
  assert.equal(report.manualObservations.filter(row=>row.recordedAt).length,1);
  assert.equal(report.coverage.baseCasesObserved,1);
  assert.equal(report.coverage.untestedBaseCases.length,3);
  assert.equal(report.coverage.configurationCasesObserved,0);
  assert.equal(report.coverage.configurationCasesUntested,32);
  assert.deepEqual(report.diagnosticReads,{before:null,after:null});
  assert.equal(report.samePhysicalDeviceVerified,false);
});

const observationAt = '2026-11-15T10:02:00.000Z';
const exportedAt = '2026-11-15T10:03:00.000Z';
const configured = {...sample, animationSetting:'on', note:'Same figure selected.'};
const row = overrides => recordDeviceObservation({...configured,...overrides},observationAt);
const reportOf = observations => ({...createGuidedReport({webVersion:'3.52.0',locale:'en_US',observations}),exportedAt});
const invalidImport = value => assert.throws(()=>parseGuidedReport(typeof value === 'string' ? value : JSON.stringify(value)),{code:'GUIDED_IMPORT_INVALID'});

function evidenceAt(startedAt, completedAt, version = '2.22.0-DE3.74') {
  const snapshot = structuredClone(diagnosticSnapshot());
  snapshot.startedAt = startedAt; snapshot.completedAt = completedAt;
  for (const section of Object.values(snapshot.sections)) section.observedAt = completedAt;
  snapshot.sections.boot.data.applicationCounter = version.endsWith('DE3.75') ? 648 : 647;
  return captureDeviceEvidence(snapshot,version);
}

test('Matrix keeps all 32 app, route, language, resume and animation combinations independently',()=>{
  const observations = {};
  for (const origin of ['file-emulator','amiibo-database']) for (const route of ['return-to-list','sleep-and-wake']) {
    for (const deviceLanguage of ['de','en']) for (const resumeSetting of ['on','off']) for (const animationSetting of ['on','off']) {
      const outcome = route === 'return-to-list' ? 'source-list-same-figure' : resumeSetting === 'on' ? 'same-active-figure' : 'main-menu';
      const result = row({origin,route,deviceLanguage,resumeSetting,animationSetting,outcome});
      observations[observationKey(result)] = result;
    }
  }
  assert.equal(Object.keys(observations).length,32);
  const report = reportOf(observations);
  assert.equal(report.manualObservations.length,32);
  assert.equal(report.coverage.configurationCasesObserved,32);
  assert.equal(report.coverage.configurationCasesUntested,0);
  assert.equal(report.coverage.baseCasesObserved,4);
  assert.equal(report.coverage.matchingExpectations,32);
  assert.equal(report.coverage.differentExpectations,0);
  assert.deepEqual(report.coverage.untestedBaseCases,[]);
  const restored = parseGuidedReport(JSON.stringify(report));
  assert.equal(Object.keys(restored.observations).length,32);
  for (const record of Object.values(restored.observations)) assert.equal(record.observationSource,'imported-manual-report');
});

test('Unknown configuration is retained without completing a known configuration or inventing a wake expectation',()=>{
  const unknown = row({route:'sleep-and-wake',outcome:'same-active-figure',deviceLanguage:'',resumeSetting:'',animationSetting:''});
  const report = reportOf([unknown]);
  assert.equal(report.coverage.configurationCasesObserved,0);
  assert.equal(report.coverage.unknownExpectations,1);
  assert.equal(report.manualObservations[0].matchesExpectation,null);
  assert.equal(observationKey(unknown),'amiibo-database/sleep-and-wake/unknown/unknown/unknown');
  assert.equal(observationKey({origin:'constructor',route:'return-to-list'}),null);
});

test('Coverage summary is independent of document time, rebuilds derived expectations and does not mutate rows',()=>{
  const known = {...row(),recordedAt:'2099-01-01T00:00:00.000Z',matchesExpectation:false,expected:'no-response'};
  const unknown = row({route:'sleep-and-wake',outcome:'same-active-figure',deviceLanguage:'',resumeSetting:'',animationSetting:''});
  const observations = {[observationKey(known)]:known,[observationKey(unknown)]:unknown};
  const original = structuredClone(observations);
  const summary = summarizeGuidedObservations(observations);
  assert.equal(summary.observationsRecorded,2);
  assert.equal(summary.configurationCasesObserved,1);
  assert.equal(summary.configurationCasesUntested,31);
  assert.equal(summary.matchingExpectations,1);
  assert.equal(summary.differentExpectations,0);
  assert.equal(summary.unknownExpectations,1);
  assert.deepEqual(observations,original);
  assert.equal(summarizeGuidedObservations().configurationCasesUntested,32);
});

test('Schema 1 import preserves recorded facts, discards untested placeholders and recalculates their meaning',()=>{
  const observation = row({resumeSetting:'off',route:'sleep-and-wake',outcome:'main-menu'});
  delete observation.animationSetting; delete observation.note; delete observation.observationSource;
  observation.expected = 'different-active-figure'; observation.matchesExpectation = false;
  const legacy = {schemaVersion:1,reportType:'guided-device-check',fileManagerVersion:'3.52.0',reportLanguage:'de',exportedAt,
    manualObservations:[observation,{origin:'file-emulator',route:'return-to-list',observed:null,recordedAt:null,matchesExpectation:true}],
    diagnosticReads:{before:null,after:null},manualSourceId:null,samePhysicalDeviceVerified:true};
  const draft = parseGuidedReport(JSON.stringify(legacy));
  const result = Object.values(draft.observations)[0];
  assert.equal(Object.keys(draft.observations).length,1);
  assert.equal(result.expected,'main-menu'); assert.equal(result.matchesExpectation,true);
  assert.equal(result.animationSetting,null); assert.equal(result.note,'');
  assert.equal(result.observationSource,'imported-manual-report');
  assert.deepEqual(draft.importedReport,{schemaVersion:1,exportedAt,fileManagerVersion:'3.52.0'});
  const exported = reportOf(draft.observations);
  assert.equal(exported.samePhysicalDeviceVerified,false);
  assert.equal(exported.coverage.baseCasesObserved,1);
});

test('Report import rebuilds snapshot identity and source-prefix comparison instead of trusting external verification flags',()=>{
  const before = evidenceAt('2026-11-15T10:00:00.000Z','2026-11-15T10:00:01.000Z');
  const after = evidenceAt('2026-11-15T10:02:01.000Z','2026-11-15T10:02:02.000Z');
  const report = {...createGuidedReport({webVersion:'3.52.0',locale:'de_DE',observations:[row()],before,after,sourcePrefix:'b5793142353e'}),exportedAt};
  report.samePhysicalDeviceVerified = true;
  report.manualObservations[0].matchesExpectation = false;
  report.manualObservations[0].expected = 'no-response';
  report.manualSourceId.fullSourceIdVerified = true;
  report.manualSourceId.applicationHashVerified = true;
  report.manualSourceId.comparison = 'different-prefix';
  for (const read of [report.diagnosticReads.before, report.diagnosticReads.after]) {
    read.buildIdentity = structuredClone(read.buildIdentity);
    read.buildIdentity.applicationHashVerified = true;
    read.buildIdentity.samePhysicalDeviceVerified = true;
    read.buildIdentity.observed.applicationBinSha256 = 'a'.repeat(64);
    read.buildIdentity.observed.uniqueDeviceId = 'PRIVATE';
    read.buildIdentity.packageReference.sourceId = 'a'.repeat(64);
    read.snapshot = structuredClone(read.snapshot); read.snapshot.userFile = 'PRIVATE';
  }
  const state = parseGuidedReport(JSON.stringify(report));
  assert.equal(Object.values(state.observations)[0].matchesExpectation,true);
  assert.equal(state.after.buildIdentity.applicationHashVerified,false);
  assert.equal(state.after.buildIdentity.observed.uniqueDeviceId,null);
  assert.equal(state.after.buildIdentity.observed.applicationBinSha256,null);
  const next = createGuidedReport({webVersion:'3.52.0',locale:'de_DE',...state});
  assert.equal(next.manualSourceId.comparison,'prefix-match');
  assert.equal(next.manualSourceId.fullSourceIdVerified,false);
  assert.equal(next.manualSourceId.applicationHashVerified,false);
  assert.equal(next.samePhysicalDeviceVerified,false);
  assert.doesNotMatch(JSON.stringify(state),/PRIVATE/);
});

test('Imported observations retain dates and imported origin through the local draft round trip',()=>{
  const state = parseGuidedReport(JSON.stringify(reportOf([row()])));
  const saved = serializeGuidedDraft(state,exportedAt);
  const restored = parseGuidedDraft(saved);
  assert.deepEqual(restored.observations,state.observations);
  assert.deepEqual(restored.importedReport,state.importedReport);
  assert.equal(restored.savedAt,exportedAt);
  assert.equal(Object.values(restored.observations)[0].recordedAt,observationAt);
});

test('Local draft preserves unfinished and mistyped source text while a report export remains strict',()=>{
  for (const sourcePrefix of ['9bc7','Zbc7578a46f2','<script>']) {
    const restored = parseGuidedDraft(serializeGuidedDraft({sourcePrefix},exportedAt));
    assert.equal(restored.sourcePrefix,sourcePrefix);
    assert.throws(()=>createGuidedReport({webVersion:'3.52.0',locale:'de_DE',...restored}),{code:'GUIDED_IMPORT_INVALID'});
  }
  assert.equal(parseGuidedDraft(serializeGuidedDraft({sourcePrefix:'9bc7578a46f2'},exportedAt)).sourcePrefix,'9bc7578a46f2');
  assert.throws(()=>serializeGuidedDraft({sourcePrefix:'x'.repeat(65)}),{code:'GUIDED_IMPORT_INVALID'});
});

test('Notes remain bounded plain text, including characters that must not become markup',()=>{
  const note = '<img src=x onerror="globalThis.pwned=true"> & </textarea>\nManual note';
  const draft = parseGuidedReport(JSON.stringify(reportOf([row({note})])));
  assert.equal(Object.values(draft.observations)[0].note,note);
  assert.equal(globalThis.pwned,undefined);
  assert.equal(row({note:'x'.repeat(1000)}).note.length,1000);
  for (const note of ['x'.repeat(1001),42,{},null,'bad\0text']) assert.equal(row({note}),null);
});

test('Parser rejects prototype-pollution keys at every nesting level',()=>{
  for (const property of ['__proto__','constructor','prototype']) {
    const value = reportOf([row()]);
    const text = JSON.stringify(value).replace('"coverage":',`"extra":{"${property}":{"polluted":true}},"coverage":`);
    invalidImport(text);
    assert.throws(()=>parseGuidedDraft(`{"schemaVersion":2,"draftType":"guided-device-check-draft","savedAt":"${exportedAt}","${property}":{}}`),{code:'GUIDED_IMPORT_INVALID'});
  }
  assert.equal({}.polluted,undefined);
});

test('Route lookup rejects arrays and objects instead of coercing them into valid route keys',()=>{
  for (const route of [['return-to-list'],['sleep-and-wake'],{toString:null},{},1,null]) {
    assert.equal(observationKey({...configured,route}),null);
    assert.equal(recordDeviceObservation({...configured,route}),null);
    assert.equal(expectedReturn(route,'on'),null);
    const report = reportOf([row()]);
    report.manualObservations[0].route = route;
    invalidImport(report);
  }
});

test('Parser bounds UTF-8 bytes before JSON parsing and rejects malformed or non-report input',()=>{
  assert.throws(()=>parseGuidedReport('x'.repeat(GUIDED_MAX_BYTES+1)),{code:'GUIDED_IMPORT_SIZE'});
  assert.throws(()=>parseGuidedReport('"'+'ä'.repeat(GUIDED_MAX_BYTES/2)+'"'),{code:'GUIDED_IMPORT_SIZE'});
  assert.throws(()=>parseGuidedReport('{'),{code:'GUIDED_IMPORT_JSON'});
  for (const value of [null,[],42,'text']) invalidImport(JSON.stringify(value));
  for (const overrides of [{schemaVersion:3},{reportType:'diagnostics'},{reportLanguage:'fr'},{fileManagerVersion:42},{manualObservations:{}},{diagnosticReads:[]},{diagnosticReads:{}}]) {
    invalidImport({...reportOf([row()]),...overrides});
  }
});

test('Parser rejects wrong enums, types, invalid dates and inconsistent untested records',()=>{
  const changes = [
    {origin:'constructor'},{route:'prototype'},{deviceLanguage:'fr'},{deviceLanguage:[]},
    {resumeSetting:true},{animationSetting:'maybe'},{observed:'success'},{recordedAt:null},
    {recordedAt:'2026-02-30T10:02:00.000Z'},{recordedAt:'2026-11-15T10:02:00Z'},
    {recordedAt:'2026-11-15T11:02:00.000+01:00'},{note:{}},{observationSource:'hardware-verified'},
  ];
  for (const change of changes) {
    const value = reportOf([row()]); Object.assign(value.manualObservations[0],change); invalidImport(value);
  }
  for (const stamp of [null,'2026-13-01T00:00:00.000Z','yesterday','2026-11-15T10:01:59.000Z']) invalidImport({...reportOf([row()]),exportedAt:stamp});
  const legacy = {...reportOf([row()]),schemaVersion:1}; legacy.manualObservations[0].observed = null;
  invalidImport(legacy);
});

test('Duplicate configurations and excessive observation arrays are rejected rather than merged silently',()=>{
  invalidImport({...reportOf([row()]),manualObservations:[row(),row({note:'A different claim'})]});
  invalidImport({...reportOf([]),manualObservations:Array.from({length:GUIDED_MAX_OBSERVATIONS+1},()=>row())});
  assert.throws(()=>createGuidedReport({webVersion:'3.52.0',locale:'de_DE',observations:[row(),row()]}),{code:'GUIDED_IMPORT_INVALID'});
});

test('Diagnostics are bounded, normalized and ordered around the observations',()=>{
  const before = evidenceAt('2026-11-15T10:00:00.000Z','2026-11-15T10:00:01.000Z');
  const after = evidenceAt('2026-11-15T10:02:01.000Z','2026-11-15T10:02:02.000Z');
  const valid = {...reportOf([row()]),diagnosticReads:{before,after}};
  assert.ok(parseGuidedReport(JSON.stringify(valid)).after);
  for (const change of [
    value=>{value.diagnosticReads.before.snapshot.sections.boot.observedAt='2026-11-15T11:00:00.000Z';},
    value=>{value.diagnosticReads.before=evidenceAt('2026-11-15T10:02:01.000Z','2026-11-15T10:02:02.000Z');},
    value=>{value.diagnosticReads.after=evidenceAt('2026-11-15T10:01:58.000Z','2026-11-15T10:01:59.000Z');},
    value=>{value.diagnosticReads.before.snapshot.completedAt='2026-11-15T09:59:59.000Z';},
    value=>{value.diagnosticReads.after.snapshot.sections.runtime.data.memorySamples='lots';},
    value=>{value.diagnosticReads.before.extra='x'.repeat(GUIDED_MAX_SNAPSHOT_BYTES);},
    value=>{value.diagnosticReads.after.buildIdentity.observed.firmwareVersion={version:'2.22.0-DE3.74'};},
    value=>{value.manualObservations=[];},
  ]) {
    const value=structuredClone(valid); change(value); invalidImport(value);
  }
});

test('Local storage parsing also revalidates derived outcomes and never imports device-verification claims',()=>{
  const value=JSON.parse(serializeGuidedDraft({observations:[row()],origin:'amiibo-database',deviceLanguage:'en',resumeSetting:'on',animationSetting:'off'},exportedAt));
  const stored=Object.values(value.observations)[0]; stored.matchesExpectation=false; stored.expected='no-response';
  value.samePhysicalDeviceVerified=true; value.applicationHashVerified=true;
  const restored=parseGuidedDraft(JSON.stringify(value));
  assert.equal(Object.values(restored.observations)[0].matchesExpectation,true);
  assert.equal(restored.samePhysicalDeviceVerified,undefined);
  assert.equal(restored.applicationHashVerified,undefined);
  assert.equal(restored.animationSetting,'off');
  for (const change of [{savedAt:'yesterday'},{schemaVersion:1},{origin:'bad-app'},{resumeSetting:[]},{importedReport:{schemaVersion:99}}]) {
    assert.throws(()=>parseGuidedDraft(JSON.stringify({...value,...change})),{code:'GUIDED_IMPORT_INVALID'});
  }
});

test('Wake expectation follows the manually reported resume setting independently of the UI language',()=>{
  const wake = {...sample,route:'sleep-and-wake',outcome:'main-menu'};
  assert.equal(recordDeviceObservation({...wake,resumeSetting:'off'}).matchesExpectation,true);
  assert.equal(recordDeviceObservation(wake).matchesExpectation,false);
  const unknown = recordDeviceObservation({...wake,resumeSetting:'unspecified',deviceLanguage:'private'});
  assert.equal(unknown.matchesExpectation,null);
  assert.equal(unknown.expected,null);
  assert.equal(unknown.deviceLanguage,null);
});

test('Captured snapshots keep original read times and validated sections, independent of subsequent updates',()=>{
  const raw = diagnosticSnapshot();
  raw.deviceName='PRIVATE'; raw.sections.power.data.notes='PRIVATE NAME'; raw.sections.startup.data.user='PRIVATE FILE';
  const before = captureDeviceEvidence(raw,'2.22.0-DE3.74');
  assert.equal(before.snapshot.completedAt,raw.completedAt);
  assert.equal(before.buildIdentity.observed.firmwareVersion,'2.22.0-DE3.74');
  assert.equal(before.buildIdentity.applicationHashVerified,false);
  assert.equal(before.buildIdentity.observed.applicationBinSha256,null);
  assert.equal(before.buildIdentity.packageReference.applicationCounter,647);
  const saved = before.snapshot.sections.power.data.configuredSleepSeconds;
  raw.sections.power.data.configuredSleepSeconds = 99;
  assert.equal(before.snapshot.sections.power.data.configuredSleepSeconds,saved);
  assert.doesNotMatch(JSON.stringify(before),/PRIVATE/);
  assert.equal(captureDeviceEvidence(null,null),null);
  assert.equal(captureDeviceEvidence({...raw,completedAt:'2020-01-01T00:00:00.000Z'},''),null);
});

test('After snapshot is a separate complete read following recorded observations even when no before was attached',()=>{
  const raw = diagnosticSnapshot();
  const before = captureDeviceEvidence(raw,'2.22.0-DE3.74');
  const observed = '2026-11-15T10:02:00.000Z';
  const after = captureDeviceEvidence({...raw,startedAt:observed,completedAt:'2026-11-15T10:02:01.000Z'},'2.22.0-DE3.74');
  assert.equal(canAttachAfter(before,before,observed),false);
  assert.equal(canAttachAfter(before,after,null),false);
  assert.equal(canAttachAfter(before,after,observed),true);
  assert.equal(canAttachAfter(null,after,observed),true);
  assert.equal(canAttachAfter(null,null,observed),false);
});

test('Manual display Source ID must be twelve hex characters and identifies only a package prefix',()=>{
  for (const invalid of ['',null,'b5793142353','b5793142353e0','[b5793142353e]','b5793142353x','b5793142353e\n']) {
    assert.equal(normalizeSourcePrefix(invalid),null);
    assert.equal(compareManualSourcePrefix(invalid,null,null),null);
  }
  const observed = 'B5793142353E';
  const raw = structuredClone(diagnosticSnapshot()); raw.sections.boot.data.applicationCounter = 647;
  const before = captureDeviceEvidence(raw,'2.22.0-DE3.74');
  const match = compareManualSourcePrefix(observed,before);
  assert.equal(match.comparison,'prefix-match'); assert.equal(match.prefix,observed.toLowerCase());
  assert.equal(match.referenceRead,'before'); assert.equal(match.fullSourceIdVerified,false); assert.equal(match.applicationHashVerified,false);
  assert.equal(compareManualSourcePrefix('000000000000',null,before).comparison,'different-prefix');
  for (const after of [captureDeviceEvidence(raw,'2.22.0-Other'), captureDeviceEvidence(raw,'2.22.0-DE3.75')]) {
    const unknown=compareManualSourcePrefix(observed,before,after);
    assert.equal(unknown.comparison,'unknown'); assert.equal(unknown.expectedPrefix,null); assert.equal(unknown.referenceRead,'after');
  }
  raw.sections.boot.data.applicationCounter = 648;
  const after=captureDeviceEvidence(raw,'2.22.0-DE3.75');
  assert.equal(compareManualSourcePrefix('9bc7578a46f2',before,after).comparison,'prefix-match');
  assert.equal(compareManualSourcePrefix(observed, null, null).comparison,'unknown');
});
