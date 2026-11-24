// Only reviewed editions have a catalogueId. An announcement date can be a year.
const northAmericanDetails = 'https://www.nintendo.com/us/amiibo/detail/';
const megaManDirect = 'https://www.nintendo.com/en-ca/whatsnew/nintendo-direct-reveals-metroid-ravenous-kirby-and-the-world-beyond-and-more-games-for-nintendo-switch-2-and-nintendo-switch/';
// The supplied review checked Nintendo's regional announcements on this date.
const sourceCheckedOn = '2026-11-08';

export const zeldaIdSource = 'https://github.com/James-Makoto/pixl.js/commit/679dccb0537d1a3f2494b54dcd922b90307330c7';
export const ocarinaUsage = 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/71861/~/how-to-use-amiibo-figures-%28the-legend-of-zelda%3A-ocarina-of-time%29';

const ocarinaImage = 'https://assets.nintendo.com/image/upload/c_limit,w_320,f_webp/amiibo/The%20Legend%20of%20Zelda%20Ocarina%20of%20Time/PNG_Derivative-NVL_AK_';
export const ocarinaYear = '2027';
export const ocarinaBotwGuide = 'https://www.nintendo.com/jp/hardware/amiibo/game/zelda/index.html';
export const ocarinaSeries = 'The Legend of Zelda: Ocarina of Time';
export const ocarinaFigures = [
  { catalogueId: '0100000004fd0902', en: 'Young Link', de: 'Junger Link', source: northAmericanDetails + 'young-link-the-legend-of-zelda-ocarina-of-time-series/', image: ocarinaImage + 'char28_1_R_ad-0',
    botw: { de: 'Einmal pro Tag kannst du Fisch oder Ausrüstung erhalten.', en: 'You can receive fish or equipment once per day.' } },
  { catalogueId: '0101000004ff0902', en: 'Young Zelda', de: 'Junge Zelda', source: northAmericanDetails + 'young-zelda-the-legend-of-zelda-ocarina-of-time-series/', image: ocarinaImage + 'char29_1_R_ad-0',
    botw: { de: 'Einmal pro Tag kannst du Pflanzen oder Ausrüstung erhalten.', en: 'You can receive plants or equipment once per day.' } },
];
export const ocarinaFigureById = new Map(ocarinaFigures.map(figure => [figure.catalogueId, figure]));

export function catalogueDisplayName(entry, de) {
  return de ? (catalogueAliases.get(entry?.id)?.[0] ?? entry?.name) : entry?.name;
}

export const announcementGroups = [
  {
    series: 'Kirby Air Riders', game: 'kirby-air-riders', date: '2026-11-12', datePrecision: 'day', region: 'US',
    released: true, sourceCheckedOn: '2026-11-13',
    usage: 'https://www.nintendo.com/us/store/products/amiibo-noir-dedede-hydra-kirby-air-riders-series-125233/',
    note: {
      de: 'Beide Fahrer lassen sich als Figurenspieler trainieren. Ihr Level bleibt erhalten, wenn du sie auf eine andere Maschine setzt.',
      en: 'You can train both riders as Figure Players. They keep their level when moved to another machine.',
    },
    figures: [
      { catalogueId: '1f00010004c51e03', en: 'Sword Kirby & Dragoon', de: 'Kirby mit Schwert & Dragoon', source: northAmericanDetails + 'sword-kirby-and-dragoon-kirby-air-riders-series/' },
      { catalogueId: '1f02010004c81e03', en: 'Noir Dedede & Hydra', de: 'Dedede Noir & Hydra', source: northAmericanDetails + 'noir-dedede-and-hydra-kirby-air-riders-series/' },
    ],
  },
  {
    series: 'Metroid Ravenous', date: '2027-01-28', datePrecision: 'day', region: 'US', sourceCheckedOn,
    figures: [
      { en: 'Samus', de: 'Samus', source: northAmericanDetails + 'samus-metroid-ravenous-series/' },
      { en: 'Samus (Metroid Suit)', de: 'Samus (Metroid-Anzug)', source: northAmericanDetails + 'samus-metroid-suit-metroid-ravenous-series/' },
      { en: 'Chozo Statue', de: 'Chozo-Statue', source: northAmericanDetails + 'chozo-statue-metroid-ravenous-series/' },
    ],
  },
  {
    series: 'Mega Man: Dual Override', date: 'spring-2027', datePrecision: 'season', region: 'CA', sourceCheckedOn,
    figures: [
      { en: 'Mega Man', de: 'Mega Man', source: megaManDirect },
      { en: 'Proto Man', de: 'Proto Man', source: megaManDirect },
    ],
  },
  {
    series: ocarinaSeries, game: 'ocarina-of-time', date: ocarinaYear, datePrecision: 'year', region: 'US', sourceCheckedOn: '2026-11-16',
    usage: ocarinaUsage,
    note: {
      de: 'In Ocarina of Time auf Switch 2 schalten die beiden angekündigten Figuren besondere Masken frei. Andere kompatible Zelda-Figuren geben Gegenstände.',
      en: 'In Ocarina of Time on Switch 2, the two announced figures unlock special masks. Other compatible Zelda figures give you items.',
    },
    figures: ocarinaFigures,
  },
];

// German names are edition-specific, including the machine shipped with each Air Riders pack.
export const catalogueAliases = new Map([
  ['010d000004a70902', ['Mineru-Konstrukt', 'Minerus Konstrukt']],
  ['1f00000004c41e03', ['Kirby & Warp-Stern']],
  ['1f03010004c91e03', ['Waddle-Dee-Assistent & Flügel-Stern']],
  ['1f01000004c61e03', ['Meta-Knight & Schatten-Stern']],
  ['1f02000004c71e03', ['König Dedede & Panzer-Stern']],
  ['1f04000004ca1e03', ['Koch Kawasaki & Hopp-Stern']],
  ...announcementGroups.flatMap(group =>
    group.figures.filter(figure => figure.catalogueId).map(figure => [figure.catalogueId, [figure.de, figure.en]]))
]);
