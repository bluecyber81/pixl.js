<template>
  <section class="figure-details">
    <header class="figure-heading">
      <div>
        <p class="eyebrow">{{ source === 'metadata' ? (de ? 'Dateieigenschaften · Inhalt ungeprüft' : 'File properties · contents unchecked') : source === 'local' ? (de ? 'Aus Datei gelesen' : 'Read from file') : (de ? 'Figurenkatalog' : 'Figure catalogue') }}</p>
        <h4>{{ entry?.name || (de ? 'Figureninformationen' : 'Figure information') }}</h4>
        <p v-if="entry" class="figure-subtitle">{{ entry.series }} <span aria-hidden="true">·</span> {{ entry.type }}</p>
      </div>
      <span v-if="resolvedId?.endsWith('03')" class="type-badge">V3</span>
    </header>

    <div v-if="inspection" class="structure-status" :class="{ attention: inspection.status !== 'structure-consistent' }" role="status">
      <strong>{{ inspection.status === 'structure-consistent' ? (de ? 'Grundstruktur unauffällig' : 'Basic structure consistent') : (de ? 'Grundstruktur auffällig – Details prüfen' : 'Basic structure needs attention') }}</strong>
      <span>{{ inspection.size }} Bytes · {{ inspection.size === 2048 ? (de ? 'Größe und ID geprüft' : 'Size and ID checked') : (de ? 'Header und ID geprüft' : 'Header and ID checked') }}</span>
      <ul v-if="inspection.issues.length"><li v-for="issue in inspection.issues" :key="issue">{{ structureIssue(issue) }}</li></ul>
    </div>
    <p v-if="inspection" class="brief-limit">{{ de ? 'Strukturprüfung; keine HMAC-/Signaturprüfung oder Spielbestätigung.' : 'Structural check; no HMAC/signature verification or game confirmation.' }}</p>

    <dl class="figure-facts">
      <div class="id-fact"><dt>{{ de ? 'Öffentliche Figuren-ID' : 'Public figure ID' }}</dt><dd><code>{{ resolvedId || '—' }}</code></dd></div>
      <div v-if="entry"><dt>{{ de ? 'Spielserie' : 'Game series' }}</dt><dd>{{ entry.game }}</dd></div>
      <div v-if="vehicles"><dt>{{ de ? 'Mögliches Fahrzeug laut Datei' : 'Possible vehicle from file' }}</dt>
        <dd>{{ vehicles.length ? vehicles.join(de ? ' oder ' : ' or ') : (de ? 'Keine bekannte Zuordnung' : 'No known match') }}</dd>
      </div>
    </dl>
    <p v-if="!entry" class="unknown-note">{{ resolvedId ? (de ? 'ID im Katalog unbekannt. Das allein bedeutet nicht, dass die Figurendatei ungültig ist.' : 'ID not found in the catalogue. This alone does not mean the figure file is invalid.') : (de ? 'Keine öffentliche Figuren-ID verfügbar. Bei Dateieigenschaften kann sie auch einfach fehlen.' : 'No public figure ID is available. File properties may simply omit it.') }}</p>
    <p v-if="vehicles" class="brief-limit">{{ de ? 'Der Hinweis beruht auf Platinencodes untersuchter Fahrzeuge. Mehrere Modelle können denselben Code tragen.' : 'This hint uses board codes from examined vehicles. Multiple models can share a code.' }}
      <a href="https://github.com/mahoudeau/allmiibo-sync/blob/c450790615c93d9795e0347417ad9fb86baa6c04/PROTOCOL.md#vehicle-identity-lives-outside-the-amiibo-id" target="_blank" rel="noopener noreferrer">{{ de ? 'Messungen ansehen' : 'View measurements' }}</a>
    </p>
    <p v-else-if="resolvedId?.endsWith('03')" class="brief-limit">{{ de ? 'Fahrer-ID; die Vollständigkeit einer Fahrzeugkombination ist damit nicht bestätigt.' : 'Rider ID; this does not confirm a complete vehicle combination.' }}</p>

    <div class="figure-actions" v-if="resolvedId">
      <a class="action-link" :href="publicFigureLink(resolvedId)" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">{{ de ? 'Figureninfos öffnen' : 'Open figure information' }}</a>
      <button type="button" :aria-expanded="qrVisible" @click="qrVisible = !qrVisible">{{ qrVisible ? (de ? 'Info-QR-Code ausblenden' : 'Hide information QR code') : (de ? 'Info-QR-Code anzeigen' : 'Show information QR code') }}</button>
    </div>
    <div v-if="entry" class="image-action">
      <button v-if="!imageRequested" type="button" @click="imageRequested = true">{{ de ? 'Bild einmal laden' : 'Load image once' }}</button>
      <button v-else type="button" @click="hideImage">{{ de ? 'Bild ausblenden' : 'Hide image' }}</button>
      <p>{{ de ? 'Externes Bild von GitHub: Abruf erst nach Klick, mit öffentlicher Figuren-ID und deiner IP-Adresse. Keine UID oder Datei.' : 'External GitHub image: requested only after a click, using the public figure ID and your IP address. No UID or file.' }}</p>
    </div>

    <div v-if="imageRequested || qr" class="media-grid">
      <figure v-if="imageRequested" class="media-tile">
        <figcaption>{{ de ? 'Figurenbild' : 'Figure image' }}</figcaption>
        <img v-if="imageUrl && !imageFailed" :key="imageUrl" :src="imageUrl" :alt="entry.name" referrerpolicy="no-referrer" loading="lazy" @error="imageError" />
        <p v-else role="status">{{ de ? 'Bild nicht verfügbar oder durch den Browser blockiert.' : 'Image unavailable or blocked by the browser.' }}</p>
      </figure>
      <figure v-if="qr" class="media-tile qr-tile">
        <figcaption>{{ de ? 'Info-QR-Code' : 'Information QR code' }}</figcaption>
        <img class="info-qr" :src="qr.dataUrl" :style="{ width: qr.size + 'px' }" :width="qr.size" :height="qr.size" :alt="de ? 'QR-Code zum öffentlichen Figurenlink' : 'QR code for the public figure link'" />
        <p>{{ de ? 'Öffnet die Infoseite am Handy. Keine NFC-Übertragung.' : 'Opens the information page on your phone. No NFC transfer.' }}</p>
      </figure>
    </div>

    <FigureUsage :id="resolvedId" :locale="locale" />
    <details v-if="entry" class="extra-details">
      <summary>{{ de ? 'Regionale Veröffentlichungstermine' : 'Regional release dates' }}</summary>
      <dl class="release-dates"><div v-for="region in regions" :key="region.id"><dt>{{ region.label }}</dt><dd>{{ entry.release?.[region.id] || (de ? 'Nicht gelistet' : 'Not listed') }}</dd></div></dl>
      <p class="notice">{{ de ? 'Gelistete Katalogtermine; kein Nachweis aktueller Verfügbarkeit.' : 'Dates listed in the catalogue; not proof of current availability.' }}</p>
    </details>
    <details class="extra-details verification-details">
      <summary>{{ de ? 'Details zur Prüfung' : 'Inspection details' }}</summary>
      <p v-if="source === 'metadata'" class="notice">{{ de ? 'ID aus den Dateieigenschaften des Geräts. Der Dateiinhalt wurde dafür nicht gelesen oder geprüft.' : 'ID from device file properties. The file contents have not been read or checked for this view.' }}</p>
      <p v-else-if="source === 'catalogue'" class="notice">{{ de ? 'Öffentliche Katalogdaten; keine Prüfung einer Figurendatei.' : 'Public catalogue data; not a figure-file check.' }}</p>
      <p v-if="inspection" class="notice">{{ inspection.size === 2048 ? (de ? 'Geprüft: Größe und öffentliche ID. 2048 Bytes allein beweisen kein V3-Format; auch gepolsterte klassische Dateien sind möglich.' : 'Checked: size and public ID. 2048 bytes alone do not prove V3; padded classic files are also possible.') : (de ? 'Geprüft: Größe, Herstellerkennung, beide UID-Prüfbytes und öffentliche ID. Die UID wird nicht angezeigt oder weitergegeben.' : 'Checked: size, manufacturer byte, both UID check bytes and public ID. The UID is not displayed or shared.') }}</p>
      <p class="notice">{{ de ? 'Besitzer-, Spitznamen- und Spieldaten werden hier nicht entschlüsselt. Fehlende optionale Daten allein machen eine Figur nicht ungültig. Die Erkennung im Spiel und kryptografische Gültigkeit sind damit nicht bestätigt.' : 'Owner, nickname and game data are not decrypted here. Missing optional data alone does not make a figure invalid. This does not verify game recognition or cryptographic validity.' }}</p>
      <p v-if="resolvedId?.endsWith('03')" class="notice">{{ de ? 'V3: Die Fahrer-ID allein bestätigt weder Fahrzeugdaten noch die Vollständigkeit einer Kombination.' : 'V3: The rider ID alone does not confirm vehicle data or a complete combination.' }}</p>
      <p v-if="resolvedId" class="notice">{{ de ? 'Der QR-Code enthält nur den öffentlichen Figurenlink und wird lokal im Browser erzeugt. Das Scannen öffnet die Infoseite; es überträgt keine NFC-Figur an eine Konsole.' : 'The QR code contains only the public figure link and is generated locally in the browser. Scanning opens the information page; it does not transfer an NFC figure to a console.' }}</p>
      <p class="notice"><a :href="data.sourceUrl" target="_blank" rel="noopener noreferrer">{{ de ? 'Bild- und Metadatenquelle' : 'Image and metadata source' }} · AmiiboAPI</a></p>
    </details>
  </section>
</template>
<script setup>
import FigureUsage from './FigureUsage.vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import data from '../data/catalogue.json';
import { figureId, metadataFigureId, publicFigureImage, publicFigureLink } from '../lib/figure-info.js';
import { publicFigureQr } from '../lib/figure-qr.js';
const props = defineProps({ id: { type: String, default: null }, metadata: { type: Object, default: null }, inspection: { type: Object, default: null }, source: { type: String, default: 'catalogue' }, catalogueEntry: Object, imageCommit: String, catalogue: Object });
const { locale } = useI18n();
const de = computed(() => locale.value.startsWith('de'));
const resolvedId = computed(() => figureId(props.id) || metadataFigureId(props.metadata));
const vehicles = computed(() => props.inspection?.id === resolvedId.value ? props.inspection?.vehicleCandidates : undefined);
const catalogueData = computed(() => Array.isArray(props.catalogue?.entries) ? props.catalogue : data);
const entry = computed(() => resolvedId.value ? (props.catalogueEntry?.id === resolvedId.value ? props.catalogueEntry : catalogueData.value.entries.find(item => item?.id === resolvedId.value)) : null);
const imageUrl = computed(() => entry.value ? publicFigureImage(resolvedId.value, props.imageCommit ?? catalogueData.value.commit) : null);
const regions = [{ id: 'eu', label: 'Europa / Europe' }, { id: 'na', label: 'Nordamerika / North America' }, { id: 'jp', label: 'Japan' }, { id: 'au', label: 'Australien / Australia' }];
const imageRequested = ref(false), imageFailed = ref(false), qrVisible = ref(false);
const qr = computed(() => qrVisible.value ? publicFigureQr(resolvedId.value) : null);
function hideImage() { imageRequested.value = false; imageFailed.value = false; }
function imageError(event) { if (imageRequested.value && event?.target?.getAttribute?.('src') === imageUrl.value) imageFailed.value = true; }
function structureIssue(issue) {
  const labels = {
    manufacturer: ['Unerwartete Herstellerkennung.', 'Unexpected manufacturer byte.'],
    bcc0: ['Erstes UID-Prüfbyte stimmt nicht überein.', 'First UID check byte does not match.'],
    bcc1: ['Zweites UID-Prüfbyte stimmt nicht überein.', 'Second UID check byte does not match.'],
    'missing-id': ['Öffentliche Figuren-ID ist leer.', 'Public figure ID is empty.'],
    'v3-length': ['V3-ID ohne den erwarteten 2048-Byte-Bereich.', 'V3 ID without the expected 2048-byte area.']
  };
  return labels[issue]?.[de.value ? 0 : 1] || issue;
}
// Permission is for this detail only; switching figures must not load another image.
watch(resolvedId, () => { hideImage(); qrVisible.value = false; }, { flush: 'sync' });
// A new catalogue revision can change the image URL even for the same ID.
// Keep external requests explicit, and never carry a previous load error over.
watch(imageUrl, hideImage, { flush: 'sync' });
</script>
<style scoped>
.figure-details { border:1px solid #d3dee8; border-radius:14px; padding:18px; background:#fff; color:#193247; margin:12px 0; overflow-wrap:anywhere; box-shadow:0 3px 12px #19324708; }
.figure-heading { display:flex; gap:12px; align-items:flex-start; justify-content:space-between; } .eyebrow { margin:0 0 5px; color:#5b7183; font-size:.72rem; letter-spacing:.04em; } h4 { margin:0; font-size:1.2rem; line-height:1.3; } .figure-subtitle { margin:6px 0 0; color:#526575; font-size:.87rem; line-height:1.4; }
.type-badge { border:1px solid #c8d8e9; border-radius:20px; padding:4px 9px; color:#245887; font-size:.75rem; background:#f1f6fb; }
.figure-facts { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:15px 0; } dt { color:#617486; font-size:.75rem; } dd { margin:4px 0 0; font-size:.88rem; } code { font-size:.85rem; letter-spacing:.02em; user-select:all; }
.figure-actions { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 8px; } button,.action-link { min-height:42px; box-sizing:border-box; border:1px solid #b8ccdc; border-radius:8px; padding:9px 12px; color:#205580; background:#f6f9fc; cursor:pointer; font:inherit; font-size:.83rem; line-height:1.4; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; } button:hover,.action-link:hover { background:#eaf2f9; border-color:#7eabc9; } button:focus-visible,a:focus-visible,summary:focus-visible { outline:3px solid #7eb2d8; outline-offset:3px; }
.image-action { display:flex; align-items:center; gap:12px; margin:10px 0 14px; } .image-action button { flex:0 0 auto; background:#edf5f1; color:#23614e; border-color:#b6d3c7; } .image-action p { margin:0; color:#566d7d; font-size:.76rem; line-height:1.45; }
.media-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr)); gap:12px; margin:14px 0; } .media-tile { margin:0; padding:12px; border:1px solid #e0e7ed; border-radius:10px; background:#fafcfe; display:flex; align-items:center; flex-direction:column; justify-content:flex-start; } figcaption { font-size:.8rem; color:#526575; margin-bottom:10px; font-weight:600; } img { display:block; width:auto; height:auto; max-width:100%; max-height:240px; object-fit:contain; } .info-qr { image-rendering:pixelated; } .media-tile p { font-size:.76rem; color:#526575; text-align:center; line-height:1.4; margin:8px 0 0; }
.extra-details { border-top:1px solid #e3eaf0; padding:0; } summary { cursor:pointer; padding:12px 0; font-size:.83rem; color:#315c7b; min-height:20px; } .notice { font-size:.8rem; line-height:1.55; color:#526575; margin:0 0 10px; } .release-dates { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:2px 0 12px; } .brief-limit,.unknown-note { font-size:.8rem; line-height:1.45; margin:8px 0; color:#5b7081; }
.structure-status { margin-top:12px; border-radius:8px; padding:9px 11px; background:#edf6f1; color:#255f4c; display:flex; flex-direction:column; gap:4px; font-size:.81rem; } .structure-status span { font-size:.75rem; } .structure-status.attention { background:#fff5e7; color:#795514; } .structure-status ul { margin:5px 0 0; padding-left:18px; } a { color:#185a9d; }
@media(max-width:480px) { .figure-details { padding:14px; border-radius:11px; } .figure-facts { grid-template-columns:1fr; gap:9px; } .image-action { align-items:flex-start; flex-direction:column; gap:7px; } .figure-actions>* { flex:1 1 150px; } .release-dates { gap:10px 8px; } }
</style>
