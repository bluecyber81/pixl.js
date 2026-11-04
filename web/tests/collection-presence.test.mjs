import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCollectionPresence, collectionPresenceFor } from '../src/lib/collection-presence.js';
import { auditCollection } from '../src/lib/collection-audit.js';

const A = '0000000000000102', B = '0000000000000202', C = '0000000000000302';
const present = (id = A) => ({ id, contentConfirmed: true, paths: [`E:/${id}.bin`] });
const file = (id = A, extra = {}) => ({ id, metadataId: id, path: `E:/${id}.bin`, size: 540, status: 'structure-consistent', issues: [], formatContext: 'classic-540', ...extra });
const missing = (id = B) => ({ id, state: 'no-structurally-consistent-file-observed' });
const report = (extra = {}) => ({ schema: 1, rootPath: 'E:/', mode: 'full', status: 'complete', complete: true, scanComplete: true, contentComplete: true,
  cancelled: false, sessionChanged: false, errors: [], limitsReached: [], stats: { readErrors: 0, invalidEntries: 0 },
  present: [present()], missing: [missing()], files: [file()], metadataMismatches: [], duplicates: [], ...extra });
const state = (summary, id) => collectionPresenceFor(summary, id).state;

test('completed full-drive scan maps confirmed content green and explicitly missing IDs red', () => {
  const s = buildCollectionPresence(report()); assert.equal(s.canConfirmMissing, true);
  assert.equal(state(s, A), 'present'); assert.equal(collectionPresenceFor(s, A).basis, 'content'); assert.equal(state(s, B), 'missing');
  assert.equal(state(s, C), 'unknown'); // A newer catalogue ID was never scanned.
});
test('missing flags all have to hold; one cancelled/partial/error/limit/scoped flag prevents red', () => {
  for (const change of [{ rootPath: 'E:/sub' }, { rootPath: 'I:/' }, { status: 'partial' }, { complete: false }, { scanComplete: false },
    { contentComplete: false }, { cancelled: true }, { sessionChanged: true }, { errors: [{}] }, { limitsReached: ['bytes'] },
    { stats: { readErrors: 1 } }, { stats: { invalidEntries: 1 } }, { missing: [{ id: B, state: 'not-observed-unconfirmed' }] }]) {
    const s = buildCollectionPresence(report(change)); assert.equal(state(s, B), 'unknown', JSON.stringify(change));
    assert.equal(state(s, A), 'present');
  }
});
test('quick mode can show metadata presence but cannot make absent cards red', () => {
  const s = buildCollectionPresence(report({ mode: 'quick', contentComplete: false,
    present: [{ ...present(), contentConfirmed: false }], files: [file(A, { status: 'metadata-only' })] }));
  assert.equal(state(s, A), 'present'); assert.equal(collectionPresenceFor(s, A).basis, 'metadata');
  assert.equal(s.canConfirmMissing, false); assert.equal(state(s, B), 'unknown'); assert.equal(s.status, 'quick');
});
test('stale report neutralizes both previous presence and absence without changing the report', () => {
  const r = report(), before = JSON.stringify(r), s = buildCollectionPresence(r, { stale: true });
  for (const id of [A, B, C]) assert.equal(state(s, id), 'stale');
  assert.equal(s.canConfirmMissing, false); assert.equal(JSON.stringify(r), before);
});
test('duplicate public IDs alone are green, not corruption or byte-equality evidence', () => {
  const s = buildCollectionPresence(report({ files: [file(), file(A, { path: 'E:/copy.bin' })], duplicates: [{ id: A, paths: ['E:/a.bin', 'E:/copy.bin'] }] }));
  assert.equal(state(s, A), 'present'); assert.equal(collectionPresenceFor(s, A).files, 2); assert.deepEqual(collectionPresenceFor(s, A).reasons, []);
});
test('a good copy plus another matching file with structural issues is orange', () => {
  const s = buildCollectionPresence(report({ files: [file(), file(A, { path: 'E:/bad.bin', status: 'attention', issues: ['bcc0'] })] }));
  assert.equal(state(s, A), 'attention'); assert.equal(collectionPresenceFor(s, A).basis, 'content');
  assert.ok(collectionPresenceFor(s, A).reasons.includes('bcc0'));
});
test('metadata mismatch colors actual content and contradicted metadata IDs orange with different basis', () => {
  const s = buildCollectionPresence(report({ files: [file(A, { metadataId: B })], metadataMismatches: [{ contentId: A, metadataId: B, path: `E:/${A}.bin` }] }));
  assert.equal(state(s, A), 'attention'); assert.equal(collectionPresenceFor(s, A).basis, 'content');
  assert.equal(state(s, B), 'attention'); assert.equal(collectionPresenceFor(s, B).basis, 'metadata');
});
for (const formatContext of ['classic-without-final-eight-bytes', 'classic-with-unverified-extra-bytes', 'two-kib-layout-not-fully-validated']) {
  test(`${formatContext} has an orange format limit without calling it damaged`, () => {
    const s = buildCollectionPresence(report({ files: [file(A, { formatContext })] }));
    assert.equal(state(s, A), 'attention'); assert.deepEqual(collectionPresenceFor(s, A).reasons, [formatContext]);
  });
}
test('unsupported or unread content with only a metadata ID cannot become green or red', () => {
  for (const status of ['unsupported-length', 'not-read-limit', 'read-failed', 'read-size-mismatch']) {
    const s = buildCollectionPresence(report({ present: [], files: [file(A, { id: null, status, issues: [] })], missing: [missing(A)] }));
    assert.equal(state(s, A), 'attention'); assert.equal(collectionPresenceFor(s, A).basis, 'metadata');
  }
});
test('upcoming absent IDs and IDs outside the report catalogue remain neutral', () => {
  const s = buildCollectionPresence(report({ upcoming: [{ id: C }] })); assert.equal(state(s, C), 'unknown');
});
test('missing rows cannot override positive evidence and unconfirmed present rows cannot create green', () => {
  assert.equal(state(buildCollectionPresence(report({ missing: [missing(A)] })), A), 'present');
  assert.equal(state(buildCollectionPresence(report({ present: [{ ...present(), contentConfirmed: false }], files: [], missing: [] })), A), 'unknown');
});
test('invalid, absent or over-limit reports fail neutral, without mutating caller objects', () => {
  for (const r of [null, {}, report({ schema: 2 }), report({ files: null }), report({ files: Array(8193).fill(file()) })]) {
    const s = buildCollectionPresence(r); assert.equal(s.status, 'none'); assert.equal(s.canConfirmMissing, false); assert.equal(state(s, A), 'unknown');
  }
  const r = report(); const serialized = JSON.stringify(r); const s = buildCollectionPresence(r);
  assert.equal(JSON.stringify(r), serialized); assert.throws(() => collectionPresenceFor(s, A).reasons.push('mutated'));
});
test('952 catalogue-sized IDs use bounded lookup and preserve each explicit absence decision', () => {
  const ids = Array.from({ length: 952 }, (_, i) => (i + 1).toString(16).padStart(16, '0'));
  const s = buildCollectionPresence(report({ files: [], present: [], missing: ids.map(id => missing(id)) }));
  assert.equal(s.byId.size, 952); for (const id of ids) assert.equal(state(s, id), 'missing');
});
test('actual audit output maps full, quick, partial and content mismatch without fabricated evidence fields', async () => {
  const data = new Uint8Array(540); data[0] = 4; data[3] = 0x8c; data.set(A.match(/../g).map(x => parseInt(x, 16)), 84);
  const options = { catalogue: [A, B].map(id => ({ id, name: id, release: { eu: '2020-01-01' } })), today: '2026-11-02', assertSession() {},
    readDirectory: async () => [{ name: 'a.bin', type: 0, size: 540, meta: { valid: true, amiibo: { head: 0, tail: parseInt(B.slice(8), 16) } } }], readFile: async () => data };
  const full = buildCollectionPresence(await auditCollection(options)); assert.equal(state(full, A), 'attention'); assert.equal(state(full, B), 'attention');
  const quick = buildCollectionPresence(await auditCollection({ ...options, mode: 'quick' })); assert.equal(state(quick, B), 'present'); assert.equal(state(quick, A), 'unknown');
  const partial = buildCollectionPresence(await auditCollection({ ...options, limits: { bytes: 1 } })); assert.equal(state(partial, A), 'unknown'); assert.equal(state(partial, B), 'attention');
});
