import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticSnapshot } from './fixtures/diagnostic-overview-data.mjs';
import { canAttachAfter, captureDeviceEvidence, compareManualSourcePrefix, createGuidedReport, normalizeSourcePrefix, recordDeviceObservation } from '../src/lib/guided-device-check.js';

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
  assert.equal(report.manualObservations.length,4);
  assert.equal(report.manualObservations.filter(row=>row.recordedAt).length,1);
  assert.deepEqual(report.diagnosticReads,{before:null,after:null});
  assert.equal(report.samePhysicalDeviceVerified,false);
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
