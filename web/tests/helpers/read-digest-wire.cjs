// Real production request queue and parsers against a deterministic, read-only
// peripheral. Counts describe this mock's GATT247 wire, never device throughput.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const ByteBuffer = require('bytebuffer');
ByteBuffer.DEFAULT_ENDIAN = ByteBuffer.LITTLE_ENDIAN;

exports.readDigestWire = async function readDigestWire(vfs, { digestReply, batch = false,
  revision = '0000000000000001', batchReply, linkReply, groupWire } = {}) {
  const bus = new EventEmitter(), requests = [], replies = [], errors = [], timers = new Map();
  let timer = 0, openPath = null;
  const root = process.env.PIXL_SOURCE_DIR || path.join(__dirname, '../../src/lib');
  const source = fs.readFileSync(path.join(root, 'pixl.proto.js'), 'utf8');
  const names = [...source.matchAll(/export (?:async )?function (\w+)\(/g)].map(match => match[1]);
  const file = name => {
    const node = vfs.nodes.get(name);
    if (node?.type !== 0) throw new Error('Missing mock file: ' + name);
    return node.bytes;
  };
  const readPath = bytes => {
    const length = bytes.readUInt16LE(0);
    return { path: bytes.subarray(2, 2 + length).toString('utf8'), end: length + 2 };
  };
  const revisionValue = () => typeof revision === 'function' ? revision() : revision;
  const revisionBytes = () => {
    const value = Buffer.alloc(8);
    value.writeBigUInt64LE(BigInt('0x' + revisionValue()));
    return [...value];
  };
  async function response(cmd, bytes) {
    if (cmd === 0x03) return { payload: [80, 88, 68, 70, 1, 3, 243, 0, 247, 0] };
    if (cmd === 0x22) return { payload: [80, 88, 83, 67, 1, 7, 60, 2, ...revisionBytes()] };
    if (cmd === 0x25) return batch ? { payload: [80, 88, 66, 82, 1, 4, 60, 2, ...revisionBytes()] }
      : { status: 255, payload: [] };
    if (cmd === 0x05 && linkReply) return linkReply(bytes);
    if (cmd === 0x26 && batch) {
      const mode = bytes[0], count = bytes[1], files = [];
      if (![0, 1].includes(mode) || count < 1 || count > 4 || bytes.length > 243 ||
          bytes.readBigUInt64LE(2) !== BigInt('0x' + revisionValue())) throw new Error('Invalid mock batch contract');
      let offset = 10;
      for (let i = 0; i < count; ++i) {
        const entry = readPath(bytes.subarray(offset)); offset += entry.end;
        const size = bytes.readUInt16LE(offset); offset += 2;
        const stored = file(entry.path);
        if (size > 572 || stored.length !== size) return { status: 1, payload: [] };
        files.push({ path: entry.path, size, bytes: stored });
      }
      if (offset !== bytes.length) throw new Error('Unexpected mock batch suffix');
      const payload = Buffer.concat(files.map(entry => mode === 0 ? Buffer.from(entry.bytes)
        : createHash('sha256').update(entry.bytes).digest()));
      return batchReply ? batchReply({ mode, files, payload }) : { payload };
    }
    if (cmd === 0x21 || cmd === 0x24) {
      const { path, end } = readPath(bytes), expected = bytes.readUInt16LE(end), stored = file(path);
      if (stored.length !== expected) return { status: 1, payload: [] };
      if (cmd === 0x24) return { payload: stored };
      const hashBytes = createHash('sha256').update(stored).digest();
      return digestReply ? digestReply({ path, expected, hashBytes }) : { payload: hashBytes };
    }
    if (cmd === 0x12) {
      if (openPath !== null) throw new Error('Overlapping mock file handles');
      const request = readPath(bytes);
      if (bytes[request.end] !== 8) throw new Error('Mock only accepts read-only OPEN');
      file(request.path); openPath = request.path;
      return { payload: [5] };
    }
    if (cmd === 0x14 && openPath !== null && bytes[0] === 5) return { payload: file(openPath) };
    if (cmd === 0x13 && openPath !== null && bytes[0] === 5) { openPath = null; return { payload: [] }; }
    throw new Error('Unexpected mock command: ' + cmd);
  }
  function notify(cmd, { status = 0, payload }) {
    const bytes = Uint8Array.from(payload);
    let offset = 0, sequence = 0;
    do {
      const end = Math.min(offset + 243, bytes.length), more = end < bytes.length;
      const chunk = sequence++ | (more ? 0x8000 : 0);
      const wire = Uint8Array.from([cmd, status, chunk & 255, chunk >>> 8, ...bytes.subarray(offset, end)]);
      replies.push(wire);
      bus.emit('ble_rx_data', wire.buffer);
      offset = end;
    } while (offset < bytes.length);
  }
  const pixl = {
    get_connection_state: () => 'connected',
    async tx_data(value,withoutResponse) {
      const wire = Buffer.from(value);
      if (wire.length > 247 || wire.readUInt16LE(2) !== 0) throw new Error('Unexpected fragmented mock request');
      requests.push(wire);
      if (groupWire && [0x27,0x28].includes(wire[0])) {
        const result = await groupWire(wire[0],wire.subarray(4),withoutResponse);
        if (result) notify(wire[0],result);
        return;
      }
      Promise.resolve().then(() => response(wire[0], wire.subarray(4))).then(value => notify(wire[0], value)).catch(error => {
        errors.push(error); bus.emit('ble_disconnected', error);
      });
      return Promise.resolve();
    },
    disconnect: () => bus.emit('ble_disconnected'),
  };
  const context = { module: { exports: {} }, ...require(path.join(root, 'hardware-profile.js')),
    ...require(path.join(root, 'device-extra-diagnostics.js')), ...require(path.join(root, 'group-create-wire.js')),
    ByteBuffer, Promise, Error, ArrayBuffer, Uint8Array, DataView, TextEncoder, TextDecoder,
    console, pixl, i18n: { global: { t: value => value } }, sharedEventDispatcher: () => bus,
    setTimeout: callback => { const id = ++timer; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(source.replace(/^import .*$/gm, '').replace(/export ((?:async )?function )/g, '$1') +
    '\nmodule.exports = {' + names.join(',') + '};', context, { filename: 'pixl.proto.js' });
  const api = context.module.exports;
  api.init();
  await api.negotiate_transport();
  requests.length = 0; replies.length = 0; // Common connection setup is outside the transfer comparison.
  return { api, bus, requests, replies, errors, timers };
};
