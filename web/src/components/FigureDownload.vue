<template>
  <div class="entry-title">
    <button v-if="link" type="button" class="figure-name" :disabled="busy"
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
        <button type="submit">{{ de ? 'Link speichern' : 'Save link' }}</button>
        <button v-if="link" type="button" @click="remove">{{ de ? 'Link entfernen' : 'Remove link' }}</button>
      </div>
    </form>
  </details>
  <small v-if="feedback" class="link-feedback" :class="{ error: feedbackError }" role="status">{{ feedback[de ? 0 : 1] }}</small>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { FIGURE_DOWNLOAD_LIMITS, prepareFigureTransfer, suggestedFigureFilename } from '../lib/figure-transfer.js';
import { figureDownloadLinkKey, readFigureDownloadLink, writeFigureDownloadLink } from '../lib/figure-download-links.js';
import { saveBlob } from '../lib/browser-tools.js';

const props = defineProps({ entry: { type: Object, required: true }, de: Boolean });
const link = ref(readFigureDownloadLink(props.entry.id));
const editor = ref(null), editing = ref(false), draft = ref('');
const feedback = ref(null), feedbackError = ref(false), busy = ref(false);
let controller;

function show(message, error = false) {
  feedback.value = message;
  feedbackError.value = error;
}

function stopDownload() {
  controller?.abort();
  controller = null;
  busy.value = false;
}

function refreshLink() {
  const saved = readFigureDownloadLink(props.entry.id);
  if (saved === link.value) return;
  stopDownload();
  link.value = saved;
  if (!editing.value) draft.value = saved;
  show(null);
}

function onStorage(event) {
  if (event.key === null || event.key === figureDownloadLinkKey(props.entry.id)) refreshLink();
}

onMounted(() => {
  refreshLink();
  globalThis.addEventListener?.('storage', onStorage);
});
onBeforeUnmount(() => {
  globalThis.removeEventListener?.('storage', onStorage);
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

function store(value) {
  try {
    const saved = writeFigureDownloadLink(props.entry.id, value);
    stopDownload();
    link.value = saved;
    draft.value = saved;
    editor.value.open = false;
    editor.value.querySelector('summary')?.focus();
    show(saved
      ? ['Gespeichert. Zum Herunterladen den Figurennamen antippen.', 'Saved. Tap the figure name to download.']
      : ['Downloadlink entfernt.', 'Download link removed.']);
  } catch (error) {
    show(error.code === 'FIGURE_STORAGE'
      ? ['Der Browser konnte die Änderung nicht speichern.', 'The browser could not save the change.']
      : ['Gib einen direkten öffentlichen HTTPS-Link zur BIN-Datei ein.', 'Enter a direct public HTTPS link to the BIN file.'], true);
  }
}

function save() {
  const value = draft.value.trim();
  if (value) store(value);
  else show(['Gib die HTTPS-Adresse der Datei ein.', 'Enter the HTTPS address of the file.'], true);
}
function remove() { store(''); }

const downloadErrors = {
  FIGURE_ID_MISMATCH: ['Die Datei gehört zu einer anderen Figuren-ID. Prüfe den Link.', 'The file belongs to a different figure ID. Check the link.'],
  FIGURE_TIMEOUT: ['Die Quelle antwortet zu langsam. Versuche es erneut.', 'The source timed out. Try again.'],
  FIGURE_SIZE: ['Die Dateigröße passt zu keinem unterstützten BIN-Format.', 'The file size does not match a supported BIN format.'],
  FIGURE_STRUCTURE: ['Die Datei hat keine passende BIN-Struktur. Prüfe den Link.', 'The file does not have a supported BIN structure. Check the link.']
};
async function download() {
  if (busy.value) return;
  refreshLink();
  if (!link.value) return;
  const request = new AbortController();
  controller = request;
  busy.value = true;
  show(['Datei wird geladen und geprüft …', 'Downloading and checking file …']);
  try {
    const file = await prepareFigureTransfer({ url: link.value, expectedId: props.entry.id, signal: request.signal });
    if (request.signal.aborted) return;
    saveBlob(new Blob([file.bytes], { type: 'application/octet-stream' }), suggestedFigureFilename(props.entry));
    show(['Download angefordert.', 'Download requested.']);
  } catch (error) {
    if (!request.signal.aborted) show(downloadErrors[error.code] ||
      ['Download fehlgeschlagen. Prüfe, ob der Link direkt zur BIN-Datei führt und der Server Browserzugriff erlaubt (CORS).',
       'Download failed. Check that the link points directly to the BIN file and the server allows browser access (CORS).'], true);
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
</style>
