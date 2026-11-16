<template>
  <section class="startup-diagnostics" :aria-busy="loading">
    <h3>{{ text.title }}</h3>
    <p>{{ text.scope }}</p>
    <div class="actions">
      <button type="button" @click="read" :disabled="!connected || blocked || loading || !readDiagnostics">{{ text.read }}</button>
      <button type="button" @click="exportReport" :disabled="!connected || !info || loading">{{ text.export }}</button>
    </div>
    <p role="status">{{ text[!connected ? 'disconnected' : state] }} <span v-if="info && info.phaseMask !== 63">{{ text.partial }}</span></p>
    <p v-if="observedAt" class="observed">{{ text.observed }}: <time :datetime="observedAt">{{ observedAt }}</time></p>
    <div v-if="summary" class="timing-summary">
      <div><span>{{ text.measuredTotal }}</span><strong>{{ summary.total }} {{ text.ms }}</strong></div>
      <div><span>{{ text.longestInterval }}</span><strong>{{ text.phases[summary.longest.id] }}</strong><small>{{ summary.longest.sincePreviousMilliseconds }} {{ text.ms }}</small></div>
    </div>
    <div v-if="info" class="table-wrap">
      <table><caption>{{ text.title }}</caption>
        <thead><tr><th scope="col">{{ text.phase }}</th><th scope="col">{{ text.elapsed }}</th><th scope="col">{{ text.interval }}</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.id"><th scope="row">{{ text.phases[row.id] }}</th>
          <td>{{ row.elapsedMilliseconds === null ? text.absent : `${row.elapsedMilliseconds} ${text.ms}` }}</td>
          <td><span>{{ row.sincePreviousMilliseconds === null ? '—' : `${row.sincePreviousMilliseconds} ${text.ms}` }}</span><span v-if="summary && row.sincePreviousMilliseconds > 0" class="phase-meter" aria-hidden="true"><span :style="{width: (row.sincePreviousMilliseconds / summary.total * 100) + '%'}"></span></span></td></tr></tbody>
      </table>
    </div>
    <details v-if="storageIntervals.length"><summary>{{ text.storageIntervals }}</summary>
      <dl><div v-for="item in storageIntervals" :key="item.id"><dt>{{ text.intervals[item.id] }}</dt>
        <dd>{{ item.milliseconds === null ? text.absent : item.milliseconds + ' ms' }}</dd></div></dl>
    </details>
    <details v-if="mount" class="mount-profile" open><summary>{{ mount.title }}</summary>
      <dl><div v-for="row in mount.rows" :key="row[0]"><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></div></dl>
      <p class="limits">{{ mount.note }}</p>
    </details>
    <details v-if="summary"><summary>{{ text.baseline }}</summary>
      <p>{{ text.baselineHint }}</p>
      <input type="file" accept=".json,application/json" :aria-label="text.baseline" @change="loadBaseline" />
      <p v-if="baselineError" role="status">{{ text.invalidBaseline }}</p>
      <div v-if="difference" role="status" class="comparison">
        <h4>{{ text.difference }}</h4>
        <p v-if="difference.baselineVersion && firmwareVersion" class="comparison-versions">
          {{ text.previous }} {{ difference.baselineVersion }} · {{ text.current }} {{ firmwareVersion }}
        </p>
        <dl class="comparison-times">
          <div><dt>{{ text.total }}</dt><dd>{{ signed(difference.total) }} ms</dd></div>
          <div><dt>{{ text.storage }}</dt><dd>{{ signed(difference.storage) }} ms</dd></div>
          <div v-for="row in difference.storageIntervals" :key="row.id">
            <dt>{{ text.intervals[row.id] }}</dt><dd>{{ signed(row.milliseconds) }} ms</dd>
          </div>
        </dl>
        <template v-if="difference.mount">
          <h4>{{ text.mountComparison }}</h4>
          <dl v-if="difference.mount.length" class="comparison-reads">
            <div v-for="row in difference.mount" :key="row.id">
              <dt>{{ text.comparisonMetric[row.id] }}</dt>
              <dd><strong>{{ mountValue(row.id, row.delta, true) }}</strong>
                <small>{{ text.previous }} {{ mountValue(row.id, row.before) }} · {{ text.current }} {{ mountValue(row.id, row.after) }}</small>
              </dd>
            </div>
          </dl>
          <p v-if="difference.mount.length < 3" class="limits">{{ text.mountLimits }}</p>
        </template>
      </div>
    </details>
    <details><summary>{{ de ? 'Mehrere Kaltstarts auswerten' : 'Compare multiple cold starts' }}</summary>
      <p>{{ de ? '3 bis 20 JSON-Berichte auswählen: je einer pro echtem Neustart, am selben Gerät mit derselben Firmware, Sammlung und ähnlicher Akkuspannung.' : 'Select 3 to 20 JSON reports: one per physical restart, from the same device, firmware and collection at a similar battery voltage.' }}</p>
      <input type="file" multiple accept=".json,application/json" :aria-label="de ? 'Kaltstartberichte' : 'Cold-start reports'" @change="loadSeries"/>
      <p v-if="seriesError" role="status">{{ de ? 'Keine vergleichbare Reihe: Version fehlt oder weicht ab, Zeitmarken fehlen oder wiederholen sich, oder Anzahl bzw. Dateigröße ist zu groß.' : 'No comparable series: missing or different versions, missing or duplicate markers, or invalid file count or size.' }}</p>
      <p v-if="series" role="status">{{ series.version }} · {{ series.count }} {{ de ? 'Starts' : 'boots' }} · Median (min–max):
        {{ text.storage }} {{ series.storage.median }} ms ({{ series.storage.min }}–{{ series.storage.max }}) ·
        {{ text.total }} {{ series.total.median }} ms ({{ series.total.min }}–{{ series.total.max }})</p>
      <div v-if="series?.mount" class="table-wrap">
        <table>
          <caption>{{ de ? 'Letztes Einbinden von PackedFS je Bericht' : 'Last PackedFS mount in each report' }}</caption>
          <thead><tr><th scope="col">{{ de ? 'Messwert' : 'Metric' }}</th><th scope="col">Median</th><th scope="col">Min–Max</th></tr></thead>
          <tbody><tr v-for="[key, label] in mountSeriesLabels" :key="key"><th scope="row">{{ label }}</th><td>{{ series.mount[key].median }}</td><td>{{ series.mount[key].min }}–{{ series.mount[key].max }}</td></tr></tbody>
        </table>
      </div>
    </details>
    <p class="limits">{{ text.limits }}</p>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { startupSeries, compareStartup, createStartupDiagnosticReport, normalizeStartupDiagnostics, startupDiagnosticRows, startupDiagnosticsText, startupStorageIntervals, startupMountPresentation } from '../lib/startup-diagnostics.js';
const props = defineProps({ firmwareVersion: String, connected: Boolean, blocked: Boolean, generation: { type: Number, default: 0 },
  locale: { type: String, default: 'de_DE' }, readDiagnostics: { type: Function, default: null } });
const emit = defineEmits(['busy', 'export']);
const state = ref('unknown'), info = ref(null), observedAt = ref(null);
const text = computed(() => startupDiagnosticsText(props.locale));
const de = computed(() => props.locale.startsWith('de'));
const mountSeriesLabels = computed(() => [
  ['scanMilliseconds', de.value ? 'Scanzeit (ms)' : 'Scan time (ms)'],
  ['physicalReadAttempts', de.value ? 'Physische Leseversuche' : 'Physical read attempts'],
  ['cacheHits', de.value ? 'Cachetreffer' : 'Cache hits'],
  ['cacheMisses', de.value ? 'Cachefehlschläge' : 'Cache misses'],
  ['bypassReads', de.value ? 'Zugriffe außerhalb des Caches' : 'Reads bypassing the cache'],
]);
const series = ref(null), seriesError = ref(false);
let seriesRequest = 0;
async function loadSeries(event) {
  const id = ++seriesRequest, files = Array.from(event.target.files || []);
  series.value = null; seriesError.value = false;
  if (!files.length) return;
  try {
    if (files.length < 3 || files.length > 20 || files.some(f => f.size > 1024*1024)) throw new Error();
    const reports = [];
    for (const file of files) {
      if (id !== seriesRequest) return;
      const doc = JSON.parse(await file.text());
      reports.push({firmwareVersion:doc?.firmwareVersion, startup:doc?.startup});
    }
    if (id !== seriesRequest) return;
    series.value = startupSeries(reports); seriesError.value = !series.value;
  } catch { if (id === seriesRequest) seriesError.value = true; }
}
const loading = computed(() => state.value === 'loading');
const rows = computed(() => startupDiagnosticRows(info.value));
const storageIntervals = computed(() => startupStorageIntervals(info.value));
const mount = computed(() => startupMountPresentation(info.value, props.locale));
// Compare only a complete series. A partial recording cannot identify the
// slowest interval of the whole measured application start.
const summary = computed(() => {
  if (info.value?.phaseMask !== 63) return null;
  const total = rows.value.at(-1)?.elapsedMilliseconds;
  if (!Number.isFinite(total) || total <= 0) return null;
  const longest = rows.value.slice(1).reduce((best, row) => row.sincePreviousMilliseconds > best.sincePreviousMilliseconds ? row : best);
  return {total, longest};
});
let request = 0, baselineRequest = 0, mounted = true;
const difference = ref(null), baselineError = ref(false);
const numberFormat = computed(() => new Intl.NumberFormat(de.value ? 'de-DE' : 'en-US'));
const signed = value => (value > 0 ? '+' : '') + numberFormat.value.format(value);
function mountValue(id, value, showSign = false) {
  const unit = {scanMilliseconds: ' ms', physicalReadBytes: ' B'}[id] || '';
  return (showSign ? signed(value) : numberFormat.value.format(value)) + unit;
}
async function loadBaseline(event) {
  const file = event.target.files?.[0], id = ++baselineRequest;
  difference.value = null; baselineError.value = false;
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error();
    const report = JSON.parse(await file.text());
    if (id !== baselineRequest) return;
    difference.value = compareStartup(report, info.value);
    baselineError.value = !difference.value;
  } catch { if (id === baselineRequest) baselineError.value = true; }
}
function clear() {
  ++request;
  ++baselineRequest; difference.value = null; baselineError.value = false;
  const wasLoading = loading.value;
  state.value = 'unknown'; info.value = null; observedAt.value = null;
  if (wasLoading) emit('busy', false);
}
watch(() => [props.connected, props.generation], clear, { flush: 'sync' });
onBeforeUnmount(() => { mounted = false; ++seriesRequest; clear(); });
async function read() {
  if (!props.connected || props.blocked || loading.value || !props.readDiagnostics) return;
  clear();
  const id = request, generation = props.generation;
  const current = () => mounted && id === request && props.connected && generation === props.generation;
  state.value = 'loading'; emit('busy', true);
  try {
    const result = await props.readDiagnostics();
    if (!current()) return;
    if (result === null) { state.value = 'unavailable'; return; }
    const parsed = normalizeStartupDiagnostics(result);
    if (!parsed) throw new Error('Invalid startup diagnostics');
    info.value = parsed; observedAt.value = new Date().toISOString(); state.value = 'available';
  } catch { if (current()) { info.value = null; observedAt.value = null; state.value = 'failed'; } }
  finally { if (current()) emit('busy', false); }
}
function exportReport() {
  if (!props.connected || !info.value || loading.value) return;
  emit('export', createStartupDiagnosticReport(info.value, observedAt.value, props.firmwareVersion));
}
</script>
<style scoped>
.startup-diagnostics { margin:16px 0; padding:16px; border:1px solid #c6d8e6; border-radius:12px; background:#f7fafc; color:#20364b; }
.startup-diagnostics input[type="file"] { min-width:0; max-width:100%; }
h3 { margin:0 0 10px; } p { font-size:.86rem; line-height:1.5; } .actions { display:flex; flex-wrap:wrap; gap:10px; }
button { min-height:44px; padding:8px 12px; border:1px solid #9eb8cb; border-radius:7px; background:#fff; color:#244f71; cursor:pointer; }
button:disabled { opacity:.55; cursor:default; } button:focus-visible { outline:3px solid #4e94c9; outline-offset:2px; }
.table-wrap { overflow-x:auto; } table { width:100%; border-collapse:collapse; font-size:.8rem; } caption { text-align:left; font-weight:600; padding:6px 0; }
th,td { padding:8px; border-bottom:1px solid #d7e2ec; text-align:left; } tbody th { font-weight:400; } td { font-variant-numeric:tabular-nums; }
.limits,.observed { font-size:.77rem; color:#536b80; overflow-wrap:anywhere; } .limits { margin-bottom:0; }
.timing-summary { display:grid; grid-template-columns:1fr 2fr; gap:10px; margin:14px 0; }
.timing-summary>div { display:flex; flex-direction:column; gap:5px; padding:12px; border:1px solid #d7e2ec; border-radius:9px; background:#fff; }
.timing-summary span,.timing-summary small { font-size:.76rem; color:#536b80; }
.timing-summary strong { font-size:.91rem; line-height:1.4; font-variant-numeric:tabular-nums; }
.phase-meter { display:block; height:5px; margin-top:5px; border-radius:4px; background:#e6edf3; overflow:hidden; }
.phase-meter>span { display:block; height:100%; border-radius:4px; background:#3d7da8; }
@media(max-width:480px) { .timing-summary { grid-template-columns:1fr; } }
@media(max-width:600px) { .startup-diagnostics { padding:10px; } th,td { padding:6px; } }
.mount-profile{padding:12px;margin:12px 0;border:1px solid #d7e2ec;border-radius:8px;background:#fff}.mount-profile summary{cursor:pointer;font-size:.86rem;font-weight:600}.mount-profile dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;font-size:.8rem}.mount-profile dt{color:#536b80}.mount-profile dd{margin:4px 0 0;font-variant-numeric:tabular-nums}
.comparison { margin:12px 0; }
.comparison h4 { margin:12px 0 5px; font-size:.9rem; }
.comparison-versions,.comparison dd small { color:#435970; font-size:.78rem; }
.comparison dl { margin:6px 0; font-variant-numeric:tabular-nums; }
.comparison dd { margin:0; }
.comparison-times>div { display:flex; justify-content:space-between; gap:12px; padding:5px 0; font-size:.82rem; border-bottom:1px solid #d7e2ec; }
.comparison-times dd { flex-shrink:0; }
.comparison-reads { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,165px),1fr)); gap:8px; }
.comparison-reads>div { padding:10px; border:1px solid #c6d8e6; border-radius:8px; background:#fff; }
.comparison-reads dt { font-size:.78rem; }
.comparison-reads dd strong,.comparison-reads dd small { display:block; margin-top:4px; }
@media(max-width:480px) {
  .comparison-reads>div:last-child:nth-child(odd) { grid-column:1/-1; }
}
</style>
