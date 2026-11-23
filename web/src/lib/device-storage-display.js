import { normalizeStorageGcDiagnostics } from './device-extra-diagnostics.js';

const localeFor = locale => String(locale).startsWith('de') ? 'de-DE' : 'en-US';

export function storageUsage(drive) {
  if (!drive || drive.status !== 0 || !Number.isSafeInteger(drive.totalBytes) || drive.totalBytes <= 0 ||
      !Number.isSafeInteger(drive.freeBytes) || drive.freeBytes < 0 || drive.freeBytes > drive.totalBytes) return null;
  return { total: drive.totalBytes, free: drive.freeBytes, used: drive.totalBytes - drive.freeBytes };
}

export function storageAmount(bytes, locale) {
  const unit = bytes >= 1048576 ? ['MiB', 1048576] : bytes >= 1024 ? ['KiB', 1024] : ['B', 1];
  return new Intl.NumberFormat(localeFor(locale), { maximumFractionDigits: 2 }).format(bytes / unit[1]) + ' ' + unit[0];
}

export function occupiedPercent({ used, total }, locale) {
  if (used > 0 && used / total < 0.01) return '< 1 %';
  if (used < total && used / total > 0.99) return '> 99 %';
  return new Intl.NumberFormat(localeFor(locale), { style: 'percent', maximumFractionDigits: 0 }).format(used / total);
}

// The firmware counts readers retaining old groups, not reclaimable bytes.
export function storageCleanupPresentation(value, locale = 'de_DE') {
  const info = normalizeStorageGcDiagnostics(value);
  if (!info) return null;
  const de = String(locale).startsWith('de'), pick = (a,b) => de ? a : b;
  const state = {unknown:pick('Noch nicht beurteilt','Not assessed yet'),
    pending:pick('Aufräumen ausstehend','Cleanup pending'),clean:pick('Keine ausstehenden alten Gruppen gemeldet','No pending old groups reported')}[info.cleanupState];
  return {state, rows:[
    [pick('Speicherfreigabe','Storage cleanup'),state],
    [pick('Offene Dateileser / Ordneransichten','Open file readers / folder snapshots'),`${info.fileReaders} / ${info.directorySnapshots}`],
    [pick('Leser mit alten Speichergruppen','Readers retaining old storage groups'),String(info.obsoletePinHandles)],
    [pick('Schreibzugriff / Transaktion aktiv','Writer / transaction active'),`${pick(info.writerActive?'Ja':'Nein',info.writerActive?'Yes':'No')} / ${pick(info.transactionActive?'Ja':'Nein',info.transactionActive?'Yes':'No')}`],
    [pick('Fehlerzustand gemeldet','Storage fault flag'),pick(info.poisoned?'Ja':'Nein',info.poisoned?'Yes':'No')],
    [pick('Letzter abgeschlossener Aufräumlauf','Last completed collection'),info.lastGcResult === null ? pick('Noch kein Ergebnis','No result yet') : info.lastGcResult === 0 ? pick('Erfolgreich','Successful') : pick('Fehler ','Error ')+info.lastGcResult]
  ],note:pick('Nur gespeicherter Status: Diese Abfrage löst kein Aufräumen aus. Leser können alte Gruppen noch benötigen. Die Anzahl ist keine Bytezahl; daraus lässt sich kein sofort freigebbarer Platz berechnen. Das letzte Aufräumergebnis kann älter als der Abruf sein.',
    'Cached status only: this read does not run cleanup. Readers can still need old groups. Their count is not a byte count and cannot establish immediately reclaimable space. The last collection result may predate this read.')};
}
