import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mountSfc, nodes, text } from './helpers/vue-component-host.mjs';
import { parseBootDiagnostics } from '../src/lib/boot-diagnostics.js';
import { deploymentPath } from '../src/lib/deployment-path.js';

const require = createRequire(import.meta.url);
const bootPacket = require('./boot-fixture.cjs');
const url = new URL('../src/components/CurrentLcdDownloads.vue', import.meta.url);
const legacy = JSON.parse(readFileSync(new URL('../src/data/firmware-releases.json', import.meta.url)))
  .packages.find(entry => entry.id === 'de3.89-lcd-app');
// UI-only identity fixture. Real package bytes, hashes and signatures have their
// own release gates; this descriptor does not stand in for a signed package.
const normal = { id:'de3.98-lcd-app', version:'2.22.0-DE3.98', counter:671,
  file:'Allmiibo_LCD_DE3_98_671_NUR_APP.zip', bootloader:'Z21' };
const normalUrl = deploymentPath('firmware/' + normal.file);
const comboUrl = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89/' +
  'Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip';
function boot(applicationCounter = 670, prior = false) {
  const bytes = bootPacket(), view = new DataView(bytes.buffer);
  view.setUint32(32, prior ? 7002000 : 7003000, true);
  view.setUint16(36, prior ? 0x0103 : 294, true);
  view.setUint32(60, applicationCounter, true); view.setUint32(64, prior ? 15 : 21, true);
  bytes.set(Buffer.from(prior ? 'c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade'
    : 'd3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb', 'hex'), 80);
  return parseBootDiagnostics(bytes);
}
const links = h => nodes(h.root, 'a').map(node => node.props.href);
const mount = (props = {}, packages = [normal, legacy]) => mountSfc(url,
  { connected:false, version:'', boot:null, locale:'de_DE', ...props },
  { '../data/firmware-releases.json':{default:{packages}} });

test('normal App671 download uses the local package while the Z21 full package keeps its actual App662 identity', async () => {
  const h = await mount();
  try {
    assert(links(h).includes(normalUrl)); assert(links(h).includes(comboUrl));
    assert.match(text(h.root), /Aktuell · DE3\.98 \/ App671 herunterladen/);
    assert.match(text(h.root), /ältere App662/); assert.match(text(h.root), /Danach DE3\.98 \/ App671/);
    assert.doesNotMatch(text(h.root), /TEST1|Test 1|Testversion/);
    assert(!links(h).some(href => href.includes('/releases/download/de3.98/')));
    h.state.locale = 'en'; await h.tick();
    assert.match(text(h.root), /Current · Download DE3\.98 \/ App671/);
    assert.match(text(h.root), /older App662/);
  } finally { h.app.unmount(); }
});

test('normal and legacy downloads keep separate real boot, board and downgrade guards', async () => {
  const h = await mount({connected:true, version:'2.22.0-DE3.97', boot:boot()});
  try {
    assert(links(h).includes(normalUrl)); assert(!links(h).includes(comboUrl));
    h.state.version = '2.22.0-DE3.60'; h.state.boot = boot(632, true); await h.tick();
    assert(!links(h).includes(normalUrl)); assert(links(h).includes(comboUrl));
    h.state.boot = boot(670, true); await h.tick();
    assert(!links(h).includes(normalUrl)); assert(!links(h).includes(comboUrl), 'App671 must not authorize an App662 downgrade');
    for (const [version, info] of [
      ['2.22.0-DE3.97', null], ['2.22.0-DE3.99', boot(672)], ['2.22.0-DE3.87-OLEDt6', boot()]
    ]) {
      h.state.version = version; h.state.boot = info; await h.tick();
      assert(!links(h).includes(normalUrl)); assert(!links(h).includes(comboUrl));
    }
  } finally { h.app.unmount(); }
});

test('a catalog without the normal package never invents an App671 download', async () => {
  const h = await mount({}, [legacy]);
  try {
    assert(!links(h).includes(normalUrl)); assert.doesNotMatch(text(h.root), /App671|DE3\.98/);
    assert(links(h).includes(comboUrl));
  } finally { h.app.unmount(); }
});
