<template>
  <section class="catalogue" aria-labelledby="catalogue-title">
    <header class="catalogue-heading"><div><p class="eyebrow">{{ de ? 'Entdecken und nachschlagen' : 'Explore and look up' }}</p><h3 id="catalogue-title">{{ de ? 'Figurenkatalog' : 'Figure catalogue' }}</h3></div><span class="count-badge">{{ data.entries.length }} {{ de ? 'Einträge' : 'entries' }}</span></header>
    <p class="catalogue-hint">{{ de ? 'Katalogdaten sind keine Figurendateien und bestätigen keine Spielunterstützung.' : 'Catalogue metadata is not a figure file or confirmation of game support.' }}</p>
    <div class="presence-legend" :aria-label="de ? 'Bedeutung der Bestandsmarkierungen' : 'Collection status legend'">
      <span class="legend-present">✓ {{ de ? 'Grün: ID gefunden' : 'Green: ID found' }}</span>
      <span class="legend-attention">! {{ de ? 'Orange · Datei gefunden, Zuordnung oder Format prüfen' : 'Orange · file found, check ID or format' }}</span>
      <span class="legend-missing">− {{ de ? 'Rot: keine passende Datei nachgewiesen' : 'Red: no matching file found' }}</span>
      <span>· {{ de ? 'Neutral: nicht bestätigt oder veraltet' : 'Neutral: unconfirmed or outdated' }}</span>
    </div>
    <p class="presence-scope" role="status">{{ presenceScope }}</p>
    <p v-if="historical" class="presence-observation" role="status">{{ de ? 'Gerät getrennt. Letzte Prüfung vom' : 'Device disconnected. Last check at' }} {{ observationDate }}. {{ de ? 'Die Farben zeigen diesen damaligen Prüfstand, keinen aktuellen Live-Bestand.' : 'Colours show that past observation, not the current live collection.' }}</p>
    <label class="search-field">{{ de ? 'Name, Serie oder öffentliche ID' : 'Name, series or public ID' }}<input ref="searchInput" v-model="query" type="search" maxlength="200" :placeholder="de ? 'Zum Beispiel Mario oder Link …' : 'For example Mario or Link …'" /></label>
    <FigureAnnouncements v-if="announcements.length" :groups="announcements" :de="de" :searching="Boolean(query.trim())" />
    <div class="catalogue-tools">
      <label class="presence-filter">{{ de ? 'Bestand filtern' : 'Filter collection' }}<select v-model="presenceFilter">
        <option value="">{{ de ? 'Alle Einträge' : 'All entries' }}</option>
        <option value="present">{{ de ? 'Vorhanden' : 'Present' }}</option>
        <option value="missing">{{ de ? 'Nicht gefunden' : 'Not found' }}</option>
        <option value="attention">{{ de ? 'Prüfhinweis' : 'Needs inspection' }}</option>
        <option value="unconfirmed">{{ de ? 'Unbestätigt / veraltet' : 'Unconfirmed / outdated' }}</option>
      </select></label>
      <label class="gallery-switch"><input v-model="showImages" type="checkbox" />{{ de ? 'Bilder anzeigen' : 'Show images' }}</label>
    </div>
    <p class="gallery-note">{{ de ? 'Bilder sind optional und werden nur für die aktuelle Seite von GitHub geladen. Dabei werden die öffentliche Figuren-ID und deine IP-Adresse sichtbar; keine Gerätedaten.' : 'Images are optional and load from GitHub for the current page only. This exposes the public figure ID and your IP address, not device data.' }}</p>
    <details class="filter-details">
      <summary>{{ de ? 'Filter' : 'Filters' }}<span v-if="activeFilters" class="filter-count">{{ activeFilters }}</span></summary>
      <div class="filters">
        <label>{{ de ? 'Serie' : 'Series' }}<select v-model="series"><option value="">{{ de ? 'Alle Serien' : 'All series' }}</option><option v-for="item in seriesOptions" :key="item">{{ item }}</option></select></label>
        <label>{{ de ? 'Art' : 'Type' }}<select v-model="kind"><option value="">{{ de ? 'Alle Arten' : 'All types' }}</option><option v-for="item in typeOptions" :key="item">{{ item }}</option></select></label>
      </div>
      <label class="known"><input v-model="knownOnly" type="checkbox" />{{ de ? 'Nur IDs im mitgelieferten Firmware-Namenskatalog' : 'Only IDs in the included firmware name catalogue' }}</label>
    </details>
    <button v-if="query || activeFilters" type="button" class="reset-filters" @click="resetFilters">{{ de ? 'Suche und Filter zurücksetzen' : 'Reset search and filters' }}</button>
    <div v-if="selectedId" ref="detailAnchor" tabindex="-1" class="selected-detail">
      <div class="selection-toolbar"><span>{{ de ? 'Ausgewählte Figur' : 'Selected figure' }}</span><button type="button" @click="closeDetails">{{ de ? 'Details schließen' : 'Close details' }}</button></div>
      <FigureDetails :key="selectedId" :id="selectedId" :catalogue-entry="data.entries.find(entry=>entry.id===selectedId)" :image-commit="data.commit" />
    </div>
    <LocalTagInspector :catalogue="data" />
    <div ref="resultAnchor" tabindex="-1" class="result-bar"><p aria-live="polite"><strong>{{ result.total }}</strong> {{ de ? 'Treffer' : 'results' }} <span>· {{ de ? 'Seite' : 'Page' }} {{ result.page }}/{{ result.pages }}</span></p></div>
    <p v-if="!result.total" class="empty-result">{{ announcements.length && query.trim()
      ? (de ? 'Treffer stehen oben in den Ankündigungen.' : 'See matching figures in the announcements above.')
      : (de ? 'Keine passenden Figuren. Versuche einen kürzeren Suchbegriff oder setze die Filter zurück.' : 'No matching figures. Try a shorter search or reset the filters.') }}</p>
    <ul class="entries">
      <li v-for="entry in result.entries" :key="entry.id" :class="['presence-' + presenceFor(entry.id).state, { selected: selectedId === entry.id }]" :data-presence="presenceFor(entry.id).state">
        <div v-if="showImages" class="entry-picture">
          <img v-if="!failedImages.has(imageFor(entry.id))" :key="imageFor(entry.id)" :src="imageFor(entry.id)" :alt="entry.name" width="160" height="140" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous" @error="imageFailed(entry.id, $event)" />
          <span v-else class="image-placeholder"><span aria-hidden="true">◇</span>{{ de ? 'Bild nicht verfügbar' : 'Image unavailable' }}</span>
        </div>
        <div class="entry-title"><strong>{{ entry.name }}</strong><span class="entry-type">{{ entry.type }}</span></div>
        <span class="presence-label">{{ presenceLabel(presenceFor(entry.id)) }}</span>
        <div v-if="presenceFor(entry.id).state === 'attention'" class="warning-reasons" role="list">
          <p v-for="reason in presenceFor(entry.id).reasons" :key="reason" role="listitem">{{ reasonText(reason) }}</p>
        </div>
        <small v-if="historical" class="observation-date">{{ observationDate }}</small>
        <span class="entry-series">{{ entry.series }}</span><code>{{ entry.id }}</code>
        <small>{{ de ? 'Erster regional gelisteter Termin' : 'First regionally listed date' }}: {{ releaseLabel(entry, today).date || '—' }}<template v-if="releaseLabel(entry, today).state === 'upcoming'"> · {{ de ? 'angekündigt' : 'upcoming' }}</template></small>
        <small class="firmware-name">{{ entry.firmwareIdKnown ? (de ? 'Name in Firmware verfügbar' : 'Name available in firmware') : (de ? 'Kein Name im Firmware-Katalog' : 'No name in firmware catalogue') }}</small>
        <button type="button" :aria-label="(de ? 'Details zu ' : 'Details for ') + entry.name" :disabled="blocked" :aria-expanded="selectedId === entry.id" @click="selectEntry(entry.id, $event)">{{ de ? 'Details und Bild' : 'Details and image' }}</button>
      </li>
    </ul>
    <nav :aria-label="de ? 'Katalogseiten' : 'Catalogue pages'"><button type="button" :disabled="result.page <= 1" @click="changePage(result.page - 1)">{{ de ? 'Zurück' : 'Previous' }}</button><span>{{ result.page }} / {{ result.pages }}</span><button type="button" :disabled="result.page >= result.pages" @click="changePage(result.page + 1)">{{ de ? 'Weiter' : 'Next' }}</button></nav>
    <details class="source-details"><summary>{{ de ? 'Quelle und Datenstand' : 'Source and data snapshot' }}</summary><p class="source">{{ de ? 'Geprüfter Datenabruf' : 'Snapshot checked' }}: {{ data.checkedDate }} · <a :href="data.sourceUrl" target="_blank" rel="noopener noreferrer">AmiiboAPI · {{ data.commit.slice(0, 8) }}</a></p><p class="source">{{ de ? 'Stand der Quelle, keine Vollständigkeitsgarantie. Varianten können zusätzliche Daten erfordern. Die Vorschau verbindet sich nicht mit einem Allmiibo.' : 'Source snapshot, not guaranteed complete. Variants may require additional data. The preview does not connect to an Allmiibo.' }}</p></details>
  </section>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import baseline from '../data/catalogue.json';
import { filterCatalogue, catalogueMatcher, cataloguePage, releaseLabel } from '../lib/catalogue.js';
import { buildCollectionPresence, collectionPresenceFor } from '../lib/collection-presence.js';
import { publicFigureImage } from '../lib/figure-info.js';
import { announcementGroups } from '../data/announced-figures.js';
import FigureAnnouncements from './FigureAnnouncements.vue';
import FigureDetails from './FigureDetails.vue';
import LocalTagInspector from './LocalTagInspector.vue';
const props = defineProps({ catalogue: Object, blocked: Boolean, collectionReport: Object, collectionStale: Boolean, collectionHistorical: Boolean, collectionObservedAt: String });
const emit = defineEmits(['select-entry']);
const data = computed(() => props.catalogue || baseline);
const { locale } = useI18n();
const de = computed(() => locale.value.startsWith('de'));
const validObservationDate = computed(() => typeof props.collectionObservedAt === 'string' && Number.isFinite(Date.parse(props.collectionObservedAt)));
const historical = computed(() => props.collectionHistorical && validObservationDate.value && !props.collectionStale && !!props.collectionReport);
const observationDate = computed(() => validObservationDate.value ? new Date(props.collectionObservedAt).toLocaleString(de.value ? 'de-DE' : 'en-GB') : '');
const presence = computed(() => buildCollectionPresence(props.collectionReport, { stale: props.collectionStale || props.collectionHistorical && !validObservationDate.value }));
const presenceFor = id => collectionPresenceFor(presence.value, id);
const presenceScope = computed(() => {
  const states = {
    none: ['Erst die Sammlung prüfen. Ohne Prüfung bleiben die Karten neutral.', 'Check your collection first. Cards remain neutral without a scan.'],
    stale: ['Prüfung veraltet: Bitte erneut prüfen. Die Farben bestätigen keinen aktuellen Bestand.', 'Outdated scan: check again. Colours do not confirm the current collection.'],
    quick: ['Schnellübersicht: IDs nur aus Eigenschaften; Inhalte ungeprüft. Keine roten Fehlanzeigen.', 'Quick overview: IDs from properties only; contents unchecked. No missing-file marks.'],
    'partial-or-scoped': ['Teilprüfung oder Ordnerauswahl: Fundstellen werden markiert; Abwesenheit ist nicht bestätigt.', 'Partial scan or selected folder: observed entries are marked; absence is unconfirmed.'],
    'full-drive-complete': ['Vollständiger Inhaltsdurchlauf von E:. Rot bezieht sich auf diesen Katalog und die unterstützten BIN-Formate; unbekannte Dateien bleiben ungeprüft.', 'Complete content traversal of E:. Red refers to this catalogue and supported BIN formats; unknown files remain unchecked.'],
  };
  return states[presence.value.status]?.[de.value ? 0 : 1] || '';
});
const reasonLabels = {
  'metadata-mismatch': ['Die Figuren-ID in den Dateieigenschaften weicht von der ID im Dateiinhalt ab.', 'The figure ID in the file properties differs from the ID in the file.'],
  'classic-without-final-eight-bytes': ['532-Byte-Format. Die letzten 8 Byte der üblichen 540-Byte-Datei fehlen.', '532-byte format. The final 8 bytes of the usual 540-byte file are absent.'],
  'classic-with-unverified-extra-bytes': ['572-Byte-Format mit 32 zusätzlichen, ungeprüften Bytes.', '572-byte format with 32 extra, unchecked bytes.'],
  'two-kib-layout-not-fully-validated': ['2-KiB-Format. Der Prüfer kann den Aufbau nur teilweise auswerten.', '2 KiB format. The checker supports only part of this layout.'],
  'unsupported-length': ['Der Prüfer unterstützt diese Dateigröße nicht.', 'The checker does not support this file size.'],
  manufacturer: ['Das Herstellerbyte weicht vom erwarteten Wert ab.', 'The manufacturer byte differs from the expected value.'],
  bcc0: ['Das erste Prüfbyte der Tag-Seriennummer stimmt nicht.', 'The first check byte of the tag serial number does not match.'],
  bcc1: ['Das zweite Prüfbyte der Tag-Seriennummer stimmt nicht.', 'The second check byte of the tag serial number does not match.'],
  'missing-id': ['Im Dateiinhalt fehlt eine gültige Figuren-ID.', 'The file contents contain no valid figure ID.'],
  'v3-length': ['Die Dateigröße passt nicht zur V3-Figuren-ID.', 'The file size does not match the V3 figure ID.'],
  'read-size-mismatch': ['Die gelesene Größe weicht vom Ordnereintrag ab.', 'The number of bytes read differs from the directory entry.'],
  'read-failed': ['Die Datei konnte bei der Prüfung nicht gelesen werden.', 'The checker could not read the file.'],
  'not-read-limit': ['Die Datei lag außerhalb der Lesegrenze dieser Prüfung.', 'This file exceeded the read limit for this check.'],
  'not-read': ['Die Prüfung endete, bevor diese Datei gelesen wurde.', 'The check ended before this file was read.'],
  'content-unconfirmed': ['Die Prüfung konnte die Figuren-ID im Inhalt nicht bestätigen.', 'The check could not confirm the figure ID in the contents.'],
  'file-attention': ['Mindestens eine zugeordnete Datei ist auffällig.', 'At least one associated file needs inspection.'],
};
function reasonText(reason) {
  return (reasonLabels[reason] || reasonLabels['file-attention'])[de.value ? 0 : 1];
}
function presenceLabel(value) {
  if(historical.value) {
    const labels={present:value.basis==='metadata' ? ['ID laut Eigenschaften','ID from properties'] : ['ID gefunden','ID found'],attention:['Prüfhinweis','Needs inspection'],missing:['Nicht gefunden','Not found'],unknown:['Nicht bestätigt','Unconfirmed']};
    return (de.value ? 'Letzte Prüfung · ' : 'Last check · ') + (labels[value.state] || labels.unknown)[de.value ? 0 : 1];
  }
  if (value.state === 'present') return value.basis === 'metadata'
    ? (de.value ? '✓ Vorhanden laut Eigenschaften' : '✓ Present according to properties')
    : (de.value ? '✓ Vorhanden · ID bestätigt' : '✓ Present · ID confirmed');
  if (value.state === 'attention') return value.basis === 'metadata'
    ? (de.value ? '! Eigenschaften nennen ID · Datei prüfen' : '! Properties name ID · inspect file')
    : value.basis === 'content' ? (de.value ? '! Vorhanden · Abweichung prüfen' : '! Present · inspect differences')
    : (de.value ? '! Fundstelle · Datei prüfen' : '! File found · inspect contents');
  if (value.state === 'missing') return de.value ? '− Nicht gefunden' : '− Not found';
  if (value.state === 'stale') return de.value ? '· Prüfung veraltet' : '· Scan outdated';
  return de.value ? '· Bestand nicht bestätigt' : '· Presence unconfirmed';
}
const query = ref(''), series = ref(''), kind = ref(''), knownOnly = ref(false), presenceFilter = ref(''), page = ref(1);
const showImages = ref(false), failedImages = ref(new Set());
const imageFor = id => publicFigureImage(id, data.value.commit);
function imageFailed(id, event) {
  const url = imageFor(id);
  // A delayed event from another page/revision cannot hide a current image.
  if (!showImages.value || !result.value.entries.some(entry => entry.id === id) || event?.target?.getAttribute?.('src') !== url) return;
  failedImages.value = new Set([...failedImages.value, url]);
}
const selectedId = ref(null), detailAnchor = ref(null), searchInput = ref(null), resultAnchor = ref(null);
let selectedTrigger = null;
const activeFilters = computed(() => Number(Boolean(series.value)) + Number(Boolean(kind.value)) + Number(knownOnly.value) + Number(Boolean(presenceFilter.value)));
const announcements = computed(() => {
  if (knownOnly.value || presenceFilter.value || (kind.value && kind.value !== 'Figure')) return [];
  const matches = catalogueMatcher(query.value);
  return announcementGroups.filter(group => !series.value || group.series === series.value).map(group => ({
    ...group,
    figures: group.figures.filter(figure => matches(figure.en, figure.de, group.series, figure.proposedId)),
  })).filter(group => group.figures.length);
});
function resetFilters() { query.value = ''; series.value = ''; kind.value = ''; knownOnly.value = false; presenceFilter.value = ''; }
async function closeDetails() { selectedId.value = null; await nextTick(); if (selectedTrigger?.isConnected) selectedTrigger.focus?.(); else searchInput.value?.focus?.(); }
async function selectEntry(id, event) { if(props.blocked)return; emit('select-entry',data.value.entries.find(entry=>entry.id===id)); selectedTrigger = event?.currentTarget || null; selectedId.value = id; await nextTick(); detailAnchor.value?.focus?.(); }
const today = new Date().toISOString().slice(0, 10);
const seriesOptions = computed(() => [...new Set(data.value.entries.map(entry => entry.series))].sort());
const typeOptions = computed(() => [...new Set(data.value.entries.map(entry => entry.type))].sort());
const filtered = computed(() => filterCatalogue(data.value.entries, { query: query.value, series: series.value, kind: kind.value, knownOnly: knownOnly.value }).filter(entry => {
  if (!presenceFilter.value) return true;
  const state = presenceFor(entry.id).state;
  return presenceFilter.value === 'unconfirmed' ? state === 'unknown' || state === 'stale' : state === presenceFilter.value;
}));
const result = computed(() => cataloguePage(filtered.value, page.value));
async function changePage(nextPage) {
  if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > result.value.pages || nextPage === result.value.page) return;
  page.value = nextPage;
  selectedId.value = null;
  await nextTick();
  resultAnchor.value?.focus?.({ preventScroll: true });
  resultAnchor.value?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
}
watch([query, series, kind, knownOnly, presenceFilter], () => { page.value = 1; selectedId.value = null; });
watch([showImages, () => data.value.commit, () => result.value.page], () => { failedImages.value = new Set(); });
</script>
<style scoped>
/* Header badges may move onto a second line when users enlarge text. */
.catalogue { min-width:0; overflow-wrap:anywhere; }
.catalogue-heading { flex-wrap:wrap; }
.catalogue-heading > *, .entries li { min-width:0; }
.catalogue .count-badge { max-width:100%; white-space:normal; box-sizing:border-box; }
.catalogue input, .catalogue select { min-width:0; }
.catalogue { border:1px solid #d3dee8; border-radius:16px; padding:20px; margin:16px 0; background:#f5f8fb; color:#193247; }
.presence-legend { display:flex; flex-wrap:wrap; gap:8px 14px; font-size:.75rem; line-height:1.5; color:#526575; padding:10px 12px; border:1px solid #d9e3ec; border-radius:8px; background:white; }
.legend-present { color:#176c41; } .legend-attention { color:#92500a; } .legend-missing { color:#aa3030; }
.presence-scope { font-size:.77rem; line-height:1.5; color:#526575; margin:9px 0 14px; }
.presence-observation { font-size:.8rem; line-height:1.5; padding:10px 12px; border:1px solid #c5d5e1; border-radius:8px; background:#edf3f7; color:#334f64; }
.observation-date { font-size:.7rem; color:#526575; }
.presence-label { font-size:.74rem; line-height:1.4; font-weight:600; color:#60788b; }
.catalogue-heading { display:flex; justify-content:space-between; gap:12px; align-items:center; } .eyebrow { margin:0 0 4px; font-size:.72rem; color:#617486; letter-spacing:.03em; } h3 { margin:0; font-size:1.3rem; } .count-badge { white-space:nowrap; font-size:.78rem; padding:6px 10px; background:white; border:1px solid #d9e3ec; border-radius:20px; color:#526b80; } .catalogue-hint { margin:9px 0 16px; font-size:.83rem; line-height:1.5; color:#526575; }
.search-field { display:grid; gap:6px; font-size:.8rem; color:#465f74; } input[type=search],select { width:100%; box-sizing:border-box; min-height:43px; padding:10px 12px; border:1px solid #b5c9d9; border-radius:8px; background:white; color:#193247; font:inherit; font-size:.88rem; } input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible { outline:3px solid #8eb8d8; outline-offset:2px; }
.catalogue-tools { display:flex; align-items:end; flex-wrap:wrap; gap:12px 20px; margin-top:12px; } .presence-filter { display:grid; gap:6px; flex:1 1 210px; max-width:360px; color:#465f74; font-size:.8rem; } .gallery-switch { display:flex; align-items:center; gap:9px; min-height:43px; cursor:pointer; color:#315c7b; font-size:.86rem; font-weight:600; } .gallery-switch input { width:18px; height:18px; margin:0; accent-color:#287455; } .gallery-note { font-size:.73rem; line-height:1.5; color:#526575; margin:8px 0 0; max-width:72ch; }
.filter-details { margin:10px 0; } summary { cursor:pointer; min-height:26px; padding:8px 0; font-size:.85rem; color:#315c7b; } .filter-count { display:inline-block; margin-left:8px; min-width:18px; padding:1px 4px; text-align:center; border-radius:10px; background:#dcebf6; } .filters { display:flex; flex-wrap:wrap; gap:12px; padding-top:6px; } .filters label { display:grid; gap:5px; flex:1 1 180px; font-size:.8rem; } .known { display:flex; gap:8px; align-items:flex-start; margin:12px 0; font-size:.8rem; line-height:1.5; } .known input { margin-top:3px; }
button { min-height:42px; padding:8px 14px; border:1px solid #b8ccdc; border-radius:8px; background:white; color:#205580; font:inherit; font-size:.82rem; cursor:pointer; } button:hover:enabled { background:#eaf2f9; border-color:#7eabc9; } button:disabled { cursor:default; opacity:.45; } .reset-filters { margin-bottom:8px; min-height:36px; font-size:.77rem; }
.selected-detail { outline:none; } .selection-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:.8rem; color:#526575; padding-top:8px; } .selection-toolbar button { min-height:36px; } .result-bar p { font-size:.83rem; margin:15px 0 10px; } .result-bar span { color:#60788b; }
.result-bar { scroll-margin-top:20px; border-radius:6px; } .result-bar:focus-visible { outline:2px solid #8eb8d8; outline-offset:4px; }
.entry-picture { display:grid; place-items:center; height:152px; margin:-3px -3px 7px; border-radius:8px; background:linear-gradient(145deg,#f0f4f6,#fafcfd); } .entry-picture img { width:160px; height:140px; max-width:100%; object-fit:contain; } .image-placeholder { display:flex; flex-direction:column; align-items:center; gap:8px; font-size:.76rem; color:#60788b; } .image-placeholder>span { font-size:36px; color:#9bafbd; }
.entries { list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:10px; margin:10px 0 16px; } .entries li { display:flex; flex-direction:column; gap:6px; border:1px solid #d9e3ec; background:white; border-radius:11px; padding:14px; overflow-wrap:anywhere; } .entries li.selected { border-color:#719fc4; box-shadow:0 0 0 2px #dcebf6; } .entry-title { display:flex; gap:8px; align-items:flex-start; justify-content:space-between; } .entry-title strong { font-size:.96rem; line-height:1.35; } .entry-type { font-size:.65rem; color:#60788b; background:#f0f5f9; padding:3px 6px; border-radius:5px; } .entry-series { font-size:.8rem; color:#526575; } code { font-size:.75rem; color:#60788b; } small { color:#60788b; font-size:.72rem; line-height:1.45; } .firmware-name { margin:2px 0 4px; } .entries button { margin-top:auto; background:#f6f9fc; }
.entries li.presence-present { border:3px solid #23834f; background:#f4fbf6; } .entries li.presence-present .presence-label { color:#176c41; }
.entries li.presence-attention { border:3px solid #c47a16; background:#fffaf1; } .entries li.presence-attention .presence-label { color:#92500a; }
.entries li.presence-missing { border:3px solid #c24343; background:#fff7f7; } .entries li.presence-missing .presence-label { color:#aa3030; }
.warning-reasons { font-size:.76rem; line-height:1.4; color:#75480b; } .warning-reasons p { margin:0 0 .25em; }
.entries li.presence-stale { border-style:dashed; }
nav { display:flex; justify-content:center; align-items:center; gap:14px; font-size:.8rem; color:#60788b; } .source-details { border-top:1px solid #dce5ed; margin-top:16px; padding-top:5px; } .source { font-size:.78rem; overflow-wrap:anywhere; color:#526575; line-height:1.5; margin:5px 0 8px; } .empty-result { border:1px dashed #bacddd; border-radius:10px; padding:20px; background:white; font-size:.9rem; line-height:1.5; }
/* App's workspace navigation sits above the results on narrow screens. */
@media(max-width:650px) { .result-bar { scroll-margin-top:160px; } }
@media(max-width:480px) { .catalogue { padding:14px; border-radius:12px; } h3 { font-size:1.16rem; } .count-badge { font-size:.7rem; padding:5px 8px; } .entries { grid-template-columns:1fr; } .selection-toolbar { align-items:flex-start; } }
</style>
