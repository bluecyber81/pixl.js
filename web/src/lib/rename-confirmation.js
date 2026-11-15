import { portableNameKey } from './portable-names.js';

// Check the exact spelling and entry type, including case-only renames.
// Aliases and duplicate rows make a readback ambiguous.
export function classifyRenameListing(entries, { from, to, type }) {
  const keys = new Set([portableNameKey(from), portableNameKey(to)]);
  const matches = entries.filter(entry => keys.has(portableNameKey(entry.name)));
  if (matches.length !== 1 || matches[0].type !== type) return 'unclear';
  if (matches[0].name === to) return 'confirmed';
  return matches[0].name === from ? 'original' : 'unclear';
}
