import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Vue from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';
import { syntheticConfig, syntheticSlot } from './fixtures/chameleon-slot-synthetic.mjs';

// Run the actual SFC through Vue's renderer; browser downloads are observed
// as local Blob/anchor operations. No private backup or device is involved.
async function component() {
  const filename = fileURLToPath(new URL('../src/components/CardSlotInspection.vue', import.meta.url));
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename });
  let source = compileScript(descriptor, { id: filename, inlineTemplate: true }).content;
  const imports = [];
  source = source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, binding, spec) => { imports.push({ binding, spec }); return ''; });
  const modules = [];
  for (const { spec } of imports) modules.push(spec === 'vue' ? Vue : await import(pathToFileURL(path.resolve(path.dirname(filename), spec))));
  const bindings = imports.map(({ binding }, index) => `const ${binding.replace(/\s+as\s+/g, ':')}=modules[${index}];`).join('\n');
  return new Function('modules', `${bindings}\n${source.replace('export default', 'return')}`)(modules);
}
const hostNode = (type, text = '') => ({ type, text, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer({
  createElement: tag => hostNode(tag), createText: text => hostNode('#text', text), createComment: text => hostNode('#comment', text),
  setText: (node, text) => node.text = text, setElementText: (node, text) => { node.text = text; node.children = []; },
  patchProp: (node, key, previous, next) => node.props[key] = next,
  insert(node, parent, anchor = null) { if (node.parent) { const old = node.parent.children.indexOf(node); if (old >= 0) node.parent.children.splice(old, 1); } node.parent = parent; const index = anchor ? parent.children.indexOf(anchor) : -1; index < 0 ? parent.children.push(node) : parent.children.splice(index, 0, node); },
  remove(node) { const index = node.parent?.children.indexOf(node); if (index >= 0) node.parent.children.splice(index, 1); node.parent = null; },
  parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
});
const nodes = (node, type) => [node, ...node.children.flatMap(child => nodes(child))].filter(item => !type || item.type === type);
const text = node => node.text + node.children.map(text).join('');
const button = (root, label) => { const value = nodes(root, 'button').find(node => text(node) === label); assert.ok(value, label); return value; };
async function mount(props = {}) {
  const state = Vue.reactive({ locale: 'de_DE', blocked: false, ...props }), root = hostNode('root'), Component = await component();
  const app = renderer.createApp({ render: () => Vue.h(Component, state) });
  app.mount(root); await Vue.nextTick(); return { root, state, app };
}
const event = file => ({ target: { files: file ? [file] : [], value: 'private-file-path' } });
const file = (bytes, name = '00.bin') => ({ name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer });
async function choose(input, selected) { const e = event(selected); await input.props.onChange(e); assert.equal(e.target.value, ''); await Vue.nextTick(); }
async function setupSlot(h, bytes = syntheticSlot(), type = 1103) {
  await choose(nodes(h.root, 'input')[0], file(syntheticConfig(type), 'config.bin'));
  nodes(h.root, 'select')[0].props.onChange({ target: { value: '0' } }); await Vue.nextTick();
  if (bytes) await choose(nodes(h.root, 'input')[1], file(bytes));
}
function downloadHost() {
  const prior = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL }, blobs = [], clicks = [], revoked = [];
  URL.createObjectURL = blob => { blobs.push(blob); return `blob:local-${blobs.length}`; };
  URL.revokeObjectURL = url => revoked.push(url);
  globalThis.document = { createElement(tag) { assert.equal(tag, 'a'); const link = { click() { clicks.push({ href: link.href, download: link.download }); } }; return link; } };
  return { blobs, clicks, revoked, restore() { globalThis.document = prior.document; URL.createObjectURL = prior.create; URL.revokeObjectURL = prior.revoke; } };
}
test('local component requires configuration, explicit slot and deliberate download; only corrected copy is emitted', async () => {
  const downloads = downloadHost(), h = await mount(), source = syntheticSlot(), before = source.slice();
  try {
    assert.equal(nodes(h.root, 'input').length, 1); assert.equal(downloads.blobs.length, 0);
    await choose(nodes(h.root, 'input')[0], file(syntheticConfig(), 'private-owner-config.bin'));
    assert.equal(nodes(h.root, 'input').length, 1); assert.equal(nodes(h.root, 'select')[0].props.value, '');
    assert.doesNotMatch(text(h.root), /private-owner/);
    nodes(h.root, 'select')[0].props.onChange({ target: { value: '0' } }); await Vue.nextTick();
    assert.match(text(h.root), /Slotdatei 00\.bin/);
    await choose(nodes(h.root, 'input')[1], file(source));
    assert.match(text(h.root), /bekannte alte UID-Kopiermuster/); assert.match(text(h.root), /BCC0: ja · BCC1: ja/);
    assert.doesNotMatch(text(h.root), /04.?12.?34.?56.?78.?9a.?bc/i); assert.equal(downloads.blobs.length, 0);
    button(h.root, 'Korrigierte Kopie herunterladen').props.onClick(); await Vue.nextTick();
    assert.deepEqual(downloads.clicks, [{ href: 'blob:local-1', download: '00.uid-corrected.bin' }]);
    const corrected = new Uint8Array(await downloads.blobs[0].arrayBuffer());
    assert.deepEqual([...corrected.keys()].filter(i => corrected[i] !== source[i]), [7, 8, 9, 10]);
    assert.deepEqual(source, before); assert.match(text(h.root), /Download der geprüften Kopie ausgelöst/);
    button(h.root, 'Lokale Prüfung entfernen').props.onClick(); await Vue.nextTick();
    assert.deepEqual(downloads.revoked, ['blob:local-1']); assert.equal(nodes(h.root, 'select').length, 0);
    assert.doesNotMatch(text(h.root), /bekannte alte UID-Kopiermuster/);
  } finally { h.app.unmount(); downloads.restore(); }
});
test('filename association and exact sizes reject before reading, without exposing arbitrary filenames', async () => {
  const h = await mount(); let reads = 0;
  try {
    await choose(nodes(h.root, 'input')[0], { name: 'config.bin', size: 100000, arrayBuffer() { reads++; } });
    assert.equal(reads, 0); assert.match(text(h.root), /Konfiguration nicht unterstützt/);
    await setupSlot(h, null);
    for (const name of ['01.bin', '000.bin', 'private-owner.bin', '00.uid-corrected.bin', undefined]) {
      await choose(nodes(h.root, 'input')[1], { name, size: 337, arrayBuffer() { reads++; } });
      assert.equal(reads, 0); assert.match(text(h.root), /Dateiname muss für diesen Slot 00\.bin/); assert.doesNotMatch(text(h.root), /private-owner/);
    }
    await choose(nodes(h.root, 'input')[1], { name: '00.bin', size: 100000, arrayBuffer() { reads++; } });
    assert.equal(reads, 0); assert.match(text(h.root), /Dateigröße passt nicht/);
    await choose(nodes(h.root, 'input')[1], file(syntheticSlot(), '00.BIN'));
    assert.match(text(h.root), /bekannte alte UID-Kopiermuster/);
  } finally { h.app.unmount(); }
});
test('unknown types, V3 config, invalid BCC and other mismatches do not offer repair', async () => {
  const h = await mount();
  try {
    const v3 = syntheticConfig(); v3[0] = 3;
    await choose(nodes(h.root, 'input')[0], file(v3, 'config.bin')); assert.equal(nodes(h.root, 'select').length, 0);
    await setupSlot(h, null, 1000); assert.equal(nodes(h.root, 'input').length, 1); assert.match(text(h.root), /Kartentyp wird hier nicht/);
    for (const bytes of [syntheticSlot(1103, false), (() => { const b = syntheticSlot(); b[281] ^= 1; return b; })(), (() => { const b = syntheticSlot(); b[4] ^= 1; return b; })()]) {
      await setupSlot(h, bytes); assert.equal(nodes(h.root, 'button').some(n => text(n) === 'Korrigierte Kopie herunterladen'), false);
    }
  } finally { h.app.unmount(); }
});
test('blocked state is enforced by handlers and English labels update reactively', async () => {
  const downloads = downloadHost(), h = await mount(); let reads = 0;
  try {
    h.state.blocked = true; await Vue.nextTick(); assert.equal(nodes(h.root, 'input')[0].props.disabled, true);
    await choose(nodes(h.root, 'input')[0], { size: 12, arrayBuffer() { reads++; } }); assert.equal(reads, 0);
    h.state.blocked = false; await Vue.nextTick(); await setupSlot(h);
    const save = button(h.root, 'Korrigierte Kopie herunterladen');
    h.state.blocked = true; h.state.locale = 'en'; await Vue.nextTick();
    assert.equal(button(h.root, 'Download corrected copy').props.disabled, true); save.props.onClick(); assert.equal(downloads.blobs.length, 0);
    assert.match(text(h.root), /known legacy UID copy pattern/); assert.match(text(h.root), /Nothing is written to the device/);
    h.state.blocked = false; await Vue.nextTick(); button(h.root, 'Download corrected copy').props.onClick();
    assert.equal(downloads.blobs.length, 1); h.app.unmount(); assert.deepEqual(downloads.revoked, ['blob:local-1']);
  } finally { if (h.root.children.length) h.app.unmount(); downloads.restore(); }
});
test('clear or new configuration invalidates pending reads; partial reads and failures remain bounded', async () => {
  const h = await mount(); let finish;
  try {
    await setupSlot(h, null);
    const input = nodes(h.root, 'input')[1], pending = input.props.onChange(event({ name: '00.bin', size: 337, arrayBuffer: () => new Promise(resolve => finish = resolve) }));
    await Vue.nextTick(); button(h.root, 'Lokale Prüfung entfernen').props.onClick(); await Vue.nextTick();
    finish(syntheticSlot().buffer); await pending; await Vue.nextTick(); assert.doesNotMatch(text(h.root), /bekannte alte UID-Kopiermuster/);
    await setupSlot(h, null);
    await choose(nodes(h.root, 'input')[1], { name: '00.bin', size: 337, arrayBuffer: async () => new ArrayBuffer(336) });
    assert.match(text(h.root), /nicht vollständig gelesen/);
    await choose(nodes(h.root, 'input')[1], { name: '00.bin', size: 337, arrayBuffer: async () => { throw Error('private-secret-read-error'); } });
    assert.doesNotMatch(text(h.root), /private-secret/); assert.match(text(h.root), /nicht vollständig gelesen/);
    const oldConfig = nodes(h.root, 'input')[0].props.onChange(event({ size: 12, arrayBuffer: () => new Promise(resolve => finish = resolve) }));
    await choose(nodes(h.root, 'input')[0], file(syntheticConfig(1104), 'config.bin'));
    finish(syntheticConfig().buffer); await oldConfig; await Vue.nextTick();
    assert.match(text(nodes(h.root, 'select')[0]), /MF0ICU2/); assert.doesNotMatch(text(nodes(h.root, 'select')[0]), /MF0ICU1/);
  } finally { h.app.unmount(); }
});
test('component and library have no transport, external requests, storage or UID logging', () => {
  for (const name of ['../src/components/CardSlotInspection.vue', '../src/lib/chameleon-inspection.js']) {
    const source = fs.readFileSync(new URL(name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|console|localStorage|sessionStorage|indexedDB)\b/);
    assert.doesNotMatch(source, /pixl\.(?:ble|proto)|getSession|https?:\/\/|navigator\./);
  }
});
