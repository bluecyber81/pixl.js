<template>
  <div class="report-comparison">
    <label>{{ pick('Zwei bis acht Geräteprüfungen auswählen (JSON, je bis 1 MiB)', 'Choose two to eight device checks (JSON, up to 1 MiB each)') }}
      <input type="file" accept=".json,application/json" multiple @change="load">
    </label>
    <p v-if="busy" role="status">{{ pick('Berichte werden gelesen …', 'Reading reports …') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="selectionFailed && result">{{ pick('Angezeigt wird der vorherige gültige Vergleich.', 'The previous valid comparison is shown.') }}</p>
    <template v-if="result">
      <p class="loaded-count" role="status">{{ result.reports.length }} {{ pick('Berichte geladen', 'reports loaded') }}</p>
      <p>{{ pick('Gegenübergestellt werden die Angaben je Export. Änderungen beziehen sich auf dieselben vollständig dokumentierten Einstellungen im jeweils vorigen Bericht. Die Geräteidentität ist unbekannt.', 'Each entry summarizes one export. Changes compare the same fully recorded settings with the preceding report. Device identity is unknown.') }}</p>
      <div class="table-scroll" tabindex="0" role="region" :aria-label="pick('Berichtsvergleich','Report comparison')">
        <table><thead><tr><th scope="col">{{ pick('Export (UTC)', 'Export (UTC)') }}</th>
          <th v-for="field in fields" :key="field.key" scope="col">{{ field.label }}</th>
        </tr></thead><tbody><tr v-for="(row,index) in result.reports" :key="index">
          <th scope="row"><time :datetime="row.exportedAt">{{ dateLabel(row.exportedAt) }}</time></th>
          <td v-for="field in fields" :key="field.key">{{ field.value(row) }}</td>
        </tr></tbody></table>
      </div>
      <ol class="comparison-cards" :aria-label="pick('Berichtsvergleich', 'Report comparison')">
        <li v-for="(row,index) in result.reports" :key="index">
          <time :datetime="row.exportedAt">{{ dateLabel(row.exportedAt) }} UTC</time>
          <dl><template v-for="field in fields" :key="field.key">
            <dt>{{ field.label }}</dt><dd>{{ field.value(row) }}</dd>
          </template></dl>
        </li>
      </ol>
      <button type="button" :disabled="busy" @click="save">{{ pick('Vergleich als JSON speichern', 'Save comparison as JSON') }}</button>
    </template>
  </div>
</template>
<script setup>
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue';
import {saveBlob} from '../lib/browser-tools.js';
import {compareGuidedReportFiles} from '../lib/guided-report-comparison.js';

const props = defineProps({locale:{type:String, default:'de_DE'}});
const pick = (de,en) => props.locale.startsWith('de') ? de : en;
const fields = computed(() => [
  {key:'firmware',label:'Firmware',value:row => row.firmware.join(' → ') || pick('Unbekannt','Unknown')},
  {key:'routes',label:pick('Prüfwege','Routes'),value:row => row.baseCases + '/4'},
  {key:'config',label:pick('Konfigurationen','Configurations'),value:row => row.configurations + '/32'},
  {key:'different',label:pick('Abweichungen','Unexpected outcomes'),value:row => row.differed},
  {key:'changed',label:pick('Geändert / gemeinsam','Changed / shared'),value:row => row.comparison ? row.comparison.changed.length + ' / ' + row.comparison.sharedConfigurations : '—'},
]);
const dates = computed(() => new Intl.DateTimeFormat(props.locale.startsWith('de') ? 'de-DE' : 'en-GB',
  {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'}));
const dateLabel = value => dates.value.format(new Date(value));
const busy = ref(false), error = ref(''), selectionFailed = ref(false), result = shallowRef(null);
let request = 0;

async function load(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;
  const token = ++request;
  busy.value = true;
  selectionFailed.value = false;
  error.value = '';
  try {
    const next = await compareGuidedReportFiles(files);
    if (token === request) result.value = next;
  } catch {
    if (token === request) {
      selectionFailed.value = true;
      error.value = pick('Auswahl fehlgeschlagen. Wähle zwei bis acht gültige Geräteprüfungen mit höchstens 1 MiB je Datei.', 'Selection failed. Choose two to eight valid device checks of up to 1 MiB each.');
    }
  } finally {
    if (token === request) busy.value = false;
  }
}
function save() {
  try {
    saveBlob(new Blob([JSON.stringify(result.value,null,2)], {type:'application/json'}), 'Allmiibo-Geraetepruefungen-Vergleich.json');
    error.value = '';
  } catch {
    error.value = pick('Speichern fehlgeschlagen. Bitte erneut versuchen.', 'Could not save. Please try again.');
  }
}
onBeforeUnmount(() => { request++; });
</script>
<style scoped>
.report-comparison {display:grid;gap:.75rem;min-width:0;overflow-wrap:anywhere}
label {display:grid;gap:.4rem}
input {max-width:100%;min-width:0}
.table-scroll {min-width:0;max-width:100%;overflow-x:auto}
table {width:100%;border-collapse:collapse}
thead th {background:var(--surface,#f5f8f5)}
.comparison-cards {display:none}
time {font-variant-numeric:tabular-nums}
@media (max-width:42rem) {
  .table-scroll {display:none}
  .comparison-cards {display:grid;gap:.7rem;margin:0;padding:0;list-style:none}
  .comparison-cards li {min-width:0;padding:.75rem;border:1px solid var(--rule,#ccd8d3);border-inline-start:3px solid #33746b;border-radius:.5rem}
  .comparison-cards time {font-weight:650}
  dl {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);gap:.35rem .5rem;margin:.65rem 0 0}
  dt,dd {margin:0;line-height:1.4}
  dd {text-align:end;font-variant-numeric:tabular-nums}
}
@media (max-width:23rem) { dl {grid-template-columns:minmax(0,1fr)} dd {text-align:start;margin-bottom:.35rem} }
th,td {text-align:start;padding:.45rem;border-bottom:1px solid #d1dde2}
button {justify-self:start;min-height:44px}
</style>
