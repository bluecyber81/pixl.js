import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCollection } from '../src/lib/collection-audit.js';
import { collectionCsv } from '../src/lib/collection-csv.js';

const a = '0000000000000002', b = '0000000e00000002', c = '0000000000000102', d = '1234567890123456';
const catalogue = [
  { id: a, name: '  =A1', series: '@serie', release: { eu: '2021-01-01' } },
  { id: b, name: 'Grün;"Test",1\n2', series: '－1', release: { eu: '2021-01-01' } },
  { id: c, name: 'Future', series: '\t+1', release: { eu: '2028-12-01' } },
];
const entry = (name, id, size = 540) => ({
  name, type: 0, size, meta: id && { valid: true, amiibo: { head: parseInt(id.slice(0, 8), 16), tail: parseInt(id.slice(8), 16) } },
});
function data(id) {
  const bytes = new Uint8Array(540);
  bytes[0] = 4; bytes[3] = 0x8c;
  bytes.set(id.match(/../g).map(pair => parseInt(pair, 16)), 84);
  return bytes;
}

test('complete scoped and quick checks keep localized scope, unknowns, and unobserved IDs honest', async () => {
  const options = { catalogue, today: '2026-11-08', rootPath: 'E:/set', assertSession() {},
    readDirectory: async () => [entry('hand.bin', a), entry('unknown.bin', d), entry('no-id.bin', null, 19)],
    readFile: async path => data(path.endsWith('unknown.bin') ? d : a) };
  const german = collectionCsv(await auditCollection(options), 'de_DE');
  assert.ok(german.startsWith('\uFEFF"Figurenname";"Serie";'));
  assert.ok(german.includes(`"'  =A1";"'@serie";"0x${a}";"Vorhanden · ID bestätigt";"E:/set/hand.bin";"E:/set"`));
  assert.ok(german.includes(`"Grün;""Test"",1\n2";"'－1";"0x${b}";"Bestand nicht bestätigt";""`));
  assert.ok(german.includes(`"Future";"'\t+1";"0x${c}";"Angekündigt"`));
  assert.ok(german.includes(`"Unbekannte Katalog-ID";"";"0x${d}";"Vorhanden · ID bestätigt";"E:/set/unknown.bin"`));
  assert.ok(german.includes('"Datei ohne ausgelesene Figuren-ID";"";"";"Datei prüfen";"E:/set/no-id.bin"'));
  assert.ok(german.endsWith('\r\n'));

  const english = collectionCsv(await auditCollection({ ...options, mode: 'quick', rootPath: 'E:/' }), 'en_US');
  assert.ok(english.startsWith('\uFEFF"Figure name","Series",'));
  assert.ok(english.includes(`"0x${a}","Present according to properties"`));
  assert.ok(english.includes(`"0x${b}","Presence unconfirmed"`));
  assert.ok(english.includes(`"0x${c}","Upcoming"`));
});

test('a content/properties mismatch marks both IDs for review and points to the same file', async () => {
  const report = await auditCollection({ catalogue, today: '2026-11-08', assertSession() {},
    readDirectory: async () => [entry('different.bin', b), entry('future.bin', c)], readFile: async path => data(path.endsWith('future.bin') ? c : a) });
  const csv = collectionCsv(report, 'en_US');
  for (const id of [a, b]) assert.ok(csv.includes(`"0x${id}","Inspect file","E:/different.bin"`));
  assert.equal(csv.split('0x' + c).length - 1, 1, 'one row even when a future figure also appears in present');
  assert.ok(csv.includes(`"0x${c}","Present · ID confirmed"`));
  assert.throws(() => collectionCsv({ ...report, status: 'partial' }, 'en_US'), /Incomplete/);
});
