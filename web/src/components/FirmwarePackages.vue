<template>
  <section class="firmware-packages" aria-labelledby="firmware-package-title">
    <h4 id="firmware-package-title">{{ text.title }}</h4>
    <p v-if="!releases.packages.length" role="status">{{ text.empty }}</p>
    <template v-else>
      <p>{{ text.scope }}</p><p class="hint">{{ text.unread }}</p>
      <div v-for="entry in releases.packages" :key="entry.id" class="package">
        <strong>{{ entry.version }}</strong> <span>· {{ text.counter }} {{ entry.counter }} · {{ (entry.bytes / 1024).toFixed(1) }} KiB</span>
        <p v-if="state(entry).newer" role="status">{{ text.newer }}</p>
        <div v-else class="actions">
          <a :href="state(entry).downloadUrl" :download="entry.file">{{ text.download }}</a>
          <a :href="state(entry).dfuUrl" target="_blank" rel="noopener">{{ text.dfu }}</a>
        </div>
        <details><summary>{{ text.details }}</summary><p>{{ entry.file }}</p><p>{{ text.hash }} (SHA-256): <code>{{ entry.sha256 }}</code></p></details>
      </div>
      <p class="hint">{{ text.limits }}</p>
      <p><a href="https://github.com/bluecyber81/pixl.js/releases/download/de3.60/Allmiibo_DE3_60_Quellcode.zip" target="_blank" rel="noopener noreferrer">{{ text.source }}</a></p>
    </template>
    <p class="hint">{{ text.local }}</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
import releases from '../data/firmware-releases.json';
import { firmwarePackageText, packagePresentation } from '../lib/release-packages.js';
const props=defineProps({session:{type:Object,default:()=>({})},boot:{type:Object,default:null},locale:{type:String,default:'de_DE'}});
const text=computed(()=>firmwarePackageText(props.locale));
const state=entry=>packagePresentation(entry,props.session,props.boot);
</script>
<style scoped>
.firmware-packages{margin-top:18px;padding-top:16px;border-top:1px solid #c6d8e6;line-height:1.5;font-size:.86rem}h4{margin:0}.hint{font-size:.78rem;color:#536b80}.package{margin:12px 0;padding:14px;background:#fff;border:1px solid #d5e0e9;border-radius:10px;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.actions a{padding:9px 12px;border:1px solid #b9d0e1;border-radius:7px;color:#225a7d;background:#f1f7fb;text-decoration:none}.actions a:hover{background:#e2eff8}summary{cursor:pointer}code{font-size:.76rem}a:focus-visible,summary:focus-visible{outline:3px solid #81b1d7;outline-offset:3px}@media(max-width:480px){.actions a{width:100%}}
</style>
