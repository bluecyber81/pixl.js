// Scoped regression for WEB-05. Execute actual operation source method;
// no Vue rendering or hardware claims. Choose original/patched component by env.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareFigureTransfer } from '../src/lib/figure-transfer.js';

const file = process.env.WEB_COLLECTION_SOURCE || new URL('../src/components/CollectionAssistant.vue', import.meta.url);
const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const fragment = source.match(/^    async operation\([^\n]*?\{[\s\S]*?^    },/m);
assert.ok(fragment, 'current production operation method found');
const operation = Function('return ({' + fragment[0] + '})')().operation;
const pendingFragment = source.match(/^    applyPendingFigureSelection\([^\n]*?\{[\s\S]*?^    },/m);
const applyPendingFigureSelection = pendingFragment ? Function('return ({' + pendingFragment[0] + '})')().applyPendingFigureSelection : undefined;
const ID = '0000000000000002';
const url = 'https://files.example.com/a.bin';
function bytes(id = ID) {
  const data = new Uint8Array(540); data.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4]); data.set(Buffer.from(id, 'hex'), 84); return data;
}
function context(de = true) {
  return { de, running: '', _serial: 0, _alive: true, generation: 1, connected: true, error: '',
    _pendingFigureSelection: null, applyPendingFigureSelection,
    setError(message) { this.error = message; }, $emit() {} };
}
const cases = [
  ['FIGURE_ID_MISMATCH', { file: bytes('0000000000000102') }, 'Die BIN-Datei gehört zu einer anderen Figur. Wähle die passende Datei aus.'],
  ['FIGURE_SIZE', { file: new Uint8Array(541) }, 'Die Dateigröße passt zu keinem unterstützten BIN-Format.'],
  ['FIGURE_STRUCTURE', { file: new Uint8Array(540) }, 'Die Datei hat keine passende BIN-Struktur.'],
  ['FIGURE_URL', { url: 'http://files.example.com/a.bin' }, 'Gib einen direkten öffentlichen HTTPS-Link zur BIN-Datei ein.'],
  ['FIGURE_NETWORK', { url, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }, 'Die Datei konnte nicht geladen werden. Prüfe Verbindung und Downloadlink.'],
  ['FIGURE_HTTP', { url, fetchImpl: async () => new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }) }, 'Die Quelle hat keine vollständig lesbare BIN-Datei geliefert.'],
  ['FIGURE_TIMEOUT', { url, timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }, 'Das Laden der Datei hat zu lange gedauert. Bitte erneut versuchen.'],
  ['FIGURE_STREAM', { url, fetchImpl: async () => ({ ok: true, status: 200 }) }, 'Der begrenzte Dateidownload ist fehlgeschlagen. Prüfe den Downloadlink.'],
  ['UPLOAD_CHANGED', { file: { size: 540, arrayBuffer: async () => new ArrayBuffer(532) } }, 'Die lokale Datei hat sich beim Lesen geändert. Wähle sie erneut aus.'],
];

test('WEB-05 actual wrong-ID path displays German guidance for a German preparation session', async () => {
  const [code, options, expected] = cases[0], vm = context();
  await assert.rejects(prepareFigureTransfer({ expectedId: ID, ...options }), { code });
  await operation.call(vm, 'prepare', signal => prepareFigureTransfer({ expectedId: ID, ...options, signal }));
  assert.equal(vm.error, expected); assert.equal(vm.running, '');
});

test('German preparation maps eight additional actual input/network errors without altering rejection', async () => {
  for (const [code, options, expected] of cases.slice(1)) {
    const vm = context();
    await assert.rejects(prepareFigureTransfer({ expectedId: ID, ...options }), { code });
    await operation.call(vm, 'prepare', signal => prepareFigureTransfer({ expectedId: ID, ...options, signal }));
    assert.equal(vm.error, expected, code); assert.equal(vm.running, '');
  }
});

test('English preparation retains every existing actual diagnostic message', async () => {
  for (const [, options] of cases) {
    let original;
    try { await prepareFigureTransfer({ expectedId: ID, ...options }); } catch (error) { original = error.message; }
    const vm = context(false);
    await operation.call(vm, 'prepare', signal => prepareFigureTransfer({ expectedId: ID, ...options, signal }));
    assert.equal(vm.error, original);
  }
});

test('cancellation, unknown errors and upload recovery semantics remain unchanged', async () => {
  for (const de of [true, false]) {
    const vm = context(de);
    await operation.call(vm, 'prepare', async () => { throw Object.assign(new Error('Abort'), { name: 'AbortError' }); });
    assert.equal(vm.error, de ? 'Vorgang abgebrochen.' : 'Operation cancelled.');
  }
  const vm = context(), unknown = new Error('Unknown detailed diagnostic');
  await operation.call(vm, 'prepare', async () => { throw unknown; }); assert.equal(vm.error, unknown.message);
  const events = []; vm.$emit = (...event) => events.push(event);
  const origin = { sessionGeneration: 1, deviceKey: 'synthetic-device' };
  const failed = Object.assign(new Error('Original upload recovery diagnostic'), { code: 'FIGURE_SIZE', recovery: { committed: null } });
  await operation.call(vm, 'upload', async () => { throw failed; }, origin);
  assert.equal(vm.error, failed.message);
  const recovery = events.find(([type]) => type === 'recovery');
  assert.equal(recovery[1].recovery.committed, null); assert.deepEqual(recovery[1].recoveryOrigin, origin);
  assert.deepEqual(events.filter(([type]) => ['busy', 'writing'].includes(type)), [['busy', true], ['writing', true], ['busy', false], ['writing', false]]);
});

test('old preparation cannot replace current-session feedback after invalidation', async () => {
  const vm = context(); let release;
  const pending = operation.call(vm, 'prepare', () => new Promise((resolve, reject) => { release = reject; }));
  ++vm._serial; vm.error = 'Current session feedback'; vm.running = 'new-operation';
  release(Object.assign(new Error('Old error'), { code: 'FIGURE_SIZE' })); await pending;
  assert.equal(vm.error, 'Current session feedback'); assert.equal(vm.running, 'new-operation');
});
