<template>
  <section class="remote-control" :class="{'remote-compact': compactLayout}" :aria-busy="waiting" @keydown="preventRepeat">
    <div class="remote-heading">
      <h3>{{ text.title }}</h3>
      <button v-if="protocol === 'de' && keypadActive" type="button" class="layout-toggle"
              :aria-pressed="compactLayout" @click="compactPreference = !compactLayout">{{ text.compactLayout }}</button>
    </div>
    <label v-if="!compactLayout" class="protocol-picker">{{ locale==='de_DE' ? 'Gerätefirmware' : 'Device firmware' }}
      <select :value="protocol" @change="protocol=$event.target.value" :disabled="phase!=='disconnected' || pixActive">
        <option value="de">Allmiibo DE (LCD / OLED)</option>
        <option value="pixlink">cylin577 · PixLink</option>
      </select>
    </label>
    <PixLinkRemote v-if="protocol==='pixlink'" :locale="locale" :blocked="blocked" :handoff-file-connection="handoffFileConnection" @active="pixLinkActive"/>
    <template v-else>
    <p v-if="phase === 'disconnected'" class="remote-setup-short">{{ text.setupShort }}</p>
    <p v-if="blocked" class="remote-warning" role="status">{{ text.blocked }}</p>
    <template v-for="area in controlAreas" :key="area">
      <template v-if="area === 'connection'">
        <div class="remote-connection">
          <button v-if="phase === 'disconnected'" type="button" @click="connectRemote" :disabled="blocked || !!unavailable">{{ text.connect }}</button>
          <button v-else type="button" @click="disconnectRemote" :disabled="phase === 'disconnecting'">{{ text[phase === 'connecting' ? 'cancel' : 'disconnect'] }}</button>
          <span class="remote-state" :class="{online:phase === 'ready'}" role="status" aria-live="polite">{{ text[phase] }}</span>
        </div>
        <button v-if="keypadActive" type="button" class="remote-check" :aria-disabled="!ready" @click="press('status')">{{ text.checkConnection }}</button>
        <p v-if="unavailable || error" :class="error === 'REMOTE_NO_SELECTION' ? 'remote-limit' : 'remote-warning'" :role="error === 'REMOTE_NO_SELECTION' ? 'status' : 'alert'">{{ text.errors[unavailable || error] || text.failed }}<template v-if="commandUnconfirmed"> {{ text.unconfirmed }}</template></p>
      </template>
      <template v-else-if="area === 'keys'">
        <div class="remote-pad" role="group" :aria-label="text.title"
             :tabindex="keypadActive ? 0 : -1" :aria-describedby="keypadActive ? 'remote-keyboard-hint' : undefined"
             :aria-keyshortcuts="keypadActive ? (capabilities & 2 ? 'ArrowLeft ArrowRight Enter Escape' : 'ArrowLeft ArrowRight Enter') : undefined"
             @keydown="onPadKeydown">
          <button type="button" @click="press('left')" :disabled="!keypadActive" :aria-disabled="!ready" :aria-label="text.left"><span aria-hidden="true">←</span><strong>{{ text.left }}</strong></button>
          <button type="button" @click="press('center')" :disabled="!keypadActive" :aria-disabled="!ready" :aria-label="text.center"><span aria-hidden="true">●</span><strong>{{ compactLayout ? text.compactCenter : text.center }}</strong></button>
          <button type="button" @click="press('right')" :disabled="!keypadActive" :aria-disabled="!ready" :aria-label="text.right"><span aria-hidden="true">→</span><strong>{{ text.right }}</strong></button>
          <button v-if="compactLayout" type="button" @click="press('back')" :disabled="!ready || !(capabilities & 2)" :aria-label="text.back"><span aria-hidden="true">↶</span><strong>{{ text.compactBack }}</strong></button>
        </div>
        <p v-if="keypadActive" id="remote-keyboard-hint" class="remote-limit" :class="{'keyboard-hint-compact': compactLayout}">
          {{ text.keyboard }}{{ capabilities & 2 ? ' ' + text.keyboardBack : '' }}
        </p>
        <button v-if="!compactLayout" type="button" class="remote-back" @click="press('back')" :disabled="!ready || !(capabilities & 2)">{{ text.back }}</button>
      </template>
      <template v-else-if="area === 'automatic'">
        <label v-if="keypadActive && photoSupported" class="remote-auto-photo">
          <input :checked="autoPhoto" type="checkbox" @change="autoPhoto = $event.target.checked" /> <span>{{ text.autoPhoto }}</span>
        </label>
        <p v-if="keypadActive && photoSupported && autoPhoto" class="remote-limit">{{ text.autoPhotoHint }}</p>
      </template>
      <DisplayPhoto :ref="setRemotePhoto" v-else-if="area === 'photo' && keypadActive" :compact="compactLayout" class="remote-photo" remote :remote-supported="photoSupported" :connected="keypadActive" :blocked="!ready" :locale="locale" :read-photo="captureDisplay"/>
    </template>
    <button type="button" class="remote-files" @click="press('files')" :disabled="!ready">{{ text.files }}</button>
    <p v-if="notice" role="status" aria-live="polite">{{ notice==='status' ? statusReceipt : text.receipts[notice] || text[notice] }}</p>
    <details class="remote-help" :open="setupOpen" @toggle="setupOpen = $event.target.open">
      <summary>{{ text.setupTitle }}</summary>
      <p>{{ text.introduction }}</p><p>{{ text.setup }}</p>
      <p class="remote-limit">{{ text.sleep }}</p><p class="remote-limit">{{ text.commandHint }}</p>
    </details>
    </template>
  </section>
</template>
<script>
import { createRemoteClient, remoteAvailability, REMOTE_LCD_CAPABILITY } from '../lib/remote-control.js';
import PixLinkRemote from './PixLinkRemote.vue';
import DisplayPhoto from './DisplayPhoto.vue';
import { createAutoDisplayPhoto } from '../lib/auto-display-photo.js';
import { remoteText } from '../lib/remote-text.js';
const padCommands = Object.freeze({ArrowLeft:'left', ArrowRight:'right', Enter:'center', Escape:'back'});
export default {
  components:{PixLinkRemote,DisplayPhoto},
  props:{blocked:Boolean,locale:{type:String,default:'de_DE'},handoffFileConnection:Function},emits:['active'],
  data(){return {compactPreference:null,narrowScreen:false,protocol:'de',pixActive:false,phase:'disconnected',capabilities:0,error:'',commandUnconfirmed:false,notice:'',checkedAt:null,setupOpen:false,autoPhoto:false,unavailable:remoteAvailability()};},
  computed:{text(){return remoteText(this.locale);},waiting(){return ['connecting','command','handoff','disconnecting'].includes(this.phase);},ready(){return this.phase==='ready'&&!this.blocked;},
    compactLayout(){return this.protocol === 'de' && this.keypadActive && (this.compactPreference ?? this.narrowScreen);},
    controlAreas(){return this.compactLayout ? ['photo','keys','automatic','connection'] : ['connection','keys','automatic','photo'];},
    keypadActive(){return !this.blocked && (this.phase === 'ready' || this.phase === 'command');},
    photoSupported(){return !!(this.capabilities & REMOTE_LCD_CAPABILITY);},
    statusReceipt(){
      if(this.checkedAt===null)return '';
      const time=new Intl.DateTimeFormat(this.locale==='de_DE'?'de-DE':'en-US',{timeStyle:'medium'}).format(this.checkedAt);
      return this.text.connectionConfirmed.replace('{time}',time);
    }},
  created(){
    this._remoteMounted=true;
    this._remoteUiGeneration=0;
    this._autoDisplayPhoto=createAutoDisplayPhoto({
      canCapture:()=>this._remoteMounted && this.autoPhoto && this.protocol==='de' && this.ready && this.photoSupported && !!this._remotePhoto,
      capture:()=>this._remotePhoto.capture()
    });
    this._remoteClient=createRemoteClient({onState:state=>{
      if(!this._remoteMounted)return;
      this.phase=state.phase;this.capabilities=state.capabilities||0;
      if(!['ready','command'].includes(state.phase) || !this.photoSupported)this._autoDisplayPhoto.cancel();
      if(state.phase==='disconnected')this.autoPhoto=false;
      if(state.phase==='disconnected' || state.phase==='handoff') {
        this.checkedAt=null;
        if(this.notice==='status')this.notice='';
      }
      if(state.error){this.error=state.error;this.commandUnconfirmed=!!state.commandUnconfirmed;this.notice='';}
      this.$emit('active',state.phase!=='disconnected');
    }});
  },
  mounted(){
    this._screenQuery=globalThis.matchMedia?.('(max-width: 600px)');
    if(this._screenQuery){
      this.narrowScreen=this._screenQuery.matches;
      this._screenQuery.addEventListener('change',this.onScreenChange);
    }
  },
  beforeUnmount(){this._screenQuery?.removeEventListener('change',this.onScreenChange);this._autoDisplayPhoto.dispose();this._remoteMounted=false;++this._remoteUiGeneration;this._remoteClient.disconnect();this.$emit('active',false);},
  watch:{blocked(value){if(value){this._autoDisplayPhoto.cancel();if(this.phase!=='disconnected')this.disconnectRemote();}},
    autoPhoto(value){if(!value)this._autoDisplayPhoto.cancel();},
    protocol(){this._autoDisplayPhoto.cancel();this.autoPhoto=false;}},
  methods:{
    onScreenChange(event){this.narrowScreen=event.matches;},
    setRemotePhoto(component){this._remotePhoto=component;},
    captureDisplay(){
      this._autoDisplayPhoto.cancel();
      this.error='';this.commandUnconfirmed=false;this.notice='';this.checkedAt=null;
      return this._remoteClient.captureDisplay();
    },
    pixLinkActive(value){this.pixActive=value;this.$emit('active',value);},
    preventRepeat(event){
      if(event.repeat && event.target?.tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    },
    onPadKeydown(event){
      if(!this.keypadActive || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      // Enter on an individual button keeps its native click and activates that button.
      if(event.key === 'Enter' && event.target !== event.currentTarget) return;
      const command = padCommands[event.key];
      if(!Object.hasOwn(padCommands, event.key) || (command === 'back' && !(this.capabilities & 2))) return;
      event.preventDefault();
      if(!event.repeat && this.ready) return this.press(command);
    },
    async connectRemote(){
      if(this.blocked||this.phase!=='disconnected'||this.unavailable)return;
      const generation=++this._remoteUiGeneration;
      this.error='';this.commandUnconfirmed=false;this.notice='';this.checkedAt=null;this.setupOpen=false;
      try{await this._remoteClient.connect();}catch(error){if(this._remoteMounted&&generation===this._remoteUiGeneration)this.error=error?.code||'REMOTE_UNSUPPORTED';}
    },
    async disconnectRemote(){
      this._autoDisplayPhoto.cancel();
      ++this._remoteUiGeneration;
      this.error='';this.commandUnconfirmed=false;this.notice='';
      await this._remoteClient.disconnect();
    },
    async press(command){
      if(!this.ready)return;
      this._autoDisplayPhoto.cancel();
      const generation=this._remoteUiGeneration;
      this.error='';this.commandUnconfirmed=false;this.notice='';this.checkedAt=null;
      try{
        const reply=await this._remoteClient.command(command,{sameLink:typeof this.handoffFileConnection==='function'});
        if(!this._remoteMounted||generation!==this._remoteUiGeneration)return;
        if(command==='status'){
          if(this.ready){this.checkedAt=Date.now();this.notice='status';}
        }else if(command==='files'){
          if(reply.opcode===4){
            this._remoteClient.releaseFileConnection(this.handoffFileConnection);
            if(this._remoteMounted&&generation===this._remoteUiGeneration)this.notice='filesConnected';
          }else{
            await this._remoteClient.disconnect();
            if(this._remoteMounted&&generation===this._remoteUiGeneration)this.notice='filesReady';
          }
        }else{
          this.notice=command;
          if(['left','center','right','back'].includes(command))this._autoDisplayPhoto.request();
        }
      }catch(error){
        if(this._remoteMounted&&generation===this._remoteUiGeneration){
          this.error=command==='status'&&error?.code==='REMOTE_TIMEOUT'?'REMOTE_STATUS_TIMEOUT':error?.code||'REMOTE_REJECTED';
          this.commandUnconfirmed=!!error?.commandUnconfirmed;
        }
      }
    }
  }
};
</script>
<style scoped>
.remote-control{padding:16px;border:1px solid #c9dddf;border-radius:12px;background:#f6fafb;color:#24434b;max-width:750px;}
.protocol-picker{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:.88rem;}.protocol-picker select{min-height:44px;padding:6px 12px;border:1px solid #8aafb7;border-radius:8px;background:#fff;color:inherit;font:inherit;}
h3{margin:0 0 12px;}p{font-size:.88rem;line-height:1.6;overflow-wrap:anywhere;}
.remote-limit{font-size:.8rem;color:#506a73;}.remote-warning{padding:10px;border:1px solid #ddbd91;border-radius:8px;background:#fff8ec;color:#67451c;}
.remote-connection{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0;}
button{min-height:48px;padding:10px 14px;border:1px solid #8aafb7;border-radius:9px;background:#fff;color:#24434b;cursor:pointer;font:inherit;}
button:disabled,button[aria-disabled=true]{opacity:.5;cursor:default;}button:focus-visible,.remote-pad:focus-visible{outline:3px solid #388294;outline-offset:3px;}
.remote-state{font-size:.82rem;}.remote-state.online{font-weight:700;color:#236351;}
.remote-pad{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:10px;margin-top:18px;}
.remote-pad button{min-height:92px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;touch-action:manipulation;}
.remote-pad span{font-size:1.8rem;line-height:1;}.remote-pad strong{font-size:.87rem;font-weight:600;}
.remote-files{width:100%;margin-top:10px;}.remote-back{width:100%;margin-top:10px;}.remote-pad button:not(:disabled):active{background:#dcebee;}
.remote-auto-photo{display:flex;align-items:center;gap:8px;min-height:44px;margin-top:10px;font-size:.88rem;cursor:pointer;}
.remote-auto-photo input{width:20px;height:20px;flex-shrink:0;accent-color:#388294;}
.remote-auto-photo input:focus-visible{outline:3px solid #388294;outline-offset:3px;}
.remote-photo :deep(button),.remote-photo :deep(a){display:inline-flex;align-items:center;min-height:44px;padding:8px 12px;box-sizing:border-box;border-radius:8px;color:inherit;font:inherit;}
.remote-photo :deep(button){border:1px solid #8aafb7;background:#fff;cursor:pointer;}
.remote-photo :deep(button:disabled){opacity:.5;cursor:default;}
.remote-photo :deep(button:focus-visible),.remote-photo :deep(a:focus-visible){outline:3px solid #388294;outline-offset:3px;}
.remote-photo :deep(img){box-sizing:border-box;}
.remote-help{margin-top:16px;border-top:1px solid #d6e4e7;padding-top:10px;}.remote-help summary{min-height:44px;display:list-item;align-content:center;cursor:pointer;font-size:.85rem;font-weight:600;}.remote-help summary:focus-visible{outline:3px solid #388294;outline-offset:3px;}
@media(max-width:480px){.remote-control{padding:12px;}.remote-pad{gap:7px;}.remote-pad button{padding:8px 5px;}.remote-pad strong{font-size:.76rem;}.remote-connection>button{width:100%;}}
.remote-heading{display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem;}
.remote-heading h3{margin:0;}
.layout-toggle{min-height:44px;padding:6px 10px;font-size:.85rem;}
.layout-toggle[aria-pressed=true]{border:2px solid #236351;background:#e9f5ef;color:#174c40;}
.remote-compact .remote-pad{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:6px 0;}
.remote-compact .remote-pad button{min-width:0;min-height:48px;padding:5px 2px;}
.remote-compact .remote-pad strong{overflow-wrap:anywhere;}
.keyboard-hint-compact:not(:focus-within){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}
.remote-compact .remote-pad:focus-visible + .keyboard-hint-compact{position:static;width:auto;height:auto;overflow:visible;clip-path:none;}
</style>
