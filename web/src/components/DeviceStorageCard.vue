<template>
  <aside class="sidebar-device device-card" :class="{ 'device-card-online': connected }" :aria-label="de ? 'Dein Gerät' : 'Your device'">
    <header class="device-card-head">
      <span class="device-art" aria-hidden="true">
        <svg viewBox="0 0 48 42" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <rect x="4" y="4" width="40" height="32" rx="7"/><rect x="10" y="9" width="28" height="17" rx="3"/>
          <path d="M14 15h9m-9 4h5m11 1 3-3-3-3M11 31h4m3 0h3"/><circle cx="34" cy="31" r="1"/>
        </svg>
      </span>
      <div><p class="device-eyebrow">{{ de ? 'Dein Gerät' : 'Your device' }}</p>
      <strong class="device-name">{{ connected ? (nickname || 'Allmiibo LCD') : $t('info.disconnected') }}</strong>
      <small v-if="connected && nickname" class="device-model">Allmiibo LCD</small></div>
    </header>
    <template v-if="connected">
      <div v-if="directory" class="device-folder">
        <div class="device-location"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg><span :title="directory">{{ directory }}</span></div>
        <span v-if="entries != null" class="device-count">{{ entries }} {{ de ? (entries === 1 ? 'Eintrag' : 'Einträge') : (entries === 1 ? 'entry' : 'entries') }}</span>
      </div>
      <button type="button" class="sidebar-upload device-upload" :disabled="uploadDisabled" @click="$emit('upload')"><span aria-hidden="true">↑</span> {{ $t('menu.upload') }}</button>
      <div v-if="usage" class="device-storage">
        <div class="device-storage-title"><span>{{ de ? 'Speicher' : 'Storage' }}</span><span class="device-drive">{{ drive.label }}:</span></div>
        <div class="device-free"><b>{{ amount(usage.free) }}</b> {{ de ? 'frei' : 'free' }}</div>
        <div class="device-meter-line"><span class="device-footnote">{{ de ? 'von' : 'of' }} {{ amount(usage.total) }}</span><strong class="device-used-label">{{ percentage }} {{ de ? 'belegt' : 'used' }}</strong></div>
        <meter class="device-used-meter" :value="usage.used" :max="usage.total" min="0" :aria-label="de ? 'Belegter Speicher' : 'Used storage'" :aria-valuetext="meterText" :title="meterText"></meter>
      </div>
      <p v-else class="device-no-data">{{ de ? 'Noch keine Speicherwerte.' : 'Storage information unavailable.' }}</p>
    </template>
  </aside>
</template>
<script>
import { storageUsage, storageAmount, occupiedPercent } from '../lib/device-storage-display.js';
export default {
  name:'DeviceStorageCard',
  props:{ connected:Boolean, nickname:String, drive:Object, directory:String, entries:Number, locale:String, uploadDisabled:Boolean },
  emits:['upload'],
  computed:{
    de(){ return this.locale?.startsWith('de'); },
    usage(){ return this.connected ? storageUsage(this.drive) : null; },
    percentage(){ return this.usage ? occupiedPercent(this.usage,this.locale) : ''; },
    meterText(){ const u=this.usage; return u ? this.amount(u.used)+' '+(this.de?'belegt':'used')+' · '+this.amount(u.free)+' '+(this.de?'frei':'free') : ''; },
  },
  methods:{amount(bytes){return storageAmount(bytes,this.locale);}}
};
</script>
<style scoped>
aside.device-card { --device-teal:#075a5a; --device-line:#c1d6d7; display:block; min-width:0; margin:14px 0 2px; padding:14px 12px 11px; border:1px solid var(--device-line); border-radius:15px; background:linear-gradient(145deg,#ebf6f3 0%,#fafdfc 60%,#f2f1fb 100%); color:#25404c; box-shadow:0 3px 10px #3457620b; font-size:.8rem; line-height:1.4; }
.device-card-head{display:flex;align-items:center;gap:9px;}
.device-art{flex:0 0 36px;width:36px;height:36px;display:grid;place-items:center;border:1px solid #bfdbd6;border-radius:11px;background:#f6fffc;color:#23685f;}
.device-art svg{width:30px;height:27px;}
.device-card-head>div{min-width:0;}
.device-card .device-name{overflow-wrap:anywhere;}
.device-model{display:block;color:#465861;}
.device-card .device-eyebrow{margin:0 0 1px;font-size:.64rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#46655f;}
.device-card .device-name{font-size:1rem;line-height:1.2;letter-spacing:-.015em;color:#193d46;}
.device-folder{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:5px;margin:12px 0 0;padding:8px 0 9px;border-block:1px solid #d1e1df;}
.device-location{min-width:0;display:flex;align-items:baseline;gap:4px;color:#284b55;}
.device-location svg{width:15px;height:15px;flex:0 0 15px;align-self:center;}
.device-location span{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-weight:600;}
.device-count{font-size:.73rem;color:#415964;}
.device-storage{margin-top:11px;}
.device-storage-title,.device-meter-line{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:2px 6px;}
.device-storage-title{font-size:.72rem;font-weight:650;color:#395260;}
.device-drive{font-family:ui-monospace,monospace;color:#31535a;}
.device-free{font-size:.83rem;color:var(--device-teal);padding:2px 0 4px;}
.device-free b{font-size:1.18rem;letter-spacing:-.025em;color:#163f46;line-height:1.3;}
.device-footnote,.device-card .device-used-label{font-size:.68rem;color:#455d66;font-variant-numeric:tabular-nums;}
.device-card .device-used-label{color:#4f4a7a;font-weight:700;}
.device-used-meter{display:block;appearance:none;-webkit-appearance:none;width:100%;height:13px;margin-top:5px;overflow:hidden;border:1px solid #b3c6ca;border-radius:99px;background:#dce9eb;}
.device-used-meter::-webkit-meter-bar{height:100%;border:0;border-radius:99px;background:#dce9eb;}
.device-used-meter::-webkit-meter-optimum-value{border-radius:99px;background:linear-gradient(90deg,#05746b 0%,#287d91 50%,#625398 100%);}
.device-used-meter::-moz-meter-bar{border-radius:99px;background:linear-gradient(90deg,#05746b,#287d91,#625398);}
.workspace-nav .device-card button.device-upload{width:100%;display:flex;flex-direction:row;justify-content:center;gap:5px;margin:12px 0 0;min-height:34px;padding:5px 6px;border:1px solid #c8d7da;border-radius:8px;background:#ffffffc9;color:var(--device-teal);font-size:.76rem;}
.workspace-nav .device-card button.device-upload:disabled{opacity:.58;}
.device-no-data{font-size:.76rem;color:#465f69;}
@media(min-width:1024px){ :global(.filemanager .app-layout){grid-template-columns:clamp(238px,20vw,286px) minmax(0,1fr);} }
@media(max-width:650px){
  aside.device-card{grid-column:1/-1;margin:3px 0 0;padding:11px 13px;}
  aside.device-card:not(.device-card-online){display:none;}
  aside.device-card-online{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:7px 15px;}
  .device-card .device-folder{justify-content:flex-end;margin:0;padding:0;border:0;}
  .device-card .device-storage{grid-column:1/-1;margin:0;}
  .device-card .device-upload{display:none!important;}
}
@media(forced-colors:active){.device-used-meter{appearance:auto;forced-color-adjust:auto;}}
</style>
