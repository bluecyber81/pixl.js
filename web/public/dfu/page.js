/* Allmiibo DFU page binding. MIT license; see LICENSE.txt. */
'use strict';
const fileInput = document.getElementById('file'), selectButton = document.getElementById('button');
const statusText = document.getElementById('status'), transferText = document.getElementById('transfer');
const progressBar = document.getElementById('progress'), capabilityText = document.getElementById('capability');
const supported = globalThis.isSecureContext && !!navigator.bluetooth?.requestDevice;
if (!supported) capabilityText.textContent = 'Web Bluetooth ist hier nicht verfügbar. Für die spätere Geräteprüfung ist ein unterstützter Chrome-/Edge-Browser in einem sicheren Kontext nötig.';
const updater = new AllmiiboDfuUpdater({
    Package: SecureDfuPackage,
    createDfu: () => new SecureDfu(CRC32.buf),
    onStatus: text => { statusText.textContent = text; },
    onState: state => { fileInput.disabled = state.busy; selectButton.disabled = !supported || !state.ready; },
    onProgress: state => {
        const valid = state && Number.isFinite(state.totalBytes) && state.totalBytes > 0 && Number.isFinite(state.currentBytes);
        progressBar.hidden = !valid;
        transferText.textContent = valid ? `${state.object === 'init' ? 'Paketprüfung' : 'Anwendung'}: ${state.currentBytes} / ${state.totalBytes} Bytes bestätigt` : '';
        if (valid) progressBar.value = Math.min(100, Math.max(0, 100 * state.currentBytes / state.totalBytes));
    }
});
fileInput.addEventListener('change', () => updater.setPackage(fileInput.files?.[0]));
selectButton.addEventListener('click', () => updater.selectDevice());
window.addEventListener('beforeunload', event => { if (updater.busy) { event.preventDefault(); event.returnValue = ''; } });
