import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {lcdTest688 as ref,lcdTest688Package as pkg} from '../public/dfu/lcd-app688-reference.mjs';
import {lcdTest683 as stable} from '../public/dfu/lcd-app683-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {matchesPrivateStorageIdentity,supportsFolderPublication,firmwareBoard} from '../src/lib/hardware-profile.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {nrfDfuLink} from '../public/dfu/nrf-dfu-link.mjs';
const target=getMigrationCapacityTarget('de43b7');
const boot={chipPart:337970,applicationCounter:688,bootloaderCounter:21,softDeviceVariant:112,softDeviceVersion:7003000,softDeviceFwid:294,
  bootHashValid:true,bootAddressValid:true,bootVectorsValid:true,addressConflict:false,settingsCrcValid:true,softDeviceValid:true,
  bootRegionSha256:'d3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb'};
const build={board:'LCD',sourceId:ref.sourceId};
const layout={...target.layout,mounted:true};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=createRequire(import.meta.url);
const dfu=require('../public/dfu/bundled-packages.js');
test('App688 requires the LCD source identity, Z21, S112, geometry and its own storage engine',()=>{
  assert.equal(firmwareBoard(ref.firmwareVersion),'LCD');
  assert.equal(matchesPrivateStorageIdentity(boot,build,layout,ref.firmwareVersion),true);
  assert.equal(matchesPrivateStorageIdentity(boot,build,layout,stable.firmwareVersion),false);
  assert.equal(matchesPrivateStorageIdentity({...boot,applicationCounter:683},build,layout,ref.firmwareVersion),false);
  const report=diagnosticBuildIdentity({firmwareVersion:ref.firmwareVersion,boot,build:{...build,schemaVersion:1,previousFault:null}});
  assert.equal(report.firmwareReportedSourceRelation,'matches-package');
  assert.equal(report.packageReference.sourceCommit,ref.sourceCommit);
  assert.equal(report.observed.applicationBinSha256,null);
  assert.equal(report.applicationHashVerified,false);
  for(const changed of [{applicationCounter:680},{bootloaderCounter:20},{softDeviceFwid:259},{bootRegionSha256:'0'.repeat(64)},{settingsCrcValid:false},{addressConflict:true}])
    assert.equal(matchesPrivateStorageIdentity({...boot,...changed},build,layout,ref.firmwareVersion),false);
  for(const changed of [{board:'OLED'},{sourceId:stable.sourceId},{sourceId:null}])
    assert.equal(matchesPrivateStorageIdentity(boot,{...build,...changed},layout,ref.firmwareVersion),false);
  for(const changed of [{mounted:false},{engineSha256:getMigrationCapacityTarget('de42').layout.engineSha256},{flashBytes:1048576},{drive:'A'}])
    assert.equal(matchesPrivateStorageIdentity(boot,build,{...layout,...changed},ref.firmwareVersion),false);
  assert.equal(supportsFolderPublication(ref.firmwareVersion,layout.engineSha256),false);
  assert.equal(supportsFolderPublication(ref.firmwareVersion,layout.engineSha256,true),true);
  assert.equal(supportsFolderPublication(stable.firmwareVersion,layout.engineSha256,true),false);
  assert.equal(supportsFolderPublication('2.22.0-DE4.3-b5',layout.engineSha256,true),false);
});
test('App688 library, simulator, DFU and phone ZIP share one exact public prerelease profile',async()=>{
 const wasm=readFileSync(new URL('../public'+target.url,import.meta.url));
 assert.equal(sha(wasm),target.wasmSha256);
 assert.equal(target.firmwareVersion,ref.firmwareVersion);
 assert.equal(target.applicationCounter,ref.applicationCounter);
 assert.equal(target.layout.engineSha256,ref.engineSha256);
 const binary=readFileSync(new URL('../public/firmware/'+pkg.file,import.meta.url));
 assert.equal(sha(binary),pkg.sha256); assert.equal(binary.length,pkg.bytes);
 const zip=await require('../public/dfu/vendor/jszip-3.10.2.min.js').loadAsync(binary,{checkCRC32:true});
 const manifest=JSON.parse(await zip.file('manifest.json').async('text')).manifest;
 assert.deepEqual(Object.keys(manifest),['application']);
 const app=await zip.file(manifest.application.bin_file).async('uint8array');
 assert.equal(sha(app),ref.applicationBinSha256); assert.equal(app.length,ref.applicationBytes);
 assert.equal(ref.releaseTag,'de4.3-b7-lcd-test1');
 assert.equal(ref.hardwareAcceptance,'dfu-and-short-upload-content-raw128-and-stack-readback-on-one-lcd');
 assert.equal(new URL(nrfDfuLink(pkg)).searchParams.get('file'),'https://github.com/bluecyber81/pixl.js/releases/download/de4.3-b7-lcd-test1/Allmiibo_LCD_DE4_3_b7_App688_NUR_APP_TEST.zip');
 assert.equal(nrfDfuLink({...pkg,sha256:stable.otaSha256}),null);
 const catalog=dfu.validateCatalog({schema:1,packages:[pkg]});
 const candidate={archiveBytes:binary.length,archiveSha256:sha(binary),image:{target:{counter:688,hardware:52,softDevices:[294]}}};
 assert.equal(dfu.validatePackage(candidate,'LCD',catalog,[ref]).version,ref.firmwareVersion);
 for(const board of ['OLED','unknown']) assert.throws(()=>dfu.validatePackage(candidate,board,catalog,[ref]));
 assert.throws(()=>dfu.validatePackage({...candidate,archiveSha256:stable.otaSha256},'LCD',catalog,[ref]));
 assert.throws(()=>dfu.validatePackage({...candidate,image:{target:{counter:688,hardware:52,softDevices:[259]}}},'LCD',catalog,[ref]));
 for(const changed of [{sha256:stable.otaSha256},{board:'OLED'},{counter:680},{channel:undefined}])
   assert.throws(()=>dfu.validateCatalog({schema:1,packages:[{...pkg,...changed}]}));
});
