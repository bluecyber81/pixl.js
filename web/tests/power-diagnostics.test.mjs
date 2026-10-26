import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePowerDiagnostics,normalizePowerDiagnostics} from '../src/lib/power-diagnostics.js';
import {createDiagnostics} from '../src/lib/device-info.js';
const packet=()=>{const b=new Uint8Array([80,88,80,68,1,16,31,0,0,0,0,0,0,0,180,0]);const v=new DataView(b.buffer);v.setUint32(8,0x10004,true);v.setUint16(12,4012,true);return b;};
test('power diagnostic parses exact16B, preserves unsigned raw bits and offset views',()=>{
 const b=packet(),p=parsePowerDiagnostics(b);assert.equal(p.resetReasonRaw,0x10004);assert.equal(p.batteryMillivolts,4012);assert.equal(p.configuredSleepSeconds,180);assert.equal(p.chargingActive,true);
 const prefixed=new Uint8Array(32);prefixed.set(b,5);assert.deepEqual(parsePowerDiagnostics(prefixed.subarray(5,21)),p);assert(Object.isFrozen(p));
 new DataView(b.buffer).setUint32(8,0xffffffff,true);assert.equal(parsePowerDiagnostics(b).resetReasonRaw,0xffffffff);
});
test('absent samples and zero resetbits remain unknown observations, not invented wake causes',()=>{
 const b=packet();b[6]=1;b.fill(0,8,16);const p=parsePowerDiagnostics(b);
 assert.equal(p.resetReasonRaw,0);assert.equal(p.batteryMillivolts,null);assert.equal(p.sampleCollected,false);assert.equal(p.chargingActive,false);
 b[6]=0;assert.equal(parsePowerDiagnostics(b).resetReasonRaw,null);
});
test('power parser rejects wrong sizes, magic, version, reserved bits and inconsistent sample flags',()=>{
 for(const n of [0,15,17,64])assert.throws(()=>parsePowerDiagnostics(new Uint8Array(n)));
 for(const [offset,value]of [[0,0],[3,0],[4,2],[5,15],[6,63],[7,1]]){const b=packet();b[offset]=value;assert.throws(()=>parsePowerDiagnostics(b));}
 for(const flags of [30,27,29]){const b=packet();b[6]=flags;assert.throws(()=>parsePowerDiagnostics(b));}
 const b=packet();b.fill(0,12,14);assert.throws(()=>parsePowerDiagnostics(b));
 for(const flags of [1,9,19,23]){const x=packet();x[6]=flags;if(!(flags&4))x.fill(0,12,14);assert.throws(()=>parsePowerDiagnostics(x));}
});
test('power diagnostic JSON export is allowlisted and rejects inconsistent objects',()=>{
 const p=parsePowerDiagnostics(packet());const report=createDiagnostics({power:{...p,path:'SECRET_PATH',address:'SECRET_ADDRESS'}});
 assert.deepEqual(report.power,p);assert.doesNotMatch(JSON.stringify(report),/SECRET/);
 for(const patch of [{schemaVersion:2},{resetReasonRaw:-1},{sampleCollected:false},{batteryMillivolts:65536},{configuredSleepSeconds:NaN},{chargingActive:1},{lipoMode:false},{voltageValid:false,batteryMillivolts:null}])assert.equal(normalizePowerDiagnostics({...p,...patch}),null);
 const unknown={...p,sampleCollected:false,voltageValid:false,batteryMillivolts:null,lipoMode:false,chargingActive:false,configuredSleepSeconds:0};assert(normalizePowerDiagnostics(unknown));
 for(const patch of [{configuredSleepSeconds:1},{lipoMode:true},{chargingActive:true}])assert.equal(normalizePowerDiagnostics({...unknown,...patch}),null);
 assert.equal(createDiagnostics({}).power,null);
});
