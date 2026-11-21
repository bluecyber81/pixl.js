import { normalizeMtuDiagnostics } from './device-extra-diagnostics.js';

const uint = (n, maximum = 0xffffffff) => Number.isSafeInteger(n) && n >= 0 && n <= maximum;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const PHASES = ['listing', 'reading', 'verifying', 'packingFileEntries', 'packing', 'total'];
const OPERATIONS = ['listingCalls', 'fileReads', 'digestReplies', 'rawMetadataReads', 'verificationListingCalls', 'previousZipFiles', 'storageRevisionReplies'];
const TRANSPORT = ['completedCommands', 'txFrames', 'rxFrames', 'txBytes', 'rxBytes'];
const ERROR_CODES = new Set(['DISCONNECTED', 'TIMEOUT', 'TX_FAILED', 'RX_INVALID', 'RESPONSE_INVALID', 'DEVICE_STATUS', 'REQUEST_INVALID', 'DIAGNOSTIC_FAILED', 'BUSY']);

function linkObservation(value) {
  if (!value || !['available', 'unavailable', 'failed'].includes(value.state) || !timestamp(value.observedAt)) return null;
  if (value.state === 'available') {
    const data = normalizeMtuDiagnostics(value.data);
    if (!data || !data.sessionReady || !data.link?.connected) return null;
    return { state: 'available', observedAt: value.observedAt, data, errorCode: null };
  }
  return { state: value.state, observedAt: value.observedAt, data: null,
    errorCode: value.state === 'failed' ? ERROR_CODES.has(value.errorCode) ? value.errorCode : 'DIAGNOSTIC_FAILED' : null };
}

// A bounded, path-free account of a completed backup. File bytes exclude protocol
// framing; cached bytes only count as reused after the backup's fresh digest check.
// The two link reads bracket the job. They are not continuous radio observations.
export function normalizeTransferObservation(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== 'completed-browser-backup' ||
      !timestamp(value.startedAt) || !timestamp(value.completedAt) || value.startedAt > value.completedAt ||
      value.sameBrowserConnection !== true || !uint(value.files, 4096) || !uint(value.totalFileBytes, 16 * 1024 * 1024) ||
      !uint(value.reusedFiles, value.files) || !uint(value.reusedFileBytes, value.totalFileBytes) ||
      value.readFileBytes !== value.totalFileBytes - value.reusedFileBytes) return null;
  const phasesMs = {}, operations = {}, transport = value.transport === null ? null : {};
  if (!value.phasesMs || !['listing', 'reading', 'verifying', 'packing', 'total'].every(key => uint(value.phasesMs[key], 86400000))) return null;
  for (const key of PHASES) {
    if (value.phasesMs[key] === undefined) continue;
    if (!uint(value.phasesMs[key], 86400000) || value.phasesMs[key] > value.phasesMs.total) return null;
    phasesMs[key] = value.phasesMs[key];
  }
  if (!value.operations || typeof value.operations !== 'object') return null;
  for (const key of OPERATIONS) if (value.operations[key] !== undefined) {
    if (!uint(value.operations[key])) return null;
    operations[key] = value.operations[key];
  }
  if (transport !== null) {
    if (!value.transport || !TRANSPORT.every(key => uint(value.transport[key]))) return null;
    for (const key of TRANSPORT) transport[key] = value.transport[key];
  }
  const before = linkObservation(value.link?.before), after = linkObservation(value.link?.after);
  if (!before || !after || before.observedAt > value.startedAt || after.observedAt < value.completedAt) return null;
  return { schemaVersion: 1, scope: 'completed-browser-backup', startedAt: value.startedAt,
    completedAt: value.completedAt, sameBrowserConnection: true, files: value.files,
    totalFileBytes: value.totalFileBytes, readFileBytes: value.readFileBytes,
    reusedFiles: value.reusedFiles, reusedFileBytes: value.reusedFileBytes,
    phasesMs, operations, transport, link: { before, after } };
}

export function createBackupTransferObservation({ manifest, profile, startedAt, completedAt, before, after }) {
  if (manifest?.completed !== true || profile?.schema !== 1) return null;
  return normalizeTransferObservation({schemaVersion: 1, scope: 'completed-browser-backup',
    startedAt, completedAt, sameBrowserConnection: true, files: manifest.files,
    totalFileBytes: manifest.bytes, reusedFiles: manifest.resume?.reusedFiles,
    reusedFileBytes: manifest.resume?.reusedBytes,
    readFileBytes: manifest.bytes - manifest.resume?.reusedBytes,
    phasesMs: profile.phasesMs, operations: profile.operations, transport: profile.transport,
    link: {before, after}});
}

// Used only before the first file operation and after the final close/verification.
// An unavailable optional diagnostic never invents a link value from a later read.
export async function captureTransferLink({ read, isCurrent, now = () => new Date().toISOString() }) {
  let data = null, failure = null;
  try { data = typeof read === 'function' ? await read() : null; }
  catch (error) { failure = error; }
  if (!isCurrent()) return null;
  const observedAt = now();
  if (!timestamp(observedAt)) return null;
  const normalized = normalizeMtuDiagnostics(data);
  if (normalized?.sessionReady && normalized.link?.connected)
    return {state: 'available', observedAt, data: normalized, errorCode: null};
  if (!failure && (data === null || data === undefined || normalized?.schemaVersion === 1))
    return {state: 'unavailable', observedAt, data: null, errorCode: null};
  return {state: 'failed', observedAt, data: null, errorCode: ERROR_CODES.has(failure?.code) ? failure.code : 'DIAGNOSTIC_FAILED'};
}
