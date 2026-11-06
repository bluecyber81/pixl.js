import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHAMELEON_SLOT_FORMAT, CHAMELEON_REPAIR_OFFSETS, chameleonSlotFilename, inspectChameleonConfig, inspectChameleonSlot, prepareChameleonUidRepair } from '../src/lib/chameleon-inspection.js';
import { syntheticTypes, syntheticConfig, syntheticSlot } from './fixtures/chameleon-slot-synthetic.mjs';

const context = (type = 1103, slotIndex = 0) => ({ configBytes: syntheticConfig(type, slotIndex), slotIndex });
test('four documented MF0 formats identify the legacy pattern with independent exact lengths', () => {
  for (const [type, size] of syntheticTypes) {
    for (const index of [0, 8, 49]) {
      const bytes = syntheticSlot(type), before = bytes.slice(), result = inspectChameleonSlot(bytes, context(type, index));
      assert.equal(result.size, size); assert.equal(result.typeId, type); assert.equal(result.expectedBytes, size);
      assert.equal(result.format, CHAMELEON_SLOT_FORMAT); assert.equal(result.status, 'legacy-uid-copy');
      assert.equal(result.bcc0Valid, true); assert.equal(result.bcc1Valid, true); assert.equal(result.uidMatches, false);
      assert.equal(result.legacyCopyPattern, true); assert.equal(result.repairable, true); assert.deepEqual(bytes, before);
      assert.equal(Object.keys(result).some(key => /^(uid|anticollision|memory|bytes)$/i.test(key)), false, 'no raw UID or byte payload in report');
    }
  }
});
test('corrected copy changes only absolute offsets 7..10, preserving all bytes and source buffers', () => {
  assert.deepEqual(CHAMELEON_REPAIR_OFFSETS, [7, 8, 9, 10]);
  for (const [type] of syntheticTypes) {
    for (const buffer of [syntheticSlot(type), Buffer.from(syntheticSlot(type))]) {
      const before = Uint8Array.from(buffer), config = context(type, 49), configBefore = config.configBytes.slice();
      const repaired = prepareChameleonUidRepair(buffer, config);
      assert.equal(repaired.filename, '49.uid-corrected.bin');
      assert.deepEqual(Uint8Array.from(buffer), before); assert.deepEqual(config.configBytes, configBefore);
      assert.equal(repaired.bytes.length, buffer.length); assert.deepEqual(repaired.changedOffsets, [7, 8, 9, 10]);
      const changed = [...buffer.keys()].filter(i => buffer[i] !== repaired.bytes[i]);
      assert.deepEqual(changed, repaired.changedOffsets);
      assert.deepEqual(repaired.bytes.subarray(273), before.subarray(273));
      assert.deepEqual(repaired.bytes.subarray(11, 273), before.subarray(11, 273));
      assert.deepEqual([...repaired.bytes.subarray(4, 11)], [4, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]);
      assert.equal(repaired.inspection.status, 'consistent'); assert.equal(repaired.inspection.repairable, false);
      assert.throws(() => prepareChameleonUidRepair(repaired.bytes, config), /not-eligible/);
    }
  }
});
test('correct copies, coincidentally equal copies, unrelated mismatches and bad BCC are never repaired', () => {
  for (const [type] of syntheticTypes) {
    const cases = [
      [syntheticSlot(type, false), 'consistent'],
      [syntheticSlot(type, true, [4, 0x12, 0x34, 0xaa, 0xaa, 0xaa, 0xaa]), 'consistent'],
      [(() => { const b = syntheticSlot(type); b[4] ^= 1; return b; })(), 'uid-mismatch'],
      [(() => { const b = syntheticSlot(type); b[276] ^= 1; return b; })(), 'invalid-bcc'],
      [(() => { const b = syntheticSlot(type); b[281] ^= 1; return b; })(), 'invalid-bcc'],
    ];
    for (const [bytes, status] of cases) {
      const before = bytes.slice(), report = inspectChameleonSlot(bytes, context(type));
      assert.equal(report.status, status); assert.equal(report.repairable, false);
      assert.throws(() => prepareChameleonUidRepair(bytes, context(type)), /not-eligible/); assert.deepEqual(bytes, before);
    }
  }
});
test('config must be exact current layout, not inferred from the slot length or a declared type', () => {
  const slot = syntheticSlot();
  for (const config of [undefined, new Uint8Array(), new Uint8Array(11), new Uint8Array(405), new Uint8Array(412),
    (() => { const b = syntheticConfig(); b[0] = 3; return b; })(),
    (() => { const b = syntheticConfig(); b[0] = 9; return b; })(),
    (() => { const b = syntheticConfig(); b[1] = 1; return b; })(),
    ...[2, 3, 4, 5, 6, 7].map(index => { const b = syntheticConfig(); b[index] |= 0x80; return b; })]) {
    assert.equal(inspectChameleonConfig(config).supported, false);
    assert.equal(inspectChameleonSlot(slot, { configBytes: config, slotIndex: 0 }).repairable, false);
  }
  for (const index of [undefined, '', '0', -1, 0.5, NaN, Infinity, 1, 50]) {
    assert.equal(inspectChameleonSlot(slot, { configBytes: syntheticConfig(), slotIndex: index }).reason, 'slot-index');
  }
  assert.equal(inspectChameleonSlot(slot, { type: 1103, format: CHAMELEON_SLOT_FORMAT }).supported, false);
});
test('MF Classic, NTAG, V3, unknown types, raw dumps, alternate ABI and trailing data fail closed', () => {
  for (const type of [0, 2, 6, 100, 1000, 1001, 1002, 1003, 1100, 1101, 1102, 1107, 1108, 1200, 65535]) {
    const report = inspectChameleonSlot(syntheticSlot(), context(type));
    assert.equal(report.reason, 'tag-type'); assert.equal(report.repairable, false);
  }
  for (const [type, size] of syntheticTypes) {
    for (const length of [0, 64, 144, 180, 540, size - 1, size + 1, size + 6, 1024, 2048, 100000]) {
      const report = inspectChameleonSlot(new Uint8Array(length), context(type));
      assert.equal(report.reason, 'slot-size'); assert.equal(report.repairable, false);
    }
    for (const [offset, value] of [[0, 4], [0, 10], [1, 4], [2, 1], [3, 8], [270, 2], [271, 1], [272, 1]]) {
      const bytes = syntheticSlot(type); bytes[offset] = value;
      assert.equal(inspectChameleonSlot(bytes, context(type)).reason, 'slot-layout');
      assert.throws(() => prepareChameleonUidRepair(bytes, context(type)), /not-eligible/);
    }
  }
});
test('repair rechecks input and supports byte views without rewriting surrounding storage', () => {
  const storage = new Uint8Array(357).fill(0x5a); storage.set(syntheticSlot(), 10);
  const view = storage.subarray(10, 347), before = storage.slice();
  assert.equal(inspectChameleonSlot(view, context()).repairable, true);
  prepareChameleonUidRepair(view, context()); assert.deepEqual(storage, before);
  view[4] ^= 1; assert.throws(() => prepareChameleonUidRepair(view, context()), /not-eligible/);
  assert.equal(inspectChameleonSlot(syntheticSlot().buffer, { configBytes: syntheticConfig().buffer, slotIndex: 0 }).repairable, true);
  for (const value of [null, 'binary', [7, 0x44], new DataView(new ArrayBuffer(337))]) assert.equal(inspectChameleonSlot(value, context()).supported, false);
  assert.equal(chameleonSlotFilename(0), '00.bin'); assert.equal(chameleonSlotFilename(49), '49.bin');
  for (const value of [-1, 50, 1.5, '0', null]) assert.equal(chameleonSlotFilename(value), null);
});
test('factory and helper source retain 3+4 mapping; loading does not silently rewrite UID', () => {
  const read = name => fs.readFileSync(new URL(`../../fw/${name}`, import.meta.url), 'utf8');
  const source = read('components/chameleon-ultra/firmware/application/src/rfid/nfctag/hf/nfc_mf0_ntag.c');
  assert.match(source, /memcpy\(p_ntag_information->res_coll\.uid, p_ntag_information->memory\[0\], 3\)/);
  assert.match(source, /memcpy\(p_ntag_information->res_coll\.uid \+ 3, p_ntag_information->memory\[1\], 4\)/);
  const loader = source.slice(source.indexOf('int nfc_tag_mf0_ntag_data_loadcb('), source.indexOf('// Initialized NTAG factory data'));
  assert.doesNotMatch(loader, /memcpy|memmove|memset|uid\[.*\]\s*=/);
  const helper = read('application/src/app/chameleon/port/tag_helper.c');
  for (const [i, page, byte] of [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 1, 0], [4, 1, 1], [5, 1, 2], [6, 1, 3]]) {
    assert.ok(helper.includes(`coll_res->uid[${i}] = m_tag_information->memory[${page}][${byte}];`));
  }
  assert.match(read('application/Makefile'), /CFLAGS \+= .*?-fshort-enums/);
});
