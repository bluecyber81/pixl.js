import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import bootPacket from './boot-fixture.cjs';
import { parseBootDiagnostics } from '../src/lib/boot-diagnostics.js';
import { UPDATE_TARGET, evaluateUpdateCheck, formatUpdateValue, updateCheckText } from '../src/lib/update-check.js';
import { firmwarePackageText } from '../src/lib/release-packages.js';
import { createDiagnostics } from '../src/lib/device-info.js';

// An independent synthetic wire fixture. These tests do not access hardware.
function targetPacket() {
  const bytes = bootPacket(), view = new DataView(bytes.buffer);
  view.setUint32(12, 0x41414530, true); view.setUint32(32, 7003000, true);
  view.setUint16(36, 0x126, true); view.setUint32(60, 680, true); view.setUint32(64, 21, true);
  bytes.set(Buffer.from('d3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb', 'hex'), 80);
  return bytes;
}
const session = { connected: true, firmwareVersion: '2.22.0-DE4.2-b2', bootState: 'available' };
const result = (bytes = targetPacket(), current = session) => evaluateUpdateCheck({ session: current, boot: bytes == null ? null : parseBootDiagnostics(bytes) });
const row = (value, id) => value.rows.find(item => item.id === id);
const change = (offset, value, bytes = targetPacket()) => { new DataView(bytes.buffer).setUint32(offset, value, true); return bytes; };

test('application DFU guidance distinguishes browser version comparison from Z15 signature enforcement', () => {
  assert.match(firmwarePackageText('de_DE').limits, /Z15, Z17 und Z19 prüfen die Signatur und können auch eine ältere, gültig signierte Anwendung installieren/);
  assert.match(firmwarePackageText('en_US').limits, /Z15, Z17 and Z19 check the signature and can install an older, validly signed application/);
});

test('2.22 base versions and PREP are recognized without claiming LittleFS installation or recommending downgrade',()=>{
  for(const version of ['2.22.0-DE3.30','2.22.0-DE3.30-PREP']){
    const r=result(change(60,version.endsWith('PREP')?600:601),{...session,firmwareVersion:version}),app=row(r,'application');
    assert(app.reasons.includes('olderApplication'));assert(!app.reasons.includes('newerApplication'));
    assert.equal(app.reasons.includes('preparationApplication'),version.endsWith('PREP'));
    assert.equal(row(r,'bootloader').status,'match');assert.equal(row(r,'softDevice').status,'match');
  }
  assert.match(updateCheckText('de_DE').reasons.preparationApplication,/kein Nachweis/);
});

test('exact independent Z21 / S112 7.3 / DE4.2 synthetic observations match the pinned target', () => {
  const report = result();
  assert.equal(report.status, 'match'); assert.equal(report.active, true);
  assert.deepEqual(report.rows.map(item => [item.id, item.status]), [['hardware', 'match'], ['application', 'match'], ['bootloader', 'match'], ['softDevice', 'match']]);
  assert.ok(report.rows.every(item => item.checks.every(check => check.status === 'match')));
  assert.equal(UPDATE_TARGET.id, 'allmiibo-lcd-de4.2-z21-s112-7.3.0');
  assert.equal(UPDATE_TARGET.profileRevision, '2026-11-25-de42-z21');
  for (const value of [UPDATE_TARGET, UPDATE_TARGET.application, UPDATE_TARGET.bootloader, UPDATE_TARGET.softDevice, UPDATE_TARGET.hardware]) assert.equal(Object.isFrozen(value), true);
});

test('current App680 preserves verified bootloader, SoftDevice and memory geometry pins', () => {
  assert.deepEqual(UPDATE_TARGET.application, { version: '2.22.0-DE4.2-b2', counter: 680 });
  assert.deepEqual(UPDATE_TARGET.softDevice, { variant: 112, version: 7003000, fwid: 0x126 });
  assert.deepEqual(UPDATE_TARGET.hardware, { chip: 0x52832, variant: 0x41414530, flash: 524288, ram: 65536, page: 4096 });
  assert.equal(UPDATE_TARGET.bootloader.counter, 11);
  assert.equal(UPDATE_TARGET.bootloader.bytes, 28672);
  assert.equal(UPDATE_TARGET.bootloader.address, 0x77000);
  assert.equal(UPDATE_TARGET.bootloader.paramsAddress, 0x7e000);
  assert.equal(UPDATE_TARGET.bootloader.settingsAddress, 0x7f000);
  assert.equal(UPDATE_TARGET.bootloader.sha256, 'add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130');
});

test('normal App680 target agrees with the stable catalogue and preserves historical App662', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../src/data/firmware-releases.json', import.meta.url), 'utf8'));
  const release = catalog.packages.find(entry => entry.id === 'de4.2-lcd-app');
  assert.ok(release);
  assert.equal(release.version, UPDATE_TARGET.application.version);
  assert.equal(release.counter, UPDATE_TARGET.application.counter);
  assert.equal(release.board, 'LCD'); assert.equal(release.bootloader, 'Z21');
  assert.equal(release.softDevice, 'S112 7.3.0'); assert.equal(release.storage, 'PFS1');
  assert.equal(release.applicationOnly, true); assert.equal(release.migrationRequired, false);
  assert.equal(release.channel, undefined);
  assert.equal(release.file, 'Allmiibo_LCD_DE4_2_App680_NUR_APP.zip');
  const historical = catalog.packages.find(entry => entry.id === 'de3.89-lcd-app');
  assert.ok(historical); assert.equal(historical.version, '2.22.0-DE3.89'); assert.equal(historical.counter, 662);
  const priorNormal = catalog.packages.find(entry => entry.id === 'de3.100-lcd-app');
  assert.equal(priorNormal.version, '2.22.0-DE3.100'); assert.equal(priorNormal.counter, 673);
});

const currentSession = {...session, firmwareVersion:'2.22.0-DE4.2-b2'};
const z20Hash = '4340d5080aca4205b576c31e7d7b96d5061a4fd3e52a2467e9eb1dabe0c064db';
function previewPacket(counter = 19, hash = UPDATE_TARGET.bootloaderZ19.sha256) {
  const packet = change(64, counter, change(60, 680));
  if (hash) packet.set(Buffer.from(hash, 'hex'), 80);
  return packet;
}

test('current application requires Z21 and rejects Z19 and Z20', () => {
  for (const packet of [previewPacket(), previewPacket(20,z20Hash)]) {
    const report = result(packet, currentSession);
    assert.equal(report.status, 'different');
    assert.equal(row(report,'application').status,'match');
    assert.equal(row(report,'application').checks.find(c=>c.key==='applicationCounter').expected,680);
    assert.ok(!row(report,'application').reasons.includes('knownLocalApplication'));
    assert.equal(row(report,'bootloader').status,'different');
    assert.equal(report.targetId,UPDATE_TARGET.id);
    for (const locale of ['de_DE','en_US']) {
      const copy = updateCheckText(locale,report.preview);
      assert.match(copy.target,/DE4\.2/);
      assert.match(copy.targets.application,/DE4\.2.*680/);
      assert.match(copy.targets.bootloader,/Z19.*Z20.*Z21/);
      assert.ok(copy.preview && copy.overall.preview && copy.fields.previewBootCounter);
    }
  }
  // Z20 is supported by the DE3.80 preview only among these two preview releases.
  const previous = result(change(60,652,previewPacket(20,z20Hash)),{...session,firmwareVersion:'2.22.0-DE3.79'});
  assert.equal(row(previous,'bootloader').status,'different');
});

test('historical App662 retains its known Z21 binding and rejects a mismatched region', () => {
  const app662 = {...session, firmwareVersion:'2.22.0-DE3.89'};
  const packet = change(60,662,previewPacket(21,UPDATE_TARGET.bootloaderZ21.sha256));
  const report = result(packet,app662);
  assert.equal(report.status,'preview');
  assert.deepEqual(report.preview,{version:'2.22.0-DE3.89',counter:662,bootloader:'Z21'});
  assert.ok(row(report,'application').reasons.includes('olderApplication'));
  assert.ok(!row(report,'application').reasons.includes('newerApplication'));
  assert.equal(UPDATE_TARGET.application.counter,680);
  assert.equal(row(report,'bootloader').status,'match');
  assert.ok(row(report,'bootloader').reasons.includes('localZ21'));
  assert.equal(row(result(change(60,662,previewPacket(21,z20Hash)),app662),'bootloader').status,'different');
});

for (const [version,counter] of [['2.22.0-DE3.82',655],['2.22.0-DE3.83',656],['2.22.0-DE3.84',657],['2.22.0-DE3.85',658],['2.22.0-DE3.91',664],['2.22.0-DE3.92',665],['2.22.0-DE3.93',666],['2.22.0-DE3.94',667],['2.22.0-DE3.95',668],['2.22.0-DE3.96',669],['2.22.0-DE3.97',670],['2.22.0-DE3.100',673],['2.22.0-DE3.101',674]]) test(`App${counter} preview uses its checked Z21/S112 profile separately from the bundled target`, () => {
  const app = {...session, firmwareVersion:version};
  const packet = change(60,counter,previewPacket(21,UPDATE_TARGET.bootloaderZ21.sha256));
  const r = result(packet,app);
  assert.equal(r.status, 'preview');
  assert.deepEqual(r.preview,{version:app.firmwareVersion,counter,bootloader:'Z21'});
  assert.equal(UPDATE_TARGET.application.counter,680);
  assert.equal(row(result(change(60,662,packet.slice()),app),'application').status,'different');
  assert.equal(row(result(change(60,counter,previewPacket(20,z20Hash)),app),'bootloader').status,'different');
  assert.equal(row(result(change(32,7002000,packet.slice()),app),'softDevice').status,'different');
});
test('current release cannot hide conflicting or missing device evidence', () => {
  for (const [id,packet] of [
    ['application',change(60,648,previewPacket())],
    ['hardware',change(12,0x41414230,previewPacket())],
    ['softDevice',change(32,7002000,previewPacket())],
    ['bootloader',previewPacket(19,z20Hash)],
    ['bootloader',previewPacket(20)],
    ['bootloader',previewPacket(20,'11'.repeat(32))],
    ['bootloader',previewPacket(17,UPDATE_TARGET.bootloaderZ17.sha256)]
  ]) {
    const report = result(packet,currentSession);
    assert.equal(report.status,'different');
    assert.equal(row(report,id).status,'different');
  }
  const noHash = previewPacket(21,UPDATE_TARGET.bootloaderZ21.sha256), view = new DataView(noHash.buffer);
  view.setUint16(6,0x19f,true); noHash.fill(0,76,112);
  assert.equal(result(noHash,currentSession).status,'unknown');
  const noCrc = previewPacket(21,UPDATE_TARGET.bootloaderZ21.sha256), crcView = new DataView(noCrc.buffer);
  crcView.setUint16(6,0x1af,true); noCrc.fill(0,60,68);
  for (const packet of [noCrc,null]) {
    const report = result(packet,currentSession);
    assert.equal(report.status,'unknown');
    assert.equal(row(report,'application').status,'unknown');
  }
  assert.equal(result(change(60,653,previewPacket()),currentSession).status,'different');
  assert.equal(result(previewPacket(),{...currentSession,connected:false}).preview,null);
});

test('local comparison explains the prior DE3.64 build only for their own validated counter', () => {
  for (const [version, counter] of [['2.22.0-DE3.64',636]]) {
    const local = { ...session, firmwareVersion:version };
    const app = row(result(change(60,counter),local),'application');
    assert.equal(app.status,'different');
    assert.ok(app.reasons.includes('knownLocalApplication'));
    assert.ok(app.reasons.includes('olderApplication'));
    assert.ok(!row(result(change(60,counter + 1),local),'application').reasons.includes('knownLocalApplication'));
    assert.ok(!row(result(null,local),'application').reasons.includes('knownLocalApplication'));
  }
});

test('a DE3.60 device with Z15 matches the bootloader and is offered an application update only', () => {
  const packet=change(64,15,change(60,632));
  packet.set(Buffer.from('c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade','hex'),80);
  const report=result(packet,{...session,firmwareVersion:'2.22.0-DE3.60'});
  assert.equal(row(report,'bootloader').status,'match');
  assert.equal(row(report,'softDevice').status,'match');
  assert.equal(row(report,'application').status,'different');
  assert(row(report,'application').reasons.includes('olderApplication'));
});

test('Z13 and BL8 identify the exact hash/counter pair; unknown images and BL8 rollbacks stay distinguishable', () => {
  const z13='97b2751f1b041de8bcba131d875be725fe91294bfc72e4a7f7a3dc5526e88002';
  const z15='c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade';
  const z17='5fec8c8495978afcd340e6b42db7fc9ba4fa9f216aad2b2a597cc7282877d584';
  const z20='4340d5080aca4205b576c31e7d7b96d5061a4fd3e52a2467e9eb1dabe0c064db';
  const z19='51f47a2fae5739d4a59114f7d84e9da10a3ca140f1a558c44685fbe0d97811fd';
  for(const [counter,hash,expectedHash,expectedCounter] of [
    [13,z13,'match','match'],[11,z13,'match','different'],
    [20,z20,'match','match'],[19,z20,'match','different'],[20,z19,'match','different'],
    [19,z19,'match','match'],[18,z19,'match','different'],[19,z17,'match','different'],
    [15,z15,'match','match'],[13,z15,'match','different'],[15,z13,'match','different'],
    [16,z13,'match','match'],[16,z15,'match','different'],[15,'00'.repeat(31)+'01','different','match'],
    [17,z17,'match','match'],[15,z17,'match','different'],[17,z15,'match','different'],
    [17,'00'.repeat(31)+'01','different','match'],
    [18,z15,'match','match'],[18,z17,'match','different'],[18,z13,'match','different'],
    [18,'00'.repeat(31)+'01','different','match'],
    [13,UPDATE_TARGET.bootloader.sha256,'match','different'],
    [14,UPDATE_TARGET.bootloader.sha256,'match','different'],
    [13,'00'.repeat(31)+'01','different','match']
  ]){
    const packet=change(64,counter);packet.set(Buffer.from(hash,'hex'),80);
    const boot=row(result(packet,{...session,firmwareVersion:'2.22.0-DE3.62'}),'bootloader');
    assert.equal(boot.reasons.includes('z16Recovery'),counter === 16 && hash === z13);
    assert.equal(boot.reasons.includes('z18Recovery'),counter === 18 && hash === z15);
    assert.equal(boot.reasons.includes('localZ20'), counter === 20 && hash === z20);
    assert.equal(boot.reasons.includes('localZ19'), counter === 19 && hash === z19);
    assert.equal(boot.checks.find(c=>c.key==='bootHash').status,expectedHash);
    assert.equal(boot.checks.find(c=>c.key==='bootCounter').status,expectedCounter);
    assert.equal(boot.status,expectedHash==='match'&&expectedCounter==='match'?'match':'different');
  }
  assert.match(updateCheckText('de_DE').targets.bootloader,/Z13.*13/);
  assert.match(updateCheckText('de_DE').targets.bootloader,/Z17.*17/);
  assert.match(updateCheckText('de_DE').targets.bootloader,/Z18.*Rückkehr zu Z15-Code/);
});

test('Z18 is explicitly unchanged Z15 code with a new rollback counter, not the default Z17 implementation', () => {
  assert.equal(UPDATE_TARGET.bootloaderZ18.counter,18);
  assert.equal(UPDATE_TARGET.bootloaderZ18.sha256,UPDATE_TARGET.bootloaderZ15.sha256);
  assert.notEqual(UPDATE_TARGET.bootloaderZ18.sha256,UPDATE_TARGET.bootloaderZ17.sha256);
  assert.equal(Object.isFrozen(UPDATE_TARGET.bootloaderZ18),true);
  const packet=change(64,18);
  packet.set(Buffer.from('c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade','hex'),80);
  const boot=row(result(packet,{...session,firmwareVersion:'2.22.0-DE3.62'}),'bootloader');
  assert.equal(boot.status,'match');
  assert.deepEqual(boot.reasons,['z18Recovery','bootScope']);
  assert.match(updateCheckText('de_DE').reasons.z18Recovery,/unveränderten Z15-Programmcode.*Zähler 18.*keine neue Bootloader-Implementierung/);
  assert.match(updateCheckText('en_US').reasons.z18Recovery,/unchanged Z15 code.*counter 18.*not a new bootloader implementation/);
  assert.equal(updateCheckText('ja_JP').reasons.z18Recovery,updateCheckText('en_US').reasons.z18Recovery);
});

test('3.30.1 identifies prior DE3.42 separately from unchanged BL8 and SoftDevice, without declaring installation', () => {
  const report = result(change(60, 614), { ...session, firmwareVersion: '2.22.0-DE3.42' });
  assert.equal(row(report, 'application').status, 'different');
  assert(row(report, 'application').reasons.includes('olderApplication'));
  assert.equal(row(report, 'bootloader').status, 'match');
  assert.equal(row(report, 'softDevice').status, 'match');
  const unread = result(null, { ...session, bootState: 'unknown' });
  assert.equal(unread.status, 'unknown');
});

test('3.32.1 retains DE3.48 readback compatibility while identifying DE3.75 as the local target',()=>{
  const report=result(change(60,620),{...session,firmwareVersion:'2.22.0-DE3.48'});
  assert.equal(row(report,'application').status,'different');
  assert(row(report,'application').reasons.includes('olderApplication'));
  assert.equal(row(report,'hardware').status,'match');
  assert.equal(row(report,'bootloader').status,'match');
  assert.equal(row(report,'softDevice').status,'match');
});

test('3.30.1 complete-package target distinguishes the same BL8 code with earlier counters without inventing incompatibility', () => {
  for (const counter of [9, 10]) {
    const bytes = change(64, counter);
    bytes.set(Buffer.from(UPDATE_TARGET.bootloader.sha256, 'hex'), 80);
    const report = result(bytes);
    const boot = row(report, 'bootloader');
    assert.equal(boot.status, 'different');
    assert.equal(boot.checks.find(check => check.key === 'bootHash').status, 'match');
    assert.equal(boot.checks.find(check => check.key === 'bootCounter').status, 'different');
    assert.equal(row(report, 'application').status, 'match');
    assert.equal(row(report, 'softDevice').status, 'match');
    assert.match(updateCheckText('de_DE').subtitle, /nicht automatisch Fehler oder Inkompatibilität/);
  }
});

test('the previous BL5, BL6 and BL7 fingerprints stay different even with a new application or a claimed BL8 counter', () => {
 for (const oldHash of ['524f0208c2b597ce1ae50a8cefc6912ed0836e39b71976abd2163d02d8079068', '71a8697ed4983a224d984b92dbd76c4ddbe630ccf9650cb5c77acb764eb1b060', '774d80ef4082304dfb330ef2663e06a13a9016e0f9eca1f79ea23170e60ac9fa']) {
  for (const counter of [6, 7, 8, 9, 10, 11]) {
    const bytes = change(64, counter);
    bytes.set(Buffer.from(oldHash, 'hex'), 80);
    const report = result(bytes);
    assert.equal(row(report, 'bootloader').status, 'different');
    assert.equal(row(report, 'application').status, 'match');
    assert.equal(row(report, 'softDevice').status, 'match');
  }
 }
});

test('both overview languages show the exact new target without changing evidence limits', () => {
  for (const locale of ['de_DE', 'en_US']) {
    const copy = updateCheckText(locale);
    assert.match(copy.target, /DE4\.2.*Z21.*S112 7\.3\.0/);
    assert.match(copy.targets.application, /DE4\.2.*680/);
    assert.match(copy.targets.bootloader, /BL8.*11/);
    assert.match(copy.reasons.olderApplication, /DE4\.2/);
    assert.doesNotMatch(copy.target + copy.targets.application + copy.targets.bootloader, /DE3\.25|BL5|588/);
  }
});

test('browser, diagnostic and lockfile carry one patch-version identity', () => {
  const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const pkg = JSON.parse(read('../package.json')), lock = JSON.parse(read('../package-lock.json'));
  assert.equal(pkg.version, '3.68.0-beta.5'); assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(JSON.parse(read('../public/dfu/package.json')).version, pkg.version);
  assert.equal(createDiagnostics({}).applicationVersion, pkg.version);
  const app = read('../src/App.vue');
  assert.match(app, /import \{ version as webVersion \} from "\.\.\/package\.json"/);
  assert.match(app, /browserVersionLabel\(\) \{ return formatBuildVersion\(webVersion\); \}/);
  assert.equal((app.match(/\{\{ browserVersionLabel \}\}/g) || []).length, 2);
  assert.ok(read('../index.html').includes('Allmiibo Dateimanager ' + pkg.version + '</title>'));
});

test('missing, failed and unavailable reads remain unknown, even with a matching version string', () => {
  for (const [state, reason] of [['unknown', 'notRead'], ['failed', 'failed'], ['unavailable', 'unavailable']]) {
    const report = result(null, { ...session, bootState: state });
    assert.equal(report.status, 'unknown');
    assert.ok(report.rows.every(item => item.status === 'unknown' && item.reasons.includes(reason)));
    assert.equal(row(report, 'application').checks[0].status, 'match');
  }
  const report = result(targetPacket(), { ...session, firmwareVersion: '' });
  assert.equal(row(report, 'application').status, 'unknown'); assert.equal(report.status, 'unknown');
});

test('disconnect invalidates all old values, and connecting alone does not confirm data', () => {
  for (const connected of [false, undefined, null, 'true', 1]) {
    const report = result(targetPacket(), { ...session, connected });
    assert.equal(report.status, 'unknown'); assert.equal(report.active, false);
    assert.ok(report.rows.every(item => item.checks.every(check => check.actual === null)));
    assert.ok(report.rows.every(item => item.reasons.includes('disconnected')));
  }
});

test('an installed DE3.25 is shown as older and different without downgrading matching BL8/SoftDevice', () => {
  const report = result(change(60, 590), { ...session, firmwareVersion: '2.21.0-DE3.25' });
  assert.equal(report.status, 'different'); assert.equal(row(report, 'application').status, 'different');
  assert.ok(row(report, 'application').reasons.includes('olderApplication'));
  assert.equal(row(report, 'bootloader').status, 'match'); assert.equal(row(report, 'softDevice').status, 'match');
  for (const [firmwareVersion, counter] of [['2.22.0-DE3.65', 637], ['2.22.0-DE3.66', 638], ['2.22.0-DE3.67', 639], ['2.22.0-DE3.68', 640], ['2.22.0-DE3.69', 641], ['2.22.0-DE3.70', 642], ['2.22.0-DE3.71', 643], ['2.22.0-DE3.71t1', 644], ['2.22.0-DE3.72', 645], ['2.22.0-DE3.73', 646]]) {
    const prior = row(result(change(60, counter), { ...session, firmwareVersion }), 'application');
    assert.equal(prior.status, 'different');
    assert.ok(prior.reasons.includes('olderApplication'));
    assert.ok(!prior.reasons.includes('newerApplication'));
    assert.ok(prior.reasons.includes('knownLocalApplication'));
    const wrongPair = row(result(change(60, counter - 1), { ...session, firmwareVersion }), 'application');
    assert.ok(!wrongPair.reasons.includes('knownLocalApplication'));
  }
  // Synthetic future version, not a published release binding.
  assert.ok(row(result(change(60, 681), { ...session, firmwareVersion: '2.22.0-DE4.3' }), 'application').reasons.includes('newerApplication'));
  const oldBoot = change(64, 15);
  oldBoot.set(Buffer.from(UPDATE_TARGET.bootloaderZ15.sha256, 'hex'), 80);
  assert.equal(row(result(oldBoot), 'bootloader').status, 'different');
  assert.match(updateCheckText('de_DE').reasons.newerApplication, /weder einen Fehler noch Inkompatibilität/);
  assert.match(updateCheckText('en_US').reasons.newerApplication, /does not establish a fault/);
});

test('each known version, counter, hash or metadata discrepancy stays different', () => {
  for (const [offset, value, id] of [[12, 0x41414230, 'hardware'], [60, 593, 'application'], [64, 10, 'bootloader'], [32, 7002000, 'softDevice'], [28, 113, 'softDevice']]) {
    const report = result(change(offset, value));
    assert.equal(row(report, id).status, 'different', `${offset}:${value}`); assert.equal(report.status, 'different');
  }
  const hash = targetPacket(); hash[80] ^= 1;
  assert.equal(row(result(hash), 'bootloader').status, 'different');
  const fwid = targetPacket(); new DataView(fwid.buffer).setUint16(36, 0x103, true);
  assert.equal(row(result(fwid), 'softDevice').status, 'different');
  assert.equal(row(result(targetPacket(), { ...session, firmwareVersion: '2.21.1' }), 'application').status, 'different');
});

test('bootloader counter alone cannot identify BL8, and an address conflict prevents a match', () => {
  const noHash = targetPacket(), view = new DataView(noHash.buffer);
  view.setUint16(6, 0x19f, true); view.setUint32(76, 0, true); noHash.fill(0, 80, 112);
  const report = result(noHash);
  assert.equal(row(report, 'bootloader').status, 'unknown');
  assert.equal(row(report, 'bootloader').checks.find(check => check.key === 'bootCounter').status, 'match');
  const conflict = change(40, 0x78000); new DataView(conflict.buffer).setUint16(6, 0x1ff, true);
  assert.equal(row(result(conflict), 'bootloader').status, 'different');
});

test('CRC-unverified counters and invalid/partial input never turn green', () => {
  const noCrc = targetPacket(), view = new DataView(noCrc.buffer);
  view.setUint16(6, 0x1af, true); view.setUint32(60, 0, true); view.setUint32(64, 0, true);
  const report = result(noCrc);
  assert.equal(row(report, 'application').status, 'unknown'); assert.equal(row(report, 'bootloader').status, 'unknown');
  const valid = parseBootDiagnostics(targetPacket());
  for (const bad of [{}, { ...valid, flags: 1024 }, { ...valid, bootRegionSha256: 'invalid' }, { ...valid, chipPart: 0x52840 }]) {
    const invalid = evaluateUpdateCheck({ session, boot: bad });
    assert.equal(invalid.status, 'unknown'); assert.ok(invalid.rows.every(item => item.reasons.includes('invalid')));
  }
});

test('a valid unsupported-chip register observation is a hardware difference, not a bootloader verdict', () => {
  const bytes = new Uint8Array(128), view = new DataView(bytes.buffer);
  bytes.set([80, 88, 66, 68, 1, 0]);
  for (const [offset, value] of [[8, 0x52840], [16, 1048576], [20, 262344], [24, 4096], [40, 0xffffffff], [112, 0xffffffff]]) view.setUint32(offset, value, true);
  const report = result(bytes);
  assert.equal(row(report, 'hardware').status, 'different');
  assert.equal(row(report, 'bootloader').status, 'unknown'); assert.equal(row(report, 'softDevice').status, 'unknown');
});

test('raw extra fields, malformed version strings and mutable aliases are not copied', () => {
  const boot = { ...parseBootDiagnostics(targetPacket()), secret: 'SECRET_PRIVATE', bluetoothAddress: 'SECRET_PRIVATE' };
  const input = { session: { ...session, firmwareVersion: '<SECRET_PRIVATE>', deviceId: 'SECRET_PRIVATE' }, boot };
  const before = JSON.stringify(input), report = evaluateUpdateCheck(input);
  assert.doesNotMatch(JSON.stringify(report), /SECRET_PRIVATE/); assert.equal(JSON.stringify(input), before);
  assert.equal(row(report, 'application').status, 'unknown');
  boot.bootHashValid = false; // Schema flags, not arbitrary aliases, are authoritative.
  assert.equal(row(evaluateUpdateCheck({ session, boot }), 'bootloader').status, 'match');
});

test('English and German have complete field/reason labels and explain evidence limits', () => {
  const report = result();
  for (const locale of ['de_DE', 'en_US']) {
    const text = updateCheckText(locale);
    for (const item of report.rows) {
      assert.ok(text.names[item.id] && text.targets[item.id]);
      for (const check of item.checks) assert.ok(text.fields[check.key]);
      for (const reason of item.reasons) assert.ok(text.reasons[reason]);
    }
    assert.ok(text.overall.match && text.overall.different && text.overall.unknown);
  }
  assert.match(updateCheckText('de_DE').reasons.applicationScope, /kein Hashnachweis/);
  assert.match(updateCheckText('en_US').reasons.bootScope, /counter alone is insufficient/);
  assert.equal(formatUpdateValue('sdVersion', 7003000), '7.3.0');
  assert.equal(formatUpdateValue('flash', 524288), '512 KiB');
  assert.equal(formatUpdateValue('sdFwid', 0x126), '0x126');
});

// Compile the real component, then drive Vue's renderer and prop updates. This
// verifies displayed status transitions without browser, network or BLE access.
async function loadComponent(Vue, componentFilename = null, fixtureCatalog = null) {
  const { parse, compileScript } = await import('@vue/compiler-sfc');
  const filename = componentFilename || fileURLToPath(new URL('../src/components/UpdateCheck.vue', import.meta.url));
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  let source = compileScript(descriptor, { id: filename, inlineTemplate: true }).content;
  const imports = [];
  source = source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, binding, spec) => { imports.push({ binding, spec }); return ''; });
  const modules = await Promise.all(imports.map(({ spec }) => spec === 'vue' ? Vue : spec.endsWith('.vue') ? loadComponent(Vue,path.resolve(path.dirname(filename),spec),fixtureCatalog) : spec.endsWith('.json') ? fixtureCatalog||JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename),spec),'utf8')) : import(pathToFileURL(path.resolve(path.dirname(filename), spec)))));
  const bindings = imports.map(({ binding }, index) => `const ${binding.replace(/\s+as\s+/g, ':')}=modules[${index}];`).join('\n');
  return new Function('modules', `${bindings}\n${source.replace('export default', 'return')}`)(modules);
}
const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null });
const createRenderer = Vue => Vue.createRenderer({
  createElement: tag => node(tag), createText: value => node('#text', value), createComment: value => node('#comment', value),
  setText: (item, value) => item.text = value, setElementText: (item, value) => { item.text = value; item.children = []; },
  patchProp: (item, key, previous, value) => item.props[key] = value,
  insert(item, parent, anchor = null) { if (item.parent) item.parent.children.splice(item.parent.children.indexOf(item), 1); item.parent = parent; const index = parent.children.indexOf(anchor); index < 0 ? parent.children.push(item) : parent.children.splice(index, 0, item); },
  remove(item) { item.parent?.children.splice(item.parent.children.indexOf(item), 1); item.parent = null; },
  parentNode: item => item.parent, nextSibling: item => item.parent?.children[item.parent.children.indexOf(item) + 1] || null
});

test('real bundled-package component explains manual scope and removes downgrade actions for a newer device',async()=>{
  const Vue=await import('vue'),renderer=createRenderer(Vue),root=node('root');
  const fixture={schema:1,packages:[{id:'de3.53-lcd-app',version:'2.22.0-DE3.53',counter:625,file:'Allmiibo_LCD_DE3_53_625_NUR_APP.zip',bytes:12345,sha256:'a'.repeat(64),board:'LCD',storage:'PFS1',bootloader:'BL8',softDevice:'S112 7.3.0',applicationOnly:true,migrationRequired:false}]};
  const filename=fileURLToPath(new URL('../src/components/FirmwarePackages.vue',import.meta.url));
  const Component=await loadComponent(Vue,filename,fixture),props=Vue.reactive({session:{connected:true,firmwareVersion:'2.22.0-DE3.52'},locale:'de_DE'});
  const app=renderer.createApp({render:()=>Vue.h(Component,props)});app.mount(root);
  try{
    assert.match(text(root),/Speicherprofil.*nicht ausgelesen/);assert.equal(nodes(root).filter(n=>n.type==='a').length,5);
    const android=nodes(root).find(n=>n.type==='a' && n.props.href.startsWith('https://www.nordicsemi.com/dfu/'));
    assert.equal(new URL(android.props.href).searchParams.get('file'), 'https://bluecyber81.github.io/pixl.js/firmware/'+fixture.packages[0].file);
    assert.equal(android.text,'In nRF DFU öffnen (Android)');
    props.locale='en_US';await Vue.nextTick();assert.equal(android.text,'Open in nRF DFU (Android)');
    props.locale='de_DE';await Vue.nextTick();
    assert.equal(nodes(root).filter(n=>n.type==='button').length,0);
    const hrefs=nodes(root).filter(n=>n.type==='a').map(n=>n.props.href);assert(hrefs.includes('/dfu/web.html?package=' + fixture.packages[0].id));assert(hrefs.includes('/firmware/'+fixture.packages[0].file));
    props.session.firmwareVersion='2.22.0-DE3.62';await Vue.nextTick();assert.equal(nodes(root).filter(n=>n.type==='a').length,2);assert.ok(nodes(root).some(n=>n.props.href==='https://github.com/bluecyber81/pixl.js/tree/de4.2'));assert.match(text(root),/Downgrade wird nicht angeboten/);
    props.locale='en_US';await Vue.nextTick();assert.match(text(root),/No downgrade is offered/);
  }finally{app.unmount();}
});
test('a legacy LCD can open the Z21 guide while incompatible DE3.89 application transfers are hidden', async () => {
  const Vue = await import('vue'), renderer = createRenderer(Vue), root = node('root');
  const releases = JSON.parse(fs.readFileSync(new URL('../src/data/firmware-releases.json',import.meta.url),'utf8'));
  const fixture = {schema:1,packages:releases.packages.filter(entry=>entry.counter===662)};
  const filename=fileURLToPath(new URL('../src/components/FirmwarePackages.vue',import.meta.url));
  const Component = await loadComponent(Vue,filename,fixture);
  const props = Vue.reactive({session:{...session,firmwareVersion:'2.22.0-DE3.89'},boot:null,locale:'de_DE'});
  const app = renderer.createApp({render:()=>Vue.h(Component,props)});app.mount(root);
  try {
    for (const [counter,profile] of [[15,UPDATE_TARGET.bootloaderZ15],[17,UPDATE_TARGET.bootloaderZ17]]) {
      const bytes = change(60,662,change(64,counter)), view = new DataView(bytes.buffer);
      view.setUint32(32,7002000,true); view.setUint16(36,0x0103,true);
      bytes.set(Buffer.from(profile.sha256,'hex'),80);
      props.boot = parseBootDiagnostics(bytes);
      for (const [locale,page] of [['de_DE','index.html'],['en_US','en.html']]) {
        props.locale=locale; await Vue.nextTick();
        const links=nodes(root).filter(item=>item.type==='a').map(item=>item.props.href);
        assert.ok(links.includes('/guide/'+page+'#android-de389'));
        assert.ok(!links.some(href=>href.startsWith('/firmware/') || href.includes('nordicsemi.com/dfu/') || href.includes('dfu/web.html')));
      }
    }
  } finally {app.unmount();}
});

const text = item => item.text + item.children.map(text).join('');
const nodes = item => [item, ...item.children.flatMap(nodes)];

test('real overview changes from unread to matching, then old application and disconnected; details stay collapsed', async () => {
  const Vue = await import('vue'), renderer = createRenderer(Vue);
  const Component = await loadComponent(Vue), root = node('root');
  const props = Vue.reactive({ session: { ...session, bootState: 'unknown' }, boot: null, locale: 'de_DE' });
  const app = renderer.createApp({ render: () => Vue.h(Component, props) }); app.mount(root);
  try {
    assert.match(text(root), /noch nicht gelesen/); assert.doesNotMatch(text(root), /Alle gelesenen Angaben passen/);
    props.boot = parseBootDiagnostics(targetPacket()); await Vue.nextTick();
    assert.match(text(root), /Alle gelesenen Angaben passen/); assert.match(text(root), /kein Hashnachweis/);
    assert.equal(nodes(root).filter(item => item.type === 'article').length, 4);
    assert.ok(nodes(root).filter(item => item.type === 'details').every(item => !item.props.open));
    assert.equal(nodes(root).filter(item => ['button', 'img'].includes(item.type)).length, 0);
    assert.match(text(root), /Mitgelieferte Firmware/);
    props.session.firmwareVersion = currentSession.firmwareVersion;
    props.boot = parseBootDiagnostics(previewPacket(20,z20Hash)); await Vue.nextTick();
    assert.match(text(root), /Stimmt überein/); assert.match(text(root), /DE4\.2/);
    assert.doesNotMatch(text(root), /gehören zu einer früheren LCD-Ausgabe/);
    props.locale='en_US'; await Vue.nextTick();
    assert.match(text(root), /Matches/); assert.match(text(root), /2.22.0-DE4.2-b2 · counter 680/);
    props.boot = parseBootDiagnostics(previewPacket(19,z20Hash)); await Vue.nextTick();
    assert.match(text(root), /At least one read value differs from the comparison profile/);
    props.locale='de_DE';
    props.session.firmwareVersion = '2.21.0-DE3.25'; await Vue.nextTick();
    assert.match(text(root), /älter als DE4\.2/); assert.match(text(root), /Mindestens eine gelesene Angabe weicht/);
    props.session.connected = false; await Vue.nextTick();
    assert.doesNotMatch(text(root), /Gelesen: 2\.21\.0-DE3\.25/); assert.match(text(root), /Nicht verbunden/);
    props.locale = 'en_US'; await Vue.nextTick();
    assert.match(text(root), /Device overview and version check/); assert.match(text(root), /Disconnected/);
  } finally { app.unmount(); }
});
