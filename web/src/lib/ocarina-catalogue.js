import { ocarinaFigures, ocarinaSeries } from '../data/announced-figures.js';

const fold = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seriesNames = new Set(['legend of zelda', 'the legend of zelda', 'ocarina of time', fold(ocarinaSeries), fold(ocarinaSeries) + ' series']);

export function reviewedOcarinaEntry(figure, upstream, known) {
  if (upstream) {
    const name = fold(upstream.name);
    const names = [figure.en, figure.de].map(fold);
    const matchesName = names.some(base => [base, base + ' ocarina of time', base + ' the legend of zelda ocarina of time'].includes(name));
    const matchesGame = ['legend of zelda', 'the legend of zelda'].includes(fold(upstream.game));
    if (!matchesName || !matchesGame || !seriesNames.has(fold(upstream.series)) || fold(upstream.type) !== 'figure') {
      throw new Error(`Catalogue conflict for ${figure.catalogueId}: expected ${figure.en} (Ocarina of Time), Figure; received ${upstream.name} / ${upstream.series} / ${upstream.game} / ${upstream.type}`);
    }
  }
  return {
    id: figure.catalogueId, name: figure.en, series: ocarinaSeries, game: 'The Legend of Zelda', type: 'Figure',
    release: { au: null, na: null, eu: null, jp: null, ...upstream?.release }, firmwareIdKnown: known,
  };
}

export function includeOcarinaFigures(entries, known) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  if (byId.size !== entries.length) throw new Error('Duplicate figure ID in the pinned source');
  for (const figure of ocarinaFigures) {
    const id = figure.catalogueId;
    byId.set(id, reviewedOcarinaEntry(figure, byId.get(id), known.has(id)));
  }
  return [...byId.values()];
}
