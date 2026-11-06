<template>
  <details class="card-slot-inspection">
    <summary>{{ de ? 'Karten-Slot lokal prüfen' : 'Inspect card slot locally' }}</summary>
    <p>{{ de ? 'Wähle aus derselben eigenen Sicherung zuerst chameleon/slots/config.bin, dann die Slotnummer und die zugehörige BIN-Datei. Dateien und UIDs bleiben in diesem Browser.' : 'From the same backup of your own device, select chameleon/slots/config.bin, then the slot number and its BIN file. Files and UIDs stay in this browser.' }}</p>
    <p class="scope">{{ de ? 'Unterstützt: Konfiguration v8 und MF0ICU1, MF0ICU2, MF0UL11, MF0UL21. Der Slot enthält selbst keine Typ- oder Versionskennung; die Zusammengehörigkeit der Dateien lässt sich nicht automatisch beweisen.' : 'Supported: configuration v8 and MF0ICU1, MF0ICU2, MF0UL11, MF0UL21. A slot has no type or version marker of its own; matching file provenance cannot be verified automatically.' }}</p>
    <label>{{ de ? '1. config.bin auswählen' : '1. Select config.bin' }} <input type="file" accept=".bin" :disabled="blocked || loading" @change="readConfig" /></label>
    <template v-if="configuration?.supported">
      <label>{{ de ? '2. Slot auswählen' : '2. Select slot' }}
        <select :value="slotIndex" :disabled="blocked || loading" @change="selectSlot">
          <option value="">{{ de ? 'Bitte auswählen' : 'Please select' }}</option>
          <option v-for="slot in configuration.slots" :key="slot.index" :value="slot.index">{{ slotLabel(slot) }}</option>
        </select>
      </label>
      <label v-if="selectedSlot?.supported">{{ de ? `3. Slotdatei ${expectedFilename} auswählen` : `3. Select slot file ${expectedFilename}` }} <input type="file" accept=".bin" :disabled="blocked || loading" @change="readSlot" /></label>
      <p v-else-if="selectedSlot" role="status">{{ de ? 'Dieser Kartentyp wird hier nicht ausgewertet.' : 'This card type is not inspected here.' }}</p>
    </template>
    <p v-if="loading" role="status">{{ de ? 'Datei wird lokal gelesen …' : 'Reading file locally …' }}</p>
    <p v-if="error" role="alert">{{ errorText }}</p>
    <section v-if="inspection" aria-live="polite">
      <p><strong>{{ inspection.type }}</strong> · {{ inspection.size }} {{ de ? 'Bytes' : 'bytes' }}</p>
      <p><strong>{{ resultText }}</strong></p>
      <p v-if="inspection.supported">BCC0: {{ checkLabel(inspection.bcc0Valid) }} · BCC1: {{ checkLabel(inspection.bcc1Valid) }} · {{ de ? 'UID stimmt überein' : 'UID matches' }}: {{ checkLabel(inspection.uidMatches) }}</p>
      <template v-if="inspection.repairable">
        <p>{{ de ? 'Eine korrigierte Kopie übernimmt die UID aus den Speicherpages in die Antikollisionsdaten. Nur bis zu vier UID-Bytes ändern sich; alle übrigen Bytes bleiben erhalten.' : 'A corrected copy takes the UID from the memory pages into the anticollision data. Only up to four UID bytes change; all other bytes are preserved.' }}</p>
        <button type="button" :disabled="blocked || loading" @click="downloadRepair">{{ de ? 'Korrigierte Kopie herunterladen' : 'Download corrected copy' }}</button>
      </template>
      <p v-if="downloaded" role="status">{{ de ? 'Download der geprüften Kopie ausgelöst. Die Quelldatei bleibt unverändert.' : 'Download of the verified copy requested. The source file remains unchanged.' }}</p>
      <p class="scope">{{ de ? 'Dies prüft nur Typformat, UID und BCC. Karteninhalt, Authentifizierung und Lesegerätfunktion sind damit nicht bestätigt. Es erfolgt kein Schreiben auf das Gerät.' : 'This checks only the type layout, UID and BCC. Card contents, authentication and reader operation are not verified. Nothing is written to the device.' }}</p>
    </section>
    <button v-if="configuration || inspection || error" type="button" @click="clear">{{ de ? 'Lokale Prüfung entfernen' : 'Clear local inspection' }}</button>
  </details>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { CHAMELEON_CONFIG_MAX_BYTES, inspectChameleonConfig, inspectChameleonSlot, prepareChameleonUidRepair, chameleonSlotFilename } from '../lib/chameleon-inspection.js';
const props = defineProps({ locale: { type: String, default: 'de_DE' }, blocked: Boolean });
const de = computed(() => props.locale.startsWith('de'));
const configuration = shallowRef(null), configBytes = shallowRef(null), slotBytes = shallowRef(null), inspection = shallowRef(null);
const slotIndex = ref(''), loading = ref(false), error = ref(''), downloaded = ref(false);
let generation = 0, downloadUrl = null;
const selectedSlot = computed(() => Number.isInteger(slotIndex.value) ? configuration.value?.slots[slotIndex.value] : null);
const expectedFilename = computed(() => chameleonSlotFilename(slotIndex.value));
const checkLabel = value => de.value ? (value ? 'ja' : 'nein') : (value ? 'yes' : 'no');
const slotLabel = slot => `Slot ${slot.index + 1} · ${chameleonSlotFilename(slot.index)} · ${slot.type ?? (de.value ? 'nicht unterstützt' : 'unsupported')}`;
const errorText = computed(() => {
  const texts = {
    config: ['Konfiguration nicht unterstützt. Benötigt wird eine vollständige config.bin im Format v8 aus derselben Sicherung.', 'Unsupported configuration. Select a complete v8 config.bin from the same backup.'],
    read: ['Datei konnte nicht vollständig gelesen werden. Bitte erneut auswählen.', 'The file could not be read completely. Please select it again.'],
    name: [`Der Dateiname muss für diesen Slot ${expectedFilename.value} lauten. Bitte die zugehörige Slotdatei aus derselben Sicherung auswählen.`, `The filename for this slot must be ${expectedFilename.value}. Select its matching slot file from the same backup.`],
    size: ['Die Dateigröße passt nicht zum ausgewählten Slottyp. Keine Korrektur möglich.', 'The file size does not match the selected slot type. No correction is available.'],
    repair: ['Die Korrektur oder der Download konnte nicht abgeschlossen werden. Bitte die Quelldatei erneut prüfen.', 'Correction or download could not finish. Please inspect the source file again.'],
  };
  return texts[error.value]?.[de.value ? 0 : 1] ?? '';
});
const resultText = computed(() => {
  const texts = {
    consistent: ['UID und Prüfbytes stimmen überein. Keine Korrektur erforderlich.', 'UID and check bytes are consistent. No correction is needed.'],
    'legacy-uid-copy': ['Das bekannte alte UID-Kopiermuster ist vorhanden.', 'The known legacy UID copy pattern is present.'],
    'uid-mismatch': ['UID-Abweichung mit unbekannter Ursache. Keine automatische Korrektur verfügbar.', 'UID mismatch with an unknown cause. No automatic correction is available.'],
    'invalid-bcc': ['Mindestens ein UID-Prüfbyte ist ungültig. Keine Korrektur verfügbar.', 'At least one UID check byte is invalid. No correction is available.'],
    unsupported: ['Datei passt nicht zum unterstützten Slotformat. Keine Korrektur verfügbar.', 'The file does not match the supported slot format. No correction is available.'],
  };
  return texts[inspection.value?.status]?.[de.value ? 0 : 1] ?? '';
});
function releaseDownload() { if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; } }
function clearSlot() { generation++; slotBytes.value = null; inspection.value = null; loading.value = false; error.value = ''; downloaded.value = false; releaseDownload(); }
function clear() { clearSlot(); configuration.value = null; configBytes.value = null; slotIndex.value = ''; }
onBeforeUnmount(clear);
function selectSlot(event) {
  if (props.blocked || loading.value) return;
  clearSlot();
  const value = event.target.value;
  slotIndex.value = /^\d{1,2}$/.test(value) && configuration.value?.slots[Number(value)] ? Number(value) : '';
}
async function readConfig(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (props.blocked) return;
  clear(); if (!file) return;
  if (!Number.isInteger(file.size) || file.size < 12 || file.size > CHAMELEON_CONFIG_MAX_BYTES || (file.size - 4) % 8) { error.value = 'config'; return; }
  const current = generation; loading.value = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (current !== generation) return;
    if (bytes.length !== file.size) throw new Error('short-read');
    const result = inspectChameleonConfig(bytes);
    if (!result.supported) { error.value = 'config'; return; }
    configBytes.value = bytes; configuration.value = result;
  } catch { if (current === generation) error.value = 'read'; }
  finally { if (current === generation) loading.value = false; }
}
async function readSlot(event) {
  const file = event.target.files?.[0]; event.target.value = '';
  if (props.blocked || !selectedSlot.value?.supported) return;
  clearSlot(); if (!file) return;
  if (typeof file.name !== 'string' || file.name.toLowerCase() !== expectedFilename.value) { error.value = 'name'; return; }
  if (file.size !== selectedSlot.value.expectedBytes) { error.value = 'size'; return; }
  const current = generation; loading.value = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (current !== generation) return;
    if (bytes.length !== file.size) throw new Error('short-read');
    inspection.value = inspectChameleonSlot(bytes, { configBytes: configBytes.value, slotIndex: slotIndex.value });
    slotBytes.value = bytes;
  } catch { if (current === generation) error.value = 'read'; }
  finally { if (current === generation) loading.value = false; }
}
function downloadRepair() {
  if (props.blocked || loading.value || !inspection.value?.repairable || !slotBytes.value) return;
  error.value = ''; downloaded.value = false; releaseDownload();
  try {
    const prepared = prepareChameleonUidRepair(slotBytes.value, { configBytes: configBytes.value, slotIndex: slotIndex.value });
    downloadUrl = URL.createObjectURL(new Blob([prepared.bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a'); link.href = downloadUrl; link.download = prepared.filename; link.click();
    downloaded.value = true;
  } catch { releaseDownload(); error.value = 'repair'; }
}
</script>

<style scoped>
.card-slot-inspection { margin:14px 0; padding:12px; min-width:0; border:1px solid #cdd7df; border-radius:8px; background:#fff; color:#243746; overflow-wrap:anywhere; }
summary { cursor:pointer; font-weight:600; min-height:24px; }
p { font-size:.84rem; line-height:1.5; }
.scope { color:#536575; font-size:.78rem; }
label { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:12px 0; font-size:.84rem; }
input, select { max-width:100%; min-height:36px; }
button { min-height:40px; margin:6px 8px 0 0; padding:8px 12px; cursor:pointer; }
button:disabled { cursor:default; opacity:.6; }
</style>
