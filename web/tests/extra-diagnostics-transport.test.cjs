// Production parsers and transport, with only ESM wiring replaced for the VM.
// The BLE mock never connects to a device. No preferences, files or keys change.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const ByteBuffer = require('bytebuffer');
ByteBuffer.DEFAULT_ENDIAN = ByteBuffer.LITTLE_ENDIAN;

function load(name, bindings = {}) {
    const root = process.env.PIXL_SOURCE_DIR || path.join(__dirname, '../src/lib');
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    const exports = [...source.matchAll(/export (?:async )?function (\w+)\(/g)].map(match => match[1]);
    const code = source.replace(/^import .*$/gm, '').replace(/export ((?:async )?function )/g, '$1');
    const context = {...require(path.join(root,'hardware-profile.js')), ByteBuffer, EventEmitter, Promise, Error, ArrayBuffer, Uint8Array,
        DataView, TextDecoder, TextEncoder, console: {log() {}, error() {}},
        module: {exports: {}}, ...bindings};
    vm.runInNewContext(code + '\nmodule.exports = {' + exports.join(',') + '};', context, {filename: name});
    return context.module.exports;
}

function fixture(extra = {}) {
    const bus = load('event.js').sharedEventDispatcher();
    const writes = [], timers = new Map();
    let timerId = 0, disconnects = 0;
    const pixl = {
        get_connection_state: () => 'connected',
        tx_data(data) { writes.push(Array.from(new Uint8Array(data))); return Promise.resolve(); },
        disconnect() { ++disconnects; bus.emit('ble_disconnected'); }
    };
    const parsers = load('device-extra-diagnostics.js');
    const api = load('pixl.proto.js', {pixl, ...parsers, ...load('flash-diagnostics.js'), ...extra,
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

test('first main menu read is version gated, queued, and distinguishes missing, valid and broken replies', async () => {
    const v = '2.22.0-DE3.70', f = fixture();
    for (const old of ['2.22.0-DE3.69', '2.27.0', '', undefined]) assert.equal(await f.api.get_menu_diagnostics(old), null);
    assert.deepEqual(f.writes, []);
    const file = next(f), pending = f.api.get_menu_diagnostics(v);
    assert.equal(f.writes.length, 1);
    f.rx(0x14, [9]); await file; await flush();
    assert.deepEqual(f.writes.at(-1), [4,0,0,0,2]);
    f.rx(4, [], 0, 255); await flush();
    assert.deepEqual(f.writes.at(-1), [4,0,0,0,1]);
    const packet = Uint8Array.from([80,88,77,73,1,16,15,2,1,1,1,0,42,0,0,0]);
    f.rx(4, packet);
    const data = await pending;
    assert.equal(data.launchCallMilliseconds, 42); assert.equal(data.targetAppId, 2);
    assert.deepEqual(plain(data.centerCounts), {press: 1, release: 1, short: 1});
    for (const status of [1,255]) {
        const p = f.api.get_menu_diagnostics(v); f.rx(4, [], 0, status); await flush();
        assert.deepEqual(f.writes.at(-1), [4,0,0,0,1]); f.rx(4, [], 0, status);
        assert.equal(await p, null); assert.equal(f.api.get_transport_diagnostics().lastErrorCode, null);
    }
    const broken = f.api.get_menu_diagnostics(v), rejected = assert.rejects(broken);
    f.rx(4, packet.subarray(1)); await rejected;
    assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'RESPONSE_INVALID');
});

const menuV2Packet = () => Uint8Array.from(Buffer.from('50584d4902200f03010101002a00000078563412f0debc9affff080808080308','hex'));

test('PXMI v2 uses one bounded read and reassembles each supported ATT fixture size', async () => {
    for (const mtu of [23,185,250]) {
        const f=fixture(), pending=f.api.get_menu_diagnostics('2.22.0-DE3.71t1');
        assert.deepEqual(f.writes,[[4,0,0,0,2]]);
        const bytes=menuV2Packet(), capacity=mtu-7;
        for(let offset=0;offset<bytes.length;offset+=capacity)
            f.rx(4,bytes.subarray(offset,offset+capacity),(offset/capacity)|(offset+capacity<bytes.length?0x8000:0));
        const data=await pending;
        assert.equal(data.schemaVersion,2); assert.equal(data.targetAppId,3);
        assert.equal(data.lastAppReturn.sourceAppId,8); assert.equal(data.lastAppReturn.firstIconAppId,3);
        assert.equal(data.lastAppReturn.staleEventsDiscarded,65535);
        assert.equal(f.writes.length,1); assert.equal(f.disconnects,0); assert.equal(f.timers.size,0);
    }
});

test('PXMI v2 falls back once on explicit unsupported status and keeps the first-launch-only meaning', async () => {
    for(const status of [1,255]) {
        const f=fixture(), pending=f.api.get_menu_diagnostics('2.22.0-DE3.71');
        f.rx(4,[],0,status); await flush();
        assert.deepEqual(f.writes,[[4,0,0,0,2],[4,0,0,0,1]]);
        const old=menuV2Packet().slice(0,16);old[4]=1;old[5]=16;
        f.rx(4,old);const data=await pending;
        assert.equal(data.schemaVersion,1);assert.equal(data.lastAppReturn,undefined);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
        const following=next(f);f.rx(0x14,[9]);await following;
    }
});

test('PXMI malformed success, wrong version, overlength, other errors and timeout never trigger v1 fallback', async () => {
    const old=menuV2Packet().slice(0,16);old[4]=1;old[5]=16;
    const corrupt=menuV2Packet();corrupt[6]=0x80;
    for(const packet of [old,menuV2Packet().slice(0,31),new Uint8Array(33),corrupt]) {
        const f=fixture(),pending=f.api.get_menu_diagnostics('2.22.0-DE3.71'),rejected=assert.rejects(pending);
        f.rx(4,packet);await rejected;await flush();
        assert.deepEqual(f.writes,[[4,0,0,0,2]]);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode,packet.length>32?'RX_INVALID':'RESPONSE_INVALID');
    }
    const f=fixture(),pending=f.api.get_menu_diagnostics('2.22.0-DE3.71'),rejected=assert.rejects(pending);
    f.rx(4,[],0,9);await rejected;assert.equal(f.writes.length,1);
    const timeout=fixture(),waiting=timeout.api.get_menu_diagnostics('2.22.0-DE3.71'),failed=assert.rejects(waiting);
    await flush();[...timeout.timers.values()][0]();await failed;
    assert.equal(timeout.writes.length,1);assert.equal(timeout.disconnects,1);
});

test('PXMI session changes prevent fallback or successful delivery and ignore late fragments', async () => {
    for(const status of [0,1,255]) {
        const f=fixture(),pending=f.api.get_menu_diagnostics('2.22.0-DE3.71t1'),rejected=assert.rejects(pending);
        await flush();f.rx(4,status?[]:menuV2Packet(),0,status);f.bus.emit('ble_disconnected');
        await rejected;await flush();assert.deepEqual(f.writes,[[4,0,0,0,2]]);
        f.rx(4,menuV2Packet());await flush();assert.equal(f.writes.length,1);
    }
    const f=fixture(),pending=f.api.get_menu_diagnostics('2.22.0-DE3.71'),rejected=assert.rejects(pending);
    f.rx(4,[],0,255);await flush();assert.equal(f.writes.length,2);
    f.bus.emit('ble_disconnected');await rejected;f.rx(4,menuV2Packet().slice(0,16));
    await flush();assert.equal(f.writes.length,2);
});

test('the exact T1 identity retains existing read-only startup detail and small-file digest capabilities', async () => {
    const startup=await import('../src/lib/startup-diagnostics.js'),f=fixture(startup);
    const pending=f.api.get_startup_diagnostics('2.22.0-DE3.71t1');
    assert.deepEqual(f.writes,[[9,0,0,0,2]]);
    f.rx(9,[],0,255);await flush();assert.deepEqual(f.writes.at(-1),[9,0,0,0,1]);
    f.rx(9,[],0,255);await flush();assert.deepEqual(f.writes.at(-1),[9,0,0,0]);
    f.rx(9,[],0,255);assert.equal(await pending,null);
    const digest=f.api.vfs_backup_digest('E:/tag.bin',540,'2.22.0-DE3.71t1');
    assert.equal(f.writes.at(-1)[0],0x21);
    f.rx(0x21,new Uint8Array(32).fill(0xab));assert.equal(await digest,'ab'.repeat(32));
    const count=f.writes.length;
    assert.equal(await f.api.vfs_backup_digest('E:/tag.bin',540,'2.22.0-DE3.71t2'),null);
    assert.equal(f.writes.length,count);
});

test('LCD page reads negotiate old devices, MTU23 fragmentation, disconnect and queued file access', async () => {
    const module = await import('../src/lib/display-photo.js');
    const version = '2.22.0-DE3.66', cmd = 0x0a;
    const pixels = Uint8Array.from({length: 1024}, (_, i) => (i * 17) & 255);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
    const f = fixture(module);
    for (const legacy of ['2.22.0-DE3.65', '', '2.29.0']) assert.equal(await f.api.get_display_photo(legacy), null);
    assert.deepEqual(f.writes, []);
    const prior = next(f), photo = f.api.get_display_photo(version);
    assert.equal(f.writes.length, 1);
    f.rx(0x14, [9]); await prior;
    for (let i = 0; i < 8; i++) {
        await flush();
        assert.deepEqual(f.writes.at(-1), [cmd,0,0,0,76,67,68,49,i]);
        const reply = Uint8Array.from([80,88,76,67,1,i,128,64,...digest,...pixels.subarray(i*128,(i+1)*128)]);
        for (let offset = 0; offset < reply.length; offset += 16) {
            f.rx(cmd, reply.subarray(offset, offset+16), offset / 16 | (offset+16 < reply.length ? 0x8000 : 0));
        }
    }
    assert.deepEqual(await photo, pixels);
    const following = next(f); f.rx(0x14, [11]); await following;
    const unsupported = f.api.get_display_photo(version);
    f.rx(cmd, [], 0, 255); assert.equal(await unsupported, null);
    assert.equal(f.api.get_transport_diagnostics().lastErrorCode, null);
    const interrupted = f.api.get_display_photo(version);
    const rejected = assert.rejects(interrupted);
    f.bus.emit('ble_disconnected'); await rejected;
    assert.deepEqual(f.writes.at(-1), [cmd,0,0,0,76,67,68,49,0]);
});

function mtuPacket() {
    return Uint8Array.from([77,84,85,68,1,7,250,0,250,0,250,0,247,0,0,0]);
}

for (const version of ['2.22.0-DE3.82','2.22.0-DE3.83','2.22.0-DE3.84']) test(`LCD ${version} reports a temporarily unavailable display without recording a transport fault`, async () => {
    const display = await import('../src/lib/display-photo.js');
    const f = fixture(display);
    const busy = assert.rejects(f.api.get_display_photo(version), {code:'DISPLAY_UNAVAILABLE'});
    f.rx(10, [], 0, 1);
    await busy;
    assert.equal(f.api.get_transport_diagnostics().lastErrorCode, null);
    const missing = f.api.get_display_photo(version);
    f.rx(10, [], 0, 255);
    assert.equal(await missing, null);
});

for (const t3 of ['2.22.0-DE3.81-OLEDt3','2.22.0-DE3.84-OLEDt4','2.22.0-DE3.85-OLEDt5']) test(`OLED ${t3} probes supported diagnostics and handles missing screens and JEDEC data`, async () => {
    const display = await import('../src/lib/display-photo.js');
    const f = fixture(display);
    for (const version of ['2.22.0-DE3.81-OLEDt1', '2.22.0-DE3.81-OLEDt2']) {
        for (const read of ['get_runtime_diagnostics', 'get_power_diagnostics', 'get_startup_diagnostics',
                            'get_menu_diagnostics', 'get_flash_diagnostics', 'get_display_photo']) {
            assert.equal(await f.api[read](version), null);
        }
    }
    assert.deepEqual(f.writes, []);
    for (const read of ['get_menu_diagnostics','get_flash_diagnostics','get_display_photo']) {
        assert.equal(await f.api[read]('2.22.0-DE3.81-OLEDt4'), null);
    }
    assert.deepEqual(f.writes, []);
    for (const [read,cmd] of [['get_runtime_diagnostics',6],['get_power_diagnostics',8]]) {
        const pending = f.api[read](t3);
        assert.deepEqual(f.writes.at(-1), [cmd,0,0,0]);
        f.rx(cmd, [], 0, 255);
        assert.equal(await pending, null);
    }
    const nativeStartup = f.api.get_startup_diagnostics(t3);
    assert.deepEqual(f.writes.at(-1), [9,0,0,0,1]);
    f.rx(9,[],0,255); await flush();
    assert.deepEqual(f.writes.at(-1), [9,0,0,0]);
    f.rx(9,[],0,255); assert.equal(await nativeStartup, null);
    const menu = f.api.get_menu_diagnostics(t3);
    assert.deepEqual(f.writes.at(-1), [4,0,0,0,2]);
    f.rx(4,menuV2Packet());
    assert.equal((await menu).schemaVersion, 2);
    for (const status of [1,255]) {
        const flash = f.api.get_flash_diagnostics(t3);
        f.rx(11,[],0,status);
        assert.equal(await flash,null);
    }
    const flash = f.api.get_flash_diagnostics(t3);
    f.rx(11,[80,88,74,70,1,12,3,0,235,64,21,0]);
    assert.deepEqual(plain((await flash).jedecId), [235,64,21]);
    const busy = assert.rejects(f.api.get_display_photo(t3), {code:'DISPLAY_UNAVAILABLE'});
    assert.deepEqual(f.writes.at(-1), [10,0,0,0,76,67,68,49,0]);
    f.rx(10,[],0,1); await busy;
    const unsupported = f.api.get_display_photo(t3);
    f.rx(10,[],0,255);
    assert.equal(await unsupported, null);
    const frame = Uint8Array.from({length:1024}, (_,i) => i % 251);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', frame));
    const photo = f.api.get_display_photo(t3);
    for (let page = 0; page < 8; page++) {
        await flush();
        assert.deepEqual(f.writes.at(-1), [10,0,0,0,76,67,68,49,page]);
        f.rx(10, [80,88,76,67,1,page,128,64,...hash,...frame.slice(128 * page,128 * (page+1))]);
    }
    assert.deepEqual(await photo, frame);
});
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

test('flash probe gates older versions, sends no arguments, and tolerates optional-command rejection', async () => {
    const f = fixture(), version = '2.22.0-DE3.78';
    for (const old of [null, '2.22.0-DE3.77', '2.22.0-DE3.78-OLED']) assert.equal(await f.api.get_flash_diagnostics(old), null);
    assert.equal(f.writes.length, 0);
    for (const status of [1, 255]) {
        const pending = f.api.get_flash_diagnostics(version);
        assert.deepEqual(f.writes.at(-1), [11, 0, 0, 0]);
        f.rx(11, [], 0, status);
        assert.equal(await pending, null);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode, null);
    }
    const pending = f.api.get_flash_diagnostics(version);
    f.rx(11, [80,88,74,70,1,12,3,0,235,64,21,0]);
    assert.deepEqual(plain((await pending).jedecId), [235,64,21]);
    const broken = assert.rejects(f.api.get_flash_diagnostics(version));
    f.rx(11, [0]); await broken;
    assert.equal(f.api.get_transport_diagnostics().lastErrorCode, 'RESPONSE_INVALID');
});
for (const [version,counter] of [['2.22.0-DE3.84',657],['2.22.0-DE3.85',658],['2.22.0-DE3.86',659],['2.22.0-DE3.87',660],['2.22.0-DE3.88',661]])
test(`PXBI sends only one optional command on App${counter} and checks the assembled payload and connection generation`, async () => {
    const bindings=await import('../src/lib/lcd-build-diagnostics.js');
    const bytes=new Uint8Array(80);
    bytes.set([80,88,66,73,1,80,1,0]);bytes.fill(97,8,72);
    const f=fixture(bindings);
    for(const v of ['2.22.0-DE3.83','2.22.0-DE3.84-OLEDt1','2.22.0-DE3.86-OLEDt6','2.22.0-DE3.90','2.22.0-DE3.85t1','',null])
        assert.equal(await f.api.get_lcd_build_diagnostics(v),null);
    assert.deepEqual(f.writes,[]);
    const reading=f.api.get_lcd_build_diagnostics(version);
    assert.deepEqual(f.writes,[[12,0,0,0]]);
    for(let offset=0;offset<80;offset+=16) f.rx(12,bytes.subarray(offset,offset+16),(offset/16)|(offset<64?0x8000:0));
    assert.equal((await reading).sourceId,'a'.repeat(64));
    for (const status of [1,255]) {
        const pending=f.api.get_lcd_build_diagnostics(version);f.rx(12,[],0,status);
        assert.equal(await pending,null);assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
    }
    for (const length of [0,79,83,84,85]) {
        const rejectedFixture=fixture(bindings), rejected=assert.rejects(rejectedFixture.api.get_lcd_build_diagnostics(version));
        const payload=new Uint8Array(length); payload.set(bytes.subarray(0,length));
        rejectedFixture.rx(12,payload); await rejected;
        assert.ok(rejectedFixture.api.get_transport_diagnostics().lastErrorCode);
    }
    for (const event of ['timeout','disconnect']) {
        const f=fixture(bindings), pending=f.api.get_lcd_build_diagnostics(version), rejected=assert.rejects(pending);
        if (event==='disconnect') f.bus.emit('ble_disconnected');
        else for(const cb of [...f.timers.values()]) cb();
        await rejected; assert.deepEqual(f.writes,[[12,0,0,0]]);
    }
});

test('actual App658 ARM PXBI replies survive queued file traffic and MTU23/185/250 fragmentation', async () => {
    const bindings=await import('../src/lib/lcd-build-diagnostics.js');
    const capture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/PXBI_App658.json'),'utf8'));
    for(const mtu of [23,185,250])for(const {scenario,payloadHex} of capture.states){
        const f=fixture(bindings), prior=next(f), pending=f.api.get_lcd_build_diagnostics('2.22.0-DE3.85');
        assert.deepEqual(f.writes,[[20,0,0,0]],scenario);
        f.rx(20,[9]);await prior;await flush();
        assert.deepEqual(f.writes,[[20,0,0,0],[12,0,0,0]],scenario);
        const bytes=Uint8Array.from(Buffer.from(payloadHex,'hex')),capacity=mtu-7;
        for(let offset=0;offset<bytes.length;offset+=capacity)
            f.rx(12,bytes.subarray(offset,offset+capacity),(offset/capacity)|(offset+capacity<bytes.length?0x8000:0));
        const result=await pending;
        assert.equal(result.sourceId,capture.sourceId);
        assert.equal(result.board,'LCD');
        assert.deepEqual(plain(result),plain(bindings.parseBuildDiagnostics(bytes,'LCD')));
        assert.equal(f.disconnects,0);assert.equal(f.timers.size,0);assert.equal(f.writes.length,2);
        const following=next(f);f.rx(20,[8]);await following;
    }
});

const mtuLinkPacket = require('./mtu-link-fixture.cjs');

test('App668 link snapshot selects MTUD v2 once, queues normally and reassembles all MTU sizes', async () => {
    for (const mtu of [23,185,250]) {
        const f=fixture(), prior=next(f), pending=f.api.get_mtu_diagnostics('2.22.0-DE3.95');
        assert.deepEqual(f.writes,[[0x14,0,0,0]]);
        f.rx(0x14,[3]);await prior;await flush();
        assert.deepEqual(f.writes.at(-1),[5,0,0,0,1]);
        const bytes=mtuLinkPacket(), capacity=mtu-7;
        for(let offset=0;offset<bytes.length;offset+=capacity)
            f.rx(5,bytes.subarray(offset,offset+capacity),(offset/capacity)|(offset+capacity<bytes.length?0x8000:0));
        const data=await pending;
        assert.equal(data.schemaVersion,2);assert.equal(data.link.connectionIntervalUnits,6);
        assert.equal(data.link.rxPhy,2);assert.equal(data.link.txPhy,2);
        assert.equal(f.disconnects,0);assert.equal(f.timers.size,0);
        const following=next(f);f.rx(0x14,[7]);await following;
    }
    for(const version of [undefined,'2.22.0-DE3.94','2.22.0-DE3.101','2.22.0-DE3.97-OLEDt1','2.22.0-DE3.95-OLEDt7']) {
        const f=fixture(), pending=f.api.get_mtu_diagnostics(version);
        assert.deepEqual(f.writes,[[5,0,0,0]]);f.rx(5,mtuPacket());
        assert.equal((await pending).schemaVersion,1);
    }
});

test('App668 MTUD selector falls back only on explicit unsupported status and retains real faults', async () => {
    for(const status of [1,255]) {
        const f=fixture(), pending=f.api.get_mtu_diagnostics('2.22.0-DE3.95');
        f.rx(5,[],0,status);await flush();
        assert.deepEqual(f.writes,[[5,0,0,0,1],[5,0,0,0]]);
        f.rx(5,mtuPacket());assert.equal((await pending).schemaVersion,1);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
        const bad=f.api.get_mtu_diagnostics(), failed=assert.rejects(bad);
        f.rx(5,[],0,1);await failed;
        const absent=f.api.get_mtu_diagnostics('2.22.0-DE3.95');
        f.rx(5,[],0,status);await flush();f.rx(5,[],0,255);
        assert.equal(await absent,null);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode,'DEVICE_STATUS');
    }
});

test('App668 malformed MTUD success and timeouts never downgrade or change the MTU preference', async () => {
    const corrupt=mtuLinkPacket();corrupt[25]=1;
    for(const payload of [mtuPacket(),corrupt,new Uint8Array(33)]) {
        const f=fixture(), pending=f.api.get_mtu_diagnostics('2.22.0-DE3.95'), rejected=assert.rejects(pending);
        f.rx(5,payload);await rejected;
        assert.deepEqual(f.writes,[[5,0,0,0,1]]);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode,payload.length>32?'RX_INVALID':'RESPONSE_INVALID');
    }
    const f=fixture(), pending=f.api.get_mtu_diagnostics('2.22.0-DE3.95'), rejected=assert.rejects(pending);
    for(const timeout of [...f.timers.values()]) timeout();await rejected;
    assert.deepEqual(f.writes,[[5,0,0,0,1]]);assert.equal(f.disconnects,1);
});

test('App668 MTUD fallback cannot cross a replacement Bluetooth session', async () => {
    const f=fixture(), pending=f.api.get_mtu_diagnostics('2.22.0-DE3.95'), rejected=assert.rejects(pending);
    f.rx(5,[],0,255);f.bus.emit('ble_disconnected');f.bus.emit('ble_connected');
    await rejected;await flush();
    assert.deepEqual(f.writes,[[5,0,0,0,1]]);assert.equal(f.timers.size,0);
});

const testLinkPacket = () => Uint8Array.from(Buffer.from(JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ble-link-diagnostic-v3.json'),'utf8')).responsePayloadHex,'hex'));
const testGcPacket = () => Uint8Array.from(Buffer.from(JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/packed-gc-diagnostic-v1.json'),'utf8')).cases.find(f=>f.name==='pinned').hex,'hex'));
const testStartupPacket = () => Uint8Array.from(Buffer.from(JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/startup-profile-v5.json'),'utf8')).hex,'hex'));

const testFirmwareVersions=['2.22.0-DE3.96','2.22.0-DE3.97'];
for(const version of testFirmwareVersions)
for(const [method,cmd,request,makePacket,schema] of [
 ['get_mtu_diagnostics',5,[2],testLinkPacket,3],
 ['get_storage_gc_diagnostics',0x1c,[69,2],testGcPacket,1],
 ['get_startup_diagnostics',9,[4],testStartupPacket,5]])
test(`APP670_STATUS_REGRESSION ${version} ${method} selects the actual production test response without mutation`,async()=>{
 const startup=await import('../src/lib/startup-diagnostics.js'),f=fixture(startup),packet=makePacket();
 const pending=f.api[method](version);pending.catch(()=>{});
 assert.deepEqual(f.writes,[[cmd,0,0,0,...request]]);
 const capacity=16;
 for(let start=0;start<packet.length;start+=capacity)
  f.rx(cmd,packet.subarray(start,start+capacity),(start/capacity)|(start+capacity<packet.length?0x8000:0));
 const data=await pending;assert.equal(data.schemaVersion,schema);
 if(method==='get_mtu_diagnostics'){
  const normalized=load('device-extra-diagnostics.js').normalizeMtuDiagnostics(data);
  assert.equal(normalized.schemaVersion,3);assert.equal(normalized.experiment.testBuild,true);
  assert.equal(normalized.sessionReady,true);assert.equal(normalized.fileMode,true);assert.equal(normalized.transferIdle,true);
 }else if(method==='get_startup_diagnostics'){
  assert.equal(data.mountProfile.testBuild,true);assert.equal(data.mountProfile.available,true);
  assert.equal(data.mountProfile.flashWaitTicks,32);assert.equal(data.mountProfile.ticksPerSecond,16384);
 }else{
  assert.equal(data.scope,'packedfs-memory-status');assert.equal(data.drive,'E');
  for(const unsupported of ['2.22.0-DE3.95','2.22.0-DE3.101','2.22.0-DE3.98-OLEDt1'])
   assert.equal(await f.api.get_storage_gc_diagnostics(unsupported),null);
 }
 assert.deepEqual(f.writes,[[cmd,0,0,0,...request]]);assert.equal(f.timers.size,0);assert.equal(f.disconnects,0);
});

for(const testVersion of testFirmwareVersions){
test(testVersion+' '+'Test 1 link explicitly falls back v3 to v2 to v1, but malformed and failed reads never retry',async()=>{
 for(const status of [1,255]){
  const f=fixture(),p=f.api.get_mtu_diagnostics(testVersion);f.rx(5,[],0,status);await flush();
  assert.deepEqual(f.writes.at(-1),[5,0,0,0,1]);f.rx(5,[],0,status);await flush();
  assert.deepEqual(f.writes.at(-1),[5,0,0,0]);f.rx(5,mtuPacket());assert.equal((await p).schemaVersion,1);
  assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
 }
 const badFlag=testLinkPacket();badFlag[33]=1;
 for(const payload of [testLinkPacket().slice(0,39),badFlag,mtuLinkPacket()]){
  const f=fixture(),p=f.api.get_mtu_diagnostics(testVersion),failed=assert.rejects(p);f.rx(5,payload);await failed;assert.equal(f.writes.length,1);
 }
 const f=fixture(),p=f.api.get_mtu_diagnostics(testVersion),failed=assert.rejects(p);f.rx(5,[],0,9);await failed;assert.equal(f.writes.length,1);
});

test(testVersion+' '+'Test 1 optional GC rejection does not run a fallback cleanup or modify stored capability state',async()=>{
 for(const status of [1,255]){
  const f=fixture(),p=f.api.get_storage_gc_diagnostics(testVersion);f.rx(0x1c,[],0,status);assert.equal(await p,null);
  assert.deepEqual(f.writes,[[0x1c,0,0,0,69,2]]);assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
 }
 const f=fixture(),p=f.api.get_storage_gc_diagnostics(testVersion),failed=assert.rejects(p);f.rx(0x1c,testGcPacket().slice(0,23));await failed;
 assert.equal(f.writes.length,1);
});

test(testVersion+' '+'experimental option requires an exact test identity and idle local queues before the fresh capability read',async()=>{
 const f=fixture();
 for(const version of [undefined,'2.22.0-DE3.95','2.22.0-DE3.98','2.22.0-DE3.97-OLEDt1'])await assert.rejects(f.api.set_ble_test_extension(version,true),{code:'BLE_TEST_UNSUPPORTED'});
 await assert.rejects(f.api.set_ble_test_extension(testVersion,1),{code:'BLE_TEST_UNSUPPORTED'});assert.equal(f.writes.length,0);
 const transfer=next(f);await assert.rejects(f.api.set_ble_test_extension(testVersion,true),{code:'BLE_TEST_BUSY'});
 assert.deepEqual(f.writes,[[0x14,0,0,0]]);f.rx(0x14,[7]);await transfer;
});

test(testVersion+' '+'experimental option checks idle again after a fresh read and refuses unsupported or busy firmware',async()=>{
 const f=fixture(),change=f.api.set_ble_test_extension(testVersion,true),failed=assert.rejects(change,{code:'BLE_TEST_BUSY'});
 const queued=next(f);f.rx(5,testLinkPacket());await failed;assert.deepEqual(f.writes,[[5,0,0,0,2],[0x14,0,0,0]]);f.rx(0x14,[9]);await queued;
 const g=fixture(),unsupported=g.api.set_ble_test_extension(testVersion,true),missing=assert.rejects(unsupported,{code:'BLE_TEST_UNSUPPORTED'});
 g.rx(5,[],0,255);await flush();g.rx(5,mtuLinkPacket());await missing;assert.equal(g.writes.length,2);
 const h=fixture(),busy=h.api.set_ble_test_extension(testVersion,true),reject=assert.rejects(busy,{code:'BLE_TEST_BUSY'});
 const packet=testLinkPacket();packet[5]&=~4;h.rx(5,packet);await reject;assert.equal(h.writes.length,1);
});

test(testVersion+' '+'APP670_STATUS_REGRESSION explicit EVT! request is bounded and SDK rejection retains previous configuration without success inference',async()=>{
 for(const enabled of [false,true]){
  const f=fixture(),change=f.api.set_ble_test_extension(testVersion,enabled);change.catch(()=>{});
  assert.deepEqual(f.writes,[[5,0,0,0,2]]);f.rx(5,testLinkPacket());await flush();
  assert.deepEqual(f.writes,[[5,0,0,0,2],[5,0,0,0,69,86,84,33,Number(enabled)]]);
  const result=testLinkPacket();result[32]=enabled?3:1;f.rx(5,result);const data=await change;
  assert.equal(data.experiment.eventLengthExtensionEnabled,enabled);assert.equal(data.experiment.lastOptionResult,0);assert.equal(f.writes.length,2);
 }
 const f=fixture(),change=f.api.set_ble_test_extension(testVersion,false);f.rx(5,testLinkPacket());await flush();
 const result=testLinkPacket();new DataView(result.buffer).setUint32(36,7,true);f.rx(5,result);
 const data=await change;assert.equal(data.experiment.eventLengthExtensionEnabled,true);assert.equal(data.experiment.lastOptionResult,7);
 assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
});

test(testVersion+' '+'session changes suppress late experimental replies and prevent writes after a stale capability check',async()=>{
 for(const stage of ['read','write']){
  const f=fixture(),change=f.api.set_ble_test_extension(testVersion,true),failed=assert.rejects(change);
  if(stage==='write'){f.rx(5,testLinkPacket());await flush();}
  await flush();f.rx(5,testLinkPacket());f.bus.emit('ble_disconnected');await failed;await flush();
  assert.equal(f.writes.length,stage==='read'?1:2);f.rx(5,testLinkPacket());await flush();assert.equal(f.writes.length,stage==='read'?1:2);
 }
 for(const [method,cmd,payload] of [['get_mtu_diagnostics',5,testLinkPacket()],['get_storage_gc_diagnostics',0x1c,testGcPacket()]]){
  const f=fixture(),p=f.api[method](testVersion),failed=assert.rejects(p);await flush();f.rx(cmd,payload);f.bus.emit('ble_disconnected');await failed;assert.equal(f.writes.length,1);
 }
});


test(testVersion+' '+'Test 1 startup v5 falls back only on explicit unsupported selector and rejects a wrong successful version',async()=>{
 const startup=await import('../src/lib/startup-diagnostics.js');
 const old=testStartupPacket().slice(0,84);old[4]=4;old[5]=84;
 for(const status of [1,255]){
  const f=fixture(startup),p=f.api.get_startup_diagnostics(testVersion);f.rx(9,[],0,status);await flush();
  assert.deepEqual(f.writes,[[9,0,0,0,4],[9,0,0,0,3]]);f.rx(9,old);assert.equal((await p).schemaVersion,4);
 }
 for(const packet of [old,testStartupPacket().slice(0,111)]){
  const f=fixture(startup),p=f.api.get_startup_diagnostics(testVersion),failed=assert.rejects(p);f.rx(9,packet);await failed;assert.equal(f.writes.length,1);
 }
 const f=fixture(startup),p=f.api.get_startup_diagnostics(testVersion),failed=assert.rejects(p);await flush();f.rx(9,[],0,255);f.bus.emit('ble_disconnected');await failed;assert.equal(f.writes.length,1);
});

}

for(const [normalCounter, normalVersion] of [[671,'2.22.0-DE3.98'],[672,'2.22.0-DE3.99'],[673,'2.22.0-DE3.100']]) {
// App671 and App672 have normal observations, while App669/670 retain their experimental selectors.
for(const [method,cmd,request,makePacket,schema] of [
 ['get_mtu_diagnostics',5,[1],mtuLinkPacket,2],
 ['get_storage_gc_diagnostics',0x1c,[69,2],testGcPacket,1],
 ['get_startup_diagnostics',9,[3],()=>{const bytes=testStartupPacket().slice(0,84);bytes[4]=4;bytes[5]=84;return bytes;},4]])
test(`App${normalCounter} normal ${method} uses its exact wire selector without a test profile`,async()=>{
 const startup=await import('../src/lib/startup-diagnostics.js'),f=fixture(startup),packet=makePacket();
 const pending=f.api[method](normalVersion);pending.catch(()=>{});
 assert.deepEqual(f.writes,[[cmd,0,0,0,...request]]);
 for(let start=0;start<packet.length;start+=16)
  f.rx(cmd,packet.subarray(start,start+16),(start/16)|(start+16<packet.length?0x8000:0));
 const data=await pending;assert.equal(data.schemaVersion,schema);
 assert.equal(data.experiment,undefined);assert.equal(data.mountProfile,undefined);
 assert.equal(f.writes.length,1);assert.equal(f.timers.size,0);assert.equal(f.disconnects,0);
 await assert.rejects(f.api.set_ble_test_extension(normalVersion,true),{code:'BLE_TEST_UNSUPPORTED'});
 assert.equal(f.writes.length,1,'normal diagnostic support must never permit an EVT! request');
});

}
