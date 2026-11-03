const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { appliesToHost, matchesPlatformList, verifyDependencyIntegrity } = require('./helpers/dependency-integrity.cjs');
const linux = { os: 'linux', cpu: 'x64', libc: 'glibc' };
const windows = { os: 'win32', cpu: 'x64', libc: null };
const variants = {
  portable: {},
  'native-windows': { optional: true, os: ['win32'], cpu: ['x64'] },
  'native-linux': { optional: true, os: ['linux'], cpu: ['x64'], libc: ['glibc'] },
  'native-musl': { optional: true, os: ['linux'], cpu: ['x64'], libc: ['musl'] },
  'native-arm': { optional: true, os: ['linux'], cpu: ['arm64'], libc: ['glibc'] },
};
function fixture(host, change = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixl-dependency-'));
  const write = (name, value) => { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value)); };
  const license = 'Synthetic MIT notice\n', hash = crypto.createHash('sha256').update(license).digest('hex');
  const lock = { packages: { '': {} } }, notices = { packages: [] };
  for (const [name, constraints] of Object.entries(variants)) {
    const metadata = { name, version: '1.2.3', license: 'MIT' };
    lock.packages['node_modules/' + name] = { ...metadata, ...constraints };
    notices.packages.push({ name, version: metadata.version, declared_license: metadata.license,
      notice_files: [{ file: 'licenses/' + name + '/LICENSE', sha256: hash }] });
    write('third-party/npm/licenses/' + name + '/LICENSE', license);
    if (appliesToHost(constraints, host)) { write('node_modules/' + name + '/package.json', metadata); write('node_modules/' + name + '/LICENSE', license); }
  }
  try {
    change({ root, lock, notices, write });
    write('package-lock.json', lock); write('third-party/npm/SOURCES.json', notices);
    verifyDependencyIntegrity(root, host);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('platform selection distinguishes Windows, glibc, musl and foreign CPU without name heuristics', () => {
  for (const [host, expected] of [[windows, ['portable', 'native-windows']], [linux, ['portable', 'native-linux']],
    [{ ...linux, libc: 'musl' }, ['portable', 'native-musl']], [{ ...linux, cpu: 'arm64' }, ['portable', 'native-arm']]]) {
    assert.deepEqual(Object.entries(variants).filter(([, entry]) => appliesToHost(entry, host)).map(([name]) => name), expected);
    fixture(host);
  }
});

test('npm allowlists, exclusions, string rules and any keep their semantics', () => {
  assert.equal(matchesPlatformList('linux', undefined), true); assert.equal(matchesPlatformList('linux', ['any']), true);
  assert.equal(matchesPlatformList('linux', 'linux'), true); assert.equal(matchesPlatformList('linux', ['!win32']), true);
  assert.equal(matchesPlatformList('linux', ['!linux']), false); assert.equal(matchesPlatformList('linux', ['linux', '!linux']), false);
  assert.equal(matchesPlatformList('linux', ['darwin', '!win32']), false);
  assert.throws(() => appliesToHost(variants['native-linux'], { ...linux, libc: null }), /Cannot determine host libc/);
});

for (const [host, name] of [[windows, 'native-windows'], [linux, 'native-linux'], [{ ...linux, libc: 'musl' }, 'native-musl']]) {
  test(`missing active optional ${name} fails instead of being skipped`, () => {
    assert.throws(() => fixture(host, ({ root }) => fs.unlinkSync(path.join(root, 'node_modules', name, 'package.json'))), /missing for active host platform/);
  });
}

test('missing ordinary or platform-neutral optional dependencies still fail', () => {
  for (const optional of [false, true]) assert.throws(() => fixture(linux, ({ root, lock }) => {
    lock.packages['node_modules/portable'].optional = optional;
    fs.unlinkSync(path.join(root, 'node_modules/portable/package.json'));
  }), /missing/);
});

test('foreign optional notices still require matching lock version and license metadata', () => {
  for (const field of ['version', 'declared_license']) assert.throws(() => fixture(linux, ({ notices }) => {
    notices.packages.find(item => item.name === 'native-windows')[field] = 'changed';
  }), /notice (version|license) belongs to pinned lock/);
  assert.throws(() => fixture(linux, ({ lock }) => { delete lock.packages['node_modules/native-windows']; }), /notice version belongs to pinned lock/);
});

test('foreign optional packaged notice bytes and installed notice bytes are both checked', () => {
  assert.throws(() => fixture(linux, ({ write }) => write('third-party/npm/licenses/native-windows/LICENSE', 'changed')), /packaged notice/);
  assert.throws(() => fixture(linux, ({ write }) => write('node_modules/native-linux/LICENSE', 'changed')), /distributed notice/);
});

test('installed identity, version and license mismatches fail even when a package is optional', () => {
  for (const field of ['name', 'version', 'license']) assert.throws(() => fixture(linux, ({ write }) => {
    write('node_modules/native-linux/package.json', { name: 'native-linux', version: '1.2.3', license: 'MIT', [field]: 'changed' });
  }), /package (identity|version|license)/);
});
