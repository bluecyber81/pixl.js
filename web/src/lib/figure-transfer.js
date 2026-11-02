import { figureId, inspectTagStructure, TAG_LENGTHS } from './figure-info.js';
import { safeUpload, sha256Bytes, snapshotFile } from './safe-upload.js';
import { assertDevicePath, assertPortableEntryName, joinDevicePath } from './portable-names.js';

export const FIGURE_DOWNLOAD_LIMITS = Object.freeze({ maxBytes: 2048, timeoutMs: 15000, maxUrlLength: 4096 });
export class FigureTransferError extends Error {
  constructor(code, message) { super(message); this.name = 'FigureTransferError'; this.code = code; }
}
const fail = (code, message) => { throw new FigureTransferError(code, message); };
const abortError = () => Object.assign(new Error('Figure transfer cancelled.'), { name: 'AbortError', code: 'FIGURE_CANCELLED' });
const check = signal => { if (signal?.aborted) throw abortError(); };

// A user-selected public HTTPS BIN source; never an inferred catalogue download.
// Omit credentials/referrers and refuse redirects to another source or a login page.
export function figureSourceUrl(input) {
  if (typeof input !== 'string' || !input || input.length > FIGURE_DOWNLOAD_LIMITS.maxUrlLength || /[\u0000-\u0020\u007f]/u.test(input)) {
    fail('FIGURE_URL', 'Use a direct HTTPS address for the figure BIN file.');
  }
  let url;
  try { url = new URL(input); } catch { fail('FIGURE_URL', 'Invalid figure download address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname) {
    fail('FIGURE_URL', 'Use a direct HTTPS address without credentials or a fragment.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/u, '');
  if (!host.includes('.') || /^\d+(?:\.\d+){3}$/u.test(host) || host.includes(':') ||
      host === 'localhost' || /\.(?:localhost|local|internal|test|invalid)$/u.test(host)) {
    fail('FIGURE_URL', 'Use a public HTTPS file source. Local files can be selected directly.');
  }
  return url;
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal?.removeEventListener('abort', abort); reject(abortError()); };
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal?.removeEventListener('abort', abort); resolve(value); },
      error => { signal?.removeEventListener('abort', abort); reject(error); });
    if (signal?.aborted) abort();
  });
}

async function fetchFigureBytes(input, { signal, fetchImpl, timeoutMs }) {
  const url = figureSourceUrl(input);
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > FIGURE_DOWNLOAD_LIMITS.timeoutMs) {
    fail('FIGURE_API', 'Invalid figure download options.');
  }
  check(signal);
  const controller = new AbortController();
  let timedOut = false, reader;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await abortable(fetchImpl(url.href, {
      method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/octet-stream' }
    }), controller.signal);
    check(controller.signal);
    if (!response || response.status !== 200 || !response.ok || response.redirected || ['opaque', 'opaqueredirect'].includes(response.type)) {
      fail('FIGURE_HTTP', 'The source did not return a complete readable file.');
    }
    if (response.url && response.url !== url.href) fail('FIGURE_HTTP', 'The download source changed.');
    const rawLength = response.headers?.get?.('content-length');
    if (rawLength !== null && rawLength !== undefined && (!/^\d+$/u.test(rawLength) || !TAG_LENGTHS.includes(Number(rawLength)))) {
      fail('FIGURE_SIZE', 'The source length is not a supported figure file.');
    }
    if (!response.body || typeof response.body.getReader !== 'function') fail('FIGURE_STREAM', 'This browser cannot read the download with a size limit.');
    reader = response.body.getReader();
    const buffer = new Uint8Array(FIGURE_DOWNLOAD_LIMITS.maxBytes);
    let length = 0, chunks = 0;
    while (true) {
      check(controller.signal);
      const part = await abortable(reader.read(), controller.signal);
      if (part.done) break;
      if (++chunks > 4096) fail('FIGURE_STREAM', 'The download contains too many empty or tiny chunks.');
      if (!(part.value instanceof Uint8Array) || length + part.value.byteLength > buffer.byteLength) {
        fail('FIGURE_SIZE', 'The download exceeds the supported figure file size.');
      }
      buffer.set(part.value, length); length += part.value.byteLength;
    }
    if (rawLength !== null && rawLength !== undefined && Number(rawLength) !== length) fail('FIGURE_SIZE', 'The downloaded file was truncated.');
    check(controller.signal);
    return { bytes: buffer.slice(0, length), source: { kind: 'https', origin: url.origin } };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut) fail('FIGURE_TIMEOUT', 'The figure download timed out.');
    if (error instanceof FigureTransferError) throw error;
    fail('FIGURE_NETWORK', 'The file could not be downloaded. Check the direct BIN address and browser access (CORS), or select the local file.');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    controller.abort();
    if (reader) {
      try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* cleanup only */ }
      try { reader.releaseLock(); } catch { /* cleanup only */ }
    }
  }
}

export function suggestedFigureFilename({ id, name = '' }) {
  const checkedId = figureId(id);
  if (!checkedId) fail('FIGURE_ID', 'Select a valid figure ID.');
  // Stable portable ASCII with the full ID retained; fit shallow folders too.
  const limited = String(name).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9_-]+/gu, '_').replace(/^_+|_+$/gu, '').slice(0, 18);
  const filename = (limited ? limited + '_' : '') + checkedId + '.bin';
  return assertPortableEntryName(filename);
}
export const figureFilename = suggestedFigureFilename;

/** No network upload, no device mutation. The returned bytes are kept by the UI
 * only for this explicitly selected file; never persist them with catalogue data.
 * Structural checks do not verify cryptography, owner/game data or NFC support. */
export async function prepareFigureTransfer({ file, url, expectedId, signal,
  fetchImpl = globalThis.fetch, timeoutMs = FIGURE_DOWNLOAD_LIMITS.timeoutMs }) {
  const id = figureId(expectedId);
  if (!id) fail('FIGURE_ID', 'Select a valid figure ID before loading its file.');
  if ((file !== undefined) === (url !== undefined)) fail('FIGURE_SOURCE', 'Select either a local file or one direct download address.');
  check(signal);
  let bytes, source;
  if (file !== undefined) {
    const size = file instanceof Uint8Array || file instanceof ArrayBuffer ? file.byteLength : file?.size;
    if (!TAG_LENGTHS.includes(size)) fail('FIGURE_SIZE', 'Supported figure file lengths are 532, 540, 572 and 2048 bytes.');
    bytes = await snapshotFile(file, FIGURE_DOWNLOAD_LIMITS.maxBytes);
    source = { kind: 'local' };
  } else ({ bytes, source } = await fetchFigureBytes(url, { signal, fetchImpl, timeoutMs }));
  check(signal);
  const inspection = inspectTagStructure(bytes);
  if (inspection.status !== 'structure-consistent') fail('FIGURE_STRUCTURE', 'The figure file has an unsupported length or inconsistent structure.');
  if (inspection.id !== id) fail('FIGURE_ID_MISMATCH', 'The file belongs to a different figure than the selected catalogue entry.');
  const sha256 = await sha256Bytes(bytes); check(signal);
  return Object.freeze({ bytes, id, size: bytes.byteLength, sha256, inspection: Object.freeze(inspection), source: Object.freeze(source) });
}

/** Caller holds the single device-operation lock. Existing files are never
 * replaced. The established staging, metadata and read-back protocol is reused. */
export async function transferFigureToDevice({ prepared, parentPath, filename, adapter, signal, onProgress }) {
  check(signal);
  if (!prepared || !figureId(prepared.id) || !/^[0-9a-f]{64}$/u.test(prepared.sha256) || !TAG_LENGTHS.includes(prepared.size)) {
    fail('FIGURE_PREPARED', 'Load and check the figure file first.');
  }
  const fresh = await prepareFigureTransfer({ file: prepared.bytes, expectedId: prepared.id, signal });
  if (fresh.sha256 !== prepared.sha256 || fresh.size !== prepared.size) fail('FIGURE_CHANGED', 'The prepared figure bytes changed; reload the source.');
  assertDevicePath(parentPath);
  if (!/^[IE]:\//u.test(parentPath)) fail('FIGURE_PATH', 'Select a valid device drive.');
  const name = assertPortableEntryName(filename || suggestedFigureFilename({ id: fresh.id }));
  if (!/\.bin$/iu.test(name)) fail('FIGURE_PATH', 'Use a .bin filename for the figure.');
  const path = joinDevicePath(parentPath, name);
  const metadata = { valid: true, notes: '', flags: { raw: 0, hide: false, readonly: false },
    amiibo: { head: parseInt(fresh.id.slice(0, 8), 16), tail: parseInt(fresh.id.slice(8), 16) } };
  // App's adapter contract accepts the complete destination path. Keep that
  // contract even though safeUpload currently requests free bytes by drive letter.
  const getFreeBytes = typeof adapter?.getFreeBytes === 'function' ? () => adapter.getFreeBytes(path) : undefined;
  return safeUpload({ ...adapter, path, file: fresh.bytes, replace: false, metadata, getFreeBytes, signal, onProgress });
}
