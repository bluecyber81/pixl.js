import { figureId } from './figure-info.js';

export const CATALOGUE_PREFERENCES_KEY = 'allmiibo.catalogue.preferences.v1';
export const FILTER_NAME_LIMIT = 48;
const MAX_FAVORITES = 4096, MAX_FILTERS = 80;
const validPresence = new Set(['', 'present', 'missing', 'attention', 'unconfirmed']);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = (s, max) => typeof s === 'string' && s.length <= max && !/[\u0000-\u001f\u007f]/u.test(s);
const clean = () => ({ version: 1, favorites: [], filters: [] });

export function filterName(value) {
  if (typeof value !== 'string') fail('PREF_NAME');
  const name = value.trim().normalize('NFC');
  if (!name || !text(name, FILTER_NAME_LIMIT)) fail('PREF_NAME');
  return name;
}

function criteria(value) {
  if (!value || !text(value.query, 200) || !text(value.series, 256) || !text(value.kind, 256) ||
      !validPresence.has(value.presence) || typeof value.knownOnly !== 'boolean' || typeof value.favoritesOnly !== 'boolean') fail('PREF_FORMAT');
  return { query:value.query, series:value.series, kind:value.kind, presence:value.presence, knownOnly:value.knownOnly, favoritesOnly:value.favoritesOnly };
}

export function readCataloguePreferences(storage = window.localStorage) {
  const raw = storage.getItem(CATALOGUE_PREFERENCES_KEY);
  if (raw === null) return clean();
  if (raw.length > 512 * 1024) fail('PREF_FORMAT');
  let state;
  try { state = JSON.parse(raw); } catch { fail('PREF_FORMAT'); }
  if (state?.version !== 1 || !Array.isArray(state.favorites) || state.favorites.length > MAX_FAVORITES ||
      !Array.isArray(state.filters) || state.filters.length > MAX_FILTERS) fail('PREF_FORMAT');
  const favorites = state.favorites.map(figureId);
  const filters = state.filters.map(item => ({ name:filterName(item?.name), criteria:criteria(item?.criteria) }));
  if (favorites.includes(null) || new Set(favorites).size !== favorites.length || new Set(filters.map(f => f.name)).size !== filters.length) fail('PREF_FORMAT');
  return { version:1, favorites, filters };
}

export function updateCataloguePreferences(change, storage = window.localStorage) {
  const state = readCataloguePreferences(storage);
  if (change.op === 'favorite') {
    const id = figureId(change.id);
    if (!id || typeof change.enabled !== 'boolean') fail('PREF_FORMAT');
    const ids = new Set(state.favorites);
    if (change.enabled) ids.add(id); else ids.delete(id);
    if (ids.size > MAX_FAVORITES) fail('PREF_LIMIT');
    state.favorites = Array.from(ids).sort();
  } else {
    const name = filterName(change.name);
    const index = state.filters.findIndex(filter => filter.name === name);
    if (change.op === 'create') {
      if (index !== -1) fail('PREF_EXISTS');
      if (state.filters.length >= MAX_FILTERS) fail('PREF_LIMIT');
      state.filters.push({ name, criteria:criteria(change.criteria) });
    } else if (change.op === 'remove' || change.op === 'update') {
      if (index === -1) fail('PREF_MISSING');
      if (change.op === 'remove') state.filters.splice(index, 1);
      else state.filters[index] = { name, criteria:criteria(change.criteria) };
    } else fail('PREF_FORMAT');
  }
  storage.setItem(CATALOGUE_PREFERENCES_KEY, JSON.stringify(state));
  return state;
}
