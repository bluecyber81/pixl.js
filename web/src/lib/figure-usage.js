import { figureId } from './figure-info.js';
import { gameGuides } from '../data/game-guides.js';

const airRidersGuide = gameGuides.find(guide => guide.id === 'kirby-air-riders');

// Corrections for the four affected associations in the signed App644 catalogue.
// The source export remains available byte-for-byte for firmware verification.
const champions = {
  '0106000003590902': { page: 'Urbosa-1239434.html', beast: 'Vah Naboris' },
  '01070000035a0902': { page: 'Mipha-1239432.html', beast: 'Vah Ruta' },
};

function nintendoUsage(id, game, de) {
  const champion = champions[id];
  if (!champion) return null;
  let text;
  if (game === 'The Legend of Zelda: Breath of the Wild') {
    text = de ? `Mögliche Funde sind Waffen, Materialien und eine Kopfbedeckung nach dem Vorbild von ${champion.beast}.`
      : `Possible drops include weapons, materials and headgear modelled on ${champion.beast}.`;
  } else if (game === 'The Legend of Zelda: Tears of the Kingdom') {
    text = de ? 'Du kannst Waffen, Materialien und einen besonderen Stoff für Links Parasegel erhalten.'
      : 'Possible rewards include weapons, materials and a special fabric for Link’s paraglider.';
  } else {
    return null;
  }
  const page = de ? 'de-de/Hardware/amiibo-/Details/' : 'en-gb/Hardware/amiibo-/amiibo-details/';
  return { text, guideUrl: 'https://www.nintendo.com/' + page + champion.page };
}

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
    const label = group.labelPath.join(' › ');
    const attribution = { groupId: group.id, label, sourceUrl: association.sourceUrl || `${linkSource.referenceUrl}#L${association.sourceLine}` };
    if (association.sourceUrl) {
      const guide = label === 'Kirby Air Riders' && airRidersGuide.ids.includes(normalized) ? airRidersGuide : null;
      return { ...attribution, officialAssociation: true, text: guide?.[de ? 'de' : 'en'] ?? null,
        original: null, language: guide ? (de ? 'de' : 'en') : null, translated: false };
    }
    const correction = nintendoUsage(normalized, label, de);
    if (correction) return {
      ...attribution, ...correction, language: de ? 'de' : 'en',
      translated: false, original: null,
    };
    const translated = de && typeof note?.de === 'string' && note.de.length > 0;
    return {
      ...attribution,
      text: translated ? note.de : note?.en || null,
      original: translated ? note.en : null,
      language: translated ? 'de' : note?.en ? 'en' : null,
      translated,
    };
  });
}
