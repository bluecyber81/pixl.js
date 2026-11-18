<template>
  <section class="game-folder">
    <p>{{ de ? 'Wähle Einträge aus der LCD-Spieldatenbank. Auf dem Gerät erscheinen sie unter Amiibo-Datenbank → Favoriten. Übertragen werden nur die öffentlichen IDs.' : 'Choose entries from the LCD game database. On your device they appear under Amiibo database → Favourites. Only public IDs are transferred.' }}</p>
    <label>{{ de ? 'Spiel oder Spielgruppe' : 'Game or game group' }}
      <select v-model="gameId" :disabled="pending"><option :value="0">—</option><option v-for="g in games" :key="g.id" :value="g.id">{{ g.label }} ({{ g.figures.size }})</option></select>
    </label>
    <template v-if="game">
      <label>{{ de ? 'Favoritenordner auf dem LCD (max. 25 UTF-8-Bytes)' : 'LCD favourites folder (max. 25 UTF-8 bytes)' }}
        <input v-model="folder" @input="customFolder = true" maxlength="25" :disabled="pending" placeholder="Zelda" /></label>
      <button v-if="customFolder" type="button" :disabled="pending" @click="useGameName">{{ de ? 'Spielnamen übernehmen' : 'Use game name' }}</button>
      <label>{{ de ? 'Figuren nach Name oder ID suchen' : 'Find figures by name or ID' }}
        <input v-model="query" type="search" /></label>
      <fieldset :disabled="pending"><legend>{{ de ? 'Figuren auswählen' : 'Select figures' }} · {{ selected.length }} / {{ game.figures.size }}</legend>
        <div class="selection-actions">
          <button type="button" :disabled="!hasUnselectedMatches" @click="selectMatches">{{ de ? 'Alle Treffer markieren' : 'Select all matches' }}</button>
          <button type="button" :disabled="!selected.length" @click="selected = []">{{ de ? 'Auswahl leeren' : 'Clear selection' }}</button>
        </div>
        <div class="choice-list"><label v-for="[id,name] in visible" :key="id">
          <input v-model="selected" type="checkbox" :value="id" /><span>{{ name }} <small>{{ id }}</small></span>
        </label></div>
        <p v-if="!visible.length">{{ de ? 'Keine Treffer' : 'No matches' }}</p>
      </fieldset>
      <p v-if="!connected">{{ de ? 'Verbinde dein LCD im Dateiübertragungsmodus für die Gerätevorschau.' : 'Connect your LCD in file-transfer mode for a device preview.' }}</p>
      <p v-else-if="!supported" role="status">{{ labels.FAV_BOARD }}</p>
      <button type="button" :disabled="!ready" @click="preview">{{ de ? 'Ordner auf dem Gerät prüfen' : 'Preview device folder' }}</button>
      <template v-if="plan">
        <p>{{ plan.path }} · {{ plan.exists ? (de ? 'vorhandener Ordner' : 'existing folder') : (de ? 'neuer Ordner' : 'new folder') }}</p>
        <p class="preview-summary" role="status">
          {{ plan.rows.length }} {{ de ? 'ausgewählt' : 'selected' }} · {{ counts.new }} {{ de ? 'neu' : 'new' }} · {{ counts.present }} {{ states.present }}<template v-if="counts.conflict"> · {{ counts.conflict }} {{ de ? 'mit Namenskonflikt' : 'with name conflicts' }}</template>
        </p>
        <ul class="preview-list"><li v-for="row in plan.rows" :key="row.id"><span>{{ game.figures.get(row.id) }}</span> · <code>{{ row.id }}</code> · {{ states[row.state] }}</li></ul>
        <button type="button" :disabled="!ready || !counts.new" @click="apply">{{ de ? 'Neue Favoriten hinzufügen' : 'Add new favourites' }} ({{ counts.new }})</button>
      </template>
    </template>
    <p v-if="message" role="status" aria-live="polite">{{ message }}</p>
  </section>
</template>
<script setup>
import {computed, ref, shallowRef, watch} from 'vue';
import usage from '../data/figure-usage.json';
import {applyDeviceFolder, deviceFolderSpec, deviceGames, previewDeviceFolder, suggestedGameFolder} from '../lib/game-folder.js';
const props = defineProps({catalogue:Object, locale:String, connected:Boolean, supported:Boolean, blocked:Boolean,
  generation:Number, withSession:{type:Function, required:true}});
const de = computed(() => props.locale?.startsWith('de'));
const games = computed(() => deviceGames(usage,props.catalogue));
const gameId = ref(0), folder = ref(''), selected = ref([]), query = ref(''), plan = shallowRef(null);
const pending = ref(false), message = ref(''), customFolder = ref(false);
const game = computed(() => games.value.find(g => g.id === gameId.value));
const visible = computed(() => [...(game.value?.figures || [])].filter(([id,name]) =>
  (id+' '+name).toLowerCase().includes(query.value.trim().toLowerCase())).sort((a,b) => a[1].localeCompare(b[1])));
const ready = computed(() => !pending.value && !props.blocked && props.connected && props.supported && folder.value.length && selected.value.length);
const selectedIds = computed(() => new Set(selected.value));
const hasUnselectedMatches = computed(() => visible.value.some(([id]) => !selectedIds.value.has(id)));
const counts = computed(() => {
  const totals = {new:0, present:0, conflict:0};
  for (const row of plan.value?.rows || []) totals[row.state]++;
  return totals;
});
function selectMatches() {
  selected.value = [...new Set([...selected.value, ...visible.value.map(([id]) => id)])];
}
function useGameName() {
  customFolder.value = false;
  folder.value = game.value ? suggestedGameFolder(game.value) : '';
}
const states = computed(() => de.value ? {present:'schon vorhanden',new:'neu',conflict:'Namenskonflikt · übersprungen'} :
  {present:'already present',new:'new',conflict:'name conflict · skipped'});
const labels = computed(() => de.value ? {
  FAV_FOLDER_NAME:'Verwende einen gültigen Ordnernamen mit höchstens 25 UTF-8-Bytes.',
  FAV_FOLDER_BLOCKED:'Der Zielpfad ist gesperrt oder kein gültiger Ordner.', FAV_SELECTION:'Prüfe die Spiel- und Figurenauswahl.',
  FAV_BOARD:'Diese Funktion benötigt eine unterstützte LCD-Firmware mit überprüfbarer Boardkennung.',
  FAV_VERIFY:'Der neue Eintrag ließ sich beim Zurücklesen nicht bestätigen.', FAV_CONFLICT:'Der Ordner hat sich seit der Vorschau geändert.',
  UPLOAD_COLLISION:'Ein ähnlich geschriebener Name belegt den Zielpfad.', UPLOAD_METADATA:'Die Ordnerattribute lassen sich nicht sicher lesen.'
} : {
  FAV_FOLDER_NAME:'Use a valid folder name of at most 25 UTF-8 bytes.', FAV_FOLDER_BLOCKED:'The destination is blocked or is not a valid directory.',
  FAV_SELECTION:'Check the selected game and figures.', FAV_BOARD:'This feature requires supported LCD firmware with a verifiable board identity.',
  FAV_VERIFY:'Could not verify the new entry by reading it back.', FAV_CONFLICT:'The folder changed after preview.',
  UPLOAD_COLLISION:'A similar name occupies the destination.', UPLOAD_METADATA:'Cannot safely read the folder attributes.'
});
watch(gameId, () => {
  selected.value = [];
  query.value = '';
  if (!customFolder.value) useGameName();
});
watch([game,folder,selected], () => { plan.value=null; message.value=''; }, {flush:'sync'});
watch(() => props.generation, () => { plan.value=null; });
async function run(write, action) {
  if (!ready.value) return;
  const generation = props.generation;
  pending.value=true;
  message.value=de.value ? 'Gerät wird geprüft …' : 'Checking device …';
  try { await props.withSession(write, async session => { await action(session); session.assertSession(); }); }
  catch (error) {
    plan.value=null;
    const detail=labels.value[error.code] || (de.value ? 'Die Geräteanfrage konnte nicht abgeschlossen werden.' : 'The device request could not complete.');
    message.value = write ? detail+' '+(de.value ? 'Bestätigte neue Favoriten: ' : 'Verified new favourites: ')+(error.confirmed || 0)+
      (de.value ? '. Prüfe den Ordner erneut, um die Auswahl fortzusetzen.' : '. Preview the folder again to resume.') : detail;
  } finally { if (generation !== props.generation) plan.value=null; pending.value=false; }
}
function preview() {
  plan.value=null;
  return run(false, async session => {
    const result = await previewDeviceFolder(session,deviceFolderSpec(game.value,folder.value,selected.value));
    session.assertSession(); plan.value=result; message.value='';
  });
}
function apply() {
  const confirmed = plan.value;
  if (!confirmed || !counts.value.new) return;
  return run(true, async session => {
    const {added,skipped}=await applyDeviceFolder(session,confirmed, n => {
      message.value=(de.value ? 'Neue Favoriten bestätigt: ' : 'New favourites verified: ')+n;
    });
    session.assertSession(); plan.value=null;
    message.value=de.value ? `${confirmed.path} · ${added.length} neue Favoriten bestätigt, ${skipped.length + confirmed.rows.filter(r => r.state === 'present').length} bereits vorhanden.`
      : `${confirmed.path} · ${added.length} new favourites verified, ${skipped.length + confirmed.rows.filter(r => r.state === 'present').length} already present.`;
  });
}
</script>
<style scoped>
.game-folder { display:grid; gap:.75rem; padding:1rem 0; }
.game-folder p { margin:0; }
.game-folder label { display:grid; gap:.25rem; }
.game-folder select,.game-folder input { max-width:100%; min-width:0; }
.game-folder fieldset { min-width:0; }
.selection-actions { display:flex; flex-wrap:wrap; gap:.5rem; margin:.25rem 0 .6rem; }
.selection-actions button { min-height:2.75rem; }
.preview-summary { font-weight:600; }
.choice-list,.preview-list { max-height:15rem; overflow:auto; overscroll-behavior:contain; }
.choice-list label { display:flex; align-items:center; gap:.6rem; min-height:2.5rem; }
.choice-list small { display:block; font-family:monospace; }
.game-folder button { justify-self:start; }
</style>
