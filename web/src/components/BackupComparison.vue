<template>
  <details class="backup-comparison">
    <summary>{{ t.title }}</summary>
    <p>{{ t.intro }}</p>
    <div class="pickers">
      <label>{{ t.first }}
        <input type="file" accept=".zip,application/zip,application/x-zip-compressed" @change="choose('A', $event)">
      </label>
      <label>{{ t.second }}
        <input type="file" accept=".zip,application/zip,application/x-zip-compressed" @change="choose('B', $event)">
      </label>
    </div>
    <button type="button" :disabled="!first || !second || busy" @click="compare">{{ t.compare }}</button>
    <button v-if="busy" type="button" @click="cancel">{{ t.cancel }}</button>
    <p v-if="busy && progress" role="status">{{ t.checking }} {{ progress.side }} <span v-if="progress.total !== null">· {{ progress.done }} / {{ progress.total }}</span></p>
    <p v-if="errorSide" role="alert">{{ t.invalid }} {{ errorSide }}. {{ t.retry }}</p>
    <div v-if="result">
      <p>{{ t.roots }} <bdi>A · {{ result.roots[0] }}</bdi> / <bdi>B · {{ result.roots[1] }}</bdi></p>
      <p v-if="!result.exactMetadata">{{ t.decoded }}</p>
      <ul class="counts" aria-live="polite">
        <template v-for="(number, key) in result.counts" :key="key">
          <li v-if="number || key === 'same'">{{ t.status[key] }} · <strong>{{ number }}</strong></li>
        </template>
      </ul>
      <div class="comparison-filters">
        <label>{{ t.statusFilter }}<select v-model="statusFilter"><option value="all">{{ t.allStatuses }}</option><option v-for="status in backupComparisonStatuses" :key="status" :value="status">{{ t.status[status] }}</option></select></label>
        <label>{{ t.pathFilter }}<input v-model="pathQuery" type="search" maxlength="256" :placeholder="t.pathPlaceholder"></label>
        <label v-if="statusFilter === 'all'"><input type="checkbox" v-model="showSame"> {{ t.showSame }}</label>
      </div>
      <p class="export-scope">{{ filtered.length }} / {{ result.rows.length }} · {{ t.exportScope }}</p>
      <div class="comparison-exports"><button type="button" @click="saveReport('csv')">{{ t.saveCsv }}</button><button type="button" @click="saveReport('json')">{{ t.saveJson }}</button></div>
      <p v-if="exportError" role="alert">{{ t.exportFailed }}</p>
      <p v-if="!visible.length">{{ result.rows.length ? (pathQuery || statusFilter !== 'all' ? t.noMatches : t.noChanges) : t.empty }}</p>
      <ul v-else class="comparison-rows">
        <li v-for="row in visible" :key="row.path">
          <span class="path"><bdi>{{ row.path }}</bdi>{{ row.type === 'directory' ? '/' : '' }}</span>
          <span>{{ t.status[row.status] }}</span>
        </li>
      </ul>
      <nav v-if="pages > 1" :aria-label="t.pages">
        <button type="button" :disabled="page === 1" @click="page--">{{ t.back }}</button>
        <span>{{ page }} / {{ pages }}</span>
        <button type="button" :disabled="page === pages" @click="page++">{{ t.next }}</button>
      </nav>
    </div>
  </details>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { compareBackupFiles, backupComparisonStatuses, filterBackupComparison, backupComparisonReport, backupComparisonCsv } from '../lib/backup-comparison.js'
import { saveBlob } from '../lib/browser-tools.js'

const props = defineProps({ locale: { type: String, required: true } })
const words = {
  de: {
    title: 'Zwei Sicherungs-ZIPs vergleichen',
    intro: 'Wähle zwei Allmiibo-Sicherungen. Der Vergleich läuft auf diesem Gerät und funktioniert auch ohne Bluetooth.',
    first: 'A · Frühere Sicherung', second: 'B · Neuere Sicherung', compare: 'Sicherungen vergleichen', cancel: 'Abbrechen',
    checking: 'Prüfe Sicherung', invalid: 'Prüfung fehlgeschlagen für Sicherung', retry: 'Bitte eine vollständige Allmiibo-Sicherungs-ZIP wählen.',
    roots: 'Die Pfade gelten relativ zum jeweiligen Sicherungsordner.',
    decoded: 'Ältere Sicherungen enthalten nur die ausgelesenen Metadaten. Verglichen werden Notiz, Kennzeichen und Figuren-ID.',
    showSame: 'Unveränderte Einträge anzeigen', noChanges: 'Keine Unterschiede gefunden.', empty: 'Beide Sicherungsordner sind leer.',
    statusFilter: 'Status', allStatuses: 'Alle Status', pathFilter: 'Originalpfad filtern', pathPlaceholder: 'Teil des Pfads', noMatches: 'Keine passenden Einträge.',
    exportScope: 'passende Einträge; der Export enthält alle Treffer, auch auf weiteren Seiten.', saveCsv: 'Treffer als CSV speichern', saveJson: 'Treffer als JSON speichern', exportFailed: 'Export nicht gestartet. Bitte erneut versuchen.',
    back: 'Zurück', next: 'Weiter', pages: 'Vergleichsseiten',
    status: { added: 'Neu in B', removed: 'Nur in A', content: 'Inhalt geändert', metadata: 'Nur Metadaten geändert', type: 'Dateiart geändert', unresolved: 'Metadaten ungeklärt', same: 'Unverändert' }
  },
  en: {
    title: 'Compare two backup ZIPs',
    intro: 'Choose two Allmiibo backups. The comparison runs on this device and works without Bluetooth.',
    first: 'A · Earlier backup', second: 'B · Later backup', compare: 'Compare backups', cancel: 'Cancel',
    checking: 'Checking backup', invalid: 'Could not verify backup', retry: 'Please choose a complete Allmiibo backup ZIP.',
    roots: 'Paths are relative to the folder in each backup.',
    decoded: 'Older backups contain only decoded metadata. Notes, flags and figure IDs are compared.',
    showSame: 'Show unchanged entries', noChanges: 'No differences found.', empty: 'Both backup folders are empty.',
    statusFilter: 'Status', allStatuses: 'All statuses', pathFilter: 'Filter original path', pathPlaceholder: 'Part of the path', noMatches: 'No matching entries.',
    exportScope: 'matching entries; exports include all matches across every page.', saveCsv: 'Save matches as CSV', saveJson: 'Save matches as JSON', exportFailed: 'Export did not start. Please try again.',
    back: 'Previous', next: 'Next', pages: 'Comparison pages',
    status: { added: 'New in B', removed: 'Only in A', content: 'Content changed', metadata: 'Only metadata changed', type: 'Entry type changed', unresolved: 'Metadata unresolved', same: 'Unchanged' }
  }
}
const t = computed(() => props.locale.startsWith('de') ? words.de : words.en)
const first = shallowRef(null), second = shallowRef(null), result = shallowRef(null)
const showSame = ref(false), busy = ref(false), errorSide = ref(''), progress = shallowRef(null), page = ref(1)
const statusFilter = ref('all'), pathQuery = ref(''), exportError = ref(false)
const viewFilters = computed(() => ({ status: statusFilter.value, path: pathQuery.value, showSame: showSame.value }))
watch(viewFilters, () => { page.value = 1; exportError.value = false })
const pageSize = 50
const filtered = computed(() => filterBackupComparison(result.value, viewFilters.value))
const pages = computed(() => Math.ceil(filtered.value.length / pageSize))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
let active

function cancel() {
  active?.abort()
  active = undefined
  busy.value = false
  progress.value = null
}
function choose(side, event) {
  cancel()
  const selected = side === 'A' ? first : second
  selected.value = event.target.files?.[0] || null
  result.value = null
  errorSide.value = ''
  page.value = 1
  showSame.value = false
  statusFilter.value = 'all'
  pathQuery.value = ''
  exportError.value = false
}
onBeforeUnmount(cancel)
function saveReport(format) {
  if (!result.value || busy.value || !['csv', 'json'].includes(format)) return
  exportError.value = false
  try {
    const csv = format === 'csv'
    const content = csv ? backupComparisonCsv(result.value, viewFilters.value, props.locale)
      : JSON.stringify(backupComparisonReport(result.value, viewFilters.value), null, 2) + '\n'
    saveBlob(new Blob([content], { type: csv ? 'text/csv;charset=utf-8' : 'application/json' }), `Allmiibo-Backup-Comparison.${format}`)
  } catch { exportError.value = true }
}

async function compare() {
  if (busy.value || !first.value || !second.value) return
  const controller = new AbortController()
  active = controller
  busy.value = true
  result.value = null
  errorSide.value = ''
  exportError.value = false
  page.value = 1
  let lastPaint = 0
  try {
    const comparison = await compareBackupFiles(first.value, second.value, {
      signal: controller.signal,
      onProgress(value) {
        if (controller !== active) return
        const now = performance.now()
        if (progress.value?.side !== value.side || now - lastPaint >= 150 || value.done === value.total) {
          lastPaint = now
          progress.value = value
        }
      }
    })
    if (controller === active) result.value = comparison
  } catch {
    if (controller === active) errorSide.value = progress.value?.side || 'A'
  } finally {
    if (controller === active) cancel()
  }
}
</script>

<style scoped>
.backup-comparison { padding: .8rem 1rem; margin-block: 1rem; border: 1px solid #cbd8e0; border-radius: .55rem; }
summary { cursor: pointer; font-weight: 600; }
.pickers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: .8rem; margin-block: .8rem; }
.pickers label { display: grid; gap: .3rem; }
input[type=file] { min-width: 0; max-width: 100%; }
button { min-height: 2.5rem; padding: .35rem .8rem; cursor: pointer; }
button:disabled { cursor: default; }
.counts { display: flex; flex-wrap: wrap; gap: .3rem 1.2rem; list-style: none; padding: 0; }
.comparison-filters,.comparison-exports { display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-block:.8rem; }
.comparison-filters label { display:grid;gap:.25rem;min-width:0; }
.comparison-filters input[type=search],.comparison-filters select { min-height:2.5rem;max-width:100%; }
.export-scope { font-size:.85rem; }
.comparison-rows { list-style: none; padding: 0; }
.comparison-rows li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .3rem 1rem; border-bottom: 1px solid #d8e1e6; padding-block: .35rem; }
.path { overflow-wrap: anywhere; }
nav { display: flex; align-items: center; gap: .65rem; }
</style>
