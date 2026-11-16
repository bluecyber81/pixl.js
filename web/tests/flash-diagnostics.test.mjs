import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlashDiagnostics, normalizeFlashDiagnostics, flashManufacturer} from '../src/lib/flash-diagnostics.js';
const frame = (flags, id) => Uint8Array.from([80,88,74,70,1,12,flags,0,...id,0]);
test('raw chip IDs remain useful for unknown vendors and unsupported geometries', () => {
  for (const [flags, id] of [[3,[235,64,21]], [1,[77,0,255]]]) {
    const data = parseFlashDiagnostics(frame(flags,id));
    assert.deepEqual(data.jedecId,id); assert.equal(data.geometrySupported, flags === 3);
    assert.equal(flashManufacturer(id), flags === 3 ? 'TsingTeng' : null);
  }
  assert.equal(parseFlashDiagnostics(frame(0,[0,0,0])).jedecId,null);
});
test('malformed or contradictory cached observations are rejected', () => {
  for (const f of [frame(2,[0,0,0]), frame(4,[1,2,3]), frame(0,[1,0,0]), frame(1,[255,64,21]),frame(1,[0,0,0]),frame(3,[1,2,3]).slice(1)]) assert.throws(() => parseFlashDiagnostics(f));
  for (const i of [0,4,5,7,11]) {const f = frame(3,[1,2,3]);f[i] = 9;assert.throws(() => parseFlashDiagnostics(f));}
  const value = parseFlashDiagnostics(frame(1,[77,0,255]));
  for (const id of [[1,,2],[1,-1,5],[false,2,3],[1,2],{},'EF4015']) assert.equal(normalizeFlashDiagnostics({...value,jedecId:id}),null);
});
