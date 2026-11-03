import { normalizeBootDiagnostics } from "./boot-diagnostics.js";
import { normalizePowerDiagnostics } from "./power-diagnostics.js";

const nonnegative = value => Number.isSafeInteger(value) && value >= 0;

// The VFS counter includes rejected protocol requests, not only storage faults.
// Describe only the final code; never classify the entire accumulated count.
export function runtimeVfsDetailKey(code) {
  if (code === -1000) return 'runtimeBadRequest';
  if (code === -1001) return 'runtimeBadState';
  if (code === 0) return 'runtimeNoVfsError';
  return 'runtimeVfsOther';
}
export function normalizeDrives(entries) {
  if (!Array.isArray(entries)) throw new Error('Invalid drive information');
  const seen = new Set();
  return entries.map(drive => {
    if (!['I', 'E'].includes(drive.label) || seen.has(drive.label) || !Number.isInteger(drive.status) ||
        drive.status < 0 || drive.status > 255 || !nonnegative(drive.total_size) || !nonnegative(drive.free_size) ||
        (drive.status === 0 && drive.free_size > drive.total_size)) throw new Error('Invalid drive information');
    seen.add(drive.label);
    return { label: drive.label, status: drive.status, totalBytes: drive.total_size, freeBytes: drive.free_size };
  });
}

// A coarse preflight, not a promise: filesystem blocks/metadata can consume more
// than file bytes. An overwrite may reclaim the existing allocation after OPEN.
export function uploadSpaceAvailable(drive, bytes, previousBytes = 0) {
  if (!drive || drive.status !== 0 || !nonnegative(bytes) || !nonnegative(previousBytes)) return false;
  return Math.max(0, bytes - previousBytes) <= drive.freeBytes;
}

export function normalizeRuntimeDiagnostics(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== 'since-device-restart') return null;
  const result = {schemaVersion:1, scope:'since-device-restart'};
  for (const field of ['disconnects','queueOverflows','timeouts','allocationFailures','lastLocalBleCause','lastHciReason',
    'lastVfsCommand','heapPoolBytes','heapFreeBytes','largestFreeBlockBytes','sampledMinFreeBytes',
    'sampledMinLargestBlockBytes','maxAllocatedPayloadBytes','stackReservedBytes','stackMinFreeBytes','memorySamples','vfsErrors']) {
    result[field] = nonnegative(value[field]) && value[field] <= 0xffffffff ? value[field] : null;
  }
  result.lastVfsError = Number.isInteger(value.lastVfsError) && value.lastVfsError >= -2147483648 && value.lastVfsError <= 2147483647 ? value.lastVfsError : null;
  return result;
}

export function createDiagnostics({ firmwareVersion, connected, browser, transport, drives, history, runtime, boot, power }) {
  const number = value => nonnegative(value) ? value : null;
  const fixed = (value, choices) => choices.includes(value) ? value : null;
  const capacity = value => Number.isInteger(value) && value >= 20 && value <= 247 ? value : null;
  // Explicit allowlist: never spread arbitrary device data or exception text.
  return {
    schema: 1, application: 'Allmiibo Dateimanager', applicationVersion: '3.34.0',
    firmwareVersion: /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,48})?$/.test(firmwareVersion || '') ? firmwareVersion : null,
    connected: connected === true,
    runtime: normalizeRuntimeDiagnostics(runtime),
    boot: normalizeBootDiagnostics(boot),
    power: normalizePowerDiagnostics(power),
    browser: { secureContext: browser?.secureContext === true, webBluetooth: browser?.webBluetooth === true },
    transport: transport ? {
      chunkMode: fixed(transport.chunkMode, ['not-negotiated', 'legacy', 'chunked']),
      reportedGattValueCapacity: capacity(transport.reportedGattValueCapacity),
      effectiveGattValueCapacity: capacity(transport.effectiveGattValueCapacity),
      maxRequestPayload: number(transport.maxRequestPayload),
      txFrames: number(transport.txFrames), txBytes: number(transport.txBytes),
      rxFrames: number(transport.rxFrames), rxBytes: number(transport.rxBytes),
      activeCommand: Number.isInteger(transport.activeCommand) && transport.activeCommand >= 0 && transport.activeCommand <= 255 ? transport.activeCommand : null,
      queuedCommands: number(transport.queuedCommands), queuedFileTransfers: number(transport.queuedFileTransfers),
      fileTransferActive: transport.fileTransferActive === true,
      lastErrorCode: fixed(transport.lastErrorCode, ['ATOMIC_WRITE_FAILED', 'REQUEST_INVALID', 'TX_FAILED', 'TIMEOUT', 'RX_INVALID', 'RESPONSE_INVALID', 'DEVICE_STATUS', 'CONNECT_FAILED', 'DISCONNECTED'])
    } : null,
    drives: (drives || []).filter(drive => ['I', 'E'].includes(drive.label)).map(drive => ({
      label: drive.label, status: number(drive.status), totalBytes: number(drive.totalBytes), freeBytes: number(drive.freeBytes)
    })),
    recentTransfers: (history || []).slice(-20).map(item => ({
      kind: fixed(item.kind, ['upload', 'download', 'backup', 'sync']), status: fixed(item.status, ['success', 'failed', 'cancelled', 'interrupted']),
      bytes: number(item.bytes), verified: item.verified === true
    })),
    limitations: ['Not a measurement of ATT MTU', 'No hardware test implied', 'Free-space snapshots may become stale']
  };
}
