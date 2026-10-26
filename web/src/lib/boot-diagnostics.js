// INFO 0x07, schema 1. This describes fixed read-only firmware observations;
// it is not an arbitrary memory reader or an update-compatibility decision.
const word = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const byteWords = ['chipPart', 'chipVariantRaw', 'flashBytes', 'ramBytes', 'pageBytes',
  'softDeviceVariant', 'softDeviceVersion', 'uicrBootAddress', 'mbrBootAddress',
  'bootAddress', 'settingsAddress', 'settingsVersion', 'applicationCounter',
  'bootloaderCounter', 'storedSettingsCrc', 'calculatedSettingsCrc', 'bootRegionBytes',
  'uicrParamsAddress', 'mbrParamsAddress', 'effectiveParamsAddress'];
const offsets = [8,12,16,20,24,28,32,40,44,48,52,56,60,64,68,72,76,112,116,120];
const flagNames = ['geometryValid','softDeviceValid','bootAddressValid','settingsLayoutSupported',
  'settingsCrcValid','bootHashValid','addressConflict','bootVectorsValid','paramsLayoutKnown'];

export function parseBootDiagnostics(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  const invalid = () => { throw new Error('Invalid boot diagnostic response'); };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 128 ||
      bytes[0] !== 80 || bytes[1] !== 88 || bytes[2] !== 66 || bytes[3] !== 68 ||
      bytes[4] !== 1 || bytes[5] > 2 || bytes[7] > 1 || bytes[38] !== 0 || bytes[39] !== 0) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = offset => view.getUint32(offset, true), flags = view.getUint16(6, true);
  const geometry = !!(flags & 1), sd = !!(flags & 2), address = !!(flags & 4);
  const layout = !!(flags & 8), crc = !!(flags & 16), hash = !!(flags & 32), vectors = !!(flags & 128);
  const params = !!(flags & 256);
  if ((geometry && (u32(8) !== 0x52832 || u32(16) !== 524288 || u32(20) !== 65536 || u32(24) !== 4096)) ||
      (flags !== 0 && !geometry) || (crc && !layout) ||
      (hash && (!address || !vectors || !params)) || (vectors && !address) ||
      (!sd && (u32(28) || u32(32) || view.getUint16(36, true))) ||
      (!address && u32(48)) || (!crc && (u32(60) || u32(64))) ||
      (!geometry && (bytes[5] || [44,52,56,68,72,116,120].some(offset => u32(offset)))) ||
      (!layout && u32(72)) || (layout && u32(56) !== 2) ||
      (crc && (u32(68) === 0xffffffff || u32(68) !== u32(72))) || u32(124) ||
      (!hash && (u32(76) || bytes.slice(80,112).some(value => value)))) invalid();
  if (geometry && u32(52) !== 0x7f000) invalid();
  if (sd && (![112,113,122,132,140].includes(u32(28)) || u32(32) < 1000000 ||
      u32(32) === 0xffffffff || !view.getUint16(36,true) || view.getUint16(36,true) === 65535)) invalid();
  if (address && (bytes[5] === 0 || u32(48) < 0x76000 || u32(48) >= 0x7e000 ||
      u32(48) % 4096 !== 0 || u32(48) !== u32(bytes[5] === 1 ? 44 : 40))) invalid();
  if (hash && (u32(76) !== 0x7e000 - u32(48) || u32(76) > 32768)) invalid();
  if (params && u32(120) !== 0x7e000) invalid();
  if (geometry) {
    const preferredBoot = u32(44) !== 0xffffffff ? 1 : u32(40) !== 0xffffffff ? 2 : 0;
    if (bytes[5] !== preferredBoot) invalid();
    const conflict = u32(40) !== 0xffffffff && u32(44) !== 0xffffffff && u32(40) !== u32(44);
    if (!!(flags & 64) !== conflict) invalid();
    const preferredParams = u32(116) !== 0xffffffff ? u32(116) : u32(112);
    if (u32(120) !== (preferredParams === 0xffffffff ? 0 : preferredParams)) invalid();
  }
  const result = { schemaVersion: 1, scope: 'device-read-only-snapshot', flags,
    bootAddressSource: ['none','mbr','uicr'][bytes[5]] };
  for (let i = 0; i < byteWords.length; ++i) result[byteWords[i]] = u32(offsets[i]);
  result.softDeviceFwid = view.getUint16(36, true);
  result.bootRegionSha256 = hash ? [...bytes.slice(80,112)].map(value => value.toString(16).padStart(2, '0')).join('') : null;
  flagNames.forEach((name, index) => { result[name] = !!(flags & (1 << index)); });
  if (!sd) result.softDeviceVariant = result.softDeviceVersion = result.softDeviceFwid = null;
  if (!address) result.bootAddress = null;
  if (!geometry) result.settingsAddress = result.settingsVersion = result.storedSettingsCrc = null;
  if (!layout) result.calculatedSettingsCrc = null;
  if (!crc) result.applicationCounter = result.bootloaderCounter = null;
  if (!hash) result.bootRegionBytes = null;
  return Object.freeze(result);
}

// Reconstruct only schema fields, then apply the same invariants as the wire
// parser. Arbitrary notes, memory data, filenames and identifiers are excluded.
export function normalizeBootDiagnostics(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== 'device-read-only-snapshot' ||
      !Number.isInteger(value.flags) || value.flags < 0 || value.flags > 511) return null;
  const source = ['none','mbr','uicr'].indexOf(value.bootAddressSource);
  if (source < 0) return null;
  const bytes = new Uint8Array(128), view = new DataView(bytes.buffer);
  bytes.set([80,88,66,68,1,source]); view.setUint16(6, value.flags, true);
  const nullable = {softDeviceVariant:2,softDeviceVersion:2,bootAddress:4,settingsAddress:1,
    settingsVersion:1,storedSettingsCrc:1,calculatedSettingsCrc:8,applicationCounter:16,
    bootloaderCounter:16,bootRegionBytes:32};
  for (let i = 0; i < byteWords.length; ++i) {
    const name=byteWords[i], field = value[name];
    if (field === null && (!nullable[name] || (value.flags & nullable[name]))) return null;
    if (field !== null && !word(field)) return null;
    view.setUint32(offsets[i], field ?? 0, true);
  }
  if ((value.softDeviceFwid === null && (value.flags & 2)) ||
      (value.softDeviceFwid !== null && (!word(value.softDeviceFwid) || value.softDeviceFwid > 65535))) return null;
  view.setUint16(36, value.softDeviceFwid ?? 0, true);
  if (value.bootRegionSha256 !== null) {
    if (typeof value.bootRegionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.bootRegionSha256)) return null;
    bytes.set(value.bootRegionSha256.match(/../g).map(pair => parseInt(pair, 16)), 80);
  } else if (value.flags & 32) return null;
  try { return parseBootDiagnostics(bytes); } catch { return null; }
}

export function formatHexWord(value) {
  return word(value) ? '0x' + value.toString(16).toUpperCase().padStart(8, '0') : null;
}
