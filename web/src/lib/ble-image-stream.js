// LCD App673 incoming stream. The ACK1 handshake proves that the dedicated
// receiver is active before any image bytes are written to the shared NUS UART.
import { claimGatt, ownsGatt, releaseGatt } from './gatt-owner.js';

export const STREAM_WIDTH = 128;
export const STREAM_HEIGHT = 64;
export const STREAM_FRAME_BYTES = 1024;
export const STREAM_CHUNK_BYTES = 20;
export const STREAM_UUIDS = Object.freeze({
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
});
const hello = new TextEncoder().encode('PXSTREAM:ACK1\n');
const keyframeInterval = 150;
const maximumNotificationLine = 128;

export class StreamError extends Error {
  constructor(code) { super(code); this.name = 'StreamError'; this.code = code; }
}
const failure = code => new StreamError(code);
const codeOf = (error, fallback) => error instanceof StreamError ? error.code : fallback;

function validateFrame(frame) {
  if (!(frame instanceof Uint8Array) || frame.length !== STREAM_FRAME_BYTES) throw failure('STREAM_FRAME_INVALID');
}

/** Convert an already scaled 128 x 64 RGBA image to row-major, LSB-first XBM.
 * A set XBM bit is a dark pixel on the LCD's normal ST7567 display, matching
 * the device-photo renderer. Transparency is composited onto the black canvas. */
const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function rgbaToFrame(rgba, { threshold = 128, invert = false, dither = 'threshold' } = {}) {
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length !== 128 * 64 * 4 ||
      !Number.isInteger(threshold) || threshold < 0 || threshold > 255 || typeof invert !== 'boolean' ||
      !['threshold', 'bayer'].includes(dither)) {
    throw failure('STREAM_FRAME_INVALID');
  }
  const frame = new Uint8Array(STREAM_FRAME_BYTES);
  for (let pixel = 0; pixel < 128 * 64; ++pixel) {
    const offset = pixel * 4;
    const luminance = (299 * rgba[offset] + 587 * rgba[offset + 1] + 114 * rgba[offset + 2]) * rgba[offset + 3] / 255000;
    // Screen-anchored 4×4 Bayer cells are deterministic across frames. The
    // existing threshold mode remains byte-for-byte unchanged by default.
    const level = dither === 'bayer' ? threshold + (bayer4[((pixel >> 7) & 3) * 4 + (pixel & 3)] - 7.5) * 16 : threshold;
    if ((luminance < level) !== invert) frame[pixel >> 3] |= 1 << (pixel & 7);
  }
  return frame;
}

/** Render the exact transmitted pixels, without a second thresholding pass. */
export function frameToRgba(frame) {
  validateFrame(frame);
  const rgba = new Uint8ClampedArray(128 * 64 * 4);
  for (let pixel = 0; pixel < 128 * 64; ++pixel) {
    const value = (frame[pixel >> 3] >> (pixel & 7)) & 1 ? 0 : 255;
    const offset = pixel * 4;
    rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function packRle(data) {
  // Isolated literals between short runs can expand beyond one control per
  // 128 bytes. Two bytes per input byte bounds even that adversarial pattern.
  const output = new Uint8Array(data.length * 2);
  let offset = 0, used = 0;
  while (offset < data.length) {
    let count = 1;
    while (offset + count < data.length && data[offset + count] === data[offset] && count < 129) ++count;
    if (count >= 2) {
      output[used++] = 128 + count - 2;
      output[used++] = data[offset];
      offset += count;
    } else {
      const start = offset++;
      while (offset < data.length && offset - start < 128) {
        if (offset + 1 < data.length && data[offset] === data[offset + 1]) break;
        ++offset;
      }
      output[used++] = offset - start - 1;
      output.set(data.subarray(start, offset), used);
      used += offset - start;
    }
  }
  return output.slice(0, used);
}

/** Wire-compatible with fw/scripts/stream_video_to_pixl.py and App673's C
 * decoder. Equal sizes favour a full frame, so delta dependencies stay minimal. */
export function encodeStreamFrame(frame, previous = null, { forceKeyframe = false } = {}) {
  validateFrame(frame);
  if (previous !== null) validateFrame(previous);
  let payload = frame, flag = 0;
  const full = packRle(frame);
  if (full.length < payload.length) { payload = full; flag = 1; }
  if (previous !== null && !forceKeyframe) {
    const delta = new Uint8Array(STREAM_FRAME_BYTES);
    for (let index = 0; index < delta.length; ++index) delta[index] = previous[index] ^ frame[index];
    const compressed = packRle(delta);
    if (compressed.length < payload.length) { payload = compressed; flag = 2; }
  }
  const packet = new Uint8Array(payload.length + 5);
  packet.set([0xa5, 0x5a, flag, payload.length & 255, payload.length >>> 8]);
  packet.set(payload, 5);
  return { packet, payloadBytes: payload.length, mode: ['raw', 'rle', 'delta-rle'][flag] };
}

/** A single foreground stream connection, independent of the file manager.
 * onState receives {phase, deviceName, error}; error is a stable STREAM_* code
 * or ''. connect() resolves to {deviceName}. Every completed sendFrame()
 * resolves to {packetBytes, payloadBytes, mode}; it never queues another frame.
 * Browser GATT does not expose a portable negotiated MTU, so writes use the
 * mandatory 20-byte ATT payload. App673's foreground ACK gates every chunk.
 */
export class BleImageStream {
  constructor({ bluetooth = globalThis.navigator?.bluetooth, onState = () => {},
    secureContext = globalThis.isSecureContext, stepMs = 20000, ackMs = 3000 } = {}) {
    this._bluetooth = bluetooth;
    this._onState = onState;
    this._secureContext = secureContext;
    this._stepMs = stepMs;
    this._ackMs = ackMs;
    this._generation = 0;
    this._phase = 'idle';
    this._device = this._owner = this._rx = this._tx = null;
    this._deviceName = '';
    this._pending = this._connectTask = this._sending = null;
    this._cancels = new Set();
    this._partial = '';
    this._previous = null;
    this._frames = 0;
    this._notification = event => this._receive(event);
    this._disconnected = event => {
      if (event.target === this._device && !this._owner?.opening && !this._device?.gatt?.connected) {
        this._terminate('STREAM_DISCONNECTED');
      }
    };
  }

  get connected() { return this._phase === 'connected' && !!this._device?.gatt?.connected && ownsGatt(this._device, this._owner); }

  _state(phase, error = '') {
    this._phase = phase;
    try { this._onState({ phase, deviceName: this._deviceName, error }); }
    catch { /* Observers cannot prevent connection cleanup. */ }
  }

  _check(generation) {
    if (generation !== this._generation || (this._device && !ownsGatt(this._device, this._owner))) throw failure('STREAM_CANCELLED');
  }

  _disconnectOwned(device, owner) {
    if (!ownsGatt(device, owner)) return;
    try { if (owner.opening || device.gatt.connected) device.gatt.disconnect(); }
    catch { /* The adapter may already have disconnected. */ }
    // A cancelled gatt.connect() can succeed later. Its finally block releases
    // the token, but only if a newer client has not claimed this device.
    if (!owner.opening) releaseGatt(device, owner);
  }

  _terminate(code = '') {
    ++this._generation;
    for (const cancel of [...this._cancels]) cancel(code || 'STREAM_CANCELLED');
    if (this._pending) {
      const pending = this._pending;
      this._pending = null;
      clearTimeout(pending.timer);
      pending.reject(failure(code || 'STREAM_CANCELLED'));
    }
    const device = this._device, owner = this._owner;
    this._rx?.removeEventListener('characteristicvaluechanged', this._notification);
    device?.removeEventListener('gattserverdisconnected', this._disconnected);
    this._device = this._owner = this._rx = this._tx = null;
    this._connectTask = this._sending = null;
    this._partial = '';
    this._previous = null;
    this._frames = 0;
    this._disconnectOwned(device, owner);
    if (!code) this._deviceName = '';
    this._state(code ? 'error' : 'idle', code);
  }

  _wait(operation, milliseconds, generation) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this._cancels.delete(cancel);
        error ? reject(error) : resolve(value);
      };
      const cancel = code => finish(failure(code));
      this._cancels.add(cancel);
      const timer = milliseconds == null ? null : setTimeout(() => finish(failure('STREAM_CONNECT_FAILED')), milliseconds);
      Promise.resolve(operation).then(value => {
        try { this._check(generation); finish(null, value); }
        catch (error) { finish(error); }
      }, error => finish(error));
    });
  }

  _connectionCode(error, beforeSelection) {
    if (error instanceof StreamError) return error.code;
    if (beforeSelection && error?.name === 'NotFoundError') return 'STREAM_NO_SELECTION';
    if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return 'STREAM_PERMISSION';
    return 'STREAM_CONNECT_FAILED';
  }

  connect() {
    if (this._connectTask) return this._connectTask;
    if (this.connected || this._phase === 'connecting') return Promise.reject(failure('STREAM_BUSY'));
    if (this._secureContext === false || typeof this._bluetooth?.requestDevice !== 'function') {
      this._state('error', 'STREAM_UNAVAILABLE');
      return Promise.reject(failure('STREAM_UNAVAILABLE'));
    }
    const generation = ++this._generation;
    const owner = { opening: false };
    this._deviceName = '';
    this._partial = '';
    this._state('connecting');
    // The picker must run directly in the user's click stack. Its interaction
    // has no timeout; disconnect() can still cancel our pending result.
    let picker;
    try {
      picker = this._bluetooth.requestDevice({
        filters: [{ name: 'Pixl.js' }, { services: [STREAM_UUIDS.service] }],
        optionalServices: [STREAM_UUIDS.service],
      });
    } catch (error) {
      const code = this._connectionCode(error, true);
      this._terminate(code);
      return Promise.reject(failure(code));
    }
    let selected = null;
    const task = (async () => {
      try {
        const chosen = await this._wait(picker, null, generation);
        this._check(generation);
        // NUS is shared by unrelated UART devices. Do not probe those devices.
        if (chosen?.name !== 'Pixl.js') throw failure('STREAM_WRONG_DEVICE');
        if (chosen.gatt?.connected) throw failure('STREAM_BUSY');
        selected = chosen;
        this._device = chosen;
        this._owner = owner;
        this._deviceName = chosen.name;
        claimGatt(chosen, owner);
        chosen.addEventListener('gattserverdisconnected', this._disconnected);
        const open = async () => {
          owner.opening = true;
          try { return await chosen.gatt.connect(); }
          finally {
            owner.opening = false;
            if (generation !== this._generation) this._disconnectOwned(chosen, owner);
          }
        };
        const server = await this._wait(open(), this._stepMs, generation);
        this._check(generation);
        const service = await this._wait(server.getPrimaryService(STREAM_UUIDS.service), this._stepMs, generation);
        this._check(generation);
        const tx = await this._wait(service.getCharacteristic(STREAM_UUIDS.write), this._stepMs, generation);
        this._check(generation);
        this._tx = tx;
        const rx = await this._wait(service.getCharacteristic(STREAM_UUIDS.notify), this._stepMs, generation);
        this._check(generation);
        this._rx = rx;
        const without = this._tx.properties?.writeWithoutResponse && typeof this._tx.writeValueWithoutResponse === 'function';
        const withResponse = this._tx.properties?.write && typeof this._tx.writeValueWithResponse === 'function';
        if (!(without || withResponse) || typeof this._rx.startNotifications !== 'function') throw failure('STREAM_UNSUPPORTED');
        this._writeMethod = without ? 'writeValueWithoutResponse' : 'writeValueWithResponse';
        this._rx.addEventListener('characteristicvaluechanged', this._notification);
        await this._wait(this._rx.startNotifications(), this._stepMs, generation);
        this._check(generation);
        await this._writeAndAck(hello, 'ACK1');
        this._check(generation);
        this._previous = null;
        this._frames = 0;
        this._state('connected');
        return { deviceName: this._deviceName };
      } catch (error) {
        const code = this._connectionCode(error, !selected);
        if (generation === this._generation) this._terminate(code);
        throw failure(code);
      } finally {
        if (this._connectTask === task) this._connectTask = null;
      }
    })();
    this._connectTask = task;
    return task;
  }

  disconnect() { this._terminate(); }

  _receive(event) {
    if (event.target !== this._rx || !ownsGatt(this._device, this._owner)) return;
    const value = event.target.value;
    if (!(value instanceof DataView)) { this._terminate('STREAM_PROTOCOL'); return; }
    const generation = this._generation;
    for (let offset = 0; offset < value.byteLength; ++offset) {
      const byte = value.getUint8(offset);
      if (byte === 10) {
        const line = this._partial;
        this._partial = '';
        if (line === 'ACK1' || line === 'OK') {
          const pending = this._pending;
          if (!pending || pending.acknowledged || pending.expected !== line) {
            this._terminate('STREAM_PROTOCOL');
            return;
          }
          pending.acknowledged = true;
          this._finishWrite();
        }
        // RSSI and unknown/legacy text do not grant flow-control credit.
      } else {
        this._partial += String.fromCharCode(byte);
        if (this._partial.length > maximumNotificationLine) {
          this._terminate('STREAM_PROTOCOL');
          return;
        }
      }
      if (generation !== this._generation) return;
    }
  }

  _finishWrite() {
    const pending = this._pending;
    if (!pending?.acknowledged || !pending.written) return;
    this._pending = null;
    clearTimeout(pending.timer);
    pending.resolve();
  }

  _writeAndAck(bytes, expected) {
    if (this._pending) return Promise.reject(failure('STREAM_BUSY'));
    if (!this._device?.gatt?.connected || !this._tx || !ownsGatt(this._device, this._owner)) {
      return Promise.reject(failure('STREAM_DISCONNECTED'));
    }
    return new Promise((resolve, reject) => {
      const pending = { expected, acknowledged: false, written: false, resolve, reject, timer: null };
      this._pending = pending;
      pending.timer = setTimeout(() => {
        if (this._pending === pending) this._terminate(expected === 'ACK1' ? 'STREAM_HANDSHAKE_TIMEOUT' : 'STREAM_ACK_TIMEOUT');
      }, this._ackMs);
      let operation;
      try { operation = this._tx[this._writeMethod](bytes); }
      catch { this._terminate('STREAM_DISCONNECTED'); return; }
      Promise.resolve(operation).then(() => {
        if (this._pending !== pending) return;
        pending.written = true;
        this._finishWrite();
      }, () => { if (this._pending === pending) this._terminate('STREAM_DISCONNECTED'); });
    });
  }

  async sendFrame(frame, { forceKeyframe = false } = {}) {
    if (!this.connected) throw failure('STREAM_DISCONNECTED');
    if (this._sending) throw failure('STREAM_BUSY');
    validateFrame(frame);
    const stable = frame.slice();
    const generation = this._generation;
    const sending = {};
    this._sending = sending;
    const encoded = encodeStreamFrame(stable, this._previous, { forceKeyframe: forceKeyframe || this._frames % keyframeInterval === 0 });
    try {
      for (let offset = 0; offset < encoded.packet.length; offset += STREAM_CHUNK_BYTES) {
        this._check(generation);
        await this._writeAndAck(encoded.packet.slice(offset, offset + STREAM_CHUNK_BYTES), 'OK');
      }
      this._check(generation);
      this._previous = stable;
      ++this._frames;
      return { packetBytes: encoded.packet.length, payloadBytes: encoded.payloadBytes, mode: encoded.mode };
    } catch (error) {
      const code = codeOf(error, 'STREAM_DISCONNECTED');
      if (generation === this._generation) this._terminate(code);
      throw failure(code);
    } finally {
      if (this._sending === sending) this._sending = null;
    }
  }
}
