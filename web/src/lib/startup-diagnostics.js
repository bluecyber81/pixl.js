// Optional INFO 0x09: six cached cumulative application-start markers. The
// firmware records a contiguous prefix only; an unset marker is not 0 ms.
const SCOPE = 'application-storage-start-to-first-dispatch';
const PHASES = ['storageBegin', 'storageDone', 'displayBegin', 'displayDone', 'launcherDone', 'dispatchDone'];
const STORAGE_PHASES = ['mountDone', 'journalDone'];
const PROFILE_COUNTERS = ['flashWaitTicks', 'flashTransferTicks', 'crcTicks', 'indexPassTicks', 'flashReadTransactions'];
const MOUNT_COUNTERS = ['physicalReadAttempts', 'physicalReadBytes', 'cacheHits', 'cacheMisses', 'bypassReads', 'physicalReadErrors'];
// Release versions, preparation builds and numbered test builds share this diagnostic format.
const isStartupFirmware = value => typeof value === 'string' && value.length <= 64 &&
  /^\d+\.\d+\.\d+-DE\d+\.\d+(?:-PREP|(?:-OLED)?t[1-9]\d*)?$/.test(value);
const uint32 = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
// Last actual mount, not the time of this read and not necessarily a cold boot.
export function normalizeMountDiagnostics(value, schemaVersion = 3) {
  if (!value || value.scope !== 'last-packedfs-mount' || !Number.isInteger(value.flags) ||
      value.flags < 1 || value.flags > 31 || !(value.flags & 1) ||
      !Number.isInteger(value.result) || value.result < -2147483648 || value.result > 2147483647 ||
      Boolean(value.flags & 2) !== (value.result === 0) || MOUNT_COUNTERS.some(key => !uint32(value[key]))) return null;
  const timingValid = !!(value.flags & 16);
  if (['configureMilliseconds','scanMilliseconds'].some(key => timingValid ? !uint32(value[key]) : value[key] !== null)) return null;
  const detail = {};
  if (schemaVersion >= 4) {
    const {cacheSlotsAllocated, cacheSlotsFilled, cachePageBytes} = value;
    if (![cacheSlotsAllocated, cacheSlotsFilled].every(n => Number.isInteger(n) && n >= 0 && n <= 255) ||
        !Number.isInteger(cachePageBytes) || cachePageBytes < 0 || cachePageBytes > 65535 ||
        cacheSlotsFilled > cacheSlotsAllocated || !!cacheSlotsAllocated !== !!(value.flags & 4) ||
        !!cacheSlotsAllocated !== !!cachePageBytes) return null;
    Object.assign(detail, {cacheSlotsAllocated, cacheSlotsFilled, cachePageBytes});
  }
  return Object.freeze({scope:'last-packedfs-mount', flags:value.flags, result:value.result,
    configureMilliseconds:value.configureMilliseconds, scanMilliseconds:value.scanMilliseconds,
    ...Object.fromEntries(MOUNT_COUNTERS.map(key => [key,value[key]])), ...detail});
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
      !(bytes[4] === 1 && bytes.length === 32 && bytes[7] === 0 || bytes[4] === 2 && bytes.length === 40 ||
        bytes[4] === 3 && bytes.length === 80 || bytes[4] === 4 && bytes.length === 84 || bytes[4] === 5 && bytes.length === 112)) {
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
  if (bytes[4] >= 3) {
    const flags = view.getUint32(40,true);
    if (!(flags & 1)) {
      if (bytes.subarray(40, bytes[4] === 5 ? 84 : bytes.length).some(byte => byte !== 0)) throw new Error('Inconsistent absent mount profile');
      value.mount = null;
    } else {
      value.mount = {scope:'last-packedfs-mount',flags,result:view.getInt32(44,true),
        configureMilliseconds:flags & 16 ? view.getUint32(48,true) : null,
        scanMilliseconds:flags & 16 ? view.getUint32(52,true) : null,
        ...Object.fromEntries(MOUNT_COUNTERS.map((key,index) => [key,view.getUint32(56+index*4,true)]))};
      if (bytes[4] >= 4) Object.assign(value.mount, {
        cacheSlotsAllocated: bytes[80], cacheSlotsFilled: bytes[81], cachePageBytes: view.getUint16(82,true)
      });
    }
  }
  if (bytes[4] === 5) {
    const flags = view.getUint32(84, true);
    if ((flags & ~7) || !(flags & 4)) throw new Error('Invalid startup test profile flags');
    value.mountProfile = {scope:'last-packedfs-mount-scan', testBuild:true, available:!!(flags & 1),
      countersSaturated:!!(flags & 2), ticksPerSecond:view.getUint32(88,true),
      ...Object.fromEntries(PROFILE_COUNTERS.map((key,index) => [key,view.getUint32(92+index*4,true)]))};
  }
  const normalized = normalizeStartupDiagnostics(value);
  if (!normalized) throw new Error('Inconsistent startup diagnostic response');
  return normalized;
}
export function normalizeStartupDiagnostics(value) {
  if (!value || ![1, 2, 3, 4, 5].includes(value.schemaVersion) || value.scope !== SCOPE ||
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
  if (value.schemaVersion >= 3) {
    const mount = value.mount === null ? null : normalizeMountDiagnostics(value.mount, value.schemaVersion);
    if (value.mount !== null && !mount) return null;
    info.mount = mount;
  }
  if (value.schemaVersion === 5) {
    const profile = normalizeMountTestProfile(value.mountProfile);
    if (!profile || profile.available && !info.mount) return null;
    info.mountProfile = profile;
  }
  return Object.freeze(info);
}
export function normalizeMountTestProfile(value) {
  if (!value || value.scope !== 'last-packedfs-mount-scan' || value.testBuild !== true ||
      typeof value.available !== 'boolean' || typeof value.countersSaturated !== 'boolean' ||
      !uint32(value.ticksPerSecond) || !value.ticksPerSecond ||
      PROFILE_COUNTERS.some(key => !uint32(value[key])) ||
      (!value.available && (value.countersSaturated || PROFILE_COUNTERS.some(key => value[key] !== 0))) ||
      (!value.countersSaturated && PROFILE_COUNTERS.some(key => value[key] === 0xffffffff))) return null;
  return Object.freeze({scope:'last-packedfs-mount-scan',testBuild:true,available:value.available,
    countersSaturated:value.countersSaturated,ticksPerSecond:value.ticksPerSecond,
    ...Object.fromEntries(PROFILE_COUNTERS.map(key => [key,value[key]]))});
}
export function mountTestProfilePresentation(value, locale = 'de_DE') {
  const profile = normalizeMountTestProfile(value);
  if (!profile) return null;
  const de=locale.startsWith('de'), pick=(a,b)=>de?a:b;
  const number = n => new Intl.NumberFormat(de?'de-DE':'en-GB',{maximumFractionDigits:3}).format(n);
  const note = pick('Test 1: Zeitmessung nur während des letzten PackedFS-Mountscans, nach Vorbereitung und Cache-Zuteilung. RTC-Auflösung ',
    'Test 1: timing during the last PackedFS mount scan, after setup and cache allocation. RTC resolution ') +
    `${number(1000/profile.ticksPerSecond)} ms (${profile.ticksPerSecond} Hz). ` +
    pick('Messung hat zusätzlichen Aufwand; dies ist keine CPU-Zeit. Die Indexprüfung enthält Flash- und CRC-Arbeit: Zeiten nicht aufsummieren.',
      'Instrumentation adds overhead; these are not CPU times. The index pass includes flash and CRC work: do not add these times.') +
    (profile.countersSaturated ? pick(' Gesättigte Werte sind Untergrenzen.',' Saturated values are lower bounds.') : '');
  if (!profile.available) return {rows:[],note:pick('Noch kein abgeschlossener Test-Mountscan erfasst. ','No completed test mount scan recorded. ')+note};
  const duration = key => `${profile[key] === 0xffffffff ? '≥ ' : ''}${number(profile[key]*1000/profile.ticksPerSecond)} ms (${profile[key]} ${pick('Ticks','ticks')})`;
  return {rows:[
    [pick('Flash: auf Bereitschaft warten','Flash: wait for ready'),duration('flashWaitTicks')],
    [pick('Flash: READ-Befehl und Nutzdaten','Flash: READ command and payload'),duration('flashTransferTicks')],
    [pick('PackedFS: CRC-Prüfungen','PackedFS: CRC checks'),duration('crcTicks')],
    [pick('Indexprüfung inkl. Flash/CRC','Index check including flash/CRC'),duration('indexPassTicks')],
    [pick('Flash-READ-Transaktionen im Scan','Flash READ transactions in scan'),`${profile.flashReadTransactions === 0xffffffff?'≥ ':''}${profile.flashReadTransactions}`]
  ],note};
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
  if (!info || info.schemaVersion < 3) return null;
  const de = locale.startsWith('de'), pick = (a,b) => de ? a : b, mount = info.mount;
  const title = pick('Laufwerk einbinden: Zeit und Lesezugriffe', 'Mounting the drive: timing and reads');
  if (!mount) return {title, rows:[], note:pick('Kein abgeschlossenes PackedFS-Mountprofil verfügbar. Fehlende Werte bedeuten nicht 0 ms oder 0 Zugriffe.', 'No completed PackedFS mount profile is available. Missing values do not mean 0 ms or 0 reads.')};
  const duration = n => n === null ? pick('Nicht gemessen','Not measured') : `${n} ms`;
  const counter = n => `${mount.flags & 8 ? '≥ ' : ''}${n}`;
  const eligible = mount.cacheHits + mount.cacheMisses;
  const testProfile = info.schemaVersion === 5 ? mountTestProfilePresentation(info.mountProfile, locale) : null;
  const hitRate = (mount.flags & 4) && !(mount.flags & 8) && eligible > 0
    ? Intl.NumberFormat(de ? 'de-DE' : 'en-GB', {style:'percent', maximumFractionDigits:1}).format(mount.cacheHits / eligible)
    : null;
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
    ...(info.schemaVersion >= 4 ? [
      [pick('Seiten am Mount-Ende gefüllt / zugeteilt','Pages filled / allocated at end of mount'), `${mount.cacheSlotsFilled} / ${mount.cacheSlotsAllocated}`],
      ...(mount.cacheSlotsAllocated ? [[pick('Bytes pro temporärer Cache-Seite','Bytes per temporary cache page'), `${mount.cachePageBytes} B`]] : [])
    ] : []),
    ...(testProfile?.rows || []),
    ...(hitRate === null ? [] : [[pick('Treffer bei cachegeeigneten Zugriffen','Hit rate for cache-eligible reads'), hitRate]]),
  ], note:pick('Die Werte stammen vom letzten Einbinden von PackedFS. Die Abrufzeit ist kein Messzeitpunkt. Danach wird der temporäre Lesecache freigegeben. Die konfigurierte LittleFS-Cachegröße steht unter Speicher. Die Trefferquote berücksichtigt nur cachegeeignete Zugriffe.', 'Values come from the last PackedFS mount. Read time is not measurement time. The temporary read cache is released afterwards. See Storage for the configured LittleFS cache size. The hit rate covers cache-eligible reads only.') +
    (info.schemaVersion === 3 ? pick(' Dieser Bericht enthält keine Anzahl zugeteilter Cache-Seiten.', ' This report omits the number of allocated cache pages.') : '') +
    (mount.flags & 8 ? pick(' Gesättigte Zugriffszähler liefern nur Untergrenzen.', ' Saturated access counters supply lower bounds only.') : '') +
    (testProfile ? ' ' + testProfile.note : '')};
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
    ...(isStartupFirmware(firmwareVersion) ? {firmwareVersion} : {}),
    startup: info, phases: startupDiagnosticRows(info),
    limits: ['Excludes bootloader and early SDK startup.',
      'Software markers do not prove successful storage access or visible display output.',
      'A saved report is a dated observation, not a new device readback.',
      ...(info.schemaVersion >= 3 ? ['Mount profiling describes the last actual PackedFS mount, not the read timestamp; saturated counters are lower bounds.'] : []),
      ...(info.schemaVersion === 5 ? ['Test mount profile ticks use ticksPerSecond; the inclusive index pass overlaps flash and CRC timing. Instrumentation adds overhead and does not measure CPU time.'] : [])] };
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
  if (isStartupFirmware(report.firmwareVersion)) result.baselineVersion = report.firmwareVersion;
  if (before.schemaVersion >= 3 || after.schemaVersion >= 3) {
    const a = before.mount, b = after.mount;
    result.mount = [];
    if (a?.result === 0 && b?.result === 0) {
      // Timing validity and counter saturation are independent firmware flags.
      const fields = [];
      if (a.scanMilliseconds !== null && b.scanMilliseconds !== null) fields.push('scanMilliseconds');
      if (!((a.flags | b.flags) & 8)) fields.push('physicalReadAttempts', 'physicalReadBytes');
      result.mount = fields.map(id => ({id, before: a[id], after: b[id], delta: b[id] - a[id]}));
    }
  }
  return result;
}
// Keep only observed device values. A package's reference SourceID describes the
// download, and cannot fill a gap in an older device report.
function section(report, name) {
  const entry = report?.diagnosticSnapshot?.sections?.[name];
  return entry?.state === 'available' ? entry.data : null;
}
export function startupSeriesSample(report) {
  const power = report?.power ?? section(report, 'power');
  const drives = report?.drives ?? section(report, 'drives');
  const drive = Array.isArray(drives) ? drives.find(d => d?.label === 'E' && d.status === 0) : null;
  const build = section(report, 'build');
  const observed = report?.buildIdentity?.observed;
  const board = build?.board ?? observed?.compiledBoard;
  const source = build?.sourceId ?? observed?.sourceId;
  const sizeKnown = uint32(drive?.totalBytes) && drive.totalBytes > 0 &&
    uint32(drive.freeBytes) && drive.freeBytes <= drive.totalBytes;
  return {
    firmwareVersion: report?.firmwareVersion,
    startup: normalizeStartupDiagnostics(report?.startup ?? section(report, 'startup')),
    context: {
      board: ['LCD', 'OLED'].includes(board) ? board : null,
      source: typeof source === 'string' && /^[0-9a-f]{64}$/i.test(source) ? source.toLowerCase() : null,
      reset: power?.resetCaptured === true && uint32(power.resetReasonRaw) ? power.resetReasonRaw : null,
      // Compare both capacity and free space. Equal occupancy does not establish equal files.
      space: sizeKnown ? `${drive.freeBytes}/${drive.totalBytes}` : null
    }
  };
}

// Timings are cached for a whole boot. Conservatively reject identical complete
// marker sets (even if separate boots coincidentally produced the same values).
export function startupSeries(reports) {
  if (!Array.isArray(reports) || reports.length < 3 || reports.length > 20) return null;
  return summarizeStartupSamples(reports.map(startupSeriesSample));
}
export function summarizeStartupSamples(reports) {
  if (!Array.isArray(reports) || reports.length < 3 || reports.length > 20) return null;
  const seen = new Set(), storage = [], total = [], mounts = [], version = reports[0]?.firmwareVersion;
  if (!isStartupFirmware(version)) return null;
  for (const report of reports) {
    const s = report.startup;
    if (report?.firmwareVersion !== version || s?.phaseMask !== 63 || !s.elapsedMilliseconds[5]) return null;
    const key = s.elapsedMilliseconds.join(',');
    if (seen.has(key)) return null;
    seen.add(key); storage.push(s.elapsedMilliseconds[1]); total.push(s.elapsedMilliseconds[5]);
    if (s.mount?.result === 0 && s.mount.scanMilliseconds !== null && !(s.mount.flags & 8)) mounts.push(s.mount);
  }
  const stats = a => {
    a.sort((x,y) => x-y); const n=a.length;
    return {median:(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2,min:a[0],max:a[n-1]};
  };
  const mount = mounts.length === reports.length
    ? Object.fromEntries(['scanMilliseconds','physicalReadAttempts','physicalReadBytes','cacheHits','cacheMisses','bypassReads']
      .map(key => [key, stats(mounts.map(profile => profile[key]))]))
    : null;
  if (mount && mounts.every(profile => uint32(profile.cacheSlotsAllocated))) {
    for (const key of ['cacheSlotsAllocated','cacheSlotsFilled']) {
      mount[key] = stats(mounts.map(profile => profile[key]));
    }
  }
  const context = {};
  for (const key of ['board', 'source', 'reset', 'space']) {
    const known = reports.map(report => report.context[key]).filter(value => value !== null);
    context[key] = {values: [...new Set(known)], missing: reports.length - known.length};
  }
  return {version, count:reports.length, storage:stats(storage), total:stats(total), mount,
    context, markers:[...seen]};
}
export function startupSeriesComparison(a, b) {
  const metrics = ['total','storage','scanMilliseconds','physicalReadAttempts','physicalReadBytes',
    'cacheHits','cacheMisses','bypassReads','cacheSlotsAllocated','cacheSlotsFilled'].flatMap(key => {
    const before = a?.[key] ?? a?.mount?.[key] ?? null;
    const after = b?.[key] ?? b?.mount?.[key] ?? null;
    if (!before && !after) return [];
    return [{key, before, after, delta:before && after ? after.median - before.median : null}];
  });
  const notices = [];
  for (const key of ['board','source','reset','space']) {
    for (const [group, series] of [['A',a], ['B',b]]) {
      if (!series) continue;
      const field = series.context[key];
      if (field.values.length > 1) notices.push({kind:'mixed', group, key});
    }
    const left = a?.context[key].values ?? [], right = b?.context[key].values ?? [];
    if (left.length && right.length && (left.length !== right.length || left.some(value => !right.includes(value)))) {
      const expected = key === 'source' && a.version !== b.version && left.length === 1 && right.length === 1;
      notices.push({kind:expected ? 'differentBuild' : 'different', key});
    }
  }
  for (const [group, series] of [['A',a], ['B',b]]) {
    if (!series) continue;
    const keys = Object.keys(series.context).filter(key => series.context[key].missing > 0);
    if (keys.length) notices.push({kind:'missing', group, keys});
  }
  if (a && b && a.version === b.version && a.markers.some(marker => b.markers.includes(marker))) {
    notices.push({kind:'overlap'});
  }
  return {metrics, notices};
}
export function startupDiagnosticsText(locale = 'de_DE') {
  return locale.startsWith('de') ? {
    title: 'Startzeiten der Anwendung', read: 'Startzeiten lesen', export: 'Startbericht speichern',
    storageIntervals: 'Zeitanteile der Speicherinitialisierung',
    intervals: {mountDone: 'Bis das Laufwerk eingebunden ist', journalDone: 'Prüfen und Wiederherstellen des Speicherjournals', storageRemaining: 'Übrige Speicherinitialisierung'},
    baseline:'Früheren Startbericht vergleichen', baselineHint:'Wähle einen früheren Start- oder Gesamtbericht. Vergleiche für einen Geschwindigkeitstest mehrere Starts am selben Gerät mit derselben Sammlung. Die Differenz ist aktuell minus früher.',
    mountComparison:'Letztes Einbinden von PackedFS', previous:'Früher', current:'Aktuell',
    comparisonMetric:{scanMilliseconds:'Scanzeit',physicalReadAttempts:'Physische Leseversuche',physicalReadBytes:'Gelesene Bytes'},
    mountLimits:'Für den Vergleich müssen beide Einbindungen erfolgreich sein. Die Scanzeit setzt zwei Zeitmessungen voraus, die Lesezahlen zwei ungesättigte Zählerstände.',
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
    baseline:'Compare a previous startup report', baselineHint:'Choose a previous startup or full report. To compare speed, measure several starts on the same device with the same collection. The difference is current minus previous.',
    mountComparison:'Last PackedFS mount', previous:'Previous', current:'Current',
    comparisonMetric:{scanMilliseconds:'Scan time',physicalReadAttempts:'Physical read attempts',physicalReadBytes:'Bytes read'},
    mountLimits:'Both mounts must succeed for comparison. Scan time needs two timing measurements. Read counts and bytes need two unsaturated counter readings.',
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
