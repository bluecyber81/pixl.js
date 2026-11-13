import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeRawMetadata, editMetadataFlags } from '../src/lib/raw-metadata.js'

function record(fields, padding = 0xa7) {
  const raw = new Uint8Array(128).fill(padding)
  raw.set([fields.length, ...fields])
  return raw
}

test('flag edits preserve all unrelated raw bytes, including padding and other flags', () => {
  const source = record([3, 1, 2, 0, 0, 3, 4, 0, 0, 2, 0xb2, 1, 1, 65])
  const before = source.slice()
  const result = editMetadataFlags(source, decodeRawMetadata(source), { hide: true, readonly: true })
  const expected = before.slice()
  expected[11] = 0xb7
  assert.deepEqual(result, {bytes: expected, raw: 0xb7})
  assert.deepEqual(source, before)
})

test('empty records and records without flags preserve remaining padding', () => {
  for (const raw of [record([]), new Uint8Array(128).fill(255), record([1, 1, 97])]) {
    const offset = raw[0] === 255 ? 1 : raw[0] + 1
    const expected = raw.slice()
    expected.set([2, 4], offset)
    expected[0] = offset + 1
    assert.deepEqual(editMetadataFlags(raw, decodeRawMetadata(raw), {readonly: true}),
      {bytes: expected, raw: 4})
  }
})

test('malformed fields, duplicate flags, changed attributes and full records leave the input alone', () => {
  const flags = {readonly:true}
  for (const fields of [[0x7e], [2], [1,5,10], [2,0,2,0], [1,125,...new Array(125).fill(65)]]) {
    const raw = record(fields), before = raw.slice()
    assert.equal(editMetadataFlags(raw, decodeRawMetadata(raw), flags), null)
    assert.deepEqual(raw,before)
  }
  const raw = record([1,1,97,2,0])
  assert.equal(editMetadataFlags(raw, {...decodeRawMetadata(raw),notes:'stale'}, flags), null)
})
