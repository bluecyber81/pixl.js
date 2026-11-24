import { catalogueAliases, ocarinaFigureById, ocarinaYear } from '../data/announced-figures.js';
import { gameGuides } from '../data/game-guides.js';

// Reuse the reviewed exact-ID mappings shown by the game filter and details.
// A shared character or series name alone never expands compatibility.
const reviewedGameTitles = new Map();
for (const game of gameGuides) {
  for (const id of game.ids) {
    if (!reviewedGameTitles.has(id)) reviewedGameTitles.set(id, []);
    reviewedGameTitles.get(id).push(game.title);
    if (game.titleDe) reviewedGameTitles.get(id).push(game.titleDe);
  }
}

// Metadata only. A catalogue entry does not establish file ownership, file
// presence on a device, a release date in every region, or emulation support.
const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
export function catalogueMatcher(query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return () => true;
  return (...fields) => {
    const text = normalize(fields.join(' '));
    return terms.every(term => text.includes(term));
  };
}
export function parseKnownFigureIds(text) {
  const values = String(text).split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(Boolean);
  if (values.some(id => !/^[0-9a-f]{16}$/.test(id))) throw new Error('Invalid known figure ID');
  return new Set(values);
}
// The published snapshot uses case-insensitive name order. An online merge
// uses ID order for reproducibility, so sort the filtered copy for display.
export function compareFigureNames(a, b) {
  const left = a.name.toLowerCase(), right = b.name.toLowerCase();
  if (left !== right) return left < right ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
export function filterCatalogue(entries, { query = '', series = '', kind = '', knownOnly = false } = {}) {
  const matches = catalogueMatcher(query);
  const filtered = entries.filter(entry => (!series || entry.series === series) && (!kind || entry.type === kind) &&
    (!knownOnly || entry.firmwareIdKnown === true) && matches(entry.id, entry.name, entry.series, entry.game, entry.type,
      ...(catalogueAliases.get(entry.id) || []), ...(reviewedGameTitles.get(entry.id) || [])))
    .sort(compareFigureNames);
  const term = normalize(query).trim();
  if (!term) return filtered;
  // A full translated name outranks incidental words in the series title.
  const exact = new Set(filtered.filter(entry => [entry.name, ...(catalogueAliases.get(entry.id) || [])]
    .some(name => normalize(name) === term)).map(entry => entry.id));
  return exact.size ? [...filtered.filter(entry => exact.has(entry.id)), ...filtered.filter(entry => !exact.has(entry.id))] : filtered;
}

export function cataloguePage(entries, page, size = 40) {
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('Invalid catalogue page size');
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const current = Number.isInteger(page) ? Math.max(1, Math.min(page, pages)) : 1;
  return { page: current, pages, total: entries.length, entries: entries.slice((current - 1) * size, current * size) };
}

export function releaseLabel(entry, today) {
  const dates = Object.values(entry.release || {}).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')).sort();
  if (!dates.length && ocarinaFigureById.has(entry.id)) return { state: 'announced', date: ocarinaYear };
  if (!dates.length) return { state: 'unknown', date: null };
  return { state: dates[0] > today ? 'upcoming' : 'listed', date: dates[0] };
}
