<template>
  <section class="dialog-transfer" :aria-label="$t('tools.transfer')">
    <div class="phase"><strong>{{ $t('tools.' + transfer.phase) }}</strong><span v-if="knownTotal">{{ percent }}%</span></div>
    <p class="path">{{ transfer.path }}</p>
    <progress :value="knownTotal ? percent : undefined" max="100" :aria-label="$t('tools.transfer')"></progress>
    <div class="counters"><span>{{ formatSize(transfer.done) }}<template v-if="knownTotal"> / {{ formatSize(transfer.total) }}</template></span>
      <span v-if="stats?.bytesPerSecond != null">{{ formatSize(Math.round(stats.bytesPerSecond)) }}/s</span>
      <span v-if="stats?.etaSeconds != null">{{ $t('info.remaining', { seconds: Math.ceil(stats.etaSeconds) }) }}</span></div>
    <p v-if="stats?.stalled" class="hint">{{ $t('info.waiting') }}</p>
    <p class="hint">{{ $t('info.estimateHint') }}</p>
    <button v-if="canCancel" type="button" :disabled="cancelling" @click="$emit('cancel')">{{ $t(cancelling ? 'info.finishingCommit' : 'tools.cancel') }}</button>
    <!-- Announce phase and coarse progress, not every byte/rate render. -->
    <span class="sr-status" role="status" aria-live="polite">{{ $t('tools.' + transfer.phase) }}<template v-if="knownTotal"> · {{ Math.floor(percent / 10) * 10 }}%</template></span>
  </section>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ transfer: {type:Object,required:true}, stats: {type:Object,default:null},
  formatSize: {type:Function,required:true}, canCancel:Boolean, cancelling:Boolean });
defineEmits(['cancel']);
const knownTotal = computed(() => Number.isSafeInteger(props.transfer.total) && props.transfer.total >= 0);
const percent = computed(() => Math.floor(props.stats?.percent ?? 0));
</script>
<style scoped>
.dialog-transfer { margin:12px 0; padding:14px; border:1px solid #bcd2e6; border-radius:10px; background:#f1f7fc; color:#284761; }
.phase,.counters { display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; font-size:.84rem; font-variant-numeric:tabular-nums; }
.path { overflow-wrap:anywhere; line-height:1.5; margin:8px 0; font-size:.8rem; }
progress { width:100%; height:12px; accent-color:#316fa0; }
.counters { margin:8px 0; justify-content:flex-start; }
.hint { font-size:.74rem; line-height:1.5; color:#5c7185; margin:6px 0; }
button { margin-top:8px; padding:10px 14px; min-height:42px; border:1px solid #9ab7ce; border-radius:7px; color:#24577f; background:white; cursor:pointer; }
button:disabled { opacity:.6; cursor:default; }
.sr-status { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
@media(max-width:480px) { .dialog-transfer { padding:11px; } button { width:100%; } }
</style>
