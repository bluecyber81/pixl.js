<template>
  <details class="local-inspector">
    <summary>{{ de ? 'Eigene Figurendatei lokal prüfen' : 'Inspect your figure file locally' }}</summary>
    <p>{{ de ? 'Bleibt lokal im Browser, ohne Upload oder Änderungen. Unterstützt: 532, 540, 572 und 2048 Bytes.' : 'Stays local in this browser, without upload or changes. Supported: 532, 540, 572 and 2048 bytes.' }}</p>
    <label>{{ de ? 'Figurendatei auswählen' : 'Select figure file' }} <input type="file" accept=".bin,application/octet-stream" @change="inspectFile" /></label>
    <p v-if="loading" role="status">{{ de ? 'Datei wird lokal gelesen …' : 'Reading file locally …' }}</p>
    <p v-if="readError" role="alert">{{ de ? 'Die Datei konnte nicht vollständig gelesen werden. Bitte erneut auswählen.' : 'The file could not be read completely. Please select it again.' }}</p>
    <section v-if="inspection" aria-live="polite">
      <template v-if="!inspection.supportedLength">
        <p><strong>{{ de ? 'Dateiformat nicht unterstützt' : 'Unsupported file format' }}</strong> · {{ inspection.size }} Bytes</p>
        <p>{{ de ? 'Das ist kein unterstütztes Rohdateiformat. Andere Formate oder Archive werden nicht als defekte amiibo bewertet.' : 'This is not a supported raw file format. Other formats or archives are not classified as broken amiibo.' }}</p>
      </template>
      <FigureDetails v-else :key="readGeneration" :id="inspection.id" :inspection="inspection" source="local" :catalogue="catalogueData" />
      <button type="button" @click="clear">{{ de ? 'Prüfergebnis entfernen' : 'Clear inspection' }}</button>
    </section>
  </details>
</template>
<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import FigureDetails from './FigureDetails.vue';
import { inspectLocalTagFile } from '../lib/figure-info.js';
import catalogueBaseline from '../data/catalogue.json';
const props = defineProps({ catalogue: Object });
const catalogueData = computed(() => Array.isArray(props.catalogue?.entries) ? props.catalogue : catalogueBaseline);
const { locale } = useI18n();
const de = computed(() => locale.value.startsWith('de'));
const inspection = ref(null), loading = ref(false), readError = ref(false), readGeneration = ref(0);
function clear() { readGeneration.value++; inspection.value = null; loading.value = false; readError.value = false; }
onBeforeUnmount(clear);
async function inspectFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  clear();
  if (!file) return;
  const generation = readGeneration.value;
  loading.value = true;
  try {
    const result = await inspectLocalTagFile(file);
    if (generation === readGeneration.value) inspection.value = result;
  } catch {
    if (generation === readGeneration.value) readError.value = true;
  } finally {
    if (generation === readGeneration.value) loading.value = false;
  }
}
</script>
<style scoped>
.local-inspector { margin:14px 0; border:1px solid #cdd7df; padding:10px 12px; border-radius:8px; background:white; } summary { cursor:pointer; font-weight:500; min-height:24px; } p,li { line-height:1.5; font-size:.8rem; } label { display:flex; flex-wrap:wrap; gap:10px; align-items:center; } input { max-width:100%; } button { min-height:40px; padding:8px 14px; cursor:pointer; }
</style>
