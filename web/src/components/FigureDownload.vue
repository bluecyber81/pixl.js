<template>
  <div class="entry-title">
    <button v-if="link" type="button" class="figure-name" :disabled="busy || saving"
      :aria-label="de ? entry.name + ' herunterladen' : 'Download ' + entry.name" @click="download">
      {{ entry.name }} <span aria-hidden="true">↓</span>
    </button>
    <strong v-else>{{ entry.name }}</strong>
    <span class="entry-type">{{ entry.type }}</span>
  </div>
  <details ref="editor" class="figure-download-link" @toggle="toggleEditor">
    <summary>{{ link ? (de ? 'Downloadlink bearbeiten' : 'Edit download link') : (de ? 'Downloadlink eintragen' : 'Add download link') }}</summary>
    <form v-if="editing" novalidate @submit.prevent="save">
      <label>{{ de ? 'Direkter HTTPS-Link zur BIN-Datei' : 'Direct HTTPS link to the BIN file' }}
        <input v-model="draft" type="url" :maxlength="FIGURE_DOWNLOAD_LIMITS.maxUrlLength" placeholder="https://…"
          autocomplete="off" spellcheck="false" autocapitalize="none" />
      </label>
      <small>{{ de ? 'Der Link wird nur in diesem Browser gespeichert.' : 'The link is saved only in this browser.' }}</small>
      <div class="link-actions">
        <button type="submit" :disabled="saving">{{ de ? 'Link speichern' : 'Save link' }}</button>
        <button v-if="link" type="button" :disabled="saving" @click="remove">{{ de ? 'Link entfernen' : 'Remove link' }}</button>
      </div>
    </form>
  </details>
  <small v-if="feedback" class="link-feedback" :class="{ error: feedbackError }" role="status">{{ feedback[de ? 0 : 1] }}</small>
  <div v-if="manualSource" class="manual-download">
    <a :href="manualSource" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">
      {{ de ? 'Quelle im Browser öffnen' : 'Open source in browser' }}
    </a>
    <label>{{ de ? 'Heruntergeladene BIN prüfen' : 'Check downloaded BIN' }}
      <input type="file" accept=".bin,application/octet-stream" :disabled="busy" @change="checkLocal" />
    </label>
    <button v-if="checkedFile && openImport" type="button" :disabled="blocked || busy" @click="handoff">
      {{ de ? 'Im Geräteimport öffnen' : 'Open in device import' }}
    </button>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { FIGURE_DOWNLOAD_LIMITS, prepareFigureTransfer, suggestedFigureFilename } from '../lib/figure-transfer.js';
import { observeFigureDownloadLink, readFigureDownloadLink, writeFigureDownloadLink, withFigureLinkLock } from '../lib/figure-download-links.js';
import { saveBlob } from '../lib/browser-tools.js';

const props = defineProps({ entry: { type: Object, required: true }, de: Boolean, blocked: Boolean, openImport: Function });
const link = ref(readFigureDownloadLink(props.entry.id));
const editor = ref(null), editing = ref(false), draft = ref('');
const feedback = ref(null), feedbackError = ref(false), busy = ref(false);
const manualSource = ref('');
const checkedFile = ref(null);
const saving = ref(false);
let disposed = false;
let controller;

function show(message, error = false) {
  feedback.value = message;
  feedbackError.value = error;
}

function stopDownload() {
  controller?.abort();
  controller = null;
  busy.value = false;
  manualSource.value = '';
  checkedFile.value = null;
}

function refreshLink() {
  const saved = readFigureDownloadLink(props.entry.id);
  if (saved === link.value) return;
  stopDownload();
  link.value = saved;
  if (!editing.value) draft.value = saved;
  show(null);
}

let stopObserving;
onMounted(() => {
  refreshLink();
  stopObserving = observeFigureDownloadLink(() => props.entry.id, refreshLink);
});
onBeforeUnmount(() => {
  disposed = true;
  stopObserving?.();
  stopDownload();
});

function toggleEditor(event) {
  editing.value = event.currentTarget.open;
  if (editing.value) {
    refreshLink();
    draft.value = link.value;
    show(null);
  }
}

async function store(value) {
  if (saving.value || disposed) return;
  const id = props.entry.id;
  saving.value = true;
  try {
    const saved = await withFigureLinkLock(() => writeFigureDownloadLink(id, value));
    if (disposed || id !== props.entry.id) return;
    stopDownload();
    link.value = saved;
    draft.value = saved;
    editor.value.open = false;
    editor.value.querySelector('summary')?.focus();
    show(saved
      ? ['Gespeichert. Zum Herunterladen den Figurennamen antippen.', 'Saved. Tap the figure name to download.']
      : ['Downloadlink entfernt.', 'Download link removed.']);
  } catch (error) {
    if (disposed || id !== props.entry.id) return;
    show(error.code === 'FIGURE_STORAGE' || error.code === 'FIGURE_LINK_LIMIT'
      ? ['Der Browser konnte die Änderung nicht speichern.', 'The browser could not save the change.']
      : ['Gib einen direkten öffentlichen HTTPS-Link zur BIN-Datei ein.', 'Enter a direct public HTTPS link to the BIN file.'], true);
  } finally { saving.value = false; }
}

function save() {
  const value = draft.value.trim();
  if (value) store(value);
  else show(['Gib die HTTPS-Adresse der Datei ein.', 'Enter the HTTPS address of the file.'], true);
}
function remove() { store(''); }

const downloadErrors = {
  FIGURE_ID_MISMATCH: ['Die Datei gehört zu einer anderen Figuren-ID. Prüfe den Link.', 'The file belongs to a different figure ID. Check the link.'],
  FIGURE_SIZE: ['Die Dateigröße passt zu keinem unterstützten BIN-Format.', 'The file size does not match a supported BIN format.'],
  FIGURE_STRUCTURE: ['Die Datei hat keine passende BIN-Struktur.', 'The file does not have a supported BIN structure.']
};
const manualDownloadErrors = new Set(['FIGURE_NETWORK', 'FIGURE_HTTP', 'FIGURE_TIMEOUT', 'FIGURE_STREAM']);

function download() { return loadFigure(); }

function checkLocal(event) {
  const picker = event.target;
  const file = picker.files?.[0];
  picker.value = '';
  if (file) return loadFigure(file);
}

function handoff() {
  refreshLink();
  if (!checkedFile.value || props.blocked || busy.value) return;
  if (!props.openImport?.(checkedFile.value)) {
    show(['Der Geräteimport ist gerade nicht verfügbar. Versuche es nach dem laufenden Vorgang erneut.',
      'Device import is currently unavailable. Try again after the current operation.'], true);
  }
}

async function loadFigure(localFile) {
  if (busy.value) return;
  refreshLink();
  if (!link.value || (localFile && !manualSource.value)) return;
  const url = link.value;
  checkedFile.value = null;
  if (!localFile) manualSource.value = '';
  const request = new AbortController();
  controller = request;
  busy.value = true;
  show(localFile ? ['Lokale BIN wird geprüft …', 'Checking local BIN …']
    : ['Datei wird geladen und geprüft …', 'Downloading and checking file …']);
  try {
    const source = localFile ? { file: localFile } : { url };
    const file = await prepareFigureTransfer({ ...source, expectedId: props.entry.id, signal: request.signal });
    if (request.signal.aborted) return;
    if (localFile) {
      checkedFile.value = file;
      show([`Dateigröße und Figuren-ID passen zu ${props.entry.name} (${file.id}).`,
        `File size and figure ID match ${props.entry.name} (${file.id}).`]);
      return;
    }
    saveBlob(new Blob([file.bytes], { type: 'application/octet-stream' }), suggestedFigureFilename(props.entry));
    show(['Download angefordert.', 'Download requested.']);
  } catch (error) {
    if (request.signal.aborted) return;
    if (!localFile && manualDownloadErrors.has(error.code)) {
      manualSource.value = url;
      show(['Der direkte Download ist fehlgeschlagen. Öffne die Quelle, speichere die BIN und wähle sie hier zur Prüfung aus.',
        'The direct download failed. Open the source, save the BIN, then choose it here to check it.'], true);
    } else if (localFile && error.code === 'FIGURE_ID_MISMATCH') {
      show(['Diese BIN gehört zu einer anderen Figur. Wähle die passende Datei aus.',
        'This BIN belongs to a different figure. Choose the matching file.'], true);
    } else {
      show(downloadErrors[error.code] || (localFile ? ['Die lokale BIN konnte nicht gelesen werden.', 'Could not read the local BIN.']
        : ['Download fehlgeschlagen. Prüfe den Link.', 'Download failed. Check the link.']), true);
    }
  } finally {
    if (controller === request) {
      controller = null;
      busy.value = false;
    }
  }
}
</script>

<style scoped>
.entry-title { display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem; }
.entry-title strong, .figure-name { font-size:.96rem; line-height:1.35; }
.entry-type { flex-shrink:0; font-size:.65rem; color:#60788b; background:#f0f5f9; padding:3px 6px; border-radius:5px; }
.figure-name { border:0; background:transparent; padding:0; color:#205580; font-family:inherit; font-weight:700; text-align:left; text-decoration:underline; text-underline-offset:.16em; cursor:pointer; overflow-wrap:anywhere; }
.figure-name:disabled { opacity:.65; }
.figure-download-link { font-size:.8rem; }
summary { cursor:pointer; color:#315c7b; padding:5px 0; width:fit-content; }
form, label { display:grid; gap:.4rem; }
form { margin:.35rem 0 .6rem; }
input { min-width:0; box-sizing:border-box; width:100%; min-height:40px; border:1px solid #afc4d3; border-radius:6px; padding:6px 8px; font:inherit; }
.link-actions { display:flex; flex-wrap:wrap; gap:.4rem; }
.link-actions button { min-height:36px; border:1px solid #b8ccdc; border-radius:6px; background:white; color:#205580; padding:5px 9px; font:inherit; cursor:pointer; }
button:focus-visible, summary:focus-visible, input:focus-visible { outline:3px solid #78a7cb; outline-offset:2px; }
small { color:#526575; font-size:.75rem; line-height:1.45; }
.link-feedback.error { color:#813c1a; }
.manual-download { display:grid; gap:.5rem; margin-block:.35rem; font-size:.8rem; }
.manual-download a { width:fit-content; color:#205580; }
.manual-download a:focus-visible { outline:3px solid #78a7cb; outline-offset:2px; }
</style>
