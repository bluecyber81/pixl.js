<template>
  <section class="display-photo" :class="{'photo-compact': compact}" :aria-busy="loading">
    <h3>{{ displayBoard ? displayBoard + ' · ' : '' }}{{ text.title }}</h3>
    <p v-if="!compact || !supported" class="photo-hint">{{ connected && !supported ? (remote ? text.remoteUnavailable : text.unavailable) : (remote ? text.remoteHint : text.hint) }}</p>
    <button v-if="!remote || supported" class="photo-capture" type="button" :disabled="!connected || !supported || blocked || loading" @click="capture">
      {{ loading ? text.loading : (remote ? text.refresh : text.capture) }}
    </button>
    <p v-if="status" class="photo-status" role="status">{{ text[status] }}</p>
    <figure v-if="photo">
      <div class="photo-surface">
        <img :src="photo" :width="128 * zoom" :height="64 * zoom" :alt="text.preview" />
      </div>
      <figcaption>
        {{ status ? text.lastCaptured : text.captured }} <time :datetime="capturedAt">{{ captureLabel }}</time><template v-if="capturedFirmware"> · {{ capturedFirmware }}</template>
      </figcaption>
    </figure>
    <component v-if="photo" :is="compact ? 'details' : 'div'" class="photo-options">
      <summary v-if="compact">{{ text.options }}</summary>
      <div class="photo-scale" role="group" :aria-label="text.scale">
        <span>{{ text.scale }}</span>
        <button v-for="factor in [1, 2, 3]" :key="factor" type="button" :disabled="factor > maxZoom"
          :aria-pressed="zoom === factor" @click="preferredZoom = factor">{{ factor }}×</button>
      </div>
      <div class="photo-actions">
        <button type="button" :disabled="loading" :aria-pressed="rotated" @click="rotate">{{ text.rotate }}</button>
        <a :href="photo" :download="downloadName">{{ text.save }}</a>
      </div>
    </component>
  </section>
</template>

<script>
import { renderDisplayPhoto, supportsDisplayPhoto } from '../lib/display-photo.js';
import { firmwareBoard } from '../lib/hardware-profile.js';
const words = {
  de: {
    title: 'Displayfoto', options: 'Bildoptionen', hint: 'Lies die aktuelle Anzeige der Bluetooth-Dateiübertragung direkt vom Gerät.',
    remoteHint: 'Mit „Displaybild aktualisieren“ kannst du ein Bild manuell anfordern. Spiele können direkt auf das Display zeichnen. Währenddessen ist die Aufnahme eventuell nicht verfügbar.',
    remoteUnavailable: 'Das Gerät meldet für diese Fernbedienungssitzung keine Displayfoto-Funktion.',
    refresh: 'Displaybild aktualisieren', captured: 'Aufnahme vom', lastCaptured: 'Letzte erfolgreiche Aufnahme vom', scale: 'Bildgröße',
    remoteBusy: 'Das Gerät kann gerade kein Displayfoto liefern. Falls ein Tiny-Spiel läuft, kehre am Gerät ins Menü zurück und fordere die Aufnahme erneut an.',
    temporarilyUnavailable: 'Bild gerade nicht verfügbar. Beende gegebenenfalls das Spiel oder eine laufende Dateiübertragung und versuche es erneut.',
    unavailable: 'Für diese Firmware ist im Dateimanager keine Displayfoto-Funktion hinterlegt.', unsupported: 'Das Gerät unterstützt diese Displayfoto-Abfrage nicht.', capture: 'Displayfoto aufnehmen',
    loading: 'Bild wird gelesen …', save: 'PNG speichern', rotate: 'Um 180° drehen', preview: 'Aufnahme der Geräteanzeige',
    changed: 'Die Anzeige hat sich beim Lesen geändert. Sobald sie ruhig ist, kannst du erneut aufnehmen.',
    failed: 'Das Bild konnte nicht gelesen werden. Prüfe die Verbindung und versuche es erneut.',
    renderFailed: 'Der Browser konnte das PNG nicht erstellen. Versuche es erneut.'
  },
  en: {
    title: 'Screenshot', options: 'Image options', hint: 'Read the current Bluetooth file transfer screen directly from the device.',
    remoteHint: 'Use “Refresh screen” to request a picture manually. Games can draw directly to the display. A screenshot may be unavailable while they do.',
    remoteUnavailable: 'The device did not advertise screenshots for this remote session.',
    refresh: 'Refresh screen', captured: 'Captured on', lastCaptured: 'Last successful capture on', scale: 'Image scale',
    remoteBusy: 'The device is busy and could not provide a screenshot. If a Tiny game is running, return to the menu on the device and request a new picture.',
    temporarilyUnavailable: 'The screen is temporarily unavailable. Close the game or finish any active file transfer and try again.',
    unavailable: 'The file manager has no known screenshot support for this firmware.', unsupported: 'The device does not support this screenshot request.', capture: 'Capture screen',
    loading: 'Reading screen …', save: 'Save PNG', rotate: 'Rotate 180°', preview: 'Captured device screen',
    changed: 'The screen changed during capture. Try again once it settles.',
    failed: 'Could not read the screen. Check the connection and try again.',
    renderFailed: 'The browser could not create the PNG. Please try again.'
  }
};
export default {
  props: { compact: Boolean, connected: Boolean, blocked: Boolean, generation: Number, firmwareVersion: String, locale: String, readPhoto: Function, remote: Boolean, remoteSupported: Boolean },
  emits: ['busy'],
  data() { return { pixels: null, photo: '', rotated: false, capturedAt: '', capturedFirmware: '', status: '', loading: false, serial: 0, preferredZoom: 3, maxZoom: 1 }; },
  computed: {
    text() { return this.locale?.startsWith('de') ? words.de : words.en; },
    displayBoard() { return this.remote ? null : firmwareBoard(this.firmwareVersion); },
    downloadName() { return 'Allmiibo-' + (this.displayBoard || 'Display') + '.png'; },
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
      this.status = '';
      this.loading = true;
      this.$emit('busy', true);
      try {
        const pixels = await this.readPhoto(this.firmwareVersion);
        if (serial !== this.serial || !this.connected) return;
        if (pixels === null) this.status = 'unsupported';
        else if (this.draw(pixels, this.rotated)) {
          this.capturedAt = new Date().toISOString();
          this.capturedFirmware = this.firmwareVersion;
          this.pixels = pixels;
        }
      } catch (error) {
        if (serial === this.serial) {
          if (error?.code === 'LCD_CHANGED') this.status = 'changed';
          else if (error?.code === 'DISPLAY_UNAVAILABLE') this.status = 'temporarilyUnavailable';
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
.photo-compact{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:.25rem .5rem;margin:.4rem 0;min-width:0;}
.photo-compact h3{grid-column:1/-1;margin:0;}
.photo-compact .photo-capture{grid-column:1;grid-row:2;min-height:44px;}
.photo-compact .photo-options{grid-column:2;grid-row:2;min-width:0;}
.photo-compact .photo-options[open]{grid-column:1/-1;grid-row:3;}
.photo-options summary{min-height:44px;align-content:center;cursor:pointer;}
.photo-options summary:focus-visible{outline:3px solid #388294;outline-offset:2px;}
.photo-compact figure{grid-column:1/-1;grid-row:4;min-width:0;margin:0;}
.photo-compact .photo-surface img{margin-inline:auto;}
.photo-compact figcaption{font-size:.8rem;margin-top:.15rem;}
.photo-compact .photo-status,.photo-compact .photo-hint{grid-column:1/-1;margin:.2rem 0;}
</style>
