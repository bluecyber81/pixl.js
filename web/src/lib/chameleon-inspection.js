/* Local-only, bounded inspection of the Allmiibo Chameleon v8 slot ABI.
 *
 * Source proof (repository-relative):
 * fw/application/Makefile: -fshort-enums
 * fw/.../nfctag/tag_emulation.h: config version 8, 4 + 8 * slots, at most 50;
 * fw/.../nfctag/tag_base_type.h: MF0 type IDs 1103..1106.
 * fw/.../hf/nfc_14a.h: one-byte UID length, ATQA[2], SAK[1], UID[10],
 *   ATS[255] + ATS length = 270 bytes. UID starts at offset 4.
 * fw/.../hf/nfc_mf0_ntag.h: three config bytes, then four-byte pages.
 * fw/.../hf/nfc_mf0_ntag.c: get_information_size_by_tag_type saves exactly
 *   270 + 3 + total_pages * 4 bytes; factory copies 3 + 4 UID bytes.
 * fw/application/src/app/chameleon/port/{fds_utils,tag_helper}.c:
 *   NN.bin contains that raw struct (no type/version header); the helper
 *   maps page 0 bytes 0..2 and page 1 bytes 0..3 into res_coll.uid.
 *
 * A matching config.bin and explicit zero-based slot index are mandatory.
 * File pairing/provenance cannot be authenticated by this headerless format.
 * No MF Classic, old config migrations, V3 or raw tag dumps are inferred.
 */
export const CHAMELEON_SLOT_FORMAT = 'allmiibo-chameleon-v8-short-enums-mf0';
export const CHAMELEON_CONFIG_MAX_BYTES = 404;
export const CHAMELEON_SLOT_MAX_BYTES = 489;
export const CHAMELEON_UID_OFFSET = 4;
export const CHAMELEON_MEMORY_OFFSET = 273;
// Only the last four bytes differ in the historical contiguous-copy defect.
export const CHAMELEON_REPAIR_OFFSETS = Object.freeze([7, 8, 9, 10]);
const types = Object.freeze({
  1103: Object.freeze({ name: 'MF0ICU1 · MIFARE Ultralight', bytes: 337, pages: 16 }),
  1104: Object.freeze({ name: 'MF0ICU2 · MIFARE Ultralight C', bytes: 417, pages: 36 }),
  1105: Object.freeze({ name: 'MF0UL11 · MIFARE Ultralight EV1', bytes: 405, pages: 33 }),
  1106: Object.freeze({ name: 'MF0UL21 · MIFARE Ultralight EV1', bytes: 489, pages: 54 }),
});
function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const u16 = (bytes, offset) => bytes[offset] | bytes[offset + 1] << 8;
export function chameleonSlotFilename(slotIndex) {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < 50 ? `${String(slotIndex).padStart(2, '0')}.bin` : null;
}
export function inspectChameleonConfig(input) {
  const bytes = asBytes(input);
  const fail = reason => ({ supported: false, reason, slots: [] });
  if (!bytes || bytes.length < 12 || bytes.length > CHAMELEON_CONFIG_MAX_BYTES || (bytes.length - 4) % 8) return fail('config-size');
  if (bytes[0] !== 8) return fail('config-version');
  const count = (bytes.length - 4) / 8;
  if (bytes[1] >= count || bytes[2] || bytes[3]) return fail('config-layout');
  const slots = [];
  for (let index = 0; index < count; index++) {
    const offset = 4 + index * 8;
    // Current config has only enabled_hf/enabled_lf bits in this word.
    if ((bytes[offset] & 0xfc) || bytes[offset + 1] || bytes[offset + 2] || bytes[offset + 3]) return fail('config-layout');
    const typeId = u16(bytes, offset + 4), type = types[typeId];
    slots.push({ index, typeId, supported: !!type, type: type?.name ?? null, expectedBytes: type?.bytes ?? null });
  }
  return { supported: true, version: 8, format: CHAMELEON_SLOT_FORMAT, slots };
}
export function inspectChameleonSlot(input, { configBytes, slotIndex } = {}) {
  const bytes = asBytes(input), config = inspectChameleonConfig(configBytes);
  const base = { supported: false, repairable: false, size: bytes?.length ?? null, slotIndex, status: 'unsupported' };
  if (!config.supported) return { ...base, reason: config.reason };
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= config.slots.length) return { ...base, reason: 'slot-index' };
  const slot = config.slots[slotIndex];
  const identified = { ...base, typeId: slot.typeId, type: slot.type, expectedBytes: slot.expectedBytes };
  if (!slot.supported) return { ...identified, reason: 'tag-type' };
  if (!bytes || bytes.length !== slot.expectedBytes) return { ...identified, reason: 'slot-size' };
  // A known MF0 slot uses double-size UID, ATQA 0x0044, SAK 0. Reject
  // alternate identities and unknown config bits instead of reinterpreting.
  if (bytes[0] !== 7 || bytes[1] !== 0x44 || bytes[2] !== 0 || bytes[3] !== 0 ||
      (bytes[270] & 0xfe) || bytes[271] || bytes[272]) return { ...identified, reason: 'slot-layout' };
  const memory = bytes.subarray(CHAMELEON_MEMORY_OFFSET);
  const uid = [memory[0], memory[1], memory[2], memory[4], memory[5], memory[6], memory[7]];
  const anticollision = bytes.subarray(CHAMELEON_UID_OFFSET, CHAMELEON_UID_OFFSET + 7);
  const bcc0Valid = memory[3] === (0x88 ^ uid[0] ^ uid[1] ^ uid[2]);
  const bcc1Valid = memory[8] === (uid[3] ^ uid[4] ^ uid[5] ^ uid[6]);
  const uidMatches = equal(anticollision, uid);
  const legacyCopyPattern = !uidMatches && equal(anticollision, memory.subarray(0, 7));
  const repairable = bcc0Valid && bcc1Valid && legacyCopyPattern;
  return { ...identified, supported: true, reason: null, format: CHAMELEON_SLOT_FORMAT,
    bcc0Valid, bcc1Valid, uidMatches, legacyCopyPattern, repairable,
    status: !bcc0Valid || !bcc1Valid ? 'invalid-bcc' : uidMatches ? 'consistent' : legacyCopyPattern ? 'legacy-uid-copy' : 'uid-mismatch' };
}
export function prepareChameleonUidRepair(input, context) {
  // Reinspect actual bytes; never trust a caller-provided diagnostic result.
  const before = inspectChameleonSlot(input, context);
  if (!before.repairable) throw new Error('chameleon-repair-not-eligible');
  const original = asBytes(input), bytes = Uint8Array.from(original);
  bytes.set(bytes.subarray(CHAMELEON_MEMORY_OFFSET, CHAMELEON_MEMORY_OFFSET + 3), CHAMELEON_UID_OFFSET);
  bytes.set(bytes.subarray(CHAMELEON_MEMORY_OFFSET + 4, CHAMELEON_MEMORY_OFFSET + 8), CHAMELEON_UID_OFFSET + 3);
  const changedOffsets = [];
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] !== original[index]) {
      if (!CHAMELEON_REPAIR_OFFSETS.includes(index)) throw new Error('chameleon-repair-boundary');
      changedOffsets.push(index);
    }
  }
  const inspection = inspectChameleonSlot(bytes, context);
  if (!changedOffsets.length || inspection.status !== 'consistent') throw new Error('chameleon-repair-verification');
  return { bytes, changedOffsets, inspection,
    filename: chameleonSlotFilename(context.slotIndex).replace(/\.bin$/, '.uid-corrected.bin') };
}
