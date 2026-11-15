<template>
  <div class="guided-check">
    <header class="check-header">
      <div>
        <h4>{{ pick('Schritt für Schritt. Später fortsetzen.', 'Step by step. Continue later.') }}</h4>
        <p>{{ pick('Beobachte Rückkehr und Aufwachen direkt am Allmiibo. Halte für jede Einstellung fest, was du tatsächlich siehst.', 'Observe list return and wake-up on the Allmiibo. Record what you actually see for each setting.') }}</p>
      </div>
      <span class="draft-status" role="status">{{ draftLabel }}</span>
    </header>
    <div class="actions top-actions">
      <button type="button" :disabled="importBusy" @click="reportInput?.click()">{{ pick('Gespeicherten Bericht öffnen', 'Open a saved report') }}</button>
      <input ref="reportInput" class="file-input" type="file" accept=".json,application/json" @change="readReport">
      <button type="button" :disabled="!hasExport || prefixInvalid || exportBusy" @click="exportReport">{{ pick('Prüfbericht als JSON', 'Export check report as JSON') }}</button>
    </div>
    <p class="local-hint">{{ pick('Der Entwurf wird in diesem Browser gespeichert. Mit JSON kannst du ihn auf ein anderes Gerät mitnehmen. Öffnen und Speichern lösen keine Geräteabfrage aus.', 'The draft is saved in this browser. Use JSON to take it to another device. Opening and saving do not read from the device.') }}</p>
    <div v-if="saveState === 'unavailable'" class="confirmation">
      <p role="alert">{{ pick('Der Browserspeicher ist nicht verfügbar. Sichere deine Eingaben als Entwurf und lade die Datei später über „Gespeicherten Bericht öffnen“.', 'Browser storage is unavailable. Save your entries as a draft and reload the file later with “Open a saved report”.') }}</p>
      <button v-if="hasDraft" type="button" @click="downloadDraft">{{ pick('Entwurf als JSON sichern', 'Save draft as JSON') }}</button>
    </div>
    <div v-if="otherDrafts.length || stale" class="confirmation guided-draft-conflict">
      <p v-if="stale" role="status">{{ pick('Dieser Stand ist nur noch hier geöffnet. Ein anderer Tab hat ihn geändert oder gelöscht. Du kannst ihn hier noch sichern.', 'This revision is open only in this tab. Another tab changed or discarded it. You can still save your copy here.') }}</p>
      <p v-if="otherDrafts.length">{{ pick('Weitere gespeicherte Entwürfe kannst du einzeln öffnen, bearbeiten und als Bericht exportieren.', 'You can open, edit and export the other saved drafts separately.') }}</p>
      <div class="actions">
        <button v-if="stale && hasDraft" type="button" @click="downloadDraft">{{ pick('Geöffneten Stand als JSON sichern', 'Save open revision as JSON') }}</button>
        <button v-for="item in otherDrafts" :key="item.key" type="button" class="guided-open-draft"
          :disabled="importBusy || !!pendingImport || (saveState === 'unavailable' && hasDraft)" @click="openDraft(item)">{{
            pick('Entwurf öffnen', 'Open draft') }} · {{ dateLabel(item.draft.savedAt) }} · {{ Object.keys(item.draft.observations).length }} {{ pick('Beobachtungen', 'observations') }}</button>
      </div>
    </div>
    <p v-if="notice" :role="noticeKind === 'error' ? 'alert' : 'status'" :class="['notice', noticeKind]">{{ notice }}</p>
    <div v-if="pendingImport" class="confirmation" role="group" :aria-label="pick('Bericht übernehmen', 'Use imported report')">
      <p>{{ pick('Dieser Bericht ersetzt den aktuellen Entwurf. Exportiere ihn vorher, wenn du beide behalten möchtest.', 'This report will replace the current draft. Export it first if you want to keep both.') }}</p>
      <div class="actions">
        <button type="button" @click="acceptImport">{{ pick('Bericht übernehmen', 'Use imported report') }}</button>
        <button type="button" @click="pendingImport = null">{{ pick('Aktuellen Entwurf behalten', 'Keep current draft') }}</button>
      </div>
    </div>
    <section class="progress-summary" :aria-label="pick('Bisherige Beobachtungen', 'Recorded observations')">
      <div class="summary-cards">
        <div><strong>{{ count }}</strong><span>{{ pick('Beobachtungen', 'observations') }}</span></div>
        <div><strong>{{ coverage.matchingExpectations }}</strong><span>{{ pick('wie erwartet', 'as expected') }}</span></div>
        <div :class="{ 'has-differences': coverage.differentExpectations }"><strong>{{ coverage.differentExpectations }}</strong><span>{{ pick('abweichend', 'different') }}</span></div>
      </div>
      <label class="progress-label" for="guided-coverage">{{ coverage.configurationCasesObserved }} / {{ coverage.configurationCasesTotal }} {{ pick('Kombinationen mit bekannten Einstellungen', 'combinations with known settings') }}</label>
      <progress id="guided-coverage" :value="coverage.configurationCasesObserved" :max="coverage.configurationCasesTotal" />
      <p>{{ pick('32 Kombinationen: zwei Apps × zwei Wege × Deutsch/Englisch × Fortsetzen ein/aus × Animation ein/aus. Unbekannte Einstellungen zählen als Beobachtung, vervollständigen diese Übersicht aber nicht.', '32 combinations: two apps × two routes × German/English × resume on/off × animation on/off. Unknown settings count as observations but do not complete this overview.') }}</p>
    </section>

    <section class="capture step">
      <h4><span class="step-number">1</span>{{ pick('Vorher · Diagnose festhalten', 'Before · Capture diagnostics') }}</h4>
      <p>{{ pick('Optional: Lies oben „Alle Diagnosewerte“ aus und übernimm die Aufnahme vor dem ersten Test.', 'Optional: Read all diagnostic values above and attach the snapshot before the first test.') }}</p>
      <button type="button" :disabled="!candidate || !!before || count > 0" @click="before = candidate">{{ pick('Vorher-Aufnahme übernehmen', 'Attach before snapshot') }}</button>
      <time v-if="before" :datetime="before.snapshot.completedAt">{{ dateLabel(before.snapshot.completedAt) }}</time>
    </section>

    <section class="step">
      <h4><span class="step-number">2</span>{{ pick('Am Gerät beobachten', 'Observe on the device') }}</h4>
      <p>{{ pick('Trenne die Dateisitzung und öffne eine bekannte Figur in der gewählten App. Wähle hier die Einstellungen, die du am Gerät verwendet hast.', 'Disconnect the file session and open a known figure in the selected app. Choose the settings you used on the device.') }}</p>
      <div class="field-grid">
        <label>{{ pick('Geöffnete App', 'App under test') }}
          <select v-model="origin"><option value="file-emulator">{{ appLabel('file-emulator') }}</option><option value="amiibo-database">{{ appLabel('amiibo-database') }}</option></select>
        </label>
        <label>{{ pick('Gerätesprache', 'Device language') }}
          <select v-model="deviceLanguage"><option value="">{{ pick('Unbekannt', 'Unknown') }}</option><option value="de">Deutsch</option><option value="en">English</option></select>
        </label>
        <label>{{ pick('„App fortsetzen“ am Gerät', '“Resume app” on the device') }}
          <select v-model="resumeSetting"><option value="">{{ pick('Unbekannt', 'Unknown') }}</option><option value="on">{{ pick('Ein', 'On') }}</option><option value="off">{{ pick('Aus', 'Off') }}</option></select>
        </label>
        <label>{{ pick('Animation am Gerät', 'Animation on the device') }}
          <select v-model="animationSetting"><option value="">{{ pick('Unbekannt', 'Unknown') }}</option><option value="on">{{ pick('Ein', 'On') }}</option><option value="off">{{ pick('Aus', 'Off') }}</option></select>
        </label>
      </div>
      <p class="context-hint">{{ pick('Jede Kombination behält ihren eigenen Eintrag. Ein anderes Ergebnis für dieselbe Kombination ersetzt ihren bisherigen Eintrag.', 'Each combination keeps its own entry. A different result for the same combination replaces its previous entry.') }}</p>
      <div class="route-grid">
        <div v-for="(details, route) in routes" :key="route" class="check-row">
          <label>
            <strong>{{ routeLabel(route) }}</strong>
            <span>{{ route === 'return-to-list' ? pick('Drücke bei aktiver Figur kurz die Mitte und wähle „Zurück zur Liste“. Welche Figur ist markiert?', 'With the figure active, briefly press the center button and choose “Back to list”. Which figure is selected?') : pick('Lass das Gerät bei aktiver Figur automatisch einschlafen. Drücke dann einmal kurz die Mitte. Was erscheint?', 'Let the device sleep automatically with the figure active, then briefly press the center button once. What appears?') }}</span>
            <small>{{ pick('Erwartet', 'Expected') }} · {{ outcomeLabel(expectedReturn(route, resumeSetting)) || pick('abhängig von „App fortsetzen“', 'depends on “Resume app”') }}</small>
            <select :value="observations[key(route)]?.observed || ''" @change="record(route, $event.target.value)">
              <option value="">{{ pick('Noch nicht getestet', 'Not tested yet') }}</option>
              <option v-for="outcome in details.outcomes" :key="outcome" :value="outcome">{{ outcomeLabel(outcome) }}</option>
            </select>
          </label>
          <template v-if="observations[key(route)]">
            <small class="observation-status">{{ resultLabel(observations[key(route)]) }} · {{ dateLabel(observations[key(route)].recordedAt) }}</small>
            <label class="note-field">{{ pick('Notiz (optional)', 'Note (optional)') }}
              <textarea :value="observations[key(route)].note" maxlength="1000" rows="2" @input="updateNote(route, $event.target.value)" />
            </label>
          </template>
        </div>
      </div>
      <details v-if="count" class="history">
        <summary>{{ pick('Alle eingetragenen Beobachtungen', 'All recorded observations') }} ({{ count }})</summary>
        <ul>
          <li v-for="row in history" :key="observationKey(row)">
            <strong>{{ appLabel(row.origin) }} · {{ routeLabel(row.route) }}</strong>
            <span>{{ row.deviceLanguage?.toUpperCase() || pick('Sprache unbekannt', 'Language unknown') }} · {{ pick('Fortsetzen', 'Resume') }} {{ settingLabel(row.resumeSetting) }} · {{ pick('Animation', 'Animation') }} {{ settingLabel(row.animationSetting) }}</span>
            <span>{{ outcomeLabel(row.observed) }} · {{ resultLabel(row) }}</span>
            <small>{{ dateLabel(row.recordedAt) }}{{ row.observationSource === 'imported-manual-report' ? pick(' · aus importiertem Bericht', ' · from imported report') : '' }}</small>
            <p v-if="row.note" class="history-note">{{ row.note }}</p>
          </li>
        </ul>
      </details>
    </section>

    <section class="capture step">
      <h4><span class="step-number">3</span>{{ pick('Nachher · Ergebnis sichern', 'After · Save the result') }}</h4>
      <p>{{ pick('Für den Vergleich verbinde dasselbe Gerät erneut. Lies die Diagnose nach den Tests nochmals aus und übernimm sie hier.', 'To compare, reconnect the same device. Read the diagnostics again after the tests and attach them here.') }}</p>
      <button type="button" :disabled="!canCaptureAfter" @click="after = candidate">{{ pick('Nachher-Aufnahme übernehmen', 'Attach after snapshot') }}</button>
      <time v-if="after" :datetime="after.snapshot.completedAt">{{ dateLabel(after.snapshot.completedAt) }}</time>
      <p v-if="!before && count">{{ pick('Du kannst deine Beobachtungen auch ohne Diagnoseaufnahmen speichern.', 'You can save your observations without diagnostic snapshots.') }}</p>
      <label class="source-prefix">{{ pick('Source-ID vom Display (optional)', 'Source ID from the display (optional)') }}
        <span>{{ pick('Unter Einstellungen → Version stehen zwölf Hexzeichen. Übertrage sie ohne Klammern.', 'Settings → Version shows twelve hexadecimal characters. Enter them without brackets.') }}</span>
        <input v-model="sourcePrefix" type="text" maxlength="12" autocomplete="off" autocapitalize="none" spellcheck="false" pattern="[a-fA-F0-9]{12}" :aria-invalid="prefixInvalid" aria-describedby="source-prefix-result">
      </label>
      <small id="source-prefix-result" role="status">{{ prefixHint }}</small>
    </section>
    <div class="actions">
      <button type="button" :disabled="!hasExport || prefixInvalid || exportBusy" @click="exportReport">{{ pick('Prüfbericht als JSON', 'Export check report as JSON') }}</button>
      <button v-if="!confirmClear && hasDraft" type="button" @click="confirmClear = true">{{ pick('Neuen Bericht beginnen', 'Start a new report') }}</button>
      <template v-if="confirmClear">
        <button type="button" @click="clear">{{ pick('Entwurf verwerfen', 'Discard draft') }}</button>
        <button type="button" @click="confirmClear = false">{{ pick('Entwurf behalten', 'Keep draft') }}</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { version as webVersion } from '../../package.json';
import { canAttachAfter, captureDeviceEvidence, compareManualSourcePrefix, createGuidedReport, expectedReturn, observationKey, parseGuidedDraft, parseGuidedReport, recordDeviceObservation, routes, serializeGuidedDraft, summarizeGuidedObservations, GUIDED_MAX_BYTES } from '../lib/guided-device-check.js';
import {saveBlob} from '../lib/browser-tools.js';
import {discardGuidedDraft, isGuidedDraftKey, listGuidedDrafts, saveGuidedDraft} from '../lib/guided-draft-store.js';

const props = defineProps({ locale:String, firmwareVersion:String, snapshot:Object, connected:Boolean, reading:Boolean, exportBusy:Boolean });
const emit = defineEmits(['export']);
const pick = (de, en) => props.locale?.startsWith('de') ? de : en;
const dateLabel = date => new Date(date).toLocaleString(pick('de-DE', 'en-GB'));
const candidate = computed(() => props.connected && !props.reading && props.snapshot ? captureDeviceEvidence(props.snapshot, props.firmwareVersion) : null);
const before = shallowRef(null), after = shallowRef(null), importedReport = shallowRef(null);
const origin = ref('file-emulator'), deviceLanguage = ref(''), resumeSetting = ref(''), animationSetting = ref('');
const observations = ref({}), sourcePrefix = ref(''), confirmClear = ref(false);
const reportInput = ref(null), pendingImport = shallowRef(null), importBusy = ref(false);
const notice = ref(''), noticeKind = ref('info'), saveState = ref('empty');
let draftReady = false;
const revision = shallowRef(null), savedDrafts = shallowRef([]);
const matchesCurrent = item => item.key === revision.value?.key && item.raw === revision.value.raw;
const otherDrafts = computed(() => savedDrafts.value.filter(item => !matchesCurrent(item)));
const stale = computed(() => !!revision.value && !savedDrafts.value.some(matchesCurrent));
const prefixComparison = computed(() => compareManualSourcePrefix(sourcePrefix.value, before.value, after.value));
const prefixInvalid = computed(() => !!sourcePrefix.value && !prefixComparison.value);
const count = computed(() => Object.keys(observations.value).length);
const coverage = computed(() => summarizeGuidedObservations(observations.value));
const history = computed(() => Object.values(observations.value).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)));
const lastObservationAt = computed(() => history.value[0]?.recordedAt);
const canCaptureAfter = computed(() => canAttachAfter(before.value, candidate.value, lastObservationAt.value));
const hasExport = computed(() => !!before.value || !!after.value || count.value > 0 || !!prefixComparison.value);
const hasDraft = computed(() => hasExport.value || !!sourcePrefix.value || !!deviceLanguage.value || !!resumeSetting.value || !!animationSetting.value || origin.value !== 'file-emulator');
const draftState = () => ({observations:observations.value, before:before.value, after:after.value,
  sourcePrefix:sourcePrefix.value, origin:origin.value, deviceLanguage:deviceLanguage.value,
  resumeSetting:resumeSetting.value, animationSetting:animationSetting.value, importedReport:importedReport.value});
const state = () => ({...draftState(), webVersion, locale:props.locale || 'en'});
const key = route => observationKey({...state(), route});
const draftLabel = computed(() => stale.value && saveState.value !== 'unavailable' ? pick('Nur in diesem Tab', 'Only in this tab') : ({
  empty:pick('Noch kein Entwurf', 'No draft yet'), restored:pick('Entwurf wiederhergestellt', 'Draft restored'),
  saved:pick('Im Browser gespeichert', 'Saved in this browser'), unavailable:pick('Bitte als JSON sichern', 'Please save as JSON'),
})[saveState.value]);
const appLabel = value => value === 'file-emulator' ? pick('Amiibo-Emulator (Dateien)', 'Amiibo emulator (files)') : pick('Amiibo-Datenbank', 'Amiibo database');
const routeLabel = route => route === 'return-to-list' ? pick('Zurück zur Liste', 'Back to list') : pick('Schlafen und aufwachen', 'Sleep and wake');
const settingLabel = value => value === 'on' ? pick('ein', 'on') : value === 'off' ? pick('aus', 'off') : pick('unbekannt', 'unknown');
const outcomeLabel = outcome => ({
  'source-list-same-figure':pick('Ursprüngliche Liste, gleiche Figur markiert', 'Original list, same figure selected'),
  'source-list-different-figure':pick('Ursprüngliche Liste, andere Figur markiert', 'Original list, different figure selected'),
  'same-active-figure':pick('Dieselbe Figur ist aktiv', 'The same figure is active'),
  'different-active-figure':pick('Eine andere Figur ist aktiv', 'A different figure is active'),
  'main-menu':pick('Hauptmenü', 'Main menu'), 'other-screen':pick('Anderer Bildschirm', 'Other screen'), 'no-response':pick('Keine Reaktion', 'No response'),
})[outcome] || '';
const resultLabel = row => row.matchesExpectation === true ? pick('Wie erwartet', 'As expected') : row.matchesExpectation === false ? pick('Abweichung', 'Different from expected') : pick('Erwartung noch offen', 'Expectation unknown');
const prefixHint = computed(() => {
  if (prefixInvalid.value) return pick('Bitte genau zwölf Zeichen von 0–9 oder A–F eingeben.', 'Enter exactly twelve characters from 0–9 or A–F.');
  if (!sourcePrefix.value) return '';
  const comparison = prefixComparison.value;
  if (comparison.comparison === 'unknown') return pick('Kein Paketvergleich möglich. Dafür müssen Firmwareversion und App-Zähler der Diagnose zu einer bekannten Referenz passen.', 'Package comparison unavailable. The reported firmware version and application counter must match a known reference.');
  const stage = comparison.referenceRead === 'after' ? pick('Nachher-Aufnahme', 'after snapshot') : pick('Vorher-Aufnahme', 'before snapshot');
  return (comparison.comparison === 'prefix-match' ? pick('Die zwölf Zeichen passen zur Paketreferenz', 'The twelve characters match the package reference') : pick('Die zwölf Zeichen weichen von der Paketreferenz ab', 'The twelve characters differ from the package reference')) + ' (' + stage + ' · ' + comparison.expectedPrefix + '). ' + pick('Der vollständige App-Hash ist ungemessen.', 'The full application hash is unmeasured.');
});

function record(route, outcome) {
  const id = key(route), previous = observations.value[id];
  const row = recordDeviceObservation({...state(), route, outcome, note:previous?.note || ''});
  const next = {...observations.value};
  if (row) next[id] = row;
  else delete next[id];
  after.value = null;
  observations.value = next;
}
function updateNote(route, value) {
  const id = key(route), row = observations.value[id];
  if (!row) return;
  observations.value = {...observations.value, [id]:{...row, note:value.replace(/\u0000/g, '').slice(0, 1000)}};
}
function exportReport() {
  if (!hasExport.value || prefixInvalid.value || props.exportBusy) return;
  try { emit('export', createGuidedReport(state())); }
  catch { showNotice(pick('Der Bericht konnte nicht erstellt werden. Prüfe die Zeitangaben der Diagnose und Beobachtungen.', 'The report could not be created. Check the diagnostic and observation timestamps.'), 'error'); }
}
function showNotice(message, kind = 'info') { notice.value = message; noticeKind.value = kind; }
function downloadDraft() {
  try {
    const raw = serializeGuidedDraft(draftState());
    saveBlob(new Blob([raw], {type:'application/json'}), 'Allmiibo-' + pick('Pruefentwurf', 'Check-draft') + '.json');
  } catch {
    showNotice(pick('Der Download konnte nicht gestartet werden.', 'The download could not be started.'), 'error');
  }
}
function restore(draft) {
  before.value = draft.before; after.value = draft.after; observations.value = draft.observations;
  sourcePrefix.value = draft.sourcePrefix; origin.value = draft.origin;
  deviceLanguage.value = draft.deviceLanguage; resumeSetting.value = draft.resumeSetting; animationSetting.value = draft.animationSetting;
  importedReport.value = draft.importedReport; confirmClear.value = false;
}
async function readReport(event) {
  const input = event.target, file = input.files?.[0];
  if (!file || importBusy.value) return;
  importBusy.value = true; pendingImport.value = null;
  try {
    if (file.size > GUIDED_MAX_BYTES) throw Object.assign(new Error('size'), {code:'GUIDED_IMPORT_SIZE'});
    const raw = await file.text();
    let draft;
    try { draft = parseGuidedReport(raw); }
    catch {
      draft = parseGuidedDraft(raw);
      for (const row of Object.values(draft.observations)) row.observationSource = 'imported-manual-report';
    }
    if (hasDraft.value) pendingImport.value = draft;
    else { pendingImport.value = draft; acceptImport(); }
  } catch (error) {
    showNotice(error?.code === 'GUIDED_IMPORT_SIZE' ? pick('Der Bericht ist größer als 1 MiB. Der aktuelle Entwurf bleibt erhalten.', 'The report exceeds 1 MiB. Your current draft is unchanged.') : pick('Diese Datei ist kein gültiger Prüfbericht oder enthält widersprüchliche Angaben. Der aktuelle Entwurf bleibt erhalten.', 'This file is not a valid check report or contains inconsistent data. Your current draft is unchanged.'), 'error');
  } finally { importBusy.value = false; input.value = ''; }
}
function acceptImport() {
  if (!pendingImport.value) return;
  restore(pendingImport.value); pendingImport.value = null;
  showNotice(pick('Bericht geöffnet. Die importierten Angaben bleiben als manuelle Beobachtungen gekennzeichnet.', 'Report opened. Imported entries remain labelled as manual observations.'));
}
function clear() {
  restore({before:null, after:null, observations:{}, sourcePrefix:'', origin:'file-emulator', deviceLanguage:'', resumeSetting:'', animationSetting:'', importedReport:null});
  pendingImport.value = null; notice.value = '';
}
function unavailable() {
  saveState.value = 'unavailable';
}
function refreshDrafts() {
  const {entries, invalid} = listGuidedDrafts(localStorage);
  savedDrafts.value = entries;
  if (invalid) showNotice(pick('Ein gespeicherter Entwurf konnte nicht gelesen werden.', 'A saved draft could not be read.'), 'error');
}
function onStorage(event) {
  if (event.key !== null && !isGuidedDraftKey(event.key)) return;
  try { refreshDrafts(); } catch { unavailable(); }
}
async function openDraft(item) {
  // A button can outlive its storage event. Never load an already superseded revision.
  try {
    if (localStorage.getItem(item.key) !== item.raw) { refreshDrafts(); return; }
  } catch { unavailable(); return; }
  draftReady = false;
  revision.value = item;
  restore(item.draft);
  notice.value = ''; saveState.value = 'restored';
  await nextTick(); draftReady = true;
}
onMounted(async () => {
  globalThis.window?.addEventListener('storage', onStorage);
  try {
    refreshDrafts();
    if (savedDrafts.value.length) await openDraft(savedDrafts.value[0]);
  } catch { unavailable(); }
  await nextTick(); draftReady = true;
});
onUnmounted(() => globalThis.window?.removeEventListener('storage', onStorage));
watch(draftState, value => {
  if (!draftReady) return;
  try {
    if (hasDraft.value) {
      revision.value = saveGuidedDraft(localStorage, revision.value, serializeGuidedDraft(value));
      saveState.value = 'saved';
    } else {
      discardGuidedDraft(localStorage, revision.value);
      revision.value = null; saveState.value = 'empty';
    }
    refreshDrafts();
  } catch { unavailable(); }
}, {deep:true, flush:'post'});
</script>

<style scoped>
.guided-check{display:grid;gap:1rem;color:inherit;min-width:0;overflow-wrap:anywhere}
.check-header{display:flex;gap:1rem;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
h4{margin:0 0 .45rem;font-size:1rem;display:flex;gap:.6rem;align-items:center}
p{margin:.35rem 0 .7rem;line-height:1.55;overflow-wrap:anywhere}
.check-header>div{flex:1 1 20rem}.draft-status{font-size:.78rem;padding:.45rem .7rem;border:1px solid #b5cbd5;border-radius:1rem;background:#f4f9fb;color:#274957}
.actions{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center}.file-input{display:none}
.local-hint,.context-hint,.progress-summary p{font-size:.83rem;color:#4a5d69}.local-hint{margin-top:-.5rem}
.step,.progress-summary{border:1px solid #d2dce4;border-radius:14px;padding:1rem;background:#fff}
.step-number{display:inline-grid;place-items:center;width:1.65rem;height:1.65rem;flex-shrink:0;border-radius:50%;background:#e2eef5;color:#25495e;font-size:.85rem}
.summary-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin-bottom:.8rem}
.summary-cards>div{display:flex;flex-direction:column;gap:.15rem;padding:.7rem;border-radius:10px;background:#f1f6f9;overflow-wrap:anywhere}
.summary-cards strong{font-size:1.6rem;color:#25495e}.summary-cards span{font-size:.8rem}.summary-cards .has-differences{background:#fff1df}.summary-cards .has-differences strong{color:#8a4907}
.progress-label{font-size:.85rem;font-weight:600}progress{display:block;width:100%;height:.7rem;margin:.5rem 0;accent-color:#397d96}
.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.field-grid label,.check-row label,.source-prefix{display:grid;gap:.4rem;min-width:0}
label{font-size:.87rem}.route-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.check-row{padding:.9rem;border:1px solid #d8e3eb;border-radius:10px;background:#f8fbfd;min-width:0}
.check-row strong{font-size:.94rem}.check-row span,.source-prefix span{font-size:.84rem;line-height:1.5}.check-row small{line-height:1.5;color:#3f5664}
.observation-status{display:block;margin:.6rem 0}.note-field{margin-top:.65rem}
button,select,input,textarea{font:inherit;box-sizing:border-box;max-width:100%}button,select,input{min-height:44px}button{padding:.55rem .85rem;border:1px solid #9ab3c4;border-radius:8px;background:#eff6fb;color:#1b4158;cursor:pointer;text-align:center;white-space:normal;overflow-wrap:anywhere}
button:hover:not(:disabled){background:#e0edf6}button:disabled{cursor:default;opacity:.55}select,input,textarea{width:100%;border:1px solid #a9bac7;border-radius:7px;padding:.5rem;background:#fff;color:#203746;min-width:0}
textarea{resize:vertical;line-height:1.4}button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #18758e;outline-offset:3px}
.capture time{display:block;margin-top:.5rem;font-size:.82rem;color:#475c69}.source-prefix{margin-top:.85rem}.source-prefix input{max-width:17rem;font-family:ui-monospace,monospace;letter-spacing:.08em}input[aria-invalid=true]{border-color:#a1382b}
.history{margin-top:1rem}.history summary{cursor:pointer;padding:.5rem 0;font-weight:600;min-height:44px;box-sizing:border-box}.history ul{list-style:none;padding:0;margin:.4rem 0;display:grid;gap:.6rem}.history li{display:grid;gap:.3rem;padding:.8rem;border:1px solid #d8e3eb;border-radius:9px;font-size:.84rem;overflow-wrap:anywhere}.history small{color:#4a5d69}.history-note{white-space:pre-wrap;margin:0}
.confirmation,.notice{padding:.8rem 1rem;border:1px solid #b8cdda;background:#edf6fb;border-radius:10px}.notice{margin:0}.notice.error{background:#fff3ec;border-color:#d6ae99;color:#71381d}.confirmation p{margin:0 0 .6rem}
@media(max-width:560px){.field-grid,.route-grid{grid-template-columns:1fr}.step,.progress-summary{padding:.8rem}.summary-cards{gap:.35rem}.summary-cards>div{padding:.5rem}.summary-cards span{font-size:.75rem}.actions>button{flex:1 1 12rem}.draft-status{max-width:100%}}
</style>
