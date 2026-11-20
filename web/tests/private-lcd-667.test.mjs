import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import DfuPackage from '../public/dfu/package.js';
import Bundled from '../public/dfu/bundled-packages.js';
import Updater from '../public/dfu/updater.js';
import {lcdPreview, lcdPreviews} from '../public/dfu/lcd-private-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {buildDiagnosticBoard} from '../src/lib/lcd-build-diagnostics.js';
import {supportsFolderPublication, firmwareBoard, displayBuildReference} from '../src/lib/hardware-profile.js';
import JSZip from '../public/dfu/vendor/jszip-3.10.2.min.js';

const catalog = Bundled.validateCatalog(JSON.parse(readFileSync(new URL('../public/firmware/releases.json', import.meta.url))));
const filename = 'Allmiibo_LCD_DE3_94_667_NUR_APP.zip';
function signedBytes() {
  assert.equal(lcdPreview.artifactStatus, 'experimental-signed-application', 'App667 signed package identity is pending; this final release gate must wait.');
  for (const key of ['sourceId','applicationBinSha256','otaSha256']) assert.match(lcdPreview[key] || '', /^[a-f0-9]{64}$/);
  return readFileSync(new URL('../public/firmware/' + filename, import.meta.url));
}

test('private App667 recognition binds the actual signed application ZIP, BIN and embedded target', async () => {
  const bytes = signedBytes();
  const parsed = new DfuPackage(bytes);
  await parsed.load();
  assert.equal(lcdPreview.firmwareVersion, '2.22.0-DE3.94');
  assert.equal(lcdPreview.applicationCounter, 667);
  assert.equal(parsed.archiveSha256, lcdPreview.otaSha256);
  assert.equal(parsed.archiveBytes, lcdPreview.otaBytes);
  assert.equal(createHash('sha256').update(new Uint8Array(parsed.image.imageData)).digest('hex'), lcdPreview.applicationBinSha256);
  assert.equal(parsed.image.imageData.byteLength, lcdPreview.applicationBytes);
  assert.equal(parsed.image.target.counter, 667);
  assert.equal(parsed.image.target.hardware, 52);
  assert.deepEqual(parsed.image.target.softDevices, [0x0126]);
  assert.equal(Bundled.validatePackage(parsed, 'LCD', catalog, lcdPreviews).version, lcdPreview.firmwareVersion);
  assert.throws(() => Bundled.validatePackage(parsed, 'OLED', catalog, lcdPreviews), /anderen Display/);
  assert.equal(Bundled.validatePackage({...parsed, archiveSha256:'f'.repeat(64)}, 'LCD', catalog, lcdPreviews), undefined);
  assert.equal(Bundled.validatePackage({...parsed, archiveBytes:parsed.archiveBytes + 1}, 'LCD', catalog, lcdPreviews), undefined);
  assert.throws(() => Bundled.validatePackage({...parsed, image:{target:{...parsed.image.target, counter:665}}}, 'LCD', catalog, lcdPreviews), /Startpaket/);
  let state;
  const updater = new Updater({Package:DfuPackage, validatePackage:p=>Bundled.validatePackage(p,'LCD',catalog,lcdPreviews),
    createDfu(){assert.fail('unrequested Bluetooth connection');}, onState:value=>{state=value;}});
  assert.equal(await updater.setPackage(new File([bytes], 'renamed.zip')), true);
  assert.equal(state.previewVersion, '2.22.0-DE3.94');
  assert.equal(state.ready, true);
  assert.equal(catalog.packages[0].counter, 662);
  assert.equal(catalog.packages.some(item => item.counter === 667), false);
  assert.deepEqual(lcdPreviews.map(item => item.applicationCounter), [667,665,664]);
});

test('App667 diagnostics and capacity require the new exact source, counter and engine while retaining previous profiles', () => {
  signedBytes();
  const evidence = JSON.parse(readFileSync(new URL('../../docs/validation/DE3_94_PFS.json', import.meta.url)));
  const version = lcdPreview.firmwareVersion;
  assert.equal(buildDiagnosticBoard(version), 'LCD');
  assert.equal(firmwareBoard(version), 'LCD');
  assert.equal(displayBuildReference(version).controllerDriver, 'ST7567');
  assert.equal(lcdPreview.sourceId, evidence.sourceId);
  assert.equal(lcdPreview.applicationBinSha256, evidence.buildArtifacts['pixljs.bin']);
  assert.equal(lcdPreview.applicationBytes, evidence.elfLoadBytesCompared);
  const boot = {settingsCrcValid:true, applicationCounter:667};
  const build = {schemaVersion:1,board:'LCD',sourceId:lcdPreview.sourceId,previousFault:null};
  const identity = diagnosticBuildIdentity({firmwareVersion:version,boot,build});
  assert.equal(identity.referenceRelation, 'version-and-counter');
  assert.equal(identity.firmwareReportedSourceRelation, 'matches-package');
  assert.equal(identity.applicationHashVerified, false);
  assert.equal(identity.packageReference.artifactStatus, 'experimental-signed-application');
  assert.equal(identity.packageReference.hardwareAcceptance, 'pending');
  assert.equal(diagnosticBuildIdentity({firmwareVersion:version,boot:{...boot,applicationCounter:665},build}).referenceRelation,'different-counter');
  assert.equal(diagnosticBuildIdentity({firmwareVersion:version,boot,build:{...build,sourceId:'a'.repeat(64)}}).firmwareReportedSourceRelation,'differs-from-package');
  const profile = getMigrationCapacityTarget('de394');
  assert.deepEqual(profile.approvedApplications, [{firmwareVersion:version,applicationCounter:667}]);
  assert.equal(profile.layout.engineSha256, evidence.engine.engineSha256);
  assert.equal(profile.wasmSha256, evidence.wasmSha256);
  assert.equal(supportsFolderPublication(version,profile.layout.engineSha256),true);
  for (const previous of ['de392','de391','de389'])
    assert.equal(supportsFolderPublication(version,getMigrationCapacityTarget(previous).layout.engineSha256),false);
  assert.equal(supportsFolderPublication('2.22.0-DE3.92',profile.layout.engineSha256),false);
  assert.equal(supportsFolderPublication('2.22.0-DE3.87-OLEDt6',profile.layout.engineSha256),false);
});

test('the mobile private download points to App667 and refreshes its versioned metadata without promoting the stable catalog', () => {
  const html = readFileSync(new URL('../public/dfu/web.html', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../public/dfu/page.js', import.meta.url), 'utf8');
  assert.match(html, /LCD App667/);
  assert.ok(html.includes('../firmware/' + filename));
  assert.match(html, /DE3\.94 \/ App667/);
  assert.ok(page.includes("'./lcd-private-reference.mjs?v=3.58.4'"));
  assert.equal(catalog.packages[0].version, '2.22.0-DE3.89');
});

test('App667 simulator sources bind the new application while retaining complete reproducible engine sources', async () => {
  signedBytes();
  const name = 'LCD_DE3_94_App667_Simulatorquellen.zip';
  const archiveBytes = readFileSync(new URL('../public/sources/' + name, import.meta.url));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(archiveBytes), 'f0ed195280830e35f7f4008841d572b131c8321a376bbc813d96b3064bd965e6');
  const archive = await JSZip.loadAsync(archiveBytes, {checkCRC32:true});
  const bytes = async path => {
    const entry = archive.file(path);
    assert.ok(entry, 'Missing simulator source archive entry: ' + path);
    return Buffer.from(await entry.async('uint8array'));
  };
  const binding = JSON.parse(await bytes('APP667_BINDING.json'));
  assert.equal(binding.firmwareVersion, lcdPreview.firmwareVersion);
  assert.equal(binding.applicationCounter, lcdPreview.applicationCounter);
  assert.equal(binding.sourceId, lcdPreview.sourceId);
  assert.equal(binding.applicationBytes, lcdPreview.applicationBytes);
  assert.equal(binding.applicationBinSha256, lcdPreview.applicationBinSha256);
  assert.equal(binding.productionCommit, '1d606c9faeedbb1fe31fb2c4547ad47818c04b75');
  assert.equal(binding.capacityProfile, 'de394');
  assert.equal(binding.simulatorProfile, 'de393');
  assert.equal(binding.hardwareAcceptance, 'pending');
  const qualification = await bytes(binding.qualification.path);
  assert.equal(sha(qualification), binding.qualification.sha256);
  assert.deepEqual(qualification, readFileSync(new URL('../../' + binding.qualification.path, import.meta.url)));
  assert.equal(JSON.parse(qualification).sourceId, lcdPreview.sourceId);
  const snapshot = binding.sourceSnapshot.path;
  const sourceBindingBytes = await bytes(snapshot + '/SOURCE_BINDING.json');
  assert.equal(sha(sourceBindingBytes), binding.sourceSnapshot.sourceBindingSha256);
  const sourceBinding = JSON.parse(sourceBindingBytes);
  assert.equal(sourceBinding.engineSha256, binding.engineSha256);
  assert.equal(sourceBinding.wasmSha256, binding.wasm.sha256);
  assert.deepEqual(sourceBinding.sourceFiles, binding.sourceSnapshot.sourceFiles);
  assert.equal(Object.keys(sourceBinding.sourceFiles).length, 12);
  for (const [name, expected] of Object.entries(sourceBinding.sourceFiles)) {
    const path = snapshot + '/' + name, content = await bytes(path);
    assert.equal(sha(content), expected, path);
    assert.deepEqual(content, readFileSync(new URL('../../' + path, import.meta.url)), path);
  }
  for (const name of ['GPL-2.0-LICENSE','LITTLEFS-LICENSE.md','SOURCE.txt','ENGINE_IDENTITY.json']) {
    const path = snapshot + '/' + name;
    assert.deepEqual(await bytes(path), readFileSync(new URL('../../' + path, import.meta.url)), path);
  }
  const builder = 'web/scripts/build-capacity-de393.py';
  assert.deepEqual(await bytes(builder), readFileSync(new URL('../../' + builder, import.meta.url)));
  const wasm = await bytes(binding.wasm.path);
  assert.equal(sha(wasm), binding.wasm.sha256);
  assert.equal(wasm.length, binding.wasm.bytes);
  assert.deepEqual(wasm, readFileSync(new URL('../../' + binding.wasm.path, import.meta.url)));
  assert.match((await bytes('README_APP667.txt')).toString(), /APP667_BINDING\.json/);
  const notices = readFileSync(new URL('../scripts/copy-license-notices.mjs', import.meta.url), 'utf8');
  assert.ok(notices.includes('href="../sources/' + name + '" download'));
});
