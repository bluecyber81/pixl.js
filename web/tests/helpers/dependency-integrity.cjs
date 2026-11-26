const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const sha = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

// npm's os/cpu/libc rules: explicit exclusions win; otherwise match an allowed
// value, or accept an exclusion-only list. No package-name/platform guesses.
function matchesPlatformList(value, rule) {
  if (rule === undefined) return true;
  const list = typeof rule === 'string' ? [rule] : rule;
  assert.ok(Array.isArray(list) && list.every(item => typeof item === 'string'), 'Invalid platform rule');
  if (list.length === 1 && list[0] === 'any') return true;
  if (list.includes('!' + value)) return false;
  return list.includes(value) || list.every(item => item.startsWith('!'));
}

function hostEnvironment() {
  let libc = null;
  if (process.platform === 'linux') {
    const report = process.report.getReport();
    if (report.header.glibcVersionRuntime) libc = 'glibc';
    else if (report.sharedObjects?.some(name => /musl/.test(name))) libc = 'musl';
  }
  return { os: process.platform, cpu: process.arch, libc };
}

function appliesToHost(entry, host) {
  if (!matchesPlatformList(host.os, entry.os) || !matchesPlatformList(host.cpu, entry.cpu)) return false;
  if (entry.libc !== undefined) {
    assert.ok(host.libc, 'Cannot determine host libc for platform-specific dependency');
    return matchesPlatformList(host.libc, entry.libc);
  }
  return true;
}

// Follow the lockfile's installed layout, including hoisted and nested packages.
// An optional binding for another CPU may have children with no platform rule.
function hostDependencies(entries, host) {
  const active = new Set(['']);
  for (const parent of active) {
    const entry = entries[parent];
    const requiredPeers = Object.keys(entry.peerDependencies || {}).filter(name => !entry.peerDependenciesMeta?.[name]?.optional);
    const names = new Set([...Object.keys(entry.dependencies || {}), ...Object.keys(entry.optionalDependencies || {}),
      ...Object.keys(parent ? {} : entry.devDependencies || {}), ...requiredPeers]);
    for (const name of names) {
      let folder = parent;
      for (;;) {
        const candidate = (folder ? folder + '/' : '') + 'node_modules/' + name;
        if (Object.hasOwn(entries, candidate)) {
          if (appliesToHost(entries[candidate], host)) active.add(candidate);
          break;
        }
        if (!folder) break;
        folder = folder.slice(0, Math.max(0, folder.lastIndexOf('/node_modules/')));
      }
    }
  }
  return active;
}

function verifyDependencyIntegrity(root, host = hostEnvironment()) {
  const lock = read(path.join(root, 'package-lock.json')), packages = [];
  const active = hostDependencies(lock.packages, host);
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location) continue;
    const name = entry.name || location.split('node_modules/').at(-1);
    const metadataPath = path.join(root, location, 'package.json');
    const metadata = fs.existsSync(metadataPath) ? read(metadataPath) : null;
    if (!metadata) {
      assert.equal(entry.optional, true, location + ' missing');
      assert.equal(active.has(location), false, location + ' missing for active host platform');
    } else {
      assert.equal(metadata.name, name, location + ' package identity');
      assert.equal(metadata.version, entry.version, location + ' package version');
      if (entry.license !== undefined) assert.equal(metadata.license, entry.license, location + ' package license');
    }
    packages.push({ name, entry, metadata, folder: path.dirname(metadataPath) });
  }
  assert.ok(packages.some(item => item.metadata), 'No installed dependencies');
  const noticesRoot = path.join(root, 'third-party/npm');
  const notices = read(path.join(noticesRoot, 'SOURCES.json')).packages;
  for (const notice of notices) {
    const matching = packages.filter(item => item.name === notice.name && item.entry.version === notice.version);
    assert.ok(matching.length, notice.name + ' notice version belongs to pinned lock');
    for (const item of matching) {
      // Some older nonoptional lock entries omit license. Their installed
      // manifest remains authoritative; an absent package needs lock evidence.
      if (item.entry.license !== undefined || !item.metadata) {
        assert.equal(item.entry.license, notice.declared_license, notice.name + ' notice license belongs to pinned lock');
      }
      if (item.metadata) assert.equal(item.metadata.license, notice.declared_license, notice.name + ' installed notice license');
      // Packaged notices are checked even for absent, foreign optional packages.
      for (const file of notice.notice_files) {
        assert.equal(sha(path.join(noticesRoot, file.file)), file.sha256, notice.name + ' packaged notice');
        if (item.metadata) assert.equal(sha(path.join(item.folder, path.basename(file.file))), file.sha256, notice.name + ' distributed notice');
      }
    }
  }
  const documented = new Set(notices.map(item => item.name + '@' + item.version));
  for (const item of packages) {
    assert.ok(documented.has(item.name + '@' + item.entry.version), item.name + ' missing from notice inventory');
  }
}

module.exports = { matchesPlatformList, hostEnvironment, appliesToHost, verifyDependencyIntegrity };
