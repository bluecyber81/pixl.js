import assert from 'node:assert/strict'
import test from 'node:test'
import { backupPathSpace, devicePathSpace } from '../src/lib/portable-names.js'

test('UTF-8 headroom uses the firmware path including its leading slash and the basename independently', () => {
  const name = 'é'.repeat(23) + 'x'
  const parent = 'E:/' + 'p'.repeat(14) + '/'
  assert.deepEqual(devicePathSpace(parent + name), {pathRemaining: 0, nameRemaining: 0})
  assert.deepEqual(devicePathSpace(parent + name + 'ö'), {pathRemaining: -2, nameRemaining: -2})
  assert.equal(devicePathSpace('E:/nested/').nameRemaining, 47)
})

test('ZIP warnings use the selected destination and list the eight tightest paths', () => {
  const entries = Array.from({length: 12}, (_, i) => ({relativePath: 'x'.repeat(30 + i)}))
  assert.deepEqual(backupPathSpace('E:/', entries), {count: 0, shortest: []})
  const parent = 'E:/' + 'a'.repeat(30)
  const result = backupPathSpace(parent, entries)
  assert.equal(result.count, 12)
  assert.equal(result.shortest.length, 8)
  assert.deepEqual(result.shortest[0], {path: parent + '/' + entries[11].relativePath, remaining: -10})
  assert.deepEqual(result, backupPathSpace(parent + '/', entries))
})
