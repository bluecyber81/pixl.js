import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Bundled from '../public/dfu/bundled-packages.js';
import {lcdPreview, lcdPreview665, lcdPreviousPreview, lcdPreviews} from '../public/dfu/lcd-private-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {simulateCapacity} from '../src/lib/migration-capacity-engine.js';
import {buildDiagnosticBoard} from '../src/lib/lcd-build-diagnostics.js';
import {LCD_Z21_COUNTERS, supportsFolderPublication, firmwareBoard, displayBuildReference} from '../src/lib/hardware-profile.js';

const pending = lcdPreview.artifactStatus === 'pending-build';
const target = getMigrationCapacityTarget('de394');
const hashFields = ['sourceId','applicationBinSha256','otaSha256'];
const allIdentityFields = [...hashFields,'sourceCommit','validationCommit','applicationBytes','otaBytes'];
const catalog = Bundled.validateCatalog(JSON.parse(readFileSync(new URL('../public/firmware/releases.json',import.meta.url))));

test(`App667 ${pending ? 'pending' : 'signed'} reference has no borrowed package identity`, () => {
  assert.equal(lcdPreview.firmwareVersion,'2.22.0-DE3.94');
  assert.equal(lcdPreview.applicationCounter,667);
  assert.equal(lcdPreview.board,'LCD');
  assert.equal(lcdPreview.hardwareAcceptance,'pending');
  if (pending) {
    for (const key of allIdentityFields) assert.equal(lcdPreview[key],null,key);
    assert.equal(target.approved,false);
    assert.deepEqual(target.approvedApplications,[]);
    assert.equal(existsSync(new URL('../public/firmware/Allmiibo_LCD_DE3_94_667_NUR_APP.zip',import.meta.url)),false);
  } else {
    assert.equal(lcdPreview.artifactStatus,'experimental-signed-application');
    for (const key of hashFields) assert.match(lcdPreview[key],/^[a-f0-9]{64}$/);
    for (const key of ['sourceCommit','validationCommit']) assert.match(lcdPreview[key],/^[a-f0-9]{40}$/);
    for (const key of ['applicationBytes','otaBytes']) assert(Number.isSafeInteger(lcdPreview[key]) && lcdPreview[key]>0);
    assert.equal(target.approved,true);
    assert.deepEqual(target.approvedApplications,[{firmwareVersion:lcdPreview.firmwareVersion,applicationCounter:667}]);
  }
});

test('pending metadata cannot fabricate a firmware SourceID match or mismatch', () => {
  const syntheticSource = pending ? 'a'.repeat(64) : lcdPreview.sourceId;
  const report = diagnosticBuildIdentity({firmwareVersion:lcdPreview.firmwareVersion,
    boot:{settingsCrcValid:true,applicationCounter:667},
    build:{schemaVersion:1,board:'LCD',sourceId:syntheticSource,previousFault:null}});
  assert.equal(report.observed.sourceId,syntheticSource);
  assert.equal(report.referenceRelation,'version-and-counter');
  assert.equal(report.packageReference.artifactStatus,lcdPreview.artifactStatus);
  assert.equal(report.firmwareReportedSourceRelation,pending ? null : 'matches-package');
  assert.equal(report.applicationHashVerified,false);
  assert.equal(report.samePhysicalDeviceVerified,false);
});

test('App667 recognition remains explicit and separate from unknown future firmware and OLED', () => {
  assert.equal(LCD_Z21_COUNTERS[lcdPreview.firmwareVersion],667);
  assert.equal(firmwareBoard(lcdPreview.firmwareVersion),'LCD');
  assert.equal(buildDiagnosticBoard(lcdPreview.firmwareVersion),'LCD');
  assert.equal(displayBuildReference(lcdPreview.firmwareVersion).controllerDriver,'ST7567');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.95'),null);
  assert.equal(LCD_Z21_COUNTERS['2.22.0-DE3.94-OLEDt7'],undefined);
  assert.equal(supportsFolderPublication(lcdPreview.firmwareVersion,target.layout.engineSha256),!pending);
  assert.equal(supportsFolderPublication('2.22.0-DE3.87-OLEDt6',target.layout.engineSha256),false);
});

test('App667 reuses exact simulator bytes without inheriting App666 firmware approval', async () => {
  const previous = getMigrationCapacityTarget('de393');
  assert.notEqual(target,previous);
  assert.notEqual(target.layout,previous.layout);
  assert.notEqual(target.approvedApplications,previous.approvedApplications);
  assert.equal(target.url,'/lfs-capacity-de393.wasm');
  assert.equal(target.wasmSha256,previous.wasmSha256);
  assert.equal(target.layout.engineSha256,previous.layout.engineSha256);
  const bytes = readFileSync(new URL('../public'+target.url,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),target.wasmSha256);
  for (const value of [target,target.layout,target.geometry,target.approvedApplications]) assert(Object.isFrozen(value));
  if (pending) {
    await assert.rejects(simulateCapacity([],target,{archiveSha256:'ab'.repeat(32),
      fetchImpl:()=>assert.fail('An unqualified App667 profile must not fetch or execute WASM')}),{code:'MIGRATION_CAPACITY'});
  }
});

test('older private package identities and public stable/OLED catalogs stay separate', () => {
  assert.deepEqual(lcdPreviews.map(item=>item.applicationCounter),[667,665,664]);
  assert.equal(lcdPreview665.otaSha256,'65e9321309dc059b88adc490963c787fdbc01e35e201765b7cbb8d3ecd66e3a0');
  assert.equal(lcdPreviousPreview.otaSha256,'b3b0c8f967d3b3886680cfb5049635b5297591c16495dd74e1779654cfd0687e');
  assert.equal(catalog.packages[0].counter,662);
  assert.equal(catalog.packages.some(item=>[666,667].includes(item.counter)),false);
  const oldCandidate={archiveSha256:'b2a2f5f13659ef8ca5ebc7d53e320951a6cee3691fcb7054e7d513cde9caa81e',archiveBytes:358565,
    image:{target:{counter:666,hardware:52,softDevices:[0x0126]}}};
  assert.equal(Bundled.validatePackage(oldCandidate,'LCD',catalog,lcdPreviews),undefined);
  assert.equal(existsSync(new URL('../public/firmware/Allmiibo_LCD_DE3_93_666_NUR_APP.zip',import.meta.url)),false);
  assert.equal(existsSync(new URL('../public/sources/LCD_DE3_93_App666_Simulatorquellen.zip',import.meta.url)),false);
});

test('mobile App667 preparation cannot advertise a nonexistent signed download', () => {
  const html=readFileSync(new URL('../public/dfu/web.html',import.meta.url),'utf8');
  assert.match(html,/LCD App667/);
  assert.match(html,/DE3\.94 \/ App667/);
  assert.doesNotMatch(html,/DE3_93_666|App666/);
  if (pending) {
    assert.match(html,/App667 wird vorbereitet/);
    assert.doesNotMatch(html,/href="[^"]*Allmiibo_LCD_DE3_94_667_NUR_APP\.zip/);
  } else {
    assert.match(html,/href="\.\.\/firmware\/Allmiibo_LCD_DE3_94_667_NUR_APP\.zip"/);
  }
});
