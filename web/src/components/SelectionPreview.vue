<template>
  <section class="selection-preview" :aria-label="de ? 'Ausgewählte Figur' : 'Selected figure'">
    <p class="preview-eyebrow">{{ de ? 'AUSWAHL' : 'SELECTION' }}</p>
    <template v-if="selection">
      <div class="preview-picture">
        <img v-if="entry && !failed" :key="imageUrl" :src="imageUrl" :alt="entry.name" referrerpolicy="no-referrer" @error="imageError" />
        <span v-else class="preview-placeholder" aria-hidden="true">◇</span>
      </div>
      <h3>{{ entry?.name || selection.row.name }}</h3>
      <p v-if="entry" class="preview-series">{{ entry.series }}</p>
      <p v-if="selection.state === 'reading'" role="status">{{ de ? 'Figuren-ID wird gelesen…' : 'Reading figure ID…' }}</p>
      <p v-else-if="selection.state === 'invalid'" class="preview-warning" role="status">{{ de ? 'Die Dateistruktur ist auffällig. Keine sichere Bildzuordnung.' : 'The file structure needs attention. No reliable image assignment.' }}</p>
      <p v-else-if="selection.state === 'failed'" class="preview-warning" role="status">{{ de ? 'Datei konnte nicht gelesen werden. Erneut auswählen.' : 'Could not read file. Select it again to retry.' }}</p>
      <p v-else-if="selection.state === 'unsupported'" role="status">{{ de ? 'Keine unterstützte Amiibo-Dateigröße. Dateiaktionen bleiben verfügbar.' : 'Not a supported amiibo file size. File actions remain available.' }}</p>
      <p v-else-if="!entry" role="status">{{ de ? 'Figur im lokalen Katalog unbekannt. Es wird kein Bild geraten.' : 'Figure unknown in the local catalogue. No image is guessed.' }}</p>
      <p v-if="failed" role="status">{{ de ? 'Bild nicht verfügbar oder blockiert.' : 'Image unavailable or blocked.' }} <button type="button" @click="failed=false">{{ de ? 'Erneut laden' : 'Retry' }}</button></p>
      <dl><div><dt>{{ de ? 'Datei' : 'File' }}</dt><dd>{{ selection.row.name }}</dd></div><div><dt>{{ de ? 'Größe' : 'Size' }}</dt><dd>{{ selection.row.sizeBytes }} B</dd></div><div v-if="selection.id"><dt>{{ de ? 'Figuren-ID' : 'Figure ID' }}</dt><dd class="preview-id">{{ selection.id }}</dd></div><div v-if="selection.row.notes"><dt>{{ de ? 'Notiz' : 'Note' }}</dt><dd>{{ selection.row.notes }}</dd></div></dl>
      <div class="preview-actions"><button type="button" :disabled="blocked" @click="$emit('properties')">{{ de ? 'Eigenschaften & QR' : 'Properties & QR' }}</button><button type="button" :disabled="blocked" @click="$emit('download')">{{ de ? 'Datei herunterladen' : 'Download file' }}</button></div>
      <p class="preview-caption">{{ selection.source === 'demo' ? (de ? 'Beispielfigur aus dem öffentlichen Katalog. Kein Gerät verbunden; keine Figurendatei gelesen oder erzeugt.' : 'Example figure from the public catalogue. No device connected; no tag file read or generated.') : selection.source === 'metadata' ? (de ? 'ID aus Dateieigenschaften; Dateiinhalt ungeprüft.' : 'ID from file properties; file contents unchecked.') : (de ? 'Nur die ausgewählte Datei wurde gelesen; keine Spiel- oder Signaturprüfung.' : 'Only the selected file was read; no game or signature check.') }}</p>
      <p v-if="entry" class="preview-caption">{{ de ? 'Bild von GitHub über die öffentliche Figuren-ID. Keine UID, Dateinamen oder Dateiinhalte werden gesendet.' : 'GitHub image requested using the public figure ID. No UID, filenames or file contents are sent.' }}</p>
    </template>
    <div v-else class="preview-empty"><span aria-hidden="true">◇</span><h3>{{ de ? 'Deine Figur im Blick' : 'Your figure at a glance' }}</h3><p>{{ de ? 'Wähle eine Amiibo-Datei. Bild, Serie und Informationen erscheinen hier.' : 'Select an amiibo file. Its image, series and information appear here.' }}</p></div>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import catalogue from '../data/catalogue.json';
import {figureId,publicFigureImage} from '../lib/figure-info.js';
const props=defineProps({selection:Object,locale:{type:String,default:'de_DE'},blocked:Boolean});
defineEmits(['download','properties']);
const de=computed(()=>props.locale.startsWith('de'));
const entry=computed(()=>{const id=figureId(props.selection?.id);return id?catalogue.entries.find(item=>item.id===id):null;});
const imageUrl=computed(()=>entry.value?publicFigureImage(entry.value.id):null);
const failed=ref(false);
watch(()=>props.selection,()=>{failed.value=false;},{flush:'sync'});
function imageError(event){if(event.target?.getAttribute?.('src')===imageUrl.value)failed.value=true;}
</script>
<style scoped>
.selection-preview{padding:22px 18px;color:#27323a;overflow-wrap:anywhere}.preview-eyebrow{font-size:10px;letter-spacing:.15em;color:#8a929a;font-weight:700;margin:0 0 20px}.preview-picture{height:190px;display:grid;place-items:center;border-radius:14px;background:#f6f7f8;margin-bottom:20px}.preview-picture img{max-height:175px;max-width:100%;object-fit:contain}.preview-placeholder{font-size:70px;color:#aeb7bf}.selection-preview h3{font-size:18px;line-height:1.35;margin:0 0 7px}.preview-series{font-size:13px;margin:0 0 18px;color:#477365}.selection-preview dl{display:grid;gap:12px;margin:20px 0}.selection-preview dt{font-size:11px;color:#879099;margin-bottom:4px}.selection-preview dd{margin:0;font-size:13px;line-height:1.4}.preview-id{font-family:ui-monospace,monospace;user-select:all}.preview-actions{display:grid;gap:8px}.selection-preview button{min-height:38px;border:1px solid #dbe0e4;border-radius:7px;background:white;color:#34434e;padding:8px;cursor:pointer;font:inherit;font-size:12px}.selection-preview button:disabled{opacity:.5;cursor:default}.preview-caption{font-size:10px;line-height:1.6;color:#8a929a;margin:16px 0 0}.preview-empty{text-align:center;padding:50px 0}.preview-empty>span{font-size:50px;color:#bbc3ca}.preview-empty h3{font-size:15px;margin-top:20px}.preview-empty p{font-size:12px;line-height:1.6;color:#89939c}.preview-warning{font-size:12px;line-height:1.5;color:#916133}
</style>
