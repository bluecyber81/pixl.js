<template>
  <span v-if="publicId" class="figure-id-copy">
    <code>{{ source && result !== 'failed' ? publicId.slice(0, 12) + '…' : publicId }}</code>
    <button type="button" @click="copyId">{{ source ? (de ? 'SourceID kopieren' : 'Copy SourceID') : (de ? 'ID kopieren' : 'Copy ID') }}</button>
    <span role="status">{{ message }}</span>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { figureId } from '../lib/figure-info.js';

const props = defineProps({ id: String, de: Boolean, source: Boolean });
const publicId = computed(() => props.source ? (/^[a-f0-9]{64}$/.test(props.id) ? props.id : null) : figureId(props.id));
const result = ref('');
const message = computed(() => {
  if (result.value === 'copied') return props.de ? 'ID kopiert.' : 'ID copied.';
  if (result.value === 'failed') return props.de
    ? 'Kopieren fehlgeschlagen. Markiere die ID und kopiere sie selbst.'
    : 'Copy failed. Select the ID and copy it manually.';
  return '';
});
let attempt = 0;
watch(publicId, () => { ++attempt; result.value = ''; }, { flush: 'sync' });

async function copyId() {
  const id = publicId.value;
  if (!id) return;
  const current = ++attempt;
  result.value = '';
  try {
    await navigator.clipboard.writeText(id);
    if (current === attempt) result.value = 'copied';
  } catch {
    if (current === attempt) result.value = 'failed';
  }
}
</script>

<style scoped>
.figure-id-copy { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .6rem; }
.figure-id-copy code { user-select: all; font-size: .8rem; }
.figure-id-copy button {
  min-height: 36px; padding: .35rem .65rem; border: 1px solid #b8ccdc; border-radius: 7px;
  background: white; color: #205580; font: inherit; font-size: .78rem; cursor: pointer;
}
.figure-id-copy button:hover { background: #eaf2f9; }
.figure-id-copy [role=status]:not(:empty) { flex-basis: 100%; font-size: .8rem; }
</style>
