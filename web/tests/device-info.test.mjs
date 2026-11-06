import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDrives, normalizeRuntimeDiagnostics, memorySampleEvidenceKey, runtimeVfsDetailKey, uploadSpaceAvailable, createDiagnostics } from '../src/lib/device-info.js';

test('memory sample evidence distinguishes absent, zero, one, few and many without a health verdict', () => {
  for (const n of [undefined,null,NaN,-1,0.1,'1',0x100000000]) assert.equal(memorySampleEvidenceKey(n),'memorySamplesUnknown');
  for (const [n,key] of [[0,'None'],[1,'Single'],[2,'Few'],[9,'Few'],[10,'Many'],[0xffffffff,'Many']])
    assert.equal(memorySampleEvidenceKey(n),'memorySamples'+key);
});

test('last VFS code is explained without classifying the entire historical counter as storage damage', () => {
  assert.equal(runtimeVfsDetailKey(-1000), 'runtimeBadRequest');
  assert.equal(runtimeVfsDetailKey(-1001), 'runtimeBadState');
  assert.equal(runtimeVfsDetailKey(0), 'runtimeNoVfsError');
  for (const code of [-10002, 1, null, undefined, '-1000']) assert.equal(runtimeVfsDetailKey(code), 'runtimeVfsOther');
});

test('runtime diagnostics preserve signed errors and unknown stack measurements without exporting extra fields', () => {
  const runtime={schemaVersion:1,scope:'since-device-restart',heapPoolBytes:200,heapFreeBytes:100,sampledMinFreeBytes:75,
    stackMinFreeBytes:null,lastVfsError:-10002,privatePath:'PRIVATE',deviceKey:'PRIVATE-ID',memorySamples:3};
  const data=normalizeRuntimeDiagnostics(runtime);
  assert.equal(data.lastVfsError,-10002);assert.equal(data.stackMinFreeBytes,null);assert.equal(data.memorySamples,3);
  const report=createDiagnostics({runtime,history:[{kind:'sync',status:'interrupted',bytes:12,verified:false}]});
  assert.equal(report.applicationVersion,'3.39.1');assert.equal(report.recentTransfers[0].status,'interrupted');
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE/);
  assert.equal(normalizeRuntimeDiagnostics({schemaVersion:2}),null);
});

test('drive snapshots reject invalid counts and ambiguous drive identities', () => {
  const raw = { label: 'E', status: 0, total_size: 100, free_size: 20 };
  assert.deepEqual(normalizeDrives([raw]), [{ label: 'E', status: 0, totalBytes: 100, freeBytes: 20 }]);
  for (const entries of [null, [raw, raw], [{ ...raw, free_size: 101 }], [{ ...raw, total_size: -1 }], [{ ...raw, label: 'X' }]]) {
    assert.throws(() => normalizeDrives(entries));
  }
  assert.equal(normalizeDrives([{ ...raw, status: 1, total_size: 0, free_size: 0 }])[0].status, 1);
});

test('upload space estimate checks new files, replacements, zero bytes and offline drives', () => {
  const drive = normalizeDrives([{ label: 'E', status: 0, total_size: 100, free_size: 20 }])[0];
  assert.equal(uploadSpaceAvailable(drive, 21), false);
  assert.equal(uploadSpaceAvailable(drive, 20), true);
  assert.equal(uploadSpaceAvailable(drive, 50, 30), true);
  assert.equal(uploadSpaceAvailable({ ...drive, freeBytes: 0 }, 0), true);
  assert.equal(uploadSpaceAvailable({ ...drive, status: 1 }, 0), false);
  assert.equal(uploadSpaceAvailable(drive, NaN), false);
});

test('diagnostics omit identifiers, filenames, paths and arbitrary error messages', () => {
  const report = createDiagnostics({ firmwareVersion: '2.21.0-DE3.18', connected: true,
    browser: { secureContext: true, webBluetooth: true, userAgent: 'PRIVATE-UA' },
    transport: { chunkMode: 'chunked', reportedGattValueCapacity: 20, effectiveGattValueCapacity: 20,
      txBytes: 100, rxBytes: 0, address: 'PRIVATE-MAC', lastErrorCode: 'PRIVATE /file error', maxRequestPayload: 243 },
    drives: [{ label: 'E', name: 'PRIVATE-NAME', status: 0, totalBytes: 1024, freeBytes: 10 }],
    history: [{ kind: 'upload', status: 'success', bytes: 540, verified: true, path: 'PRIVATE-PATH' }] });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  assert.equal(report.firmwareVersion, '2.21.0-DE3.18');
  assert.equal(report.transport.reportedGattValueCapacity, 20);
  assert.equal(report.transport.lastErrorCode, null);
  assert.equal(report.recentTransfers[0].verified, true);
});

test('diagnostics reject untrusted version text and bound transfer history', () => {
  const report = createDiagnostics({ firmwareVersion: '2.21.0 /private/path', history: Array.from({ length: 100 }, () => ({kind:'x',status:'y',bytes:Infinity})) });
  assert.equal(report.firmwareVersion, null); assert.equal(report.recentTransfers.length, 20);
  assert.equal(report.recentTransfers[0].bytes, null);
});

test('diagnostic connection state accepts only known local states without copying device identifiers', () => {
  for (const state of ['disconnected', 'connecting', 'connected', 'disconnecting']) {
    assert.equal(createDiagnostics({ transport: { connectionState: state, deviceAddress: 'SECRET' } }).transport.connectionState, state);
  }
  for (const state of ['SECRET', null, 1, {}]) {
    const report = createDiagnostics({ transport: { connectionState: state, deviceAddress: 'SECRET' } });
    assert.equal(report.transport.connectionState, null); assert.doesNotMatch(JSON.stringify(report), /SECRET/);
  }
});

test('watermark accepts an exhausted marked area but rejects impossible or unsupported stack readings', () => {
  const read = (reserved, measured) => normalizeRuntimeDiagnostics({schemaVersion:1,scope:'since-device-restart',
    stackReservedBytes:reserved, stackMinFreeBytes:measured}).stackMinFreeBytes;
  assert.equal(read(8192, 0), 0); assert.equal(read(8192, 5116), 5116);
  assert.equal(read(8192, null), null); assert.equal(read(null, 512), null); assert.equal(read(8192, 8193), null);
});
