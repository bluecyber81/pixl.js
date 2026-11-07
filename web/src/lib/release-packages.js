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
  const match=installed?.match(/^(\d+)\.(\d+)\.(\d+)(?:-DE3\.(\d+)(-PREP)?)?$/);
  const target=entry.version.match(/^(\d+)\.(\d+)\.(\d+)-DE3\.(\d+)$/);
  const diagnostic=active?normalizeBootDiagnostics(boot):null;
  const relation=match&&target?[1,2,3,...(match[4]?[4]:[])].map(i=>Number(match[i])-Number(target[i])).find(n=>n!==0)||0:0;
  const newer=relation>0||(diagnostic?.settingsCrcValid&&diagnostic.applicationCounter>entry.counter);
  return {newer:Boolean(newer),installed,
    downloadUrl:deploymentPath(`firmware/${entry.file}`),dfuUrl:deploymentPath('dfu/web.html') + '?' + new URLSearchParams({ package: entry.id }) + (session?.dfuReference || '')};
}

export function firmwarePackageText(locale='de_DE') {
  return String(locale).startsWith('de')?{
    source:'Quellcode der mitgelieferten Firmware DE3.65',title:'Mitgelieferte Firmware',empty:'Kein mitgeliefertes Paket in diesem Dateimanager.',
    scope:'Anwendungsupdate für unser Allmiibo LCD mit Packed LittleFS (PFS1) und S112 7.3.0. BL8, Z13, Z15, Z17 und Z19 bezeichnen die bekannten Bootloader. Mit passendem BL8 kannst du die Anwendung direkt aktualisieren.',
    unread:'Speicherprofil und Displayvariante werden hier nicht ausgelesen. Die Paketliste bestätigt keine Gerätekompatibilität.',
    limits:'Der Browser prüft die Paket-Prüfsumme und vergleicht den App-Zähler mit einer aktuellen Gerätediagnose. Z15 und Z17 prüfen die Signatur und können auch eine ältere, gültig signierte Anwendung installieren. Bootloader-Pakete haben einen eigenen Versionszähler.',
    download:'ZIP herunterladen',dfu:'Dieses Paket im Updater öffnen',
    prerelease:'Testversion für LCD',releaseNotes:'Versionshinweise und Prüfstand',
    newer:'Die gelesene Anwendung ist neuer als dieses Paket. Ein Downgrade wird nicht angeboten.',
    hash:'Paket-Prüfsumme',counter:'Zähler',details:'Paketdetails',local:'Lokale Paketliste – keine Online-Updatesuche.'
  }:{
    source:'Source code for bundled firmware DE3.65',title:'Bundled firmware',empty:'This file manager contains no bundled package.',
    scope:'Application update for our Allmiibo LCD with Packed LittleFS (PFS1) and S112 7.3.0. BL8, Z13, Z15, Z17 and Z19 identify known bootloaders. Devices with a matching BL8 can update the application directly.',
    unread:'Storage profile and display variant are not read here. This package list does not confirm device compatibility.',
    limits:'The browser verifies the package checksum and compares the application counter when a recent device reading is available. Z15 and Z17 check the signature and can install an older, validly signed application. Bootloader packages have a separate version counter.',
    download:'Download ZIP',dfu:'Open this package in the updater',
    prerelease:'LCD test release',releaseNotes:'Release notes and test status',
    newer:'The read application is newer than this package. No downgrade is offered.',
    hash:'Package checksum',counter:'Counter',details:'Package details',local:'Local package list, not an online update check.'
  };
}
