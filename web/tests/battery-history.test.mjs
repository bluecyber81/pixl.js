import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSfc, nodes, text } from './helpers/vue-component-host.mjs';
import { batteryHistoryChart, BATTERY_HISTORY_INTERVAL, BATTERY_HISTORY_LIMIT } from '../src/lib/battery-history.js';

const component = new URL('../src/components/BatteryVoltageHistory.vue', import.meta.url);
const sample = {schemaVersion: 1, scope: 'application-start-and-cached-battery', resetCaptured: true,
  resetReasonRaw: 0, sampleCollected: true, voltageValid: true, batteryMillivolts: 4187, lipoMode: true,
  chargingActive: true, configuredSleepSeconds: 180};

async function setup(t, readPower, locale = 'de_DE', saveBlob = () => {}) {
  const original = globalThis.document;
  const doc = new EventTarget();
  doc.hidden = false;
  globalThis.document = doc;
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: Date.UTC(2026, 10, 16, 9)});
  const h = await mountSfc(component, {connected: true, blocked: false, locale, readPower}, {
    '../lib/browser-tools.js': {saveBlob}
  });
  t.after(() => { h.app.unmount(); globalThis.document = original; });
  async function settle() { await Promise.resolve(); await h.tick(); }
  async function advance(ms = BATTERY_HISTORY_INTERVAL) { t.mock.timers.tick(ms); await settle(); }
  async function click() { nodes(h.root, 'button')[0].props.onClick(); await settle(); }
  async function hide(value) { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); await settle(); }
  return {...h, advance, settle, click, hide};
}

test('no traffic before opt-in; history records only valid voltage and distinguishes unavailable charge flag', async t => {
  let reads = 0;
  const values = [sample, {...sample, chargingActive: false, voltageValid: false, batteryMillivolts: null},
    {...sample, chargingActive: false, lipoMode: false}, {...sample, chargingActive: false}];
  const h = await setup(t, () => values[reads++]);
  await h.advance(60_000);
  assert.equal(reads, 0);
  await h.click();
  assert.match(text(h.root), /4,187 V/);
  assert.match(text(h.root), /Lädt/);
  assert.ok(nodes(h.root, 'time').every(node => node.props.datetime === '2026-11-16T09:01:00.000Z'));
  await h.advance();
  assert.match(text(h.root), /Kein gültiger Spannungswert/);
  assert.doesNotMatch(text(h.root), /0,000 V/);
  await h.advance(); await h.advance();
  assert.match(text(h.root), /Unbekannt/);
  assert.match(text(h.root), /Inaktiv/);
  assert.equal(nodes(h.root, 'circle').length, 3);
  assert.equal(nodes(h.root, 'polyline').length, 1);
  await h.click();
  await h.advance(45_000);
  assert.equal(reads, 4);
});

test('blocks overlapping polls and discards replies from before a transfer, hidden tab or disconnect', async t => {
  let reads = 0, finish;
  const h = await setup(t, () => { reads++; return new Promise(resolve => { finish = resolve; }); }, 'en');
  await h.click(); await h.advance(30_000);
  assert.equal(reads, 1);
  h.state.blocked = true; await h.tick(); h.state.blocked = false; await h.tick();
  finish({...sample, batteryMillivolts: 4001}); await h.settle(); await h.advance(0);
  assert.equal(reads, 2);
  assert.doesNotMatch(text(h.root), /4\.001/);
  finish(sample); await h.settle();
  await h.hide(true); await h.advance(40_000);
  assert.equal(reads, 2);
  assert.match(text(h.root), /Recording paused/);
  await h.hide(false);
  assert.equal(reads, 3);
  h.state.connected = false; await h.tick(); finish(sample); await h.settle();
  h.state.connected = true; await h.tick(); await h.advance(50_000);
  assert.equal(reads, 3);
  assert.equal(nodes(h.root, 'time').length, 0);
});

test('old firmware and protocol errors stop with translated status; busy transport is retried', async t => {
  let reads = 0;
  const h = await setup(t, () => {
    ++reads;
    if (reads === 1) return undefined;
    if (reads === 2) return null;
    throw Error('read');
  }, 'en');
  await h.click(); await h.advance(); await h.advance();
  assert.equal(reads, 2);
  assert.match(text(h.root), /unavailable on this firmware/);
  assert.equal(nodes(h.root, 'time').length, 0);
  await h.click(); await h.advance();
  assert.match(text(h.root), /Read failed/);
  assert.equal(reads, 3);
});

test('explicit CSV download includes UTC receipt times, raw mV and explicit gaps without identity or guessed values', async t => {
  const downloads = [];
  const h = await setup(t, () => sample, 'de_DE', (blob,name) => downloads.push({blob,name}));
  await h.click();
  await h.advance(500); h.state.blocked = true; await h.settle();
  assert.deepEqual(downloads, []);
  nodes(h.root,'button').find(node => text(node) === 'CSV speichern').props.onClick();
  const [{blob,name}] = downloads;
  assert.equal(name,'Allmiibo-Akkuverlauf-2026-11-16T09-00-00-500Z.csv');
  assert.equal(await blob.text(),[
    'time_utc;battery_mV;charging_active;entry;pause_reason',
    '2026-11-16T09:00:00.000Z;4187;true;reading;',
    '2026-11-16T09:00:00.500Z;;;pause;busy',''
  ].join('\r\n'));
});

test('history drops oldest entries and the chart leaves gaps across clock or sampling discontinuities', async t => {
  let reads = 0;
  const h = await setup(t, () => ({...sample, batteryMillivolts: 4000 + reads++}));
  await h.click();
  for (let i = 0; i < BATTERY_HISTORY_LIMIT; ++i) await h.advance();
  assert.equal(nodes(h.root, 'circle').length, BATTERY_HISTORY_LIMIT);
  assert.doesNotMatch(text(h.root), /4,000 V/);
  assert.match(text(h.root), /4,120 V/);
  const chart = batteryHistoryChart([0, 10, 45, 40, 50].map(sec => ({at: sec * 1000, mv: 4200})));
  assert.equal(chart.points.length, 5);
  assert.equal(chart.lines.length, 2);
  assert.ok(chart.points.every(p => Number.isFinite(p.x) && p.y === 38));
});

async function csvRows(h, downloads) {
  nodes(h.root, 'button').find(node => /CSV/.test(text(node))).props.onClick();
  const csv = await downloads.at(-1).blob.text();
  return csv.trim().split('\r\n').slice(1).map(line => {
    const [at, mv, charging, entry, pauseReason] = line.split(';');
    return { at, mv, charging, entry, pauseReason };
  });
}
const markers = rows => rows.filter(row => row.entry === 'pause' || row.entry === 'resume')
  .map(row => [row.entry, row.pauseReason]);

test('first recording has no resume marker; manual stop and restart preserve the reason once', async t => {
  let reads = 0;
  const downloads = [];
  const h = await setup(t, () => { ++reads; return sample; }, 'de_DE', (blob, name) => downloads.push({ blob, name }));
  await h.click();
  assert.deepEqual(markers(await csvRows(h, downloads)), []);
  await h.click();
  await h.advance(25_000);
  assert.equal(reads, 1);
  await h.click();
  assert.equal(reads, 2);
  assert.deepEqual(markers(await csvRows(h, downloads)), [['pause', 'manual'], ['resume', 'manual']]);
  await h.click();
  assert.deepEqual(markers(await csvRows(h, downloads)), [['pause', 'manual'], ['resume', 'manual'], ['pause', 'manual']]);
});

test('overlapping busy, hidden and closed-view pauses record cause changes without duplicate markers', async t => {
  let reads = 0;
  const downloads = [];
  const h = await setup(t, () => { ++reads; return sample; }, 'en', (blob, name) => downloads.push({ blob, name }));
  await h.click();
  h.state.blocked = true; await h.settle();
  await h.hide(true);
  h.state.blockedReason = 'view'; await h.settle();
  await h.hide(false);
  await h.advance(40_000);
  assert.equal(reads, 1);
  h.state.blocked = false; await h.settle();
  assert.equal(reads, 2);
  await h.hide(true); await h.hide(true); await h.hide(false);
  assert.equal(reads, 3);
  assert.deepEqual(markers(await csvRows(h, downloads)), [
    ['pause', 'busy'], ['pause', 'hidden'], ['pause', 'view'], ['resume', 'view'],
    ['pause', 'hidden'], ['resume', 'hidden'],
  ]);
});

test('occupied transport, missing voltage, unsupported firmware and failure remain separate observations', async t => {
  let reads = 0;
  const downloads = [], values = [sample, undefined, undefined, sample,
    { ...sample, chargingActive: false, voltageValid: false, batteryMillivolts: null }, null];
  const h = await setup(t, () => {
    if (reads === values.length) { ++reads; throw Error('read failed'); }
    return values[reads++];
  }, 'en', (blob, name) => downloads.push({ blob, name }));
  await h.click();
  for (let i = 0; i < 5; ++i) await h.advance();
  assert.equal(reads, 6);
  assert.match(text(h.root), /unavailable on this firmware/);
  let rows = await csvRows(h, downloads);
  assert.deepEqual(markers(rows), [
    ['pause', 'transport-busy'], ['resume', 'transport-busy'], ['pause', 'unsupported'],
  ]);
  assert.equal(rows.filter(row => row.entry === 'invalid').length, 1);
  assert.ok(rows.filter(row => row.entry !== 'reading').every(row => row.mv === ''));
  await h.click();
  assert.match(text(h.root), /Read failed/);
  rows = await csvRows(h, downloads);
  assert.deepEqual(markers(rows).at(-1), ['pause', 'failed']);
  assert.equal(rows.filter(row => row.entry === 'resume').length, 1);
});

test('rapid stop and start cannot reuse a pending pre-stop sample or overlap polls', async t => {
  const downloads = [], finish = [];
  let reads = 0, active = 0, maxActive = 0;
  const h = await setup(t, () => {
    ++reads; maxActive = Math.max(maxActive, ++active);
    return new Promise(resolve => finish.push(value => { --active; resolve(value); }));
  }, 'en', (blob, name) => downloads.push({ blob, name }));
  await h.click(); finish[0](sample); await h.settle();
  await h.advance();
  assert.equal(reads, 2);
  await h.click(); await h.click();
  assert.equal(reads, 2);
  finish[1]({ ...sample, batteryMillivolts: 4001 }); await h.settle(); await h.advance(0);
  assert.equal(reads, 3);
  let rows = await csvRows(h, downloads);
  assert.deepEqual(rows.filter(row => row.entry === 'reading').map(row => row.mv), ['4187']);
  assert.deepEqual(markers(rows), [['pause', 'manual']]);
  finish[2]({ ...sample, batteryMillivolts: 4190 }); await h.settle();
  rows = await csvRows(h, downloads);
  assert.deepEqual(rows.filter(row => row.entry === 'reading').map(row => row.mv), ['4187', '4190']);
  assert.deepEqual(markers(rows), [['pause', 'manual'], ['resume', 'manual']]);
  assert.equal(maxActive, 1);
});

test('reconnect clears the old history and cannot attach an old answer or resume marker to the new session', async t => {
  const downloads = [], finish = [];
  let reads = 0;
  const h = await setup(t, () => { ++reads; return new Promise(resolve => finish.push(resolve)); },
    'en', (blob, name) => downloads.push({ blob, name }));
  await h.click(); finish[0](sample); await h.settle();
  await h.advance();
  h.state.connected = false; await h.settle();
  h.state.connected = true; await h.settle();
  assert.equal(nodes(h.root, 'time').length, 0);
  await h.advance(60_000);
  assert.equal(reads, 2);
  await h.click();
  finish[1]({ ...sample, batteryMillivolts: 4001 }); await h.settle(); await h.advance(0);
  assert.equal(reads, 3);
  finish[2]({ ...sample, batteryMillivolts: 4192 }); await h.settle();
  const rows = await csvRows(h, downloads);
  assert.deepEqual(rows.map(row => [row.mv, row.entry, row.pauseReason]), [['4192', 'reading', '']]);
});
