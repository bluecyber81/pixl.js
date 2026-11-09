<template>
  <details class="announcements" :open="expanded">
    <summary>{{ de ? 'Angekündigte Figuren' : 'Announced figures' }} ({{ count }})</summary>
    <p class="scope">{{ de
      ? 'Diese Vorschau zählt separat vom Gerätebestand. Die Termine gelten für die angegebene Region.'
      : 'These announcements are separate from your device inventory. Dates apply to the region shown.' }}
      <template v-if="sharedCheckedOn">{{ de ? 'Quellen geprüft am' : 'Sources checked on' }} {{ dateLabel(sharedCheckedOn) }}.</template>
    </p>
    <section v-for="group in groups" :key="group.series" class="announcement-group">
      <p class="group-title"><strong>{{ group.series }}</strong> · {{ dateLabel(group.date) }} ({{ group.region }})</p>
      <p v-if="!sharedCheckedOn" class="scope">{{ de ? 'Quellen geprüft am' : 'Sources checked on' }} {{ dateLabel(group.sourceCheckedOn) }}.</p>
      <ul>
        <li v-for="figure in group.figures" :key="figure.en">
          <a :href="figure.source" target="_blank" rel="noopener noreferrer">{{ de ? figure.de : figure.en }}</a>
          <div v-if="figure.proposedId" class="proposed-id">
            <a :href="zeldaIdProposal" target="_blank" rel="noopener noreferrer">{{ de ? 'Unbestätigte Community-ID' : 'Unconfirmed community ID' }}</a>
            <code>{{ figure.proposedId }}</code>
          </div>
        </li>
      </ul>
      <p v-if="group.usage && group.note" class="game-note">{{ de ? group.note.de : group.note.en }}
        <a :href="group.usage" target="_blank" rel="noopener noreferrer">{{ de ? 'Nintendo-Spielhinweis' : 'Nintendo game guide' }}</a>
      </p>
    </section>
  </details>
</template>

<script setup>
import { computed } from 'vue';
import { zeldaIdProposal } from '../data/announced-figures.js';

const props = defineProps({ groups: { type: Array, required: true }, de: Boolean, expanded: Boolean });
const count = computed(() => props.groups.reduce((total, group) => total + group.figures.length, 0));
const sharedCheckedOn = computed(() => {
  const dates = new Set(props.groups.map(group => group.sourceCheckedOn));
  return dates.size === 1 ? [...dates][0] : null;
});

function dateLabel(date) {
  if (date === 'spring-2027') return props.de ? 'Frühjahr 2027' : 'Spring 2027';
  if (date.length === 4) return date;
  return new Intl.DateTimeFormat(props.de ? 'de-DE' : 'en-GB', {
    dateStyle: 'long', timeZone: 'UTC',
  }).format(new Date(date + 'T00:00:00Z'));
}
</script>

<style scoped>
.announcements { background: #fff; border: 1px solid #cdd7df; border-radius: 8px; margin: 12px 0; padding: 0 12px; }
summary { cursor: pointer; padding: 12px 0; color: #315c7b; font-size: .9rem; font-weight: 600; }
.scope, .game-note { color: #435d71; font-size: .82rem; line-height: 1.5; margin: 0 0 12px; }
.announcement-group { border-top: 1px solid #dce5ed; }
.group-title { margin: 12px 0 5px; font-size: .88rem; }
ul { margin: 4px 0 12px; padding-left: 1.25em; }
li { padding: 4px 0; font-size: .86rem; overflow-wrap: anywhere; }
.proposed-id { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 2px; font-size: .76rem; }
a { color: #185a86; text-underline-offset: .16em; }
summary:focus-visible, a:focus-visible { outline: 2px solid #37759a; outline-offset: 2px; }
</style>
