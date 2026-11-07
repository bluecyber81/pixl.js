// Public figure metadata and local structural checks only. No owner data, UID,
// signatures, keys, file contents or paths are returned or sent to a service.
export const IMAGE_COMMIT = '5fc4e058fea1092761a419e4ad1aeda56a39452e';
export const TAG_LENGTHS = Object.freeze([532, 540, 572, 2048]);
const airRidersIds = new Set(['1f00000004c41e03', '1f03010004c91e03', '1f04000004ca1e03', '1f02000004c71e03', '1f01000004c61e03']);
const observedVehicles = {
  'PB4W17:2': ['Warp Star'],
  'PB4W17:4': ['Winged Star'],
  'P45S63:4': ['Winged Star'],
  'PB5T42:4': ['Shadow Star'],
  'PC6V28:4': ['Tank Star', 'Hop Star'],
};

// Board codes overlap between vehicles. Only suggest models seen with this
// header in physical samples. Never return a per-copy identifier.
function vehicleCandidates(bytes) {
  if (bytes[960] !== 2 || bytes[961] !== 0 || bytes[985] !== 0x20 || bytes[986] !== 1 || bytes[987] !== 1) return [];
  const code = String.fromCharCode(...bytes.subarray(979, 985));
  return [...(observedVehicles[`${code}:${bytes[988]}`] || [])];
}

export function figureId(value) {
  if (typeof value !== 'string') return null;
  const id = value.toLowerCase();
  return /^[0-9a-f]{16}$/.test(id) && id !== '0000000000000000' ? id : null;
}

export function metadataFigureId(metadata) {
  const words = [metadata?.head, metadata?.tail];
  if (!words.every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) return null;
  return figureId(words.map(value => value.toString(16).padStart(8, '0')).join(''));
}

export function publicFigureLink(value) {
  const id = figureId(value);
  // amiibo.life's NFC lookup still returns 404 for these two published figures
  // (verified 2026-11-01). Their public figure pages resolve directly.
  if (id === '0000000404431c02') return 'https://amiibo.life/amiibo/my-mario-wood-blocks/mario-melody-car';
  if (id === '000a000404451c02') return 'https://amiibo.life/amiibo/my-mario-wood-blocks/toad';
  return id ? `https://amiibo.life/nfc/${id.slice(0, 8).toUpperCase()}-${id.slice(8).toUpperCase()}` : null;
}

export function publicFigureImage(value, commit = IMAGE_COMMIT) {
  const id = figureId(value);
  const revision = typeof commit === "string" && /^[a-f0-9]{40}$/.test(commit) ? commit : IMAGE_COMMIT;
  return id ? `https://raw.githubusercontent.com/8bitDream/AmiiboAPI/${revision}/images/icon_${id.slice(0, 8)}-${id.slice(8)}.png` : null;
}

export function inspectTagStructure(input) {
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!bytes) throw new TypeError('Expected a byte buffer');
  const base = { size: bytes.byteLength, supportedLength: TAG_LENGTHS.includes(bytes.byteLength),
    id: null, issues: [], cryptography: 'not-checked', ownerAndGameData: 'not-checked' };
  if (!base.supportedLength) return { ...base, status: 'unsupported-length' };
  const id = figureId(Array.from(bytes.subarray(84, 92), byte => byte.toString(16).padStart(2, '0')).join(''));
  const issues = [];
  // A 2K file can also contain a padded classic slot. Length alone does not
  // establish V3; do not impose classic NTAG215 checks on unknown 2K layouts.
  if (bytes.byteLength !== 2048) {
    if (bytes[0] !== 0x04) issues.push('manufacturer');
    if (bytes[3] !== (0x88 ^ bytes[0] ^ bytes[1] ^ bytes[2])) issues.push('bcc0');
    if (bytes[8] !== (bytes[4] ^ bytes[5] ^ bytes[6] ^ bytes[7])) issues.push('bcc1');
  }
  if (!id) issues.push('missing-id');
  const isV3 = id?.endsWith('03') === true;
  if (isV3 && bytes.byteLength !== 2048) issues.push('v3-length');
  const result = { ...base, id, isV3, issues, status: issues.length ? 'attention' : 'structure-consistent' };
  if (bytes.byteLength === 2048 && airRidersIds.has(id)) result.vehicleCandidates = vehicleCandidates(bytes);
  return result;
}

// Validate size before touching the buffer (also protects against huge files).
// Results contain neither file names nor tag bytes. Callers own stale-read UI guards.
export async function inspectLocalTagFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.arrayBuffer !== 'function') {
    throw new TypeError('Expected a file');
  }
  if (!TAG_LENGTHS.includes(file.size)) return {
    size: file.size, supportedLength: false, id: null, issues: [],
    status: 'unsupported-length', cryptography: 'not-checked', ownerAndGameData: 'not-checked'
  };
  const buffer = await file.arrayBuffer();
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size) throw new Error('File length changed');
  return inspectTagStructure(buffer);
}
