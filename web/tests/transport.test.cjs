// Executes the production modules unchanged except ESM import/export wiring.
// GATT and FileReader are deterministic mocks; no browser or hardware access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');
const ByteBuffer = require('bytebuffer');

function load(name, bindings) {
    const source = fs.readFileSync(path.join(process.env.PIXL_SOURCE_DIR || path.join(__dirname, '../src/lib'), name), 'utf8');
    const exports = [...source.matchAll(/export function (\w+)\(/g)].map(match => match[1]);
    const code = source.replace(/^import .*$/gm, '').replace(/export function /g, 'function ');
    const context = { ByteBuffer, EventEmitter, Promise, Error, ArrayBuffer, Uint8Array, DataView, TextDecoder, TextEncoder,
        console: { log() {} }, module: { exports: {} }, ...bindings };
    vm.runInNewContext(code + '\nmodule.exports = {' + exports.join(',') + '};', context, { filename: name });
    return context.module.exports;
}
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; }
async function flush() { for(let i=0;i<100;i++) await Promise.resolve(); }
function eventTarget(extra={}) {
    const events = new EventEmitter();
    return { ...extra, events, addEventListener: (name,cb) => events.on(name,cb),
        removeEventListener: (name,cb) => events.off(name,cb) };
}
function bleFixture(notificationPromise=Promise.resolve()) {
    const bus=load('event.js',{}).sharedEventDispatcher(), writes=[];
    const rx=eventTarget({uuid:'6e400003-b5a3-f393-e0a9-e50e24dcca9e', properties:{notify:true},
        startNotifications:() => notificationPromise});
    const tx=eventTarget({uuid:'6e400002-b5a3-f393-e0a9-e50e24dcca9e', properties:{write:true},
        writeValue:data => {writes.push(data);return Promise.resolve();}});
    const service={uuid:'6e400001-b5a3-f393-e0a9-e50e24dcca9e',getCharacteristics:() => Promise.resolve([rx,tx])};
    const gatt={connected:false, connect(){this.connected=true;return Promise.resolve(this);},
        getPrimaryServices:() => Promise.resolve([service]), disconnect(){this.connected=false;device.events.emit('gattserverdisconnected',{target:device});}};
    const device=eventTarget({gatt});
    const navigator={bluetooth:{requestDevice:() => Promise.resolve(device)}};
    const api=load('pixl.ble.js',{navigator,sharedEventDispatcher:() => bus});
    return {api,bus,device,rx,tx,service,writes,navigator};
}
function protocolFixture(i18n={global:{t:key=>key}}) {
    const bus=load('event.js',{}).sharedEventDispatcher(), writes=[], timers=new Map(), readers=[];
    let timerId=0, disconnects=0, writeImpl=() => Promise.resolve();
    const pixl={tx_data(data){writes.push(Array.from(new Uint8Array(data)));return writeImpl(data);},
        disconnect(){disconnects++;bus.emit('ble_disconnected');}};
    class FileReader {
        constructor(){readers.push(this);}
        readAsArrayBuffer(file){this.file=file;if(file.error){this.error=new Error('FileReader failed');this.onerror();}
            else if(!file.pending){this.result=Uint8Array.from(file.bytes || []).buffer;this.onload();}}
    }
    const api=load('pixl.proto.js',{pixl,FileReader,i18n,sharedEventDispatcher:() => bus,
        setTimeout:cb=>{const id=++timerId;timers.set(id,cb);return id;},clearTimeout:id=>timers.delete(id)});
    api.init();
    return {api,bus,writes,timers,readers,get disconnects(){return disconnects;},setWrite:fn=>{writeImpl=fn;},
        rx:(cmd,payload=[],chunk=0,status=0) => bus.emit('ble_rx_data',Uint8Array.from([cmd,status,chunk&255,chunk>>8,...payload]).buffer)};
}
const bytes = value => Array.from(new Uint8Array(value));
const command = (f,cmd=0x14) => f.api.op_queue_push(cmd,()=>{},b=>b.readBytes(b.remaining()).toArrayBuffer());

test('browser locale accepts hyphens, case and region; unknown language falls back to English',()=>{
    const api=load('locale.js',{}),locales=['en','zh_TW','es','zh_CN','ru_RU','de_DE','sv_SE','ja_JP'];
    for(const language of ['de-DE','de-AT','de_CH','DE-de'])assert.equal(api.detectLanguage(language,locales),'de_DE');
    assert.equal(api.detectLanguage('zh-CN',locales),'zh_CN');assert.equal(api.detectLanguage('zh-TW',locales),'zh_TW');
    assert.equal(api.detectLanguage('en-US',locales),'en');assert.equal(api.detectLanguage(undefined,locales),'en');
});
test('saved language round-trips and ignores unsupported or stale locale values',()=>{
    const api=load('locale.js',{}),values=new Map(),locales=['en','de_DE','ja_JP'];
    const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
    assert.equal(api.read_saved_language(storage,locales),'de_DE');
    api.save_language(storage,'ja_JP');assert.equal(values.get('allmiibo.language'),'ja_JP');
    assert.equal(api.read_saved_language(storage,locales),'ja_JP');
    for(const invalid of ['de','unsupported','<script>',null]){
        values.set('allmiibo.language',invalid);assert.equal(api.read_saved_language(storage,locales),'de_DE');
    }
    assert.equal(api.read_saved_language(storage,['en']),'en');
});
test('blocked or unavailable language storage cannot prevent application startup or session selection',()=>{
    const api=load('locale.js',{}),locales=['en','de_DE'];
    const blocked={getItem(){throw new Error('SecurityError');},setItem(){throw new Error('QuotaExceededError');}};
    for(const storage of [null,undefined,blocked]){
        assert.equal(api.read_saved_language(storage,locales),'de_DE');
        assert.doesNotThrow(()=>api.save_language(storage,'en'));
    }
});
test('real Vue I18n 11 translations reject oversized paths and notes without writing to device',async()=>{
    const {default:i18n}=await import(pathToFileURL(path.join(__dirname,'../src/i18n/index.js')).href);
    const f=protocolFixture(i18n);
    await assert.rejects(f.api.vfs_open_file('E:/'+ 'a'.repeat(64),'r'),{message:i18n.global.t('rename.nametoolong')});
    await assert.rejects(f.api.vfs_open_file('E:/'+ 'a'.repeat(48),'r'),{message:i18n.global.t('rename.pathtoolong')});
    await assert.rejects(f.api.vfs_update_meta('E:/a.bin',{notes:'a'.repeat(91)}),{
        message:i18n.global.t('properties.notelimit', { max: 89, actual: 91 })});
    assert.equal(f.writes.length,0);
});
test('browser event dispatcher keeps identity, ordering, context and duplicate listener semantics',()=>{
    const api=load('event.js',{}),bus=api.sharedEventDispatcher(),calls=[];
    assert.equal(api.sharedEventDispatcher(),bus);assert.equal(bus.emit('unknown'),false);
    function listener(a,b){assert.equal(this,bus);calls.push(a+b);}
    bus.addListener('test',listener).on('test',listener);assert.equal(bus.listenerCount('test'),2);
    assert.equal(bus.emit('test',2,3),true);assert.deepEqual(calls,[5,5]);
    bus.removeListener('test',listener);assert.equal(bus.listenerCount('test'),1);
    bus.off('test',listener);assert.equal(bus.listenerCount('test'),0);assert.equal(bus.emit('test'),false);
});

test('DE3.12 path validation matches stored UTF-8 budgets without counting the drive label',async()=>{
    const f=protocolFixture();
    for(const drive of ['E','I']) {
        for(const basename of ['x'.repeat(44),'x'.repeat(45),'x'.repeat(46),'ä'.repeat(23)]) {
            const target=drive+':/'+'d'.repeat(15)+'/'+basename;
            const storedBytes=Buffer.byteLength(target.substring(2));
            assert.ok(storedBytes>=61 && storedBytes<=63);
            const pending=f.api.vfs_open_file(target,'r');await flush();
            const wire=f.writes.at(-1);
            assert.equal(wire[0],0x12);
            assert.deepEqual(wire.slice(6,-1),[...Buffer.from(target)]);
            f.rx(0x12,[1]);assert.equal((await pending).status,0);
        }
        const target=drive+':/'+'x'.repeat(47);
        const pending=f.api.vfs_open_file(target,'r');await flush();f.rx(0x12,[1]);await pending;
        const rename=f.api.vfs_rename(drive+':/'+'d'.repeat(15)+'/'+'x'.repeat(45),
            drive+':/'+'d'.repeat(15)+'/'+'ä'.repeat(23));
        await flush();assert.equal(f.writes.at(-1)[0],0x19);f.rx(0x19);await rename;
    }
    const count=f.writes.length;
    for(const target of ['E:/'+'d'.repeat(15)+'/'+'x'.repeat(47),
        'E:/'+'d'.repeat(16)+'/'+'ä'.repeat(23), 'E:/'+'x'.repeat(48)]) {
        await assert.rejects(f.api.vfs_open_file(target,'r'),/rename\.(name|path)toolong/);
    }
    for(const target of ['E:relative','E:/bad\0name','/no-drive','EE:/wrong']) {
        await assert.rejects(f.api.vfs_open_file(target,'r'),/Invalid file path/);
    }
    assert.equal(f.writes.length,count);assert.equal(f.timers.size,0);
});

test('DE3.12 invalid UTF-8 directory identities reject rather than alias another file and release the queue',async()=>{
    const f=protocolFixture(), record=name=>[name.length,0,...name,0,0,0,0,0,0];
    for(const raw of [[0xff],[0x80],[0xc0,0xaf],[0xc2],[0xe2,0x82],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80]]) {
        const listing=f.api.vfs_read_folder('E:/');
        const rejected=assert.rejects(listing,/Invalid UTF-8 in device response/);
        const recovery=f.api.vfs_read_folder('E:/healthy');await flush();
        // The malformed name and a real U+FFFD name must never become two
        // selectable rows carrying the same identity.
        f.rx(0x16,[...record(raw),...record([...Buffer.from('\ufffd')])]);
        await rejected;await flush();
        f.rx(0x16,record([...Buffer.from('healthy.bin')]));
        assert.equal((await recovery).data[0].name,'healthy.bin');
        assert.equal(f.timers.size,0);
    }
    assert.ok(f.writes.every(frame=>frame[0]===0x16));
});

test('DE3.12 valid replacement and BOM-prefixed file names round-trip without changing the addressed file',async()=>{
    const f=protocolFixture(), names=['\ufffd','\ufeffA.bin','A.bin','ä_日本.bin'];
    const payload=names.flatMap(name=>{
        const raw=[...Buffer.from(name)];return [raw.length,0,...raw,0,0,0,0,0,0];
    });
    const listing=f.api.vfs_read_folder('E:/');await flush();f.rx(0x16,payload);
    const files=(await listing).data;
    assert.deepEqual(Array.from(files,row=>row.name),names);
    for(const file of files) {
        const removal=f.api.vfs_remove('E:/'+file.name);await flush();
        assert.deepEqual(f.writes.at(-1).slice(6),[...Buffer.from('E:/'+file.name)]);
        f.rx(0x18);await removal;
    }
    assert.equal(f.timers.size,0);
});
test('browser event dispatcher handles subscription changes during emit and reserved names',()=>{
    const bus=load('event.js',{}).sharedEventDispatcher(),calls=[];
    const second=()=>calls.push('second'),added=()=>calls.push('added');
    bus.addListener('__proto__',()=>{calls.push('first');bus.removeListener('__proto__',second);bus.addListener('__proto__',added);});
    bus.addListener('__proto__',second);bus.emit('__proto__');assert.deepEqual(calls,['first','second']);
    calls.length=0;bus.emit('__proto__');assert.deepEqual(calls,['first','added']);
    assert.throws(()=>bus.addListener('bad',null),/Listener must be a function/);
});

test('BLE waits for notifications, exact DataView slice, clean disconnect',async()=>{
    const gate=deferred(),f=bleFixture(gate.promise);let connected=0,disconnected=0,received;
    f.bus.on('ble_connected',()=>connected++);f.bus.on('ble_disconnected',()=>disconnected++);f.bus.on('ble_rx_data',d=>received=bytes(d));
    const pending=f.api.connect();assert.equal(f.api.connect(),pending);await flush();assert.equal(connected,0);
    gate.resolve();await pending;assert.equal(connected,1);
    const backing=Uint8Array.from([9,8,1,2,3,7]);f.rx.value=new DataView(backing.buffer,2,3);
    f.rx.events.emit('characteristicvaluechanged',{target:f.rx});assert.deepEqual(received,[1,2,3]);
    await f.api.tx_data(Uint8Array.from([4]).buffer);assert.equal(f.writes.length,1);
    f.api.disconnect();assert.equal(disconnected,1);assert.equal(f.rx.events.listenerCount('characteristicvaluechanged'),0);
    assert.equal(f.device.events.listenerCount('gattserverdisconnected'),0);await assert.rejects(f.api.tx_data(new ArrayBuffer(0)),/not connected/);
});
test('BLE notification failure cleans handles and listeners, then reconnects',async()=>{
    const f=bleFixture(Promise.reject(new Error('notify failed')));let failures=0,connected=0;
    f.bus.on('ble_connect_error',()=>failures++);f.bus.on('ble_connected',()=>connected++);
    await f.api.connect();assert.equal(failures,1);assert.equal(connected,0);assert.equal(f.device.gatt.connected,false);
    assert.equal(f.rx.events.listenerCount('characteristicvaluechanged'),0);
    f.rx.startNotifications=()=>Promise.resolve();await f.api.connect();assert.equal(connected,1);f.api.disconnect();
});
test('BLE missing service reports failure; cancelled request cannot reconnect',async()=>{
    const f=bleFixture();f.device.gatt.getPrimaryServices=()=>Promise.resolve([]);let connected=0,failures=0;
    f.bus.on('ble_connected',()=>connected++);f.bus.on('ble_connect_error',()=>failures++);
    await f.api.connect();assert.equal(failures,1);assert.equal(f.device.gatt.connected,false);
    const gate=deferred();f.navigator.bluetooth.requestDevice=()=>gate.promise;
    const pending=f.api.connect();await flush();f.api.disconnect();gate.resolve(f.device);await pending;
    assert.equal(connected,0);assert.equal(f.device.gatt.connected,false);
});
test('BLE disconnect during notification startup cannot emit connected',async()=>{
    const gate=deferred(),f=bleFixture(gate.promise);let connected=0;
    f.bus.on('ble_connected',()=>connected++);const pending=f.api.connect();await flush();f.api.disconnect();gate.resolve();await pending;
    assert.equal(connected,0);assert.equal(f.rx.events.listenerCount('characteristicvaluechanged'),0);
});
test('BLE cancellation during gatt.connect cleans a late successful connection',async()=>{
    const gate=deferred(),f=bleFixture();
    f.device.gatt.connect=()=>gate.promise.then(()=>{f.device.gatt.connected=true;return f.device.gatt;});
    const pending=f.api.connect();await flush();f.api.disconnect();gate.resolve();await pending;
    assert.equal(f.device.gatt.connected,false);assert.equal(f.device.events.listenerCount('gattserverdisconnected'),0);
});
test('protocol init is idempotent and consecutive chunk streams have no old data',async()=>{
    const f=protocolFixture();f.api.init();assert.equal(f.bus.listenerCount('ble_rx_data'),1);
    const one=command(f);f.rx(0x14,[1,2],0x8000);f.rx(0x14,[3],1);assert.deepEqual(bytes((await one).data),[1,2,3]);
    const two=command(f);f.rx(0x14,[4],0x8000);f.rx(0x14,[5],1);assert.deepEqual(bytes((await two).data),[4,5]);
    assert.equal(f.timers.size,0);
});
test('protocol preserves final error, discards partial payload, skips error decoder',async()=>{
    const f=protocolFixture();let decoded=0;
    const pending=f.api.op_queue_push(0x14,()=>{},()=>decoded++);
    f.rx(0x14,[1,2],0x8000);f.rx(0x14,[],1,1);const result=await pending;
    assert.equal(result.status,1);assert.equal(result.data,undefined);assert.equal(decoded,0);
    const next=command(f);f.rx(0x14,[9]);assert.deepEqual(bytes((await next).data),[9]);
});
test('serialization and terminal decoding failures release operation queue',async()=>{
    const f=protocolFixture();await assert.rejects(f.api.op_queue_push(1,()=>{throw new Error('encode');},()=>{}),/encode/);
    const invalid=f.api.op_queue_push(0x12,()=>{},b=>b.readUint8());const rejected=assert.rejects(invalid);
    const next=command(f);f.rx(0x12);await rejected;f.rx(0x14,[8]);assert.deepEqual(bytes((await next).data),[8]);
});
test('TX error cancels active and queued operations rather than leaving promises pending',async()=>{
    const f=protocolFixture(),gate=deferred();f.setWrite(()=>gate.promise);
    const first=command(f),second=command(f);const settled=Promise.allSettled([first,second]);gate.reject(new Error('write failed'));
    const result=await settled;assert.deepEqual(result.map(r=>r.status),['rejected','rejected']);assert.equal(f.disconnects,1);assert.equal(f.timers.size,0);
});
test('early final RX cannot hide delayed writeValue failure or resolve success',async()=>{
    const f=protocolFixture(),gate=deferred();f.setWrite(()=>gate.promise);let resolved=false;
    const pending=command(f);const rejected=assert.rejects(pending,/late write failure/);pending.then(()=>{resolved=true;},()=>{});
    f.rx(0x14,[1]);await flush();assert.equal(resolved,false);gate.reject(new Error('late write failure'));
    await rejected;assert.equal(resolved,false);assert.equal(f.disconnects,1);
});
test('next queued GATT write waits for previous writeValue as well as final RX',async()=>{
    const f=protocolFixture(),gate=deferred();f.setWrite(()=>gate.promise);
    const first=command(f),second=command(f);f.rx(0x14,[1]);await flush();assert.equal(f.writes.length,1);
    gate.resolve();await first;assert.equal(f.writes.length,2);f.rx(0x14,[2]);assert.deepEqual(bytes((await second).data),[2]);
});
test('disconnect rejects every queued promise; reconnect work starts fresh',async()=>{
    const f=protocolFixture();const pending=Promise.allSettled([command(f),command(f)]);f.bus.emit('ble_disconnected');
    assert.deepEqual((await pending).map(r=>r.status),['rejected','rejected']);
    const next=command(f);f.rx(0x14,[3]);assert.deepEqual(bytes((await next).data),[3]);
});
for(const invalid of ['truncated','wrong command','skipped chunk','error continuation']) {
    test('invalid response aborts transport: '+invalid,async()=>{
        const f=protocolFixture();const rejected=assert.rejects(command(f));
        if(invalid==='truncated')f.bus.emit('ble_rx_data',Uint8Array.from([0x14]).buffer);
        if(invalid==='wrong command')f.rx(0x16,[1]);
        if(invalid==='skipped chunk')f.rx(0x14,[1],1);
        if(invalid==='error continuation')f.rx(0x14,[],0x8000,1);
        await rejected;assert.equal(f.disconnects,1);assert.equal(f.timers.size,0);
    });
}
test('idle response timeout rejects queue and is refreshed by valid chunks',async()=>{
    const f=protocolFixture();const rejected=assert.rejects(command(f),/timed out/);const first=[...f.timers.keys()][0];
    f.rx(0x14,[1],0x8000);assert.equal(f.timers.has(first),false);[...f.timers.values()][0]();await rejected;assert.equal(f.disconnects,1);
});
test('read helper never reports partial error stream as successful download',async()=>{
    const f=protocolFixture();let success=0,error=0,done=0;
    const pending=f.api.vfs_helper_read_file('E:/a.bin',()=>success++,e=>{assert.equal(e.status,1);error++;},()=>done++);
    f.rx(0x12,[1]);await flush();f.rx(0x14,[1],0x8000);f.rx(0x14,[],1,1);await flush();f.rx(0x13);
    await pending;assert.deepEqual([success,error,done],[0,1,1]);
});
test('write helper reports device write failure, closes once, does not advance progress',async()=>{
    const f=protocolFixture();let success=0,error=0,progress=0;
    f.api.vfs_helper_write_file('E:/a.bin',{bytes:[1,2]},()=>progress++,()=>success++,e=>{assert.equal(e.status,1);error++;});
    await flush();f.rx(0x12,[1]);await flush();f.rx(0x15,[],0,1);await flush();f.rx(0x13);await flush();
    assert.deepEqual([success,error,progress],[0,1,0]);assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x15,0x13]);
});
test('FileReader failure releases upload queue; successful upload requires successful close',async()=>{
    const f=protocolFixture();let success=0,error=0;
    f.api.vfs_helper_write_file('E:/bad.bin',{error:true},()=>{},()=>success++,()=>error++);
    f.api.vfs_helper_write_file('E:/ok.bin',{bytes:[1]},()=>{},()=>success++,()=>error++);
    await flush();f.rx(0x12,[1]);await flush();f.rx(0x15);await flush();f.rx(0x13,[],0,1);await flush();
    assert.deepEqual([success,error],[0,2]);
});
test('disconnect cancels pending FileReader and queued files once, never writes after reconnect',async()=>{
    const f=protocolFixture();let errors=0,success=0;
    f.api.vfs_helper_write_file('E:/a.bin',{pending:true},()=>{},()=>success++,()=>errors++);
    f.api.vfs_helper_write_file('E:/b.bin',{bytes:[2]},()=>{},()=>success++,()=>errors++);
    f.bus.emit('ble_disconnected');assert.equal(errors,2);
    f.readers[0].result=Uint8Array.from([1]).buffer;f.readers[0].onload();await flush();
    assert.equal(f.writes.length,0);assert.equal(errors,2);assert.equal(success,0);
});
test('successful upload reports progress and completion exactly once',async()=>{
    const f=protocolFixture();let success=0,error=0;const progress=[];
    f.api.vfs_helper_write_file('E:/a.bin',{bytes:[1,2]},p=>progress.push(p.written_bytes),()=>success++,()=>error++);
    await flush();f.rx(0x12,[1]);await flush();f.rx(0x15);await flush();f.rx(0x13);await flush();
    assert.deepEqual(progress,[2]);assert.deepEqual([success,error],[1,0]);
});
test('drive decoder reads all declared drives, including a second flash volume',async()=>{
    const f=protocolFixture(),payload=new ByteBuffer();payload.writeUint8(2);
    for(const label of ['E','F']) {payload.writeUint8(0);payload.writeUint8(label.charCodeAt(0));payload.writeUint16(1);payload.writeUint8(65);payload.writeUint32(2048);payload.writeUint32(100);}
    payload.flip();const pending=f.api.vfs_get_drive_list();f.rx(0x10,bytes(payload.toArrayBuffer()));
    const response=await pending;assert.deepEqual(Array.from(response.data,d=>d.label),['E','F']);
});
test('documented 0xff no-metadata marker is accepted',async()=>{
    const f=protocolFixture(),payload=new ByteBuffer();payload.writeUint16(1);payload.writeUint8(65);payload.writeUint32(540);payload.writeUint8(0);payload.writeUint8(255);payload.flip();
    const pending=f.api.vfs_read_folder('E:/');f.rx(0x16,bytes(payload.toArrayBuffer()));
    const response=await pending;assert.equal(response.data.length,1);assert.equal(response.data[0].meta.notes,'');
});

function metadataFolderPayload(records) {
    const payload = new ByteBuffer();
    for (const [name, metadata] of records) {
        const encoded = new TextEncoder().encode(name);
        payload.writeUint16(encoded.length); encoded.forEach(byte => payload.writeUint8(byte));
        payload.writeUint32(540); payload.writeUint8(0); payload.writeUint8(metadata.length);
        metadata.forEach(byte => payload.writeUint8(byte));
    }
    payload.flip(); return bytes(payload.toArrayBuffer());
}

test('postflash: editing visible metadata flags preserves SYSTEM and unknown bits', async () => {
    const f = protocolFixture(), pending = f.api.vfs_read_folder('E:/');
    f.rx(0x16, metadataFolderPayload([['a.bin', [2, 0xaf]]]));
    const meta = (await pending).data[0].meta;
    assert.equal(meta.flags.raw, 0xaf); assert.equal(meta.flags.hide, true); assert.equal(meta.flags.readonly, true);
    meta.flags.hide = false; meta.flags.readonly = false;
    const saved = f.api.vfs_update_meta('E:/a.bin', meta);
    assert.deepEqual(f.writes.at(-1).slice(-3), [2, 2, 0xaa]);
    f.rx(0x1a); await saved;
});

test('postflash: malformed bounded metadata is marked read-only without losing healthy folder entries', async () => {
    const f = protocolFixture(), pending = f.api.vfs_read_folder('E:/');
    const records = [
        ['bad-note', [1, 6, 65]], ['bad-flags', [2]], ['bad-id', [3, 1]],
        ['unknown', [0x7f, 2, 1]], ['bad-utf8', [1, 1, 0xff]], ['healthy', [2, 1]]
    ];
    f.rx(0x16, metadataFolderPayload(records));
    const files = (await pending).data;
    assert.equal(files.length, 6);
    for (const entry of files.slice(0, -1)) {
        assert.equal(entry.meta.valid, false, entry.name);
        assert.equal(entry.meta.flags.hide, false, 'no partial attributes are trusted');
    }
    assert.equal(files[5].meta.valid, true); assert.equal(files[5].meta.flags.hide, true);
    const writesBefore = f.writes.length;
    await assert.rejects(f.api.vfs_update_meta('E:/bad-note', files[0].meta), /invalidmeta/);
    assert.equal(f.writes.length, writesBefore, 'invalid metadata is never overwritten by defaults');
});

test('postflash: repeated metadata fields use the final flags value consistently with firmware', async () => {
    const f = protocolFixture(), pending = f.api.vfs_read_folder('E:/');
    f.rx(0x16, metadataFolderPayload([['a.bin', [2, 5, 2, 0]]]));
    const flags = (await pending).data[0].meta.flags;
    assert.equal(flags.raw, 0); assert.equal(flags.hide, false); assert.equal(flags.readonly, false);
});

test('postflash: note boundary is 89 UTF-8 bytes, preserving the firmware NUL terminator', async () => {
    const f = protocolFixture();
    const meta = notes => ({ notes, flags: { hide: false, readonly: false, raw: 0 }, amiibo: { head: 0, tail: 0 } });
    // 87 ASCII bytes plus one two-byte character fits without splitting it.
    const accepted = f.api.vfs_update_meta('E:/a.bin', meta('a'.repeat(87) + 'ä'));
    f.rx(0x1a); await accepted;
    const before = f.writes.length;
    for (const note of ['a'.repeat(90), 'a'.repeat(88) + 'ä']) {
        const rejected = f.api.vfs_update_meta('E:/a.bin', meta(note));
        // A negative control with the old serializer must fail rather than
        // wait forever for an acknowledgement of its incorrectly sent packet.
        f.rx(0x1a);
        await assert.rejects(rejected, /notelimit/);
    }
    assert.equal(f.writes.length, before);
});

test('postflash: drive parser exposes available bytes as free_size', async () => {
    const f = protocolFixture(), payload = new ByteBuffer();
    payload.writeUint8(1); payload.writeUint8(0); payload.writeUint8(69);
    payload.writeUint16(1); payload.writeUint8(65); payload.writeUint32(4096); payload.writeUint32(512); payload.flip();
    const pending = f.api.vfs_get_drive_list(); f.rx(0x10, bytes(payload.toArrayBuffer()));
    const drive = (await pending).data[0];
    assert.equal(drive.total_size, 4096); assert.equal(drive.free_size, 512);
    assert.equal(Object.hasOwn(drive, 'used_size'), false);
});
test('500-byte upload splits payload, preserves bytes and advances progress after acknowledgements',async()=>{
    const f=protocolFixture(),source=Array.from({length:500},(_,i)=>i&255),progress=[];let success=0;
    f.api.vfs_helper_write_file('E:/a.bin',{bytes:source},p=>progress.push(p.written_bytes),()=>success++,e=>assert.fail(e));
    await flush();f.rx(0x12,[7]);await flush();
    for(let i=0;i<3;i++){f.rx(0x15);await flush();}
    assert.deepEqual(progress,[242,484,500]);assert.deepEqual(f.writes.filter(p=>p[0]===0x15).flatMap(p=>p.slice(5)),source);
    f.rx(0x13);await flush();assert.equal(success,1);
});
test('two downloads serialize full open/read/close transactions, never replace the device file handle',async()=>{
    const f=protocolFixture(),downloads=[];
    const first=f.api.vfs_helper_read_file('E:/one.bin',d=>downloads.push(bytes(d)),e=>assert.fail(e),()=>{});
    const second=f.api.vfs_helper_read_file('E:/two.bin',d=>downloads.push(bytes(d)),e=>assert.fail(e),()=>{});
    assert.equal(f.writes.length,1);f.rx(0x12,[0]);await flush();assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x14]);
    f.rx(0x14,[1]);await flush();assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x14,0x13]);
    f.rx(0x13);await first;await flush();assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x14,0x13,0x12]);
    f.rx(0x12,[0]);await flush();f.rx(0x14,[2]);await flush();f.rx(0x13);await second;
    assert.deepEqual(downloads,[[1],[2]]);
});
test('download and upload share one complete file-transaction queue',async()=>{
    const f=protocolFixture();let uploaded=0;
    const read=f.api.vfs_helper_read_file('E:/one.bin',()=>{},e=>assert.fail(e),()=>{});
    f.api.vfs_helper_write_file('E:/two.bin',{bytes:[2]},()=>{},()=>uploaded++,e=>assert.fail(e));
    f.rx(0x12,[0]);await flush();assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x14]);
    f.rx(0x14,[1]);await flush();f.rx(0x13);await read;await flush();assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x14,0x13,0x12]);
    f.rx(0x12,[0]);await flush();f.rx(0x15);await flush();f.rx(0x13);await flush();assert.equal(uploaded,1);
});
test('disconnect completes and reports each queued download exactly once',async()=>{
    const f=protocolFixture();let done=0,errors=0;
    const first=f.api.vfs_helper_read_file('E:/one.bin',()=>assert.fail('success'),()=>errors++,()=>done++);
    const second=f.api.vfs_helper_read_file('E:/two.bin',()=>assert.fail('success'),()=>errors++,()=>done++);
    f.bus.emit('ble_disconnected');await Promise.all([first,second]);assert.deepEqual([errors,done],[2,2]);
});
const modernCapabilities=[80,88,68,70,1,3,243,0,20,0];
async function modernProtocol(f) {
    const p=f.api.negotiate_transport();
    assert.deepEqual(f.writes.at(-1),[3,0,0,0]);f.rx(3,modernCapabilities);
    const profile=await p;assert.equal(profile.chunkedRequests,true);assert.equal(profile.maxRequestPayload,243);
    f.writes.length=0;
}
function payloadCommand(f,payload,cmd=0x77) {
    return f.api.op_queue_push(cmd,b=>payload.forEach(value=>b.writeUint8(value)),b=>b.readBytes(b.remaining()).toArrayBuffer());
}
function fragmentedReply(f,cmd,payload) {
    for(let offset=0,sequence=0;offset<payload.length;offset+=16,sequence++) {
        const end=Math.min(offset+16,payload.length);
        f.rx(cmd,payload.slice(offset,end),sequence|(end<payload.length?0x8000:0));
    }
}
test('capability probe is shared, bounded and cached; legacy firmware retains unfragmented requests',async()=>{
    for(const legacy of [false,true]) {
        const f=protocolFixture(),first=f.api.negotiate_transport(),second=f.api.negotiate_transport();
        assert.equal(first,second);assert.deepEqual(f.writes,[[3,0,0,0]]);
        f.rx(3,legacy?[]:modernCapabilities,0,legacy?255:0);
        assert.equal((await first).chunkedRequests,!legacy);await second;
        await f.api.negotiate_transport();assert.equal(f.writes.length,1);f.writes.length=0;
        const payload=Array.from({length:50},(_,i)=>i),p=payloadCommand(f,payload);await flush();
        assert.equal(f.writes.length,legacy?1:4);
        if(legacy)assert.deepEqual(f.writes[0],[0x77,0,0,0,...payload]);
        f.rx(0x77,[]);await p;
    }
});
test('modern transport sends all 243 bytes as sequential MTU23-safe framed writes',async()=>{
    const f=protocolFixture();await modernProtocol(f);
    const payload=Array.from({length:243},(_,i)=>(i*7+1)&255),gates=[];
    f.setWrite(()=>{const gate=deferred();gates.push(gate);return gate.promise;});
    const p=payloadCommand(f,payload);assert.equal(f.writes.length,1);
    for(let i=0;i<16;i++){
        assert.equal(f.writes.length,i+1);const frame=f.writes[i];
        assert.ok(frame.length<=20);assert.equal(frame[0],0x77);assert.equal(frame[1],0);
        assert.equal(frame[2]|frame[3]<<8,i|(i<15?0x8000:0));
        gates[i].resolve();await flush();
    }
    assert.deepEqual(f.writes.flatMap(frame=>frame.slice(4)),payload);
    f.rx(0x77,[]);await p;assert.equal(f.timers.size,0);
});
test('zero payload and exact payload boundary have one final frame and no empty continuation',async()=>{
    const f=protocolFixture();await modernProtocol(f);
    for(const length of [0,1,16,17,32,242,243]){
        f.writes.length=0;const p=payloadCommand(f,Array(length).fill(7));await flush();
        assert.equal(f.writes.length,Math.max(1,Math.ceil(length/16)));
        assert.equal(f.writes.at(-1)[3]&0x80,0);
        assert.equal(f.writes.at(-1).length,length?4+((length-1)%16)+1:4);
        f.rx(0x77,[]);await p;
    }
    f.writes.length=0;await assert.rejects(payloadCommand(f,Array(244).fill(0)),/too large/);
    assert.equal(f.writes.length,0);assert.equal(f.disconnects,1);
});
test('get_version probes then decodes a fragmented one-shot reply without claiming negotiated MTU',async()=>{
    const f=protocolFixture(),p=f.api.get_version();assert.deepEqual(f.writes,[[3,0,0,0]]);
    f.rx(3,modernCapabilities);await flush();assert.deepEqual(f.writes.at(-1),[1,0,0,0]);
    const string=value=>[value.length,0,...Buffer.from(value)],payload=[...string('2.21.0-DE3.10'),...string('01:23:45:67:89:AB')];
    fragmentedReply(f,1,payload);const result=await p;
    assert.equal(result.data.ver,'2.21.0-DE3.10');assert.equal(result.data.ble_addr,'01:23:45:67:89:AB');
    assert.equal('mtu' in result.data,false);
});
test('invalid or errored capability response never enables fragmentation or silently falls back',async()=>{
    for(const payload of [[],[...modernCapabilities,0],[0,...modernCapabilities.slice(1)],
        [80,88,68,70,2,3,243,0],[80,88,68,70,1,1,243,0],[80,88,68,70,1,3,244,0],[80,88,68,70,1,3,0,0]]) {
        const f=protocolFixture(),p=f.api.get_version(),rejected=assert.rejects(p);
        f.rx(3,payload);await rejected;assert.equal(f.writes.length,1);
    }
    const f=protocolFixture(),p=f.api.get_version(),rejected=assert.rejects(p);f.rx(3,[],0,1);await rejected;
    assert.equal(f.writes.length,1);
});
test('reconnect resets capability and aborts fragment continuation from the old session',async()=>{
    const f=protocolFixture();await modernProtocol(f);const gate=deferred();f.setWrite(()=>gate.promise);
    const p=payloadCommand(f,Array(50).fill(2)),rejected=assert.rejects(p,/disconnected/);
    f.bus.emit('ble_disconnected');await rejected;gate.resolve();await flush();assert.equal(f.writes.length,1);
    f.setWrite(()=>Promise.resolve());const probe=f.api.negotiate_transport();assert.deepEqual(f.writes.at(-1),[3,0,0,0]);
    f.rx(3,[],0,255);assert.equal((await probe).chunkedRequests,false);
    f.writes.length=0;const next=payloadCommand(f,Array(50).fill(3));await flush();assert.equal(f.writes.length,1);
    f.rx(0x77,[]);await next;
});
test('failed middle fragment rejects active and queued operations once without a trailing write',async()=>{
    const f=protocolFixture();await modernProtocol(f);let attempts=0;
    f.setWrite(()=>++attempts===2?Promise.reject(new Error('second fragment failed')):Promise.resolve());
    const first=payloadCommand(f,Array(50).fill(1)),second=command(f);
    const result=await Promise.allSettled([first,second]);assert.deepEqual(result.map(r=>r.status),['rejected','rejected']);
    assert.equal(f.writes.length,2);assert.equal(f.disconnects,1);assert.equal(f.timers.size,0);
});
test('a premature response cannot complete a fragmented request or permit further fragments',async()=>{
    const f=protocolFixture();await modernProtocol(f);const gate=deferred();f.setWrite(()=>gate.promise);
    const p=payloadCommand(f,Array(50).fill(4)),rejected=assert.rejects(p,/before the complete request/);
    f.rx(0x77,[]);gate.resolve();await rejected;assert.equal(f.writes.length,1);assert.equal(f.disconnects,1);
});
test('fragment write completion refreshes idle deadline and final RX still waits for final TX',async()=>{
    const f=protocolFixture();await modernProtocol(f);const gates=[];
    f.setWrite(()=>{const gate=deferred();gates.push(gate);return gate.promise;});
    let success=false;const p=payloadCommand(f,Array(17).fill(5)).then(()=>{success=true;});
    const firstTimer=[...f.timers.keys()][0];gates[0].resolve();await flush();
    assert.equal(f.timers.has(firstTimer),false);assert.equal(f.timers.size,1);
    f.rx(0x77,[]);await flush();assert.equal(success,false);gates[1].resolve();await p;assert.equal(success,true);
});
test('cached capability cannot enqueue get_version after session changes in its promise turn',async()=>{
    const f=protocolFixture();await modernProtocol(f);
    const p=f.api.get_version(),rejected=assert.rejects(p,/session changed/);
    f.bus.emit('ble_disconnected');await rejected;assert.equal(f.writes.length,0);
});
test('actual-C capability/version/drives/diagnostic wire fixtures interoperate at ATT MTU23,185,250',async()=>{
    const vectors=JSON.parse(fs.readFileSync(path.join(__dirname,'../../fw/tests/de3/df_mtu_wire_vectors.json'),'utf8'));
    for(const [mtu,capacity] of [[23,20],[185,182],[250,247]]) {
        const f=protocolFixture(),wire=vectors['mtu'+mtu];
        const replay=frames=>frames.forEach(frame=>f.bus.emit('ble_rx_data',Uint8Array.from(frame).buffer));
        const probe=f.api.negotiate_transport();replay(wire.capability);
        const profile=await probe;assert.equal(profile.gattValueCapacity,capacity);assert.equal(profile.maxRequestPayload,243);
        f.writes.length=0;const version=f.api.get_version();await flush();assert.deepEqual(f.writes,[[1,0,0,0]]);
        replay(wire.version);assert.equal((await version).data.ver,'2.21.0-DE3.10');
        const drives=f.api.vfs_get_drive_list();replay(wire.drives);
        const drive=(await drives).data[0];assert.equal(drive.free_size,4096);assert.equal(drive.total_size,8192);
        const diagnostic=f.api.op_queue_push(0x1b,b=>{b.writeUint8(0);b.writeUint8(0);},b=>b.readBytes(b.remaining()).toArrayBuffer());
        replay(wire.diagnostic);assert.deepEqual(bytes((await diagnostic).data),Array.from({length:200},(_,i)=>(i*13+9)&255));
        f.writes.length=0;const payload=Array.from({length:243},(_,i)=>(i*7+1)&255),request=payloadCommand(f,payload);await flush();
        assert.equal(f.writes.length,Math.ceil(243/(capacity-4)));
        f.writes.forEach((frame,index)=>{
            assert.ok(frame.length<=capacity);assert.equal(frame[2]|frame[3]<<8,index|(index+1<f.writes.length?0x8000:0));
        });
        assert.deepEqual(f.writes.flatMap(frame=>frame.slice(4)),payload);f.rx(0x77,[]);await request;
    }
});
test('missing or unclear advertised GATT capacity safely falls back to twenty bytes',async()=>{
    for(const advertised of [null,0,19,248,65535]) {
        const f=protocolFixture(),probe=f.api.negotiate_transport();
        const capability=[80,88,68,70,1,3,243,0];
        if(advertised!==null)capability.push(advertised&255,advertised>>8);
        f.rx(3,capability);assert.equal((await probe).gattValueCapacity,20);
        f.writes.length=0;const p=payloadCommand(f,Array(243).fill(9));await flush();
        assert.equal(f.writes.length,16);assert.ok(f.writes.every(frame=>frame.length<=20));f.rx(0x77);await p;
    }
});
test('modern 500-byte file upload keeps logical acknowledgements and byte progress across physical fragments',async()=>{
    const f=protocolFixture();await modernProtocol(f);
    const source=Array.from({length:500},(_,i)=>i&255),progress=[];let success=0;
    f.api.vfs_helper_write_file('E:/a.bin',{bytes:source},p=>progress.push(p.written_bytes),()=>success++,e=>assert.fail(e));
    await flush();f.rx(0x12,[7]);await flush();
    for(let i=0;i<3;i++){f.rx(0x15);await flush();}
    assert.deepEqual(progress,[242,484,500]);assert.ok(f.writes.every(frame=>frame.length<=20));
    const logical=[];let current=[];
    for(const frame of f.writes.filter(p=>p[0]===0x15)) {
        current.push(...frame.slice(4));
        if(!(frame[3]&0x80)){assert.equal(current[0],7);logical.push(...current.slice(1));current=[];}
    }
    assert.deepEqual(logical,source);assert.equal(current.length,0);
    f.rx(0x13);await flush();assert.equal(success,1);
});
