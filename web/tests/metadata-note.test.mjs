import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataNoteInfo } from '../src/lib/metadata-note.js';

test('metadata note budget preserves valid Unicode, whitespace, BOM and the exact 89-byte boundary', () => {
  for (const note of ['', 'ä 😀 日本', '\ufeffkeep', 'line1\nline2', 'a'.repeat(89), 'a'.repeat(87)+'ä']) {
    const info=metadataNoteInfo(note);
    assert.equal(info.valid,true);assert.equal(info.bytes,Buffer.byteLength(note,'utf8'));assert.equal(info.reason,null);
  }
  for (const note of ['a'.repeat(90),'a'.repeat(88)+'ä','😀'.repeat(23)]) {
    assert.equal(metadataNoteInfo(note).reason,'length');
  }
});

test('metadata note validator rejects every isolated surrogate and never rewrites the input', () => {
  let cases=0;
  for(let code=0xd800;code<=0xdfff;code++) {
    const info=metadataNoteInfo('keep'+String.fromCharCode(code)+'text');
    assert.equal(info.valid,false);assert.equal(info.reason,'invalid');cases++;
  }
  for (const value of ['\0', 'head\0tail', undefined, null, 123, {}, new String('a')]) assert.equal(metadataNoteInfo(value).reason,'invalid');
  assert.equal(cases,2048);
});

test('paired astral characters have a deterministic four-byte UTF-8 budget', () => {
  for(let index=0;index<1000;index++) {
    const code=0x10000+((index*7919)%0x100000),note=String.fromCodePoint(code);
    const info=metadataNoteInfo(note);
    assert.equal(info.bytes,4);assert.equal(info.valid,true);assert.equal(info.bytes,Buffer.byteLength(note));
  }
});
