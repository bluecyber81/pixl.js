<template>
  <section class="board-profile">
    <h3>{{ label('Hardwareprofil', 'Hardware profile') }}</h3>
    <dl v-if="boot?.geometryValid || storageBytes || knownLcdBuild">
      <div v-if="boot?.geometryValid"><dt>{{ label('Chip · vom Gerät gelesen', 'Chip · reported by device') }}</dt>
        <dd>{{ boot.chipPart === 0x52832 ? 'nRF52832' : '0x' + boot.chipPart.toString(16).toUpperCase() }} · {{ boot.flashBytes / 1024 }} KiB Flash · {{ boot.ramBytes / 1024 }} KiB RAM</dd></div>
      <div v-if="storageBytes"><dt>{{ label('Externer Speicher · gemeldetes Layout', 'External storage · reported layout') }}</dt><dd>{{ storageBytes / 1024 }} KiB</dd></div>
      <div v-if="knownLcdBuild"><dt>{{ label('Displaytreiber des Firmware-Builds', 'Display driver in the firmware build') }}</dt><dd>{{ knownLcdBuild.controllerDriver }} · {{ knownLcdBuild.width }} × {{ knownLcdBuild.height }}</dd></div>
    </dl>
    <div class="flash-status">
      <strong>{{ label('Externer SPI-Flash', 'External SPI flash') }}</strong>
      <p v-if="flash?.jedecId"><code>{{ flash.jedecId.map(hexByte).join(' ') }}</code>
        · {{ flashManufacturer(flash.jedecId) || label('Hersteller nicht zugeordnet', 'Unmapped manufacturer') }}
        · {{ flash.geometrySupported ? label('Speichergeometrie unterstützt', 'Supported geometry') : label('Speichergeometrie unbekannt', 'Unknown geometry') }}</p>
      <p v-else-if="!supported">{{ label('Die Flash-Kennung ist ab LCD-Firmware DE3.78 verfügbar.', 'Flash ID is available with LCD firmware DE3.78 or later.') }}</p>
      <p v-else-if="flashState === 'failed'">{{ label('Lesen der Kennung fehlgeschlagen.', 'Could not read the ID.') }}</p>
      <p v-else-if="flash || flashState === 'unavailable'">{{ label('Keine gültige Kennung verfügbar.', 'No valid ID available.') }}</p>
      <p v-else>{{ label('Die Kennung stammt aus der Speichererkennung beim Gerätestart.', 'The ID comes from the storage probe at device startup.') }}</p>
      <button v-if="supported" type="button" :disabled="!connected || blocked" @click="$emit('read')">{{ label('Flash-Kennung auslesen', 'Read flash ID') }}</button>
    </div>
    <details>
      <summary>{{ label('Akkuetikett diesem Gerät zuordnen', 'Associate a battery label with this device') }}</summary>
      <p>{{ label('Stehen diese Angaben auf deinem Akku? Die Zuordnung gilt nur für dieses Gerät in diesem Browser und erscheint als Etikettangabe im Diagnoseexport.', 'Do these ratings appear on your battery? The association applies to this device in this browser and appears as a label reading in the diagnostic export.') }}</p>
      <label><input type="checkbox" :checked="labelConfirmed" :disabled="!connected || !profileReady" @change="associate"> LiPo 551520 · 180 mAh · {{ label('3,8 V · 0,684 Wh', '3.8 V · 0.684 Wh') }}</label>
      <p v-if="!profileReady || profileError" role="status">{{ label('Die lokale Gerätezuordnung ist nicht verfügbar.', 'Local device association is unavailable.') }}</p>
      <p v-if="labelConfirmed">{{ label('Quelle: bestätigter Akkuaufdruck. Ladechip und genaue LCD-Teilenummer sind offen.', 'Source: confirmed battery label. The charge controller and exact LCD part number are unknown.') }}</p>
    </details>
  </section>
</template>
<script setup>
import { flashManufacturer, hexByte, supportsFlashDiagnostics } from '../lib/flash-diagnostics.js';
import { computed } from 'vue';
import { displayBuildReference } from '../lib/hardware-profile.js';
const props = defineProps({locale:String, connected:Boolean, blocked:Boolean, firmwareVersion:String,
  boot:Object, storageBytes:Number, flash:Object, flashState:String, labelConfirmed:Boolean, profileReady:Boolean, profileError:Boolean});
const emit = defineEmits(['read','associate']);
function associate(event) {
  const requested = event.target.checked;
  event.target.checked = props.labelConfirmed;
  emit('associate', requested);
}
const label = (de, en) => props.locale === 'de_DE' ? de : en;
const knownLcdBuild = computed(() => props.connected && displayBuildReference(props.firmwareVersion));
const supported = computed(() => supportsFlashDiagnostics(props.firmwareVersion));
</script>
<style scoped>
.board-profile {margin:1rem 0; padding:1rem; background:var(--panel-bg,#fff); border:1px solid #cadbd5; border-radius:12px;}
h3 {margin-top:0;} dd {margin:.25rem 0;} details {margin-top:1rem;} summary {cursor:pointer;font-weight:600;}
code {font-size:1.05em;letter-spacing:.08em;} label {display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;}
</style>
