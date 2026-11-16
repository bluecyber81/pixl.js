const isByte = n => Number.isInteger(n) && n >= 0 && n <= 255;
export function hexByte(n) { return n.toString(16).padStart(2, '0').toUpperCase(); }

export function supportsFlashDiagnostics(version) {
  const match = /^2\.22\.0-DE3\.(\d+)$/.exec(version || '');
  return !!match && Number(match[1]) >= 78;
}

export function normalizeFlashDiagnostics(value) {
  if (value?.schemaVersion !== 1 || value.scope !== 'cached-flash-probe' ||
      typeof value.geometrySupported !== 'boolean') return null;
  const id = value.jedecId;
  if (id === null ? value.geometrySupported :
      !Array.isArray(id) || id.length !== 3 || !Array.from(id).every(isByte) || id[0] === 0 || id[0] === 255) return null;
  return {schemaVersion: 1, scope: 'cached-flash-probe', jedecId: id && [...id], geometrySupported: value.geometrySupported};
}

export function parseFlashDiagnostics(buffer) {
  const b = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (!(b instanceof Uint8Array) || b.length !== 12 || b[0] !== 80 || b[1] !== 88 ||
      b[2] !== 74 || b[3] !== 70 || b[4] !== 1 || b[5] !== 12 || ![0, 1, 3].includes(b[6]) ||
      b[7] !== 0 || b[11] !== 0 || (b[6] === 0 && b.subarray(8, 11).some(Boolean))) throw new Error('Invalid PXJF frame');
  const result = normalizeFlashDiagnostics({schemaVersion: 1, scope: 'cached-flash-probe',
    jedecId: b[6] ? Array.from(b.subarray(8, 11)) : null, geometrySupported: b[6] === 3});
  if (!result) throw new Error('Invalid JEDEC ID');
  return result;
}

// Vendor code only. Neither a capacity code nor a matching 3-byte tuple identifies a package suffix.
export function flashManufacturer(id) {
  return ({0xef: 'Winbond', 0xeb: 'TsingTeng'})[id?.[0]] || null;
}
