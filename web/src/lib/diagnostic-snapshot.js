import { createDiagnostics, normalizeDrives, normalizeRuntimeDiagnostics } from './device-info.js';
import { normalizeBootDiagnostics } from './boot-diagnostics.js';
import { normalizePowerDiagnostics } from './power-diagnostics.js';
import { normalizeStartupDiagnostics } from './startup-diagnostics.js';
import { normalizeMtuDiagnostics, normalizeUiDiagnostics } from './device-extra-diagnostics.js';

export const DIAGNOSTIC_SECTION_KEYS = Object.freeze(['runtime', 'boot', 'power', 'startup', 'drives', 'storage', 'mtu', 'ui']);
const fatalCodes = new Set(['DISCONNECTED', 'CONNECT_FAILED', 'CONNECT_TIMEOUT', 'TX_FAILED', 'TIMEOUT', 'RX_INVALID']);
const errorCodes = new Set([...fatalCodes, 'RESPONSE_INVALID', 'DEVICE_STATUS', 'REQUEST_INVALID', 'DIAGNOSTIC_INVALID_DATA', 'DIAGNOSTIC_FAILED']);
const uint = (value, maximum = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= maximum;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fault = code => Object.assign(new Error('Diagnostic collection could not continue.'), { code });

// Only fixed storage geometry/capabilities, never recovery tickets, archive
// hashes, file metadata or collection identities. cacheSize is configuration.
export function normalizeStorageDiagnostics(value) {
  const info = value?.info, layout = value?.layout;
  if (!info || info.schema !== 1 || info.drive !== 'E' || ![1, 2, 3].includes(info.backend) ||
      typeof info.mounted !== 'boolean' || !uint(info.flags, 15) ||
      ((info.flags & 8) && (info.backend !== 3 || (info.flags & 7) !== 7)) ||
      info.metaLen !== 128 || info.pathMax !== 64 || info.nameMax !== 48 ||
      (layout !== null && (!layout || info.backend !== 3))) return null;
  const cleanInfo = { schema: 1, drive: 'E', backend: info.backend, mounted: info.mounted,
    flags: info.flags, metaLen: 128, pathMax: 64, nameMax: 48 };
  if (layout === null) return { info: cleanInfo, layout: null };
  const fields32 = ['flashBytes', 'blockSize', 'blockCount', 'shardTarget'];
  const fields16 = ['readSize', 'progSize', 'cacheSize', 'metadataBytes'];
  const fields8 = ['maxShards', 'pathCap', 'nameCap', 'maxHandles'];
  if (layout.schema !== 1 || layout.drive !== 'E' || layout.backend !== 3 ||
      typeof layout.mounted !== 'boolean' || layout.magic !== 0x31534650 || layout.flags !== 7 ||
      fields32.some(key => !uint(layout[key]) || !layout[key]) ||
      fields16.some(key => !uint(layout[key], 65535) || !layout[key]) ||
      fields8.some(key => !uint(layout[key], 255) || !layout[key]) ||
      layout.blockSize * layout.blockCount !== layout.flashBytes ||
      layout.metadataBytes !== info.metaLen || layout.pathCap !== info.pathMax || layout.nameCap !== info.nameMax ||
      typeof layout.engineSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(layout.engineSha256) ||
      /^(?:0{64}|f{64})$/.test(layout.engineSha256)) return null;
  const cleanLayout = { schema: 1, drive: 'E', backend: 3, mounted: layout.mounted, magic: 0x31534650 };
  for (const key of [...fields32, ...fields16, ...fields8]) cleanLayout[key] = layout[key];
  return { info: cleanInfo, layout: { ...cleanLayout, flags: 7, engineSha256: layout.engineSha256 } };
}

export function normalizeDiagnosticSectionData(key, value) {
  try {
    switch (key) {
      case 'runtime': return normalizeRuntimeDiagnostics(value);
      case 'boot': return normalizeBootDiagnostics(value);
      case 'power': return normalizePowerDiagnostics(value);
      case 'startup': return normalizeStartupDiagnostics(value);
      case 'storage': return normalizeStorageDiagnostics(value);
      case 'mtu': return normalizeMtuDiagnostics(value);
      case 'ui': return normalizeUiDiagnostics(value);
      case 'drives':
        return Array.isArray(value) ? normalizeDrives(value.map(drive => ({ label: drive?.label,
          status: drive?.status, total_size: drive?.totalBytes, free_size: drive?.freeBytes }))) : null;
      default: return null;
    }
  } catch { return null; }
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Readers are explicit callbacks supplied by the application. This module has
// no device/network imports, retries, cached fallback or write operations.
export async function collectDiagnosticSnapshot({ readers = {}, isCurrent = () => true,
  now = () => new Date().toISOString(), onProgress } = {}) {
  const check = () => { if (!isCurrent()) throw fault('DIAGNOSTIC_STALE'); };
  const time = () => { const value = now(); if (!timestamp(value)) throw fault('DIAGNOSTIC_INVALID_TIME'); return value; };
  check();
  const startedAt = time(), sections = {};
  for (const [index, key] of DIAGNOSTIC_SECTION_KEYS.entries()) {
    check();
    let section;
    if (typeof readers[key] !== 'function') {
      section = { state: 'unavailable', observedAt: null, data: null, errorCode: null };
    } else {
      let raw, failed, didFail = false;
      try { raw = await readers[key](); }
      catch (error) { failed = error; didFail = true; }
      check(); // A stale completion must neither be displayed nor unlock a new session.
      const observedAt = time();
      if (didFail) {
        const code = errorCodes.has(failed?.code) ? failed.code : 'DIAGNOSTIC_FAILED';
        if (fatalCodes.has(code)) throw fault(code);
        section = { state: 'failed', observedAt, data: null, errorCode: code };
      } else if (raw === null || raw === undefined) {
        section = { state: 'unavailable', observedAt, data: null, errorCode: null };
      } else {
        const data = normalizeDiagnosticSectionData(key, raw);
        section = data === null ? { state: 'failed', observedAt, data: null, errorCode: 'DIAGNOSTIC_INVALID_DATA' }
          : { state: 'available', observedAt, data, errorCode: null };
      }
    }
    sections[key] = freeze(section);
    if (onProgress) onProgress(Object.freeze({ key, index: index + 1, total: DIAGNOSTIC_SECTION_KEYS.length, section }));
    check();
  }
  return freeze({ schemaVersion: 1, startedAt, completedAt: time(), sections });
}

export function normalizeDiagnosticSnapshot(value) {
  if (!value || value.schemaVersion !== 1 || !timestamp(value.startedAt) || !timestamp(value.completedAt) ||
      !value.sections || typeof value.sections !== 'object') return null;
  const sections = {};
  for (const key of DIAGNOSTIC_SECTION_KEYS) {
    const section = value.sections[key];
    if (!section || !['available', 'unavailable', 'failed'].includes(section.state) ||
        (section.observedAt !== null && !timestamp(section.observedAt)) ||
        (section.state !== 'unavailable' && section.observedAt === null)) return null;
    if (section.state === 'available') {
      const data = normalizeDiagnosticSectionData(key, section.data);
      if (data === null) return null;
      sections[key] = { state: 'available', observedAt: section.observedAt, data, errorCode: null };
    } else {
      sections[key] = { state: section.state, observedAt: section.observedAt, data: null,
        errorCode: section.state === 'failed' ? errorCodes.has(section.errorCode) ? section.errorCode : 'DIAGNOSTIC_FAILED' : null };
    }
  }
  return freeze({ schemaVersion: 1, startedAt: value.startedAt, completedAt: value.completedAt, sections });
}

export function createCombinedDiagnosticReport({ baseReport = {}, snapshot = null } = {}) {
  if (!baseReport || typeof baseReport !== 'object') baseReport = {};
  const normalized = snapshot === null ? null : normalizeDiagnosticSnapshot(snapshot);
  if (snapshot !== null && !normalized) throw fault('DIAGNOSTIC_INVALID_DATA');
  const sectionData = key => normalized?.sections[key].data ?? null;
  // Reconstruct rather than spread the supplied report: callers may pass extra
  // object properties, and failed fresh sections must not reuse cached values.
  const report = createDiagnostics({ firmwareVersion: baseReport.firmwareVersion, connected: baseReport.connected,
    browser: baseReport.browser, transport: baseReport.transport,
    drives: normalized ? sectionData('drives') || [] : Array.isArray(baseReport.drives) ? baseReport.drives.filter(item => item && typeof item === 'object') : [],
    history: Array.isArray(baseReport.recentTransfers) ? baseReport.recentTransfers.filter(item => item && typeof item === 'object') : [],
    runtime: normalized ? sectionData('runtime') : baseReport.runtime,
    boot: normalized ? sectionData('boot') : baseReport.boot,
    power: normalized ? sectionData('power') : baseReport.power });
  return { ...report, startup: sectionData('startup'), diagnosticSnapshot: normalized,
    limitations: [...report.limitations,
      ...(sectionData('mtu')?.effectiveAttMtu != null
        ? ['The firmware reported the effective ATT MTU for its connection in diagnosticSnapshot.sections.mtu.']
        : ['This report contains no firmware reading of the effective ATT MTU.']),
      'Sections were read sequentially; this is not an atomic device snapshot.',
      'Read timestamps describe browser receipt, not the age of cached firmware samples.',
      'Startup markers exclude bootloader and early SDK startup.',
      'Storage cache sizes are configuration values, not measured cache usage.'] };
}
