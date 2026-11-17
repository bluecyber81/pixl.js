<template>
  <section class="battery-history" aria-labelledby="battery-history-title">
    <div class="history-heading">
      <div><p class="history-eyebrow">{{ de ? 'Spannung beobachten' : 'Voltage monitoring' }}</p>
        <h3 id="battery-history-title">{{ de ? 'Akkuverlauf' : 'Battery history' }}</h3></div>
      <span class="history-state" :class="{recording: running && !paused && !waitingForReading, suspended: running && paused}" role="status">{{ status || (de ? 'Bereit' : 'Ready') }}</span>
    </div>
    <p class="history-intro">{{ de ? 'Auf Wunsch alle 10 Sekunden den zuletzt gespeicherten Gerätemesswert lesen. Die letzten 120 Einträge bleiben in dieser Verbindung.' : 'Read the latest cached device measurement every 10 seconds when recording. The latest 120 entries stay in this connection.' }}</p>
    <div class="history-controls">
      <button class="record-button" type="button" :disabled="!running && (!connected || paused)" @click="running ? stop() : start()">
        {{ running ? (de ? 'Aufzeichnung stoppen' : 'Stop recording') : (de ? 'Aufzeichnung starten' : 'Start recording') }}
      </button>
      <button v-if="rows.length" type="button" @click="saveCsv">{{ de ? 'CSV speichern' : 'Save CSV' }}</button>
    </div>
    <p v-if="saveFailed" role="alert">{{ de ? 'Die CSV konnte nicht gespeichert werden.' : 'Could not save the CSV.' }}</p>
    <figure v-if="chart.points.length">
      <figcaption class="latest-reading">
        <div><span class="reading-label">{{ de ? 'Letzter gültiger Wert' : 'Latest valid reading' }}</span><strong>{{ voltage(lastValid.mv) }}</strong></div>
        <div class="reading-context"><span class="charge-state" :class="{charging: lastValid.charging === true}">{{ charge(lastValid.charging) }}</span>
          <span>{{ de ? 'Empfangen um' : 'Received at' }} <time :datetime="iso(lastValid.at)">{{ time(lastValid.at) }}</time></span></div>
      </figcaption>
      <dl class="history-stats">
        <div><dt>{{ de ? 'Gültige Werte' : 'Valid readings' }}</dt><dd>{{ historySummary.count }}</dd></div>
        <div><dt>{{ de ? 'Zeitraum inkl. Pausen' : 'Span including pauses' }}</dt><dd>{{ spanLabel }}</dd></div>
        <div><dt>{{ de ? 'Minimum – Maximum' : 'Minimum – maximum' }}</dt><dd class="range-value">{{ voltage(historySummary.min) }} – {{ voltage(historySummary.max) }}</dd></div>
        <div><dt>{{ de ? 'Spannungsbereich' : 'Voltage spread' }}</dt><dd>{{ historySummary.range }} <small>mV</small></dd></div>
      </dl>
      <div class="chart-frame">
        <svg viewBox="0 0 320 76" aria-hidden="true" preserveAspectRatio="none">
          <path d="M0 4H320 M0 38H320 M0 72H320" class="chart-grid" fill="none" vector-effect="non-scaling-stroke" />
          <polyline v-for="(line, index) in chart.lines" :key="index" :points="line" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
          <circle v-for="(point, index) in chart.points" :key="index" :cx="point.x" :cy="point.y" r="2" fill="currentColor" />
        </svg>
      </div>
      <div class="time-axis"><time :datetime="iso(chart.startAt)">{{ time(chart.startAt) }}</time><time :datetime="iso(chart.endAt)">{{ time(chart.endAt) }}</time></div>
      <p class="chart-note">{{ de ? 'Die Höhenachse folgt dem sichtbaren Spannungsbereich. Lücken bleiben offen. Die Zeitachse zeigt die Uhrzeiten aller Einträge im Browser. Die Dauer oben reicht vom ersten bis zum letzten gültigen Messwert.' : 'The vertical axis follows the visible voltage range. Gaps stay open. The time axis shows when the browser received each entry. The duration above runs from the first to the last valid reading.' }}</p>
      <p v-if="historySummary.clockAdjusted" class="chart-note">{{ de ? 'Die Browseruhr wurde zurückgestellt. Der Zeitraum wird deshalb nicht berechnet.' : 'The browser clock moved backwards, so the time span is unavailable.' }}</p>
    </figure>
    <p v-else class="history-empty">{{ de ? 'Noch kein gültiger Spannungswert in dieser Aufzeichnung.' : 'No valid voltage reading in this recording yet.' }}</p>
    <details v-if="rows.length">
      <summary>{{ de ? 'Messwerte und Pausen' : 'Readings and pauses' }} ({{ rows.length }})</summary>
      <div class="readings"><table>
        <thead><tr><th scope="col">{{ de ? 'Uhrzeit' : 'Time' }}</th><th scope="col">{{ de ? 'Spannung' : 'Voltage' }}</th><th scope="col">{{ de ? 'Ladeanzeige' : 'Charge indication' }}</th></tr></thead>
        <tbody><tr v-for="row in recentFirst" :key="row.id">
          <td><time :datetime="iso(row.at)">{{ time(row.at) }}</time></td>
          <template v-if="row.mv !== null"><td>{{ voltage(row.mv) }}</td><td>{{ charge(row.charging) }}</td></template>
          <td v-else colspan="2" class="history-event" :class="{resumed: row.reason === 'resume'}">{{ eventLabel(row) }}</td>
        </tr></tbody>
      </table></div>
    </details>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatBatteryVoltage, normalizePowerDiagnostics } from '../lib/power-diagnostics.js';
import { batteryHistoryChart, batteryHistoryCsv, batteryHistorySummary, BATTERY_HISTORY_INTERVAL, BATTERY_HISTORY_LIMIT } from '../lib/battery-history.js';
import { saveBlob } from '../lib/browser-tools.js';

const props = defineProps({ locale: String, connected: Boolean, blocked: Boolean, blockedReason: String,
  readPower: {type: Function, required: true} });
const de = computed(() => props.locale?.startsWith('de'));
const visible = ref(true);
const pauseCause = computed(() => !visible.value ? 'hidden' : props.blocked ?
  (props.blockedReason === 'view' ? 'view' : 'busy') : null);
const paused = computed(() => pauseCause.value !== null);
const rows = ref([]);
const recentFirst = computed(() => [...rows.value].reverse());
const lastValid = computed(() => recentFirst.value.find(row => row.mv !== null));
const chart = computed(() => batteryHistoryChart(rows.value));
const historySummary = computed(() => batteryHistorySummary(rows.value));
const running = ref(false);
const waitingForReading = computed(() => running.value && !paused.value && rows.value.at(-1)?.reason === 'pause');
const saveFailed = ref(false);
const outcome = ref('');
const status = computed(() => {
  if (!props.connected) return de.value ? 'Gerät verbinden.' : 'Connect a device.';
  if (running.value && paused.value) return de.value ? 'Aufzeichnung pausiert.' : 'Recording paused.';
  if (waitingForReading.value) return de.value ? 'Warten auf nächste Ablesung.' : 'Waiting for next reading.';
  if (running.value) return de.value ? 'Aufzeichnung läuft.' : 'Recording.';
  if (outcome.value === 'unsupported') return de.value ? 'Diese Firmware liefert keine Stromdiagnose.' : 'Power diagnostics are unavailable on this firmware.';
  if (outcome.value === 'failed') return de.value ? 'Lesen fehlgeschlagen. Aufzeichnung gestoppt.' : 'Read failed. Recording stopped.';
  if (outcome.value === 'stopped') return de.value ? 'Aufzeichnung gestoppt.' : 'Recording stopped.';
  return '';
});
const clock = computed(() => new Intl.DateTimeFormat(de.value ? 'de-DE' : 'en-GB', {timeStyle: 'medium'}));
const time = at => clock.value.format(at);
const iso = at => new Date(at).toISOString();
const voltage = mv => formatBatteryVoltage(mv, props.locale);
const charge = flag => flag === null ? (de.value ? 'Unbekannt' : 'Unknown') :
  flag ? (de.value ? 'Lädt' : 'Charging') : (de.value ? 'Inaktiv' : 'Inactive');
const spanLabel = computed(() => {
  const ms = historySummary.value.elapsedMilliseconds;
  if (ms === null) return '—';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? hours + ' h ' : ''}${minutes} min ${seconds % 60} s`;
});
function eventLabel(row) {
  if (row.reason !== 'pause' && row.reason !== 'resume') return de.value ? 'Kein gültiger Spannungswert' : 'Voltage unavailable';
  const reasons = de.value ? {
    hidden: 'Tab im Hintergrund', view: 'Geräteansicht verlassen', busy: 'Gerät beschäftigt',
    'transport-busy': 'Bluetooth-Übertragung aktiv', manual: 'manuell gestoppt',
    unsupported: 'Stromdiagnose nicht verfügbar', failed: 'Lesefehler'
  } : {
    hidden: 'tab in background', view: 'device view closed', busy: 'device busy',
    'transport-busy': 'Bluetooth transfer active', manual: 'stopped manually',
    unsupported: 'power diagnostics unavailable', failed: 'read failed'
  };
  const label = row.reason === 'resume' ? (de.value ? 'Fortgesetzt' : 'Resumed') :
    (de.value ? 'Aufzeichnung pausiert' : 'Recording paused');
  const reason = reasons[row.pauseReason];
  return reason ? `${label} · ${row.reason === 'resume' ? (de.value ? 'zuvor: ' : 'previously: ') : ''}${reason}` : label;
}

function saveCsv() {
  saveFailed.value = false;
  try {
    const filename = 'Allmiibo-' + (de.value ? 'Akkuverlauf' : 'Battery-history') + '-' + iso(rows.value.at(-1).at).replace(/[:.]/g, '-') + '.csv';
    saveBlob(new Blob(['\uFEFF', batteryHistoryCsv(rows.value)], {type:'text/csv;charset=utf-8'}), filename);
  } catch { saveFailed.value = true; }
}

let serial = 0, nextId = 0, timer, inFlight = false;
function add(mv, charging, reason, pauseReason) {
  rows.value.push({id: ++nextId, at: Date.now(), mv, charging, reason, pauseReason});
  if (rows.value.length > BATTERY_HISTORY_LIMIT) rows.value.shift();
}
function gap(pauseReason) {
  const last = rows.value.at(-1);
  if (!last || last.reason === 'pause' && last.pauseReason === pauseReason) return;
  add(null, null, 'pause', pauseReason);
}
function resume() {
  const last = rows.value.at(-1);
  if (last?.reason === 'pause') add(null, null, 'resume', last.pauseReason);
}
function cancelPending() {
  ++serial;
  clearTimeout(timer);
}
function stop(reason = 'stopped') {
  cancelPending();
  if (running.value) gap(reason === 'unsupported' || reason === 'failed' ? reason : 'manual');
  running.value = false;
  outcome.value = reason;
}
function start() {
  if (running.value || !props.connected || paused.value) return;
  running.value = true;
  outcome.value = '';
  void poll();
}
async function poll() {
  if (inFlight || !running.value || paused.value || !props.connected) return;
  inFlight = true;
  const request = serial;
  try {
    const result = await props.readPower();
    if (request !== serial || !props.connected || paused.value) return;
    if (result === undefined) { gap('transport-busy'); return; }
    if (result === null) { stop('unsupported'); return; }
    const power = normalizePowerDiagnostics(result);
    if (!power) throw new Error('Invalid power diagnostics');
    // Only a fresh, validated response ends the gap. Clicking Start or an old
    // in-flight reply must not manufacture a successful resume observation.
    resume();
    if (power.voltageValid) add(power.batteryMillivolts, power.lipoMode ? power.chargingActive : null);
    else add(null, null, 'invalid');
  } catch {
    if (request === serial) stop('failed');
  } finally {
    inFlight = false;
    if (running.value && !paused.value && props.connected) {
      timer = setTimeout(poll, request === serial ? BATTERY_HISTORY_INTERVAL : 0);
    }
  }
}
watch(pauseCause, value => {
  cancelPending();
  if (!running.value) return;
  if (value) gap(value);
  else void poll();
}, {flush: 'sync'});
watch(() => props.connected, connected => {
  if (!connected) { stop(); rows.value = []; outcome.value = ''; }
}, {flush: 'sync'});
function visibilityChanged() { visible.value = !document.hidden; }
onMounted(() => {
  visibilityChanged();
  document.addEventListener('visibilitychange', visibilityChanged);
});
onBeforeUnmount(() => {
  stop();
  document.removeEventListener('visibilitychange', visibilityChanged);
});
</script>

<style scoped>
.battery-history { margin-block: 1rem; padding: 1.25rem; color: #24434b; background: #fff; border: 1px solid #d5e2df; border-radius: .875rem; font-variant-numeric: tabular-nums; }
.history-heading { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: .75rem; }
.battery-history h3 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; }
.history-eyebrow { margin: 0 0 .25rem; color: #526d69; font-size: .7rem; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.history-state { padding: .4rem .65rem; border: 1px solid #d9e2e5; border-radius: .5rem; background: #f5f7f8; color: #4c6169; font-size: .8rem; max-width: 100%; overflow-wrap: anywhere; }
.history-state.recording { color: #12604c; background: #edf8f1; border-color: #c8e6d5; }
.history-state.suspended { color: #765219; background: #fff7e8; border-color: #efdcba; }
.history-intro { max-width: 60ch; margin: .8rem 0 1rem; color: #526971; font-size: .85rem; line-height: 1.6; }
.history-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
.history-controls button { min-height: 44px; padding: .6rem .85rem; font: inherit; font-size: .85rem; font-weight: 600; border-radius: .5rem; border: 1px solid #abc5bf; background: white; color: #24434b; cursor: pointer; }
.history-controls .record-button { background: #17695b; color: #fff; border-color: #17695b; }
.history-controls button:hover:not(:disabled) { box-shadow: 0 0 0 2px #cde5dc; }
.history-controls button:focus-visible, .battery-history summary:focus-visible { outline: 3px solid #317b9b; outline-offset: 3px; }
.history-controls button:disabled { opacity: .55; cursor: default; }
.battery-history figure { margin: 1.2rem 0 .25rem; }
.latest-reading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; }
.reading-label { display: block; color: #526971; font-size: .8rem; margin-bottom: .15rem; }
.latest-reading strong { display: block; font-size: 2.25rem; font-weight: 600; letter-spacing: -.04em; line-height: 1.25; }
.reading-context { display: flex; flex-direction: column; align-items: end; gap: .35rem; font-size: .8rem; color: #526971; }
.charge-state { border: 1px solid #d9e3e5; background: #f5f7f8; border-radius: .4rem; padding: .3rem .5rem; }
.charge-state.charging { color: #12604c; border-color: #c8e6d5; background: #edf8f1; }
.history-stats { display: grid; grid-template-columns: 1fr 1.3fr 2fr 1.2fr; gap: .75rem; margin: 1rem 0; padding: .85rem 0; border-block: 1px solid #e2ebe8; }
.history-stats div { min-width: 0; }
.history-stats dt { color: #526971; font-size: .72rem; line-height: 1.5; }
.history-stats dd { margin: .35rem 0 0; font-size: .95rem; font-weight: 600; overflow-wrap: anywhere; }
.history-stats .range-value { font-size: .8rem; }
.history-stats small { font-size: .75rem; font-weight: 400; }
.chart-frame { padding: .2rem 0; border-radius: .5rem; background: #f6faf8; }
.battery-history svg { display: block; width: 100%; height: 6.5rem; color: #15665c; }
.chart-grid { stroke: #d9e7e1; stroke-width: 1; stroke-dasharray: 3 4; }
.time-axis { display: flex; justify-content: space-between; margin-top: .4rem; font-size: .75rem; color: #526971; }
.chart-note { margin: .7rem 0 0; color: #526971; font-size: .75rem; line-height: 1.5; }
.history-empty { margin: 1rem 0 0; padding: 1rem; border: 1px dashed #d5e2df; border-radius: .5rem; color: #526971; font-size: .85rem; line-height: 1.5; }
.battery-history details { margin-block-start: 1rem; border-top: 1px solid #e2ebe8; }
.battery-history summary { padding: .85rem 0 .25rem; cursor: pointer; font-size: .85rem; font-weight: 600; }
.readings { max-height: 16rem; overflow: auto; margin-top: .5rem; }
.readings table { width: 100%; border-collapse: collapse; font-size: .8rem; }
.readings th, .readings td { text-align: start; padding: .55rem .4rem; border-bottom: 1px solid #edf2f0; }
.readings th { color: #526971; background: #f6faf8; }
.readings td:first-child { white-space: nowrap; }
.history-event { color: #765219; }
.history-event.resumed { color: #12604c; }
@media (max-width: 900px) { .history-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .battery-history { padding: 1rem; } .reading-context { align-items: start; } .latest-reading strong { font-size: 2rem; } .history-controls button { flex: 1 1 100%; } .history-stats { column-gap: .5rem; } }
</style>
