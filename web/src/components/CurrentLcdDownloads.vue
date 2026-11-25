<template>
  <section v-if="entry || legacyEntry" class="lcd-downloads" :aria-label="de ? 'Aktuelle LCD-Firmware' : 'Current LCD firmware'">
    <h3>Allmiibo LCD</h3>
    <div class="lcd-options">
      <div v-if="entry">
        <a v-if="choices.app" :href="applicationUrl">{{ de ? `Aktuell · ${applicationLabel} herunterladen (ZIP)` : `Current · Download ${applicationLabel} (ZIP)` }}</a>
        <strong v-else>{{ applicationLabel }}</strong>
        <p>{{ de ? 'Für LCD mit Packed LittleFS (PFS1), Z21 und S112 7.3.0.' : 'For LCD with Packed LittleFS (PFS1), Z21 and S112 7.3.0.' }}</p>
      </div>
      <div v-if="legacyEntry">
        <a v-if="choices.combo" :href="legacyRelease + combo">{{ de ? 'Komplettpaket für Android (ZIP)' : 'Full package for Android (ZIP)' }}</a>
        <strong v-else>{{ de ? 'Komplettpaket für Android' : 'Full package for Android' }}</strong>
        <p>{{ de ? 'S112 7.3.0, Bootloader Z21 und App662 für passende LCD mit Bootloader-Zähler unter 21. Installation mit nRF Device Firmware Update.' : 'S112 7.3.0, Z21 bootloader and App662 for compatible LCD devices with bootloader counter below 21. Install with nRF Device Firmware Update.' }}</p>
        <p v-if="entry">{{ de ? `Dieses Komplettpaket enthält die ältere App662. Danach ${applicationLabel} als separates Anwendungsupdate installieren.` : `This full package contains the older App662. Afterwards, install ${applicationLabel} as a separate application update.` }}</p>
      </div>
    </div>
    <a class="instructions" :href="guide">{{ de ? 'Z21-Komplettpaket: Voraussetzungen und Anleitung' : 'Z21 full package: requirements and instructions' }}</a>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { deploymentPath } from '../lib/deployment-path.js';
import { currentLcdDownloads, packagePresentation } from '../lib/release-packages.js';
import releases from '../data/firmware-releases.json';
import { lcdFinal680Package as lcdReleasePackage } from '../../public/dfu/lcd-app680-reference.mjs';

const props = defineProps({ connected: Boolean, version: String, boot: Object, locale: String });
const entry = releases.packages.find(item => item.id === lcdReleasePackage.id);
const legacyEntry = releases.packages.find(item => item.id === 'de3.89-lcd-app');
const applicationLabel = entry ? `DE4.2 / App${entry.counter}` : '';
const applicationUrl = entry ? packagePresentation(entry).downloadUrl : null;
const legacyRelease = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89/';
const combo = 'Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip';
const de = computed(() => props.locale?.startsWith('de'));
const guide = computed(() => deploymentPath(de.value ? 'guide/index.html' : 'guide/en.html') + '#android-de389');
const choices = computed(() => {
  const session = { connected:props.connected, firmwareVersion:props.version };
  // The old full package keeps its own App662 downgrade guard. A newer current
  // app must never make an older bundled application eligible for installation.
  return { app:entry ? currentLcdDownloads(entry, session, props.boot).app : false,
    combo:legacyEntry ? currentLcdDownloads(legacyEntry, session, props.boot).combo : false };
});
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
