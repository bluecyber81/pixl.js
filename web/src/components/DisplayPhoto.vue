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
      <figcaption>
        <time :datetime="capturedAt">{{ captureLabel }}</time> · {{ capturedFirmware }}
        <div class="photo-actions">
          <button type="button" :aria-pressed="rotated" @click="rotate">{{ text.rotate }}</button>
          <a :href="photo" download="Allmiibo-LCD.png">{{ text.save }}</a>
        </div>
      </figcaption>
    </figure>
  </section>
</template>

<script>
import { renderDisplayPhoto, supportsDisplayPhoto } from '../lib/display-photo.js';
const words = {
  de: {
    title: 'LCD-Displayfoto', hint: 'Lies die aktuelle Anzeige der Bluetooth-Dateiübertragung direkt vom Gerät.',
    unavailable: 'Das Displayfoto ist auf LCD-Geräten ab DE3.66 verfügbar.', capture: 'Displayfoto aufnehmen',
    loading: 'Bild wird gelesen …', save: 'PNG speichern', rotate: 'Um 180° drehen', preview: 'Aufnahme der LCD-Anzeige',
    changed: 'Die Anzeige hat sich beim Lesen geändert. Sobald sie ruhig ist, kannst du erneut aufnehmen.',
    failed: 'Das Bild konnte nicht gelesen werden. Prüfe die Verbindung und versuche es erneut.',
    renderFailed: 'Der Browser konnte das PNG nicht erstellen. Versuche es erneut.'
  },
  en: {
    title: 'LCD screenshot', hint: 'Read the current Bluetooth file transfer screen directly from the device.',
    unavailable: 'Screenshots are available on LCD devices running DE3.66 or later.', capture: 'Capture screen',
    loading: 'Reading screen …', save: 'Save PNG', rotate: 'Rotate 180°', preview: 'Captured LCD screen',
    changed: 'The screen changed during capture. Try again once it settles.',
    failed: 'Could not read the screen. Check the connection and try again.',
    renderFailed: 'The browser could not create the PNG. Please try again.'
  }
};
export default {
  props: { connected: Boolean, blocked: Boolean, generation: Number, firmwareVersion: String, locale: String, readPhoto: Function },
  emits: ['busy'],
  data() { return { pixels: null, photo: '', rotated: false, capturedAt: '', capturedFirmware: '', status: '', loading: false, serial: 0 }; },
  computed: {
    text() { return this.locale?.startsWith('de') ? words.de : words.en; },
    supported() { return supportsDisplayPhoto(this.firmwareVersion); },
    captureLabel() {
      return this.capturedAt ? new Date(this.capturedAt).toLocaleString(this.locale?.startsWith('de') ? 'de-DE' : 'en-US') : '';
    }
  },
  watch: { generation: 'clear', connected: 'clear', firmwareVersion: 'clear' },
  beforeUnmount() { this.clear(); },
  methods: {
    clear() {
      this.serial++;
      this.photo = '';
      this.pixels = null;
      this.rotated = false;
      this.capturedAt = '';
      this.capturedFirmware = '';
      this.status = '';
      if (this.loading) { this.loading = false; this.$emit('busy', false); }
    },
    draw(pixels, rotated) {
      try {
        const png = renderDisplayPhoto(pixels, document.createElement('canvas'), rotated);
        this.photo = png;
        this.rotated = rotated;
        this.status = '';
        return true;
      } catch {
        this.status = 'renderFailed';
        return false;
      }
    },
    rotate() {
      if (this.pixels && !this.loading) this.draw(this.pixels, !this.rotated);
    },
    async capture() {
      if (!this.connected || !this.supported || this.blocked || this.loading) return;
      const serial = ++this.serial;
      this.photo = '';
      this.pixels = null;
      this.rotated = false;
      this.status = '';
      this.loading = true;
      this.$emit('busy', true);
      try {
        const pixels = await this.readPhoto(this.firmwareVersion);
        if (serial !== this.serial || !this.connected) return;
        if (pixels === null) this.status = 'unavailable';
        else if (this.draw(pixels, false)) {
          this.capturedAt = new Date().toISOString();
          this.capturedFirmware = this.firmwareVersion;
          this.pixels = pixels;
        }
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
.photo-actions { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem 1rem; margin-top:.4rem; }
.photo-actions button { min-height:44px; }
</style>
