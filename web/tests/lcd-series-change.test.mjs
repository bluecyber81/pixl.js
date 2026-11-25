import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readDigestWire } from './helpers/read-digest-wire.cjs';
import { compareLcdVersions } from '../src/lib/lcd-version.js';
import { supportsMenuDiagnostics, supportsBleTestDiagnostics, supportsLinkDiagnostics, supportsStorageGcDiagnostics } from '../src/lib/device-extra-diagnostics.js';
import { supportsDisplayPhoto } from '../src/lib/display-photo.js';
import { supportsFlashDiagnostics } from '../src/lib/flash-diagnostics.js';
import { buildDiagnosticBoard } from '../src/lib/lcd-build-diagnostics.js';
import { packagePresentation } from '../src/lib/release-packages.js';
import { updateCheckText } from '../src/lib/update-check.js';
import catalogue from '../src/data/firmware-releases.json' with { type: 'json' };

const app677 = catalogue.packages.find(entry => entry.id === 'de3.104-lcd-app-test1');

const final = '2.22.0-DE4.1';
const unknown = ['2.22.0-DE4.2', '2.22.0-DE5.1', final + '-OLEDt6', final + 't1', final + '-PREP'];

test('historical stable packages and test releases have distinct profile labels in both languages', () => {
  const app675 = catalogue.packages.find(entry => entry.id === 'de3.102-lcd-app');
  for (const [language, stable, trial] of [['de_DE', 'Frühere stabile Ausgabe', 'Bekannte Vorschau'],
    ['en_US', 'Previous stable release', 'Known preview']]) {
    const copy = updateCheckText(language, app675);
    assert.equal(copy.preview, stable);
    assert.ok(copy.targets.application.includes(stable));
    assert.equal(copy.fields.previewBootCounter, copy.fields.targetBootCounter);
    assert.equal(updateCheckText(language, app677).preview, trial);
  }
});

test('LCD package comparison orders series before revision and hides the prior package without a boot read', () => {
  assert.equal(compareLcdVersions(final, app677.version), 1);
  assert.equal(compareLcdVersions(app677.version, final), -1);
  assert.equal(compareLcdVersions(final, final), 0);
  assert.equal(compareLcdVersions('2.22.0-DE4.10', '2.22.0-DE4.2'), 1);
  assert.equal(compareLcdVersions('2.22.0-DE3.71t1', '2.22.0-DE3.72'), -1);
  assert.equal(compareLcdVersions('2.22.0-DE3.30-PREP', final), -1);
  assert.equal(compareLcdVersions('2.23.0', final), 1);
  assert.equal(compareLcdVersions('2.22.0', final), 0);
  for (const value of ['2.22.0-DE4.1-OLEDt6', '2.22.0-DE4.1-beta', '2.22.0-DE4.', null])
    assert.equal(compareLcdVersions(value, final), null);
  assert.equal(packagePresentation(app677, { connected: true, firmwareVersion: final }).newer, true);
});

test('known LCD 4.1 retains supported read-only probes; unknown boards and trial suffixes cannot enable them', () => {
  for (const accepts of [supportsDisplayPhoto, supportsFlashDiagnostics, supportsMenuDiagnostics, supportsLinkDiagnostics, supportsStorageGcDiagnostics]) {
    assert.equal(accepts(final), true);
    for (const value of unknown) assert.equal(accepts(value), false, value);
  }
  assert.equal(buildDiagnosticBoard(final), 'LCD');
  assert.equal(supportsBleTestDiagnostics(final), false);
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.87-OLEDt6'), 'OLED');
  assert.equal(supportsDisplayPhoto('2.22.0-DE3.71t1'), true);
  assert.equal(supportsFlashDiagnostics('2.22.0-DE3.71t1'), false);
});

test('the 4.1 file service sends the real digest, revision and batch probes; unsupported profiles send none', async () => {
  const name = 'E:/sample.bin', bytes = Buffer.from([12, 7]);
  const wire = await readDigestWire({ nodes: new Map([[name, { type: 0, bytes }]]) }, { batch: true });
  assert.equal(await wire.api.vfs_backup_digest(name, bytes.length, final), createHash('sha256').update(bytes).digest('hex'));
  assert.ok(await wire.api.vfs_small_create_revision(final));
  assert.ok(await wire.api.vfs_probe_small_batch(final));
  assert.deepEqual(wire.requests.map(frame => frame[0]), [0x21, 0x22, 0x25]);
  for (const value of [...unknown, '2.22.0-DE3.87-OLEDt6']) {
    assert.equal(await wire.api.vfs_backup_digest(name, bytes.length, value), null);
    assert.equal(await wire.api.vfs_small_create_revision(value), null);
    assert.equal(await wire.api.vfs_probe_small_batch(value), null);
  }
  assert.equal(wire.requests.length, 3);
});
