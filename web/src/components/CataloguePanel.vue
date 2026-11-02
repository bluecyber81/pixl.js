<template>
  <section class="catalogue" aria-labelledby="catalogue-title">
    <header class="catalogue-heading"><div><p class="eyebrow">{{ de ? 'Entdecken und nachschlagen' : 'Explore and look up' }}</p><h3 id="catalogue-title">{{ de ? 'Figurenkatalog' : 'Figure catalogue' }}</h3></div><span class="count-badge">{{ data.entries.length }} {{ de ? 'Einträge' : 'entries' }}</span></header>
    <p class="catalogue-hint">{{ de ? 'Katalogdaten sind keine Figurendateien und bestätigen keine Spielunterstützung.' : 'Catalogue metadata is not a figure file or confirmation of game support.' }}</p>
    <div class="presence-legend" :aria-label="de ? 'Bedeutung der Bestandsmarkierungen' : 'Collection status legend'">
      <span class="legend-present">✓ {{ de ? 'Grün: ID gefunden' : 'Green: ID found' }}</span>
      <span class="legend-attention">! {{ de ? 'Orange: Eintrag mit Prüfhinweis' : 'Orange: entry needs inspection' }}</span>
      <span class="legend-missing">− {{ de ? 'Rot: keine passende Datei nachgewiesen' : 'Red: no matching file found' }}</span>
      <span>· {{ de ? 'Neutral: nicht bestätigt oder veraltet' : 'Neutral: unconfirmed or outdated' }}</span>
    </div>
    <p class="presence-scope" role="status">{{ presenceScope }}</p>
    <label class="search-field">{{ de ? 'Name, Serie oder öffentliche ID' : 'Name, series or public ID' }}<input ref="searchInput" v-model="query" type="search" maxlength="200" :placeholder="de ? 'Zum Beispiel Mario oder Link …' : 'For example Mario or Link …'" /></label>
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
    <LocalTagInspector />
    <div class="result-bar"><p aria-live="polite"><strong>{{ result.total }}</strong> {{ de ? 'Treffer' : 'results' }} <span>· {{ de ? 'Seite' : 'Page' }} {{ result.page }}/{{ result.pages }}</span></p></div>
    <p v-if="!result.total" class="empty-result">{{ de ? 'Keine passenden Figuren. Versuche einen kürzeren Suchbegriff oder setze die Filter zurück.' : 'No matching figures. Try a shorter search or reset the filters.' }}</p>
    <ul class="entries">
      <li v-for="entry in result.entries" :key="entry.id" :class="['presence-' + presenceFor(entry.id).state, { selected: selectedId === entry.id }]" :data-presence="presenceFor(entry.id).state">
        <div class="entry-title"><strong>{{ entry.name }}</strong><span class="entry-type">{{ entry.type }}</span></div>
        <span class="presence-label">{{ presenceLabel(presenceFor(entry.id)) }}</span>
        <span class="entry-series">{{ entry.series }}</span><code>{{ entry.id }}</code>
        <small>{{ de ? 'Erster regional gelisteter Termin' : 'First regionally listed date' }}: {{ releaseLabel(entry, today).date || '—' }}<template v-if="releaseLabel(entry, today).state === 'upcoming'"> · {{ de ? 'angekündigt' : 'upcoming' }}</template></small>
        <small class="firmware-name">{{ entry.firmwareIdKnown ? (de ? 'Name in Firmware verfügbar' : 'Name available in firmware') : (de ? 'Kein Name im Firmware-Katalog' : 'No name in firmware catalogue') }}</small>
        <button type="button" :aria-label="(de ? 'Details zu ' : 'Details for ') + entry.name" :disabled="blocked" :aria-expanded="selectedId === entry.id" @click="selectEntry(entry.id, $event)">{{ de ? 'Details und Bild' : 'Details and image' }}</button>
      </li>
    </ul>
    <nav :aria-label="de ? 'Katalogseiten' : 'Catalogue pages'"><button type="button" :disabled="result.page <= 1" @click="page = result.page - 1">{{ de ? 'Zurück' : 'Previous' }}</button><span>{{ result.page }} / {{ result.pages }}</span><button type="button" :disabled="result.page >= result.pages" @click="page = result.page + 1">{{ de ? 'Weiter' : 'Next' }}</button></nav>
    <details class="source-details"><summary>{{ de ? 'Quelle und Datenstand' : 'Source and data snapshot' }}</summary><p class="source">{{ de ? 'Geprüfter Datenabruf' : 'Snapshot checked' }}: {{ data.checkedDate }} · <a :href="data.sourceUrl" target="_blank" rel="noopener noreferrer">AmiiboAPI · {{ data.commit.slice(0, 8) }}</a></p><p class="source">{{ de ? 'Stand der Quelle, keine Vollständigkeitsgarantie. Varianten können zusätzliche Daten erfordern. Die Vorschau verbindet sich nicht mit einem Allmiibo.' : 'Source snapshot, not guaranteed complete. Variants may require additional data. The preview does not connect to an Allmiibo.' }}</p></details>
  </section>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import baseline from '../data/catalogue.json';
import { filterCatalogue, cataloguePage, releaseLabel } from '../lib/catalogue.js';
import { buildCollectionPresence, collectionPresenceFor } from '../lib/collection-presence.js';
import FigureDetails from './FigureDetails.vue';
import LocalTagInspector from './LocalTagInspector.vue';
const props = defineProps({ catalogue: Object, blocked: Boolean, collectionReport: Object, collectionStale: Boolean });
const emit = defineEmits(['select-entry']);
const data = computed(() => props.catalogue || baseline);
const { locale } = useI18n();
const de = computed(() => locale.value.startsWith('de'));
const presence = computed(() => buildCollectionPresence(props.collectionReport, { stale: props.collectionStale }));
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
function presenceLabel(value) {
  if (value.state === 'present') return value.basis === 'metadata'
    ? (de.value ? '✓ Vorhanden laut Eigenschaften' : '✓ Present according to properties')
    : (de.value ? '✓ Vorhanden · ID bestätigt' : '✓ Present · ID confirmed');
  if (value.state === 'attention') return value.basis === 'metadata'
    ? (de.value ? '! Eigenschaften nennen ID · Datei prüfen' : '! Properties name ID · inspect file')
    : (de.value ? '! Vorhanden · Abweichung prüfen' : '! Present · inspect differences');
  if (value.state === 'missing') return de.value ? '− Nicht gefunden' : '− Not found';
  if (value.state === 'stale') return de.value ? '· Prüfung veraltet' : '· Scan outdated';
  return de.value ? '· Bestand nicht bestätigt' : '· Presence unconfirmed';
}
const query = ref(''), series = ref(''), kind = ref(''), knownOnly = ref(false), page = ref(1);
const selectedId = ref(null), detailAnchor = ref(null), searchInput = ref(null);
let selectedTrigger = null;
const activeFilters = computed(() => Number(Boolean(series.value)) + Number(Boolean(kind.value)) + Number(knownOnly.value));
function resetFilters() { query.value = ''; series.value = ''; kind.value = ''; knownOnly.value = false; }
async function closeDetails() { selectedId.value = null; await nextTick(); if (selectedTrigger?.isConnected) selectedTrigger.focus?.(); else searchInput.value?.focus?.(); }
async function selectEntry(id, event) { if(props.blocked)return; emit('select-entry',data.value.entries.find(entry=>entry.id===id)); selectedTrigger = event?.currentTarget || null; selectedId.value = id; await nextTick(); detailAnchor.value?.focus?.(); }
const today = new Date().toISOString().slice(0, 10);
const seriesOptions = computed(() => [...new Set(data.value.entries.map(entry => entry.series))].sort());
const typeOptions = computed(() => [...new Set(data.value.entries.map(entry => entry.type))].sort());
const filtered = computed(() => filterCatalogue(data.value.entries, { query: query.value, series: series.value, kind: kind.value, knownOnly: knownOnly.value }));
const result = computed(() => cataloguePage(filtered.value, page.value));
watch([query, series, kind, knownOnly], () => { page.value = 1; selectedId.value = null; });
</script>
<style scoped>
.catalogue { border:1px solid #d3dee8; border-radius:16px; padding:20px; margin:16px 0; background:#f5f8fb; color:#193247; }
.presence-legend { display:flex; flex-wrap:wrap; gap:8px 14px; font-size:.75rem; line-height:1.5; color:#526575; padding:10px 12px; border:1px solid #d9e3ec; border-radius:8px; background:white; }
.legend-present { color:#176c41; } .legend-attention { color:#92500a; } .legend-missing { color:#aa3030; }
.presence-scope { font-size:.77rem; line-height:1.5; color:#526575; margin:9px 0 14px; }
.presence-label { font-size:.74rem; line-height:1.4; font-weight:600; color:#60788b; }
.catalogue-heading { display:flex; justify-content:space-between; gap:12px; align-items:center; } .eyebrow { margin:0 0 4px; font-size:.72rem; color:#617486; letter-spacing:.03em; } h3 { margin:0; font-size:1.3rem; } .count-badge { white-space:nowrap; font-size:.78rem; padding:6px 10px; background:white; border:1px solid #d9e3ec; border-radius:20px; color:#526b80; } .catalogue-hint { margin:9px 0 16px; font-size:.83rem; line-height:1.5; color:#526575; }
.search-field { display:grid; gap:6px; font-size:.8rem; color:#465f74; } input[type=search],select { width:100%; box-sizing:border-box; min-height:43px; padding:10px 12px; border:1px solid #b5c9d9; border-radius:8px; background:white; color:#193247; font:inherit; font-size:.88rem; } input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible { outline:3px solid #8eb8d8; outline-offset:2px; }
.filter-details { margin:10px 0; } summary { cursor:pointer; min-height:26px; padding:8px 0; font-size:.85rem; color:#315c7b; } .filter-count { display:inline-block; margin-left:8px; min-width:18px; padding:1px 4px; text-align:center; border-radius:10px; background:#dcebf6; } .filters { display:flex; flex-wrap:wrap; gap:12px; padding-top:6px; } .filters label { display:grid; gap:5px; flex:1 1 180px; font-size:.8rem; } .known { display:flex; gap:8px; align-items:flex-start; margin:12px 0; font-size:.8rem; line-height:1.5; } .known input { margin-top:3px; }
button { min-height:42px; padding:8px 14px; border:1px solid #b8ccdc; border-radius:8px; background:white; color:#205580; font:inherit; font-size:.82rem; cursor:pointer; } button:hover:enabled { background:#eaf2f9; border-color:#7eabc9; } button:disabled { cursor:default; opacity:.45; } .reset-filters { margin-bottom:8px; min-height:36px; font-size:.77rem; }
.selected-detail { outline:none; } .selection-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:.8rem; color:#526575; padding-top:8px; } .selection-toolbar button { min-height:36px; } .result-bar p { font-size:.83rem; margin:15px 0 10px; } .result-bar span { color:#60788b; }
.entries { list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:10px; margin:10px 0 16px; } .entries li { display:flex; flex-direction:column; gap:6px; border:1px solid #d9e3ec; background:white; border-radius:11px; padding:14px; overflow-wrap:anywhere; } .entries li.selected { border-color:#719fc4; box-shadow:0 0 0 2px #dcebf6; } .entry-title { display:flex; gap:8px; align-items:flex-start; justify-content:space-between; } .entry-title strong { font-size:.96rem; line-height:1.35; } .entry-type { font-size:.65rem; color:#60788b; background:#f0f5f9; padding:3px 6px; border-radius:5px; } .entry-series { font-size:.8rem; color:#526575; } code { font-size:.75rem; color:#60788b; } small { color:#60788b; font-size:.72rem; line-height:1.45; } .firmware-name { margin:2px 0 4px; } .entries button { margin-top:auto; background:#f6f9fc; }
.entries li.presence-present { border:2px solid #23834f; } .entries li.presence-present .presence-label { color:#176c41; }
.entries li.presence-attention { border:2px solid #c47a16; } .entries li.presence-attention .presence-label { color:#92500a; }
.entries li.presence-missing { border:2px solid #c24343; } .entries li.presence-missing .presence-label { color:#aa3030; }
.entries li.presence-stale { border-style:dashed; }
nav { display:flex; justify-content:center; align-items:center; gap:14px; font-size:.8rem; color:#60788b; } .source-details { border-top:1px solid #dce5ed; margin-top:16px; padding-top:5px; } .source { font-size:.78rem; overflow-wrap:anywhere; color:#526575; line-height:1.5; margin:5px 0 8px; } .empty-result { border:1px dashed #bacddd; border-radius:10px; padding:20px; background:white; font-size:.9rem; line-height:1.5; }
@media(max-width:480px) { .catalogue { padding:14px; border-radius:12px; } h3 { font-size:1.16rem; } .count-badge { font-size:.7rem; padding:5px 8px; } .entries { grid-template-columns:1fr; } .selection-toolbar { align-items:flex-start; } }
</style>
