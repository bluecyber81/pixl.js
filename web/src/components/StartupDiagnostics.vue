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
    <details class="cold-start"><summary>{{ de ? 'Kaltstartreihen vergleichen' : 'Compare cold-start series' }}</summary>
      <p>{{ de ? 'Pro Reihe 3 bis 20 Start- oder Gesamtberichte derselben Firmware auswählen, je einen pro Neustart. Für A und B dasselbe Gerät, dieselbe Sammlung und eine ähnliche Akkuspannung verwenden. Gesamtberichte enthalten zusätzliche Vergleichsdaten.' : 'Select 3 to 20 startup or full reports per series, one per restart on the same firmware. Use the same device and collection at a similar battery voltage for A and B. Full reports provide additional context.' }}</p>
      <div v-for="group in ['A','B']" :key="group" class="series-input">
        <label>{{ group === 'A' ? (de ? 'A · Ausgangsversion' : 'A · Baseline') : (de ? 'B · Vergleichsversion (optional)' : 'B · Candidate (optional)') }}
          <input type="file" multiple accept=".json,application/json" @change="loadSeries($event, group)" />
        </label>
        <span v-if="series[group]" role="status">{{ series[group].version }} · {{ series[group].count }} {{ de ? 'Starts' : 'boots' }}</span>
        <span v-else-if="seriesError[group]" role="status">{{ de ? 'Ungültige Reihe. Prüfe Anzahl, Dateigröße (max. 1 MiB je Bericht), Firmwareversion und vollständige, unterschiedliche Zeitmarken.' : 'Invalid series. Check file count and size (1 MiB per report), firmware version, and complete, distinct timing markers.' }}</span>
      </div>
      <div v-if="comparison.metrics.length" class="table-wrap">
        <table>
          <caption>{{ de ? 'Median und Spannweite (Min–Max)' : 'Median and range (min–max)' }}</caption>
          <thead><tr><th scope="col">{{ de ? 'Messwert' : 'Metric' }}</th>
            <th v-if="series.A" scope="col">A</th><th v-if="series.B" scope="col">B</th>
            <th v-if="series.A && series.B" scope="col">Δ B − A</th></tr></thead>
          <tbody><tr v-for="row in comparison.metrics" :key="row.key"><th scope="row">{{ seriesLabels[row.key] }}</th>
            <td v-if="series.A">{{ formatStats(row.before) }}</td><td v-if="series.B">{{ formatStats(row.after) }}</td>
            <td v-if="series.A && series.B">{{ row.delta === null ? '—' : signed(row.delta) }}</td></tr></tbody>
        </table>
        <p v-if="series.A && series.B" class="limits">{{ de ? 'Δ ist der Median von B minus dem Median von A. Negative Zeitwerte bedeuten einen kürzeren gemessenen Abschnitt in B.' : 'Δ is the median of B minus the median of A. Negative timing differences mean a shorter measured interval in B.' }}</p>
      </div>
      <ul v-if="comparison.notices.length" class="limits"><li v-for="(notice, i) in comparison.notices" :key="i">{{ describeNotice(notice) }}</li></ul>
    </details>
    <p class="limits">{{ text.limits }}</p>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { startupSeriesSample, summarizeStartupSamples, startupSeriesComparison, compareStartup, createStartupDiagnosticReport, normalizeStartupDiagnostics, startupDiagnosticRows, startupDiagnosticsText, startupStorageIntervals, startupMountPresentation } from '../lib/startup-diagnostics.js';
const props = defineProps({ firmwareVersion: String, connected: Boolean, blocked: Boolean, generation: { type: Number, default: 0 },
  locale: { type: String, default: 'de_DE' }, readDiagnostics: { type: Function, default: null } });
const emit = defineEmits(['busy', 'export']);
const state = ref('unknown'), info = ref(null), observedAt = ref(null);
const text = computed(() => startupDiagnosticsText(props.locale));
const de = computed(() => props.locale.startsWith('de'));
const seriesLabels = computed(() => ({
  total: text.value.total + ' (ms)', storage: text.value.storage + ' (ms)',
  scanMilliseconds: de.value ? 'Letzter PackedFS-Scan (ms)' : 'Last PackedFS scan (ms)',
  physicalReadAttempts: text.value.comparisonMetric.physicalReadAttempts,
  physicalReadBytes: text.value.comparisonMetric.physicalReadBytes + ' (B)',
  cacheHits: de.value ? 'Cachetreffer' : 'Cache hits',
  cacheMisses: de.value ? 'Cachefehlschläge' : 'Cache misses',
  bypassReads: de.value ? 'Zugriffe außerhalb des Caches' : 'Reads bypassing the cache',
  cacheSlotsAllocated: de.value ? 'Zugeteilte Cache-Seiten beim Einbinden' : 'Mount cache pages allocated',
  cacheSlotsFilled: de.value ? 'Gefüllte Cache-Seiten beim Einbinden' : 'Mount cache pages filled'
}));
const series = ref({A:null, B:null}), seriesError = ref({A:false, B:false});
const seriesRequest = {A:0, B:0};
const comparison = computed(() => startupSeriesComparison(series.value.A, series.value.B));
function formatStats(stats) {
  if (!stats) return '—';
  const format = numberFormat.value.format;
  return `${format(stats.median)} (${format(stats.min)}–${format(stats.max)})`;
}
function describeNotice({kind, group, key, keys}) {
  const german = de.value;
  const names = german ? {board:'Board', source:'SourceID', reset:'Resetursache', space:'Speicher frei/gesamt'}
    : {board:'Board', source:'SourceID', reset:'Reset reason', space:'Storage free/total'};
  if (kind === 'missing') return german ? `${group} · In mindestens einem Bericht fehlen Angaben zu ${keys.map(k => names[k]).join(', ')}.`
    : `${group} · At least one report lacks data for ${keys.map(k => names[k]).join(', ')}.`;
  if (kind === 'overlap') return german ? 'A und B enthalten identische Zeitmarken derselben Firmware. Prüfe, ob derselbe Start zweimal ausgewählt wurde.'
    : 'A and B contain identical timing markers on the same firmware. Check whether the same boot was selected twice.';
  if (kind === 'differentBuild') return german ? 'A und B melden unterschiedliche SourceIDs für die beiden Firmwareversionen.'
    : 'A and B report different SourceIDs for the two firmware versions.';
  const values = g => series.value[g].context[key].values.map(v => key === 'reset' ? '0x' + v.toString(16) : key === 'space' ? v + ' B' : v).join(', ');
  if (kind === 'mixed') return german ? `${group} · ${names[key]} weicht innerhalb der Reihe ab (${values(group)}).`
    : `${group} · ${names[key]} varies within the series (${values(group)}).`;
  return german ? `${names[key]} unterscheidet sich zwischen A (${values('A')}) und B (${values('B')}).`
    : `${names[key]} differs between A (${values('A')}) and B (${values('B')}).`;
}
async function loadSeries(event, group) {
  const id = ++seriesRequest[group], files = Array.from(event.target.files || []);
  series.value[group] = null; seriesError.value[group] = false;
  if (!files.length) return;
  try {
    if (files.length < 3 || files.length > 20 || files.some(f => f.size > 1024*1024)) throw new Error();
    const samples = [];
    for (const file of files) {
      const doc = JSON.parse(await file.text());
      if (id !== seriesRequest[group]) return;
      samples.push(startupSeriesSample(doc));
    }
    series.value[group] = summarizeStartupSamples(samples);
    seriesError.value[group] = !series.value[group];
  } catch { if (id === seriesRequest[group]) seriesError.value[group] = true; }
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
onBeforeUnmount(() => { mounted = false; ++seriesRequest.A; ++seriesRequest.B; clear(); });
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
.series-input { margin:10px 0; font-size:.85rem; }
.series-input label,.series-input input,.series-input span { display:block; margin:4px 0; }
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
