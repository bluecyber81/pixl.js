import test from 'node:test'
import assert from 'node:assert/strict'
import { readSmallFileDigests } from '../src/lib/small-file-read-group.js'

test('grouped audit reads respect the UTF-8 packet budget up to the 4096-entry inventory limit', async () => {
  const files = Array.from({length:4096}, (_, i) => ({path:`E:/äö/file-${i}`, size:[0, 572, 573][i % 3]}))
  const expected = files.filter(file => file.size <= 572)
  const calls = []
  const hashes = await readSmallFileDigests(files, {
    revision:'0000000100000031', maxRequestPayload:73, check() {}, invalidReply:assert.fail,
    async readFileDigestsBatch(group, {revision}) {
      assert.equal(revision, '0000000100000031')
      assert(group.length >= 2 && group.length <= 4)
      assert(10 + group.reduce((n, item) => n + 4 + Buffer.byteLength(item.path), 0) <= 73)
      calls.push(...group.map(file => file.path))
      return group.map(file => ({...file, sha256:'a'.repeat(64)}))
    }
  })
  assert.deepEqual(calls, expected.slice(0, calls.length).map(row => row.path))
  assert(expected.length - calls.length <= 1)
  assert.equal(hashes.size, calls.length)
})
