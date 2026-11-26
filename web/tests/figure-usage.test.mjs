import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import { parse, compileScript } from '@vue/compiler-sfc';
import { figureUsage } from '../src/lib/figure-usage.js';
import deLocale from '../src/i18n/de_DE.js';
import enLocale from '../src/i18n/en_US.js';
import supplement from '../src/data/usage-nintendo-supplement.json' with { type: 'json' };

const data = JSON.parse(fs.readFileSync(new URL('../src/data/figure-usage.json', import.meta.url), 'utf8'));
const german = data.figures.find(figure => figure.associations.some(row => data.notes.find(note => note.id === row.noteId)?.de));
// A later catalogue may add an English note before its translation is available.
const partial = { ...data, notes: data.notes.map(note => ({ ...note, de: null })) };
const groupingOnly = data.figures.find(figure => figure.associations.length && figure.associations.every(row => row.noteId === null));

test('usage lookup is exact-ID only, with no name/series/private-note inference', () => {
  for (const id of [null, '', 'Mario', 'Zelda', '0000000000000000', 'ffffffffffffffff', `${german.id}/extra`]) {
    assert.deepEqual(figureUsage(id, data), []);
  }
  assert.deepEqual(figureUsage(german.id.toUpperCase(), data), figureUsage(german.id, data));
  assert.deepEqual(figureUsage(german.id, { ...data, schemaVersion: 2 }), []);
});

test('German translations keep the original; missing translations fall back only to their exact English note', () => {
  const de = figureUsage(german.id, data, 'de_DE');
  const translated = de.find(row => row.translated);
  assert.equal(translated.language, 'de');
  assert.ok(translated.original);
  const en = figureUsage(german.id, data, 'en_US').find(row => row.groupId === translated.groupId);
  assert.equal(en.text, translated.original);
  assert.equal(en.original, null);
  assert.equal(en.translated, false);
  const fallback = figureUsage(german.id, partial, 'de_DE').find(row => row.groupId === translated.groupId);
  assert.equal(fallback.text, translated.original);
  assert.equal(fallback.language, 'en');
  assert.equal(fallback.translated, false);
  for (const row of figureUsage(groupingOnly.id, data)) assert.equal(row.text, null);
});

test('eight exact catalogue figures gain bilingual reward notes with distinct Switch editions', () => {
  const checks = [
    ['22430000043d1b02',19,/Konsul-Anzug von N/,/N’s Consul Suit/],
    ['22440000043e1b02',19,/Konsul-Anzug von M/,/M’s Consul Suit/],
    ['3540000005032002',78,/S&S M232/,/S&S M232/],
    ['3541000005042002',78,/Requiem/,/Requiem/],
    ['3580000005062102',77,/drei Arten/,/three types/],
    ['350c000004fa0f02',79,/Dekorrüstung/,/layered armor/],
    ['350d000004fb0f02',79,/Dekorrüstung/,/layered armor/],
    ['350e000004fc0f02',79,/Outfit für Rudy/,/outfit for Rudy/],
  ];
  for (const [id,group,de,en] of checks) {
    const row=figureUsage(id,data,'de_DE').find(row=>row.groupId===group);
    assert.match(row.text,de);
    assert.match(row.original,en);
    assert.equal(row.platform,group===19?'Switch':'Switch 2');
    assert.equal(row.webSupplement,true);
  }
  const edition=supplement.games.find(game=>game.groupId===19);
  assert.match(edition.en,/general amiibo support for the Switch 2 Edition/);
  assert.match(edition.editionSource,/Nintendo-Switch-2-Edition/);
  for (const id of ['02de0001009c0502','02710001019b0502'])
    assert.ok(!figureUsage(id,data).some(row=>[77,79].includes(row.groupId)), 'Namesake Animal Crossing cards stay distinct');
});

test('all exported rows keep a group path and pinned source line without external requests', () => {
  let associations = 0, notes = 0, translated = 0, official = 0;
  for (const figure of data.figures) {
    for (const row of figureUsage(figure.id, data)) {
      associations++;
      if (row.text) notes++;
      if (row.translated) translated++;
      if (row.guideUrl) official++;
      assert.ok(row.label);
      if (row.webSupplement) {
        assert.equal(row.officialAssociation, true);
        const game = supplement.games.find(game => game.groupId === row.groupId);
        assert.ok(game, 'Every added association is tied to a reviewed game source');
        assert.equal(row.platform, game.platform);
        const reviewed = game.rows.find(note => note.ids.includes(figure.id));
        assert.equal(row.sourceUrl, reviewed.source || game.source);
        assert.ok(new URL(row.sourceUrl).hostname.endsWith('.nintendo.com'));
        assert.ok(row.text && row.original);
        continue;
      }
      if (row.officialAssociation && row.groupId === 82) {
        assert.ok(['0100000004fd0902','0101000004ff0902'].includes(figure.id));
        assert.match(row.sourceUrl, /^https:\/\/www\.nintendo\.com\/us\/amiibo\/detail\/young-(?:link|zelda)-/);
        assert.match(row.text, /Maske/);
        continue;
      }
      if (row.officialAssociation) {
        assert.equal(row.groupId, 75);
        assert.match(row.text, /Trainiere den Fahrer/);
        if (!['1f00010004c51e03', '1f02010004c81e03'].includes(figure.id)) {
          assert.equal(row.sourceUrl, 'https://www.nintendo.com/us/gaming-systems/switch-2/featured-games/kirby-air-riders/connect/');
          assert.equal(row.sinceGameVersion, undefined); continue;
        }
        assert.equal(row.sinceGameVersion, '1.3.3');
        assert.match(row.sourceUrl, /^https:\/\/www\.nintendo\.com\/de-de\/.*2967700\.html$/);
        continue;
      }
      assert.match(row.sourceUrl, /^https:\/\/github\.com\/bluecyber81\/pixl\.js\/blob\/[0-9a-f]{40}\/fw\/data\/amiidb_link\.csv#L[1-9][0-9]*$/);
    }
  }
  assert.deepEqual({ associations, notes, translated, official }, { associations: 1416, notes: 174, translated: 170, official: 4 });
});

test('reviewed Nintendo web notes use exact editions and platforms without firmware-only group inference', () => {
  const shadow = figureUsage('0100000003990902', data).find(row => row.groupId === 5);
  const ordinary = figureUsage('0100000000040002', data).find(row => row.groupId === 5);
  assert.match(shadow.text, /Schatten-Link/);
  assert.doesNotMatch(ordinary.text, /Schatten-Link/);
  assert.match(ordinary.text, /fünf/);
  assert.match(ordinary.text, /speichern/);
  const yoshi = figureUsage('0003000000020002', data).find(row => row.groupId === 'web-yoshi-mysterious-book');
  assert.equal(yoshi.platform, 'Switch 2');
  assert.match(yoshi.text, /täglich.*Glyphen/);
  for (const id of ['09c40101027d0e02', '00030003039fff02', '0003000404421c02']) {
    assert.ok(!figureUsage(id, data).some(row => row.groupId === 'web-yoshi-mysterious-book'), 'no card/band/block inference');
  }
});

// Compile and mount the actual Vue template; this small renderer records emitted UI.
const filename = new URL('../src/components/FigureUsage.vue', import.meta.url).pathname;
const { descriptor } = parse(fs.readFileSync(new URL('../src/components/FigureUsage.vue', import.meta.url), 'utf8'), { filename });
let source = compileScript(descriptor, { id: 'figure-usage-test', inlineTemplate: true }).content;
source = source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, binding, module) => {
  const value = module === 'vue' ? 'Vue' : module === 'vue-i18n' ? 'VueI18n' : module.endsWith('.json') ? 'data' : 'usageModule';
  return `const ${binding.startsWith('{') ? binding.replace(/\s+as\s+/g, ':') : binding} = ${value};`;
});
const makeComponent = new Function('Vue', 'VueI18n', 'data', 'usageModule', source.replace('export default', 'return'));
const node = (type, text = '') => ({ type, text, children: [], props: {}, parent: null });
const renderer = Vue.createRenderer({
  createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (item, text) => { item.text = text; }, setElementText: (item, text) => { item.text = text; item.children = []; },
  patchProp: (item, key, before, after) => { item.props[key] = after; },
  insert(item, parent, anchor = null) { if (item.parent) { const old = item.parent.children.indexOf(item); if (old >= 0) item.parent.children.splice(old, 1); } item.parent = parent; const index = anchor ? parent.children.indexOf(anchor) : -1; index < 0 ? parent.children.push(item) : parent.children.splice(index, 0, item); },
  remove(item) { const index = item.parent?.children.indexOf(item); if (index >= 0) item.parent.children.splice(index, 1); item.parent = null; },
  parentNode: item => item.parent, nextSibling: item => item.parent?.children[item.parent.children.indexOf(item) + 1] || null,
});
function nodes(item, type) { return [item, ...item.children.flatMap(child => nodes(child))].filter(child => !type || child.type === type); }
function text(item) { return item.text + item.children.map(text).join(''); }
async function mount(props, dataset = data) {
  const Component = makeComponent(Vue, VueI18n, dataset, { figureUsage });
  const state = Vue.reactive(props), root = node('root');
  const app = renderer.createApp({ render: () => Vue.h(Component, state) });
  app.use(VueI18n.createI18n({ legacy: false, locale: 'de_DE', fallbackLocale: 'en', missingWarn: false, fallbackWarn: false, messages: { de_DE: deLocale, en: enLocale } }));
  app.mount(root); await Vue.nextTick(); return { state, root, app };
}

test('actual component shows the bundled catalogue version beside its heading and follows locale with English fallback', async () => {
  const { root, state, app } = await mount({ id: german.id, locale: 'de_DE' });
  try {
    const heading = nodes(root, 'div').find(item => item.props.class === 'usage-heading');
    assert.ok(heading, 'version belongs to the visible catalogue heading');
    assert.match(text(heading), /Kataloghinweise/);
    assert.ok(text(heading).includes(`Katalogstand: ${data.dataVersion}`));
    state.locale = 'en_US'; await Vue.nextTick();
    assert.ok(text(heading).includes(`Catalogue version: ${data.dataVersion}`));
    for (const locale of ['es', 'zh_CN', 'ru_RU', 'ja_JP']) {
      state.locale = locale; await Vue.nextTick();
      assert.ok(text(heading).includes(`Catalogue version: ${data.dataVersion}`), locale);
      assert.ok(!text(heading).includes('figureUsage.catalogueVersion'));
    }
    state.id = 'ffffffffffffffff'; state.locale = 'de_DE'; await Vue.nextTick();
    assert.ok(text(heading).includes(`Katalogstand: ${data.dataVersion}`), 'version remains visible for unknown IDs');
    assert.equal(nodes(root, 'a').length, 0, 'version adds no network request or external link');
  } finally { app.unmount(); }
});

test('actual component labels claims, translations, exact sources and unknown/empty notes honestly', async () => {
  const { root, state, app } = await mount({ id: german.id, locale: 'de_DE' });
  try {
    assert.match(text(root), /Keine Bestätigung der Spielkompatibilität oder Belohnungen/);
    assert.match(text(root), /Redaktionelle Übersetzung aus dem Englischen/);
    assert.match(text(root), /Englischen Quelltext anzeigen/);
    for (const link of nodes(root, 'a')) { assert.match(link.props.href, /#L\d+$/); assert.equal(link.props.referrerpolicy, 'no-referrer'); }
    state.id = groupingOnly.id; await Vue.nextTick();
    assert.match(text(root), /Katalogzuordnung ohne deutschen oder englischen Nutzungshinweis/);
    state.id = 'ffffffffffffffff'; await Vue.nextTick();
    assert.match(text(root), /Daraus lässt sich keine Aussage zur Spielunterstützung ableiten/);
    assert.equal(nodes(root, 'a').length, 0);
    assert.equal(nodes(root, 'img').length, 0);
  } finally { app.unmount(); }
});

test('both Kirby riders link to the official game update in DE and EN', async () => {
  const { root, state, app } = await mount({ id: '1f00010004c51e03', locale: 'de_DE' });
  try {
    for (const id of ['1f00010004c51e03', '1f02010004c81e03']) {
      for (const locale of ['de_DE', 'en_US']) {
        state.id = id; state.locale = locale; await Vue.nextTick();
        assert.match(text(root), /1\.3\.3/);
        assert.match(text(root), locale === 'de_DE' ? /Trainiere den Fahrer als Figurenspieler/ : /Train the rider as a Figure Player/);
        const training = nodes(root, 'li').find(row => text(nodes(row, 'strong')[0]) === 'Kirby Air Riders');
        const links = nodes(training, 'a');
        assert.equal(links.length, 1);
        assert.equal(text(links[0]), locale === 'de_DE' ? 'Quelle: Nintendo-Spielupdate' : 'Source: Nintendo game update');
        assert.match(links[0].props.href, /^https:\/\/www\.nintendo\.com\/de-de\/.*2967700\.html$/);
      }
    }
  } finally { app.unmount(); }
});

test('Mineru shows three Nintendo rewards in both languages, with optional fabric confined to Tears of the Kingdom', async () => {
  const { root, state, app } = await mount({ id: '010d000004a70902', locale: 'de_DE' });
  try {
    for (const locale of ['de_DE', 'en_US']) {
      state.locale = locale;
      await Vue.nextTick();
      const german = locale === 'de_DE';
      const rows = nodes(root, 'li');
      for (const [game, fabric] of [['Breath of the Wild', false], ['Tears of the Kingdom', true], [german ? 'Chronik der Versiegelung' : 'Age of Imprisonment', false]]) {
        const matches = rows.filter(row => text(nodes(row, 'strong')[0]).endsWith(game));
        assert.equal(matches.length, 1, game);
        const body = nodes(matches[0], 'p')[0];
        assert.equal(body.props.lang, german ? 'de' : 'en');
        assert.match(text(body), german ? /zufällige Gegenstände/ : /random items/);
        assert.equal((german ? /Mit etwas Glück.*Parasegel/ : /may also.*paraglider/).test(text(body)), fabric);
        assert.ok(nodes(matches[0], 'a').some(link => link.props.href.includes('/us/amiibo/detail/minerus-construct-')));
      }
      assert.ok(rows.some(row => text(nodes(row, 'strong')[0]).endsWith('Ocarina of Time')));
    }
  } finally { app.unmount(); }
});

test('curated notes keep editions, platforms and source wording distinct in the actual component', async () => {
  const { root, state, app } = await mount({ id: '34c1000003890002', locale: 'de_DE' });
  try {
    const gameRows = () => nodes(root, 'li');
    let row = gameRows().find(row => text(nodes(row, 'strong')[0]) === 'Fatal Fury: City of the Wolves');
    assert.ok(row);
    assert.match(text(row), /Avatare.*Titel.*Erfahrung/);
    assert.match(text(row), /Nintendo Switch 2/);
    assert.match(text(row), /Redaktioneller Spielhinweis nach Nintendo-Quelle/);
    assert.match(text(row), /Englische Fassung anzeigen/);
    assert.doesNotMatch(text(row), /Englischen Quelltext/);
    state.id = '0100000000040002'; await Vue.nextTick();
    row = gameRows().find(row => text(nodes(row, 'strong')[0]) === 'The Legend of Zelda: Ocarina of Time');
    assert.match(text(row), /Gegenstände.*Hylianischen Steppe/);
    assert.equal(text(nodes(row, 'a')[0]), 'Spielhinweis von Nintendo');
    state.id = '0100000004fd0902'; await Vue.nextTick();
    row = gameRows().find(row => text(nodes(row, 'strong')[0]) === 'The Legend of Zelda: Ocarina of Time');
    assert.match(text(row), /besondere Maske/);
    assert.equal(text(nodes(row, 'a')[0]), 'Quelle: Nintendo-Figurenseite');
    state.id = '1f00010004c51e03'; state.locale = 'en_US'; await Vue.nextTick();
    row = gameRows().find(row => text(nodes(row, 'strong')[0]) === 'Miitopia');
    assert.match(text(row), /Nintendo Switch/);
    assert.match(text(row), /not on Nintendo 3DS/);
    state.id = '1f02010004c81e03'; await Vue.nextTick();
    assert.ok(!gameRows().some(row => text(nodes(row, 'strong')[0]) === 'Miitopia'));
    for (const row of gameRows()) assert.doesNotMatch(text(row), /10.20 Fragments|two Picture Pieces|Maxim Tomato/);
  } finally { app.unmount(); }
});

test('only the four Mipha and Urbosa game notes show the corrected Nintendo evidence in both languages', async () => {
  const examples = [
    ['0106000003590902', 'Urbosa-1239434.html', 'Vah Naboris'],
    ['01070000035a0902', 'Mipha-1239432.html', 'Vah Ruta'],
  ];
  const { root, state, app } = await mount({ id: examples[0][0], locale: 'de_DE' });
  try {
    for (const [id, page, beast] of examples) {
      for (const locale of ['de_DE', 'en_US']) {
        state.id = id; state.locale = locale; await Vue.nextTick();
        const de = locale === 'de_DE';
        const guideRows = nodes(root, 'li').filter(row => nodes(row, 'a').some(a => a.props.href.startsWith('https://www.nintendo.com/')));
        assert.equal(guideRows.length, 2);
        for (const row of guideRows) {
          const link = nodes(row, 'a')[0];
          assert.match(text(link), de ? /Spielhinweis von Nintendo/ : /Nintendo game guide/);
          assert.equal(link.props.href, 'https://www.nintendo.com/' + (de ? 'de-de/Hardware/amiibo-/Details/' : 'en-gb/Hardware/amiibo-/amiibo-details/') + page);
          assert.equal(nodes(row, 'details').length, 0);
          const body = nodes(row, 'p')[0];
          assert.equal(body.props.lang, de ? 'de' : 'en');
          if (text(nodes(row, 'strong')[0]).endsWith('Breath of the Wild')) assert.ok(text(body).includes(beast));
          else assert.match(text(body), de ? /Parasegel/ : /paraglider/);
          assert.doesNotMatch(text(body), /Naydra|Ruto|Gurudo|Revali/);
        }
      }
    }
    state.id = german.id; await Vue.nextTick();
    assert.doesNotMatch(text(root), /Nintendo game guide/);
  } finally { app.unmount(); }
});

test('the component still labels an untranslated note from a partial catalogue', async () => {
  const { root, app } = await mount({ id: german.id, locale: 'de_DE' }, partial);
  try {
    assert.match(text(root), /Englischer Quelltext · keine deutsche Übersetzung hinterlegt/);
    assert.ok(nodes(root, 'p').some(p => p.props.lang === 'en' && p.text));
  } finally { app.unmount(); }
});

test('compact notes expand and reset when selection changes, including English locale', async () => {
  const many = data.figures.find(figure => figure.associations.length > 3);
  const { root, state, app } = await mount({ id: many.id, locale: 'de_DE', compact: true });
  try {
    assert.equal(nodes(root, 'li').length, 3);
    nodes(root, 'button')[0].props.onClick(); await Vue.nextTick();
    assert.equal(nodes(root, 'li').length, many.associations.length);
    state.id = 'ffffffffffffffff'; await Vue.nextTick();
    state.id = many.id; state.locale = 'en_US'; await Vue.nextTick();
    assert.equal(nodes(root, 'li').length, 3);
    assert.match(text(root), /Game compatibility and rewards have not been verified/);
    assert.match(text(nodes(root, 'button')[0]), /Show all/);
  } finally { app.unmount(); }
});
