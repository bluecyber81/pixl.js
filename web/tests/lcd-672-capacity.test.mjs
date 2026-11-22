import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from '../public/dfu/vendor/jszip-3.10.2.min.js';
import {lcdRelease} from '../public/dfu/lcd-app672-reference.mjs';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {supportsFolderPublication} from '../src/lib/hardware-profile.js';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const qualification = json('docs/validation/DE3_99_PFS.json');

test('normal App672 folder publication requires its own qualified engine and never accepts a test or future identity', () => {
  const normal = getMigrationCapacityTarget('de399');
  assert.equal(normal.approved, true);
  assert.deepEqual(normal.approvedApplications, [{firmwareVersion:'2.22.0-DE3.99',applicationCounter:672}]);
  assert.equal(normal.layout.engineSha256, qualification.engine.engineSha256);
  assert.equal(normal.wasmSha256, qualification.wasmSha256);
  assert.equal(supportsFolderPublication(normal.firmwareVersion, normal.layout.engineSha256), true);
  for (const id of ['de398','de397','de396','de395','de394','de393','de392','de391','de389','current']) {
    const previous = getMigrationCapacityTarget(id);
    assert.equal(supportsFolderPublication(normal.firmwareVersion, previous.layout.engineSha256), false, id);
    assert.equal(supportsFolderPublication(previous.firmwareVersion, normal.layout.engineSha256), false, id);
    assert.equal(supportsFolderPublication(previous.firmwareVersion, previous.layout.engineSha256), true, id);
  }
  for (const version of ['2.22.0-DE3.102','2.22.0-DE3.99-OLEDt7'])
    assert.equal(supportsFolderPublication(version, normal.layout.engineSha256), false, version);
});

test('normal App672 qualification binds the frozen production inputs and fresh cross-mount evidence without a device claim', () => {
  const normal = getMigrationCapacityTarget('de399');
  const source = json('web/third-party/packed-simulator-de399/SOURCE_BINDING.json');
  const production = json('docs/validation/DE3_99_PRODUCTION_INPUTS.json');
  const crossBytes = read('docs/validation/DE3_99_CROSS_MOUNT.json');
  const cross = JSON.parse(crossBytes);
  assert.equal(Object.keys(production).length, qualification.sourceFiles);
  assert.equal(qualification.sourceId, '1a60ea8e4804a958d2e0e4415a5a7a9643eca6abce788d7394e2155976da1c0d');
  for (const [name, digest] of Object.entries(qualification.engine.manifest.files)) {
    const productionPrefix = name.startsWith('packed_') ? 'fw/application/src/mod/vfs/' : 'fw/components/littlefs/';
    const snapshotPrefix = name.startsWith('packed_') ? 'core/' : 'littlefs/';
    assert.equal(production[productionPrefix + name], digest, name);
    assert.equal(source.sourceFiles[snapshotPrefix + name], digest, name);
  }
  assert.deepEqual(qualification.armLayoutCases.map(item => item.result === 0), [true, true, false, false]);
  assert.equal(sha(crossBytes), qualification.crossMountReportSha256);
  assert.equal(cross.engines.old, getMigrationCapacityTarget('de398').layout.engineSha256);
  assert.equal(cross.engines.new, normal.layout.engineSha256);
  assert.equal(cross.passed, true);
  assert.equal(cross.deviceAccess, false);
  assert.equal(cross.syntheticDataOnly, true);
  assert.equal(cross.cases.length, 6);
  assert.deepEqual(qualification.capacityCrossMount, {cases:6,files:1131,folders:77,synthetic:true});
  for (const item of cross.cases.filter(item => item.action === 'verify')) {
    assert.equal(item.result.readonly, true);
    assert.equal(item.result.programs, 0);
    assert.equal(item.result.erases, 0);
    assert.equal(item.imageBeforeSha256, item.imageAfterSha256);
  }
  assert.equal(source.defines.includes('BOARD_LCD'), false);
  assert.equal(source.defines.includes('PIXL_RUNTIME_DIAGNOSTICS'), false);
  assert.ok(qualification.limits.some(text => /no SDK timing or firmware RAM claim/.test(text)));
});

test('normal App672 downloadable sources preserve the exact pinned engine, final qualification and real release identity', async () => {
  const sourcePath = 'web/third-party/packed-simulator-de399';
  const original = read('web/public/sources/LCD_DE3_99_App672_Simulatorquellen.zip');
  assert.equal(original.length, 151971);
  assert.equal(sha(original), 'dceecd21e37d0b02fd5bafc25f16bf7a90a7a8f0792d4479ea75878f5fb0c3bc');
  const zip = await JSZip.loadAsync(original, {checkCRC32:true});
  assert.equal(Object.keys(zip.files).length, 25);
  const bytes = async name => {
    assert.ok(zip.file(name), name);
    return zip.file(name).async('uint8array');
  };
  const binding = JSON.parse(await zip.file('APP672_BINDING.json').async('string'));
  for (const [key,value] of Object.entries(lcdRelease)) assert.deepEqual(binding[key], value, key);
  assert.equal(binding.productionCommit, '9fb9d84b51365cf33f745896243f4cd6e934e637');
  assert.equal(binding.sourceId, qualification.sourceId);
  assert.equal(binding.applicationBinSha256, qualification.buildArtifacts['pixljs.bin']);
  const pinned = json(sourcePath + '/SOURCE_BINDING.json');
  assert.deepEqual(binding.sourceSnapshot.sourceFiles, pinned.sourceFiles);
  assert.equal(Object.keys(pinned.sourceFiles).length, 12);
  for (const [name,digest] of Object.entries(pinned.sourceFiles)) assert.equal(sha(await bytes(sourcePath + '/' + name)), digest, name);
  assert.equal(sha(await bytes(sourcePath + '/SOURCE_BINDING.json')), binding.sourceSnapshot.sourceBindingSha256);
  assert.equal(sha(await bytes(sourcePath + '/ENGINE_IDENTITY.json')), binding.sourceSnapshot.engineIdentitySha256);
  for (const name of ['GPL-2.0-LICENSE','LITTLEFS-LICENSE.md','SOURCE.txt'])
    assert.deepEqual(await bytes(sourcePath + '/' + name), new Uint8Array(read(sourcePath + '/' + name)));
  assert.deepEqual(await bytes('web/scripts/build-capacity-de399.py'), new Uint8Array(read('web/scripts/build-capacity-de399.py')));
  assert.equal(sha(await bytes(binding.wasm.path)), qualification.wasmSha256);
  assert.equal((await bytes(binding.wasm.path)).length, binding.wasm.bytes);
  for (const [name,digest] of [[binding.productionInputsPath,binding.productionInputsSha256],
    [binding.qualification.path,binding.qualification.sha256],
    [binding.qualification.crossMountReportPath,binding.qualification.crossMountReportSha256]]) {
    assert.equal(sha(await bytes(name)), digest, name);
    assert.equal(sha(read(name)), digest, name);
  }
  assert.equal(binding.productionInputCount, qualification.sourceFiles);
  assert.equal(binding.qualification.linkedArmLayoutCases, 4);
  assert.equal(binding.qualification.crossMountCases, 6);
  assert.match(await zip.file('README_APP672.txt').async('string'), /build-capacity-de399\.py/);
  assert.equal(Object.keys(zip.files).some(name => /(?:\.pem$|\.key$|NUR_APP\.zip$)/u.test(name)), false);
});
