<template>
  <section v-if="entry" class="lcd-downloads" :aria-label="de ? 'Aktuelle LCD-Firmware' : 'Current LCD firmware'">
    <h3>Allmiibo LCD</h3>
    <div class="lcd-options">
      <div>
        <a v-if="choices.app" :href="release + entry.file">{{ de ? 'Stabil · DE3.81 / App654 herunterladen (ZIP)' : 'Stable · Download DE3.81 / App654 (ZIP)' }}</a>
        <strong v-else>{{ de ? 'Nur App654' : 'App654 only' }}</strong>
        <p>{{ de ? 'Für LCD mit Packed LittleFS (PFS1), Z19, Z20 oder Z21 und S112 7.3.0.' : 'For LCD with Packed LittleFS (PFS1), Z19, Z20 or Z21 and S112 7.3.0.' }}</p>
      </div>
      <div>
        <a v-if="choices.combo" :href="release + combo">{{ de ? 'Komplettpaket für Android (ZIP)' : 'Full package for Android (ZIP)' }}</a>
        <strong v-else>{{ de ? 'Komplettpaket für Android' : 'Full package for Android' }}</strong>
        <p>{{ de ? 'S112 7.3.0, Bootloader Z21 und App654 für passende LCD mit Bootloader-Zähler unter 21. Installation mit nRF Device Firmware Update.' : 'S112 7.3.0, Z21 bootloader and App654 for compatible LCD devices with bootloader counter below 21. Install with nRF Device Firmware Update.' }}</p>
      </div>
      <div v-if="testEntry">
        <a v-if="testAvailable" :href="deploymentPath('firmware/' + testEntry.file)">{{ de ? 'Testversion · DE3.87 / App660 herunterladen (ZIP)' : 'Test release · Download DE3.87 / App660 (ZIP)' }}</a>
        <strong v-else>{{ de ? 'LCD-Testversion DE3.87 / App660' : 'LCD test release DE3.87 / App660' }}</strong>
        <p>{{ de ? 'Nur App für LCD mit PFS1, Z21 und S112 7.3.0. Slotnummern, sichtbarer Schreibschutz und Seitenanzeige in Favoritenordnern. Die Prüfung am Gerät steht noch aus.' : 'App only for LCD with PFS1, Z21 and S112 7.3.0. Slot numbers, a visible write-protection indicator and page cues in favorites folders. Physical device testing is still pending.' }}</p>
      </div>
    </div>
    <a class="instructions" :href="guide">{{ de ? 'Voraussetzungen und Installationsanleitung' : 'Requirements and installation guide' }}</a>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { deploymentPath } from '../lib/deployment-path.js';
import { currentLcdDownloads } from '../lib/release-packages.js';
import releases from '../data/firmware-releases.json';

const props = defineProps({ connected: Boolean, version: String, boot: Object, locale: String });
const entry = releases.packages.find(item => item.id === 'de3.81-lcd-app');
const testEntry = releases.packages.find(item => item.id === 'de3.87-lcd-test1-app');
const release = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.81/';
const combo = 'Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip';
const de = computed(() => props.locale?.startsWith('de'));
const guide = computed(() => deploymentPath(de.value ? 'guide/index.html' : 'guide/en.html') + '#android-de381');
const choices = computed(() => currentLcdDownloads(entry, { connected:props.connected, firmwareVersion:props.version }, props.boot));
const testAvailable = computed(() => testEntry && currentLcdDownloads(testEntry, {connected:props.connected, firmwareVersion:props.version}, props.boot).app);
</script>

<style scoped>
.lcd-downloads { margin:.8rem 0; padding:.95rem 1.15rem; border:1px solid #cdcfdd; border-radius:.8rem; background:#f9f9fc; color:#233b46; }
h3 { margin:0 0 .65rem; font-size:1.02rem; }
.lcd-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
a { color:#294968; text-underline-offset:.16em; }
.lcd-options a { font-weight:650; }
p,.instructions { font-size:.84rem; line-height:1.45; }
p { margin:.25rem 0 .55rem; }
a:focus-visible { outline:3px solid #286a96; outline-offset:3px; }
@media(max-width:620px) { .lcd-options { grid-template-columns:1fr; gap:.35rem; } }
</style>
