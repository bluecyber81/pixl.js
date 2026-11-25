import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {nrfDfuLink} from '../public/dfu/nrf-dfu-link.mjs';
import Bundled from '../public/dfu/bundled-packages.js';
import {lcdPreview, lcdPreview670, lcdPreview669, lcdPreview668, lcdPreview667, lcdPreview665, lcdPreviousPreview, lcdPreviews,
  lcdPreviewPackage, lcdPreviewPackage670, lcdPreviewPackage669, lcdPreviewPackage668, lcdPreviewPackage667, lcdPreviewPackages} from '../public/dfu/lcd-private-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {buildDiagnosticBoard} from '../src/lib/lcd-build-diagnostics.js';
import {LCD_Z21_COUNTERS, supportsFolderPublication, firmwareBoard, displayBuildReference} from '../src/lib/hardware-profile.js';

const target669 = getMigrationCapacityTarget('de396');
const target670 = getMigrationCapacityTarget('de397');
const catalog = Bundled.validateCatalog(JSON.parse(readFileSync(new URL('../public/firmware/releases.json',import.meta.url))));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('retained App669 signed reference is bound to its actual application and qualified engine', () => {
  const qualification = JSON.parse(readFileSync(new URL('../../docs/validation/DE3_96_PFS.json',import.meta.url)));
  assert.equal(lcdPreview669.firmwareVersion,'2.22.0-DE3.96');
  assert.equal(lcdPreview669.applicationCounter,669);
  assert.equal(lcdPreview669.board,'LCD');
  assert.equal(lcdPreview669.hardwareAcceptance,'pending');
  assert.equal(lcdPreview669.artifactStatus,'experimental-signed-application');
  for (const key of ['sourceId','applicationBinSha256','otaSha256']) assert.match(lcdPreview669[key],/^[a-f0-9]{64}$/);
  assert.equal(lcdPreview669.sourceId,qualification.sourceId);
  assert.equal(lcdPreview669.applicationBinSha256,qualification.buildArtifacts['pixljs.bin']);
  assert.equal(lcdPreview669.applicationBytes,qualification.elfLoadBytesCompared);
  assert.equal(lcdPreview669.productionCommit,'feb6c58ad14998f31aef07dc84d8dc0732e32ede');
  assert.equal(lcdPreview669.sourceCommit,'feb6c58ad14998f31aef07dc84d8dc0732e32ede');
  assert.match(lcdPreview669.validationCommit,/^[a-f0-9]{40}$/);
  assert.equal(target669.approved,true);
  assert.deepEqual(target669.approvedApplications,[{firmwareVersion:lcdPreview669.firmwareVersion,applicationCounter:669}]);
});

test('App669 build comparison distinguishes source observations from complete application identity', () => {
  const options = {firmwareVersion:lcdPreview669.firmwareVersion,boot:{settingsCrcValid:true,applicationCounter:669},
    build:{schemaVersion:1,board:'LCD',sourceId:lcdPreview669.sourceId,previousFault:null}};
  const report = diagnosticBuildIdentity(options);
  assert.equal(report.observed.sourceId,lcdPreview669.sourceId);
  assert.equal(report.referenceRelation,'version-and-counter');
  assert.equal(report.firmwareReportedSourceRelation,'matches-package');
  assert.equal(report.packageReference.artifactStatus,lcdPreview669.artifactStatus);
  assert.equal(report.applicationHashVerified,false);
  assert.equal(report.samePhysicalDeviceVerified,false);
  assert.equal(report.observed.applicationBinSha256,null);
  assert.equal(diagnosticBuildIdentity({...options,build:{...options.build,sourceId:lcdPreview667.sourceId}}).firmwareReportedSourceRelation,'differs-from-package');
  assert.equal(diagnosticBuildIdentity({...options,build:undefined}).observed.sourceId,null);
});

test('App669 recognition is explicit and separate from future firmware and OLED', () => {
  assert.equal(LCD_Z21_COUNTERS[lcdPreview669.firmwareVersion],669);
  assert.equal(firmwareBoard(lcdPreview669.firmwareVersion),'LCD');
  assert.equal(buildDiagnosticBoard(lcdPreview669.firmwareVersion),'LCD');
  assert.equal(displayBuildReference(lcdPreview669.firmwareVersion).controllerDriver,'ST7567');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.105'),null);
  assert.equal(LCD_Z21_COUNTERS['2.22.0-DE3.96-OLEDt7'],undefined);
  assert.equal(supportsFolderPublication(lcdPreview669.firmwareVersion,target669.layout.engineSha256),true);
  assert.equal(supportsFolderPublication('2.22.0-DE3.87-OLEDt6',target669.layout.engineSha256),false);
});

test('App669 has its own WASM and engine while App667 keeps the identical historical de393 simulator', () => {
  const previous = getMigrationCapacityTarget('de394'), historical = getMigrationCapacityTarget('de393');
  assert.notEqual(target669,previous);
  assert.notEqual(target669.layout,previous.layout);
  assert.notEqual(target669.approvedApplications,previous.approvedApplications);
  assert.equal(target669.url,'/lfs-capacity-de396.wasm');
  assert.notEqual(target669.wasmSha256,previous.wasmSha256);
  assert.notEqual(target669.layout.engineSha256,previous.layout.engineSha256);
  assert.equal(previous.url,historical.url);
  assert.equal(previous.wasmSha256,historical.wasmSha256);
  assert.equal(previous.layout.engineSha256,historical.layout.engineSha256);
  assert.equal(sha(readFileSync(new URL('../public'+target669.url,import.meta.url))),target669.wasmSha256);
  for (const value of [target669,target669.layout,target669.geometry,target669.approvedApplications]) assert(Object.isFrozen(value));
});

test('historical private identities and packages remain separate from the new normal App678 release', () => {
  assert.deepEqual(lcdPreviews.map(item=>item.applicationCounter),[670,669,668,667,665,664]);
  assert.equal(lcdPreview668.otaSha256,'ce2bfa724cec1a7f8a6004c95434ac7fd016af68c7f0bf1f63de280bea47651b');
  assert.equal(lcdPreview667.otaSha256,'f00ddc2c86225d86e5c9ef50bad9d45b84250b287a4f3df4d2f169357a9688c4');
  assert.equal(lcdPreview667.sourceCommit,'22d5c92cc566fb7da9d43a538f2818d28bfb72a6');
  assert.equal(lcdPreview665.otaSha256,'65e9321309dc059b88adc490963c787fdbc01e35e201765b7cbb8d3ecd66e3a0');
  assert.equal(lcdPreviousPreview.otaSha256,'b3b0c8f967d3b3886680cfb5049635b5297591c16495dd74e1779654cfd0687e');
  assert.equal(catalog.packages[0].counter,678);
  assert.equal(catalog.packages.find(item=>item.id==='de3.89-lcd-app').counter,662);
  assert.equal(catalog.packages.find(item=>item.id==='de3.100-lcd-app').counter,673);
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.100'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE4.1'),'LCD');
  assert.equal(catalog.packages.some(item=>[666,667,668,669,670].includes(item.counter)),false);
  const oldCandidate={archiveSha256:'b2a2f5f13659ef8ca5ebc7d53e320951a6cee3691fcb7054e7d513cde9caa81e',archiveBytes:358565,
    image:{target:{counter:666,hardware:52,softDevices:[0x0126]}}};
  assert.equal(Bundled.validatePackage(oldCandidate,'LCD',catalog,lcdPreviews),undefined);
  assert.equal(existsSync(new URL('../public/firmware/Allmiibo_LCD_DE3_93_666_NUR_APP.zip',import.meta.url)),false);
  assert.equal(existsSync(new URL('../public/sources/LCD_DE3_93_App666_Simulatorquellen.zip',import.meta.url)),false);
});

test('retained signed direct-load packages have complete distinct catalog identities', () => {
  const original = JSON.stringify(catalog);
  const runtime = Bundled.validateCatalog({schema:catalog.schema,packages:[...catalog.packages,...lcdPreviewPackages]});
  assert.deepEqual(lcdPreviewPackages,[lcdPreviewPackage670,lcdPreviewPackage669,lcdPreviewPackage668,lcdPreviewPackage667]);
  assert.deepEqual(lcdPreviewPackages.map(entry=>entry.counter),[670,669,668,667]);
  assert.equal(runtime.packages.at(-4).id,'de3.97-lcd-app-test1');
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

test('mobile normal App678 download uses its own package while historical TEST1 references remain available', () => {
  const html=readFileSync(new URL('../public/dfu/web.html',import.meta.url),'utf8');
  assert.match(html,/LCD App678/);
  assert.match(html,/App678: Normale Firmware/);
  assert.doesNotMatch(html,/App678 TEST|App678.*(?:am Gerät bestanden|physically verified)/);
  assert.match(html,/DE4\.1 \/ App678/);
  assert.doesNotMatch(html,/DE3_93_666|App666/);
  assert.ok(html.includes('href="https://github.com/bluecyber81/pixl.js/releases/download/de4.1/Allmiibo_LCD_DE4_1_678_NUR_APP.zip"'));
  assert.match(readFileSync(new URL('../.env',import.meta.url),'utf8'),/LCD DE4\.1 \/ App678/);
});


test('retained App670 signed test reference has exact qualified source, binary and OTA identities', () => {
  const qualification = JSON.parse(readFileSync(new URL('../../docs/validation/DE3_97_PFS.json',import.meta.url)));
  assert.equal(lcdPreview,lcdPreview670);
  assert.equal(lcdPreview.firmwareVersion,'2.22.0-DE3.97');
  assert.equal(lcdPreview.applicationCounter,670);
  assert.equal(lcdPreview.board,'LCD');
  assert.equal(lcdPreview.testLabel,'TEST1');
  assert.equal(lcdPreview.artifactStatus,'experimental-signed-application');
  assert.equal(lcdPreview.hardwareAcceptance,'pending');
  assert.equal(lcdPreview.sourceId,qualification.sourceId);
  assert.equal(lcdPreview.applicationBinSha256,qualification.buildArtifacts['pixljs.bin']);
  assert.equal(lcdPreview.applicationBytes,qualification.elfLoadBytesCompared);
  assert.equal(lcdPreview.productionCommit,'d34ecb44fa058a149b58de2dcbffbb751c015864');
  assert.equal(lcdPreview.sourceCommit,lcdPreview.productionCommit);
  assert.equal(lcdPreview.localProductionCommit,'91364b0b349905bc09351b5b151bf271b03ab850');
  assert.equal(lcdPreview.validationCommit,'898ba1bb46db2e67e3cc6a0216aefa3db4368f70');
  assert.equal(lcdPreview.otaSha256,'ff2c056d66f423afade03a47b730f92033645f0db9d74f946cbafd65734d7786');
  assert.equal(lcdPreview.otaBytes,364489);
  assert.equal(lcdPreviewPackage670.counter,670);
  assert.equal(lcdPreviewPackage,lcdPreviewPackage670);
  assert.equal(lcdPreviewPackages.some(entry=>entry.counter===670),true);
  assert.equal(existsSync(new URL('../public/firmware/Allmiibo_LCD_DE3_97_670_TEST1_NUR_APP.zip',import.meta.url)),true);
  assert.equal(target670.approved,true);
  assert.deepEqual(target670.approvedApplications,[{firmwareVersion:lcdPreview.firmwareVersion,applicationCounter:670}]);
  assert.equal(target670.url,'/lfs-capacity-de397.wasm');
  assert.equal(sha(readFileSync(new URL('../public'+target670.url,import.meta.url))),target670.wasmSha256);
  assert.notEqual(target670.layout.engineSha256,target669.layout.engineSha256);
});

test('App670 diagnostic source matching still does not prove the installed application hash or physical identity', () => {
  const options={firmwareVersion:lcdPreview.firmwareVersion,boot:{settingsCrcValid:true,applicationCounter:670},
    build:{schemaVersion:1,board:'LCD',sourceId:lcdPreview.sourceId,previousFault:null}};
  const report=diagnosticBuildIdentity(options);
  assert.equal(report.referenceRelation,'version-and-counter');
  assert.equal(report.firmwareReportedSourceRelation,'matches-package');
  assert.equal(report.packageReference.artifactStatus,'experimental-signed-application');
  assert.equal(report.packageReference.otaSha256,lcdPreview.otaSha256);
  assert.equal(report.applicationHashVerified,false);
  assert.equal(report.samePhysicalDeviceVerified,false);
  assert.equal(report.observed.applicationBinSha256,null);
  assert.equal(diagnosticBuildIdentity({...options,boot:{settingsCrcValid:true,applicationCounter:669}}).referenceRelation,'different-counter');
  assert.equal(diagnosticBuildIdentity({...options,build:{...options.build,sourceId:lcdPreview669.sourceId}}).firmwareReportedSourceRelation,'differs-from-package');
  assert.equal(LCD_Z21_COUNTERS[lcdPreview.firmwareVersion],670);
  assert.equal(LCD_Z21_COUNTERS['2.22.0-DE3.97-OLEDt7'],undefined);
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.105'),null);
});

test('App670 TEST1 catalogue and native handoff require the exact isolated profile', () => {
  assert.doesNotThrow(()=>Bundled.validateCatalog({schema:1,packages:[lcdPreviewPackage670]}));
  const link=new URL(nrfDfuLink(lcdPreviewPackage670));
  assert.equal(link.searchParams.get('file'),'https://bluecyber81.github.io/pixl.js/test/app670/firmware/'+lcdPreviewPackage670.file);
  assert.equal(link.hash,'');
  for (const changed of [{id:'de3.97-lcd-app',file:'Allmiibo_LCD_DE3_97_670_NUR_APP.zip'},
    {counter:669},{version:'2.22.0-DE3.98'},{board:'OLED'},{bootloader:'Z19'},
    {softDevice:'S112 7.2.0'},{migrationRequired:true},{applicationOnly:false},{channel:'stable'},
    {file:'../Allmiibo_LCD_DE3_97_670_TEST1_NUR_APP.zip'},{storage:'SPIFFS'}]) {
    const entry={...lcdPreviewPackage670,...changed};
    assert.throws(()=>Bundled.validateCatalog({schema:1,packages:[entry]}));
    assert.equal(nrfDfuLink(entry),null);
  }
  for(const changed of [{bytes:null},{sha256:null},{sha256:'0'.repeat(64)}])
    assert.throws(()=>Bundled.validateCatalog({schema:1,packages:[{...lcdPreviewPackage670,...changed}]}));
  const oldLink=new URL(nrfDfuLink(lcdPreviewPackage669));
  assert.equal(oldLink.searchParams.get('file'),'https://bluecyber81.github.io/pixl.js/test/app669/firmware/'+lcdPreviewPackage669.file);
});
