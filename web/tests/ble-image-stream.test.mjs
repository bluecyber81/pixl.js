import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { BleImageStream, STREAM_UUIDS, STREAM_CHUNK_BYTES, rgbaToFrame, frameToRgba, encodeStreamFrame } from '../src/lib/ble-image-stream.js';
import { claimGatt } from '../src/lib/gatt-owner.js';
import { renderDisplayPhoto } from '../src/lib/display-photo.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
class Events {
  listeners = new Map();
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name) { for (const callback of [...this.listeners.get(name) || []]) callback({ target: this }); }
}
function fixture(options = {}) {
  const packets = [], pickers = [], states = [], methods = [];
  const device = new Events(), rx = new Events();
  const tx = { properties: { write: true, writeWithoutResponse: true } };
  device.name = options.name ?? 'Pixl.js';
  let disconnects = 0, starts = 0, connects = 0;
  const notify = input => {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    // Non-zero DataView offsets must not accidentally consume padding bytes.
    const padded = new Uint8Array(bytes.length + 6);
    padded.set(bytes, 3);
    rx.value = new DataView(padded.buffer, 3, bytes.length);
    rx.emit('characteristicvaluechanged');
  };
  const write = (bytes, method) => {
    const copy = Uint8Array.from(bytes);
    packets.push(copy); methods.push(method);
    if (options.write) return options.write(copy, notify, packets.length);
    notify(packets.length === 1 ? 'ACK1\n' : 'OK\n');
    return Promise.resolve();
  };
  tx.writeValueWithoutResponse = bytes => write(bytes, 'without');
  tx.writeValueWithResponse = bytes => write(bytes, 'with');
  rx.startNotifications = async () => { ++starts; if (options.start) await options.start(); return rx; };
  const service = { getCharacteristic: async uuid => {
    assert([STREAM_UUIDS.write, STREAM_UUIDS.notify].includes(uuid));
    if (options.characteristic) return options.characteristic(uuid, tx, rx);
    return uuid === STREAM_UUIDS.write ? tx : rx;
  } };
  const server = { getPrimaryService: async uuid => { assert.equal(uuid, STREAM_UUIDS.service); return options.service ? options.service(service) : service; } };
  device.gatt = {
    connected: false,
    connect: () => {
      ++connects;
      if (options.open) return options.open(device, server);
      device.gatt.connected = true;
      return Promise.resolve(server);
    },
    disconnect: () => { ++disconnects; device.gatt.connected = false; device.emit('gattserverdisconnected'); },
  };
  const bluetooth = { requestDevice: request => { pickers.push(request); return options.picker ? options.picker(device) : Promise.resolve(device); } };
  const client = new BleImageStream({ bluetooth, secureContext: true, onState: state => { states.push(state); options.onState?.(state); }, stepMs: 1000, ackMs: 1000, ...options.client });
  return { client, device, rx, tx, notify, packets, pickers, states, methods, get counts() { return { disconnects, starts, connects }; } };
}
const rawFrame = Uint8Array.from({ length: 1024 }, (_, index) => index & 255);
const hash = value => createHash('sha256').update(value).digest('hex');

test('stream remains inert until a click-stack picker and the exact ACK1 handshake', async () => {
  const f = fixture();
  assert.equal(f.pickers.length, 0); assert.equal(f.packets.length, 0); assert.equal(f.client.connected, false);
  const connecting = f.client.connect();
  assert.equal(f.pickers.length, 1); // requestDevice was not deferred to a promise.
  assert.deepEqual(await connecting, { deviceName: 'Pixl.js' });
  assert.deepEqual(f.pickers[0], { filters: [{ name: 'Pixl.js' }, { services: [STREAM_UUIDS.service] }], optionalServices: [STREAM_UUIDS.service] });
  assert.deepEqual(f.packets, [new TextEncoder().encode('PXSTREAM:ACK1\n')]);
  assert.deepEqual(f.states.map(value => value.phase), ['connecting', 'connected']);
  assert(f.client.connected); f.client.disconnect(); assert.equal(f.client.connected, false);
});

test('missing Bluetooth or insecure context never opens a picker', async () => {
  for (const options of [{ bluetooth: null }, { secureContext: false }]) {
    const f = fixture({ client: options });
    await assert.rejects(f.client.connect(), { code: 'STREAM_UNAVAILABLE' });
    assert.equal(f.pickers.length, 0); assert.equal(f.counts.connects, 0);
  }
});

test('an unrelated or remote-mode UART and an existing connection are never probed', async () => {
  for (const name of ['', 'Pixl.Remote', 'Pixl.Rem', 'Other UART', 'Pixl.js 2']) {
    const f = fixture({ name });
    await assert.rejects(f.client.connect(), { code: 'STREAM_WRONG_DEVICE' });
    assert.equal(f.counts.connects, 0); assert.equal(f.counts.disconnects, 0); assert.equal(f.packets.length, 0);
  }
  const f = fixture(); f.device.gatt.connected = true;
  await assert.rejects(f.client.connect(), { code: 'STREAM_BUSY' });
  assert.equal(f.counts.connects, 0); assert.equal(f.counts.disconnects, 0); assert(f.device.gatt.connected);
});

test('picker cancellation and permission errors remain distinct and retryable', async () => {
  for (const [name, code] of [['NotFoundError', 'STREAM_NO_SELECTION'], ['SecurityError', 'STREAM_PERMISSION'], ['NotAllowedError', 'STREAM_PERMISSION']]) {
    let reject = true;
    const f = fixture({ picker: device => reject ? Promise.reject(new DOMException('synthetic', name)) : Promise.resolve(device) });
    await assert.rejects(f.client.connect(), { code });
    reject = false; await f.client.connect(); f.client.disconnect();
  }
});

test('a non-receiver gets only one hello, never image bytes or blind retries', async () => {
  const f = fixture({ write: () => {}, client: { ackMs: 20 } });
  await assert.rejects(f.client.connect(), { code: 'STREAM_HANDSHAKE_TIMEOUT' });
  await assert.rejects(f.client.sendFrame(rawFrame), { code: 'STREAM_DISCONNECTED' });
  assert.equal(f.packets.length, 1); assert.equal(f.packets[0][0], 0x50); assert.equal(f.client.connected, false); assert(f.counts.disconnects > 0);
});

test('fragmented ACK and multiple RSSI/legacy lines count as one handshake receipt', async () => {
  const f = fixture({ write: (_, notify) => { notify('unknown\nRSSI:bad\nRSSI:-51\nAC'); notify('K1\n'); } });
  await f.client.connect(); assert(f.client.connected); f.client.disconnect();
});

test('wrong, duplicate, and overlong notifications fail closed', async () => {
  for (const reply of ['OK\n', 'ACK1\nACK1\n', 'x'.repeat(129), 'ACK1\nOK\n']) {
    const f = fixture({ write: (_, notify) => notify(reply) });
    await assert.rejects(f.client.connect(), { code: 'STREAM_PROTOCOL' });
    assert.equal(f.packets.length, 1); assert.equal(f.client.connected, false);
  }
  const f = fixture(); await f.client.connect(); f.notify('OK\n');
  assert.equal(f.client.connected, false); assert.equal(f.states.at(-1).error, 'STREAM_PROTOCOL');
});

test('128-byte notification lines stay bounded without treating noise as an ACK', async () => {
  const f = fixture({ write: (_, notify) => notify('x'.repeat(128) + '\nACK1\n') });
  await f.client.connect(); f.client.disconnect();
});

test('the explicit supported GATT write method is selected and deprecated writeValue is unused', async () => {
  for (const method of ['without', 'with']) {
    const f = fixture();
    f.tx.writeValue = () => { throw Error('deprecated path'); };
    if (method === 'with') f.tx.properties.writeWithoutResponse = false;
    await f.client.connect(); await f.client.sendFrame(new Uint8Array(1024));
    assert(f.methods.every(value => value === method)); f.client.disconnect();
  }
  const f = fixture(); f.tx.properties = {};
  await assert.rejects(f.client.connect(), { code: 'STREAM_UNSUPPORTED' }); assert.equal(f.packets.length, 0);
});

test('raw frames use at most 20-byte chunks and preserve all 1029 packet bytes', async () => {
  const f = fixture(); await f.client.connect();
  const result = await f.client.sendFrame(rawFrame);
  assert.deepEqual(result, { packetBytes: 1029, payloadBytes: 1024, mode: 'raw' });
  assert.equal(STREAM_CHUNK_BYTES, 20);
  assert.equal(f.packets.length, 1 + Math.ceil(1029 / 20));
  assert(f.packets.every(packet => packet.length <= 20));
  assert.deepEqual(Buffer.concat(f.packets.slice(1)), Buffer.from(encodeStreamFrame(rawFrame).packet));
  f.client.disconnect();
});

test('an early ACK cannot advance the next chunk until the GATT write resolves', async () => {
  const gate = deferred();
  const f = fixture({ write: (_, notify, index) => { notify(index === 1 ? 'ACK1\n' : 'OK\n'); if (index === 2) return gate.promise; } });
  await f.client.connect(); const send = f.client.sendFrame(rawFrame);
  await turn(); assert.equal(f.packets.length, 2);
  gate.resolve(); await send; assert(f.packets.length > 2); f.client.disconnect();
});

test('a completed GATT write cannot advance without the foreground ACK', async () => {
  const f = fixture({ write: (_, notify, index) => { if (index !== 2) notify(index === 1 ? 'ACK1\n' : 'OK\n'); } });
  await f.client.connect(); const send = f.client.sendFrame(rawFrame);
  await turn(); assert.equal(f.packets.length, 2);
  await assert.rejects(f.client.sendFrame(rawFrame), { code: 'STREAM_BUSY' });
  f.notify('RSSI:-49\nlegacy\n'); await turn(); assert.equal(f.packets.length, 2);
  f.notify('OK\n'); await send; f.client.disconnect();
});

test('missing ACK closes after the first chunk without resending or preserving a delta reference', async () => {
  const f = fixture({ write: (_, notify, index) => { if (index === 1) notify('ACK1\n'); }, client: { ackMs: 20 } });
  await f.client.connect(); await assert.rejects(f.client.sendFrame(rawFrame), { code: 'STREAM_ACK_TIMEOUT' });
  assert.equal(f.packets.length, 2); assert.equal(f.client.connected, false); assert.equal(f.states.at(-1).error, 'STREAM_ACK_TIMEOUT');
});

test('a rejected write after an early ACK closes the stream instead of advancing', async () => {
  const f = fixture({ write: (_, notify, index) => {
    notify(index === 1 ? 'ACK1\n' : 'OK\n');
    return index === 2 ? Promise.reject(Error('synthetic write rejection')) : undefined;
  } });
  await f.client.connect(); await assert.rejects(f.client.sendFrame(rawFrame), { code: 'STREAM_DISCONNECTED' });
  assert.equal(f.packets.length, 2); assert.equal(f.client.connected, false);
});

test('stopping an active transfer rejects promptly and detaches every device listener', async () => {
  let wait = true;
  const f = fixture({ write: (bytes, notify) => {
    if (bytes[0] === 0x50) notify('ACK1\n');
    else if (!wait) notify('OK\n');
  } });
  await f.client.connect(); const send = f.client.sendFrame(rawFrame);
  f.client.disconnect(); await assert.rejects(send, { code: 'STREAM_CANCELLED' });
  assert.equal(f.rx.listeners.get('characteristicvaluechanged').size, 0);
  assert.equal(f.device.listeners.get('gattserverdisconnected').size, 0);
  const count = f.packets.length; f.notify('OK\n'); await turn(); assert.equal(f.packets.length, count);
  wait = false; await f.client.connect(); await f.client.sendFrame(rawFrame);
  assert.equal(f.packets[count + 1][2], 0); // Fresh keyframe, no old reference.
  f.client.disconnect();
});

test('external disconnect rejects a pending send and does not auto-reconnect', async () => {
  const f = fixture({ write: (_, notify, index) => { if (index === 1) notify('ACK1\n'); } });
  await f.client.connect(); const send = f.client.sendFrame(rawFrame);
  f.device.gatt.connected = false; f.device.emit('gattserverdisconnected');
  await assert.rejects(send, { code: 'STREAM_DISCONNECTED' });
  assert.equal(f.pickers.length, 1); assert.equal(f.client.connected, false);
});

test('cancelling the still-open picker settles the caller and ignores its late selection', async () => {
  const gate = deferred(); const f = fixture({ picker: () => gate.promise });
  const connect = f.client.connect(); f.client.disconnect();
  await assert.rejects(connect, { code: 'STREAM_CANCELLED' });
  gate.resolve(f.device); await turn();
  assert.equal(f.counts.connects, 0); assert.equal(f.packets.length, 0); assert.equal(f.states.at(-1).phase, 'idle');
});

test('a cancelled late GATT connection closes only its own connection', async () => {
  for (const transferOwnership of [false, true]) {
    const gate = deferred();
    const f = fixture({ open: async (device, server) => { await gate.promise; device.gatt.connected = true; return server; } });
    const connect = f.client.connect(); await turn();
    f.client.disconnect(); await assert.rejects(connect, { code: 'STREAM_CANCELLED' });
    const count = f.counts.disconnects;
    if (transferOwnership) claimGatt(f.device, {});
    gate.resolve(); await turn();
    assert.equal(f.counts.disconnects, count + (transferOwnership ? 0 : 1));
    assert.equal(f.device.gatt.connected, transferOwnership); assert.equal(f.packets.length, 0);
  }
});

test('a stalled GATT stage times out, while a late result cannot install stale listeners', async () => {
  const gate = deferred(); let service;
  const f = fixture({ service: value => { service = value; return gate.promise; }, client: { stepMs: 20 } });
  await assert.rejects(f.client.connect(), { code: 'STREAM_CONNECT_FAILED' });
  gate.resolve(service); await turn();
  assert.equal(f.packets.length, 0); assert.equal(f.counts.starts, 0); assert.equal(f.client.connected, false);
});

test('disconnect from an old client never closes a later owner of the BluetoothDevice', async () => {
  const f = fixture(); await f.client.connect(); const before = f.counts.disconnects;
  claimGatt(f.device, {}); f.client.disconnect();
  assert.equal(f.counts.disconnects, before); assert(f.device.gatt.connected);
});

test('the submitted frame is snapshotted and invalid frames do not break a ready connection', async () => {
  const gate = deferred();
  const f = fixture({ write: (_, notify, index) => { notify(index === 1 ? 'ACK1\n' : 'OK\n'); if (index === 2) return gate.promise; } });
  await f.client.connect();
  for (const frame of [null, [], new Uint8Array(0), new Uint8Array(1023), new Uint8Array(1025)]) {
    await assert.rejects(f.client.sendFrame(frame), { code: 'STREAM_FRAME_INVALID' });
  }
  const frame = rawFrame.slice(), send = f.client.sendFrame(frame);
  frame.fill(0); gate.resolve(); await send;
  assert.deepEqual(Buffer.concat(f.packets.slice(1)), Buffer.from(encodeStreamFrame(rawFrame).packet));
  assert(f.client.connected); f.client.disconnect();
});

test('delta references advance only after full frames and every 150 frames refreshes the keyframe', async () => {
  const f = fixture(); await f.client.connect();
  const modes = [];
  for (let index = 0; index <= 150; ++index) modes.push((await f.client.sendFrame(rawFrame)).mode);
  assert.equal(modes[0], 'raw'); assert(modes.slice(1, 150).every(value => value === 'delta-rle')); assert.equal(modes[150], 'raw');
  assert.equal((await f.client.sendFrame(rawFrame, { forceKeyframe: true })).mode, 'raw');
  f.client.disconnect();
});

test('dark LCD pixels use XBM LSB-first set bits and the preview preserves their polarity', () => {
  const rgba = new Uint8ClampedArray(128 * 64 * 4).fill(255);
  for (const pixel of [0, 7, 8, 127, 128, 8191]) rgba.set([0, 0, 0, 255], pixel * 4);
  const frame = rgbaToFrame(rgba);
  assert.equal(frame[0], 129); assert.equal(frame[1], 1); assert.equal(frame[15], 128); assert.equal(frame[16], 1); assert.equal(frame[1023], 128);
  assert.deepEqual(frameToRgba(frame), rgba);
  assert.deepEqual(rgbaToFrame(rgba, { invert: true }), frame.map(byte => byte ^ 255));
});

test('stream preview matches the existing ST7567 device-photo renderer across rows, pages and inversion', () => {
  const original = new Uint8ClampedArray(128 * 64 * 4).fill(255);
  const darkPixels = [[0, 0], [7, 0], [8, 0], [127, 0], [0, 1], [4, 6], [1, 7], [2, 8], [126, 62], [127, 63]];
  for (const [x, y] of darkPixels) original.set([0, 0, 0, 255], (y * 128 + x) * 4);
  for (const invert of [false, true]) {
    const frame = rgbaToFrame(original, { invert });
    // Model only the XBM -> controller-page layout used by u8g2_DrawXBM.
    // The established LCD photograph renderer independently supplies polarity.
    const controllerPages = new Uint8Array(1024);
    for (let y = 0; y < 64; ++y) for (let x = 0; x < 128; ++x) {
      if (frame[y * 16 + (x >> 3)] & (1 << (x & 7))) controllerPages[(y >> 3) * 128 + x] |= 1 << (y & 7);
    }
    if (!invert) {
      assert.equal(controllerPages[0], 0b00000011);
      assert.equal(controllerPages[1], 0b10000000);
      assert.equal(controllerPages[4], 0b01000000);
      assert.equal(controllerPages[128 + 2], 0b00000001);
      assert.equal(controllerPages[896 + 127], 0b10000000);
    }
    let lcdPhoto;
    const canvas = { getContext: () => ({
      createImageData: () => ({ data: new Uint8ClampedArray(128 * 64 * 4) }),
      putImageData: image => { lcdPhoto = image.data; },
    }), toDataURL: () => 'data:image/png;test' };
    renderDisplayPhoto(controllerPages, canvas);
    assert.deepEqual(frameToRgba(frame), lcdPhoto);
    for (let pixel = 0; pixel < 8192; ++pixel) {
      const expected = invert ? 255 - original[pixel * 4] : original[pixel * 4];
      assert.equal(lcdPhoto[pixel * 4], expected);
      assert.equal(lcdPhoto[pixel * 4 + 3], 255);
    }
  }
});

test('threshold endpoints, luminance, alpha and invalid pixel inputs are deterministic', () => {
  const rgba = new Uint8ClampedArray(128 * 64 * 4);
  rgba.set([255, 255, 255, 0, 255, 255, 255, 127, 255, 255, 255, 128, 255, 0, 0, 255, 0, 255, 0, 255]);
  // Transparent white composites to black; alpha 127 remains dark, alpha 128
  // becomes light. Red luminance is below 128 and green is above it.
  assert.equal(rgbaToFrame(rgba)[0], 0b11101011);
  assert.deepEqual([...frameToRgba(rgbaToFrame(rgba)).slice(0, 12)], [0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  assert(rgbaToFrame(rgba, { threshold: 0 }).every(byte => byte === 0)); // No pixel is darker than zero.
  assert(rgbaToFrame(rgba, { threshold: 255 }).every(byte => byte === 255)); // No fully opaque white input yet.
  rgba.set([255, 255, 255, 255], 5 * 4);
  assert.equal(rgbaToFrame(rgba, { threshold: 255 })[0], 0b11011111); // White remains white at the upper endpoint.
  for (const threshold of [-1, 256, 1.5, NaN, '128']) assert.throws(() => rgbaToFrame(rgba, { threshold }), { code: 'STREAM_FRAME_INVALID' });
  for (const value of [null, [], new Uint8Array(8192), new Uint8ClampedArray(32767)]) assert.throws(() => rgbaToFrame(value), { code: 'STREAM_FRAME_INVALID' });
  assert.throws(() => frameToRgba(new Uint8Array(1023)), { code: 'STREAM_FRAME_INVALID' });
});

test('raw and run encodings are bounded even for isolated literals between two-byte runs', () => {
  const zeros = encodeStreamFrame(new Uint8Array(1024));
  assert.equal(zeros.mode, 'rle'); assert.equal(zeros.payloadBytes, 16);
  assert.deepEqual([...zeros.packet.slice(5, 7)], [255, 0]); // 129-byte maximum repeat.
  const adversarial = Uint8Array.from({ length: 1024 }, (_, index) => index % 3 === 0 ? (index % 127) + 1 : 0);
  const result = encodeStreamFrame(adversarial);
  assert.equal(result.mode, 'raw'); assert.equal(result.packet.length, 1029);
  assert.throws(() => encodeStreamFrame(rawFrame, new Uint8Array(0)), { code: 'STREAM_FRAME_INVALID' });
});

test('web encoder matches immutable Python vectors that the actual App673 C receiver decoded', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/ble-stream-app673-vectors.json', import.meta.url), 'utf8'));
  assert.equal(fixture.receiverCommit, '68b7d6e0cceadbc4c0801092ddc2e65947dd6e88');
  assert.equal(fixture.actualCDecoderPassed, true);
  for (const vector of fixture.vectors) {
    const frame = Uint8Array.from(Buffer.from(vector.frameHex, 'hex'));
    const previous = vector.previousHex == null ? null : Uint8Array.from(Buffer.from(vector.previousHex, 'hex'));
    const encoded = encodeStreamFrame(frame, previous, { forceKeyframe: vector.forceKeyframe });
    assert.equal(Buffer.from(encoded.packet).toString('hex'), vector.packetHex, vector.name);
    assert.equal(hash(frame), vector.decodedSha256, vector.name);
  }
});

test('fixed Bayer cells preserve tonal coverage, black/white and inversion without changing threshold defaults', () => {
  const make = level => {const rgba=new Uint8ClampedArray(32768);for(let i=0;i<rgba.length;i+=4)rgba.set([level,level,level,255],i);return rgba;};
  const count = frame => [...frame].reduce((sum,value)=>sum+value.toString(2).replaceAll('0','').length,0);
  const mid=make(128),first=rgbaToFrame(mid,{dither:'bayer'});
  assert.equal(count(first),4096);assert.deepEqual(rgbaToFrame(mid,{dither:'bayer'}),first);
  assert.equal(count(rgbaToFrame(make(64),{dither:'bayer'})),6144);
  assert.equal(count(rgbaToFrame(make(192),{dither:'bayer'})),2048);
  assert.equal(count(rgbaToFrame(make(0),{dither:'bayer'})),8192);
  assert.equal(count(rgbaToFrame(make(255),{dither:'bayer'})),0);
  const inverted=rgbaToFrame(mid,{dither:'bayer',invert:true});for(let i=0;i<1024;i++)assert.equal(first[i]^inverted[i],255);
  assert.deepEqual(rgbaToFrame(mid),rgbaToFrame(mid,{dither:'threshold'}));
  assert.throws(()=>rgbaToFrame(mid,{dither:'noise'}),{code:'STREAM_FRAME_INVALID'});
});
