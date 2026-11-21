/* Allmiibo DFU page binding. MIT license; see LICENSE.txt. */
import { createScreenAwake } from './screen-awake.mjs';
import { nrfDfuLink } from './nrf-dfu-link.mjs?v=3.59.0-test.1';
import { bluetoothAccessIssue } from './bluetooth-access.mjs';
import { lcdPreviews, lcdPreviewPackage, lcdPreviewPackages } from './lcd-private-reference.mjs?v=3.59.0-test.1';

const fileInput = document.getElementById('file'), selectButton = document.getElementById('button');
const statusText = document.getElementById('status'), transferText = document.getElementById('transfer');
const progressBar = document.getElementById('progress'), capabilityText = document.getElementById('capability');
const bundledSelect = document.getElementById('bundled'), loadBundled = document.getElementById('load-bundled');
const cancelBundled = document.getElementById('cancel-bundled'), bundledInfo = document.getElementById('bundled-info');
const loadPreview = document.getElementById('load-lcd-preview');
const androidHandoff = document.getElementById('android-handoff'), androidLink = document.getElementById('android-dfu-link');
const defaultBundledInfo = bundledInfo.textContent;
const boardSelect = document.getElementById('board-profile');
// A file-manager handoff is a comparison hint. Nordic DFU does not identify the display.
const boardHints = new URLSearchParams(globalThis.location.hash?.slice(1)).getAll('board');
const handoffBoard = boardHints.length === 1 && ['LCD', 'OLED'].includes(boardHints[0]) ? boardHints[0] : null;
boardSelect.value = handoffBoard || 'LCD';
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
const appleGuide = document.getElementById('apple-guide');
const capabilityMessages = {
    insecure: ['Öffne die Seite über HTTPS oder localhost für den Bluetooth-Zugriff.', 'Open this page over HTTPS or localhost for Bluetooth access.'],
    appleBluetooth: ['Hier kannst du die Firmware-ZIP prüfen. Für die Bluetooth-Übertragung auf dem iPhone oder iPad brauchst du einen Browser mit Web Bluetooth. Die Anleitung beschreibt die getesteten Updatewege.', 'You can check the firmware ZIP here. Bluetooth transfers on an iPhone or iPad require a browser with Web Bluetooth. The guide lists tested update options.'],
    browserUnavailable: ['Hier kannst du die Firmware-ZIP prüfen. Zum Übertragen öffne diese Seite in Chrome auf Android oder in Chrome oder Edge auf einem Computer mit Bluetooth.', 'You can check the firmware ZIP here. To transfer it, open this page in Chrome on Android, or Chrome or Edge on a computer with Bluetooth.'],
};
let supported;
function refreshCapability() {
    const issue = bluetoothAccessIssue(globalThis);
    supported = !issue;
    appleGuide.hidden = issue !== 'appleBluetooth';
    setText(capabilityText, ...(capabilityMessages[issue] || ['']));
}
refreshCapability();
let bundled = null, latestState = { busy:false, loading:false, ready:false };
const hexId = value => '0x' + value.toString(16).toUpperCase().padStart(4, '0');
function recentBootReference() {
    const ref = new URLSearchParams(globalThis.location.hash?.slice(1) || '');
    const names = ['read', 'app', 'bl', 'sd'];
    const values = names.map(key => Number(ref.get(key)));
    const [when, app, bl, sd] = values;
    if (names.every(k => /^\d{1,16}$/.test(ref.get(k) || '')) && values.every(Number.isSafeInteger) &&
        app <= 0xffffffff && bl <= 0xffffffff && sd <= 0xffff && when <= Date.now() && Date.now() - when < 600000) return {app, bl, sd};
    return null;
}
function targetDescription(target) {
    if (!target) return '';
    const lines = [choose(`Gewählte Anwendung · Zähler ${target.counter} · Hardwarefeld ${target.hardware} · erlaubte SoftDevice-FWIDs ${target.softDevices.map(hexId).join(', ')}.`,
        `Selected application · counter ${target.counter} · hardware field ${target.hardware} · accepted SoftDevice FWIDs ${target.softDevices.map(hexId).join(', ')}.`)];
    if (latestState.previewVersion) lines.unshift(choose('Privates LCD-Prüfpaket', 'Private LCD test package') + ' · ' + latestState.previewVersion);
    const ref = recentBootReference();
    if (ref) {
        const {app, bl, sd} = ref;
        lines.push(choose(`Zuletzt im Dateimanager gelesen · App-Zähler ${app} · Bootloader-Zähler ${bl} · SoftDevice ${hexId(sd)}.`,
            `Last read in the file manager · application counter ${app} · bootloader counter ${bl} · SoftDevice ${hexId(sd)}.`));
        if (app > target.counter) lines.push(boardSelect.value === 'OLED'
            ? choose('Die ausgewählte OLED-Anwendung ist älter als der ausgelesene Stand. Wähle ein aktuelleres OLED-Paket.', 'The selected OLED application is older than the version read from the device. Choose a newer OLED package.')
            : choose('Die ausgewählte Anwendung ist älter als der ausgelesene Stand. Z15, Z17 und Z19 können sie bei gültiger Signatur installieren. Prüfe vor dem Übertragen, ob du zu dieser Version zurückkehren möchtest.', 'The selected application is older than the version read from the device. Z15, Z17 and Z19 can install it if the signature is valid. Check that you intend to return to this version before transferring.'));
        if (!target.softDevices.includes(sd)) lines.push(choose('Die ausgelesene FWID steht nicht in der Anforderungsliste.', 'The reported FWID is absent from the list of accepted IDs.'));
        lines.push(choose('Prüfe, dass du dasselbe Gerät auswählst.', 'Make sure you select the same device.'));
    } else lines.push(choose('Für den Vergleich im Dateimanager die Bootdaten lesen und von dort die DFU-Seite öffnen.', 'To compare versions, read the boot details in the file manager and open the DFU page from there.'));
    lines.push(choose('Die Displayvariante ist aus dem Hardwarefeld nicht bestimmbar.', 'Check the display variant on the device. The hardware field cannot identify it.'));
    return lines.join(' ');
}
function selectedProfileMismatch(entry) {
    const ref = recentBootReference();
    if (!entry || !ref) return false;
    if (entry.board === 'OLED') return ref.sd !== 0x0103;
    const name = ref.bl === 11 ? 'BL8' : 'Z' + ref.bl;
    return !entry.bootloader.split('/').includes(name) || ref.sd !== 0x0126;
}
function controls() {
    const previewDownload = document.getElementById('lcd-preview-download');
    if (previewDownload) previewDownload.hidden = boardSelect.value !== 'LCD';
    const loading = bundled?.loading === true;
    const boardConflict = boardHints.length > 1 || handoffBoard && handoffBoard !== boardSelect.value;
    const ref = recentBootReference();
    const target = latestState.target;
    const targetConflict = target && ref && (!target.softDevices.includes(ref.sd) ||
        boardSelect.value === 'OLED' && ref.app > target.counter);
    boardSelect.disabled = latestState.busy || latestState.loading || loading;
    fileInput.disabled = boardConflict || latestState.busy || latestState.loading || loading;
    selectButton.disabled = Boolean(boardConflict || targetConflict || !supported || !latestState.ready || loading);
    bundledSelect.disabled = latestState.busy || latestState.loading || loading ||
        !bundled?.catalog.packages.some(entry => entry.board === boardSelect.value);
    const selected = bundled?.catalog.packages.find(entry => entry.id === bundledSelect.value);
    const mismatch = selectedProfileMismatch(selected);
    const downgrade = selected && recentBootReference()?.app > selected.counter;
    const packageBlocked = entry => Boolean(boardConflict || bundledSelect.disabled || !entry ||
        entry.board !== boardSelect.value || selectedProfileMismatch(entry) || ref && ref.app > entry.counter);
    loadBundled.disabled = packageBlocked(selected);
    loadPreview.disabled = packageBlocked(bundled?.catalog.packages.find(entry => entry.id === lcdPreviewPackage.id));
    if (downgrade) setText(bundledInfo, 'Die gelesene Anwendung hat einen höheren Zähler. Wähle eine gleich neue oder neuere Version.', 'The installed application has a higher counter. Choose the same or a newer version.');
    if (mismatch) setText(bundledInfo, `Dieses Paket setzt ${selected.bootloader} und ${selected.softDevice} voraus. Die zuletzt gelesenen Bootdaten weichen davon ab.`, `This package requires ${selected.bootloader} and ${selected.softDevice}. The most recent boot readings differ from this profile.`);
    if (boardConflict) setText(bundledInfo, 'Die Displayauswahl widerspricht dem Gerätelink. Öffne die DFU-Seite vom passenden Gerät erneut.',
        'The selected display conflicts with the device link. Open DFU again from the matching device.');
    const androidUrl = selected && !loadBundled.disabled && nrfDfuLink(selected);
    if (androidUrl) androidLink.setAttribute('href', androidUrl);
    else androidLink.removeAttribute('href');
    androidHandoff.hidden = !androidUrl;
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
    document.getElementById('oled-guide').setAttribute('href', english ? '../guide/en.html#oled' : '../guide/index.html#oled');
    appleGuide.setAttribute('href', english ? '../guide/en.html#iphone' : '../guide/index.html#iphone');
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
    validatePackage: candidate => AllmiiboBundledPackages.validatePackage(candidate, boardSelect.value, bundled?.catalog || {packages:[]}, lcdPreviews),
    createDfu: () => new SecureDfu(CRC32.buf, undefined, 0, { extendCrc32: CRC32.buf }),
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
function profileInfo() {
    const oled = boardSelect.value === 'OLED';
    document.getElementById('lcd-downloads').hidden = oled;
    document.getElementById('oled-downloads').hidden = !oled;
    const sourceLink = document.getElementById('profile-source');
    sourceLink.setAttribute('href', 'https://github.com/bluecyber81/pixl.js/tree/' + (oled ? 'de3.87-oled-t6' : 'de3.89'));
    setText(sourceLink, oled ? 'Quellcode OLED DE3.87 Test 6' : 'Quellcode LCD DE3.89',
        oled ? 'OLED DE3.87 Test 6 source code' : 'LCD DE3.89 source code');
    setText(document.getElementById('profile-title'),
        oled ? 'OLED-Firmware übertragen' : 'LCD-Firmware übertragen',
        oled ? 'Update OLED firmware' : 'Update LCD firmware');
    setText(document.getElementById('profile-description'),
        oled ? 'OLED SH1106 · S112 7.2.0 · vorhandenes SPIFFS oder natives LittleFS. Test 6 benötigt noch einen Praxistest auf einem OLED.'
            : 'LCD · PFS1 · S112 7.3.0. Wähle eine App für deinen Bootloader.',
        oled ? 'OLED SH1106 · S112 7.2.0 · existing SPIFFS or native LittleFS. Test 6 still requires a physical OLED trial.'
            : 'LCD · PFS1 · S112 7.3.0. Choose an application for your bootloader.');
    setText(bundledInfo,
        oled ? 'Veröffentlichte OLED-App für SH1106 und S112 7.2.0 wählen.' : defaultBundledInfo,
        oled ? 'Choose the published OLED application for SH1106 and S112 7.2.0.' : defaultBundledInfoEnglish);
}
function populateCatalog(id) {
    profileInfo();
    bundledSelect.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    setText(placeholder, 'Mitgeliefertes Paket wählen', 'Select a bundled package');
    bundledSelect.appendChild(placeholder);
    bundledSelect.value = '';
    const entries = bundled?.catalog.packages.filter(entry => entry.board === boardSelect.value) || [];
    const current = entries.find(entry => entry.channel !== 'prerelease');
    for (const entry of entries) {
        const option = document.createElement('option');
        option.value = entry.id;
        const size = (entry.bytes / 1024).toFixed(1) + ' KiB';
        const preview = entry.channel === 'prerelease';
        setText(option, `${entry.version} · ${preview ? 'Testversion' : entry === current ? 'Stabile Ausgabe' : 'Frühere stabile Ausgabe'} · ${entry.bootloader} · ${size}`,
            `${entry.version} · ${preview ? 'test release' : entry === current ? 'stable release' : 'earlier stable release'} · ${entry.bootloader} · ${size}`);
        bundledSelect.appendChild(option);
    }
    const selected = entries.find(entry => entry.id === id);
    if (selected) {
        bundledSelect.value = selected.id;
        setText(bundledInfo, `${selected.version} ist vorausgewählt. Tippe auf „Paket laden und prüfen“.`,
            `${selected.version} is preselected. Choose “Load and check package”.`);
    } else if (id !== undefined) {
        setText(bundledInfo, 'Der Link gehört zu keinem eindeutigen Paket für dieses Display. Bitte ein Paket auswählen.',
            'This link does not identify a single package for this display. Please choose one.');
    } else if (!entries.length) {
        setText(bundledInfo, 'Kein mitgeliefertes Paket in diesem Dateimanager. Eine eigene passende Anwendungs-ZIP kann unten ausgewählt werden.',
            'There are no bundled packages in this file manager. Select your application ZIP below.');
    }
}
try {
    const runtimeCatalog = {...AllmiiboFirmwareReleases,
        packages:[...AllmiiboFirmwareReleases.packages, ...lcdPreviewPackages]};
    bundled = new AllmiiboBundledPackages.Loader({catalog:runtimeCatalog,updater,
        pageUrl:globalThis.location.href,onStatus:(de, en) => setText(statusText, de, en),onState:controls});
    const requested = new URLSearchParams(globalThis.location.search).getAll('package');
    // Historical Test 1 links point to the same signed App662 archive.
    if (requested.length === 1 && requested[0] === 'de3.89-lcd-test1-app') requested[0] = 'de3.89-lcd-app';
    const selected = requested.length === 1 && bundled.catalog.packages.find(entry => entry.id === requested[0]);
    if (!handoffBoard && selected) boardSelect.value = selected.board;
    populateCatalog(requested.length ? requested.length === 1 ? requested[0] : '' : undefined);
} catch(error) {
    profileInfo();
    setText(bundledInfo, 'Mitgelieferte Pakete nicht verfügbar: '+error.message, 'Bundled packages unavailable: '+(error.english ?? error.message));
}
boardSelect.addEventListener('change', () => {
    if (latestState.busy) return;
    fileInput.value = '';
    bundled?.invalidate();
    populateCatalog();
    controls();
});
controls();
window.addEventListener('focus', () => { refreshCapability(); controls(); });
bundledSelect.addEventListener('change', () => {
    if (latestState.busy) return;
    fileInput.value = '';
    profileInfo();
    bundled?.invalidate();
    controls();
});
function loadSelectedPackage() {
    controls();
    if (!loadBundled.disabled) { fileInput.value=''; return bundled?.load(bundledSelect.value); }
}
loadBundled.addEventListener('click', loadSelectedPackage);
loadPreview.addEventListener('click', () => {
    controls();
    if (loadPreview.disabled) return;
    bundledSelect.value = lcdPreviewPackage.id;
    profileInfo();
    return loadSelectedPackage();
});
cancelBundled.addEventListener('click', () => bundled?.cancel());
fileInput.addEventListener('change', () => {
    if (latestState.busy) return;
    if (bundled?.catalog.packages.length) {
        bundledSelect.value = '';
        profileInfo();
    }
    return bundled ? bundled.manual(fileInput.files?.[0]) : updater.setPackage(fileInput.files?.[0]);
});
selectButton.addEventListener('click', () => { controls(); if (!selectButton.disabled && !bundled?.loading) return updater.selectDevice(); });
window.addEventListener('beforeunload', event => { if (updater.busy) { event.preventDefault(); event.returnValue = ''; } });
