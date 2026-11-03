// Production parsers and transport, with only ESM wiring replaced for the VM.
// The BLE mock never connects to a device. No preferences, files or keys change.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const ByteBuffer = require('bytebuffer');

function load(name, bindings = {}) {
    const root = process.env.PIXL_SOURCE_DIR || path.join(__dirname, '../src/lib');
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    const exports = [...source.matchAll(/export function (\w+)\(/g)].map(match => match[1]);
    const code = source.replace(/^import .*$/gm, '').replace(/export function /g, 'function ');
    const context = {ByteBuffer, EventEmitter, Promise, Error, ArrayBuffer, Uint8Array,
        DataView, TextDecoder, TextEncoder, console: {log() {}, error() {}},
        module: {exports: {}}, ...bindings};
    vm.runInNewContext(code + '\nmodule.exports = {' + exports.join(',') + '};', context, {filename: name});
    return context.module.exports;
}

function fixture() {
    const bus = load('event.js').sharedEventDispatcher();
    const writes = [], timers = new Map();
    let timerId = 0, disconnects = 0;
    const pixl = {
        get_connection_state: () => 'connected',
        tx_data(data) { writes.push(Array.from(new Uint8Array(data))); return Promise.resolve(); },
        disconnect() { ++disconnects; bus.emit('ble_disconnected'); }
    };
    const parsers = load('device-extra-diagnostics.js');
    const api = load('pixl.proto.js', {pixl, ...parsers,
        i18n: {global: {t: key => key}}, sharedEventDispatcher: () => bus,
        setTimeout: callback => {const id = ++timerId; timers.set(id, callback); return id;},
        clearTimeout: id => timers.delete(id)});
    api.init();
    return {api, bus, writes, timers, get disconnects() {return disconnects;},
        rx: (cmd, payload = [], chunk = 0, status = 0) => bus.emit('ble_rx_data',
            Uint8Array.from([cmd, status, chunk & 255, chunk >> 8, ...payload]).buffer)};
}

async function flush() {for (let i = 0; i < 100; ++i) await Promise.resolve();}
const plain = value => JSON.parse(JSON.stringify(value));
const next = f => f.api.op_queue_push(0x14, () => {}, b => b.readBytes(b.remaining()).toArrayBuffer());

function mtuPacket() {
    return Uint8Array.from([77,84,85,68,1,7,250,0,250,0,250,0,247,0,0,0]);
}
function uiPacket() {
    const b = new Uint8Array(104), v = new DataView(b.buffer);
    b.set([85,73,68,71,1,0,1,0]);
    for (let i = 0; i < 30; ++i) v.setUint16(8 + i * 2, 100 + i, true);
    b[68] = 5;
    v.setUint32(72, 9, true); v.setUint16(80, 7, true); v.setUint16(82, 12, true); b[84] = 6;
    v.setInt32(92, -2147483648, true);
    return b;
}

const probes = [
    {name: 'MTU', cmd: 5, method: 'get_mtu_diagnostics', packet: mtuPacket, length: 16,
        corrupt: b => {b[14] = 1;}},
    {name: 'UI', cmd: 4, method: 'get_ui_diagnostics', packet: uiPacket, length: 104,
        corrupt: b => {b[85] = 1;}}
];

test('unsupported extended storage read and legacy fallback do not invent a device fault', async () => {
    for (const extendedStatus of [1,255]) {
        const f = fixture(), p = f.api.vfs_storage_info_extended('E');
        assert.deepEqual(f.writes, [[0x1c,0,0,0,69,1]]);
        f.rx(0x1c, [], 0, extendedStatus); await flush();
        assert.deepEqual(f.writes.at(-1), [0x1c,0,0,0,69]);
        f.rx(0x1c, [], 0, 255);
        assert.equal((await p).status, 255);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, null);
        const layout = f.api.vfs_storage_layout('E');
        assert.deepEqual(f.writes.at(-1), [0x1f,0,0,0,69]);
        f.rx(0x1f, [], 0, 255); assert.equal((await layout).status, 255);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, null);
        assert.equal(f.disconnects, 0);
        const following = next(f); f.rx(0x14, [9]); await following;
    }
});

test('legacy storage and layout status1 remain real errors; later unsupported reads preserve them', async () => {
    for (const [method, cmd] of [['vfs_storage_info',0x1c], ['vfs_storage_layout',0x1f]]) {
        const f = fixture(), failed = f.api[method]('E');
        f.rx(cmd, [], 0, 1); assert.equal((await failed).status, 1);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'DEVICE_STATUS');
        const legacy = f.api.vfs_storage_info('E');
        f.rx(0x1c, [], 0, 255); assert.equal((await legacy).status, 255);
        const layout = f.api.vfs_storage_layout('E');
        f.rx(0x1f, [], 0, 255); assert.equal((await layout).status, 255);
        const extended = f.api.vfs_storage_info_extended('E');
        f.rx(0x1c, [], 0, 255); await flush(); f.rx(0x1c, [], 0, 255);
        assert.equal((await extended).status, 255);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'DEVICE_STATUS');
        assert.equal(f.disconnects, 0);
    }
    const f = fixture(), p = f.api.vfs_storage_info_extended('E');
    f.rx(0x1c, [], 0, 255); await flush(); f.rx(0x1c, [], 0, 1);
    assert.equal((await p).status, 1);
    assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'DEVICE_STATUS');
});

test('unsupported mutation is still a device error and malformed storage success remains invalid', async () => {
    const f = fixture(), mutation = f.api.vfs_import_state('E', 1);
    f.rx(0x20, [], 0, 255); assert.equal((await mutation).status, 255);
    assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'DEVICE_STATUS');
    for (const [method, cmd, length] of [['vfs_storage_info',0x1c,8], ['vfs_storage_layout',0x1f,72]]) {
        const g = fixture(), p = g.api[method]('E'), rejected = assert.rejects(p);
        g.rx(cmd, new Uint8Array(length)); await rejected;
        assert.equal(g.api.get_transport_diagnostics().lastErrorCode, 'RESPONSE_INVALID');
    }
});

for (const probe of probes) {
    test(`${probe.name}: explicit read is empty, serialized after file work and leaves queue usable`, async () => {
        const f = fixture(); assert.equal(f.writes.length, 0);
        const prior = next(f), p = f.api[probe.method]();
        assert.deepEqual(f.writes, [[0x14,0,0,0]]);
        f.rx(0x14, [7]); await prior; await flush();
        assert.deepEqual(f.writes.at(-1), [probe.cmd,0,0,0]);
        f.rx(probe.cmd, probe.packet());
        const result = await p;
        assert.equal(result.schemaVersion, 1); assert.equal(f.disconnects, 0);
        const following = next(f); f.rx(0x14, [9]);
        assert.deepEqual(Array.from(new Uint8Array((await following).data)), [9]);
        assert.equal(f.timers.size, 0);
    });

    test(`${probe.name}: real decoder reassembles at ATT MTU23,185,250 without more commands`, async () => {
        for (const mtu of [23,185,250]) {
            const f = fixture(), p = f.api[probe.method](), packet = probe.packet();
            const capacity = mtu - 7, total = Math.ceil(packet.length / capacity);
            for (let i = 0; i < total; ++i) f.rx(probe.cmd,
                packet.subarray(i * capacity, (i + 1) * capacity), i | (i + 1 < total ? 0x8000 : 0));
            const result = await p;
            if (probe.cmd === 5) {
                assert.equal(result.effectiveAttMtu, 250);
                assert.equal(result.gattValueCapacity, 247);
            } else {
                assert.deepEqual(plain(result.centerDelivered), {press:125,release:126,short:127,long:128,repeat:129});
                assert.equal(result.shortAttempt.stage, 6);
                assert.equal(result.longAttempt.saveResult, null);
            }
            assert.deepEqual(f.writes, [[probe.cmd,0,0,0]]);
            assert.equal(f.timers.size, 0); assert.equal(f.disconnects, 0);
        }
    });

    test(`${probe.name}: unknown command is optional, retaining an earlier actual failure`, async () => {
        const f = fixture(), optional = f.api[probe.method](); f.rx(probe.cmd, [], 0, 255);
        assert.equal(await optional, null);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, null);
        const failed = f.api[probe.method](), rejected = assert.rejects(failed);
        f.rx(probe.cmd, [], 0, 1); await rejected;
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'DEVICE_STATUS');
        const old = f.api[probe.method](); f.rx(probe.cmd, [], 0, 255);
        assert.equal(await old, null);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'DEVICE_STATUS');
        assert.equal(f.disconnects, 0);
        const following = next(f); f.rx(0x14, [9]); await following;
    });

    test(`${probe.name}: malformed success, oversized data and bad chunks cannot become partial snapshots`, async () => {
        const corrupt = probe.packet(); probe.corrupt(corrupt);
        for (const payload of [probe.packet().subarray(0, probe.length - 1),
            new Uint8Array(probe.length + 1), corrupt]) {
            const f = fixture(), p = f.api[probe.method](), rejected = assert.rejects(p);
            f.rx(probe.cmd, payload); await rejected;
            assert.equal(f.api.get_transport_diagnostics().lastErrorCode,
                payload.length > probe.length ? 'RX_INVALID' : 'RESPONSE_INVALID');
            assert.equal(f.disconnects, payload.length > probe.length ? 1 : 0);
        }
        const f = fixture(), p = f.api[probe.method](), rejected = assert.rejects(p);
        f.rx(probe.cmd, probe.packet(), 1); await rejected;
        assert.equal(f.disconnects, 1);
    });

    test(`${probe.name}: disconnect rejects both active and queued reads; late frames are ignored`, async () => {
        const f = fixture(), pending = f.api[probe.method](), queued = f.api[probe.method]();
        const a = assert.rejects(pending), b = assert.rejects(queued);
        f.bus.emit('ble_disconnected'); await Promise.all([a,b]);
        f.rx(probe.cmd, probe.packet()); await flush();
        assert.deepEqual(f.writes, [[probe.cmd,0,0,0]]);
        assert.equal(f.timers.size, 0);
    });

    test(`${probe.name}: valid or unsupported reply cannot resolve after session generation changes`, async () => {
        for (const status of [0,255]) {
            const f = fixture(), p = f.api[probe.method](), rejected = assert.rejects(p);
            await flush();
            // Resolve the underlying operation, then invalidate before wrapper .then.
            f.rx(probe.cmd, status ? [] : probe.packet(), 0, status);
            f.bus.emit('ble_disconnected'); await rejected;
        }
    });

    test(`${probe.name}: timeout releases the operation with an error rather than a cached success`, async () => {
        const f = fixture(), p = f.api[probe.method](), rejected = assert.rejects(p);
        await flush(); assert.equal(f.timers.size, 1);
        [...f.timers.values()][0](); await rejected;
        assert.equal(f.disconnects, 1);
    });
}
