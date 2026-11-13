import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { normalizeCatalogueSource, compareCatalogueEntries, mergeCatalogueEntries } from '../src/lib/catalogue-updates.js';
import { filterCatalogue } from '../src/lib/catalogue.js';
import { inspectTagStructure, publicFigureImage } from '../src/lib/figure-info.js';
import { gameGuides } from '../src/data/game-guides.js';

const data=JSON.parse(fs.readFileSync(new URL('../src/data/catalogue.json',import.meta.url)));
const bytes=fs.readFileSync(new URL('../third-party/amiiboapi/amiibo.json',import.meta.url));
const raw=JSON.parse(bytes);
const reviewed=[['1f00010004c51e03','Sword Kirby (& Dragoon)'],['1f02010004c81e03','Noir Dedede (& Hydra)']];
const addedIds=new Set(reviewed.map(([id])=>id));

test('November riders retain the reviewed immutable IDs, exact source hash and metadata dates',()=>{
  assert.equal(data.commit,'855a0ff4308278de756bed01de1eca89936f456b');
  assert.equal(data.sourceSha256,'cacc7d31f935f43e601fa9f4f957f3f9b74956304206049c1cfadfa3b2e3278c');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),data.sourceSha256);
  assert.equal(data.entries.length,954);
  for(const [id,name] of reviewed){
    const rows=data.entries.filter(e=>e.id===id);assert.equal(rows.length,1);
    assert.equal(rows[0].name,name);assert.equal(rows[0].type,'Figure');
    assert.equal(rows[0].series,'Kirby Air Riders');assert.equal(rows[0].firmwareIdKnown,false);
    assert.deepEqual(raw.amiibos['0x'+id].release,{au:'2026-11-12',na:'2026-11-12',eu:'2026-11-12',jp:'2026-11-12'});
  }
});
test('online merge exposes exactly two additions without claiming old firmware knows their IDs',()=>{
  const before=data.entries.filter(e=>!addedIds.has(e.id));
  const remote=normalizeCatalogueSource(raw), diff=compareCatalogueEntries(before,remote);
  assert.deepEqual(diff.counts,{baseline:952,source:954,added:2,changed:0,absentFromSource:0,merged:954});
  assert.deepEqual(diff.added.map(e=>e.id),[...addedIds]);
  assert.ok(diff.added.every(e=>e.firmwareIdKnown===false));
  const merged=mergeCatalogueEntries(before,remote);
  assert.ok(merged.filter(e=>addedIds.has(e.id)).every(e=>e.firmwareIdKnown===false));
});
test('November riders are searchable and explicitly included in the reviewed Kirby game guide',()=>{
  const guide=gameGuides.find(g=>g.id==='kirby-air-riders');
  assert.equal(new Set(guide.ids).size,7);
  for(const [id,name] of reviewed){
    assert(guide.ids.includes(id));
    assert.equal(filterCatalogue(data.entries,{query:id.toUpperCase()})[0].id,id);
    assert.equal(filterCatalogue(data.entries,{query:name.split(' (&')[0]})[0].id,id);
  }
});
test('new rider suffix03 follows existing structural length checks, without a cryptographic or hardware claim',()=>{
  for(const [id] of reviewed){
    const data=new Uint8Array(2048);data.set(Buffer.from(id,'hex'),84);
    const result=inspectTagStructure(data);
    assert.equal(result.id,id);assert.equal(result.isV3,true);
    assert.equal(result.status,'structure-consistent');assert.equal(result.cryptography,'not-checked');
    assert.deepEqual(result.vehicleCandidates,[]);
    assert(inspectTagStructure(data.slice(0,540)).issues.includes('v3-length'));
    assert.equal(publicFigureImage(id),`https://raw.githubusercontent.com/8bitDream/AmiiboAPI/${dataCommit}/images/icon_${id.slice(0,8)}-${id.slice(8)}.png`);
  }
});
const dataCommit='855a0ff4308278de756bed01de1eca89936f456b';
