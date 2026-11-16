<template>
  <section class="display-photo" :aria-busy="loading">
    <h3>{{ text.title }}</h3>
    <p>{{ connected && !supported ? (remote ? text.remoteUnavailable : text.unavailable) : (remote ? text.remoteHint : text.hint) }}</p>
    <button v-if="!remote || supported" type="button" :disabled="!connected || !supported || blocked || loading" @click="capture">
      {{ loading ? text.loading : (remote ? text.refresh : text.capture) }}
    </button>
    <p v-if="status" role="status">{{ text[status] }}</p>
    <figure v-if="photo">
      <div class="photo-surface">
        <img :src="photo" :width="128 * zoom" :height="64 * zoom" :alt="text.preview" />
      </div>
      <figcaption>
        {{ text.captured }} <time :datetime="capturedAt">{{ captureLabel }}</time><template v-if="capturedFirmware"> · {{ capturedFirmware }}</template>
        <div class="photo-scale" role="group" :aria-label="text.scale">
          <span>{{ text.scale }}</span>
          <button v-for="factor in [1, 2, 3]" :key="factor" type="button" :disabled="factor > maxZoom"
            :aria-pressed="zoom === factor" @click="preferredZoom = factor">{{ factor }}×</button>
        </div>
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
    remoteHint: 'Das Foto zeigt das Gerätemenü zum Zeitpunkt der Aufnahme. Tippe nach dem Navigieren auf „Displaybild aktualisieren“.',
    remoteUnavailable: 'Für Displayfotos in der Fernbedienung benötigt das LCD-Allmiibo DE3.74 oder neuer.',
    refresh: 'Displaybild aktualisieren', captured: 'Aufnahme vom', scale: 'Bildgröße',
    remoteBusy: 'Das Gerät kann gerade kein Displayfoto liefern. Du kannst die Aufnahme erneut anfordern.',
    unavailable: 'Das Displayfoto ist auf LCD-Geräten ab DE3.66 verfügbar.', capture: 'Displayfoto aufnehmen',
    loading: 'Bild wird gelesen …', save: 'PNG speichern', rotate: 'Um 180° drehen', preview: 'Aufnahme der LCD-Anzeige',
    changed: 'Die Anzeige hat sich beim Lesen geändert. Sobald sie ruhig ist, kannst du erneut aufnehmen.',
    failed: 'Das Bild konnte nicht gelesen werden. Prüfe die Verbindung und versuche es erneut.',
    renderFailed: 'Der Browser konnte das PNG nicht erstellen. Versuche es erneut.'
  },
  en: {
    title: 'LCD screenshot', hint: 'Read the current Bluetooth file transfer screen directly from the device.',
    remoteHint: 'The picture shows the device menu at the time of capture. After navigating, click “Refresh screen”.',
    remoteUnavailable: 'Remote screenshots require DE3.74 or later on the LCD Allmiibo.',
    refresh: 'Refresh screen', captured: 'Captured on', scale: 'Image scale',
    remoteBusy: 'The device is busy and could not provide a screenshot. You can request a new picture.',
    unavailable: 'Screenshots are available on LCD devices running DE3.66 or later.', capture: 'Capture screen',
    loading: 'Reading screen …', save: 'Save PNG', rotate: 'Rotate 180°', preview: 'Captured LCD screen',
    changed: 'The screen changed during capture. Try again once it settles.',
    failed: 'Could not read the screen. Check the connection and try again.',
    renderFailed: 'The browser could not create the PNG. Please try again.'
  }
};
export default {
  props: { connected: Boolean, blocked: Boolean, generation: Number, firmwareVersion: String, locale: String, readPhoto: Function, remote: Boolean, remoteSupported: Boolean },
  emits: ['busy'],
  data() { return { pixels: null, photo: '', rotated: false, capturedAt: '', capturedFirmware: '', status: '', loading: false, serial: 0, preferredZoom: 3, maxZoom: 1 }; },
  computed: {
    text() { return this.locale?.startsWith('de') ? words.de : words.en; },
    supported() { return this.remote ? this.remoteSupported : supportsDisplayPhoto(this.firmwareVersion); },
    zoom() { return Math.min(this.preferredZoom, this.maxZoom); },
    captureLabel() {
      return this.capturedAt ? new Date(this.capturedAt).toLocaleString(this.locale?.startsWith('de') ? 'de-DE' : 'en-US') : '';
    }
  },
  watch: { generation: 'clear', connected: 'clear', firmwareVersion: 'clear', supported: 'clear' },
  mounted() {
    this.measure();
    if (typeof ResizeObserver === 'function') {
      this._resize = new ResizeObserver(([entry]) => this.measure(entry.contentRect.width));
      this._resize.observe(this.$el);
    } else window.addEventListener('resize', this.measure);
  },
  beforeUnmount() {
    if (this._resize) this._resize.disconnect();
    else window.removeEventListener('resize', this.measure);
    this.clear();
  },
  methods: {
    measure(width) {
      const available = typeof width === 'number' ? width : this.$el.clientWidth;
      this.maxZoom = Math.max(1, Math.min(3, Math.floor(available / 128)));
    },
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
      this.capturedAt = '';
      this.capturedFirmware = '';
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
        if (serial === this.serial) {
          if (error?.code === 'LCD_CHANGED') this.status = 'changed';
          else if (this.remote && ['REMOTE_BUSY','REMOTE_UNSAFE'].includes(error?.code)) this.status = 'remoteBusy';
          else this.status = 'failed';
        }
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
.photo-surface { overflow-x: auto; }
img { display: block; max-width: none; image-rendering: pixelated; }
figcaption { margin-top: .5rem; }
.photo-scale { display:flex; flex-wrap:wrap; align-items:center; gap:.4rem; margin-top:.5rem; }
.photo-scale button { min-width:44px; min-height:44px; border:1px solid #8aafb7; border-radius:.45rem; background:white; color:inherit; }
.photo-scale button[aria-pressed="true"] { outline:2px solid currentColor; outline-offset:-3px; font-weight:bold; }
.photo-actions { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem 1rem; margin-top:.4rem; }
.photo-actions button { min-height:44px; }
</style>
