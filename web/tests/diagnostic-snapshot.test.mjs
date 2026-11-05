import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import bootPacket from './boot-fixture.cjs';
import { parseBootDiagnostics } from '../src/lib/boot-diagnostics.js';
import { createDiagnostics } from '../src/lib/device-info.js';
import { DIAGNOSTIC_SECTION_KEYS, collectDiagnosticSnapshot, normalizeDiagnosticSnapshot,
  normalizeStorageDiagnostics, createCombinedDiagnosticReport } from '../src/lib/diagnostic-snapshot.js';

const runtime = JSON.parse(readFileSync(new URL('./runtime-de348-wire-fixture.json', import.meta.url))).expected;
const counts = () => ({ press: 6, release: 5, short: 4, long: 1, repeat: 0 });
const attempt = () => ({ selection: 4, saveResult: null, count: 1, focus: 3, stage: 2 });
function fixture() {
  return {
    runtime: { ...runtime }, boot: { ...parseBootDiagnostics(bootPacket()) },
    power: { schemaVersion: 1, scope: 'application-start-and-cached-battery', resetCaptured: true,
      resetReasonRaw: 4, sampleCollected: true, voltageValid: true, batteryMillivolts: 4100,
      lipoMode: true, chargingActive: false, configuredSleepSeconds: 180 },
    startup: { schemaVersion: 1, scope: 'application-storage-start-to-first-dispatch', phaseMask: 63,
      elapsedMilliseconds: [0, 2100, 2120, 2174, 2174, 2190] },
    drives: [{ label: 'E', status: 0, totalBytes: 2097152, freeBytes: 812345 }],
    storage: { info: { schema: 1, drive: 'E', backend: 3, mounted: true, flags: 15, metaLen: 128, pathMax: 64, nameMax: 48 },
      layout: { schema: 1, drive: 'E', backend: 3, mounted: true, magic: 0x31534650, flashBytes: 2097152,
        blockSize: 4096, blockCount: 512, readSize: 16, progSize: 256, cacheSize: 256, metadataBytes: 128,
        shardTarget: 65536, maxShards: 32, pathCap: 64, nameCap: 48, maxHandles: 8, flags: 7, engineSha256: 'a'.repeat(64) } },
    mtu: { schemaVersion: 1, scope: 'firmware-gatt-snapshot', sessionReady: true, fileMode: true, transferIdle: true,
      effectiveAttMtu: 23, nextConnectionAttMtu: 250, configuredMaxAttMtu: 250, gattValueCapacity: 20 },
    ui: { schemaVersion: 1, scope: 'last-settings-session', active: false, sessions: 2,
      rawEvents: { left: counts(), center: counts(), right: counts() }, centerPosted: counts(),
      centerDropped: counts(), centerDelivered: counts(), queueHighWater: 3, shortAttempt: attempt(), longAttempt: attempt() },
  };
}
const clock = () => { let tick = 0; return () => new Date(Date.UTC(2026, 10, 3, 12, 0, 0, tick++)).toISOString(); };
const readersFor = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, async () => value]));
const defer = () => { let resolve, reject; return { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; };

test('eight explicit reads run sequentially, publish only completed sections and copy normalized data', async () => {
  const values = fixture(), gate = defer(), calls = [], progress = []; let active = 0, peak = 0;
  const readers = Object.fromEntries(DIAGNOSTIC_SECTION_KEYS.map(key => [key, async () => {
    calls.push(key); active++; peak = Math.max(peak, active);
    if (key === 'runtime') await gate.promise;
    active--; return values[key];
  }]));
  readers.extra = () => { throw Error('Unrequested read'); };
  const pending = collectDiagnosticSnapshot({ readers, now: clock(), onProgress: item => progress.push(item) });
  assert.deepEqual(calls, ['runtime']); assert.equal(progress.length, 0);
  gate.resolve(); const snapshot = await pending;
  assert.equal(peak, 1); assert.deepEqual(calls, [...DIAGNOSTIC_SECTION_KEYS]);
  assert.deepEqual(progress.map(item => item.key), calls);
  assert(progress.every((item, index) => item.index === index + 1 && item.total === 8));
  assert(Object.values(snapshot.sections).every(section => section.state === 'available' && section.errorCode === null));
  assert.equal(snapshot.sections.mtu.data.effectiveAttMtu, 23);
  assert.equal(snapshot.sections.storage.data.layout.cacheSize, 256);
  assert.equal(snapshot.startedAt, '2026-11-03T12:00:00.000Z');
  assert.equal(snapshot.completedAt, '2026-11-03T12:00:00.009Z');
  assert(Object.isFrozen(snapshot.sections.ui.data.rawEvents.center));
  values.runtime.heapFreeBytes = 1;
  assert.equal(snapshot.sections.runtime.data.heapFreeBytes, runtime.heapFreeBytes);
});

test('unsupported and absent readers stay unavailable, whereas an empty valid drive list is available', async () => {
  const snapshot = await collectDiagnosticSnapshot({ readers: { runtime: async () => null, boot: async () => undefined,
    drives: async () => [] }, now: clock() });
  assert.equal(snapshot.sections.runtime.state, 'unavailable'); assert(snapshot.sections.runtime.observedAt);
  assert.equal(snapshot.sections.boot.state, 'unavailable'); assert.equal(snapshot.sections.power.observedAt, null);
  assert.equal(snapshot.sections.drives.state, 'available'); assert.deepEqual(snapshot.sections.drives.data, []);
  assert.equal(snapshot.sections.power.data, null);
});

test('malformed sections and independent read errors clear data but allow later valid sections', async () => {
  const values = fixture(), readers = readersFor(values);
  readers.runtime = async () => ({ schemaVersion: 99, heapFreeBytes: 'SECRET' });
  readers.boot = async () => { throw Object.assign(Error('SECRET address and file'), { code: 'RESPONSE_INVALID' }); };
  readers.power = async () => { throw null; };
  readers.ui = async () => { throw { code: 'SECRET /private/path', message: 'SECRET' }; };
  const snapshot = await collectDiagnosticSnapshot({ readers, now: clock() });
  assert.equal(snapshot.sections.runtime.errorCode, 'DIAGNOSTIC_INVALID_DATA');
  assert.equal(snapshot.sections.boot.errorCode, 'RESPONSE_INVALID');
  assert.equal(snapshot.sections.power.errorCode, 'DIAGNOSTIC_FAILED');
  assert.equal(snapshot.sections.ui.errorCode, 'DIAGNOSTIC_FAILED');
  for (const key of ['runtime', 'boot', 'power', 'ui']) {
    assert.equal(snapshot.sections[key].state, 'failed'); assert.equal(snapshot.sections[key].data, null);
  }
  assert.equal(snapshot.sections.mtu.state, 'available');
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET/);
});

test('transport failure stops before another request instead of repeating a broken sequence', async () => {
  for (const code of ['DISCONNECTED', 'CONNECT_FAILED', 'CONNECT_TIMEOUT', 'TX_FAILED', 'TIMEOUT', 'RX_INVALID']) {
    const calls = [], events = [];
    await assert.rejects(collectDiagnosticSnapshot({ readers: {
      runtime: async () => { calls.push('runtime'); return runtime; },
      boot: async () => { calls.push('boot'); throw Object.assign(Error('SECRET'), { code }); },
      power: async () => { calls.push('power'); return fixture().power; },
    }, now: clock(), onProgress: event => events.push(event) }), error => error.code === code && !error.message.includes('SECRET'));
    assert.deepEqual(calls, ['runtime', 'boot']); assert.equal(events.length, 1);
  }
});

test('stale generation before, during success or failure, and after progress cannot publish a snapshot', async () => {
  let count = 0;
  await assert.rejects(collectDiagnosticSnapshot({ isCurrent: () => false, readers: { runtime: () => count++ } }), { code: 'DIAGNOSTIC_STALE' });
  assert.equal(count, 0);
  for (const fails of [false, true]) {
    let current = true; const gate = defer(), progress = [];
    const pending = collectDiagnosticSnapshot({ readers: { runtime: () => gate.promise, boot: () => count++ },
      isCurrent: () => current, onProgress: item => progress.push(item), now: clock() });
    current = false;
    if (fails) gate.reject(Object.assign(Error('old transport'), { code: 'RX_INVALID' })); else gate.resolve(runtime);
    await assert.rejects(pending, { code: 'DIAGNOSTIC_STALE' }); assert.equal(progress.length, 0);
  }
  let current = true;
  await assert.rejects(collectDiagnosticSnapshot({ readers: { runtime: async () => runtime, boot: () => count++ },
    isCurrent: () => current, onProgress: () => { current = false; }, now: clock() }), { code: 'DIAGNOSTIC_STALE' });
  assert.equal(count, 0);
});

test('storage whitelist keeps exact geometry but rejects wrong backend, malformed dimensions and private fields', () => {
  const storage = fixture().storage;
  const clean = normalizeStorageDiagnostics({ ...storage, archiveSha256: 'SECRET',
    info: { ...storage.info, address: 'SECRET' }, layout: { ...storage.layout, paths: ['SECRET'] } });
  assert.deepEqual(clean, storage); assert.doesNotMatch(JSON.stringify(clean), /SECRET/);
  assert.deepEqual(normalizeStorageDiagnostics({ info: storage.info, layout: null }), { info: storage.info, layout: null });
  assert(normalizeStorageDiagnostics({ info: { ...storage.info, backend: 1, flags: 7 }, layout: null }));
  for (const info of [{ ...storage.info, drive: 'I' }, { ...storage.info, mounted: 1 },
    { ...storage.info, backend: 1 }, { ...storage.info, flags: 16 }, { ...storage.info, metaLen: 64 }]) {
    assert.equal(normalizeStorageDiagnostics({ info, layout: storage.layout }), null);
  }
  for (const patch of [{ blockCount: 513 }, { engineSha256: '0'.repeat(64) }, { cacheSize: 0 },
    { metadataBytes: 64 }, { flags: 15 }, { pathCap: 65 }, { maxHandles: 256 }, { magic: 0 }]) {
    assert.equal(normalizeStorageDiagnostics({ info: storage.info, layout: { ...storage.layout, ...patch } }), null);
  }
});

test('combined report preserves all new sections and timestamps while removing nested private fields', async () => {
  const values = fixture();
  for (const key of DIAGNOSTIC_SECTION_KEYS) {
    if (Array.isArray(values[key])) values[key][0].name = 'SECRET'; else values[key].private = 'SECRET';
  }
  values.ui.centerPosted.deviceAddress = 'SECRET'; values.ui.shortAttempt.notes = 'SECRET';
  const snapshot = await collectDiagnosticSnapshot({ readers: readersFor(values), now: clock() });
  const baseReport = createDiagnostics({ firmwareVersion: '2.22.0-DE3.56', connected: true,
    transport: { connectionState: 'connected', txBytes: 100, lastErrorCode: 'TIMEOUT' },
    history: [{ kind: 'upload', status: 'success', bytes: 540, path: 'SECRET' }] });
  baseReport.userAgent = 'SECRET'; baseReport.transport.address = 'SECRET'; baseReport.recentTransfers[0].path = 'SECRET';
  const report = createCombinedDiagnosticReport({ baseReport, snapshot: { ...snapshot, deviceKey: 'SECRET' } });
  assert.doesNotMatch(JSON.stringify(report), /SECRET/);
  assert.deepEqual(report.startup, { schemaVersion: 1, scope: 'application-storage-start-to-first-dispatch',
    phaseMask: 63, elapsedMilliseconds: [0, 2100, 2120, 2174, 2174, 2190] });
  assert.equal(report.transport.connectionState, 'connected');
  assert.equal(report.diagnosticSnapshot.sections.ui.data.rawEvents.center.short, 4);
  assert.equal(report.diagnosticSnapshot.sections.storage.data.layout.engineSha256, 'a'.repeat(64));
  assert.equal(report.diagnosticSnapshot.sections.mtu.data.gattValueCapacity, 20);
  assert(report.limitations.some(text => text.includes('not an atomic')));
  assert(report.limitations.some(text => text.includes('not the age of cached')));
});

test('fresh failed or unsupported reads never fall back to old cached values in combined report', async () => {
  const snapshot = await collectDiagnosticSnapshot({ readers: { runtime: async () => { throw Error('old'); } }, now: clock() });
  const old = fixture(), baseReport = createDiagnostics({ runtime: old.runtime, boot: old.boot, power: old.power, drives: old.drives });
  const report = createCombinedDiagnosticReport({ baseReport, snapshot });
  assert.equal(report.runtime, null); assert.equal(report.boot, null); assert.equal(report.power, null);
  assert.equal(report.startup, null); assert.deepEqual(report.drives, []);
  assert.equal(report.diagnosticSnapshot.sections.runtime.state, 'failed');
  assert.equal(report.diagnosticSnapshot.sections.boot.state, 'unavailable');
});

test('export names the ATT MTU source and only claims a firmware reading when it exists', async () => {
  const transport = {chunkMode: 'chunked', effectiveGattValueCapacity: 247, reportedGattValueCapacity: 247};
  const baseReport = createDiagnostics({transport});
  assert.match(baseReport.limitations.join(' '), /Browser transport counters and GATT/);
  assert(!baseReport.limitations.includes('Not a measurement of ATT MTU'));
  const current = fixture().mtu;
  for (const value of [current, {...current, sessionReady: false, effectiveAttMtu: null, gattValueCapacity: null}, null]) {
    const snapshot = await collectDiagnosticSnapshot({readers: {mtu: () => value}, now: clock()});
    const result = createCombinedDiagnosticReport({baseReport, snapshot});
    assert.equal(result.limitations.some(text => text.includes('firmware reported the effective ATT MTU')), value === current);
    assert.equal(result.limitations.some(text => text.includes('no firmware reading')), value !== current);
  }
  assert.equal(createCombinedDiagnosticReport({baseReport}).diagnosticSnapshot, null);
});

test('snapshot normalization rejects incomplete/invalid records and never exports failed-section payloads', async () => {
  const snapshot = await collectDiagnosticSnapshot({ now: clock() });
  assert.equal(normalizeDiagnosticSnapshot({ ...snapshot, startedAt: '2026-02-30T12:00:00.000Z' }), null);
  assert.equal(normalizeDiagnosticSnapshot({ ...snapshot, sections: {} }), null);
  assert.equal(normalizeDiagnosticSnapshot({ ...snapshot, sections: { ...snapshot.sections, runtime: { state: 'available', observedAt: snapshot.startedAt, data: {} } } }), null);
  const altered = { ...snapshot, sections: { ...snapshot.sections,
    runtime: { state: 'failed', observedAt: snapshot.startedAt, data: { private: 'SECRET' }, errorCode: 'SECRET' } } };
  assert.doesNotMatch(JSON.stringify(normalizeDiagnosticSnapshot(altered)), /SECRET/);
  assert.throws(() => createCombinedDiagnosticReport({ snapshot: { ...snapshot, completedAt: null } }), { code: 'DIAGNOSTIC_INVALID_DATA' });
  assert.equal(createCombinedDiagnosticReport({ baseReport: { drives: [null], recentTransfers: [null] } }).diagnosticSnapshot, null);
  await assert.rejects(collectDiagnosticSnapshot({ now: () => 'bad time' }), { code: 'DIAGNOSTIC_INVALID_TIME' });
});
