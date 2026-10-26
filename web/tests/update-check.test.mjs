import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import bootPacket from './boot-fixture.cjs';
import { parseBootDiagnostics } from '../src/lib/boot-diagnostics.js';
import { UPDATE_TARGET, evaluateUpdateCheck, formatUpdateValue, updateCheckText } from '../src/lib/update-check.js';

// An independent synthetic wire fixture. These tests do not access hardware.
function targetPacket() {
  const bytes = bootPacket(), view = new DataView(bytes.buffer);
  view.setUint32(12, 0x41414530, true); view.setUint32(32, 7003000, true);
  view.setUint16(36, 0x126, true); view.setUint32(60, 609, true); view.setUint32(64, 7, true);
  bytes.set(Buffer.from('71a8697ed4983a224d984b92dbd76c4ddbe629ccf9650cb5c77acb764eb1b060', 'hex'), 80);
  return bytes;
}
const session = { connected: true, firmwareVersion: '2.22.0-DE3.37', bootState: 'available' };
const result = (bytes = targetPacket(), current = session) => evaluateUpdateCheck({ session: current, boot: bytes == null ? null : parseBootDiagnostics(bytes) });
const row = (value, id) => value.rows.find(item => item.id === id);
const change = (offset, value, bytes = targetPacket()) => { new DataView(bytes.buffer).setUint32(offset, value, true); return bytes; };

test('2.22 base versions and PREP are recognized without claiming LittleFS installation or recommending downgrade',()=>{
  for(const version of ['2.22.0-DE3.30','2.22.0-DE3.30-PREP']){
    const r=result(change(60,version.endsWith('PREP')?600:601),{...session,firmwareVersion:version}),app=row(r,'application');
    assert(app.reasons.includes('olderApplication'));assert(!app.reasons.includes('newerApplication'));
    assert.equal(app.reasons.includes('preparationApplication'),version.endsWith('PREP'));
    assert.equal(row(r,'bootloader').status,'match');assert.equal(row(r,'softDevice').status,'match');
  }
  assert.match(updateCheckText('de_DE').reasons.preparationApplication,/kein Nachweis/);
});

test('exact independent BL6 / S112 7.3 / DE3.37 observations match the pinned target', () => {
  const report = result();
  assert.equal(report.status, 'match'); assert.equal(report.active, true);
  assert.deepEqual(report.rows.map(item => [item.id, item.status]), [['hardware', 'match'], ['application', 'match'], ['bootloader', 'match'], ['softDevice', 'match']]);
  assert.ok(report.rows.every(item => item.checks.every(check => check.status === 'match')));
  assert.equal(UPDATE_TARGET.id, 'allmiibo-lcd-de3.37-bl6-s112-7.3.0');
  for (const value of [UPDATE_TARGET, UPDATE_TARGET.application, UPDATE_TARGET.bootloader, UPDATE_TARGET.softDevice, UPDATE_TARGET.hardware]) assert.equal(Object.isFrozen(value), true);
});

test('BL6 target keeps verified SoftDevice and memory geometry unchanged', () => {
  assert.deepEqual(UPDATE_TARGET.application, { version: '2.22.0-DE3.37', counter: 609 });
  assert.deepEqual(UPDATE_TARGET.softDevice, { variant: 112, version: 7003000, fwid: 0x126 });
  assert.deepEqual(UPDATE_TARGET.hardware, { chip: 0x52832, variant: 0x41414530, flash: 524288, ram: 65536, page: 4096 });
  assert.equal(UPDATE_TARGET.bootloader.counter, 7);
  assert.equal(UPDATE_TARGET.bootloader.bytes, 28672);
  assert.equal(UPDATE_TARGET.bootloader.address, 0x77000);
  assert.equal(UPDATE_TARGET.bootloader.paramsAddress, 0x7e000);
  assert.equal(UPDATE_TARGET.bootloader.settingsAddress, 0x7f000);
  assert.equal(UPDATE_TARGET.bootloader.sha256, '71a8697ed4983a224d984b92dbd76c4ddbe629ccf9650cb5c77acb764eb1b060');
});

test('the previous BL5 fingerprint stays different even with a new application or a claimed BL6 counter', () => {
  for (const counter of [6, 7, 8]) {
    const bytes = change(64, counter);
    bytes.set(Buffer.from('524f0208c2b597ce1ae50a8cefc6912ed0836e39b71976abd2163d02d8079068', 'hex'), 80);
    const report = result(bytes);
    assert.equal(row(report, 'bootloader').status, 'different');
    assert.equal(row(report, 'application').status, 'match');
    assert.equal(row(report, 'softDevice').status, 'match');
  }
});

test('both overview languages show the exact new target without changing evidence limits', () => {
  for (const locale of ['de_DE', 'en_US']) {
    const copy = updateCheckText(locale);
    assert.match(copy.target, /DE3\.37.*BL6.*S112 7\.3\.0/);
    assert.match(copy.targets.application, /DE3\.37.*609/);
    assert.match(copy.targets.bootloader, /BL6.*7/);
    assert.match(copy.reasons.olderApplication, /DE3\.37/);
    assert.doesNotMatch(copy.target + copy.targets.application + copy.targets.bootloader, /DE3\.25|BL5|588/);
  }
});

test('browser, diagnostic, launcher and lockfile carry one patch-version identity', () => {
  const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const pkg = JSON.parse(read('../package.json')), lock = JSON.parse(read('../package-lock.json'));
  assert.equal(pkg.version, '3.27.0'); assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(JSON.parse(read('../public/dfu/package.json')).version, pkg.version);
  assert.match(read('../src/lib/device-info.js'), /applicationVersion: '3\.27\.0'/);
  assert.match(read('../serve_local.py'), /'version': '3\.27\.0'/);
  assert.match(read('../Start-Dateimanager.ps1'), /-ceq '3\.27\.0'/);
  assert.match(read('../src/App.vue'), /<strong>3\.27\.0<\/strong>/);
  assert.match(read('../index.html'), /Allmiibo Dateimanager 3\.27\.0/);
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

test('an installed DE3.25 is shown as older and different without downgrading matching BL6/SoftDevice', () => {
  const report = result(change(60, 590), { ...session, firmwareVersion: '2.21.0-DE3.25' });
  assert.equal(report.status, 'different'); assert.equal(row(report, 'application').status, 'different');
  assert.ok(row(report, 'application').reasons.includes('olderApplication'));
  assert.equal(row(report, 'bootloader').status, 'match'); assert.equal(row(report, 'softDevice').status, 'match');
  const newer = result(change(60, 610), { ...session, firmwareVersion: '2.22.0-DE3.38' });
  assert.equal(row(newer, 'application').status, 'different');
  assert.ok(!row(newer, 'application').reasons.includes('olderApplication'));
  assert.ok(row(newer, 'application').reasons.includes('newerApplication'));
  assert.match(updateCheckText('de_DE').reasons.newerApplication, /weder einen Fehler noch Inkompatibilität/);
  assert.match(updateCheckText('en_US').reasons.newerApplication, /does not establish a fault/);
});

test('each known version, counter, hash or metadata discrepancy stays different', () => {
  for (const [offset, value, id] of [[12, 0x41414230, 'hardware'], [60, 593, 'application'], [64, 8, 'bootloader'], [32, 7002000, 'softDevice'], [28, 113, 'softDevice']]) {
    const report = result(change(offset, value));
    assert.equal(row(report, id).status, 'different', `${offset}:${value}`); assert.equal(report.status, 'different');
  }
  const hash = targetPacket(); hash[80] ^= 1;
  assert.equal(row(result(hash), 'bootloader').status, 'different');
  const fwid = targetPacket(); new DataView(fwid.buffer).setUint16(36, 0x103, true);
  assert.equal(row(result(fwid), 'softDevice').status, 'different');
  assert.equal(row(result(targetPacket(), { ...session, firmwareVersion: '2.21.1' }), 'application').status, 'different');
});

test('bootloader counter alone cannot identify BL6, and an address conflict prevents a match', () => {
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
  for (const [offset, value] of [[8, 0x52840], [16, 1048576], [20, 262144], [24, 4096], [40, 0xffffffff], [112, 0xffffffff]]) view.setUint32(offset, value, true);
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
async function loadComponent(Vue) {
  const { parse, compileScript } = await import('@vue/compiler-sfc');
  const filename = fileURLToPath(new URL('../src/components/UpdateCheck.vue', import.meta.url));
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  let source = compileScript(descriptor, { id: filename, inlineTemplate: true }).content;
  const imports = [];
  source = source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, binding, spec) => { imports.push({ binding, spec }); return ''; });
  const modules = await Promise.all(imports.map(({ spec }) => spec === 'vue' ? Vue : import(pathToFileURL(path.resolve(path.dirname(filename), spec)))));
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
    assert.equal(nodes(root).filter(item => ['button', 'a', 'img'].includes(item.type)).length, 0);
    props.session.firmwareVersion = '2.21.0-DE3.25'; await Vue.nextTick();
    assert.match(text(root), /älter als das lokale Ziel/); assert.match(text(root), /Mindestens eine gelesene Angabe weicht/);
    props.session.connected = false; await Vue.nextTick();
    assert.doesNotMatch(text(root), /Gelesen: 2\.21\.0-DE3\.25/); assert.match(text(root), /Nicht verbunden/);
    props.locale = 'en_US'; await Vue.nextTick();
    assert.match(text(root), /Device overview and version check/); assert.match(text(root), /Disconnected/);
  } finally { app.unmount(); }
});
