import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFigureTransfer, transferFigureToDevice, figureFilename, figureSourceUrl } from '../src/lib/figure-transfer.js';
import { memoryVfs } from './helpers/memory-vfs.mjs';

const ID = '0000000000000002', V3 = '0000000000000003', ADDRESS = 'https://files.example.com/tag.bin';
function fixture(size = 540, id = ID) {
  const bytes = new Uint8Array(size); bytes.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4]);
  bytes.set(Buffer.from(id, 'hex'), 84); return bytes;
}
const local = (bytes = fixture()) => ({ size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const prepare = options => prepareFigureTransfer({ file: local(), expectedId: ID, ...options });
const mutations = vfs => vfs.log.filter(entry => ['write', 'rename', 'remove', 'meta'].includes(entry.op));
function response(bytes = fixture(), options = {}) {
  return new Response(bytes, { status: 200, ...options });
}

test('only an explicit single source and complete selected ID can prepare a figure', async () => {
  for (const options of [{}, { file: local(), url: ADDRESS }, { file: local(), expectedId: 'garbage' }]) {
    await assert.rejects(prepareFigureTransfer({ expectedId: ID, ...options }), error => ['FIGURE_ID', 'FIGURE_SOURCE'].includes(error.code));
  }
  let calls = 0;
  await assert.rejects(prepareFigureTransfer({ expectedId: 'garbage', url: ADDRESS, fetchImpl: () => { calls++; } }), { code: 'FIGURE_ID' });
  assert.equal(calls, 0);
});

test('supported figure inputs are copied, hash-bound and strictly limited to the selected ID', async () => {
  for (const size of [532, 540, 572, 2048]) {
    const original = fixture(size), p = await prepare({ file: original });
    assert.equal(p.id, ID); assert.equal(p.size, size); assert.match(p.sha256, /^[0-9a-f]{64}$/u);
    assert.equal(p.inspection.cryptography, 'not-checked'); assert.equal(p.inspection.ownerAndGameData, 'not-checked');
    assert.deepEqual(p.source, { kind: 'local' }); assert.notEqual(p.bytes.buffer, original.buffer);
    assert.deepEqual(Object.keys(p).sort(), ['bytes', 'id', 'inspection', 'sha256', 'size', 'source']);
  }
  await assert.rejects(prepare({ file: fixture(540, 'ffffffff00000002') }), { code: 'FIGURE_ID_MISMATCH' });
  await assert.rejects(prepare({ file: fixture(540, V3), expectedId: V3 }), { code: 'FIGURE_STRUCTURE' });
  assert.equal((await prepare({ file: fixture(2048, V3), expectedId: V3 })).inspection.isV3, true);
});

test('unsupported/truncated or structurally invalid local inputs cannot be prepared', async () => {
  for (const size of [0, 20, 531, 539, 541, 2049, 1e10]) {
    let reads = 0;
    await assert.rejects(prepare({ file: { size, arrayBuffer: () => { reads++; return new ArrayBuffer(0); } } }), { code: 'FIGURE_SIZE' });
    assert.equal(reads, 0);
  }
  await assert.rejects(prepare({ file: { size: 540, arrayBuffer: async () => new ArrayBuffer(532) } }), { code: 'UPLOAD_CHANGED' });
  for (const index of [0, 3, 8]) {
    const bytes = fixture(); bytes[index] ^= 1;
    await assert.rejects(prepare({ file: bytes }), { code: 'FIGURE_STRUCTURE' });
  }
});

test('download URL uses explicit public HTTPS without implicit login, local endpoint or executable scheme', () => {
  assert.equal(figureSourceUrl(ADDRESS).href, ADDRESS);
  for (const url of ['http://files.example.com/x.bin', 'javascript:alert(1)', 'data:text/plain,x', 'file:///x.bin',
    'https://user:password@example.com/x.bin', 'https://example.com/x.bin#part', 'https://localhost/a.bin',
    'https://127.0.0.1/a.bin', 'https://2130706433/a.bin', 'https://[::1]/a.bin', 'https://device.local/a.bin',
    'https://files.example.com/with space.bin', 'https://example.com/' + 'x'.repeat(4096)]) {
    assert.throws(() => figureSourceUrl(url), { code: 'FIGURE_URL' });
  }
});

test('direct download is bounded, cancellable and credential-free; only source origin retained', async () => {
  let call;
  const p = await prepareFigureTransfer({ url: ADDRESS + '?token=private', expectedId: ID,
    fetchImpl: async (...args) => { call = args; return response(fixture(), { headers: { 'Content-Length': '540' } }); } });
  assert.equal(call[1].credentials, 'omit'); assert.equal(call[1].redirect, 'error');
  assert.equal(call[1].referrerPolicy, 'no-referrer'); assert.equal(call[1].mode, 'cors');
  assert.deepEqual(p.source, { kind: 'https', origin: 'https://files.example.com' });
  assert.doesNotMatch(JSON.stringify(p.source), /private|tag\.bin|token/);
  assert.equal(p.inspection.id, ID);
});

test('HTTP errors, redirects, opaque responses and changed destinations fail before transfer', async () => {
  for (const res of [response(null, { status: 404 }), response(fixture(), { status: 206 }),
    { ok: true, status: 200, redirected: true }, { ok: true, status: 200, type: 'opaque' },
    { ok: true, status: 200, url: 'https://different.example.com/file.bin' }]) {
    await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, fetchImpl: async () => res }), { code: 'FIGURE_HTTP' });
  }
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), { code: 'FIGURE_NETWORK' });
});

test('declared and streaming sizes cannot exceed the bounded figure buffer', async () => {
  for (const length of ['-1', 'NaN', '999999999999', '2049', '541', '1.2']) {
    await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, fetchImpl: async () => response(fixture(), { headers: { 'Content-Length': length } }) }), { code: 'FIGURE_SIZE' });
  }
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, fetchImpl: async () => response(new Uint8Array(2049)) }), { code: 'FIGURE_SIZE' });
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, fetchImpl: async () => response(fixture(532), { headers: { 'Content-Length': '540' } }) }), { code: 'FIGURE_SIZE' });
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, fetchImpl: async () => response(new TextEncoder().encode('<html>not a dump</html>')) }), { code: 'FIGURE_STRUCTURE' });
});

test('request timeout and manual abort also settle a source that ignores AbortSignal', async () => {
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, timeoutMs: 5,
    fetchImpl: () => new Promise(() => {}) }), { code: 'FIGURE_TIMEOUT' });
  const controller = new AbortController();
  const p = prepareFigureTransfer({ url: ADDRESS, expectedId: ID, signal: controller.signal,
    fetchImpl: () => new Promise(() => {}) });
  controller.abort(); await assert.rejects(p, { name: 'AbortError' });
  let calls = 0;
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, signal: controller.signal, fetchImpl: () => { calls++; } }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('abort during fetch creation still observes the rejected fetch promise', async () => {
  const controller = new AbortController();
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, signal: controller.signal,
    fetchImpl: () => { controller.abort(); return Promise.reject(new Error('fetch aborted')); } }), { name: 'AbortError' });
  // Node's runner fails the test for an unhandled rejection after this turn.
  await new Promise(resolve => setImmediate(resolve));
});

test('a stalled or endless-empty response body times out or stops with a bounded iteration count', async () => {
  let cancelled = false;
  const stalled = new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => { cancelled = true; } });
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, timeoutMs: 5, fetchImpl: async () => response(stalled) }), { code: 'FIGURE_TIMEOUT' });
  assert.equal(cancelled, true);
  const empty = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array()); } });
  await assert.rejects(prepareFigureTransfer({ url: ADDRESS, expectedId: ID, fetchImpl: async () => response(empty) }), { code: 'FIGURE_STREAM' });
});

test('filename suggestion retains exact ID and bounded portable ASCII', () => {
  for (const name of ['Mario', 'Éléonore/猫:<>*?', 'x'.repeat(1000), 'CON', '\0\0', '']) {
    const filename = figureFilename({ id: ID, name });
    assert(filename.length <= 39); assert.match(filename, /^[a-zA-Z0-9_-]+\.bin$/u);
    assert(filename.endsWith(ID + '.bin'));
  }
  assert.throws(() => figureFilename({ id: '<script>' }), { code: 'FIGURE_ID' });
});

test('device transfer reuses staged upload, writes public ID metadata and reads content back', async () => {
  const vfs = memoryVfs(), prepared = await prepare();
  let freeBytesPath;
  const receipt = await transferFigureToDevice({ prepared, parentPath: 'E:/tags', filename: 'Mario.bin', adapter: {
    ...vfs.api, getFreeBytes: path => { assert.equal(path, 'E:/tags/Mario.bin'); freeBytesPath = path; return vfs.api.getFreeBytes(path); }
  } });
  assert.equal(freeBytesPath, 'E:/tags/Mario.bin');
  assert.equal(receipt.verified, true); assert.equal(receipt.replaced, false); assert.equal(receipt.sha256, prepared.sha256);
  assert.deepEqual(vfs.bytes('E:/tags/Mario.bin'), [...fixture()]);
  assert.deepEqual(vfs.nodes.get('E:/tags/Mario.bin').meta.amiibo, { head: 0, tail: 2 });
  assert(vfs.log.some(entry => entry.op === 'read' && entry.args[0] === 'E:/tags/Mario.bin'));
});

test('existing destination, parent read failure and ID mismatch never trigger writes', async () => {
  const prepared = await prepare();
  const existing = memoryVfs(); existing.put('E:/tags/Mario.bin', [1, 2, 3]);
  await assert.rejects(transferFigureToDevice({ prepared, parentPath: 'E:/tags', filename: 'Mario.bin', adapter: existing.api }), { code: 'UPLOAD_EXISTS' });
  assert.equal(mutations(existing).length, 0); assert.deepEqual(existing.bytes('E:/tags/Mario.bin'), [1, 2, 3]);
  const bad = memoryVfs(); bad.setHook(({ op }) => { if (op === 'list') throw new Error('Read failed'); });
  await assert.rejects(transferFigureToDevice({ prepared, parentPath: 'E:/tags', filename: 'Mario.bin', adapter: bad.api }), /Read failed/);
  assert.equal(mutations(bad).length, 0);
  prepared.bytes[84] ^= 1;
  await assert.rejects(transferFigureToDevice({ prepared, parentPath: 'E:/tags', filename: 'Mario.bin', adapter: bad.api }), { code: 'FIGURE_ID_MISMATCH' });
});

test('tampered prepared bytes, invalid target and abort prevent device mutations', async () => {
  const vfs = memoryVfs(), prepared = await prepare(); prepared.bytes[100] = 99;
  await assert.rejects(transferFigureToDevice({ prepared, parentPath: 'E:/tags', filename: 'x.bin', adapter: vfs.api }), { code: 'FIGURE_CHANGED' });
  for (const options of [{ parentPath: 'E:/../else', filename: 'x.bin' }, { parentPath: 'Z:/', filename: 'x.bin' },
    { parentPath: 'E:/tags', filename: '../x.bin' }, { parentPath: 'E:/tags', filename: 'x.zip' }]) {
    await assert.rejects(transferFigureToDevice({ prepared: await prepare(), adapter: vfs.api, ...options }));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(transferFigureToDevice({ prepared: await prepare(), parentPath: 'E:/tags', adapter: vfs.api, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(mutations(vfs).length, 0);
});

test('corrupt device readback does not commit an imported figure', async () => {
  const vfs = memoryVfs(); vfs.setHook(({ op, when, args }) => {
    if (op === 'read' && when === 'before' && args[0].includes('~u')) vfs.nodes.get(args[0]).bytes[100] ^= 1;
  });
  await assert.rejects(transferFigureToDevice({ prepared: await prepare(), parentPath: 'E:/tags', filename: 'Mario.bin', adapter: vfs.api }), { code: 'UPLOAD_VERIFY' });
  assert(!vfs.nodes.has('E:/tags/Mario.bin'));
});
