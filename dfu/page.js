/* Allmiibo DFU page binding. MIT license; see LICENSE.txt. */
import { createScreenAwake } from './screen-awake.mjs';
const fileInput = document.getElementById('file'), selectButton = document.getElementById('button');
const statusText = document.getElementById('status'), transferText = document.getElementById('transfer');
const progressBar = document.getElementById('progress'), capabilityText = document.getElementById('capability');
const bundledSelect = document.getElementById('bundled'), loadBundled = document.getElementById('load-bundled');
const cancelBundled = document.getElementById('cancel-bundled'), bundledInfo = document.getElementById('bundled-info');
const defaultBundledInfo = bundledInfo.textContent;
const language = globalThis.AllmiiboLanguage;
const pageLocales = ['de_DE', 'en'];
let english = language.getLocale(pageLocales) === 'en';
const messages = new Map();
function setText(element, de, en = de) {
    messages.set(element, [de, en]);
    element.textContent = english ? en : de;
}
for (const element of document.querySelectorAll('[data-en]')) {
    setText(element, element.textContent, element.dataset.en);
}
const defaultBundledInfoEnglish = bundledInfo.dataset.en;
const choose = (de, en) => english ? en : de;
const supported = globalThis.isSecureContext && !!navigator.bluetooth?.requestDevice;
if (!supported) setText(capabilityText, 'Web Bluetooth ist hier nicht verfügbar. Für die spätere Geräteprüfung ist ein unterstützter Chrome-/Edge-Browser in einem sicheren Kontext nötig.', 'Web Bluetooth is unavailable here. To connect, open this page over HTTPS or localhost in a supported Chrome or Edge browser.');
let bundled = null, latestState = { busy:false, loading:false, ready:false };
const hexId = value => '0x' + value.toString(16).toUpperCase().padStart(4, '0');
function targetDescription(target) {
    if (!target) return '';
    const lines = [choose(`Gewählte Anwendung · Zähler ${target.counter} · Hardwarefeld ${target.hardware} · erlaubte SoftDevice-FWIDs ${target.softDevices.map(hexId).join(', ')}.`,
        `Selected application · counter ${target.counter} · hardware field ${target.hardware} · accepted SoftDevice FWIDs ${target.softDevices.map(hexId).join(', ')}.`)];
    const ref = new URLSearchParams(globalThis.location.hash?.slice(1) || '');
    const names = ['read', 'app', 'bl', 'sd'];
    const values = names.map(key => Number(ref.get(key)));
    const [when, app, bl, sd] = values;
    if (names.every(k => /^\d{1,16}$/.test(ref.get(k) || '')) && values.every(Number.isSafeInteger) &&
        app <= 0xffffffff && bl <= 0xffffffff && sd <= 0xffff && when <= Date.now() && Date.now() - when < 600000) {
        lines.push(choose(`Zuletzt im Dateimanager gelesen · App-Zähler ${app} · Bootloader-Zähler ${bl} · SoftDevice ${hexId(sd)}.`,
            `Last read in the file manager · application counter ${app} · bootloader counter ${bl} · SoftDevice ${hexId(sd)}.`));
        if (app > target.counter) lines.push(choose('Die ausgewählte Anwendung ist älter als der ausgelesene Stand. Z15 kann sie bei gültiger Signatur installieren. Prüfe vor dem Übertragen, ob du zu dieser Version zurückkehren möchtest.', 'The selected application is older than the version read from the device. Z15 can install it if the signature is valid. Check that you intend to return to this version before transferring.'));
        if (!target.softDevices.includes(sd)) lines.push(choose('Die ausgelesene FWID steht nicht in der Anforderungsliste.', 'The reported FWID is absent from the list of accepted IDs.'));
        lines.push(choose('Prüfe, dass du dasselbe Gerät auswählst.', 'Make sure you select the same device.'));
    } else lines.push(choose('Für den Vergleich im Dateimanager die Bootdaten lesen und von dort die DFU-Seite öffnen.', 'To compare versions, read the boot details in the file manager and open the DFU page from there.'));
    lines.push(choose('Die Displayvariante ist aus dem Hardwarefeld nicht bestimmbar.', 'Check the display variant on the device. The hardware field cannot identify it.'));
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
    const texts = {
        active: ['Der Browser hält das Display wach.', 'The browser is keeping the screen awake.'],
        requesting: ['Der Browser fordert das Wachhalten an …', 'Requesting a screen wake lock …'],
        unsupported: ['Bitte halte das Display selbst eingeschaltet.', 'Please keep the screen on.'],
        unavailable: ['Der Browser hat das Wachhalten abgelehnt. Bitte halte das Display selbst eingeschaltet.', 'The browser could not keep the screen awake. Please keep it on.'],
        released: ['Das Display kann sich wieder ausschalten. Bitte halte es während des Updates eingeschaltet.', 'The screen can turn off again. Please keep it on during the update.'],
        hidden: ['Öffne diesen Tab wieder, um das Display wach zu halten.', 'Return to this tab to keep the screen on.']
    };
    const text = transferActive && awakeChoice.checked && texts[state.status];
    setText(awakeStatus, ...(text || ['']));
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
let phaseText;
let currentPhaseIndex = -1, currentPhaseFailed = false;
const phaseItems = phaseNames.map(name => document.getElementById('phase-' + name));
function renderPhaseDetail() {
    phaseDetail.textContent = currentPhaseIndex < 0 ? '' : currentPhaseFailed ? phaseText.failed : phaseText.details[currentPhaseIndex];
}
language.subscribe(({ locale }) => {
    english = locale === 'en';
    document.documentElement.lang = english ? 'en' : 'de';
    for (const [element, [de, en]] of messages) element.textContent = english ? en : de;
    document.getElementById('guide-link').setAttribute('href', english ? '../guide/en.html' : '../guide/index.html');
    document.getElementById('package-target').textContent = targetDescription(latestState.target);
}, pageLocales);
language.subscribe(({ locale }) => {
    phaseText = dfuPhaseLanguages[locale];
    phases.lang = phaseText.lang;
    phaseItems.forEach((item, index) => { item.textContent = phaseText.steps[index]; });
    reconnectLink.textContent = phaseText.open;
    renderPhaseDetail();
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
    currentPhaseIndex = index;
    currentPhaseFailed = failed;
    renderPhaseDetail();
    reconnectLink.hidden = name !== 'reconnect' || failed;
}
let rateSample = null;
function transferEstimate(state, now) {
    if (state?.object !== 'firmware' || !(state.currentBytes >= 0 && state.currentBytes <= state.totalBytes)) {
        rateSample = null;
        return '';
    }
    if (!rateSample || rateSample.total !== state.totalBytes || state.currentBytes < rateSample.last) {
        rateSample = { total: state.totalBytes, first: state.currentBytes, last: state.currentBytes, start: now };
        return '';
    }
    rateSample.last = state.currentBytes;
    const elapsed = now - rateSample.start;
    const bytes = state.currentBytes - rateSample.first;
    if (elapsed < 1000 || bytes === 0 || state.currentBytes === state.totalBytes) return '';
    const bytesPerSecond = 1000 * bytes / elapsed;
    const remaining = Math.ceil((state.totalBytes - state.currentBytes) / bytesPerSecond);
    const rate = (bytesPerSecond / 1024).toLocaleString(phaseText.lang, { maximumFractionDigits: 1 });
    return ` · ${rate} KiB/s · ≈ ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} min`;
}
const updater = new AllmiiboDfuUpdater({
    Package: SecureDfuPackage,
    createDfu: () => new SecureDfu(CRC32.buf),
    onStatus: (de, en) => setText(statusText, de, en),
    onPhase: showPhase,
    onState: state => { latestState = state; document.getElementById('package-target').textContent = targetDescription(state.target); controls(); },
    onProgress: state => {
        const valid = state && Number.isFinite(state.totalBytes) && state.totalBytes > 0 && Number.isFinite(state.currentBytes);
        progressBar.hidden = !valid;
        const estimate = transferEstimate(valid ? state : null, globalThis.performance?.now() ?? Date.now());
        if (valid) setText(transferText,
            `${state.object === 'init' ? 'Paketprüfung' : 'Anwendung'}: ${state.currentBytes} / ${state.totalBytes} Bytes bestätigt${estimate}`,
            `${state.object === 'init' ? 'Init packet' : 'Application'}: ${state.currentBytes} / ${state.totalBytes} bytes acknowledged${estimate}`);
        else setText(transferText, '');
        if (valid) progressBar.value = Math.min(100, Math.max(0, 100 * state.currentBytes / state.totalBytes));
    }
});
try {
    bundled = new AllmiiboBundledPackages.Loader({catalog:AllmiiboFirmwareReleases,updater,
        pageUrl:globalThis.location.href,onStatus:(de, en) => setText(statusText, de, en),onState:controls});
    if (bundled.catalog.packages.length) {
        bundledSelect.textContent = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        setText(placeholder, 'Mitgeliefertes Paket wählen', 'Select a bundled package');
        bundledSelect.appendChild(placeholder);
        for (const entry of bundled.catalog.packages) {
            const option = document.createElement('option');
            option.value = entry.id;
            const size = (entry.bytes / 1024).toFixed(1) + ' KiB';
            const preview = entry.channel === 'prerelease';
            setText(option, `${entry.version}${preview ? ' (Testversion)' : ''} · ${size}`,
                `${entry.version}${preview ? ' (test release)' : ''} · ${size}`);
            bundledSelect.appendChild(option);
        }
        const requested = new URLSearchParams(globalThis.location.search).getAll('package');
        if (requested.length) {
            const selected = requested.length === 1 && bundled.catalog.packages.find(entry => entry.id === requested[0]);
            if (selected) {
                bundledSelect.value = selected.id;
                setText(bundledInfo, `${selected.version} ist vorausgewählt. Tippe auf „Paket laden und prüfen“.`,
                    `${selected.version} is preselected. Choose “Load and check package”.`);
            } else {
                setText(bundledInfo, 'Der Link gehört zu keinem eindeutigen mitgelieferten Paket. Bitte ein Paket auswählen.', 'This link does not identify a single bundled package. Please choose one.');
            }
        }
    } else setText(bundledInfo, 'Kein mitgeliefertes Paket in diesem Dateimanager. Eine eigene passende Anwendungs-ZIP kann unten ausgewählt werden.', 'There are no bundled packages in this file manager. Select your application ZIP below.');
} catch(error) {
    setText(bundledInfo, 'Mitgelieferte Pakete nicht verfügbar: '+error.message, 'Bundled packages unavailable: '+(error.english ?? error.message));
}
controls();
bundledSelect.addEventListener('change', () => {
    if (latestState.busy) return;
    fileInput.value = '';
    setText(bundledInfo, defaultBundledInfo, defaultBundledInfoEnglish);
    bundled?.invalidate();
    controls();
});
loadBundled.addEventListener('click', () => { if (!latestState.busy) { fileInput.value=''; return bundled?.load(bundledSelect.value); } });
cancelBundled.addEventListener('click', () => bundled?.cancel());
fileInput.addEventListener('change', () => {
    if (latestState.busy) return;
    if (bundled?.catalog.packages.length) {
        bundledSelect.value = '';
        setText(bundledInfo, defaultBundledInfo, defaultBundledInfoEnglish);
    }
    return bundled ? bundled.manual(fileInput.files?.[0]) : updater.setPackage(fileInput.files?.[0]);
});
selectButton.addEventListener('click', () => { if (!bundled?.loading) updater.selectDevice(); });
window.addEventListener('beforeunload', event => { if (updater.busy) { event.preventDefault(); event.returnValue = ''; } });
