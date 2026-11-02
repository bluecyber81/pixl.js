import { joinDevicePath } from './browser-tools.js';
import { metadataFigureId, inspectTagStructure, TAG_LENGTHS } from './figure-info.js';

export const SEARCH_LIMITS = Object.freeze({ entries: 8192, folders: 1024, depth: 32, results: 500 });
export const SEARCH_CONTENT_LIMITS = Object.freeze({ files: 128, bytes: 256 * 1024 });
const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const aborted = () => Object.assign(new Error('Search cancelled'), { name: 'AbortError' });

// Metadata is the default. An explicit opt-in can resolve missing IDs from a
// bounded number of small BINs. Reads are serial; file bytes are never cached
// in progress, results or a device-independent catalogue.
export async function searchDevice({ rootPath, query, recursive = true, readDirectory,
  catalogue = [], signal, assertSession = () => {}, onProgress = () => {}, limits = SEARCH_LIMITS,
  inspectMissingIds = false, readFile, contentLimits = SEARCH_CONTENT_LIMITS }) {
  if (!/^[IE]:\/(?:[^/]+(?:\/[^/]+)*)?$/.test(rootPath) || rootPath.includes('\\') || rootPath.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid search root');
  const bounds = Object.fromEntries(Object.entries(SEARCH_LIMITS).map(([key, max]) => {
    const requested = limits[key] ?? max;
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > max) throw new Error('Invalid search limit');
    return [key, requested];
  }));
  const tokens = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || String(query).length > 200) throw new Error('Invalid search query');
  if (typeof inspectMissingIds !== 'boolean' || inspectMissingIds && typeof readFile !== 'function') throw new Error('Invalid content search reader');
  const contentBounds = Object.fromEntries(Object.entries(SEARCH_CONTENT_LIMITS).map(([key, max]) => {
    const requested = contentLimits[key] ?? max;
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > max) throw new Error('Invalid content search limit');
    return [key, requested];
  }));
  const index = new Map(catalogue.map(entry => [entry.id, entry]));
  const pending = [{ path: rootPath, depth: 0 }], seen = new Set([rootPath]), processed = new Set();
  const results = [], stats = { entries: 0, folders: 0, matches: 0, skipped: 0, limited: false, complete: false,
    filesRead: 0, bytesRead: 0, contentLimited: false, invalidFiles: 0 };
  const check = () => { if (signal?.aborted) throw aborted(); assertSession(); };
  const progress = () => onProgress({ ...stats }, results.slice());
  while (pending.length) {
    check();
    if (stats.folders >= bounds.folders || stats.entries >= bounds.entries || results.length >= bounds.results) { stats.limited = true; break; }
    const current = pending.shift();
    const entries = await readDirectory(current.path);
    check();
    if (!Array.isArray(entries)) throw new Error('Invalid directory listing');
    ++stats.folders;
    for (let i = 0; i < entries.length; ++i) {
      check();
      if (stats.entries >= bounds.entries || results.length >= bounds.results) { stats.limited = true; break; }
      const entry = entries[i];
      ++stats.entries;
      let path;
      try {
        if (!entry || ![0, 1].includes(entry.type)) throw new Error('Invalid entry');
        path = joinDevicePath(current.path, entry.name);
      } catch { ++stats.skipped; continue; }
      if (processed.has(path)) { ++stats.skipped; continue; }
      processed.add(path);
      const validMetadata = entry.meta?.valid !== false;
      let id = validMetadata ? metadataFigureId(entry.meta?.amiibo) : null;
      let figure = id ? index.get(id) : null;
      let fileRead = false;
      const searchable = () => fold([entry.name, validMetadata ? entry.meta?.notes : '', id,
        figure?.name, figure?.series, figure?.game].join(' '));
      let haystack = searchable();
      if (inspectMissingIds && !id && entry.type === 0 && /\.bin$/iu.test(entry.name) && TAG_LENGTHS.includes(entry.size) &&
          !tokens.every(token => haystack.includes(token))) {
        if (stats.filesRead >= contentBounds.files || stats.bytesRead + entry.size > contentBounds.bytes) {
          stats.contentLimited = true; stats.limited = true;
        } else {
          check();
          const data = await readFile(path, { maxBytes: entry.size });
          check();
          const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
          if (!bytes || bytes.byteLength !== entry.size) throw new Error('Search file size changed');
          ++stats.filesRead; stats.bytesRead += entry.size; fileRead = true;
          const inspected = inspectTagStructure(bytes);
          if (inspected.status === 'structure-consistent') {
            id = inspected.id; figure = index.get(id); haystack = searchable();
          } else { ++stats.invalidFiles; ++stats.skipped; }
        }
      }
      if (tokens.every(token => haystack.includes(token))) {
        results.push({ path, parent: current.path, name: entry.name, type: entry.type,
          id, figureName: figure?.name || '', series: figure?.series || '' });
        stats.matches = results.length;
      }
      if (fileRead) progress();
      if (recursive && entry.type === 1 && !seen.has(path)) {
        if (current.depth >= bounds.depth || seen.size >= bounds.folders) stats.limited = true;
        else { seen.add(path); pending.push({ path, depth: current.depth + 1 }); }
      }
    }
    progress();
  }
  check();
  stats.complete = !stats.limited && !stats.skipped;
  progress();
  return { results, ...stats };
}
