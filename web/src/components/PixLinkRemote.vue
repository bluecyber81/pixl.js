<template>
  <div class="pixlink">
    <p>{{ t.setup }}</p>
    <p v-if="blocked || unavailable" role="status">{{ blocked ? common.blocked : common.errors.REMOTE_UNAVAILABLE }}</p>
    <div class="actions">
      <button v-if="phase==='disconnected'" type="button" :disabled="blocked || !!unavailable" @click="run('connect')">{{ t.connect }}</button>
      <button v-else type="button" @click="disconnect">{{ phase==='connecting' ? common.cancel : common.disconnect }}</button>
      <span role="status">{{ t[phase] }}<template v-if="name && phase!=='disconnected'"> · {{ name }}</template></span>
    </div>
    <button type="button" :disabled="blocked || phase!=='linked'" @click="run('enableControl')">{{ t.enable }}</button>
    <div class="keys" role="group" :aria-label="common.title">
      <button v-for="key in keys" :key="key" type="button" :disabled="blocked || phase!=='control'" @click="run('tap',key)">{{ common[key] }}</button>
    </div>
    <p>{{ t.caution }}</p>
    <button type="button" :disabled="blocked || !['linked','control'].includes(phase) || !handoffFileConnection" @click="run('openFiles',handoffFileConnection)">{{ t.files }}</button>
    <p v-if="notice" role="status">{{ t[notice] }}</p>
    <p v-if="error" role="alert">{{ t[error] || t.reply }}</p>
  </div>
</template>
<script>
import {createPixLink} from '../lib/pixlink.js';
import {remoteAvailability} from '../lib/remote-control.js';
import {remoteText} from '../lib/remote-text.js';

const de={
  setup:'Für die Firmware von cylin577 mit PixLink (v2.27.11). Am Gerät den Bluetooth-Modus Pixl.js oder AmiLoop wählen. Bei leerer Geräteauswahl ins Hauptmenü zurückkehren.',
  connect:'PixLink-Gerät auswählen',connecting:'Gerät wird verbunden …',disconnected:'Getrennt',linked:'PixLink verbunden',
  enable:'Steuerung übernehmen',control:'Steuermodus aktiv',pending:'Vorgang läuft …',files:'Dateiübertragung öffnen',
  caution:'Im Steuermodus sind die Gerätetasten eingeschränkt. „Dateiübertragung öffnen“ gibt sie frei und beendet die laufende App. Nach einem Verbindungsabbruch erneut verbinden und die Dateiübertragung öffnen. Geräte mit dieser Firmware verwenden ihre eigenen Speicherfunktionen.',
  sent:'Tastendruck und Loslassen wurden gesendet. Prüfe die Reaktion am Display.',already:'Der Steuermodus war bereits aktiv.',
  cancelled:'Verbindung abgebrochen.',service:'Der erforderliche Bluetooth-Dienst fehlt oder ist nicht erreichbar.',
  rejected:'Das Gerät hat den Moduswechsel abgelehnt.',unsupported:'Das Gerät unterstützt diesen Befehl nicht.',
  timeout:'Antwortzeit abgelaufen. Prüfe den Modus am Display, bevor du dich erneut verbindest.',
  lost:'Die Verbindung wurde getrennt. Prüfe den Modus am Display.',reply:'Die Geräteantwort konnte nicht bestätigt werden.',
  filesError:'Der Dateidienst hat keine lesbare Firmwareversion und kein verfügbares Laufwerk bestätigt.'
};
const en={
  setup:'For cylin577 firmware with PixLink (v2.27.11). On the device, select Pixl.js or AmiLoop Bluetooth mode. If the picker is empty, return to the device’s main menu.',
  connect:'Choose PixLink device',connecting:'Connecting …',disconnected:'Disconnected',linked:'PixLink connected',
  enable:'Take control',control:'Control mode active',pending:'Working …',files:'Open file transfer',
  caution:'Device buttons are restricted in control mode. Open file transfer to release them and exit the running app. If the connection drops, reconnect and open file transfer. Devices with this firmware use their own storage features.',
  sent:'Button press and release sent. Check the device display for the result.',already:'Control mode was already active.',
  cancelled:'Connection cancelled.',service:'The required Bluetooth service is unavailable or cannot be reached.',
  rejected:'The device rejected the mode change.',unsupported:'The device does not support this command.',
  timeout:'Response timed out. Check the mode on the device before reconnecting.',
  lost:'The connection dropped. Check the mode on the device.',reply:'The device response could not be confirmed.',
  filesError:'The file service did not confirm a readable firmware version and an available drive.'
};
export default {
  props:{blocked:Boolean,locale:String,handoffFileConnection:Function},
  emits:['active'],
  data(){return {phase:'disconnected',error:'',notice:'',name:'',unavailable:remoteAvailability(),keys:['left','center','right']};},
  computed:{common(){return remoteText(this.locale);},t(){return this.locale==='de_DE'?de:en;}},
  created(){
    this._serial=0;
    this._pix=createPixLink({onState:({phase,error,name})=>{
      this.phase=phase;
      this.name=name;
      this.error=error==='files'?'filesError':error;
      if (phase==='disconnected') this.notice='';
      this.$emit('active',phase!=='disconnected');
    }});
  },
  beforeUnmount(){this.disconnect();},
  watch:{blocked(value){if(value)this.disconnect();}},
  methods:{
    disconnect(){++this._serial;this._pix.disconnect();},
    async run(action,arg){
      if(this.blocked)return;
      const serial=++this._serial;
      this.notice='';this.error='';
      try{
        const result=await this._pix[action](arg);
        if(serial===this._serial) this.notice=action==='tap'?'sent':result==='already'?'already':'';
      }catch(e){
        if(serial===this._serial && !this.error) this.error=e?.code==='files'?'filesError':e?.code || 'reply';
      }
    }
  }
};
</script>
<style scoped>
.pixlink p{font-size:.88rem;line-height:1.6;}
.actions,.keys{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:1rem 0;}
.keys button{flex:1;}
button{min-height:44px;padding:8px 14px;border:1px solid #8aafb7;border-radius:9px;background:white;color:#24434b;font:inherit;cursor:pointer;}
button:disabled{opacity:.5;cursor:default;}button:focus-visible{outline:3px solid #388294;outline-offset:3px;}
[role=alert]{color:#87421a;}
</style>
