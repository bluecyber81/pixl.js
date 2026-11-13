// Offline regeneration only, from the pinned and attributed metadata snapshot.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseKnownFigureIds } from '../src/lib/catalogue.js';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(web,'third-party/amiiboapi/amiibo.json'));
const hash=crypto.createHash('sha256').update(source).digest('hex');
if(hash!=='cacc7d31f935f43e601fa9f4f957f3f9b74956304206049c1cfadfa3b2e3278c')throw new Error('Pinned metadata hash changed');
const input=JSON.parse(source),known=parseKnownFigureIds(fs.readFileSync(path.join(web,'third-party/amiiboapi/de317-known-ids.txt'),'utf8'));
const entries=Object.entries(input.amiibos).map(([key,value])=>{
  const id=key.replace(/^0x/,'').toLowerCase();
  if(!/^[0-9a-f]{16}$/.test(id) || typeof value.name!=='string')throw new Error('Invalid metadata');
  return {id,name:value.name,series:input.amiibo_series['0x'+id.slice(12,14)]||'Unknown',game:input.game_series['0x'+id.slice(0,3)]||'Unknown',type:input.types['0x'+id.slice(6,8)]||'Unknown',release:value.release||{},firmwareIdKnown:known.has(id)};
});
entries.sort((a,b)=>a.name.toLowerCase()<b.name.toLowerCase()?-1:a.name.toLowerCase()>b.name.toLowerCase()?1:a.id<b.id?-1:a.id>b.id?1:0);
const data={schema:1,checkedDate:'2026-11-13',commit:'855a0ff4308278de756bed01de1eca89936f456b',sourceUrl:'https://github.com/8bitDream/AmiiboAPI/tree/855a0ff4308278de756bed01de1eca89936f456b',sourceSha256:hash,entries};
fs.writeFileSync(path.join(web,'src/data/catalogue.json'),JSON.stringify(data)+'\n');
console.log(`Generated ${entries.length} metadata entries; no network requests or figure files.`);
