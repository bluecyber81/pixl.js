import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { filterCatalogue, cataloguePage, releaseLabel, parseKnownFigureIds } from '../src/lib/catalogue.js';
const data = JSON.parse(fs.readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'));
test('catalogue snapshot is pinned, attributed and uses unique exact identifiers', () => {
  const source = fs.readFileSync(new URL('../third-party/amiiboapi/amiibo.json', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), data.sourceSha256);
  assert.match(fs.readFileSync(new URL('../third-party/amiiboapi/LICENSE', import.meta.url), 'utf8'), /Nevin Vu/);
  assert.match(data.commit, /^[0-9a-f]{40}$/);
  assert.equal(new Set(data.entries.map(e => e.id)).size, data.entries.length);
  assert.equal(data.entries.length, Object.keys(JSON.parse(source).amiibos).length);
  for (const e of data.entries) {
    assert.match(e.id, /^[a-f0-9]{16}$/); assert.ok(e.name); assert.ok(e.series);
    assert.equal(typeof e.firmwareIdKnown, 'boolean'); assert.equal(e.image, undefined);
  }
});
test('known figure IDs accept Windows CRLF and every generated flag matches the source list', () => {
  const id = '0000000000000002', other = '01010000000e0002';
  assert.deepEqual([...parseKnownFigureIds(`${id}\r\n${other.toUpperCase()}\r\n`)], [id, other]);
  assert.deepEqual([...parseKnownFigureIds(`${id}\n\n${other}\n`)], [id, other]);
  assert.throws(() => parseKnownFigureIds(`${id}\nnot-an-id`));
  const known = parseKnownFigureIds(fs.readFileSync(new URL('../third-party/amiiboapi/de317-known-ids.txt', import.meta.url), 'utf8'));
  for (const entry of data.entries) assert.equal(entry.firmwareIdKnown, known.has(entry.id), entry.id);
  assert.equal(data.entries.filter(entry => entry.firmwareIdKnown).length, 952);
});
test('catalogue supports case, accent, multi-term, exact ID and series/type filtering', () => {
  assert.ok(filterCatalogue(data.entries, {query:'LINK zelda'}).length > 0);
  const mario = data.entries.find(e => e.name === 'Mario');
  assert.equal(filterCatalogue(data.entries, {query:mario.id.toUpperCase()})[0].id, mario.id);
  assert.equal(filterCatalogue([{name:'Étoile',id:'x',series:'S',type:'T',firmwareIdKnown:false}], {query:'etoile'}).length, 1);
  assert.equal(filterCatalogue(data.entries, {series:'does-not-exist'}).length, 0);
  assert.ok(filterCatalogue(data.entries, {kind:'Card'}).every(e=>e.type==='Card'));
  assert.equal(filterCatalogue([{name:'M',firmwareIdKnown:false}],{knownOnly:true}).length,0);
});
test('catalogue pagination clamps invalid and empty selections without rendering the whole list', () => {
  for (const page of [-1,0,1,999,NaN]) {
    const result = cataloguePage(data.entries,page); assert.ok(result.entries.length<=40); assert.ok(result.page>=1);
  }
  assert.deepEqual(cataloguePage([],100),{page:1,pages:1,total:0,entries:[]});
  assert.throws(()=>cataloguePage([],1,1000));
});
test('catalogue labels unknown and upcoming releases without implying regional availability', () => {
  assert.deepEqual(releaseLabel({release:{eu:null}},'2026-10-23'),{state:'unknown',date:null});
  assert.deepEqual(releaseLabel({release:{eu:'2026-11-12'}},'2026-10-23'),{state:'upcoming',date:'2026-11-12'});
  assert.deepEqual(releaseLabel({release:{jp:'2026-10-22',eu:'2026-11-12'}},'2026-10-23'),{state:'listed',date:'2026-10-22'});
});
