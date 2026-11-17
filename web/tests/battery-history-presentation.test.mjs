import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSfc, nodes, text } from './helpers/vue-component-host.mjs';
import { BATTERY_HISTORY_INTERVAL, BATTERY_HISTORY_LIMIT } from '../src/lib/battery-history.js';

const component = new URL('../src/components/BatteryVoltageHistory.vue', import.meta.url);
const epoch = Date.UTC(2026, 10, 16, 9);
const sample = { schemaVersion: 1, scope: 'application-start-and-cached-battery',
  resetCaptured: true, resetReasonRaw: 0, sampleCollected: true, voltageValid: true,
  batteryMillivolts: 4187, lipoMode: true, chargingActive: false, configuredSleepSeconds: 180 };
const hasClass = (node, name) => String(node.props.class || '').split(/\s+/).includes(name);
const byClass = (root, name) => nodes(root).find(node => hasClass(node, name));
const badge = root => byClass(root, 'history-state');
function stats(root) {
  return Object.fromEntries(byClass(root, 'history-stats').children.filter(node => node.type === 'div')
    .map(row => [text(nodes(row, 'dt')[0]), text(nodes(row, 'dd')[0])]));
}

async function setup(t, readPower, locale = 'en_US') {
  const previousDocument = globalThis.document;
  const document = new EventTarget();
  document.hidden = false;
  globalThis.document = document;
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: epoch });
  const h = await mountSfc(component, { connected: true, blocked: false, locale, readPower }, {
    '../lib/browser-tools.js': { saveBlob() {} },
  });
  t.after(() => { h.app.unmount(); globalThis.document = previousDocument; });
  async function settle() { await Promise.resolve(); await h.tick(); }
  async function advance(ms = BATTERY_HISTORY_INTERVAL) { t.mock.timers.tick(ms); await settle(); }
  async function toggle() { byClass(h.root, 'record-button').props.onClick(); await settle(); }
  async function hide(value) { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); await settle(); }
  return { ...h, settle, advance, toggle, hide };
}

for (const locale of ['de_DE', 'en_US']) {
  test(`${locale}: statistics show valid cached readings and their receipt span, excluding a missing voltage`, async t => {
    let reads = 0;
    const values = [sample, { ...sample, batteryMillivolts: 4189 },
      { ...sample, voltageValid: false, batteryMillivolts: null }];
    const h = await setup(t, () => values[reads++], locale);
    assert.equal(reads, 0);
    assert.equal(nodes(h.root, 'figure').length, 0);
    await h.toggle(); await h.advance(); await h.advance();
    assert.equal(reads, 3);
    const de = locale === 'de_DE';
    const valuesOnScreen = stats(h.root);
    assert.equal(valuesOnScreen[de ? 'Gültige Werte' : 'Valid readings'], '2');
    assert.equal(valuesOnScreen[de ? 'Zeitraum inkl. Pausen' : 'Span including pauses'], '0 min 10 s');
    assert.equal(valuesOnScreen[de ? 'Minimum – Maximum' : 'Minimum – maximum'],
      de ? '4,187 V – 4,189 V' : '4.187 V – 4.189 V');
    assert.match(valuesOnScreen[de ? 'Spannungsbereich' : 'Voltage spread'], /^2\s*mV$/);
    assert.equal(text(nodes(byClass(h.root, 'latest-reading'), 'strong')[0]), de ? '4,189 V' : '4.189 V');
    assert.equal(nodes(h.root, 'circle').length, 2);
    assert.match(text(h.root), de ? /Kein gültiger Spannungswert/ : /Voltage unavailable/);
    assert.match(text(h.root), de ? /zuletzt gespeicherten Gerätemesswert/ : /cached device measurement/);
    assert.match(text(h.root), de ? /Höhenachse folgt dem sichtbaren Spannungsbereich/ : /vertical axis follows the visible voltage range/);
    assert.doesNotMatch(text(h.root), /NaN|Infinity|0[,.]000 V/);
  });
}

test('German pause and resume labels preserve the cause and include the pause in the receipt span', async t => {
  let reads = 0;
  const h = await setup(t, () => { ++reads; return sample; }, 'de_DE');
  await h.toggle(); await h.advance(1000); await h.hide(true);
  assert.equal(text(badge(h.root)), 'Aufzeichnung pausiert.');
  assert.ok(hasClass(badge(h.root), 'suspended'));
  assert.match(text(h.root), /Aufzeichnung pausiert · Tab im Hintergrund/);
  await h.advance(60000);
  assert.equal(reads, 1);
  await h.hide(false);
  assert.equal(reads, 2);
  assert.match(text(h.root), /Fortgesetzt · zuvor: Tab im Hintergrund/);
  assert.equal(stats(h.root)['Zeitraum inkl. Pausen'], '1 min 1 s');
  assert.equal(stats(h.root)['Gültige Werte'], '2');
  assert.equal(text(badge(h.root)), 'Aufzeichnung läuft.');
  assert.equal(nodes(h.root, 'polyline').length, 0, 'A resume must not connect the line across the gap');
});

test('waiting for a fresh response has a neutral badge and becomes recording only after the new reading', async t => {
  let reads = 0, finish;
  const h = await setup(t, () => {
    if (++reads === 1) return sample;
    if (reads === 2) return undefined;
    return new Promise(resolve => { finish = resolve; });
  });
  await h.toggle(); await h.advance();
  assert.match(text(h.root), /Recording paused · Bluetooth transfer active/);
  assert.equal(text(badge(h.root)), 'Waiting for next reading.');
  assert.equal(hasClass(badge(h.root), 'recording'), false);
  await h.advance();
  assert.equal(reads, 3);
  assert.equal(text(badge(h.root)), 'Waiting for next reading.');
  assert.doesNotMatch(text(h.root), /Resumed · previously:/);
  finish({ ...sample, batteryMillivolts: 4188 }); await h.settle();
  assert.equal(text(badge(h.root)), 'Recording.');
  assert.ok(hasClass(badge(h.root), 'recording'));
  assert.match(text(h.root), /Resumed · previously: Bluetooth transfer active/);
});

test('the last 120 entries include pause markers, so statistics count only the retained valid readings', async t => {
  let value = 4000;
  const h = await setup(t, () => ({ ...sample, batteryMillivolts: value++ }));
  await h.toggle();
  for (let i = 1; i < BATTERY_HISTORY_LIMIT; ++i) await h.advance();
  assert.equal(stats(h.root)['Valid readings'], '120');
  await h.hide(true); await h.advance(1000); await h.hide(false);
  const valuesOnScreen = stats(h.root);
  assert.equal(valuesOnScreen['Valid readings'], '118');
  assert.equal(valuesOnScreen['Minimum – maximum'], '4.003 V – 4.120 V');
  assert.equal(valuesOnScreen['Span including pauses'], '19 min 21 s');
  assert.match(text(nodes(h.root, 'summary')[0]), /\(120\)/);
  assert.equal(nodes(h.root, 'circle').length, 118);
});

test('moving the browser clock backwards hides duration without replacing valid voltages', async t => {
  let value = 4200;
  const h = await setup(t, () => ({ ...sample, batteryMillivolts: value-- }));
  await h.toggle(); await h.advance();
  t.mock.timers.setTime(epoch + 5000);
  await h.toggle(); await h.toggle();
  const valuesOnScreen = stats(h.root);
  assert.equal(valuesOnScreen['Valid readings'], '3');
  assert.equal(valuesOnScreen['Minimum – maximum'], '4.198 V – 4.200 V');
  assert.equal(valuesOnScreen['Span including pauses'], '—');
  assert.match(text(h.root), /browser clock moved backwards/);
  const axis = nodes(h.root, 'div').find(node => node.props.class === 'time-axis');
  assert.deepEqual(nodes(axis, 'time').map(node => node.props.datetime),
    [new Date(epoch).toISOString(), new Date(epoch + 10000).toISOString()]);
  assert.doesNotMatch(text(h.root), /NaN|Infinity|0\.000 V/);
});
