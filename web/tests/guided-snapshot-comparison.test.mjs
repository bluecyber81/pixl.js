import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnosticSnapshot} from './fixtures/diagnostic-overview-data.mjs';
import {mountSfc,nodes,text} from './helpers/vue-component-host.mjs';
import {parseStartupDiagnostics} from '../src/lib/startup-diagnostics.js';
import {captureDeviceEvidence} from '../src/lib/guided-device-check.js';

const panel = new URL('../src/components/GuidedSnapshotComparison.vue',import.meta.url);
const capture = JSON.parse(readFileSync(new URL('./fixtures/PXST_v4_App657.json',import.meta.url)));

test('compares observed cache occupancy, scan time and free heap in both languages, with receipt times',async t => {
  const first = diagnosticSnapshot(), last = diagnosticSnapshot();
  const wire = capture.cases.find(row => row.label === 'mounted-with-room').payloadHex;
  last.sections.startup.data = parseStartupDiagnostics(Buffer.from(wire,'hex'));
  last.sections.runtime.data.heapFreeBytes = 10600;
  last.sections.runtime.observedAt = '2026-11-03T18:04:02.000Z';
  const before = captureDeviceEvidence(first,'2.22.0-DE3.81'), after = captureDeviceEvidence(last,'2.22.0-DE3.84');
  const h = await mountSfc(panel,{before,after,locale:'en'});
  t.after(()=>h.app.unmount());
  const cells = label => nodes(nodes(h.root,'tr').find(tr => nodes(tr,'th').some(th => text(th)===label)),'td').map(text);
  assert.deepEqual(cells('Cache pages filled / allocated'), ['—','3 / 8']);
  assert.deepEqual(cells('PackedFS scan time'), ['—','79 ms']);
  assert.deepEqual(cells('Bytes per cache page'), ['—','256 B']);
  assert.deepEqual(cells('Free heap'), ['10668 B','10600 B']);
  assert.deepEqual(cells('Firmware'), ['2.22.0-DE3.81','2.22.0-DE3.84']);
  assert.notEqual(cells('Startup diagnostics received')[1],cells('Heap diagnostics received')[1]);
  assert.match(text(h.root), /same startup/);
  h.state.locale='de_DE'; await h.tick();
  assert.deepEqual(cells('Cache-Seiten belegt / zugeteilt'), ['—','3 / 8']);
  assert.match(text(h.root), /denselben Start/);
});
