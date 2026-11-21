import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Bundled from '../public/dfu/bundled-packages.js';
import {lcdPreview, lcdPreview668, lcdPreview667, lcdPreview665, lcdPreviousPreview, lcdPreviews,
  lcdPreviewPackage, lcdPreviewPackage668, lcdPreviewPackage667, lcdPreviewPackages} from '../public/dfu/lcd-private-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {buildDiagnosticBoard} from '../src/lib/lcd-build-diagnostics.js';
import {LCD_Z21_COUNTERS, supportsFolderPublication, firmwareBoard, displayBuildReference} from '../src/lib/hardware-profile.js';

const target = getMigrationCapacityTarget('de396');
const catalog = Bundled.validateCatalog(JSON.parse(readFileSync(new URL('../public/firmware/releases.json',import.meta.url))));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('current App669 signed reference is bound to its actual application and qualified engine', () => {
  const qualification = JSON.parse(readFileSync(new URL('../../docs/validation/DE3_96_PFS.json',import.meta.url)));
  assert.equal(lcdPreview.firmwareVersion,'2.22.0-DE3.96');
  assert.equal(lcdPreview.applicationCounter,669);
  assert.equal(lcdPreview.board,'LCD');
  assert.equal(lcdPreview.hardwareAcceptance,'pending');
  assert.equal(lcdPreview.artifactStatus,'experimental-signed-application');
  for (const key of ['sourceId','applicationBinSha256','otaSha256']) assert.match(lcdPreview[key],/^[a-f0-9]{64}$/);
  assert.equal(lcdPreview.sourceId,qualification.sourceId);
  assert.equal(lcdPreview.applicationBinSha256,qualification.buildArtifacts['pixljs.bin']);
  assert.equal(lcdPreview.applicationBytes,qualification.elfLoadBytesCompared);
  assert.equal(lcdPreview.productionCommit,'feb6c58ad14998f31aef07dc84d8dc0732e32ede');
  assert.equal(lcdPreview.sourceCommit,'feb6c58ad14998f31aef07dc84d8dc0732e32ede');
  assert.match(lcdPreview.validationCommit,/^[a-f0-9]{40}$/);
  assert.equal(target.approved,true);
  assert.deepEqual(target.approvedApplications,[{firmwareVersion:lcdPreview.firmwareVersion,applicationCounter:669}]);
});

test('App669 build comparison distinguishes source observations from complete application identity', () => {
  const options = {firmwareVersion:lcdPreview.firmwareVersion,boot:{settingsCrcValid:true,applicationCounter:669},
    build:{schemaVersion:1,board:'LCD',sourceId:lcdPreview.sourceId,previousFault:null}};
  const report = diagnosticBuildIdentity(options);
  assert.equal(report.observed.sourceId,lcdPreview.sourceId);
  assert.equal(report.referenceRelation,'version-and-counter');
  assert.equal(report.firmwareReportedSourceRelation,'matches-package');
  assert.equal(report.packageReference.artifactStatus,lcdPreview.artifactStatus);
  assert.equal(report.applicationHashVerified,false);
  assert.equal(report.samePhysicalDeviceVerified,false);
  assert.equal(report.observed.applicationBinSha256,null);
  assert.equal(diagnosticBuildIdentity({...options,build:{...options.build,sourceId:lcdPreview667.sourceId}}).firmwareReportedSourceRelation,'differs-from-package');
  assert.equal(diagnosticBuildIdentity({...options,build:undefined}).observed.sourceId,null);
});

test('App669 recognition is explicit and separate from future firmware and OLED', () => {
  assert.equal(LCD_Z21_COUNTERS[lcdPreview.firmwareVersion],669);
  assert.equal(firmwareBoard(lcdPreview.firmwareVersion),'LCD');
  assert.equal(buildDiagnosticBoard(lcdPreview.firmwareVersion),'LCD');
  assert.equal(displayBuildReference(lcdPreview.firmwareVersion).controllerDriver,'ST7567');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.97'),null);
  assert.equal(LCD_Z21_COUNTERS['2.22.0-DE3.96-OLEDt7'],undefined);
  assert.equal(supportsFolderPublication(lcdPreview.firmwareVersion,target.layout.engineSha256),true);
  assert.equal(supportsFolderPublication('2.22.0-DE3.87-OLEDt6',target.layout.engineSha256),false);
});

test('App669 has its own WASM and engine while App667 keeps the identical historical de393 simulator', () => {
  const previous = getMigrationCapacityTarget('de394'), historical = getMigrationCapacityTarget('de393');
  assert.notEqual(target,previous);
  assert.notEqual(target.layout,previous.layout);
  assert.notEqual(target.approvedApplications,previous.approvedApplications);
  assert.equal(target.url,'/lfs-capacity-de396.wasm');
  assert.notEqual(target.wasmSha256,previous.wasmSha256);
  assert.notEqual(target.layout.engineSha256,previous.layout.engineSha256);
  assert.equal(previous.url,historical.url);
  assert.equal(previous.wasmSha256,historical.wasmSha256);
  assert.equal(previous.layout.engineSha256,historical.layout.engineSha256);
  assert.equal(sha(readFileSync(new URL('../public'+target.url,import.meta.url))),target.wasmSha256);
  for (const value of [target,target.layout,target.geometry,target.approvedApplications]) assert(Object.isFrozen(value));
});

test('historical private identities and stable/OLED catalogues remain unchanged and separate', () => {
  assert.deepEqual(lcdPreviews.map(item=>item.applicationCounter),[669,668,667,665,664]);
  assert.equal(lcdPreview668.otaSha256,'ce2bfa724cec1a7f8a6004c95434ac7fd016af68c7f0bf1f63de280bea47651b');
  assert.equal(lcdPreview667.otaSha256,'f00ddc2c86225d86e5c9ef50bad9d45b84250b287a4f3df4d2f169357a9688c4');
  assert.equal(lcdPreview667.sourceCommit,'22d5c92cc566fb7da9d43a538f2818d28bfb72a6');
  assert.equal(lcdPreview665.otaSha256,'65e9321309dc059b88adc490963c787fdbc01e35e201765b7cbb8d3ecd66e3a0');
  assert.equal(lcdPreviousPreview.otaSha256,'b3b0c8f967d3b3886680cfb5049635b5297591c16495dd74e1779654cfd0687e');
  assert.equal(catalog.packages[0].counter,662);
  assert.equal(catalog.packages.some(item=>[666,667,668,669].includes(item.counter)),false);
  const oldCandidate={archiveSha256:'b2a2f5f13659ef8ca5ebc7d53e320951a6cee3691fcb7054e7d513cde9caa81e',archiveBytes:358565,
    image:{target:{counter:666,hardware:52,softDevices:[0x0126]}}};
  assert.equal(Bundled.validatePackage(oldCandidate,'LCD',catalog,lcdPreviews),undefined);
  assert.equal(existsSync(new URL('../public/firmware/Allmiibo_LCD_DE3_93_666_NUR_APP.zip',import.meta.url)),false);
  assert.equal(existsSync(new URL('../public/sources/LCD_DE3_93_App666_Simulatorquellen.zip',import.meta.url)),false);
});

test('both current and historical direct-load packages have complete distinct catalog identities', () => {
  const original = JSON.stringify(catalog);
  const runtime = Bundled.validateCatalog({schema:catalog.schema,packages:[...catalog.packages,...lcdPreviewPackages]});
  assert.deepEqual(lcdPreviewPackages,[lcdPreviewPackage,lcdPreviewPackage668,lcdPreviewPackage667]);
  assert.deepEqual(lcdPreviewPackages.map(entry=>entry.counter),[669,668,667]);
  assert.equal(runtime.packages.at(-3).id,'de3.96-lcd-app-test1');
  assert.equal(runtime.packages.at(-2).id,'de3.95-lcd-app');
  assert.equal(runtime.packages.at(-1).id,'de3.94-lcd-app');
  assert.equal(JSON.stringify(catalog),original);
  for (const entry of lcdPreviewPackages) {
    const bytes=readFileSync(new URL('../public/firmware/'+entry.file,import.meta.url));
    assert.equal(bytes.byteLength,entry.bytes);
    assert.equal(sha(bytes),entry.sha256);
    assert(Object.isFrozen(entry));
  }
});

test('mobile current App669 download and build label point to the actual new package', () => {
  const html=readFileSync(new URL('../public/dfu/web.html',import.meta.url),'utf8');
  assert.match(html,/LCD App669/);
  assert.match(html,/DE3\.96 \/ App669 TEST1/);
  assert.doesNotMatch(html,/DE3_93_666|App666/);
  assert.match(html,/href="\.\.\/firmware\/Allmiibo_LCD_DE3_96_669_TEST1_NUR_APP\.zip"/);
  assert.match(readFileSync(new URL('../.env',import.meta.url),'utf8'),/LCD DE3\.96 \/ App669 TEST1/);
});
