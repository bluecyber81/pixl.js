<template>
  <section class="firmware-board-choice" aria-labelledby="firmware-board-title">
    <h3 id="firmware-board-title">{{ de ? 'Firmware für dein Display' : 'Firmware for your display' }}</h3>
    <p v-if="detected">{{ de ? 'Die gemeldete Firmware gehört zur Variante' : 'The reported firmware is for' }} {{ detected }}.</p>
    <p v-else>{{ de ? 'Welches Display hat dein Gerät? Wähle die passende Variante für Downloads und Anleitung.' : 'Which display does your device have? Choose it to see its downloads and guide.' }}</p>
    <div class="board-buttons" role="group" aria-labelledby="firmware-board-title">
      <button v-for="board in ['LCD', 'OLED']" :key="board" type="button"
        :aria-pressed="selected === board" :disabled="!!detected && detected !== board" @click="choice = board">{{ board }}</button>
    </div>
    <slot v-if="selected === 'LCD'" name="lcd" />
    <article v-if="selected === 'OLED'" class="oled-trial">
      <h4>DE3.87 OLED · Test 6</h4>
      <p>{{ de ? 'Für Pixl.js mit nRF52832, SH1106 (128 × 64), kompatiblem DFU-Bootloader und S112 7.2.0 (FWID 0x0103). Der Gerätetest für App86 steht aus.' : 'For Pixl.js with nRF52832, SH1106 (128 × 64), a compatible DFU bootloader and S112 7.2.0 (FWID 0x0103). App86 awaits testing on a physical OLED.' }}</p>
      <p>{{ de ? 'Die App nutzt dein vorhandenes SPIFFS oder natives LittleFS. Sichere deine Dateien und halte die bisherige OLED-App bereit. Du kannst das Update am Computer direkt im Browser starten oder die gepackte ZIP am Handy in nRF Device Firmware Update öffnen.' : 'The app uses your existing SPIFFS or native LittleFS. Back up your files and keep your previous OLED app available. Start the update directly in your computer browser, or open the intact ZIP on your phone in nRF Device Firmware Update.' }}</p>
      <p>{{ de ? 'Die Fernbedienung kann in der Geräteauswahl Pixl.Remote oder Pixl.Rem heißen.' : 'The remote may appear as Pixl.Remote or Pixl.Rem in the device picker.' }}</p>
      <p v-if="differentOledTrial" role="status">{{ de ? 'Für deine gemeldete OLED-Version ist der Updatepfad zu Test 6 ungeprüft.' : 'The update path from your reported OLED version to Test 6 is unverified.' }}</p>
      <p v-else-if="profileMismatch" role="status">{{ de ? 'Die gelesenen Gerätedaten passen nicht zu diesem OLED-Paket.' : 'The reported device details are incompatible with this OLED package.' }}</p>
      <slot v-if="!differentOledTrial && !profileMismatch" name="oled-controls" />
      <div class="trial-links">
        <a v-if="!differentOledTrial && !profileMismatch" class="dfu-page-link" :href="browserUpdate" target="_blank" rel="noopener noreferrer">{{ de ? 'OLED im Browser flashen' : 'Flash OLED in browser' }}</a>
        <a v-if="!differentOledTrial && !profileMismatch" :href="appDownload">{{ de ? 'OLED-App-ZIP herunterladen' : 'Download OLED app ZIP' }}</a>
        <a :href="guideAsset">{{ de ? 'Testanleitung herunterladen' : 'Download test guide' }}</a>
        <a :href="release">GitHub Release</a>
        <a :href="guide">{{ de ? 'OLED-Anleitung' : 'OLED guide' }}</a>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { firmwareBoard, hasOledSystemDiagnostics, lacksOledSystemDiagnostics } from '../lib/hardware-profile.js';
import { deploymentPath } from '../lib/deployment-path.js';
import { dfuReference } from '../lib/release-packages.js';
const props = defineProps({ connected: Boolean, version: String, boot: Object, locale: String });
const de = computed(() => props.locale?.startsWith('de'));
const guide = computed(() => deploymentPath(de.value ? 'guide/index.html' : 'guide/en.html') + '#oled');
const appDownload = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_APP.zip';
const browserUpdate = computed(() => deploymentPath('dfu/web.html') + '?package=de3.87-oled-t6-app' +
  dfuReference(props.connected ? props.boot : null, Date.now(), '2.22.0-DE3.87-OLEDt6'));
const choice = ref(null);
const detected = computed(() => props.connected ? firmwareBoard(props.version) : null);
const selected = computed(() => detected.value || choice.value);
const release = 'https://github.com/bluecyber81/pixl.js/releases/tag/de3.87-oled-t6';
const guideAsset = computed(() => 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/' + (de.value ? 'ANLEITUNG_OLED_Test6_DE.txt' : 'GUIDE_OLED_Test6_EN.txt'));
const differentOledTrial = computed(() => detected.value === 'OLED' && !hasOledSystemDiagnostics(props.version) && !lacksOledSystemDiagnostics(props.version));
const profileMismatch = computed(() => props.connected && props.boot && (
  props.boot.addressConflict ||
  (props.boot.softDeviceValid && (props.boot.softDeviceFwid !== 0x0103 || props.boot.softDeviceVariant !== 112 || props.boot.softDeviceVersion !== 7002000)) ||
  (props.boot.geometryValid && props.boot.chipPart !== 0x52832) ||
  (props.boot.settingsCrcValid && (props.boot.applicationCounter > 86 ||
    (props.version === '2.22.0-DE3.87-OLEDt6' && props.boot.applicationCounter !== 86) ||
    (props.version === '2.22.0-DE3.85-OLEDt5' && props.boot.applicationCounter !== 85)))
));
watch(() => [props.connected, props.version], ([connected], [wasConnected, version]) => {
  if (connected && !wasConnected) choice.value = null;
  if (!connected && wasConnected && firmwareBoard(version)) choice.value = firmwareBoard(version);
});
</script>

<style scoped>
.firmware-board-choice h3,.firmware-board-choice h4 { margin:0; }
.firmware-board-choice > p,.oled-trial p { font-size:.9rem; line-height:1.5; }
.board-buttons,.trial-links { display:flex; flex-wrap:wrap; gap:.55rem; margin:.8rem 0; }
.board-buttons button,.trial-links a { display:inline-flex; align-items:center; min-height:44px; padding:0 1rem; border:1px solid #a4c0cd; border-radius:.55rem; background:#fff; color:#174c60; font:inherit; font-weight:600; }
.board-buttons button { cursor:pointer; }
.board-buttons button[aria-pressed="true"] { color:#fff; background:#215b66; border-color:#215b66; }
.board-buttons button:disabled { opacity:.5; cursor:default; }
.board-buttons button:focus-visible,.trial-links a:focus-visible { outline:3px solid #286a96; outline-offset:2px; }
.oled-trial { padding:1rem; border:1px solid #c6d8e6; border-radius:.8rem; background:#f7fafc; }
.trial-links { margin-bottom:0; }
</style>
