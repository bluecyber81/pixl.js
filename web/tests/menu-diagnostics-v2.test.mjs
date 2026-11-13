import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMenuDiagnostics, normalizeMenuDiagnostics, supportsMenuDiagnostics} from '../src/lib/device-extra-diagnostics.js';
import {collectDiagnosticSnapshot, createCombinedDiagnosticReport} from '../src/lib/diagnostic-snapshot.js';
import {supportsDisplayPhoto} from '../src/lib/display-photo.js';

// Synthetic exact-wire fixture, independently spelled out from mui_nav_diag.c:
// this is not a captured device packet or a physical LCD observation.
const packet=()=>Uint8Array.from(Buffer.from('50584d4902200f03010101002a00000078563412f0debc9affff080808080308','hex'));
const returnData={sourceContext:0x12345678,targetContext:0x9abcdef0,staleEventsDiscarded:65535,
  sourceAppId:8,targetAppId:8,firstLabelAppId:8,lastLabelAppId:8,firstIconAppId:3,lastIconAppId:8};

test('PXMI v2 maps all32wire bytes while retaining first launch separately from latest return',()=>{
  const data=parseMenuDiagnostics(packet());
  assert.equal(data.schemaVersion,2); assert.equal(data.scope,'first-menu-launch-and-last-app-return');
  assert.equal(data.targetAppId,3); assert.equal(data.launchCallMilliseconds,42);
  assert.deepEqual(data.lastAppReturn,returnData); assert(Object.isFrozen(data.lastAppReturn));
  const padded=new Uint8Array(50);padded.set(packet(),7);
  assert.deepEqual(parseMenuDiagnostics(padded.subarray(7,39)),data);
  assert.deepEqual(parseMenuDiagnostics(packet().buffer),data);
  assert.deepEqual(normalizeMenuDiagnostics({...data,lastAppReturn:{...data.lastAppReturn,uid:'SECRET'},filename:'SECRET'}),data);
});

test('v2 distinguishes no app return, no draw yet and no icon covering the menu center',()=>{
  const initial=packet();initial.fill(0,16);
  assert.equal(parseMenuDiagnostics(initial).lastAppReturn,null);
  const pending=packet();pending.fill(0,28);
  assert.deepEqual(parseMenuDiagnostics(pending).lastAppReturn,{...returnData,firstLabelAppId:null,lastLabelAppId:null,firstIconAppId:null,lastIconAppId:null});
  const noIcon=packet();noIcon[30]=noIcon[31]=0;
  assert.equal(parseMenuDiagnostics(noIcon).lastAppReturn.firstIconAppId,null);
  const v1=packet().slice(0,16);v1[4]=1;v1[5]=16;
  const legacy=parseMenuDiagnostics(v1);
  assert.equal(legacy.schemaVersion,1);assert.equal(Object.hasOwn(legacy,'lastAppReturn'),false);
});

test('exact lengths, versions, magic, flags, reserved bytes and return-state consistency are enforced',()=>{
  for(const length of [0,15,16,17,31,33,104]){
    const bytes=new Uint8Array(length);bytes.set(packet().slice(0,length));
    assert.throws(()=>parseMenuDiagnostics(bytes));
  }
  for(const [offset,value] of [[0,0],[1,0],[2,0],[3,0],[4,0],[4,1],[4,3],[5,16],[5,31],[5,33],[6,64],[6,128],[11,1],[26,0],[28,0],[29,0]]) {
    const bytes=packet();bytes[offset]=value;assert.throws(()=>parseMenuDiagnostics(bytes),`${offset}/${value}`);
  }
  for(const start of [16,20]){const bytes=packet();bytes.fill(0,start,start+4);assert.throws(()=>parseMenuDiagnostics(bytes));}
  const valid=parseMenuDiagnostics(packet());
  for(const change of [{sourceContext:-1},{sourceContext:0},{sourceContext:0x100000000},{targetContext:NaN},
    {staleEventsDiscarded:65536},{staleEventsDiscarded:-1},{sourceAppId:0},{sourceAppId:256},{firstIconAppId:0}])
    assert.equal(normalizeMenuDiagnostics({...valid,lastAppReturn:{...returnData,...change}}),null);
  assert.equal(normalizeMenuDiagnostics({...valid,lastAppReturn:undefined}),null);
  assert.equal(normalizeMenuDiagnostics({...valid,scope:'physical-display-proof'}),null);
});

test('v2 return survives a bounded diagnostic export without unrelated/private fields',async()=>{
  const data=parseMenuDiagnostics(packet()), now=()=>new Date(0).toISOString();
  const snapshot=await collectDiagnosticSnapshot({readers:{menu:()=>({...data,lastAppReturn:{...returnData,private:'SECRET'}})},now});
  const report=createCombinedDiagnosticReport({snapshot});
  assert.deepEqual(report.diagnosticSnapshot.sections.menu.data.lastAppReturn,returnData);
  assert.equal(report.diagnosticSnapshot.sections.menu.data.targetAppId,3);
  assert.doesNotMatch(JSON.stringify(report),/SECRET/);
  assert.match(report.limitations.join(' '),/latest completed app return/);
  assert.match(report.limitations.join(' '),/not a physical LCD pixel/);
});

test('late v2 read cannot complete or export a snapshot after session invalidation',async()=>{
  let finish,current=true;const gate=new Promise(resolve=>finish=resolve);
  const progress=[];const read=collectDiagnosticSnapshot({readers:{menu:()=>gate},isCurrent:()=>current,onProgress:item=>progress.push(item)});
  await Promise.resolve();current=false;finish(parseMenuDiagnostics(packet()));
  await assert.rejects(read,{code:'DIAGNOSTIC_STALE'});
  assert.equal(progress.some(item=>item.key==='menu'),false);
});

test('only the exact known test build joins stable firmware read capability gates',()=>{
  for(const version of ['2.22.0-DE3.70','2.22.0-DE3.71','2.22.0-DE3.71t1']) assert(supportsMenuDiagnostics(version));
  assert(supportsDisplayPhoto('2.22.0-DE3.71t1'));
  for(const version of ['2.22.0-DE3.69','2.22.0-DE3.71t2','2.22.0-DE3.71-T1','2.22.0-DE3.71dev','2.27.0',''])
    assert.equal(supportsMenuDiagnostics(version),false);
});

// Captured output from the actual ARM snapshot functions in the independently
// ELF/BIN-bound App643 and candidate comparison, with IRQ entry/exit stubbed.
// Provenance: candidate_build/source_binding/pxmi_arm_pair.json. This is not BLE hardware.
test('decoder agrees with the independently executed App643/candidate ARM snapshot bytes',()=>{
  const actual=Uint8Array.from(Buffer.from('50584d49022001000101010000000000feffffffffffffff0200080808030803','hex'));
  const value=parseMenuDiagnostics(actual);
  assert.equal(value.menuEntered,true);assert.equal(value.selectionAttempted,false);
  assert.deepEqual(value.centerCounts,{press:1,release:1,short:1});
  assert.deepEqual(value.lastAppReturn,{sourceContext:0xfffffffe,targetContext:0xffffffff,staleEventsDiscarded:2,
    sourceAppId:8,targetAppId:8,firstLabelAppId:8,lastLabelAppId:3,firstIconAppId:8,lastIconAppId:3});
});
