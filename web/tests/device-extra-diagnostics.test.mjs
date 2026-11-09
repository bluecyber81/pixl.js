import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMenuDiagnostics, normalizeMenuDiagnostics, parseMtuDiagnostics, normalizeMtuDiagnostics, parseUiDiagnostics, normalizeUiDiagnostics} from '../src/lib/device-extra-diagnostics.js';

test('menu trace validates each lifecycle state, flag order, optional fields and counter saturation', () => {
  const packet = (flags, app = 0) => Uint8Array.from([80,88,77,73,1,16,flags,app,0,0,0,0,0,0,0,0]);
  for (const flags of [0,1,3,7,15,17]) {
    const raw = packet(flags, flags & 2 ? 2 : 0);
    const row = parseMenuDiagnostics(raw);
    assert.equal(row.selectionAttempted, Boolean(flags & 2));
    assert.equal(row.launchCallMilliseconds, flags & 4 ? 0 : null);
    assert.deepEqual(normalizeMenuDiagnostics({...row, filename:'PRIVATE'}),row);
  }
  const sat = packet(33); sat[8] = 255;
  assert.equal(parseMenuDiagnostics(sat).countsSaturated,true);
  for (const flags of [2,4,8,16,19,32,64,128]) assert.throws(()=>parseMenuDiagnostics(packet(flags, flags & 2 ? 2 : 0)));
  for (const [offset,value] of [[0,1],[4,2],[5,15],[7,2],[8,1],[11,1],[12,1]]) {
    const raw = packet(0); raw[offset] = value; assert.throws(()=>parseMenuDiagnostics(raw));
  }
  const valid = parseMenuDiagnostics(packet(15,2));
  for (const patch of [{scope:'all-buttons'}, {targetAppId:-1}, {launchCallMilliseconds:null},
      {countsSaturated:true}, {centerCounts:{press:256, release:0, short:0}}]) {
    assert.equal(normalizeMenuDiagnostics({...valid,...patch}),null);
  }
});

function mtu(flags = 7, effective = 250, next = 250, maximum = 250, capacity = 247) {
  const bytes = new Uint8Array(16), view = new DataView(bytes.buffer);
  bytes.set([77,84,85,68,1,flags]);
  [effective,next,maximum,capacity].forEach((value, index) => view.setUint16(6 + 2 * index, value, true));
  return bytes;
}
function ui() {
  const bytes = new Uint8Array(104), view = new DataView(bytes.buffer);
  bytes.set([85,73,68,71,1,0,2,0]);
  for (let index = 0; index < 30; index++) view.setUint16(8 + 2 * index, index + 1, true);
  bytes[68] = 4;
  view.setUint32(72, 0x12345678, true); view.setInt32(76, 0, true);
  view.setUint16(80, 3, true); view.setUint16(82, 17, true); bytes[84] = 6;
  view.setUint32(88, 19, true); view.setInt32(92, -17, true);
  view.setUint16(96, 2, true); view.setUint16(98, 18, true); bytes[100] = 5;
  return bytes;
}

test('MTU exact schema reads firmware values, default MTU23 and offset views', () => {
  const result = parseMtuDiagnostics(mtu());
  assert.deepEqual(result, {schemaVersion:1,scope:'firmware-gatt-snapshot',sessionReady:true,fileMode:true,
    transferIdle:true,effectiveAttMtu:250,nextConnectionAttMtu:250,configuredMaxAttMtu:250,gattValueCapacity:247});
  const minimum = parseMtuDiagnostics(mtu(7,23,23,250,20));
  assert.equal(minimum.effectiveAttMtu,23); assert.equal(minimum.gattValueCapacity,20);
  const padded = new Uint8Array(24); padded.set(mtu(),3);
  assert.deepEqual(parseMtuDiagnostics(padded.subarray(3,19)), result);
  assert.deepEqual(parseMtuDiagnostics(mtu().buffer), result); assert(Object.isFrozen(result));
  // A capacity snapshot may still be conservative during MTU bookkeeping.
  assert.equal(parseMtuDiagnostics(mtu(7,250,23,250,20)).gattValueCapacity,20);
});

test('MTU disconnected values are null and mutating preference is never inferred', () => {
  const result = parseMtuDiagnostics(mtu(6,0,23,250,0));
  assert.equal(result.sessionReady,false); assert.equal(result.effectiveAttMtu,null);
  assert.equal(result.gattValueCapacity,null); assert.equal(result.nextConnectionAttMtu,23);
  for (const args of [[6,23,250,250,0],[6,0,250,250,20],[7,22,250,250,20],
    [7,251,250,250,247],[7,23,22,250,20],[7,23,251,250,20],[7,23,23,251,20],
    [7,23,23,250,21],[7,23,23,250,19]]) assert.throws(() => parseMtuDiagnostics(mtu(...args)));
});

test('MTU rejects unknown layouts, padding, flags and unsafe normalized inputs', () => {
  for (const length of [0,15,17,104]) assert.throws(() => parseMtuDiagnostics(new Uint8Array(length)));
  for (const [offset,value] of [[0,0],[1,0],[2,0],[3,0],[4,2],[5,8],[14,1],[15,1]]) {
    const bytes=mtu(); bytes[offset]=value; assert.throws(() => parseMtuDiagnostics(bytes));
  }
  for (const bad of [null,{},[],new DataView(mtu().buffer)]) assert.throws(() => parseMtuDiagnostics(bad));
  const value=parseMtuDiagnostics(mtu()), result=normalizeMtuDiagnostics({...value,filename:'SECRET',serial:'SECRET'});
  assert.deepEqual(result,value); assert.notEqual(result,value); assert.doesNotMatch(JSON.stringify(result),/SECRET/);
  for (const patch of [{schemaVersion:2},{scope:'radio-proof'},{sessionReady:1},{fileMode:'true'},
    {effectiveAttMtu:NaN},{gattValueCapacity:-1},{configuredMaxAttMtu:65536},{nextConnectionAttMtu:23.5}])
    assert.equal(normalizeMtuDiagnostics({...value,...patch}),null);
});

test('UI packet maps every event and attempt field using little endian', () => {
  const result=parseUiDiagnostics(ui());
  assert.equal(result.scope,'last-settings-session'); assert.equal(result.sessions,2); assert.equal(result.active,false);
  assert.deepEqual(result.rawEvents.left,{press:1,release:2,short:3,long:4,repeat:5});
  assert.deepEqual(result.rawEvents.center,{press:6,release:7,short:8,long:9,repeat:10});
  assert.deepEqual(result.rawEvents.right,{press:11,release:12,short:13,long:14,repeat:15});
  assert.deepEqual(result.centerPosted,{press:16,release:17,short:18,long:19,repeat:20});
  assert.deepEqual(result.centerDropped,{press:21,release:22,short:23,long:24,repeat:25});
  assert.deepEqual(result.centerDelivered,{press:26,release:27,short:28,long:29,repeat:30});
  assert.deepEqual(result.shortAttempt,{selection:0x12345678,saveResult:0,count:3,focus:17,stage:6});
  assert.deepEqual(result.longAttempt,{selection:19,saveResult:-17,count:2,focus:18,stage:5});
  assert.equal(result.queueHighWater,4);
  const padded=new Uint8Array(120); padded.set(ui(),7);
  assert.deepEqual(parseUiDiagnostics(padded.subarray(7,111)),result);
  assert.deepEqual(parseUiDiagnostics(ui().buffer),result);
  for (const value of [result,result.rawEvents,result.rawEvents.center,result.centerDropped,result.shortAttempt])
    assert(Object.isFrozen(value));
});

test('UI accepts each save stage, explicit unrecorded result and saturated counters', () => {
  for (let stage=0;stage<=6;stage++) {
    const bytes=ui(),view=new DataView(bytes.buffer);
    bytes[84]=stage; view.setInt32(76,stage<4?-2147483648:stage===5?-5:0,true);
    const result=parseUiDiagnostics(bytes);
    assert.equal(result.shortAttempt.saveResult,stage<4?null:stage===5?-5:0);
  }
  const empty=new Uint8Array(104),view=new DataView(empty.buffer); empty.set([85,73,68,71,1]);
  view.setInt32(76,-2147483648,true); view.setInt32(92,-2147483648,true);
  assert.equal(parseUiDiagnostics(empty).sessions,0); assert.equal(parseUiDiagnostics(empty).shortAttempt.saveResult,null);
  const full=ui(),v=new DataView(full.buffer); full[5]=1;full[68]=255;
  for(let offset=6;offset<68;offset+=2)v.setUint16(offset,65535,true);
  assert.equal(parseUiDiagnostics(full).rawEvents.right.repeat,65535);
  assert.equal(parseUiDiagnostics(full).sessions,65535);
});

test('UI rejects corrupted wire shape, reserved bytes and contradictory save stages', () => {
  for (const length of [0,16,103,105]) assert.throws(() => parseUiDiagnostics(new Uint8Array(length)));
  for(const offset of [0,1,2,3,4,5,69,70,71,85,86,87,101,102,103]) {
    const bytes=ui();bytes[offset]=offset<4?0:2;assert.throws(()=>parseUiDiagnostics(bytes));
  }
  for (const [stage,result] of [[7,0],[0,0],[3,-7],[4,-1],[5,0],[5,-2147483648],[6,1]]) {
    const bytes=ui();bytes[84]=stage;new DataView(bytes.buffer).setInt32(76,result,true);
    assert.throws(()=>parseUiDiagnostics(bytes));
  }
  const activeWithoutSession=ui();activeWithoutSession[5]=1;activeWithoutSession[6]=0;
  assert.throws(()=>parseUiDiagnostics(activeWithoutSession));
});

test('UI normalization copies only bounded schema fields, including nested event/attempt data', () => {
  const valid=parseUiDiagnostics(ui());
  const dirty={...valid,filename:'SECRET',rawEvents:{...valid.rawEvents,center:{...valid.rawEvents.center,serial:'SECRET'}},
    shortAttempt:{...valid.shortAttempt,contents:'SECRET'}};
  const result=normalizeUiDiagnostics(dirty);
  assert.deepEqual(result,valid);assert.notEqual(result.rawEvents.center,valid.rawEvents.center);
  assert.doesNotMatch(JSON.stringify(result),/SECRET/);
  for (const patch of [{schemaVersion:2},{scope:'all-device-events'},{active:1},{sessions:-1},{queueHighWater:256},
    {rawEvents:{}},{centerPosted:{...valid.centerPosted,repeat:65536}},
    {centerDropped:{...valid.centerDropped,short:NaN}},
    {longAttempt:{...valid.longAttempt,selection:0x100000000}},
    {shortAttempt:{...valid.shortAttempt,saveResult:null}}]) assert.equal(normalizeUiDiagnostics({...valid,...patch}),null);
});
