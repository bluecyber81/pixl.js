const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const compiler = require('@vue/compiler-sfc');

// Execute production Options API methods. Browser/transport boundaries are fakes;
// Vue's compiler separately validates the complete production template.
const appSource = fs.readFileSync(process.env.PIXL_APP_SOURCE || path.join(__dirname, '../src/App.vue'), 'utf8');
const descriptor = compiler.parse(appSource).descriptor;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(overrides = {}) {
  const messages = [], notifications = [], stored = new Map(), listeners = new Map();
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const dispatcher = {
    addListener(name, fn) { listeners.set(name, fn); },
    removeListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
  };
  const proto = { init() {}, ...overrides };
  let disconnected = 0;
  const pixl = { connect() {}, disconnect() { ++disconnected; listeners.get('ble_disconnected')?.(); } };
  const document = { documentElement: { lang: '' } };
  const window = { localStorage: storage, location: { href: 'local-dateimanager' } };
  const context = vm.createContext({ module: { exports: {} }, proto, pixl, document, window,
    sharedEventDispatcher: () => dispatcher, getElementLocale: language => ({ name: language }), console });
  const localeSource = fs.readFileSync(path.join(__dirname, '../src/lib/locale.js'), 'utf8');
  vm.runInContext(localeSource.replace(/export /g, ''), context);
  vm.runInContext(descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'module.exports ='), context);
  const options = context.module.exports;
  const instance = {
    $t: key => key, $i18n: { locale: 'de_DE', availableLocales: ['de_DE', 'en'] },
    $message: msg => messages.push(msg), $notify: msg => notifications.push(msg),
    $confirm: async () => {}, $prompt: async () => ({ value: 'New' }), $alert: async () => {},
    $nextTick: async () => {}, $refs: { upload: { clearFiles() {} } }
  };
  Object.assign(instance, options.data.call(instance));
  for (const [key, value] of Object.entries(options.methods)) instance[key] = value.bind(instance);
  for (const [key, value] of Object.entries(options.computed)) Object.defineProperty(instance, key, { get: value.bind(instance) });
  return { instance, options, messages, notifications, stored, listeners, document, window, proto, pixl,
    disconnects: () => disconnected, mount: () => options.mounted.call(instance), unmount: () => options.beforeUnmount.call(instance) };
}
const connected = h => { h.instance.connected = true; h.instance.current_dir = 'E:/'; return h.instance; };
const file = name => ({ name, size: 540, type: 0, meta: { notes: '', flags: {}, amiibo: {} } });

test('production template compiles with Vue 3 and modern Element Plus bindings', () => {
  assert.deepEqual(compiler.parse(appSource).errors, []);
  assert.deepEqual(compiler.compileTemplate({ source: descriptor.template.content, filename: 'App.vue', id: 'ui' }).errors, []);
  assert.doesNotMatch(descriptor.template.content, /slot-scope|\.native|\.sync/);
  assert.match(descriptor.template.content, /Allmiibo Dateimanager · DE3\.12/);
});

test('name sorting is natural and file sizes compare bytes rather than formatted strings', () => {
  const { instance } = harness();
  assert.ok(instance.sort_table_row_name({ name: 'File2' }, { name: 'File10' }) < 0);
  assert.ok(instance.sort_table_row_size({ size: '950 B', sizeBytes: 950 }, { size: '1.00 KB', sizeBytes: 1024 }) < 0);
});

test('metadata editing snapshots nested attributes and a failed save preserves the original row', async () => {
  const h = harness({ vfs_update_meta: async () => ({ status: 255 }) }), app = connected(h);
  const row = { name: 'A.bin', notes: 'old', flags: { hide: false, readonly: true }, amiibo: { head: 1, tail: 2 } };
  app.on_row_btn_meta(0, row);
  app.meta_form.flags.hide = true; app.meta_form.notes = 'edited';
  assert.equal(row.flags.hide, false);
  await app.on_diag_meta_close();
  assert.equal(row.notes, 'old'); assert.equal(row.flags.hide, false);
  assert.equal(app.meta_diag_visible, true); assert.equal(app.mutating, false);
  assert.match(h.messages[0].message, /255/);
});

test('successful metadata save updates attributes only after the device acknowledgement', async () => {
  const response = deferred(), h = harness({ vfs_update_meta: () => response.promise }), app = connected(h);
  const row = { name: 'A.bin', notes: 'old', flags: {}, amiibo: {} };
  app.on_row_btn_meta(0, row); app.meta_form.notes = 'new';
  const save = app.on_diag_meta_close();
  assert.equal(row.notes, 'old'); assert.equal(app.mutating, true);
  response.resolve({ status: 0 }); await save;
  assert.equal(row.notes, 'new'); assert.equal(app.meta_diag_visible, false);
});

test('format status failure never emits success and cancellation never formats', async () => {
  let calls = 0;
  const h = harness({ vfs_drive_format: async () => { ++calls; return { status: 2 }; } }), app = connected(h);
  await app.on_row_btn_format(0, { name: 'E:/ [External]' });
  assert.equal(calls, 1); assert.ok(h.messages.every(message => message.type !== 'success'));
  app.$confirm = async () => { throw 'cancel'; };
  await app.on_row_btn_format(0, { name: 'E:/ [External]' });
  assert.equal(calls, 1); assert.equal(h.messages.length, 1);
});

test('batch deletion preserves failed rows and removes only successful acknowledgements', async () => {
  const calls = [], h = harness({ vfs_remove: async path => { calls.push(path); return { status: path.endsWith('bad') ? 255 : 0 }; } });
  const app = connected(h); app.tableData = [{ name: 'bad', type: 'REG' }, { name: 'good', type: 'REG' }];
  app.table_selection = app.tableData.slice();
  await app.on_btn_remove();
  assert.deepEqual(calls, ['E:/bad', 'E:/good']);
  assert.deepEqual(app.tableData.map(row => row.name), ['bad']);
  assert.equal(app.mutating, false); assert.match(h.messages[0].message, /bad.*255/);
});

test('Element Plus owns upload completion; duplicate callbacks cannot double-settle counters', async () => {
  let success, fail, progress;
  const h = harness({ vfs_helper_write_file(path, file, onProgress, onSuccess, onError) { progress = onProgress; success = onSuccess; fail = onError; } });
  const app = connected(h), percentages = [];
  let frameworkSuccess = 0, frameworkError = 0;
  const pending = app.on_upload_request({ file: { name: 'A.bin' }, onProgress: value => percentages.push(value.percent),
    onSuccess: () => ++frameworkSuccess, onError: () => ++frameworkError });
  assert.equal(app.pendingUploads, 1);
  progress({ total_bytes: 0, written_bytes: 0 }); success(); success(); fail(new Error('late'));
  await pending;
  assert.equal(app.pendingUploads, 0); assert.deepEqual(percentages, [100]);
  assert.equal(frameworkSuccess, 0); assert.equal(frameworkError, 0);
});

test('upload failure rejects once and releases the pending counter', async () => {
  const h = harness({ vfs_helper_write_file(path, file, progress, success, error) { error(new Error('write failed')); error(new Error('again')); } });
  const app = connected(h);
  await assert.rejects(app.on_upload_request({ file: { name: 'A.bin' }, onProgress() {} }), /write failed/);
  assert.equal(app.pendingUploads, 0);
});

test('closing active uploads requires confirmation and cancellation disconnects the transaction queue', async () => {
  const h = harness(), app = connected(h); h.mount(); app.pendingUploads = 1;
  let closed = 0;
  app.$confirm = async () => { throw 'cancel'; };
  await app.on_upload_diag_close(() => ++closed);
  assert.equal(closed, 0); assert.equal(h.disconnects(), 0);
  app.$confirm = async () => {};
  await app.on_upload_diag_close(() => ++closed);
  assert.equal(closed, 1); assert.equal(h.disconnects(), 1); assert.equal(app.connected, false);
});

test('overlapping directory responses cannot replace the newest listing', async () => {
  const first = deferred(), second = deferred(); let requests = 0;
  const h = harness({ vfs_read_folder: () => ++requests === 1 ? first.promise : second.promise }), app = connected(h);
  const old = app.reload_folder(); app.current_dir = 'E:/next'; const latest = app.reload_folder();
  second.resolve({ status: 0, data: [file('new')] }); await latest;
  first.resolve({ status: 0, data: [file('old')] }); await old;
  assert.equal(app.tableData[0].name, 'new'); assert.equal(app.table_loading, false);
});

test('disconnect invalidates a pending list response without repopulating the UI', async () => {
  const response = deferred(), h = harness({ vfs_read_folder: () => response.promise }), app = connected(h);
  const pending = app.reload_folder(); app.on_ble_disconnected();
  response.resolve({ status: 0, data: [file('stale')] }); await pending;
  assert.equal(app.tableData.length, 0); assert.equal(app.current_dir, ''); assert.equal(app.table_loading, false);
});

test('DE3.12 invalid UTF-8 listing leaves no actionable rows and clears busy state before a healthy retry', async () => {
  let fail = true;
  const h = harness({ vfs_read_folder: async () => {
    if (fail) throw new Error('Invalid UTF-8 in device response; file names cannot be used safely');
    return { status: 0, data: [file('healthy.bin')] };
  } }), app = connected(h);
  app.tableData = [{ name: 'old.bin', type: 'REG' }]; app.table_selection = app.tableData.slice();
  await app.reload_folder();
  assert.equal(app.tableData.length, 0); assert.equal(app.table_selection.length, 0);
  assert.equal(app.table_loading, false); assert.equal(app.busy, false);
  assert.match(h.messages[0].message, /Invalid UTF-8/);
  fail = false; await app.reload_folder();
  assert.equal(app.tableData[0].name, 'healthy.bin'); assert.equal(app.table_loading, false);
});

test('unmount removes event listeners and invalidates a pending rejection before disconnect', async () => {
  const response = deferred(), h = harness({ vfs_read_folder: () => response.promise }), app = connected(h);
  h.mount(); assert.equal(h.listeners.size, 3);
  const pending = app.reload_folder(); h.unmount(); response.reject(new Error('late disconnect'));
  await pending;
  assert.equal(h.listeners.size, 0); assert.equal(h.disconnects(), 1);
  assert.equal(app.connected, false); assert.equal(h.messages.length, 0); assert.equal(h.notifications.length, 0);
});

test('German startup and English selection persist without another device request', () => {
  const h = harness(); h.mount();
  assert.equal(h.instance.language, 'de_DE'); assert.equal(h.document.documentElement.lang, 'de-DE');
  h.instance.handle_set_language('en');
  assert.equal(h.instance.$i18n.locale, 'en'); assert.equal(h.stored.get('allmiibo.language'), 'en');
  assert.equal(h.document.documentElement.lang, 'en');
  h.instance.language = 'de_DE'; h.mount(); assert.equal(h.instance.language, 'en');
  h.instance.handle_set_language('__proto__'); assert.equal(h.instance.language, 'en');
});

test('download callbacks cannot display errors or save bytes from a previous connection', () => {
  let success, error, done;
  const h = harness({ vfs_helper_read_file(path, yes, no, complete) { success = yes; error = no; done = complete; } });
  const app = connected(h);
  app.handle_name_click(0, { name: 'A.bin', type: 'REG' });
  assert.equal(app.pendingDownloads, 1);
  app.on_ble_disconnected(); app.connected = true;
  // The fake document deliberately cannot create links. A stale success must
  // return before touching it, even when a replacement connection is active.
  success(new Uint8Array([1])); error(new Error('old transfer')); done();
  assert.equal(app.pendingDownloads, 0); assert.equal(h.messages.length, 0);
});

test('DFU webpage is an unconditional external link with no Bluetooth action', () => {
  const ast = compiler.compileTemplate({ source: descriptor.template.content, filename: 'App.vue', id: 'dfu' }).ast;
  let found;
  function visit(node, parents = []) {
    if (node.tag === 'a' && node.props?.some(prop => prop.name === 'class' && prop.value?.content === 'dfu-page-link')) found = { node, parents };
    for (const child of node.children || []) visit(child, [...parents, node]);
    for (const branch of node.branches || []) visit(branch, [...parents, node]);
  }
  visit(ast);
  assert.ok(found, 'independent DFU anchor exists');
  const attributes = Object.fromEntries(found.node.props.filter(prop => prop.type === 6).map(prop => [prop.name, prop.value?.content]));
  assert.equal(attributes.href, 'https://thegecko.github.io/web-bluetooth-dfu/examples/web.html');
  assert.equal(attributes.target, '_blank'); assert.equal(attributes.rel, 'noopener noreferrer');
  assert.equal(found.node.props.some(prop => prop.type === 7 || prop.name === 'disabled'), false);
  assert.equal(found.parents.some(parent => parent.type === 9 || parent.type === 10), false, 'link is not conditional');
});

test('device DFU command remains disabled while disconnected or busy', async () => {
  let calls = 0, confirmations = 0;
  const h = harness({ enter_dfu: async () => { ++calls; return { status: 0 }; } }), app = h.instance;
  app.$confirm = async () => { ++confirmations; };
  await app.on_btn_enter_dfu(); app.connected = true; app.pendingUploads = 1; await app.on_btn_enter_dfu();
  assert.equal(calls, 0); assert.equal(confirmations, 0); assert.equal(h.messages.length, 0);
});

test('cancelling device DFU confirmation never sends a command or navigates', async () => {
  let calls = 0;
  const h = harness({ enter_dfu: async () => { ++calls; return { status: 0 }; } }), app = connected(h);
  app.$confirm = async () => { throw 'cancel'; }; await app.on_btn_enter_dfu();
  assert.equal(calls, 0); assert.equal(h.messages.length, 0); assert.equal(h.window.location.href, 'local-dateimanager');
});

test('nonzero DFU status remains an error and cannot produce an accepted-mode message', async () => {
  const h = harness({ enter_dfu: async () => ({ status: 255 }) }), app = connected(h);
  await app.on_btn_enter_dfu();
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].type, 'error'); assert.match(h.messages[0].message, /255/);
  assert.equal(h.window.location.href, 'local-dateimanager');
});

test('DFU reboot disconnect rejection is reported without assuming success or blocking the independent link', async () => {
  const h = harness(), app = connected(h);
  h.proto.enter_dfu = async () => { app.on_ble_disconnected(); throw new Error('Bluetooth disconnected'); };
  await app.on_btn_enter_dfu();
  assert.equal(app.connected, false); assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].type, 'error'); assert.match(h.messages[0].message, /Bluetooth disconnected/);
  assert.equal(h.window.location.href, 'local-dateimanager');
});

test('DFU acknowledgement reports only command acceptance with no automatic navigation or flash claim', async () => {
  let confirmations = 0;
  const h = harness({ enter_dfu: async () => ({ status: 0 }) }), app = connected(h);
  app.$confirm = async () => { ++confirmations; }; await app.on_btn_enter_dfu();
  assert.equal(confirmations, 1); assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].type, 'info'); assert.equal(h.messages[0].message, 'dfumode.commandaccepted');
  assert.equal(h.window.location.href, 'local-dateimanager');
  for (const language of ['de_DE', 'en_US']) {
    const context = vm.createContext({ module: { exports: {} } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../src/i18n/${language}.js`), 'utf8').replace('export default', 'module.exports ='), context);
    const locale = context.module.exports;
    assert.ok(locale.menu.dfupage); assert.ok(locale.menu.enterdfu);
    assert.match(locale.dfumode.commandaccepted, /noch keine Firmware|No firmware/);
    if (language === 'de_DE') assert.equal(locale.lang.choose, 'Sprache/Language');
  }
});

test('postflash: filename actions are native keyboard buttons without deprecated link properties', () => {
  const template = descriptor.template.content;
  const ast = compiler.compileTemplate({ source: template, filename: 'App.vue', id: 'keyboard' }).ast;
  let button;
  function visit(node) {
    if (node.tag === 'button' && node.props?.some(prop => prop.name === 'class' && prop.value?.content === 'file-name-action')) button = node;
    for (const child of node.children || []) visit(child);
    for (const branch of node.branches || []) visit(branch);
  }
  visit(ast);
  assert.ok(button, 'filename action is a native button');
  assert.ok(button.props.some(prop => prop.name === 'type' && prop.value?.content === 'button'));
  assert.ok(button.props.some(prop => prop.name === 'bind' && prop.arg?.content === 'disabled'));
  assert.ok(button.props.some(prop => prop.name === 'on' && prop.arg?.content === 'click' && prop.exp?.loc?.source?.includes('handle_name_click')));
  assert.doesNotMatch(template, /<el-link|:underline="false"/);
});

test('postflash: malformed metadata is visible but its property editor stays closed', async () => {
  const malformed = { name: 'bad.bin', size: 540, type: 0, meta: { valid: false, notes: '', flags: {}, amiibo: {} } };
  const h = harness({ vfs_read_folder: async () => ({ status: 0, data: [malformed, file('good.bin')] }) }), app = connected(h);
  await app.reload_folder();
  assert.equal(app.tableData.length, 2);
  assert.equal(app.tableData[0].metadataValid, false);
  assert.equal(app.tableData[0].notes, 'properties.invalidmeta');
  app.on_row_btn_meta(0, app.tableData[0]);
  assert.equal(app.meta_diag_visible, false); assert.equal(h.messages[0].type, 'warning');
  app.on_row_btn_meta(1, app.tableData[1]); assert.equal(app.meta_diag_visible, true);
});

test('postflash: free storage display is explicitly labelled and keeps unavailable-drive errors', async () => {
  const h = harness({ vfs_get_drive_list: async () => ({ status: 0, data: [
    { label: 'E', name: 'External', status: 0, total_size: 4096, free_size: 512 },
    { label: 'I', name: 'Internal', status: 1, total_size: 0, free_size: 0 }
  ] }) }), app = connected(h);
  app.$t = (key, values) => key === 'drive.free' ? `${values.free} frei von ${values.total}` : key;
  await app.reload_drive();
  assert.equal(app.tableData[0].size, '512 B frei von 4.00 KB');
  assert.match(app.tableData[1].size, /drive.message1drive.messageend/);
});
