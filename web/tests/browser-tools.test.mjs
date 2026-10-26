import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRows, joinDevicePath, sha256 } from '../src/lib/browser-tools.js';

test('display search matches diacritics and notes without modifying names', () => {
  const rows = [{ name: 'Äpfel.bin', notes: 'Zelda', type: 'REG' }, { name: 'Ordner', notes: '', type: 'DIR' }];
  assert.equal(filterRows(rows, 'apfel')[0], rows[0]);
  assert.equal(filterRows(rows, 'zELDa')[0], rows[0]);
  assert.deepEqual(filterRows(rows, '', 'DIR'), [rows[1]]);
  assert.equal(rows[0].name, 'Äpfel.bin');
});
test('joined device names reject traversal, control characters and UTF8 limit overflow', () => {
  assert.equal(joinDevicePath('E:/', 'Mario.bin'), 'E:/Mario.bin');
  assert.equal(joinDevicePath('E:/A', 'ü.bin'), 'E:/A/ü.bin');
  for (const value of ['..', '.', 'a/b', 'a\\b', '\u0000bad', '', '😀'.repeat(12)]) assert.throws(() => joinDevicePath('E:/', value));
  assert.throws(() => joinDevicePath('bad', 'name'));
  assert.throws(() => joinDevicePath('E:/' + 'a'.repeat(60), 'bbb'));
  assert.throws(() => joinDevicePath('E:/', '\ud800.bin'));
  assert.throws(() => joinDevicePath('E:/\udfff', 'x'));
  assert.equal(joinDevicePath('E:/', '😀.bin'), 'E:/😀.bin');
});
test('upload SHA256 matches standard SHA256 vector', async () => {
  assert.equal(await sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
