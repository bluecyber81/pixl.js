<template>
  <section class="diagnostic-overview" :aria-busy="loading">
    <header class="overview-heading"><div><p class="eyebrow">{{ t.eyebrow }}</p><h3>{{ t.title }}</h3></div>
      <span class="overview-count">{{ availableCount }} / {{ cards.length }} {{ t.readable }}</span></header>
    <p class="intro">{{ t.intro }}</p>
    <div class="overview-actions">
      <button class="primary-action" type="button" :disabled="!connected || blocked || loading" @click="read">{{ loading ? t.reading : t.read }}</button>
      <button type="button" :disabled="!canExport" @click="exportSnapshot">{{ t.export }}</button>
    </div>
    <p class="overview-state" role="status">{{ loading ? progressLabel : !snapshot ? (connected ? t.empty : t.disconnected) : !connected ? t.historical : t.snapshot }}</p>
    <p v-if="startedAt" class="snapshot-time">{{ t.started }}: <time :datetime="startedAt">{{ displayTime(startedAt) }}</time><template v-if="completedAt"> · {{ t.completed }}: <time :datetime="completedAt">{{ displayTime(completedAt) }}</time></template></p>
    <div class="diagnostic-grid">
      <article v-for="card in cards" :key="card.id" class="diagnostic-card" :class="'state-' + card.state" :data-section="card.id">
        <header class="card-heading"><h4>{{ card.title }}</h4><span class="section-state">{{ t.states[card.state] }}</span></header>
        <p class="section-time">{{ t.observed }}: <time v-if="card.observedAt" :datetime="card.observedAt">{{ displayTime(card.observedAt) }}</time><span v-else>—</span></p>
        <template v-if="card.state === 'available'">
          <dl class="key-values"><div v-for="row in card.summary" :key="row[0]"><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></div></dl>
          <details v-if="card.details.length || card.events" class="technical-details"><summary>{{ t.details }}</summary>
            <dl v-if="card.details.length" class="detail-values"><div v-for="row in card.details" :key="row[0]"><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></div></dl>
            <div v-if="card.events" class="event-table-wrap"><table><caption>{{ t.buttons }}</caption><thead><tr><th scope="col">{{ t.source }}</th><th v-for="event in eventTypes" :key="event" scope="col">{{ t.events[event] }}</th></tr></thead>
              <tbody><tr v-for="row in card.events" :key="row.label"><th scope="row">{{ row.label }}</th><td v-for="event in eventTypes" :key="event">{{ number(row.values[event]) }}</td></tr></tbody>
            </table></div>
          </details>
          <p class="scope-note">{{ card.note }}</p>
        </template>
        <p v-else class="section-message">{{ card.state === 'failed' ? t.failed : card.state === 'unavailable' ? t.unavailable : t.unread }}<span v-if="card.errorCode"> · {{ t.code }}: {{ card.errorCode }}</span></p>
      </article>
    </div>
    <p class="overall-limits">{{ t.limits }}</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import { normalizeRuntimeDiagnostics } from '../lib/device-info.js';
import { normalizeDiagnosticSectionData, normalizeStorageDiagnostics } from '../lib/diagnostic-snapshot.js';
import { normalizeBootDiagnostics, formatHexWord } from '../lib/boot-diagnostics.js';
import { normalizePowerDiagnostics } from '../lib/power-diagnostics.js';
import { normalizeStartupDiagnostics, startupDiagnosticRows, startupDiagnosticsText } from '../lib/startup-diagnostics.js';
import { normalizeMtuDiagnostics, normalizeUiDiagnostics } from '../lib/device-extra-diagnostics.js';

const props = defineProps({
  connected: Boolean, blocked: Boolean, loading: Boolean,
  snapshot: { type: Object, default: null }, progress: { type: String, default: null },
  locale: { type: String, default: 'de_DE' },
});
const emit = defineEmits(['read', 'export']);
const de = computed(() => props.locale.startsWith('de'));
const pick = (german, english) => de.value ? german : english;
const t = computed(() => ({
  eyebrow: pick('GERÄTEDIAGNOSE', 'DEVICE DIAGNOSTICS'),
  title: pick('Eine Abfrage, alle verfügbaren Werte', 'One read, all available values'),
  readable: pick('Bereiche ausgelesen', 'sections read'),
  intro: pick('Liest die Werte nacheinander auf deinen Klick. Ein nicht unterstützter Bereich verhindert die übrigen Abfragen nicht.', 'Reads values sequentially when you click. An unsupported section does not prevent the remaining reads.'),
  read: pick('Alle Diagnosewerte auslesen', 'Read all diagnostic values'), reading: pick('Diagnose wird gelesen …', 'Reading diagnostics …'),
  export: pick('Gesamtdiagnose speichern', 'Save combined diagnostics'),
  empty: pick('Bereit zum Auslesen. Noch keine Gesamtaufnahme.', 'Ready to read. No combined snapshot yet.'),
  disconnected: pick('Zum Auslesen zuerst mit dem Allmiibo verbinden.', 'Connect to the Allmiibo before reading.'),
  historical: pick('Getrennt: Die angezeigten Werte stammen aus der früheren Abfrage.', 'Disconnected: these values belong to an earlier read.'),
  snapshot: pick('Momentaufnahme der letzten Abfrage. Kein laufender Messwert.', 'Snapshot from the last read, not a live measurement.'),
  started: pick('Beginn', 'Started'), completed: pick('Abschluss', 'Completed'), observed: pick('Abgerufen', 'Read at'),
  details: pick('Technische Werte anzeigen', 'Show technical values'),
  states: { unknown: pick('Noch offen', 'Not read'), available: pick('Ausgelesen', 'Read'), unavailable: pick('Nicht verfügbar', 'Unavailable'), failed: pick('Abfrage fehlgeschlagen', 'Read failed') },
  failed: pick('Dieser Bereich konnte nicht gültig gelesen werden. Die anderen Ergebnisse bleiben erhalten.', 'This section could not be read and validated. Other results remain available.'),
  unavailable: pick('Diese Werte stellt die Firmware oder Verbindung nicht bereit.', 'These values are not provided by the firmware or connection.'),
  unread: pick('Noch nicht abgefragt.', 'Not requested yet.'), code: pick('Code', 'Code'),
  yes: pick('Ja', 'Yes'), no: pick('Nein', 'No'), absent: pick('Nicht erfasst', 'Not recorded'),
  limits: pick('Nur lesend: kein Neustart, keine Änderung an Dateien oder Einstellungen. Die Bereiche werden nacheinander gelesen; Abrufzeiten sind keine Messzeitpunkte der gespeicherten Werte. Ein gelesener Bericht ersetzt keinen Tasten-, NFC-, Funk- oder Belastungstest.', 'Read only: no restart or file/settings changes. Sections are read sequentially; read timestamps are not measurement times of cached values. Reading a report does not replace button, NFC, radio or load testing.'),
  source: pick('Quelle', 'Source'), buttons: pick('Tastenereignisse der Einstellungsdiagnose', 'Button events from settings diagnostics'),
  events: { press: pick('Drücken', 'Press'), release: pick('Loslassen', 'Release'), short: pick('Kurz', 'Short'), long: pick('Lang', 'Long'), repeat: pick('Wiederholt', 'Repeat') },
}));
const eventTypes = ['press', 'release', 'short', 'long', 'repeat'];
const number = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : '—';
const signed = value => Number.isSafeInteger(value) ? String(value) : '—';
const bytes = value => Number.isSafeInteger(value) && value >= 0
  ? value >= 1024 ? `${(value / 1024).toFixed(2)} KiB (${value} B)` : `${value} B` : '—';
const ms = value => Number.isSafeInteger(value) && value >= 0 ? `${value} ms` : '—';
const yesNo = value => typeof value === 'boolean' ? value ? t.value.yes : t.value.no : '—';
const hex = value => formatHexWord(value) || '—';
const validTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? value : null;
const displayTime = value => value.replace('T', ' ').replace('Z', ' UTC');
const validSnapshot = computed(() => props.snapshot?.schemaVersion === 1 && props.snapshot?.sections && typeof props.snapshot.sections === 'object' ? props.snapshot : null);
const startedAt = computed(() => validTime(validSnapshot.value?.startedAt));
const completedAt = computed(() => validTime(validSnapshot.value?.completedAt));
const canExport = computed(() => !!validSnapshot.value && !props.loading);
function read() { if (props.connected && !props.blocked && !props.loading) emit('read'); }
function exportSnapshot() { if (canExport.value) emit('export', props.snapshot); }
function section(id, title, normalizer, present) {
  const source = validSnapshot.value?.sections[id];
  let state = ['available', 'unavailable', 'failed'].includes(source?.state) ? source.state : 'unknown';
  let data = null;
  if (state === 'available') {
    try { data = normalizer(source.data); } catch { data = null; }
    if (!data) state = 'failed';
  }
  const errorCode = state === 'failed' && typeof source?.errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,47}$/.test(source.errorCode) ? source.errorCode : null;
  return { id, title, state, observedAt: validTime(source?.observedAt), errorCode, summary: [], details: [], ...(data ? present(data) : {}) };
}
const runtime = data => ({
  summary: [[pick('Freier Anwendungs-Heap / Pool', 'Free application heap / pool'), `${bytes(data.heapFreeBytes)} / ${bytes(data.heapPoolBytes)}`]],
  details: [
    [pick('Größter freier Heap-Block', 'Largest free heap block'), bytes(data.largestFreeBlockBytes)],
    [pick('Kleinster beobachteter freier Heap', 'Smallest sampled free heap'), bytes(data.sampledMinFreeBytes)],
    [pick('Kleinster beobachteter größter Block', 'Smallest sampled largest block'), bytes(data.sampledMinLargestBlockBytes)],
    [pick('Maximal belegte Heap-Nutzdaten', 'Maximum allocated heap payload'), bytes(data.maxAllocatedPayloadBytes)],
    [pick('Reservierter Stackbereich', 'Reserved stack region'), bytes(data.stackReservedBytes)],
    [pick('Gemeldeter kleinster freier Stack', 'Reported minimum free stack'), data.stackMinFreeBytes === null ? t.value.absent : bytes(data.stackMinFreeBytes)],
    [pick('Speicherstichproben', 'Memory samples'), number(data.memorySamples)],
    [pick('Fehlgeschlagene Zuteilungen', 'Failed allocations'), number(data.allocationFailures)],
    [pick('BLE-Warteschlangenüberläufe', 'BLE queue overflows'), number(data.queueOverflows)],
    [pick('BLE-Trennungen / Zeitüberschreitungen', 'BLE disconnects / timeouts'), `${number(data.disconnects)} / ${number(data.timeouts)}`],
    [pick('Letzte lokale BLE-Ursache / HCI', 'Last local BLE cause / HCI'), `${number(data.lastLocalBleCause)} / ${number(data.lastHciReason)}`],
    [pick('VFS-Fehlerzähler / letzter Code', 'VFS error count / last code'), `${number(data.vfsErrors)} / ${signed(data.lastVfsError)}`],
    [pick('Letzter VFS-Befehl', 'Last VFS command'), number(data.lastVfsCommand)],
  ],
  note: pick('Seit Geräteneustart. Stichproben können Spitzen übersehen; der Heap ist nur ein Teil des Chip-RAMs. Reservierter Stack ist kein gemessener freier Stack. VFS-Zähler können auch abgelehnte Anfragen enthalten.', 'Since device restart. Samples may miss peaks; the heap is only part of chip RAM. Reserved stack is not measured free stack. VFS counts may include rejected requests.'),
});
function startup(data) {
  const rows = startupDiagnosticRows(data), text = startupDiagnosticsText(props.locale);
  const complete = data.phaseMask === 63, intervals = rows.slice(1).filter(row => row.sincePreviousMilliseconds !== null);
  const longest = complete ? intervals.reduce((best, row) => !best || row.sincePreviousMilliseconds > best.sincePreviousMilliseconds ? row : best, null) : null;
  return {
    summary: [[pick('Anwendungsstart bis erste Verarbeitung', 'Application start to first dispatch'), complete ? ms(rows.at(-1).elapsedMilliseconds) : pick('Unvollständige Aufzeichnung', 'Incomplete recording')],
      ...(longest ? [[pick('Längster gemessener Abschnitt', 'Longest measured interval'), `${text.phases[longest.id]} · ${ms(longest.sincePreviousMilliseconds)}`]] : [])],
    details: rows.map(row => [text.phases[row.id], row.elapsedMilliseconds === null ? t.value.absent : `${ms(row.elapsedMilliseconds)}${row.sincePreviousMilliseconds === null ? '' : ` (+${ms(row.sincePreviousMilliseconds)})`}`]),
    note: pick('Gespeicherte Marken dieses Anwendungsstarts. Beginn: Speicherinitialisierung. Bootloader/früher SDK-Start fehlen; die Marken beweisen keine sichtbare Displayausgabe.', 'Cached markers of this application start, beginning at storage initialization. Bootloader/early SDK startup are excluded; markers do not prove visible display output.'),
  };
}
function boot(data) {
  const version = data.softDeviceVersion === null ? '—' : `${Math.floor(data.softDeviceVersion / 1000000)}.${Math.floor(data.softDeviceVersion / 1000) % 1000}.${data.softDeviceVersion % 1000}`;
  return { summary: [[pick('Chip / Flash / RAM', 'Chip / flash / RAM'), `${hex(data.chipPart)} · ${bytes(data.flashBytes)} / ${bytes(data.ramBytes)}`],
    ['SoftDevice', data.softDeviceValid ? `S${data.softDeviceVariant} ${version} · FWID ${hex(data.softDeviceFwid)}` : t.value.absent]],
    details: [
      [pick('Anwendungszähler / Bootloaderzähler', 'Application counter / bootloader counter'), `${number(data.applicationCounter)} / ${number(data.bootloaderCounter)}`],
      [pick('Bootadresse / Quelle', 'Boot address / source'), `${hex(data.bootAddress)} / ${data.bootAddressSource}`],
      [pick('Settings-CRC gültig', 'Settings CRC valid'), yesNo(data.settingsCrcValid)],
      [pick('Bootbereich', 'Boot region size'), bytes(data.bootRegionBytes)],
      [pick('Bootbereich SHA-256', 'Boot region SHA-256'), data.bootRegionSha256 || '—'],
    ],
    note: pick('Die gespeicherten Zähler sind keine bestätigten Codeversionen. Der Fingerabdruck ist weder Sicherung noch Nachweis der Platinenkompatibilität.', 'Stored counters are not confirmed code versions. The fingerprint is neither a backup nor proof of board compatibility.'),
  };
}
const power = data => ({
  summary: [[pick('Gespeicherte Batteriespannung', 'Cached battery voltage'), data.voltageValid ? `${(data.batteryMillivolts / 1000).toFixed(3)} V` : t.value.absent],
    [pick('Eingestellte Ruhezeit', 'Configured sleep time'), data.sampleCollected ? `${number(data.configuredSleepSeconds)} s` : t.value.absent]],
  details: [[pick('Resetregister beim Anwendungsstart', 'Reset register at application start'), hex(data.resetReasonRaw)],
    [pick('Batteriestichprobe vorhanden', 'Battery sample collected'), yesNo(data.sampleCollected)],
    [pick('LiPo-Modus / Ladeanzeige', 'LiPo mode / charge indication'), `${data.sampleCollected ? yesNo(data.lipoMode) : t.value.absent} / ${data.voltageValid ? yesNo(data.chargingActive) : t.value.absent}`]],
  note: pick('Gespeicherte Register-/Batteriewerte, keine aktuelle USB-Erkennung und kein gesicherter Nachweis der Aufwachursache.', 'Cached register/battery values, not current USB detection or proven wake-cause diagnosis.'),
});
function drives(data) {
  return { summary: data.length ? data.map(drive => [`${drive.label}:`, drive.status === 0 ? `${bytes(drive.freeBytes)} ${pick('frei von', 'free of')} ${bytes(drive.totalBytes)}` : `${pick('Status', 'Status')} ${number(drive.status)}`]) : [[pick('Laufwerke', 'Drives'), pick('Keine gemeldet', 'None reported')]], details: [],
    note: pick('Freier Dateisystemplatz ist kein freier RAM. Der Stand kann sich nach Schreibzugriffen ändern.', 'Free filesystem space is not free RAM. Values may change after writes.') };
}
function storage(data) {
  const { info, layout } = data;
  return { summary: [[pick('Dateisystem E:', 'Filesystem E:'), ['—', 'SPIFFS', 'LittleFS', 'Packed LittleFS (PFS1)'][info.backend]],
    [pick('Eingebunden', 'Mounted'), yesNo(info.mounted)]],
    details: [
      [pick('Metadaten pro Eintrag', 'Metadata per entry'), bytes(info.metaLen)],
      [pick('Pfad-/Namensgrenze', 'Path/name limit'), `${number(info.pathMax)} / ${number(info.nameMax)} B`],
      ...(layout ? [
        [pick('Flashbereich / Blockgröße', 'Flash region / block size'), `${bytes(layout.flashBytes)} / ${bytes(layout.blockSize)}`],
        [pick('Blockanzahl', 'Block count'), number(layout.blockCount)],
        [pick('Lese-/Programmiereinheit', 'Read/program unit'), `${bytes(layout.readSize)} / ${bytes(layout.progSize)}`],
        [pick('Konfigurierte LittleFS-Cachegröße', 'Configured LittleFS cache size'), bytes(layout.cacheSize)],
        [pick('Zielgröße je Packdatei', 'Target size per packed file'), bytes(layout.shardTarget)],
        [pick('Maximale Packdateien / offene Handles', 'Maximum packed files / open handles'), `${number(layout.maxShards)} / ${number(layout.maxHandles)}`],
        [pick('Speicherkern SHA-256', 'Storage engine SHA-256'), layout.engineSha256],
      ] : [[pick('Geometrie/Cachekonfiguration', 'Geometry/cache configuration'), t.value.absent]]),
    ], note: pick('Konfigurationswerte des Geräts. Die Cachegröße ist keine Messung der Cachebelegung, Trefferquote oder gesamten RAM-Nutzung.', 'Device configuration values. Cache size does not measure cache occupancy, hit rate or total RAM use.'),
  };
}
const mtu = data => ({
  summary: [[pick('Aktuelle ATT-MTU laut Firmware', 'Current ATT MTU reported by firmware'), data.effectiveAttMtu === null ? t.value.absent : number(data.effectiveAttMtu)],
    [pick('Aktuelle GATT-Wertkapazität', 'Current GATT value capacity'), data.gattValueCapacity === null ? t.value.absent : bytes(data.gattValueCapacity)]],
  details: [[pick('Grenze für nächste Verbindung', 'Next connection limit'), number(data.nextConnectionAttMtu)],
    [pick('Konfigurierte maximale ATT-MTU', 'Configured maximum ATT MTU'), number(data.configuredMaxAttMtu)],
    [pick('Dateiclient bereit / Dateimodus', 'File client ready / file mode'), `${yesNo(data.sessionReady)} / ${yesNo(data.fileMode)}`],
    [pick('Übertragung im Leerlauf', 'Transfer idle'), yesNo(data.transferIdle)]],
  note: pick('Die aktuelle MTU wird ausdrücklich von der Firmware gemeldet. GATT-Wertkapazität und Konfigurationsgrenzen sind andere Größen; der Browser misst die ATT-MTU nicht selbst.', 'Current MTU is explicitly reported by the firmware. GATT value capacity and configured limits are different quantities; the browser does not measure ATT MTU itself.'),
});
function ui(data) {
  const attempt = (label, value) => [label, `${pick('Anzahl', 'Count')} ${number(value.count)} · ${pick('Auswahl', 'selection')} ${number(value.selection)} · ${pick('Fokus', 'focus')} ${number(value.focus)} · ${pick('Stufe', 'stage')} ${number(value.stage)} · ${pick('Speichern', 'save')} ${signed(value.saveResult)}`];
  return { summary: [[pick('Einstellungsdiagnose aktiv', 'Settings diagnostics active'), yesNo(data.active)],
    [pick('Gezählte Einstellungssitzungen', 'Counted settings sessions'), number(data.sessions)]],
    details: [[pick('Höchster Warteschlangenstand', 'Queue high-water count'), number(data.queueHighWater)],
      attempt(pick('Letzter kurzer Mitteldruck', 'Last short middle press'), data.shortAttempt),
      attempt(pick('Letzter langer Mitteldruck', 'Last held middle press'), data.longAttempt)],
    events: [
      { label: pick('Links roh', 'Left raw'), values: data.rawEvents.left }, { label: pick('Mitte roh', 'Middle raw'), values: data.rawEvents.center },
      { label: pick('Rechts roh', 'Right raw'), values: data.rawEvents.right }, { label: pick('Mitte eingereiht', 'Middle queued'), values: data.centerPosted },
      { label: pick('Mitte verworfen', 'Middle dropped'), values: data.centerDropped }, { label: pick('Mitte zugestellt', 'Middle delivered'), values: data.centerDelivered },
    ],
    note: pick('Nur die aktuelle/letzte Einstellungsansicht, keine allgemeine Tastenstatistik aller Menüs. Die Zahlen beweisen weder einen Defekt noch eine erfolgreiche physische Tastenprüfung.', 'Current/last settings view only, not general button statistics across all menus. Counts prove neither a defect nor a successful physical button test.'),
  };
}
const cards = computed(() => [
  section('runtime', pick('RAM und Laufzeit', 'RAM and runtime'), normalizeRuntimeDiagnostics, runtime),
  section('startup', pick('Startzeiten', 'Startup timing'), normalizeStartupDiagnostics, startup),
  section('mtu', pick('Bluetooth und MTU', 'Bluetooth and MTU'), normalizeMtuDiagnostics, mtu),
  section('drives', pick('Freier Dateispeicher', 'Free file storage'), value => normalizeDiagnosticSectionData('drives', value), drives),
  section('storage', pick('Speicherlayout und Cache', 'Storage layout and cache'), normalizeStorageDiagnostics, storage),
  section('power', pick('Strom und Ruhezeit', 'Power and sleep'), normalizePowerDiagnostics, power),
  section('boot', pick('Chip, Bootloader und SoftDevice', 'Chip, bootloader and SoftDevice'), normalizeBootDiagnostics, boot),
  section('ui', pick('Tasten in den Einstellungen', 'Buttons in settings'), normalizeUiDiagnostics, ui),
]);
const progressLabel = computed(() => cards.value.find(card => card.id === props.progress)?.title || t.value.reading);
const availableCount = computed(() => cards.value.filter(card => card.state === 'available').length);
</script>
<style scoped>
.diagnostic-overview{margin:18px 0;padding:20px;border:1px solid #bfd2df;border-radius:16px;background:linear-gradient(145deg,#f6fafc,#eef5f9);color:#20364b}
.overview-heading,.card-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.eyebrow{margin:0 0 5px;letter-spacing:.12em;font-size:.64rem;font-weight:700;color:#507088}
h3{margin:0;font-size:1.12rem;line-height:1.4}h4{margin:0;font-size:.92rem;line-height:1.4}.overview-count{font-size:.73rem;padding:7px 10px;border-radius:20px;background:#e0ecf3;white-space:nowrap}
p{line-height:1.5}.intro,.overview-state{font-size:.83rem}.overview-actions{display:flex;flex-wrap:wrap;gap:10px}.overview-actions button{min-height:44px;padding:10px 14px;border:1px solid #9eb8cb;border-radius:9px;background:#fff;color:#244f71;font:inherit;font-size:.85rem;cursor:pointer}.overview-actions .primary-action{background:#215c80;border-color:#215c80;color:#fff}
button:disabled{opacity:.5;cursor:default}button:focus-visible,summary:focus-visible{outline:3px solid #66a6ce;outline-offset:3px}.snapshot-time,.section-time{font-size:.69rem;color:#64788a;overflow-wrap:anywhere}
.diagnostic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.diagnostic-card{min-width:0;padding:15px;border:1px solid #d6e2e9;border-radius:12px;background:#fff}
.section-state{font-size:.64rem;padding:4px 7px;border-radius:12px;background:#edf1f5;color:#52697a;white-space:nowrap}.state-available .section-state{background:#e6f2eb;color:#246343}.state-failed .section-state{background:#fff0e6;color:#91501e}
.key-values,.detail-values{display:grid;gap:11px;margin:14px 0}.key-values>div,.detail-values>div{display:grid;gap:4px}.key-values dt,.detail-values dt{font-size:.73rem;color:#5e7486}.key-values dd{font-weight:650;font-size:.9rem}.key-values dd,.detail-values dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.detail-values dd{font-size:.76rem}.technical-details{border-top:1px solid #e2eaf0;padding-top:9px}.technical-details>summary{cursor:pointer;font-size:.76rem;color:#2c668b;padding:4px 0}.scope-note,.section-message,.overall-limits{font-size:.71rem;color:#617588}.scope-note{margin-bottom:0}.overall-limits{margin-bottom:0}
.event-table-wrap{overflow-x:auto;margin-top:12px}table{width:100%;border-collapse:collapse;font-size:.67rem}caption{text-align:left;padding:5px 0;font-weight:600}th,td{padding:7px 5px;text-align:left;border-bottom:1px solid #e2eaf0}tbody th{font-weight:400}td{font-variant-numeric:tabular-nums}
@media(min-width:1200px){.diagnostic-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){.diagnostic-overview{padding:12px}.diagnostic-grid{grid-template-columns:1fr}.overview-heading{flex-wrap:wrap}.overview-actions button{flex:1 1 230px}.card-heading{flex-wrap:wrap}}
</style>
