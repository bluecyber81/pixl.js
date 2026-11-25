import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import DfuPackage from '../public/dfu/package.js';
import Bundled from '../public/dfu/bundled-packages.js';
import { nrfDfuLink } from '../public/dfu/nrf-dfu-link.mjs';
import { lcdRelease, lcdReleasePackage } from '../public/dfu/lcd-release-reference.mjs';
import { packagePresentation } from '../src/lib/release-packages.js';
import { diagnosticBuildIdentity } from '../src/lib/firmware-build-reference.js';
import { getMigrationCapacityTarget } from '../src/lib/migration-capacity.js';
import { displayBuildReference, firmwareBoard, hasOledSystemDiagnostics, supportsFolderPublication } from '../src/lib/hardware-profile.js';

const read = path => readFileSync(new URL(path, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogue = Bundled.validateCatalog(JSON.parse(read('../src/data/firmware-releases.json')));
const entry = catalogue.packages[0];

test('DE4.1 normal package binds its phone, local, parser and device reference to the real signed App678', async () => {
  assert.deepEqual(entry, lcdReleasePackage);
  assert.equal(entry.id, 'de4.1-lcd-app');
  const unknownOled = '2.22.0-DE4.1-OLEDt1';
  assert.equal(firmwareBoard(unknownOled), 'OLED');
  assert.equal(hasOledSystemDiagnostics(unknownOled), false);
  assert.equal(displayBuildReference(unknownOled), null);
  assert.equal(packagePresentation(entry, {connected:true, firmwareVersion:unknownOled}).profileMismatch, true);
  const archive = read('../public/firmware/' + entry.file);
  assert.deepEqual(archive, read('../../fw/releases/' + entry.file));
  assert.equal(hash(archive), lcdRelease.otaSha256);
  assert.equal(archive.length, entry.bytes);
  const parsed = await new DfuPackage(archive).load();
  assert.deepEqual(Bundled.validatePackage(parsed, 'LCD', catalogue, lcdRelease),
    {board:'LCD', counter:678, version:'2.22.0-DE4.1', privatePreview:false});
  assert.throws(() => Bundled.validatePackage(parsed, 'OLED', catalogue, lcdRelease));
  const application = Buffer.from(parsed.image.imageData);
  assert.equal(application.length, lcdRelease.applicationBytes);
  assert.equal(hash(application), lcdRelease.applicationBinSha256);
  assert.deepEqual(parsed.image.target, {counter:678, hardware:52, softDevices:[0x0126]});
  assert.equal(packagePresentation(entry).downloadUrl, 'https://github.com/bluecyber81/pixl.js/releases/download/de4.1/' + entry.file);
  assert.equal(new URL(nrfDfuLink(entry)).searchParams.get('file'), 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file);
  assert.equal(packagePresentation(entry).releaseNotesUrl, '/guide/index.html#lcd-de41');
  for (const stale of [{board:'OLED'}, {counter:677}, {id:'de3.1-lcd-app'}, {channel:'prerelease'},
    {version:'2.22.0-DE4.2'}, {version:null}, {file:entry.file.replace('DE4_1','DE3_104')}, {bootloader:'Z20'}]) {
    assert.throws(() => Bundled.validateCatalog({schema:1,packages:[{...entry,...stale}]}), JSON.stringify(stale));
    assert.equal(nrfDfuLink({...entry,...stale}), null);
  }
});

test('DE4.1 capacity approval uses the linked ARM evidence for App678 and its hashed simulator', () => {
  const proof = JSON.parse(read('../../docs/validation/DE4_1_PFS.json'));
  const target = getMigrationCapacityTarget('de41');
  assert.equal(target.approved, true);
  assert.deepEqual(target.approvedApplications, [{firmwareVersion:entry.version,applicationCounter:entry.counter}]);
  assert.equal(proof.firmware, entry.version);
  assert.equal(proof.counter, entry.counter);
  assert.equal(proof.sourceId, lcdRelease.sourceId);
  assert.equal(proof.buildArtifacts['pixljs.bin'], lcdRelease.applicationBinSha256);
  assert.equal(proof.wasmSha256, target.wasmSha256);
  assert.equal(target.wasmSha256, hash(read('../public' + target.url)));
  assert.equal(proof.engine.engineSha256, target.layout.engineSha256);
  assert.equal(supportsFolderPublication(entry.version, target.layout.engineSha256), true);
  assert.equal(supportsFolderPublication(entry.version, '0'.repeat(64)), false);
  assert.equal(proof.simulatorProfile, 'de399');
  assert.equal(proof.crossMountOriginFirmware, '2.22.0-DE3.99');
  assert.equal(proof.armLayoutCases.length, 4);
  const identity = diagnosticBuildIdentity({firmwareVersion:entry.version,boot:{settingsCrcValid:true,applicationCounter:678},
    build:{schemaVersion:1,board:'LCD',sourceId:lcdRelease.sourceId,previousFault:null}});
  assert.equal(identity.packageReference, lcdRelease);
  assert.equal(identity.firmwareReportedSourceRelation, 'matches-package');
  assert.equal(identity.applicationHashVerified, false);
  assert.equal(displayBuildReference(entry.version).controllerDriver, 'ST7567');
});
