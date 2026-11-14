import reference from '../data/online-usage-reference.json' with { type: 'json' };

export const USAGE_REFERENCE_COMMIT = reference.commit;
const platforms = ['games3DS', 'gamesWiiU', 'gamesSwitch', 'gamesSwitch2'];
// The reviewed source has at most 6 regional IDs and 4 usage rows per game,
// totaling fewer than 22,000 comparisons across the complete catalogue.
const maxRegionalIds = 32, maxUsageRows = 64, maxComparisons = 100000;
const gameNotes = new Map();
for (const [index, [platform, id, text]] of reference.records.entries()) {
  const gameKey = platform + ':' + id;
  if (!gameNotes.has(gameKey)) gameNotes.set(gameKey, new Map());
  gameNotes.get(gameKey).set(text, index);
}
const profiles = new Map(reference.profiles.flatMap(profile => profile.figures.map(id => [id, profile])));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireValid(condition) {
  if (!condition) throw new TypeError('Invalid AmiiboAPI games_info.json');
}

// A new figure, game, or note cannot mask the loss of a previously reviewed
// note. Game names and regional ID ordering may change without losing a match.
export function compareUsageQuality(payload) {
  requireValid(object(payload) && object(payload.amiibos));
  const figures = Object.entries(payload.amiibos);
  requireValid(figures.length > 0 && figures.length <= 4096);
  const absentFigures = new Set(profiles.keys());
  let missingNotes = 0, missingWriteFlags = 0, remainingComparisons = maxComparisons;
  for (const [id, figure] of figures) {
    requireValid(/^0x[0-9a-f]{16}$/u.test(id) && object(figure));
    absentFigures.delete(id);
    const notes = new Set(), writable = new Set();
    for (const platform of platforms) {
      const games = figure[platform];
      requireValid(Array.isArray(games));
      for (const game of games) {
        requireValid(object(game) && Array.isArray(game.gameID) && game.gameID.length > 0 &&
          game.gameID.length <= maxRegionalIds && Array.isArray(game.amiiboUsage) && game.amiiboUsage.length <= maxUsageRows);
        remainingComparisons -= game.gameID.length * Math.max(1, game.amiiboUsage.length);
        requireValid(remainingComparisons >= 0);
        const regionalNotes = game.gameID.map(id => {
          requireValid(typeof id === 'string' && /^[0-9a-f]{16}$/iu.test(id));
          return gameNotes.get(platform + ':' + id.toLowerCase());
        });
        for (const row of game.amiiboUsage) {
          requireValid(object(row) && typeof row.Usage === 'string' && typeof row.write === 'boolean');
          const text = row.Usage.trim();
          if (!text) continue;
          for (const knownNotes of regionalNotes) {
            const index = knownNotes?.get(text);
            if (index === undefined) continue;
            notes.add(index);
            if (row.write) writable.add(index);
          }
        }
      }
    }
    const profile = profiles.get(id);
    if (profile) {
      missingNotes += profile.notes.filter(index => !notes.has(index)).length;
      missingWriteFlags += profile.writable.filter(index => !writable.has(index)).length;
    }
  }
  for (const id of absentFigures) {
    const profile = profiles.get(id);
    missingNotes += profile.notes.length;
    missingWriteFlags += profile.writable.length;
  }
  return { status: missingNotes || missingWriteFlags ? 'loss' : 'retained', missingNotes, missingWriteFlags };
}
