import { figureId } from './figure-info.js';
import { FigureTransferError, figureSourceUrl } from './figure-transfer.js';

export const FIGURE_DOWNLOAD_LINK_CHANGED = 'allmiibo-figure-download-link-changed';
const PREFIX = 'allmiibo.figure-download.';
const SNAPSHOT = 'allmiibo.figure-links.v1';
const FORMAT = 'allmiibo.figure-links';
export const LINK_FILE_LIMIT = 2 * 1024 * 1024;
const MAX_LINKS = 4096;
const fail = code => { throw new FigureTransferError(code, code); };
export function figureDownloadLinkKey(id) {
  const canonicalId = figureId(id);
  return canonicalId ? PREFIX + canonicalId : null;
}

function normalizedUrl(value) {
  return figureSourceUrl(value).href;
}

function envelope(links) {
  const entries = Array.from(links, ([id, url]) => ({ id, url })).sort((a,b) => a.id.localeCompare(b.id, 'en'));
  return { format: FORMAT, version: 1, count: entries.length, links: entries };
}

function serialize(links) {
  if (links.size > MAX_LINKS) fail('FIGURE_LINK_LIMIT');
  const text = JSON.stringify(envelope(links));
  if (new TextEncoder().encode(text).length > LINK_FILE_LIMIT) fail('FIGURE_LINK_LIMIT');
  return text;
}

function parse(text) {
  if (typeof text !== 'string' || text.length > LINK_FILE_LIMIT || new TextEncoder().encode(text).length > LINK_FILE_LIMIT) fail('FIGURE_LINK_LIMIT');
  let doc;
  try { doc = JSON.parse(text); } catch { fail('FIGURE_LINK_FORMAT'); }
  if (doc?.format !== FORMAT || doc.version !== 1 || !Array.isArray(doc.links) || doc.links.length !== doc.count) fail('FIGURE_LINK_FORMAT');
  if (doc.count > MAX_LINKS) fail('FIGURE_LINK_LIMIT');
  return doc.links;
}

function listStored(storage) {
  // One atomic snapshot becomes authoritative after the first bulk import.
  // Earlier versions used independent keys. Keep those readable until migration succeeds.
  const raw = storage.getItem(SNAPSHOT);
  const links = new Map();
  if (raw !== null) {
    for (const item of parse(raw)) {
      const id = figureId(item?.id);
      if (!id || links.has(id)) fail('FIGURE_LINK_FORMAT');
      links.set(id, normalizedUrl(item.url));
    }
  } else {
    for (let i=0; i<storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const id = figureId(key.slice(PREFIX.length));
      if (id && key === PREFIX + id) links.set(id, normalizedUrl(storage.getItem(key)));
    }
  }
  return links;
}

function withStorage(work) {
  try { return work(window.localStorage); }
  catch (error) {
    if (error instanceof FigureTransferError) throw error;
    fail('FIGURE_STORAGE');
  }
}

function notify(id) {
  window.dispatchEvent?.(new CustomEvent(FIGURE_DOWNLOAD_LINK_CHANGED, { detail: id }));
}

// All UI writers, including single-link edits, use the same origin-wide lock where available.
export function withFigureLinkLock(work) {
  const locks = globalThis.window?.navigator?.locks;
  return locks ? locks.request(SNAPSHOT, work) : Promise.resolve().then(work);
}

let cachedRaw, cachedSnapshot;
export function readFigureDownloadLink(id) {
  const key = figureDownloadLinkKey(id);
  if (!key) return '';
  try {
    const storage = window.localStorage;
    const raw = storage.getItem(SNAPSHOT);
    if (raw !== null) {
      if (raw !== cachedRaw) {
        cachedSnapshot = listStored(storage);
        cachedRaw = raw;
      }
      return cachedSnapshot.get(figureId(id)) || '';
    }
    const url = storage.getItem(key);
    return url ? normalizedUrl(url) : '';
  } catch { return ''; }
}

export function writeFigureDownloadLink(id, value) {
  const key = figureDownloadLinkKey(id);
  if (!key) fail('FIGURE_ID');
  const url = value === '' ? '' : normalizedUrl(value);
  withStorage(storage => {
    if (storage.getItem(SNAPSHOT) !== null) {
      const links = listStored(storage);
      if (url) links.set(figureId(id), url); else links.delete(figureId(id));
      storage.setItem(SNAPSHOT, serialize(links));
    } else if (url) storage.setItem(key, url);
    else storage.removeItem(key);
  });
  notify(figureId(id));
  return url;
}

export function exportFigureLinks() {
  return withStorage(storage => serialize(listStored(storage)));
}

export function previewFigureLinks(text) {
  const imported = parse(text);
  const current = withStorage(listStored);
  const seen = new Set(), duplicates = new Set();
  for (const item of imported) {
    const id = figureId(item?.id);
    if (id && seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  const counts = { added: 0, same: 0, changed: 0, invalid: 0, conflict: 0 };
  const rows = imported.map(item => {
    const id = figureId(item?.id);
    const previous = current.get(id) || '';
    let url = '', state;
    try { url = normalizedUrl(item?.url); } catch { /* reported as invalid */ }
    if (!id || !url) state = 'invalid';
    else if (duplicates.has(id)) state = 'conflict';
    else if (!previous) state = 'added';
    else state = previous === url ? 'same' : 'changed';
    counts[state]++;
    return { id, previous, url, state };
  });
  return { text, rows, counts, valid: !counts.invalid && !counts.conflict };
}

export async function importFigureLinks(preview, mode) {
  if (!['add', 'replace'].includes(mode) || !preview?.valid) fail('FIGURE_LINK_FORMAT');
  return withFigureLinkLock(() => {
    const fresh = previewFigureLinks(preview.text);
    if (!fresh.valid || JSON.stringify(fresh.rows) !== JSON.stringify(preview.rows)) fail('FIGURE_LINK_STALE');
    const changes = fresh.rows.filter(row => row.state === 'added' || (row.state === 'changed' && mode === 'replace'));
    if (!changes.length) return 0;
    withStorage(storage => {
      const links = listStored(storage);
      const legacyIds = storage.getItem(SNAPSHOT) === null ? [...links.keys()] : [];
      for (const row of changes) links.set(row.id, row.url);
      // Web Storage publishes a single value. A quota failure leaves the previous keys/snapshot intact.
      storage.setItem(SNAPSHOT, serialize(links));
      // The complete snapshot is already authoritative. Remove superseded copies of private URLs.
      for (const id of legacyIds) {
        try { storage.removeItem(figureDownloadLinkKey(id)); } catch { break; }
      }
    });
    notify(null);
    return changes.length;
  });
}

const observersByWindow = new WeakMap();
export function observeFigureDownloadLink(selectedId, refresh) {
  const target = globalThis.window;
  if (!target?.addEventListener) return () => {};
  let group = observersByWindow.get(target);
  if (!group) {
    const observers = new Set();
    const dispatch = event => { for (const observer of observers) observer(event); };
    group = { observers, dispatch };
    observersByWindow.set(target, group);
    target.addEventListener('storage', dispatch);
    target.addEventListener(FIGURE_DOWNLOAD_LINK_CHANGED, dispatch);
  }
  function onChange(event) {
    const key = figureDownloadLinkKey(selectedId());
    if (!key) return;
    if (event.type === 'storage') {
      if (event.key === null || event.key === SNAPSHOT || event.key === key) refresh();
    } else if (event.detail === null || figureDownloadLinkKey(event.detail) === key) refresh();
  }
  group.observers.add(onChange);
  return () => {
    if (!group.observers.delete(onChange) || group.observers.size) return;
    target.removeEventListener('storage', group.dispatch);
    target.removeEventListener(FIGURE_DOWNLOAD_LINK_CHANGED, group.dispatch);
    observersByWindow.delete(target);
  };
}
