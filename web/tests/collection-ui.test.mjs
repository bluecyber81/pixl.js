import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import deLocale from '../src/i18n/de_DE.js';
import enLocale from '../src/i18n/en_US.js';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { auditCollection } from '../src/lib/collection-audit.js';
import { collectionCsv } from '../src/lib/collection-csv.js';
import { formatReadDuration, readTimeEstimate } from '../src/lib/read-time-estimate.js';
import { prepareFigureTransfer, suggestedFigureFilename } from '../src/lib/figure-transfer.js';
import { figureDownloadLinkKey, observeFigureDownloadLink, readFigureDownloadLink, writeFigureDownloadLink } from '../src/lib/figure-download-links.js';
import { filterCatalogue, releaseLabel } from '../src/lib/catalogue.js';

const file = process.env.PIXL_COLLECTION_SOURCE ? pathToFileURL(path.resolve(process.env.PIXL_COLLECTION_SOURCE)) :
  new URL('../src/components/CollectionAssistant.vue', import.meta.url);
const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file.pathname });
const script = compileScript(descriptor, { id: 'collection-ui' }).content.replace(/^import .*$/gm, '').replace('export default', 'const component=');
const compiled = compileTemplate({ source: descriptor.template.content, id: 'collection-ui', filename: file.pathname, compilerOptions: { hoistStatic: false } });
assert.deepEqual(compiled.errors, []);
const template = compiled.code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,
  (_, names) => `const {${names.replace(/\s+as\s+/g, ':')}}=Vue;`).replace('export function render', 'function render');
const make = new Function('Vue', 'baseline', 'checkCatalogueUpdates', 'auditCollection', 'prepareFigureTransfer',
  'transferFigureToDevice', 'suggestedFigureFilename', 'filterCatalogue', 'releaseLabel', 'saveBlob', 'saveBlobWithPicker','readTimeEstimate','formatReadDuration','readFigureDownloadLink','observeFigureDownloadLink','collectionCsv',
  script + '\n' + template + '\ncomponent.render=render;return component;');
const A = '0000000000000102', B = '0000000000000202';
const baseline = { checkedDate: '2026-11-02', entries: [A, B].map(id => ({ id, name: `Synthetic ${id}`, series: 'Test', release: { eu: '2020-01-01' } })) };
const tag = id => { const data = new Uint8Array(540); data[0] = 4; data[3] = 0x8c; data.set(id.match(/../g).map(x => parseInt(x, 16)), 84); return data; };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null, focus() {} });
const renderer = Vue.createRenderer({ createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (n, t) => n.text = t, setElementText: (n, t) => { n.text = t; n.children = []; }, patchProp: (n, k, old, value) => n.props[k] = value,
  insert(n, parent, anchor = null) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = parent; const i = parent.children.indexOf(anchor); i < 0 ? parent.children.push(n) : parent.children.splice(i, 0, n); },
  remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; }, parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] || null });
const flat = n => [n, ...n.children.flatMap(flat)], text = n => n.text + n.children.map(text).join('');
const tick = async () => { await Promise.resolve(); await Vue.nextTick(); };
function mount(overrides = {}) {
  const events = [], saves = [], reportEvents = [], staleEvents = [], root = node('root'); let vm;
  const props = Vue.reactive({ connected: true, blocked: false, generation: 1, revision: 0, directory: 'E:/', locale: 'de_DE',
    getSession: () => { const gen = props.generation; return {
      assertSession() { if (gen !== props.generation || !props.connected) throw Error('stale'); },
      readDirectory: async () => [], readFile: async () => tag(A), ...overrides.session,
    }; }, getTransferSession: () => ({ assertSession() {} }), ...overrides.props });
  const Component = make({ ...Vue, vModelText: {}, vModelSelect: {} }, baseline,
    overrides.catalogue || (async () => { throw Error('No network expected'); }), overrides.audit || auditCollection,
    overrides.prepare || prepareFigureTransfer, overrides.transfer || (async () => ({ committed: true })),
    suggestedFigureFilename, filterCatalogue, releaseLabel, (...args) => saves.push(args),
    async (...args) => { saves.push(args); return { status: overrides.pickerStatus || 'saved' }; },readTimeEstimate,formatReadDuration,overrides.readLink || readFigureDownloadLink,observeFigureDownloadLink,collectionCsv);
  const app = renderer.createApp({ render: () => Vue.h(Component, { ...props, ref: v => vm = v,
    onBusy: v => events.push(['busy', v]), onWriting: v => events.push(['writing', v]), onChanged: v => events.push(['changed', v]),
    onRecovery: v => events.push(['recovery', v]), onCatalogue: v => events.push(['catalogue', v]),
    onReport: v => reportEvents.push(v), onReportStale: v => staleEvents.push(v) }) });
  app.mount(root);
  return { root, props, app, events, saves, reportEvents, staleEvents, get vm() { return vm; }, button: label => flat(root).find(n => n.type === 'button' && text(n) === label) };
}
const partial = (mode = 'full') => ({ schema: 1, rootPath: 'E:/', mode, scanComplete: false, contentComplete: false, complete: false,
  present: [], missing: [], unconfirmed: [{ id: A, name: 'Not confirmed', state: 'not-observed-unconfirmed' }], upcoming: [], duplicates: [], unknown: [], files: [] });

test('catalogue local file handoff stages the verified bytes without uploading or replacing an active operation', async () => {
  const h = mount();
  try {
    const prepared = await prepareFigureTransfer({ file: tag(A), expectedId: A });
    h.props.directory = 'E:/Favourites';
    await tick();
    h.vm.choose(baseline.entries[1], false);
    assert.equal(h.vm.acceptCheckedFigure(prepared), true);
    h.props.selectedFigure = baseline.entries[0];
    await tick();
    assert.equal(h.vm.prepared, prepared);
    assert.equal(h.vm.chosen.id, A);
    assert.equal(h.vm.destination, 'E:/Favourites');
    assert.ok(h.vm.filename.endsWith(A + '.bin'));
    const second = await prepareFigureTransfer({ file: tag(B), expectedId: B });
    h.vm.running = 'upload';
    assert.equal(h.vm.acceptCheckedFigure(second), false);
    h.vm.running = '';
    h.props.blocked = true;
    await tick();
    assert.equal(h.vm.acceptCheckedFigure(second), false);
    assert.equal(h.vm.prepared, prepared);
    assert.deepEqual(h.events, []);
  } finally { h.app.unmount(); }
});

test('collection progress shows the measured countdown only during content reads and clears it on cancel', async () => {
  const gate = deferred(); let progress;
  const h = mount({audit: async options => { progress = options.onProgress; await gate.promise; return partial(); }});
  try {
    const pending = h.vm.scan();
    progress({phase:'listing', folders:2, candidates:10, filesRead:0, totalToRead:null});
    await tick(); assert.match(text(h.root), /2 Ordner gelesen/); assert.doesNotMatch(text(h.root), /Noch ca\./);
    progress({phase:'reading', folders:2, candidates:10, filesRead:0, totalToRead:10});
    progress({phase:'reading', folders:2, candidates:10, filesRead:2, totalToRead:10});
    // Place the reactive clock at known monotonic sample times.
    h.vm.progress = {...h.vm.progress, phaseStartedAt:1000, updatedAt:5000};
    h.props.readClock = 5000; await tick();
    assert.match(text(h.root), /2 \/ 10 Dateien gelesen/); assert.match(text(h.root), /Noch ca\. 0:16/);
    h.props.readClock = 6000; await tick(); assert.match(text(h.root), /Noch ca\. 0:15/);
    h.props.readClock = 14000; await tick(); assert.match(text(h.root), /Warte auf das Gerät/);
    h.vm.cancel(); await tick(); assert.match(text(h.root), /wird abgebrochen/); assert.doesNotMatch(text(h.root), /Warte auf das Gerät/);
    gate.resolve(); await pending; await tick(); assert.equal(h.vm.progress, null);
  } finally { h.app.unmount(); }
});

test('scan holds the BLE busy lock while an aborted read drains and disallows a second operation', async () => {
  const gate = deferred(); let lists = 0;
  const h = mount({ session: { readDirectory: () => { lists++; return gate.promise; } } });
  try {
    const pending = h.vm.scan(); await tick(); assert.equal(h.vm.running, 'scan'); assert.deepEqual(h.events, [['busy', true]]);
    await h.vm.scan(); h.vm.cancel(); await tick(); assert.equal(lists, 1); assert.equal(h.vm.running, 'scan');
    assert.deepEqual(h.events, [['busy', true]]); gate.resolve([]); await pending; await tick();
    assert.equal(h.vm.report.status, 'cancelled'); assert.equal(h.vm.report.scanComplete, false); assert.equal(h.vm.running, '');
    assert.deepEqual(h.events, [['busy', true], ['busy', false]]); assert.match(text(h.root), /Prüfung unvollständig/);
  } finally { h.app.unmount(); }
});

test('a previous-session scan cannot replace new results or release the newer busy lock', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const h = mount({ session: { readDirectory: () => ++calls === 1 ? old.promise : current.promise } });
  try {
    const first = h.vm.scan(); await tick(); h.props.generation = 2; await tick();
    const second = h.vm.scan(); await tick(); const eventCount = h.events.length;
    old.resolve([]); await first; await tick(); assert.equal(h.vm.report, null); assert.equal(h.vm.running, 'scan'); assert.equal(h.events.length, eventCount);
    current.resolve([]); await second; await tick(); assert.equal(h.vm.report.scanComplete, true); assert.equal(h.vm.running, '');
  } finally { h.app.unmount(); }
});

test('disconnect clears a prior report and prevents a late result from appearing', async () => {
  const gate = deferred(), h = mount({ audit: () => gate.promise });
  try { const active = h.vm.scan(); await tick(); h.props.connected = false; await tick(); gate.resolve(partial()); await active; await tick();
    assert.equal(h.vm.report, null); assert.equal(h.vm.running, ''); assert.doesNotMatch(text(h.root), /Not confirmed/);
  } finally { h.app.unmount(); }
});

test('upload is single-owner and keeps busy/writing locks until cancelled work settles', async () => {
  const gate = deferred(); let calls = 0, signal;
  const h = mount({ transfer: options => { calls++; signal = options.signal; return gate.promise; } });
  try {
    h.vm.choose(baseline.entries[0], false); await h.vm.prepare({ file: tag(A) });
    const active = h.vm.upload(); await tick(); await h.vm.upload(); h.vm.cancel(); await tick();
    assert.equal(calls, 1); assert.equal(signal.aborted, true); assert.equal(h.vm.running, 'upload');
    assert.deepEqual(h.events, [['busy', true], ['writing', true]]);
    gate.reject(Object.assign(Error('cancel'), { name: 'AbortError' })); await active; await tick();
    assert.equal(h.vm.running, ''); assert.deepEqual(h.events.slice(-2), [['busy', false], ['writing', false]]);
    assert.equal(h.events.filter(e => e[0] === 'changed').length, 0);
  } finally { h.app.unmount(); }
});

test('a late previous-session upload receipt must never refresh or attribute changes to the new device', async () => {
  const gate = deferred(), h = mount({ transfer: () => gate.promise });
  try {
    h.vm.choose(baseline.entries[0], false); await h.vm.prepare({ file: tag(A) }); const active = h.vm.upload(); await tick();
    h.props.generation = 2; await tick(); const before = h.events.length;
    gate.resolve({ committed: true, path: 'E:/old-device.bin' }); await active; await tick();
    assert.equal(h.events.length, before); assert.equal(h.events.filter(e => e[0] === 'changed').length, 0); assert.equal(h.vm.message, '');
  } finally { h.app.unmount(); }
});

test('a failed or uncertain upload immediately makes the previous collection report stale', async () => {
  const gate = deferred(), h = mount({ transfer: () => gate.promise });
  try {
    h.vm.report = { ...partial(), scanComplete: true }; h.vm.choose(baseline.entries[0], false); await h.vm.prepare({ file: tag(A) });
    const active = h.vm.upload(); await tick(); assert.equal(h.vm.stale, true);
    gate.reject(Error('uncertain close')); await active; await tick(); assert.equal(h.vm.stale, true); assert.match(text(h.root), /Seit dieser Prüfung.*Schreib- oder Wiederherstellungsvorgang/);
  } finally { h.app.unmount(); }
});

test('a foreign figure ID never becomes prepared or reaches the device transfer boundary', async () => {
  let calls = 0; const h = mount({ transfer: async () => { calls++; } });
  try {
    h.vm.choose(baseline.entries[0], false); await h.vm.prepare({ file: tag(B) }); await h.vm.upload(); await tick();
    assert.equal(h.vm.prepared, null); assert.equal(calls, 0); assert.match(h.vm.error, /gehört zu einer anderen Figur/);
  } finally { h.app.unmount(); }
});

test('cancelled local-file reading cannot publish a late prepared file', async () => {
  const gate = deferred(), h = mount();
  try {
    h.vm.choose(baseline.entries[0], false); const active = h.vm.prepare({ file: { size: 540, arrayBuffer: () => gate.promise } }); await tick();
    h.vm.cancel(); gate.resolve(tag(A).buffer); await active; await tick(); assert.equal(h.vm.prepared, null); assert.match(h.vm.error, /abgebrochen/);
  } finally { h.app.unmount(); }
});

test('changing the selected figure removes prepared bytes and cannot redirect an existing prepared upload', async () => {
  const h = mount();
  try { h.vm.choose(baseline.entries[0], false); await h.vm.prepare({ file: tag(A) }); assert.equal(h.vm.prepared.id, A);
    h.props.selectedFigure = baseline.entries[1]; await tick(); assert.equal(h.vm.chosen.id, B); assert.equal(h.vm.prepared, null);
  } finally { h.app.unmount(); }
});

test('each figure selection prefills only its own saved URL and clears drafts from other figures', async () => {
  const savedA = 'https://files.example.com/A.bin';
  const h = mount({ props: { selectedFigure: baseline.entries[0] }, readLink: id => id === A ? savedA : '' });
  try {
    assert.equal(h.vm.sourceUrl, savedA);
    h.vm.sourceUrl = 'https://files.example.com/private-draft.bin?key=x';
    h.props.selectedFigure = baseline.entries[1];
    await tick();
    assert.equal(h.vm.sourceUrl, '');
    h.vm.chooseById(A);
    assert.equal(h.vm.sourceUrl, savedA);
    h.props.selectedFigure = null;
    await tick();
    assert.equal(h.vm.sourceUrl, '');
  } finally { h.app.unmount(); }
});

test('saved and removed links update a selected figure across tabs while drafts and prepared files stay intact', async () => {
  const values = new Map(), browser = new EventTarget();
  browser.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  const h = mount({ props: { selectedFigure: baseline.entries[0] } });
  const source = 'https://files.example.com/A.bin', second = 'https://files.example.com/new.bin';
  const storageChanged = key => browser.dispatchEvent(Object.assign(new Event('storage'), { key }));
  try {
    writeFigureDownloadLink(A, source);
    assert.equal(h.vm.sourceUrl, source);
    writeFigureDownloadLink(B, second);
    assert.equal(h.vm.sourceUrl, source);
    writeFigureDownloadLink(A, '');
    assert.equal(h.vm.sourceUrl, '');
    values.set(figureDownloadLinkKey(A), second);
    storageChanged(figureDownloadLinkKey(B));
    assert.equal(h.vm.sourceUrl, '');
    storageChanged(figureDownloadLinkKey(A));
    assert.equal(h.vm.sourceUrl, second);
    values.clear();
    storageChanged(null);
    assert.equal(h.vm.sourceUrl, '');

    h.vm.sourceUrl = 'https://files.example.com/draft.bin';
    writeFigureDownloadLink(A, source);
    assert.equal(h.vm.sourceUrl, 'https://files.example.com/draft.bin');
    h.vm.chooseById(A);
    const gate = deferred();
    const reading = h.vm.prepare({ file: { size: 540, arrayBuffer: () => gate.promise } });
    writeFigureDownloadLink(A, second);
    assert.equal(h.vm.sourceUrl, source);
    gate.resolve(tag(A).buffer);
    await reading;
    await tick();
    assert.equal(h.vm.sourceUrl, source);
    assert.deepEqual(h.vm.prepared.bytes, tag(A));
    writeFigureDownloadLink(A, '');
    assert.equal(h.vm.sourceUrl, source);
    assert.deepEqual(h.vm.prepared.bytes, tag(A));
    h.vm.clearPrepared();
    await tick();
    assert.equal(h.vm.sourceUrl, '');
    assert.deepEqual(h.events, []);
    assert.deepEqual(h.saves, []);
  } finally {
    h.app.unmount();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('partial and quick result views explicitly withhold full-content and absence claims', async () => {
  const h = mount({ audit: async () => partial() });
  try {
    await h.vm.scan(); await tick(); assert.match(text(h.root), /Prüfung unvollständig/); assert.doesNotMatch(text(h.root), /Bestand vollständig durchlaufen/);
    assert.equal(h.vm.filter, 'unconfirmed'); assert.match(text(h.root), /Bestand nicht bestimmbar/);
    assert.doesNotMatch(text(h.root), /Keine passende Datei|Nicht gefunden/);
    h.vm.report = { ...partial('quick'), scanComplete: true, complete: true }; await tick();
    assert.match(text(h.root), /nicht aus geprüften Dateien/); assert.doesNotMatch(text(h.root), /Bestand vollständig durchlaufen/);
    assert.match(text(h.root), /keine HMAC-\/Signaturprüfung/);
  } finally { h.app.unmount(); }
});

test('actual zero-ID quick result explains neutral cards in DE/EN and its button checks contents in the selected folder', async () => {
  const lists = [], reads = [];
  const h = mount({ props: { directory: 'E:/figures' }, session: {
    readDirectory: async path => { lists.push(path); return [{ name: 'figure.bin', type: 0, size: 540, meta: { valid: true, amiibo: { head: 0, tail: 0 } } }]; },
    readFile: async path => { reads.push(path); return tag(A); },
  } });
  try {
    h.vm.scope = 'folder'; h.vm.mode = 'quick'; await h.vm.scan(); await tick();
    assert.equal(h.vm.report.stats.metadataMissing, 1); assert.equal(h.vm.report.stats.candidateMetadataCount, 0);
    assert.deepEqual(h.vm.report.missing, []); assert.equal(h.vm.report.unconfirmed.length, 2);
    assert.equal(h.vm.filter, 'unconfirmed'); assert.deepEqual(reads, []);
    assert.match(text(h.root), /1 Dateien ohne Figuren-ID in Eigenschaften; Inhaltsprüfung nötig/);
    assert.match(text(h.root), /Bestand nicht bestimmbar/); assert.doesNotMatch(text(h.root), /Keine passende Datei|Nicht gefunden/);
    h.props.locale = 'en'; await tick(); assert.match(text(h.root), /1 files without a figure ID in their properties; a content check is needed/);
    assert.match(text(h.root), /Presence undetermined/); assert.doesNotMatch(text(h.root), /No matching file|Not found/);
    const button = h.button('Check file contents in the selected scope'); assert.equal(button.props.disabled, false);
    await button.props.onClick(); await tick();
    assert.equal(h.vm.mode, 'full'); assert.equal(h.vm.report.rootPath, 'E:/figures'); assert.equal(h.vm.report.contentComplete, true);
    assert.deepEqual(lists, ['E:/figures', 'E:/figures']); assert.deepEqual(reads, ['E:/figures/figure.bin']);
    assert.equal(h.vm.report.present[0].id, A); assert.deepEqual(h.vm.report.unconfirmed, []);
    assert.equal(h.vm.filter, 'missing'); assert.match(text(h.root), /No matching file found in the checked scope/);
  } finally { h.app.unmount(); }
});

test('quick-to-content action honors the global lock and keeps single-owner cancellation semantics', async () => {
  const gate = deferred(); let sessions = 0;
  const h = mount({ props: { blocked: true, getSession() { sessions++; return { assertSession() {}, readDirectory: () => gate.promise, readFile: async () => tag(A) }; } } });
  try {
    h.vm.mode = 'quick'; h.vm.report = { ...partial('quick'), stats: { metadataMissing: 1, candidates: 1, candidateMetadataCount: 0 } };
    await tick(); assert.equal(h.button('Dateiinhalte im gewählten Bereich prüfen').props.disabled, true);
    await h.vm.scanContents(); assert.equal(h.vm.mode, 'quick'); assert.equal(sessions, 0);
    h.props.blocked = false; h.vm.scope = 'folder'; h.props.directory = ''; await tick();
    await h.vm.scanContents(); assert.equal(sessions, 0); assert.equal(h.vm.mode, 'quick');
    h.vm.scope = 'device'; await tick(); const active = h.vm.scanContents(); await tick();
    await h.vm.scanContents(); h.vm.cancel(); await tick();
    assert.equal(sessions, 1); assert.equal(h.vm.running, 'scan'); assert.deepEqual(h.events, [['busy', true]]);
    gate.resolve([]); await active; await tick();
    assert.equal(h.vm.report.status, 'cancelled'); assert.deepEqual(h.vm.report.missing, []); assert.equal(h.vm.filter, 'unconfirmed');
    assert.deepEqual(h.events, [['busy', true], ['busy', false]]);
  } finally { h.app.unmount(); }
});

test('revision changes mark completed reports stale without silently rerunning any device reads', async () => {
  let reads = 0; const h = mount({ session: { readDirectory: async () => { reads++; return []; } } });
  try { await h.vm.scan(); await tick(); assert.equal(h.vm.stale, false); const before = reads;
    h.props.revision++; await tick(); assert.equal(h.vm.stale, true); assert.equal(reads, before); assert.match(text(h.root), /Seit dieser Prüfung.*Schreib- oder Wiederherstellungsvorgang/);
  } finally { h.app.unmount(); }
});

test('save report is disabled and method-guarded while another operation is in flight', async () => {
  const gate = deferred(), h = mount({ catalogue: () => gate.promise });
  try {
    h.vm.report = partial(); const active = h.vm.checkUpdates(); await tick();
    assert.equal(h.button('Prüfbericht speichern').props.disabled, true); await h.vm.saveReport(); assert.equal(h.saves.length, 0);
    gate.reject(Object.assign(Error('cancelled'), { name: 'AbortError' })); await active;
  } finally { h.app.unmount(); }
});

test('external BLE lock blocks scan and upload before obtaining any adapters', async () => {
  let sessions = 0; const h = mount({ props: { blocked: true, getSession: () => { sessions++; }, getTransferSession: () => { sessions++; } } });
  try { h.vm.choose(baseline.entries[0], false); await h.vm.prepare({ file: tag(A) }); await h.vm.scan(); await h.vm.upload();
    assert.equal(sessions, 0); assert.equal(h.events.length, 0);
  } finally { h.app.unmount(); }
});

test('unmounted component cannot publish late scan results or busy events', async () => {
  const gate = deferred(), h = mount({ audit: () => gate.promise }); const active = h.vm.scan(); await tick();
  h.app.unmount(); const count = h.events.length; gate.resolve(partial()); await active; assert.equal(h.events.length, count);
});

// Use the production App Options API; no copied lock/session implementation.
const appFile = new URL('../src/App.vue', import.meta.url);
const appDescriptor = parse(fs.readFileSync(appFile, 'utf8'), { filename: appFile.pathname }).descriptor;
function appOptions(proto = {}, pixl = {}) {
  return new Function('defineAsyncComponent', 'DeviceStorageCard', 'catalogueBaseline', 'proto', 'pixl',
    appDescriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'return'))(loader => ({ loader }), {name:'DeviceStorageCard'}, baseline, proto, pixl);
}
test('App applies collection busy to global operation lock and writing to disconnect lock', () => {
  const options = appOptions(), state = options.data.call({ $t: x => x });
  state.collectionBusy = true; assert.equal(options.computed.busy.call(state), true);
  assert.equal(!!options.computed.connectionDisconnectLocked.call(state), false);
  state.collectionWriting = true; assert.equal(options.computed.connectionDisconnectLocked.call(state), true);
  for (const [field, previous] of [['mutating', false], ['pendingUploads', 0], ['syncing', false], ['zipBusy', false], ['migrationBusy', false], ['collectionWriting', false]]) {
    const before = state.collectionRevision; options.watch[field].call(state, field === 'pendingUploads' ? 1 : true, previous); assert.equal(state.collectionRevision, before + 1, field);
  }
});

test('App search adapter rejects an old-session directory response before exposing it to collection UI', async () => {
  const gate = deferred(); const options = appOptions({ vfs_read_folder: () => gate.promise });
  const state = { sessionGeneration: 1, connected: true, assert_session(generation) { if (generation !== this.sessionGeneration) throw Error('stale'); }, checked: value => value.data };
  const session = options.methods.device_search_session.call(state), pending = session.readDirectory('E:/');
  state.sessionGeneration = 2; gate.resolve({ data: [] }); await assert.rejects(pending, /stale/);
});

test('App mounts collection with v-show workspace persistence and binds revision/locks', () => {
  const tpl = appDescriptor.template.content;
  assert.match(tpl, /v-show="activeWorkspace === 'catalogue'"/); assert.match(tpl, /:revision="collectionRevision"/);
  assert.match(tpl, /@busy="collectionBusy = \$event"/); assert.match(tpl, /@writing="collectionWriting = \$event"/);
  for (const name of ['App', 'CollectionAssistant', 'CataloguePanel', 'FigureDetails']) {
    const url = name === 'App' ? appFile : new URL(`../src/components/${name}.vue`, import.meta.url);
    const { descriptor } = parse(fs.readFileSync(url, 'utf8'), { filename: url.pathname });
    compileScript(descriptor, { id: name });
    const result = compileTemplate({ source: descriptor.template.content, id: name, filename: url.pathname });
    assert.deepEqual(result.errors, [], name);
  }
});

// Compile/mount the actual script-setup catalogue and details with real i18n.
// Only the DOM host and unrelated local-file inspector are replaced at the boundary.
async function loadSfc(filename) {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  const compiledScript = compileScript(descriptor, { id: filename });
  let source = compiledScript.content.replace('export default', 'const Component =');
  const tpl = compileTemplate({ source: descriptor.template.content, id: filename, filename,
    compilerOptions: { hoistStatic: false, bindingMetadata: compiledScript.bindings } });
  assert.deepEqual(tpl.errors, []);
  source += '\n' + tpl.code.replace('export function render', 'function render') + '\nComponent.render=render;return Component;';
  const imports = [];
  source = source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, binding, spec) => { imports.push({ binding, spec }); return ''; });
  const modules = [];
  for (const { spec } of imports) {
    if (spec === 'vue') modules.push({ ...Vue, vModelText: {}, vModelSelect: {}, vModelCheckbox: {} });
    else if (spec === 'vue-i18n') modules.push(VueI18n);
    else {
      const target = path.resolve(path.dirname(filename), spec);
      modules.push(spec.endsWith('LocalTagInspector.vue') ? { default: { render: () => null } } : spec.endsWith('.vue') ? { default: await loadSfc(target) } :
        spec.endsWith('.json') ? { default: JSON.parse(fs.readFileSync(target, 'utf8')) } : await import(pathToFileURL(target)));
    }
  }
  const bindings = imports.map(({ binding }, i) => binding.startsWith('{') ? `const ${binding.replace(/\s+as\s+/g, ':')}=modules[${i}];` : `const ${binding}=modules[${i}].default;`).join('\n');
  return new Function('modules', bindings + '\n' + source)(modules);
}
async function mountSfc(name, values) {
  const Component = await loadSfc(fileURLToPath(new URL(`../src/components/${name}.vue`, import.meta.url)));
  const props = Vue.reactive(values), root = node('root'), app = renderer.createApp({ render: () => Vue.h(Component, props) });
  app.use(VueI18n.createI18n({ legacy: false, locale: 'de_DE', fallbackLocale: 'en', messages: { de_DE: deLocale, en: enLocale } }));
  app.mount(root); await tick(); return { props, root, app };
}
test('new catalogue selection passes the real public entry and respects the BLE operation block', async () => {
  const selected = [], source = { ...baseline, commit: 'a'.repeat(40), sourceUrl: 'https://github.com/8bitDream/AmiiboAPI' };
  const h = await mountSfc('CataloguePanel', { catalogue: source, blocked: true, onSelectEntry: e => selected.push(e) });
  try {
    const button = () => flat(h.root).find(n => n.type === 'button' && text(n) === 'Details und Bild');
    assert.equal(button().props.disabled, true); await button().props.onClick({ currentTarget: {} }); assert.equal(selected.length, 0);
    h.props.blocked = false; await tick(); await button().props.onClick({ currentTarget: {} }); await tick();
    assert.equal(selected.length, 1); assert.equal(selected[0].id, A); assert.match(text(h.root), /Synthetic 0000000000000102/);
  } finally { h.app.unmount(); }
});

test('figure image requires a click, uses the pinned online catalogue commit and resets on ID change', async () => {
  const h = await mountSfc('FigureDetails', { id: A, catalogueEntry: baseline.entries[0], imageCommit: 'b'.repeat(40) });
  try {
    assert.equal(flat(h.root).filter(n => n.type === 'img').length, 0);
    flat(h.root).find(n => n.type === 'button' && text(n) === 'Bild einmal laden').props.onClick(); await tick();
    const img = flat(h.root).find(n => n.type === 'img'); assert.ok(img.props.src.includes('/' + 'b'.repeat(40) + '/images/')); assert.equal(img.props.referrerpolicy, 'no-referrer');
    h.props.id = B; h.props.catalogueEntry = baseline.entries[1]; await tick(); assert.equal(flat(h.root).filter(n => n.type === 'img').length, 0);
    assert.match(text(h.root), /Synthetic 0000000000000202/); assert.doesNotMatch(text(h.root), /Synthetic 0000000000000102/);
  } finally { h.app.unmount(); }
});

test('a catalogue-entry prop for a different ID cannot label the selected figure incorrectly', async () => {
  const h = await mountSfc('FigureDetails', { id: A, catalogueEntry: { ...baseline.entries[1], name: 'WRONG-FIGURE-NAME' } });
  try { assert.doesNotMatch(text(h.root), /WRONG-FIGURE-NAME/); assert.match(text(h.root), /ID im Katalog unbekannt/); }
  finally { h.app.unmount(); }
});

test('532/572/2048 files expose their size and format limits in the actual DE/EN result view without being called corrupt', async () => {
  const files = [
    { path: 'E:/short.bin', size: 532, id: A, status: 'structure-consistent', issues: [], formatContext: 'classic-without-final-eight-bytes' },
    { path: 'E:/extended.bin', size: 572, id: A, status: 'structure-consistent', issues: [], formatContext: 'classic-with-unverified-extra-bytes' },
    { path: 'E:/two-k.bin', size: 2048, id: B, status: 'structure-consistent', issues: [], formatContext: 'two-kib-layout-not-fully-validated' },
    { path: 'E:/classic.bin', size: 540, id: A, status: 'structure-consistent', issues: [], formatContext: 'classic-540' },
  ];
  const h = mount();
  try {
    h.vm.report = { ...partial(), scanComplete: true, files }; h.vm.filter = 'issues'; await tick();
    assert.equal(h.vm.issues.length, 3); assert.match(text(h.root), /532 Bytes · Verkürzter klassischer Dump: letzte 8 Bytes nicht enthalten/);
    assert.match(text(h.root), /572 Bytes · Klassischer Dump mit ungeprüftem Zusatzbereich/);
    assert.match(text(h.root), /2048 Bytes · 2-KiB-Datei: Größe und öffentliche ID geprüft; übriges Layout nicht vollständig geprüft/);
    assert.doesNotMatch(text(h.root), /kaputt|beschädigt|corrupt/);
    h.props.locale = 'en'; await tick();
    assert.match(text(h.root), /532 Bytes · Short classic dump: final 8 bytes not included/);
    assert.match(text(h.root), /572 Bytes · Classic dump with unchecked extra data/);
    assert.match(text(h.root), /2048 Bytes · 2 KiB file: size and public ID checked; remaining layout not fully checked/);
    h.vm.report = { ...h.vm.report, mode: 'quick' }; await tick();
    assert.match(text(h.root), /2 KiB file according to directory; contents and layout unchecked/);
    assert.doesNotMatch(text(h.root), /size and public ID checked/);
    h.props.locale = 'de_DE'; await tick();
    assert.match(text(h.root), /2-KiB-Datei laut Verzeichnis; Inhalt und Layout ungeprüft/);
    assert.doesNotMatch(text(h.root), /Größe und öffentliche ID geprüft/);
  } finally { h.app.unmount(); }
});

test('collection report and stale transitions are emitted to the catalogue owner and cleared on disconnect', async () => {
  const h = mount();
  try {
    await h.vm.scan(); await tick(); assert.equal(h.reportEvents.at(-1)?.scanComplete, true);
    h.props.revision++; await tick(); assert.equal(h.staleEvents.at(-1), true);
    h.props.connected = false; await tick(); assert.equal(h.reportEvents.at(-1), null); assert.equal(h.staleEvents.at(-1), false);
  } finally { h.app.unmount(); }
});

test('App clears catalogue presence on disconnect/error and binds both report and stale props', async () => {
  const options = appOptions({}, { get_connection_state: () => 'disconnected' });
  for (const method of ['on_ble_disconnected', 'on_ble_connect_error']) {
    const state = { ...options.data.call({ $t: x => x }), collectionReport: partial(), collectionStale: true, $t: x => x, $notify() {} };
    for (const name of ['reset_figure_info', 'remember_interruption', 'clear_dfu_attempt', 'clear_migration_restart',
      'refresh_local_metrics', 'invalidate_sync', 'invalidate_zip', 'refresh_backup_checkpoint', 'set_transfer']) state[name] = () => {};
    options.methods[method].call(state, Error('synthetic'));
    assert.equal(state.collectionReport, null, method); assert.equal(state.collectionStale, false, method);
    await Promise.resolve();
  }
  assert.match(appDescriptor.template.content, /:collection-report="cataloguePresenceReport"/);
  assert.match(appDescriptor.template.content, /:collection-stale="collectionStale"/);
  assert.match(appDescriptor.template.content, /@report="on_collection_report"/);
  assert.match(appDescriptor.template.content, /@report-stale="on_collection_stale"/);
  assert.match(appDescriptor.template.content, /:collection-historical="catalogueObservationHistorical"/);
  assert.match(appDescriptor.template.content, /:collection-observed-at="catalogueObservationAt"/);
});

test('Figurensammlung explains the orange outline before connecting or scanning', async () => {
  const h = mount();
  try {
    h.props.connected = false; await tick();
    assert.match(text(h.root), /Was bedeutet Orange/);
    assert.match(text(h.root), /Figuren-ID in den Eigenschaften vom Dateiinhalt abweicht/);
    h.props.locale = 'en_US'; await tick();
    assert.match(text(h.root), /Each orange-bordered card shows the reason/);
  } finally { h.app.unmount(); }
});

test('whole catalogue cards render green/red/orange states with text, and stale/quick states cannot retain red', async () => {
  const full = { ...partial(), status: 'complete', complete: true, scanComplete: true, contentComplete: true, errors: [], limitsReached: [], stats: {},
    present: [{ id: A, contentConfirmed: true, paths: ['E:/a.bin'] }], missing: [{ id: B, state: 'no-structurally-consistent-file-observed' }],
    files: [{ id: A, metadataId: A, path: 'E:/a.bin', status: 'structure-consistent', issues: [], formatContext: 'classic-540' }], metadataMismatches: [] };
  const source = { ...baseline, commit: 'a'.repeat(40), sourceUrl: 'https://github.com/8bitDream/AmiiboAPI' };
  const h = await mountSfc('CataloguePanel', { catalogue: source, collectionReport: full, collectionStale: false });
  const cards = () => flat(h.root).filter(n => n.type === 'li' && n.props['data-presence']);
  try {
    assert.deepEqual(cards().map(n => n.props['data-presence']), ['present', 'missing']);
    assert.match(cards()[0].props.class, /presence-present/); assert.match(text(cards()[0]), /Vorhanden · ID bestätigt/);
    assert.match(cards()[1].props.class, /presence-missing/); assert.match(text(cards()[1]), /Nicht gefunden/);
    h.props.collectionReport = { ...full, files: [{ ...full.files[0], formatContext: 'classic-without-final-eight-bytes' }] }; await tick();
    assert.equal(cards()[0].props['data-presence'], 'attention'); assert.match(text(cards()[0]), /Vorhanden · Abweichung prüfen/);
    assert.match(text(cards()[0]), /532-Byte-Format/); assert.doesNotMatch(text(cards()[1]), /532-Byte-Format/);
    h.props.collectionReport = { ...full, files: [{ ...full.files[0], metadataId: B }] }; await tick();
    for (const card of cards()) assert.match(text(card), /Figuren-ID in den Dateieigenschaften weicht/);
    assert.match(text(cards()[1]), /Eigenschaften nennen ID/);
    h.props.collectionStale = true; await tick(); assert.doesNotMatch(text(h.root), /Figuren-ID in den Dateieigenschaften weicht/); assert.ok(cards().every(n => n.props['data-presence'] === 'stale')); assert.match(text(h.root), /Prüfung veraltet/);
    h.props.collectionStale = false; h.props.collectionReport = { ...full, mode: 'quick', contentComplete: false,
      files: [{ ...full.files[0], status: 'metadata-only' }], present: [{ ...full.present[0], contentConfirmed: false }] }; await tick();
    assert.deepEqual(cards().map(n => n.props['data-presence']), ['present', 'unknown']); assert.match(text(cards()[0]), /Vorhanden laut Eigenschaften/);
    assert.equal(flat(h.root).filter(n => n.type === 'button' && text(n) === 'Details und Bild').length, 2);
  } finally { h.app.unmount(); }
  const sourceText = fs.readFileSync(new URL('../src/components/CataloguePanel.vue', import.meta.url), 'utf8');
  for (const state of ['present', 'attention', 'missing']) assert.match(sourceText, new RegExp(`\\.entries li\\.presence-${state} \\{ border:3px solid #[a-f0-9]{6};`));
});

test('real reports without properties IDs render neutral in quick mode, green/red after full drive scan, and no red for a folder', async () => {
  const options = { catalogue: baseline.entries, assertSession() {},
    readDirectory: async () => [{ name: 'figure.bin', type: 0, size: 540 }], readFile: async () => tag(A) };
  const quick = await auditCollection({ ...options, mode: 'quick' });
  const h = await mountSfc('CataloguePanel', { catalogue: { ...baseline, commit: 'a'.repeat(40), sourceUrl: 'https://github.com/8bitDream/AmiiboAPI' }, collectionReport: quick, collectionStale: false });
  const cards = () => flat(h.root).filter(n => n.type === 'li' && n.props['data-presence']);
  try {
    assert.deepEqual(cards().map(n => n.props['data-presence']), ['unknown', 'unknown']);
    const full = await auditCollection(options); h.props.collectionReport = full; await tick();
    assert.deepEqual(cards().map(n => n.props['data-presence']), ['present', 'missing']);
    assert.match(text(cards()[0]), /Vorhanden · ID bestätigt/); assert.match(text(cards()[1]), /Nicht gefunden/);
    h.props.collectionReport = await auditCollection({ ...options, rootPath: 'E:/figures' }); await tick();
    assert.deepEqual(cards().map(n => n.props['data-presence']), ['present', 'unknown']);
  } finally { h.app.unmount(); }
});

function duplicateFixture() {
  const reads = [], lists = [], changed = tag(A); changed[100] = 42;
  const contents = new Map([['E:/a.bin', tag(A)], ['E:/copy.bin', tag(A)], ['E:/changed.bin', changed]]);
  return { reads, lists, session: {
    readDirectory: async path => {
      lists.push(path);
      return [...contents.keys()].map(path => ({ name: path.slice(3), type: 0, size: 540,
        meta: { valid: true, amiibo: { head: parseInt(A.slice(0, 8), 16), tail: parseInt(A.slice(8), 16) } } }));
    },
    readFile: async (path, options) => { reads.push(path); assert.equal(options.maxBytes, 540); return contents.get(path).slice(); },
  } };
}
const reportList = root => flat(root).find(n => n.type === 'ul' && n.props.class === 'report-list');

test('CSV exports the current completed scan from memory and refuses stale or unfinished scans', async () => {
  const fixture = duplicateFixture(), h = mount({ session: fixture.session });
  try {
    await h.vm.scan(); await tick();
    const csvButton = h.button('Bestand als CSV speichern');
    assert.equal(csvButton.props.disabled, false);
    await csvButton.props.onClick();
    const [blob, filename] = h.saves[0];
    assert.equal(filename, 'Allmiibo-Figurenbestand.csv');
    assert.equal(blob.type, 'text/csv;charset=utf-8');
    assert.deepEqual([...new Uint8Array(await blob.slice(0, 3).arrayBuffer())], [239, 187, 191]);
    const output = await blob.text();
    assert.equal(output.trimEnd().split('\r\n').length, 5);
    for (const path of ['E:/a.bin', 'E:/copy.bin', 'E:/changed.bin']) assert.ok(output.includes('"0x' + A + '";"Vorhanden · ID bestätigt";"' + path + '"'));
    assert.ok(output.includes('"0x' + B + '";"Nicht gefunden";""'));
    h.props.locale = 'en_US'; await tick(); await h.button('Save collection as CSV').props.onClick();
    assert.equal(h.saves[1][1], 'Allmiibo-Collection.csv');
    assert.match(await h.saves[1][0].text(), /"Collection status","Device path"/);
    h.props.revision++; await tick();
    assert.equal(h.button('Save collection as CSV').props.disabled, true);
    await h.vm.saveReport('csv'); assert.equal(h.saves.length, 2);
    h.vm.report = partial(); h.vm.stale = false; await tick();
    assert.equal(h.button('Save collection as CSV').props.disabled, true);
    await h.vm.saveReport('csv'); assert.equal(h.saves.length, 2);
    h.props.connected = false; await tick();
    await h.vm.saveReport('csv'); assert.equal(h.saves.length, 2);
    assert.deepEqual(fixture.lists, ['E:/']); assert.equal(fixture.reads.length, 3);
  } finally { h.app.unmount(); }
});

test('CSV cancellation never triggers a second download; browsers without a picker use the fallback', async () => {
  for (const pickerStatus of ['cancelled', 'unsupported']) {
    const h = mount({ pickerStatus });
    try {
      await h.vm.scan(); await h.vm.saveReport('csv');
      assert.equal(h.saves.length, pickerStatus === 'unsupported' ? 2 : 1);
      if (pickerStatus === 'unsupported') assert.deepEqual(h.saves[0], h.saves[1]);
    } finally { h.app.unmount(); }
  }
});

test('actual duplicate scan renders two matching files separately from one different payload in DE and EN', async () => {
  const fixture = duplicateFixture(), h = mount({ session: fixture.session });
  try {
    await h.vm.scan(); h.vm.filter = 'duplicates'; await tick();
    assert.deepEqual(fixture.lists, ['E:/']); assert.deepEqual(fixture.reads, ['E:/a.bin', 'E:/copy.bin', 'E:/changed.bin']);
    assert.equal(h.vm.report.duplicates.length, 1);
    assert.deepEqual(h.vm.report.duplicates[0].contentGroups.map(group => group.paths), [['E:/a.bin', 'E:/copy.bin'], ['E:/changed.bin']]);
    let rows = text(reportList(h.root));
    assert.match(rows, /Dateiinhalte verglichen \(SHA-256\)/);
    assert.match(rows, /Gleicher Dateiinhalt: E:\/a\.bin · E:\/copy\.bin/);
    assert.match(rows, /Abweichender Dateiinhalt: E:\/changed\.bin/);
    assert.match(rows, /Keine automatische Löschung/); assert.match(rows, /Dateieigenschaften werden hier nicht auf Gleichheit geprüft/);
    assert.doesNotMatch(rows, /Dateiinhalte nicht verglichen/);
    h.props.locale = 'en'; await tick(); rows = text(reportList(h.root));
    assert.match(rows, /File contents compared \(SHA-256\)/);
    assert.match(rows, /Same file contents: E:\/a\.bin · E:\/copy\.bin/);
    assert.match(rows, /Different file contents: E:\/changed\.bin/);
    assert.match(rows, /No automatic deletion/); assert.equal(fixture.reads.length, 3);
  } finally { h.app.unmount(); }
});

test('actual quick-mode duplicate view claims shared IDs only and performs no content reads', async () => {
  const fixture = duplicateFixture(), h = mount({ session: fixture.session });
  try {
    h.vm.mode = 'quick'; await h.vm.scan(); h.vm.filter = 'duplicates'; await tick();
    assert.deepEqual(fixture.lists, ['E:/']); assert.deepEqual(fixture.reads, []);
    assert.equal(h.vm.report.duplicates.length, 1); assert.deepEqual(h.vm.report.duplicates[0].contentGroups, []);
    assert.match(text(reportList(h.root)), /Nur gleiche Figuren-ID; Dateiinhalte nicht verglichen/);
    assert.doesNotMatch(text(reportList(h.root)), /SHA-256|Gleicher Dateiinhalt:|Abweichender Dateiinhalt:/);
    h.props.locale = 'en'; await tick();
    assert.match(text(reportList(h.root)), /Same figure ID only; file contents not compared/);
    assert.doesNotMatch(text(reportList(h.root)), /SHA-256|Same file contents:|Different file contents:/);
    assert.deepEqual(fixture.reads, []);
  } finally { h.app.unmount(); }
});

test('duplicate hashes remain a visibly stale snapshot after revision and export the stale marker without rereads', async () => {
  const fixture = duplicateFixture(), h = mount({ session: fixture.session });
  try {
    await h.vm.scan(); h.vm.filter = 'duplicates'; await tick();
    const report = h.vm.report, checkedAt = h.vm.reportTime;
    h.props.revision++; await tick();
    assert.equal(h.vm.stale, true); assert.equal(h.vm.report, report); assert.equal(h.vm.reportTime, checkedAt);
    assert.match(text(h.root), /Seit dieser Prüfung.*Schreib- oder Wiederherstellungsvorgang.*erneut prüfen/);
    assert.equal(h.staleEvents.at(-1), true); assert.deepEqual(fixture.lists, ['E:/']); assert.equal(fixture.reads.length, 3);
    await h.vm.saveReport();
    const saved = JSON.parse(await h.saves[0][0].text());
    assert.equal(saved.changedSinceCheck, true); assert.equal(saved.checkedAt, checkedAt);
    assert.deepEqual(saved.report.duplicates, report.duplicates);
    h.props.generation++; await tick();
    assert.equal(h.vm.report, null); assert.equal(reportList(h.root), undefined);
    assert.equal(fixture.reads.length, 3);
  } finally { h.app.unmount(); }
});
