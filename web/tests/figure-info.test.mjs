import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { figureId, metadataFigureId, publicFigureLink, publicFigureImage, inspectTagStructure, inspectLocalTagFile } from '../src/lib/figure-info.js';
import { publicFigureQr } from '../src/lib/figure-qr.js';

function fixture(size = 540, id = '0000000000000002') {
  // Synthetic structural fixture, no real UID, key, owner or dump.
  const bytes = new Uint8Array(size);
  bytes.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4]);
  bytes.set(Buffer.from(id, 'hex'), 84);
  return bytes;
}

test('public IDs reject partial/malicious input and retain Mario zero head', () => {
  assert.equal(metadataFigureId({ head: 0, tail: 2 }), '0000000000000002');
  assert.equal(metadataFigureId({ head: 0xffffffff, tail: 2 }), 'ffffffff00000002');
  assert.equal(figureId('01010000000E0002'), '01010000000e0002');
  for (const id of ['', null, 3, '0000000000000000', '0000000000000002/evil', '<script>', '0x0000000000000002']) {
    assert.equal(figureId(id), null); assert.equal(publicFigureLink(id), null);
    assert.equal(publicFigureImage(id), null); assert.equal(publicFigureQr(id), null);
  }
  for (const value of [-1, NaN, 1.1, 0x100000000, '2', null]) assert.equal(metadataFigureId({ head: value, tail: 2 }), null);
  assert.equal(metadataFigureId({ head: 0, tail: 0 }), null);
  assert.equal(publicFigureLink('01010000000e0002'), 'https://amiibo.life/nfc/01010000-000E0002');
  assert.match(publicFigureImage('0000000000000002'), /^https:\/\/raw\.githubusercontent\.com\/8bitDream\/AmiiboAPI\/[0-9a-f]{40}\/images\/icon_00000000-00000002\.png$/);
});

test('online image revisions accept only immutable GitHub commit IDs and stay on the fixed source', () => {
  const id = '0000000000000002', commit = '85a7d81c06299e7bc386a4d20fd579463400511d';
  assert.equal(publicFigureImage(id, commit), `https://raw.githubusercontent.com/8bitDream/AmiiboAPI/${commit}/images/icon_00000000-00000002.png`);
  for (const value of [null, 1, '', 'master', '../evil', 'https://example.com/', commit + '/evil']) {
    assert.equal(publicFigureImage(id, value), publicFigureImage(id));
  }
  assert.equal(publicFigureImage('invalid', commit), null);
});

test('supported classic layouts have local header checks without private fields or crypto claims', () => {
  for (const size of [532, 540, 572]) {
    const input = fixture(size), before = input.slice(), result = inspectTagStructure(input);
    assert.equal(result.status, 'structure-consistent');
    assert.equal(result.id, '0000000000000002');
    assert.deepEqual(input, before);
    assert.equal(result.cryptography, 'not-checked');
    assert.equal(result.ownerAndGameData, 'not-checked');
    assert.deepEqual(Object.keys(result).sort(), ['cryptography','id','isV3','issues','ownerAndGameData','size','status','supportedLength'].sort());
  }
  assert.throws(() => inspectTagStructure([1,2,3]));
});

test('structural mismatches are reported precisely without treating missing optional game data as invalid', () => {
  const bytes = fixture();
  bytes[3] ^= 1;
  assert.deepEqual(inspectTagStructure(bytes).issues, ['bcc0']);
  bytes[8] ^= 1;
  assert.deepEqual(inspectTagStructure(bytes).issues, ['bcc0','bcc1']);
  bytes[0] = 3;
  assert.ok(inspectTagStructure(bytes).issues.includes('manufacturer'));
  const emptyId = fixture(); emptyId.fill(0,84,92);
  assert.deepEqual(inspectTagStructure(emptyId).issues, ['missing-id']);
  // Owner/game bytes were already zero; the public structural check must not reject them.
  assert.equal(inspectTagStructure(fixture()).status, 'structure-consistent');
  // This is RFUI, not a dynamic-lock bit check.
  for (const value of [0, 0xbf, 0xbd]) { const data = fixture(); data[523] = value; assert.equal(inspectTagStructure(data).status, 'structure-consistent'); }
});

test('V3 requires its 2K extent; 2K unknown/padded slots never inherit classic header assertions', () => {
  assert.deepEqual(inspectTagStructure(fixture(540,'0000000000000003')).issues, ['v3-length']);
  for (const id of ['0000000000000003','ffffffffffffffff','0000000000000002']) {
    const data = fixture(2048,id); data.fill(0,0,9);
    const result = inspectTagStructure(data);
    assert.deepEqual(result.issues, []); assert.equal(result.isV3,id.endsWith('03'));
  }
});

test('local file reading rejects unsupported/oversize inputs before allocating and catches truncated reads', async () => {
  for (const size of [0,531,541,2049,1e12]) {
    let reads=0;
    const result=await inspectLocalTagFile({size,arrayBuffer(){ reads++; throw new Error('must not read'); }});
    assert.equal(result.status,'unsupported-length'); assert.equal(result.size,size); assert.equal(reads,0);
  }
  await assert.rejects(inspectLocalTagFile({size:540,arrayBuffer:async()=>new ArrayBuffer(532)}), /length changed/);
  await assert.rejects(inspectLocalTagFile({size:540,arrayBuffer:async()=>new Uint8Array(540)}), /length changed/);
  const result=await inspectLocalTagFile({size:540,arrayBuffer:async()=>fixture().buffer});
  assert.equal(result.status,'structure-consistent');
});

test('QR is local SVG for a fixed public URL and vendor source stays pinned', () => {
  const qr=publicFigureQr('0000000000000002');
  assert.equal(qr.url,'https://amiibo.life/nfc/00000000-00000002');
  assert.match(qr.dataUrl,/^data:image\/svg\+xml;charset=utf-8,/);
  const svg=decodeURIComponent(qr.dataUrl.split(',')[1]);
  assert.match(svg,/<svg/); assert.match(svg,/<path/);
  assert.doesNotMatch(svg,/<script|href=|onload=|<foreignObject|http[^:]*:\/\/(?!www\.w3\.org)/);
  assert.ok(qr.size>=126 && qr.size<=300);
  const vendor=fs.readFileSync(new URL('../third-party/qrcode-generator/qrcode.mjs',import.meta.url));
  assert.equal(crypto.createHash('sha256').update(vendor).digest('hex'),'ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0');
  assert.match(fs.readFileSync(new URL('../third-party/qrcode-generator/LICENSE',import.meta.url),'utf8'),/Permission is hereby granted/);
});
