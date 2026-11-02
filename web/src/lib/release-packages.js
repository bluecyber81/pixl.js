import { normalizeBootDiagnostics } from './boot-diagnostics.js';
import { deploymentPath } from './deployment-path.js';

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
    downloadUrl:deploymentPath(`firmware/${entry.file}`),dfuUrl:deploymentPath('dfu/web.html')};
}

export function firmwarePackageText(locale='de_DE') {
  return String(locale).startsWith('de')?{
    source:'Quellcode der mitgelieferten Firmware DE3.55',title:'Mitgelieferte Firmware',empty:'Kein mitgeliefertes Paket in diesem Dateimanager.',
    scope:'Für unser Allmiibo LCD mit Packed LittleFS (PFS1), BL8 und S112 7.3.0. Nur die Anwendung; keine Speicherumstellung.',
    unread:'Speicherprofil und Displayvariante werden hier nicht ausgelesen. Die Paketliste bestätigt keine Gerätekompatibilität.',
    limits:'Die DFU-Seite prüft die Paketidentität mit SHA-256. Signatur und Versionszähler prüft der Bootloader. Übertragen startet erst nach deiner Geräteauswahl.',
    download:'ZIP herunterladen',dfu:'Auf der DFU-Seite prüfen und auswählen',
    newer:'Die gelesene Anwendung ist neuer als dieses Paket. Ein Downgrade wird nicht angeboten.',
    hash:'Paket-Prüfsumme',counter:'Zähler',details:'Paketdetails',local:'Lokale Paketliste – keine Online-Updatesuche.'
  }:{
    source:'Source code for bundled firmware DE3.55',title:'Bundled firmware',empty:'This file manager contains no bundled package.',
    scope:'For our Allmiibo LCD with Packed LittleFS (PFS1), BL8 and S112 7.3.0. Application only; no storage migration.',
    unread:'Storage profile and display variant are not read here. This package list does not confirm device compatibility.',
    limits:'The DFU page verifies package identity with SHA-256. The bootloader checks the signature and version counter. Transfer begins only after you select a device.',
    download:'Download ZIP',dfu:'Check and select on the DFU page',
    newer:'The read application is newer than this package. No downgrade is offered.',
    hash:'Package checksum',counter:'Counter',details:'Package details',local:'Local package list, not an online update check.'
  };
}
