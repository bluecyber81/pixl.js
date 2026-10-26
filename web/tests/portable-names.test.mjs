import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPortableEntryName, assertDeviceEntryName, assertDevicePath, joinDevicePath, portableNameKey } from '../src/lib/portable-names.js'

test('new names are portable and reject traversal, Windows devices and invisible normalization aliases', () => {
  for (const name of ['', '.', '..', 'x/y', 'x\\y', 'CON', 'nul.txt', 'COM¹.bin', 'LPT3.txt', 'foo.', 'foo ', 'a:b', 'a?b', 'a\u0001', '\ud800', 'Cafe\u0301.bin']) {
    assert.throws(() => assertPortableEntryName(name), undefined, name)
  }
  for (const name of ['Mario.bin', 'Café.bin', '🦊.bin', 'COM10.bin', 'null.bin']) assert.equal(assertPortableEntryName(name), name)
})
test('existing nonportable names stay addressable without normalization or truncation', () => {
  for (const name of ['CON.bin', 'a:b', 'last.', 'Cafe\u0301.bin', '\ufeffMario.bin']) {
    assert.equal(assertDeviceEntryName(name), name)
    assert.equal(joinDevicePath('E:/', name), 'E:/' + name)
  }
  assert.equal(portableNameKey('CAFE\u0301.bin'), portableNameKey('Café.bin'))
})
test('device paths enforce UTF-8 bytes excluding drive label and never resolve dot segments', () => {
  assert.equal(assertDevicePath('E:/' + 'é'.repeat(31)), 'E:/' + 'é'.repeat(31))
  assert.throws(() => assertDevicePath('E:/' + 'é'.repeat(32)), { code: 'PATH_LIMIT' })
  for (const path of ['E:/a/../b', 'E:/a//b', 'E:/a/', 'E:/\udfff', 'e:/x', '/a']) assert.throws(() => assertDevicePath(path))
})

test('new file and folder components obey the 47-byte firmware name limit without rewriting legacy identities', () => {
  for (const name of ['x'.repeat(47), 'é'.repeat(23) + 'x', '🦊'.repeat(11) + 'abc']) assert.equal(assertPortableEntryName(name), name)
  for (const name of ['x'.repeat(48), 'é'.repeat(24), '🦊'.repeat(12)]) {
    assert.throws(() => assertPortableEntryName(name), { code: 'NAME_LIMIT' })
    assert.equal(assertDeviceEntryName(name), name)
  }
})
