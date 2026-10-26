// Optional INFO 0x08. An application-start register snapshot and cached ADC
// sample, not a USB presence detector or a verified wake/restart cause.
export function parsePowerDiagnostics(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 16 ||
      bytes[0] !== 80 || bytes[1] !== 88 || bytes[2] !== 80 || bytes[3] !== 68 ||
      bytes[4] !== 1 || bytes[5] !== 16 || (bytes[6] & ~31) || bytes[7] !== 0) {
    throw new Error('Invalid power diagnostic response');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), flags = bytes[6];
  const reset = view.getUint32(8, true), mv = view.getUint16(12, true), sleep = view.getUint16(14, true);
  if ((!(flags & 1) && reset !== 0) || (!(flags & 4) && mv !== 0) ||
      ((flags & 4) && (!(flags & 2) || mv === 0)) ||
      (!(flags & 2) && ((flags & 24) || sleep !== 0)) ||
      ((flags & 16) && (flags & 14) !== 14)) throw new Error('Inconsistent power diagnostic response');
  return Object.freeze({ schemaVersion: 1, scope: 'application-start-and-cached-battery',
    resetCaptured: !!(flags & 1), resetReasonRaw: flags & 1 ? reset : null,
    sampleCollected: !!(flags & 2), voltageValid: !!(flags & 4),
    batteryMillivolts: flags & 4 ? mv : null, lipoMode: !!(flags & 8),
    chargingActive: !!(flags & 16), configuredSleepSeconds: sleep });
}

export function normalizePowerDiagnostics(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== 'application-start-and-cached-battery') return null;
  const bools = ['resetCaptured', 'sampleCollected', 'voltageValid', 'lipoMode', 'chargingActive'];
  if (bools.some(key => typeof value[key] !== 'boolean')) return null;
  const uint = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
  if (!uint(value.configuredSleepSeconds, 65535) ||
      (value.resetCaptured ? !uint(value.resetReasonRaw, 0xffffffff) : value.resetReasonRaw !== null) ||
      (value.voltageValid ? (!value.sampleCollected || !uint(value.batteryMillivolts, 65535) || !value.batteryMillivolts) : value.batteryMillivolts !== null) ||
      (!value.sampleCollected && (value.lipoMode || value.chargingActive || value.configuredSleepSeconds !== 0)) ||
      (value.chargingActive && (!value.sampleCollected || !value.voltageValid || !value.lipoMode))) return null;
  return { schemaVersion: 1, scope: value.scope,
    ...Object.fromEntries(bools.map(key => [key, value[key]])), resetReasonRaw: value.resetReasonRaw,
    batteryMillivolts: value.batteryMillivolts, configuredSleepSeconds: value.configuredSleepSeconds };
}
