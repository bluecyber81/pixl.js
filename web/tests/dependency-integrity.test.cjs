const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.PIXL_DEPENDENCY_ROOT || path.resolve(__dirname, '..');
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const sha = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

test('installed library identities and current license notices agree with the pinned lock without metadata exceptions', () => {
  const lock = read(path.join(root, 'package-lock.json')), installed = new Map();
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location) continue;
    const metadataPath = path.join(root, location, 'package.json');
    if (!fs.existsSync(metadataPath)) { assert.equal(entry.optional, true, location + ' missing'); continue; }
    const metadata = read(metadataPath), expectedName = entry.name || location.split('node_modules/').at(-1);
    assert.equal(metadata.name, expectedName, location + ' package identity');
    assert.equal(metadata.version, entry.version, location + ' package version');
    installed.set(metadata.name, path.dirname(metadataPath));
  }
  assert.ok(installed.size > 0);
  const noticesRoot = path.join(root, 'third-party/npm');
  for (const notice of read(path.join(noticesRoot, 'SOURCES.json')).packages) {
    const folder = installed.get(notice.name); assert.ok(folder, notice.name + ' is installed');
    assert.equal(read(path.join(folder, 'package.json')).version, notice.version, notice.name + ' license version');
    for (const file of notice.notice_files) {
      assert.equal(sha(path.join(noticesRoot, file.file)), file.sha256, notice.name + ' packaged notice');
      assert.equal(sha(path.join(folder, path.basename(file.file))), file.sha256, notice.name + ' distributed notice');
    }
  }
});
