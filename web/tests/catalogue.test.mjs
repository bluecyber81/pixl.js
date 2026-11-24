import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { filterCatalogue, cataloguePage, releaseLabel, parseKnownFigureIds } from '../src/lib/catalogue.js';
import { mergeCatalogueEntries } from '../src/lib/catalogue-updates.js';
import { gameGuides } from '../src/data/game-guides.js';
const data = JSON.parse(fs.readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'));
test('catalogue snapshot is pinned, attributed and uses unique exact identifiers', () => {
  const source = fs.readFileSync(new URL('../third-party/amiiboapi/amiibo.json', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), data.sourceSha256);
  assert.match(fs.readFileSync(new URL('../third-party/amiiboapi/LICENSE', import.meta.url), 'utf8'), /Nevin Vu/);
  assert.match(data.commit, /^[0-9a-f]{40}$/);
  assert.equal(new Set(data.entries.map(e => e.id)).size, data.entries.length);
  const upstreamIds = Object.keys(JSON.parse(source).amiibos).map(key => key.slice(2));
  assert.deepEqual(data.entries.filter(entry => !upstreamIds.includes(entry.id)).map(entry => entry.id).sort(),
    ['0100000004fd0902','0101000004ff0902']);
  assert.equal(data.entries.length, upstreamIds.length + 2);
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
  const known = parseKnownFigureIds(fs.readFileSync(new URL('../third-party/amiiboapi/de381-known-ids.txt', import.meta.url), 'utf8'));
  const firmwareTable = new URL('../../fw/data/amiidb_amiibo.csv', import.meta.url);
  if (fs.existsSync(firmwareTable)) {
    const ids = fs.readFileSync(firmwareTable, 'utf8').trimEnd().split(/\r?\n/).map(line => line.split(',', 1)[0]);
    assert.deepEqual(known, new Set(ids), 'The bundled ID list matches the LCD DE3.89 firmware table');
  }
  for (const entry of data.entries) assert.equal(entry.firmwareIdKnown, known.has(entry.id), entry.id);
  assert.equal(data.entries.filter(entry => entry.firmwareIdKnown).length, 956);
});
test('catalogue supports case, accent, multi-term, exact ID and series/type filtering', () => {
  assert.ok(filterCatalogue(data.entries, {query:'LINK zelda'}).length > 0);
  for (const query of ['Mineru-Konstrukt', 'Minerus Konstrukt', "Mineru's Construct"]) {
    assert.equal(filterCatalogue(data.entries, {query})[0].id, '010d000004a70902');
  }
  assert.ok(filterCatalogue(data.entries, { query: 'Chronik der Versiegelung' }).some(e => e.id === '010d000004a70902'));
  const mario = data.entries.find(e => e.name === 'Mario');
  assert.equal(filterCatalogue(data.entries, {query:mario.id.toUpperCase()})[0].id, mario.id);
  assert.equal(filterCatalogue([{name:'Étoile',id:'x',series:'S',type:'T',firmwareIdKnown:false}], {query:'etoile'}).length, 1);
  assert.equal(filterCatalogue(data.entries, {series:'does-not-exist'}).length, 0);
  assert.ok(filterCatalogue(data.entries, {kind:'Card'}).every(e=>e.type==='Card'));
  assert.equal(filterCatalogue([{name:'M',firmwareIdKnown:false}],{knownOnly:true}).length,0);
});
test('game title searches use the same exact editions as reviewed filters without widening to a whole franchise', () => {
  for (const id of ['fatal-fury-cotw', 'ocarina-of-time', 'kirby-forgotten-land-switch2', 'miitopia']) {
    const guide = gameGuides.find(game => game.id === id);
    const actual = filterCatalogue(data.entries, { query: guide.title });
    assert.deepEqual(new Set(actual.map(entry => entry.id)), new Set(guide.ids), id);
  }
  const fatal = filterCatalogue(data.entries, { query: 'City of the Wolves', kind: 'Card' });
  assert.equal(fatal.length, 8);
  assert.ok(!fatal.some(entry => entry.name === 'Ryu'));
  assert.ok(!filterCatalogue(data.entries, { query: 'Miitopia' }).some(entry => entry.id === '1f02010004c81e03'));
});
test('both the first 60 choices and every card page keep their order after a no-change merge', () => {
  const merged = mergeCatalogueEntries(data.entries, data.entries);
  const canon = merged.map(e => e.id);
  const visible = filterCatalogue(merged), bundled = data.entries.map(e => e.id);
  assert.deepEqual(canon, [...canon].sort());
  assert.notDeepEqual(canon.slice(0,60), bundled.slice(0,60));
  assert.deepEqual(visible.slice(0,60).map(e=>e.id), bundled.slice(0,60));
  assert.deepEqual(visible.map(e=>e.id), bundled);
  assert.deepEqual(merged.map(e=>e.id), canon);
});
test('same-name entries use their public ID as a stable tie break', () => {
  const rows = [{id:'c',name:'zelda'}, {id:'b',name:'Mario'}, {id:'a',name:'mario'}];
  for (const input of [rows, [...rows].reverse()]) {
    assert.deepEqual(filterCatalogue(input).map(e=>e.id), ['a','b','c']);
  }
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
