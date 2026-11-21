import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from '../public/dfu/vendor/jszip-3.10.2.min.js';
import {lcdRelease} from '../public/dfu/lcd-release-reference.mjs';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {supportsFolderPublication} from '../src/lib/hardware-profile.js';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const qualification = json('docs/validation/DE3_98_PFS.json');

test('normal App671 folder publication requires its own qualified engine and never accepts a test or future identity', () => {
  const normal = getMigrationCapacityTarget('de398');
  assert.equal(normal.approved, true);
  assert.deepEqual(normal.approvedApplications, [{firmwareVersion:'2.22.0-DE3.98',applicationCounter:671}]);
  assert.equal(normal.layout.engineSha256, qualification.engine.engineSha256);
  assert.equal(normal.wasmSha256, qualification.wasmSha256);
  assert.equal(supportsFolderPublication(normal.firmwareVersion, normal.layout.engineSha256), true);
  for (const id of ['de397','de396','de395','de394','de393','de392','de391','de389','current']) {
    const previous = getMigrationCapacityTarget(id);
    assert.equal(supportsFolderPublication(normal.firmwareVersion, previous.layout.engineSha256), false, id);
    assert.equal(supportsFolderPublication(previous.firmwareVersion, normal.layout.engineSha256), false, id);
    assert.equal(supportsFolderPublication(previous.firmwareVersion, previous.layout.engineSha256), true, id);
  }
  for (const version of ['2.22.0-DE3.99','2.22.0-DE3.98-OLEDt7'])
    assert.equal(supportsFolderPublication(version, normal.layout.engineSha256), false, version);
});

test('normal App671 qualification binds the frozen production inputs and fresh cross-mount evidence without a device claim', () => {
  const normal = getMigrationCapacityTarget('de398');
  const source = json('web/third-party/packed-simulator-de398/SOURCE_BINDING.json');
  const production = json('docs/validation/DE3_98_PRODUCTION_INPUTS.json');
  const crossBytes = read('docs/validation/DE3_98_CROSS_MOUNT.json');
  const cross = JSON.parse(crossBytes);
  assert.equal(Object.keys(production).length, qualification.sourceFiles);
  assert.equal(qualification.sourceId, '067c6740533ca3e390fa04ff0613d543573e4ad401adbb256a6ef17f89650f0a');
  for (const [name, digest] of Object.entries(qualification.engine.manifest.files)) {
    const productionPrefix = name.startsWith('packed_') ? 'fw/application/src/mod/vfs/' : 'fw/components/littlefs/';
    const snapshotPrefix = name.startsWith('packed_') ? 'core/' : 'littlefs/';
    assert.equal(production[productionPrefix + name], digest, name);
    assert.equal(source.sourceFiles[snapshotPrefix + name], digest, name);
  }
  assert.deepEqual(qualification.armLayoutCases.map(item => item.result === 0), [true, true, false, false]);
  assert.equal(sha(crossBytes), qualification.crossMountReportSha256);
  assert.equal(cross.engines.old, getMigrationCapacityTarget('de397').layout.engineSha256);
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

test('normal App671 downloadable sources preserve the exact pinned engine, final qualification and real release identity', async () => {
  const sourcePath = 'web/third-party/packed-simulator-de398';
  const original = read('web/public/sources/LCD_DE3_98_App671_Simulatorquellen.zip');
  assert.equal(original.length, 153022);
  assert.equal(sha(original), '49d6874f3562073b06081e80a5cfc09c871eaaac105b2e47583cd1ae66e164c6');
  const zip = await JSZip.loadAsync(original, {checkCRC32:true});
  assert.equal(Object.keys(zip.files).length, 25);
  const bytes = async name => {
    assert.ok(zip.file(name), name);
    return zip.file(name).async('uint8array');
  };
  const binding = JSON.parse(await zip.file('APP671_BINDING.json').async('string'));
  for (const [key,value] of Object.entries(lcdRelease)) assert.deepEqual(binding[key], value, key);
  assert.equal(binding.productionCommit, '7ab8d1343d609ecb5bec93863d60f038583f0ba0');
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
  assert.deepEqual(await bytes('web/scripts/build-capacity-de398.py'), new Uint8Array(read('web/scripts/build-capacity-de398.py')));
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
  assert.match(await zip.file('README_APP671.txt').async('string'), /build-capacity-de398\.py/);
  assert.equal(Object.keys(zip.files).some(name => /(?:\.pem$|\.key$|NUR_APP\.zip$)/u.test(name)), false);
});
