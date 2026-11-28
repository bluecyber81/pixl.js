import { lcdTest688, lcdTest688Package } from '../../public/dfu/lcd-app688-reference.mjs';
import { lcdTest685, lcdTest685Package } from '../../public/dfu/lcd-app685-reference.mjs';
import { lcdTest684, lcdTest684Package } from '../../public/dfu/lcd-app684-reference.mjs';
import { lcdTest683, lcdTest683Package } from '../../public/dfu/lcd-app683-reference.mjs';
import { lcdReleasePackage as package674 } from '../../public/dfu/lcd-app674-reference.mjs';
import { lcdRelease as app675, lcdReleasePackage as package675 } from '../../public/dfu/lcd-app675-reference.mjs';
import { lcdTest680, lcdTest680Package, lcdFinal680, lcdFinal680Package } from '../../public/dfu/lcd-app680-reference.mjs';
import { lcdTest679, lcdTest679Package } from '../../public/dfu/lcd-app679-reference.mjs';
import { lcdReleasePackage } from '../../public/dfu/lcd-release-reference.mjs';
import { normalizeBootDiagnostics } from './boot-diagnostics.js';
import { compareLcdVersions } from './lcd-version.js';
import { UPDATE_TARGET } from './update-target.js';
import { deploymentPath } from './deployment-path.js';
import { firmwareBoard, LCD_Z21_COUNTERS } from './hardware-profile.js';

// Carry only firmware counters and FWID across the transition into DFU.
// The URL fragment isn't sent to the server and contains no device identity.
export function dfuReference(boot, time = Date.now(), firmwareVersion) {
  const board = firmwareBoard(firmwareVersion);
  const reference = new URLSearchParams(board ? { board } : {});
  const fallback = reference.size ? '#' + reference : '';
  if (!boot?.settingsCrcValid || !boot.softDeviceValid) return fallback;
  const values = [boot.applicationCounter, boot.bootloaderCounter, boot.softDeviceFwid];
  if (!values.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff) || values[2] > 0xffff) return fallback;
  Object.entries({ read: time, app: values[0], bl: values[1], sd: values[2] })
    .forEach(([key, value]) => reference.set(key, value));
  return '#' + reference;
}

// Rendering uses only the bundled JSON, never URL parameters or external feeds.
// The independent DFU loader validates the complete catalogue and actual bytes.
export function packagePresentation(entry, session = {}, boot = null) {
  const active=session?.connected===true;
  const installed=active&&typeof session.firmwareVersion==='string'?session.firmwareVersion:null;
  const diagnostic=active?normalizeBootDiagnostics(boot):null;
  const relation=compareLcdVersions(installed, entry.version);
  const transferBuild = [lcdTest679.firmwareVersion,lcdFinal680.firmwareVersion,lcdTest683.firmwareVersion,lcdTest684.firmwareVersion,lcdTest685.firmwareVersion,lcdTest688.firmwareVersion].includes(installed);
  const newer=relation>0 || (entry.board==='LCD' && transferBuild && LCD_Z21_COUNTERS[installed]>entry.counter) ||
    (diagnostic?.settingsCrcValid && diagnostic.applicationCounter>entry.counter);
  const supportedBootloaders = entry.bootloader?.split('/').map(name =>
    name === 'BL8' ? UPDATE_TARGET.bootloader : UPDATE_TARGET['bootloader' + name]);
  const matchesBootloader = profile => profile &&
    (!diagnostic.settingsCrcValid || diagnostic.bootloaderCounter === profile.counter) &&
    (!diagnostic.bootHashValid || diagnostic.bootRegionSha256 === profile.sha256);
  const profileMismatch = firmwareBoard(installed) === 'OLED' || Boolean(diagnostic && supportedBootloaders && (
    diagnostic.addressConflict || (diagnostic.bootAddressValid && diagnostic.bootAddress !== UPDATE_TARGET.bootloader.address) ||
    !supportedBootloaders.some(matchesBootloader) ||
    (diagnostic.softDeviceValid && (diagnostic.softDeviceFwid !== UPDATE_TARGET.softDevice.fwid ||
      diagnostic.softDeviceVersion !== UPDATE_TARGET.softDevice.version || diagnostic.softDeviceVariant !== UPDATE_TARGET.softDevice.variant))
  ));
  const specialTags = { [lcdTest688Package.id]:lcdTest688.releaseTag, [lcdTest685Package.id]:lcdTest685.releaseTag, [lcdTest684Package.id]:lcdTest684.releaseTag, [lcdTest683Package.id]:lcdTest683.releaseTag, [lcdFinal680Package.id]:lcdFinal680.releaseTag, [lcdTest680Package.id]:lcdTest680.releaseTag, [lcdTest679Package.id]:lcdTest679.releaseTag, 'de3.104-lcd-app-test1': 'de3.104-lcd-test1', 'de3.103-lcd-app-test1': 'de3.103-lcd-test1', 'de3.73-lcd-app': 'de3.73-test646', 'de3.84-lcd-test1-app': 'de3.84-lcd-test1', 'de3.85-lcd-test1-app': 'de3.85-lcd-test1', 'de3.87-lcd-test1-app': 'de3.87-lcd-test1', 'de3.88-lcd-test1-app': 'de3.88-lcd-test1', 'de3.89-lcd-test1-app': 'de3.89-lcd-test1' };
  const releaseTag = specialTags[entry.id] || entry.version.split('-')[1].toLowerCase();
  const localDownloadUrl = deploymentPath(`firmware/${entry.file}`); // Validate even a pinned download's filename.
  const samePackage = reference => ['id','version','counter','file','board','bytes','sha256']
    .every(key => entry[key] === reference[key]);
  const previous = [[package675, app675.downloadCommit], [package674, 'a39d43c7dea2681be1981695837b2cb8473db926']].find(([descriptor]) => samePackage(descriptor));
  let downloadUrl = localDownloadUrl;
  if (samePackage(lcdFinal680Package)) downloadUrl = 'https://github.com/bluecyber81/pixl.js/releases/download/' + lcdFinal680.releaseTag + '/' + entry.file;
  else if (samePackage(lcdReleasePackage)) downloadUrl = 'https://github.com/bluecyber81/pixl.js/releases/download/de4.1/' + entry.file;
  else if (samePackage(lcdTest680Package)) downloadUrl = 'https://github.com/bluecyber81/pixl.js/releases/download/' + lcdTest680.releaseTag + '/' + entry.file;
  else if (samePackage(lcdTest679Package)) downloadUrl = 'https://github.com/bluecyber81/pixl.js/releases/download/' + lcdTest679.releaseTag + '/' + entry.file;
  else if (previous) downloadUrl = 'https://github.com/bluecyber81/pixl.js/raw/' + previous[1] + '/fw/releases/' + entry.file;
  return {newer:Boolean(newer),profileMismatch,installed,releaseNotesUrl:['de3.98-lcd-app', 'de3.99-lcd-app', 'de3.100-lcd-app', 'de3.101-lcd-app', 'de3.102-lcd-app', 'de4.1-lcd-app'].includes(entry.id) ? deploymentPath('guide/index.html') + '#lcd-' + entry.id.split('-')[0].replace('.', '') : entry.id === 'de3.86-lcd-test1-app'
    ? deploymentPath('guide/LCD-' + entry.version.split('-')[1] + '.txt') : 'https://github.com/bluecyber81/pixl.js/releases/tag/' + releaseTag,
    downloadUrl,dfuUrl:deploymentPath('dfu/web.html') + '?' + new URLSearchParams({ package: entry.id }) + (session?.dfuReference || '')};
}

export function currentLcdDownloads(entry, session, boot) {
  if (!session.connected) return { app:true, combo:true };
  const info = normalizeBootDiagnostics(boot);
  const offer = packagePresentation(entry, session, info);
  const layout = UPDATE_TARGET.bootloader;
  const system = UPDATE_TARGET.softDevice;
  const currentOrOlder = !offer.newer && firmwareBoard(offer.installed) !== 'OLED';
  const knownLayout = info?.geometryValid && info.bootAddressValid && info.bootVectorsValid &&
    info.settingsCrcValid && info.paramsLayoutKnown && !info.addressConflict &&
    info.bootAddress === layout.address && info.effectiveParamsAddress === layout.paramsAddress &&
    info.settingsAddress === layout.settingsAddress && info.settingsLayoutSupported &&
    info.settingsVersion === layout.settingsVersion && info.chipPart === UPDATE_TARGET.hardware.chip &&
    info.flashBytes === UPDATE_TARGET.hardware.flash && info.ramBytes === UPDATE_TARGET.hardware.ram && info.pageBytes === UPDATE_TARGET.hardware.page;
  const knownPriorBoot = info?.bootHashValid && Object.values(UPDATE_TARGET).some(profile =>
    profile?.counter < UPDATE_TARGET.bootloaderZ21.counter && profile.counter === info.bootloaderCounter && profile.sha256 === info.bootRegionSha256);
  const s112 = info?.softDeviceValid && info.softDeviceVariant === system.variant;
  const comboSoftDevice = s112 && ((info.softDeviceFwid === 0x0103 && info.softDeviceVersion === 7002000) ||
    (info.softDeviceFwid === system.fwid && info.softDeviceVersion === system.version));
  return {
    app: Boolean(currentOrOlder && knownLayout && s112 && info.bootHashValid && !offer.profileMismatch),
    combo: Boolean(currentOrOlder && knownLayout && comboSoftDevice && knownPriorBoot)
  };
}

export function firmwarePackageText(locale='de_DE') {
  return String(locale).startsWith('de')?{
    systemGuide:'Android-Komplettpaket mit Z21 und Anleitung',
    source:'Quellcode der LCD-Firmware DE4.2 / App680',title:'Mitgelieferte Firmware',empty:'Kein mitgeliefertes Paket in diesem Dateimanager.',
    scope:'Anwendungsupdate für unser Allmiibo LCD mit Packed LittleFS (PFS1) und S112 7.3.0. Die normale DE4.2 / App680 setzt Z21 voraus. Ein bestehendes PFS1-Dateisystem benötigt dafür keine erneute Speicherumstellung.',
    unread:'Speicherprofil und Displayvariante werden hier nicht ausgelesen. Die Paketliste bestätigt keine Gerätekompatibilität.',
    limits:'Der Browser prüft die Paket-Prüfsumme und vergleicht den App-Zähler mit einer aktuellen Gerätediagnose. Z15, Z17 und Z19 prüfen die Signatur und können auch eine ältere, gültig signierte Anwendung installieren. Bootloader-Pakete haben einen eigenen Versionszähler.',
    download:'ZIP herunterladen',dfu:'Dieses Paket im Updater öffnen',
    android:'In nRF DFU öffnen (Android)',androidHint:'Die installierte nRF-DFU-App lädt die gewählte ZIP vom Projekt. In der App wählst du dein Gerät und startest die Übertragung.',
    stable:'Stabile Ausgabe',previous:'Frühere stabile Ausgabe',profileMismatch:'Die ausgelesenen Bootdaten passen nicht zum Bootloader- oder S112-Profil dieses Pakets.',
    prerelease:'Testversion für LCD',releaseNotes:'Versionshinweise und Prüfstand',
    newer:'Die gelesene Anwendung ist neuer als dieses Paket. Ein Downgrade wird nicht angeboten.',
    hash:'Paket-Prüfsumme',counter:'Zähler',details:'Paketdetails',local:'Lokale Paketliste – keine Online-Updatesuche.'
  }:{
    systemGuide:'Full Android package with Z21 and instructions',
    source:'Source code for LCD firmware DE4.2 / App680',title:'Bundled firmware',empty:'This file manager contains no bundled package.',
    scope:'Application update for our Allmiibo LCD with Packed LittleFS (PFS1) and S112 7.3.0. Normal DE4.2 / App680 requires Z21. An existing PFS1 filesystem does not need another storage migration for this update.',
    unread:'Storage profile and display variant are not read here. This package list does not confirm device compatibility.',
    limits:'The browser verifies the package checksum and compares the application counter when a recent device reading is available. Z15, Z17 and Z19 check the signature and can install an older, validly signed application. Bootloader packages have a separate version counter.',
    download:'Download ZIP',dfu:'Open this package in the updater',
    android:'Open in nRF DFU (Android)',androidHint:'The installed nRF DFU app downloads the selected ZIP from the project. Choose your device in the app and start the transfer there.',
    stable:'Stable release',previous:'Earlier stable release',profileMismatch:'The reported boot details differ from the bootloader or S112 profile of this package.',
    prerelease:'LCD test release',releaseNotes:'Release notes and test status',
    newer:'The read application is newer than this package. No downgrade is offered.',
    hash:'Package checksum',counter:'Counter',details:'Package details',local:'Local package list, not an online update check.'
  };
}
