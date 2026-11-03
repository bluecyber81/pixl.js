import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import { parse, compileScript } from '@vue/compiler-sfc';
import postcss from 'postcss';

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
  app.use(VueI18n.createI18n({ legacy: false, locale, messages: { [locale]: {} } }));
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
    const picker = nodes(root, 'input').find(node => node.props.type === 'file');
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
