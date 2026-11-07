/* Allmiibo DFU page binding. MIT license; see LICENSE.txt. */
import { createScreenAwake } from './screen-awake.mjs';
const fileInput = document.getElementById('file'), selectButton = document.getElementById('button');
const statusText = document.getElementById('status'), transferText = document.getElementById('transfer');
const progressBar = document.getElementById('progress'), capabilityText = document.getElementById('capability');
const bundledSelect = document.getElementById('bundled'), loadBundled = document.getElementById('load-bundled');
const cancelBundled = document.getElementById('cancel-bundled'), bundledInfo = document.getElementById('bundled-info');
const supported = globalThis.isSecureContext && !!navigator.bluetooth?.requestDevice;
if (!supported) capabilityText.textContent = 'Web Bluetooth ist hier nicht verfügbar. Für die spätere Geräteprüfung ist ein unterstützter Chrome-/Edge-Browser in einem sicheren Kontext nötig.';
let bundled = null, latestState = { busy:false, loading:false, ready:false };
const hexId = value => '0x' + value.toString(16).toUpperCase().padStart(4, '0');
function targetDescription(target) {
    if (!target) return '';
    const lines = [`Gewählte Anwendung · Zähler ${target.counter} · Hardwarefeld ${target.hardware} · erlaubte SoftDevice-FWIDs ${target.softDevices.map(hexId).join(', ')}.`];
    const ref = new URLSearchParams(globalThis.location.hash?.slice(1) || '');
    const names = ['read', 'app', 'bl', 'sd'];
    const values = names.map(key => Number(ref.get(key)));
    const [when, app, bl, sd] = values;
    if (names.every(k => /^\d{1,16}$/.test(ref.get(k) || '')) && values.every(Number.isSafeInteger) &&
        app <= 0xffffffff && bl <= 0xffffffff && sd <= 0xffff && when <= Date.now() && Date.now() - when < 600000) {
        lines.push(`Zuletzt im Dateimanager gelesen · App-Zähler ${app} · Bootloader-Zähler ${bl} · SoftDevice ${hexId(sd)}.`);
        if (app > target.counter) lines.push('Die ausgewählte Anwendung ist älter als der ausgelesene Stand. Z15 kann sie bei gültiger Signatur installieren. Prüfe vor dem Übertragen, ob du zu dieser Version zurückkehren möchtest.');
        if (!target.softDevices.includes(sd)) lines.push('Die ausgelesene FWID steht nicht in der Anforderungsliste.');
        lines.push('Prüfe, dass du dasselbe Gerät auswählst.');
    } else lines.push('Für den Vergleich im Dateimanager die Bootdaten lesen und von dort die DFU-Seite öffnen.');
    lines.push('Die Displayvariante ist aus dem Hardwarefeld nicht bestimmbar.');
    return lines.join(' ');
}
function controls() {
    const loading = bundled?.loading === true;
    fileInput.disabled = latestState.busy || latestState.loading || loading;
    selectButton.disabled = !supported || !latestState.ready || loading;
    bundledSelect.disabled = latestState.busy || latestState.loading || loading || !bundled?.catalog.packages.length;
    loadBundled.disabled = bundledSelect.disabled || !bundledSelect.value;
    cancelBundled.hidden = !loading; cancelBundled.disabled = latestState.busy;
}
const phaseNames = ['transfer', 'verify', 'finalize', 'reconnect'];
const phases = document.getElementById('phases');
const phaseDetail = document.getElementById('phase-detail');
const reconnectLink = document.getElementById('reconnect-link');
const awakePanel = document.getElementById('awake-panel');
const awakeChoice = document.getElementById('awake-choice');
const awakeStatus = document.getElementById('awake-status');
let transferActive = false;
function renderAwake(state) {
    const text = {
        active: 'Der Browser hält das Display wach.',
        requesting: 'Der Browser fordert das Wachhalten an …',
        unsupported: 'Bitte halte das Display selbst eingeschaltet.',
        unavailable: 'Der Browser hat das Wachhalten abgelehnt. Bitte halte das Display selbst eingeschaltet.',
        released: 'Das Display kann sich wieder ausschalten. Bitte halte es während des Updates eingeschaltet.',
        hidden: 'Öffne diesen Tab wieder, um das Display wach zu halten.'
    };
    awakeStatus.textContent = transferActive && awakeChoice.checked ? text[state.status] || '' : '';
}
const newAwakeController = () => createScreenAwake({ document, wakeLock: navigator.wakeLock, onChange: renderAwake });
let awake = newAwakeController();
function updateAwake() {
    awakePanel.hidden = !transferActive;
    awake?.setActive(transferActive && awakeChoice.checked);
}
awakeChoice.addEventListener('change', updateAwake);
window.addEventListener('pagehide', () => { awake?.dispose(); awake = null; });
window.addEventListener('pageshow', () => { if (!awake) { awake = newAwakeController(); updateAwake(); } });
let phaseText = dfuPhaseLanguages.de_DE;
try {
    const saved = globalThis.localStorage?.getItem('allmiibo.language');
    if (Object.hasOwn(dfuPhaseLanguages, saved)) phaseText = dfuPhaseLanguages[saved];
} catch (_) { /* Use the default if browser storage is unavailable. */ }
phases.lang = phaseText.lang;
reconnectLink.textContent = phaseText.open;
const phaseItems = phaseNames.map((name, index) => {
    const item = document.getElementById('phase-' + name);
    item.textContent = phaseText.steps[index];
    return item;
});
function showPhase(name, failed = false) {
    const index = phaseNames.indexOf(name);
    transferActive = !failed && ['transfer', 'verify', 'finalize'].includes(name);
    updateAwake();
    phases.hidden = index < 0;
    phaseItems.forEach((item, i) => {
        item.className = i < index ? 'done' : i === index && failed ? 'failed' : '';
        if (i === index) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
    });
    phaseDetail.textContent = index < 0 ? '' : failed ? phaseText.failed : phaseText.details[index];
    reconnectLink.hidden = name !== 'reconnect' || failed;
}
const updater = new AllmiiboDfuUpdater({
    Package: SecureDfuPackage,
    createDfu: () => new SecureDfu(CRC32.buf),
    onStatus: text => { statusText.textContent = text; },
    onPhase: showPhase,
    onState: state => { latestState = state; document.getElementById('package-target').textContent = targetDescription(state.target); controls(); },
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
