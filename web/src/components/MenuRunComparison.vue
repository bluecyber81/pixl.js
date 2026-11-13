<template>
  <details class="menu-run-comparison">
    <summary>{{ t.title }}</summary><p>{{ t.intro }}</p>
    <div class="run-pickers"><label v-for="side in ['A','B']" :key="side">{{ side }} · {{ t.choose }}
      <input type="file" accept=".json,application/json" @change="choose(side,$event)">
      <span v-if="loading[side]" role="status">{{ t.reading }}</span>
      <span v-if="errors[side]" role="alert">{{ t.invalid }}</span>
      <small v-if="runs[side]">{{ t.ready }} · {{ runs[side].observedAt }}</small>
    </label></div>
    <template v-if="comparison">
      <p>{{ t.version }}: {{ stateWord(comparison.comparison.firmwareVersion) }} · {{ t.counter }}: {{ stateWord(comparison.comparison.applicationCounter) }} · {{ t.hardware }}: {{ stateWord(comparison.comparison.hardwareProfile) }}</p>
      <p class="limit">{{ t.identityLimit }}</p>
      <dl><div v-for="side in ['first','second']" :key="side"><dt>{{ side === 'first' ? 'A' : 'B' }}</dt><dd>{{ comparison[side].identity.firmwareVersion || '—' }} · {{ t.counter }} {{ comparison[side].identity.applicationCounter ?? '—' }} · {{ comparison[side].observedAt }}</dd></div></dl>
      <p>{{ comparison.changedFields }} {{ t.changed }}</p><label><input v-model="showUnchanged" type="checkbox"> {{ t.unchanged }}</label>
      <div class="run-table"><table><thead><tr><th scope="col">{{ t.field }}</th><th scope="col">A</th><th scope="col">B</th><th scope="col">B − A</th></tr></thead><tbody><tr v-for="row in rows" :key="row.field"><th scope="row">{{ fieldWord(row.field) }}</th><td>{{ display(row.before,row.beforeSaturated) }}</td><td>{{ display(row.after,row.afterSaturated) }}</td><td>{{ row.difference ?? '—' }}</td></tr></tbody></table></div>
      <p>{{ t.deltaLimit }}</p><p>{{ t.pixelLimit }}</p>
      <button type="button" @click="save">{{ t.export }}</button><p v-if="exportError" role="alert">{{ t.exportFailed }}</p>
    </template>
  </details>
</template>
<script setup>
import {computed,reactive,ref,onBeforeUnmount} from 'vue';
import {parseMenuRun,compareMenuRuns,MENU_RUN_FILE_LIMIT} from '../lib/menu-run-comparison.js';
import {saveBlob} from '../lib/browser-tools.js';
const props=defineProps({locale:{type:String,default:'de_DE'}});
const de=computed(()=>props.locale.startsWith('de')),pick=(a,b)=>de.value?a:b;
const t=computed(()=>({title:pick('Zwei PXMI-v2-Diagnosen offline vergleichen','Compare two PXMI v2 diagnostic runs offline'),
 intro:pick('Wähle zwei gespeicherte Gesamtdiagnosen als JSON (je bis 256 KiB). Die Dateien bleiben auf diesem Computer. Es wird keine Geräteabfrage gestartet.','Choose two saved combined diagnostic JSON files (up to 256 KiB each). Files stay on this computer. No device read is started.'),
 choose:pick('Gesamtdiagnose wählen','Choose combined diagnostics'),reading:pick('Datei wird geprüft…','Checking file…'),ready:pick('PXMI v2 geprüft','PXMI v2 validated'),
 invalid:pick('Ungültige oder zu große Datei; vollständige Gesamtdiagnose mit verfügbarem PXMI v2 wählen.','Invalid or oversized file; choose a complete combined report containing available PXMI v2.'),
 version:pick('Firmwareversion','Firmware version'),counter:pick('Anwendungszähler','Application counter'),hardware:pick('Hardwareprofil','Hardware profile'),
 identityLimit:pick('Gleiche Angaben beweisen weder dasselbe physische Gerät noch identische Anwendungsbytes. Es gibt keine eindeutige Gerätekennung und keinen gemessenen App-Hash im Bericht.','Matching values prove neither the same physical device nor identical application bytes. Reports contain no unique device ID or measured application hash.'),
 changed:pick('geänderte Messfelder','changed measurement fields'),unchanged:pick('Unveränderte Felder anzeigen','Show unchanged fields'),field:pick('Messfeld','Measurement field'),
 deltaLimit:pick('B − A ist nur die Differenz gespeicherter Werte, kein Ereigniszähler zwischen zwei Tests. Neustart, neue Rückkehr und Kontextüberlauf können Werte ersetzen. Gesättigte Zähler sind Untergrenzen; dafür wird keine exakte Differenz angegeben.','B − A is only the difference between recorded values, not an event count between tests. Restart, a new return and context wrap can replace values. Saturated counts are lower bounds; no exact difference is shown.'),
 pixelLimit:pick('Zeichenaufrufe beweisen weder sichtbare LCD-Pixel noch die Anzeigezeit.','Draw calls prove neither visible LCD pixels nor display timing.'),
 export:pick('Vergleich als JSON speichern','Save comparison as JSON'),exportFailed:pick('Export nicht gestartet. Bitte erneut versuchen.','Export did not start. Please try again.') }));
const labels={menuEntered:['Hauptmenü geöffnet','Main menu entered'],selectionAttempted:['Erste App-Auswahl versucht','First app selection attempted'],launcherReturned:['Startaufruf zurückgekehrt','Launcher returned'],targetActive:['Gewählte App aktiv','Selected app active'],leftBeforeSelection:['Vor erster Auswahl verlassen','Left before selection'],targetAppId:['Erste gewählte App','First selected app'],launchCallMilliseconds:['Startaufruf (ms)','Launch call (ms)'],countsSaturated:['Mitteltastenzähler gesättigt','Middle counters saturated'],
 'centerCounts.press':['Mitte: Drücken','Middle: press'],'centerCounts.release':['Mitte: Loslassen','Middle: release'],'centerCounts.short':['Mitte: Kurz','Middle: short'],
 'lastAppReturn.sourceContext':['Rückkehr: App-Kontext','Return: app context'],'lastAppReturn.targetContext':['Rückkehr: Menükontext','Return: menu context'],'lastAppReturn.staleEventsDiscarded':['Rückkehr: veraltete Eingaben verworfen','Return: stale inputs discarded'],
 'lastAppReturn.sourceAppId':['Rückkehr: Quell-App','Return: source app'],'lastAppReturn.targetAppId':['Rückkehr: Zielfokus','Return: target focus'],'lastAppReturn.firstLabelAppId':['Erster Zeichenaufruf: Name','First draw: label'],'lastAppReturn.lastLabelAppId':['Letzter Zeichenaufruf: Name','Last draw: label'],'lastAppReturn.firstIconAppId':['Erster Zeichenaufruf: Symbol','First draw: icon'],'lastAppReturn.lastIconAppId':['Letzter Zeichenaufruf: Symbol','Last draw: icon']};
const fieldWord=key=>labels[key]?.[de.value?0:1]||key;
const stateWord=state=>state==='equal'?pick('gleich gemeldet','reported equal'):state==='different'?pick('unterschiedlich','different'):pick('nicht vergleichbar','not comparable');
const display=(value,saturated)=>value===null?'—':typeof value==='boolean'?value?pick('Ja','Yes'):pick('Nein','No'):(saturated?'≥':'')+String(value);
const runs=reactive({A:null,B:null}),loading=reactive({A:false,B:false}),errors=reactive({A:false,B:false}),tokens={A:0,B:0};
const showUnchanged=ref(false),exportError=ref(false);
const comparison=computed(()=>runs.A&&runs.B?compareMenuRuns(runs.A,runs.B):null);
const rows=computed(()=>comparison.value?.rows.filter(row=>showUnchanged.value||row.changed)||[]);
async function choose(side,event){
 const token=++tokens[side],file=event.target.files?.[0];runs[side]=null;errors[side]=false;loading[side]=false;exportError.value=false;
 if(!file)return;
 if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>MENU_RUN_FILE_LIMIT){errors[side]=true;return;}
 loading[side]=true;
 try{const run=parseMenuRun(await file.text());if(token===tokens[side])runs[side]=run;}
 catch{if(token===tokens[side])errors[side]=true;}
 finally{if(token===tokens[side])loading[side]=false;}
}
function save(){if(!comparison.value)return;exportError.value=false;try{saveBlob(new Blob([JSON.stringify(comparison.value,null,2)+'\n'],{type:'application/json'}),'Allmiibo-PXMI-Comparison.json');}catch{exportError.value=true;}}
onBeforeUnmount(()=>{tokens.A++;tokens.B++;});
</script>
<style scoped>
.menu-run-comparison{margin:1rem 0;padding:1rem;border:1px solid #cbd8e0;border-radius:.7rem}.menu-run-comparison summary{cursor:pointer;font-weight:600}.run-pickers{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr));gap:1rem}.run-pickers label{display:grid;gap:.4rem;min-width:0}.run-pickers input{max-width:100%}.limit{padding:.7rem;background:#edf4f8}.run-table{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{padding:.5rem;text-align:left;border-bottom:1px solid #d8e1e6}th{font-weight:500}p,td,dd{overflow-wrap:anywhere}dl>div{display:flex;gap:.7rem}dd{margin:0}button{min-height:44px;padding:.5rem .9rem;cursor:pointer}
</style>
