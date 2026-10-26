import test from 'node:test'
import assert from 'node:assert/strict'
import {createMigrationTicketStore} from '../src/lib/migration-tickets.js'
const receipt={schema:1,kind:'verified-migration-source',verified:true,archiveSha256:'a'.repeat(64),deviceIdentitySha256:'b'.repeat(64),createdAt:'2026-10-25T00:00:00Z',entries:1}
function fixture(){const timers=[],requests=[],gets=[],puts=[];let closed=0,aborted=0,tx,operation
 const db={close:()=>closed++,transaction(){tx={abort:()=>aborted++,objectStore:()=>({put:value=>{puts.push(value);operation={result:value};return operation},get:key=>{gets.push(key);operation={};return operation}})};return tx}}
 const store=createMigrationTicketStore({indexedDB:{open(){const request={result:db};requests.push(request);return request}},setTimer:fn=>{timers.push(fn);return timers.length-1},clearTimer:id=>{timers[id]=null}})
 return{store,timers,requests,db,gets,puts,get tx(){return tx},get operation(){return operation},closed:()=>closed,aborted:()=>aborted}
}
test('receipt storage rejects unavailable APIs or malformed imported objects before opening',async()=>{
 await assert.rejects(createMigrationTicketStore({indexedDB:null}).put(receipt),{code:'MIGRATION_TICKET'})
 const f=fixture();await assert.rejects(f.store.put({...receipt,verified:false}));assert.equal(f.requests.length,0)
})
test('blocked and timed-out opens settle, and late successful handles are closed',async()=>{
 for(const mode of ['blocked','timeout']){const f=fixture(),write=f.store.put(receipt);const rejected=assert.rejects(write,{code:'MIGRATION_TICKET'});
  if(mode==='blocked')f.requests[0].onblocked();else f.timers[0]();await rejected;f.requests[0].onsuccess();assert.equal(f.closed(),1)
 }
})
test('success waits for transaction commit rather than merely the put acknowledgement',async()=>{
 const f=fixture();let settled=false;const write=f.store.put(receipt).then(()=>settled=true);f.requests[0].onsuccess();await Promise.resolve();await Promise.resolve();
 f.operation.onsuccess();await Promise.resolve();assert.equal(settled,false);f.tx.oncomplete();await write;assert.equal(settled,true)
 const read=f.store.get(receipt.archiveSha256,receipt.deviceIdentitySha256);await Promise.resolve();f.operation.result={receipt};f.operation.onsuccess();f.tx.oncomplete();assert.deepEqual(await read,receipt)
})
test('hung transactions abort boundedly and late completion cannot turn failure into success',async()=>{
 const f=fixture(),write=f.store.put(receipt),rejected=assert.rejects(write,{code:'MIGRATION_TICKET'});f.requests[0].onsuccess();await Promise.resolve();await Promise.resolve();f.timers.filter(Boolean)[0]();await rejected;assert.equal(f.aborted(),1);assert.equal(f.closed(),1);f.tx.oncomplete()
})

const marker={schema:1,kind:'migration-format-marker',state:'format_attempted',archiveSha256:receipt.archiveSha256,deviceIdentitySha256:receipt.deviceIdentitySha256,engineSha256:'c'.repeat(64),applicationCounter:603,firmwareVersion:'2.22.0-DE3.31'}
test('format marker is committed both for the archive and the device before success',async()=>{
 const f=fixture(),pending=f.store.mark(marker);f.requests[0].onsuccess();await Promise.resolve();await Promise.resolve();assert.equal(f.gets[0],'device:'+receipt.deviceIdentitySha256);f.operation.onsuccess();assert.equal(f.puts.length,2);assert.equal(f.puts[1].key,'device:'+receipt.deviceIdentitySha256);f.tx.oncomplete();await pending
})
test('finished markers cannot be downgraded, replaced by another archive/engine, or overwritten by an old source receipt',async()=>{
 for(const kind of ['downgrade','archive','engine','receipt']){const f=fixture();const next=kind==='archive'?{...marker,archiveSha256:'d'.repeat(64)}:kind==='engine'?{...marker,engineSha256:'e'.repeat(64)}:marker
  const pending=kind==='receipt'?f.store.put(receipt):f.store.mark(next),failed=assert.rejects(pending,{code:'MIGRATION_TICKET'});f.requests[0].onsuccess();await Promise.resolve();await Promise.resolve();f.operation.result={marker:{...marker,state:'finished'}};f.operation.onsuccess();await failed;assert.equal(f.puts.length,0);assert.equal(f.aborted(),1)
 }
})
test('another archive lookup sees the device-wide terminal marker',async()=>{
 const f=fixture(),pending=f.store.getMarker('d'.repeat(64),receipt.deviceIdentitySha256);f.requests[0].onsuccess();await Promise.resolve();await Promise.resolve();f.operation.result={marker:{...marker,state:'finished'}};f.operation.onsuccess();f.tx.oncomplete();assert.equal((await pending).archiveSha256,receipt.archiveSha256);assert.equal(f.gets[0],'device:'+receipt.deviceIdentitySha256)
})

async function completeRead(f,pending,{open=false}={}){
 if(open)f.requests.at(-1).onsuccess()
 await Promise.resolve();await Promise.resolve();f.operation.result=undefined;f.operation.onsuccess();f.tx.oncomplete()
 assert.equal(await pending,null)
}

test('a forced IndexedDB close reopens on the next request without replaying the last operation',async()=>{
 const f=fixture(),first=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256)
 await completeRead(f,first,{open:true});assert.equal(f.requests.length,1)
 f.db.onclose();assert.equal(f.requests.length,1,'close alone must not open or replay anything')
 const second=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256)
 assert.equal(f.requests.length,2);await completeRead(f,second,{open:true});assert.equal(f.gets.length,2);assert.equal(f.puts.length,0)
})

test('transaction creation on a silently closed database fails once and permits a fresh user retry',async()=>{
 const f=fixture(),first=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256)
 await completeRead(f,first,{open:true})
 const start=f.db.transaction;let attempts=0
 f.db.transaction=()=>{attempts++;throw Object.assign(new Error('Connection is closed'),{name:'InvalidStateError'})}
 await assert.rejects(f.store.put(receipt),{code:'MIGRATION_TICKET'})
 assert.equal(attempts,1);assert.equal(f.requests.length,1);assert.equal(f.puts.length,0)
 f.db.transaction=start
 const next=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256)
 assert.equal(f.requests.length,2);await completeRead(f,next,{open:true})
})

test('a pending write interrupted by forced close is rejected, never automatically repeated',async()=>{
 const f=fixture(),write=f.store.put(receipt),rejected=assert.rejects(write,{code:'MIGRATION_TICKET'})
 f.requests[0].onsuccess();await Promise.resolve();await Promise.resolve();f.operation.onsuccess();assert.equal(f.puts.length,1)
 f.tx.onabort();f.db.onclose();await rejected
 assert.equal(f.requests.length,1);assert.equal(f.puts.length,1)
 const next=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256)
 await completeRead(f,next,{open:true});assert.equal(f.requests.length,2);assert.equal(f.puts.length,1)
})

test('a timeout on an older connection cannot discard a newer connection',async()=>{
 const f=fixture(),first=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256),rejected=assert.rejects(first,{code:'MIGRATION_TICKET'})
 f.requests[0].onsuccess();await Promise.resolve();await Promise.resolve();const oldTimeout=f.timers.find(Boolean),oldClose=f.db.onclose
 f.db.onclose()
 const second=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256)
 f.requests[1].onsuccess();await Promise.resolve();await Promise.resolve();oldTimeout();await rejected;oldClose()
 await completeRead(f,second)
 const third=f.store.getMarker(receipt.archiveSha256,receipt.deviceIdentitySha256)
 assert.equal(f.requests.length,2,'a stale timeout or close must not invalidate the newer open promise');await completeRead(f,third)
})
