<template>
  <section class="game-guide">
    <h4>{{ game.title }} · {{ game.platform }}</h4>
    <p>{{ de ? game.de : game.en }}</p>
    <a :href="game.source" target="_blank" rel="noopener noreferrer">{{ de ? 'Spielhinweis von Nintendo' : 'Nintendo game guide' }}</a>
    <a v-if="game.communityLink" :href="game.communityLink" target="_blank" rel="noopener noreferrer">{{ de ? 'Air Riders Stat Tracker (Community)' : 'Air Riders Stat Tracker (community)' }}</a>
  </section>
</template>

<script setup>
defineProps({ game: { type: Object, required: true }, de: Boolean });
</script>

<style scoped>
.game-guide { margin: .85rem 0; padding: .75rem 1rem; background: #edf5f6; border-left: 3px solid #348487; border-radius: 4px; }
h4 { margin: 0; font-size: .9rem; }
p, a { font-size: .82rem; line-height: 1.5; }
p { margin: .35rem 0; }
a { display: inline-block; padding: .35rem 0; margin-right: 1rem; color: #165b70; text-underline-offset: .15em; }
</style>
