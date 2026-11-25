'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
// The override is for an unchanged, preserved implementation as a regression
// control. No physical Bluetooth device or filesystem writes are used here.
const SecureDfu = require(process.env.SECURE_DFU_UNDER_TEST
  ? path.resolve(process.env.SECURE_DFU_UNDER_TEST)
  : '../public/dfu/secure-dfu.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const bytes = size => Uint8Array.from({length:size}, (_, i) => (i * 73 + (i >>> 8) + 9) & 255);
const INIT = bytes(20);
function crc(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit=0; bit<8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, event={}) { for (const fn of [...this.listeners.get(name) || []]) fn(event); }
  count() { return [...this.listeners.values()].reduce((total, list) => total+list.size, 0); }
}

// Deliberately separate browser write completion from peripheral consumption.
// A browser may complete Write Without Response when the local stack accepts
// bytes, while a slow receiver has only a small finite pool available. The old
// PRN=0 transport exhausts this pool; this model does not invent retries or
// automatically wait for receipt on behalf of the transport being tested.
function bootloader(image, options={}) {
  const device = new Events(), control = new Events(), packet = new Events();
  const state = {
    selected:1, init:[], firmware:[], commands:[], creates:[], executes:[],
    packets:[], receipts:[], dropped:0, maxBuffered:0, buffered:0,
    pendingWrites:0, overlap:false, prn:0, prnCount:0, disconnected:false,
    firmwarePacketCount:0, receiptBeforeSettlement:0, receiptAfterSettlement:0,
  };
  const timers = new Set();
  const schedule = fn => {
    // A separate task is slower than a resolved local enqueue promise without
    // adding Windows' coarse timer quantum to every simulated peripheral step.
    const timer = setImmediate(() => { timers.delete(timer); fn(); });
    timers.add(timer);
  };
  const dataFor = type => type===1 ? state.init : state.firmware;
  const reply = (op, payload=[]) => {
    if (!device.gatt.connected) return;
    // Include an unrelated prefix to ensure DataView offsets remain honoured.
    const frame=Uint8Array.from([9,8,7,0x60,op,1,...payload,6,5]);
    control.value=new DataView(frame.buffer,3,frame.length-5);
    control.emit('characteristicvaluechanged', {target:control});
  };
  const checksum = (type, packetRecord) => {
    const data=dataFor(type), result=new Uint8Array(8), view=new DataView(result.buffer);
    const badOffset=packetRecord && type===2 && packetRecord.firmwareIndex===options.badOffsetAt;
    view.setUint32(0, data.length-(badOffset ? 1 : 0), true);
    view.setUint32(4, crc(data) ^ (type===1 && options.badInitChecksum ? 1 : 0), true);
    if (packetRecord && type===2 && packetRecord.firmwareIndex===options.shortReceiptAt) return result.slice(0,4);
    return result;
  };
  const consume = record => {
    if (!device.gatt.connected) return;
    state.buffered--;
    if (record.type===2 && record.firmwareIndex===options.damageAt) record.data[0]^=0x80;
    dataFor(record.type).push(...record.data);
    if (record.type===2 && record.firmwareIndex===options.disconnectAt) {
      device.gatt.disconnect();
      return;
    }
    state.prnCount++;
    if (state.prn && state.prnCount>=state.prn) {
      state.prnCount=0;
      if (!(record.type===2 && record.firmwareIndex===options.missingReceiptAt)) {
        state.receipts.push({type:record.type, offset:dataFor(record.type).length});
        if (record.writeSettled) state.receiptAfterSettlement++;
        else state.receiptBeforeSettlement++;
        reply(3, checksum(record.type,record));
      }
    }
  };
  control.uuid='8ec90001-f315-4f60-9fb8-838830daea50';
  packet.uuid='8ec90002-f315-4f60-9fb8-838830daea50';
  control.properties={notify:true, write:true};
  packet.properties={write:false, writeWithoutResponse:true};
  control.startNotifications=async()=>control;
  control.writeValueWithResponse=async value => {
    if (state.pendingWrites) state.overlap=true;
    state.pendingWrites++;
    try {
      const v=new DataView(value.buffer,value.byteOffset,value.byteLength), op=v.getUint8(0);
      state.commands.push([...value]);
      if (op===2) {
        state.prn=v.getUint16(1,true); state.prnCount=0; reply(op);
      } else if (op===6) {
        state.selected=v.getUint8(1);
        const result=new Uint8Array(12), view=new DataView(result.buffer), data=dataFor(state.selected);
        view.setUint32(0,4096,true); view.setUint32(4,data.length,true); view.setUint32(8,crc(data),true);
        reply(op,result);
      } else if (op===1) {
        state.selected=v.getUint8(1);
        if (state.selected===1) state.init=[];
        state.creates.push({type:state.selected, size:v.getUint32(2,true)});
        reply(op);
      } else if (op===3) {
        // Reproduce a disconnect while the browser is still processing this
        // checksum write. The test releases the outstanding write explicitly.
        if (state.consumeDuringChecksum) {
          state.consumeDuringChecksum();
          state.consumeDuringChecksum=null;
          await options.holdDisconnectedWrite();
        }
        // Let buffered data reach the receiver before its explicit checksum;
        // dropped packets remain dropped and therefore cause a real mismatch.
        while (state.buffered && device.gatt.connected) await wait(1);
        if (!(state.selected===2 && options.missingChecksumAt===state.firmwarePacketCount)) reply(op,checksum(state.selected));
      } else if (op===4) {
        state.executes.push({type:state.selected, offset:dataFor(state.selected).length});
        const final=state.selected===2 && state.firmware.length===image.length;
        if (final && options.finalAckMissing) device.gatt.disconnect();
        else { reply(op); if (final) device.gatt.disconnect(); }
      } else throw new Error('Unexpected command in test peripheral: '+op);
    } finally { state.pendingWrites--; }
  };
  packet.writeValueWithoutResponse=async value => {
    if (state.pendingWrites) state.overlap=true;
    state.pendingWrites++;
    const type=state.selected;
    const record={type, data:[...value], writeSettled:false,
      firmwareIndex:type===2 ? ++state.firmwarePacketCount : 0};
    state.packets.push(record);
    try {
      assert.ok(value.length>0);
      const limit=(type===2 ? options.firmwareMaxWrite : null) ?? options.maxWrite ?? 20;
      if(value.length>limit){
        switch(options.oversize){
          case 'truncate': record.data.length=limit;break;
          case 'drop': return;
          case 'reject': throw new Error('Host rejected packet length');
          default: assert.fail('packet exceeds the model ATT payload');
        }
      }
      if (state.buffered>=(options.capacity ?? 2)) state.dropped++;
      else {
        state.buffered++; state.maxBuffered=Math.max(state.maxBuffered,state.buffered);
        if (record.type===2 && options.holdDisconnectedWrite && record.firmwareIndex===options.disconnectAt) {
          state.consumeDuringChecksum=()=>consume(record);
        } else if (options.receiptOrder==='before-write' || options.receiptOrder==='synchronous') consume(record);
        else schedule(()=>consume(record));
      }
      options.onPacket?.(record,state);
      if (options.receiptOrder==='before-write') await new Promise(resolve=>setImmediate(resolve));
      if(type===1 && value.length>20 && options.rejectAcceptedInit)throw new Error('Host failed after init write');
    } finally { record.writeSettled=true; state.pendingWrites--; }
  };
  // Intentionally do not provide writeValue: this exercises characteristic
  // capability selection rather than the deprecated write-method fallback.
  const server={getPrimaryService:async service=>{
    assert.equal(service,0xfe59);
    return {getCharacteristics:async()=>[control,packet]};
  }};
  device.gatt={connected:false,
    connect:async()=>{device.gatt.connected=true;return server;},
    disconnect:()=>{
      if (!device.gatt.connected) return;
      device.gatt.connected=false;state.disconnected=true;
      for (const timer of timers) clearImmediate(timer);
      timers.clear();state.buffered=0;
      device.emit('gattserverdisconnected');
    },
  };
  return {device,control,packet,state};
}
const vendorCrc = require('../public/dfu/vendor/crc32.js').buf;
function client(options={}) { return new SecureDfu(crc,{},0,{extendCrc32:vendorCrc,timeouts:{operation:120,gatt:120,reboot:5},...options}); }

test('each application byte is hashed once across object checks, including a resumed prefix',()=>{
  const image=bytes(363752), other=image.slice();
  let hashed=0;
  function hash(part,seed){hashed+=part.length;return vendorCrc(part,seed);}
  const d=new SecureDfu(hash,{},0,{extendCrc32:hash});
  for(const end of [77,4096,8192,image.length])assert.equal(d._prefixCrc(image,end),crc(image.subarray(0,end)));
  assert.equal(hashed,image.length);
  other[0]^=1;
  assert.equal(d._prefixCrc(other,123),crc(other.subarray(0,123)));
  assert.equal(d._prefixCrc(other,12),crc(other.subarray(0,12)));
  assert.equal(hashed,image.length+135);
  d._cleanup();
  assert.equal(d._prefix,null);
});
function clean(p,d) {
  assert.equal(p.device.count()+p.control.count(),0,'listeners must be removed');
  assert.equal(d._pending,null,'no response waiter may survive completion');
  assert.equal(p.device.gatt.connected,false);
}

test('bounded slow receiver: complete 32 KiB plus tail, 4096-byte objects, no queue overflow',async()=>{
  const image=bytes(8*4096+97), p=bootloader(image), d=client();
  await d.update(p.device,INIT,image);
  assert.deepEqual(p.state.firmware,[...image]);
  assert.deepEqual(p.state.commands[0],[2,1,0],'one packet receipt must be enabled');
  assert.equal(p.state.dropped,0);
  assert.equal(p.state.maxBuffered,1,'only one unconsumed packet may be outstanding');
  assert.equal(p.state.overlap,false);
  assert.deepEqual(p.state.creates.filter(x=>x.type===2).map(x=>x.size),[...Array(8).fill(4096),97]);
  assert.equal(p.state.receipts.length,p.state.packets.length);
  assert.equal(p.state.executes.length,10);
  assert.deepEqual(d.lastResult,{resultSchema:2,transferVerified:true,executeAcknowledged:true,disconnectObserved:true,localDisconnectRequested:false,rebootObserved:false});
  clean(p,d);
});

for (const receiptOrder of ['before-write','after-write']) test(`packet receipt ${receiptOrder} settles safely across a full object boundary`,async()=>{
  const image=bytes(4096+53), init=bytes(41), p=bootloader(image,{receiptOrder}), d=client();
  await d.update(p.device,init,image);
  assert.deepEqual(p.state.init,[...init]);assert.deepEqual(p.state.firmware,[...image]);
  assert.equal(p.state.overlap,false,'receipt alone must not start a second GATT operation');
  assert.equal(p.state.receipts.length,p.state.packets.length);
  assert.ok(receiptOrder==='before-write' ? p.state.receiptBeforeSettlement>0 : p.state.receiptAfterSettlement>0);
  clean(p,d);
});

test('missing packet receipt stops at that packet and never executes firmware',async()=>{
  const image=bytes(100),p=bootloader(image,{missingReceiptAt:1}),d=client();
  await assert.rejects(d.update(p.device,INIT,image),/timed out/i);
  assert.equal(p.state.firmwarePacketCount,1);assert.equal(d.lastResult,null);
  assert.equal(p.state.executes.filter(x=>x.type===2).length,0);clean(p,d);
});

test('wrong packet receipt offset stops with expected and received offsets',async()=>{
  const image=bytes(100),p=bootloader(image,{badOffsetAt:1}),d=client();
  await assert.rejects(d.update(p.device,INIT,image),error=>{
    assert.match(error.message,/offset mismatch/i);
    assert.match(error.message,/20/);assert.match(error.message,/19/);
    return true;
  });
  assert.equal(p.state.firmwarePacketCount,1);assert.equal(d.lastResult,null);clean(p,d);
});

test('truncated packet receipt is rejected without sending a second packet',async()=>{
  const image=bytes(100),p=bootloader(image,{shortReceiptAt:1}),d=client();
  await assert.rejects(d.update(p.device,INIT,image),/length|truncated/i);
  assert.equal(p.state.firmwarePacketCount,1);assert.equal(d.lastResult,null);clean(p,d);
});

test('object CRC remains mandatory even when every packet offset is correct',async()=>{
  const image=bytes(4096+31),p=bootloader(image,{damageAt:1}),d=client();
  await assert.rejects(d.update(p.device,INIT,image),/CRC32 mismatch/i);
  assert.equal(p.state.firmware.length,4096);
  assert.equal(p.state.executes.filter(x=>x.type===2).length,0);assert.equal(d.lastResult,null);clean(p,d);
});

test('disconnect while waiting for a packet receipt never reports success',async()=>{
  const image=bytes(100),p=bootloader(image,{disconnectAt:1}),d=client();
  await assert.rejects(d.update(p.device,INIT,image),/disconnect/i);
  assert.equal(p.state.firmwarePacketCount,1);assert.equal(d.lastResult,null);clean(p,d);
});

test('reconnect after loss of a receipt resumes from the device CRC and offset across a 4096-byte object',async()=>{
  const image=bytes(4096+53);
  // 205 packets complete the first object. The device consumes 20 more bytes
  // of the next object and drops the link before the browser gets its receipt.
  const p=bootloader(image,{disconnectAt:206}), first=client(), second=client();
  const before=[], after=[];
  first.addEventListener('progress',e=>{if(e.object==='firmware')before.push(e.currentBytes);});
  await assert.rejects(first.update(p.device,INIT,image),/disconnect/i);
  assert.equal(before.at(-1),4096);
  assert.equal(p.state.firmware.length,4116);
  assert.equal(first.lastResult,null);
  clean(p,first);

  const packetsBeforeResume=p.state.packets.length;
  second.addEventListener('progress',e=>{if(e.object==='firmware')after.push(e.currentBytes);});
  await second.update(p.device,INIT,image);
  assert.equal(after[0],4116);
  assert.deepEqual(p.state.packets.slice(packetsBeforeResume).flatMap(record=>record.data),[...image.slice(4116)]);
  assert.deepEqual(p.state.executes.filter(record=>record.type===2).map(record=>record.offset),[4096,image.length]);
  assert.deepEqual(p.state.firmware,[...image]);
  assert.equal(second.lastResult.executeAcknowledged,true);
  clean(p,second);
});

test('cancel while waiting for a packet receipt prevents further writes',async()=>{
  const image=bytes(100),d=client();
  const p=bootloader(image,{missingReceiptAt:1,onPacket:record=>{
    if (record.type===2 && record.firmwareIndex===1) queueMicrotask(()=>d.cancel());
  }});
  await assert.rejects(d.update(p.device,INIT,image),/cancel/i);
  await wait(3);
  assert.equal(p.state.firmwarePacketCount,1);assert.equal(d.lastResult,null);clean(p,d);
});

test('complete transfer without final Execute ACK cannot succeed',async()=>{
  const image=bytes(53),p=bootloader(image,{finalAckMissing:true}),d=client();
  await assert.rejects(d.update(p.device,INIT,image),/disconnect/i);
  assert.deepEqual(p.state.firmware,[...image]);assert.equal(d.lastResult,null);clean(p,d);
});

test('zero configured delay still yields browser tasks between synchronous packet receipts',async()=>{
  let yielded=false, secondPacketSawYield=false;
  const image=bytes(61),p=bootloader(image,{receiptOrder:'synchronous',onPacket:record=>{
    if (record.type!==2) return;
    if (record.firmwareIndex===1) setTimeout(()=>{yielded=true;},0);
    if (record.firmwareIndex===2) secondPacketSawYield=yielded;
  }}),d=client();
  await d.update(p.device,INIT,image);
  assert.equal(secondPacketSawYield,true,'resolved write promises must not starve browser tasks');
  assert.equal(p.state.overlap,false);clean(p,d);
});

test('a fresh accepted 142-byte signed-init-sized write enables verified larger writes across object boundaries',async()=>{
  const init=bytes(142), image=bytes(2*4096+71);
  const p=bootloader(image,{maxWrite:244,capacity:1}), d=client({probeInitPacket:true});
  await d.update(p.device,init,image);
  assert.equal(p.state.firmwarePacketCount,2*Math.ceil(4096/142)+1);
  assert.equal(p.state.commands.filter(command=>command[0]===3).length,1+p.state.firmwarePacketCount);
  assert.deepEqual(p.state.firmware,[...image]);assert.deepEqual(p.state.init,[...init]);
  assert.equal(p.state.maxBuffered,1);assert.equal(p.state.overlap,false);
  assert.equal(p.state.dropped,0);assert.equal(d.lastResult.executeAcknowledged,true);clean(p,d);
});

for(const oversize of ['truncate','drop','reject'])test('20-byte peer keeps confirmed firmware transfers after init '+oversize,async()=>{
  const image=bytes(207),init=bytes(142);
  const p=bootloader(image,{oversize}),d=client({probeInitPacket:true});
  await d.update(p.device,init,image);
  assert.equal(p.state.firmwarePacketCount,Math.ceil(image.length/20));
  assert.equal(p.state.creates.filter(item=>item.type===1).length,2);
  assert.equal(p.state.receipts.filter(item=>item.type===2).length,p.state.firmwarePacketCount);
  assert.deepEqual(p.state.firmware,[...image]);assert.deepEqual(p.state.init,[...init]);
  assert.equal(p.state.maxBuffered,1);assert.equal(p.state.overlap,false);clean(p,d);
});

test('wrong init checksum aborts before any firmware write, Execute or retry',async()=>{
  const image=bytes(301),p=bootloader(image,{maxWrite:244,badInitChecksum:true}),d=client({probeInitPacket:true});
  await assert.rejects(d.update(p.device,bytes(142),image),/CRC32 mismatch/);
  assert.equal(p.state.creates.length,1);assert.equal(p.state.executes.length,0);
  assert.equal(p.state.packets.length,1);assert.equal(d.lastResult,null);clean(p,d);
});

test('a host error after accepting a long init packet recreates only the confirmed command object',async()=>{
  const init=bytes(142),image=bytes(301),p=bootloader(image,{maxWrite:244,rejectAcceptedInit:true});
  const d=client({probeInitPacket:true});
  await d.update(p.device,init,image);
  assert.deepEqual(p.state.init,[...init]);assert.deepEqual(p.state.firmware,[...image]);
  assert.equal(p.state.creates.filter(item=>item.type===1).length,2);
  assert.equal(p.state.firmwarePacketCount,Math.ceil(image.length/20));
  assert.equal(p.state.maxBuffered,1);clean(p,d);
});

test('data truncated below a previously measured length aborts at the first verified offset without replay',async()=>{
  const image=bytes(301),p=bootloader(image,{maxWrite:244,firmwareMaxWrite:20,oversize:'truncate'});
  const d=client({probeInitPacket:true});
  await assert.rejects(d.update(p.device,bytes(142),image),error=>error.expectedOffset===142 && error.receivedOffset===20);
  assert.equal(p.state.firmwarePacketCount,1);assert.equal(p.state.executes.filter(item=>item.type===2).length,0);
  assert.equal(d.lastResult,null);clean(p,d);
});

for(const [failure,pattern] of [[{missingChecksumAt:2},/timed out/],[{damageAt:2},/CRC32 mismatch/]]){
  test('larger data writes stop on '+Object.keys(failure)[0]+' without replay or Execute',async()=>{
    const image=bytes(600),p=bootloader(image,{maxWrite:244,...failure}),d=client({probeInitPacket:true});
    await assert.rejects(d.update(p.device,bytes(142),image),pattern);
    assert.equal(p.state.firmwarePacketCount,2);assert.equal(p.state.executes.filter(item=>item.type===2).length,0);
    assert.equal(d.lastResult,null);clean(p,d);
  });
}

test('interrupted large write resumes using the CRC-confirmed prefix and the new connection starts at 20 bytes',async()=>{
  const image=bytes(4096+350),init=bytes(142);
  const entered=Promise.withResolvers(),release=Promise.withResolvers();
  const p=bootloader(image,{maxWrite:244,disconnectAt:30,holdDisconnectedWrite(){
    entered.resolve();return release.promise;
  }});
  const options={probeInitPacket:true,timeouts:{operation:5000,gatt:5000,reboot:5}};
  const first=assert.rejects(client(options).update(p.device,init,image),/disconnect|ended/);
  await entered.promise;
  try{
    // Give all notification rejection handlers a turn with the original
    // platform promise deliberately unresolved. The device is disconnected.
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(p.device.gatt.connected,false);assert.equal(p.state.pendingWrites,1);
    await assert.rejects(client(options).update(p.device,init,image),/active DFU session/);
  }finally{release.resolve();}
  await first;
  const count=p.state.packets.length,offset=p.state.firmware.length;
  assert.equal(offset,4096+142);
  await client(options).update(p.device,init,image);
  const remainder=p.state.packets.slice(count);
  assert.ok(remainder.every(packet=>packet.type===2&&packet.data.length<=20));
  assert.deepEqual(remainder.flatMap(packet=>packet.data),[...image.slice(offset)]);
  assert.deepEqual(p.state.firmware,[...image]);assert.equal(p.state.overlap,false);
});
