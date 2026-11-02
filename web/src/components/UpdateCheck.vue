<template>
  <section class="update-check">
    <header><div><h3>{{ text.title }}</h3><p class="target">{{ text.target }}</p></div>
      <span class="status" :class="result.status">{{ text[result.status] }}</span></header>
    <p class="subtitle">{{ text.subtitle }}</p>
    <p class="overall" role="status">{{ text.overall[result.status] }}</p>
    <div class="check-grid">
      <article v-for="row in result.rows" :key="row.id" :class="row.status">
        <div class="card-heading"><h4>{{ text.names[row.id] }}</h4><span class="status" :class="row.status">{{ text[row.status] }}</span></div>
        <p class="row-target">{{ text.targets[row.id] }}</p>
        <p class="read-value"><strong>{{ text.actual }}:</strong> {{ summary(row) }}</p>
        <p v-for="reason in row.reasons" :key="reason" class="reason">{{ text.reasons[reason] }}</p>
        <details><summary>{{ text.details }}</summary>
          <dl><div v-for="check in row.checks" :key="check.key">
            <dt>{{ text.fields[check.key] }} <span class="detail-status" :class="check.status">· {{ text[check.status] }}</span></dt>
            <dd><span>{{ text.actual }}: {{ formatUpdateValue(check.key, check.actual, locale) }}</span><span>{{ text.expected }}: {{ formatUpdateValue(check.key, check.expected, locale) }}</span></dd>
          </div></dl>
        </details>
      </article>
    </div>
    <p class="limits">{{ text.limits }}</p>
    <FirmwarePackages :session="session" :boot="boot" :locale="locale" />
  </section>
</template>
<script setup>
import { computed } from 'vue';
import FirmwarePackages from './FirmwarePackages.vue';
import { evaluateUpdateCheck, formatUpdateValue, updateCheckText } from '../lib/update-check.js';
const props = defineProps({ session: { type: Object, default: () => ({}) }, boot: { type: Object, default: null }, locale: { type: String, default: 'de_DE' } });
const result = computed(() => evaluateUpdateCheck({ session: props.session, boot: props.boot }));
const text = computed(() => updateCheckText(props.locale));
function summary(row) {
  const keys = { hardware: ['chip', 'variant', 'flash', 'ram'], application: ['version', 'applicationCounter'], bootloader: ['bootCounter', 'bootHash'], softDevice: ['sdVariant', 'sdVersion', 'sdFwid'] }[row.id];
  return keys.map(key => {
    const actual = row.checks.find(check => check.key === key).actual;
    if (key === 'bootHash' && actual != null) return `SHA-256 ${actual.slice(0, 10)}…${actual.slice(-8)}`;
    return formatUpdateValue(key, actual, props.locale);
  }).join(' · ');
}
</script>
<style scoped>
.update-check { margin:16px 0; padding:18px; border:1px solid #c6d8e6; border-radius:14px; color:#20364b; background:#f7fafc; overflow-wrap:anywhere; }
header,.card-heading { display:flex; gap:12px; align-items:flex-start; justify-content:space-between; } h3,h4 { margin:0; } h3 { font-size:1.12rem; } h4 { font-size:.98rem; }
.target { margin:6px 0 0; font-size:.84rem; color:#4d667e; } .subtitle,.overall { margin:10px 0; line-height:1.5; font-size:.86rem; } .overall { font-weight:600; }
.status { display:inline-block; flex-shrink:0; padding:4px 8px; border-radius:20px; font-size:.72rem; font-weight:600; background:#e8eef4; color:#485c70; }
.status.match { background:#dcefe5; color:#205a3e; } .status.different { background:#fff0d7; color:#785013; } .status.unknown { background:#e8eef4; color:#485c70; }
.check-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:14px; }
article { min-width:0; padding:14px; border:1px solid #d5e0e9; border-radius:10px; background:#fff; } article.match { border-color:#badac9; } article.different { border-color:#e0c99d; }
.row-target,.read-value { font-size:.81rem; line-height:1.5; margin:10px 0; } .row-target { color:#4d667e; } .read-value { font-variant-numeric:tabular-nums; }
.reason,.limits { font-size:.76rem; color:#536b80; line-height:1.5; margin:8px 0; } .limits { margin-bottom:0; }
details { margin-top:12px; } summary { cursor:pointer; font-size:.8rem; color:#255b83; padding:6px 0; } summary:focus-visible { outline:3px solid #81b1d7; outline-offset:2px; border-radius:3px; }
dl { margin:8px 0 0; } dl>div { border-top:1px solid #e7eef3; padding:8px 0; } dt { font-weight:600; font-size:.75rem; line-height:1.5; } dd { margin:4px 0 0; font-size:.74rem; line-height:1.6; } dd span { display:block; } .detail-status { font-weight:400; color:#536b80; } .detail-status.match { color:#205a3e; } .detail-status.different { color:#785013; }
@media(max-width:700px) { .check-grid { grid-template-columns:1fr; } header { flex-wrap:wrap; } .update-check { padding:12px; } .card-heading { gap:8px; } }
</style>
