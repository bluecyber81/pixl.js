<template>
  <details class="device-search">
    <summary>{{ text.title }}</summary>
    <form @submit.prevent="run" :aria-busy="running">
      <label>{{ text.query }}<input type="search" v-model="query" maxlength="200" :disabled="running" :placeholder="text.placeholder"></label>
      <label>{{ text.scope }}<select v-model="scope" :disabled="running"><option value="folder" :disabled="!directory">{{ text.folder }}</option><option value="device">{{ text.device }}</option></select></label>
      <label class="content-option"><input type="checkbox" v-model="inspectMissingIds" :disabled="running">{{ text.inspectMissing }}</label>
      <button type="submit" :disabled="!connected || blocked || running || readingPreview || !query.trim() || (scope === 'folder' && !directory)">{{ text.search }}</button>
      <button v-if="running" type="button" @click="cancel">{{ text.cancel }}</button>
    </form>
    <p v-if="!inspectMissingIds" class="search-note">{{ text.hint }}</p>
    <p v-if="inspectMissingIds" class="search-note">{{ text.contentHint }}</p>
    <p v-if="status" role="status" aria-live="polite">{{ text[status] }} <span v-if="stats">{{ stats.folders }} {{ text.folders }}, {{ stats.entries }} {{ text.entries }}, {{ stats.matches }} {{ text.matches }}.</span></p>
    <p v-if="stats?.limited || stats?.skipped" class="search-warning">{{ text.limited }}</p>
    <p v-if="stats?.filesRead" class="search-note">{{ stats.filesRead }} {{ text.filesRead }} · {{ stats.bytesRead }} B. {{ text.localOnly }}</p>
    <p v-if="stats?.contentLimited" class="search-warning">{{ text.contentLimited }}</p>
    <ol v-if="results.length" class="search-results">
      <li v-for="result in results" :key="result.path">
        <button type="button" :disabled="!connected || blocked || running || readingPreview"
          :aria-expanded="result.type === 0 ? preview?.path === result.path : undefined"
          @click="result.type === 1 ? navigate(result) : showPreview(result)">
          <strong>{{ result.name }}</strong><span>{{ result.parent }}</span>
          <span v-if="result.figureName">{{ result.figureName }} · {{ result.series }}</span>
          <small>{{ result.type === 1 ? text.openFolder : text.preview }}</small>
        </button>
        <div v-if="preview?.path === result.path" class="result-preview">
          <img v-if="previewImage && !imageFailed" :key="previewImage" :src="previewImage"
            :alt="previewEntry.name" referrerpolicy="no-referrer" @error="onImageError">
          <strong v-if="previewEntry">{{ previewEntry.name }} · {{ previewEntry.series }}</strong>
          <p v-if="preview.id"><code>{{ preview.id }}</code></p>
          <p role="status">{{ imageFailed ? text.imageFailed : text[preview.state] }}</p>
          <button type="button" :disabled="blocked || readingPreview || !connected" @click="navigate(result)">{{ text.showFile }}</button>
        </div>
      </li>
    </ol>
  </details>
</template>
<script>
import { searchDevice } from '../lib/device-search.js';
import { inspectTagStructure, publicFigureImage, TAG_LENGTHS } from '../lib/figure-info.js';
import catalogueBaseline from '../data/catalogue.json';
const copy = {
  de: { title:'Auf dem Gerät suchen', query:'Datei, Figur, Serie oder Notiz', placeholder:'Zum Beispiel Zelda oder Animal Crossing', scope:'Suchbereich', folder:'Aktueller Ordner', device:'Gesamte Sammlung (E:)', search:'Suchen', cancel:'Abbrechen', hint:'Liest nur Ordner und Metadaten. Figurennamen und Serien stammen aus dem lokalen Katalog; ohne gespeicherte Figuren-ID sind nur Dateiname und Notiz durchsuchbar. Keine BIN-Dateien werden heruntergeladen.', searching:'Suche läuft.', done:'Suche abgeschlossen.', cancelled:'Suche abgebrochen. Bisherige Treffer bleiben sichtbar.', failed:'Suche konnte nicht abgeschlossen werden. Verbindung prüfen und erneut suchen.', folders:'Ordner', entries:'Einträge', matches:'Treffer', limited:'Teilergebnis: Suchgrenze erreicht oder ungültige Einträge übersprungen. Suche in einem kleineren Ordner oder mit genauerem Begriff wiederholen.', openFolder:'Ordner öffnen', showFile:'Im Ordner anzeigen' },
  en: { title:'Search on the device', query:'File, figure, series or note', placeholder:'For example Zelda or Animal Crossing', scope:'Search scope', folder:'Current folder', device:'Entire collection (E:)', search:'Search', cancel:'Cancel', hint:'Reads folders and metadata only. Figure names and series come from the local catalogue; without a saved figure ID only filenames and notes are searchable. No BIN files are downloaded.', searching:'Searching.', done:'Search complete.', cancelled:'Search cancelled. Results found so far remain visible.', failed:'Search could not finish. Check the connection and search again.', folders:'folders', entries:'entries', matches:'matches', limited:'Partial result: a search limit was reached or invalid entries were skipped. Search a smaller folder or use a more precise query.', openFolder:'Open folder', showFile:'Show in folder' }
};
Object.assign(copy.de, {
  preview:'Figurenvorschau', metadata:'ID aus den Dateieigenschaften.', content:'ID aus dem Dateiinhalt.',
  reading:'Figur wird gelesen …', unknown:'Kein passendes Figurenbild im Katalog.', unavailable:'Keine Figurenvorschau für diese Datei.',
  invalid:'Die Dateistruktur ist auffällig.', readError:'Lesen fehlgeschlagen. Zum Wiederholen den Treffer erneut öffnen.',
  imageFailed:'Das Figurenbild konnte nicht geladen werden.',
  inspectMissing:'Figuren auch ohne gespeicherte ID finden',
  contentHint:'Zusätzlich kleine BIN-Dateien ohne gültige Metadaten-ID lesen, wenn Dateiname und Notiz nicht ausreichen. Höchstens 128 Dateien / 256 KiB pro Suche, nacheinander. Das kann länger dauern. Die Dateien auf dem Gerät bleiben unverändert.',
  filesRead:'BIN-Dateien gelesen', localOnly:'Nur lokale Katalogzuordnung; keine Inhalte gespeichert oder ins Internet übertragen. Keine NFC-Funktions- oder Signaturprüfung.',
  contentLimited:'Inhaltsgrenze erreicht. Metadaten wurden weiter durchsucht. Für weitere Dateien einen kleineren Ordner wählen.',
  catalogueChanged:'Katalog aktualisiert. Bitte die Suche erneut starten.',
});
Object.assign(copy.en, {
  preview:'Figure preview', metadata:'ID from file properties.', content:'ID from file contents.',
  reading:'Reading figure…', unknown:'No matching figure image in the catalogue.', unavailable:'No figure preview for this file.',
  invalid:'The file structure needs attention.', readError:'Could not read the file. Reopen this result to retry.',
  imageFailed:'Could not load the figure image.',
  inspectMissing:'Find figures without a saved ID',
  contentHint:'Also read small BIN files without a valid metadata ID when filenames and notes are insufficient. At most 128 files / 256 KiB per search, one at a time. This can take longer. Files on the device remain unchanged.',
  filesRead:'BIN files read', localOnly:'Local catalogue lookup only; no file contents saved or sent to the internet. No NFC operation or signature verification.',
  contentLimited:'Content budget reached. Metadata search continued. Choose a smaller folder to search more files.',
  catalogueChanged:'Catalogue updated. Please start the search again.',
});
export default {
  props: { connected:Boolean, blocked:Boolean, generation:Number, directory:String, locale:{type:String,default:'de_DE'}, catalogue:Object, getSession:Function }, emits:['busy','navigate'],
  data(){return {query:'',scope:'device',inspectMissingIds:false,running:false,status:'',stats:null,results:[],preview:null,readingPreview:false,imageFailed:false};},
  computed:{text(){return copy[this.locale.startsWith('de')?'de':'en'];},catalogueData(){return Array.isArray(this.catalogue?.entries)?this.catalogue:catalogueBaseline;},
    previewEntry(){return this.preview?.id && this.catalogueData.entries.find(item=>item.id===this.preview.id);},
    previewImage(){return this.previewEntry ? publicFigureImage(this.previewEntry.id,this.catalogueData.commit) : null;}
  },
  created(){this._serial=0;this._alive=true;},
  beforeUnmount(){this._alive=false;this.invalidate();},
  watch:{generation(){this.invalidate();},connected(value){if(!value)this.invalidate();},directory(){if(this.scope==='folder')this.invalidate();},catalogue(){this._controller?.abort();this.preview=null;this.results=[];this.stats=null;this.status=this.running?'catalogueChanged':'';}},
  methods:{
    invalidate(){++this._serial;this._controller?.abort();this._controller=null;this.running=false;this.readingPreview=false;this.preview=null;this.status='';this.stats=null;this.results=[];this.$emit('busy',false);},
    onImageError(event){if(event.target?.getAttribute('src')===this.previewImage)this.imageFailed=true;},
    async showPreview(result){
      if(!this.connected || this.blocked || this.running || this.readingPreview || !this.results.includes(result))return;
      this.imageFailed=false;
      if(this.preview?.path===result.path){this.preview=null;return;}
      const path=result.path;
      if(result.id){
        this.preview={path,id:result.id,state:result.figureName?(result.idFromContent?'content':'metadata'):'unknown'};
        return;
      }
      if(!/\.bin$/i.test(result.name) || !TAG_LENGTHS.includes(result.size)){
        this.preview={path,state:'unavailable'};return;
      }
      const generation=this.generation, serial=this._serial;
      this.preview={path,state:'reading'};this.readingPreview=true;this.$emit('busy',true);
      try{
        const session=this.getSession();
        const bytes=await session.readFile(path,{maxBytes:result.size});
        session.assertSession?.();
        if(serial!==this._serial || generation!==this.generation || !this.results.includes(result))return;
        if(bytes?.byteLength!==result.size)throw new Error('File size changed');
        const inspection=inspectTagStructure(bytes);
        if(inspection.status!=='structure-consistent'){this.preview={path,state:'invalid'};return;}
        this.preview={path,id:inspection.id,state:this.catalogueData.entries.some(item=>item.id===inspection.id)?'content':'unknown'};
      }catch{
        if(serial===this._serial && this.results.includes(result))this.preview={path,state:'readError'};
      }finally{
        if(serial===this._serial){this.readingPreview=false;this.$emit('busy',false);}
      }
    },
    cancel(){this._controller?.abort();},
    navigate(result){if(this.connected&&!this.blocked&&!this.running&&!this.readingPreview&&this.results.includes(result))this.$emit('navigate',{...result,generation:this.generation});},
    async run(){
      if(!this.connected||this.blocked||this.running||this.readingPreview||!this.query.trim()||(this.scope==='folder'&&!this.directory))return;
      this.preview=null;
      const serial=++this._serial, generation=this.generation, controller=new AbortController();
      const catalogue=this.catalogueData;
      const sameCatalogue=()=>catalogue===this.catalogueData;
      const current=()=>this._alive&&serial===this._serial&&generation===this.generation&&this.connected;
      this._controller=controller;this.running=true;this.status='searching';this.results=[];this.stats=null;this.$emit('busy',true);
      try{
        const session=this.getSession();
        const result=await searchDevice({rootPath:this.scope==='device'?'E:/':this.directory,recursive:this.scope==='device',query:this.query,
          readDirectory:session.readDirectory,readFile:session.readFile,inspectMissingIds:this.inspectMissingIds,
          assertSession:session.assertSession,catalogue:catalogue.entries,signal:controller.signal,
          onProgress:(stats,results)=>{if(current()&&sameCatalogue()){this.stats=stats;this.results=results;}}});
        if(current()&&sameCatalogue()){this.results=result.results;this.stats=result;this.status='done';}
      }catch(error){if(current())this.status=!sameCatalogue()?'catalogueChanged':controller.signal.aborted?'cancelled':'failed';}
      finally{if(current()){this._controller=null;this.running=false;this.$emit('busy',false);}}
    }
  }
};
</script>
<style scoped>
.device-search{margin:1rem 0;padding:1rem;border:1px solid #c9d7e8;border-radius:12px;background:#f7faff}.device-search summary{cursor:pointer;font-weight:700}.device-search form{display:flex;align-items:end;gap:.7rem;flex-wrap:wrap;margin-top:1rem}.device-search label{display:flex;flex-direction:column;gap:.3rem}.device-search label:first-child{flex:1;min-width:200px}.device-search input,.device-search select,.device-search button{font:inherit;min-height:42px;border-radius:7px;border:1px solid #a7bad2;padding:.5rem .7rem;background:white;color:#203753}.device-search button{cursor:pointer}.device-search button:disabled{opacity:.55;cursor:default}.search-note,.search-warning{font-size:.87rem;line-height:1.5}.search-warning{color:#80501b}.search-results{padding:0;list-style:none;max-height:32rem;overflow:auto}.search-results li+li{margin-top:.5rem}.search-results button{width:100%;text-align:left;display:flex;flex-direction:column;gap:.25rem;overflow-wrap:anywhere}.search-results span,.search-results small{font-size:.85rem;color:#526987}@media(max-width:600px){.device-search form>*{width:100%}.device-search label:first-child{min-width:0}}
</style>
<style scoped>
.device-search .content-option{flex-basis:100%;flex-direction:row;align-items:center;font-size:.85rem;gap:.55rem}
.device-search .content-option input{flex:none;width:18px;height:18px;min-height:18px;padding:0}
.result-preview{border:1px solid #a7bad2;border-top:0;padding:.75rem;background:white;border-radius:0 0 8px 8px;overflow-wrap:anywhere}
.result-preview img{display:block;margin:.25rem auto .6rem;max-height:9rem;max-width:100%;object-fit:contain}
.result-preview p{margin:.4rem 0}.result-preview button{width:auto}
</style>
