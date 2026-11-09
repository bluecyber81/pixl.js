import { ocarinaUsage } from './announced-figures.js';

// Each ID identifies a reviewed catalogue edition. Matching an English name or
// franchise alone could include another printing, card type or announced figure.
export const gameGuides = [
  {
    id: 'fatal-fury-cotw', title: 'Fatal Fury: City of the Wolves', platform: 'Switch 2',
    source: 'https://www.nintendo.com/jp/hardware/amiibo/game/abfua/index.html',
    de: 'Mit Ken, Chun-Li, Terry und Mai aus den Street-Fighter-6-Startersets und Boosterpacks sowie den Smash-Figuren von Ken und Terry erhältst du Avatare, Titel und Erfahrung für Episodes of South Town.',
    en: 'Use the Ken, Chun-Li, Terry and Mai cards from the Street Fighter 6 starter sets and booster packs, or the Smash figures of Ken and Terry, to receive avatars, titles and experience for Episodes of South Town.',
    ids: [
      '34c1000104a91d02', '34c1000104cc1d02', // Ken
      '34c5000104b01d02', '34c5000104d01d02', // Chun-Li
      '3c80000104e81d02', '3c80000104f11d02', // Terry
      '3c81000104f21d02', '3c81000104f31d02', // Mai
      // Nintendo's abfua game guide lists the Smash figures aadg and aadq as well as the two card packs.
      '34c1000003890002', '3c80000003a40002',
    ],
  },
  {
    id: 'kirby-air-riders', title: 'Kirby Air Riders', platform: 'Switch 2',
    source: 'https://www.nintendo.com/us/gaming-systems/switch-2/featured-games/kirby-air-riders/connect/',
    de: 'Setze den Fahrer auf eine Maschine und scanne die Kombination, um ihn als Figurenspieler zu trainieren. Die Katalog-ID bezeichnet den Fahrer.',
    en: 'Place the rider on a machine and scan the combination to train a Figure Player. The catalogue ID identifies the rider.',
    communityLink: 'https://github.com/Bing-Bong-Bang/air-riders-amiibo-tracker/releases/tag/v0.1.0',
    ids: ['1f00000004c41e03', '1f03010004c91e03', '1f01000004c61e03', '1f02000004c71e03', '1f04000004ca1e03'],
  },
  {
    id: 'metroid-dread', title: 'Metroid Dread', platform: 'Switch',
    source: 'https://metroid.nintendo.com/dread/samus/',
    de: 'Die Dread-Ausgabe von Samus gibt einmal pro Spielstand einen Energietank, E.M.M.I. einen Missile+-Tank. Beide können einmal täglich den jeweiligen Vorrat auffüllen.',
    en: 'The Dread edition of Samus grants an Energy Tank once per save file. E.M.M.I. grants a Missile+ Tank. Each can replenish its respective resource once per day.',
    ids: ['05c0000004121302', '05c4000004131302'],
  },
  {
    id: 'ocarina-of-time', title: 'The Legend of Zelda: Ocarina of Time', platform: 'Switch 2',
    source: ocarinaUsage,
    de: 'Diese Zelda-Figuren rufen Gegenstände herbei. Die amiibo-Funktion wird nach dem ersten Besuch der Hylianischen Steppe verfügbar.',
    en: 'These Zelda figures summon useful items. The amiibo option becomes available after you first reach Hyrule Field.',
    ids: [
      '01000000034f0902', '01410000035c0902', '0105000003580902', '01020100001b0002',
      '01020100041a0902', '0140000003550902', '0100000000040002', '0100000003530902',
      '0100000003990902', '01000000034c0902', '01000000034b0902', '0100000003540902',
      '01000000034e0902', '0100000004180902', '01000000034d0902', '01030000024f0902',
      '010d000004a70902', '01070000035a0902', '01080000035b0902', '0109000004a30902',
      '0101010000170002', '010a000004a40902', '0100010000160002', '0100010003500902',
      '0101000003520902', '010b000004a50902', '0106000003590902', '01000000037c0002',
      '010c000004a60902', '01010000000e0002', '0101000003560902', '0101000004190902',
      '0101030004140902',
    ],
  },
];
