<template>
  <section class="display-photo" :aria-busy="loading">
    <h3>{{ text.title }}</h3>
    <p>{{ connected && !supported ? text.unavailable : text.hint }}</p>
    <button type="button" :disabled="!connected || !supported || blocked || loading" @click="capture">
      {{ loading ? text.loading : text.capture }}
    </button>
    <p v-if="status" role="status">{{ text[status] }}</p>
    <figure v-if="photo">
      <img :src="photo" width="128" height="64" :alt="text.preview" />
      <figcaption><a :href="photo" download="Allmiibo-LCD.png">{{ text.save }}</a></figcaption>
    </figure>
  </section>
</template>

<script>
import { renderDisplayPhoto, supportsDisplayPhoto } from '../lib/display-photo.js';
const words = {
  de: {
    title: 'LCD-Displayfoto', hint: 'Lies die aktuelle Anzeige der Bluetooth-Dateiübertragung direkt vom Gerät.',
    unavailable: 'Das Displayfoto ist auf LCD-Geräten ab DE3.66 verfügbar.', capture: 'Displayfoto aufnehmen',
    loading: 'Bild wird gelesen …', save: 'PNG speichern', preview: 'Aufnahme der LCD-Anzeige',
    changed: 'Die Anzeige hat sich beim Lesen geändert. Sobald sie ruhig ist, kannst du erneut aufnehmen.',
    failed: 'Das Bild konnte nicht gelesen werden. Prüfe die Verbindung und versuche es erneut.'
  },
  en: {
    title: 'LCD screenshot', hint: 'Read the current Bluetooth file transfer screen directly from the device.',
    unavailable: 'Screenshots are available on LCD devices running DE3.66 or later.', capture: 'Capture screen',
    loading: 'Reading screen …', save: 'Save PNG', preview: 'Captured LCD screen',
    changed: 'The screen changed during capture. Try again once it settles.',
    failed: 'Could not read the screen. Check the connection and try again.'
  }
};
export default {
  props: { connected: Boolean, blocked: Boolean, generation: Number, firmwareVersion: String, locale: String, readPhoto: Function },
  emits: ['busy'],
  data() { return { photo: '', status: '', loading: false, serial: 0 }; },
  computed: {
    text() { return this.locale?.startsWith('de') ? words.de : words.en; },
    supported() { return supportsDisplayPhoto(this.firmwareVersion); }
  },
  watch: { generation: 'clear', connected: 'clear' },
  beforeUnmount() { this.clear(); },
  methods: {
    clear() {
      this.serial++;
      this.photo = '';
      this.status = '';
      if (this.loading) { this.loading = false; this.$emit('busy', false); }
    },
    async capture() {
      if (!this.connected || !this.supported || this.blocked || this.loading) return;
      const serial = ++this.serial;
      this.photo = '';
      this.status = '';
      this.loading = true;
      this.$emit('busy', true);
      try {
        const pixels = await this.readPhoto(this.firmwareVersion);
        if (serial !== this.serial || !this.connected) return;
        if (pixels === null) this.status = 'unavailable';
        else this.photo = renderDisplayPhoto(pixels, document.createElement('canvas'));
      } catch (error) {
        if (serial === this.serial) this.status = error?.code === 'LCD_CHANGED' ? 'changed' : 'failed';
      } finally {
        if (serial === this.serial) { this.loading = false; this.$emit('busy', false); }
      }
    }
  }
};
</script>

<style scoped>
.display-photo { margin-block: 1rem; }
figure { margin: .8rem 0; }
img { display: block; width: min(100%, 384px); height: auto; image-rendering: pixelated; border: 1px solid currentColor; }
figcaption { margin-top: .5rem; }
</style>
