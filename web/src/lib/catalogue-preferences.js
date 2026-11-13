import { figureId } from './figure-info.js';

export const CATALOGUE_PREFERENCES_KEY = 'allmiibo.catalogue.preferences.v1';
export const FILTER_NAME_LIMIT = 48;
export const CATALOGUE_PROFILE_FORMAT = 'allmiibo.catalogue-profile';
export const CATALOGUE_PROFILE_FILE_LIMIT = 512 * 1024;
const MAX_FAVORITES = 4096, MAX_FILTERS = 80;
const validPresence = new Set(['', 'observed', 'present', 'missing', 'attention', 'unconfirmed']);
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
  if (value.game !== undefined && (!text(value.game, 64) || !/^[a-z0-9-]*$/.test(value.game))) fail('PREF_FORMAT');
  return { query:value.query, series:value.series, kind:value.kind, presence:value.presence, knownOnly:value.knownOnly, favoritesOnly:value.favoritesOnly, ...(value.game ? { game:value.game } : {}) };
}

function normalizedPreferences(state) {
  if (state?.version !== 1 || !Array.isArray(state.favorites) || state.favorites.length > MAX_FAVORITES ||
      !Array.isArray(state.filters) || state.filters.length > MAX_FILTERS) fail('PREF_FORMAT');
  const favorites = state.favorites.map(figureId);
  const filters = state.filters.map(item => ({ name:filterName(item?.name), criteria:criteria(item?.criteria) }));
  if (favorites.includes(null) || new Set(favorites).size !== favorites.length || new Set(filters.map(f => f.name)).size !== filters.length) fail('PREF_FORMAT');
  return { version:1, favorites, filters };
}

function parseStoredPreferences(raw) {
  if (raw === null) return clean();
  if (raw.length > CATALOGUE_PROFILE_FILE_LIMIT) fail('PREF_FORMAT');
  let state;
  try { state = JSON.parse(raw); } catch { fail('PREF_FORMAT'); }
  return normalizedPreferences(state);
}

export function readCataloguePreferences(storage = window.localStorage) {
  return parseStoredPreferences(storage.getItem(CATALOGUE_PREFERENCES_KEY));
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

// A profile is deliberately limited to the existing browser preferences. It
// contains no device state, file contents, download links or storage credentials.
function profileStorage(work, storage) {
  try { return work(storage ?? window.localStorage); }
  catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith('PREF_')) throw error;
    fail('PREF_STORAGE');
  }
}

function profileText(value) {
  if (typeof value !== 'string') fail('PREF_PROFILE_FORMAT');
  if (value.length > CATALOGUE_PROFILE_FILE_LIMIT || new TextEncoder().encode(value).length > CATALOGUE_PROFILE_FILE_LIMIT) fail('PREF_PROFILE_LIMIT');
  return value;
}

const keysOnly = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
function parseProfile(value) {
  profileText(value);
  let doc;
  try { doc = JSON.parse(value); } catch { fail('PREF_PROFILE_FORMAT'); }
  if (!keysOnly(doc, ['format', 'version', 'favorites', 'filters']) || doc.format !== CATALOGUE_PROFILE_FORMAT || doc.version !== 1 || !Array.isArray(doc.filters)) fail('PREF_PROFILE_FORMAT');
  if (doc.favorites?.length > MAX_FAVORITES || doc.filters.length > MAX_FILTERS) fail('PREF_LIMIT');
  for (const filter of doc.filters) {
    if (!keysOnly(filter, ['name', 'criteria']) || !keysOnly(filter.criteria, ['query', 'series', 'kind', 'presence', 'knownOnly', 'favoritesOnly', 'game'])) fail('PREF_PROFILE_FORMAT');
  }
  // Same ID/name/criteria validation as every existing local preference writer.
  return normalizedPreferences(doc);
}

export function exportCatalogueProfile(storage) {
  return profileStorage(store => {
    const state = readCataloguePreferences(store);
    return profileText(JSON.stringify({ format:CATALOGUE_PROFILE_FORMAT, ...state }, null, 2));
  }, storage);
}

const pendingProfiles = new WeakMap();
const freezeProfile = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeProfile);
    Object.freeze(value);
  }
  return value;
};

function importPlan(current, incoming, mode) {
  const currentIds = new Set(current.favorites), incomingIds = new Set(incoming.favorites);
  const currentFilters = new Map(current.filters.map(filter => [filter.name, filter]));
  const incomingFilters = new Map(incoming.filters.map(filter => [filter.name, filter]));
  const added = incoming.filters.filter(filter => !currentFilters.has(filter.name));
  const changed = incoming.filters.filter(filter => currentFilters.has(filter.name) && JSON.stringify(currentFilters.get(filter.name).criteria) !== JSON.stringify(filter.criteria));
  const state = mode === 'replace'
    ? incoming
    : { version:1, favorites:[...new Set([...current.favorites, ...incoming.favorites])].sort(), filters:[...current.filters, ...added] };
  return { state, summary:{
    favoritesAdded:incoming.favorites.filter(id => !currentIds.has(id)).length,
    favoritesRemoved:mode === 'replace' ? current.favorites.filter(id => !incomingIds.has(id)).length : 0,
    filtersAdded:added.length, filtersReplaced:mode === 'replace' ? changed.length : 0,
    filtersRemoved:mode === 'replace' ? current.filters.filter(filter => !incomingFilters.has(filter.name)).length : 0,
    conflictsKept:mode === 'merge' ? changed.length : 0,
    favoritesTotal:state.favorites.length, filtersTotal:state.filters.length,
    allowed:state.favorites.length <= MAX_FAVORITES && state.filters.length <= MAX_FILTERS,
  } };
}

export function previewCatalogueProfile(text, storage) {
  const incoming = parseProfile(text);
  return profileStorage(store => {
    const raw = store.getItem(CATALOGUE_PREFERENCES_KEY), current = parseStoredPreferences(raw);
    const ids = new Set(current.favorites), filters = new Map(current.filters.map(filter => [filter.name, filter]));
    const plans = { merge:importPlan(current, incoming, 'merge'), replace:importPlan(current, incoming, 'replace') };
    const preview = freezeProfile({
      incoming:{ favorites:incoming.favorites.length, filters:incoming.filters.length },
      current:{ favorites:current.favorites.length, filters:current.filters.length },
      favorites:incoming.favorites.map(id => ({ id, state:ids.has(id) ? 'same' : 'added' })),
      filters:incoming.filters.map(filter => ({ name:filter.name, incoming:filter.criteria,
        previous:filters.get(filter.name)?.criteria ?? null,
        state:!filters.has(filter.name) ? 'added' : JSON.stringify(filters.get(filter.name).criteria) === JSON.stringify(filter.criteria) ? 'same' : 'changed' })),
      modes:{ merge:plans.merge.summary, replace:plans.replace.summary },
    });
    // Keep the captured raw snapshot and actual import data outside the rendered
    // preview. An arbitrary object or a changed summary cannot authorize a write.
    pendingProfiles.set(preview, { store, raw, current, plans });
    return preview;
  }, storage);
}

export async function importCatalogueProfile(preview, mode, { signal } = {}) {
  if (!['merge', 'replace'].includes(mode)) fail('PREF_POLICY');
  const pending = pendingProfiles.get(preview);
  if (!pending) fail('PREF_PREVIEW');
  const write = () => profileStorage(store => {
    if (signal?.aborted) fail('PREF_CANCELLED');
    if (!pendingProfiles.has(preview)) fail('PREF_PREVIEW');
    if (store.getItem(CATALOGUE_PREFERENCES_KEY) !== pending.raw) fail('PREF_STALE');
    const plan = pending.plans[mode];
    if (!plan.summary.allowed) fail('PREF_LIMIT');
    const state = normalizedPreferences(plan.state), raw = profileText(JSON.stringify(state));
    const changed = JSON.stringify(pending.current) !== raw;
    // One Web Storage value: a quota failure leaves the previous profile intact.
    if (changed) store.setItem(CATALOGUE_PREFERENCES_KEY, raw);
    pendingProfiles.delete(preview);
    return { preferences:state, changed };
  }, pending.store);
  // Existing UI edits use this same origin-wide lock. Without Web Locks, the
  // synchronous compare/write still detects intervening edits before commit;
  // Web Storage itself does not provide a cross-process compare-and-swap API.
  const locks = globalThis.window?.navigator?.locks;
  return locks ? locks.request(CATALOGUE_PREFERENCES_KEY, write) : write();
}
