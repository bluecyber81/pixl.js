import test from 'node:test';
import assert from 'node:assert/strict';
import bootPacket from './boot-fixture.cjs';
import { parseBootDiagnostics, normalizeBootDiagnostics, formatHexWord } from '../src/lib/boot-diagnostics.js';
import { createDiagnostics } from '../src/lib/device-info.js';
const editWord=(bytes,offset,value)=>{new DataView(bytes.buffer).setUint32(offset,value,true);return bytes};

test('boot diagnostic schema decodes exact little-endian fields, version counters and region fingerprint',()=>{
  const result=parseBootDiagnostics(bootPacket());
  assert.equal(result.chipPart,0x52832);assert.equal(result.chipVariantRaw,0x41414230);
  assert.equal(result.softDeviceFwid,0x103);assert.equal(result.bootAddress,0x77000);
  assert.equal(result.applicationCounter,578);assert.equal(result.bootloaderCounter,7);
  assert.equal(result.bootAddressSource,'mbr');assert.equal(result.bootRegionBytes,0x7000);
  assert.equal(result.bootRegionSha256,'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  assert.equal(result.paramsLayoutKnown,true);assert.equal(Object.isFrozen(result),true);
  const prefixed=new Uint8Array(140);prefixed.set(bootPacket(),7);
  assert.deepEqual(parseBootDiagnostics(prefixed.subarray(7,135)),result);
});

test('boot diagnostic schema rejects lengths, magic, version, unknown flags, source and reserved bytes',()=>{
  for(const size of [0,111,112,127,129]) assert.throws(()=>parseBootDiagnostics(new Uint8Array(size)),/Invalid boot/);
  for(const offset of [0,1,2,3,4,5,7,38,39,124,125,126,127]) {
    const bytes=bootPacket();bytes[offset]=offset===5?3:offset===7?2:bytes[offset]^2;
    assert.throws(()=>parseBootDiagnostics(bytes),/Invalid boot/);
  }
});

test('boot diagnostic flags require their geometry, layout, vector and parameter checks',()=>{
  for(const clear of [1,4,8,128,256]) {
    const bytes=bootPacket(),view=new DataView(bytes.buffer);view.setUint16(6,view.getUint16(6,true)&~clear,true);
    assert.throws(()=>parseBootDiagnostics(bytes),/Invalid boot/);
  }
  for(const [offset,value] of [[8,0x52840],[16,1048576],[20,32768],[24,2048],[48,0x77004],
    [48,0x75000],[48,0x7e000],[52,0x7e000],[56,1],[72,123],[76,0x8000],[120,0x7d000]])
    assert.throws(()=>parseBootDiagnostics(editWord(bootPacket(),offset,value)),/Invalid boot/);
});

test('unknown geometry exposes only fixed register observations and no trusted flash fields',()=>{
  const bytes=new Uint8Array(128);bytes.set([80,88,66,68,1,0]);
  editWord(bytes,8,0x52840);editWord(bytes,16,1048576);editWord(bytes,20,262144);editWord(bytes,24,4096);
  editWord(bytes,40,0xffffffff);editWord(bytes,112,0xffffffff);
  const result=parseBootDiagnostics(bytes);
  assert.equal(result.geometryValid,false);assert.equal(result.bootloaderCounter,null);
  assert.equal(result.softDeviceFwid,null);assert.equal(result.bootAddress,null);
  assert.equal(result.settingsVersion,null);assert.equal(result.bootRegionSha256,null);
  for(const offset of [44,48,52,56,60,64,68,72,76,80,116,120]) {
    const wrong=bytes.slice();wrong[offset]=1;assert.throws(()=>parseBootDiagnostics(wrong),/Invalid boot/);
  }
});

test('untrusted settings do not acquire version counters and unsupported parameter layout suppresses hash',()=>{
  const bytes=bootPacket(),view=new DataView(bytes.buffer);
  view.setUint16(6,1|2|4|128,true);editWord(bytes,56,1);
  for(const offset of [60,64,72,76])editWord(bytes,offset,0);
  bytes.fill(0,80,112);editWord(bytes,116,0x7d000);editWord(bytes,120,0x7d000);
  const result=parseBootDiagnostics(bytes);
  assert.equal(result.settingsVersion,1);assert.equal(result.bootloaderCounter,null);
  assert.equal(result.calculatedSettingsCrc,null);assert.equal(result.bootRegionSha256,null);
  assert.equal(result.paramsLayoutKnown,false);assert.equal(result.effectiveParamsAddress,0x7d000);
});

test('counter uint32 boundaries are unsigned and the export excludes arbitrary fields',()=>{
  for(const counter of [0,0x80000000,0xffffffff]) {
    const source=parseBootDiagnostics(editWord(bootPacket(),64,counter));
    const report=createDiagnostics({boot:{...source,secret:'PRIVATE',memoryDump:'PRIVATE',address:'PRIVATE'}});
    assert.equal(report.boot.bootloaderCounter,counter);assert.doesNotMatch(JSON.stringify(report),/PRIVATE/);
    assert.deepEqual(report.boot,source);
  }
  const source=parseBootDiagnostics(bootPacket());
  for(const altered of [{flags:512},{bootAddressSource:'unknown'},{bootloaderCounter:-1},
    {bootRegionSha256:'not a hash'},{chipPart:Infinity},{softDeviceFwid:65536},{schemaVersion:2},
    {bootloaderCounter:null},{chipPart:null},{softDeviceFwid:null}])
    assert.equal(normalizeBootDiagnostics({...source,...altered}),null);
  assert.equal(formatHexWord(0xffffffff),'0xFFFFFFFF');assert.equal(formatHexWord(null),null);
  assert.equal(formatHexWord(-1),null);
});

test('invalid addresses retain the selected raw source without pretending it is validated',()=>{
  const bytes=bootPacket(),view=new DataView(bytes.buffer);
  view.setUint16(6,1|2|8|16|64|256,true);editWord(bytes,44,0x20000);editWord(bytes,48,0);editWord(bytes,76,0);bytes.fill(0,80,112);
  const result=parseBootDiagnostics(bytes);assert.equal(result.bootAddressSource,'mbr');assert.equal(result.bootAddress,null);
  assert.equal(result.mbrBootAddress,0x20000);assert.equal(result.bootHashValid,false);
});

test('source preference and non-erased address conflicts must match the observation flags',()=>{
  const wrongSource=bootPacket();wrongSource[5]=2;assert.throws(()=>parseBootDiagnostics(wrongSource));
  const conflict=editWord(bootPacket(),40,0x78000);assert.throws(()=>parseBootDiagnostics(conflict));
  new DataView(conflict.buffer).setUint16(6,0x1ff,true);assert.equal(parseBootDiagnostics(conflict).addressConflict,true);
  const fallback=editWord(bootPacket(),44,0xffffffff);fallback[5]=2;
  assert.equal(parseBootDiagnostics(fallback).bootAddressSource,'uicr');
});

test('erased CRC, unsupported SoftDevice metadata and flags on unsupported geometry are not trusted',()=>{
  const crc=editWord(editWord(bootPacket(),68,0xffffffff),72,0xffffffff);
  assert.throws(()=>parseBootDiagnostics(crc));
  for(const [offset,value] of [[28,999],[32,999999],[32,0xffffffff]])
    assert.throws(()=>parseBootDiagnostics(editWord(bootPacket(),offset,value)));
  for(const fwid of [0,65535]) {
    const bytes=bootPacket();new DataView(bytes.buffer).setUint16(36,fwid,true);
    assert.throws(()=>parseBootDiagnostics(bytes));
  }
  for(const flag of [2,64]) {
    const bytes=new Uint8Array(128);bytes.set([80,88,66,68,1,0,flag]);
    assert.throws(()=>parseBootDiagnostics(bytes));
  }
});
