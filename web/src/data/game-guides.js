import nintendoSupplement from './usage-nintendo-supplement.json' with { type: 'json' };

// Each ID identifies a reviewed catalogue edition. Matching an English name or
// franchise alone could include another printing, card type or announced figure.
export const gameGuides = [
  ...nintendoSupplement.games.map(game => ({
    id: game.id, title: game.title, titleDe: game.titleDe, groupId: game.groupId, platform: game.platform, source: game.source,
    editionSource: game.editionSource, de: game.de, en: game.en, ids: [...game.rows.flatMap(row => row.ids), ...(game.includeExistingIds || [])],
    usageIds: game.rows.flatMap(row => row.ids),
  })),
  {
    id: 'kirby-air-riders', title: 'Kirby Air Riders', platform: 'Switch 2',
    source: 'https://www.nintendo.com/us/gaming-systems/switch-2/featured-games/kirby-air-riders/connect/',
    de: 'Setze den Fahrer auf eine Maschine und scanne die Kombination, um ihn als Figurenspieler zu trainieren. Die Katalog-ID bezeichnet den Fahrer.',
    en: 'Place the rider on a machine and scan the combination to train a Figure Player. The catalogue ID identifies the rider.',
    communityLink: 'https://github.com/Bing-Bong-Bang/air-riders-amiibo-tracker/releases/tag/v0.1.0',
    ids: ['1f00000004c41e03', '1f03010004c91e03', '1f01000004c61e03', '1f02000004c71e03', '1f04000004ca1e03', '1f00010004c51e03', '1f02010004c81e03'],
  },
  {
    id: 'metroid-dread', title: 'Metroid Dread', platform: 'Switch',
    source: 'https://metroid.nintendo.com/dread/samus/',
    de: 'Die Dread-Ausgabe von Samus gibt einmal pro Spielstand einen Energietank, E.M.M.I. einen Missile+-Tank. Beide können einmal täglich den jeweiligen Vorrat auffüllen.',
    en: 'The Dread edition of Samus grants an Energy Tank once per save file. E.M.M.I. grants a Missile+ Tank. Each can replenish its respective resource once per day.',
    ids: ['05c0000004121302', '05c4000004131302'],
  },
];

export function gameTitle(game, german) {
  return (german && game.titleDe) || game.title;
}
