import test from 'node:test';
import assert from 'node:assert/strict';
import reference from '../src/data/online-usage-reference.json' with { type: 'json' };
import { compareUsageQuality } from '../src/lib/catalogue-usage-quality.js';

function expandReference() {
  const data = { amiibos: {} };
  for (const profile of reference.profiles) {
    for (const id of profile.figures) {
      const figure = data.amiibos[id] = { gamesSwitch: [], games3DS: [], gamesSwitch2: [], gamesWiiU: [] };
      for (const index of profile.notes) {
        const [platform, gameId, text] = reference.records[index];
        figure[platform].push({ gameName: 'Renamed title', gameID: ['ffffffffffffffff', gameId.toUpperCase()],
          amiiboUsage: [{ Usage: text, write: profile.writable.includes(index) }] });
      }
    }
  }
  return data;
}
test('regional IDs and names may change; losing one old note or flag cannot be masked by new rows', () => {
  const data = expandReference();
  assert.deepEqual(compareUsageQuality(data), { status: 'retained', missingNotes: 0, missingWriteFlags: 0 });
  const rows = Object.values(data.amiibos).flatMap(figure => Object.values(figure).flat())
    .flatMap(game => game.amiiboUsage);
  rows.find(row => !row.write).Usage = ' \t ';
  rows.find(row => row.write).write = false;
  const extra = structuredClone(Object.values(data.amiibos)[0]);
  data.amiibos['0xffffffffffffffff'] = extra;
  const expected = { status: 'loss', missingNotes: 1, missingWriteFlags: 1 };
  assert.deepEqual(compareUsageQuality(data), expected);
  assert.deepEqual(compareUsageQuality(data), expected);
});
test('a lost figure retains all of its expected notes and flags in the comparison', () => {
  const data = expandReference();
  const profile = reference.profiles.find(row => row.writable.length);
  delete data.amiibos[profile.figures[0]];
  assert.deepEqual(compareUsageQuality(data), {
    status: 'loss', missingNotes: profile.notes.length, missingWriteFlags: profile.writable.length,
  });
});
test('malformed usage rows are not reported as passing the guard', () => {
  const figure = { games3DS: [], gamesWiiU: [], gamesSwitch: [], gamesSwitch2: [] };
  figure.gamesSwitch.push({ gameID: ['0123456789abcdef'], amiiboUsage: [{ Usage: 'Example', write: 'false' }] });
  assert.throws(() => compareUsageQuality({ amiibos: { '0x0000000000000000': figure } }), TypeError);
  assert.throws(() => compareUsageQuality({ amiibos: {} }), TypeError);
});
