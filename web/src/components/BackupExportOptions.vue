<template>
  <details class="backup-export-options">
    <summary>{{ de ? 'Sicherungsoptionen' : 'Backup options' }}</summary>
    <label>
      <input v-model="compress" type="checkbox" :disabled="busy">
      {{ de ? 'ZIP nach dem Auslesen komprimieren' : 'Compress ZIP after reading' }}
    </label>
    <p>{{ de ? 'Die ZIP braucht dadurch weniger Platz. Die Bluetooth-Übertragung dauert gleich lang.' : 'This can reduce the ZIP size. Bluetooth reading time is unaffected.' }}</p>
    <label>
      {{ de ? 'Frühere ZIP für eine schnellere Folgesicherung' : 'Previous ZIP for a faster repeat backup' }}
      <input type="file" accept=".zip,application/zip" :disabled="busy" @change="selectFile">
    </label>
    <p>{{ de ? 'Für denselben Ordner auf E: kann das Gerät kleine Dateien per SHA-256 bestätigen. Geänderte und größere Dateien werden vollständig gelesen.' : 'For the same folder on E:, the device can confirm small files by SHA-256. Changed and larger files are read in full.' }}</p>
    <div role="status" aria-live="polite">
      <span v-if="checking">{{ de ? 'ZIP wird lokal geprüft …' : 'Checking ZIP locally…' }}</span>
      <span v-else-if="failed">{{ de ? 'Die ZIP konnte nicht als Allmiibo-Sicherung bestätigt werden.' : 'The ZIP could not be verified as an Allmiibo backup.' }}</span>
      <span v-else-if="previous">{{ previousName }} · {{ previous.rootPath }} · {{ mismatch ? (de ? 'Für den geöffneten Ordner wird frisch gelesen.' : 'The current folder will be read in full.') : (de ? 'ZIP geprüft' : 'ZIP verified') }}</span>
      <button v-if="checking || previous" type="button" :disabled="busy" @click="clear">
        {{ checking ? (de ? 'Prüfung abbrechen' : 'Cancel check') : (de ? 'Auswahl entfernen' : 'Clear selection') }}
      </button>
    </div>
  </details>
  <details v-if="profile" class="backup-export-options">
    <summary>{{ de ? 'Messwerte der letzten Sicherung' : 'Last backup measurements' }}</summary>
    <dl>
      <template v-for="row in rows" :key="row[0]"><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></template>
    </dl>
    <p v-if="profile.compressionFallback">{{ de ? 'Der Browser hat für die übrigen ZIP-Einträge unkomprimierte Speicherung verwendet.' : 'The browser used uncompressed storage for the remaining ZIP entries.' }}</p>
  </details>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { loadBackupReference } from '../lib/zip-import.js'

const props = defineProps({ locale: String, busy: Boolean, result: Object, rootPath: String })
const emit = defineEmits(['options', 'loading'])
const compress = ref(false), previous = shallowRef(null), previousName = ref('')
const checking = ref(false), failed = ref(false)
let controller = null
const de = computed(() => (props.locale || 'de').startsWith('de'))
const root = computed(() => props.rootPath?.length > 3 ? props.rootPath.replace(/\/$/u, '') : props.rootPath)
const mismatch = computed(() => previous.value && previous.value.rootPath !== root.value)
watch([compress, previous, mismatch], () => {
  emit('options', { compression: compress.value ? 'deflate' : 'store', previousArchive: mismatch.value ? null : previous.value })
}, { flush: 'sync' })

function clear() {
  controller?.abort()
  controller = null
  previous.value = null
  previousName.value = ''
  checking.value = false
  failed.value = false
  emit('loading', false)
}
onBeforeUnmount(clear)

async function selectFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  clear()
  const active = new AbortController()
  controller = active
  checking.value = true
  emit('loading', true)
  try {
    const archive = await loadBackupReference(file, { signal: active.signal })
    if (controller === active) {
      previousName.value = file.name
      previous.value = archive
    }
  } catch {
    if (controller === active) failed.value = true
  } finally {
    if (controller === active) {
      controller = null
      checking.value = false
      emit('loading', false)
    }
  }
}

const profile = computed(() => props.result?.profile)
const rows = computed(() => {
  const { phasesMs, operations, transport } = profile.value
  const number = new Intl.NumberFormat(de.value ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 })
  const seconds = ms => number.format(ms / 1000) + ' s'
  const values = [
    [de.value ? 'Ordner auflisten' : 'Folder listing', seconds(phasesMs.listing)],
    [de.value ? 'Dateien lesen und hashen' : 'Reading and hashing', seconds(phasesMs.reading)],
    [de.value ? 'Ordner nachprüfen' : 'Folder verification', seconds(phasesMs.verifying)],
    [de.value ? 'ZIP erstellen' : 'ZIP creation', seconds(phasesMs.packing)],
    [de.value ? 'Gesamt' : 'Total', seconds(phasesMs.total)],
    [de.value ? 'Ordnerabfragen' : 'Directory requests', number.format(operations.listingCalls + operations.verificationListingCalls)],
    [de.value ? 'Vollständige Dateilesungen' : 'Full file reads', number.format(operations.fileReads)],
    [de.value ? 'Bestätigte Dateien aus der früheren ZIP' : 'Verified files reused from previous ZIP', number.format(operations.previousZipFiles)]
  ]
  if (transport) values.push([de.value ? 'Abgeschlossene Protokollbefehle' : 'Completed protocol commands', number.format(transport.completedCommands)])
  return values
})
</script>

<style scoped>
.backup-export-options { margin: .65rem 0; }
.backup-export-options summary { cursor: pointer; font-weight: 600; }
.backup-export-options label { display: block; margin-top: .75rem; overflow-wrap: anywhere; }
.backup-export-options input[type=file] { display: block; max-width: 100%; margin-top: .35rem; }
.backup-export-options p { margin: .2rem 0 .65rem; }
.backup-export-options dl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .25rem 1rem; max-width: 34rem; }
.backup-export-options dd { margin: 0; font-variant-numeric: tabular-nums; }
</style>
