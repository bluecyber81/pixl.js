import test from 'node:test';
import {readFileSync} from 'node:fs';
import {collectDiagnosticSnapshot} from '../src/lib/diagnostic-snapshot.js';
import assert from 'node:assert/strict';
import {parseBuildDiagnostics,normalizeBuildDiagnostics,buildDiagnosticBoard} from '../src/lib/lcd-build-diagnostics.js';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';

const id = '1234567890abcdef'.repeat(4);
function reply(kind=0,sdkId=0,pc=0) {
  const b = new Uint8Array(80), v = new DataView(b.buffer);
  b.set([80,88,66,73,1,80,1,kind]);
  b.set(new TextEncoder().encode(id),8);
  v.setUint32(72,sdkId,true);
  v.setUint32(76,pc,true);
  return b;
}
test('PXBI returns a declared board and source, and preserves each supported prior-fault kind',()=>{
  for (const [kind,i,p,expected] of [
    [0,0,0,null], [1,0,0,{kind:'nordic-sdk',sdkId:0,pc:null}],
    [1,0xffffffff,0x7ffff,{kind:'nordic-sdk',sdkId:0xffffffff,pc:0x7ffff}],
    [2,0,0,{kind:'hardfault',sdkId:null,pc:null}], [3,0,0,{kind:'libc-exit',sdkId:null,pc:null}]
  ]) {
    const slab = new Uint8Array(97); slab.set(reply(kind,i,p),11);
    const data = parseBuildDiagnostics(slab.subarray(11,91));
    assert.deepEqual(data,{schemaVersion:1,board:'LCD',sourceId:id,previousFault:expected});
    assert.deepEqual(normalizeBuildDiagnostics(data),data);
  }
});
test('PXBI rejects truncation, suffix bytes, bad schema, board, kind, noncanonical IDs and invalid fault details',()=>{
  for (const [index,value] of [[0,1],[4,2],[5,79],[6,3],[7,4],[8,65],[8,0]]) {
    const b=reply(); b[index]=value;
    assert.throws(()=>parseBuildDiagnostics(b),{code:'RESPONSE_INVALID'});
  }
  for(const b of [reply().slice(0,79),new Uint8Array(81),reply(1,1,0x80000),reply(0,1),reply(2,0,1),reply(3,1)]) {
    assert.throws(()=>parseBuildDiagnostics(b),{code:'RESPONSE_INVALID'});
  }
});
test('reported source and board stay independent of the application image hash and outdated versions',()=>{
  const build=parseBuildDiagnostics(reply(1,2,3));
  const identity=diagnosticBuildIdentity({firmwareVersion:'2.22.0-DE3.84', build});
  assert.equal(identity.observed.sourceId,id);assert.equal(identity.observed.compiledBoard,'LCD');
  assert.equal(identity.observed.applicationBinSha256,null);assert.equal(identity.applicationHashVerified,false);
  assert.equal(identity.samePhysicalDeviceVerified,false);
  for (const build of [null,{}, {schemaVersion:1,board:'OLED',sourceId:id,previousFault:null}]) {
    assert.equal(diagnosticBuildIdentity({firmwareVersion:'2.22.0-DE3.84',build}).observed.sourceId,null);
  }
  assert.equal(diagnosticBuildIdentity({firmwareVersion:'2.22.0-DE3.83',build}).observed.sourceId,null);
});

test('OLED PXBI validates both board identities and gates exact supported firmware versions',()=>{
  const bytes=reply(); bytes[6]=2;
  const oled=parseBuildDiagnostics(bytes,'OLED');
  assert.equal(oled.board,'OLED');
  assert.throws(()=>parseBuildDiagnostics(bytes,'LCD'),{code:'RESPONSE_INVALID'});
  assert.throws(()=>parseBuildDiagnostics(reply(),'OLED'),{code:'RESPONSE_INVALID'});
  assert.equal(normalizeBuildDiagnostics(oled,'LCD'),null);
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.84-OLEDt4'),'OLED');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.84'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.85'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.86'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.87'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.88'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.93'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.94'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.95'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.96'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.97'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.98'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.99'),'LCD');
  assert.equal(buildDiagnosticBoard('2.22.0-DE3.100'),'LCD');
  for(const version of ['2.22.0-DE3.81-OLEDt3','2.22.0-DE3.84-OLEDt5','2.22.0-DE3.86-OLEDt6',
    '2.22.0-DE3.83','2.22.0-DE3.90','2.22.0-DE3.101','2.22.0-DE3.85t1',null]) {
    assert.equal(buildDiagnosticBoard(version),null);
  }
  const identity=diagnosticBuildIdentity({firmwareVersion:'2.22.0-DE3.84-OLEDt4',build:oled});
  assert.equal(identity.observed.sourceId,id);
  assert.equal(identity.observed.compiledBoard,'OLED');
  assert.equal(identity.applicationHashVerified,false);
});

for (const [fixture,version,counter,board] of [
  ['PXBI_App657.json','2.22.0-DE3.84',657,'LCD'],
  ['PXBI_App658.json','2.22.0-DE3.85',658,'LCD'],
  ['PXBI_OLED_App84.json','2.22.0-DE3.84-OLEDt4',84,'OLED']
]) test(`five PXBI replies from linked Cortex-M4 ${board} App${counter} agree with the firmware declarations`,()=>{
  const capture=JSON.parse(readFileSync(new URL('./fixtures/'+fixture,import.meta.url),'utf8'));
  const cases=new Map(capture.states.map(x=>[x.scenario,parseBuildDiagnostics(Buffer.from(x.payloadHex,'hex'))]));
  assert.equal(cases.size,5);
  for(const data of cases.values()) {
    assert.equal(data.sourceId,capture.sourceId); assert.equal(data.board,board);
  }
  assert.equal(cases.get('none').previousFault,null);
  assert.deepEqual(cases.get('sdk').previousFault,{kind:'nordic-sdk',sdkId:0x12345678,pc:0x23457});
  assert.deepEqual(cases.get('sdk-invalid-pc').previousFault,{kind:'nordic-sdk',sdkId:0xdeadbeef,pc:null});
  assert.equal(cases.get('hard').previousFault.kind,'hardfault');
  assert.equal(cases.get('exit').previousFault.kind,'libc-exit');
  const identity=diagnosticBuildIdentity({firmwareVersion:version,boot:{settingsCrcValid:true,applicationCounter:counter},build:cases.get('sdk')});
  assert.equal(identity.packageReference.applicationBinSha256,capture.binSha256);
  assert.equal(identity.firmwareReportedSourceRelation,'matches-package');
  assert.equal(identity.applicationHashVerified,false);
  assert.equal(diagnosticBuildIdentity({firmwareVersion:version,build:{...cases.get('sdk'),sourceId:'a'.repeat(64)}}).firmwareReportedSourceRelation,'differs-from-package');
});

test('optional LCD build diagnostics preserve earlier readings on unsupported or malformed replies and refuse stale sessions',async()=>{
  const power=async()=>({schemaVersion:1,scope:"application-start-and-cached-battery",resetCaptured:true,sampleCollected:true,voltageValid:true,lipoMode:true,
    chargingActive:false,resetReasonRaw:0,batteryMillivolts:4000,configuredSleepSeconds:180});
  const previous=await collectDiagnosticSnapshot({readers:{power}});
  assert.equal(Object.hasOwn(previous.sections,'build'),false);
  for (const [reader,state,code] of [
    [()=>null,'unavailable',null],
    [()=>({}),'failed','DIAGNOSTIC_INVALID_DATA'],
    [()=>{throw Object.assign(new Error(),{code:'TIMEOUT'});},'failed','TIMEOUT'],
    [()=>{throw Object.assign(new Error(),{code:'RESPONSE_INVALID'});},'failed','RESPONSE_INVALID']
  ]) {
    const result=await collectDiagnosticSnapshot({readers:{power,build:reader}});
    assert.equal(result.sections.power.state,'available');
    assert.equal(result.sections.build.state,state);assert.equal(result.sections.build.errorCode,code);
    assert.equal(result.sections.build.data,null);
  }
  let current=true;
  await assert.rejects(collectDiagnosticSnapshot({readers:{build:async()=>{current=false; return parseBuildDiagnostics(reply());}},
    isCurrent:()=>current}),{code:'DIAGNOSTIC_STALE'});
});
