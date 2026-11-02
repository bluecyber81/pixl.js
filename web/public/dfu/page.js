/* Allmiibo DFU page binding. MIT license; see LICENSE.txt. */
'use strict';
const fileInput = document.getElementById('file'), selectButton = document.getElementById('button');
const statusText = document.getElementById('status'), transferText = document.getElementById('transfer');
const progressBar = document.getElementById('progress'), capabilityText = document.getElementById('capability');
const bundledSelect = document.getElementById('bundled'), loadBundled = document.getElementById('load-bundled');
const cancelBundled = document.getElementById('cancel-bundled'), bundledInfo = document.getElementById('bundled-info');
const supported = globalThis.isSecureContext && !!navigator.bluetooth?.requestDevice;
if (!supported) capabilityText.textContent = 'Web Bluetooth ist hier nicht verfügbar. Für die spätere Geräteprüfung ist ein unterstützter Chrome-/Edge-Browser in einem sicheren Kontext nötig.';
let bundled = null, latestState = { busy:false, loading:false, ready:false };
function controls() {
    const loading = bundled?.loading === true;
    fileInput.disabled = latestState.busy || latestState.loading || loading;
    selectButton.disabled = !supported || !latestState.ready || loading;
    bundledSelect.disabled = latestState.busy || latestState.loading || loading || !bundled?.catalog.packages.length;
    loadBundled.disabled = bundledSelect.disabled || !bundledSelect.value;
    cancelBundled.hidden = !loading; cancelBundled.disabled = latestState.busy;
}
const updater = new AllmiiboDfuUpdater({
    Package: SecureDfuPackage,
    createDfu: () => new SecureDfu(CRC32.buf),
    onStatus: text => { statusText.textContent = text; },
    onState: state => { latestState = state; controls(); },
    onProgress: state => {
        const valid = state && Number.isFinite(state.totalBytes) && state.totalBytes > 0 && Number.isFinite(state.currentBytes);
        progressBar.hidden = !valid;
        transferText.textContent = valid ? `${state.object === 'init' ? 'Paketprüfung' : 'Anwendung'}: ${state.currentBytes} / ${state.totalBytes} Bytes bestätigt` : '';
        if (valid) progressBar.value = Math.min(100, Math.max(0, 100 * state.currentBytes / state.totalBytes));
    }
});
try {
    bundled = new AllmiiboBundledPackages.Loader({catalog:AllmiiboFirmwareReleases,updater,
        pageUrl:globalThis.location.href,onStatus:text=>{statusText.textContent=text;},onState:controls});
    if (bundled.catalog.packages.length) {
        bundledSelect.textContent = '';
        const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Mitgeliefertes Paket wählen';bundledSelect.appendChild(placeholder);
        for(const entry of bundled.catalog.packages){
            const option=document.createElement('option');option.value=entry.id;option.textContent=`${entry.version} · ${(entry.bytes/1024).toFixed(1)} KiB`;bundledSelect.appendChild(option);
        }
    } else bundledInfo.textContent='Kein mitgeliefertes Paket in diesem Dateimanager. Eine eigene passende Anwendungs-ZIP kann unten ausgewählt werden.';
} catch(error) {
    bundledInfo.textContent='Mitgelieferte Pakete nicht verfügbar: '+error.message;
}
controls();
bundledSelect.addEventListener('change', controls);
loadBundled.addEventListener('click', () => { if (!latestState.busy) { fileInput.value=''; return bundled?.load(bundledSelect.value); } });
cancelBundled.addEventListener('click', () => bundled?.cancel());
fileInput.addEventListener('change', () => bundled ? bundled.manual(fileInput.files?.[0]) : updater.setPackage(fileInput.files?.[0]));
selectButton.addEventListener('click', () => { if (!bundled?.loading) updater.selectDevice(); });
window.addEventListener('beforeunload', event => { if (updater.busy) { event.preventDefault(); event.returnValue = ''; } });
