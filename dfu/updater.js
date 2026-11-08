/* Allmiibo DFU UI coordinator. MIT license; see LICENSE.txt. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./validation-error.js'));
    else root.AllmiiboDfuUpdater = factory(root.DfuValidationError);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (DfuValidationError) {
    'use strict';
    return class Updater {
        constructor({ Package, createDfu, onStatus = () => {}, onProgress = () => {}, onState = () => {}, onPhase = () => {} }) {
            Object.assign(this, { Package, createDfu, onStatus, onProgress, onState, onPhase });
            this.package = null; this.busy = false; this.loading = false; this.sequence = 0; this.lastResult = null;
        }
        state() { this.onState({ busy: this.busy, loading: this.loading, ready: !!this.package && !this.loading && !this.busy, target: this.package?.image?.target }); }
        async setPackage(file) {
            if (this.busy) return false;
            const sequence = ++this.sequence;
            this.package = null; this.lastResult = null; this.loading = true; this.onPhase(null); this.onProgress(null); this.state();
            if (!file) { this.loading = false; this.onStatus('Noch kein Paket ausgewählt.', 'No package selected yet.'); this.state(); return false; }
            this.onStatus('Firmware-Paket wird geprüft …', 'Checking firmware package …');
            try {
                const candidate = new this.Package(file); await candidate.load();
                if (sequence !== this.sequence) return false;
                this.package = candidate; this.onStatus('Paket geprüft: ' + (file.name || 'Anwendungs-OTA'), 'Package checked: ' + (file.name || 'application update'));
                return true;
            } catch (error) {
                if (sequence === this.sequence) this.onStatus('Paket abgewiesen: ' + error.message, 'Package rejected: ' + (error.english ?? error.message));
                return false;
            } finally { if (sequence === this.sequence) { this.loading = false; this.state(); } }
        }
        async selectDevice() {
            if (this.busy || this.loading || !this.package) return false;
            const selected = this.package; this.busy = true; this.lastResult = null; this.onPhase(null); this.state(); this.onProgress(null);
            let dfu, currentPhase = null;
            const phase = name => { currentPhase = name; this.onStatus(''); this.onPhase(name); };
            const progress = event => this.onProgress(event);
            const log = event => { if (typeof event?.message === 'string') this.onStatus(event.message, event.english); };
            try {
                dfu = this.createDfu(); dfu.addEventListener('progress', progress); dfu.addEventListener('log', log); dfu.addEventListener('phase', phase);
                this.onStatus('DFU-Gerät auswählen …', 'Select a DFU device …');
                // Keep this call before the first await: Web Bluetooth needs
                // the user's click, not an asynchronous follow-up invocation.
                const device = await dfu.requestDevice(false);
                if (!device) throw new DfuValidationError('Kein DFU-Gerät ausgewählt.', 'No DFU device selected.');
                const image = await selected.getAppImage();
                if (!image?.initData?.byteLength || !image?.imageData?.byteLength) throw new DfuValidationError('Keine vollständige Anwendung im Paket.', 'The package contains no complete application.');
                this.onStatus('Verbindung mit dem Bootloader wird hergestellt …', 'Connecting to the bootloader …');
                await dfu.update(device, image.initData, image.imageData);
                const result = dfu.lastResult;
                if (!result?.transferVerified || !result.executeAcknowledged) throw new DfuValidationError('Der Abschluss wurde vom Bootloader nicht bestätigt.', 'The bootloader did not acknowledge completion.');
                this.lastResult = { ...result };
                this.onPhase('reconnect');
                // Old cached transports used rebootObserved for a disconnected
                // GATT link. Reading that field only as a link event is safe.
                const disconnected = result.disconnectObserved ?? result.rebootObserved;
                let detail = ['Neustart noch nicht beobachtet.', 'Restart has not yet been observed.'];
                if (result.localDisconnectRequested) detail = ['Der Browser hat die Bluetooth-Trennung angefordert.', 'The browser requested a Bluetooth disconnect.'];
                else if (disconnected) detail = ['Bluetooth wurde getrennt.', 'Bluetooth disconnected.'];
                this.onStatus('Übertragung bestätigt. ' + detail[0] + ' Bitte Menü und Firmwareversion am Gerät prüfen.',
                    'Transfer confirmed. ' + detail[1] + ' Check the menu and firmware version on the device.');
                return true;
            } catch (error) {
                this.onPhase(currentPhase, true);
                this.onStatus('Vorgang nicht bestätigt: ' + error.message, 'Operation not confirmed: ' + (error.english ?? error.message)); return false;
            } finally {
                if (dfu?.removeEventListener) { dfu.removeEventListener('progress', progress); dfu.removeEventListener('log', log); dfu.removeEventListener('phase', phase); }
                // Keep the last acknowledged byte position visible on errors.
                // A new package or attempt resets it before starting.
                this.busy = false; this.state();
            }
        }
    };
}));
