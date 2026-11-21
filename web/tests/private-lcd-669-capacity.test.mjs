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
const qualification = JSON.parse(read('docs/validation/DE3_96_PFS.json'));
const sourcePath = 'web/third-party/packed-simulator-de396';

test('App669 capacity uses the newly qualified engine and retains exact separate historical profiles', () => {
  const profile = getMigrationCapacityTarget('de396');
  assert.equal(profile.approved, true);
  assert.deepEqual(profile.approvedApplications, [{firmwareVersion:'2.22.0-DE3.96',applicationCounter:669}]);
  assert.equal(profile.layout.engineSha256, qualification.engine.engineSha256);
  assert.equal(profile.wasmSha256, qualification.wasmSha256);
  assert.equal(firmwareBoard(profile.firmwareVersion), 'LCD');
  assert.equal(displayBuildReference(profile.firmwareVersion).controllerDriver, 'ST7567');
  assert.equal(supportsFolderPublication(profile.firmwareVersion, profile.layout.engineSha256), true);
  for (const id of ['de395','de394','de392','de391','de389']) {
    const previous = getMigrationCapacityTarget(id);
    assert.equal(supportsFolderPublication(profile.firmwareVersion, previous.layout.engineSha256), false);
    assert.equal(supportsFolderPublication(previous.firmwareVersion, profile.layout.engineSha256), false);
  }
  for (const version of ['2.22.0-DE3.97','2.22.0-DE3.96-OLEDt7'])
    assert.equal(supportsFolderPublication(version, profile.layout.engineSha256), false);
});

test('App669 downloadable source ZIP contains every pinned source, license, builder and exact WASM', async () => {
  const zip = await JSZip.loadAsync(read('web/public/sources/LCD_DE3_96_App669_TEST1_Simulatorquellen.zip'));
  const bytes = async name => {
    assert.ok(zip.file(name), 'Missing source archive entry: ' + name);
    return zip.file(name).async('uint8array');
  };
  const binding = JSON.parse(await zip.file('APP669_BINDING.json').async('string'));
  assert.equal(binding.productionCommit, 'feb6c58ad14998f31aef07dc84d8dc0732e32ede');
  assert.equal(binding.sourceId, qualification.sourceId);
  assert.equal(binding.applicationCounter, 669);
  assert.equal(binding.firmwareVersion, '2.22.0-DE3.96');
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
  assert.deepEqual(await bytes('web/scripts/build-capacity-de396.py'), new Uint8Array(read('web/scripts/build-capacity-de396.py')));
  assert.equal(sha(await bytes(binding.wasm.path)), qualification.wasmSha256);
  assert.equal((await bytes(binding.wasm.path)).byteLength, binding.wasm.bytes);
  assert.match(await zip.file('README_APP669.txt').async('string'), /build-capacity-de396\.py --sdk/);
  assert.equal(Object.keys(zip.files).some(name => /(?:\.pem$|\.key$|NUR_APP\.zip$)/u.test(name)), false);
});

test('App669 source ZIP binds all production input hashes and fresh cross-mount evidence to linked ARM qualification', async () => {
  const zip = await JSZip.loadAsync(read('web/public/sources/LCD_DE3_96_App669_TEST1_Simulatorquellen.zip'));
  const binding = JSON.parse(await zip.file('APP669_BINDING.json').async('string'));
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


test('App669 capacity qualification leaves firmware hardware acceptance and instrumentation boundaries explicit', () => {
  const pinned = JSON.parse(read(sourcePath + '/SOURCE_BINDING.json'));
  assert.equal(qualification.firmware, '2.22.0-DE3.96');
  assert.equal(qualification.counter, 669);
  assert.equal(qualification.sourceId, 'dea06409b9ff20a12f446a7baed683b6442573ed427c5dc87cd4bed2885df858');
  assert.equal(qualification.buildArtifacts['pixljs.bin'], '32d3a83b0692ea06b65af48c236bcffa4eb3469c0e98e9bb6840965cc1dabb80');
  assert.equal(qualification.elfLoadBytesCompared, 363312);
  assert.equal(qualification.engine.engineSha256, '3574b8ea61e7c1563a77eb806eb2ae1fbe3f2d94196d3a2d72e89ca3a6b3b21d');
  assert.deepEqual(qualification.armLayoutCases.map(item => item.result === 0), [true, true, false, false]);
  assert.deepEqual(qualification.capacityCrossMount, {cases:6,files:1131,folders:77,synthetic:true});
  assert.equal(pinned.defines.includes('BOARD_LCD'), false);
  assert.equal(pinned.defines.includes('PIXL_TEST_DIAGNOSTICS'), false);
  assert.ok(qualification.limits.some(text => /no SDK timing or firmware RAM claim/.test(text)));
  const cross = JSON.parse(read('docs/validation/DE3_96_CROSS_MOUNT.json'));
  assert.equal(cross.engines.old, getMigrationCapacityTarget('de395').layout.engineSha256);
  assert.equal(cross.engines.new, getMigrationCapacityTarget('de396').layout.engineSha256);
  assert.equal(cross.passed, true);
  assert.equal(cross.deviceAccess, false);
  assert.equal(cross.syntheticDataOnly, true);
  assert.equal(cross.cases.length, 6);
  for (const item of cross.cases.filter(item => item.action === 'verify')) {
    assert.equal(item.result.readonly, true);
    assert.equal(item.result.programs, 0);
    assert.equal(item.result.erases, 0);
    assert.equal(item.imageBeforeSha256, item.imageAfterSha256);
  }
});
