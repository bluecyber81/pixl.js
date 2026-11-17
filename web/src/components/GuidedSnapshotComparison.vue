<template>
  <div class="snapshot-comparison">
    <table>
      <caption>{{ pick('Speicher vor und nach dem Test', 'Storage before and after the test') }}</caption>
      <thead>
        <tr>
          <th scope="col">{{ pick('Messwert', 'Reading') }}</th>
          <th scope="col">{{ pick('Vorher', 'Before') }}</th>
          <th scope="col">{{ pick('Nachher', 'After') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <th scope="row">{{ row.label }}</th>
          <td v-for="(value, index) in row.values" :key="index">{{ value ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
    <p>{{ pick('Scanzeit und Cache gehören zum letzten Einbinden von Laufwerk E. Beide Aufnahmen können denselben Start zeigen. Die Zeitangaben zeigen den Empfang im Browser. Ein Strich bedeutet, dass der Wert fehlt.',
      'Scan time and cache refer to the last mount of drive E. Both snapshots may describe the same startup. Times show when the browser received each section. A dash means the reading is unavailable.') }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({locale:String, before:{type:Object, required:true}, after:{type:Object, required:true}});
const pick = (de,en) => props.locale?.startsWith('de') ? de : en;
const withUnit = (value, unit) => value == null ? null : value + ' ' + unit;
const observed = (section) => section?.state === 'available' ? section : null;

const rows = computed(() => {
  const values = [props.before, props.after].map(read => {
    const {runtime, startup} = read.snapshot.sections;
    const mount = observed(startup)?.data?.mount;
    const time = section => observed(section)?.observedAt
      ? new Date(section.observedAt).toLocaleString(pick('de-DE','en-GB')) : null;
    return {
      firmware:read.buildIdentity.observed.firmwareVersion,
      mountReceipt:time(startup),
      scan:withUnit(mount?.scanMilliseconds, 'ms'),
      pages:mount?.cacheSlotsFilled == null ? null : mount.cacheSlotsFilled + ' / ' + mount.cacheSlotsAllocated,
      pageBytes:withUnit(mount?.cachePageBytes, 'B'),
      heapReceipt:time(runtime),
      heap:withUnit(observed(runtime)?.data?.heapFreeBytes, 'B'),
    };
  });
  const fields = [
    ['firmware', 'Firmware', 'Firmware'],
    ['mountReceipt', 'Startdiagnose gelesen', 'Startup diagnostics received'],
    ['scan', 'PackedFS-Scanzeit', 'PackedFS scan time'],
    ['pages', 'Cache-Seiten belegt / zugeteilt', 'Cache pages filled / allocated'],
    ['pageBytes', 'Bytes je Cache-Seite', 'Bytes per cache page'],
    ['heapReceipt', 'Heap-Diagnose gelesen', 'Heap diagnostics received'],
    ['heap', 'Freier Heap', 'Free heap'],
  ];
  return fields.map(([key,de,en]) => ({label:pick(de,en), values:values.map(value => value[key])}));
});
</script>

<style scoped>
.snapshot-comparison {min-width:0; margin-block:1rem}
table {width:100%; border-collapse:collapse; table-layout:fixed; overflow-wrap:anywhere; font-variant-numeric:tabular-nums}
caption {text-align:start; font-weight:650; margin-block-end:.45rem}
th,td {padding:.35rem .3rem; text-align:start; vertical-align:top; border-bottom:1px solid var(--rule,#ccd8d3)}
th:first-child {width:42%}
p {font-size:.9em}
</style>
