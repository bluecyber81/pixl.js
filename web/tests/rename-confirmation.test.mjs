import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@vue/compiler-sfc';
import { dfuReference } from '../src/lib/release-packages.js';
import { classifyRenameListing } from '../src/lib/rename-confirmation.js';
import { assertWritableDevicePath, assertPortableEntryName, portableNameKey, joinDevicePath } from '../src/lib/portable-names.js';
import de from '../src/i18n/de_DE.js';
import en from '../src/i18n/en_US.js';

const app = parse(readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')).descriptor;
const row = (name, type = 0) => ({ name, type, size: 1, meta: {} });
function fixture({ type = 0, device = 'device-a', reply = 'ok', initial, after, failedRead } = {}) {
  let key = device, files = initial || [row('old', type)], reads = 0, writes = 0;
  const errors = [], path = 'E:/figures';
  const pixl = { get_device_key: () => key };
  const proto = {
    get_version: async () => ({ status: 0, data: { ver:'2.22.0-DE3.74' } }),
    vfs_read_folder: async dir => { assert.equal(dir, path); reads++; return reads === failedRead ? {status: 9} : {status: 0, data: files}; },
    vfs_rename: async (a, b) => {
      assert.equal(a, path + '/old'); assert.equal(b, path + '/new'); writes++;
      if (reply === 'refused') return {status: 7};
      files = after || [row('new', type)];
      if (reply === 'disconnect' || reply === 'timeout') {
        if (reply === 'disconnect') { vm.connected = false; vm.sessionGeneration++; vm.current_dir = ''; vm.mutating = false; }
        throw Object.assign(new Error('Bluetooth response timed out'), {code:'TIMEOUT'});
      }
      return {status: 0};
    },
  };
  const bindings = {defineAsyncComponent: () => ({}), DeviceStorageCard:{}, catalogueBaseline:{},
    proto, pixl, dfuReference, classifyRenameListing, assertWritableDevicePath, assertPortableEntryName, portableNameKey, joinDevicePath};
  const { methods } = new Function(...Object.keys(bindings), app.script.content.replace(/^import .*$/gm, '').replace('export default', 'return'))(...Object.values(bindings));
  const vm = { ...methods, current_dir:path, connected:true, sessionGeneration:1, listingGeneration:0, page:1,
    pageCount:1, previewSerial:0, mutating:false, renameNotice:null,
    get busy() { return !!(this.mutating || this.table_loading); },
    $t: key => key, $notify() {}, show_transfer_error: err => errors.push(err.message),
    format_size: String, ask_dialog: async () => ({value:'new'}), load_device_nickname() {}, reset_figure_info() {},
    clear_dfu_attempt() {}, clear_migration_restart() {}, async reload_drive() { this.current_dir=''; },
  };
  return { vm, errors, counts:()=>[writes, reads], rename:()=>vm.on_row_btn_rename(0,{name:'old', type:type === 1 ? 'DIR':'REG'}),
    reconnect:async id => { key=id; await vm.on_ble_connected(); }, dir:path };
}

for (const type of [0,1]) test('file/directory rename shares the post-write listing with the visible rows: '+type, async () => {
  const f=fixture({type}); await f.rename();
  assert.equal(f.vm.renameNotice.state,'confirmed'); assert.equal(f.vm.tableData[0].name,'new');
  assert.deepEqual(f.counts(),[1,2]); assert.deepEqual(f.errors,[]); assert.equal(f.vm.busy,false);
});
test('uncertain response with an active session reads once and reports the original name', async () => {
  const f=fixture({reply:'timeout',after:[row('old')]}); await f.rename();
  assert.equal(f.vm.renameNotice.state,'original'); assert.deepEqual(f.counts(),[1,2]);
});
test('a failed readback can be completed using the regular folder refresh without repeating the rename',async () => {
  const f=fixture({failedRead:2}); await f.rename();
  assert.equal(f.vm.renameNotice.state,'pending'); assert.equal(f.vm.busy,false); assert.deepEqual(f.errors,['transfer.deviceerror: 9']);
  await f.vm.refresh_current(); assert.equal(f.vm.renameNotice.state,'confirmed'); assert.deepEqual(f.counts(),[1,3]);
});
test('ambiguous folder listing never confirms a rename or writes again',async () => {
  const f=fixture({type:1,reply:'timeout',after:[row('old',1),row('new',1)]}); await f.rename();
  assert.equal(f.vm.renameNotice.state,'unclear'); assert.deepEqual(f.counts(),[1,2]);
});
test('lost acknowledgement waits for the same device and never writes on reconnect',async () => {
  const f=fixture({type:1,reply:'disconnect'}); await f.rename();
  assert.equal(f.vm.renameNotice.state,'pending'); assert.deepEqual(f.counts(),[1,1]);
  await f.reconnect('device-b'); assert.deepEqual(f.counts(),[1,1]); assert.equal(f.vm.renameNotice,null);
  await f.reconnect('device-a'); assert.deepEqual(f.counts(),[1,2]); assert.equal(f.vm.current_dir,f.dir);
  assert.equal(f.vm.renameNotice.state,'confirmed');
  await f.reconnect('device-a'); assert.deepEqual(f.counts(),[1,2]); assert.equal(f.vm._renameReadback,null);
});
test('a device with no browser identity does not trigger automatic readback on reconnection',async () => {
  const f=fixture({reply:'disconnect',device:null}); await f.rename(); await f.reconnect(null);
  assert.deepEqual(f.counts(),[1,1]); assert.equal(f.vm.renameNotice,null);
});
test('existing target, stale source and explicit device error keep appropriate error handling',async () => {
  const collision=fixture({initial:[row('old'),row('NEW')]}); await collision.rename();
  assert.deepEqual(collision.counts(),[0,1]); assert.deepEqual(collision.errors,['info.portableCollision']);
  const stale=fixture({initial:[row('old',1)]}); await stale.rename();
  assert.deepEqual(stale.counts(),[0,1]); assert.equal(stale.vm.renameNotice.state,'unclear');
  const refused=fixture({reply:'refused'}); await refused.rename();
  assert.deepEqual(refused.counts(),[1,1]); assert.deepEqual(refused.errors,['transfer.deviceerror: 7']); assert.equal(refused.vm._renameReadback,undefined);
});
test('case-only changes, aliases, wrong types and missing entries require exact evidence',() => {
  const local={from:'tag',to:'TAG',type:1};
  assert.equal(classifyRenameListing([row('TAG',1)],local),'confirmed');
  assert.equal(classifyRenameListing([row('tag',1)],local),'original');
  for (const rows of [[],[row('Tag',1)],[row('TAG')],[row('TAG',1),row('TAG',1)]]) assert.equal(classifyRenameListing(rows,local),'unclear');
});
test('both locales provide the accessible notice for all outcomes',() => {
  assert.match(app.template.content, /role="status"[^>]*>\s*\{\{ \$t\('rename\.'/);
  for(const state of ['pending','checking','confirmed','unclear','original']) {
    for(const locale of [en,de]) assert.ok(locale.rename[state].includes('{dir}'));
    assert.notEqual(de.rename[state],en.rename[state]);
  }
});
