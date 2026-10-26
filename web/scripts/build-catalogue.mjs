// Offline regeneration only, from the pinned and attributed metadata snapshot.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseKnownFigureIds } from '../src/lib/catalogue.js';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(web,'third-party/amiiboapi/amiibo.json'));
const hash=crypto.createHash('sha256').update(source).digest('hex');
if(hash!=='6c538e28f838211a9b9425bdda3a3efdb091ed33e1edd738d81e34dfecdca16a')throw new Error('Pinned metadata hash changed');
const input=JSON.parse(source),known=parseKnownFigureIds(fs.readFileSync(path.join(web,'third-party/amiiboapi/de317-known-ids.txt'),'utf8'));
const entries=Object.entries(input.amiibos).map(([key,value])=>{
  const id=key.replace(/^0x/,'').toLowerCase();
  if(!/^[0-9a-f]{16}$/.test(id) || typeof value.name!=='string')throw new Error('Invalid metadata');
  return {id,name:value.name,series:input.amiibo_series['0x'+id.slice(12,14)]||'Unknown',game:input.game_series['0x'+id.slice(0,3)]||'Unknown',type:input.types['0x'+id.slice(6,8)]||'Unknown',release:value.release||{},firmwareIdKnown:known.has(id)};
});
entries.sort((a,b)=>a.name.toLowerCase()<b.name.toLowerCase()?-1:a.name.toLowerCase()>b.name.toLowerCase()?1:a.id<b.id?-1:a.id>b.id?1:0);
const data={schema:1,checkedDate:'2026-10-23',commit:'5fc4e058fea1092761a419e4ad1aeda56a39452e',sourceUrl:'https://github.com/8bitDream/AmiiboAPI/tree/5fc4e058fea1092761a419e4ad1aeda56a39452e',sourceSha256:hash,entries};
fs.writeFileSync(path.join(web,'src/data/catalogue.json'),JSON.stringify(data)+'\n');
console.log(`Generated ${entries.length} metadata entries; no network requests or figure files.`);
