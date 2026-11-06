// Optional INFO 0x09: six cached cumulative application-start markers. The
// firmware records a contiguous prefix only; an unset marker is not 0 ms.
const SCOPE = 'application-storage-start-to-first-dispatch';
const PHASES = ['storageBegin', 'storageDone', 'displayBegin', 'displayDone', 'launcherDone', 'dispatchDone'];
const STORAGE_PHASES = ['mountDone', 'journalDone'];
const MOUNT_COUNTERS = ['physicalReadAttempts', 'physicalReadBytes', 'cacheHits', 'cacheMisses', 'bypassReads', 'physicalReadErrors'];
const uint32 = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
// Last actual mount, not the time of this read and not necessarily a cold boot.
export function normalizeMountDiagnostics(value) {
  if (!value || value.scope !== 'last-packedfs-mount' || !Number.isInteger(value.flags) ||
      value.flags < 1 || value.flags > 31 || !(value.flags & 1) ||
      !Number.isInteger(value.result) || value.result < -2147483648 || value.result > 2147483647 ||
      Boolean(value.flags & 2) !== (value.result === 0) || MOUNT_COUNTERS.some(key => !uint32(value[key]))) return null;
  const timingValid = !!(value.flags & 16);
  if (['configureMilliseconds','scanMilliseconds'].some(key => timingValid ? !uint32(value[key]) : value[key] !== null)) return null;
  return Object.freeze({scope:'last-packedfs-mount', flags:value.flags, result:value.result,
    configureMilliseconds:value.configureMilliseconds, scanMilliseconds:value.scanMilliseconds,
    ...Object.fromEntries(MOUNT_COUNTERS.map(key => [key,value[key]]))});
}
function validSeries(mask, times) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 63 || (mask & (mask + 1)) ||
      !Array.isArray(times) || times.length !== 6) return false;
  return Array.from(times).every((ms, index) => !(mask & (1 << index)) ? ms === null :
    Number.isInteger(ms) && ms >= 0 && ms <= 0xffffffff &&
    (index === 0 ? ms === 0 : ms >= times[index - 1]));
}
export function parseStartupDiagnostics(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (!(bytes instanceof Uint8Array) || bytes[5] !== bytes.byteLength ||
      bytes[0] !== 80 || bytes[1] !== 88 || bytes[2] !== 83 || bytes[3] !== 84 ||
      !(bytes[4] === 1 && bytes.length === 32 && bytes[7] === 0 || bytes[4] === 2 && bytes.length === 40 || bytes[4] === 3 && bytes.length === 80)) {
    throw new Error('Invalid startup diagnostic response');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), mask = bytes[6];
  const raw = PHASES.map((_, index) => view.getUint32(8 + index * 4, true));
  const times = raw.map((ms, index) => mask & (1 << index) ? ms : null);
  if (raw.some((ms, index) => !(mask & (1 << index)) && ms !== 0)) throw new Error('Inconsistent startup diagnostic response');
  const value = {schemaVersion: bytes[4], scope: SCOPE, phaseMask: mask, elapsedMilliseconds: times};
  if (bytes[4] >= 2) {
    value.storageDetailMask = bytes[7];
    value.storageElapsedMilliseconds = STORAGE_PHASES.map((_, index) => {
      const ms = view.getUint32(32 + index * 4, true);
      if (bytes[7] & (1 << index)) return ms;
      if (ms !== 0) throw new Error('Inconsistent storage marker');
      return null;
    });
  }
  if (bytes[4] === 3) {
    const flags = view.getUint32(40,true);
    if (!(flags & 1)) {
      if (bytes.subarray(40).some(byte => byte !== 0)) throw new Error('Inconsistent absent mount profile');
      value.mount = null;
    } else {
      value.mount = {scope:'last-packedfs-mount',flags,result:view.getInt32(44,true),
        configureMilliseconds:flags & 16 ? view.getUint32(48,true) : null,
        scanMilliseconds:flags & 16 ? view.getUint32(52,true) : null,
        ...Object.fromEntries(MOUNT_COUNTERS.map((key,index) => [key,view.getUint32(56+index*4,true)]))};
    }
  }
  const normalized = normalizeStartupDiagnostics(value);
  if (!normalized) throw new Error('Inconsistent startup diagnostic response');
  return normalized;
}
export function normalizeStartupDiagnostics(value) {
  if (!value || ![1, 2, 3].includes(value.schemaVersion) || value.scope !== SCOPE ||
      !validSeries(value.phaseMask, value.elapsedMilliseconds)) return null;
  const info = {schemaVersion: value.schemaVersion, scope: SCOPE, phaseMask: value.phaseMask,
    elapsedMilliseconds: Object.freeze([...value.elapsedMilliseconds])};
  if (value.schemaVersion >= 2) {
    const mask = value.storageDetailMask, times = value.storageElapsedMilliseconds, end = info.elapsedMilliseconds[1];
    if (![0, 1, 3].includes(mask) || (mask && !(value.phaseMask & 1)) || !Array.isArray(times) || times.length !== 2 ||
        !Array.from(times).every((ms, i) => !(mask & (1 << i)) ? ms === null : Number.isInteger(ms) &&
          ms >= (i ? times[0] : 0) && ms <= (end ?? 0xffffffff))) return null;
    info.storageDetailMask = mask;
    info.storageElapsedMilliseconds = Object.freeze([...times]);
  }
  if (value.schemaVersion === 3) {
    const mount = value.mount === null ? null : normalizeMountDiagnostics(value.mount);
    if (value.mount !== null && !mount) return null;
    info.mount = mount;
  }
  return Object.freeze(info);
}
// Disjoint durations inside storageDone; a missing checkpoint leaves its interval unknown.
export function startupStorageIntervals(value) {
  const info = normalizeStartupDiagnostics(value);
  if (!info || info.schemaVersion < 2) return [];
  const [mount, journal] = info.storageElapsedMilliseconds, end = info.elapsedMilliseconds[1];
  return [{id: 'mountDone', milliseconds: mount},
    {id: 'journalDone', milliseconds: journal === null ? null : journal - mount},
    {id: 'storageRemaining', milliseconds: journal === null || end === null ? null : end - journal}];
}
export function startupMountPresentation(value, locale = 'de_DE') {
  const info = normalizeStartupDiagnostics(value);
  if (info?.schemaVersion !== 3) return null;
  const de = locale.startsWith('de'), pick = (a,b) => de ? a : b, mount = info.mount;
  const title = pick('Laufwerk einbinden: Zeit und Lesezugriffe', 'Mounting the drive: timing and reads');
  if (!mount) return {title, rows:[], note:pick('Kein abgeschlossenes PackedFS-Mountprofil verfügbar. Fehlende Werte bedeuten nicht 0 ms oder 0 Zugriffe.', 'No completed PackedFS mount profile is available. Missing values do not mean 0 ms or 0 reads.')};
  const duration = n => n === null ? pick('Nicht gemessen','Not measured') : `${n} ms`;
  const counter = n => `${mount.flags & 8 ? '≥ ' : ''}${n}`;
  return {title, rows:[
    [pick('Mount-Ergebnis','Mount result'), mount.result === 0 ? pick('Erfolgreich','Successful') : pick('Fehlgeschlagen','Failed') + ` (${mount.result})`],
    [pick('Flash und Geometrie vorbereiten','Flash and geometry setup'), duration(mount.configureMilliseconds)],
    [pick('PackedFS einlesen','PackedFS scan'), duration(mount.scanMilliseconds)],
    [pick('Temporärer Lesecache erhalten','Temporary read cache allocated'), mount.flags & 4 ? pick('Ja','Yes') : pick('Nein','No')],
    [pick('Physische Leseversuche','Physical read attempts'), counter(mount.physicalReadAttempts)],
    [pick('Erfolgreich gelesene Bytes','Successfully read bytes'), counter(mount.physicalReadBytes) + ' B'],
    [pick('Cachetreffer','Cache hits'), counter(mount.cacheHits)],
    [pick('Geeignete Zugriffe ohne Cachetreffer','Eligible reads without a cache hit'), counter(mount.cacheMisses)],
    [pick('Zugriffe außerhalb des Cachepfads','Reads bypassing the cache'), counter(mount.bypassReads)],
    [pick('Physische Lesefehler','Physical read errors'), counter(mount.physicalReadErrors)],
  ], note:pick('Letzter tatsächlicher PackedFS-Mount; eine Wiederverwendung des eingebundenen Laufwerks erneuert diese Werte nicht. Die Abrufzeit ist kein Messzeitpunkt. Cachefehlschläge enthalten auch Zugriffe ohne verfügbaren Cache. Keine Verschleißmessung.', 'Last actual PackedFS mount; reusing an already mounted drive does not refresh these values. Read time is not measurement time. Cache misses include reads with no cache available. This is not a wear measurement.') +
    (mount.flags & 8 ? pick(' Zähler gesättigt: Alle angezeigten Zähler sind nur Untergrenzen.', ' Counters saturated: all displayed counters are lower bounds only.') : '')};
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
      'A saved report is a dated observation, not a new device readback.',
      ...(info.schemaVersion === 3 ? ['Mount profiling describes the last actual PackedFS mount, not the read timestamp; saturated counters are lower bounds.'] : [])] };
}
export function compareStartup(report, current) {
  const before = normalizeStartupDiagnostics(report?.startup), after = normalizeStartupDiagnostics(current);
  if (before?.phaseMask !== 63 || after?.phaseMask !== 63) return null;
  const delta = index => after.elapsedMilliseconds[index] - before.elapsedMilliseconds[index];
  const result = {storage: delta(1), total: delta(5)};
  if (before.schemaVersion >= 2 && after.schemaVersion >= 2) {
    const baseline = startupStorageIntervals(before);
    result.storageIntervals = startupStorageIntervals(after).flatMap(({id, milliseconds}, index) =>
      milliseconds === null || baseline[index].milliseconds === null ? [] : [{id, milliseconds: milliseconds - baseline[index].milliseconds}]);
  }
  return result;
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
    storageIntervals: 'Zeitanteile der Speicherinitialisierung',
    intervals: {mountDone: 'Bis das Laufwerk eingebunden ist', journalDone: 'Prüfen und Wiederherstellen des Speicherjournals', storageRemaining: 'Übrige Speicherinitialisierung'},
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
    storageIntervals: 'Time within storage initialization',
    intervals: {mountDone: 'Until the drive is mounted', journalDone: 'Storage journal check and recovery', storageRemaining: 'Remaining storage initialization'},
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
