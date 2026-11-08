<template>
  <section class="collection-assistant" aria-labelledby="collection-assistant-title">
    <header><div><p class="eyebrow">{{ de ? 'ENTDECKEN · VERGLEICHEN · ERGÄNZEN' : 'DISCOVER · COMPARE · ADD' }}</p><h2 id="collection-assistant-title">{{ de ? 'Deine Figurensammlung' : 'Your figure collection' }}</h2></div><span class="badge">{{ entries.length }} {{ de ? 'Katalog-IDs' : 'catalogue IDs' }}</span></header>
    <p class="intro">{{ de ? 'Neue Figuren nachschlagen, den Gerätebestand prüfen und passende Dateien direkt übernehmen.' : 'Look for new figures, check your device collection and transfer matching files.' }}</p>
    <p class="orange-help"><strong>{{ de ? 'Was bedeutet Orange?' : 'What does orange mean?' }}</strong>
      {{ de ? 'Der Katalog hat eine Datei zu dieser Figur gefunden. Orange kann bedeuten, dass die Figuren-ID in den Eigenschaften vom Dateiinhalt abweicht oder dass ein Format nur teilweise geprüft werden kann. Den Grund siehst du auf der orange umrandeten Figurenkarte.' : 'The catalogue found a file associated with this figure. Orange can mean its properties name a different figure than its contents, or the checker supports only part of its format. Each orange-bordered card shows the reason.' }}</p>
    <div class="action-grid">
      <article class="action-card">
        <span class="step">01</span><h3>{{ de ? 'Neue Figuren' : 'New figures' }}</h3>
        <p>{{ de ? 'Vergleicht den mitgelieferten Katalog mit dem aktuellen AmiiboAPI-Repository auf GitHub.' : 'Compare the bundled catalogue with the current AmiiboAPI repository on GitHub.' }}</p>
        <button type="button" class="primary" :disabled="!!running" @click="checkUpdates">{{ running === 'catalogue' ? (de ? 'Wird geprüft …' : 'Checking …') : (de ? 'Nach neuen Figuren suchen' : 'Check for new figures') }}</button>
        <p v-if="updates" class="result-note" role="status"><strong>{{ updates.counts.added }} {{ de ? 'neu' : 'new' }}</strong> · {{ updates.counts.changed }} {{ de ? 'geänderte Einträge' : 'changed entries' }}<br>{{ de ? 'Geprüft' : 'Checked' }}: {{ localDate(updates.observedAt) }}<br><a :href="updates.source.url" target="_blank" rel="noopener noreferrer">GitHub · {{ updates.source.commit.slice(0, 8) }}</a></p>
        <p class="small">{{ de ? 'Nur auf Klick. Deine Sammlung wird nicht ins Internet übertragen. Neue Metadaten gelten für diese Sitzung; die Firmware wird nicht geändert.' : 'Only on click. Your collection is not sent to the internet. New metadata applies to this session; firmware is unchanged.' }}</p>
      </article>
      <article class="action-card">
        <span class="step">02</span><h3>{{ de ? 'Bestand prüfen' : 'Check collection' }}</h3>
        <label>{{ de ? 'Umfang' : 'Scope' }}<select v-model="scope" :disabled="!!running"><option value="device">{{ de ? 'Ganzes Laufwerk E:' : 'Entire drive E:' }}</option><option value="folder" :disabled="!directory">{{ de ? 'Aktueller Ordner mit Unterordnern' : 'Current folder and subfolders' }}</option></select></label>
        <label>{{ de ? 'Prüfung' : 'Check' }}<select v-model="mode" :disabled="!!running"><option value="full">{{ de ? 'Dateiinhalte prüfen (empfohlen)' : 'Check file contents (recommended)' }}</option><option value="quick">{{ de ? 'Schnellübersicht aus Dateieigenschaften' : 'Quick overview from file properties' }}</option></select></label>
        <button type="button" class="primary" :disabled="!connected || blocked || !!running || scope === 'folder' && !directory" @click="scan">{{ de ? 'Sammlung prüfen' : 'Check collection' }}</button>
        <p v-if="!connected" class="small">{{ de ? 'Allmiibo in der Bluetooth-Dateiübertragung verbinden.' : 'Connect your Allmiibo in Bluetooth file transfer mode.' }}</p>
        <p class="small">{{ de ? 'Die Schnellübersicht liest die Ordnereinträge. Die Inhaltsprüfung liest danach jede passende BIN-Datei über Bluetooth. Bei großen Sammlungen kann das mehrere Minuten dauern.' : 'Quick overview reads the directory entries. The content check then reads each supported BIN file over Bluetooth. Large collections can take several minutes.' }}</p>
      </article>
    </div>
    <div v-if="running" class="activity">
      <div><strong role="status">{{ runningLabel }}</strong>
        <div v-if="running === 'scan' && progress && !scanAborting" class="scan-progress">
          <template v-if="progress.phase === 'reading'">
            <span>{{ progress.filesRead }} / {{ progress.totalToRead }} {{ de ? 'Dateien gelesen' : 'files read' }}</span>
            <progress :value="progress.filesRead" :max="progress.totalToRead" :aria-label="de ? 'Gelesene Dateien' : 'Files read'"></progress>
          </template>
          <span v-else>{{ progress.folders }} {{ de ? 'Ordner gelesen' : 'folders listed' }} · {{ progress.candidates }} {{ de ? 'BIN-Dateien gefunden' : 'BIN files found' }}</span>
          <span>{{ de ? 'Vergangen' : 'Elapsed' }} {{ formatReadDuration(scanElapsed) }}
            <template v-if="scanTime.waiting"> · {{ de ? 'Warte auf das Gerät …' : 'Waiting for the device …' }}</template>
            <template v-else-if="scanTime.remainingSeconds != null"> · {{ de ? 'Noch ca.' : 'About' }} {{ formatReadDuration(scanTime.remainingSeconds) }} {{ de ? '' : 'remaining' }}</template>
            <template v-else-if="progress.phase === 'reading' && progress.filesRead < progress.totalToRead"> · {{ de ? 'Restzeit wird geschätzt …' : 'Estimating time remaining …' }}</template>
          </span>
        </div>
      </div>
      <button type="button" :disabled="running === 'scan' && scanAborting" @click="cancel">{{ de ? 'Abbrechen' : 'Cancel' }}</button>
    </div>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <div v-if="updates?.added.length" class="new-figures"><h3>{{ de ? 'Neu im Online-Katalog' : 'New in the online catalogue' }}</h3><p class="small">{{ de ? 'Neu gegenüber dem mitgelieferten Datenstand, nicht zwingend gerade erschienen.' : 'New compared with the bundled snapshot, not necessarily newly released.' }}</p><ul><li v-for="entry in updates.added.slice(0, 40)" :key="entry.id"><button type="button" :disabled="!!running" @click="choose(entry)"><strong>{{ entry.name }}</strong><span>{{ entry.series }} · {{ dateLabel(entry) }}</span></button></li></ul><p v-if="updates.added.length > 40">{{ de ? 'Weitere Einträge stehen im Katalog unten.' : 'More entries are available in the catalogue below.' }}</p></div>
    <section v-if="report" class="audit-results" aria-labelledby="audit-results-title">
      <h3 id="audit-results-title">{{ de ? 'Ergebnis des Sammlungsabgleichs' : 'Collection check results' }}</h3>
      <p class="small">{{ report.rootPath || (scope === 'device' ? 'E:/' : directory) }} · {{ localDate(reportTime) }} · {{ report.mode === 'quick' ? (de ? 'Schnellübersicht' : 'Quick overview') : (de ? 'Dateiinhalte gelesen' : 'File contents read') }}</p>
      <p v-if="stale" class="notice error">{{ de ? 'Seit dieser Prüfung wurde ein weiterer Schreib- oder Wiederherstellungsvorgang gestartet. Bitte den Bestand erneut prüfen.' : 'Another write or restore operation was started after this check. Please check the collection again.' }}</p>
      <p v-else-if="!report.scanComplete" class="notice error">{{ de ? 'Prüfung unvollständig. Der übrige Bestand ist noch nicht bestimmbar.' : 'Incomplete check. The remaining collection cannot yet be determined.' }}</p>
      <p v-else class="notice">{{ report.mode === 'quick' ? (de ? 'Verzeichnisse gelesen. Die angezeigten IDs stammen aus Eigenschaften, nicht aus geprüften Dateien.' : 'Directories read. Displayed IDs come from properties, not verified files.') : (de ? 'Bestand vollständig durchlaufen. Auffällige Dateien und nicht gefundene Figuren stehen unten.' : 'Finished traversing the collection. Files needing attention and figures not found are listed below.') }}</p>
      <div v-if="report.mode === 'quick'" class="notice" role="status">
        <p v-if="report.stats?.metadataMissing">{{ report.stats.metadataMissing }} {{ de ? 'Dateien ohne Figuren-ID in Eigenschaften; Inhaltsprüfung nötig.' : 'files without a figure ID in their properties; a content check is needed.' }}</p>
        <p>{{ de ? 'Eigenschaften-ID vorhanden' : 'Properties contain an ID' }}: {{ report.stats?.candidateMetadataCount || 0 }} / {{ report.stats?.candidates || 0 }} {{ de ? 'BIN-Dateien. Ohne ID bleibt die Katalogkarte neutral; das bedeutet nicht, dass die Figur fehlt.' : 'BIN files. Without an ID the catalogue card stays neutral; this does not mean the figure is missing.' }}</p>
        <button type="button" :disabled="!connected || blocked || !!running || scope === 'folder' && !directory" @click="scanContents">{{ de ? 'Dateiinhalte im gewählten Bereich prüfen' : 'Check file contents in the selected scope' }}</button>
        <p class="small">{{ de ? 'Gewählter Bereich' : 'Selected scope' }}: {{ scope === 'device' ? 'E:/' : directory }}</p>
      </div>
      <div class="summary-grid"><div><strong>{{ report.present.length }}</strong><span>{{ de ? 'Figuren-IDs gefunden' : 'Figure IDs found' }}</span></div><div><strong>{{ report.contentComplete ? report.missing.length : (report.unconfirmed?.length || 0) }}</strong><span>{{ report.contentComplete ? (de ? 'Keine passende Datei im geprüften Bereich gefunden' : 'No matching file found in the checked scope') : (de ? 'Bestand nicht bestimmbar' : 'Presence undetermined') }}</span></div><div><strong>{{ issues.length }}</strong><span>{{ de ? 'Dateien zur Prüfung' : 'Files to inspect' }}</span></div><div><strong>{{ report.duplicates.length }}</strong><span>{{ de ? 'Mehrfach vorhanden' : 'Multiple copies' }}</span></div></div>
      <div class="report-toolbar"><label>{{ de ? 'Anzeigen' : 'Show' }}<select v-model="filter" @change="resultPage = 1"><option v-if="report.contentComplete" value="missing">{{ de ? 'Nicht gefunden im geprüften Bereich' : 'Not found in the checked scope' }}</option><option v-else value="unconfirmed">{{ de ? 'Bestand nicht bestimmbar' : 'Presence undetermined' }}</option><option value="issues">{{ de ? 'Dateien zur Prüfung' : 'Files to inspect' }}</option><option value="duplicates">{{ de ? 'Gleiche Figuren-ID / Dateiinhalte' : 'Same figure ID / file contents' }}</option><option value="present">{{ de ? 'Gefunden' : 'Found' }}</option><option value="upcoming">{{ de ? 'Angekündigt' : 'Upcoming' }}</option><option value="unknown">{{ de ? 'Unbekannte IDs' : 'Unknown IDs' }}</option></select></label>
        <button type="button" :disabled="!!running" @click="saveReport()">{{ de ? 'Prüfbericht speichern' : 'Save report' }}</button>
        <button type="button" :disabled="!canExportCsv" @click="saveReport('csv')">{{ de ? 'Bestand als CSV speichern' : 'Save collection as CSV' }}</button>
      </div>
      <p v-if="!resultRows.length" class="empty">{{ de ? 'Keine Einträge in dieser Ansicht.' : 'No entries in this view.' }}</p>
      <ul class="report-list"><li v-for="(row, index) in shownRows" :key="row.path || row.id || index"><div><strong>{{ rowName(row) }}</strong><span v-if="row.id"><code>{{ row.id }}</code></span><span v-if="row.path" class="path">{{ row.path }}</span><span v-if="row.paths && (filter !== 'duplicates' || !row.contentGroups?.length)" class="path">{{ row.paths.join(' · ') }}</span><template v-if="filter === 'duplicates'">
        <small>{{ row.byteComparison === 'sha256-observed-files' ? (de ? 'Dateiinhalte verglichen (SHA-256)' : 'File contents compared (SHA-256)') : (de ? 'Nur gleiche Figuren-ID; Dateiinhalte nicht verglichen.' : 'Same figure ID only; file contents not compared.') }}</small>
        <small v-for="group in row.contentGroups || []" :key="group.sha256">{{ group.paths.length > 1 ? (de ? 'Gleicher Dateiinhalt' : 'Same file contents') : (de ? 'Abweichender Dateiinhalt' : 'Different file contents') }}: {{ group.paths.join(' · ') }}</small>
        <small>{{ de ? 'UID, Spielstand oder Fahrzeugvariante können verschieden sein. Keine automatische Löschung; Dateieigenschaften werden hier nicht auf Gleichheit geprüft.' : 'UID, game data or vehicle variant may differ. No automatic deletion; file properties are not compared for equality here.' }}</small>
      </template><small v-if="row.formatContext">{{ row.size }} Bytes · {{ formatLabel(row.formatContext) }}</small><small v-if="row.issues?.length">{{ row.issues.map(issueLabel).join(' · ') }}</small><small v-if="row.status">{{ statusLabel(row.status) }}</small><small v-if="filter === 'upcoming'">{{ dateLabel(row.entry || row.figure || row) }}</small></div><button v-if="entryFor(row.id)" type="button" :disabled="!!running" @click="choose(entryFor(row.id))">{{ de ? 'Figur auswählen' : 'Select figure' }}</button></li></ul>
      <nav v-if="resultRows.length > 30" class="pagination"><button type="button" :disabled="resultPage <= 1" @click="resultPage--">{{ de ? 'Zurück' : 'Previous' }}</button><span>{{ resultPage }} / {{ Math.ceil(resultRows.length / 30) }}</span><button type="button" :disabled="resultPage >= Math.ceil(resultRows.length / 30)" @click="resultPage++">{{ de ? 'Weiter' : 'Next' }}</button></nav>
      <p class="small">{{ report.contentComplete ? (de ? '„Nicht gefunden“ bezieht sich auf den geprüften Bereich und diesen Katalog.' : '“Not found” refers to the checked scope and this catalogue.') : (de ? '„Bestand nicht bestimmbar“ ist kein Nachweis für fehlende Figuren.' : '“Presence undetermined” is not evidence of missing figures.') }} {{ de ? 'Die Strukturprüfung prüft Größe, ID und einfache Headermerkmale; keine HMAC-/Signaturprüfung und keine Garantie für ein Spiel. Zusatzdateien und unbekannte IDs werden nicht gelöscht.' : 'Structural checks cover size, ID and basic header fields; no HMAC/signature verification or game guarantee. Additional files and unknown IDs are not deleted.' }}</p>
    </section>
    <section ref="transferArea" class="figure-import" tabindex="-1" aria-labelledby="figure-import-title">
      <span class="step">03</span><h3 id="figure-import-title">{{ de ? 'Figurendatei übernehmen' : 'Import figure file' }}</h3>
      <p>{{ de ? 'Eine Figur auswählen, ihre eigene BIN-Datei öffnen oder einen direkten HTTPS-Link laden. Danach speichern oder geprüft auf das Allmiibo übertragen.' : 'Select a figure, open its own BIN file or load a direct HTTPS link. Then save it or transfer the verified bytes to your Allmiibo.' }}</p>
      <div class="import-fields"><label>{{ de ? 'Figur suchen' : 'Find figure' }}<input v-model="figureQuery" type="search" maxlength="100" :disabled="!!running" :placeholder="de ? 'Name oder Figuren-ID' : 'Name or figure ID'"></label><label>{{ de ? 'Ausgewählte Figur' : 'Selected figure' }}<select :value="chosen?.id || ''" :disabled="!!running" @change="chooseById($event.target.value)"><option value="">{{ de ? 'Bitte auswählen' : 'Please select' }}</option><option v-for="entry in choices" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ entry.series }} · {{ entry.id }}</option></select></label></div>
      <p v-if="chosen" class="chosen"><strong>{{ chosen.name }}</strong> · {{ chosen.series }}<br><code>{{ chosen.id }}</code></p>
      <div class="import-fields"><label>{{ de ? 'Eigene BIN-Datei' : 'Own BIN file' }}<input type="file" accept=".bin" :disabled="!chosen || !!running" @change="prepareLocal"></label><div><label>{{ de ? 'Oder direkter HTTPS-Downloadlink' : 'Or direct HTTPS download link' }}<input v-model="sourceUrl" type="url" placeholder="https://…/figur.bin" maxlength="2048" :disabled="!chosen || !!running" @input="clearPrepared"></label><button type="button" :disabled="!chosen || !sourceUrl || !!running" @click="prepareRemote">{{ de ? 'Datei laden und prüfen' : 'Load and inspect file' }}</button></div></div>
      <p class="small">{{ de ? 'Katalogdaten und Bilder sind keine spielfertigen BIN-Dateien. Es ist kein allgemeiner Dump-Server hinterlegt. Ein externer Link muss den Browserzugriff erlauben (CORS); wir senden keine Geräte- oder Kontodaten mit.' : 'Catalogue metadata and images are not playable BIN files. No general dump server is configured. External links must allow browser access (CORS); no device or account data is sent.' }}</p>
      <div v-if="prepared" class="prepared"><strong>{{ de ? 'ID stimmt überein · Grundstruktur unauffällig' : 'ID matches · basic structure consistent' }}</strong><p>{{ prepared.size }} Bytes · SHA-256 <code>{{ prepared.sha256 }}</code></p><p class="small">{{ de ? 'Kryptografie und Spielunterstützung wurden nicht geprüft.' : 'Cryptography and game support were not verified.' }}</p><label>{{ de ? 'Dateiname' : 'Filename' }}<input v-model="filename" maxlength="50" :disabled="!!running"></label><label>{{ de ? 'Zielordner auf dem Gerät' : 'Destination folder on device' }}<input v-model="destination" :disabled="!!running" placeholder="E:/"><small>{{ de ? 'Vorhandenen Ordner verwenden, zum Beispiel E:/ oder einen eigenen Figurenordner.' : 'Use an existing folder, such as E:/ or your figure folder.' }}</small></label><div class="import-actions"><button type="button" :disabled="!!running" @click="savePrepared">{{ de ? 'BIN herunterladen' : 'Download BIN' }}</button><button type="button" class="primary" :disabled="!connected || blocked || !!running" @click="upload">{{ de ? 'Auf Gerät übertragen' : 'Transfer to device' }}</button></div><p class="small">{{ de ? 'Neue Datei; vorhandene Namen werden nicht überschrieben. Die Übertragung wird per SHA-256 nachgelesen.' : 'New file; existing names are not overwritten. Transferred bytes are read back and verified with SHA-256.' }}</p></div>
    </section>
  </section>
</template>
<script>
import baseline from '../data/catalogue.json';
import { checkCatalogueUpdates } from '../lib/catalogue-updates.js';
import { auditCollection } from '../lib/collection-audit.js';
import { formatReadDuration, readTimeEstimate } from '../lib/read-time-estimate.js';
import { prepareFigureTransfer, transferFigureToDevice, suggestedFigureFilename } from '../lib/figure-transfer.js';
import { observeFigureDownloadLink, readFigureDownloadLink } from '../lib/figure-download-links.js';
import { filterCatalogue, releaseLabel } from '../lib/catalogue.js';
import { collectionCsv } from '../lib/collection-csv.js';
import { saveBlob, saveBlobWithPicker } from '../lib/browser-tools.js';
export default {
  props:{connected:Boolean,blocked:Boolean,generation:Number,revision:Number,directory:String,locale:{type:String,default:'de_DE'},getSession:Function,getTransferSession:Function,selectedFigure:Object,readClock:{type:Number,default:0}},
  emits:['busy','writing','catalogue','changed','recovery','report','report-stale'],
  data(){return {entries:baseline.entries,updates:null,running:'',progress:null,scanStartedAt:0,scanAborting:false,error:'',message:'',scope:'device',mode:'full',report:null,reportTime:'',stale:false,filter:'missing',resultPage:1,figureQuery:'',chosen:null,sourceUrl:'',prepared:null,filename:'',destination:'E:/'};},
  computed:{
    de(){return this.locale.startsWith('de');},
    canExportCsv() {
      return this.connected && !this.running && !this.blocked && !this.stale &&
        this.report?.status === 'complete' && this.report.complete && this.report.scanComplete;
    },
    canRefreshSourceUrl() { return !this.running && !this.prepared; },
    runningLabel(){
      if(this.running === 'scan'){
        if(this.scanAborting) return this.de ? 'Prüfung wird abgebrochen …' : 'Cancelling check …';
        if(this.progress?.phase === 'reading') return this.de ? 'Dateiinhalte werden geprüft …' : 'Checking file contents …';
        return this.de ? 'Ordner werden eingelesen …' : 'Listing folders …';
      }
      const texts={catalogue:['Online-Katalog wird geprüft …','Checking online catalogue …'],prepare:['Figurendatei wird gelesen …','Reading figure file …'],upload:['Übertragen und nachlesen …','Transferring and reading back …']};return texts[this.running]?.[this.de?0:1]||'';
    },
    scanNow(){return Math.max(this.readClock, this.progress?.updatedAt ?? this.scanStartedAt);},
    scanElapsed(){return Math.floor((this.scanNow - this.scanStartedAt) / 1000);},
    scanTime(){return readTimeEstimate({startedAt:this.progress.phaseStartedAt, updatedAt:this.progress.updatedAt, completed:this.progress.filesRead, total:this.progress.totalToRead}, this.scanNow);},
    choices(){const items=filterCatalogue(this.entries,{query:this.figureQuery}).slice(0,60);return this.chosen&&!items.some(e=>e.id===this.chosen.id)?[this.chosen,...items]:items;},
    issues(){return this.report?.files?.filter(row=>row.issues?.length || row.id && row.metadataId && row.id!==row.metadataId || ['classic-without-final-eight-bytes','classic-with-unverified-extra-bytes','two-kib-layout-not-fully-validated'].includes(row.formatContext) || !['structure-consistent','metadata-only','skipped-non-tag'].includes(row.status)).map(row=>row.id && row.metadataId && row.id!==row.metadataId?{...row,issues:[...row.issues,'metadata-id-mismatch']}:row)||[];},
    resultRows(){return this.filter==='issues'?this.issues:this.report?.[this.filter]||[];},
    shownRows(){return this.resultRows.slice((this.resultPage-1)*30,this.resultPage*30);}
  },
  created(){this._serial=0;this._alive=true;},
  mounted() { this._stopLinkUpdates = observeFigureDownloadLink(() => this.chosen?.id, this.refreshSourceUrl); },
  beforeUnmount(){this._stopLinkUpdates?.();this._alive=false;this.invalidate();},
  watch:{report(value){this.$emit('report',value);},stale(value){this.$emit('report-stale',value);},generation(){this.invalidate();},connected(value){if(!value)this.invalidate();},revision(){if(this.report)this.stale=true;},
    selectedFigure: { immediate: true, handler(value) {
      if (value && value.id === this.chosen?.id && value.id === this.prepared?.id) return;
      this.choose(value, false);
    } },
    canRefreshSourceUrl(ready) { if (ready) this.refreshSourceUrl(); }
  },
  methods:{
    formatReadDuration,
    localDate(value){return value?new Date(value).toLocaleString(this.de?'de-DE':'en-GB'):'';},
    entryFor(id){return this.entries.find(e=>e.id===id);},
    rowName(row){return row.name||row.entry?.name||row.figure?.name||this.entryFor(row.id)?.name||row.path||row.id||(this.de?'Unbekannter Eintrag':'Unknown entry');},
    dateLabel(entry){if(entry.releaseDate)return entry.releaseDate;const label=releaseLabel(entry,new Date().toISOString().slice(0,10));return (label.date||'—')+(label.state==='upcoming'?(this.de?' · angekündigt':' · upcoming'):'');},
    issueLabel(issue){const texts={manufacturer:['Herstellerkennung','Manufacturer byte'],bcc0:['Erstes UID-Prüfbyte','First UID check byte'],bcc1:['Zweites UID-Prüfbyte','Second UID check byte'],'missing-id':['ID fehlt','Missing ID'],'v3-length':['V3-Größe passt nicht','V3 size mismatch'],'metadata-id-mismatch':['Abweichende Eigenschaften-ID','Metadata ID differs']};return texts[issue]?.[this.de?0:1]||issue;},
    formatLabel(context){if(context==='two-kib-layout-not-fully-validated'&&this.report?.mode==='quick')return this.de?'2-KiB-Datei laut Verzeichnis; Inhalt und Layout ungeprüft':'2 KiB file according to directory; contents and layout unchecked';const labels={'classic-without-final-eight-bytes':['Verkürzter klassischer Dump: letzte 8 Bytes nicht enthalten','Short classic dump: final 8 bytes not included'],'classic-540':['Klassische 540-Byte-Darstellung; Kryptografie ungeprüft','Classic 540-byte representation; cryptography unchecked'],'classic-with-unverified-extra-bytes':['Klassischer Dump mit ungeprüftem Zusatzbereich','Classic dump with unchecked extra data'],'two-kib-layout-not-fully-validated':['2-KiB-Datei: Größe und öffentliche ID geprüft; übriges Layout nicht vollständig geprüft','2 KiB file: size and public ID checked; remaining layout not fully checked'],'unsupported-length':['Dateigröße nicht als Figurenformat geprüft','File size not checked as a figure format']};return labels[context]?.[this.de?0:1]||context;},
    statusLabel(status){const texts={'not-read':['Inhalt noch nicht gelesen','Contents not yet read'],'not-read-limit':['Lesegrenze erreicht','Read limit reached'],'unsupported-length':['Andere Dateigröße – nicht als Figur geprüft','Other file size – not inspected as a figure'],attention:['Grundstruktur auffällig','Basic structure needs attention'],'read-error':['Lesefehler','Read error'],'structure-consistent':['Grundstruktur unauffällig','Basic structure consistent'],'metadata-only':['Nur Eigenschaften gelesen','Properties only']};return texts[status]?.[this.de?0:1]||status;},
    setError(message, fromDevice = false) {
      this.error = message;
      this._errorFromDevice = fromDevice;
    },
    invalidate() {
      ++this._serial;
      this._controller?.abort();
      this._controller = null;
      this.running = '';
      this.progress = null;
      this.report = null;
      this.stale = false;
      this.message = '';
      if (this._errorFromDevice) this.setError('');
      this.$emit('busy', false);
      this.$emit('writing', false);
    },
    cancel(){if(this.running === 'scan')this.scanAborting = true;this._controller?.abort();},
    clearPrepared(){this.prepared=null;this.message='';},
    refreshSourceUrl() {
      if (!this.chosen || !this.canRefreshSourceUrl) return;
      const saved = readFigureDownloadLink(this.chosen.id);
      if (this.sourceUrl === this._lastSavedSourceUrl) this.sourceUrl = saved;
      this._lastSavedSourceUrl = saved;
    },
    chooseById(id){this.choose(this.entryFor(id),false);},
    choose(entry, focus = true) {
      if (this.running) return;
      this.chosen = entry || null;
      this.sourceUrl = readFigureDownloadLink(entry?.id);
      this._lastSavedSourceUrl = this.sourceUrl;
      this.clearPrepared();
      this.setError('');
      this.filename = entry ? suggestedFigureFilename(entry) : '';
      if (focus) this.$nextTick(() => this.$refs.transferArea?.focus());
    },
    async operation(kind,fn,recoveryOrigin=null){
      if(this.running)return;const serial=++this._serial,generation=this.generation,controller=new AbortController();
      const device=kind==='scan'||kind==='upload';const current=()=>this._alive&&this._serial===serial&&(!device||generation===this.generation&&this.connected);
      this._controller=controller;this.running=kind;this.setError('');this.message='';this.progress=null;if(device)this.$emit('busy',true);if(kind==='upload')this.$emit('writing',true);
      try{return await fn(controller.signal,current);}catch(error){
        // Preserve old-session recovery evidence without changing the new session's UI or locks.
        if(device&&this._alive&&(current()||kind==='upload'&&error?.recovery))this.$emit('recovery',recoveryOrigin?{...error,recoveryOrigin:Object.freeze({...recoveryOrigin})}:error);
        if (current()) {
          const message = error?.name === 'AbortError'
            ? (this.de ? 'Vorgang abgebrochen.' : 'Operation cancelled.')
            : (error?.message || String(error));
          this.setError(message, device);
        }
      }
      finally{if(current()){this.running='';this._controller=null;this.progress=null;if(device)this.$emit('busy',false);if(kind==='upload')this.$emit('writing',false);}}
    },
    async checkUpdates(){await this.operation('catalogue',async(signal,current)=>{const result=await checkCatalogueUpdates({baseline,signal});if(current()){this.updates=result;this.entries=result.entries;this.report=null;this.$emit('catalogue',result);if(this.chosen)this.chosen=this.entryFor(this.chosen.id)||this.chosen;}});},
    async scanContents(){if(!this.connected||this.blocked||this.running||this.scope==='folder'&&!this.directory)return;this.mode='full';await this.scan();},
    async scan(){
      if(!this.connected || this.blocked || this.running || this.scope === 'folder' && !this.directory)return;
      this.report=null;this.stale=false;this.scanAborting=false;
      this.scanStartedAt=performance.now();
      await this.operation('scan',async(signal,current)=>{
        const result=await auditCollection({rootPath:this.scope==='device'?'E:/':this.directory,catalogue:this.entries,mode:this.mode,...this.getSession(),signal,
          onProgress:stats=>{
            if(!current() || signal.aborted || stats.phase === 'finished')return;
            const updatedAt=performance.now();
            const phaseStartedAt=this.progress?.phase === stats.phase ? this.progress.phaseStartedAt : updatedAt;
            this.progress={...stats,phaseStartedAt,updatedAt};
          }});
        if(current()){this.report=result;this.reportTime=new Date().toISOString();this.resultPage=1;this.filter=result.contentComplete?'missing':'unconfirmed';}
      });
    },
    async prepareLocal(event){const file=event.target.files?.[0];event.target.value='';if(file&&this.chosen)await this.prepare({file});},
    async prepareRemote(){if(this.sourceUrl&&this.chosen)await this.prepare({url:this.sourceUrl});},
    setPrepared(result) {
      this.prepared = result;
      this.filename = suggestedFigureFilename(this.chosen);
      this.destination = this.directory?.startsWith('E:/') ? this.directory : 'E:/';
    },
    acceptCheckedFigure(result) {
      if (this.running || this.blocked || result?.source?.kind !== 'local') return false;
      const entry = this.entryFor(result.id);
      if (!entry) return false;
      this.choose(entry);
      this.setPrepared(result);
      return true;
    },
    async prepare(source) {
      if (this.running) return;
      this.prepared = null;
      const id = this.chosen?.id;
      if (!id) return;
      await this.operation('prepare', async (signal, current) => {
        const result = await prepareFigureTransfer({ ...source, expectedId: id, signal });
        if (current() && this.chosen?.id === id) this.setPrepared(result);
      });
    },
    async savePrepared(){if(!this.prepared||this.running)return;const blob=new Blob([this.prepared.bytes],{type:'application/octet-stream'}),name=this.filename||suggestedFigureFilename(this.chosen);try{const result=await saveBlobWithPicker(blob,name);if(result.status==='unsupported')saveBlob(blob,name);}catch(error){this.setError(error.message);}},
    async saveReport(format = 'json') {
      const csv = format === 'csv';
      if (this.running || !this.report || (csv && !this.canExportCsv)) return;
      const name = csv ? (this.de ? 'Allmiibo-Figurenbestand.csv' : 'Allmiibo-Collection.csv') : 'Allmiibo-Sammlungspruefung.json';
      try {
        const content = csv ? collectionCsv(this.report, this.locale) : JSON.stringify({
          schema: 1, checkedAt: this.reportTime, changedSinceCheck: this.stale, report: this.report,
        }, null, 2);
        const blob = new Blob([content], { type: csv ? 'text/csv;charset=utf-8' : 'application/json' });
        const result = await saveBlobWithPicker(blob, name);
        if (result.status === 'unsupported') saveBlob(blob, name);
      } catch (error) { this.setError(error.message); }
    },
    async upload(){
      if(!this.connected||this.blocked||this.running||!this.prepared)return;
      const generation=this.generation,recoveryOrigin={sessionGeneration:generation,deviceKey:null};
      this.stale=!!this.report;let receipt;
      await this.operation('upload',async(signal,current)=>{
        const adapter=this.getTransferSession();
        recoveryOrigin.deviceKey=typeof adapter.recoveryOrigin?.deviceKey==='string'?adapter.recoveryOrigin.deviceKey:null;
        receipt=await transferFigureToDevice({prepared:this.prepared,parentPath:this.destination,filename:this.filename,adapter,signal,onProgress:()=>{}});
        if(this._alive&&(current()||receipt?.recovery?.committed===null||receipt?.recovery?.restored||(receipt?.recovery?.recoveryFiles||receipt?.recoveryFiles||[]).length))this.$emit('recovery',{...receipt,recoveryOrigin:Object.freeze({...recoveryOrigin})});
        if(current())this.message=this.de?'Datei übertragen und per SHA-256 bestätigt.':'File transferred and verified with SHA-256.';
      },recoveryOrigin);
      if(receipt&&this._alive&&this.connected&&generation===this.generation)this.$emit('changed',receipt);
    }
  }
};
</script>
<style scoped>
/* Keep enlarged text within the existing cards without changing normal layout. */
.collection-assistant { min-width:0; overflow-wrap:anywhere; }
.collection-assistant header { flex-wrap:wrap; }
.collection-assistant header > *, .action-grid > * { min-width:0; }
.collection-assistant .badge { max-width:100%; white-space:normal; box-sizing:border-box; }
.action-card input, .action-card select { min-width:0; width:100%; }
.orange-help{margin:.6rem 0 1rem;padding:.65rem .85rem;border-left:3px solid #c47a16;background:#fffaf1;color:#654112;font-size:.82rem;line-height:1.5}.orange-help strong{display:block}
.scan-progress{display:grid;gap:4px;margin-top:5px;font-variant-numeric:tabular-nums}.scan-progress progress{width:min(100%,18rem);accent-color:#1e656c}
.collection-assistant{color:#193247;padding:22px;background:#f4f8fb;border:1px solid #d4e1ea;border-radius:18px;margin:16px 0}.collection-assistant header{display:flex;align-items:center;justify-content:space-between;gap:12px}.eyebrow{color:#5f788c;letter-spacing:.08em;font-size:.68rem;margin:0 0 7px}.collection-assistant h2{font-size:1.5rem;margin:0}.badge{padding:7px 11px;border-radius:30px;background:white;font-size:.78rem;white-space:nowrap}.intro{font-size:.94rem;line-height:1.6;color:#4b657b}.action-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.action-card,.figure-import{border:1px solid #d4e1ea;border-radius:13px;background:white;padding:19px}.step{font-size:.8rem;font-weight:700;color:#3c7d83}.collection-assistant h3{font-size:1.06rem;margin:7px 0 12px}.action-card p,.figure-import p{font-size:.85rem;line-height:1.55}.small{font-size:.77rem!important;color:#5a7183;line-height:1.55}.collection-assistant label{display:flex;flex-direction:column;gap:6px;font-size:.8rem;margin:11px 0}.collection-assistant input,.collection-assistant select,.collection-assistant button{font:inherit;color:inherit;border:1px solid #afc4d3;border-radius:8px;box-sizing:border-box;min-height:42px;padding:9px 11px;background:white;max-width:100%}.collection-assistant button{cursor:pointer;font-size:.82rem}.collection-assistant button.primary{background:#1e656c;border-color:#1e656c;color:white}.collection-assistant button:disabled{opacity:.5;cursor:default}.collection-assistant button:hover:enabled{filter:brightness(.96)}.collection-assistant :focus-visible{outline:3px solid #79b5d4;outline-offset:3px}.collection-assistant code{font-size:.76rem;overflow-wrap:anywhere}.activity,.notice{background:#e7f1f7;padding:12px;border-radius:9px;margin:14px 0;font-size:.85rem;line-height:1.5}.activity{display:flex;justify-content:space-between;align-items:center;gap:10px}.error{background:#fff2dd;color:#7a4a0c}.new-figures ul,.report-list{list-style:none;padding:0}.new-figures ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.new-figures button{width:100%;text-align:left;display:grid;gap:6px}.new-figures span{font-size:.75rem;color:#597286}.audit-results{border-top:1px solid #d4e1ea;margin:22px 0;padding-top:16px}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.summary-grid>div{background:white;border:1px solid #d4e1ea;border-radius:10px;padding:13px;display:grid;gap:6px}.summary-grid strong{font-size:1.5rem}.summary-grid span{font-size:.74rem;color:#5a7183}.report-toolbar{display:flex;align-items:end;gap:12px;justify-content:space-between;margin-top:12px}.report-toolbar label{flex:1}.report-toolbar button{margin-bottom:11px}.report-list li{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #d4e1ea;padding:13px 0}.report-list li>div{display:grid;gap:5px;min-width:0}.report-list strong{font-size:.86rem}.report-list small,.path{font-size:.76rem;color:#5a7183;overflow-wrap:anywhere}.report-list button{flex-shrink:0}.pagination{display:flex;justify-content:center;align-items:center;gap:12px;font-size:.8rem}.figure-import{margin-top:20px}.import-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.import-fields>*,.import-fields label{min-width:0}.import-actions{display:flex;gap:9px;flex-wrap:wrap}.prepared{background:#eff7f3;border:1px solid #c4dfd0;border-radius:10px;padding:16px;margin-top:16px;font-size:.87rem}.prepared p{overflow-wrap:anywhere}.chosen{padding:12px;background:#f4f8fb;border-radius:8px}.empty{font-size:.84rem;color:#5a7183}.figure-import:focus{outline:3px solid #79b5d4;outline-offset:3px}@media(max-width:700px){.collection-assistant{padding:14px}.action-grid,.import-fields{grid-template-columns:1fr}.summary-grid{grid-template-columns:1fr 1fr}.report-list li{align-items:flex-start;flex-direction:column}.collection-assistant header{align-items:flex-start}.collection-assistant h2{font-size:1.25rem}.badge{font-size:.67rem}.report-toolbar{align-items:stretch;flex-direction:column;gap:0}.report-toolbar button{align-self:flex-start}}
</style>
