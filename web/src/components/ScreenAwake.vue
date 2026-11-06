<template>
  <aside v-if="active" class="screen-awake" role="status" aria-live="polite">
    <strong>{{ de ? 'Handy-Display' : 'Phone screen' }}</strong>
    <span>{{ message }}</span>
    <small>{{ de ? 'Diesen Tab im Vordergrund lassen. Manuelles Sperren kann Bluetooth unterbrechen.' : 'Keep this tab in the foreground. Manually locking the screen may interrupt Bluetooth.' }}</small>
    <div class="awake-actions">
      <label><input type="checkbox" v-model="enabled" /> {{ de ? 'Während des Vorgangs wach halten' : 'Keep awake during the operation' }}</label>
      <button v-if="enabled && state.available && ['released','unavailable'].includes(state.status)" type="button" @click="controller.retry()">{{ de ? 'Erneut versuchen' : 'Retry' }}</button>
    </div>
  </aside>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { createScreenAwake } from '../lib/screen-awake.js';
const props = defineProps({ active: Boolean, locale: { type: String, default: 'de_DE' } });
const enabled = ref(true), state = shallowRef({ available: false, held: false, status: 'idle' });
const controller = createScreenAwake({ onChange: value => { state.value = value; } });
const de = computed(() => props.locale.startsWith('de'));
const message = computed(() => {
  if (!enabled.value) return de.value ? 'Automatisches Wachhalten ausgeschaltet. Display bitte selbst eingeschaltet lassen.' : 'Automatic keep-awake is off. Keep the screen on yourself.';
  const messages = {
    active: ['Der Browser hält das Display für diesen Vorgang wach.', 'The browser is keeping the screen awake for this operation.'],
    requesting: ['Wachhalten wird angefordert …', 'Requesting screen wake lock …'],
    hidden: ['Tab war nicht sichtbar. Nach der Rückkehr wird Wachhalten erneut angefordert.', 'The tab was not visible. Keep-awake is requested again when you return.'],
    unsupported: ['Hier ist automatisches Wachhalten nicht verfügbar. Display bitte selbst eingeschaltet lassen.', 'Automatic keep-awake is not available here. Keep the screen on yourself.'],
    unavailable: ['Der Browser hat Wachhalten nicht erlaubt. Display bitte selbst eingeschaltet lassen.', 'The browser did not allow keep-awake. Keep the screen on yourself.'],
    released: ['Das System hat Wachhalten beendet. Display bitte selbst eingeschaltet lassen.', 'The system released keep-awake. Keep the screen on yourself.'],
  };
  return (messages[state.value.status] || messages.requesting)[de.value ? 0 : 1];
});
watch([() => props.active, enabled], ([active, allowed]) => controller.setActive(active && allowed), { immediate: true, flush: 'sync' });
onBeforeUnmount(() => controller.dispose());
</script>
<style scoped>
.screen-awake { display:grid; gap:5px; min-width:0; overflow-wrap:anywhere; margin:0 0 14px; padding:11px 13px; border:1px solid #cbded9; border-radius:9px; background:#f3faf7; color:#31554b; font-size:.8rem; line-height:1.5; }
.screen-awake small { font-size:.73rem; color:#526e64; }
.awake-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
label { display:flex; align-items:center; gap:7px; min-height:36px; }
button { padding:6px 10px; min-height:36px; border:1px solid #aac9bf; border-radius:6px; color:inherit; background:white; font:inherit; }
button:focus-visible,input:focus-visible { outline:3px solid #6b9cce; outline-offset:3px; }
</style>
