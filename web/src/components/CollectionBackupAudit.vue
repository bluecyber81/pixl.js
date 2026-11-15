<template>
  <details class="zip-collection" @toggle="onToggle">
    <summary>{{ t.title }}</summary>
    <p>{{ t.intro }}</p>
    <label>{{ t.file }}
      <input type="file" accept=".zip,application/zip" @change="chooseFile">
    </label>
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
    <button v-if="file && !busy && !report" type="button" @click="check(selectedScope)">{{ t.retry }}</button>
    <section v-if="report" :aria-label="t.result">
      <p role="status"><strong>{{ report.complete ? t.complete : t.partial }}</strong> · {{ selectedScope }}</p>
      <p><strong>{{ report.stats.presentIds }} / {{ report.catalogue.entries }}</strong> {{ t.coverage }} · {{ report.stats.filesRead }} {{ t.filesRead }}</p>
      <p v-if="selectedScope === 'E:/'">{{ t.excluded }}</p>
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

const props = defineProps({ locale: String, catalogue: [Object, Array] })
const words = {
  de: {
    title: 'Figuren in einer Sicherungs-ZIP prüfen', intro: 'Prüfe eine Allmiibo-Sicherung direkt im Browser. Dafür brauchst du keine Bluetooth-Verbindung.',
    file: 'Sicherungs-ZIP auswählen', scope: 'Geprüfter Ordner', userFolders: 'Alle Figurenordner', slots: 'AmiiboLink-Slots',
    verify: 'ZIP und Prüfsummen werden geprüft …', inspect: 'Figurendateien werden gelesen …', progress: 'Prüffortschritt',
    cancel: 'Abbrechen', cancelled: 'Prüfung abgebrochen.', retry: 'Erneut prüfen',
    integrity: 'Die Archivdaten stimmen nicht mit den Prüfsummen überein. Bitte wähle eine unbeschädigte Sicherung.',
    size: 'Die Sicherung ist leer oder überschreitet die Größenbegrenzung. Wähle bei Bedarf eine Sicherung eines kleineren Ordners.',
    invalid: 'Die ZIP konnte nicht als vollständige Allmiibo-Ordnersicherung gelesen werden.',
    result: 'Ergebnis der ZIP-Prüfung', complete: 'Prüfung abgeschlossen', partial: 'Prüfung unvollständig',
    coverage: 'Katalog-IDs gefunden', filesRead: 'Figurendateien gelesen',
    excluded: 'AmiiboLink-Slots, Systemdateien und Schlüssel sind aus diesem Figurenbestand ausgenommen.',
    slotHint: 'Slots werden separat gezählt. Bei AmiiboLink-Slots kann die Figuren-ID in den Dateieigenschaften fehlen.',
    results: 'Prüfergebnisse', missing: 'Im Ordner fehlende Figuren', unknown: 'Unbekannte IDs', duplicates: 'Mehrere Dateien mit gleicher ID',
    mismatches: 'Abweichende Metadaten-IDs', noId: 'Fehlende Metadaten-IDs', structure: 'Auffällige Dateistruktur', unsupported: 'Weitere BIN-Formate',
    empty: 'Keine Einträge in dieser Ansicht.', files: 'Dateien', byteVariants: 'unterschiedliche Dateiinhalte',
    properties: 'Eigenschaften', content: 'Inhalt', otherPaths: 'weitere Pfade', previous: 'Zurück', next: 'Weiter',
    limits: 'Die Prüfung vergleicht die gespeicherten Dateien mit dem Katalog. NFC, Spielbetrieb und Echtheit lassen sich damit nicht bestätigen.',
  },
  en: {
    title: 'Check figures in a backup ZIP', intro: 'Check an Allmiibo backup in this browser. No Bluetooth connection is needed.',
    file: 'Choose backup ZIP', scope: 'Folder to check', userFolders: 'All figure folders', slots: 'AmiiboLink slots',
    verify: 'Checking ZIP and checksums …', inspect: 'Reading figure files …', progress: 'Check progress',
    cancel: 'Cancel', cancelled: 'Check cancelled.', retry: 'Check again',
    integrity: 'The archive data does not match its checksums. Choose an intact backup.',
    size: 'The backup is empty or exceeds the size limits. Try a backup of a smaller folder.',
    invalid: 'The ZIP could not be read as a complete Allmiibo folder backup.',
    result: 'Backup check results', complete: 'Check complete', partial: 'Check incomplete',
    coverage: 'catalogue IDs found', filesRead: 'figure files read',
    excluded: 'This figure count excludes AmiiboLink slots, system files and keys.',
    slotHint: 'Slots are counted separately. AmiiboLink slots can have no figure ID in their file properties.',
    results: 'Check results', missing: 'Figures missing from this folder', unknown: 'Unknown IDs', duplicates: 'Multiple files with the same ID',
    mismatches: 'Mismatched metadata IDs', noId: 'Missing metadata IDs', structure: 'File structure warnings', unsupported: 'Other BIN formats',
    empty: 'No entries in this view.', files: 'files', byteVariants: 'distinct file contents',
    properties: 'Properties', content: 'Contents', otherPaths: 'more paths', previous: 'Previous', next: 'Next',
    limits: 'This compares the saved files with the catalogue. Authenticity, NFC and in-game behaviour require separate checks.',
  },
}
const t = computed(() => props.locale?.startsWith('de') ? words.de : words.en)
const file = shallowRef(null), report = shallowRef(null), progress = shallowRef(null)
const choices = ref([]), selectedScope = ref(null), checkingSlots = ref(false)
const busy = ref(false), cancelled = ref(false), errorKey = ref(''), category = ref('missing'), page = ref(1)
const error = computed(() => t.value[errorKey.value] || '')
const categories = computed(() => {
  const r = report.value
  if (!r) return []
  const parts = [
    ['unknown', r.unknown], ['duplicates', r.duplicates], ['mismatches', r.metadataMismatches],
    ['noId', r.files.filter(f => !f.metadataId && f.sha256)],
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
</style>
