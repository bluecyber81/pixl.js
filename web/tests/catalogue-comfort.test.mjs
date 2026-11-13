import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import { parse, compileScript } from '@vue/compiler-sfc';
import postcss from 'postcss';
import { gameGuides } from '../src/data/game-guides.js';
import { announcementGroups } from '../src/data/announced-figures.js';
import de_DE from '../src/i18n/de_DE.js';
import en_US from '../src/i18n/en_US.js';

// Exercise the production SFC with Vue's renderer/reactivity. The host records
// rendered image requests, button events and focus/scroll calls without network
// or Bluetooth access. Inputs use the compiled v-model update handlers.
async function component(filename) {
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  let source = compileScript(descriptor, { id: filename, inlineTemplate: true }).content;
  const imports = [];
  source = source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, binding, spec) => {
    imports.push({ binding, spec }); return '';
  });
  const modules = [];
  for (const { spec } of imports) {
    if (spec === 'vue') modules.push({ ...Vue, vModelText: {}, vModelSelect: {}, vModelCheckbox: {} });
    else if (spec === 'vue-i18n') modules.push(VueI18n);
    else {
      const target = path.resolve(path.dirname(filename), spec);
      modules.push(spec.endsWith('.vue') ? { default: await component(target) }
        : spec.endsWith('.json') ? { default: JSON.parse(fs.readFileSync(target, 'utf8')) }
        : await import(pathToFileURL(target)));
    }
  }
  const bindings = imports.map(({ binding }, index) => binding.startsWith('{')
    ? `const ${binding.replace(/\s+as\s+/g, ':')}=modules[${index}];`
    : `const ${binding}=modules[${index}].default;`).join('\n');
  return new Function('modules', `${bindings}\n${source.replace('export default', 'return')}`)(modules);
}
function hostNode(type, text = '') {
  return {
    type, text, props: {}, children: [], parent: null, calls: [],
    focus(options) { this.calls.push(['focus', options]); },
    scrollIntoView(options) { this.calls.push(['scroll', options]); },
    getAttribute(name) { return this.props[name] ?? null; },
    get isConnected() { return !!this.parent; },
  };
}
const renderer = Vue.createRenderer({
  createElement: tag => hostNode(tag), createText: value => hostNode('#text', value), createComment: value => hostNode('#comment', value),
  setText: (node, value) => node.text = value,
  setElementText: (node, value) => { node.text = value; node.children = []; },
  patchProp: (node, key, previous, next) => node.props[key] = next,
  insert(node, parent, anchor = null) {
    if (node.parent) {
      const index = node.parent.children.indexOf(node);
      if (index >= 0) node.parent.children.splice(index, 1);
    }
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    index < 0 ? parent.children.push(node) : parent.children.splice(index, 0, node);
  },
  remove(node) { const index = node.parent?.children.indexOf(node); if (index >= 0) node.parent.children.splice(index, 1); node.parent = null; },
  parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
});
const nodes = (node, type) => [node, ...node.children.flatMap(child => nodes(child))].filter(item => !type || item.type === type);
const text = node => node.text + node.children.map(text).join('');
const classNode = (root, name) => nodes(root).find(node => String(node.props.class || '').split(' ').includes(name));
const cards = root => nodes(classNode(root, 'entries'), 'li');
const images = root => nodes(classNode(root, 'entries'), 'img');
const COMMIT = '1234567890abcdef1234567890abcdef12345678';
function catalogue(count = 4, commit = COMMIT) {
  return { commit, checkedDate: '2026-11-03', sourceUrl: 'https://github.com/8bitDream/AmiiboAPI', entries:
    Array.from({ length: count }, (_, index) => ({ id: (index + 1).toString(16).padStart(16, '0'), name: `Figure ${String(index + 1).padStart(3, '0')}`,
      series: index % 2 ? 'Second series' : 'First series', type: 'Figure', firmwareIdKnown: index % 2 === 0, release: { eu: '2020-01-01' } })) };
}
function report() {
  const [a, b, c] = catalogue().entries.map(entry => entry.id);
  return { schema: 1, mode: 'full', rootPath: 'E:/', status: 'complete', complete: true, scanComplete: true,
    contentComplete: true, errors: [], limitsReached: [], stats: {}, present: [],
    files: [{ id: a, path: 'E:/a.bin', status: 'structure-consistent', issues: [] },
      { id: b, path: 'E:/b.bin', status: 'attention', issues: ['bcc0'] }],
    missing: [{ id: c, state: 'no-structurally-consistent-file-observed' }] };
}
async function mount(props = {}, locale = 'de_DE') {
  const Component = await component(fileURLToPath(new URL('../src/components/CataloguePanel.vue', import.meta.url)));
  const root = hostNode('root'), state = Vue.reactive({ catalogue: catalogue(), ...props });
  const app = renderer.createApp({ render: () => Vue.h(Component, state) });
  app.use(VueI18n.createI18n({ legacy: false, locale, messages: { de_DE, en_US } }));
  app.mount(root); await Vue.nextTick(); return { root, state, app };
}
async function click(root, label) {
  const button = nodes(root, 'button').find(node => text(node) === label);
  assert.ok(button, label); assert.notEqual(button.props.disabled, true, label);
  await button.props.onClick({ currentTarget: button }); await Vue.nextTick();
}
async function gallery(root, value) {
  nodes(classNode(root, 'gallery-switch'), 'input')[0].props['onUpdate:modelValue'](value); await Vue.nextTick();
}
async function filter(root, value) {
  nodes(classNode(root, 'presence-filter'), 'select')[0].props['onUpdate:modelValue'](value); await Vue.nextTick();
}

test('documented games select exact editions and intersect with device evidence in both languages', async () => {
  const realCatalogue = JSON.parse(fs.readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'));
  const fatalFury = gameGuides.find(game => game.id === 'fatal-fury-cotw');
  const [clean, inspected] = fatalFury.ids;
  const device = report();
  device.files[0].id = clean;
  device.files[1].id = inspected;
  for (const locale of ['de_DE', 'en_US']) {
    const de = locale === 'de_DE';
    const { root, state, app } = await mount({ catalogue: realCatalogue, collectionReport: device }, locale);
    try {
      const select = nodes(classNode(root, 'game-filter'), 'select')[0];
      select.props['onUpdate:modelValue'](fatalFury.id); await Vue.nextTick();
      const guide = classNode(root, 'game-guide');
      assert.match(text(guide), de ? /Startersets/ : /starter sets/);
      assert.equal(nodes(guide, 'a')[0].props.href, fatalFury.source);
      const shownIds = () => cards(root).map(card => nodes(card, 'code')[0].text);
      assert.deepEqual(new Set(shownIds()), new Set(fatalFury.ids));
      const matches = realCatalogue.entries.filter(entry => fatalFury.ids.includes(entry.id));
      assert.equal(matches.filter(entry => entry.type === 'Figure').length, 2);
      assert.deepEqual(matches.filter(entry => entry.type === 'Card').map(entry => entry.name).sort(),
        ['Chun-Li','Chun-Li','Ken','Ken','Mai','Mai','Terry','Terry']);
      assert.equal(classNode(root, 'announcements'), undefined);
      await filter(root, 'observed');
      assert.deepEqual(new Set(shownIds()), new Set([clean, inspected]));
      assert.deepEqual(cards(root).map(card => card.props['data-presence']).sort(), ['attention', 'present']);
      state.collectionStale = true; await Vue.nextTick();
      assert.deepEqual(shownIds(), []);
      await filter(root, '');
      select.props['onUpdate:modelValue']('kirby-air-riders'); await Vue.nextTick();
      assert.equal(cards(root).length, 5);
      assert.match(text(classNode(root, 'game-guide')), /Air Riders Stat Tracker/);
      const announced = classNode(root, 'announcements');
      assert.equal(nodes(announced, 'li').length, 2);
      assert.equal(announced.props.open, true);
      assert.match(text(classNode(announced, 'group-title')), de ? /Erschienen/ : /Released/);
      assert.match(text(announced), de ? /Figurenspieler/ : /Figure Players/);
      const checked = new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', {dateStyle:'long', timeZone:'UTC'})
        .format(new Date(announcementGroups[0].sourceCheckedOn + 'T00:00:00Z'));
      assert.ok(text(announced).includes(checked));
      await click(root, de ? 'Suche und Filter zurücksetzen' : 'Reset search and filters');
      assert.equal(classNode(root, 'game-guide'), undefined);
      assert.equal(nodes(classNode(root, 'announcements'), 'li').length, 9);
    } finally { app.unmount(); }
  }
});

test('all documented game IDs resolve in the baseline and stay separate from announcement ID proposals', () => {
  const { entries } = JSON.parse(fs.readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'));
  const known = new Set(entries.map(entry => entry.id));
  const proposed = new Set(announcementGroups.flatMap(group => group.figures.map(figure => figure.proposedId).filter(Boolean)));
  for (const game of gameGuides) {
    assert.equal(new Set(game.ids).size, game.ids.length, game.id);
    assert.ok(game.ids.every(id => known.has(id) && !proposed.has(id)), game.id);
    assert.ok(new URL(game.source).hostname.endsWith('.nintendo.com'), game.id);
  }
});

test('the nine regional releases and announcements have official links and stay outside inventory counts', async () => {
  const { root, app } = await mount({ collectionReport: report() });
  try {
    const section = classNode(root, 'announcements');
    assert.equal(section.props.open, false);
    assert.match(text(nodes(section, 'summary')[0]), /Figuren und Erscheinungstermine \(9\)/);
    const figures = nodes(section, 'li');
    assert.equal(figures.length, 9);
    for (const figure of figures) {
      const official = nodes(figure, 'a')[0];
      assert.equal(new URL(official.props.href).hostname, 'www.nintendo.com');
      assert.equal(official.props.rel, 'noopener noreferrer');
    }
    assert.equal(nodes(section, 'code').length, 2);
    assert.equal(nodes(section, 'img').length, 0);
    assert.equal(cards(root).length, 4);
    assert.match(text(classNode(root, 'result-bar')), /^4 Treffer/);
    await filter(root, 'missing');
    assert.equal(classNode(root, 'announcements'), undefined);
    assert.equal(cards(root).length, 1);
  } finally { app.unmount(); }
});

test('announcement search opens relevant results by either language or proposed ID and separates them from known IDs', async () => {
  const { root, app } = await mount({}, 'en_US');
  try {
    const search = nodes(root, 'input').find(node => node.props.type === 'search');
    for (const term of ['junger link', 'YOUNG LINK', '0100000004FD0902']) {
      search.props['onUpdate:modelValue'](term); await Vue.nextTick();
      const section = classNode(root, 'announcements');
      assert.equal(section.props.open, true);
      assert.equal(nodes(section, 'li').length, 1);
      assert.match(text(section), /Young Link/);
      assert.match(text(section), /Unconfirmed community ID0100000004fd0902/);
      assert.match(text(section), /Other compatible Zelda figures give you items/);
      assert.equal(cards(root).length, 0);
      assert.match(text(classNode(root, 'empty-result')), /Figure release dates/);
    }
    search.props['onUpdate:modelValue']('01000000037c0002'); await Vue.nextTick();
    assert.equal(classNode(root, 'announcements'), undefined, 'the existing Smash edition has another ID');
    search.props['onUpdate:modelValue']('Proto Man'); await Vue.nextTick();
    assert.match(text(classNode(root, 'announcements')), /Spring 2027/);
    assert.equal(nodes(classNode(root, 'announcements'), 'code').length, 0);
  } finally { app.unmount(); }
});

test('series dropdown includes announcement-only series and keeps their counts separate from catalogue and device filters', async () => {
  const cat = catalogue(2);
  cat.entries[0].series = 'Kirby Air Riders';
  const { root, app } = await mount({ catalogue: cat }, 'en_US');
  try {
    const [series, kind] = nodes(classNode(root, 'filters'), 'select');
    const options = nodes(series, 'option').map(text);
    assert.deepEqual(options, ['All series', 'Kirby Air Riders', 'Mega Man: Dual Override', 'Metroid Ravenous',
      'Second series', 'The Legend of Zelda: Ocarina of Time']);
    for (const [name, count] of [['Mega Man: Dual Override', 2], ['Metroid Ravenous', 3], ['The Legend of Zelda: Ocarina of Time', 2]]) {
      series.props['onUpdate:modelValue'](name); await Vue.nextTick();
      const section = classNode(root, 'announcements');
      assert.equal(section.props.open, true);
      assert.deepEqual(nodes(section, 'strong').map(text), [name]);
      assert.equal(nodes(section, 'li').length, count);
      assert.equal(text(nodes(section, 'summary')[0]), `Figure release dates (${count})`);
      assert.match(text(classNode(section, 'group-title')), /Announced/);
      assert.equal(cards(root).length, 0);
      assert.match(text(classNode(root, 'result-bar')), /^0 results with a catalogue ID/);
      assert.match(text(classNode(root, 'empty-result')), /Figure release dates/);
      assert.equal(nodes(root, 'nav').length, 0);
    }
    const known = nodes(classNode(root, 'known'), 'input')[0];
    known.props['onUpdate:modelValue'](true); await Vue.nextTick();
    assert.equal(classNode(root, 'announcements'), undefined);
    known.props['onUpdate:modelValue'](false); await Vue.nextTick();
    await filter(root, 'missing');
    assert.equal(classNode(root, 'announcements'), undefined);
    assert.equal(cards(root).length, 0);
    await filter(root, '');

    series.props['onUpdate:modelValue']('Kirby Air Riders'); await Vue.nextTick();
    assert.equal(nodes(classNode(root, 'announcements'), 'li').length, 2);
    assert.equal(cards(root).length, 1);
    assert.equal(text(classNode(root, 'count-badge')), '2 entries');
    assert.equal(nodes(root, 'nav').length, 1);
    kind.props['onUpdate:modelValue']('Figure'); await Vue.nextTick();
    assert.equal(nodes(classNode(root, 'announcements'), 'li').length, 2);
    await click(root, 'Reset search and filters');
    assert.equal(classNode(root, 'announcements').props.open, false);
    assert.equal(cards(root).length, 2);
  } finally { app.unmount(); }
});

test('gallery has no image requests before opt-in and renders only lazy images from the active page and commit', async () => {
  const { root, app } = await mount({ catalogue: catalogue(81) });
  try {
    assert.equal(nodes(root, 'img').length, 0);
    assert.match(text(root), /IP-Adresse/);
    await gallery(root, true);
    assert.equal(images(root).length, 40);
    for (const image of images(root)) {
      assert.match(image.props.src, new RegExp(`/AmiiboAPI/${COMMIT}/images/icon_`));
      assert.equal(image.props.loading, 'lazy'); assert.equal(image.props.decoding, 'async');
      assert.equal(image.props.referrerpolicy, 'no-referrer'); assert.equal(image.props.crossorigin, 'anonymous');
      assert.equal(image.props.width, '160'); assert.equal(image.props.height, '140');
    }
    const originalUrls = images(root).map(image => image.props.src);
    await click(root, 'Weiter');
    assert.equal(images(root).length, 40);
    assert.ok(images(root).every(image => !originalUrls.includes(image.props.src)));
    await click(root, 'Weiter'); assert.equal(images(root).length, 1);
    await gallery(root, false); assert.equal(images(root).length, 0);
  } finally { app.unmount(); }
});

test('gallery errors have placeholders, can be retried and stale revision events do not hide new images', async () => {
  const { root, state, app } = await mount();
  try {
    await gallery(root, true);
    const oldImage = images(root)[0]; oldImage.props.onError({ target: oldImage }); await Vue.nextTick();
    assert.equal(images(root).length, 3); assert.match(text(root), /Bild nicht verfügbar/);
    state.catalogue = catalogue(4, 'a'.repeat(40)); await Vue.nextTick();
    assert.equal(images(root).length, 4); assert.ok(images(root).every(image => image.props.src.includes('/' + 'a'.repeat(40) + '/')));
    oldImage.props.onError({ target: oldImage }); await Vue.nextTick(); assert.equal(images(root).length, 4);
    const current = images(root)[0]; current.props.onError({ target: current }); await Vue.nextTick(); assert.equal(images(root).length, 3);
    await gallery(root, false); await gallery(root, true); assert.equal(images(root).length, 4);
  } finally { app.unmount(); }
});

test('collection filters reuse evidence states, include unknown IDs and preserve historical warnings', async () => {
  const { root, state, app } = await mount({ collectionReport: report() });
  try {
    for (const [value, expectedName, expectedState] of [
      ['present', 'Figure 001', 'present'], ['attention', 'Figure 002', 'attention'],
      ['missing', 'Figure 003', 'missing'], ['unconfirmed', 'Figure 004', 'unknown'],
    ]) {
      await filter(root, value); assert.equal(cards(root).length, 1);
      assert.match(text(cards(root)[0]), new RegExp(expectedName)); assert.equal(cards(root)[0].props['data-presence'], expectedState);
    }
    state.collectionHistorical = true; state.collectionObservedAt = '2026-11-02T12:00:00Z'; await Vue.nextTick();
    await filter(root, 'missing'); assert.equal(cards(root).length, 1);
    assert.match(text(root), /Letzte Prüfung/); assert.match(text(root), /keinen aktuellen Live-Bestand/);
    state.collectionStale = true; await Vue.nextTick(); assert.equal(cards(root).length, 0);
    await filter(root, 'unconfirmed'); assert.equal(cards(root).length, 4);
    assert.ok(cards(root).every(card => card.props['data-presence'] === 'stale'));
    await click(root, 'Suche und Filter zurücksetzen'); assert.equal(cards(root).length, 4);
    assert.equal(nodes(classNode(root, 'presence-filter'), 'select')[0].props['onUpdate:modelValue'] instanceof Function, true);
  } finally { app.unmount(); }
});

test('missing filter never promotes no scan, quick scan, partial scan or invalid history into absence', async () => {
  for (const props of [{}, { collectionReport: { ...report(), mode: 'quick' } },
    { collectionReport: { ...report(), rootPath: 'E:/folder' } },
    { collectionReport: { ...report(), complete: false } },
    { collectionReport: report(), collectionHistorical: true, collectionObservedAt: 'invalid' }]) {
    const { root, app } = await mount(props);
    try { await filter(root, 'missing'); assert.equal(cards(root).length, 0); }
    finally { app.unmount(); }
  }
});

test('explicit pagination focuses the beginning of new results while typing and filtering keep input focus', async () => {
  const { root, app } = await mount({ catalogue: catalogue(81) });
  try {
    const anchor = classNode(root, 'result-bar'); assert.equal(anchor.props.tabindex, '-1');
    assert.equal(anchor.calls.length, 0);
    await click(root, 'Weiter');
    assert.match(text(cards(root)[0]), /Figure 041/);
    assert.deepEqual(anchor.calls, [['focus', { preventScroll: true }], ['scroll', { block: 'start', behavior: 'auto' }]]);
    const search = nodes(root, 'input').find(node => node.props.type === 'search');
    search.props['onUpdate:modelValue']('Figure 081'); await Vue.nextTick();
    assert.equal(cards(root).length, 1); assert.match(text(anchor), /Seite 1\/1/); assert.equal(anchor.calls.length, 2);
    await click(root, 'Suche und Filter zurücksetzen'); assert.match(text(cards(root)[0]), /Figure 001/); assert.equal(anchor.calls.length, 2);
    await filter(root, 'unconfirmed'); assert.equal(cards(root).length, 40); assert.equal(anchor.calls.length, 2);
    await click(root, 'Weiter'); assert.equal(anchor.calls.length, 4);
    await click(root, 'Zurück'); assert.match(text(cards(root)[0]), /Figure 001/); assert.equal(anchor.calls.length, 6);
  } finally { app.unmount(); }
});

test('pagination scroll target clears the mobile workspace navigation while retaining desktop spacing', async () => {
  const file = new URL('../src/components/CataloguePanel.vue', import.meta.url);
  const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file.pathname });
  const css = postcss.parse(descriptor.styles.map(style => style.content).join('\n'));
  const margins = [];
  css.walkRules('.result-bar', rule => rule.walkDecls('scroll-margin-top', declaration => {
    margins.push({ value: declaration.value, media: rule.parent.type === 'atrule' ? rule.parent.params : null });
  }));
  assert.deepEqual(margins, [{ value: '20px', media: null }, { value: '160px', media: '(max-width:650px)' }]);
  const appSource = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
  const appCss = postcss.parse(parse(appSource).descriptor.styles.map(style => style.content).join('\n'));
  const mobileNav = [];
  appCss.walkAtRules('media', media => {
    if (media.params !== '(max-width:650px)') return;
    media.walkRules('.workspace-nav', rule => rule.walkDecls('position', declaration => mobileNav.push(declaration.value)));
  });
  assert(mobileNav.includes('sticky'), 'margin breakpoint must match the actual sticky mobile workspace navigation');
  const { root, app } = await mount({ catalogue: catalogue(41) });
  try {
    await click(root, 'Weiter');
    const anchor = classNode(root, 'result-bar');
    assert.match(text(anchor), /Seite 2\/2/);
    assert.deepEqual(anchor.calls, [['focus', { preventScroll: true }], ['scroll', { block: 'start', behavior: 'auto' }]]);
  } finally { app.unmount(); }
});

test('status filtering is applied before pagination and combines with text and series filters', async () => {
  const cat = catalogue(81), fresh = report();
  cat.entries[41].name = 'Target FortyTwo';
  fresh.files = cat.entries.filter((_, index) => index >= 40).map(entry => ({ id: entry.id, path: 'E:/' + entry.id + '.bin', status: 'structure-consistent', issues: [] }));
  fresh.missing = [];
  const { root, app } = await mount({ catalogue: cat, collectionReport: fresh }, 'en_US');
  try {
    await filter(root, 'present'); assert.equal(cards(root).length, 40);
    assert.match(text(cards(root)[0]), /Figure 041/); assert.match(text(classNode(root, 'result-bar')), /41 results · Page 1\/2/);
    await click(root, 'Next'); assert.equal(cards(root).length, 1); assert.match(text(cards(root)[0]), /Figure 081/);
    const series = nodes(classNode(root, 'filters'), 'select')[0];
    series.props['onUpdate:modelValue']('Second series'); await Vue.nextTick();
    assert.equal(cards(root).length, 20); assert.ok(cards(root).every(card => text(card).includes('Second series')));
    const search = nodes(root, 'input').find(node => node.props.type === 'search');
    search.props['onUpdate:modelValue']('Target FortyTwo'); await Vue.nextTick(); assert.equal(cards(root).length, 1);
    assert.match(text(cards(root)[0]), /Target FortyTwo/); assert.match(text(root), /Present/);
  } finally { app.unmount(); }
});

test('page change closes old details and their separate image permission, but leaves the gallery preference intact', async () => {
  const { root, app } = await mount({ catalogue: catalogue(41) });
  try {
    await gallery(root, true);
    await click(root, 'Details und Bild'); assert.match(text(root), /Ausgewählte Figur/);
    await click(root, 'Bild einmal laden'); assert.equal(nodes(root, 'img').length, 41);
    await click(root, 'Weiter'); assert.doesNotMatch(text(root), /Ausgewählte Figur/);
    assert.equal(nodes(root, 'img').length, 1);
    assert.match(text(cards(root)[0]), /Figure 041/);
  } finally { app.unmount(); }
});

test('catalogue local-file inspection receives the active catalogue through the actual nested components', async () => {
  const cat = catalogue(1); cat.entries[0].name = 'Active Catalogue Fixture';
  const { root, state, app } = await mount({ catalogue: cat });
  try {
    const bytes = new Uint8Array(540); bytes[0] = 4; bytes[3] = 0x88 ^ 4; bytes[91] = 1;
    const inspector = nodes(root).find(node => node.props.class === 'local-inspector');
    const picker = nodes(inspector, 'input').find(node => node.props.type === 'file');
    await picker.props.onChange({ target: { files: [{ size: bytes.length, arrayBuffer: async () => bytes.buffer }], value: 'fixture.bin' } });
    await Vue.nextTick();
    assert.equal(text(nodes(root, 'h4')[0]), 'Active Catalogue Fixture');
    assert.equal(nodes(root, 'img').length, 0);
    const revised = catalogue(1, 'b'.repeat(40)); revised.entries[0].name = 'Revised Active Fixture';
    state.catalogue = revised; await Vue.nextTick();
    assert.equal(text(nodes(root, 'h4')[0]), 'Revised Active Fixture');
    assert.equal(nodes(root, 'img').length, 0);
  } finally { app.unmount(); }
});

test('web favourites follow public IDs through rename, removal and return in DE/EN; filtered pagination stays valid', async t => {
  const values = new Map();
  const browser = Object.assign(new EventTarget(), {localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
  const prior = Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:browser});
  t.after(()=>prior ? Object.defineProperty(globalThis,'window',prior) : Reflect.deleteProperty(globalThis,'window'));
  for (const locale of ['de_DE','en_US']) {
    values.clear();
    const cat = catalogue(45);
    const {root,state,app} = await mount({catalogue:cat},locale);
    try {
      await click(root,locale==='de_DE'?'Weiter':'Next');
      const favorite=classNode(cards(root)[0],'web-favorite');
      await favorite.props.onClick({currentTarget:favorite}); await Vue.nextTick();
      const scope=classNode(root,'saved-filters'), only=nodes(scope,'input').find(el=>el.props.type==='checkbox');
      only.props['onUpdate:modelValue'](true); await Vue.nextTick();
      assert.equal(cards(root).length,1); assert.match(text(classNode(root,'result-bar')),/1\/1/);
      const selected=cat.entries[40];
      state.catalogue={...cat,entries:[{...selected,name:'Renamed figure'}]}; await Vue.nextTick();
      assert.match(text(cards(root)[0]),/Renamed figure/);
      assert.equal(classNode(cards(root)[0],'web-favorite').props['aria-pressed'],true);
      assert.equal(cards(root)[0].props['data-presence'],'unknown');
      state.catalogue={...cat,entries:cat.entries.slice(0,2)}; await Vue.nextTick();
      assert.equal(cards(root).length,0); assert.equal(nodes(root,'nav').length,0);
      state.catalogue=cat; await Vue.nextTick(); assert.equal(cards(root).length,1);
      assert.equal(nodes(cards(root)[0],'code')[0].text,selected.id);
    } finally { app.unmount(); }
  }
});
