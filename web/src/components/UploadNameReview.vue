<template>
  <section class="sync-name-review" ref="panel">
    <button type="button" class="toggle" :aria-expanded="open" @click="open=!open">
      <span aria-hidden="true">{{ open ? '▾' : '▸' }}</span> {{ de ? 'Zielnamen prüfen und bearbeiten' : 'Review and edit destination names' }}
    </button>
    <p v-if="review.problems" role="status">{{ de ? 'Namen mit Prüfhinweis' : 'Names to review' }}: {{ review.problems }}</p>
    <template v-if="open">
      <p>{{ de ? 'Ändere den Namen auf dem Allmiibo oder überspringe den Eintrag. Änderungen an einem Ordner gelten für alle Dateien darin.' : 'Edit the name on the Allmiibo or skip an item. Folder changes apply to all files inside.' }}</p>
      <label><input type="checkbox" v-model="issuesOnly" @change="page=1"> {{ de ? 'Nur Prüfhinweise und bearbeitete Einträge' : 'Only issues and edited items' }}</label>
      <div class="sync-name-row" v-for="row in pageRows" :key="row.id" :data-source="row.source">
        <label><span>{{ row.directory ? (de ? 'Ordner' : 'Folder') : (de ? 'Datei' : 'File') }} · {{ row.source }}</span>
          <span>{{ de ? 'Zielname' : 'Destination name' }}</span>
          <input type="text" :disabled="busy || row.skipped || row.inheritedSkip" :value="row.name" @input="change(row,{name:$event.target.value})">
        </label>
        <label><input type="checkbox" :disabled="busy || row.inheritedSkip" :checked="row.skipped || row.inheritedSkip" @change="change(row,{skipped:$event.target.checked})"> {{ de ? 'Überspringen' : 'Skip' }}</label>
        <small>{{ row.target }}</small>
        <button v-if="row.suggestion" type="button" class="name-suggestion" :disabled="busy" @click="change(row,{name:row.suggestion})">
          {{ de ? 'Vorschlag übernehmen' : 'Use suggested name' }} · {{ row.suggestion }}
        </button>
        <small v-if="row.error" class="issue">{{ reason(row.error) }}</small>
      </div>
      <p v-if="!visibleRows.length">{{ de ? 'Keine Prüfhinweise.' : 'No issues.' }}</p>
      <div class="pages" v-if="pageCount>1">
        <button type="button" :disabled="page<=1" @click="page--">{{ de ? 'Zurück' : 'Previous' }}</button>
        <span>{{ page }} / {{ pageCount }}</span>
        <button type="button" :disabled="page>=pageCount" @click="page++">{{ de ? 'Weiter' : 'Next' }}</button>
      </div>
    </template>
  </section>
</template>
<script setup>
import {computed,nextTick,ref,watch} from 'vue'
const props=defineProps({review:{type:Object,required:true}, busy:Boolean, locale:String})
const emit=defineEmits(['edit'])
const de=computed(()=>String(props.locale).startsWith('de'))
const open=ref(props.review.problems>0), issuesOnly=ref(props.review.problems>0), page=ref(1)
// Keep initially affected rows on screen while the user types, including both
// sides of a collision and the ancestors that can shorten a path.
const pinned=new Set()
function includeAncestors(ids, row) {
  for (let r=row; r && !ids.has(r.id); r=props.review.rows[r.parent]) ids.add(r.id)
}
for (const row of props.review.rows) if (row.error) includeAncestors(pinned,row)
const visibleRows=computed(()=>{
  if (!issuesOnly.value) return props.review.rows
  const ids=new Set(pinned)
  for (const row of props.review.rows) if (row.error || row.changed) includeAncestors(ids,row)
  return props.review.rows.filter(row=>ids.has(row.id))
})
const pageCount=computed(()=>Math.max(1,Math.ceil(visibleRows.value.length/12)))
const pageRows=computed(()=>visibleRows.value.slice((page.value-1)*12,page.value*12))
watch(pageCount,total=>{if(page.value>total) page.value=total})
const panel=ref(null)
async function focusTarget(target) {
  const index=props.review.rows.findIndex(row=>row.target===target && !row.directory)
  if(index<0) return
  issuesOnly.value=false; open.value=true; page.value=Math.floor(index/12)+1
  await nextTick()
  panel.value?.querySelectorAll('.sync-name-row input[type=text]')[index%12]?.focus()
}
defineExpose({focusTarget})
function change(row,patch){emit('edit',row.id,patch)}
function reason(error){
  const german=de.value
  switch(error.code){
    case 'NAME_COLLISION': return german ? 'Gleicher Zielname wie bei „'+error.other+'“.' : 'Same destination name as “'+error.other+'”.'
    case 'NAME_LIMIT': return german ? 'Name zu lang: '+error.bytes+' von höchstens '+error.limit+' UTF-8-Bytes.' : 'Name too long: '+error.bytes+' of '+error.limit+' UTF-8 bytes allowed.'
    case 'PATH_LIMIT': return german ? 'Pfad zu lang: '+error.bytes+' von höchstens '+error.limit+' UTF-8-Bytes. Kürze den Namen oder einen übergeordneten Ordner.' : 'Path too long: '+error.bytes+' of '+error.limit+' UTF-8 bytes allowed. Shorten this name or a parent folder.'
    case 'PATH_RESERVED': return german ? 'Für interne Gerätedateien reservierter Pfad.' : 'Path reserved for internal device files.'
    case 'NAME_NORMALIZATION': return german ? 'Verwende die Schreibweise „'+error.normalized+'“.' : 'Use the normalized spelling “'+error.normalized+'”.'
    case 'NAME_PORTABLE': return german ? 'Reservierter Name, unzulässiges Zeichen oder Punkt/Leerzeichen am Ende.' : 'Reserved name, unsupported character, or trailing period/space.'
    default: return german ? 'Gib einen gültigen einzelnen Namen ein.' : 'Enter a valid single name.'
  }
}
</script>
<style scoped>
.sync-name-review{margin:12px 0;border:1px solid #cfdddd;border-radius:8px;padding:10px}.toggle,.pages button{border:1px solid #c1d4d6;background:#f0f7f6;color:#164e55;border-radius:6px;padding:7px 10px;cursor:pointer}.sync-name-review p,.sync-name-review small{font-size:.86rem}.sync-name-row{margin-top:8px;padding:8px 0;border-top:1px solid #dce6e6;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:end;overflow-wrap:anywhere}.sync-name-row label:first-child span{display:block}.sync-name-row label:first-child span+span{color:#526c72;font-size:.78rem}.sync-name-row input[type=text]{width:100%;font:inherit;padding:6px;box-sizing:border-box;border:1px solid #9cb3b5;border-radius:4px}.sync-name-row small{grid-column:1/-1;color:#526c72}.sync-name-row .issue{color:#8b3c10}.pages{display:flex;align-items:center;gap:12px;margin-top:8px}@media(max-width:500px){.sync-name-row{grid-template-columns:minmax(0,1fr)}}
.name-suggestion{grid-column:1/-1;justify-self:start;max-width:100%;overflow-wrap:anywhere;padding:.45rem .65rem;border:1px solid #9bbfb6;border-radius:6px;background:#f0f7f6;color:#164e55;cursor:pointer}
</style>
