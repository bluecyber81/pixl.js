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
    <div class="catalogue-tools">
      <label class="game-filter">{{ de ? 'Nach Spiel filtern' : 'Filter by game' }}<select v-model="gameId">
        <option value="">{{ de ? 'Alle Spiele und Figuren' : 'All games and figures' }}</option>
        <option v-if="gameId && !selectedGame" :value="gameId">{{ gameId }} · {{ de ? 'kein aktueller Spielhinweis' : 'no current game guide' }}</option>
        <option v-for="game in gameGuides" :key="game.id" :value="game.id">{{ game.title }} · {{ game.platform }}</option>
      </select></label>
      <label class="presence-filter">{{ de ? 'Bestand filtern' : 'Filter collection' }}<select v-model="presenceFilter">
        <option value="">{{ de ? 'Alle Einträge' : 'All entries' }}</option>
        <option value="observed">{{ de ? 'Auf dem Gerät gefunden (inkl. Prüfhinweisen)' : 'Found on device (including inspection notes)' }}</option>
        <option value="present">{{ de ? 'Vorhanden' : 'Present' }}</option>
        <option value="missing">{{ de ? 'Nicht gefunden' : 'Not found' }}</option>
        <option value="attention">{{ de ? 'Prüfhinweis' : 'Needs inspection' }}</option>
        <option value="unconfirmed">{{ de ? 'Unbestätigt / veraltet' : 'Unconfirmed / outdated' }}</option>
      </select></label>
      <label class="gallery-switch"><input v-model="showImages" type="checkbox" />{{ de ? 'Bilder anzeigen' : 'Show images' }}</label>
    </div>
    <template v-if="selectedGame">
      <GameGuide :game="selectedGame" :de="de" />
      <p class="presence-scope">{{ de ? 'Die Auswahl enthält Katalog-IDs mit belegter Spielzuordnung. Mit dem Bestandsfilter kannst du die Treffer auf dein Gerät eingrenzen.' : 'This selection lists catalogue IDs with a documented game association. Use the collection filter to show matches from your device.' }}</p>
    </template>
    <p class="gallery-note">{{ de ? 'Bilder sind optional und werden nur für die aktuelle Seite von GitHub geladen. Dabei werden die öffentliche Figuren-ID und deine IP-Adresse sichtbar; keine Gerätedaten.' : 'Images are optional and load from GitHub for the current page only. This exposes the public figure ID and your IP address, not device data.' }}</p>
    <details class="filter-details">
      <summary>{{ de ? 'Filter' : 'Filters' }}<span v-if="activeFilters" class="filter-count">{{ activeFilters }}</span></summary>
      <div class="filters">
        <label>{{ de ? 'Serie' : 'Series' }}<select v-model="series"><option value="">{{ de ? 'Alle Serien' : 'All series' }}</option><option v-if="series && !seriesOptions.includes(series)" :value="series">{{ series }} · {{ de ? 'nicht im Katalog' : 'not in catalogue' }}</option><option v-for="item in seriesOptions" :key="item">{{ item }}</option></select></label>
        <label>{{ de ? 'Art' : 'Type' }}<select v-model="kind"><option value="">{{ de ? 'Alle Arten' : 'All types' }}</option><option v-if="kind && !typeOptions.includes(kind)" :value="kind">{{ kind }} · {{ de ? 'nicht im Katalog' : 'not in catalogue' }}</option><option v-for="item in typeOptions" :key="item">{{ item }}</option></select></label>
      </div>
      <label class="known"><input v-model="knownOnly" type="checkbox" />{{ de ? 'Nur IDs im mitgelieferten Firmware-Namenskatalog' : 'Only IDs in the included firmware name catalogue' }}</label>
    </details>

    <details class="filter-details saved-filters">
      <summary>{{ de ? 'Webfavoriten und gespeicherte Filter' : 'Web favourites and saved filters' }}</summary>
      <p>{{ de ? 'Deine Favoriten und Filter bleiben in diesem Browser. Die Bestandsanzeige kommt aus der Geräteprüfung.' : 'Your favourites and filters stay in this browser. Collection status comes from the device scan.' }}</p>
      <label class="known"><input v-model="favoritesOnly" type="checkbox" />{{ de ? 'Nur Webfavoriten' : 'Web favourites only' }}</label>
      <form @submit.prevent="changePreference({op:'create', name:newFilterName, criteria:currentCriteria})">
        <label>{{ de ? 'Name für diesen Filter' : 'Name for this filter' }}<input v-model="newFilterName" type="text" :maxlength="FILTER_NAME_LIMIT" /></label>
        <button type="submit" :disabled="!newFilterName.trim()">{{ de ? 'Neuen Filter speichern' : 'Save new filter' }}</button>
      </form>
      <template v-if="preferences.filters.length">
        <label>{{ de ? 'Gespeicherter Filter' : 'Saved filter' }}<select v-model="selectedFilterName">
          <option value="">{{ de ? 'Filter auswählen' : 'Choose a filter' }}</option>
          <option v-for="saved in preferences.filters" :key="saved.name" :value="saved.name">{{ saved.name }}</option>
        </select></label>
        <div class="preset-actions">
          <button type="button" :disabled="!selectedPreset" @click="applyPreset">{{ de ? 'Filter anwenden' : 'Apply filter' }}</button>
          <button type="button" :disabled="!selectedPreset" @click="changePreference({op:'update',name:selectedFilterName,criteria:currentCriteria})">{{ de ? 'Mit aktuellen Filtern überschreiben' : 'Overwrite with current filters' }}</button>
          <button type="button" :disabled="!selectedPreset" @click="changePreference({op:'remove',name:selectedFilterName})">{{ de ? 'Gespeicherten Filter löschen' : 'Delete saved filter' }}</button>
        </div>
      </template>
      <details class="profile-transfer">
        <summary>{{ de ? 'Favoriten und Filter übertragen' : 'Transfer favourites and filters' }}</summary>
        <p>{{ de ? 'Speichere deine Webfavoriten und benannten Filter als JSON-Datei und übernimm sie in einem anderen Browser. Der Import ändert nur dieses lokale Katalogprofil.' : 'Save your web favourites and named filters as a JSON file and use them in another browser. Importing changes only this local catalogue profile.' }}</p>
        <button type="button" :disabled="profileSaving" @click="downloadProfile">{{ de ? 'Profil als JSON speichern' : 'Save profile as JSON' }}</button>
        <label class="profile-file">{{ de ? 'Profildatei für Vorschau auswählen' : 'Choose a profile file to preview' }}
          <input type="file" accept=".json,application/json" :disabled="profileSaving" @change="loadProfileFile" />
        </label>
        <p v-if="profileLoading" role="status">{{ de ? 'Profildatei wird gelesen …' : 'Reading profile file …' }}</p>
        <div v-if="profilePreview" class="profile-preview">
          <h4>{{ de ? 'Profilvorschau' : 'Profile preview' }}</h4>
          <p>{{ de ? 'In der Datei' : 'In this file' }}: {{ profilePreview.incoming.favorites }} {{ de ? 'Favoriten' : 'favourites' }}, {{ profilePreview.incoming.filters }} {{ de ? 'Filter' : 'filters' }}.</p>
          <p>{{ de ? 'Bisher in diesem Browser' : 'Currently in this browser' }}: {{ profilePreview.current.favorites }} {{ de ? 'Favoriten' : 'favourites' }}, {{ profilePreview.current.filters }} {{ de ? 'Filter' : 'filters' }}.</p>
          <details v-if="profilePreview.filters.length" class="profile-filter-details">
            <summary>{{ de ? 'Filter und Namenskonflikte prüfen' : 'Review filters and name conflicts' }}</summary>
            <ul>
              <li v-for="row in profilePreview.filters" :key="row.name">
                <strong>{{ row.name }}</strong> · {{ profileRowLabel(row.state) }}
                <div v-if="row.state === 'changed'">{{ de ? 'Bisher' : 'Current' }}: {{ profileCriteriaLabel(row.previous) }}</div>
                <div>{{ de ? 'Aus der Datei' : 'From file' }}: {{ profileCriteriaLabel(row.incoming) }}</div>
              </li>
            </ul>
          </details>
          <details v-if="profilePreview.favorites.length" class="profile-favorite-details">
            <summary>{{ de ? 'Favoriten prüfen' : 'Review favourites' }}</summary>
            <ol :start="profilePage * profilePageSize + 1">
              <li v-for="row in profileFavoriteRows" :key="row.id"><code>{{ row.id }}</code> · {{ profileFigureName(row.id) }} · {{ profileRowLabel(row.state) }}</li>
            </ol>
            <div v-if="profilePreview.favorites.length > profilePageSize" class="preset-actions">
              <button type="button" :disabled="profilePage === 0" @click="profilePage--">{{ de ? 'Vorherige Favoriten' : 'Previous favourites' }}</button>
              <span>{{ profilePage + 1 }} / {{ Math.ceil(profilePreview.favorites.length / profilePageSize) }}</span>
              <button type="button" :disabled="(profilePage + 1) * profilePageSize >= profilePreview.favorites.length" @click="profilePage++">{{ de ? 'Weitere Favoriten' : 'More favourites' }}</button>
            </div>
          </details>
          <label class="profile-policy">{{ de ? 'Wie soll das Profil übernommen werden?' : 'How should this profile be applied?' }}
            <select v-model="profileMode" :disabled="profileSaving">
              <option value="">{{ de ? 'Bitte ausdrücklich auswählen' : 'Choose an option' }}</option>
              <option value="merge">{{ de ? 'Zusammenführen · vorhandene Filter behalten' : 'Merge · keep existing filters' }}</option>
              <option value="replace">{{ de ? 'Ersetzen · nur das Profil aus der Datei behalten' : 'Replace · keep only the profile from this file' }}</option>
            </select>
          </label>
          <template v-if="profilePlan">
            <p>{{ profileMode === 'merge'
              ? (de ? 'Neue Favoriten und Filter werden ergänzt. Gleichnamige Filter behalten ihre bisherigen Einstellungen.' : 'New favourites and filters are added. Filters with an existing name keep their current settings.')
              : (de ? 'Das lokale Favoriten- und Filterprofil wird vollständig durch die Datei ersetzt. Einträge, die in der Datei fehlen, werden entfernt.' : 'The file replaces the entire local favourites and filter profile. Entries missing from the file are removed.') }}</p>
            <dl class="profile-counts">
              <dt>{{ de ? 'Favoriten hinzufügen / entfernen' : 'Favourites to add / remove' }}</dt><dd>{{ profilePlan.favoritesAdded }} / {{ profilePlan.favoritesRemoved }}</dd>
              <dt>{{ de ? 'Filter hinzufügen / ersetzen / entfernen' : 'Filters to add / replace / remove' }}</dt><dd>{{ profilePlan.filtersAdded }} / {{ profilePlan.filtersReplaced }} / {{ profilePlan.filtersRemoved }}</dd>
              <dt>{{ de ? 'Abweichende gleichnamige Filter behalten' : 'Conflicting named filters to keep' }}</dt><dd>{{ profilePlan.conflictsKept }}</dd>
              <dt>{{ de ? 'Ergebnis: Favoriten / Filter' : 'Result: favourites / filters' }}</dt><dd>{{ profilePlan.favoritesTotal }} / {{ profilePlan.filtersTotal }}</dd>
            </dl>
            <p v-if="!profilePlan.allowed" role="status">{{ de ? 'Das Ergebnis überschreitet 4.096 Favoriten oder 80 Filter. Wähle Ersetzen oder verkleinere das Profil.' : 'The result exceeds 4,096 favourites or 80 filters. Choose Replace or reduce the profile.' }}</p>
          </template>
          <button type="button" :disabled="profileSaving || !profilePlan?.allowed" @click="applyProfile">{{ profileSaving ? (de ? 'Profil wird übernommen …' : 'Applying profile …') : (de ? 'Profil jetzt übernehmen' : 'Apply profile now') }}</button>
        </div>
        <button v-if="profilePreview || profileLoading" type="button" :disabled="profileSaving" @click="cancelProfile">{{ de ? 'Profilimport abbrechen' : 'Cancel profile import' }}</button>
        <p v-if="profileFeedback" class="profile-feedback" role="status">{{ profileFeedback[de ? 0 : 1] }}</p>
      </details>
    </details>
    <p v-if="preferenceMessage" role="status">{{ preferenceMessage[de ? 0 : 1] }}</p>
    <button v-if="query || activeFilters" type="button" class="reset-filters" @click="resetFilters">{{ de ? 'Suche und Filter zurücksetzen' : 'Reset search and filters' }}</button>
    <FigureAnnouncements v-if="announcements.length" :groups="announcements" :de="de" :expanded="Boolean(query.trim() || series || gameId)" />
    <div v-if="selectedId" ref="detailAnchor" tabindex="-1" class="selected-detail">
      <div class="selection-toolbar"><span>{{ de ? 'Ausgewählte Figur' : 'Selected figure' }}</span><button type="button" @click="closeDetails">{{ de ? 'Details schließen' : 'Close details' }}</button></div>
      <FigureDetails :key="selectedId" :id="selectedId" :catalogue-entry="data.entries.find(entry=>entry.id===selectedId)" :image-commit="data.commit" />
    </div>
    <LocalTagInspector :catalogue="data" />
    <FigureLinkSettings :de="de" />
    <div ref="resultAnchor" tabindex="-1" class="result-bar"><p aria-live="polite"><strong>{{ result.total }}</strong> {{ announcements.length && !result.total ? (de ? 'Treffer mit Katalog-ID' : 'results with a catalogue ID') : (de ? 'Treffer' : 'results') }} <span v-if="result.total">· {{ de ? 'Seite' : 'Page' }} {{ result.page }}/{{ result.pages }}</span></p></div>
    <p v-if="!result.total" class="empty-result">{{ announcements.length
      ? (de ? 'Treffer stehen oben unter „Figuren und Erscheinungstermine“.' : 'See matching figures under “Figure release dates” above.')
      : (de ? 'Keine passenden Figuren. Versuche einen kürzeren Suchbegriff oder setze die Filter zurück.' : 'No matching figures. Try a shorter search or reset the filters.') }}</p>
    <ul class="entries">
      <li v-for="entry in result.entries" :key="entry.id" :class="['presence-' + presenceFor(entry.id).state, { selected: selectedId === entry.id }]" :data-presence="presenceFor(entry.id).state">
        <div v-if="showImages" class="entry-picture">
          <img v-if="!failedImages.has(imageFor(entry.id))" :key="imageFor(entry.id)" :src="imageFor(entry.id)" :alt="entry.name" width="160" height="140" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous" @error="imageFailed(entry.id, $event)" />
          <span v-else class="image-placeholder"><span aria-hidden="true">◇</span>{{ de ? 'Bild nicht verfügbar' : 'Image unavailable' }}</span>
        </div>
        <button type="button" class="web-favorite" :aria-pressed="favoriteSet.has(entry.id)"
          :aria-label="(de ? 'Webfavorit · ' : 'Web favourite · ') + entry.name"
          @click="toggleFavorite(entry.id, $event)">
          <span aria-hidden="true">{{ favoriteSet.has(entry.id) ? '★' : '☆' }}</span> {{ de ? 'Webfavorit' : 'Web favourite' }}
        </button>
        <FigureDownload :entry="entry" :de="de" :blocked="blocked" :open-import="openImport" />
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
    <nav v-if="result.total" :aria-label="de ? 'Katalogseiten' : 'Catalogue pages'"><button type="button" :disabled="result.page <= 1" @click="changePage(result.page - 1)">{{ de ? 'Zurück' : 'Previous' }}</button><span>{{ result.page }} / {{ result.pages }}</span><button type="button" :disabled="result.page >= result.pages" @click="changePage(result.page + 1)">{{ de ? 'Weiter' : 'Next' }}</button></nav>
    <details class="source-details"><summary>{{ de ? 'Quelle und Datenstand' : 'Source and data snapshot' }}</summary><p class="source">{{ de ? 'Geprüfter Datenabruf' : 'Snapshot checked' }}: {{ data.checkedDate }} · <a :href="data.sourceUrl" target="_blank" rel="noopener noreferrer">AmiiboAPI · {{ data.commit.slice(0, 8) }}</a></p><p class="source">{{ de ? 'Stand der Quelle, keine Vollständigkeitsgarantie. Varianten können zusätzliche Daten erfordern. Die Vorschau verbindet sich nicht mit einem Allmiibo.' : 'Source snapshot, not guaranteed complete. Variants may require additional data. The preview does not connect to an Allmiibo.' }}</p></details>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import baseline from '../data/catalogue.json';
import { filterCatalogue, catalogueMatcher, cataloguePage, releaseLabel } from '../lib/catalogue.js';
import { buildCollectionPresence, collectionPresenceFor } from '../lib/collection-presence.js';
import { publicFigureImage } from '../lib/figure-info.js';
import { announcementGroups } from '../data/announced-figures.js';
import { gameGuides } from '../data/game-guides.js';
import GameGuide from './GameGuide.vue';
import FigureDownload from './FigureDownload.vue';
import FigureLinkSettings from './FigureLinkSettings.vue';
import { CATALOGUE_PREFERENCES_KEY, CATALOGUE_PROFILE_FILE_LIMIT, FILTER_NAME_LIMIT, readCataloguePreferences, updateCataloguePreferences, exportCatalogueProfile, previewCatalogueProfile, importCatalogueProfile } from '../lib/catalogue-preferences.js';
import { saveBlob } from '../lib/browser-tools.js';
import FigureAnnouncements from './FigureAnnouncements.vue';
import FigureDetails from './FigureDetails.vue';
import LocalTagInspector from './LocalTagInspector.vue';
const props = defineProps({ catalogue: Object, blocked: Boolean, openImport: Function, collectionReport: Object, collectionStale: Boolean, collectionHistorical: Boolean, collectionObservedAt: String });
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
const gameId = ref('');
const selectedGame = computed(() => gameGuides.find(game => game.id === gameId.value));
const favoritesOnly = ref(false), newFilterName = ref(''), selectedFilterName = ref('');
const preferences = ref({ favorites: [], filters: [] }), preferenceMessage = ref(null);
const favoriteSet = computed(() => new Set(preferences.value.favorites));
const selectedPreset = computed(() => preferences.value.filters.find(row => row.name === selectedFilterName.value));
const currentCriteria = computed(() => ({ query:query.value, series:series.value, kind:kind.value, presence:presenceFilter.value, knownOnly:knownOnly.value, favoritesOnly:favoritesOnly.value, game:gameId.value }));
function reloadPreferences(event) {
  if (event && event.key !== null && event.key !== CATALOGUE_PREFERENCES_KEY) return;
  try {
    preferences.value = readCataloguePreferences();
    if (!selectedPreset.value) selectedFilterName.value = '';
  } catch { preferenceMessage.value = ['Favoriten und Filter konnten nicht gelesen werden.', 'Could not read favourites and filters.']; }
  if (event && profilePreview.value) refreshProfilePreview();
}
onMounted(() => {
  if (!globalThis.window) return;
  reloadPreferences();
  window.addEventListener?.('storage', reloadPreferences);
});
onBeforeUnmount(() => {
  globalThis.window?.removeEventListener?.('storage', reloadPreferences);
  profileAlive = false; profileRequest++; profileController?.abort();
});
async function changePreference(change) {
  try {
    const write = () => updateCataloguePreferences(change);
    const locks = globalThis.window?.navigator?.locks;
    preferences.value = locks ? await locks.request(CATALOGUE_PREFERENCES_KEY, write) : write();
    if (profilePreview.value) refreshProfilePreview();
    preferenceMessage.value = null;
    if (change.op === 'create') { selectedFilterName.value = change.name.trim().normalize('NFC'); newFilterName.value = ''; }
    if (change.op === 'remove') selectedFilterName.value = '';
    if (change.op !== 'favorite') preferenceMessage.value = change.op === 'remove' ? ['Filter gelöscht.', 'Filter deleted.'] : ['Filter gespeichert.', 'Filter saved.'];
  } catch (error) {
    const messages = {
      PREF_EXISTS: ['Dieser Filtername wird bereits verwendet.', 'This filter name is already in use.'],
      PREF_NAME: ['Bitte einen gültigen Filternamen eingeben.', 'Enter a valid filter name.'],
      PREF_MISSING: ['Dieser Filter wurde bereits entfernt.', 'This filter has already been removed.'],
      PREF_LIMIT: ['Die Höchstzahl für Favoriten oder Filter ist erreicht.', 'The favourites or filter limit has been reached.']
    };
    preferenceMessage.value = messages[error.code] || ['Der Browser konnte die Änderung nicht speichern.', 'The browser could not save the change.'];
  }
}
const profilePreview = shallowRef(null), profileMode = ref(''), profilePage = ref(0), profilePageSize = 20;
const profileLoading = ref(false), profileSaving = ref(false), profileFeedback = ref(null);
let profileTextValue = '', profileRequest = 0, profileAlive = true, profileController = null;
const profilePlan = computed(() => profilePreview.value?.modes[profileMode.value] || null);
const profileFavoriteRows = computed(() => profilePreview.value?.favorites.slice(profilePage.value * profilePageSize, (profilePage.value + 1) * profilePageSize) || []);
const profileErrors = {
  PREF_PROFILE_FORMAT: ['Die Datei ist unvollständig oder hat kein unterstütztes Profilformat.', 'The file is incomplete or has an unsupported profile format.'],
  PREF_FORMAT: ['Das Profil enthält ungültige oder doppelte Favoriten oder Filter.', 'The profile contains invalid or duplicate favourites or filters.'],
  PREF_NAME: ['Das Profil enthält einen ungültigen Filternamen.', 'The profile contains an invalid filter name.'],
  PREF_PROFILE_LIMIT: ['Die Profildatei überschreitet 512 KiB.', 'The profile file exceeds 512 KiB.'],
  PREF_LIMIT: ['Das Profil überschreitet 4.096 Favoriten oder 80 Filter.', 'The profile exceeds 4,096 favourites or 80 filters.'],
  PREF_STORAGE: ['Der Browserspeicher ist gesperrt oder voll. Das Profil wurde nicht übernommen.', 'Browser storage is blocked or full. The profile was not applied.'],
  PREF_STALE: ['Favoriten oder Filter haben sich geändert. Prüfe die neue Vorschau und wähle erneut aus.', 'Favourites or filters changed. Review the new preview and choose again.'],
  PREF_CANCELLED: ['Profilimport abgebrochen.', 'Profile import cancelled.'],
};
const profileError = error => profileErrors[error?.code] || ['Das Profil konnte nicht verarbeitet werden.', 'The profile could not be processed.'];
const profileRowLabel = state => ({ added:['Neu', 'New'], same:['Unverändert', 'Unchanged'], changed:['Gleicher Name, andere Einstellungen', 'Same name, different settings'] })[state]?.[de.value ? 0 : 1] || '';
const profileFigureName = id => data.value.entries.find(entry => entry.id === id)?.name || (de.value ? 'ID nicht im aktuellen Katalog' : 'ID not in the current catalogue');
function profileCriteriaLabel(value) {
  const fields = [];
  if (value.query) fields.push((de.value ? 'Suche: ' : 'Search: ') + value.query);
  if (value.series) fields.push((de.value ? 'Serie: ' : 'Series: ') + value.series);
  if (value.kind) fields.push((de.value ? 'Art: ' : 'Type: ') + value.kind);
  if (value.game) fields.push((de.value ? 'Spiel: ' : 'Game: ') + (gameGuides.find(game => game.id === value.game)?.title || value.game));
  if (value.presence) fields.push(({ observed:['Auf dem Gerät gefunden', 'Found on device'], present:['Vorhanden', 'Present'], missing:['Nicht gefunden', 'Not found'], attention:['Prüfhinweis', 'Needs inspection'], unconfirmed:['Unbestätigt / veraltet', 'Unconfirmed / outdated'] })[value.presence][de.value ? 0 : 1]);
  if (value.knownOnly) fields.push(de.value ? 'IDs mit Firmware-Namen' : 'IDs with firmware names');
  if (value.favoritesOnly) fields.push(de.value ? 'Nur Webfavoriten' : 'Web favourites only');
  return fields.join(' · ') || (de.value ? 'Alle Einträge' : 'All entries');
}
function refreshProfilePreview() {
  if (!profileTextValue) return;
  profileMode.value = ''; profilePage.value = 0;
  try { profilePreview.value = previewCatalogueProfile(profileTextValue); profileFeedback.value = profileErrors.PREF_STALE; }
  catch (error) { profilePreview.value = null; profileFeedback.value = profileError(error); }
}
function downloadProfile() {
  if (profileSaving.value) return;
  try {
    saveBlob(new Blob([exportCatalogueProfile()], { type:'application/json' }), de.value ? 'Allmiibo-Katalogprofil.json' : 'Allmiibo-Catalogue-Profile.json');
    profileFeedback.value = ['Download der Profildatei angefordert.', 'Profile file download requested.'];
  } catch (error) { profileFeedback.value = profileError(error); }
}
async function loadProfileFile(event) {
  if (profileSaving.value) return;
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  const request = ++profileRequest;
  profilePreview.value = null; profileTextValue = ''; profileMode.value = ''; profilePage.value = 0;
  profileFeedback.value = null; profileLoading.value = true;
  try {
    if (!Number.isFinite(file.size) || file.size < 0 || file.size > CATALOGUE_PROFILE_FILE_LIMIT) throw { code:'PREF_PROFILE_LIMIT' };
    const bytes = await file.arrayBuffer();
    if (!profileAlive || request !== profileRequest) return;
    if (bytes.byteLength > CATALOGUE_PROFILE_FILE_LIMIT) throw { code:'PREF_PROFILE_LIMIT' };
    let text;
    try { text = new TextDecoder('utf-8', { fatal:true }).decode(bytes); }
    catch { throw { code:'PREF_PROFILE_FORMAT' }; }
    profilePreview.value = previewCatalogueProfile(text); profileTextValue = text;
  } catch (error) {
    if (profileAlive && request === profileRequest) profileFeedback.value = profileError(error);
  } finally {
    if (profileAlive && request === profileRequest) profileLoading.value = false;
  }
}
function cancelProfile() {
  if (profileSaving.value) return;
  profileRequest++; profileLoading.value = false; profilePreview.value = null; profileTextValue = ''; profileMode.value = '';
  profileFeedback.value = profileErrors.PREF_CANCELLED;
}
async function applyProfile() {
  if (profileSaving.value || !profilePreview.value || !profilePlan.value?.allowed) return;
  profileSaving.value = true; profileController = new AbortController();
  try {
    const result = await importCatalogueProfile(profilePreview.value, profileMode.value, { signal:profileController.signal });
    if (!profileAlive) return;
    preferences.value = result.preferences;
    if (!selectedPreset.value) selectedFilterName.value = '';
    profilePreview.value = null; profileTextValue = ''; profileMode.value = '';
    preferenceMessage.value = null;
    profileFeedback.value = result.changed ? ['Profil in diesem Browser übernommen.', 'Profile applied in this browser.'] : ['Dieses Profil ist bereits gespeichert.', 'This profile is already saved.'];
  } catch (error) {
    if (!profileAlive) return;
    profileFeedback.value = profileError(error);
    if (error.code === 'PREF_STALE') { reloadPreferences(); refreshProfilePreview(); }
  } finally { profileSaving.value = false; profileController = null; }
}
async function toggleFavorite(id, event) {
  const trigger = event.currentTarget;
  await changePreference({ op:'favorite', id, enabled:!favoriteSet.value.has(id) });
  await nextTick();
  if (!trigger.isConnected && favoritesOnly.value && !globalThis.document?.activeElement?.closest('.catalogue')) resultAnchor.value?.focus?.({preventScroll:true});
}
function applyPreset() {
  const preset = selectedPreset.value;
  if (!preset) return;
  const value = preset.criteria;
  gameId.value = value.game || '';
  query.value = value.query; series.value = value.series; kind.value = value.kind; presenceFilter.value = value.presence;
  favoritesOnly.value = value.favoritesOnly; knownOnly.value = value.knownOnly;
  page.value = 1; selectedId.value = null;
  preferenceMessage.value = ['Filter angewendet · ' + preset.name, 'Filter applied · ' + preset.name];
}
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
const activeFilters = computed(() => Number(Boolean(series.value)) + Number(Boolean(kind.value)) + Number(knownOnly.value) + Number(Boolean(presenceFilter.value)) + Number(favoritesOnly.value) + Number(Boolean(gameId.value)));
const announcements = computed(() => {
  if (favoritesOnly.value || knownOnly.value || presenceFilter.value || (kind.value && kind.value !== 'Figure')) return [];
  const matches = catalogueMatcher(query.value);
  // Suppress duplicate release cards only when the same reviewed ID is in
  // the matching catalogue results; retain German aliases for other searches.
  const matchingCatalogueIds = new Set(filtered.value.map(entry => entry.id));
  return announcementGroups.filter(group => (!series.value || group.series === series.value) && (!gameId.value || group.game === gameId.value)).map(group => ({
    ...group,
    figures: group.figures.filter(figure => (!figure.catalogueId || !matchingCatalogueIds.has(figure.catalogueId)) &&
      matches(figure.en, figure.de, group.series, figure.proposedId, figure.catalogueId)),
  })).filter(group => group.figures.length);
});
function resetFilters() { query.value = ''; series.value = ''; kind.value = ''; gameId.value = ''; knownOnly.value = false; presenceFilter.value = ''; favoritesOnly.value = false; selectedFilterName.value = ''; preferenceMessage.value = null; }
async function closeDetails() { selectedId.value = null; await nextTick(); if (selectedTrigger?.isConnected) selectedTrigger.focus?.(); else searchInput.value?.focus?.(); }
async function selectEntry(id, event) { if(props.blocked)return; emit('select-entry',data.value.entries.find(entry=>entry.id===id)); selectedTrigger = event?.currentTarget || null; selectedId.value = id; await nextTick(); detailAnchor.value?.focus?.(); }
const today = new Date().toISOString().slice(0, 10);
const seriesOptions = computed(() => [...new Set([
  ...data.value.entries.map(entry => entry.series),
  ...announcementGroups.map(group => group.series),
])].sort());
const typeOptions = computed(() => [...new Set(data.value.entries.map(entry => entry.type))].sort());
const filtered = computed(() => filterCatalogue(data.value.entries, { query: query.value, series: series.value, kind: kind.value, knownOnly: knownOnly.value }).filter(entry => {
  if (gameId.value && !selectedGame.value?.ids.includes(entry.id)) return false;
  if (favoritesOnly.value && !favoriteSet.value.has(entry.id)) return false;
  if (!presenceFilter.value) return true;
  const state = presenceFor(entry.id).state;
  if (presenceFilter.value === 'observed') return state === 'present' || state === 'attention';
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
watch([query, series, kind, gameId, knownOnly, presenceFilter, favoritesOnly], () => { page.value = 1; selectedId.value = null; });
watch(() => result.value.page, value => { page.value = value; });
watch([showImages, () => data.value.commit, () => result.value.page], () => { failedImages.value = new Set(); });
</script>
<style scoped>
/* Header badges may move onto a second line when users enlarge text. */
.catalogue { min-width:0; overflow-wrap:anywhere; }
.catalogue-heading { flex-wrap:wrap; }
.catalogue-heading > *, .entries li { min-width:0; }
.catalogue .count-badge { max-width:100%; white-space:normal; box-sizing:border-box; }
.catalogue input, .catalogue select { min-width:0; }
.game-filter { display:grid; gap:6px; flex:1 1 245px; max-width:380px; color:#465f74; font-size:.8rem; }
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
.entries { list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:10px; margin:10px 0 16px; } .entries li { display:flex; flex-direction:column; gap:6px; border:1px solid #d9e3ec; background:white; border-radius:11px; padding:14px; overflow-wrap:anywhere; } .entries li.selected { border-color:#719fc4; box-shadow:0 0 0 2px #dcebf6; } .entry-series { font-size:.8rem; color:#526575; } code { font-size:.75rem; color:#60788b; } small { color:#60788b; font-size:.72rem; line-height:1.45; } .firmware-name { margin:2px 0 4px; } .entries button { margin-top:auto; background:#f6f9fc; }
.entries li.presence-present { border:3px solid #23834f; background:#f4fbf6; } .entries li.presence-present .presence-label { color:#176c41; }
.entries li.presence-attention { border:3px solid #c47a16; background:#fffaf1; } .entries li.presence-attention .presence-label { color:#92500a; }
.entries li.presence-missing { border:3px solid #c24343; background:#fff7f7; } .entries li.presence-missing .presence-label { color:#aa3030; }
.warning-reasons { font-size:.76rem; line-height:1.4; color:#75480b; } .warning-reasons p { margin:0 0 .25em; }
.entries li.presence-stale { border-style:dashed; }
nav { display:flex; justify-content:center; align-items:center; gap:14px; font-size:.8rem; color:#60788b; } .source-details { border-top:1px solid #dce5ed; margin-top:16px; padding-top:5px; } .source { font-size:.78rem; overflow-wrap:anywhere; color:#526575; line-height:1.5; margin:5px 0 8px; } .empty-result { border:1px dashed #bacddd; border-radius:10px; padding:20px; background:white; font-size:.9rem; line-height:1.5; }
/* App's workspace navigation sits above the results on narrow screens. */
@media(max-width:650px) { .result-bar { scroll-margin-top:160px; } }
@media(max-width:480px) { .catalogue { padding:14px; border-radius:12px; } h3 { font-size:1.16rem; } .count-badge { font-size:.7rem; padding:5px 8px; } .entries { grid-template-columns:1fr; } .selection-toolbar { align-items:flex-start; } }
.saved-filters label:not(.known) { display:grid; gap:.3rem; margin:.5rem 0; }
.saved-filters input[type=text] { min-width:0; width:100%; max-width:24rem; min-height:44px; padding:.4rem .65rem; font:inherit; box-sizing:border-box; }
.preset-actions { display:flex; flex-wrap:wrap; gap:.35rem; margin-bottom:.55rem; }
.entries button.web-favorite { align-self:flex-start; margin:0; min-height:44px; }
.entries button.web-favorite[aria-pressed=true] { color:#5c3900; background:#fff1b9; border-color:#9c711f; }
.profile-transfer { margin:.7rem 0; border-top:1px solid #d3dee8; overflow-wrap:anywhere; }
.profile-transfer p, .profile-transfer li { font-size:.8rem; line-height:1.5; }
.profile-transfer input[type=file] { width:100%; max-width:100%; min-width:0; box-sizing:border-box; }
.profile-preview { margin:.7rem 0; padding:.8rem; border:1px solid #a9c6c4; border-radius:10px; min-width:0; }
.profile-preview h4 { margin:0 0 .6rem; }
.profile-preview li { margin:.5rem 0; }
.profile-counts { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.3rem .7rem; }
.profile-counts dt, .profile-counts dd { margin:0; font-size:.8rem; }
.profile-feedback { padding:.5rem 0; }
</style>
