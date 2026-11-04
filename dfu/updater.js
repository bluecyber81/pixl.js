/* Allmiibo DFU UI coordinator. MIT license; see LICENSE.txt. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AllmiiboDfuUpdater = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return class Updater {
        constructor({ Package, createDfu, onStatus = () => {}, onProgress = () => {}, onState = () => {} }) {
            Object.assign(this, { Package, createDfu, onStatus, onProgress, onState });
            this.package = null; this.busy = false; this.loading = false; this.sequence = 0; this.lastResult = null;
        }
        state() { this.onState({ busy: this.busy, loading: this.loading, ready: !!this.package && !this.loading && !this.busy, target: this.package?.image?.target }); }
        async setPackage(file) {
            if (this.busy) return false;
            const sequence = ++this.sequence;
            this.package = null; this.lastResult = null; this.loading = true; this.onProgress(null); this.state();
            if (!file) { this.loading = false; this.onStatus('Noch kein Paket ausgewählt.'); this.state(); return false; }
            this.onStatus('Firmware-Paket wird geprüft …');
            try {
                const candidate = new this.Package(file); await candidate.load();
                if (sequence !== this.sequence) return false;
                this.package = candidate; this.onStatus('Paket geprüft: ' + (file.name || 'Anwendungs-OTA'));
                return true;
            } catch (error) {
                if (sequence === this.sequence) this.onStatus('Paket abgewiesen: ' + error.message);
                return false;
            } finally { if (sequence === this.sequence) { this.loading = false; this.state(); } }
        }
        async selectDevice() {
            if (this.busy || this.loading || !this.package) return false;
            const selected = this.package; this.busy = true; this.lastResult = null; this.state(); this.onProgress(null);
            let dfu; const progress = event => this.onProgress(event);
            const log = event => { if (typeof event?.message === 'string') this.onStatus(event.message); };
            try {
                dfu = this.createDfu(); dfu.addEventListener('progress', progress); dfu.addEventListener('log', log);
                this.onStatus('DFU-Gerät auswählen …');
                // Keep this call before the first await: Web Bluetooth needs
                // the user's click, not an asynchronous follow-up invocation.
                const device = await dfu.requestDevice(false);
                if (!device) throw new Error('Kein DFU-Gerät ausgewählt.');
                const image = await selected.getAppImage();
                if (!image?.initData?.byteLength || !image?.imageData?.byteLength) throw new Error('Keine vollständige Anwendung im Paket.');
                this.onStatus('Anwendung wird übertragen …');
                await dfu.update(device, image.initData, image.imageData);
                const result = dfu.lastResult;
                if (!result?.transferVerified || !result.executeAcknowledged) throw new Error('Der Abschluss wurde vom Bootloader nicht bestätigt.');
                this.lastResult = { ...result };
                this.onStatus(result.rebootObserved
                    ? 'Übertragung bestätigt; Bluetooth wurde getrennt. Bitte Menü und Firmwareversion am Gerät prüfen.'
                    : 'Übertragung bestätigt; Neustart noch nicht beobachtet. Bitte Menü und Firmwareversion am Gerät prüfen.');
                return true;
            } catch (error) {
                this.onStatus('Vorgang nicht bestätigt: ' + error.message); return false;
            } finally {
                if (dfu?.removeEventListener) { dfu.removeEventListener('progress', progress); dfu.removeEventListener('log', log); }
                // Keep the last acknowledged byte position visible on errors.
                // A new package or attempt resets it before starting.
                this.busy = false; this.state();
            }
        }
    };
}));
