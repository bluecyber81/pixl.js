import { normalizeBootDiagnostics } from './boot-diagnostics.js';
import { deploymentPath } from './deployment-path.js';

// Carry only firmware counters and FWID across the transition into DFU.
// The URL fragment isn't sent to the server and contains no device identity.
export function dfuReference(boot, time = Date.now()) {
  if (!boot?.settingsCrcValid || !boot.softDeviceValid) return '';
  const values = [boot.applicationCounter, boot.bootloaderCounter, boot.softDeviceFwid];
  if (!values.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff) || values[2] > 0xffff) return '';
  return '#' + new URLSearchParams({ read: time, app: values[0], bl: values[1], sd: values[2] });
}

// Rendering uses only the bundled JSON, never URL parameters or external feeds.
// The independent DFU loader validates the complete catalogue and actual bytes.
export function packagePresentation(entry, session = {}, boot = null) {
  const active=session?.connected===true;
  const installed=active&&typeof session.firmwareVersion==='string'?session.firmwareVersion:null;
  const match=installed?.match(/^(\d+)\.(\d+)\.(\d+)(?:-DE3\.(\d+)(?:-PREP|t[1-9]\d*)?)?$/);
  const target=entry.version.match(/^(\d+)\.(\d+)\.(\d+)-DE3\.(\d+)(?:t[1-9]\d*)?$/);
  const diagnostic=active?normalizeBootDiagnostics(boot):null;
  const relation=match&&target?[1,2,3,...(match[4]?[4]:[])].map(i=>Number(match[i])-Number(target[i])).find(n=>n!==0)||0:0;
  const newer=relation>0||(diagnostic?.settingsCrcValid&&diagnostic.applicationCounter>entry.counter);
  const releaseTag = entry.id === 'de3.73-lcd-app' ? 'de3.73-test646' : entry.version.split('-')[1].toLowerCase();
  return {newer:Boolean(newer),installed,releaseNotesUrl:'https://github.com/bluecyber81/pixl.js/releases/tag/' + releaseTag,
    downloadUrl:deploymentPath(`firmware/${entry.file}`),dfuUrl:deploymentPath('dfu/web.html') + '?' + new URLSearchParams({ package: entry.id }) + (session?.dfuReference || '')};
}

export function firmwarePackageText(locale='de_DE') {
  return String(locale).startsWith('de')?{
    source:'Quellcode der mitgelieferten Firmware DE3.65',title:'Mitgelieferte Firmware',empty:'Kein mitgeliefertes Paket in diesem Dateimanager.',
    scope:'Anwendungsupdate für unser Allmiibo LCD mit Packed LittleFS (PFS1) und S112 7.3.0. Beide Testversionen wurden mit dem Bootloader Z19 am Rechner geprüft.',
    unread:'Speicherprofil und Displayvariante werden hier nicht ausgelesen. Die Paketliste bestätigt keine Gerätekompatibilität.',
    limits:'Der Browser prüft die Paket-Prüfsumme und vergleicht den App-Zähler mit einer aktuellen Gerätediagnose. Z15 und Z17 prüfen die Signatur und können auch eine ältere, gültig signierte Anwendung installieren. Bootloader-Pakete haben einen eigenen Versionszähler.',
    download:'ZIP herunterladen',dfu:'Dieses Paket im Updater öffnen',
    android:'In nRF DFU öffnen (Android)',androidHint:'Die installierte nRF-DFU-App lädt die gewählte ZIP von GitHub Pages. In der App wählst du dein Gerät und startest die Übertragung.',
    prerelease:'Testversion für LCD',releaseNotes:'Versionshinweise und Prüfstand',
    newer:'Die gelesene Anwendung ist neuer als dieses Paket. Ein Downgrade wird nicht angeboten.',
    hash:'Paket-Prüfsumme',counter:'Zähler',details:'Paketdetails',local:'Lokale Paketliste – keine Online-Updatesuche.'
  }:{
    source:'Source code for bundled firmware DE3.65',title:'Bundled firmware',empty:'This file manager contains no bundled package.',
    scope:'Application update for our Allmiibo LCD with Packed LittleFS (PFS1) and S112 7.3.0. Both test releases were checked against the Z19 bootloader on a computer.',
    unread:'Storage profile and display variant are not read here. This package list does not confirm device compatibility.',
    limits:'The browser verifies the package checksum and compares the application counter when a recent device reading is available. Z15 and Z17 check the signature and can install an older, validly signed application. Bootloader packages have a separate version counter.',
    download:'Download ZIP',dfu:'Open this package in the updater',
    android:'Open in nRF DFU (Android)',androidHint:'The installed nRF DFU app downloads the selected ZIP from GitHub Pages. Choose your device in the app and start the transfer there.',
    prerelease:'LCD test release',releaseNotes:'Release notes and test status',
    newer:'The read application is newer than this package. No downgrade is offered.',
    hash:'Package checksum',counter:'Counter',details:'Package details',local:'Local package list, not an online update check.'
  };
}
