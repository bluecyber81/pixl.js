<template>
  <details class="lcd-checks">
    <summary>{{ label('LCD-Prüfungen', 'LCD checks') }}</summary>
    <p>{{ label('Erfasse pro Fall die Beobachtung am Gerät, einen Hosttest oder einen Geräteauszug getrennt.', 'Record device observations, host tests and device readbacks separately for each case.') }}</p>
    <label>{{ label('Prüfbereich','Check group') }}
      <select v-model="group">
        <option v-for="(names,id) in groups" :value="id" :key="id">{{ translate(names) }}</option>
      </select>
    </label>
    <p>{{ translate(instructions[group]) }}</p>
    <label>{{ label('Prüffall','Test case') }}
      <select v-model="caseId"><option v-for="item in cases" :key="item.id" :value="item.id">{{ translate(item.labels) }}</option></select>
    </label>
    <label>{{ label('Quelle des Ergebnisses','Source of result') }}
      <select v-model="source"><option v-for="(name,id) in sources" :key="id" :value="id">{{ translate(name) }}</option></select>
    </label>
    <label>{{ label('Beobachtetes Ergebnis','Observed outcome') }}
      <select :value="row?.outcome || ''" @change="record($event.target.value)">
        <option value="">{{ label('Noch offen','Untested') }}</option>
        <option v-for="(name,id) in outcomes" :key="id" :value="id">{{ translate(name) }}</option>
      </select>
    </label>
    <template v-if="row">
      <label>{{ label('Einzelheiten oder Messwerte','Details or measurements') }}
        <textarea rows="2" maxlength="1000" :readonly="row.imported" :value="row.note" @input="note($event.target.value)" />
      </label>
      <p v-if="row.imported">{{ label('Aus einer Datei übernommen. Für einen eigenen neuen Test das Ergebnis erneut erfassen.', 'Imported from a file. Record the outcome again after a new test of your own.') }}
        <button type="button" @click="record(row.outcome)">{{ label('Erneut beobachtet','Observed again') }}</button>
      </p>
    </template>
    <p class="coverage">{{ label('Selbst am Gerät beobachtet','Personally observed on hardware') }} {{ summary.localDeviceCases }} / {{ summary.totalCases }} · {{ label('Hosttests','Host tests') }} {{ summary.hostTests }} · {{ label('Geräteauszüge','Device readbacks') }} {{ summary.readbacks }} · {{ label('Importiert','Imported') }} {{ summary.imported }}</p>
    <ul v-if="history.length">
      <li v-for="item in history" :key="lcdObservationKey(item)">{{ translate(labels[item.caseId]) }} · {{ translate(sources[item.source]) }} · {{ translate(outcomes[item.outcome]) }}<span v-if="item.imported"> · {{ label('importiert','imported') }}</span></li>
    </ul>
  </details>
</template>

<script setup>
import {computed,ref,watch} from 'vue';
import {lcdCheckCases, lcdObservationKey, summarizeLcdObservations} from '../lib/guided-lcd-checks.js';
const props = defineProps({locale:String, observations:{type:Object,required:true}});
const emit = defineEmits(['update']);
const label = (de,en) => props.locale?.startsWith('de') ? de : en;
const translate = names => label(...names);
const labels = Object.fromEntries(lcdCheckCases.map(entry => [entry.id,entry.labels]));
const groups = {controls:['Drehung und Tasten','Rotation and buttons'], games:['Tiny-Spiele','Tiny games'],
  dim:['Hinterleuchtung','Backlight'], dfu:['Update-Wiederaufnahme','Update resumption']};
const instructions = {
  controls:['Prüfe die Ränder und die Leserichtung im Menü. Drücke danach links, rechts und die Mitte kurz, halte die Taste und lass sie los. Vergleiche das Verhalten mit dem gewählten Tastentausch.',
    'Check all edges and text orientation in the menu. Press left, right and center, then hold and release a button. Compare the response with the selected button swap.'],
  games:['Prüfe Intro, Spielfeld, Spielende, Neustart und Rückkehr zur Liste mit der gewählten Drehung und Tastenbelegung.',
    'Check the intro, playing field, game over, restart and return to the list with the selected rotation and button mapping.'],
  dim:['Wähle am Gerät Aus, 5 s, 15 s, 30 s oder Vor dem Schlafen. Notiere Helligkeit, Schlafzeit und ob der erste Tastendruck aufhellt und seinen Befehl genau einmal auslöst.',
    'Choose Off, 5 s, 15 s, 30 s or Before sleep on the device. Record brightness, sleep timeout, and whether the first press restores the light and performs its normal action exactly once.'],
  dfu:['Trage einen bereits beobachteten Updatevorgang ein. Für einen Checkpoint gehören der vom Updater bestätigte Offset und die CRC in die Einzelheiten.',
    'Record an update you already observed. For a checkpoint, enter the offset and CRC acknowledged by the updater in the details.']
};
const sources = {'manual-device':['Selbst am Gerät beobachtet','Personally observed on hardware'],
  'host-test':['Hosttest oder Quellmessung','Host test or source measurement'], 'device-readback':['Geräte- oder Updaterauszug','Device or updater readback']};
const outcomes = {ok:['Wie erwartet','As expected'],different:['Abweichung','Different'],inconclusive:['Unklar','Inconclusive']};
const group=ref('controls'), source=ref('manual-device'), caseId=ref(lcdCheckCases[0].id);
const cases=computed(()=>lcdCheckCases.filter(item=>item.module===group.value));
watch(group,()=>{caseId.value=cases.value[0].id;},{flush:'sync'});
const key=computed(()=>lcdObservationKey({caseId:caseId.value,source:source.value}));
const row=computed(()=>props.observations[key.value]);
const summary=computed(()=>summarizeLcdObservations(props.observations));
const history=computed(()=>Object.values(props.observations).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)));
function record(outcome) {
  const next={...props.observations};
  if (!outcome) delete next[key.value];
  else next[key.value]={caseId:caseId.value,source:source.value,outcome,
    note:row.value?.imported ? '' : row.value?.note || '', recordedAt:new Date().toISOString(), imported:false};
  emit('update',next);
}
function note(text) {
  if (row.value) emit('update',{...props.observations,[key.value]:{...row.value,note:text.replace(/\u0000/g,'').slice(0,1000)}});
}
</script>

<style scoped>
.lcd-checks {padding:1rem;border:1px solid #d2dce4;border-radius:14px;background:#fff}
summary {font-weight:650;cursor:pointer}
label {display:grid;gap:.25rem;margin:.65rem 0;font-weight:600}
p,li {line-height:1.5;overflow-wrap:anywhere}
select,textarea {max-width:100%;min-width:0;width:100%;font:inherit;padding:.4rem}
.coverage,li {font-size:.86rem} ul {padding-left:1.4rem}
</style>
