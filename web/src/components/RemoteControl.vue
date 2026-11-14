<template>
  <section class="remote-control" :aria-busy="waiting" @keydown="preventRepeat">
    <h3>{{ text.title }}</h3>
    <label class="protocol-picker">{{ locale==='de_DE' ? 'Gerätefirmware' : 'Device firmware' }}
      <select :value="protocol" @change="protocol=$event.target.value" :disabled="phase!=='disconnected' || pixActive">
        <option value="de">Allmiibo DE</option>
        <option value="pixlink">cylin577 · PixLink</option>
      </select>
    </label>
    <PixLinkRemote v-if="protocol==='pixlink'" :locale="locale" :blocked="blocked" :handoff-file-connection="handoffFileConnection" @active="pixLinkActive"/>
    <template v-else>
    <p v-if="phase === 'disconnected'" class="remote-setup-short">{{ text.setupShort }}</p>
    <p v-if="blocked" class="remote-warning" role="status">{{ text.blocked }}</p>
    <div class="remote-connection">
      <button v-if="phase === 'disconnected'" type="button" @click="connectRemote" :disabled="blocked || !!unavailable">{{ text.connect }}</button>
      <button v-else type="button" @click="disconnectRemote" :disabled="phase === 'disconnecting'">{{ text[phase === 'connecting' ? 'cancel' : 'disconnect'] }}</button>
      <span class="remote-state" :class="{online:phase === 'ready'}" role="status" aria-live="polite">{{ text[phase] }}</span>
    </div>
    <button v-if="keypadActive" type="button" class="remote-check" :aria-disabled="!ready" @click="press('status')">{{ text.checkConnection }}</button>
    <p v-if="unavailable || error" class="remote-warning" role="alert">{{ text.errors[unavailable || error] || text.failed }}</p>
    <div class="remote-pad" role="group" :aria-label="text.title"
         :tabindex="keypadActive ? 0 : -1" :aria-describedby="keypadActive ? 'remote-keyboard-hint' : undefined"
         :aria-keyshortcuts="keypadActive ? (capabilities & 2 ? 'ArrowLeft ArrowRight Enter Escape' : 'ArrowLeft ArrowRight Enter') : undefined"
         @keydown="onPadKeydown">
      <button type="button" @click="press('left')" :disabled="!keypadActive" :aria-disabled="!ready" :aria-label="text.left"><span aria-hidden="true">←</span><strong>{{ text.left }}</strong></button>
      <button type="button" @click="press('center')" :disabled="!keypadActive" :aria-disabled="!ready" :aria-label="text.center"><span aria-hidden="true">●</span><strong>{{ text.center }}</strong></button>
      <button type="button" @click="press('right')" :disabled="!keypadActive" :aria-disabled="!ready" :aria-label="text.right"><span aria-hidden="true">→</span><strong>{{ text.right }}</strong></button>
    </div>
    <p v-if="keypadActive" id="remote-keyboard-hint" class="remote-limit">
      {{ text.keyboard }}<template v-if="capabilities & 2"> {{ text.keyboardBack }}</template>
    </p>
    <button type="button" class="remote-back" @click="press('back')" :disabled="!ready || !(capabilities & 2)">{{ text.back }}</button>
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
import { createRemoteClient, remoteAvailability } from '../lib/remote-control.js';
import PixLinkRemote from './PixLinkRemote.vue';
import { remoteText } from '../lib/remote-text.js';
const padCommands = Object.freeze({ArrowLeft:'left', ArrowRight:'right', Enter:'center', Escape:'back'});
export default {
  components:{PixLinkRemote},
  props:{blocked:Boolean,locale:{type:String,default:'de_DE'},handoffFileConnection:Function},emits:['active'],
  data(){return {protocol:'de',pixActive:false,phase:'disconnected',capabilities:0,error:'',notice:'',checkedAt:null,setupOpen:false,unavailable:remoteAvailability()};},
  computed:{text(){return remoteText(this.locale);},waiting(){return ['connecting','command','handoff','disconnecting'].includes(this.phase);},ready(){return this.phase==='ready'&&!this.blocked;},
    keypadActive(){return !this.blocked && (this.phase === 'ready' || this.phase === 'command');},
    statusReceipt(){
      if(this.checkedAt===null)return '';
      const time=new Intl.DateTimeFormat(this.locale==='de_DE'?'de-DE':'en-US',{timeStyle:'medium'}).format(this.checkedAt);
      return this.text.connectionConfirmed.replace('{time}',time);
    }},
  created(){
    this._remoteMounted=true;
    this._remoteUiGeneration=0;
    this._remoteClient=createRemoteClient({onState:state=>{
      if(!this._remoteMounted)return;
      this.phase=state.phase;this.capabilities=state.capabilities||0;
      if(state.phase==='disconnected' || state.phase==='handoff') {
        this.checkedAt=null;
        if(this.notice==='status')this.notice='';
      }
      if(state.error){this.error=state.error;this.notice='';}
      this.$emit('active',state.phase!=='disconnected');
    }});
  },
  beforeUnmount(){this._remoteMounted=false;++this._remoteUiGeneration;this._remoteClient.disconnect();this.$emit('active',false);},
  watch:{blocked(value){if(value&&this.phase!=='disconnected')this.disconnectRemote();}},
  methods:{
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
      this.error='';this.notice='';this.checkedAt=null;this.setupOpen=false;
      try{await this._remoteClient.connect();}catch(error){if(this._remoteMounted&&generation===this._remoteUiGeneration)this.error=error?.code||'REMOTE_UNSUPPORTED';}
    },
    async disconnectRemote(){
      ++this._remoteUiGeneration;
      this.notice='';
      await this._remoteClient.disconnect();
    },
    async press(command){
      if(!this.ready)return;
      const generation=this._remoteUiGeneration;
      this.error='';this.notice='';this.checkedAt=null;
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
        }else this.notice=command;
      }catch(error){
        if(this._remoteMounted&&generation===this._remoteUiGeneration){
          this.error=command==='status'&&error?.code==='REMOTE_TIMEOUT'?'REMOTE_STATUS_TIMEOUT':error?.code||'REMOTE_REJECTED';
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
.remote-help{margin-top:16px;border-top:1px solid #d6e4e7;padding-top:10px;}.remote-help summary{min-height:44px;display:list-item;align-content:center;cursor:pointer;font-size:.85rem;font-weight:600;}.remote-help summary:focus-visible{outline:3px solid #388294;outline-offset:3px;}
@media(max-width:480px){.remote-control{padding:12px;}.remote-pad{gap:7px;}.remote-pad button{padding:8px 5px;}.remote-pad strong{font-size:.76rem;}.remote-connection>button{width:100%;}}
</style>
