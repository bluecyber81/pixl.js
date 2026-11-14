// Regenerate from a downloaded, reviewed games_info.json. Only the input is read.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const commit = '855a0ff4308278de756bed01de1eca89936f456b';
const sha256 = 'bd100324c3d62a02759f28fa7454af35b5699ec7a87642bdb0e7a92592a228ce';
const raw = fs.readFileSync(process.argv[2]);
if (createHash('sha256').update(raw).digest('hex') !== sha256) {
  throw new Error('Input differs from the reviewed AmiiboAPI games_info.json');
}
const data = JSON.parse(raw);
const records = [], recordIds = new Map(), profiles = new Map();
for (const id of Object.keys(data.amiibos).sort()) {
  const notes = new Set(), writable = new Set();
  for (const [platform, games] of Object.entries(data.amiibos[id])) {
    for (const game of games) {
      const gameId = game.gameID.map(value => value.toLowerCase()).sort()[0];
      for (const row of game.amiiboUsage) {
        const identity = [platform, gameId, row.Usage.trim()];
        const key = JSON.stringify(identity);
        if (!recordIds.has(key)) {
          recordIds.set(key, records.length);
          records.push(identity);
        }
        const index = recordIds.get(key);
        notes.add(index);
        if (row.write) writable.add(index);
      }
    }
  }
  const ordered = set => [...set].sort((a, b) => a - b);
  const profile = { notes: ordered(notes), writable: ordered(writable) };
  const key = JSON.stringify(profile);
  if (!profiles.has(key)) profiles.set(key, { ...profile, figures: [] });
  profiles.get(key).figures.push(id);
}
const reference = { commit, sha256, records, profiles: [...profiles.values()] };
fs.writeFileSync(new URL('../src/data/online-usage-reference.json', import.meta.url),
  JSON.stringify(reference) + '\n');
