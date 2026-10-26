// Metadata only. A catalogue entry does not establish file ownership, file
// presence on a device, a release date in every region, or emulation support.
const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
export function parseKnownFigureIds(text) {
  const values = String(text).split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(Boolean);
  if (values.some(id => !/^[0-9a-f]{16}$/.test(id))) throw new Error('Invalid known figure ID');
  return new Set(values);
}
export function filterCatalogue(entries, { query = '', series = '', kind = '', knownOnly = false } = {}) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry => (!series || entry.series === series) && (!kind || entry.type === kind) &&
    (!knownOnly || entry.firmwareIdKnown === true) && terms.every(term =>
      normalize([entry.id, entry.name, entry.series, entry.game, entry.type].join(' ')).includes(term)));
}

export function cataloguePage(entries, page, size = 40) {
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('Invalid catalogue page size');
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const current = Number.isInteger(page) ? Math.max(1, Math.min(page, pages)) : 1;
  return { page: current, pages, total: entries.length, entries: entries.slice((current - 1) * size, current * size) };
}

export function releaseLabel(entry, today) {
  const dates = Object.values(entry.release || {}).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')).sort();
  if (!dates.length) return { state: 'unknown', date: null };
  return { state: dates[0] > today ? 'upcoming' : 'listed', date: dates[0] };
}
