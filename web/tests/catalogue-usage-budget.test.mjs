import test from 'node:test';
import assert from 'node:assert/strict';
import { compareUsageQuality } from '../src/lib/catalogue-usage-quality.js';
import reference from '../src/data/online-usage-reference.json' with { type:'json' };

const gameId = '0000000000000001';
const usage = {Usage:'Example game note',write:false};

function oneFigure(games) {
  return {amiibos:{'0x0000000000000001':{
    games3DS:[], gamesWiiU:[], gamesSwitch:games, gamesSwitch2:[]
  }}};
}

test('source with excessive regional IDs, usage rows or aggregate comparisons cannot claim retained notes', () => {
  const group = {gameID:Array(32).fill(gameId), amiiboUsage:Array(64).fill(usage)};
  for (const games of [
    [{...group, gameID:Array(33).fill(gameId)}],
    [{...group, amiiboUsage:Array(65).fill(usage)}],
    Array(49).fill(group),
  ]) {
    assert.throws(()=>compareUsageQuality(oneFigure(games)), TypeError);
  }
  assert.equal(compareUsageQuality(oneFigure(Array(48).fill(group))).status, 'loss');
});

test('complete reference profiles with multiple regions and usage rows retain all notes and write flags', () => {
  const amiibos = {};
  for (const profile of reference.profiles) {
    for (const figureId of profile.figures) {
      const figure = amiibos[figureId] = {games3DS:[],gamesWiiU:[],gamesSwitch:[],gamesSwitch2:[]};
      const writable = new Set(profile.writable);
      const groups = new Map();
      for (const index of profile.notes) {
        const [platform,id,text] = reference.records[index];
        const key = platform+':'+id;
        if (!groups.has(key)) {
          const row = {gameID:['ffffffffffffffff',id], amiiboUsage:[]};
          groups.set(key,row);
          figure[platform].push(row);
        }
        groups.get(key).amiiboUsage.push({Usage:text,write:writable.has(index)});
      }
    }
  }
  assert.deepEqual(compareUsageQuality({amiibos}), {status:'retained',missingNotes:0,missingWriteFlags:0});
});
