import test from 'node:test';
import assert from 'node:assert/strict';
import {ByteBuffer, loadFileCodec} from '../src/lib/file-codec.js';

test('the first file request loads one shared little-endian codec', async () => {
  assert.equal(ByteBuffer, null);
  const first = loadFileCodec();
  assert.equal(loadFileCodec(), first);
  assert.equal(await first, ByteBuffer);
  const buffer = new ByteBuffer();
  buffer.writeUint16(0x1234).flip();
  assert.deepEqual([...new Uint8Array(buffer.toArrayBuffer())], [0x34, 0x12]);
});
