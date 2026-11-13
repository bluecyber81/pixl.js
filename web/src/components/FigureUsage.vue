<template>
  <section class="figure-usage" :class="{ compact }" :aria-label="de ? 'Kataloghinweise zur Figur' : 'Figure catalogue notes'">
    <div class="usage-heading">
      <h5>{{ de ? 'Kataloghinweise' : 'Catalogue notes' }}</h5>
      <p v-if="usageData.dataVersion" class="usage-version">{{ catalogueVersion }}</p>
    </div>
    <p v-if="rows.some(row => row.guideUrl)" class="usage-limit">{{ de ? 'Die Hinweise zu Breath of the Wild und Tears of the Kingdom sind mit Nintendo abgeglichen. Die übrigen Zuordnungen stammen aus dem Firmwarekatalog.' : 'The Breath of the Wild and Tears of the Kingdom notes were checked against Nintendo’s guides. Other associations come from the firmware catalogue.' }}</p>
    <p v-else class="usage-limit">{{ de ? 'Zuordnungen und Hinweise aus dem mitgelieferten Katalog. Keine Bestätigung der Spielkompatibilität oder Belohnungen.' : 'Associations and notes from the bundled catalogue. Game compatibility and rewards have not been verified.' }}</p>
    <p v-if="!rows.length" class="usage-empty">{{ de ? 'Für diese ID ist hier kein Kataloghinweis hinterlegt. Daraus lässt sich keine Aussage zur Spielunterstützung ableiten.' : 'No catalogue note is stored here for this ID. This does not establish whether a game supports it.' }}</p>
    <template v-else>
      <ul>
        <li v-for="row in visibleRows" :key="row.groupId">
          <strong>{{ row.label }}</strong>
          <p v-if="row.text" :lang="row.language">{{ row.text }}</p>
          <p v-else class="usage-empty">{{ de ? 'Katalogzuordnung ohne deutschen oder englischen Nutzungshinweis.' : 'Catalogue association without a German or English usage note.' }}</p>
          <span v-if="row.translated" class="usage-language">{{ de ? 'Redaktionelle Übersetzung aus dem Englischen' : 'Editorial translation from English' }}</span>
          <span v-else-if="de && row.language === 'en'" class="usage-language">Englischer Quelltext · keine deutsche Übersetzung hinterlegt</span>
          <details v-if="row.original" class="usage-original"><summary>{{ de ? 'Englischen Quelltext anzeigen' : 'Show original English text' }}</summary><p lang="en">{{ row.original }}</p></details>
          <a :href="row.guideUrl || row.sourceUrl" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">{{ row.guideUrl ? (de ? 'Spielhinweis von Nintendo' : 'Nintendo game guide') : (de ? 'Quelle: Firmwarekatalog' : 'Source: firmware catalogue') }}</a>
        </li>
      </ul>
      <button v-if="compact && rows.length > 3" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? (de ? 'Weniger anzeigen' : 'Show fewer') : (de ? `Alle ${rows.length} Zuordnungen anzeigen` : `Show all ${rows.length} associations`) }}</button>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import usageData from '../data/figure-usage.json';
import { figureUsage } from '../lib/figure-usage.js';
const props = defineProps({ id: { type: String, default: null }, locale: { type: String, default: 'de_DE' }, compact: Boolean });
const { t } = useI18n();
const de = computed(() => props.locale.startsWith('de'));
const catalogueVersion = computed(() => t('figureUsage.catalogueVersion', { version: usageData.dataVersion }, { locale: de.value ? 'de_DE' : props.locale }));
const rows = computed(() => figureUsage(props.id, usageData, props.locale));
const expanded = ref(false);
const visibleRows = computed(() => props.compact && !expanded.value ? rows.value.slice(0, 3) : rows.value);
watch(() => props.id, () => { expanded.value = false; }, { flush: 'sync' });
</script>
<style scoped>
.figure-usage { margin:16px 0; border-top:1px solid #dce5eb; padding-top:12px; overflow-wrap:anywhere; }
h5 { margin:0 0 8px; font-size:.9rem; color:#284d63; }
.usage-heading { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 12px; margin:0 0 8px; }
.usage-heading h5 { margin:0; }
.usage-version { margin:0; max-width:100%; color:#617282; font-size:.73rem; line-height:1.5; overflow-wrap:anywhere; }
.usage-limit,.usage-empty { color:#617282; font-size:.78rem; line-height:1.5; }
.usage-limit { margin:0 0 12px; }
ul { list-style:none; margin:0; padding:0; display:grid; gap:12px; }
li { border-left:3px solid #dae8e2; padding-left:10px; }
strong { font-size:.8rem; line-height:1.45; display:block; }
li p { margin:5px 0; font-size:.8rem; line-height:1.5; white-space:pre-line; }
.usage-language { display:block; color:#617282; font-size:.7rem; margin:5px 0; }
a,summary { color:#24668a; font-size:.73rem; line-height:1.5; }
summary { cursor:pointer; padding:5px 0; }
a { display:inline-block; padding:5px 0; }
button { min-height:38px; margin-top:10px; padding:7px 10px; border:1px solid #c8d8e2; border-radius:7px; color:#31566c; background:#f7fafc; font:inherit; font-size:.76rem; cursor:pointer; }
button:focus-visible,a:focus-visible,summary:focus-visible { outline:3px solid #7eb2d8; outline-offset:3px; }
.compact { margin-top:18px; } .compact h5 { font-size:.82rem; } .compact li p { font-size:.75rem; }
</style>
