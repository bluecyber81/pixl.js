import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from '../public/dfu/vendor/jszip-3.10.2.min.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {supportsFolderPublication, firmwareBoard, displayBuildReference} from '../src/lib/hardware-profile.js';

const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const qualification = JSON.parse(read('docs/validation/DE3_95_PFS.json'));
const sourcePath = 'web/third-party/packed-simulator-de395';

test('App668 capacity uses the newly qualified engine and retains exact separate historical profiles', () => {
  const profile = getMigrationCapacityTarget('de395');
  assert.equal(profile.approved, true);
  assert.deepEqual(profile.approvedApplications, [{firmwareVersion:'2.22.0-DE3.95',applicationCounter:668}]);
  assert.equal(profile.layout.engineSha256, qualification.engine.engineSha256);
  assert.equal(profile.wasmSha256, qualification.wasmSha256);
  assert.equal(firmwareBoard(profile.firmwareVersion), 'LCD');
  assert.equal(displayBuildReference(profile.firmwareVersion).controllerDriver, 'ST7567');
  assert.equal(supportsFolderPublication(profile.firmwareVersion, profile.layout.engineSha256), true);
  for (const id of ['de394','de392','de391','de389']) {
    const previous = getMigrationCapacityTarget(id);
    assert.equal(supportsFolderPublication(profile.firmwareVersion, previous.layout.engineSha256), false);
    assert.equal(supportsFolderPublication(previous.firmwareVersion, profile.layout.engineSha256), false);
  }
  for (const version of ['2.22.0-DE3.96','2.22.0-DE3.95-OLEDt7'])
    assert.equal(supportsFolderPublication(version, profile.layout.engineSha256), false);
});

test('App668 downloadable source ZIP contains every pinned source, license, builder and exact WASM', async () => {
  const zip = await JSZip.loadAsync(read('web/public/sources/LCD_DE3_95_App668_Simulatorquellen.zip'));
  const bytes = async name => {
    assert.ok(zip.file(name), 'Missing source archive entry: ' + name);
    return zip.file(name).async('uint8array');
  };
  const binding = JSON.parse(await zip.file('APP668_BINDING.json').async('string'));
  assert.equal(binding.productionCommit, '2bcb743180e645bdf0d84fa0dc0148a15bd07f00');
  assert.equal(binding.sourceId, qualification.sourceId);
  assert.equal(binding.applicationCounter, 668);
  assert.equal(binding.firmwareVersion, '2.22.0-DE3.95');
  assert.equal(binding.board, 'LCD');
  assert.equal(binding.applicationBinSha256, qualification.buildArtifacts['pixljs.bin']);
  assert.equal(binding.applicationBytes, qualification.elfLoadBytesCompared);
  assert.equal(binding.hardwareAcceptance, 'pending');
  const pinned = JSON.parse(read(sourcePath + '/SOURCE_BINDING.json'));
  assert.deepEqual(binding.sourceSnapshot.sourceFiles, pinned.sourceFiles);
  assert.equal(Object.keys(pinned.sourceFiles).length, 12);
  for (const [name, digest] of Object.entries(pinned.sourceFiles)) {
    assert.equal(sha(await bytes(sourcePath + '/' + name)), digest, name);
    assert.equal(sha(read(sourcePath + '/' + name)), digest, name);
  }
  assert.equal(sha(await bytes(sourcePath + '/SOURCE_BINDING.json')), binding.sourceSnapshot.sourceBindingSha256);
  assert.equal(sha(await bytes(sourcePath + '/ENGINE_IDENTITY.json')), binding.sourceSnapshot.engineIdentitySha256);
  for (const name of ['GPL-2.0-LICENSE','LITTLEFS-LICENSE.md','SOURCE.txt'])
    assert.deepEqual(await bytes(sourcePath + '/' + name), new Uint8Array(read(sourcePath + '/' + name)));
  assert.deepEqual(await bytes('web/scripts/build-capacity-de395.py'), new Uint8Array(read('web/scripts/build-capacity-de395.py')));
  assert.equal(sha(await bytes(binding.wasm.path)), qualification.wasmSha256);
  assert.equal((await bytes(binding.wasm.path)).byteLength, binding.wasm.bytes);
  assert.match(await zip.file('README_APP668.txt').async('string'), /build-capacity-de395\.py --sdk/);
  assert.equal(Object.keys(zip.files).some(name => /(?:\.pem$|\.key$|NUR_APP\.zip$)/u.test(name)), false);
});

test('App668 source ZIP binds all production input hashes and fresh cross-mount evidence to linked ARM qualification', async () => {
  const zip = await JSZip.loadAsync(read('web/public/sources/LCD_DE3_95_App668_Simulatorquellen.zip'));
  const binding = JSON.parse(await zip.file('APP668_BINDING.json').async('string'));
  const prodBytes = await zip.file(binding.productionInputsPath).async('uint8array');
  assert.equal(sha(prodBytes), binding.productionInputsSha256);
  const prod = JSON.parse(new TextDecoder().decode(prodBytes));
  assert.equal(Object.keys(prod).length, binding.productionInputCount);
  assert.equal(binding.productionInputCount, qualification.sourceFiles);
  for (const [name, digest] of Object.entries(qualification.engine.manifest.files)) {
    const prefix = name.startsWith('packed_') ? 'fw/application/src/mod/vfs/' : 'fw/components/littlefs/';
    assert.equal(prod[prefix + name], digest, name);
  }
  const q = binding.qualification;
  assert.equal(sha(await zip.file(q.path).async('uint8array')), sha(read(q.path)));
  assert.equal(sha(read(q.path)), q.sha256);
  assert.equal(q.linkedArmLayoutCases, 4);
  assert.equal(qualification.armLayoutCases.length, q.linkedArmLayoutCases);
  assert.equal(q.crossMountEvidenceReusedForIdenticalEngine, false);
  assert.equal(q.crossMountCases, 6);
  assert.equal(sha(await zip.file(q.crossMountReportPath).async('uint8array')), qualification.crossMountReportSha256);
  assert.equal(q.crossMountReportSha256, qualification.crossMountReportSha256);
});
