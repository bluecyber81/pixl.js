// Public metadata only. Neither a source commit nor a content hash proves
// authenticity, ownership, device-file presence, NFC support, or release status.
import { parseUniqueJson } from './unique-json.js';

export const CATALOGUE_UPDATE_SOURCE = Object.freeze({
  repository: 'https://github.com/8bitDream/AmiiboAPI',
  branch: 'master',
  refUrl: 'https://api.github.com/repos/8bitDream/AmiiboAPI/git/ref/heads/master',
});
export const CATALOGUE_UPDATE_LIMITS = Object.freeze({
  bytes: 2 * 1024 * 1024, refBytes: 64 * 1024,
  entries: 4096, mergedEntries: 8192, textLength: 160,
  timeoutMs: 25000, chunks: 16384,
});
const REGIONS = ['au', 'na', 'eu', 'jp'];
const FIELDS = ['name', 'series', 'game', 'type'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export class CatalogueUpdateError extends Error {
  constructor(code, message) { super(message); this.name = 'CatalogueUpdateError'; this.code = code; }
}
const fail = (code, message) => { throw new CatalogueUpdateError(code, message); };
const invalid = () => fail('invalid-data', 'Die Onlinequelle enthält ungültige oder unerwartete Katalogdaten.');
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  return value;
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > CATALOGUE_UPDATE_LIMITS.textLength ||
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value) ||
      /[\ud800-\udfff]/u.test(value.replace(/[\ud800-\udbff][\udc00-\udfff]/gu, ''))) invalid();
  return value;
}
function dates(value) {
  record(value);
  const result = {};
  for (const region of REGIONS) {
    if (!own(value, region)) invalid();
    const date = value[region];
    if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
        !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) invalid();
    result[region] = date;
  }
  return result;
}
function names(value, pattern) {
  record(value);
  const pairs = Object.entries(value);
  if (!pairs.length || pairs.length > CATALOGUE_UPDATE_LIMITS.entries) invalid();
  const result = new Map();
  for (const [key, name] of pairs) {
    if (!pattern.test(key)) invalid();
    result.set(key, text(name));
  }
  return result;
}
const sortEntries = entries => entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function cleanEntries(value, maximum = CATALOGUE_UPDATE_LIMITS.mergedEntries) {
  const entries = Array.isArray(value) ? value : record(value).entries;
  if (!Array.isArray(entries) || entries.length > maximum) invalid();
  const ids = new Set();
  return entries.map(entry => {
    record(entry);
    if (typeof entry.id !== 'string' || !/^[0-9a-f]{16}$/u.test(entry.id) || ids.has(entry.id)) invalid();
    ids.add(entry.id);
    const result = { id: entry.id };
    for (const field of FIELDS) result[field] = text(entry[field]);
    result.release = dates(entry.release);
    result.firmwareIdKnown = entry.firmwareIdKnown === true;
    return result;
  });
}

/** Normalize database/amiibo.json, not the REST API or machine/vehicle records.
 * Extra fields (including image/download URLs) are deliberately not propagated. */
export function normalizeCatalogueSource(payload) {
  record(payload); record(payload.amiibos);
  const pairs = Object.entries(payload.amiibos);
  if (!pairs.length || pairs.length > CATALOGUE_UPDATE_LIMITS.entries) invalid();
  const series = names(payload.amiibo_series, /^0x[0-9a-f]{2}$/u);
  const games = names(payload.game_series, /^0x[0-9a-f]{3}$/u);
  const types = names(payload.types, /^0x[0-9a-f]{2}$/u);
  return sortEntries(pairs.map(([key, entry]) => {
    if (!/^0x[0-9a-f]{16}$/u.test(key)) invalid();
    record(entry);
    const id = key.slice(2);
    return { id, name: text(entry.name),
      series: text(series.get(`0x${id.slice(12, 14)}`)),
      game: text(games.get(`0x${id.slice(0, 3)}`)),
      type: text(types.get(`0x${id.slice(6, 8)}`)),
      release: dates(entry.release), firmwareIdKnown: false };
  }));
}

/** No device inventory is accepted here: absentFromSource is a catalogue diff. */
export function compareCatalogueEntries(baseline, remote) {
  const before = cleanEntries(baseline), after = cleanEntries(remote, CATALOGUE_UPDATE_LIMITS.entries);
  const old = new Map(before.map(entry => [entry.id, entry]));
  const current = new Set(after.map(entry => entry.id));
  const added = [], changed = [];
  for (const entry of after) {
    // Never trust a source-provided firmware support claim.
    entry.firmwareIdKnown = old.get(entry.id)?.firmwareIdKnown === true;
    const previous = old.get(entry.id);
    if (!previous) { added.push(entry); continue; }
    const fields = FIELDS.filter(field => previous[field] !== entry[field]);
    for (const region of REGIONS) if (previous.release[region] !== entry.release[region]) fields.push(`release.${region}`);
    if (fields.length) changed.push({ id: entry.id, before: previous, after: entry, fields });
  }
  return { added: sortEntries(added), changed: sortEntries(changed),
    absentFromSource: sortEntries(before.filter(entry => !current.has(entry.id))),
    counts: { baseline: before.length, source: after.length, added: added.length,
      changed: changed.length, absentFromSource: before.filter(entry => !current.has(entry.id)).length,
      merged: before.length + added.length } };
}

/** Keep every old ID; update only metadata; firmware knowledge is local. */
export function mergeCatalogueEntries(baseline, remote) {
  const before = cleanEntries(baseline), after = cleanEntries(remote, CATALOGUE_UPDATE_LIMITS.entries);
  const merged = new Map(before.map(entry => [entry.id, entry]));
  for (const entry of after) {
    entry.firmwareIdKnown = merged.get(entry.id)?.firmwareIdKnown === true;
    merged.set(entry.id, entry);
  }
  if (merged.size > CATALOGUE_UPDATE_LIMITS.mergedEntries) invalid();
  return sortEntries([...merged.values()]);
}

function abortError() { return new DOMException('Onlineprüfung abgebrochen.', 'AbortError'); }
function check(signal) { if (signal.aborted) throw signal.reason; }
function waitFor(promise, signal) {
  check(signal);
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason); else resolve(value);
    }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
function cancelBody(body) {
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* already locked/closed */ }
}
async function fetchBytes(url, maxBytes, fetchImpl, signal) {
  check(signal);
  const pending = Promise.resolve(fetchImpl(url, { signal, mode: 'cors', credentials: 'omit',
    redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' }));
  // Also release a late response from an implementation that ignored abort.
  pending.then(response => { if (signal.aborted) cancelBody(response?.body); }, () => {});
  const response = await waitFor(pending, signal);
  let reader, done = false;
  try {
    if (!response || response.redirected || (response.url && response.url !== url) ||
        ['opaque', 'opaqueredirect'].includes(response.type)) fail('source-redirect', 'Die Katalogquelle wurde unerwartet umgeleitet.');
    if (!response.ok || response.status !== 200) {
      if (response.status === 429 || response.status === 403) fail('rate-limit', 'GitHub begrenzt die Abfragen. Bitte später erneut versuchen.');
      fail('http', `Die Katalogquelle ist nicht erreichbar (HTTP ${Number(response.status) || 0}).`);
    }
    const contentType = response.headers?.get('content-type') || '';
    if (contentType && !/^(?:application\/json|text\/plain)(?:\s*;|$)/iu.test(contentType)) invalid();
    const length = response.headers?.get('content-length');
    if (length !== null && length !== undefined && (!/^\d+$/u.test(length) || Number(length) > maxBytes))
      fail('too-large', 'Die Katalogantwort überschreitet die erlaubte Größe.');
    if (!response.body?.getReader) fail('unsupported-browser', 'Dieser Browser unterstützt das begrenzte Lesen der Onlinequelle nicht.');
    reader = response.body.getReader();
    const buffer = new Uint8Array(maxBytes);
    let size = 0, chunks = 0;
    while (true) {
      const part = await waitFor(reader.read(), signal);
      check(signal);
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || ++chunks > CATALOGUE_UPDATE_LIMITS.chunks || size + part.value.length > maxBytes)
        fail('too-large', 'Die Katalogantwort überschreitet die erlaubte Größe.');
      buffer.set(part.value, size); size += part.value.length;
    }
    return buffer.slice(0, size);
  } finally {
    if (!done) cancelBody(reader || response?.body);
    try { reader?.releaseLock(); } catch { /* pending aborted read */ }
  }
}
function decode(bytes) {
  try { return parseUniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { invalid(); }
}

/** User-triggered only. Fetches a branch ref, then immutable metadata at that
 * commit. No polling, storage, images, tag dumps, or Bluetooth operations. */
export async function checkCatalogueUpdates({ baseline, signal, fetchImpl = globalThis.fetch,
  timeoutMs = CATALOGUE_UPDATE_LIMITS.timeoutMs, cryptoImpl = globalThis.crypto } = {}) {
  const before = cleanEntries(baseline);
  if (signal?.aborted) throw abortError();
  if (typeof fetchImpl !== 'function' || typeof cryptoImpl?.subtle?.digest !== 'function')
    fail('unsupported-browser', 'Für die Onlineprüfung wird ein moderner Browser mit HTTPS benötigt.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > CATALOGUE_UPDATE_LIMITS.timeoutMs)
    fail('invalid-options', 'Ungültiges Zeitlimit für die Onlineprüfung.');
  const controller = new AbortController();
  const stop = () => controller.abort(abortError());
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => controller.abort(new CatalogueUpdateError('timeout',
    'Die Onlineprüfung dauert zu lange. Bitte später erneut versuchen.')), timeoutMs);
  try {
    const ref = decode(await fetchBytes(CATALOGUE_UPDATE_SOURCE.refUrl, CATALOGUE_UPDATE_LIMITS.refBytes, fetchImpl, controller.signal));
    record(ref); record(ref.object);
    if (ref.ref !== 'refs/heads/master' || ref.object.type !== 'commit' ||
        typeof ref.object.sha !== 'string' || !/^[0-9a-f]{40}$/u.test(ref.object.sha)) invalid();
    const commit = ref.object.sha;
    const url = `https://raw.githubusercontent.com/8bitDream/AmiiboAPI/${commit}/database/amiibo.json`;
    const bytes = await fetchBytes(url, CATALOGUE_UPDATE_LIMITS.bytes, fetchImpl, controller.signal);
    const remote = normalizeCatalogueSource(decode(bytes));
    check(controller.signal);
    const digest = await waitFor(cryptoImpl.subtle.digest('SHA-256', bytes), controller.signal);
    const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (!/^[0-9a-f]{64}$/u.test(sha256)) invalid();
    const result = compareCatalogueEntries(before, remote);
    result.entries = mergeCatalogueEntries(before, remote);
    check(controller.signal);
    return { ...result, observedAt: new Date().toISOString(),
      source: { ...CATALOGUE_UPDATE_SOURCE, commit, url, sha256 }, limits: { ...CATALOGUE_UPDATE_LIMITS } };
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof CatalogueUpdateError) throw error;
    fail('network', 'Die Onlinequelle konnte nicht geladen werden. Internetverbindung, Browserfreigabe (CORS) oder GitHub können die Ursache sein.');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', stop);
  }
}
