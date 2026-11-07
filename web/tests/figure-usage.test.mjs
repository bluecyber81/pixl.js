import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import { parse, compileScript } from '@vue/compiler-sfc';
import { figureUsage } from '../src/lib/figure-usage.js';
import deLocale from '../src/i18n/de_DE.js';
import enLocale from '../src/i18n/en_US.js';

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

test('all exported rows keep a group path and pinned source line without external requests', () => {
  let associations = 0, notes = 0, translated = 0;
  for (const figure of data.figures) {
    for (const row of figureUsage(figure.id, data)) {
      associations++;
      if (row.text) notes++;
      if (row.translated) translated++;
      assert.ok(row.label);
      assert.match(row.sourceUrl, /^https:\/\/github\.com\/bluecyber81\/pixl\.js\/blob\/[0-9a-f]{40}\/fw\/data\/amiidb_link\.csv#L[1-9][0-9]*$/);
    }
  }
  assert.deepEqual({ associations, notes, translated }, { associations: 1344, notes: 63, translated: 63 });
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
