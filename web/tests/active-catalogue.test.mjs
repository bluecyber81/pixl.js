import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { parse, compileTemplate } from '@vue/compiler-sfc';

// Exercise the actual three parent bindings as compiled Vue, independently of
// the child tests. This catches the original bug where the children could all
// accept updates but App still passed the catalogue only to CataloguePanel.
test('App shares the same catalogue update with search, selection and properties', async () => {
  const source = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
  const { descriptor } = parse(source);
  const tags = ['DeviceSearch', 'SelectionPreview', 'FigureDetails'];
  const template = tags.map(tag => {
    const match = descriptor.template.content.match(new RegExp(`<${tag}\\s[^]*?\\/>`));
    assert.ok(match, `${tag} is present in App`);
    return match[0];
  }).join('\n');
  const compiled = compileTemplate({ source: `<section>${template}</section>`, id: 'active-catalogue-parent', compilerOptions: { hoistStatic: false } });
  assert.deepEqual(compiled.errors, []);
  const render = new Function('Vue', compiled.code
    .replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g, (_, names) => `const {${names.replace(/\s+as\s+/g, ':')}}=Vue;`)
    .replace('export function render', 'function render') + '\nreturn render;')(Vue);
  const received = {};
  const components = Object.fromEntries(tags.map(name => [name, {
    name, props: ['catalogue'], render() { received[name] = this.catalogue; return Vue.h('div'); },
  }]));
  const baseline = { entries: [], commit: 'a'.repeat(40) };
  const state = {
    collectionCatalogue: baseline, collectionObservation: { previous: true }, connected: true,
    busy: false, searchBusy: false, upload_diag_visible: false, syncDialog: false, zipDialog: false,
    meta_diag_visible: true, sessionGeneration: 1, current_dir: 'E:/', language: 'de_DE',
    previewSelection: null, preview_selection_current: () => false,
    meta_form: { row: { type: 'REG' }, path: 'E:/synthetic.bin', amiibo: { head: 0xf1234567, tail: 2 } },
    figureInspection: null, device_search_session() { throw Error('No device access expected'); },
    navigate_search_result() {}, download_preview_selection() {}, open_preview_properties() {},
  };
  const renderBindings = () => renderToString(Vue.createSSRApp({ components, setup: () => state, render }));
  await renderBindings();
  for (const name of tags) assert.equal(received[name], baseline, `${name} receives baseline`);

  const handler = source.match(/on_collection_catalogue\(result\) \{([^]*?)\n    \},/);
  assert.ok(handler, 'actual App catalogue handler is present');
  const update = new Function('catalogueBaseline', `return function(result){${handler[1]}}`)(baseline);
  const fresh = { entries: [{ id: 'f123456700000002', name: 'Future Fixture' }], observedAt: '2026-11-03T12:00:00Z',
    source: { commit: 'b'.repeat(40), url: 'https://github.com/8bitDream/AmiiboAPI' } };
  update.call(state, fresh);
  assert.equal(state.collectionObservation, null);
  await renderBindings();
  for (const name of tags) {
    assert.equal(received[name], state.collectionCatalogue, `${name} receives the active snapshot`);
    assert.equal(received[name].entries, fresh.entries);
    assert.equal(received[name].commit, fresh.source.commit);
  }
});
