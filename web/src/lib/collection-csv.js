import { buildCollectionPresence, collectionPresenceFor } from './collection-presence.js';
import { figureId } from './figure-info.js';

const labels = {
  de: {
    header: ['Figurenname', 'Serie', 'Figuren-ID (Hex)', 'Bestandsstatus', 'Gerätepfad', 'Prüfbereich'],
    present: 'Vorhanden · ID bestätigt', properties: 'Vorhanden laut Eigenschaften',
    attention: 'Datei prüfen', missing: 'Nicht gefunden', unknown: 'Bestand nicht bestätigt',
    upcoming: 'Angekündigt', uncatalogued: 'Unbekannte Katalog-ID', unidentified: 'Datei ohne ausgelesene Figuren-ID',
  },
  en: {
    header: ['Figure name', 'Series', 'Figure ID (hex)', 'Collection status', 'Device path', 'Checked scope'],
    present: 'Present · ID confirmed', properties: 'Present according to properties',
    attention: 'Inspect file', missing: 'Not found', unknown: 'Presence unconfirmed',
    upcoming: 'Upcoming', uncatalogued: 'Unknown catalogue ID', unidentified: 'File with no observed figure ID',
  },
};

function quoteCell(value) {
  let text = String(value ?? '');
  // Quoting escapes delimiters but spreadsheets may still interpret a quoted cell as a formula.
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(text.normalize('NFKC'))) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function collectionCsv(report, locale) {
  if (!report?.complete || !report.scanComplete || report.status !== 'complete') throw new Error('Incomplete collection report');
  const german = locale.startsWith('de'), words = german ? labels.de : labels.en;
  const delimiter = german ? ';' : ',';
  const lines = [words.header.map(quoteCell).join(delimiter)];
  const append = cells => lines.push(cells.map(quoteCell).join(delimiter));
  const presence = buildCollectionPresence(report);
  const figures = new Map(), paths = new Map(), unidentified = [];
  for (const entry of [...report.present, ...report.missing, ...report.unconfirmed, ...report.upcoming]) {
    figures.set(entry.id, entry);
  }
  for (const file of report.files) {
    const ids = new Set([figureId(file.id), figureId(file.metadataId)].filter(Boolean));
    if (!ids.size) unidentified.push(file);
    for (const id of ids) {
      if (!figures.has(id)) figures.set(id, { name: words.uncatalogued });
      if (!paths.has(id)) paths.set(id, []);
      paths.get(id).push(file.path);
    }
  }
  for (const id of [...figures.keys()].sort()) {
    const entry = figures.get(id), status = collectionPresenceFor(presence, id);
    let key = status.state;
    if (key === 'present' && status.basis === 'metadata') key = 'properties';
    if (key === 'unknown' && entry.releaseState === 'upcoming') key = 'upcoming';
    // A text prefix preserves every hex digit, even when Excel guesses numeric column types.
    for (const path of paths.get(id) || ['']) {
      append([entry.name, entry.series, '0x' + id, words[key], path, report.rootPath]);
    }
  }
  for (const file of unidentified) {
    const state = file.status === 'metadata-only' && !file.issues.length ? 'unknown' : 'attention';
    append([words.unidentified, '', '', words[state], file.path, report.rootPath]);
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
