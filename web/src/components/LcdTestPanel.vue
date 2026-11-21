<template>
  <section v-if="eligible" class="lcd-test-panel" aria-labelledby="lcd-test-title">
    <h3 id="lcd-test-title">LCD App669 · Test 1</h3>
    <p>{{ pick('Hier vergleichst du dieselbe Übertragung mit zwei Funk-Konfigurationen. Erst Status lesen, dann eine Variante wählen und denselben Backup- oder Prüfdatei-Test wiederholen.',
      'Compare the same transfer with two radio configurations. Read the status first, select a variant, then repeat the same backup or test-file operation.') }}</p>
    <p class="test-scope">{{ pick('Die Ereignisverlängerung ist eine globale Einstellung des Funkstacks. Sie bleibt beim Trennen und Neuverbinden bestehen. Nach einem Geräteneustart ist die Baseline AUS aktiv. Lesen allein verändert nichts.',
      'Event extension is a global radio-stack setting. It persists across disconnect and reconnect. Device restart restores baseline OFF. Reading alone changes nothing.') }}</p>
    <div class="test-actions">
      <button type="button" :disabled="!canRead" @click="read">{{ pick('Teststatus lesen', 'Read test status') }}</button>
      <button type="button" :disabled="!canAct || configuration.eventLengthExtensionEnabled === false" @click="switchMode(false)">{{ pick('Baseline: Verlängerung AUS', 'Baseline: extension OFF') }}</button>
      <button type="button" :disabled="!canAct || configuration.eventLengthExtensionEnabled === true" @click="switchMode(true)">{{ pick('Test: Verlängerung EIN', 'Test: extension ON') }}</button>
    </div>
    <p role="status" aria-live="polite">{{ status || (configuration ? pick('Testfähigkeit bestätigt.', 'Test capability confirmed.') : pick('Testfähigkeit und aktuelle Einstellung noch nicht bestätigt.', 'Test capability and current setting have not been confirmed.')) }}</p>
    <dl v-if="configuration" class="test-grid">
      <div><dt>{{ pick('Zuletzt bestätigte Konfiguration', 'Last confirmed configuration') }}</dt><dd>{{ configuration.eventLengthExtensionEnabled ? pick('Test · EIN', 'Test · ON') : pick('Baseline · AUS', 'Baseline · OFF') }}</dd></div>
      <div><dt>{{ pick('Nominelle Ereignislänge', 'Nominal event length') }}</dt><dd>{{ number(configuration.nominalEventLengthUnits * 1.25) }} ms</dd></div>
      <div><dt>{{ pick('Beobachtete ATT-MTU', 'Observed ATT MTU') }}</dt><dd>{{ snapshot.effectiveAttMtu ?? '—' }}</dd></div>
      <div><dt>{{ pick('Beobachteter Funkmodus RX / TX', 'Observed radio PHY RX / TX') }}</dt><dd>{{ phy(snapshot.link.rxPhy) }} / {{ phy(snapshot.link.txPhy) }}</dd></div>
      <div><dt>{{ pick('Beobachtetes Verbindungsintervall', 'Observed connection interval') }}</dt><dd>{{ snapshot.link.connectionIntervalUnits === null ? '—' : number(snapshot.link.connectionIntervalUnits * 1.25) + ' ms' }}</dd></div>
      <div><dt>{{ pick('Status abgerufen', 'Status read') }}</dt><dd><time :datetime="observedAt">{{ observedAt }}</time></dd></div>
    </dl>
    <small>{{ pick('Die nominelle Ereignislänge ist keine gemessene Funkzeit. 2M und gleiche Vorher-/Nachher-Werte beweisen keinen bestimmten Dateidurchsatz. Backups speichern Dauer, Phasen, Nutzdaten und Linkwerte vor und nach dem Vorgang in der Gesamtdiagnose.',
      'Nominal event length is not measured airtime. 2M and equal before/after values do not establish file throughput. Backups store duration, phases, payload counts and link observations before and after the operation in the full diagnosis.') }}</small>
    <div class="test-storage">
      <h4>{{ pick('Prüfdatei ohne Dateiauswahl', 'Test file without a file picker') }}</h4>
      <p>{{ pick('Schreibt 512 synthetische Bytes in einen eigenen neuen Testordner, liest und vergleicht sie und entfernt anschließend nur den geprüften Testinhalt. Freier Speicher wird vor dem Schreiben, danach und nach dem Löschen neu abgefragt.',
        'Writes 512 synthetic bytes to its own new test folder, reads and compares them, then removes only the checked test content. Free space is read before writing, after writing and after deletion.') }}</p>
      <p>{{ pick('Während des Prüflaufs nur diese Dateimanager-Verbindung verwenden.', 'Use only this file-manager connection during the test.') }}</p>
      <button type="button" :disabled="!canAct || !runStorageTest" @click="runTest">{{ pick('512-Byte-Prüflauf starten', 'Start 512-byte test') }}</button>
      <div v-if="report" class="test-result" :class="{ 'test-failed': report.status !== 'passed' }">
        <strong>{{ report.status === 'passed' ? pick('Schreiben, Rücklesen und Entfernen bestätigt', 'Write, readback and removal confirmed') : pick('Prüflauf nicht vollständig abgeschlossen', 'Test did not complete') }}</strong>
        <p v-if="report.startedAt"><time :datetime="report.startedAt">{{ report.startedAt }}</time> · {{ pick('Ergebnis dieses Prüflaufs; kein Livezustand einer späteren Verbindung.', 'Result of this test run; not the live state of a later connection.') }}</p>
        <dl class="test-grid">
          <div><dt>{{ pick('Freier Speicher vorher', 'Free space before') }}</dt><dd>{{ bytes(report.freeBeforeBytes) }}</dd></div>
          <div><dt>{{ pick('Freier Speicher nach Schreiben', 'Free space after write') }}</dt><dd>{{ bytes(report.freeAfterWriteBytes) }}</dd></div>
          <div><dt>{{ pick('Freier Speicher nach Entfernen', 'Free space after removal') }}</dt><dd>{{ bytes(report.freeAfterBytes) }}</dd></div>
          <div v-if="Number.isFinite(report.durationMilliseconds)"><dt>{{ pick('Dauer des gesamten Prüflaufs', 'Complete test duration') }}</dt><dd>{{ number(report.durationMilliseconds) }} ms</dd></div>
        </dl>
        <p v-if="report.status === 'passed'">{{ report.spaceRecovered ? pick('Der gemeldete freie Speicher ist mindestens wieder auf dem Ausgangswert.', 'Reported free space has returned to at least the starting value.') : pick('Datei und Ordner sind entfernt; der gemeldete freie Speicher hat den Ausgangswert noch nicht erreicht. Bitte die Gesamtdiagnose auslesen.', 'The file and folder are removed; reported free space has not returned to the starting value. Please read the full diagnosis.') }}</p>
        <p v-if="report.cleanupRequired">{{ pick('Es kann ein eigener Testordner übrig sein. Nach Verbindungsabbruch wird nicht automatisch weitergelöscht.', 'The dedicated test folder may remain. Deletion does not continue automatically after a disconnect.') }} <code>{{ report.folder }}</code></p>
        <button type="button" :disabled="running" @click="exportReport">{{ pick('Prüfbericht speichern', 'Save test report') }}</button>
      </div>
      <small>{{ pick('Ein einzelner 512-Byte-Vorgang ist ein Funktionstest, kein belastbarer Durchsatzvergleich und kein Nachweis für große Übertragungen.',
        'One 512-byte operation is a functional check, not a reliable throughput comparison or evidence about large transfers.') }}</small>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { normalizeMtuDiagnostics, supportsBleTestDiagnostics } from '../lib/device-extra-diagnostics.js';
const props = defineProps({connected:Boolean,firmwareVersion:String,generation:Number,blocked:Boolean,locale:String,
  readDiagnostics:Function,setExtension:Function,runStorageTest:Function});
const emit = defineEmits(['busy','export']);
const snapshot=ref(null),observedAt=ref(null),running=ref(false),status=ref(''),report=ref(null);
let serial=0;
const pick=(de,en)=>props.locale?.startsWith('de')?de:en;
const eligible=computed(()=>supportsBleTestDiagnostics(props.firmwareVersion));
const configuration=computed(()=>snapshot.value?.schemaVersion===3?snapshot.value.experiment:null);
const canRead=computed(()=>eligible.value && props.connected && !props.blocked && !running.value);
const canAct=computed(()=>canRead.value && !!configuration.value && snapshot.value.sessionReady && snapshot.value.fileMode && snapshot.value.transferIdle);
const number=n=>new Intl.NumberFormat(props.locale?.startsWith('de')?'de-DE':'en-GB',{maximumFractionDigits:3}).format(n);
const bytes=n=>Number.isSafeInteger(n)&&n>=0?number(n)+' B':'—';
const phy=n=>n===1?'1M':n===2?'2M':'—';
function reset(){++serial;snapshot.value=null;observedAt.value=null;status.value='';running.value=false;emit('busy',false);}
watch(()=>[props.generation,props.firmwareVersion,props.connected],reset);
onBeforeUnmount(reset);
function current(token){return token===serial && props.connected && eligible.value;}
function failure(error){
  if(error?.code==='BLE_TEST_BUSY'||error?.status===1) return pick('Noch eine Übertragung oder Geräteoperation aktiv. Bitte warten und den Status erneut lesen.', 'A transfer or device operation is still active. Wait, then read the status again.');
  if(error?.code==='BLE_TEST_UNSUPPORTED') return pick('Dieses Gerät hat die Testfunktion nicht bestätigt. Normale Dateioperationen bleiben verfügbar.', 'This device did not confirm the test feature. Normal file operations remain available.');
  if(['DISCONNECTED','SESSION_CHANGED','TIMEOUT','TX_FAILED'].includes(error?.code)) return pick('Verbindung unterbrochen. Nach dem Neuverbinden den Zustand erneut lesen; die Funkoption kann noch aktiv sein.', 'Connection interrupted. Read the state after reconnecting; the radio option may still be active.');
  return pick('Der Testvorgang konnte nicht bestätigt werden. Status erneut lesen; ein neuer Prüflauf startet nur über den Knopf.', 'The test operation could not be confirmed. Read status again; another test starts only with the button.');
}
async function operation(action, fn){
  if(action==='read'?!canRead.value:!canAct.value)return;
  const token=++serial;running.value=true;status.value=pick('Prüfvorgang läuft …','Test operation running …');emit('busy',true);
  try{await fn(token);}catch(error){if(current(token)){status.value=failure(error);if(action!=='file'){snapshot.value=null;observedAt.value=null;}}}
  finally{if(token===serial){running.value=false;emit('busy',false);}}
}
function receive(value){
  const data=normalizeMtuDiagnostics(value);
  if(data?.schemaVersion!==3)throw Object.assign(new Error('Unsupported test profile'),{code:'BLE_TEST_UNSUPPORTED'});
  snapshot.value=data;observedAt.value=new Date().toISOString();return data;
}
function read(){return operation('read',async token=>{
  snapshot.value=null;observedAt.value=null;
  const data=await props.readDiagnostics();if(!current(token))return;
  receive(data);status.value=pick('Teststatus gelesen; keine Einstellung verändert.','Test status read; no setting changed.');
});}
function switchMode(enabled){return operation('switch',async token=>{
  if(configuration.value.eventLengthExtensionEnabled===enabled)return;
  const value=await props.setExtension(enabled);if(!current(token))return;
  const data=receive(value),result=data.experiment.lastOptionResult;
  status.value=result===0 && data.experiment.eventLengthExtensionEnabled===enabled
    ? pick(enabled?'Testkonfiguration EIN bestätigt.':'Baseline AUS bestätigt.',enabled?'Test configuration ON confirmed.':'Baseline OFF confirmed.')
    : result!==null && result!==0
      ? pick('Funkstack hat die Änderung abgelehnt. Die angezeigte bisherige Einstellung bleibt bestehen. Fehlercode: ','The radio stack rejected the change. The displayed previous setting remains. Error code: ')+result
      : pick('Änderung nicht bestätigt. Den Status erneut lesen.','Change not confirmed. Read the status again.');
});}
function runTest(){return operation('file',async token=>{
  report.value=null;
  try{
    const value=await props.runStorageTest();
    if(token===serial || (!props.connected && token+1===serial)) report.value=value;
    if(!current(token))return;
    status.value=pick('Prüflauf abgeschlossen.','Test completed.');
  }catch(error){
    // The same test owns its incomplete report even when its session was lost.
    // A newer explicit test must never receive a late result from an older run.
    if(token===serial || (!props.connected && token+1===serial)) report.value=error?.testReport || null;
    throw error;
  }
});}
function exportReport(){if(!running.value && report.value)emit('export',report.value);}
</script>
<style scoped>
.lcd-test-panel{border:1px solid #c5a55e;border-radius:12px;padding:16px;margin:18px 0;background:#fffbef;color:#293c45;}
h3{margin:0 0 10px;}h4{margin:0 0 8px;}p{line-height:1.5;margin:9px 0;}.test-scope{font-size:.9rem;}
.test-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;}button{min-height:40px;white-space:normal;padding:8px 12px;}
.test-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:8px 18px;margin:12px 0;}.test-grid>div{min-width:0;}.test-grid dt{font-size:.8rem;}.test-grid dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere;}
small{display:block;line-height:1.5;color:#4c5a61;margin-top:10px;}.test-storage{border-top:1px solid #dccda6;padding-top:14px;margin-top:18px;}.test-result{border-left:3px solid #35806e;padding:10px 12px;margin-top:14px;background:#fff;}.test-failed{border-color:#b1762c;}code{overflow-wrap:anywhere;}
@media(max-width:560px){.lcd-test-panel{padding:12px;}.test-actions{display:grid;}button{width:100%;}}
</style>
