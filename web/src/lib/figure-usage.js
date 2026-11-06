import { figureId } from './figure-info.js';

// Look up only the exact public ID. Names, series and private file notes are not keys.
export function figureUsage(id, data, locale = 'de_DE') {
  const normalized = figureId(id);
  if (!normalized || data?.schemaVersion !== 1) return [];
  const figure = data.figures?.find(item => item.id === normalized);
  if (!figure) return [];
  const de = locale.startsWith('de');
  const groups = new Map(data.groups.map(group => [group.id, group]));
  const notes = new Map(data.notes.map(note => [note.id, note]));
  const linkSource = data.source.files.find(file => file.path === 'fw/data/amiidb_link.csv');
  return figure.associations.map(association => {
    const group = groups.get(association.groupId);
    const note = notes.get(association.noteId);
    const translated = de && typeof note?.de === 'string' && note.de.length > 0;
    return {
      groupId: group.id,
      label: group.labelPath.join(' › '),
      text: translated ? note.de : note?.en || null,
      original: translated ? note.en : null,
      language: translated ? 'de' : note?.en ? 'en' : null,
      translated,
      sourceUrl: `${linkSource.referenceUrl}#L${association.sourceLine}`,
    };
  });
}
