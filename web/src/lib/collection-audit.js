import bundledCatalogue from '../data/catalogue.json' with { type: 'json' };
import { assertDevicePath, joinDevicePath } from './portable-names.js';
import { figureId, metadataFigureId, inspectTagStructure, TAG_LENGTHS } from './figure-info.js';

export const COLLECTION_AUDIT_LIMITS = Object.freeze({
  entries: 8192, folders: 1024, depth: 32, candidates: 8192, bytes: 16 * 1024 * 1024,
});
const encoder = new TextEncoder();
const formats = Object.freeze({ 532: 'classic-without-final-eight-bytes', 540: 'classic-540',
  572: 'classic-with-unverified-extra-bytes', 2048: 'two-kib-layout-not-fully-validated' });
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const text = value => typeof value === 'string' ? value.slice(0, 300) : '';
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
function catalogueSnapshot(input, today) {
  const entries = Array.isArray(input) ? input : input?.entries;
  if (!Array.isArray(entries) || !entries.length || entries.length > 8192) throw new TypeError('Invalid audit catalogue');
  const seen = new Set();
  const rows = entries.map(entry => {
    const id = figureId(entry?.id);
    if (!id || seen.has(id)) throw new TypeError('Invalid or duplicate catalogue ID');
    seen.add(id);
    const dates = Object.values(entry.release || {}).filter(day).sort();
    return Object.freeze({ id, name: text(entry.name), series: text(entry.series),
      releaseDate: dates[0] || null, releaseState: !dates.length ? 'unknown' : dates[0] > today ? 'upcoming' : 'listed' });
  });
  return freeze({ entries: rows, checkedDate: day(input?.checkedDate) ? input.checkedDate : null,
    commit: typeof input?.commit === 'string' && /^[a-f0-9]{40}$/.test(input.commit) ? input.commit : null });
}
// Detached snapshot: neither a caller nor a scan can modify the bundled fallback.
export const COLLECTION_AUDIT_CATALOGUE = freeze({ checkedDate: bundledCatalogue.checkedDate,
  commit: bundledCatalogue.commit, entries: bundledCatalogue.entries.map(entry => ({
    id: entry.id, name: entry.name, series: entry.series, release: { ...entry.release },
  })) });

/**
 * Read-only, serial and bounded. The caller owns one BLE session for the entire
 * operation; adapters must enforce maxBytes and close/drain reads before settling.
 * A content scan reads every supported-length BIN even when metadata has an ID.
 * It proves only observed public IDs and limited structure, never cryptographic
 * authenticity, NFC operation, owner/game data or byte identity between duplicates.
 * Cancel/session/read failures return an explicitly partial report, with no next IO.
 */
export async function auditCollection({ rootPath = 'E:/', catalogue = COLLECTION_AUDIT_CATALOGUE, mode = 'full',
  today = new Date().toISOString().slice(0, 10), readDirectory, readFile,
  signal, assertSession, onProgress = () => {}, limits = {} } = {}) {
  assertDevicePath(rootPath);
  if (!/^[IE]:\//.test(rootPath) || !['full', 'quick'].includes(mode) || !day(today) ||
      typeof readDirectory !== 'function' || typeof assertSession !== 'function' ||
      mode === 'full' && typeof readFile !== 'function' || typeof onProgress !== 'function') throw new TypeError('Invalid collection audit options');
  const bounds = Object.fromEntries(Object.entries(COLLECTION_AUDIT_LIMITS).map(([key, max]) => {
    const value = limits?.[key] ?? max;
    if (!Number.isSafeInteger(value) || value < (key === 'depth' ? 0 : 1) || value > max) throw new TypeError('Invalid collection audit limit');
    return [key, value];
  }));
  // Copy public fields before the first await; a changing caller catalogue cannot
  // change the meaning of a report while files are being read.
  const snapshot = catalogueSnapshot(catalogue, today);
  const index = new Map(snapshot.entries.map(entry => [entry.id, entry]));
  const stats = { entries: 0, folders: 0, files: 0, candidates: 0, filesRead: 0, bytesRead: 0,
    readAttempts: 0, bytesReserved: 0, ignoredFiles: 0, unsupportedFiles: 0, invalidFiles: 0,
    readErrors: 0, invalidEntries: 0, metadataMismatches: 0, candidateMetadataCount: 0, metadataMissing: 0 };
  const files = [], errors = [], limitsReached = new Set(), pending = [{ path: rootPath, depth: 0 }];
  const scheduled = new Set([rootPath]), seen = new Set(), observed = new Map(), confirmed = new Map();
  let status = 'complete', cursor = 0, traversalDone = false;
  const stop = reason => { const error = new Error(reason); error.auditStop = reason; throw error; };
  const check = () => {
    if (signal?.aborted) stop('cancelled');
    try { assertSession(); } catch { stop('session-changed'); }
  };
  const progress = phase => { try { onProgress({ phase, mode, ...stats, limited: !!limitsReached.size }); } catch { /* observer only */ } };
  const addId = (map, id, row) => { if (id) { if (!map.has(id)) map.set(id, []); map.get(id).push(row); } };
  const limit = key => { limitsReached.add(key); };
  try {
    while (cursor < pending.length) {
      check();
      if (stats.folders >= bounds.folders) { limit('folders'); break; }
      const current = pending[cursor++];
      let entries;
      try { entries = await readDirectory(current.path); } catch {
        check(); stats.readErrors++; errors.push({ path: current.path, code: 'directory-read-failed' }); stop('partial');
      }
      check();
      if (!Array.isArray(entries) || entries.length > bounds.entries) {
        stats.invalidEntries++; errors.push({ path: current.path, code: 'invalid-directory-response' }); stop('partial');
      }
      ++stats.folders;
      for (const entry of entries) {
        check();
        if (stats.entries >= bounds.entries) { limit('entries'); break; }
        ++stats.entries;
        let path;
        try {
          if (!entry || ![0, 1].includes(entry.type) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 0xffffffff) throw new Error();
          path = joinDevicePath(current.path, entry.name);
          if (encoder.encode(entry.name).length > 47 || seen.has(path)) throw new Error();
        } catch { stats.invalidEntries++; errors.push({ path: current.path, code: 'invalid-or-duplicate-entry' }); continue; }
        seen.add(path);
        if (entry.type === 1) {
          if (current.depth >= bounds.depth) limit('depth');
          else if (scheduled.size >= bounds.folders) limit('folders');
          else { scheduled.add(path); pending.push({ path, depth: current.depth + 1 }); }
          continue;
        }
        ++stats.files;
        // These two exact E: configuration/key files are not figure dumps. Never
        // read key material even if a malformed listing claims a tag-sized length.
        if (!/\.bin$/iu.test(entry.name) || path === 'E:/settings.bin' || path === 'E:/key_retail.bin') { ++stats.ignoredFiles; continue; }
        if (stats.candidates >= bounds.candidates) { limit('candidates'); continue; }
        ++stats.candidates;
        const metadataId = entry.meta?.valid === true ? metadataFigureId(entry.meta.amiibo) : null;
        if (metadataId) ++stats.candidateMetadataCount;
        else ++stats.metadataMissing;
        const row = { path, size: entry.size, id: null, metadataId, idSource: mode === 'quick' ? 'metadata' : 'content',
          status: 'not-read', formatContext: formats[entry.size] || 'unsupported-length', known: false, issues: [] };
        files.push(row);
        if (mode === 'quick') {
          row.id = metadataId; row.status = 'metadata-only'; row.known = index.has(row.id);
          if (!TAG_LENGTHS.includes(row.size)) { row.issues.push('unsupported-length'); ++stats.unsupportedFiles; }
          addId(observed, row.id, row); progress('scanning'); continue;
        }
        if (!TAG_LENGTHS.includes(row.size)) {
          row.status = 'unsupported-length'; row.issues.push('unsupported-length'); ++stats.unsupportedFiles;
          continue; // Unknown formats are not labelled corrupt and are never read.
        }
        if (stats.bytesReserved + row.size > bounds.bytes) { limit('bytes'); row.status = 'not-read-limit'; continue; }
        check(); ++stats.readAttempts; stats.bytesReserved += row.size;
        try {
          // No file bytes are retained outside this iteration or emitted to observers.
          const data = await readFile(path, { maxBytes: row.size });
          check();
          const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
          if (!bytes || bytes.byteLength !== row.size) {
            row.status = 'read-size-mismatch'; row.issues.push('read-size-mismatch');
            ++stats.readErrors; errors.push({ path, code: 'read-size-mismatch' }); stop('partial');
          }
          ++stats.filesRead; stats.bytesRead += bytes.byteLength;
          const inspection = inspectTagStructure(bytes);
          row.id = inspection.id; row.status = inspection.status; row.issues = [...inspection.issues];
          row.known = index.has(row.id);
          if (row.status !== 'structure-consistent') ++stats.invalidFiles;
          addId(observed, row.id, row);
          if (row.status === 'structure-consistent') addId(confirmed, row.id, row);
          if (metadataId && row.id && metadataId !== row.id) ++stats.metadataMismatches;
        } catch (error) {
          if (error.auditStop) throw error;
          check(); row.status = 'read-failed'; row.issues = ['read-failed']; ++stats.readErrors;
          errors.push({ path, code: 'file-read-failed' }); stop('partial');
        }
        progress('scanning');
      }
      progress('scanning');
      if (limitsReached.has('entries')) break;
    }
    check(); traversalDone = cursor === pending.length;
  } catch (error) {
    if (!error.auditStop) throw error;
    status = error.auditStop;
  }
  const scanComplete = traversalDone && !limitsReached.size && !stats.readErrors && !stats.invalidEntries;
  const contentComplete = mode === 'full' && scanComplete;
  const complete = scanComplete && (mode === 'quick' || contentComplete);
  if (status === 'complete' && !complete) status = 'partial';
  const presence = mode === 'full' ? confirmed : observed;
  const catalogueRow = entry => ({ ...entry, paths: (presence.get(entry.id) || []).map(row => row.path),
    contentConfirmed: mode === 'full' && confirmed.has(entry.id) });
  const present = snapshot.entries.filter(entry => presence.has(entry.id)).map(catalogueRow);
  const notObserved = snapshot.entries.filter(entry => !presence.has(entry.id) && entry.releaseState !== 'upcoming').map(entry => ({
    ...catalogueRow(entry), state: contentComplete ? 'no-structurally-consistent-file-observed' : 'not-observed-unconfirmed',
  }));
  // A completed directory listing cannot establish absence when properties do
  // not identify the files. Interrupted content scans have the same limitation.
  const missing = contentComplete ? notObserved : [];
  const unconfirmed = contentComplete ? [] : notObserved;
  const grouped = ([id, rows]) => ({ id, paths: rows.map(row => row.path),
    consistentFiles: mode === 'full' ? rows.filter(row => row.status === 'structure-consistent').length : 0 });
  const report = { schema: 1, mode, rootPath, today, status, complete, scanComplete, contentComplete,
    contentConfirmed: contentComplete, cancelled: status === 'cancelled', sessionChanged: status === 'session-changed',
    catalogue: { entries: snapshot.entries.length, checkedDate: snapshot.checkedDate, commit: snapshot.commit,
      scope: 'provided-catalogue-snapshot', releaseRule: 'earliest-known-regional-date' },
    stats: { ...stats, observedIds: observed.size, consistentIds: confirmed.size, presentIds: present.length },
    unknownIdFileCount: files.filter(row => !row.id).length,
    files, present, missing, unconfirmed, upcoming: snapshot.entries.filter(entry => entry.releaseState === 'upcoming').map(catalogueRow),
    unknown: [...observed].filter(([id]) => !index.has(id)).map(grouped),
    duplicates: [...observed].filter(([, rows]) => rows.length > 1).map(grouped),
    metadataMismatches: files.filter(row => mode === 'full' && row.id && row.metadataId && row.id !== row.metadataId)
      .map(row => ({ path: row.path, metadataId: row.metadataId, contentId: row.id })),
    errors, limitsReached: [...limitsReached], limits: bounds,
    claims: { cryptography: 'not-checked', ownerAndGameData: 'not-checked', nfcOperation: 'not-checked',
      duplicateBytes: 'not-compared', allFilesComplete: 'not-established',
      catalogueCompleteness: 'snapshot-only', fileScope: 'BIN files except exact E:/settings.bin and E:/key_retail.bin',
      unsupportedLengths: 'not-read-not-classified-as-corrupt', twoKiB: 'public-id-only-no-classic-header-guarantee',
      missingMeaning: 'No matching structurally consistent file observed in this scan; not proof of worldwide completeness or absence in unsupported files.',
      consistency: 'Session-bound point-in-time reads; no whole-device atomic snapshot or second directory pass.' } };
  progress('finished');
  return freeze(report);
}
