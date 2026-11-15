import {parseGuidedDraft} from './guided-device-check.js';

export const LEGACY_DRAFT_KEY = 'allmiibo.guided-device-check.draft.v2';
const PREFIX = LEGACY_DRAFT_KEY + '.rev.';
export const isGuidedDraftKey = key => key === LEGACY_DRAFT_KEY || key?.startsWith(PREFIX);

export function listGuidedDrafts(store) {
  const keys = new Set([LEGACY_DRAFT_KEY]);
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (isGuidedDraftKey(key)) keys.add(key);
  }
  const entries = [];
  let invalid = false;
  for (const key of keys) {
    const raw = store.getItem(key);
    if (raw === null) continue;
    try {
      const draft = parseGuidedDraft(raw);
      entries.push({key, raw, draft});
    } catch {
      invalid = true;
    }
  }
  entries.sort((a, b) => b.draft.savedAt.localeCompare(a.draft.savedAt) || b.key.localeCompare(a.key));
  return {entries, invalid};
}

export function discardGuidedDraft(store, previous) {
  if (previous && store.getItem(previous.key) === previous.raw) store.removeItem(previous.key);
}

export function saveGuidedDraft(store, previous, raw) {
  // Each edit publishes to its own key. Two writers replacing the same
  // revision can remove only their shared ancestor, never each other's work.
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const key = PREFIX + id;
  store.setItem(key, raw);
  // Publication already succeeded. If cleanup fails, the older revision is
  // still selectable and this tab must continue from its newly saved edit.
  try { discardGuidedDraft(store, previous); } catch { /* Keep both copies. */ }
  return {key, raw};
}
