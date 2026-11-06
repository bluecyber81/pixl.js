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

function load(name, bindings, sourceRoot = process.env.PIXL_SOURCE_DIR || path.join(__dirname, '../src/lib')) {
    const source = fs.readFileSync(path.join(sourceRoot, name), 'utf8');
    const exports = [...source.matchAll(/export function (\w+)\(/g)].map(match => match[1]);
    const code = source.replace(/^import .*$/gm, '').replace(/export function /g, 'function ');
    const context = { ByteBuffer, EventEmitter, Promise, Error, ArrayBuffer, Uint8Array, DataView, TextDecoder, TextEncoder,
        // Production isolates consumer callback failures. Assertions inside a
        // mocked UI callback must nevertheless fail this regression harness.
        console: { log() {}, error(_message,error) { if(error?.code==='ERR_ASSERTION')throw error; } }, module: { exports: {} }, ...bindings };
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
    const timers=new Map();let timerId=0;
    const api=load('pixl.ble.js',{navigator,sharedEventDispatcher:() => bus,
        setTimeout:cb=>{const id=++timerId;timers.set(id,cb);return id;},clearTimeout:id=>timers.delete(id)});
    return {api,bus,device,rx,tx,service,writes,navigator,timers};
}
function protocolFixture(i18n={global:{t:key=>key}}) {
    const bus=load('event.js',{}).sharedEventDispatcher(), writes=[], timers=new Map(), readers=[];
    let timerId=0, disconnects=0, writeImpl=() => Promise.resolve();
    const pixl={get_connection_state:()=> 'connected',tx_data(data){writes.push(Array.from(new Uint8Array(data)));return writeImpl(data);},
        disconnect(){disconnects++;bus.emit('ble_disconnected');}};
    class FileReader {
        constructor(){readers.push(this);}
        readAsArrayBuffer(file){this.file=file;if(file.error){this.error=new Error('FileReader failed');this.onerror();}
            else if(!file.pending){this.result=Uint8Array.from(file.bytes || []).buffer;this.onload();}}
    }
    const api=load('pixl.proto.js',{pixl,FileReader,i18n,metadataNoteInfo:load('metadata-note.js',{},path.join(__dirname,'../src/lib')).metadataNoteInfo,parseStartupDiagnostics:load('startup-diagnostics.js',{}).parseStartupDiagnostics,parseBootDiagnostics:load('boot-diagnostics.js',{}).parseBootDiagnostics,parsePowerDiagnostics:load('power-diagnostics.js',{}).parsePowerDiagnostics,sharedEventDispatcher:() => bus,
        setTimeout:cb=>{const id=++timerId;timers.set(id,cb);return id;},clearTimeout:id=>timers.delete(id)});
    api.init();
    return {api,bus,writes,timers,readers,get disconnects(){return disconnects;},setWrite:fn=>{writeImpl=fn;},
        rx:(cmd,payload=[],chunk=0,status=0) => bus.emit('ble_rx_data',Uint8Array.from([cmd,status,chunk&255,chunk>>8,...payload]).buffer)};
}
const bytes = value => Array.from(new Uint8Array(value));
const command = (f,cmd=0x14) => f.api.op_queue_push(cmd,()=>{},b=>b.readBytes(b.remaining()).toArrayBuffer());
const bootPacket = require('./boot-fixture.cjs');

test('same-link ownership executes real remote handshake then real file version query without reconnect',async()=>{
 const {createRemoteClient}=await import(pathToFileURL(path.join(process.env.PIXL_SOURCE_DIR||path.join(__dirname,'../src/lib'),'remote-control.js')));
 const f=bleFixture();let picks=0,connects=0,starts=0,stops=0,disconnects=0,ready=0;const writes=[];
 f.navigator.bluetooth.requestDevice=async()=>{picks++;return f.device;};
 f.device.gatt.connect=async()=>{connects++;f.device.gatt.connected=true;return f.device.gatt;};
 f.device.gatt.disconnect=()=>{disconnects++;f.device.gatt.connected=false;f.device.events.emit('gattserverdisconnected',{target:f.device});};
 f.device.gatt.getPrimaryService=async()=>f.service;
 f.service.getCharacteristic=async uuid=>uuid===f.tx.uuid?f.tx:f.rx;
 f.rx.startNotifications=async()=>{starts++;return f.rx;};f.rx.stopNotifications=async()=>{stops++;};
 f.tx.writeValueWithResponse=data=>{
  const bytes=Array.from(new Uint8Array(data));writes.push(bytes);
  let reply;if(bytes[0]===80){reply=[80,88,1,bytes[3]|128,bytes[4],bytes[5],0,bytes[3]===4?3:1,31,0,0,0];}
  else if(bytes[0]===3)reply=[3,255,0,0];
  else {const version=Array.from(Buffer.from('2.22.0-DE3.51'));reply=[1,0,0,0,version.length,0,...version];}
  f.rx.value=new DataView(Uint8Array.from(reply).buffer);f.rx.events.emit('characteristicvaluechanged',{target:f.rx});return Promise.resolve();
 };
 const proto=load('pixl.proto.js',{pixl:f.api,i18n:{global:{t:x=>x}},metadataNoteInfo:()=>{},parseStartupDiagnostics:()=>{},parseBootDiagnostics:()=>{},parsePowerDiagnostics:()=>{},sharedEventDispatcher:()=>f.bus,setTimeout,clearTimeout});proto.init();
 f.bus.on('ble_connected',()=>ready++);
 const client=createRemoteClient({environment:{navigator:f.navigator,isSecureContext:true}});
 await client.connect();await client.command('files');client.releaseFileConnection(f.api.adopt_remote_connection);
 const version=await proto.get_version();assert.equal(version.data.ver,'2.22.0-DE3.51');
 assert.deepEqual([picks,connects,starts,stops,disconnects,ready],[1,1,1,0,0,1]);assert.deepEqual(writes.map(p=>p[0]===80?p[3]:p[0]),[0,4,3,1]);
 await client.disconnect();assert.equal(f.device.gatt.connected,true);
 await f.api.disconnect();assert.equal(stops,1);assert.equal(disconnects,1);assert.equal(f.api.get_connection_state(),'disconnected');
});
test('adoption rejects busy or stale sessions without disturbing the existing file owner',async()=>{
 const f=bleFixture();f.tx.writeValueWithResponse=async()=>{};
 assert.throws(()=>f.api.adopt_remote_connection({device:f.device,rx:f.rx,tx:f.tx}),/Invalid/);
 await f.api.connect();assert.throws(()=>f.api.adopt_remote_connection({device:f.device,rx:f.rx,tx:f.tx}),/busy/);
 assert.equal(f.api.get_connection_state(),'connected');await f.api.disconnect();
});

function startupPacket() {
 const bytes=new Uint8Array(32),view=new DataView(bytes.buffer);bytes.set([80,88,83,84,1,32,63,0]);
 [0,37,45,92,97,101].forEach((ms,i)=>view.setUint32(8+4*i,ms,true));return bytes;
}
test('startup extension is selected by firmware, retries only a rejected option and keeps the error state clean', async()=>{
 const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
 for(const version of ['2.22.0-DE3.60','2.22.0-DE3.60-PREP','unknown',undefined]){
   const f=protocolFixture(),p=f.api.get_startup_diagnostics(version);
   assert.deepEqual(f.writes,[[9,0,0,0]]);f.rx(9,startupPacket());assert.equal((await p).schemaVersion,1);
 }
 for(const status of [1,255]){
   const f=protocolFixture(),p=f.api.get_startup_diagnostics('2.22.0-DE3.61');
   assert.deepEqual(f.writes,[[9,0,0,0,1]]);f.rx(9,[],0,status);await nextTurn();
   assert.deepEqual(f.writes[1],[9,0,0,0]);f.rx(9,startupPacket());assert.equal((await p).schemaVersion,1);
   assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
 }
 const f=protocolFixture(),p=f.api.get_startup_diagnostics('2.22.0-DE3.61');
 const bytes=new Uint8Array(40);bytes.set(startupPacket());bytes.set([2,40,63,3],4);bytes[32]=12;bytes[36]=19;
 f.rx(9,bytes.subarray(0,16),0x8000);f.rx(9,bytes.subarray(16,32),0x8001);f.rx(9,bytes.subarray(32),2);
 assert.deepEqual(Array.from((await p).storageElapsedMilliseconds),[12,19]);assert.equal(f.writes.length,1);
});
test('optional startup request is explicit, serialized after earlier work and exact32B',async()=>{
 const f=protocolFixture();assert.equal(f.writes.length,0);
 const prior=command(f),p=f.api.get_startup_diagnostics();assert.deepEqual(f.writes,[[0x14,0,0,0]]);
 f.rx(0x14,[7]);await prior;await flush();assert.deepEqual(f.writes.at(-1),[9,0,0,0]);
 f.rx(9,startupPacket());const result=await p;assert.deepEqual(Array.from(result.elapsedMilliseconds),[0,37,45,92,97,101]);
 assert.equal(f.disconnects,0);
});
test('DE3.62 mount profile reads selector2 with bounded80B, rejects invalid data and falls back only on option rejection',async()=>{
 const packet=new Uint8Array(80);packet.set(startupPacket());packet.set([3,80,63,3],4);packet[32]=20;packet[36]=30;
 const view=new DataView(packet.buffer);view.setUint32(40,23,true);
 [5,15,200,51200,800,180,20,0].forEach((n,i)=>view.setUint32(48+i*4,n,true));
 for(const capacity of [20,182,247]){
  const f=protocolFixture(),p=f.api.get_startup_diagnostics('2.22.0-DE3.62');assert.deepEqual(f.writes,[[9,0,0,0,2]]);
  const chunk=capacity-4;
  for(let offset=0,index=0;offset<packet.length;offset+=chunk,index++)f.rx(9,packet.subarray(offset,offset+chunk),offset+chunk<packet.length?0x8000|index:index);
  assert.equal((await p).mount.cacheHits,800);assert.equal(f.writes.length,1);
 }
 for(const status of [1,255]){
  const f=protocolFixture(),p=f.api.get_startup_diagnostics('2.22.0-DE3.62');f.rx(9,[],0,status);await flush();
  assert.deepEqual(f.writes[1],[9,0,0,0,1]);f.rx(9,[],0,status);await flush();
  assert.deepEqual(f.writes[2],[9,0,0,0]);f.rx(9,startupPacket());assert.equal((await p).schemaVersion,1);
  assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
 }
 for(const payload of [new Uint8Array(81),(()=>{const b=packet.slice();b[40]=255;return b;})()]){
  const f=protocolFixture(),p=f.api.get_startup_diagnostics('2.22.0-DE3.62'),rejected=assert.rejects(p);
  f.rx(9,payload);await rejected;assert.equal(f.writes.length,1);
 }
 const f=protocolFixture(),p=f.api.get_startup_diagnostics('2.22.0-DE3.62'),rejected=assert.rejects(p);
 f.bus.emit('ble_disconnected');await rejected;f.rx(9,packet);assert.equal(f.writes.length,1);
});
test('unsupported startup is not a device fault, does not clear an earlier error and leaves queue usable',async()=>{
 const f=protocolFixture(),p=f.api.get_startup_diagnostics();f.rx(9,[],0,255);
 assert.equal(await p,null);assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);assert.equal(f.disconnects,0);
 const fail=f.api.get_startup_diagnostics(),rejected=assert.rejects(fail);f.rx(9,[],0,1);await rejected;
 assert.equal(f.api.get_transport_diagnostics().lastErrorCode,'DEVICE_STATUS');
 const old=f.api.get_startup_diagnostics();f.rx(9,[],0,255);assert.equal(await old,null);
 assert.equal(f.api.get_transport_diagnostics().lastErrorCode,'DEVICE_STATUS');
 const next=command(f);f.rx(0x14,[9]);assert.deepEqual(bytes((await next).data),[9]);assert.equal(f.disconnects,0);
});
test('startup markers reassemble through actual protocol decoder at MTU23,185,250 without new reads',async()=>{
 for(const mtu of [23,185,250]){
  const f=protocolFixture(),p=f.api.get_startup_diagnostics(),packet=startupPacket();
  const capacity=mtu-7,total=Math.ceil(packet.length/capacity);
  for(let i=0;i<total;i++)f.rx(9,packet.subarray(i*capacity,(i+1)*capacity),i|(i+1<total?0x8000:0));
  assert.deepEqual(Array.from((await p).elapsedMilliseconds),[0,37,45,92,97,101]);assert.equal(f.writes.length,1);assert.equal(f.timers.size,0);
 }
});
test('startup rejects invalid packets, bounded oversize, status failures and disconnected stale work',async()=>{
 const invalid=startupPacket();invalid[6]=5;
 for(const [payload,status]of [[new Array(31).fill(0),0],[new Array(33).fill(0),0],[invalid,0],[[],1]]){
  const f=protocolFixture(),p=f.api.get_startup_diagnostics(),rejected=assert.rejects(p);f.rx(9,payload,0,status);await rejected;
 }
 const f=protocolFixture(),p=f.api.get_startup_diagnostics(),rejected=assert.rejects(p);f.bus.emit('ble_disconnected');await rejected;
 f.rx(9,startupPacket());assert.equal(f.writes.length,1);
});

test('optional power request is user-initiated, readonly, exact16B and old firmware stays connected',async()=>{
 const f=protocolFixture();assert.equal(f.writes.length,0);const p=f.api.get_power_diagnostics();assert.deepEqual(f.writes,[[8,0,0,0]]);
 f.rx(8,[80,88,80,68,1,16,3,0,0,0,0,0,0,0,180,0]);assert.equal((await p).resetReasonRaw,0);assert.equal(f.disconnects,0);
 const old=f.api.get_power_diagnostics();f.rx(8,[],0,255);assert.equal(await old,null);assert.equal(f.disconnects,0);
 const next=command(f);f.rx(0x14,[7]);assert.deepEqual(bytes((await next).data),[7]);assert.equal(f.disconnects,0);
});
test('power response rejects malformed success, wrong status and stale generations',async()=>{
 for(const [payload,status]of [[new Array(15).fill(0),0],[new Array(17).fill(0),0],[[],1]]){
  const f=protocolFixture(),p=f.api.get_power_diagnostics(),rejected=assert.rejects(p);f.rx(8,payload,0,status);await rejected;
 }
 const f=protocolFixture(),p=f.api.get_power_diagnostics(),rejected=assert.rejects(p);f.bus.emit('ble_disconnected');await rejected;
});

test('3.27 optional unsupported power diagnosis is not a device fault and retains earlier real errors',async()=>{
 const f=protocolFixture();
 const optional=f.api.get_power_diagnostics();f.rx(8,[],0,255);
 assert.equal(await optional,null);assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
 assert.equal(f.disconnects,0);
 const failing=f.api.get_power_diagnostics(),rejected=assert.rejects(failing);f.rx(8,[],0,1);await rejected;
 assert.equal(f.api.get_transport_diagnostics().lastErrorCode,'DEVICE_STATUS');
 const old=f.api.get_power_diagnostics();f.rx(8,[],0,255);assert.equal(await old,null);
 assert.equal(f.api.get_transport_diagnostics().lastErrorCode,'DEVICE_STATUS','optional response does not clear earlier errors');
 const normal=command(f);f.rx(0x14,[9]);assert.deepEqual(bytes((await normal).data),[9]);assert.equal(f.disconnects,0);
});

test('migration storage info validates exact eight-byte drive/backend/capability contract',async()=>{
    const f=protocolFixture(),p=f.api.vfs_storage_info('E');assert.deepEqual(f.writes,[[0x1c,0,0,0,69]]);
    f.rx(0x1c,[1,69,1,1,7,128,64,48]);assert.deepEqual(JSON.parse(JSON.stringify((await p).data)),{schema:1,drive:'E',backend:1,mounted:true,flags:7,metaLen:128,pathMax:64,nameMax:48});
    for(const payload of [[1,69,1,1,7,128,64],[1,73,1,1,7,128,64,48],[2,69,1,1,7,128,64,48],[1,69,4,1,7,128,64,48],[1,69,1,1,8,128,64,48]]){
        const g=protocolFixture(),request=g.api.vfs_storage_info('E'),reject=assert.rejects(request);g.rx(0x1c,payload);await reject;
    }
    const count=f.writes.length;await assert.rejects(f.api.vfs_storage_info('E:/'));assert.equal(f.writes.length,count);
});
test('atomic file metadata is capability-gated, copied at call time, and invalidated by disconnect',async()=>{
 const f=protocolFixture(),raw=Uint8Array.from({length:128},(_,i)=>i);
 await assert.rejects(f.api.vfs_open_file('E:/a','w',raw),/not supported/);assert.equal(f.writes.length,0);
 const old=f.api.vfs_storage_info_extended('E');f.rx(0x1c,[1,69,3,1,7,128,64,48]);await old;
 await assert.rejects(f.api.vfs_open_file('E:/a','w',raw),/not supported/);
 const modern=f.api.vfs_storage_info_extended('E');f.rx(0x1c,[1,69,3,1,15,128,64,48]);await modern;
 const open=f.api.vfs_open_file('E:/a','w',raw);raw.fill(9);await flush();
 const payload=f.writes.at(-1).slice(4);assert.deepEqual(payload.slice(0,7),[4,0,69,58,47,97,22]);assert.deepEqual(payload.slice(7),Array.from({length:128},(_,i)=>i));
 f.rx(0x12,[0]);await open;
 for(const args of [['I:/a','w',raw],['E:/a','r',raw],['E:/a','w',new Uint8Array(127)]])await assert.rejects(f.api.vfs_open_file(...args));
 f.bus.emit('ble_disconnected');await assert.rejects(f.api.vfs_open_file('E:/a','w',raw),/not supported/);
});
test('extended storage info opts in explicitly and old firmware falls back only after a known rejection',async()=>{
 for(const status of [1,255]){
  const f=protocolFixture(),p=f.api.vfs_storage_info_extended('E');assert.deepEqual(f.writes,[[28,0,0,0,69,1]]);
  f.rx(28,[],0,status);await flush();assert.deepEqual(f.writes.at(-1),[28,0,0,0,69]);
  f.rx(28,[1,69,3,1,7,128,64,48]);assert.equal((await p).data.flags,7);
  assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);await assert.rejects(f.api.vfs_open_file('E:/a','w',new Uint8Array(128)));
 }
});
test('extended storage info cannot hide malformed success or retry across a disconnected session',async()=>{
 const f=protocolFixture(),p=f.api.vfs_storage_info_extended('E'),failed=assert.rejects(p);
 f.rx(28,[1,69,3,1,15,128,64]);await failed;assert.equal(f.writes.length,1);
 const g=protocolFixture(),q=g.api.vfs_storage_info_extended('E'),rejected=assert.rejects(q);
 g.rx(28,[],0,1);g.bus.emit('ble_disconnected');await rejected;await flush();assert.equal(g.writes.length,1);
});
test('failed capability refresh removes atomic eligibility and legacy query retains the original flags contract',async()=>{
 const f=protocolFixture(),first=f.api.vfs_storage_info_extended('E');f.rx(28,[1,69,3,1,15,128,64,48]);await first;
 const legacy=f.api.vfs_storage_info('E'),rejected=assert.rejects(legacy);f.rx(28,[1,69,3,1,15,128,64,48]);await rejected;
 const before=f.writes.length;await assert.rejects(f.api.vfs_open_file('E:/a','w',new Uint8Array(128)));assert.equal(f.writes.length,before);
});
test('overlapping storage probes cannot leave an older atomic capability cached after the newest fails',async()=>{
 const f=protocolFixture(),a=f.api.vfs_storage_info_extended('E'),b=f.api.vfs_storage_info_extended('E'),failed=assert.rejects(b);
 f.rx(28,[1,69,3,1,15,128,64,48]);await a;await flush();
 f.rx(28,[1,69,3,1,15,128,64]);await failed;
 const count=f.writes.length;await assert.rejects(f.api.vfs_open_file('E:/a','w',new Uint8Array(128)));assert.equal(f.writes.length,count);
});
test('late fallback from an older storage probe cannot erase a newer successful capability',async()=>{
 const f=protocolFixture(),a=f.api.vfs_storage_info_extended('E'),b=f.api.vfs_storage_info_extended('E');
 f.rx(28,[],0,1);await flush();f.rx(28,[1,69,3,1,15,128,64,48]);await b;await flush();
 f.rx(28,[1,69,3,1,7,128,64,48]);await a;
 const open=f.api.vfs_open_file('E:/a','w',new Uint8Array(128));await flush();assert.equal(f.writes.at(-1)[0],18);f.rx(18,[0]);await open;
});
test('atomic helper fragments the full metadata OPEN at MTU23 and reports success only after CLOSE',async()=>{
 const f=protocolFixture();await modernProtocol(f);const info=f.api.vfs_storage_info_extended('E');await flush();f.rx(0x1c,[1,69,3,1,15,128,64,48]);await info;f.writes.length=0;
 const raw=new Uint8Array(128).fill(255),events=[];
 f.api.vfs_helper_write_file('E:/a',{bytes:[7,8]},()=>{},()=>events.push('ok'),e=>events.push(e.message),{rawMeta128:raw});raw[127]=0;
 await flush();assert(f.writes.every(p=>p.length<=20));assert(f.writes.length>1);
 const payload=f.writes.flatMap(p=>p.slice(4));assert.deepEqual(payload.slice(7),Array(128).fill(255));
 f.rx(0x12,[0]);await flush();assert.equal(f.writes.at(-1)[0],0x15);assert.deepEqual(events,[]);
 f.rx(0x15);await flush();assert.equal(f.writes.at(-1)[0],0x13);assert.deepEqual(events,[]);
 f.rx(0x13);await flush();assert.deepEqual(events,['ok']);assert.equal(f.disconnects,0);
});
test('atomic helper error aborts the link instead of closing and committing partial data',async()=>{
 const f=protocolFixture(),info=f.api.vfs_storage_info_extended('E');f.rx(0x1c,[1,69,3,1,15,128,64,48]);await info;f.writes.length=0;
 const events=[];f.api.vfs_helper_write_file('E:/a',{bytes:[7,8]},()=>{},()=>events.push('ok'),e=>events.push(e.message),{rawMeta128:new Uint8Array(128)});
 await flush();f.rx(0x12,[0]);await flush();f.rx(0x15,[],0,1);await flush();
 assert.equal(f.disconnects,1);assert.equal(events.length,1);assert.notEqual(events[0],'ok');assert(!f.writes.some(p=>p[0]===0x13));
 assert.equal(f.api.get_transport_diagnostics().lastErrorCode,'ATOMIC_WRITE_FAILED');
});
test('atomic helper rejects invalid metadata or options before OPEN and legacy writes keep their old frame',async()=>{
 const f=protocolFixture(),events=[];
 for(const options of [null,{rawMeta128:new Uint8Array(127)},{rawMeta128:'x'}])f.api.vfs_helper_write_file('E:/a',{bytes:[]},()=>{},()=>events.push('ok'),e=>events.push(e.message),options);
 await flush();assert.equal(events.length,3);assert(!events.includes('ok'));assert.equal(f.writes.length,0);
 const p=f.api.vfs_open_file('E:/a','w');assert.deepEqual(f.writes.at(-1),[18,0,0,0,4,0,69,58,47,97,22]);f.rx(0x12,[0]);await p;
});
function packedLayoutPacket() {
    const p=new Uint8Array(72),v=new DataView(p.buffer);p.set([1,69,3,0]);
    for(const [offset,value] of [[4,0x31534650],[8,2097152],[12,4096],[16,512],[28,65536],[36,7]])v.setUint32(offset,value,true);
    for(const [offset,value] of [[20,256],[22,256],[24,256],[26,128]])v.setUint16(offset,value,true);
    p.set([64,64,48,8],32);p.fill(0x72,40);return p;
}
test('packed layout reads the exact 72-byte identity through 20-byte frames even while unmounted',async()=>{
    const f=protocolFixture();await modernProtocol(f);const p=f.api.vfs_storage_layout('E');await flush();
    assert.deepEqual(f.writes.flatMap(x=>x.slice(4)),[69]);fragmentedReply(f,0x1f,[...packedLayoutPacket()]);
    const d=(await p).data;assert.equal(d.backend,3);assert.equal(d.mounted,false);assert.equal(d.flashBytes,2097152);
    assert.equal(d.blockCount,512);assert.equal(d.metadataBytes,128);assert.equal(d.engineSha256,'72'.repeat(32));
    const g=protocolFixture(),s=g.api.vfs_storage_info('E');g.rx(0x1c,[1,69,3,0,7,128,64,48]);assert.equal((await s).data.backend,3);
});
test('packed layout rejects malformed, unknown and inconsistent responses without a write fallback',async()=>{
    const packets=[packedLayoutPacket().slice(0,71),new Uint8Array(73)];
    for(const [offset,value] of [[0,2],[1,73],[2,2],[3,2],[4,0],[12,1],[36,15],[32,0],[34,1]]){const p=packedLayoutPacket();p[offset]=value;packets.push(p);}
    const zero=packedLayoutPacket();zero.fill(0,40);packets.push(zero);
    for(const packet of packets){const f=protocolFixture(),p=f.api.vfs_storage_layout('E'),rejected=assert.rejects(p);f.rx(0x1f,[...packet]);await rejected;assert.equal(f.writes.length,1);}
    const f=protocolFixture();await assert.rejects(f.api.vfs_storage_layout('I'));assert.equal(f.writes.length,0);
});
test('import-state read, finish and reboot have distinct explicit operations and bounded acknowledgements',async()=>{
    for(const op of [0,1,2]){const f=protocolFixture(),p=f.api.vfs_import_state('E',op);assert.deepEqual(f.writes,[[0x20,0,0,0,69,op]]);f.rx(0x20,[1,69,3,1,op===0?1:0,op===0?0:1,1,1,...new Array(32).fill(0x72)]);const data=(await p).data;assert.equal(data.ready,op!==0);assert.equal(data.archiveSha256,'72'.repeat(32));assert.equal(f.writes.length,1);}
    for(const head of [[1,69,3,1,1,1,0,0],[1,69,3,0,0,1,0,0],[1,69,3,1,0,1,1,0],[1,69,3,1,0,1,0],[1,69,2,1,0,1,0,0]]){const f=protocolFixture(),p=f.api.vfs_import_state('E'),rejected=assert.rejects(p);f.rx(0x20,[...head,...new Array(32).fill(0)]);await rejected;}
    const f=protocolFixture();await assert.rejects(f.api.vfs_import_state('E',3));await assert.rejects(f.api.vfs_import_state('I'));assert.equal(f.writes.length,0);
});
test('import binding transmits exactly 32 owned hash bytes and receives a fragmented 40-byte state',async()=>{
    const f=protocolFixture();await modernProtocol(f);const hash='ab'.repeat(32),p=f.api.vfs_import_state('E',3,hash);await flush();
    assert(f.writes.every(x=>x.length<=20));assert.deepEqual(f.writes.flatMap(x=>x.slice(4)),[69,3,...new Array(32).fill(0xab)]);
    fragmentedReply(f,0x20,[1,69,3,1,1,0,1,1,...new Array(32).fill(0xab)]);assert.equal((await p).data.archiveSha256,hash);
    const g=protocolFixture();for(const bad of ['ab','zz'.repeat(32),'0'.repeat(64)])await assert.rejects(g.api.vfs_import_state('E',3,bad));await assert.rejects(g.api.vfs_import_state('E',0,hash));assert.equal(g.writes.length,0);
});
test('raw128 read preserves exact bytes at 20-byte transport frames and uses uint16 UTF-8 path length',async()=>{
    const f=protocolFixture();await modernProtocol(f);const path='E:/日本/é',encoded=[...Buffer.from(path)],p=f.api.vfs_read_raw_meta(path);await flush();
    assert.deepEqual(f.writes.flatMap(frame=>frame.slice(4)),[encoded.length,0,...encoded]);
    const raw=Array.from({length:128},(_,i)=>(i*7)&255);fragmentedReply(f,0x1d,raw);assert.deepEqual(bytes((await p).data),raw);
    for(const size of [0,127,129]){const g=protocolFixture(),q=g.api.vfs_read_raw_meta('E:/x'),rejected=assert.rejects(q);g.rx(0x1d,new Array(size).fill(0));await rejected;}
});
test('raw128 write copies input, fragments through normal queue and requires empty acknowledgement',async()=>{
    const f=protocolFixture();await modernProtocol(f);const source=Uint8Array.from({length:128},(_,i)=>i),p=f.api.vfs_write_raw_meta('E:/x',source);source.fill(9);await flush();
    assert(f.writes.every(frame=>frame.length<=20));assert.deepEqual(f.writes.flatMap(frame=>frame.slice(4)),[4,0,...Buffer.from('E:/x'),...Array.from({length:128},(_,i)=>i)]);
    f.rx(0x1e);await p;
    const g=protocolFixture(),q=g.api.vfs_write_raw_meta('E:/x',new Uint8Array(128)),rejected=assert.rejects(q);g.rx(0x1e,[0]);await rejected;
    const h=protocolFixture();await assert.rejects(h.api.vfs_write_raw_meta('E:/',new Uint8Array(128)));await assert.rejects(h.api.vfs_write_raw_meta('E:/x',new Uint8Array(127)));await assert.rejects(h.api.vfs_read_raw_meta('E:/'));assert.equal(h.writes.length,0);
});
test('unsupported raw metadata command is surfaced without format/reset/fallback writes',async()=>{
    const f=protocolFixture(),p=f.api.vfs_read_raw_meta('E:/x');f.rx(0x1d,[],0,255);
    const reply=await p;assert.equal(reply.status,255);assert.equal(f.writes.length,1);assert.equal(f.writes[0][0],0x1d);
});

test('DE3.26 disconnect unsubscribes before GATT close, blocks TX immediately and settles only once',async()=>{
    const f=bleFixture(),gate=deferred(),order=[];let completes=0,disconnected=0;
    f.rx.stopNotifications=()=>{order.push('stop');return gate.promise;};
    const close=f.device.gatt.disconnect.bind(f.device.gatt);
    f.device.gatt.disconnect=()=>{order.push('gatt');close();};
    f.bus.on('ble_disconnected',()=>{disconnected++;assert.equal(f.api.get_connection_state(),'disconnecting');});
    f.bus.on('ble_disconnect_complete',()=>completes++);
    await f.api.connect();const closing=f.api.disconnect();
    assert.equal(f.api.disconnect(),closing);assert.equal(disconnected,1);
    assert.equal(f.device.gatt.connected,true);assert.equal(f.api.get_device_key(),null);
    await assert.rejects(f.api.tx_data(Uint8Array.of(1)),/not connected/);
    await flush();assert.deepEqual(order,['stop']);assert.equal(f.timers.size,1);
    gate.resolve();await closing;assert.deepEqual(order,['stop','gatt']);assert.equal(completes,1);
    assert.equal(f.api.get_connection_state(),'disconnected');assert.equal(f.timers.size,0);
    assert.equal(f.rx.events.listenerCount('characteristicvaluechanged'),0);
    assert.equal(f.device.events.listenerCount('gattserverdisconnected'),0);
});

test('DE3.26 rejection, synchronous throw and missing unsubscribe API all release GATT',async()=>{
    for(const mode of ['reject','throw','missing']) {
        const f=bleFixture();let closes=0;
        if(mode==='reject')f.rx.stopNotifications=()=>Promise.reject(new Error('not available'));
        if(mode==='throw')f.rx.stopNotifications=()=>{throw new Error('not available');};
        const close=f.device.gatt.disconnect.bind(f.device.gatt);f.device.gatt.disconnect=()=>{closes++;close();};
        await f.api.connect();await f.api.disconnect();
        assert.equal(f.api.get_connection_state(),'disconnected',mode);assert.equal(closes,1,mode);assert.equal(f.timers.size,0,mode);
    }
});

test('DE3.26 radio loss during unsubscribe settles early and late rejection cannot repeat cleanup',async()=>{
    const f=bleFixture(),gate=deferred();let completes=0;
    f.rx.stopNotifications=()=>gate.promise;f.bus.on('ble_disconnect_complete',()=>completes++);
    await f.api.connect();const closing=f.api.disconnect();await flush();
    f.device.gatt.connected=false;f.device.events.emit('gattserverdisconnected',{target:f.device});await closing;
    assert.equal(f.api.get_connection_state(),'disconnected');assert.equal(f.timers.size,0);
    gate.reject(new Error('old link vanished'));await flush();assert.equal(completes,1);
});

test('DE3.26 reconnect opens picker promptly but waits for old unsubscribe before GATT connect',async()=>{
    const f=bleFixture(),gate=deferred();let picks=0,connects=0;
    f.rx.stopNotifications=()=>gate.promise;
    f.navigator.bluetooth.requestDevice=()=>{picks++;return Promise.resolve(f.device);};
    const connect=f.device.gatt.connect.bind(f.device.gatt);f.device.gatt.connect=()=>{connects++;return connect();};
    await f.api.connect();const closing=f.api.disconnect(),reconnecting=f.api.connect();await flush();
    assert.equal(picks,2);assert.equal(connects,1);assert.equal(f.api.get_connection_state(),'disconnecting');
    gate.resolve();await closing;await reconnecting;
    assert.equal(connects,2);assert.equal(f.api.get_connection_state(),'connected');await f.api.disconnect({immediate:true});
});

test('DE3.26 stalled unsubscribe is bounded and its late completion cannot disconnect a replacement session',async()=>{
    const f=bleFixture(),gate=deferred();let closes=0;
    f.rx.stopNotifications=()=>gate.promise;
    const close=f.device.gatt.disconnect.bind(f.device.gatt);f.device.gatt.disconnect=()=>{closes++;close();};
    await f.api.connect();const closing=f.api.disconnect(),next=f.api.connect();await flush();
    assert.equal(f.timers.size,1);[...f.timers.values()][0]();await closing;await next;
    assert.equal(closes,1);assert.equal(f.api.get_connection_state(),'connected');
    gate.resolve();await flush();assert.equal(closes,1);assert.equal(f.device.gatt.connected,true);
    await f.api.disconnect({immediate:true});
});

test('DE3.26 cancelled reconnect during old unsubscribe never starts new radio work',async()=>{
    const f=bleFixture(),gate=deferred();let connects=0;
    f.rx.stopNotifications=()=>gate.promise;
    const connect=f.device.gatt.connect.bind(f.device.gatt);f.device.gatt.connect=()=>{connects++;return connect();};
    await f.api.connect();const closing=f.api.disconnect(),next=f.api.connect();await flush();
    f.api.disconnect();gate.resolve();await closing;await next;
    assert.equal(connects,1);assert.equal(f.api.get_connection_state(),'disconnected');assert.equal(f.timers.size,0);
});

test('DE3.26 failed partial setup and explicit abort skip graceful unsubscribe',async()=>{
    const f=bleFixture(),gate=deferred();let stops=0;
    f.rx.stopNotifications=()=>{stops++;return Promise.resolve();};
    f.rx.startNotifications=()=>gate.promise;const pending=f.api.connect();await flush();
    await f.api.disconnect();await pending;assert.equal(stops,0);assert.equal(f.device.gatt.connected,false);
    gate.resolve();await flush();f.rx.startNotifications=()=>Promise.resolve();await f.api.connect();
    await f.api.disconnect({immediate:true});assert.equal(stops,0);assert.equal(f.api.get_connection_state(),'disconnected');
});

test('DE3.26 logical disconnect cancels protocol queue before notification shutdown completes',async()=>{
    const f=bleFixture(),gate=deferred();f.rx.stopNotifications=()=>gate.promise;
    const proto=load('pixl.proto.js',{pixl:f.api,FileReader:class{},i18n:{global:{t:key=>key}},
        parseBootDiagnostics:load('boot-diagnostics.js',{}).parseBootDiagnostics,parsePowerDiagnostics:load('power-diagnostics.js',{}).parsePowerDiagnostics,sharedEventDispatcher:()=>f.bus,
        setTimeout,clearTimeout});proto.init();await f.api.connect();
    const a=proto.op_queue_push(0x14,()=>{},()=>{}),b=proto.op_queue_push(0x14,()=>{},()=>{});
    const settled=Promise.allSettled([a,b]);await flush();const closing=f.api.disconnect();
    assert.deepEqual((await settled).map(r=>r.status),['rejected','rejected']);
    assert.equal(f.device.gatt.connected,true);assert.equal(proto.get_transport_diagnostics().queuedCommands,0);
    assert.equal(proto.get_transport_diagnostics().activeCommand,null);assert.equal(f.writes.length,1);
    gate.resolve();await closing;
});

test('DE3.26 local disconnect remains truthful when platform keeps a shared physical bearer',async()=>{
    const f=bleFixture();let sharedRadioConnected=true,stops=0;
    f.rx.stopNotifications=()=>{stops++;return Promise.resolve();};
    // Another OS consumer holds ATT. Web Bluetooth only releases this client.
    f.device.gatt.disconnect=()=>{f.device.gatt.connected=false;f.device.events.emit('gattserverdisconnected',{target:f.device});};
    await f.api.connect();await f.api.disconnect();
    assert.equal(stops,1);assert.equal(f.api.get_connection_state(),'disconnected');assert.equal(sharedRadioConnected,true);
});

test('DE3.26 platform GATT close throwing cannot strand teardown or its next connection',async()=>{
    const f=bleFixture();f.rx.stopNotifications=()=>Promise.resolve();
    await f.api.connect();f.device.gatt.disconnect=()=>{throw new Error('platform handle lost');};
    await f.api.disconnect();assert.equal(f.api.get_connection_state(),'disconnected');assert.equal(f.timers.size,0);
    await f.api.connect();assert.equal(f.api.get_connection_state(),'connected');await f.api.disconnect({immediate:true});
});

test('DE3.26 protocol failure immediately aborts GATT rather than attempting unsubscribe during bad traffic',async()=>{
    const f=bleFixture();let stops=0;f.rx.stopNotifications=()=>{stops++;return Promise.resolve();};
    const proto=load('pixl.proto.js',{pixl:f.api,FileReader:class{},i18n:{global:{t:key=>key}},
        parseBootDiagnostics:load('boot-diagnostics.js',{}).parseBootDiagnostics,parsePowerDiagnostics:load('power-diagnostics.js',{}).parsePowerDiagnostics,sharedEventDispatcher:()=>f.bus,
        setTimeout,clearTimeout});proto.init();await f.api.connect();
    const a=proto.op_queue_push(0x14,()=>{},()=>{}),rejected=assert.rejects(a);
    f.bus.emit('ble_rx_data',Uint8Array.of(0xff).buffer);await rejected;
    assert.equal(stops,0);assert.equal(f.api.get_connection_state(),'disconnected');assert.equal(f.device.gatt.connected,false);
});

test('DE3.19 boot diagnosis is an empty queued read and all 128 bytes reassemble at MTU23 boundaries',async()=>{
    const f=protocolFixture();assert.equal(f.writes.length,0);
    const pending=f.api.get_boot_diagnostics();await flush();assert.deepEqual(f.writes,[[7,0,0,0]]);
    const packet=bootPacket();
    for(let i=0;i<8;i++)f.rx(7,[...packet.slice(i*16,i*16+16)],i|(i<7?0x8000:0));
    const result=await pending;assert.equal(result.bootloaderCounter,7);assert.equal(result.bootHashValid,true);
    assert.equal(f.disconnects,0);assert.equal(f.timers.size,0);
});

test('DE3.19 actual C observer output decodes through production transport at MTU23,185,250',async()=>{
    const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'boot-wire-fixture.json'),'utf8'));
    assert.equal(fixture.physical_device,false);
    const packet=Buffer.from(fixture.hex,'hex');assert.equal(packet.length,128);
    for(const mtu of [23,185,250]) {
        const f=protocolFixture(),pending=f.api.get_boot_diagnostics();await flush();
        const capacity=mtu-3-4,total=Math.ceil(packet.length/capacity);
        for(let index=0;index<total;index++) {
            const payload=[...packet.subarray(index*capacity,(index+1)*capacity)];
            assert.ok(payload.length+4<=mtu-3);
            f.rx(7,payload,index|(index+1<total?0x8000:0));
        }
        const result=await pending;
        assert.equal(result.bootloaderCounter,42);assert.equal(result.applicationCounter,578);
        assert.equal(result.softDeviceVariant,112);assert.equal(result.softDeviceVersion,7002000);
        assert.equal(result.softDeviceFwid,0x103);assert.equal(result.bootAddressSource,'uicr');
        assert.equal(result.bootRegionBytes,0x7000);assert.equal(result.effectiveParamsAddress,0x7e000);
        assert.equal(result.bootRegionSha256,'894148f4a92e4c32567b5acdf356f5525fa02a07f2db4f8ca66f5bd4a5e49bea');
        assert.equal(f.timers.size,0);
    }
});

test('DE3.19 unsupported boot diagnosis keeps older firmware transport usable and no stale error is invented',async()=>{
    const f=protocolFixture(),pending=f.api.get_boot_diagnostics();await flush();f.rx(7,[],0,255);
    assert.equal(await pending,null);assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
    const next=f.api.get_boot_diagnostics();await flush();f.rx(7,[...bootPacket()]);
    assert.equal((await next).geometryValid,true);assert.equal(f.writes.length,2);assert.equal(f.timers.size,0);
});

test('DE3.19 boot diagnosis rejects malformed successful replies and response overflow',async()=>{
    for(const packet of [new Uint8Array(127),new Uint8Array(128),new Uint8Array(129)]) {
        const f=protocolFixture(),pending=f.api.get_boot_diagnostics(),rejected=assert.rejects(pending);
        await flush();f.rx(7,[...packet]);await rejected;assert.equal(f.timers.size,0);
        assert.equal(f.api.get_transport_diagnostics().lastErrorCode,packet.length>128?'RX_INVALID':'RESPONSE_INVALID');
    }
});

test('DE3.19 queued boot diagnosis releases on disconnect or timeout and never retries the read automatically',async()=>{
    for(const cause of ['disconnect','timeout']) {
        const f=protocolFixture(),pending=f.api.get_boot_diagnostics(),second=f.api.get_boot_diagnostics();
        const a=assert.rejects(pending),b=assert.rejects(second);await flush();assert.equal(f.writes.length,1);
        if(cause==='disconnect')f.bus.emit('ble_disconnected');else [...f.timers.values()][0]();
        await Promise.all([a,b]);assert.equal(f.timers.size,0);assert.equal(f.writes.length,1);
        f.rx(7,[...bootPacket()]);assert.equal(f.writes.length,1);
    }
});

function runtimePacket() {
    const bytes=new Uint8Array(64),v=new DataView(bytes.buffer);
    bytes.set([80,88,68,71,1,64,1|2|4|32|64,2,19,0x17]);
    v.setUint16(12,2,true);v.setUint16(14,1,true);v.setUint16(16,3,true);v.setUint16(18,4,true);
    v.setInt32(20,-10001,true);
    for(const [off,value] of [[24,10000],[28,9000],[32,8000],[36,7000],[40,30000],[44,18000],[48,8192],[52,0xffffffff],[56,5],[60,6]])v.setUint32(off,value,true);
    return bytes;
}
test('3.30.2 real DE3.48 runtime reply decodes at MTU23,185,250 without extra reads or retries',async()=>{
    const fixture=require('./runtime-de348-wire-fixture.json'),packet=Buffer.from(fixture.hex,'hex');
    for(const mtu of [23,185,250]) {
        const f=protocolFixture(),pending=f.api.get_runtime_diagnostics();await flush();
        const capacity=mtu-7,total=Math.ceil(packet.length/capacity);
        for(let i=0;i<total;i++)f.rx(6,packet.subarray(i*capacity,(i+1)*capacity),i|(i+1<total?0x8000:0));
        assert.deepEqual(JSON.parse(JSON.stringify(await pending)),fixture.expected);
        assert.equal(f.writes.length,1);assert.equal(f.writes[0][0],6);
        assert.equal(f.timers.size,0);assert.equal(f.disconnects,0);
    }
});
test('DE3.17 browser decodes the actual C diagnostic reply reassembled at all three simulated MTUs',async()=>{
    const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'runtime-wire-fixture.json'),'utf8'));
    const f=protocolFixture(),p=f.api.get_runtime_diagnostics();await flush();f.rx(6,[...Buffer.from(fixture.hex,'hex')]);
    const result=await p;
    assert.equal(result.lastVfsCommand,0x12);assert.equal(result.lastVfsError,-1000);assert.equal(result.vfsErrors,3);
    assert.equal(result.heapPoolBytes,null);assert.equal(result.stackMinFreeBytes,null);
});
test('DE3.17 optional runtime diagnostics distinguish unsupported firmware without poisoning transport',async()=>{
    const f=protocolFixture();const pending=f.api.get_runtime_diagnostics();await flush();
    assert.equal(f.writes[0][0],6);f.rx(6,[],0,255);assert.equal(await pending,null);
    assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
    const next=f.api.get_runtime_diagnostics();await flush();f.rx(6,[...runtimePacket()]);
    const r=await next;assert.equal(r.lastVfsError,-10001);assert.equal(r.heapFreeBytes,10000);
    assert.equal(r.sampledMinFreeBytes,9000);assert.equal(r.stackMinFreeBytes,null);assert.equal(r.scope,'since-device-restart');
    assert.equal(Object.isFrozen(r),true);assert.equal(f.timers.size,0);
});
test('DE3.17 runtime diagnostics reject malformed lengths, headers and impossible counters',async()=>{
    const f=protocolFixture();
    for(const bad of [runtimePacket().slice(0,63),new Uint8Array(64),(()=>{const b=runtimePacket();b[10]=1;return b;})(),(()=>{const b=runtimePacket();new DataView(b.buffer).setUint32(24,40000,true);return b;})()]) {
        const p=f.api.get_runtime_diagnostics();const rejected=assert.rejects(p,/Invalid runtime/);await flush();f.rx(6,[...bad]);await rejected;
    }
    const p=f.api.get_runtime_diagnostics(), rejected=assert.rejects(p);await flush();f.bus.emit('ble_disconnected');await rejected;
    assert.equal(f.timers.size,0);
});
test('DE3.17 opaque device key exists only during connection and is absent from general state',async()=>{
    const f=bleFixture();f.device.id='opaque-browser-device';assert.equal(f.api.get_device_key(),null);
    await f.api.connect();assert.equal(f.api.get_device_key(),'opaque-browser-device');assert.equal(f.api.get_connection_state(),'connected');
    f.api.disconnect();assert.equal(f.api.get_device_key(),null);
});

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
test('BLE bounds each stalled GATT stage and cleans late completions without a false connection',async()=>{
    for(const stage of ['connect','services','characteristics','notifications']) {
        const gate=deferred(),f=bleFixture();let successes=0;const errors=[];
        f.bus.on('ble_connected',()=>successes++);f.bus.on('ble_connect_error',e=>errors.push(e));
        let complete;
        if(stage==='connect') {
            f.device.gatt.connect=()=>gate.promise.then(()=>{f.device.gatt.connected=true;return f.device.gatt;});
            complete=()=>gate.resolve();
        } else if(stage==='services') {
            f.device.gatt.getPrimaryServices=()=>gate.promise;complete=()=>gate.resolve([f.service]);
        } else if(stage==='characteristics') {
            f.service.getCharacteristics=()=>gate.promise;complete=()=>gate.resolve([f.rx,f.tx]);
        } else { f.rx.startNotifications=()=>gate.promise;complete=()=>gate.resolve(); }
        const pending=f.api.connect();await flush();assert.equal(f.timers.size,1,stage);
        [...f.timers.values()][0]();await pending;
        assert.equal(errors.length,1,stage);assert.equal(errors[0].code,'CONNECT_TIMEOUT');
        assert.equal(f.api.get_connection_state(),'disconnected');assert.equal(f.timers.size,0);
        complete();await flush();assert.equal(successes,0,stage);assert.equal(f.device.gatt.connected,false,stage);
        assert.equal(f.rx.events.listenerCount('characteristicvaluechanged'),0,stage);
        assert.equal(f.device.events.listenerCount('gattserverdisconnected'),0,stage);
    }
});
test('BLE cancellation settles a hung radio step immediately and releases its timer',async()=>{
    const gate=deferred(),f=bleFixture();let errors=0,successes=0;
    f.rx.startNotifications=()=>gate.promise;
    f.bus.on('ble_connect_error',()=>errors++);f.bus.on('ble_connected',()=>successes++);
    const pending=f.api.connect();await flush();f.api.disconnect();await pending;
    assert.equal(f.timers.size,0);assert.equal(f.api.get_connection_state(),'disconnected');
    assert.equal(errors,0);gate.resolve();await flush();assert.equal(successes,0);
});
test('BLE does not time out the user device picker and clears timers on success',async()=>{
    const gate=deferred(),f=bleFixture();f.navigator.bluetooth.requestDevice=()=>gate.promise;
    const pending=f.api.connect();await flush();assert.equal(f.timers.size,0);
    gate.resolve(f.device);await pending;assert.equal(f.api.get_connection_state(),'connected');
    assert.equal(f.timers.size,0);f.api.disconnect();
});
test('late timed-out connect cannot disconnect a newer attempt using the same device object',async()=>{
    const gate=deferred(),f=bleFixture();let successes=0;
    f.bus.on('ble_connected',()=>successes++);
    f.device.gatt.connect=()=>gate.promise.then(()=>{f.device.gatt.connected=true;return f.device.gatt;});
    const old=f.api.connect();await flush();[...f.timers.values()][0]();await old;
    f.device.gatt.connect=()=>{f.device.gatt.connected=true;return Promise.resolve(f.device.gatt);};
    await f.api.connect();assert.equal(successes,1);gate.resolve();await flush();
    assert.equal(successes,1);assert.equal(f.device.gatt.connected,true);
    assert.equal(f.api.get_connection_state(),'connected');assert.equal(f.timers.size,0);f.api.disconnect();
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

test('3.26 optional or throwing upload progress cannot truncate a file or strand the next file',async()=>{
    for(const observer of [undefined,()=>{throw new Error('UI render failed');}]) {
        const f=protocolFixture(),source=Array.from({length:500},(_,i)=>i&255);let success=0,errors=0;
        f.api.vfs_helper_write_file('E:/a.bin',{bytes:source},observer,()=>success++,()=>errors++);
        f.api.vfs_helper_write_file('E:/b.bin',{bytes:[9]},undefined,()=>success++,()=>errors++);
        await flush();f.rx(0x12,[1]);await flush();
        for(let i=0;i<3;i++) {assert.equal(f.writes.at(-1)[0],0x15);f.rx(0x15);await flush();}
        assert.equal(success,0);assert.equal(f.writes.at(-1)[0],0x13);f.rx(0x13);await flush();
        assert.equal(f.writes.at(-1)[0],0x12);f.rx(0x12,[2]);await flush();f.rx(0x15);await flush();f.rx(0x13);await flush();
        assert.deepEqual([success,errors,f.disconnects,f.timers.size],[2,0,0,0]);
        assert.deepEqual(f.writes.filter(p=>p[0]===0x15).flatMap(p=>p.slice(5)),[...source,9]);
        assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x15,0x15,0x15,0x13,0x12,0x15,0x13]);
    }
});

test('3.26 a throwing download progress observer does not destroy a valid BLE response',async()=>{
    const f=protocolFixture();let result,errors=0;
    const pending=f.api.vfs_helper_read_file('E:/a',data=>{result=bytes(data);},()=>errors++,()=>{},
        {max_bytes:4,progress_cb:()=>{throw new Error('UI render failed');}});
    f.rx(0x12,[1]);await flush();f.rx(0x14,[0,255],0x8000);f.rx(0x14,[128,1],1);await flush();
    assert.equal(f.disconnects,0);assert.equal(f.writes.at(-1)[0],0x13);assert.equal(result,undefined);
    f.rx(0x13);await pending;assert.deepEqual(result,[0,255,128,1]);assert.equal(errors,0);assert.equal(f.timers.size,0);
});

test('3.26 bulk response copy preserves fragmented bytes and owns nonzero-offset input views',async()=>{
    const f=protocolFixture(),source=Uint8Array.from({length:8193},(_,i)=>(i*137+19)&255);
    const p=f.api.op_queue_push(0x14,()=>{},b=>b.readBytes(b.remaining()).toArrayBuffer(),{max_bytes:source.length});
    let offset=0,sequence=0;
    while(offset<source.length) {
        const count=Math.min(243,source.length-offset),more=offset+count<source.length;
        const wire=new Uint8Array(count+12);wire.fill(0xab);const view=wire.subarray(3,7+count);
        const chunk=sequence++|(more?0x8000:0);view.set([0x14,0,chunk&255,chunk>>8]);view.set(source.subarray(offset,offset+count),4);
        f.bus.emit('ble_rx_data',view);wire.fill(0xcc);offset+=count;
    }
    assert.deepEqual(bytes((await p).data),[...source]);assert.equal(f.timers.size,0);assert.equal(f.disconnects,0);
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

for (const [label,note] of [['NUL','keep\0lost'],['unpaired-high','keep\ud800'],['unpaired-low','keep\udfff']]) {
    test(`3.30.3 metadata rejects ${label} before transmission without stranding the queue`, async () => {
        const f=protocolFixture(),meta={notes:note,flags:{raw:0,hide:false,readonly:false},amiibo:{head:0,tail:0}};
        const before=f.writes.length,p=f.api.vfs_update_meta('E:/a.bin',meta);
        // Settle the old serializer too, so the negative control fails rather
        // than hanging on the mock device's acknowledgement.
        f.rx(0x1a);
        await assert.rejects(p,/noteinvalid/);
        assert.equal(f.writes.length,before);
        const next=command(f);f.rx(0x14,[7]);assert.deepEqual(bytes((await next).data),[7]);
        assert.equal(f.timers.size,0);assert.equal(f.disconnects,0);
    });
}

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
    const vectors=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/df_mtu_wire_vectors.json'),'utf8'));
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

test('DE3.13 cancellation asks GATT to stop while connect is still pending',async()=>{
    const gate=deferred(),f=bleFixture();let disconnectCalls=0;
    const disconnect=f.device.gatt.disconnect.bind(f.device.gatt);
    f.device.gatt.disconnect=()=>{disconnectCalls++;disconnect();};
    f.device.gatt.connect=()=>gate.promise.then(()=>{f.device.gatt.connected=true;return f.device.gatt;});
    const pending=f.api.connect();await flush();assert.equal(f.device.gatt.connected,false);
    f.api.disconnect();assert.equal(disconnectCalls,1,'pending connect must be cancelled immediately');
    gate.resolve();await pending;assert.equal(f.device.gatt.connected,false);
    assert.equal(f.device.events.listenerCount('gattserverdisconnected'),0);
});

test('DE3.13 immediate cancellation does not open a later device picker',async()=>{
    const f=bleFixture();let selections=0;
    f.navigator.bluetooth.requestDevice=()=>{selections++;return Promise.resolve(f.device);};
    const pending=f.api.connect();f.api.disconnect();await pending;
    assert.equal(selections,0);assert.equal(f.device.gatt.connected,false);
});

test('DE3.13 acknowledged GATT writes prefer the current API with legacy fallback',async()=>{
    const f=bleFixture();let modern=0,legacy=0,unacknowledged=0;
    f.tx.writeValueWithResponse=()=>{modern++;return Promise.resolve();};
    f.tx.writeValue=()=>{legacy++;return Promise.resolve();};
    f.tx.writeValueWithoutResponse=()=>{unacknowledged++;return Promise.resolve();};
    await f.api.connect();await f.api.tx_data(Uint8Array.of(1).buffer);
    assert.deepEqual([modern,legacy,unacknowledged],[1,0,0]);
    delete f.tx.writeValueWithResponse;await f.api.tx_data(Uint8Array.of(2).buffer);
    assert.deepEqual([modern,legacy,unacknowledged],[1,1,0]);f.api.disconnect();
});

test('DE3.13 metadata flag edits retain a leading BOM in the stored note',async()=>{
    const f=protocolFixture(),note='\ufeffkeep ä',encoded=Array.from(Buffer.from(note));
    const listing=f.api.vfs_read_folder('E:/');
    f.rx(0x16,metadataFolderPayload([['a.bin',[1,encoded.length,...encoded,2,0]]]));
    const meta=(await listing).data[0].meta;assert.equal(meta.notes,note);
    meta.flags.hide=true;const saved=f.api.vfs_update_meta('E:/a.bin',meta);
    assert.deepEqual(f.writes.at(-1).slice(-(encoded.length+4)),[1,encoded.length,...encoded,2,1]);
    f.rx(0x1a);await saved;
});

test('DE3.13 throwing cancellation callbacks cannot strand queued file completions',async()=>{
    const f=protocolFixture();let nextError=0,nextDone=0;
    const first=f.api.vfs_helper_read_file('E:/a',()=>{},()=>{throw new Error('consumer error callback');},()=>{throw new Error('consumer done callback');});
    const second=f.api.vfs_helper_read_file('E:/b',()=>{},()=>nextError++,()=>nextDone++);
    assert.doesNotThrow(()=>f.bus.emit('ble_disconnected'));
    await Promise.all([first,second]);assert.deepEqual([nextError,nextDone],[1,1]);
    const next=command(f);f.rx(0x14,[9]);assert.deepEqual(bytes((await next).data),[9]);
    assert.equal(f.timers.size,0);
});

test('DE3.13 throwing success or done callbacks still close and release the next download',async()=>{
    const f=protocolFixture();let secondSuccess=0,settled=0;
    const first=f.api.vfs_helper_read_file('E:/a',()=>{throw new Error('consumer success');},()=>{},()=>{throw new Error('consumer done');}).then(()=>settled++);
    const second=f.api.vfs_helper_read_file('E:/b',()=>secondSuccess++,()=>{}).then(()=>settled++);
    for(let i=0;i<2;i++) {
        f.rx(0x12,[1]);await flush();f.rx(0x14,[i]);await flush();f.rx(0x13);await flush();
    }
    await Promise.all([first,second]);assert.deepEqual([secondSuccess,settled],[1,2]);
    assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x14,0x13,0x12,0x14,0x13]);
});

test('DE3.13 bounded downloads report received bytes and succeed only after CLOSE',async()=>{
    for(const size of [0,4]) {
        const f=protocolFixture(),progress=[];let success=0,done=0;
        const pending=f.api.vfs_helper_read_file('E:/a',data=>{success++;assert.equal(data.byteLength,size);},e=>assert.fail(e),()=>done++,
            {max_bytes:size,progress_cb:p=>progress.push(p.received_bytes)});
        f.rx(0x12,[2]);await flush();
        if(size) {f.rx(0x14,[1,2],0x8000);f.rx(0x14,[3,4],1);}else f.rx(0x14);
        await flush();assert.equal(success,0);assert.equal(done,0);
        assert.deepEqual(progress,size?[2,4]:[0]);f.rx(0x13);await pending;
        assert.deepEqual([success,done],[1,1]);assert.equal(f.timers.size,0);
    }
});

test('DE3.13 an oversized download aborts before exposing extra data and cancels its queue',async()=>{
    const f=protocolFixture(),progress=[];let errors=0,success=0,done=0;
    const failed=()=>errors++;
    const first=f.api.vfs_helper_read_file('E:/a',()=>success++,failed,()=>done++,{max_bytes:3,progress_cb:p=>progress.push(p.received_bytes)});
    const second=f.api.vfs_helper_read_file('E:/b',()=>success++,failed,()=>done++);
    f.rx(0x12,[2]);await flush();f.rx(0x14,[1,2],0x8000);f.rx(0x14,[3,4],1);
    await Promise.all([first,second]);assert.deepEqual(progress,[2]);
    assert.deepEqual([success,errors,done,f.disconnects],[0,2,2,1]);
    assert.deepEqual(f.writes.map(p=>p[0]),[0x12,0x14]);assert.equal(f.timers.size,0);
});

test('DE3.13 invalid download limits are rejected before OPEN and preserve later work',async()=>{
    for(const options of [null,{max_bytes:-1},{max_bytes:1.5},{max_bytes:'3'},{max_bytes:null},
        {max_bytes:8*1024*1024+1},{max_bytes:NaN},{progress_cb:2}]) {
        const f=protocolFixture();let errors=0,done=0;
        await f.api.vfs_helper_read_file('E:/a',()=>assert.fail('unexpected success'),()=>errors++,()=>done++,options);
        assert.deepEqual([f.writes.length,errors,done,f.disconnects],[0,1,1,0]);
        const next=command(f);f.rx(0x14,[1]);await next;assert.equal(f.timers.size,0);
    }
});

test('DE3.13 download progress cannot keep stale timers after a callback disconnect',async()=>{
    const f=protocolFixture();let errors=0;
    const pending=f.api.vfs_helper_read_file('E:/a',()=>assert.fail('unexpected success'),()=>errors++,()=>{},
        {max_bytes:4,progress_cb:()=>f.bus.emit('ble_disconnected')});
    f.rx(0x12,[1]);await flush();f.rx(0x14,[1],0x8000);await pending;
    assert.equal(errors,1);assert.equal(f.timers.size,0);
    const next=command(f);f.rx(0x14,[9]);assert.deepEqual(bytes((await next).data),[9]);
});

test('DE3.14 upload logical chunks respect a smaller advertised request limit',async()=>{
    const f=protocolFixture(),probe=f.api.negotiate_transport();
    f.rx(3,[80,88,68,70,1,3,20,0,20,0]);await probe;f.writes.length=0;
    const source=Array.from({length:53},(_,i)=>i),progress=[],errors=[];let success=0;
    f.api.vfs_helper_write_file('E:/a',{bytes:source},p=>progress.push(p.written_bytes),()=>success++,e=>errors.push(e));
    await flush();f.rx(0x12,[7]);await flush();
    assert.equal(errors.length,0,'valid smaller capabilities must not truncate then abort the upload');
    for(let i=0;i<3;i++){f.rx(0x15);await flush();}
    assert.deepEqual(progress,[19,38,53]);
    let logical=[],all=[];
    for(const frame of f.writes.filter(frame=>frame[0]===0x15)) {
        assert.ok(frame.length<=20);logical.push(...frame.slice(4));
        if(!(frame[3]&0x80)){assert.ok(logical.length<=20);assert.equal(logical[0],7);all.push(...logical.slice(1));logical=[];}
    }
    assert.deepEqual(all,source);f.rx(0x13);await flush();assert.equal(success,1);
    assert.equal(errors.length,0);assert.equal(f.disconnects,0);
});

test('DE3.14 diagnostics distinguish firmware capacity, safe fallback and legacy unknown',async()=>{
    for(const advertised of [20,247,null,0,248]) {
        const f=protocolFixture(),before=f.api.get_transport_diagnostics();
        assert.equal(before.schemaVersion,1);assert.equal(before.chunkMode,'not-negotiated');
        assert.equal(before.capabilities,null);assert.equal(before.reportedGattValueCapacity,null);
        const p=f.api.negotiate_transport(),capability=[80,88,68,70,1,3,243,0];
        if(advertised!==null)capability.push(advertised&255,advertised>>8);
        f.rx(3,capability);const profile=await p;
        const current=f.api.get_transport_diagnostics(),valid=advertised===20||advertised===247;
        assert.equal(current.chunkMode,'chunked');assert.equal(current.maxRequestPayload,243);
        assert.equal(current.reportedGattValueCapacity,valid?advertised:null);
        assert.equal(current.effectiveGattValueCapacity,valid?advertised:20);
        assert.equal(current.capabilities.gattValueCapacity,current.effectiveGattValueCapacity);
        assert.equal(Object.isFrozen(current),true);assert.equal(Object.isFrozen(current.capabilities),true);
        assert.equal(Object.isFrozen(profile),true);assert.equal(before.capabilities,null);
        assert.equal(Reflect.set(current,'maxRequestPayload',1),false);
        assert.equal(Reflect.set(current.capabilities,'gattValueCapacity',500),false);
        assert.equal(f.api.get_transport_diagnostics().maxRequestPayload,243);
        assert.equal(Object.keys(current).some(key=>/address|filename|payload|mtu/i.test(key) && key!=='maxRequestPayload'),false);
    }
    const f=protocolFixture(),p=f.api.negotiate_transport();f.rx(3,[],0,255);await p;
    const snapshot=f.api.get_transport_diagnostics();
    assert.equal(snapshot.chunkMode,'legacy');assert.equal(snapshot.reportedGattValueCapacity,null);
    assert.equal(snapshot.effectiveGattValueCapacity,null);assert.equal(snapshot.lastErrorCode,null);
});

test('DE3.14 diagnostics count completed physical writes and received frames without data',async()=>{
    const f=protocolFixture();await modernProtocol(f);
    const initial=f.api.get_transport_diagnostics();
    assert.deepEqual([initial.txFrames,initial.txBytes,initial.rxFrames,initial.rxBytes],[1,4,1,14]);
    const gate=deferred();let calls=0;
    f.setWrite(()=>++calls===1?gate.promise:Promise.resolve());
    const p=payloadCommand(f,Array(17).fill(0x73)),next=command(f,0x78);
    const pending=f.api.get_transport_diagnostics();
    assert.equal(pending.activeCommand,0x77);assert.equal(pending.queuedCommands,1);
    assert.equal(pending.txFrames,1,'pending write is not confirmed');
    gate.resolve();await flush();
    assert.equal(f.api.get_transport_diagnostics().txFrames,3);
    f.rx(0x77,[1,2],0x8000);f.rx(0x77,[3],1);await p;await flush();
    f.rx(0x78,[4]);await next;
    const done=f.api.get_transport_diagnostics();
    assert.deepEqual([done.txFrames,done.txBytes,done.rxFrames,done.rxBytes],[4,33,4,30]);
    assert.equal(done.activeCommand,null);assert.equal(done.queuedCommands,0);
    f.bus.emit('ble_disconnected');
    const reset=f.api.get_transport_diagnostics();
    assert.deepEqual([reset.txFrames,reset.txBytes,reset.rxFrames,reset.rxBytes],[0,0,0,0]);
    assert.equal(reset.chunkMode,'not-negotiated');assert.equal(reset.lastErrorCode,'DISCONNECTED');
    f.bus.emit('ble_connected');assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
});

test('DE3.14 diagnostics retain only fixed error categories and reset stale completions',async()=>{
    for(const failure of ['TX_FAILED','TIMEOUT','RX_INVALID','RESPONSE_INVALID','DEVICE_STATUS','CONNECT_FAILED']) {
        const f=protocolFixture();
        if(failure==='CONNECT_FAILED') {
            f.bus.emit('ble_connect_error',new Error('private E:/secret.bin 01:23:45:67:89:AB'));
        } else {
            const gate=deferred();if(failure==='TX_FAILED')f.setWrite(()=>gate.promise);
            const p=failure==='RESPONSE_INVALID'?f.api.get_version():command(f);
            const settled=Promise.allSettled([p]);
            if(failure==='TX_FAILED')gate.reject(new Error('private E:/secret.bin 01:23:45:67:89:AB'));
            if(failure==='TIMEOUT')[...f.timers.values()][0]();
            if(failure==='RX_INVALID')f.rx(0xff);
            if(failure==='RESPONSE_INVALID')f.rx(3,[0]);
            if(failure==='DEVICE_STATUS')f.rx(0x14,[],0,7);
            await settled;await flush();
        }
        const snapshot=f.api.get_transport_diagnostics();
        assert.equal(snapshot.lastErrorCode,failure);
        assert.equal(JSON.stringify(snapshot).includes('secret'),false);
        assert.equal(JSON.stringify(snapshot).includes('01:23'),false);
        assert.equal(snapshot.activeCommand,null);assert.equal(snapshot.queuedCommands,0);
        f.bus.emit('ble_connected');assert.equal(f.api.get_transport_diagnostics().lastErrorCode,null);
    }
    const f=protocolFixture(),gate=deferred();f.setWrite(()=>gate.promise);
    const p=command(f),settled=Promise.allSettled([p]);f.bus.emit('ble_disconnected');
    gate.resolve();await settled;await flush();
    assert.equal(f.api.get_transport_diagnostics().txBytes,0,'old completion cannot count in a new session');
    const malformed=protocolFixture(),bad=command(malformed),rejected=assert.rejects(bad);
    assert.doesNotThrow(()=>malformed.bus.emit('ble_rx_data',null));await rejected;
    assert.equal(malformed.api.get_transport_diagnostics().lastErrorCode,'RX_INVALID');
});

test('DE3.14 diagnostics expose file queue counts without retaining filenames',async()=>{
    const f=protocolFixture();
    const a=f.api.vfs_helper_read_file('E:/private-one',()=>{},()=>{});
    const b=f.api.vfs_helper_read_file('E:/private-two',()=>{},()=>{});
    const busy=f.api.get_transport_diagnostics();
    assert.equal(busy.fileTransferActive,true);assert.equal(busy.queuedFileTransfers,1);
    assert.equal(busy.activeCommand,0x12);assert.equal(JSON.stringify(busy).includes('private-'),false);
    f.bus.emit('ble_disconnected');await Promise.all([a,b]);
    const reset=f.api.get_transport_diagnostics();
    assert.equal(reset.fileTransferActive,false);assert.equal(reset.queuedFileTransfers,0);
});

test('DE3.14 connection state is accurate inside success, failure and disconnect events',async()=>{
    const gate=deferred(),f=bleFixture(gate.promise),states=[];
    assert.equal(f.api.get_connection_state(),'disconnected');
    f.bus.on('ble_connected',()=>states.push(f.api.get_connection_state()));
    f.bus.on('ble_disconnected',()=>states.push(f.api.get_connection_state()));
    const p=f.api.connect();assert.equal(f.api.get_connection_state(),'connecting');
    await flush();gate.resolve();await p;f.api.disconnect();
    assert.deepEqual(states,['connected','disconnected']);
    f.navigator.bluetooth.requestDevice=()=>Promise.reject(new Error('chooser cancelled'));
    f.bus.on('ble_connect_error',()=>states.push(f.api.get_connection_state()));
    await f.api.connect();assert.equal(states.at(-1),'disconnected');
});
