// Optional INFO 0x09: six cached cumulative application-start markers. The
// firmware records a contiguous prefix only; an unset marker is not 0 ms.
const SCOPE = 'application-storage-start-to-first-dispatch';
const PHASES = ['storageBegin', 'storageDone', 'displayBegin', 'displayDone', 'launcherDone', 'dispatchDone'];
function validSeries(mask, times) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 63 || (mask & (mask + 1)) ||
      !Array.isArray(times) || times.length !== 6) return false;
  return Array.from(times).every((ms, index) => !(mask & (1 << index)) ? ms === null :
    Number.isInteger(ms) && ms >= 0 && ms <= 0xffffffff &&
    (index === 0 ? ms === 0 : ms >= times[index - 1]));
}
export function parseStartupDiagnostics(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32 ||
      bytes[0] !== 80 || bytes[1] !== 88 || bytes[2] !== 83 || bytes[3] !== 84 ||
      bytes[4] !== 1 || bytes[5] !== 32 || bytes[7] !== 0) {
    throw new Error('Invalid startup diagnostic response');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), mask = bytes[6];
  const raw = PHASES.map((_, index) => view.getUint32(8 + index * 4, true));
  const times = raw.map((ms, index) => mask & (1 << index) ? ms : null);
  if (!validSeries(mask, times) || raw.some((ms, index) => !(mask & (1 << index)) && ms !== 0)) {
    throw new Error('Inconsistent startup diagnostic response');
  }
  return Object.freeze({ schemaVersion: 1, scope: SCOPE, phaseMask: mask,
    elapsedMilliseconds: Object.freeze(times) });
}
export function normalizeStartupDiagnostics(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== SCOPE ||
      !validSeries(value.phaseMask, value.elapsedMilliseconds)) return null;
  return Object.freeze({ schemaVersion: 1, scope: SCOPE, phaseMask: value.phaseMask,
    elapsedMilliseconds: Object.freeze([...value.elapsedMilliseconds]) });
}
export function startupDiagnosticRows(value) {
  const info = normalizeStartupDiagnostics(value);
  return info ? PHASES.map((id, index) => ({ id, elapsedMilliseconds: info.elapsedMilliseconds[index],
    sincePreviousMilliseconds: index && info.elapsedMilliseconds[index] !== null
      ? info.elapsedMilliseconds[index] - info.elapsedMilliseconds[index - 1] : null })) : [];
}
export function createStartupDiagnosticReport(value, observedAt, firmwareVersion) {
  const info = normalizeStartupDiagnostics(value);
  if (!info || typeof observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt) ||
      !Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString() !== observedAt) {
    throw new Error('Invalid startup diagnostic report');
  }
  return { reportSchema: 1, observation: 'cached-startup-markers-read-in-current-session', observedAt,
    ...(typeof firmwareVersion === 'string' && /^\d+\.\d+\.\d+-DE\d+\.\d+$/.test(firmwareVersion) ? {firmwareVersion} : {}),
    startup: info, phases: startupDiagnosticRows(info),
    limits: ['Excludes bootloader and early SDK startup.',
      'Software markers do not prove successful storage access or visible display output.',
      'A saved report is a dated observation, not a new device readback.'] };
}
export function compareStartup(report, current) {
  const before = normalizeStartupDiagnostics(report?.startup), after = normalizeStartupDiagnostics(current);
  if (before?.phaseMask !== 63 || after?.phaseMask !== 63) return null;
  const delta = index => after.elapsedMilliseconds[index] - before.elapsedMilliseconds[index];
  return { storage: delta(1), total: delta(5) };
}
// Timings are cached for a whole boot. Conservatively reject identical complete
// marker sets (even if separate boots coincidentally produced the same values).
export function startupSeries(reports) {
  if (!Array.isArray(reports) || reports.length < 3 || reports.length > 20) return null;
  const seen = new Set(), storage = [], total = [], version = reports[0]?.firmwareVersion;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+-DE\d+\.\d+$/.test(version)) return null;
  for (const report of reports) {
    const s = normalizeStartupDiagnostics(report?.startup);
    if (report?.firmwareVersion !== version || s?.phaseMask !== 63 || !s.elapsedMilliseconds[5]) return null;
    const key = s.elapsedMilliseconds.join(',');
    if (seen.has(key)) return null;
    seen.add(key); storage.push(s.elapsedMilliseconds[1]); total.push(s.elapsedMilliseconds[5]);
  }
  const stats = a => {
    a.sort((x,y) => x-y); const n=a.length;
    return {median:(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2,min:a[0],max:a[n-1]};
  };
  return {version, count:reports.length, storage:stats(storage),total:stats(total)};
}
export function startupDiagnosticsText(locale = 'de_DE') {
  return locale.startsWith('de') ? {
    title: 'Startzeiten der Anwendung', read: 'Startzeiten lesen', export: 'Startbericht speichern',
    baseline:'Früheren Startbericht vergleichen', baselineHint:'Wähle eine gespeicherte Start- oder Gesamtdiagnose desselben Geräts mit derselben Sammlung. Minus bedeutet schneller, Plus langsamer.',
    difference:'Änderung gegenüber der gewählten Datei', storage:'Speicher', total:'Anwendungsstart', invalidBaseline:'Vollständige Startzeiten fehlen oder die JSON-Datei ist ungültig (maximal 1 MiB).',
    measuredTotal: 'Gemessener Anwendungsstart', longestInterval: 'Längster gemessener Abschnitt',
    scope: 'Gespeicherte Zeitmarken dieses Anwendungsstarts. Abruf nur per Klick; kein Neustart.',
    limits: 'Beginn ist die Speicherinitialisierung. Bootloader und früher SDK-Start sind nicht enthalten. Die Marken bestätigen weder erfolgreichen Speicherzugriff noch sichtbare Displayausgabe.',
    disconnected: 'Nicht verbunden. Frühere Werte wurden verworfen.', unknown: 'Startzeiten noch nicht gelesen.',
    loading: 'Startzeiten werden gelesen …', unavailable: 'Diese Firmware stellt keine Startzeiten bereit.',
    failed: 'Startzeiten konnten nicht gültig gelesen werden. Erneut abrufen.',
    available: 'Zeitmarken gelesen.', partial: 'Nur ein Teil der Startphasen wurde aufgezeichnet.',
    elapsed: 'Seit Speicherstart', interval: 'Seit voriger Marke', phase: 'Softwaremarke', absent: 'Nicht aufgezeichnet',
    observed: 'Abgerufen', ms: 'ms', phases: { storageBegin: 'Speicherstart', storageDone: 'Speicherinitialisierung beendet',
      displayBegin: 'Oberfläche und Display starten', displayDone: 'Oberfläche und Display initialisiert',
      launcherDone: 'App-Auswahl initialisiert', dispatchDone: 'Erste Ereignisverarbeitung beendet' }
  } : {
    title: 'Application startup times', read: 'Read startup times', export: 'Save startup report',
    baseline:'Compare a previous startup report', baselineHint:'Choose a saved startup or full report from the same device and collection. Negative means faster, positive means slower.',
    difference:'Change since the selected file', storage:'Storage', total:'Application startup', invalidBaseline:'Missing complete startup markers or invalid JSON file (maximum 1 MiB).',
    measuredTotal: 'Measured application startup', longestInterval: 'Longest measured interval',
    scope: 'Cached markers from this application start. Read only on click; no restart.',
    limits: 'Timing starts at storage initialization. Bootloader and early SDK startup are excluded. Markers do not prove successful storage access or visible display output.',
    disconnected: 'Disconnected. Earlier values were discarded.', unknown: 'Startup times have not been read.',
    loading: 'Reading startup times …', unavailable: 'This firmware does not provide startup times.',
    failed: 'Startup times could not be read and validated. Read again.',
    available: 'Startup markers read.', partial: 'Only some startup phases were recorded.',
    elapsed: 'Since storage start', interval: 'Since previous marker', phase: 'Software marker', absent: 'Not recorded',
    observed: 'Read at', ms: 'ms', phases: { storageBegin: 'Storage start', storageDone: 'Storage initialization ended',
      displayBegin: 'Interface and display start', displayDone: 'Interface and display initialized',
      launcherDone: 'App launcher initialized', dispatchDone: 'First event dispatch ended' }
  };
}
