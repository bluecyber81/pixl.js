// Synthetic data only. No device backup, key or owner identity is included.
// Keep these offsets independent of the implementation being tested.
export const syntheticTypes = [[1103, 337], [1104, 417], [1105, 405], [1106, 489]];
export function syntheticConfig(type = 1103, index = 0, count = index + 1) {
  const bytes = new Uint8Array(4 + count * 8);
  bytes[0] = 8; bytes[1] = index;
  bytes[4 + index * 8] = 1;
  bytes[8 + index * 8] = type & 255; bytes[9 + index * 8] = type >>> 8;
  return bytes;
}
export function syntheticSlot(type = 1103, legacy = true, uid = [4, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]) {
  const bytes = Uint8Array.from({ length: syntheticTypes.find(item => item[0] === type)[1] }, (_, i) => (i * 29 + 17) & 255);
  bytes.set([7, 0x44, 0, 0], 0);
  bytes.set([1, 0, 0], 270);
  const bcc0 = 0x88 ^ uid[0] ^ uid[1] ^ uid[2], bcc1 = uid[3] ^ uid[4] ^ uid[5] ^ uid[6];
  bytes.set([uid[0], uid[1], uid[2], bcc0, ...uid.slice(3), bcc1], 273);
  bytes.set(legacy ? bytes.subarray(273, 280) : uid, 4);
  return bytes;
}
