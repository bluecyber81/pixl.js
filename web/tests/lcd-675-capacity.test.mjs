import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import JSZip from '../public/dfu/vendor/jszip-3.10.2.min.js';
import {lcdRelease} from '../public/dfu/lcd-release-reference.mjs';
import {lcdRelease as app672} from '../public/dfu/lcd-app672-reference.mjs';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {supportsFolderPublication} from '../src/lib/hardware-profile.js';
import {simulateCapacity} from '../src/lib/migration-capacity-engine.js';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const qualification = json('docs/validation/DE3_102_PFS.json');
const normal = getMigrationCapacityTarget('de3102');
const previous = getMigrationCapacityTarget('de399');

test('App675 is an exact new application profile using the unchanged App672 engine and WASM', () => {
  assert.equal(normal.approved, true);
  assert.deepEqual(normal.approvedApplications, [{firmwareVersion:'2.22.0-DE3.102',applicationCounter:675}]);
  assert.deepEqual(previous.approvedApplications, [{firmwareVersion:'2.22.0-DE3.99',applicationCounter:672}]);
  assert.notEqual(normal, previous);
  assert.equal(normal.url, '/lfs-capacity-de399.wasm');
  assert.equal(normal.wasmSha256, previous.wasmSha256);
  assert.equal(normal.wasmSha256, '068e6f033c6e3ee95c8be2c7c6ba633daa6821c67ca38ace68a66cd5fece604c');
  assert.deepEqual(normal.layout, previous.layout);
  assert.deepEqual(normal.geometry, previous.geometry);
  assert.equal(normal.layout.engineSha256, '3ba6db5d72cb6c292beedd36b0b5126d4b63783ff054d07bcbc5c097d19ecd0f');
  assert.equal(supportsFolderPublication(normal.firmwareVersion, normal.layout.engineSha256), true);
  assert.equal(supportsFolderPublication(app672.firmwareVersion, normal.layout.engineSha256), true);
  for (const version of ['2.22.0-DE3.104','2.22.0-DE3.102-OLEDt7'])
    assert.equal(supportsFolderPublication(version, normal.layout.engineSha256), false, version);
  assert.equal(supportsFolderPublication(normal.firmwareVersion, getMigrationCapacityTarget('de398').layout.engineSha256), false);
});

test('App675 actual ARM evidence attributes the previous cross-mount run without claiming a rerun', () => {
  const production = json('docs/validation/DE3_102_PRODUCTION_INPUTS.json');
  const earlier = json('docs/validation/DE3_99_PFS.json');
  assert.equal(qualification.firmware, lcdRelease.firmwareVersion);
  assert.equal(qualification.counter, lcdRelease.applicationCounter);
  assert.equal(qualification.sourceId, lcdRelease.sourceId);
  assert.equal(qualification.buildArtifacts['pixljs.bin'], lcdRelease.applicationBinSha256);
  assert.equal(qualification.elfLoadBytesCompared, lcdRelease.applicationBytes);
  assert.equal(qualification.intelHex.flashBytesCompared, lcdRelease.applicationBytes);
  assert.equal(qualification.sourceFiles, Object.keys(production).length);
  assert.equal(qualification.simulatorProfile, 'de399');
  assert.deepEqual(qualification.engine, earlier.engine);
  assert.equal(qualification.adapterSha256, earlier.adapterSha256);
  assert.equal(qualification.adapterSha256, production['fw/application/src/mod/vfs/vfs_driver_packed.c']);
  assert.equal(qualification.crossMountEvidenceMode, 'reused-identical-engine');
  assert.equal(qualification.crossMountOriginFirmware, '2.22.0-DE3.99');
  assert.equal(qualification.crossMountReportSha256, sha(read('docs/validation/DE3_99_CROSS_MOUNT.json')));
  assert.equal(qualification.previousQualificationSha256, sha(read(qualification.previousQualificationPath)));
  assert.deepEqual(qualification.armLayoutCases.map(item => item.result === 0), [true,true,false,false]);
  assert.ok(qualification.limits.some(text => /not rerun or relabeled/.test(text)));
  for (const [name,digest] of Object.entries(qualification.engine.manifest.files)) {
    const prefix = name.startsWith('packed_') ? 'fw/application/src/mod/vfs/' : 'fw/components/littlefs/';
    assert.equal(production[prefix + name], digest, name);
  }
});

test('App675 source archive preserves original engine sources and adds the separately bound release identity', async () => {
  const manifest = json('docs/validation/DE3_102_SIMULATOR_SOURCES.json');
  const bytes = read(manifest.path);
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(sha(bytes), manifest.sha256);
  const zip = await JSZip.loadAsync(bytes, {checkCRC32:true});
  const get = name => {
    assert.ok(zip.file(name), name);
    return zip.file(name).async('uint8array');
  };
  const binding = JSON.parse(await zip.file('APP675_BINDING.json').async('string'));
  const {hardwareAcceptance, ...packageIdentity} = lcdRelease;
  assert.equal(binding.hardwareAcceptance, 'pending-for-this-build');
  assert.equal(hardwareAcceptance, json('RELEASE_INFO.json').hardware_acceptance);
  for (const [key,value] of Object.entries(packageIdentity)) assert.deepEqual(binding[key], value, key);
  assert.equal(binding.capacityProfile, 'de3102');
  assert.equal(binding.simulatorProfile, 'de399');
  assert.equal(binding.wasm.path, 'web/public/lfs-capacity-de399.wasm');
  assert.equal(binding.wasm.sha256, normal.wasmSha256);
  assert.equal(sha(await get(binding.wasm.path)), normal.wasmSha256);
  const pinned = json('web/third-party/packed-simulator-de399/SOURCE_BINDING.json');
  assert.deepEqual(binding.sourceSnapshot.sourceFiles, pinned.sourceFiles);
  for (const [name,digest] of Object.entries(pinned.sourceFiles))
    assert.equal(sha(await get('web/third-party/packed-simulator-de399/' + name)), digest, name);
  for (const [path,digest] of [[binding.qualification.path,binding.qualification.sha256],
    [binding.productionInputsPath,binding.productionInputsSha256],
    [binding.qualification.crossMountReportPath,binding.qualification.crossMountReportSha256]]) {
    assert.equal(sha(await get(path)), digest, path);
    assert.equal(sha(read(path)), digest, path);
  }
  assert.equal(binding.qualification.linkedArmLayoutCases, 4);
  assert.equal(binding.qualification.crossMountExecutedForThisRelease, false);
  assert.match(await zip.file('README_APP675.txt').async('string'), /unverändert|unchanged/);
  assert.equal(Object.keys(zip.files).some(name => /(?:\.pem$|\.key$|NUR_APP\.zip$)/u.test(name)), false);
});

test('App675 reuses the real simulator while preserving its own application identity and file metadata', async () => {
  const wasm = read('web/public/lfs-capacity-de399.wasm');
  const rows = [{path:'/Leer',kind:1,size:0},{path:'/Figur',kind:0,size:540},{path:'/Null',kind:0,size:0}]
    .map((row,index) => ({...row,rawMeta128Hex:Buffer.alloc(128,index+1).toString('hex')}));
  const report = await simulateCapacity(rows, normal, {
    archiveSha256:'ab'.repeat(32),
    fetchImpl:async(url,options) => {
      assert.equal(url, '/lfs-capacity-de399.wasm');
      assert.equal(options.cache, 'no-store');
      return {ok:true,headers:{get:() => String(wasm.length)},arrayBuffer:async() => wasm};
    }
  });
  assert.equal(report.passed, true);
  assert.equal(report.firmwareVersion, '2.22.0-DE3.102');
  assert.equal(report.applicationCounter, 675);
  assert.equal(report.verifiedEntries, rows.length);
  assert.equal(report.wasmSha256, previous.wasmSha256);
});
