import test from 'node:test';
import assert from 'node:assert/strict';
import {figureSourceUrl, prepareFigureTransfer, FIGURE_DOWNLOAD_LIMITS} from '../src/lib/figure-transfer.js';
import {writeFigureDownloadLink, readFigureDownloadLink, exportFigureLinks, previewFigureLinks, importFigureLinks} from '../src/lib/figure-download-links.js';

const ID = '0000000000000002';
function storage(t) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window'), values = new Map();
  const localStorage = {getItem:k=>values.get(k)??null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k),
    key:i=>[...values.keys()][i]??null, get length(){return values.size;}};
  globalThis.window = Object.assign(new EventTarget(), {localStorage});
  t.after(()=>prior ? Object.defineProperty(globalThis,'window',prior) : Reflect.deleteProperty(globalThis,'window'));
  return values;
}
function encodedLengthUrl(length) {
  const base='https://files.example.com/', remaining=length-base.length;
  return base+'ß'.repeat(Math.floor(remaining/6))+'a'.repeat(remaining%6);
}

test('direct use, saved links and import/export share the encoded 4096-character boundary', async t=>{
  storage(t);
  for (const length of [4095,4096]) {
    const raw=encodedLengthUrl(length), canonical=new URL(raw).href;
    assert.equal(canonical.length,length); assert(raw.length<FIGURE_DOWNLOAD_LIMITS.maxUrlLength);
    assert.equal(figureSourceUrl(raw).href,canonical);
    assert.equal(writeFigureDownloadLink(ID,raw),canonical);
    assert.equal(readFigureDownloadLink(ID),canonical);
    const file=exportFigureLinks(), preview=previewFigureLinks(file);
    assert.equal(preview.valid,true); assert.equal(preview.rows[0].url,canonical);
    assert.equal(await importFigureLinks(preview,'add'),0);
    assert.equal(figureSourceUrl(preview.rows[0].url).href,canonical);
  }
});

test('overlong normalized Unicode URL is rejected before fetch or persistent modification', async t=>{
  const values=storage(t), good='https://files.example.com/tag.bin?signature=a%2Fb';
  writeFigureDownloadLink(ID,good); const before=[...values];
  for (const length of [4097,4230,7000]) {
    const raw=encodedLengthUrl(length); assert(raw.length<4096);
    assert.throws(()=>figureSourceUrl(raw),{code:'FIGURE_URL'});
    assert.throws(()=>writeFigureDownloadLink(ID,raw),{code:'FIGURE_URL'});
    let fetches=0;
    await assert.rejects(prepareFigureTransfer({url:raw,expectedId:ID,fetchImpl:()=>{fetches++;}}),{code:'FIGURE_URL'});
    assert.equal(fetches,0); assert.deepEqual([...values],before);
    const preview=previewFigureLinks(JSON.stringify({format:'allmiibo.figure-links',version:1,count:1,links:[{id:ID,url:raw}]}));
    assert.equal(preview.valid,false); assert.equal(preview.counts.invalid,1);
    await assert.rejects(importFigureLinks(preview,'replace'),{code:'FIGURE_LINK_FORMAT'});
    assert.deepEqual([...values],before);
  }
});

test('URL normalization preserves signed query bytes and applies the same IDN result to every consumer', t=>{
  storage(t);
  const raw='https://BÜCHER.example/äß.bin?signature=a%2fb&x=%E2%82%AC';
  const canonical=figureSourceUrl(raw).href;
  assert.match(canonical,/^https:\/\/xn--bcher-kva\.example\/%C3%A4%C3%9F\.bin\?signature=a%2fb&x=%E2%82%AC$/);
  assert.equal(writeFigureDownloadLink(ID,raw),canonical);
  assert.equal(readFigureDownloadLink(ID),canonical);
  assert.equal(previewFigureLinks(exportFigureLinks()).rows[0].url,canonical);
});
