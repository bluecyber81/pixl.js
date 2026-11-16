<template>
  <section class="battery-history" aria-labelledby="battery-history-title">
    <h3 id="battery-history-title">{{ de ? 'Akkuverlauf' : 'Battery history' }}</h3>
    <p>{{ de ? 'Alle 10 Sekunden die vom Gerät zuletzt gemeldete Spannung und Ladeanzeige lesen. Die letzten 120 Einträge bleiben in dieser Verbindung. Die Uhrzeit gibt den Empfang im Browser an.' : 'Read the last voltage and charge indication reported by the device every 10 seconds. The latest 120 entries stay in this connection. Times show when the browser received each reading.' }}</p>
    <div class="history-controls">
      <button type="button" :disabled="!running && (!connected || paused)" @click="running ? stop() : start()">
        {{ running ? (de ? 'Aufzeichnung stoppen' : 'Stop recording') : (de ? 'Aufzeichnung starten' : 'Start recording') }}
      </button>
      <button v-if="rows.length" type="button" @click="saveCsv">{{ de ? 'CSV speichern' : 'Save CSV' }}</button>
      <span role="status">{{ status }}</span>
    </div>
    <p v-if="saveFailed" role="alert">{{ de ? 'Die CSV konnte nicht gespeichert werden.' : 'Could not save the CSV.' }}</p>
    <figure v-if="chart.points.length">
      <figcaption><strong>{{ voltage(lastValid.mv) }}</strong> · {{ charge(lastValid.charging) }} · <time :datetime="iso(lastValid.at)">{{ time(lastValid.at) }}</time></figcaption>
      <small v-if="chart.max !== chart.min">Min–Max · {{ voltage(chart.min) }} – {{ voltage(chart.max) }}</small>
      <svg viewBox="0 0 320 76" aria-hidden="true" preserveAspectRatio="none">
        <polyline v-for="(line, index) in chart.lines" :key="index" :points="line" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
        <circle v-for="(point, index) in chart.points" :key="index" :cx="point.x" :cy="point.y" r="2" fill="currentColor" />
      </svg>
      <div class="time-axis"><time :datetime="iso(rows[0].at)">{{ time(rows[0].at) }}</time><time :datetime="iso(rows.at(-1).at)">{{ time(rows.at(-1).at) }}</time></div>
    </figure>
    <details v-if="rows.length">
      <summary>{{ de ? 'Messwerte und Pausen' : 'Readings and pauses' }} ({{ rows.length }})</summary>
      <div class="readings"><table>
        <thead><tr><th>{{ de ? 'Uhrzeit' : 'Time' }}</th><th>{{ de ? 'Spannung' : 'Voltage' }}</th><th>{{ de ? 'Ladeanzeige' : 'Charge indication' }}</th></tr></thead>
        <tbody><tr v-for="row in recentFirst" :key="row.id">
          <td><time :datetime="iso(row.at)">{{ time(row.at) }}</time></td>
          <template v-if="row.mv !== null"><td>{{ voltage(row.mv) }}</td><td>{{ charge(row.charging) }}</td></template>
          <td v-else colspan="2">{{ row.reason === 'pause' ? (de ? 'Aufzeichnung pausiert' : 'Recording paused') : (de ? 'Kein gültiger Spannungswert' : 'Voltage unavailable') }}</td>
        </tr></tbody>
      </table></div>
    </details>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatBatteryVoltage, normalizePowerDiagnostics } from '../lib/power-diagnostics.js';
import { batteryHistoryChart, batteryHistoryCsv, BATTERY_HISTORY_INTERVAL, BATTERY_HISTORY_LIMIT } from '../lib/battery-history.js';
import { saveBlob } from '../lib/browser-tools.js';

const props = defineProps({ locale: String, connected: Boolean, blocked: Boolean, readPower: {type: Function, required: true} });
const de = computed(() => props.locale?.startsWith('de'));
const visible = ref(true);
const paused = computed(() => !visible.value || props.blocked);
const rows = ref([]);
const recentFirst = computed(() => [...rows.value].reverse());
const lastValid = computed(() => recentFirst.value.find(row => row.mv !== null));
const chart = computed(() => batteryHistoryChart(rows.value));
const running = ref(false);
const saveFailed = ref(false);
const outcome = ref('');
const status = computed(() => {
  if (!props.connected) return de.value ? 'Gerät verbinden.' : 'Connect a device.';
  if (running.value && paused.value) return de.value ? 'Aufzeichnung pausiert.' : 'Recording paused.';
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

function saveCsv() {
  saveFailed.value = false;
  try {
    const filename = 'Allmiibo-' + (de.value ? 'Akkuverlauf' : 'Battery-history') + '-' + iso(rows.value.at(-1).at).replace(/[:.]/g, '-') + '.csv';
    saveBlob(new Blob(['\uFEFF', batteryHistoryCsv(rows.value)], {type:'text/csv;charset=utf-8'}), filename);
  } catch { saveFailed.value = true; }
}

let serial = 0, nextId = 0, timer, inFlight = false;
function add(mv, charging, reason) {
  rows.value.push({id: ++nextId, at: Date.now(), mv, charging, reason});
  if (rows.value.length > BATTERY_HISTORY_LIMIT) rows.value.shift();
}
function gap() {
  if (rows.value.at(-1)?.mv != null) add(null, null, 'pause');
}
function cancelPending() {
  ++serial;
  clearTimeout(timer);
}
function stop(reason = 'stopped') {
  cancelPending();
  if (running.value) gap();
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
    if (result === undefined) { gap(); return; } // Transport occupied.
    if (result === null) { stop('unsupported'); return; }
    const power = normalizePowerDiagnostics(result);
    if (!power) throw new Error('Invalid power diagnostics');
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
watch(paused, value => {
  cancelPending();
  if (!running.value) return;
  if (value) gap();
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
.battery-history { margin-block: 1rem; padding: 1rem; border: 1px solid #b9cfcd; border-radius: .75rem; }
.battery-history h3 { margin: 0; }
.history-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
.history-controls button { padding: .5rem .85rem; border-radius: .45rem; border: 1px solid #8daaa6; background: white; color: #24434b; cursor: pointer; }
.history-controls button:disabled { opacity: .6; cursor: default; }
.battery-history figure { margin: 1rem 0; }
.battery-history svg { display: block; width: 100%; height: 5rem; color: #15665c; border-bottom: 1px solid #b9cfcd; }
.time-axis { display: flex; justify-content: space-between; font-size: .85em; }
.battery-history details { margin-block-start: .75rem; }
.readings { max-height: 16rem; overflow: auto; }
.readings table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.readings th, .readings td { text-align: start; padding: .25rem; }
</style>
