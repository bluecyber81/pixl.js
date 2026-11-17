import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSfc, mountSfc, nodes, text} from './helpers/vue-component-host.mjs';
import {diagnosticSnapshot} from './fixtures/diagnostic-overview-data.mjs';
import {GUIDED_MAX_BYTES, parseGuidedDraft, serializeGuidedDraft} from '../src/lib/guided-device-check.js';
import {discardGuidedDraft, listGuidedDrafts, saveGuidedDraft} from '../src/lib/guided-draft-store.js';

// Compile and render the actual SFC with Vue's real reactivity and event handlers.
// This is deliberately an in-memory host test, not a browser/layout/device test.
const component = new URL('../src/components/GuidedDeviceCheck.vue', import.meta.url);

for (const locale of ['de_DE','en']) test(`OLED shows its specific test guide while keeping the common checks in ${locale}`,async t=>{
  const h=await mount(t,{locale,firmwareVersion:'2.22.0-DE3.84-OLEDt4'});
  const guide=nodes(h.root,'a').find(node=>node.props.href==='https://github.com/bluecyber81/pixl.js/releases/tag/de3.84-oled-t4');
  assert.ok(guide);
  assert.equal(text(guide),locale==='en'?'OLED test guide':'OLED-Testanleitung');
  assert.ok(routeControl(h,'sleep-and-wake'));
});
const DRAFT_KEY = 'allmiibo.guided-device-check.draft.v2';
const savedText = store => [...store.entries.values()][0];
const now = Date.parse('2026-11-15T09:00:00.000Z');
const pick = (h, de, en) => h.state.locale.startsWith('de') ? de : en;
const button = (h, de, en) => {
  const found = nodes(h.root, 'button').find(node => text(node) === pick(h, de, en));
  assert.ok(found, `Button ${pick(h, de, en)}`);
  return found;
};
const exportButton = h => button(h, 'Prüfbericht als JSON', 'Export check report as JSON');
const labelControl = (h, de, en, type = 'select') => {
  const label = nodes(h.root, 'label').find(node => text(node).startsWith(pick(h, de, en)));
  assert.ok(label, `Label ${pick(h, de, en)}`);
  const found = nodes(label, type)[0];
  assert.ok(found, `${type} inside ${pick(h, de, en)}`);
  return found;
};
const contextControls = h => [
  labelControl(h, 'Geöffnete App', 'App under test'),
  labelControl(h, 'Gerätesprache', 'Device language'),
  labelControl(h, '„App fortsetzen“ am Gerät', '“Resume app” on the device'),
  labelControl(h, 'Animation am Gerät', 'Animation on the device'),
];
const routeControl = (h, route) => route === 'return-to-list'
  ? labelControl(h, 'Zurück zur Liste', 'Back to list')
  : labelControl(h, 'Schlafen und aufwachen', 'Sleep and wake');
const prefixControl = h => labelControl(h, 'Source-ID vom Display (optional)', 'Source ID from the display (optional)', 'input');
const noteControl = (h, route) => nodes(routeControl(h, route).parent.parent, 'textarea')[0];
const displayedChoice = control => control.options[control.selectedIndex]?.value;

function storage() {
  return {
    entries: new Map(), writes: 0, reads: 0, failRead: false, failWrite: false,
    get length() { return this.entries.size; },
    key(i) { return [...this.entries.keys()][i] ?? null; },
    getItem(key) { this.reads++; if (this.failRead) throw new Error('Storage unavailable'); return this.entries.get(key) ?? null; },
    setItem(key, value) { if (this.failWrite) throw new Error('Storage quota exceeded'); this.writes++; this.entries.set(key, value); },
    removeItem(key) { if (this.failWrite) throw new Error('Storage unavailable'); this.entries.delete(key); },
  };
}
async function mount(t, {locale = 'en', store = storage(), modules = {}, ...props} = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:store});
  const exported = [];
  const h = await mountSfc(component, {locale, connected:false, reading:false, exportBusy:false,
    onExport:report => exported.push(report), ...props}, {'../../package.json':{version:'3.52.0'},
      './GuidedLcdChecks.vue':{default:await loadSfc(new URL('../src/components/GuidedLcdChecks.vue',import.meta.url))},
      './GuidedSnapshotComparison.vue':{default:await loadSfc(new URL('../src/components/GuidedSnapshotComparison.vue',import.meta.url))}, ...modules});
  // onMounted finishes its restore before autosaving begins.
  await h.tick();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    h.app.unmount();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  };
  t.after(dispose);
  return {...h, store, exported, dispose};
}
async function choose(h, control, value) {
  control.value = value;
  control.selectedIndex = control.options.findIndex(option => option.props.value === value);
  for (const option of nodes(control, 'option')) option.selected = option.props.value === value;
  if (control.listeners.change) control.listeners.change({target:control});
  else control.props.onChange({target:control});
  await h.tick();
}
async function context(h, values) {
  for (const [index, value] of values.entries()) await choose(h, contextControls(h)[index], value);
}
async function input(h, control, value) {
  assert.ok(control, 'Input exists');
  control.value = value;
  if (control.listeners.input) control.listeners.input({target:control});
  else control.props.onInput({target:control});
  await h.tick();
}
async function click(h, de, en) {
  const control = button(h, de, en);
  assert.equal(!!control.props.disabled, false, `${pick(h, de, en)} is enabled`);
  await control.props.onClick();
  await h.tick();
}
async function exportReport(h) {
  const previous = h.exported.length;
  await click(h, 'Prüfbericht als JSON', 'Export check report as JSON');
  assert.equal(h.exported.length, previous + 1);
  return h.exported.at(-1);
}
async function importFile(h, file) {
  const control = nodes(h.root, 'input').find(node => node.props.type === 'file');
  const target = {files:file ? [file] : [], value:'chosen-file.json'};
  await control.props.onChange({target});
  await h.tick();
  if (file) assert.equal(target.value, '', 'File selection can be selected again');
}
function importedReport(schemaVersion = 2) {
  const observation = {origin:'amiibo-database', route:'sleep-and-wake', deviceLanguage:'en', resumeSetting:'off',
    observed:'main-menu', expected:'same-active-figure', matchesExpectation:false, recordedAt:'2026-11-14T10:00:00.000Z'};
  if (schemaVersion === 2) Object.assign(observation, {animationSetting:'off', note:'Imported observation'});
  return {schemaVersion, reportType:'guided-device-check', fileManagerVersion:'3.52.0', reportLanguage:'en',
    exportedAt:'2026-11-14T10:01:00.000Z', manualObservations:[observation],
    diagnosticReads:{before:null, after:null}, manualSourceId:null, samePhysicalDeviceVerified:true};
}
const reportFile = report => new Blob([JSON.stringify(report)], {type:'application/json'});
const observationKeys = report => report.manualObservations.map(row =>
  [row.origin,row.route,row.deviceLanguage,row.resumeSetting,row.animationSetting].join('/'));

for (const locale of ['de_DE', 'en']) test(`Actual guided UI keeps all 32 settings separate and permits only a selected result to change (${locale})`, async t => {
  t.mock.timers.enable({apis:['Date'], now});
  const h = await mount(t, {locale});
  assert.equal(exportButton(h).props.disabled, true);
  const contexts = [];
  for (const origin of ['file-emulator','amiibo-database']) for (const language of ['de','en']) {
    for (const resume of ['on','off']) for (const animation of ['on','off']) contexts.push([origin,language,resume,animation]);
  }
  for (const settings of contexts) {
    await context(h, settings);
    await choose(h, routeControl(h, 'return-to-list'), 'source-list-same-figure');
    await input(h, noteControl(h, 'return-to-list'), `${settings.join('/')} back`);
    await choose(h, routeControl(h, 'sleep-and-wake'), settings[2] === 'on' ? 'same-active-figure' : 'main-menu');
    await input(h, noteControl(h, 'sleep-and-wake'), `${settings.join('/')} wake`);
  }
  assert.equal(nodes(h.root, 'progress')[0].props.value, 32);
  const complete = await exportReport(h);
  assert.equal(complete.manualObservations.length, 32);
  assert.equal(new Set(observationKeys(complete)).size, 32);
  assert.equal(complete.coverage.configurationCasesUntested, 0);
  assert.equal(complete.coverage.matchingExpectations, 32);
  assert.equal(complete.reportLanguage, locale === 'de_DE' ? 'de' : 'en');
  assert.ok(complete.manualObservations.every(row => row.observationSource === 'manual-user-report'));
  for (const settings of contexts) {
    await context(h, settings);
    assert.equal(routeControl(h, 'return-to-list').props.value, 'source-list-same-figure');
    assert.equal(routeControl(h, 'sleep-and-wake').props.value, settings[2] === 'on' ? 'same-active-figure' : 'main-menu');
    assert.equal(noteControl(h, 'return-to-list').props.value, `${settings.join('/')} back`);
    assert.equal(noteControl(h, 'sleep-and-wake').props.value, `${settings.join('/')} wake`);
  }
  t.mock.timers.tick(60_000);
  await choose(h, routeControl(h, 'return-to-list'), 'no-response');
  const changed = await exportReport(h);
  assert.equal(changed.manualObservations.length, 32);
  assert.equal(changed.coverage.differentExpectations, 1);
  assert.equal(changed.manualObservations.filter(row => row.recordedAt !== complete.manualObservations[0].recordedAt).length, 1);
  await choose(h, routeControl(h, 'return-to-list'), '');
  assert.equal(nodes(h.root, 'progress')[0].props.value, 31);
  assert.equal((await exportReport(h)).manualObservations.length, 31);
  assert.ok(noteControl(h, 'sleep-and-wake'));
});

test('Autosave restores unfinished input, context and literal notes; note edits preserve observation time while exports get fresh times', async t => {
  t.mock.timers.enable({apis:['Date'], now});
  const store = storage(), h = await mount(t, {store});
  await context(h, ['amiibo-database','de','off','on']);
  await choose(h, routeControl(h, 'return-to-list'), 'source-list-same-figure');
  const note = '<img src=x onerror="globalThis.pwned=true"> & </textarea>\nManual note';
  await input(h, noteControl(h, 'return-to-list'), note);
  await input(h, prefixControl(h), '9bc7');
  const draft = parseGuidedDraft(savedText(store));
  assert.equal(draft.sourcePrefix, '9bc7');
  assert.equal(Object.values(draft.observations)[0].note, note);
  const recordedAt = Object.values(draft.observations)[0].recordedAt;
  assert.equal(exportButton(h).props.disabled, true);
  const writesBeforeRestore = store.writes;
  h.dispose();
  const restored = await mount(t, {store});
  assert.equal(store.writes, writesBeforeRestore, 'Restoring does not immediately overwrite saved evidence');
  assert.match(text(restored.root), /Draft restored/);
  assert.deepEqual(contextControls(restored).map(displayedChoice), ['amiibo-database','de','off','on']);
  assert.equal(prefixControl(restored).value, '9bc7');
  assert.equal(noteControl(restored, 'return-to-list').props.value, note);
  assert.ok(text(restored.root).includes(note));
  assert.equal(nodes(restored.root, 'img').length, 0);
  assert.ok(nodes(restored.root).every(node => !Object.hasOwn(node.props, 'innerHTML')));
  assert.equal(globalThis.pwned, undefined);
  t.mock.timers.tick(60_000);
  await input(restored, noteControl(restored, 'return-to-list'), `${note}\nFollow-up`);
  await input(restored, prefixControl(restored), '9BC7578A46F2');
  const first = await exportReport(restored);
  t.mock.timers.tick(60_000);
  const second = await exportReport(restored);
  assert.notEqual(second.exportedAt, first.exportedAt);
  assert.equal(second.manualObservations[0].recordedAt, recordedAt);
  assert.equal(second.manualObservations[0].note, `${note}\nFollow-up`);
  assert.equal(second.manualSourceId.comparison, 'unknown');
  assert.equal(second.manualSourceId.prefix, '9bc7578a46f2');
  assert.equal(second.manualSourceId.fullSourceIdVerified, false);
  assert.equal(second.manualSourceId.applicationHashVerified, false);
  assert.equal(second.samePhysicalDeviceVerified, false);
});

for (const failure of ['read','write']) test(`Unavailable ${failure} storage keeps manual results exportable and reports the problem`, async t => {
  const store = storage();
  store[failure === 'read' ? 'failRead' : 'failWrite'] = true;
  const h = await mount(t, {store});
  await choose(h, routeControl(h, 'sleep-and-wake'), 'same-active-figure');
  assert.ok(nodes(h.root).some(node => node.props.role === 'alert'));
  if (failure === 'write') assert.match(text(h.root), /Please save as JSON/);
  const report = await exportReport(h);
  assert.equal(report.manualObservations.length, 1);
  assert.equal(report.manualObservations[0].matchesExpectation, null);
  assert.equal(report.coverage.configurationCasesObserved, 0);
  assert.equal(report.coverage.configurationCasesUntested, 32);
  assert.equal(report.coverage.unknownExpectations, 1);
});

for (const schemaVersion of [1,2]) test(`Schema ${schemaVersion} import preserves manual provenance and needs confirmation before replacing an existing draft`, async t => {
  t.mock.timers.enable({apis:['Date'], now});
  const h = await mount(t, {locale:schemaVersion === 1 ? 'de_DE' : 'en'});
  await importFile(h, reportFile(importedReport(schemaVersion)));
  assert.match(text(h.root), schemaVersion === 1 ? /aus importiertem Bericht/ : /from imported report/);
  const imported = await exportReport(h);
  assert.equal(imported.manualObservations.length, 1);
  assert.equal(imported.manualObservations[0].matchesExpectation, true, 'Resume off expects the main menu');
  assert.equal(imported.manualObservations[0].recordedAt, '2026-11-14T10:00:00.000Z');
  assert.equal(imported.manualObservations[0].observationSource, 'imported-manual-report');
  assert.equal(imported.manualObservations[0].animationSetting, schemaVersion === 1 ? null : 'off');
  assert.equal(imported.samePhysicalDeviceVerified, false);
  const replacement = importedReport(schemaVersion);
  replacement.manualObservations[0].observed = 'no-response';
  await importFile(h, reportFile(replacement));
  assert.ok(nodes(h.root).some(node => node.props.role === 'group'));
  assert.deepEqual((await exportReport(h)).manualObservations, imported.manualObservations);
  await click(h, 'Aktuellen Entwurf behalten', 'Keep current draft');
  assert.deepEqual((await exportReport(h)).manualObservations, imported.manualObservations);
  await importFile(h, reportFile(replacement));
  await click(h, 'Bericht übernehmen', 'Use imported report');
  const accepted = await exportReport(h);
  assert.equal(accepted.manualObservations[0].observed, 'no-response');
  assert.equal(accepted.coverage.differentExpectations, 1);
  assert.deepEqual(accepted.importedReport, {schemaVersion, exportedAt:replacement.exportedAt, fileManagerVersion:'3.52.0'});
  assert.equal(parseGuidedDraft(savedText(h.store)).importedReport.schemaVersion, schemaVersion);
});

test('Invalid, oversized and cancelled imports retain the current report and its stored draft', async t => {
  const h = await mount(t);
  await choose(h, routeControl(h, 'return-to-list'), 'source-list-different-figure');
  await input(h, noteControl(h, 'return-to-list'), 'Keep this evidence');
  const original = await exportReport(h), saved = savedText(h.store);
  let oversizedRead = false;
  for (const file of [new Blob(['{bad JSON']), reportFile({...importedReport(), manualObservations:'invalid'}),
    {size:GUIDED_MAX_BYTES + 1, text:async () => {oversizedRead = true; return '{}';}}, null]) {
    await importFile(h, file);
    assert.deepEqual((await exportReport(h)).manualObservations, original.manualObservations);
    assert.equal(savedText(h.store), saved);
    assert.equal(nodes(h.root).filter(node => node.props.role === 'group').length, 0);
  }
  assert.equal(oversizedRead, false, 'Oversized files are rejected before reading their contents');
  assert.match(text(h.root), /exceeds 1 MiB/);
});

function snapshotAt(startedAt, completedAt) {
  const snapshot = structuredClone(diagnosticSnapshot());
  snapshot.startedAt = startedAt; snapshot.completedAt = completedAt;
  snapshot.sections.boot.data.applicationCounter = 648;
  for (const section of Object.values(snapshot.sections)) section.observedAt = completedAt;
  return snapshot;
}
test('Actual UI attaches only a fresh after snapshot and does not turn a prefix match into measured device identity', async t => {
  t.mock.timers.enable({apis:['Date'], now});
  const before = snapshotAt('2026-11-15T08:58:00.000Z', '2026-11-15T08:58:01.000Z');
  const h = await mount(t, {connected:true, firmwareVersion:'2.22.0-DE3.75', snapshot:before});
  const hasStorageComparison = () => nodes(h.root,'caption').some(n=>/Speicher vor und nach|Storage before and after/.test(text(n)));
  await click(h, 'Vorher-Aufnahme übernehmen', 'Attach before snapshot');
  assert.equal(hasStorageComparison(),false);
  await choose(h, routeControl(h, 'return-to-list'), 'source-list-same-figure');
  assert.equal(button(h, 'Nachher-Aufnahme übernehmen', 'Attach after snapshot').props.disabled, true);
  h.state.connected = false; await h.tick(); h.state.connected = true; await h.tick();
  assert.equal(button(h, 'Nachher-Aufnahme übernehmen', 'Attach after snapshot').props.disabled, true, 'Reconnect does not refresh the old read');
  const after = snapshotAt('2026-11-15T09:01:00.000Z', '2026-11-15T09:01:01.000Z');
  t.mock.timers.tick(120_000); h.state.snapshot = after; await h.tick();
  await click(h, 'Nachher-Aufnahme übernehmen', 'Attach after snapshot');
  assert.equal(hasStorageComparison(),true);
  await input(h, prefixControl(h), '9BC7578A46F2');
  await input(h, noteControl(h, 'return-to-list'), 'Written after reading counters');
  const report = await exportReport(h);
  assert.equal(report.manualObservations[0].recordedAt, '2026-11-15T09:00:00.000Z');
  assert.equal(report.diagnosticReads.after.snapshot.completedAt, after.completedAt);
  assert.equal(report.manualSourceId.comparison, 'prefix-match');
  assert.equal(report.manualSourceId.referenceRead, 'after');
  assert.equal(report.manualSourceId.applicationHashVerified, false);
  assert.equal(report.diagnosticReads.after.buildIdentity.applicationHashVerified, false);
  assert.equal(report.samePhysicalDeviceVerified, false);
  await choose(h, routeControl(h, 'return-to-list'), 'no-response');
  assert.equal((await exportReport(h)).diagnosticReads.after, null, 'A later physical observation invalidates the older after snapshot');
  assert.equal(hasStorageComparison(),false);
  assert.equal(button(h, 'Nachher-Aufnahme übernehmen', 'Attach after snapshot').props.disabled, true);
});

test('Starting a new report requires confirmation and clears the persistent draft only after discarding', async t => {
  const h = await mount(t, {locale:'de_DE'});
  await context(h, ['amiibo-database','de','on','off']);
  await choose(h, routeControl(h, 'sleep-and-wake'), 'same-active-figure');
  const original = await exportReport(h), saved = savedText(h.store);
  await click(h, 'Neuen Bericht beginnen', 'Start a new report');
  assert.equal(savedText(h.store), saved);
  await click(h, 'Entwurf behalten', 'Keep draft');
  assert.deepEqual((await exportReport(h)).manualObservations, original.manualObservations);
  await click(h, 'Neuen Bericht beginnen', 'Start a new report');
  await click(h, 'Entwurf verwerfen', 'Discard draft');
  assert.equal(h.store.entries.size, 0);
  assert.equal(exportButton(h).props.disabled, true);
  assert.equal(nodes(h.root, 'progress')[0].props.value, 0);
  assert.deepEqual(contextControls(h).map(displayedChoice), ['file-emulator','','','']);
  assert.equal(nodes(h.root, 'textarea').length, 0);
  assert.match(text(h.root), /Noch kein Entwurf/);
});

test('Concurrent edits from a legacy draft remain separately selectable and exportable after reload', async t => {
  const store = storage();
  store.setItem(DRAFT_KEY, serializeGuidedDraft({deviceLanguage:'de'}));
  const first = await mount(t, {store}), second = await mount(t, {store});
  await choose(first, routeControl(first, 'return-to-list'), 'source-list-same-figure');
  // Changing UI locale alone must not publish the old revision over newer work.
  const previousWrites = store.writes;
  second.state.locale = 'de_DE'; await second.tick();
  assert.equal(store.writes, previousWrites);
  await choose(second, routeControl(second, 'sleep-and-wake'), 'main-menu');
  assert.equal(store.entries.size, 2);
  assert.equal(store.entries.has(DRAFT_KEY), false);
  second.dispose(); first.dispose();

  const reloaded = await mount(t, {store});
  const restored = (await exportReport(reloaded)).manualObservations[0];
  const alternate = nodes(reloaded.root, 'button').find(node => node.props.class === 'guided-open-draft');
  assert.ok(alternate, 'The second fork is visible after closing both original tabs');
  await alternate.props.onClick(); await reloaded.tick();
  const other = (await exportReport(reloaded)).manualObservations[0];
  assert.deepEqual(new Set([restored.observed, other.observed]), new Set(['source-list-same-figure','main-menu']));
  await click(reloaded, 'Neuen Bericht beginnen', 'Start a new report');
  await click(reloaded, 'Entwurf verwerfen', 'Discard draft');
  assert.equal(store.entries.size, 1);
  assert.equal(Object.values(parseGuidedDraft(savedText(store)).observations)[0].observed, restored.observed);
});

test('Simultaneous first saves and nested writes before cleanup retain both descendants', () => {
  const store = storage(), saved = value => serializeGuidedDraft({sourcePrefix:value});
  const first = saveGuidedDraft(store, null, saved('a'));
  const second = saveGuidedDraft(store, null, saved('b'));
  assert.equal(store.entries.size, 2);
  discardGuidedDraft(store, second);
  const set = store.setItem.bind(store);
  store.setItem = (key, raw) => {
    set(key, raw);
    store.setItem = set;
    saveGuidedDraft(store, first, saved('d'));
  };
  saveGuidedDraft(store, first, saved('c'));
  discardGuidedDraft(store, first); // A stale discard racing both writers.
  assert.deepEqual(listGuidedDrafts(store).entries.map(entry => entry.draft.sourcePrefix).sort(), ['c','d']);
});

test('Legacy replacement, blocked writes and cleanup failure preserve the right revisions', () => {
  const store = storage(), saved = value => serializeGuidedDraft({sourcePrefix:value});
  const old = {key:DRAFT_KEY, raw:saved('abc')};
  store.setItem(old.key, saved('def'));
  discardGuidedDraft(store, old);
  assert.equal(parseGuidedDraft(savedText(store)).sourcePrefix, 'def');
  store.failWrite = true;
  assert.throws(() => saveGuidedDraft(store, old, saved('ff')));
  assert.equal(store.entries.size, 1);
  store.failWrite = false;
  const live = listGuidedDrafts(store).entries[0];
  const remove = store.removeItem.bind(store);
  store.removeItem = () => { throw Error('Storage unavailable'); };
  const published = saveGuidedDraft(store, live, saved('ff'));
  assert.notEqual(published.key, live.key);
  store.removeItem = remove;
  saveGuidedDraft(store, published, saved('ff0'));
  assert.deepEqual(listGuidedDrafts(store).entries.map(entry => entry.draft.sourcePrefix).sort(), ['def','ff0']);
});

test('An unfinished draft can be downloaded and restored when browser storage is full', async t => {
  const store = storage(); store.failWrite = true;
  let downloaded;
  const writer = await mount(t, {store, modules:{'../lib/browser-tools.js':{saveBlob:blob => { downloaded = blob; }}}});
  await choose(writer, routeControl(writer, 'sleep-and-wake'), 'main-menu');
  await input(writer, prefixControl(writer), '123');
  assert.equal(exportButton(writer).props.disabled, true);
  await click(writer, 'Entwurf als JSON sichern', 'Save draft as JSON');
  assert.equal(parseGuidedDraft(await downloaded.text()).sourcePrefix, '123');
  writer.dispose();
  const reader = await mount(t);
  await importFile(reader, downloaded);
  assert.equal(prefixControl(reader).value, '123');
  await input(reader, prefixControl(reader), '');
  const row = (await exportReport(reader)).manualObservations[0];
  assert.equal(row.observed, 'main-menu');
  assert.equal(row.observationSource, 'imported-manual-report');
});
