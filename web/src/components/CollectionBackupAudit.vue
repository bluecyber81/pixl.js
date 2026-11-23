<template>
  <details class="zip-collection" @toggle="onToggle">
    <summary>{{ t.title }}</summary>
    <p>{{ t.intro }}</p>
    <label>{{ t.file }}
      <input type="file" accept=".zip,application/zip" @change="chooseFile">
    </label>
    <div class="local-pickers">
      <label>{{ t.localFiles }}<input type="file" accept=".bin,application/octet-stream" multiple @change="chooseLocal($event)"></label>
      <label>{{ t.localFolder }}<input type="file" webkitdirectory multiple @change="chooseLocal($event, true)"></label>
    </div>
    <p v-if="localSource">{{ localSource.sourceLabel || t.selection }} · {{ t.ignored }}: {{ localSource.ignoredFiles }}</p>
    <p v-if="file">{{ file.name }}</p>
    <label v-if="choices.length > 1">{{ t.scope }}
      <select :value="selectedScope" :disabled="busy" @change="check($event.target.value)">
        <option v-for="path in choices" :key="path" :value="path">{{ path }}{{ path === 'E:/' ? ' · ' + t.userFolders : path === 'E:/amiibolink' ? ' · ' + t.slots : '' }}</option>
      </select>
    </label>
    <div v-if="busy" class="zip-progress">
      <span role="status">{{ progress?.phase === 'parsing' ? t.verify : t.inspect }}</span>
      <progress v-if="progress?.total" :value="progress.done" :max="progress.total" :aria-label="t.progress"></progress>
      <button type="button" @click="cancel">{{ t.cancel }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="cancelled" role="status">{{ t.cancelled }}</p>
    <button v-if="(file || selectedFiles.length) && !busy && !report" type="button" @click="retry">{{ t.retry }}</button>
    <section v-if="report || deviceReport" class="combined-collection" :aria-label="t.comparison">
      <h4>{{ t.comparison }}</h4>
      <p class="source-scope">{{ t.localScope }}: {{ report?.rootPath || '—' }} · {{ t['state_' + comparison.localStatus] }}<br>
        {{ t.deviceScope }}: {{ deviceReport?.rootPath || '—' }} · {{ t['state_' + comparison.deviceStatus] }}</p>
      <div class="collection-counts">
        <div v-for="key in ['local', 'device', 'shared', 'union']" :key="key"><strong>{{ comparison.counts[key] ?? '—' }}</strong><span>{{ t['count_' + key] }}</span></div>
      </div>
      <p v-if="!comparison.comparable" class="comparison-note">{{ t.incompleteComparison }}</p>
      <template v-else>
        <label>{{ t.compareShow }}<select v-model="compareCategory">
          <option v-for="key in ['localOnly', 'deviceOnly', 'shared', 'missingBoth']" :key="key" :value="key">{{ t['count_' + key] }} ({{ comparison.counts[key] }})</option>
        </select></label>
        <ul class="comparison-rows"><li v-for="row in comparisonRows" :key="row.id">
          <strong>{{ row.name || row.id }}</strong> · <code>{{ row.id }}</code>
          <small v-if="row.contentComparison">{{ t[row.contentComparison] }}</small>
        </li></ul>
        <p v-if="!comparison[compareCategory].length">{{ t.empty }}</p>
        <nav v-if="comparisonPages > 1" :aria-label="t.compareShow">
          <button type="button" :disabled="comparePage <= 1" @click="comparePage--">{{ t.previous }}</button>{{ comparePage }} / {{ comparisonPages }}
          <button type="button" :disabled="comparePage >= comparisonPages" @click="comparePage++">{{ t.next }}</button>
        </nav>
      </template>
      <p class="comparison-note">{{ t.comparisonLimit }}</p>
      <div class="comparison-actions">
        <button v-if="localSource" type="button" :disabled="!canCompareFiles" @click="openSync">{{ t.openSync }}</button>
        <button type="button" :disabled="!connected" @click="emit('open-device')">{{ t.openDevice }}</button>
      </div>
      <p v-if="localSource" class="comparison-note">{{ t.syncTarget }}: {{ directory || '—' }}. {{ t.syncPreview }}</p>
    </section>
    <section v-if="report" :aria-label="t.result">
      <p role="status"><strong>{{ report.complete ? t.complete : t.partial }}</strong> · {{ selectedScope }}</p>
      <p><strong>{{ report.stats.presentIds }} / {{ report.catalogue.entries }}</strong> {{ t.coverage }} · {{ report.stats.filesRead }} {{ t.filesRead }}</p>
      <p v-if="file && selectedScope === 'E:/'">{{ t.excluded }}</p>
      <p v-if="checkingSlots">{{ t.slotHint }}</p>
      <label>{{ t.results }}
        <select v-model="category">
          <option v-for="item in categories" :key="item.key" :value="item.key">{{ t[item.key] }} ({{ item.rows.length }})</option>
        </select>
      </label>
      <p v-if="rows.length === 0">{{ t.empty }}</p>
      <ul v-else>
        <li v-for="row in visible" :key="row.path || row.id">
          <strong>{{ row.name || row.path || row.id }}</strong>
          <span v-if="row.name"> · {{ row.id }}</span>
          <span v-if="category === 'mismatches'"> · {{ t.content }} {{ row.contentId }} · {{ t.properties }} {{ row.metadataId }}</span>
          <span v-if="category === 'duplicates'"> · {{ row.paths.length }} {{ t.files }} · {{ row.contentGroups.length }} {{ t.byteVariants }}</span>
          <template v-if="row.paths?.length">
            <div v-for="path in row.paths.slice(0, 3)" :key="path">{{ path }}</div>
            <small v-if="row.paths.length > 3">+ {{ row.paths.length - 3 }} {{ t.otherPaths }}</small>
          </template>
        </li>
      </ul>
      <nav v-if="pages > 1" :aria-label="t.results">
        <button type="button" :disabled="page === 1" @click="page--">{{ t.previous }}</button>
        {{ page }} / {{ pages }}
        <button type="button" :disabled="page === pages" @click="page++">{{ t.next }}</button>
      </nav>
      <p><small>{{ t.limits }}</small></p>
    </section>
  </details>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { inspectCollectionBackup } from '../lib/collection-backup-audit.js'
import { inspectLocalCollection } from '../lib/collection-local-audit.js'
import { compareCollections } from '../lib/collection-comparison.js'

const props = defineProps({ locale: String, catalogue: [Object, Array], deviceReport: Object, deviceStale: Boolean,
  connected: Boolean, blocked: Boolean, directory: String })
const emit = defineEmits(['open-sync', 'open-device'])
const words = {
  de: {
    title: 'PC und Gerät vergleichen', intro: 'Prüfe deine lokalen Figurendateien oder eine Allmiibo-Sicherung im Browser und vergleiche sie mit der Geräteprüfung. Für die lokale Prüfung brauchst du keine Bluetooth-Verbindung.',
    file: 'Sicherungs-ZIP auswählen', scope: 'Geprüfter Ordner', userFolders: 'Alle Figurenordner', slots: 'AmiiboLink-Slots',
    verify: 'ZIP und Prüfsummen werden geprüft …', inspect: 'Figurendateien werden gelesen …', progress: 'Prüffortschritt',
    cancel: 'Abbrechen', cancelled: 'Prüfung abgebrochen.', retry: 'Erneut prüfen',
    integrity: 'Die Archivdaten stimmen nicht mit den Prüfsummen überein. Bitte wähle eine unbeschädigte Sicherung.',
    size: 'Die Sicherung ist leer oder überschreitet die Größenbegrenzung. Wähle bei Bedarf eine Sicherung eines kleineren Ordners.',
    invalid: 'Die ZIP konnte nicht als vollständige Allmiibo-Ordnersicherung gelesen werden.',
    result: 'Ergebnis der lokalen Inhaltsprüfung', complete: 'Prüfung abgeschlossen', partial: 'Prüfung unvollständig',
    coverage: 'Katalog-IDs gefunden', filesRead: 'Figurendateien gelesen',
    excluded: 'AmiiboLink-Slots, Systemdateien und Schlüssel sind aus diesem Figurenbestand ausgenommen.',
    slotHint: 'Slots werden separat gezählt. Bei AmiiboLink-Slots kann die Figuren-ID in den Dateieigenschaften fehlen.',
    results: 'Prüfergebnisse', missing: 'Im Ordner fehlende Figuren', unknown: 'Unbekannte IDs', duplicates: 'Mehrere Dateien mit gleicher ID',
    mismatches: 'Abweichende Metadaten-IDs', noId: 'Fehlende Metadaten-IDs', structure: 'Auffällige Dateistruktur', unsupported: 'Weitere BIN-Formate',
    empty: 'Keine Einträge in dieser Ansicht.', files: 'Dateien', byteVariants: 'unterschiedliche Dateiinhalte',
    properties: 'Eigenschaften', content: 'Inhalt', otherPaths: 'weitere Pfade', previous: 'Zurück', next: 'Weiter',
    limits: 'Die Prüfung vergleicht die gespeicherten Dateien mit dem Katalog. NFC, Spielbetrieb und Echtheit lassen sich damit nicht bestätigen.',
    localFiles: 'BIN-Dateien auswählen', localFolder: 'PC-Ordner auswählen', selection: 'Lokale Auswahl', ignored: 'Weitere Dateien ausgelassen',
    comparison: 'Gemeinsamer Figurenbestand', localScope: 'PC-Auswahl / Sicherung', deviceScope: 'Geräteprüfung',
    state_missing: 'noch nicht geprüft', state_quick: 'nur Eigenschaften, Inhaltsprüfung nötig', state_partial: 'unvollständige Inhaltsprüfung',
    state_stale: 'veraltet – Gerät erneut prüfen', state_complete: 'Inhalte geprüft',
    count_local: 'Auf dem PC nachgewiesen', count_device: 'Auf dem Gerät nachgewiesen', count_shared: 'In beiden gefunden', count_union: 'Zusammen gefunden',
    count_localOnly: 'Nur im geprüften PC-Bestand', count_deviceOnly: 'Nur im geprüften Gerätebestand', count_missingBoth: 'In beiden nicht gefunden',
    compareShow: 'Vergleich anzeigen', incompleteComparison: 'Einseitigen Bestand zeigen wir erst nach zwei vollständigen, aktuellen Inhaltsprüfungen. „—“ bedeutet unbekannt; gefundene IDs können bisher nur einen Teil abdecken.',
    comparisonLimit: 'Gezählt werden Figuren-IDs in den gewählten Bereichen. Gleiche IDs können unterschiedliche UID, Spielstände oder Fahrzeugvarianten enthalten. Es wird nichts automatisch ersetzt oder gelöscht.',
    'same-byte-variants': 'Gleiche Dateivarianten nach SHA-256; Dateieigenschaften nicht verglichen.',
    'different-byte-variants': 'Unterschiedliche Dateivarianten – UID, Spielstand oder Fahrzeug können abweichen.',
    openSync: 'Auswahl im Ordnerabgleich prüfen', openDevice: 'Geräte-Dateien öffnen', syncTarget: 'Ziel des Ordnerabgleichs',
    syncPreview: 'Der vorhandene Abgleich prüft Pfade und Inhalte erneut. Übertragen wird erst nach deiner Auswahl in der Vorschau.',
    localInvalid: 'Diese lokale Auswahl konnte nicht vollständig geprüft werden. Wähle die Dateien erneut aus.',
    localEmpty: 'In dieser Auswahl wurden keine Figurendateien gefunden. Einstellungen, Schlüssel und Transaktionsdateien werden ausgelassen.',
    localLimit: 'Die Auswahl enthält zu viele Dateien. Wähle höchstens 8192 Dateien oder einen kleineren Ordner.',
  },
  en: {
    title: 'Compare PC and device', intro: 'Check local figure files or an Allmiibo backup in this browser and compare them with the device scan. Local checks do not need a Bluetooth connection.',
    file: 'Choose backup ZIP', scope: 'Folder to check', userFolders: 'All figure folders', slots: 'AmiiboLink slots',
    verify: 'Checking ZIP and checksums …', inspect: 'Reading figure files …', progress: 'Check progress',
    cancel: 'Cancel', cancelled: 'Check cancelled.', retry: 'Check again',
    integrity: 'The archive data does not match its checksums. Choose an intact backup.',
    size: 'The backup is empty or exceeds the size limits. Try a backup of a smaller folder.',
    invalid: 'The ZIP could not be read as a complete Allmiibo folder backup.',
    result: 'Local content check results', complete: 'Check complete', partial: 'Check incomplete',
    coverage: 'catalogue IDs found', filesRead: 'figure files read',
    excluded: 'This figure count excludes AmiiboLink slots, system files and keys.',
    slotHint: 'Slots are counted separately. AmiiboLink slots can have no figure ID in their file properties.',
    results: 'Check results', missing: 'Figures missing from this folder', unknown: 'Unknown IDs', duplicates: 'Multiple files with the same ID',
    mismatches: 'Mismatched metadata IDs', noId: 'Missing metadata IDs', structure: 'File structure warnings', unsupported: 'Other BIN formats',
    empty: 'No entries in this view.', files: 'files', byteVariants: 'distinct file contents',
    properties: 'Properties', content: 'Contents', otherPaths: 'more paths', previous: 'Previous', next: 'Next',
    limits: 'This compares the saved files with the catalogue. Authenticity, NFC and in-game behaviour require separate checks.',
    localFiles: 'Choose BIN files', localFolder: 'Choose PC folder', selection: 'Local selection', ignored: 'Other files excluded',
    comparison: 'Combined figure collection', localScope: 'PC selection / backup', deviceScope: 'Device scan',
    state_missing: 'not checked yet', state_quick: 'properties only; check contents', state_partial: 'incomplete content check',
    state_stale: 'outdated; check the device again', state_complete: 'contents checked',
    count_local: 'Confirmed on PC', count_device: 'Confirmed on device', count_shared: 'Found in both', count_union: 'Found combined',
    count_localOnly: 'Only in the checked PC selection', count_deviceOnly: 'Only in the checked device scope', count_missingBoth: 'Not found in either scope',
    compareShow: 'Show comparison', incompleteComparison: 'One-sided counts require two complete, current content checks. “—” means unknown; confirmed IDs may cover only part of the collection.',
    comparisonLimit: 'Counts refer to figure IDs in the selected scopes. The same ID can have different UIDs, save data or vehicle variants. Nothing is automatically replaced or deleted.',
    'same-byte-variants': 'Same file variants by SHA-256; file properties are not compared.',
    'different-byte-variants': 'Different file variants; UID, save data or vehicle can differ.',
    openSync: 'Review selection in folder comparison', openDevice: 'Open device files', syncTarget: 'Folder comparison destination',
    syncPreview: 'The existing comparison checks paths and contents again. Transfers start only after your selection in its preview.',
    localInvalid: 'This local selection could not be fully checked. Choose the files again.',
    localEmpty: 'No figure files were found in this selection. Settings, keys and transaction files are excluded.',
    localLimit: 'The selection contains too many files. Choose at most 8192 files or a smaller folder.',
  },
}
const t = computed(() => props.locale?.startsWith('de') ? words.de : words.en)
const file = shallowRef(null), report = shallowRef(null), progress = shallowRef(null)
const selectedFiles = shallowRef([]), localSource = shallowRef(null), selectedFolder = ref(false)
const compareCategory = ref('localOnly'), comparePage = ref(1)
const comparison = computed(() => compareCollections(report.value, props.connected ? props.deviceReport : null, { deviceStale: props.deviceStale }))
const comparisonRows = computed(() => comparison.value[compareCategory.value].slice((comparePage.value - 1) * 25, comparePage.value * 25))
const comparisonPages = computed(() => Math.ceil(comparison.value[compareCategory.value].length / 25))
const canCompareFiles = computed(() => !busy.value && !props.blocked && props.connected && report.value?.contentComplete && localSource.value?.files.length)
const choices = ref([]), selectedScope = ref(null), checkingSlots = ref(false)
const busy = ref(false), cancelled = ref(false), errorKey = ref(''), category = ref('missing'), page = ref(1)
const error = computed(() => t.value[errorKey.value] || '')
const categories = computed(() => {
  const r = report.value
  if (!r) return []
  const parts = [
    ['unknown', r.unknown], ['duplicates', r.duplicates], ['mismatches', r.metadataMismatches],
    ...(file.value ? [['noId', r.files.filter(f => !f.metadataId && f.sha256)]] : []),
    ['structure', r.files.filter(f => f.status === 'attention')],
    ['unsupported', r.files.filter(f => f.status === 'unsupported-length')],
  ]
  if (r.contentComplete) parts.unshift(['missing', r.missing])
  return parts.map(([key, rows]) => ({ key, rows }))
})
const rows = computed(() => categories.value.find(item => item.key === category.value)?.rows || [])
const pages = computed(() => Math.ceil(rows.value.length / 25))
const visible = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25))
watch(category, () => { page.value = 1 })
watch([compareCategory, comparison], () => { comparePage.value = 1 })
let controller
function cancel() {
  controller?.abort()
  controller = null
  busy.value = false
  cancelled.value = true
}
function clear() {
  cancel()
  file.value = null
  selectedFiles.value = []
  localSource.value = null
  selectedFolder.value = false
  report.value = null
  choices.value = []
  selectedScope.value = null
  cancelled.value = false
  errorKey.value = ''
}
function chooseFile(event) {
  const selected = event.target.files?.[0]
  if (!selected) return
  event.target.value = ''
  clear()
  file.value = selected
  check()
}
function chooseLocal(event, folderContents = false) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  clear()
  selectedFiles.value = files
  selectedFolder.value = folderContents
  checkLocal()
}
function retry() { if (file.value) check(selectedScope.value); else checkLocal() }
function openSync() {
  if (!canCompareFiles.value) return
  emit('open-sync', { files: localSource.value.files.slice(), folderContents: localSource.value.folderContents })
}
async function checkLocal() {
  if (!selectedFiles.value.length) return
  controller?.abort()
  const active = new AbortController()
  controller = active
  busy.value = true
  cancelled.value = false
  errorKey.value = ''
  report.value = null
  localSource.value = null
  progress.value = { phase: 'reading' }
  try {
    const result = await inspectLocalCollection(selectedFiles.value, { catalogue: props.catalogue,
      folderContents: selectedFolder.value, signal: active.signal, onProgress(value) {
        if (controller === active) progress.value = { phase: value.phase, done: value.filesRead, total: value.totalToRead }
      } })
    if (controller !== active) return
    localSource.value = result
    report.value = result.report
    selectedScope.value = result.report.rootPath
    category.value = result.report.contentComplete ? 'missing' : 'unknown'
    page.value = 1
  } catch (err) {
    if (controller !== active) return
    errorKey.value = err.code === 'COLLECTION_LOCAL_EMPTY' ? 'localEmpty' : err.code === 'COLLECTION_LOCAL_LIMIT' ? 'localLimit' : 'localInvalid'
  } finally {
    if (controller === active) { controller = null; busy.value = false }
  }
}
async function check(scope) {
  if (!file.value) return
  controller?.abort()
  const active = new AbortController()
  controller = active
  if (scope != null) selectedScope.value = scope
  busy.value = true
  cancelled.value = false
  errorKey.value = ''
  report.value = null
  progress.value = { phase: 'parsing' }
  try {
    const result = await inspectCollectionBackup(file.value, {
      scope, catalogue: props.catalogue, signal: active.signal,
      onProgress(value) {
        if (controller !== active) return
        const done = value.done ?? value.filesRead
        const total = value.total ?? value.totalToRead
        if (value.phase !== progress.value.phase || done === total || done % 32 === 0)
          progress.value = { phase: value.phase, done, total }
      },
    })
    if (controller !== active) return
    selectedScope.value = result.rootPath
    choices.value = result.choices
    checkingSlots.value = result.checkingSlots
    report.value = result.report
    category.value = result.report.contentComplete ? 'missing' : 'unknown'
    page.value = 1
  } catch (err) {
    if (controller !== active) return
    if (err.code === 'ZIP_HASH' || err.code === 'ZIP_CRC') errorKey.value = 'integrity'
    else if (err.code === 'ZIP_LIMIT') errorKey.value = 'size'
    else errorKey.value = 'invalid'
  } finally {
    if (controller === active) { controller = null; busy.value = false }
  }
}
function onToggle(event) { if (!event.currentTarget.open) clear() }
watch(() => props.catalogue, clear)
onBeforeUnmount(cancel)
</script>

<style scoped>
.zip-collection { border: 1px solid #c8d9e4; border-radius: 10px; padding: .85rem 1rem; margin-block: 1rem; background: #fff; color: #17374a; overflow-wrap: anywhere; }
summary { cursor: pointer; font-weight: 650; }
p, li, label { font-size: .9rem; }
label { display: grid; gap: .35rem; margin-block: .7rem; }
input, select, progress { max-width: 100%; min-width: 0; }
select, button { min-height: 2.5rem; }
ul { list-style: none; padding: 0; }
li { padding-block: .45rem; border-bottom: 1px solid #d8e1e6; }
li div { color: #476276; font-size: .8rem; }
nav, .zip-progress { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
.local-pickers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; }
.combined-collection { border-block: 1px solid #d8e1e6; padding-block: .8rem; margin-block: 1rem; }
.combined-collection h4 { margin: 0 0 .6rem; }
.collection-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; }
.collection-counts > div { display: grid; gap: .3rem; padding: .65rem; background: #f1f6f8; border-radius: .4rem; }
.collection-counts strong { font-size: 1.4rem; font-variant-numeric: tabular-nums; }
.collection-counts span, .source-scope, .comparison-note, .comparison-rows small { font-size: .8rem; line-height: 1.5; }
.comparison-rows small { display: block; }
.comparison-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
@media (max-width: 650px) { .local-pickers { grid-template-columns: 1fr; } .collection-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
