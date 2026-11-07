// Announcement metadata is kept separate from the ID catalogue used for device scans.
const northAmericanDetails = 'https://www.nintendo.com/us/amiibo/detail/';
const megaManDirect = 'https://www.nintendo.com/en-ca/whatsnew/nintendo-direct-reveals-metroid-ravenous-kirby-and-the-world-beyond-and-more-games-for-nintendo-switch-2-and-nintendo-switch/';

export const zeldaIdProposal = 'https://github.com/James-Makoto/pixl.js/commit/679dccb0537d1a3f2494b54dcd922b90307330c7';
export const ocarinaUsage = 'https://en-americas-support.nintendo.com/app/answers/detail/a_id/71861/~/how-to-use-amiibo-figures-%28the-legend-of-zelda%3A-ocarina-of-time%29';

export const announcementGroups = [
  {
    series: 'Kirby Air Riders', date: '2026-11-12', region: 'US',
    figures: [
      { en: 'Sword Kirby & Dragoon', de: 'Kirby mit Schwert & Dragoon', source: northAmericanDetails + 'sword-kirby-and-dragoon-kirby-air-riders-series/' },
      { en: 'Noir Dedede & Hydra', de: 'Dedede Noir & Hydra', source: northAmericanDetails + 'noir-dedede-and-hydra-kirby-air-riders-series/' },
    ],
  },
  {
    series: 'Metroid Ravenous', date: '2027-01-28', region: 'US',
    figures: [
      { en: 'Samus', de: 'Samus', source: northAmericanDetails + 'samus-metroid-ravenous-series/' },
      { en: 'Samus (Metroid Suit)', de: 'Samus (Metroid-Anzug)', source: northAmericanDetails + 'samus-metroid-suit-metroid-ravenous-series/' },
      { en: 'Chozo Statue', de: 'Chozo-Statue', source: northAmericanDetails + 'chozo-statue-metroid-ravenous-series/' },
    ],
  },
  {
    series: 'Mega Man: Dual Override', date: 'spring-2027', region: 'CA',
    figures: [
      { en: 'Mega Man', de: 'Mega Man', source: megaManDirect },
      { en: 'Proto Man', de: 'Proto Man', source: megaManDirect },
    ],
  },
  {
    series: 'The Legend of Zelda: Ocarina of Time', date: '2027', region: 'US',
    usage: ocarinaUsage,
    figures: [
      { en: 'Young Link', de: 'Junger Link', proposedId: '0100000004fd0902', source: northAmericanDetails + 'young-link-the-legend-of-zelda-ocarina-of-time-series/' },
      { en: 'Young Zelda', de: 'Junge Zelda', proposedId: '0101000004ff0902', source: northAmericanDetails + 'young-zelda-the-legend-of-zelda-ocarina-of-time-series/' },
    ],
  },
];
