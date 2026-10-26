import test from 'node:test'
import assert from 'node:assert/strict'
import { updateZipCrc32 } from '../src/lib/zip-crc32.js'

const crc = bytes => (updateZipCrc32(0xffffffff, bytes) ^ 0xffffffff) >>> 0
function bitwiseOracle(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) {
    c ^= byte
    for (let bit = 0; bit < 8; ++bit) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}
test('ZIP CRC keeps published check vectors and empty streams', () => {
  assert.equal(crc(new TextEncoder().encode('123456789')), 0xcbf43926)
  assert.equal(crc(new Uint8Array()), 0)
  assert.equal(updateZipCrc32(0x76543210, new Uint8Array()), 0x76543210)
})
test('ZIP CRC matches independent bitwise oracle at export yield and BLE-size boundaries', () => {
  let seed = 0x12345678
  for (const size of [1, 2, 15, 16, 20, 243, 247, 256, 1023, 0x3ffff, 0x40000, 0x40001, 0x80003]) {
    const storage = new Uint8Array(size + 11)
    for (let i = 0; i < storage.length; ++i) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; storage[i] = seed & 255 }
    const bytes = storage.subarray(5, size + 5), saved = storage.slice(), expected = bitwiseOracle(bytes)
    assert.equal(crc(bytes), expected, `size ${size}`)
    let running = 0xffffffff
    for (let offset = 0; offset < size; offset += 247) running = updateZipCrc32(running, bytes.subarray(offset, offset + 247))
    assert.equal((running ^ 0xffffffff) >>> 0, expected, `fragmented size ${size}`)
    assert.deepEqual(storage, saved, 'CRC does not mutate or include adjacent bytes')
  }
})
