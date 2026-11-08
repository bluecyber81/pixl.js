<template>
  <details class="link-settings">
    <summary>{{ de ? 'Downloadlinks sichern und übertragen' : 'Back up and transfer download links' }}</summary>
    <p>{{ de ? 'Die JSON-Datei enthält deine vollständigen HTTPS-Adressen, einschließlich möglicher privater Zugangsparameter. Sie enthält keine BIN-Dateien.' : 'The JSON file includes your full HTTPS addresses, including any private access parameters. It contains no BIN files.' }}</p>
    <button type="button" @click="download">{{ de ? 'Links als JSON speichern' : 'Save links as JSON' }}</button>
    <label class="link-file">{{ de ? 'Linkdatei für Vorschau auswählen' : 'Choose a link file to preview' }}
      <input type="file" accept=".json,application/json" :disabled="saving" @change="loadFile" />
    </label>
    <div v-if="preview" class="link-preview">
      <h4>{{ de ? 'Importvorschau' : 'Import preview' }}</h4>
      <dl><template v-for="state in states" :key="state"><dt>{{ label(state) }}</dt><dd>{{ preview.counts[state] }}</dd></template></dl>
      <details v-if="preview.rows.length"><summary>{{ de ? 'Adressen vergleichen' : 'Compare addresses' }}</summary>
        <ol :start="page * pageSize + 1">
          <li v-for="(row, index) in visibleRows" :key="index">
            <strong>{{ label(row.state) }}</strong> · <code>{{ row.id || '—' }}</code>
            <div>{{ row.url || '—' }}</div>
            <div v-if="row.state === 'changed'">{{ de ? 'Bisher' : 'Current' }} · {{ row.previous }}</div>
          </li>
        </ol>
        <div v-if="preview.rows.length > pageSize" class="link-actions">
          <button type="button" :disabled="page === 0" @click="page--">{{ de ? 'Zurück' : 'Previous' }}</button>
          <span>{{ page + 1 }} / {{ Math.ceil(preview.rows.length / pageSize) }}</span>
          <button type="button" :disabled="(page + 1) * pageSize >= preview.rows.length" @click="page++">{{ de ? 'Weiter' : 'Next' }}</button>
        </div>
      </details>
      <p v-if="!preview.valid" role="status">{{ de ? 'Bitte ungültige Einträge und doppelte IDs in der Datei korrigieren. Erst dann lassen sich die Links übernehmen.' : 'Correct invalid entries and duplicate IDs in the file before applying it.' }}</p>
      <template v-else>
        <label>{{ de ? 'Vorhandene Links' : 'Existing links' }}
          <select v-model="mode" :disabled="saving">
            <option value="add">{{ de ? 'Behalten · nur neue Links ergänzen' : 'Keep · add new links only' }}</option>
            <option value="replace">{{ de ? 'Geänderte Links aus der Datei übernehmen' : 'Replace changed links from this file' }}</option>
          </select>
        </label>
        <p>{{ de ? 'Andere IDs bleiben erhalten. Die Vorschau lädt keine Figuren. Besitz und Echtheit werden durch einen Link nicht bestätigt.' : 'Other IDs are kept. Previewing does not download figures. A link does not confirm ownership or authenticity.' }}</p>
        <button type="button" :disabled="saving || !changeCount" @click="apply">{{ de ? 'Links übernehmen' : 'Apply links' }} ({{ changeCount }})</button>
      </template>
    </div>
    <p v-if="feedback" role="status">{{ feedback[de ? 0 : 1] }}</p>
  </details>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { saveBlob } from '../lib/browser-tools.js';
import { exportFigureLinks, LINK_FILE_LIMIT, previewFigureLinks, importFigureLinks } from '../lib/figure-download-links.js';
const props = defineProps({ de: Boolean });
const states = ['added','same','changed','invalid','conflict'];
const labels = {
  added: ['Neu', 'New'], same: ['Unverändert', 'Unchanged'], changed: ['Geändert', 'Changed'],
  invalid: ['Ungültig', 'Invalid'], conflict: ['Konflikt · doppelte ID', 'Conflict · duplicate ID']
};
const label = state => labels[state][props.de ? 0 : 1];
const errors = {
  FIGURE_LINK_FORMAT: ['Die Datei ist unvollständig oder hat ein unbekanntes Format.', 'The file is incomplete or has an unknown format.'],
  FIGURE_LINK_LIMIT: ['Die Datei überschreitet 2 MiB oder 4.096 Einträge.', 'The file exceeds 2 MiB or 4,096 entries.'],
  FIGURE_LINK_STALE: ['Die gespeicherten Links haben sich geändert. Prüfe die aktualisierte Vorschau.', 'Saved links changed. Review the updated preview.'],
  FIGURE_STORAGE: ['Der Browserspeicher ist gesperrt oder voll. Die Links konnten nicht gespeichert oder gelesen werden.', 'Browser storage is blocked or full. Links could not be saved or read.'],
  FIGURE_URL: ['Ein bereits gespeicherter Link ist ungültig. Korrigiere seinen Eintrag im Katalog.', 'An existing saved link is invalid. Correct its entry in the catalogue.']
};
const preview = shallowRef(null), mode = ref('add'), page = ref(0), pageSize = 20;
const saving = ref(false), feedback = ref(null);
const visibleRows = computed(() => preview.value?.rows.slice(page.value * pageSize, (page.value + 1) * pageSize) || []);
const changeCount = computed(() => preview.value ? preview.value.counts.added + (mode.value === 'replace' ? preview.value.counts.changed : 0) : 0);
let serial = 0;
onBeforeUnmount(() => { serial++; });
function errorMessage(error) { return errors[error?.code] || ['Datei konnte nicht verarbeitet werden.', 'Could not process the file.']; }
function download() {
  try {
    const text = exportFigureLinks();
    saveBlob(new Blob([text], { type: 'application/json' }), 'Allmiibo-Figurenlinks.json');
    feedback.value = ['Download der Linkdatei angefordert.', 'Link file download requested.'];
  } catch (error) { feedback.value = errorMessage(error); }
}
async function loadFile(event) {
  const file = event.target.files?.[0], request = ++serial;
  event.target.value = '';
  preview.value = null; feedback.value = null; mode.value = 'add'; page.value = 0;
  if (!file) return;
  try {
    if (file.size > LINK_FILE_LIMIT) { feedback.value = errors.FIGURE_LINK_LIMIT; return; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (request === serial) preview.value = previewFigureLinks(text);
  } catch (error) { if (request === serial) feedback.value = errorMessage(error); }
}
async function apply() {
  if (!preview.value || saving.value || !changeCount.value) return;
  saving.value = true;
  try {
    const count = await importFigureLinks(preview.value, mode.value);
    preview.value = null;
    feedback.value = [count + ' Links übernommen.', count + ' links applied.'];
  } catch (error) {
    feedback.value = errorMessage(error);
    if (error.code === 'FIGURE_LINK_STALE') {
      try { preview.value = previewFigureLinks(preview.value.text); }
      catch (refreshError) { feedback.value = errorMessage(refreshError); preview.value = null; }
    }
  } finally { saving.value = false; }
}
</script>
<style scoped>
.link-settings { margin:.8rem 0; overflow-wrap:anywhere; min-width:0; }
summary { cursor:pointer; padding:.7rem 0; font-weight:600; }
label { display:grid; gap:.35rem; margin:.6rem 0; }
input,select,button { max-width:100%; min-width:0; box-sizing:border-box; font:inherit; }
input[type=file] { width:100%; } button,select { padding:.45rem .65rem; min-height:44px; }
button { cursor:pointer; } button:disabled { cursor:default; }
.link-preview { margin:.75rem 0; padding:.8rem; border:1px solid #a9c6c4; border-radius:10px; }
dl { display:grid; grid-template-columns:minmax(0,1fr) auto; max-width:26rem; } dt,dd { margin:.1rem 0; }
.link-actions { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; } li { margin:.5rem 0; }
</style>
