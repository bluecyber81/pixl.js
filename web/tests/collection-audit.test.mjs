import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCollection, COLLECTION_AUDIT_LIMITS, COLLECTION_AUDIT_CATALOGUE } from '../src/lib/collection-audit.js';

// Synthetic public IDs and generated tag bytes; no device backup/UID fixtures.
const A = '0000000000000102', B = '0000000000000202', C = '0000000000000302', V3 = '0000000000000403';
const cat = (id, release = '2020-01-01') => ({ id, name: `Figure ${id}`, series: 'Synthetic', release: { eu: release } });
const catalogue = [cat(A), cat(B), cat(C, '2099-01-01'), cat(V3, null)];
function tag(id = A, size = 540) {
  const bytes = new Uint8Array(size);
  if (size >= 92) {
    bytes[0] = 4; bytes[3] = 0x88 ^ bytes[0];
    bytes.set(id.match(/../g).map(x => parseInt(x, 16)), 84);
  }
  return bytes;
}
const meta = id => ({ valid: true, amiibo: { head: parseInt(id.slice(0, 8), 16), tail: parseInt(id.slice(8), 16) } });
const file = (name, size = 540, id) => ({ name, type: 0, size, ...(id ? { meta: meta(id) } : {}) });
const folder = name => ({ name, type: 1, size: 0 });
function adapter(tree = { 'E:/': [file('a.bin')] }, content = {}) {
  const calls = [];
  const options = { catalogue, today: '2026-11-02', assertSession() {},
    async readDirectory(path) { calls.push(['list', path]); return tree[path] || []; },
    async readFile(path, { maxBytes }) { calls.push(['read', path, maxBytes]); return content[path] || tag(A, maxBytes); } };
  return { calls, options };
}
const run = (options = {}) => auditCollection({ ...adapter().options, ...options });

test('full scan reads all supported BIN contents despite valid but stale metadata', async () => {
  const a = adapter({ 'E:/': [file('a.BIN', 540, B), folder('sub')], 'E:/sub': [file('b.bin', 532, B)] },
    { 'E:/a.BIN': tag(A), 'E:/sub/b.bin': tag(B, 532) });
  const report = await auditCollection(a.options);
  assert.equal(report.complete, true); assert.equal(report.contentConfirmed, true);
  assert.deepEqual(a.calls.filter(c => c[0] === 'read').map(c => c.slice(1)), [['E:/a.BIN', 540], ['E:/sub/b.bin', 532]]);
  assert.deepEqual(report.present.map(row => row.id), [A, B]);
  assert.deepEqual(report.metadataMismatches, [{ path: 'E:/a.BIN', metadataId: B, contentId: A }]);
  assert.equal(report.stats.bytesRead, 1072); assert.equal(report.stats.folders, 2);
});

test('progress discovers the scope once and counts only scheduled reads in the content phase', async () => {
  const a = adapter({ 'E:/': [file('one.bin'),folder('sub'),file('unknown.bin', 400)],
    'E:/sub': [file('two.bin'),file('over-budget.bin'),file('notes.txt')] });
  const events = [];
  const r = await auditCollection({ ...a.options, limits:{bytes:1080}, onProgress:stats=>events.push(stats) });
  assert.deepEqual(a.calls.map(c=>c.slice(0,2)), [
    ['list','E:/'],['list','E:/sub'],['read','E:/one.bin'],['read','E:/sub/two.bin'],
  ]);
  assert.ok(events.filter(p=>p.phase === 'listing').every(p=>p.totalToRead === null));
  assert.deepEqual(events.filter(p=>p.phase === 'reading').map(p=>[p.filesRead,p.totalToRead]), [[0,2],[1,2],[2,2]]);
  assert.equal(r.status,'partial'); assert.deepEqual(r.missing,[]);
});

test('cancelling at the last read or when the plan becomes available cannot turn a partial audit into confirmed absence', async () => {
  for (const completed of [0, 1]) {
    const a = adapter(), controller = new AbortController();
    const report = await auditCollection({ ...a.options, signal:controller.signal, onProgress(event) {
      if(event.phase === 'reading' && event.filesRead === completed) controller.abort();
    } });
    assert.equal(report.status,'cancelled');
    assert.equal(report.complete,false);
    assert.equal(report.stats.filesRead,completed);
    assert.deepEqual(report.missing,[]);
    assert.equal(a.calls.filter(c=>c[0] === 'read').length,completed);
  }
});

test('quick mode does not read bytes and never confirms contents or missing IDs', async () => {
  const a = adapter({ 'E:/': [file('a.bin', 540, A), file('b.bin', 540, B)] });
  const report = await auditCollection({ ...a.options, mode: 'quick', readFile() { throw new Error('forbidden'); } });
  assert.equal(report.complete, true); assert.equal(report.contentComplete, false); assert.equal(report.contentConfirmed, false);
  assert.equal(report.stats.filesRead, 0); assert.ok(report.files.every(row => row.status === 'metadata-only'));
  assert.ok(report.present.every(row => !row.contentConfirmed));
  assert.deepEqual(report.missing, []); assert.ok(report.unconfirmed.length);
  assert.ok(report.unconfirmed.every(row => row.state === 'not-observed-unconfirmed'));
  assert.equal(report.stats.candidateMetadataCount, 2); assert.equal(report.stats.metadataMissing, 0);
});

test('quick metadata must be explicitly valid and directories never become figures', async () => {
  const a = adapter({ 'E:/': [{ ...folder('folder'), meta: meta(B) },
    { ...file('x.bin'), meta: { ...meta(A), valid: false } }, { ...file('y.bin'), meta: { amiibo: meta(A).amiibo } }] });
  const report = await auditCollection({ ...a.options, mode: 'quick' });
  assert.equal(report.present.length, 0); assert.equal(report.stats.candidates, 2);
  assert.equal(report.stats.metadataMissing, 2); assert.equal(report.stats.candidateMetadataCount, 0);
});

test('quick zero properties IDs leave all catalogue presence undetermined; a full scan identifies the same files', async () => {
  const entries = [file('no-properties.bin'), { ...file('empty-properties.bin'), meta: { valid: true, amiibo: { head: 0, tail: 0 } } },
    file('settings.bin'), file('key_retail.bin'), file('notes.txt')];
  const a = adapter({ 'E:/': entries });
  const quick = await auditCollection({ ...a.options, mode: 'quick' });
  assert.equal(quick.complete, true); assert.equal(quick.stats.candidates, 2);
  assert.equal(quick.stats.candidateMetadataCount, 0); assert.equal(quick.stats.metadataMissing, 2);
  assert.equal(quick.unknownIdFileCount, 2); assert.equal(quick.present.length, 0); assert.deepEqual(quick.missing, []);
  assert.deepEqual(quick.unconfirmed.map(row => row.id), [A, B, V3]); assert.deepEqual(quick.unknown, []);
  assert.equal(quick.stats.filesRead, 0); assert.equal(a.calls.length, 1);
  const full = await auditCollection(a.options);
  assert.equal(full.contentComplete, true); assert.equal(full.stats.filesRead, 2);
  assert.equal(full.stats.metadataMissing, 2); assert.equal(full.unknownIdFileCount, 0);
  assert.deepEqual(full.present.map(row => row.id), [A]); assert.deepEqual(full.unconfirmed, []);
  assert.deepEqual(full.missing.map(row => row.id), [B, V3]);
});

test('unknown IDs, structural errors and duplicates are distinct without claiming duplicate byte equality', async () => {
  const bad = tag(B); bad[3] ^= 1;
  const unknown = 'ffffffffffffff02';
  const a = adapter({ 'E:/': [file('a.bin'), file('copy.bin'), file('bad.bin'), file('unknown.bin')] },
    { 'E:/a.bin': tag(A), 'E:/copy.bin': tag(A), 'E:/bad.bin': bad, 'E:/unknown.bin': tag(unknown) });
  const r = await auditCollection(a.options);
  assert.equal(r.complete, true); assert.equal(r.stats.invalidFiles, 1);
  assert.deepEqual(r.present.map(x => x.id), [A]); assert.ok(r.missing.some(x => x.id === B));
  assert.deepEqual(r.duplicates, [{ id: A, paths: ['E:/a.bin', 'E:/copy.bin'], consistentFiles: 2 }]);
  assert.equal(r.unknown[0].id, unknown); assert.equal(r.claims.duplicateBytes, 'not-compared');
});

for (const size of [532, 540, 572, 2048]) test(`supported ${size}-byte file is read in full with an exact bound`, async () => {
  const id = size === 2048 ? V3 : A;
  const a = adapter({ 'E:/': [file('a.bin', size)] }, { 'E:/a.bin': tag(id, size) });
  const r = await auditCollection(a.options);
  assert.equal(r.stats.bytesRead, size); assert.equal(r.files[0].status, 'structure-consistent');
  assert.deepEqual(a.calls[1], ['read', 'E:/a.bin', size]);
  assert.ok(r.files[0].formatContext); assert.notEqual(r.files[0].formatContext, 'unsupported-length');
  assert.equal(r.claims.cryptography, 'not-checked'); assert.equal(r.claims.nfcOperation, 'not-checked');
});

test('short V3 and malformed classic headers cannot count as structurally consistent presence', async () => {
  const r = await run({ readFile: async () => tag(V3, 540) });
  assert.equal(r.files[0].status, 'attention'); assert.deepEqual(r.files[0].issues, ['v3-length']);
  assert.equal(r.present.length, 0); assert.equal(r.stats.invalidFiles, 1);
});

test('unsupported BINs are not read or called corrupt; known key/settings files are always excluded', async () => {
  const a = adapter({ 'E:/': [file('short.bin', 531), file('huge.bin', 0xffffffff),
    file('settings.bin'), file('key_retail.bin'), file('notes.txt', 540)] });
  const r = await auditCollection(a.options);
  assert.equal(r.stats.filesRead, 0); assert.equal(r.stats.unsupportedFiles, 2); assert.equal(r.stats.ignoredFiles, 3);
  assert.equal(r.stats.invalidFiles, 0); assert.ok(r.files.every(row => row.status === 'unsupported-length'));
  assert.equal(r.claims.allFilesComplete, 'not-established'); assert.equal(a.calls.length, 1);
});

test('upcoming is separate; unknown release dates stay unknown; earliest valid regional date is used', async () => {
  const r = await run({ catalogue: [cat(A, '2099-01-01'), cat(B, null),
    { ...cat(C, '2099-01-01'), release: { eu: '2099-01-01', jp: '2026-02-30', au: '2025-01-01' } }] });
  assert.deepEqual(r.upcoming.map(x => x.id), [A]); assert.equal(r.upcoming[0].contentConfirmed, true);
  assert.equal(r.missing.find(x => x.id === B).releaseState, 'unknown');
  assert.equal(r.missing.find(x => x.id === C).releaseState, 'listed');
});

test('catalogue and final result are detached immutable snapshots', async () => {
  const mutable = [cat(A), cat(B)];
  const a = adapter(); const read = a.options.readDirectory;
  const r = await auditCollection({ ...a.options, catalogue: mutable, async readDirectory(path) {
    mutable[0].id = C; mutable[1].name = 'changed'; return read(path);
  } });
  assert.equal(r.present[0].id, A); assert.notEqual(r.missing[0].name, 'changed');
  assert.throws(() => r.files.push({})); assert.throws(() => r.files[0].issues.push('mutated'));
  assert.ok(Object.isFrozen(COLLECTION_AUDIT_CATALOGUE.entries[0].release));
});

test('bundled fallback works without network or supplied catalogue and remains explicitly dated', async () => {
  const r = await run({ catalogue: undefined, readDirectory: async () => [] });
  assert.ok(r.catalogue.entries > 900); assert.equal(r.catalogue.checkedDate, COLLECTION_AUDIT_CATALOGUE.checkedDate);
  assert.equal(r.catalogue.scope, 'provided-catalogue-snapshot');
});

test('aborted before start performs no IO and cannot confirm missing entries', async () => {
  const a = adapter(), controller = new AbortController(); controller.abort();
  const r = await auditCollection({ ...a.options, signal: controller.signal });
  assert.equal(r.status, 'cancelled'); assert.equal(r.complete, false); assert.equal(a.calls.length, 0);
  assert.deepEqual(r.missing, []); assert.equal(r.unconfirmed.length, 3);
  assert.ok(r.unconfirmed.every(row => row.state === 'not-observed-unconfirmed'));
});

test('abort after directory response does not read any files or retain returned metadata', async () => {
  const controller = new AbortController(); let reads = 0;
  const r = await run({ signal: controller.signal, async readDirectory() { controller.abort(); return [file('a.bin', 540, A)]; },
    async readFile() { reads++; return tag(); } });
  assert.equal(r.status, 'cancelled'); assert.equal(reads, 0); assert.equal(r.files.length, 0);
});

test('abort during a file read discards returned bytes and stops the next read', async () => {
  const controller = new AbortController(); let reads = 0;
  const a = adapter({ 'E:/': [file('a.bin'), file('b.bin')] });
  const r = await auditCollection({ ...a.options, signal: controller.signal, async readFile() { reads++; controller.abort(); return tag(); } });
  assert.equal(r.status, 'cancelled'); assert.equal(reads, 1); assert.equal(r.stats.filesRead, 0);
  assert.equal(r.files[0].id, null); assert.equal(r.contentConfirmed, false);
});

test('session change after an awaited read discards content and returns an incomplete report', async () => {
  let alive = true, reads = 0;
  const a = adapter({ 'E:/': [file('a.bin'), file('b.bin')] });
  const r = await auditCollection({ ...a.options, assertSession() { if (!alive) throw new Error('secret connection detail'); },
    async readFile() { reads++; alive = false; return tag(); } });
  assert.equal(r.status, 'session-changed'); assert.equal(r.complete, false); assert.equal(r.files[0].id, null); assert.equal(reads, 1);
  assert.doesNotMatch(JSON.stringify(r), /secret connection detail/);
});

test('read error stops subsequent device IO and sanitizes transport error messages', async () => {
  let reads = 0;
  const a = adapter({ 'E:/': [file('a.bin'), file('b.bin')] });
  const r = await auditCollection({ ...a.options, async readFile() { reads++; throw new Error('UID=private-payload'); } });
  assert.equal(reads, 1); assert.equal(r.status, 'partial'); assert.equal(r.stats.readErrors, 1);
  assert.equal(r.errors[0].code, 'file-read-failed'); assert.equal(r.files[0].status, 'read-failed');
  assert.doesNotMatch(JSON.stringify(r), /private-payload/);
});

test('directory read failure cannot turn unvisited branches into confirmed absences', async () => {
  const a = adapter({ 'E:/': [folder('bad'), folder('later')] });
  const read = a.options.readDirectory;
  const r = await auditCollection({ ...a.options, async readDirectory(path) { if (path === 'E:/bad') throw new Error(); return read(path); } });
  assert.equal(r.complete, false); assert.equal(r.stats.readErrors, 1);
  assert.ok(!a.calls.some(c => c[1] === 'E:/later')); assert.deepEqual(r.missing, []);
  assert.equal(r.unconfirmed.length, 3); assert.ok(r.unconfirmed.every(x => x.state === 'not-observed-unconfirmed'));
});

for (const value of [new Uint8Array(532), new Uint8Array(541), new Uint8Array(10000), [1, 2]]) {
  test(`changed/invalid read length ${value.length} stops without claiming a checked file`, async () => {
    const r = await run({ readFile: async () => value });
    assert.equal(r.complete, false); assert.equal(r.stats.filesRead, 0);
    assert.equal(r.files[0].status, 'read-size-mismatch'); assert.equal(r.errors[0].code, 'read-size-mismatch');
  });
}

test('ArrayBuffer is accepted without retaining its byte storage', async () => {
  const data = tag(); const r = await run({ readFile: async () => data.buffer });
  data.fill(255); assert.equal(r.files[0].id, A);
  function walk(value) { assert.ok(!(value instanceof ArrayBuffer || ArrayBuffer.isView(value))); if (value && typeof value === 'object') Object.values(value).forEach(walk); }
  walk(r);
});

test('byte budget is charged before IO, including failures; exact boundary succeeds', async () => {
  const a = adapter({ 'E:/': [file('a.bin'), file('b.bin')] });
  const r = await auditCollection({ ...a.options, limits: { bytes: 540 } });
  assert.equal(r.stats.filesRead, 1); assert.equal(r.stats.bytesReserved, 540);
  assert.equal(r.complete, false); assert.deepEqual(r.limitsReached, ['bytes']); assert.equal(r.files[1].status, 'not-read-limit');
  const exact = await run({ limits: { bytes: 540 } }); assert.equal(exact.complete, true);
});

test('entry limit stops before scheduling or reading excess entries', async () => {
  const a = adapter({ 'E:/': [folder('s')], 'E:/s': [file('a.bin'), file('b.bin')] });
  const r = await auditCollection({ ...a.options, limits: { entries: 2 } });
  assert.equal(r.stats.entries, 2); assert.equal(r.stats.filesRead, 1); assert.equal(r.complete, false);
  assert.deepEqual(r.limitsReached, ['entries']);
});

test('candidate limit reports incomplete even if later files have matching metadata', async () => {
  const a = adapter({ 'E:/': [file('a.bin'), file('b.bin', 540, B)] });
  const r = await auditCollection({ ...a.options, limits: { candidates: 1 } });
  assert.equal(r.stats.filesRead, 1); assert.equal(r.stats.candidates, 1); assert.equal(r.complete, false);
  assert.deepEqual(r.limitsReached, ['candidates']); assert.deepEqual(r.missing, []); assert.ok(r.unconfirmed.some(x => x.id === B));
  assert.equal(r.stats.metadataMissing, 1); assert.equal(r.stats.candidateMetadataCount, 0);
});

for (const limits of [{ folders: 1 }, { depth: 0 }]) test(`folder/depth bound ${JSON.stringify(limits)} prevents nested IO`, async () => {
  const a = adapter({ 'E:/': [folder('s')], 'E:/s': [file('a.bin')] });
  const r = await auditCollection({ ...a.options, limits });
  assert.equal(r.complete, false); assert.equal(a.calls.length, 1); assert.equal(r.stats.filesRead, 0);
  assert.deepEqual(r.limitsReached, Object.keys(limits));
});

test('invalid and duplicate directory entries never escape the root or inflate presence', async () => {
  const a = adapter({ 'E:/': [file('../other.bin'), file('a.bin'), file('a.bin'), { ...file('bad.bin'), size: -1 }, folder('..')] });
  const r = await auditCollection(a.options);
  assert.equal(r.stats.filesRead, 1); assert.equal(r.stats.invalidEntries, 4); assert.equal(r.complete, false);
  assert.ok(a.calls.every(c => !c[1].includes('..')));
});

test('malformed or enormous directory responses stop before file IO', async () => {
  for (const entries of [null, {}, Array.from({ length: 8193 }, () => file('a.bin'))]) {
    const r = await run({ readDirectory: async () => entries });
    assert.equal(r.complete, false); assert.equal(r.stats.filesRead, 0); assert.equal(r.errors[0].code, 'invalid-directory-response');
  }
});

test('observer exceptions and observer mutation cannot change the audit or leak metadata notes', async () => {
  const a = adapter({ 'E:/': [{ ...file('a.bin', 540, A), meta: { ...meta(A), notes: 'private-note' } }] });
  const seen = [];
  const r = await auditCollection({ ...a.options, onProgress(p) { seen.push({ ...p }); p.filesRead = 999; throw new Error('observer'); } });
  assert.equal(r.complete, true); assert.equal(r.stats.filesRead, 1); assert.ok(seen.length);
  assert.doesNotMatch(JSON.stringify([r, seen]), /private-note|"bytes":\[/);
});

test('reads are strictly serial across directories and files', async () => {
  let active = 0, peak = 0;
  const a = adapter({ 'E:/': [folder('s'), file('a.bin'), file('b.bin')], 'E:/s': [file('c.bin')] });
  const wrap = fn => async (...args) => { active++; peak = Math.max(peak, active); await Promise.resolve(); const r = await fn(...args); active--; return r; };
  const r = await auditCollection({ ...a.options, readDirectory: wrap(a.options.readDirectory), readFile: wrap(a.options.readFile) });
  assert.equal(r.complete, true); assert.equal(peak, 1); assert.equal(r.stats.filesRead, 3);
});

test('invalid API, catalogue, root, dates and expanded budgets reject before IO', async () => {
  for (const options of [{ mode: 'anything' }, { rootPath: 'E:/../x' }, { rootPath: 'Z:/' }, { today: '2026-02-30' },
    { assertSession: undefined }, { readFile: undefined }, { catalogue: [] }, { catalogue: [cat(A), cat(A)] },
    { catalogue: [cat('not-id')] }, { limits: { bytes: COLLECTION_AUDIT_LIMITS.bytes + 1 } }, { limits: { depth: -1 } }]) {
    const a = adapter(); await assert.rejects(auditCollection({ ...a.options, ...options })); assert.equal(a.calls.length, 0);
  }
});

test('an empty directory reaches a complete scan without pretending catalogue figures exist', async () => {
  const r = await run({ readDirectory: async () => [] });
  assert.equal(r.complete, true); assert.equal(r.contentComplete, true); assert.equal(r.present.length, 0);
  assert.equal(r.missing.length, 3); assert.equal(r.upcoming.length, 1); assert.equal(r.claims.allFilesComplete, 'not-established');
});

test('the full 8192-file/16MiB boundary succeeds serially without keeping returned buffers', async () => {
  const shared = tag(V3, 2048); let active = 0, peak = 0;
  const r = await run({ readDirectory: async () => Array.from({ length: 8192 }, (_, i) => file(`f${i}.bin`, 2048)),
    async readFile(path, options) { active++; peak = Math.max(peak, active); assert.equal(options.maxBytes, 2048); await Promise.resolve(); active--; return shared; } });
  assert.equal(r.complete, true); assert.equal(r.stats.entries, 8192); assert.equal(r.stats.filesRead, 8192);
  assert.equal(r.stats.bytesRead, 16 * 1024 * 1024); assert.equal(peak, 1); assert.equal(r.duplicates[0].paths.length, 8192);
  shared.fill(0); assert.equal(r.files[8191].id, V3); assert.deepEqual(r.limitsReached, []);
});

test('an adapter cannot expand a listing size after IO begins to escape the reserved read budget', async () => {
  const entry = file('a.bin');
  const r = await run({ limits: { bytes: 540 }, readDirectory: async () => [entry], async readFile(path, options) {
    assert.equal(options.maxBytes, 540); entry.size = 2048; return tag(A, 2048);
  } });
  assert.equal(r.complete, false); assert.equal(r.files[0].size, 540); assert.equal(r.stats.bytesReserved, 540);
  assert.equal(r.stats.bytesRead, 0); assert.equal(r.errors[0].code, 'read-size-mismatch');
});

test('cancellation from progress preserves only completed observations and stops next IO', async () => {
  const controller = new AbortController(); const a = adapter({ 'E:/': [file('a.bin'), file('b.bin')] });
  const r = await auditCollection({ ...a.options, signal: controller.signal, onProgress(p) { if (p.filesRead === 1) controller.abort(); } });
  assert.equal(r.status, 'cancelled'); assert.equal(r.stats.filesRead, 1); assert.equal(r.contentConfirmed, false);
  assert.equal(a.calls.filter(c => c[0] === 'read').length, 1); assert.equal(r.present[0].id, A);
  assert.deepEqual(r.missing, []); assert.equal(r.unconfirmed.length, 2);
  assert.ok(r.unconfirmed.every(row => row.state === 'not-observed-unconfirmed'));
});

test('session change during a rejected read wins over generic transport failure and sanitizes the result', async () => {
  let alive = true;
  const r = await run({ assertSession() { if (!alive) throw new Error('private address'); },
    async readFile() { alive = false; throw new Error('private bytes'); } });
  assert.equal(r.status, 'session-changed'); assert.equal(r.stats.readErrors, 0); assert.equal(r.stats.filesRead, 0);
  assert.equal(r.complete, false); assert.doesNotMatch(JSON.stringify(r), /private (address|bytes)/);
});
