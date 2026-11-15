<template>
  <div class="guided-check">
    <p>{{ pick('Teste Rückkehr und Aufwachen direkt am Allmiibo. Der Entwurf bleibt beim Trennen im geöffneten Tab erhalten. Speichere ihn vor dem Neuladen als JSON.', 'Test list return and wake-up on the Allmiibo. The open tab keeps your draft across disconnects. Save it as JSON before reloading.') }}</p>
    <section class="capture">
      <h4>{{ pick('Vorher · Diagnose festhalten', 'Before · Capture diagnostics') }}</h4>
      <p>{{ pick('Optional: Lies oben „Alle Diagnosewerte“ aus und übernimm die Aufnahme vor dem ersten Test.', 'Optional: Read all diagnostic values above and attach the snapshot before the first test.') }}</p>
      <button type="button" :disabled="!candidate || !!before || count > 0" @click="before = candidate">{{ pick('Vorher-Aufnahme übernehmen', 'Attach before snapshot') }}</button>
      <time v-if="before" :datetime="before.snapshot.completedAt">{{ dateLabel(before.snapshot.completedAt) }}</time>
    </section>

    <section>
      <h4>{{ pick('Am Gerät beobachten', 'Observe on the device') }}</h4>
      <p>{{ pick('Trenne die Dateisitzung und öffne eine bekannte Figur in der gewählten App. Trage jeweils ein, was du am Gerät siehst.', 'Disconnect the file session and open a known figure in the selected app. Record what you see on the device.') }}</p>
      <div class="field-grid">
        <label>{{ pick('Gerätesprache', 'Device language') }}
          <select v-model="deviceLanguage"><option value="">{{ pick('Unbekannt', 'Unknown') }}</option><option value="de">Deutsch</option><option value="en">English</option></select>
        </label>
        <label>{{ pick('„App fortsetzen“ am Gerät', '“Resume app” on the device') }}
          <select v-model="resumeSetting"><option value="">{{ pick('Unbekannt', 'Unknown') }}</option><option value="on">{{ pick('Ein', 'On') }}</option><option value="off">{{ pick('Aus', 'Off') }}</option></select>
        </label>
        <label>{{ pick('Geöffnete App', 'App under test') }}
          <select v-model="origin"><option value="file-emulator">{{ pick('Amiibo-Emulator (Dateien)', 'Amiibo emulator (files)') }}</option><option value="amiibo-database">{{ pick('Amiibo-Datenbank', 'Amiibo database') }}</option></select>
        </label>
      </div>
      <div v-for="(details, route) in routes" :key="route" class="check-row">
        <label>
          <strong>{{ route === 'return-to-list' ? pick('Zurück zur Liste', 'Back to list') : pick('Schlafen und aufwachen', 'Sleep and wake') }}</strong>
          <span>{{ route === 'return-to-list' ? pick('Drücke bei aktiver Figur kurz die Mitte und wähle „Zurück zur Liste“. Welche Figur ist markiert?', 'With the figure active, briefly press the center button and choose “Back to list”. Which figure is selected?') : pick('Lass das Gerät bei aktiver Figur automatisch einschlafen. Drücke dann einmal kurz die Mitte. Was erscheint?', 'Let the device sleep automatically with the figure active, then briefly press the center button once. What appears?') }}</span>
          <small>{{ pick('Erwartet','Expected') }} · {{ outcomeLabel(expectedReturn(route,resumeSetting)) || pick('abhängig von „App fortsetzen“','depends on “Resume app”') }}</small>
          <select :value="observations[key(route)]?.observed || ''" @change="record(route,$event.target.value)">
            <option value="">{{ pick('Noch nicht getestet', 'Not tested yet') }}</option>
            <option v-for="outcome in details.outcomes" :key="outcome" :value="outcome">{{ outcomeLabel(outcome) }}</option>
          </select>
        </label>
        <small v-if="observations[key(route)]">
          {{ pick('Eingetragen','Recorded') }} · {{ dateLabel(observations[key(route)].recordedAt) }}
          · {{ pick('Gerätesprache','Device language') }} {{ observations[key(route)].deviceLanguage?.toUpperCase() || '—' }}
          · {{ pick('App fortsetzen','Resume app') }} {{ resumeLabel(observations[key(route)].resumeSetting) }}
        </small>
      </div>
      <p role="status">{{ count }} / 4 {{ pick('Beobachtungen eingetragen', 'observations recorded') }}</p>
    </section>

    <section class="capture">
      <h4>{{ pick('Nachher · Ergebnis sichern', 'After · Save the result') }}</h4>
      <p>{{ pick('Für den Vergleich verbinde dasselbe Gerät erneut. Lies die Diagnose nach den Tests nochmals aus und übernimm sie hier.', 'To compare, reconnect the same device. Read the diagnostics again after the tests and attach them here.') }}</p>
      <button type="button" :disabled="!canCaptureAfter" @click="after = candidate">{{ pick('Nachher-Aufnahme übernehmen', 'Attach after snapshot') }}</button>
      <time v-if="after" :datetime="after.snapshot.completedAt">{{ dateLabel(after.snapshot.completedAt) }}</time>
      <p v-if="!before && count">{{ pick('Du kannst deine Beobachtungen auch ohne Diagnoseaufnahmen speichern.', 'You can save your observations without diagnostic snapshots.') }}</p>
      <label class="source-prefix">{{ pick('Source-ID vom Display (optional)', 'Source ID from the display (optional)') }}
        <span>{{ pick('Unter Einstellungen → Version stehen zwölf Hexzeichen. Übertrage sie ohne Klammern.', 'Settings → Version shows twelve hexadecimal characters. Enter them without brackets.') }}</span>
        <input v-model="sourcePrefix" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" pattern="[a-fA-F0-9]{12}" :aria-invalid="prefixInvalid" aria-describedby="source-prefix-result">
      </label>
      <small id="source-prefix-result" role="status">{{ prefixHint }}</small>
    </section>
    <div class="actions">
      <button type="button" :disabled="(!before && !count && !prefixComparison) || prefixInvalid || exportBusy" @click="exportReport">{{ pick('Prüfbericht als JSON', 'Export check report as JSON') }}</button>
      <button v-if="!confirmClear && (before || count || sourcePrefix)" type="button" @click="confirmClear = true">{{ pick('Neuen Bericht beginnen', 'Start a new report') }}</button>
      <template v-if="confirmClear">
        <button type="button" @click="clear">{{ pick('Entwurf verwerfen', 'Discard draft') }}</button>
        <button type="button" @click="confirmClear = false">{{ pick('Entwurf behalten', 'Keep draft') }}</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, shallowRef } from 'vue';
import { version as webVersion } from '../../package.json';
import { canAttachAfter, captureDeviceEvidence, compareManualSourcePrefix, createGuidedReport, expectedReturn, recordDeviceObservation, routes } from '../lib/guided-device-check.js';
const props = defineProps({ locale:String, firmwareVersion:String, snapshot:Object, connected:Boolean, reading:Boolean, exportBusy:Boolean });
const emit = defineEmits(['export']);
const pick = (de,en) => props.locale?.startsWith('de') ? de : en;
const dateLabel = date => new Date(date).toLocaleString(pick('de-DE','en-GB'));
const candidate = computed(() => props.connected && !props.reading && props.snapshot ? captureDeviceEvidence(props.snapshot, props.firmwareVersion) : null);
const before = shallowRef(null), after = shallowRef(null);
const origin = ref('file-emulator'), deviceLanguage = ref(''), resumeSetting = ref('');
const sourcePrefix = ref('');
const prefixComparison = computed(() => compareManualSourcePrefix(sourcePrefix.value,before.value,after.value));
const prefixInvalid = computed(() => !!sourcePrefix.value && !prefixComparison.value);
const prefixHint = computed(() => {
  if (prefixInvalid.value) return pick('Bitte genau zwölf Zeichen von 0–9 oder A–F eingeben.', 'Enter exactly twelve characters from 0–9 or A–F.');
  if (!sourcePrefix.value) return '';
  const comparison = prefixComparison.value;
  if (comparison.comparison === 'unknown') return pick('Kein Paketvergleich möglich. Dafür müssen Firmwareversion und App-Zähler der Diagnose zu einer bekannten Referenz passen.',
      'Package comparison unavailable. The reported firmware version and application counter must match a known reference.');
  const stage = comparison.referenceRead === 'after' ? pick('Nachher-Aufnahme','after snapshot') : pick('Vorher-Aufnahme','before snapshot');
  return (comparison.comparison === 'prefix-match' ? pick('Die zwölf Zeichen passen zur Paketreferenz', 'The twelve characters match the package reference') :
      pick('Die zwölf Zeichen weichen von der Paketreferenz ab','The twelve characters differ from the package reference')) + ' ('+stage+' · '+comparison.expectedPrefix+'). '+
      pick('Der vollständige App-Hash ist ungemessen.','The full application hash is unmeasured.');
});
const observations = ref({}), confirmClear = ref(false);
const key = route => origin.value + '/' + route;
const count = computed(() => Object.keys(observations.value).length);
const lastObservationAt = computed(() => Object.values(observations.value).map(row => row.recordedAt).sort().at(-1));
const canCaptureAfter = computed(() => !after.value && canAttachAfter(before.value, candidate.value, lastObservationAt.value));
const resumeLabel = value => value === 'on' ? pick('Ein','On') : value === 'off' ? pick('Aus','Off') : '—';

const labels = {
  'source-list-same-figure':['Herkunftsliste, richtige Figur markiert','Source list, same figure selected'],
  'source-list-different-figure':['Herkunftsliste, andere Figur markiert','Source list, different figure selected'],
  'same-active-figure':['Dieselbe Figur aktiv','Same figure active'],
  'different-active-figure':['Andere Figur aktiv','Different figure active'],
  'main-menu':['Hauptmenü','Main menu'], 'other-screen':['Anderer Bildschirm','Other screen'], 'no-response':['Keine Reaktion','No response'],
};
function outcomeLabel(value) { return value ? pick(...labels[value]) : ''; }
function record(route, outcome) {
  const result = recordDeviceObservation({origin:origin.value, route, outcome, deviceLanguage:deviceLanguage.value, resumeSetting:resumeSetting.value});
  if (result) observations.value[key(route)] = result;
  else delete observations.value[key(route)];
  after.value = null;
}
function exportReport() {
  emit('export',createGuidedReport({webVersion, locale:props.locale, observations:observations.value, before:before.value, after:after.value, sourcePrefix:sourcePrefix.value}));
}
function clear() {
  before.value = null; after.value = null; observations.value = {}; confirmClear.value = false;
  origin.value = 'file-emulator'; deviceLanguage.value = ''; resumeSetting.value = ''; sourcePrefix.value = '';
}
</script>

<style scoped>
.guided-check { color:#294b50; margin-top:.8rem; }
.guided-check section { padding:.8rem 0; border-top:1px solid var(--rule,#ccd8d3); }
.guided-check h4 { color:#315675; margin:0; font-size:1rem; }
.guided-check p, .check-row span { font-size:.86rem; line-height:1.5; margin:.45rem 0 .65rem; }
.field-grid { display:grid; gap:.65rem; grid-template-columns:repeat(auto-fit,minmax(min(165px,100%),1fr)); }
.guided-check label { display:grid; gap:.3rem; min-width:0; font-size:.85rem; }
.check-row { margin-top:.8rem; }
.check-row span { margin:0; }
.guided-check select,.guided-check button { max-width:100%; border:1px solid #9eafb1; border-radius:6px; padding:.45rem .65rem; color:#27494c; background:white; font:inherit; min-height:40px; }
.guided-check select { width:100%; }
.guided-check button:enabled { cursor:pointer; }
.guided-check button:disabled { opacity:.55; }
.capture time { display:inline-block; margin:.2rem .4rem; font-size:.8rem; }
.source-prefix { margin:.75rem 0 .35rem; }
.source-prefix input { font:1rem ui-monospace,monospace; padding:.45rem; width:16ch; max-width:100%; border:1px solid #9eafb1; border-radius:6px; }
.source-prefix input[aria-invalid="true"] { border-color:#984536; }
.actions { display:flex; flex-wrap:wrap; gap:.5rem; }
</style>
