// Synthetic visual/renderer fixture only; no Bluetooth, files or network reads.
import { parseBootDiagnostics } from '../../src/lib/boot-diagnostics.js';
export function diagnosticSnapshot() {
  const at = '2026-11-03T18:04:05.000Z';
  const bootBytes = new Uint8Array(128), bootView = new DataView(bootBytes.buffer);
  bootBytes.set([80,88,66,68,1,1]); bootView.setUint16(6,0x1bf,true);
  for (const [offset,value] of [[8,0x52832],[12,0x41414230],[16,524288],[20,65536],[24,4096],
    [28,112],[32,7003000],[40,0x77000],[44,0x77000],[48,0x77000],[52,0x7f000],[56,2],
    [60,628],[64,11],[68,0x12345678],[72,0x12345678],[76,0x7000],[112,0x7e000],[116,0x7e000],[120,0x7e000]]) bootView.setUint32(offset,value,true);
  bootView.setUint16(36,0x126,true); bootBytes.set(Array.from({length:32},(_,index)=>index),80);
  const event = (n=0) => ({press:n,release:n,short:n,long:0,repeat:0});
  const data = {
    runtime: {schemaVersion:1,scope:'since-device-restart',disconnects:2,queueOverflows:0,timeouts:0,allocationFailures:0,
      lastLocalBleCause:0,lastHciReason:22,lastVfsCommand:null,lastVfsError:null,heapPoolBytes:18432,heapFreeBytes:10668,
      largestFreeBlockBytes:10560,sampledMinFreeBytes:9968,sampledMinLargestBlockBytes:9728,maxAllocatedPayloadBytes:5260,
      stackReservedBytes:8192,stackMinFreeBytes:null,memorySamples:15,vfsErrors:0},
    boot: parseBootDiagnostics(bootBytes),
    power: {schemaVersion:1,scope:'application-start-and-cached-battery',resetCaptured:true,resetReasonRaw:65536,
      sampleCollected:true,voltageValid:true,batteryMillivolts:4123,lipoMode:true,chargingActive:false,configuredSleepSeconds:180},
    startup: {schemaVersion:1,scope:'application-storage-start-to-first-dispatch',phaseMask:63,elapsedMilliseconds:[0,2218,2240,2294,2294,2312]},
    drives: [{label:'E',status:0,totalBytes:1921024,freeBytes:610304}],
    storage: {info:{schema:1,drive:'E',backend:3,mounted:true,flags:15,metaLen:128,pathMax:64,nameMax:48},
      layout:{schema:1,drive:'E',backend:3,mounted:true,magic:0x31534650,flashBytes:1921024,blockSize:4096,blockCount:469,
        readSize:16,progSize:16,cacheSize:256,metadataBytes:128,shardTarget:32768,maxShards:64,pathCap:64,nameCap:48,
        maxHandles:4,flags:7,engineSha256:'2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248'}},
    mtu: {schemaVersion:1,scope:'firmware-gatt-snapshot',sessionReady:true,fileMode:true,transferIdle:true,
      effectiveAttMtu:250,nextConnectionAttMtu:250,configuredMaxAttMtu:250,gattValueCapacity:247},
    ui: {schemaVersion:1,scope:'last-settings-session',active:false,sessions:2,
      rawEvents:{left:event(2),center:event(8),right:event(3)},centerPosted:event(8),centerDropped:event(),centerDelivered:event(8),
      queueHighWater:2,shortAttempt:{selection:17,saveResult:0,count:3,focus:17,stage:6},
      longAttempt:{selection:0,saveResult:null,count:0,focus:0,stage:0}},
  };
  return {schemaVersion:1,startedAt:'2026-11-03T18:04:00.000Z',completedAt:at,
    sections:Object.fromEntries(Object.entries(data).map(([key,value])=>[key,{state:'available',observedAt:at,data:value,errorCode:null}]))};
}
