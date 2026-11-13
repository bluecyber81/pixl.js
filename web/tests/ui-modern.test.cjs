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
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  const dispatcher = {
    addListener(name, fn) { listeners.set(name, fn); },
    removeListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
  };
  const proto = { init() {}, vfs_read_folder: async () => ({ status: 0, data: [] }),
    vfs_get_drive_list: async () => ({ status: 0, data: [
      { label: 'E', name: 'External', status: 0, total_size: 2 * 1024 * 1024, free_size: 2 * 1024 * 1024 }
    ] }), ...overrides };
  let disconnected = 0;
  const pixl = { connect() {}, get_device_key: () => overrides.deviceKey || 'private-test-device', disconnect() { ++disconnected; listeners.get('ble_disconnected')?.(); } };
  const document = { documentElement: { lang: '' } };
  const navigator = { languages: ['de-AT'] };
  const events = new EventTarget();
  const window = { localStorage: storage, location: { href: 'local-dateimanager' }, navigator,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events) };
  const timeouts = [];
  const context = vm.createContext({ module: { exports: {} }, proto, pixl, document, window, navigator,
    dfuReference: require('../src/lib/release-packages.js').dfuReference,
    sharedEventDispatcher: () => dispatcher, getElementLocale: language => ({ name: language }), webVersion: require('../package.json').version, console,
    defineAsyncComponent: loader => ({ loader }), DeviceStorageCard: {},
    ...require('../src/lib/raw-metadata.js'), ...require('../src/lib/device-nickname.js'), ...require('../src/lib/deployment-path.js'),
    catalogueBaseline: JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/catalogue.json'),'utf8')),
    TextEncoder, Uint8Array, ArrayBuffer, Blob, AbortController, crypto: require('node:crypto').webcrypto,
    performance: require('node:perf_hooks').performance,
    setTimeout(callback, delay) { timeouts.push({ callback, delay }); return timeouts.length; },
    clearTimeout(id) { if (timeouts[id - 1]) timeouts[id - 1].cancelled = true; },
    createBackup: options => overrides.createBackup(options),
    createBackupCheckpoint: options => overrides.createBackupCheckpoint ? overrides.createBackupCheckpoint(options) : ({
      summary: () => ({ ...options, files: 0, bytes: 0, busy: false }), clear() {}
    }),
    loadBackupZip: (...args) => overrides.loadBackupZip(...args),
    previewZipImport: options => overrides.previewZipImport(options),
    executeZipImport: options => overrides.executeZipImport(options),
    safeUpload: options => overrides.safeUpload(options),
    writableDirectoryPath: (...args) => import('../src/lib/safe-upload.js').then(module => module.writableDirectoryPath(...args)),
    createSyncPlan: options => overrides.createSyncPlan(options), createSyncJob: plan => overrides.createSyncJob(plan),
    executeSyncJob: options => overrides.executeSyncJob(options) });
  // In browsers the Window picker is also a global. Keep that real contract
  // while the VM isolates the browser fakes from the Node test process.
  Object.defineProperty(context, 'showSaveFilePicker', { get: () => window.showSaveFilePicker });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/power-diagnostics.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/metadata-note.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/language-preference.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/device-storage-display.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext('{ ' + fs.readFileSync(path.join(__dirname, '../src/lib/portable-names.js'), 'utf8').replace(/export /g, '') + '\nObject.assign(globalThis, { assertPortableEntryName, assertWritableDevicePath, portableNameKey, assertNameByteLimit, assertPathByteLimit }); }', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/browser-tools.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/folder-navigation.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/boot-diagnostics.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/device-info.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/transfer-meter.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/read-time-estimate.js'), 'utf8').replace(/export /g, ''), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/lib/figure-info.js'), 'utf8').replace(/export /g, ''), context);
  for (const [file, names] of [
    ['firmware-build-reference.js',['diagnosticBuildIdentity']],
    ['startup-diagnostics.js',['normalizeStartupDiagnostics']],
    ['device-extra-diagnostics.js',['normalizeMenuDiagnostics','normalizeMtuDiagnostics','normalizeUiDiagnostics','supportsMenuDiagnostics']],
    ['diagnostic-snapshot.js',['diagnosticSectionKeys','collectDiagnosticSnapshot','createCombinedDiagnosticReport']]
  ]) {
    const source=fs.readFileSync(path.join(__dirname,'../src/lib/',file),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
    vm.runInContext('{ '+source+'\n'+names.map(name=>'globalThis.'+name+'='+name+';').join('')+' }',context);
  }
  vm.runInContext(descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'module.exports ='), context);
  const options = context.module.exports;
  const instance = {
    $t: key => key, $i18n: { locale: 'de_DE', availableLocales: ['de_DE', 'en'] },
    $message: msg => messages.push(msg), $notify: msg => notifications.push(msg),
    $confirm: async () => {}, $prompt: async () => ({ value: 'New' }), $alert: async () => {},
    $nextTick: async () => {}, $refs: { upload: { clearFiles() {} } }
  };
  Object.assign(instance, options.data.call(instance));
  // Existing transfer regressions continue to exercise the explicitly available
  // direct mode. New integration cases opt into the production default below.
  instance.safeUploads = overrides.safeUploads ?? false;
  for (const [key, value] of Object.entries(options.methods)) instance[key] = value.bind(instance);
  for (const [key, value] of Object.entries(options.computed)) Object.defineProperty(instance, key, { get: value.bind(instance) });
  return { instance, options, messages, notifications, stored, listeners, document, window, navigator, proto, pixl, timeouts,
    disconnects: () => disconnected, mount: () => options.mounted.call(instance), unmount: () => options.beforeUnmount.call(instance) };
}
const connected = h => { h.instance.connected = true; h.instance.current_dir = 'E:/'; return h.instance; };

test('unknown transfer codes preserve the supplied message and dismissals stay silent', () => {
  const h = harness();
  for (const action of ['close','cancel']) h.instance.show_transfer_error(action);
  assert.equal(h.messages.length, 0);
  h.instance.show_transfer_error({ code:'toString', message:'Unknown operation' });
  assert.equal(h.messages[0].message, 'Unknown operation');
});

test('sync compares local and target contents again and explains the abort in both languages', async () => {
  const sync = await import('../src/lib/sync-plan.js');
  const { memoryVfs, localFile } = await import('./helpers/memory-vfs.mjs');
  const { workflowGerman, workflowEnglish } = await import('../src/i18n/workflow.js');
  const { createI18n } = await import('vue-i18n');
  for (const [locale, workflow] of [['de_DE', workflowGerman], ['en', workflowEnglish]]) {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: { workflow } } });
    for (const changed of ['target', 'local']) {
      const h = harness(sync), app = connected(h), vfs = memoryVfs();
      const name = 'Änderung.bin', target = 'E:/' + name;
      vfs.put(target, [1, 2]); vfs.put('E:/Behalten.bin', [8, 9]);
      app.$t = (key, params) => key.startsWith('workflow.') ? i18n.global.t(key, params) : key;
      app.transfer_adapters = () => vfs.api;
      app.refresh_current = async () => {};
      app.open_sync(); app.on_sync_files({target: { files: [localFile(name, [2, 3])] }});
      await app.build_sync_plan();
      assert.equal(app.syncPlan.summary.change, 1);
      app.syncSelected = [target];
      if (changed === 'target') vfs.put(target, [1, 4]);
      else app._syncFiles = [localFile(name, [2, 4])];
      const before = structuredClone([...vfs.nodes]);
      await app.run_sync();
      assert.equal(app.lastTransfer.status, 'failed');
      assert.equal(h.messages.at(-1).message, workflow[changed === 'target' ? 'syncStale' : 'syncLocalChanged']);
      assert.deepEqual([...vfs.nodes], before);
      assert.deepEqual(vfs.log.filter(row => ['write','rename','remove','mkdir','meta'].includes(row.op)), []);
    }
  }
});

test('rename and folder sync show the same localized name/path byte limits before device I/O', async () => {
  const { createSyncPlan } = await import('../src/lib/sync-plan.js');
  const { workflowGerman, workflowEnglish } = await import('../src/i18n/workflow.js');
  const { createI18n } = await import('vue-i18n');
  const parent = 'ü'.repeat(20);
  const cases = [
    { relativeName: 'ä'.repeat(24), currentDir: 'E:/', code: 'NAME_LIMIT', bytes: 48, limit: 47 },
    { relativeName: 'ö'.repeat(11), currentDir: 'E:/' + parent, code: 'PATH_LIMIT', bytes: 64, limit: 63 }
  ];
  for (const language of ['de', 'en']) {
    const i18n = createI18n({ legacy: false, locale: language,
      messages: { de: { workflow: workflowGerman }, en: { workflow: workflowEnglish } } });
    for (const { relativeName, currentDir, code, bytes, limit } of cases) {
      let reads = 0, writes = 0;
      const input = { name: relativeName, size: 1, arrayBuffer() { throw new Error('unexpected local read'); } };
      const h = harness({ createSyncPlan, vfs_read_folder() { ++reads; }, vfs_rename() { ++writes; } });
      const app = connected(h);
      app.current_dir = currentDir;
      app.$t = (key, params) => key.startsWith('workflow.') ? i18n.global.t(key, params) : key;
      app.$prompt = async () => ({ value: relativeName });
      await app.on_row_btn_rename(0, { name: 'old.bin' });
      app.syncRoot = currentDir;
      app._syncFiles = [input];
      app.syncFileCount = 1;
      await app.build_sync_plan();
      assert.equal(reads, 0);
      assert.equal(writes, 0);
      assert.equal(h.messages.length, 2);
      const text = h.messages[0].message;
      assert.equal(h.messages[1].message, text);
      assert.ok(text.includes(code === 'NAME_LIMIT' ? relativeName : currentDir + '/' + relativeName));
      assert.ok(text.includes(bytes + (language === 'de' ? ' UTF-8-Bytes' : ' UTF-8 bytes')));
      assert.ok(text.includes((language === 'de' ? 'Erlaubt sind höchstens ' : 'The limit is ') + limit + '.'));
    }
  }
});

test('3.32.2 cancelled safe upload stops preflight before late prompts or further reads', async () => {
 const gate=deferred();let prompts=0,driveReads=0,uploads=0;
 const h=harness({safeUploads:true,vfs_read_folder:()=>gate.promise,vfs_get_drive_list:async()=>{++driveReads;return {status:0,data:[]};},
  safeUpload:async({signal})=>{++uploads;assert.equal(signal.aborted,true);throw Object.assign(Error('cancelled'),{name:'AbortError'});}}),app=connected(h);
 app.replaceUploads=true;app.$confirm=async()=>{++prompts;};
 const pending=app.on_upload_request({file:{name:'existing.bin',size:1},onProgress(){}});
 const result=pending.then(()=>null,error=>error);await new Promise(setImmediate);
 app.cancel_transfer();gate.resolve({status:0,data:[file('existing.bin')]});
 const error=await result;
 assert.equal(prompts,0);assert.equal(driveReads,0);assert.equal(uploads,0);assert.equal(error.name,'AbortError');
 assert.equal(app.pendingUploads,0);assert.equal(app.busy,false);assert.equal(app.lastTransfer.status,'cancelled');
});

test('3.32.2 search file adapter binds the size limit and rejects stale sessions before and after the read', async () => {
 const app=connected(harness());let reads=0;
 app.read_device_file=async(path,options)=>{++reads;assert.equal(path,'E:/file.bin');assert.equal(options.max_bytes,540);return new Uint8Array(540);};
 const session=app.device_search_session();assert.equal((await session.readFile('E:/file.bin',{maxBytes:540})).length,540);assert.equal(reads,1);
 ++app.sessionGeneration;await assert.rejects(session.readFile('E:/file.bin',{maxBytes:540}));assert.equal(reads,1);
 const next=app.device_search_session();app.read_device_file=async()=>{++reads;++app.sessionGeneration;return new Uint8Array(540);};
 await assert.rejects(next.readFile('E:/file.bin',{maxBytes:540}));assert.equal(reads,2);
});

test('3.32.2 safe-upload cancellation after overwrite prompt or storage query starts no upload',async()=>{
 for(const phase of ['prompt','space']){
  const gate=deferred();let prompts=0,driveReads=0,uploads=0;
  const h=harness({safeUploads:true,vfs_read_folder:async()=>({status:0,data:[file('existing.bin')]}),
   vfs_get_drive_list:()=>{++driveReads;return gate.promise;},safeUpload:async()=>{++uploads;throw Error('must not upload');}}),app=connected(h);
  app.replaceUploads=true;app.$confirm=()=>{++prompts;return phase==='prompt'?gate.promise:Promise.resolve();};
  const pending=app.on_upload_request({file:{name:'existing.bin',size:1},onProgress(){}});
  const result=pending.then(()=>null,error=>error);await new Promise(setImmediate);
  assert.equal(prompts,1);assert.equal(driveReads,phase==='space'?1:0);
  app.cancel_transfer();gate.resolve({status:0,data:[{label:'E',name:'External',status:0,total_size:4096,free_size:4096}]});
  const error=await result;assert.equal(error.name,'AbortError');assert.equal(uploads,0);assert.equal(driveReads,phase==='space'?1:0);
  assert.equal(app.pendingUploads,0);assert.equal(app.busy,false);assert.equal(app.lastTransfer.status,'cancelled');
 }
});

test('3.32.1 note feedback counts bytes and prevents invalid saves before protocol requests', async () => {
  let saves = 0;
  const h = harness({vfs_update_meta: async () => { saves++; return {status:0}; }}), app = connected(h);
  const row = {name:'A.bin',notes:'old',flags:{},amiibo:{}};
  app.on_row_btn_meta(0,row);
  for (const [note,reason] of [['keep\0lost','invalid'],['\ud800','invalid'],['\udfff','invalid'],['ä'.repeat(45),'length']]) {
    app.meta_form.notes=note;
    assert.equal(app.metadataNote.valid,false);assert.equal(app.metadataNote.reason,reason);
    await app.on_diag_meta_close();assert.equal(saves,0);assert.equal(row.notes,'old');assert.equal(app.meta_diag_visible,true);
  }
  app.meta_form.notes='ä'.repeat(42)+'😀a';
  assert.equal(app.metadataNote.bytes,89);assert.equal(app.metadataNote.valid,true);
  assert.equal(app.metadata_note_hint(),'properties.notebytes');
  await app.on_diag_meta_close();assert.equal(saves,1);assert.equal(row.notes,'ä'.repeat(42)+'😀a');
  assert.match(descriptor.template.content,/aria-describedby="metadata-note-hint"/);
  assert.match(descriptor.template.content,/!connected \|\| busy \|\| !metadataNote\.valid/);
});

test('3.29 folder and parent navigation clear filters from the previous location', async () => {
  const folders = [], app = connected(harness({vfs_read_folder: async path => {
    folders.push(path); return {status:0,data:[file('Mario.bin')]};
  }}));
  app.searchQuery = 'Zelda'; app.typeFilter = 'DIR'; app.page = 3;
  await app.handle_name_click(0, {name:'Figuren',type:'DIR'});
  assert.equal(app.current_dir, 'E:/Figuren'); assert.equal(app.searchQuery, '');
  assert.equal(app.typeFilter, 'all'); assert.equal(app.page, 1); assert.equal(app.filteredRows.length, 1);
  app.searchQuery = 'missing'; app.typeFilter = 'DIR'; app.page = 2;
  await app.on_btn_up();
  assert.equal(app.current_dir, 'E:/'); assert.equal(app.searchQuery, ''); assert.equal(app.typeFilter, 'all');
  assert.deepEqual(folders, ['E:/Figuren','E:/']);
});

test('3.29 refreshing a large folder retains search and page, clamping only after the result shrinks', async () => {
  let length = 260;
  const app = connected(harness({vfs_read_folder: async () => ({status:0,data:Array.from({length},(_,i)=>file(`Mario${i}.bin`))})}));
  app.searchQuery = 'Mario'; app.page = 3;
  await app.on_btn_refresh(); assert.equal(app.page, 3); assert.equal(app.searchQuery, 'Mario');
  length = 120; await app.on_btn_refresh(); assert.equal(app.page, 2);
  length = 0; await app.on_btn_refresh(); assert.equal(app.page, 1);
});

test('device card exposes a folder count only after its successful listing', async () => {
  let read = deferred();
  const app = connected(harness({vfs_read_folder: () => read.promise}));
  const failed = app.reload_folder();
  assert.equal(app.folderEntryCount, null);
  read.reject(new Error('Listing failed'));
  await failed;
  assert.equal(app.folderEntryCount, null);
  read = deferred();
  const retry = app.reload_folder();
  assert.equal(app.folderEntryCount, null);
  read.resolve({status:0, data:[]}); await retry;
  assert.equal(app.folderEntryCount, 0);
  app.tableData = [file('A'), file('B')];
  app.searchQuery = 'A';
  assert.equal(app.folderEntryCount, 2);
  app.current_dir = ''; assert.equal(app.folderEntryCount, null);
});

test('the selected drive owns its status even if another drive has usable capacity', () => {
  const app = connected(harness());
  const external = {label:'E', status:0, totalBytes:2048, freeBytes:1536};
  const internal = {label:'I', status:0, totalBytes:8192, freeBytes:512};
  app.driveInfo = [external, {...internal, status:1}];
  app.current_dir = 'I:/'; assert.equal(app.statusDriveInfo, null); assert.equal(app.quickFreeSpace, null);
  app.driveInfo = [external]; assert.equal(app.statusDriveInfo, null);
  app.driveInfo = [external, internal]; assert.equal(app.statusDriveInfo, internal); assert.equal(app.quickFreeSpace, '512 B');
  app.current_dir = ''; assert.equal(app.statusDriveInfo, external); assert.equal(app.quickFreeSpace, '1,5 KiB');
  app.on_ble_disconnected(); assert.equal(app.statusDriveInfo, null);
});

test('3.29 failed listing is not announced as empty and a successful retry clears the error', async () => {
  let fail = true;
  const h = harness({vfs_read_folder: async () => {
    if (fail) throw new Error('Read failed'); return {status:0,data:[]};
  }}), app = connected(h);
  await app.reload_folder(); assert.equal(app.listingError, true); assert.equal(app.table_loading, false);
  assert.match(descriptor.template.content, /v-if="listingError[^\"]*"[^>]*role="alert"/);
  assert.match(descriptor.template.content, /!listingError[^\"]*!filteredRows\.length/);
  fail = false; await app.reload_folder(); assert.equal(app.listingError, false);
  app.listingError = true; app.on_ble_disconnected(); assert.equal(app.listingError, false);
});

test('3.30.1 refresh honours a filter reset performed while its folder read is pending', async () => {
  for (const change of ['search', 'type', 'reset']) {
    const gate = deferred();
    const app = connected(harness({vfs_read_folder: () => gate.promise}));
    app.tableData = Array.from({length:500}, (_,i) => ({name:`Mario${i}`,type:'REG'}));
    app.searchQuery = 'Mario'; app.page = 4;
    const pending = app.on_btn_refresh(); assert.equal(app.table_loading,true);
    if (change === 'search') { app.searchQuery = 'Mario'; app.on_filter_change(); }
    else if (change === 'type') { app.typeFilter = 'REG'; app.on_filter_change(); }
    else app.reset_filters();
    assert.equal(app.page,1);
    gate.resolve({status:0,data:Array.from({length:500}, (_,i) => file(`Mario${i}`))});
    await pending;
    assert.equal(app.page,1,change); assert.equal(app.filteredRows.length,500);
    assert.equal(app.busy,false);
  }
});

function readyCurrentSync(app) {
  app.syncDialog=true; app.syncRoot='E:/';
  app._syncGeneration=app.sessionGeneration; app._syncDeviceKey='private-test-device';
  app.syncPlan={rootPath:'E:/',deviceKey:'private-test-device',entries:[{targetPath:'E:/New.bin',status:'add',size:3}]};
  app.syncSelected=['E:/New.bin']; app._syncFiles=[{name:'New.bin',size:3}];
}

test('3.30.1 local sync refreshes committed entries after success, partial failure or cancellation', async () => {
  for (const outcome of ['success','partial-failure','cancelled']) {
    const remote=[]; let folderReads=0;
    const app=connected(harness({createSyncJob:()=>({}),executeSyncJob:async()=>{
      remote.push(file('New.bin'));
      if(outcome==='cancelled') app.cancel_sync();
      if(outcome!=='success') throw Error('Stopped after first committed file');
      return {completed:1,skipped:0,total:1};
    },vfs_read_folder:async()=>{folderReads++;return {status:0,data:remote.slice()};}}));
    readyCurrentSync(app); app.tableData=[];
    await app.run_sync();
    assert.deepEqual(Array.from(app.tableData,row=>row.name),['New.bin'],outcome);
    assert.equal(folderReads,1); assert.equal(app.busy,false);
    assert.equal(app.syncPlan,null); assert.equal(app.syncSelected.length,0);
    assert.equal(app.lastTransfer.status,outcome==='success'?'success':outcome==='cancelled'?'cancelled':'failed');
  }
});

test('3.30.1 sync retains the operation lock until its final listing settles and exposes read failure separately', async () => {
  const gate=deferred();
  const app=connected(harness({createSyncJob:()=>({}),executeSyncJob:async()=>({completed:1}),vfs_read_folder:()=>gate.promise}));
  readyCurrentSync(app); const pending=app.run_sync(); await new Promise(setImmediate);
  assert.equal(app.table_loading,true); assert.equal(app.busy,true);
  assert.equal(app.lastTransfer.status,'success');
  gate.reject(Error('Final listing failed')); await pending;
  assert.equal(app.lastTransfer.status,'success'); assert.equal(app.listingError,true);
  assert.equal(app.busy,false);
});

test('3.30.1 late sync completion cannot refresh or unlock a replacement session', async () => {
  const gate=deferred(); let reads=0;
  const app=connected(harness({createSyncJob:()=>({}),executeSyncJob:()=>gate.promise,vfs_read_folder:async()=>{reads++;return {status:0,data:[]};}}));
  readyCurrentSync(app); const pending=app.run_sync(); await new Promise(setImmediate);
  app.on_ble_disconnected(); app.connected=true; app.tableData=[{name:'Replacement'}]; app.pendingDownloads=1;
  gate.resolve({completed:1}); await pending;
  assert.equal(reads,0); assert.equal(app.tableData[0].name,'Replacement'); assert.equal(app.pendingDownloads,1);
});

test('3.29 ZIP entry progress clears stale byte estimates before changing units', () => {
  const app = connected(harness());
  app.set_transfer({phase:'checking',path:'E:/Mario.bin',done:540,total:540});
  app.show_zip_progress({unit:'entries',phase:'checking',done:2,total:8});
  assert.equal(app.transfer, null); assert.equal(app.transferStats, null);
  assert.equal(app.zipStatus, 'workflow.checking');
});
test('3.29 local sync directory collisions explain the file/folder conflict', () => {
  const app = harness().instance;
  assert.equal(app.plan_reason('DIRECTORY_CONFLICT'), 'workflow.TYPE_CONFLICT');
  assert.equal(app.plan_reason('TYPE_CONFLICT'), 'workflow.TYPE_CONFLICT');
  assert.equal(app.plan_reason('Unexpected arbitrary message'), 'workflow.blockedOther');
});

function diagnosticDownloadProbe(h) {
  const downloads = [];
  h.window.URL = { createObjectURL(blob) { downloads.push({blob}); return 'blob:diagnostic'; }, revokeObjectURL() {} };
  h.document.body = { appendChild() {} };
  h.document.createElement = () => ({ style: {}, click() { downloads.at(-1).clicked = true; }, remove() {} });
  return downloads;
}

test('3.30.1 diagnostic export first opens a local whitelisted preview with no download, picker, clipboard or device reads', () => {
  let reads = 0, pickers = 0, copies = 0;
  const h = harness({get_runtime_diagnostics: () => reads++, get_boot_diagnostics: () => reads++, vfs_read_folder: () => reads++});
  const app = connected(h), downloads = diagnosticDownloadProbe(h);
  h.window.showSaveFilePicker = () => pickers++;
  h.navigator.clipboard = { writeText: () => copies++ };
  app.firmwareVersion = '2.22.0-DE3.36';
  app.current_dir = 'E:/PRIVATE-DIRECTORY'; app.tableData = [{name:'PRIVATE-FILE',notes:'PRIVATE-NOTE'}];
  app.driveInfo = [{label:'E',status:0,totalBytes:2097152,freeBytes:123456,name:'PRIVATE-DRIVE'}];
  app.save_diagnostics();
  assert.equal(app.diagnosticsDialog, true); assert.equal(app.diagnosticsStatus, 'info.diagnosticReady');
  const report = JSON.parse(app.diagnosticsJson);
  assert.equal(report.applicationVersion, '3.48.2'); assert.equal(report.firmwareVersion, '2.22.0-DE3.36');
  assert.equal(report.drives[0].freeBytes, 123456); assert.doesNotMatch(app.diagnosticsJson, /PRIVATE-/);
  assert.deepEqual([reads,pickers,copies,downloads.length,h.disconnects()], [0,0,0,0,0]);
});

test('3.30.1 explicit save opens picker synchronously and confirms success only after write and close', async () => {
  const h = harness(), app = h.instance, downloads = diagnosticDownloadProbe(h), gate = deferred(), closing = deferred();
  let pickerCount = 0, pickerOptions, written, closes = 0;
  h.window.showSaveFilePicker = options => { pickerCount++; pickerOptions = options; return gate.promise; };
  app.save_diagnostics(); const snapshot = app.diagnosticsJson;
  const save = app.save_diagnostic_file();
  assert.equal(pickerCount, 1, 'picker called before the click handler returns its promise');
  assert.equal(pickerOptions.suggestedName, 'Allmiibo-Diagnose-3.48.2.json');
  assert.equal(pickerOptions.types[0].accept['application/json'][0], '.json');
  assert.equal(app.diagnosticsBusy, true); assert.equal(app.diagnosticsStatus, 'info.diagnosticSaving');
  // Other export actions cannot replace this report or start a second writer.
  app.firmwareVersion = '2.22.0-DE3.99'; app.save_diagnostics(); await app.save_diagnostic_file();
  app.download_diagnostics(); await app.copy_diagnostics(); app.select_diagnostics();
  assert.equal(app.diagnosticsJson, snapshot); assert.equal(pickerCount, 1);
  gate.resolve({createWritable: async () => ({write: async blob => { written = blob; }, close: () => { closes++; return closing.promise; }})});
  await new Promise(setImmediate);
  assert.equal(closes, 1); assert.equal(await written.text(), snapshot); assert.equal(written.type, 'application/json');
  assert.equal(app.diagnosticsStatus, 'info.diagnosticSaving');
  closing.resolve(); await save;
  assert.equal(app.diagnosticsStatus, 'info.diagnosticSaved'); assert.equal(app.diagnosticsBusy, false);
  assert.equal(downloads.length, 0); assert.equal(app.diagnosticsDialog, true);
});

test('3.30.1 cancelled, unavailable, denied and failed native saves retain the report without automatic download', async () => {
  for (const outcome of ['cancel','unsupported','denied','create','write','close']) {
    const h = harness(), app = h.instance, downloads = diagnosticDownloadProbe(h);
    if (outcome !== 'unsupported') h.window.showSaveFilePicker = async () => {
      if (outcome === 'cancel') throw Object.assign(Error('cancel'), {name:'AbortError'});
      if (outcome === 'denied') throw Object.assign(Error('denied'), {name:'SecurityError'});
      return {createWritable: async () => {
        if (outcome === 'create') throw Error('cannot open');
        return {write: async () => { if(outcome === 'write') throw Error('disk full'); },
          close: async () => { if(outcome === 'close') throw Object.assign(Error('commit failed'), {name:'AbortError'}); }, abort: async () => {}};
      }};
    };
    app.save_diagnostics(); const snapshot = app.diagnosticsJson;
    await app.save_diagnostic_file();
    assert.equal(app.diagnosticsStatus, outcome === 'cancel' ? 'info.diagnosticCancelled'
      : outcome === 'unsupported' ? 'info.diagnosticPickerUnavailable' : 'info.diagnosticSaveFailed', outcome);
    assert.equal(app.diagnosticsJson, snapshot); assert.equal(app.diagnosticsDialog, true);
    assert.equal(app.diagnosticsBusy, false); assert.equal(downloads.length, 0);
  }
});

test('3.30.1 explicit copying retains snapshot and only reports copied after clipboard success', async () => {
  const h = harness(), app = h.instance, gate = deferred(); let copied;
  h.navigator.clipboard = {writeText: value => { copied = value; return gate.promise; }};
  app.save_diagnostics(); const snapshot = app.diagnosticsJson;
  const run = app.copy_diagnostics();
  assert.equal(copied, snapshot); assert.equal(app.diagnosticsBusy, true);
  assert.notEqual(app.diagnosticsStatus, 'info.diagnosticCopied');
  gate.resolve(); await run;
  assert.equal(app.diagnosticsStatus, 'info.diagnosticCopied'); assert.equal(app.diagnosticsBusy, false);
});

test('3.30.1 unavailable or rejected clipboard selects text and a failed selection remains honest', async () => {
  for (const outcome of ['missing','denied','selection-failed','no-field']) {
    const h = harness(), app = h.instance, selection = [];
    if (outcome !== 'missing') h.navigator.clipboard = {writeText: async () => { throw Error('blocked'); }};
    if (outcome !== 'no-field') app.$refs.diagnosticsText = {focus: () => selection.push('focus'), select: () => {
      if(outcome === 'selection-failed') throw Error('unavailable'); selection.push('select');
    }};
    app.save_diagnostics(); await app.copy_diagnostics();
    assert.equal(app.diagnosticsStatus, ['missing','denied'].includes(outcome) ? 'info.diagnosticSelected' : 'info.diagnosticCopyFailed');
    assert.equal(app.diagnosticsBusy, false); assert.equal(app.diagnosticsDialog, true);
    if (['missing','denied'].includes(outcome)) assert.deepEqual(selection, ['focus','select']);
  }
  const h = harness(); h.instance.save_diagnostics(); let selected = 0;
  h.instance.$refs.diagnosticsText = {select: () => selected++}; h.instance.select_diagnostics();
  assert.equal(selected, 1); assert.equal(h.instance.diagnosticsStatus, 'info.diagnosticSelected');
});

test('3.30.1 browser download is explicit and a silently blocked click never claims file saved', async () => {
  const h = harness(), app = h.instance, downloads = diagnosticDownloadProbe(h);
  app.save_diagnostics(); assert.equal(downloads.length, 0);
  app.download_diagnostics(); assert.equal(downloads.length, 1); assert.equal(downloads[0].clicked, true);
  assert.equal(await downloads[0].blob.text(), app.diagnosticsJson);
  assert.equal(app.diagnosticsStatus, 'info.diagnosticDownloadRequested');
  h.document.createElement = () => ({style:{},remove(){},click(){throw Error('blocked')}});
  app.download_diagnostics(); assert.equal(app.diagnosticsStatus, 'info.diagnosticDownloadFailed');
  assert.equal(app.diagnosticsDialog, true); assert.ok(app.diagnosticsJson);
});

test('3.30.1 production export dialog renders selectable JSON, manual fallbacks and busy controls accessibly', async () => {
  const Vue = require('vue'), {renderToString} = require('@vue/server-renderer');
  const {parse,compile} = require('@vue/compiler-dom'), {infoGerman: labels} = await import('../src/i18n/info.js');
  function findDialog(node) {
    if(node.type === 1 && node.tag === 'el-dialog' && node.loc.source.includes('diagnosticPreviewTitle')) return node;
    for(const child of node.children || []) { const found = findDialog(child); if(found) return found; }
  }
  const source = findDialog(parse(descriptor.template.content)).loc.source;
  const render = new Function('Vue', compile(source, {mode:'function',prefixIdentifiers:true}).code)(Vue);
  const renderDialog = (native, busy) => {
    const app = Vue.createSSRApp({render, data: () => ({diagnosticsDialog:true,diagnosticsBusy:busy,
      diagnosticsFilename:'Allmiibo-Diagnose-3.48.2.json',diagnosticsJson:'{"safe":"<text>"}',
      nativeDiagnosticSaveAvailable:native,diagnosticsStatus:'info.diagnosticReady'}),
      methods:{save_diagnostic_file(){},copy_diagnostics(){},select_diagnostics(){},download_diagnostics(){}}});
    app.config.globalProperties.$t = key => labels[key.replace(/^info\./,'')];
    app.component('ElDialog', {setup(_, {slots}) { return () => Vue.h('section', {role:'dialog'}, [slots.default?.(),slots.footer?.()]); }});
    return renderToString(app);
  };
  const fallback = await renderDialog(false, false);
  assert.match(fallback, /<label[^>]*for="diagnostic-json"/); assert.match(fallback, /<textarea[^>]*readonly/);
  assert.match(fallback, /&lt;text&gt;/); assert.match(fallback, /role="status" aria-live="polite"/);
  assert.match(fallback, /JSON kopieren/); assert.match(fallback, /Text markieren/); assert.match(fallback, /Browser-Download versuchen/);
  assert.doesNotMatch(fallback, /Datei speichern…/); assert.match(fallback, /Kein Dateidialog verfügbar/);
  const native = await renderDialog(true, false); assert.match(native, /Datei speichern…/);
  const busy = await renderDialog(true, true); assert.equal((busy.match(/<button[^>]*disabled/g)||[]).length, 5);
  for(const prop of ['close-on-click-modal','close-on-press-escape','show-close']) assert.ok(source.includes(`:${prop}="!diagnosticsBusy"`));
});

test('power diagnostics only read on explicit idle action and old firmware remains usable',async()=>{
 let calls=0;const h=harness({get_power_diagnostics:async()=>{calls++;return null;}}),app=connected(h);
 assert.equal(calls,0);app.pendingUploads=1;await app.refresh_power_info();assert.equal(calls,0);app.pendingUploads=0;
 await app.refresh_power_info();assert.equal(calls,1);assert.equal(app.powerState,'unavailable');assert.equal(app.connected,true);assert.equal(app.busy,false);assert.equal(h.messages.length,0);
});
test('power diagnostic stale callbacks never publish or release a replacement session',async()=>{
 const pending=deferred(),h=harness({get_power_diagnostics:()=>pending.promise}),app=connected(h);
 const run=app.refresh_power_info();assert.equal(app.infoLoading,true);app.on_ble_disconnected();app.connected=true;app.infoLoading=true;
 pending.resolve({});await run;assert.equal(app.powerInfo,null);assert.equal(app.powerState,'unknown');assert.equal(app.infoLoading,true);
});
test('power diagnostic available, malformed and rejected responses have distinct states',async()=>{
 const {parsePowerDiagnostics}=await import('../src/lib/power-diagnostics.js');const value=parsePowerDiagnostics(Uint8Array.from([80,88,80,68,1,16,3,0,0,0,0,0,0,0,15,0]));
 const h=harness({get_power_diagnostics:async()=>value}),app=connected(h);await app.refresh_power_info();assert.equal(app.powerInfo.configuredSleepSeconds,15);assert.equal(app.powerState,'available');
 h.proto.get_power_diagnostics=async()=>({...value,configuredSleepSeconds:-1});await app.refresh_power_info();assert.equal(app.powerInfo,null);assert.equal(app.powerState,'failed');assert.equal(app.busy,false);
 h.proto.get_power_diagnostics=async()=>{throw Error('read failed')};await app.refresh_power_info();assert.equal(app.powerState,'failed');assert.equal(app.busy,false);
 app.on_ble_connect_error(Error('connection'));assert.equal(app.powerState,'unknown');
 assert.match(descriptor.template.content,/!powerInfo\.sampleCollected \? 'info\.unknown'/);
 assert.match(descriptor.template.content,/!powerInfo\.voltageValid \? 'info\.unknown'/);
 assert.match(descriptor.template.content,/powerInfo\.sampleCollected \? powerInfo\.configuredSleepSeconds/);
});
test('reset filters reveals exact original entries, clears selection and returns to first page without device I/O',()=>{
 let io=0;const h=harness({vfs_read_folder:()=>io++}),app=connected(h);
 app.tableData=[{name:'Café.bin',type:'REG',notes:''},{name:'Ordner',type:'DIR',notes:''}];app.searchQuery='missing';app.typeFilter='DIR';app.page=5;app.table_selection=[app.tableData[0]];
 assert.equal(app.filteredRows.length,0);app.reset_filters();assert.equal(app.filteredRows.length,2);assert.equal(app.tableData[0].name,'Café.bin');assert.equal(app.page,1);assert.equal(app.table_selection.length,0);assert.equal(io,0);
 assert.match(descriptor.template.content,/workflow\.noMatches/);assert.match(descriptor.template.content,/workflow\.emptyFolder/);
});

test('empty-result hint renders in preview and connected states, but not while loading or disconnected',async()=>{
  const Vue=require('vue');
  const {renderToString}=require('@vue/server-renderer');
  const {parse,compile}=require('@vue/compiler-dom');
  const ast=parse(descriptor.template.content);
  function hintNode(node) {
    if(node.type===1 && node.tag==='p' && node.loc.source.includes('workflow.noMatches'))return node;
    for(const child of node.children||[]) { const found=hintNode(child);if(found)return found; }
  }
  // Compile and render the production element, including its real v-if and
  // translation choice. No copied conditional or DOM/network fake is involved.
  const hint=hintNode(ast);assert.ok(hint,'production empty-result hint exists');
  const render=new Function('Vue',compile(hint.loc.source,{mode:'function',prefixIdentifiers:true}).code)(Vue);
  const {workflowGerman:labels}=await import('../src/i18n/workflow.js');
  const renderHint=state=>{
    const app=Vue.createSSRApp({render,data:()=>({
      connected:false,demoMode:false,table_loading:false,tableData:[],filteredRows:[],current_dir:'',...state
    })});
    app.config.globalProperties.$t=key=>labels[key.replace(/^workflow\./,'')];
    return renderToString(app);
  };
  const h=harness();h.instance.toggle_preview();h.instance.searchQuery='zzzz-kein-test-treffer';
  assert.equal(h.instance.connected,false);assert.equal(h.instance.demoMode,true);assert.equal(h.instance.tableData.length,245);
  const state={demoMode:h.instance.demoMode,tableData:h.instance.tableData,filteredRows:h.instance.filteredRows,current_dir:h.instance.current_dir};
  const preview=await renderHint(state);
  assert.match(preview,/role="status"/);assert.ok(preview.includes(labels.noMatches));
  assert.ok((await renderHint({...state,demoMode:false,connected:true})).includes(labels.noMatches));
  assert.ok((await renderHint({connected:true,current_dir:'E:/'})).includes(labels.emptyFolder));
  assert.ok((await renderHint({connected:true})).includes(labels.noDrives));
  for(const hidden of [{...state,table_loading:true},{...state,demoMode:false},{...state,filteredRows:[{}]}])
    assert.doesNotMatch(await renderHint(hidden),/role="status"/);
});

test('3.22.2 graceful disconnect clears device controls immediately but keeps reconnect disabled until cleanup',()=>{
  const h=harness(),app=connected(h);h.mount();let state='connected',picks=0;
  h.pixl.get_connection_state=()=>state;h.pixl.connect=()=>picks++;
  h.pixl.disconnect=()=>{state='disconnecting';h.listeners.get('ble_disconnected')();};
  app.firmwareVersion='2.21.0-DE3.26';app.tableData=[{name:'private'}];
  app.on_btn_ble_connect();
  assert.equal(app.connected,false);assert.equal(app.disconnecting,true);assert.equal(app.firmwareVersion,'');
  assert.equal(app.current_dir,'');assert.equal(app.tableData.length,0);assert.equal(app.connBtnText,'info.disconnecting');
  app.on_btn_ble_connect();assert.equal(picks,0);
  assert.match(appSource,/:disabled="remoteActive \|\| disconnecting \|\| connectionDisconnectLocked/);
  state='disconnected';h.listeners.get('ble_disconnect_complete')();
  assert.equal(app.disconnecting,false);assert.equal(app.connBtnText,'conn.connect');app.on_btn_ble_connect();assert.equal(picks,1);
});

test('3.22.2 unexpected disconnect does not invent a pending unsubscribe',()=>{
  const h=harness(),app=connected(h);h.pixl.get_connection_state=()=> 'disconnected';
  app.on_ble_disconnected();assert.equal(app.disconnecting,false);assert.equal(app.connBtnText,'conn.connect');
});

test('3.27 deliberate idle disconnect is informational while unexpected or stale-intent loss remains error',()=>{
  const h=harness(),app=connected(h);h.listeners.set('ble_disconnected',app.on_ble_disconnected);
  app.on_btn_ble_connect();assert.equal(h.disconnects(),1);assert.equal(app.connected,false);
  assert.equal(h.notifications.at(-1).type,'info');assert.equal(h.notifications.at(-1).message,'conn.disconnected');
  assert.equal(app._disconnectIntent,null);
  app.connected=true;app.on_ble_disconnected();assert.equal(h.notifications.at(-1).type,'error');
  app.connected=true;app._disconnectIntent={generation:app.sessionGeneration-1,reason:'user-disconnect'};
  app.on_ble_disconnected();assert.equal(h.notifications.at(-1).type,'error');
});

test('3.27 deliberate interruption of active direct transfers still records cancellation and error status',()=>{
  for(const kind of ['upload','download']) {
    const h=harness(),app=connected(h);h.listeners.set('ble_disconnected',app.on_ble_disconnected);
    if(kind==='upload')app.pendingUploads=1;else app.pendingDownloads=1;
    app.set_transfer({phase:kind,path:'E:/private.bin',done:20,total:100});
    app.on_btn_ble_connect();assert.equal(h.disconnects(),1);assert.equal(app.lastTransfer.status,'cancelled');
    assert.equal(h.notifications.at(-1).type,'error');assert.equal(app.connected,false);
  }
});

test('3.22.2 connect error while old link closes keeps disconnecting label until bounded cleanup',()=>{
  const h=harness(),app=connected(h);h.pixl.get_connection_state=()=> 'disconnecting';
  app.on_ble_connect_error(new Error('picker cancelled'));assert.equal(app.connected,false);
  assert.equal(app.disconnecting,true);assert.equal(app.connBtnText,'info.disconnecting');
  app.on_ble_disconnect_complete();assert.equal(app.disconnecting,false);assert.equal(app.connBtnText,'conn.connect');
});

test('3.22.2 unmount removes disconnect-complete listener and uses immediate GATT teardown',()=>{
  const h=harness();h.mount();let options;h.pixl.disconnect=value=>{options=value;};
  assert.equal(h.listeners.has('ble_disconnect_complete'),true);h.unmount();
  assert.equal(h.listeners.has('ble_disconnect_complete'),false);assert.equal(options.immediate,true);
});
const file = name => ({ name, size: 540, type: 0, meta: { notes: '', flags: {}, amiibo: {} } });

function figureBytes(size = 540, id = '0000000000000002') {
  const data = new Uint8Array(size);
  data.set([4,1,2,0x8f,3,4,5,6,4]); data.set(Buffer.from(id,'hex'),84);
  return data.buffer;
}
const figureRow = (name = 'Figure.bin', sizeBytes = 540) => ({ name, type:'REG', sizeBytes, notes:'', flags:{}, amiibo:{head:0,tail:0} });

test('figure info explicitly reads a bounded file with missing metadata, blocks other transfers and never saves bytes or properties',async()=>{
  let success, options, reads=0, writes=0;
  const h=harness({vfs_helper_read_file(path,yes,no,done,opts){ reads++;assert.equal(path,'E:/Figure.bin');success=yes;options=opts; },vfs_update_meta(){writes++;}}),app=connected(h);
  const row=figureRow();app.lastDownload={filename:'existing'};app.on_row_btn_meta(0,row);
  assert.equal(reads,0);assert.equal(app.figureInfoSupported,true);
  const pending=app.read_figure_info();assert.equal(reads,1);assert.equal(app.busy,true);assert.equal(options.max_bytes,540);
  await app.read_figure_info();await app.on_diag_meta_close();assert.equal(reads,1);assert.equal(writes,0);
  options.progress_cb({received_bytes:20});assert.equal(app.transfer.done,20);
  success(figureBytes());await pending;
  assert.equal(app.figureInspection.id,'0000000000000002');assert.equal(app.figureInfoState,'ready');
  assert.equal(app.figureInspection.cryptography,'not-checked');assert.equal(app.busy,false);assert.equal(app.transfer,null);
  assert.equal(app.lastDownload.filename,'existing');assert.deepEqual(row.amiibo,{head:0,tail:0});assert.equal(writes,0);
  assert.equal(app.meta_form.amiibo.head,0);assert.equal(app.meta_form.amiibo.tail,0);
});

test('figure info permits only supported regular file sizes and respects busy/disconnected/closed guards',async()=>{
  let calls=0;const h=harness({vfs_helper_read_file(){calls++;}}),app=connected(h);
  for(const size of [0,531,541,2049,10000000]){app.on_row_btn_meta(0,figureRow('Other.bin',size));await app.read_figure_info();}
  app.on_row_btn_meta(0,{...figureRow(),type:'DIR'});await app.read_figure_info();
  app.on_row_btn_meta(0,figureRow());app.pendingUploads=1;await app.read_figure_info();app.pendingUploads=0;
  app.connected=false;await app.read_figure_info();app.connected=true;
  app.meta_diag_visible=false;await app.read_figure_info();assert.equal(calls,0);
  for(const size of [532,540,572,2048]){app.on_row_btn_meta(0,figureRow('A.bin',size));assert.equal(app.figureInfoSupported,true);}
});

test('figure info discards responses after close or dialog replacement, including reopening the same path',async()=>{
  for(const action of ['close','replace','same-path']){
    let success,options;
    const h=harness({vfs_helper_read_file(path,yes,no,done,opts){success=yes;options=opts;}}),app=connected(h);
    app.on_row_btn_meta(0,figureRow());const pending=app.read_figure_info();
    if(action==='close'){app.meta_diag_visible=false;app.reset_figure_info();}
    else app.on_row_btn_meta(1,figureRow(action==='same-path'?'Figure.bin':'Other.bin'));
    assert.equal(app.busy,true);
    options.progress_cb({received_bytes:500});assert.equal(app.transfer.done,0);
    success(figureBytes());await pending;
    assert.equal(app.figureInspection,null);assert.equal(app.figureInfoState,'idle');assert.equal(app.busy,false);assert.equal(h.messages.length,0);
  }
});

test('figure info discards old-session callbacks without releasing the new session transfer',async()=>{
  let success,options;
  const h=harness({vfs_helper_read_file(path,yes,no,done,opts){success=yes;options=opts;}}),app=connected(h);
  app.on_row_btn_meta(0,figureRow());const pending=app.read_figure_info();
  app.on_ble_disconnected();app.connected=true;app.pendingDownloads=1;
  app.set_transfer({phase:'download',path:'New-session',done:12,total:540});
  options.progress_cb({received_bytes:500});success(figureBytes());await pending;
  assert.equal(app.figureInspection,null);assert.equal(app.figureInfoState,'idle');assert.equal(app.pendingDownloads,1);assert.equal(app.transfer.path,'New-session');assert.equal(app.transfer.done,12);
});

test('figure info read failures/size changes release the lock, and raw IDs never silently rewrite metadata',async()=>{
  for(const mode of ['short','reject','throw']){
    const h=harness({vfs_helper_read_file(path,yes,no){if(mode==='throw')throw Error('sync read failure');if(mode==='reject')no(Error('read failure'));else yes(figureBytes(532));}}),app=connected(h);
    app.on_row_btn_meta(0,figureRow());await app.read_figure_info();
    assert.equal(app.figureInspection,null);assert.equal(app.figureInfoState,'failed');assert.equal(app.busy,false);assert.equal(h.messages.length,1);
  }
  const h=harness({vfs_helper_read_file(path,yes){yes(figureBytes());}}),app=connected(h),row={...figureRow(),amiibo:{head:0x01010000,tail:0x000e0002}};
  app.on_row_btn_meta(0,row);await app.read_figure_info();assert.equal(app.figureInspection.id,'0000000000000002');
  assert.equal(app.meta_form.amiibo.head,0x01010000);assert.equal(row.amiibo.head,0x01010000);
  assert.match(descriptor.template.content,/:metadata="figureInspection \? null : meta_form\.amiibo"/);
  assert.match(descriptor.template.content,/@close="reset_figure_info"/);
});

test('connection timeout offers a specific recovery message and releases the UI', async () => {
  const h=harness(),app=connected(h);app.connecting=true;app.table_loading=true;
  app.on_ble_connect_error(Object.assign(new Error('timed out'), {code:'CONNECT_TIMEOUT'}));
  assert.equal(h.notifications.at(-1).message,'info.connectTimeout');
  assert.equal(app.connecting,false);assert.equal(app.connected,false);assert.equal(app.busy,false);
  app.on_ble_connect_error(new Error('other'));
  assert.equal(h.notifications.at(-1).message,'conn.connfailed');
  assert.equal(app.runtime_vfs_detail(-1000),'info.runtimeBadRequest');
  assert.equal(app.runtime_vfs_detail(-10002),'info.runtimeVfsOther');
  await Promise.resolve();
});

test('3.17 boot diagnostics are manual, serialized and block conflicting operations',async()=>{
  let calls=0;const gate=deferred(),h=harness({get_boot_diagnostics:()=>{calls++;return gate.promise}}),app=connected(h);
  assert.equal(calls,0);const pending=app.refresh_boot_info();assert.equal(app.busy,true);assert.equal(calls,1);
  await app.refresh_boot_info();await app.refresh_runtime_info();assert.equal(calls,1);
  gate.resolve(null);await pending;assert.equal(app.bootState,'unavailable');assert.equal(app.bootInfo,null);assert.equal(app.busy,false);
  app.connected=false;await app.refresh_boot_info();assert.equal(calls,1);
  app.connected=true;app.upload_diag_visible=true;await app.refresh_boot_info();assert.equal(calls,1);
});

test('3.17 boot diagnosis clears stale results and an old request cannot alter a replacement session',async()=>{
  const {parseBootDiagnostics}=await import('../src/lib/boot-diagnostics.js');
  const result=parseBootDiagnostics(require('./boot-fixture.cjs')());
  const gate=deferred(),h=harness({get_boot_diagnostics:()=>gate.promise}),app=connected(h);
  app.bootInfo=result;app.bootState='available';const pending=app.refresh_boot_info();assert.equal(app.bootInfo,null);
  app.on_ble_disconnected();app.connected=true;app.infoLoading=true;gate.resolve(result);await pending;
  assert.equal(app.bootInfo,null);assert.equal(app.bootState,'unknown');assert.equal(app.infoLoading,true);
  assert.equal(h.messages.length,0);
});

test('3.17 invalid or failed boot diagnosis is explicit and retry is only user initiated',async()=>{
  const h=harness({get_boot_diagnostics:async()=>({schemaVersion:1})}),app=connected(h);
  await app.refresh_boot_info();assert.equal(app.bootState,'failed');assert.equal(app.bootInfo,null);assert.equal(app.busy,false);
  assert.equal(h.messages.length,1);h.proto.get_boot_diagnostics=async()=>{throw new Error('read failed')};
  await app.refresh_boot_info();assert.equal(app.bootState,'failed');assert.equal(h.messages.length,2);
});

test('3.17 valid boot snapshot is exported without private fields and all session resets erase it',async()=>{
  const {parseBootDiagnostics}=await import('../src/lib/boot-diagnostics.js');
  const result=parseBootDiagnostics(require('./boot-fixture.cjs')());
  const h=harness({get_boot_diagnostics:async()=>({...result,path:'PRIVATE'})}),app=connected(h);
  await app.refresh_boot_info();assert.equal(app.bootState,'available');assert.equal(app.bootInfo.bootloaderCounter,7);
  app.save_diagnostics();const report=JSON.parse(app.diagnosticsJson);assert.equal(report.boot.bootAddress,0x77000);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE/);app.on_ble_disconnected();assert.equal(app.bootInfo,null);
  app.bootInfo=result;app.bootState='available';app.on_ble_connect_error(new Error('test'));
  assert.equal(app.bootInfo,null);assert.equal(app.bootState,'unknown');
});

test('3.15 unexpected disconnect replaces stale success for active upload, download and backup exactly once', async () => {
  for (const kind of ['upload', 'download', 'backup']) {
    const h = harness(), app = connected(h);
    app.remember_transfer('upload', 'success', 540, true);
    if (kind === 'backup') app.backingUp = true;
    else if (kind === 'download') app.pendingDownloads = 1;
    else app.pendingUploads = 2;
    app.set_transfer({ phase: kind, path: 'not-exported.bin', done: 20, total: 540 });
    app.on_ble_disconnected(); app.on_ble_disconnected();
    assert.equal(app.lastTransfer.kind, kind); assert.equal(app.lastTransfer.status, 'interrupted');
    assert.equal(app.lastTransfer.bytes, 20); assert.equal(app.lastTransfer.verified, false);
    assert.equal(app.transferHistory.length, 2); assert.equal(app.busy, false);
    await Promise.resolve();
  }
});

test('3.15 explicit cancellation records once and stale disconnect intent cannot classify a new session', async () => {
  const h = harness(), app = connected(h); h.listeners.set('ble_disconnected', app.on_ble_disconnected);
  app.pendingUploads = 1; app.cancel_transfer();
  assert.equal(app.transferHistory.length, 1); assert.equal(app.lastTransfer.status, 'cancelled');
  app.connected = true; app.pendingDownloads = 1;
  app._disconnectIntent = {generation: app.sessionGeneration - 1, reason: 'dfu'};
  app.on_ble_disconnected();
  assert.equal(app.transferHistory.length, 2); assert.equal(app.lastTransfer.status, 'interrupted');
});

test('3.15 DFU pending and accepted states block file actions until disconnect', async () => {
  const gate = deferred(); let calls = 0;
  const h = harness({ enter_dfu: () => { ++calls; return gate.promise; } }), app = connected(h);
  const request = app.on_btn_enter_dfu(); await new Promise(setImmediate);
  assert.equal(app.enteringDfu, true); assert.equal(app.busy, true); assert.equal(app.btn_disabled(), true);
  await app.on_btn_enter_dfu(); assert.equal(calls, 1);
  await assert.rejects(app.on_upload_request({ file: { name: 'blocked.bin', size: 0 } }));
  gate.resolve({status: 0}); await request;
  assert.equal(app.enteringDfu, true); assert.equal(app.busy, true);
  app.on_ble_disconnected(); assert.equal(app.enteringDfu, false);
  assert.equal(h.timeouts[0].cancelled, true); assert.equal(app.lastTransfer, null);
});

test('3.15 DFU timeout terminates old transport and late result cannot touch the replacement session', async () => {
  const gate = deferred(), h = harness({enter_dfu: () => gate.promise}), app = connected(h);
  h.listeners.set('ble_disconnected', app.on_ble_disconnected);
  const request = app.on_btn_enter_dfu(); await new Promise(setImmediate);
  assert.equal(h.timeouts[0].delay, 15000); h.timeouts[0].callback();
  assert.equal(h.disconnects(), 1); assert.equal(app.connected, false); assert.equal(app.enteringDfu, false);
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].message, 'info.dfuTimeout');
  app.connected = true; ++app.sessionGeneration;
  gate.resolve({status:0}); await request;
  assert.equal(app.connected, true); assert.equal(h.messages.length, 1); assert.equal(h.disconnects(), 1);
  h.timeouts[0].callback(); assert.equal(h.disconnects(), 1);
});

test('reserved root paths stop direct actions before a mutation and remain readable', async () => {
  const calls = []
  const forbidden = async (...args) => { calls.push(args); return {status: 0, data: []} }
  const h = harness({vfs_read_folder: forbidden, vfs_create_folder: forbidden, vfs_rename: forbidden,
    vfs_remove: forbidden, vfs_update_meta: forbidden, vfs_helper_write_file: forbidden})
  const app = connected(h), name = '.pixl_txn_pending'
  const row = {name, notes: '', flags: {}, amiibo: {}, type: 'REG'}
  app.$prompt = async () => ({value: name})
  for (const safe of [true, false]) {
    app.safeUploads = safe
    await assert.rejects(app.on_upload_request({file: {name, size: 1}}), {code: 'PATH_RESERVED'})
  }
  await app.on_btn_new_folder()
  await app.on_row_btn_rename(0, {name: 'normal.bin'})
  await app.on_row_btn_rename(0, row)
  await app.on_row_btn_remove(0, row)
  app.table_selection = [{...row, name: 'normal.bin'}, row]
  await app.on_btn_remove()
  app.on_row_btn_meta(0, row)
  assert.equal(app.meta_form.path, 'E:/' + name)
  app.meta_form.notes = 'note'
  await app.on_diag_meta_close()
  assert.ok(h.messages.some(message => message.message === 'workflow.pathReserved'))
  assert.deepEqual(calls, [])
})

test('properties preserve unrelated Raw128 bytes on a flags-only edit', async () => {
  const bytes = new Uint8Array(128).fill(0xa7)
  bytes.set([7, 2, 0x90, 1, 3, 97, 98, 99])
  const expected = bytes.slice(); expected[2] = 0x94
  const writes = [], h = harness({
    vfs_read_raw_meta: async () => ({status: 0, data: bytes}),
    vfs_write_raw_meta: async (p, b) => { writes.push([p, b]); return {status: 0} },
    vfs_update_meta: async () => { throw Error('unexpected legacy write') }
  }), app = connected(h)
  const row = {name:'A.bin', notes:'abc', flags:{raw:0x90, hide:false, readonly:false}, amiibo:{head:0,tail:0}}
  app.on_row_btn_meta(0, row); app.meta_form.flags.readonly = true
  await app.on_diag_meta_close()
  assert.equal(app.meta_diag_visible, false)
  assert.deepEqual(writes, [['E:/A.bin', expected]])
  assert.equal(row.flags.raw, 0x94)
  assert.equal(bytes[2], 0x90)
})

test('a flags-only edit falls back only on an explicit unsupported command', async () => {
  const original = {name:'A.bin', notes:'', flags:{raw:64, hide:false, readonly:false}, amiibo:{head:0,tail:0}}
  for (const response of [{status:255}, {status:1}, {status:0,data:Uint8Array.from([4,2,64,2,64,...new Array(123).fill(0)])},
    {status:0,data:Uint8Array.from([1,42,...new Array(126).fill(0)])}, {status:0,data:Uint8Array.from([2,2,65,...new Array(125).fill(0)])}]) {
    let legacyWrites=0,rawWrites=0
    const h=harness({vfs_read_raw_meta:async()=>response,
      vfs_update_meta:async()=>{++legacyWrites;return {status:0}},
      vfs_write_raw_meta:async()=>{++rawWrites;return {status:0}}}),app=connected(h)
    const row=structuredClone(original)
    app.on_row_btn_meta(0,row);app.meta_form.flags.readonly=true;await app.on_diag_meta_close()
    assert.equal(rawWrites,0);assert.equal(legacyWrites,response.status===255?1:0)
    assert.equal(row.flags.readonly,response.status===255)
    assert.equal(row.flags.raw,response.status===255 ? 68 : 64)
  }
})

test('3.15 invalid new portable names cannot reach upload, rename or create but existing names stay addressable', async () => {
  for (const name of ['CON.bin', 'folder.', 'a:b.bin']) {
    let writes=0, creates=0, renames=0;
    const h=harness({vfs_helper_write_file(_path,_file,_progress,success){++writes;success()},vfs_create_folder(){++creates},vfs_rename(){++renames}}), app=connected(h);
    app.verifyUploads=false;
    await assert.rejects(app.on_upload_request({file:{name,size:0}}), /info.portableName/);
    app.$prompt=async()=>({value:name}); await app.on_btn_new_folder();
    await app.on_row_btn_rename(0,{name:'valid.bin'});
    assert.equal(writes+creates+renames,0); assert.equal(app.append_segment('E:/',name),'E:/'+name);
    assert.equal(app.busy,false);
  }
});

test('3.15 real safe upload adapter stages replacement, verifies bytes and retains metadata', async () => {
  const {safeUpload}=await import('../src/lib/safe-upload.js');
  const meta={valid:true,notes:'keep',flags:{raw:2,hide:false,readonly:false},amiibo:{head:1,tail:2}};
  const files=new Map([['E:/old.bin',{bytes:new Uint8Array([1,2]),meta}]]), writes=[];
  const h=harness({safeUploads:true,safeUpload,
    vfs_read_folder:async()=>({status:0,data:[...files].map(([path,file])=>({name:path.slice(3),type:0,size:file.bytes.length,meta:file.meta}))}),
    vfs_helper_write_file(path,blob,progress,success,error){writes.push(path);blob.arrayBuffer().then(buffer=>{files.set(path,{bytes:new Uint8Array(buffer),meta:{valid:true,notes:'',flags:{raw:0,hide:false,readonly:false},amiibo:{head:0,tail:0}}});progress({written_bytes:buffer.byteLength,total_bytes:buffer.byteLength});success();},error);},
    vfs_helper_read_file(path,success,error,done,options){const file=files.get(path);if(file){options?.progress_cb?.({received_bytes:file.bytes.length});success(file.bytes.slice().buffer)}else error(new Error('missing'));done?.();},
    vfs_rename:async(from,to)=>{assert.ok(files.has(from));assert.equal(files.has(to),false);files.set(to,files.get(from));files.delete(from);return{status:0}},
    vfs_remove:async path=>{files.delete(path);return{status:0}},
    vfs_update_meta:async(path,value)=>{files.get(path).meta=value;return{status:0}}
  }), app=connected(h), progress=[];
  app.replaceUploads=true; app.verifyUploads=false;
  assert.equal(h.options.data.call(app).safeUploads,true);
  await app.on_upload_request({file:{name:'old.bin',size:3,arrayBuffer:async()=>new Uint8Array([3,4,5]).buffer},onProgress:value=>progress.push(value.percent)});
  assert.equal(files.size,1); assert.deepEqual([...files.get('E:/old.bin').bytes],[3,4,5]);
  assert.equal(files.get('E:/old.bin').meta.notes,'keep'); assert.equal(files.get('E:/old.bin').meta.flags.raw,2);
  assert.equal(writes.length,1); assert.match(writes[0],/^E:\/~u/);
  assert.equal(app.lastTransfer.verified,true); assert.equal(progress.at(-1),100); assert.equal(app.recoveryNotes.length,0);
});

test('3.15 cancelling a safe commit aborts cooperatively without disconnecting or unlocking early', async () => {
  const gate=deferred(); let signal;
  const h=harness({safeUploads:true,safeUpload:options=>{signal=options.signal;options.onProgress({phase:'committing',path:options.path,done:1,total:1});return gate.promise}}), app=connected(h);
  h.listeners.set('ble_disconnected',app.on_ble_disconnected);
  const pending=app.on_upload_request({file:{name:'new.bin',size:1}}); await new Promise(setImmediate);
  assert.equal(app.connectionDisconnectLocked,true); app.on_btn_ble_connect(); assert.equal(h.disconnects(),0);
  app.cancel_transfer(); assert.equal(signal.aborted,true); assert.equal(h.disconnects(),0); assert.equal(app.busy,true);
  gate.resolve({verified:true,recoveryFiles:[],cancelledAfterCommit:true}); await pending;
  assert.equal(app.pendingUploads,0); assert.equal(app.busy,false); assert.equal(app.connected,true);
  assert.equal(app.connectionDisconnectLocked,false);
});

test('3.15 cancellation before a safe upload starts prevents all writes without disconnecting', async () => {
  let writes=0;const h=harness({safeUploads:true,safeUpload:async()=>{writes++}}),app=connected(h);
  const pending=app.on_upload_request({file:{name:'new.bin',size:1}});
  app.cancel_transfer();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(writes,0);assert.equal(h.disconnects(),0);assert.equal(app.connected,true);assert.equal(app.busy,false);
});

test('3.15 safe upload recovery survives connection loss locally and cannot leak into diagnostics', async () => {
  const gate=deferred(), h=harness({safeUploads:true,safeUpload:()=>gate.promise}), app=connected(h);
  const pending=app.on_upload_request({file:{name:'new.bin',size:1}}); await new Promise(setImmediate);
  app.on_ble_disconnected();
  gate.reject(Object.assign(new Error('lost'),{recovery:{phase:'committing',committed:null,recoveryFiles:[{path:'E:/PRIVATE-recovery',role:'backup',state:'possible'}]}}));
  await assert.rejects(pending,/lost/); assert.equal(app.lastTransfer.status,'interrupted');
  assert.match(app.recoveryNotes[0],/PRIVATE-recovery/);
  assert.equal(JSON.parse(app.recoveryNotes[0]).committed,null);
  app.save_diagnostics();assert.doesNotMatch(app.diagnosticsJson,/PRIVATE-recovery/);
});

test('3.15 runtime diagnostics are optional, manual and stale replies cannot repopulate a new session', async () => {
  let calls=0;const gate=deferred(),h=harness({get_runtime_diagnostics:()=>{calls++;return gate.promise}}),app=connected(h);
  assert.equal(calls,0);const pending=app.refresh_runtime_info();assert.equal(app.busy,true);
  app.on_ble_disconnected();gate.resolve({schemaVersion:1,scope:'since-device-restart',heapPoolBytes:100,heapFreeBytes:50});await pending;
  assert.equal(app.runtimeInfo,null);assert.equal(app.runtimeState,'unknown');
  app.connected=true;h.proto.get_runtime_diagnostics=async()=>null;await app.refresh_runtime_info();
  assert.equal(app.runtimeState,'unavailable');assert.equal(app.busy,false);
});

test('3.32.1 runtime loading and failure remain visible until an explicit retry succeeds', async () => {
  const fixture=require('./runtime-de348-wire-fixture.json'),gate=deferred();let calls=0;
  const h=harness({get_runtime_diagnostics:()=>{calls++;return gate.promise}}),app=connected(h);
  app.runtimeInfo=fixture.expected;app.runtimeState='available';
  const pending=app.refresh_runtime_info();
  assert.equal(app.runtimeState,'loading');assert.equal(app.runtimeInfo,null);assert.equal(app.busy,true);
  await app.refresh_runtime_info();await app.refresh_boot_info();assert.equal(calls,1);
  gate.reject(Error('Bluetooth read timed out'));await pending;
  assert.equal(app.runtimeState,'failed');assert.equal(app.runtimeInfo,null);assert.equal(app.busy,false);
  assert.equal(h.messages.length,1);await new Promise(setImmediate);assert.equal(calls,1);
  h.proto.get_runtime_diagnostics=async()=>{calls++;return fixture.expected};
  await app.refresh_runtime_info();assert.equal(app.runtimeState,'available');assert.equal(app.busy,false);
  assert.equal(calls,2);assert.deepEqual(JSON.parse(JSON.stringify(app.runtimeInfo)),fixture.expected);
  app.save_diagnostics();assert.deepEqual(JSON.parse(app.diagnosticsJson).runtime,fixture.expected);
});

test('3.32.1 invalid runtime data differs from an unsupported optional command',async()=>{
  for(const invalid of [{}, {schemaVersion:2,scope:'since-device-restart'}, {schemaVersion:1,scope:'other-session'}]) {
    const h=harness({get_runtime_diagnostics:async()=>invalid}),app=connected(h);
    await app.refresh_runtime_info();assert.equal(app.runtimeState,'failed');assert.equal(app.runtimeInfo,null);
    assert.equal(app.infoLoading,false);assert.equal(h.messages.length,1);
    h.proto.get_runtime_diagnostics=async()=>null;await app.refresh_runtime_info();
    assert.equal(app.runtimeState,'unavailable');assert.equal(h.messages.length,1);
  }
});

test('3.32.1 stale diagnostic success and failure cannot unlock or overwrite a newer read',async()=>{
  for(const lateFailure of [false,true]) {
    const old=deferred(),fresh=deferred(),h=harness({get_runtime_diagnostics:()=>old.promise}),app=connected(h);
    const pending=app.refresh_runtime_info();app.on_ble_disconnected();app.connected=true;
    h.proto.get_runtime_diagnostics=()=>fresh.promise;const current=app.refresh_runtime_info();
    if(lateFailure)old.reject(Error('Old connection lost'));else old.resolve(require('./runtime-de348-wire-fixture.json').expected);
    await pending;
    assert.equal(app.runtimeState,'loading');assert.equal(app.runtimeInfo,null);assert.equal(app.infoLoading,true);
    assert.equal(h.messages.length,0);fresh.resolve(null);await current;
    assert.equal(app.runtimeState,'unavailable');assert.equal(app.infoLoading,false);
  }
});

test('3.32.1 boot and battery reads retain an explicit loading status while waiting',async()=>{
  for(const [method,command,state] of [['refresh_boot_info','get_boot_diagnostics','bootState'],['refresh_power_info','get_power_diagnostics','powerState']]) {
    const gate=deferred(),h=harness({[command]:()=>gate.promise}),app=connected(h);
    const pending=app[method]();assert.equal(app[state],'loading');assert.equal(app.busy,true);
    gate.resolve(null);await pending;assert.equal(app[state],'unavailable');assert.equal(app.busy,false);
  }
});

test('3.32.1 runtime status renders readable loading, failure and unsupported messages in German and English',async()=>{
  const Vue=require('vue'),{renderToString}=require('@vue/server-renderer');
  const {parse,compile}=require('@vue/compiler-dom');
  const {infoGerman,infoEnglish}=await import('../src/i18n/info.js');
  function findStatus(node) {
    if(node.type===1 && node.props.some(prop=>prop.type===6 && prop.name==='class' && prop.value?.content==='runtime-status'))return node;
    for(const child of node.children||[]) { const found=findStatus(child);if(found)return found; }
  }
  const status=findStatus(parse(descriptor.template.content));assert.ok(status);
  const render=new Function('Vue',compile(status.loc.source,{mode:'function',prefixIdentifiers:true}).code)(Vue);
  for(const labels of [infoGerman,infoEnglish]) {
    for(const [state,key] of [['loading','runtimeLoading'],['failed','runtimeFailed'],['unavailable','runtimeUnavailable']]) {
      const app=Vue.createSSRApp({render,data:()=>({runtimeState:state})});
      app.config.globalProperties.$t=value=>labels[value.replace(/^info\./,'')];
      const html=await renderToString(app);
      assert.match(html,/role="status"/);assert.match(html,/aria-live="polite"/);assert.ok(html.includes(labels[key]));
      if(state==='failed')assert.doesNotMatch(html,new RegExp(labels.runtimeUnavailable.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    }
  }
});

test('3.15 sync selection uses target paths, never selects replacements automatically and invalidates on disconnect', async () => {
  const plan={rootPath:'E:/',entries:[{relativePath:'new.bin',targetPath:'E:/new.bin',status:'add',size:1},{relativePath:'old.bin',targetPath:'E:/old.bin',status:'change',size:1}],deviceOnly:[],summary:{add:1,change:1,same:0,blocked:0}};
  let executed;
  const h=harness({createSyncPlan:async()=>plan,createSyncJob:()=>({}),executeSyncJob:async options=>{executed=options;return{completed:1}}}),app=connected(h);
  app.open_sync();app.on_sync_files({target:{files:[{name:'new.bin',size:1}]}});await app.build_sync_plan();
  assert.deepEqual(Array.from(app.syncSelected),['E:/new.bin']);await app.run_sync();
  assert.deepEqual(Array.from(executed.selectedPaths),['E:/new.bin']);assert.equal(executed.deviceKey,'private-test-device');
  assert.equal(app.lastTransfer.kind,'sync');assert.equal(app.syncPlan,null);
  app.syncPlan=plan;app.syncDialog=true;app.on_ble_disconnected();assert.equal(app.syncPlan,null);assert.equal(app.syncFileCount,0);assert.equal(app.syncDialog,false);
});

test('3.15 comparison reply after disconnect cannot restore private file selection or its plan', async () => {
  const gate=deferred(),h=harness({createSyncPlan:()=>gate.promise}),app=connected(h);
  app.open_sync();app.on_sync_files({target:{files:[{name:'private.bin',size:1}]}});
  const pending=app.build_sync_plan();app.on_ble_disconnected();gate.resolve({entries:[],summary:{},deviceOnly:[]});await pending;
  assert.equal(app.syncPlan,null);assert.equal(app.syncFileCount,0);assert.equal(app.syncDialog,false);assert.equal(app.busy,false);
});

test('3.15 full comparison and selected staged upload preserve changed and device-only files', async () => {
  const {safeUpload}=await import('../src/lib/safe-upload.js');
  const {createSyncPlan,createSyncJob,executeSyncJob}=await import('../src/lib/sync-plan.js');
  const meta={valid:true,notes:'',flags:{raw:0,hide:false,readonly:false},amiibo:{head:0,tail:0}};
  const files=new Map([['E:/old.bin',{bytes:new Uint8Array([1]),meta}],['E:/keep.bin',{bytes:new Uint8Array([8]),meta}]]),writes=[],removals=[];
  const h=harness({safeUploads:true,safeUpload,createSyncPlan,createSyncJob,executeSyncJob,
    vfs_read_folder:async()=>({status:0,data:[...files].map(([path,file])=>({name:path.slice(3),type:0,size:file.bytes.length,meta:file.meta}))}),
    vfs_helper_write_file(path,blob,progress,success,error){writes.push(path);blob.arrayBuffer().then(buffer=>{files.set(path,{bytes:new Uint8Array(buffer),meta});progress({written_bytes:buffer.byteLength,total_bytes:buffer.byteLength});success();},error)},
    vfs_helper_read_file(path,success,error,done,options){const file=files.get(path);if(file){options?.progress_cb?.({received_bytes:file.bytes.length});success(file.bytes.slice().buffer)}else error(new Error('missing'));done?.()},
    vfs_rename:async(from,to)=>{assert.ok(files.has(from));assert.equal(files.has(to),false);files.set(to,files.get(from));files.delete(from);return{status:0}},
    vfs_remove:async path=>{removals.push(path);files.delete(path);return{status:0}},
    vfs_update_meta:async(path,value)=>{files.get(path).meta=value;return{status:0}}
  }),app=connected(h);
  const local=(name,byte)=>({name,size:1,arrayBuffer:async()=>new Uint8Array([byte]).buffer});
  app.open_sync();app.on_sync_files({target:{files:[local('new.bin',3),local('old.bin',4)]}});
  await app.build_sync_plan();assert.equal(writes.length,0);assert.equal(removals.length,0);
  assert.equal(app.syncPlan.summary.add,1);assert.equal(app.syncPlan.summary.change,1);
  assert.deepEqual(Array.from(app.syncSelected),['E:/new.bin']);await app.run_sync();
  assert.equal(app.lastTransfer.status,'success');assert.equal(app.lastTransfer.kind,'sync');
  assert.deepEqual([...files.get('E:/new.bin').bytes],[3]);assert.deepEqual([...files.get('E:/old.bin').bytes],[1]);assert.deepEqual([...files.get('E:/keep.bin').bytes],[8]);
  assert.equal(writes.length,1);assert.equal(removals.length,0);assert.equal(files.size,3);
});

test('3.15 new folder and rename reject case aliases while case-only rename never uses copy/delete', async () => {
  const calls=[],h=harness({vfs_read_folder:async()=>({status:0,data:[file('Mario'),file('other')]}),
    vfs_create_folder:async path=>{calls.push(['create',path]);return{status:0}},vfs_rename:async(from,to)=>{calls.push(['rename',from,to]);return{status:0}}}),app=connected(h);
  app.$prompt=async()=>({value:'mario'});await app.on_btn_new_folder();await app.on_row_btn_rename(0,{name:'other'});
  assert.equal(calls.length,0);assert.equal(h.messages.filter(value=>value.message==='info.portableCollision').length,2);
  await app.on_row_btn_rename(0,{name:'Mario'});assert.deepEqual(calls,[['rename','E:/Mario','E:/mario']]);
});

test('3.15 transfer adapters reject stale drive queries before issuing a device request', async () => {
  let calls=0;const h=harness({vfs_get_drive_list:async()=>{calls++;return{status:0,data:[]}}}),app=connected(h);
  const adapters=app.transfer_adapters(app.sessionGeneration);app.on_ble_disconnected();
  await assert.rejects(adapters.getFreeBytes('E:/a.bin'),/tools.sessionChanged/);assert.equal(calls,0);
});

test('3.15 direct mode never overwrites readonly destinations or invalid metadata', async () => {
  for(const meta of [{valid:false,flags:{}},{valid:true,flags:{readonly:true}},{valid:true,flags:{raw:4,readonly:false}}]) {
    let writes=0,prompts=0;
    const h=harness({vfs_read_folder:async()=>({status:0,data:[{name:'old.bin',type:0,size:1,meta}]}),vfs_helper_write_file(){writes++}}),app=connected(h);
    app.replaceUploads=true;app.verifyUploads=false;app.$confirm=async()=>{prompts++};
    await assert.rejects(app.on_upload_request({file:{name:'old.bin',size:1}}),/invalidmeta|readonlyTarget/);
    assert.equal(writes,0);assert.equal(prompts,0);
  }
});

test('3.25.6 direct uploads respect readonly parent folders and use the translated error', async () => {
  const { metadata } = await import('./helpers/memory-vfs.mjs');
  let writes = 0;
  const h = harness({vfs_read_folder:async path=>({status:0,data:path==='E:/'?[{name:'tags',type:1,size:0,meta:metadata(4)}]:[]}),vfs_helper_write_file(){writes++;}}), app = connected(h);
  app.current_dir='E:/tags'; app.verifyUploads=false;
  await assert.rejects(app.on_upload_request({file:{name:'new.bin',size:1}}),{code:'UPLOAD_PARENT'});
  assert.equal(writes,0); assert.equal(app.pendingUploads,0);
  app.show_transfer_error(Object.assign(new Error('internal detail'),{code:'UPLOAD_PARENT'}));
  assert.equal(h.messages.at(-1).message,'workflow.uploadParent');
});

test('3.14 explicit transfer cancellation replaces an older success result before disconnect', async () => {
  for (const kind of ['upload', 'download']) {
    const h = harness(), app = connected(h);
    h.listeners.set('ble_disconnected', app.on_ble_disconnected);
    app.remember_transfer('download', 'success', 99);
    if (kind === 'upload') app.pendingUploads = 2;
    else app.pendingDownloads = 1;
    app.set_transfer({ phase: kind, path: 'private.bin', done: 20, total: 540 });
    app.cancel_transfer();
    assert.equal(h.disconnects(), 1);
    assert.equal(app.lastTransfer.kind, kind);
    assert.equal(app.lastTransfer.status, 'cancelled');
    assert.equal(app.lastTransfer.bytes, 20);
    assert.equal(app.connected, false);
    assert.equal(app.transfer, null);
    await Promise.resolve();
  }
});

test('production template compiles with Vue 3 and modern Element Plus bindings', () => {
  assert.deepEqual(compiler.parse(appSource).errors, []);
  assert.deepEqual(compiler.compileTemplate({ source: descriptor.template.content, filename: 'App.vue', id: 'ui' }).errors, []);
  assert.doesNotMatch(descriptor.template.content, /slot-scope|\.(?:native|sync)(?==|\s|>)/);
  assert.match(descriptor.template.content, /<h1>\{\{ \$t\('workflow\.appTitle'\) \}\}<\/h1>/);
  assert.ok(descriptor.template.content.includes('<strong>' + require('../package.json').version + '</strong>'));
});

test('3.26 workspaces open and focus without navigation, disconnect or loss of transfer state',()=>{
  const h=harness(),app=connected(h),calls=[];
  const summary={focus:()=>calls.push('focus')};
  const panel={open:false,scrollIntoView:()=>calls.push('scroll'),querySelector:()=>summary};
  app.$refs.backupWorkspace=panel;app.transfer={phase:'reading',done:23,total:100};app.tableData=[{name:'keep.bin'}];
  app.show_workspace('backup');assert.equal(panel.open,true);assert.deepEqual(calls,['scroll','focus']);
  assert.equal(app.transfer.done,23);assert.equal(app.tableData[0].name,'keep.bin');assert.equal(h.disconnects(),0);
  app.show_workspace('__proto__');assert.deepEqual(calls,['scroll','focus']);
  app.on_migration_busy(true);panel.open=false;app.keep_migration_visible();assert.equal(panel.open,true);
  assert.equal(app.connectionDisconnectLocked,true);app.on_migration_busy(false);panel.open=false;app.keep_migration_visible();assert.equal(panel.open,false);
});

test('3.26 files precede diagnostics and active restoration is never conditionally unmounted',()=>{
  const source=descriptor.template.content;
  assert(source.indexOf('id="file-workspace"')<source.indexOf('id="device-overview"'));
  assert.match(source,/<main class="filemanager">/);assert.match(source,/class="skip-link" href="#file-workspace"/);
  assert.match(source,/<MigrationAssistant :connected=/);assert.doesNotMatch(source,/<MigrationAssistant[^>]*v-(if|show)=/);
  assert.match(source,/@busy="on_migration_busy"/);assert.match(source,/ref="backupWorkspace"[^>]*@toggle="keep_migration_visible"/);
  for(const id of ['file-workspace','backup-workspace','update-workspace'])assert.match(source,new RegExp('aria-controls="'+id+'"'));
});

test('migration lock is shared with ordinary operations and deliberate disconnect',()=>{
  const h=harness(),app=connected(h);app.migrationBusy=true;
  assert.equal(app.busy,true);assert.equal(app.connectionDisconnectLocked,true);
  app.on_btn_ble_connect();assert.equal(h.disconnects(),0);
  assert.match(descriptor.template.content,/:blocked="busy && !migrationBusy"/);
});
test('migration read/raw adapters bind one generation and never implicitly format',async()=>{
  const calls=[],h=harness({vfs_storage_info_extended:async drive=>{calls.push(['storage',drive]);return{status:0,data:{schema:1}}},
    vfs_read_raw_meta:async path=>{calls.push(['raw-read',path]);return{status:0,data:new Uint8Array(128)}},
    vfs_write_raw_meta:async path=>{calls.push(['raw-write',path]);return{status:0,data:null}}}),app=connected(h);
  const adapter=app.migration_session();assert.equal(adapter.deviceKey,'private-test-device');
  await adapter.readStorageInfo();await adapter.readRawMetadata('E:/x');await adapter.updateRawMetadata('E:/x',new Uint8Array(128));
  assert.deepEqual(calls,[['storage','E'],['raw-read','E:/x'],['raw-write','E:/x']]);
  app.sessionGeneration++;await assert.rejects(adapter.readRawMetadata('E:/y'));await assert.rejects(adapter.updateRawMetadata('E:/y',new Uint8Array(128)));assert.equal(calls.length,3);
  assert(!Object.keys(adapter).some(name=>/dfu|reset/i.test(name)));
  assert.equal(typeof adapter.formatStorage,'function','format is a separate explicit wizard operation');
});

test('3.25 missing StorageInfo capability produces a preparation requirement, not an unqualified error255',async()=>{
  let rawReads=0;const h=harness({vfs_storage_info_extended:async()=>({status:255}),vfs_read_raw_meta:async()=>{rawReads++;return{status:0,data:new Uint8Array(128)}}}),app=connected(h);
  app.firmwareVersion='2.22.0-DE3.30-PREP';
  await assert.rejects(app.migration_session().readStorageInfo(),{code:'MIGRATION_PREPARATION_REQUIRED'});
  assert.equal(rawReads,0,'a claimed PREP version alone cannot grant raw access');
  assert.equal(app.busy,false,'ordinary file-manager controls remain available');
});
test('3.25 an unrelated storage error stays distinct from unsupported capabilities',async()=>{
  const h=harness({vfs_storage_info_extended:async()=>({status:1})}),app=connected(h);
  await assert.rejects(app.migration_session().readStorageInfo(),error=>!error.code&&error.message.includes(': 1'));
});

test('3.25 migration adapter reads current version/direct boot diagnostics and maps each explicit import command once',async()=>{
  const {parseBootDiagnostics}=await import('../src/lib/boot-diagnostics.js'),packet=require('./boot-fixture.cjs')();new DataView(packet.buffer,packet.byteOffset,packet.byteLength).setUint32(60,603,true);const boot=parseBootDiagnostics(packet),calls=[];
  const h=harness({get_version:async()=>({status:0,data:{ver:'2.22.0-DE3.31'}}),get_boot_diagnostics:async()=>boot,
    vfs_import_state:async(...args)=>{calls.push(args);return{status:0,data:{ready:true}}},vfs_drive_format:async drive=>{calls.push(['format',drive]);return{status:0}},vfs_storage_layout:async drive=>{calls.push(['layout',drive]);return{status:0,data:{backend:3}}}}),app=connected(h),adapter=app.migration_session();
  const identity=await adapter.readApplicationIdentity();assert.equal(identity.applicationCounter,603);assert.equal(identity.firmwareVersion,'2.22.0-DE3.31');assert.equal(identity.settingsCrcValid,true);
  await adapter.readStorageLayout();await adapter.readImportState();await adapter.bindImport('a'.repeat(64));await adapter.finishImport();await adapter.formatStorage();
  assert.deepEqual(calls,[['layout','E'],['E',0],['E',3,'a'.repeat(64)],['E',1],['format','E']]);
  app.sessionGeneration++;for(const run of [()=>adapter.formatStorage(),()=>adapter.finishImport(),()=>adapter.bindImport('a'.repeat(64)),()=>adapter.restartDevice()])await assert.rejects(run());assert.equal(calls.length,5);
});

test('3.25 restart adapter accepts only its acknowledged restart response despite the expected disconnect',async()=>{
  let calls=0;const h=harness({vfs_import_state:async(drive,op)=>{calls++;assert.equal(drive,'E');assert.equal(op,2);app.sessionGeneration++;app.connected=false;return{status:0,data:{ready:true}}}}),app=connected(h);
  assert.equal((await app.migration_session().restartDevice()).ready,true);assert.equal(calls,1);
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
  const app = connected(h), percentages = []; app.verifyUploads = false;
  let frameworkSuccess = 0, frameworkError = 0;
  const pending = app.on_upload_request({ file: { name: 'A.bin', size: 0 }, onProgress: value => percentages.push(value.percent),
    onSuccess: () => ++frameworkSuccess, onError: () => ++frameworkError });
  assert.equal(app.pendingUploads, 1);
  await new Promise(setImmediate);
  progress({ total_bytes: 0, written_bytes: 0 }); success(); success(); fail(new Error('late'));
  await pending;
  assert.equal(app.pendingUploads, 0); assert.deepEqual(percentages, [0, 100]);
  assert.equal(frameworkSuccess, 0); assert.equal(frameworkError, 0);
});

test('upload failure rejects once and releases the pending counter', async () => {
  const h = harness({ vfs_helper_write_file(path, file, progress, success, error) { error(new Error('write failed')); error(new Error('again')); } });
  const app = connected(h); app.verifyUploads = false;
  await assert.rejects(app.on_upload_request({ file: { name: 'A.bin', size: 0 }, onProgress() {} }), /write failed/);
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
  assert.equal(closed, 0); assert.equal(h.disconnects(), 1); assert.equal(app.connected, false);
  assert.equal(app.upload_diag_visible, false);
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
  h.mount(); assert.equal(h.listeners.size, 4);
  const pending = app.reload_folder(); h.unmount(); response.reject(new Error('late disconnect'));
  await pending;
  assert.equal(h.listeners.size, 0); assert.equal(h.disconnects(), 1);
  assert.equal(app.connected, false); assert.equal(h.messages.length, 0); assert.equal(h.notifications.length, 0);
});

test('file manager follows browser language, supports a manual override and resumes automatic updates', () => {
  const h = harness(); h.mount();
  assert.equal(h.instance.language, 'de_DE'); assert.equal(h.document.documentElement.lang, 'de-DE');
  assert.equal(h.instance.languageMode, 'auto'); assert.equal(h.stored.has('allmiibo.language'), false);
  h.instance.handle_set_language('de_DE'); // Pin the already detected language.
  h.navigator.languages = ['es-MX']; h.window.dispatchEvent(new Event('languagechange'));
  assert.equal(h.instance.language, 'de_DE');
  h.instance.handle_set_language('en');
  assert.equal(h.instance.$i18n.locale, 'en'); assert.equal(h.stored.get('allmiibo.language'), 'en');
  assert.equal(h.document.documentElement.lang, 'en');
  h.instance.handle_set_language('__proto__'); assert.equal(h.instance.language, 'en');
  h.instance.handle_set_language('auto'); assert.equal(h.instance.$i18n.locale, 'es');
  assert.equal(h.stored.has('allmiibo.language'), false);
  h.navigator.languages = ['ja-JP']; h.window.dispatchEvent(new Event('languagechange'));
  assert.equal(h.document.documentElement.lang, 'ja-JP');
  h.unmount(); h.navigator.languages = ['de-CH']; h.window.dispatchEvent(new Event('languagechange'));
  assert.equal(h.document.documentElement.lang, 'ja-JP');
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

test('DFU webpage is an unconditional build-base link with no Bluetooth action', async () => {
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
  const hrefBinding=found.node.props.find(prop=>prop.type===7&&prop.name==='bind'&&prop.arg?.content==='href');
  assert.equal(hrefBinding?.exp?.content,'_ctx.dfuPageUrl');
  const {deploymentPath}=await import('../src/lib/deployment-path.js');
  const href=new Function('deploymentPath', 'return ('+descriptor.script.content.match(/dfuPageUrl\(\) \{([^}]+)\}/)[0].replace('dfuPageUrl()', 'function()')+').call({})')(deploymentPath);
  assert.equal(href, '/dfu/web.html');
  for (const location of ['http://127.0.0.1:8765/', 'http://127.0.0.1:8765/a/00000000-12345678']) {
    assert.equal(new URL(href, location).pathname, '/dfu/web.html');
  }
  assert.equal(attributes.target, '_blank'); assert.equal(attributes.rel, 'noopener noreferrer');
  assert.equal(found.node.props.some(prop => (prop.type === 7 && prop !== hrefBinding) || prop.name === 'disabled'), false);
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

test('DFU reboot disconnect reports the ended connection once without a stale command error or update claim', async () => {
  const h = harness(), app = connected(h);
  h.proto.enter_dfu = async () => { app.on_ble_disconnected(); throw new Error('Bluetooth disconnected'); };
  await app.on_btn_enter_dfu();
  assert.equal(app.connected, false); assert.equal(h.messages.length, 0);
  assert.equal(h.notifications.length, 1); assert.equal(h.notifications[0].message, 'info.dfuDisconnected');
  assert.equal(app.enteringDfu, false); assert.equal(app.lastTransfer, null);
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
  assert.ok(button.props.some(prop => prop.name === 'on' && prop.arg?.content === 'click' && prop.exp?.loc?.source?.includes('select_file_row')));
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

const uploadFile = (name, data = [1, 2, 3]) => ({ name, size: data.length, arrayBuffer: async () => Uint8Array.from(data).buffer });

test('existing upload targets are rejected before opening or writing by default', async () => {
  let writes = 0;
  const h = harness({ vfs_read_folder: async () => ({ status: 0, data: [file('existing.bin')] }), vfs_helper_write_file() { ++writes; } });
  const app = connected(h);
  await assert.rejects(app.on_upload_request({ file: uploadFile('existing.bin') }), /tools.exists/);
  assert.equal(writes, 0); assert.equal(app.pendingUploads, 0);
});

test('failed upload preflight, directory conflict and cancelled replace never truncate', async () => {
  let writes = 0;
  const h = harness({ vfs_read_folder: async () => ({ status: 255 }), vfs_helper_write_file() { ++writes; } }), app = connected(h);
  await assert.rejects(app.on_upload_request({ file: uploadFile('a') }), /255/);
  h.proto.vfs_read_folder = async () => ({ status: 0, data: [{ ...file('a'), type: 1 }] });
  app.replaceUploads = true;
  await assert.rejects(app.on_upload_request({ file: uploadFile('a') }), /conflictDirectory/);
  h.proto.vfs_read_folder = async () => ({ status: 0, data: [file('a')] });
  app.$confirm = async () => { throw 'cancel'; };
  await assert.rejects(app.on_upload_request({ file: uploadFile('a') }), reason => reason === 'cancel');
  assert.equal(writes, 0); assert.equal(app.pendingUploads, 0);
});

test('source read errors occur before any device write, and later uploads still run', async () => {
  let writes = 0;
  const h = harness({ vfs_helper_write_file(path, file, progress, yes) { ++writes; yes(); },
    vfs_helper_read_file(path, yes) { yes(Uint8Array.from([1, 2, 3]).buffer); } }), app = connected(h);
  const bad = { ...uploadFile('bad'), arrayBuffer: async () => { throw new Error('local read failed'); } };
  const first = app.on_upload_request({ file: bad }), rejected = assert.rejects(first, /local read failed/);
  const second = app.on_upload_request({ file: uploadFile('good') });
  await rejected; await second;
  assert.equal(writes, 1); assert.equal(app.pendingUploads, 0);
});

test('verified upload reports 100 percent only after matching SHA256 readback', async () => {
  let readSuccess, progressValues = [];
  const h = harness({ vfs_helper_write_file(path, file, progress, yes) { progress({ total_bytes: 3, written_bytes: 3 }); yes(); },
    vfs_helper_read_file(path, yes, no, done, options) { assert.equal(options.max_bytes, 3); readSuccess = yes; } });
  const app = connected(h), pending = app.on_upload_request({ file: uploadFile('a'), onProgress: value => progressValues.push(value.percent) });
  while (!readSuccess) await new Promise(setImmediate);
  assert.deepEqual(progressValues, [99]);
  readSuccess(Uint8Array.from([1, 2, 3]).buffer); await pending;
  assert.deepEqual(progressValues, [99, 100]); assert.equal(app.pendingUploads, 0);
});

test('same-size corrupted readback is an error, never a verified success', async () => {
  const percentages = [];
  const h = harness({ vfs_helper_write_file(path, file, progress, yes) { yes(); },
    vfs_helper_read_file(path, yes) { yes(Uint8Array.from([1, 2, 9]).buffer); } }), app = connected(h);
  await assert.rejects(app.on_upload_request({ file: uploadFile('a'), onProgress: value => percentages.push(value.percent) }), /verificationFailed/);
  assert.ok(!percentages.includes(100)); assert.equal(app.pendingUploads, 0);
});

test('a new same-name file in an upload batch is checked again and not overwritten', async () => {
  let exists = false, writes = 0;
  const h = harness({ vfs_read_folder: async () => ({ status: 0, data: exists ? [file('a')] : [] }),
    vfs_helper_write_file(path, file, progress, yes) { exists = true; ++writes; yes(); } }), app = connected(h);
  app.verifyUploads = false;
  const first = app.on_upload_request({ file: uploadFile('a') });
  const second = app.on_upload_request({ file: uploadFile('a') }), rejected = assert.rejects(second, /tools.exists/);
  await first; await rejected; assert.equal(writes, 1);
});

test('disconnect while confirming a replacement invalidates queued uploads', async () => {
  const dialog = deferred(); let writes = 0;
  const h = harness({ vfs_read_folder: async () => ({ status: 0, data: [file('a')] }), vfs_helper_write_file() { ++writes; } });
  const app = connected(h); app.replaceUploads = true; app.$confirm = () => dialog.promise;
  const pending = app.on_upload_request({ file: uploadFile('a') }), rejected = assert.rejects(pending, /sessionChanged/);
  await new Promise(setImmediate); assert.equal(app.dialogPending, true);
  app.on_ble_disconnected(); app.connected = true; dialog.resolve(); await rejected;
  assert.equal(writes, 0); assert.equal(app.pendingUploads, 0); assert.equal(app.dialogPending, false);
});

test('folder prompt locks navigation until input or cancellation completes', async () => {
  const dialog = deferred(); let creates = 0;
  const h = harness({ vfs_create_folder: async () => { ++creates; return { status: 0 }; } }), app = connected(h);
  app.current_dir = 'E:/first'; app.$prompt = () => dialog.promise;
  const pending = app.on_btn_new_folder();
  assert.equal(app.busy, true); app.handle_name_click(0, { name: 'second', type: 'DIR' }); app.on_btn_up();
  assert.equal(app.current_dir, 'E:/first');
  dialog.reject('cancel'); await pending;
  assert.equal(creates, 0); assert.equal(app.busy, false);
});

test('large collections sort globally before pagination and filtered selections clear', () => {
  const h = harness(), app = connected(h);
  app.tableData = Array.from({ length: 305 }, (_, index) => ({ name: 'Figur' + (305 - index), type: 'REG', notes: '', sizeBytes: index }));
  assert.equal(app.pagedRows.length, 100); assert.equal(app.pagedRows[0].name, 'Figur1');
  app.change_page(3); assert.equal(app.pagedRows[0].name, 'Figur201');
  app.table_selection = [app.tableData[0]]; app.searchQuery = 'figur305'; app.on_filter_change();
  assert.equal(app.page, 1); assert.equal(app.table_selection.length, 0); assert.equal(app.filteredRows.length, 1);
  app.searchQuery = ''; app.on_sort_change({ prop: 'size', order: 'descending' });
  assert.equal(app.pagedRows[0].sizeBytes, 304);
});

test('backup wrapper is read-only, forwards bounds, and waits for an explicit save click', async () => {
  let observed, reads = 0;
  const h = harness({ vfs_helper_read_file(path, yes, no, done, options) { assert.equal(options.max_bytes, 3); ++reads; yes(new Uint8Array(3)); },
    createBackup: async options => {
      observed = options; await options.readDirectory('E:/'); await options.readFile('E:/a', { maxBytes: 3, onProgress() {} });
      return { blob: new Blob(['zip']), filename: 'backup.zip', manifest: { files: 1 } };
    } }), app = connected(h);
  await app.on_backup(); assert.equal(reads, 1); assert.equal(observed.rootPath, 'E:/');
  assert.equal(observed.preserveLegacyNames,true);
  assert.equal(app.lastBackup.filename, 'backup.zip'); assert.equal(app.backingUp, false); assert.equal(app.busy, false);
});

test('3.28 completed backup reaches 100 only after the completed archive event', async () => {
  let app;
  const h = harness({createBackup: async ({onProgress}) => {
    onProgress({phase:'reading',path:'E:/A',bytesDone:540,bytesTotal:540,filesDone:1,filesTotal:1});
    assert.equal(app.transferPercent,99);
    onProgress({phase:'complete',bytesDone:540,bytesTotal:540,filesDone:1,filesTotal:1});
    assert.equal(app.transferPercent,100);
    return {blob:new Blob(['zip']),filename:'backup.zip',manifest:{files:1,bytes:540}};
  }});
  app=connected(h); await app.on_backup();
  assert.equal(app.lastBackup.filename,'backup.zip'); assert.equal(app.busy,false);
});

test('3.28 ZIP file/entry counts are distinct from byte-level checking progress', () => {
  const app=connected(harness()); let bytes;
  app.show_safe_progress=p=>{bytes=p;};
  for (const unit of ['files','entries']) {
    app.show_zip_progress({unit,phase:unit==='files'?'parsing':'checking',done:3,total:10});
    assert.equal(bytes,undefined);assert.equal(app.zipStatus,'workflow.'+(unit==='files'?'parsing':'checking'));
  }
  const progress={unit:'bytes',phase:'checking',done:540,total:540};app.show_zip_progress(progress);
  assert.equal(bytes,progress);
});

test('3.28 breadcrumbs navigate only actual ancestors, reset stale filters, and respect operation locks', async () => {
  const folders=[];let drives=0;
  const app=connected(harness({vfs_read_folder:async path=>{folders.push(path);return {status:0,data:[]};},vfs_get_drive_list:async()=>{drives++;return {status:0,data:[]};}}));
  app.current_dir='E:/A/Ä %2F';app.searchQuery='old search';app.typeFilter='REG';app.table_selection=[{name:'old'}];
  await app.navigate_breadcrumb('E:/B');assert.equal(folders.length,0);
  app.startupBusy=true;await app.navigate_breadcrumb('E:/A');assert.equal(folders.length,0);
  app.startupBusy=false;await app.navigate_breadcrumb('E:/A');
  assert.deepEqual(folders,['E:/A']);assert.equal(app.searchQuery,'');assert.equal(app.typeFilter,'all');assert.equal(app.table_selection.length,0);
  await app.navigate_breadcrumb('');assert.equal(drives,1);assert.equal(app.current_dir,'');
  app.connected=false;await app.navigate_breadcrumb('E:/');assert.equal(folders.length,1);
});

test('3.28 page sizing bounds rendering, clears hidden selections and cannot change during a transfer', () => {
  const app=connected(harness());app.tableData=Array.from({length:120},(_,i)=>({name:String(i),type:'REG'}));
  app.table_selection=[app.tableData[0]];app.page=2;app.set_page_size('25');
  assert.equal(app.pagedRows.length,25);assert.equal(app.page,1);assert.equal(app.table_selection.length,0);
  app.pendingUploads=1;app.set_page_size(50);assert.equal(app.pageSize,25);
  app.pendingUploads=0;app.set_page_size(50000);assert.equal(app.pageSize,100);
});

test('3.28 startup report opens the reusable local export preview and generic export resets its filename', () => {
  const h=harness(), app=connected(h), downloads=diagnosticDownloadProbe(h);
  const report={reportSchema:1,observedAt:'2026-10-27T12:00:00.000Z',startup:{phaseMask:1}};
  app.open_startup_report(report);
  assert.equal(app.diagnosticsFilename,'Allmiibo-Startdiagnose-3.48.2.json');
  assert.equal(app.diagnosticsDialog,true);assert.equal(downloads.length,0);
  assert.equal(JSON.parse(app.diagnosticsJson).observedAt,report.observedAt);
  app.save_diagnostics();assert.equal(app.diagnosticsFilename,'Allmiibo-Diagnose-3.48.2.json');
  const previous=app.diagnosticsJson;app.connected=false;app.open_startup_report(report);
  assert.equal(app.diagnosticsJson,previous);
});
test('3.25 active backup exposes actual aggregate percent/file counts and never presents its cache as interrupted',async()=>{
  const gate=deferred(),state={rootPath:'E:/',files:119,bytes:63652,busy:true};let progress;
  const h=harness({createBackupCheckpoint:()=>({summary:()=>({...state}),clear(){}}),createBackup:async options=>{progress=options.onProgress;await gate.promise;state.busy=false;throw Error('interrupted')}}),app=connected(h);
  const pending=app.on_backup();progress({phase:'reading',path:'E:/tags/one',bytesDone:63652,bytesTotal:687555,filesDone:119,filesTotal:1131});
  assert.equal(app.transferPercent,9);assert.equal(app.transfer.filesDone,119);assert.equal(app.transfer.filesTotal,1131);assert.equal(app.backupCanResume,false);
  progress({phase:'reading',path:'E:/tags/two',bytesDone:63653,bytesTotal:687555,filesDone:119,filesTotal:1131});assert.equal(app.transferPercent,9);
  gate.resolve();await pending;assert.equal(app.backupCanResume,true);assert.equal(app.backupResumeInfo.files,119);
  assert.match(descriptor.template.content,/v-if="backupCanResume"/);assert.match(descriptor.template.content,/transferPercent }}%/);
});

test('ZIP backup countdown ticks across filenames and clears on interruption', async () => {
  const gate=deferred(); let emit;
  const h=harness({createBackup:async options=>{emit=options.onProgress;await gate.promise;throw Error('interrupted')}});
  const app=connected(h);
  const job=app.on_backup();
  assert.equal(app.transfer.total,null);
  emit({phase:'reading',path:'E:/third',bytesDone:1080,bytesTotal:5400,filesDone:2,filesTotal:10,
    timing:{jobStartedAt:0,startedAt:1000,updatedAt:5000,completed:2,total:10}});
  app.readClock=5000;
  assert.equal(app.backupReadTime.remainingSeconds,16);
  app.readClock=6000;
  assert.equal(app.backupReadTime.remainingSeconds,15);
  app.readClock=14000;
  assert.equal(app.backupReadTime.remainingSeconds,null);
  assert.equal(app.backupReadTime.waiting,true);
  gate.resolve(); await job;
  assert.equal(app.backupReadTime,null);
});

test('cancelled backup cannot replace the prior complete backup or strand the UI', async () => {
  const read = deferred(); let signal;
  const h = harness({ createBackup: async options => { signal = options.signal; await read.promise; if (signal.aborted) throw new Error('Aborted'); } });
  const app = connected(h); app.lastBackup = { filename: 'prior.zip', sessionGeneration: app.sessionGeneration,
    manifest: { files: 1, bytes: 2, resume: { reusedFiles: 0, reusedBytes: 0 } } };
  assert.equal(app.backupReadSummary.freshFiles, 1);
  const pending = app.on_backup(); assert.equal(app.busy, true); app.cancel_transfer();
  assert.equal(app.backupReadSummary, null);
  assert.equal(signal.aborted, true); assert.equal(app.cancellingBackup, true);
  read.resolve(); await pending;
  assert.equal(app.lastBackup.filename, 'prior.zip'); assert.equal(app.backupReadSummary, null);
  assert.equal(app.busy, false); assert.equal(h.messages.length, 0);
});

test('old upload-close confirmation never disconnects a new connection', async () => {
  const dialog = deferred(), h = harness(), app = connected(h);
  let closed = 0, cleared = 0;
  app.pendingUploads = 1; app.$confirm = () => dialog.promise;
  app.$refs.upload.clearFiles = () => { ++cleared; };
  const pending = app.on_upload_diag_close(() => { ++closed; });
  app.on_ble_disconnected(); app.connected = true; app.current_dir = 'E:/';
  dialog.resolve(); await pending;
  assert.equal(h.disconnects(), 0); assert.equal(cleared, 0); assert.equal(closed, 0);
  assert.equal(app.connected, true);
});

test('new uploads do not wait for an old-session replacement dialog', async () => {
  const dialog = deferred(); let writes = 0;
  const h = harness({ vfs_read_folder: async () => ({ status: 0, data: [file('old')] }),
    vfs_helper_write_file(path, file, progress, yes) { ++writes; yes(); } }), app = connected(h);
  app.replaceUploads = true; app.verifyUploads = false; app.$confirm = () => dialog.promise;
  const old = app.on_upload_request({ file: uploadFile('old') }), rejected = assert.rejects(old, /sessionChanged/);
  await new Promise(setImmediate);
  app.on_ble_disconnected(); app.connected = true; app.current_dir = 'E:/';
  h.proto.vfs_read_folder = async () => ({ status: 0, data: [] });
  let newComplete = false;
  const next = app.on_upload_request({ file: uploadFile('new') }).then(() => { newComplete = true; });
  await new Promise(setImmediate);
  assert.equal(writes, 1); assert.equal(newComplete, true); assert.equal(app.pendingUploads, 0);
  dialog.resolve(); await rejected; await next;
  assert.equal(writes, 1); assert.equal(app.pendingUploads, 0);
});

test('offline preview supports search and pagination but cannot perform device operations', async () => {
  const h = harness(), app = h.instance;
  const { toolsGerman, toolsEnglish } = await import('../src/i18n/tools.js');
  app.$t = key => (app.$i18n.locale === 'de_DE' ? toolsGerman : toolsEnglish)[key.slice(6)] || key;
  app.toggle_preview();
  assert.equal(app.demoMode, true); assert.equal(app.connected, false);
  assert.equal(app.tableData.length, 245); assert.equal(app.pageCount, 3);
  app.change_page(2); assert.equal(app.pagedRows.length, 100);
  app.searchQuery = 'Demo-Ordner'; app.on_filter_change(); assert.equal(app.filteredRows.length, 10);
  app.apply_language({ mode: 'en', locale: 'en' });
  app.searchQuery = 'Demo-folder'; assert.equal(app.filteredRows.length, 10);
  assert.equal(app.tableData[4].name, 'Demo-file-005.bin');
  assert.equal(app.tableData[4].notes, toolsEnglish.previewData);
  assert.equal(app.tableData[1].name, '01-Demo-Mario.bin');
  assert.equal(app.btn_disabled(), true);
  await app.on_backup(); await app.on_btn_remove(); await app.on_btn_new_folder();
  assert.equal(app.busy, false); assert.equal(h.messages.length, 0);
  app.on_btn_ble_connect();
  assert.equal(app.demoMode, false); assert.equal(app.tableData.length, 0); assert.equal(app.connecting, true);
});

test('changing the interface language refreshes drive information and diagnostic names without reading files or translating user notes', async () => {
  const { default: i18n } = await import('../src/i18n/index.js');
  let reads = 0;
  const h = harness({ vfs_get_drive_list: async () => { ++reads; return driveReply(512); } });
  const app = connected(h);
  app.$t = (key, values = {}) => i18n.global.t(key, values, { locale: app.$i18n.locale });
  await app.reload_drive();
  assert.equal(app.tableData[0].size, '512 B frei von 4.00 KB');
  app.apply_language({ mode: 'en', locale: 'en' });
  assert.equal(app.tableData[0].size, '512 B free of 4.00 KB');
  assert.equal(reads, 1);
  const original = { type: 'REG', name: 'Meine Figur.bin', notes: 'Mein Spielstand' };
  app.tableData = [original, { type: 'REG', name: 'problem.bin', metadataValid: false, notes: '' }];
  app.apply_language({ mode: 'en', locale: 'en' });
  assert.equal(app.tableData[0].name, 'Meine Figur.bin');
  assert.equal(app.tableData[0].notes, 'Mein Spielstand');
  assert.match(app.tableData[1].notes, /unknown metadata/);
  app.open_startup_report({ reportSchema: 1 });
  assert.equal(app.diagnosticsFilename, 'Allmiibo-Startup-diagnostics-' + require('../package.json').version + '.json');
  app.save_diagnostics();
  assert.equal(app.diagnosticsFilename, 'Allmiibo-Diagnostics-' + require('../package.json').version + '.json');
});

test('an oversized upload reports the per-file limit before queuing or reading the device', async () => {
  const { default: i18n } = await import('../src/i18n/index.js');
  const app = connected(harness());
  app.$t = key => i18n.global.t(key, {}, { locale: 'en' });
  const file = { name: 'figure.bin', size: 2 * 1024 * 1024 + 1 };
  await assert.rejects(app.on_upload_request({ file }), /2 MiB per file/);
  assert.equal(app.pendingUploads, 0);
  for (const locale of i18n.global.availableLocales) {
    assert.ok(i18n.global.te('upload.fileSizeLimit', locale), locale);
  }
});

const driveReply = (free, extra = {}) => ({ status: 0, data: [
  { label: 'E', name: 'External', status: 0, total_size: 4096, free_size: free, ...extra }
] });

function browserSave(h) {
  const blobs = [], clicks = [], removed = [], revoked = [];
  let failure = null;
  h.window.URL = {
    createObjectURL(blob) {
      if (failure === 'create') throw new Error('Injected object URL failure');
      blobs.push(blob); return 'blob:test-' + blobs.length;
    },
    revokeObjectURL(url) { revoked.push(url); }
  };
  h.document.body = { appendChild() {} };
  h.document.createElement = tag => {
    assert.equal(tag, 'a');
    return { style: {}, click() {
      if (failure === 'click') throw new Error('Injected browser save failure');
      clicks.push({ href: this.href, filename: this.download });
    }, remove() { removed.push(this.href); } };
  };
  return { blobs, clicks, removed, revoked, failAt(value) { failure = value; } };
}

test('3.14 upload refreshes drive space before source hashing or any write', async () => {
  const calls = [];
  const h = harness({
    vfs_read_folder: async () => { calls.push('list'); return { status: 0, data: [] }; },
    vfs_get_drive_list: async () => { calls.push('drives'); return driveReply(3); },
    vfs_helper_write_file(path, source, progress, yes) { calls.push('write'); yes(); },
    vfs_helper_read_file(path, yes) { calls.push('readback'); yes(Uint8Array.from([1, 2, 3]).buffer); }
  }), app = connected(h);
  app.driveInfo = [{ label: 'E', status: 0, totalBytes: 4096, freeBytes: 0 }];
  await app.on_upload_request({ file: { name: 'new.bin', size: 3,
    async arrayBuffer() { calls.push('hash-source'); return Uint8Array.from([1, 2, 3]).buffer; } } });
  assert.deepEqual(calls, ['list', 'drives', 'hash-source', 'write', 'readback']);
  assert.equal(app.driveInfo[0].freeBytes, 3); assert.equal(app.pendingUploads, 0);
  assert.equal(app.lastTransfer.status, 'success'); assert.equal(app.lastTransfer.verified, true);
});

test('3.14 insufficient fresh storage rejects before source read or target mutation', async () => {
  let writes = 0, sourceReads = 0;
  const h = harness({ vfs_get_drive_list: async () => driveReply(2),
    vfs_helper_write_file() { ++writes; } }), app = connected(h);
  app.driveInfo = [{ label: 'E', status: 0, totalBytes: 4096, freeBytes: 4096 }];
  await assert.rejects(app.on_upload_request({ file: { name: 'new.bin', size: 3,
    async arrayBuffer() { ++sourceReads; return new ArrayBuffer(3); } } }), /info.notEnoughSpace/);
  assert.equal(writes, 0); assert.equal(sourceReads, 0); assert.equal(app.pendingUploads, 0);
  assert.equal(app.busy, false); assert.equal(app.lastTransfer.status, 'failed');
});

test('3.14 unavailable, missing and invalid drive replies never reach upload OPEN', async () => {
  for (const [reply, error] of [
    [driveReply(4096, { status: 1 }), /info.driveUnavailable/],
    [driveReply(4096, { label: 'I' }), /info.driveUnavailable/],
    [{ status: 7 }, /7/],
    [driveReply(4097), /Invalid drive information/]
  ]) {
    let writes = 0;
    const h = harness({ vfs_get_drive_list: async () => reply,
      vfs_helper_write_file() { ++writes; } }), app = connected(h);
    app.verifyUploads = false;
    await assert.rejects(app.on_upload_request({ file: uploadFile('new.bin') }), error);
    assert.equal(writes, 0); assert.equal(app.pendingUploads, 0); assert.equal(app.busy, false);
  }
});

test('3.14 queued uploads recheck changed free space and recover after a rejected entry', async () => {
  let free = 5, probes = 0;
  const written = [], h = harness({
    vfs_get_drive_list: async () => { ++probes; return driveReply(free); },
    vfs_helper_write_file(path, source, progress, yes) { written.push(path); free -= source.size; yes(); }
  }), app = connected(h);
  app.verifyUploads = false;
  const first = app.on_upload_request({ file: uploadFile('first') });
  const second = app.on_upload_request({ file: uploadFile('second') });
  const rejected = assert.rejects(second, /info.notEnoughSpace/);
  const third = app.on_upload_request({ file: { name: 'third', size: 1 } });
  await first; await rejected; await third;
  assert.deepEqual(written, ['E:/first', 'E:/third']); assert.equal(probes, 3);
  assert.equal(app.pendingUploads, 0); assert.equal(free, 1);
});

test('3.14 confirmed replacement permits reclaimed file bytes only after a fresh space query', async () => {
  const calls = [], h = harness({
    vfs_read_folder: async () => ({ status: 0, data: [{ name: 'replace.bin', type: 0, size: 3 }] }),
    vfs_get_drive_list: async () => { calls.push('drives'); return driveReply(2); },
    vfs_helper_write_file(path, source, progress, yes) { calls.push('write'); yes(); }
  }), app = connected(h);
  app.replaceUploads = true; app.verifyUploads = false;
  app.$confirm = async () => { calls.push('confirm'); };
  await app.on_upload_request({ file: { name: 'replace.bin', size: 5 } });
  assert.deepEqual(calls, ['confirm', 'drives', 'write']); assert.equal(app.pendingUploads, 0);
});

test('3.14 disconnect during storage preflight cannot write into a replacement session', async () => {
  const pendingDrive = deferred(); let writes = 0;
  const h = harness({ vfs_get_drive_list: () => pendingDrive.promise,
    vfs_helper_write_file() { ++writes; } }), app = connected(h);
  app.verifyUploads = false;
  const upload = app.on_upload_request({ file: uploadFile('new.bin') });
  const rejected = assert.rejects(upload, /sessionChanged/);
  await new Promise(setImmediate);
  app.on_ble_disconnected(); app.connected = true; app.current_dir = 'E:/';
  pendingDrive.resolve(driveReply(4096)); await rejected;
  assert.equal(writes, 0); assert.equal(app.pendingUploads, 0); assert.equal(app.driveInfo.length, 0);
});

test('3.14 download keeps exact bytes and waits for an explicit browser save', async () => {
  let reads = 0;
  const h = harness({ vfs_helper_read_file(path, yes, no, done, options) {
    ++reads; assert.equal(path, 'E:/download.bin'); assert.equal(options.max_bytes, 3);
    yes(Uint8Array.from([1, 2, 3]).buffer); done(); return Promise.resolve();
  } }), app = connected(h), browser = browserSave(h);
  await app.handle_name_click(0, { name: 'download.bin', type: 'REG', sizeBytes: 3 });
  assert.equal(app.pendingDownloads, 0); assert.equal(browser.blobs.length, 0);
  assert.equal(app.lastDownload.filename, 'download.bin');
  assert.deepEqual([...new Uint8Array(await app.lastDownload.blob.arrayBuffer())], [1, 2, 3]);
  app.on_ble_disconnected();
  app.save_last_download();
  assert.equal(reads, 1); assert.equal(browser.clicks[0].filename, 'download.bin');
  assert.equal(browser.blobs[0], app.lastDownload.blob);
  assert.equal(h.timeouts.length, 1); assert.equal(h.timeouts[0].delay, 30000);
  h.timeouts[0].callback(); assert.deepEqual(browser.revoked, ['blob:test-1']);
});

test('3.14 failed browser save is visible and retry preserves the downloaded Blob without another BLE read', async () => {
  for (const failure of ['create', 'click']) {
    let reads = 0;
    const h = harness({ vfs_helper_read_file(path, yes, no, done) {
      ++reads; yes(Uint8Array.from([5, 6]).buffer); done(); return Promise.resolve();
    } }), app = connected(h), browser = browserSave(h);
    await app.handle_name_click(0, { name: 'retry.bin', type: 'REG', sizeBytes: 2 });
    const retained = app.lastDownload;
    browser.failAt(failure);
    assert.doesNotThrow(() => app.save_last_download());
    assert.equal(h.messages.length, 1); assert.equal(h.messages[0].type, 'error');
    assert.match(h.messages[0].message, /Injected/);
    assert.equal(app.lastDownload, retained); assert.equal(browser.clicks.length, 0);
    browser.failAt(null); app.save_last_download();
    assert.equal(browser.clicks.length, 1); assert.equal(reads, 1);
    assert.equal(app.lastDownload, retained); assert.equal(app.pendingDownloads, 0);
    assert.deepEqual([...new Uint8Array(await retained.blob.arrayBuffer())], [5, 6]);
  }
});

test('3.14 short download does not replace an earlier complete file', async () => {
  const h = harness({ vfs_helper_read_file(path, yes, no, done) {
    yes(Uint8Array.from([9]).buffer); done(); return Promise.resolve();
  } }), app = connected(h), browser = browserSave(h);
  const previous = { blob: new Blob(['previous']), filename: 'previous.bin' }; app.lastDownload = previous;
  await app.handle_name_click(0, { name: 'short.bin', type: 'REG', sizeBytes: 3 });
  assert.equal(app.lastDownload, previous); assert.equal(browser.blobs.length, 0);
  assert.match(h.messages[0].message, /tools.sizeChanged/); assert.equal(app.lastTransfer.status, 'failed');
  assert.equal(app.pendingDownloads, 0);
});

test('3.14 backup save failures retain the archive and permit a local retry', async () => {
  for (const failure of ['create', 'click']) {
    let backups = 0;
    const h = harness({ createBackup: async () => {
      ++backups; return { blob: new Blob(['zip bytes']), filename: 'backup.zip', manifest: { files: 1, bytes: 9 } };
    } }), app = connected(h), browser = browserSave(h);
    await app.on_backup(); const retained = app.lastBackup;
    assert.equal(browser.blobs.length, 0); h.messages.length = 0;
    browser.failAt(failure); assert.doesNotThrow(() => app.save_last_backup());
    assert.equal(h.messages.length, 1); assert.equal(h.messages[0].type, 'error');
    assert.match(h.messages[0].message, /Injected/); assert.equal(app.lastBackup, retained);
    browser.failAt(null); app.save_last_backup();
    assert.equal(browser.clicks.length, 1); assert.equal(browser.clicks[0].filename, 'backup.zip');
    assert.equal(app.lastBackup, retained); assert.equal(backups, 1); assert.equal(app.busy, false);
  }
});

const zipArchiveFixture = () => Object.freeze({ rootPath:'E:/source', entries:[], fileCount:3, directoryCount:0, byteCount:9 });
const zipPlanFixture = () => Object.freeze({ rootPath:'E:/', sourceRoot:'E:/source', deviceKey:'private-test-device', entries:[
  {targetPath:'E:/new.bin',status:'add',size:3,type:'file'},
  {targetPath:'E:/old.bin',status:'change',size:3,type:'file'},
  {targetPath:'E:/locked.bin',status:'blocked',reason:'READONLY',size:3,type:'file'},
  {targetPath:'E:/same.bin',status:'same',size:3,type:'file'}
],summary:{add:1,change:1,blocked:1,same:1} });
function readyZip(app, plan=zipPlanFixture()) {
  app.open_zip(); app._zipArchive=zipArchiveFixture(); app.zipPlan=plan;
  app._zipGeneration=app.sessionGeneration; app._zipDeviceKey='private-test-device'; app.zipSelected=['E:/new.bin'];
  return plan;
}

test('3.22 ZIP selection validates locally without device writes and never bypasses busy/disconnected guards', async()=>{
  let loads=0, writes=0, options;
  const gate=deferred(), archive=zipArchiveFixture();
  const h=harness({loadBackupZip:async(input,opts)=>{loads++;options=opts;assert.equal(input.name,'backup.zip');return gate.promise;},vfs_create_folder(){writes++;},vfs_helper_write_file(){writes++;}}),app=h.instance;
  const event={target:{files:[{name:'backup.zip'}],value:'selected'}};
  await app.on_zip_file(event);app.connected=true;app.current_dir='E:/';app.open_zip();app.pendingDownloads=1;
  await app.on_zip_file(event);assert.equal(loads,0);app.pendingDownloads=0;
  const pending=app.on_zip_file(event);assert.equal(loads,1);assert.equal(app.busy,true);assert.equal(event.target.value,'');
  options.onProgress({phase:'parsing',unit:'files',done:1,total:3});assert.equal(app.zipStatus,'workflow.parsing');
  gate.resolve(archive);await pending;
  assert.equal(app._zipArchive,archive);assert.equal(app.zipFilename,'backup.zip');assert.equal(app.zipPlan,null);
  assert.equal(app.zipStatus,'workflow.validated');assert.equal(writes,0);assert.equal(app.busy,false);
});

test('3.22 ZIP preview uses a captured root and read-only adapters; only additions are selected automatically', async()=>{
  let observed, writes=0;
  const plan=zipPlanFixture(),h=harness({previewZipImport:async options=>{observed=options;await options.readDirectory('E:/');return plan;},vfs_helper_write_file(){writes++;}}),app=connected(h);
  app.open_zip();app._zipArchive=zipArchiveFixture();await app.preview_zip();
  assert.equal(observed.rootPath,'E:/');assert.equal(observed.deviceKey,'private-test-device');assert.equal(observed.archive,app._zipArchive);
  assert.deepEqual(Array.from(app.zipSelected),['E:/new.bin']);assert.equal(app.zipPlan,plan);assert.equal(writes,0);assert.equal(app.busy,false);
  assert.equal(typeof observed.readFile,'function');assert.equal(app._zipGeneration,app.sessionGeneration);
});

test('3.22 ZIP confirmation snapshots selected target paths and the confirmed plan root', async()=>{
  const confirmation=deferred();let executed;
  const h=harness({executeZipImport:async options=>{executed=options;return{completed:1,recoveryFiles:[]};}}),app=connected(h),plan=readyZip(app);
  app.$confirm=()=>confirmation.promise;
  const pending=app.run_zip();assert.equal(app.dialogPending,true);assert.equal(app.busy,true);
  app.zipSelected=['E:/old.bin'];app.zipRoot='I:/';app.current_dir='E:/elsewhere';
  confirmation.resolve();await pending;
  assert.deepEqual(Array.from(executed.selectedPaths),['E:/new.bin']);assert.equal(executed.plan,plan);assert.equal(executed.plan.rootPath,'E:/');
  assert.equal(app.zipPlan,null);assert.equal(app.zipSelected.length,0);assert.equal(app.lastTransfer.verified,true);
});

test('3.22 ZIP rejects a replaced device or stale generation before confirmation or execution', async()=>{
  for(const change of ['device','generation']){
    let confirmations=0,executions=0;const override={deviceKey:'private-test-device',executeZipImport:async()=>{executions++;}};
    const h=harness(override),app=connected(h);readyZip(app);app.$confirm=async()=>{confirmations++;};
    if(change==='device')override.deviceKey='other-device';else app.sessionGeneration++;
    await app.run_zip();assert.equal(executions,0);assert.equal(confirmations,0);assert.equal(app.zipPlan,null);assert.equal(app.zipDialog,false);
  }
});

test('3.22 ZIP confirmation cannot execute after a plan replacement or disconnect', async()=>{
  for(const change of ['plan','session']){
    let executions=0;const gate=deferred(),h=harness({executeZipImport:async()=>{executions++;}}),app=connected(h);readyZip(app);
    app.$confirm=()=>gate.promise;const pending=app.run_zip();
    if(change==='plan')app.zipPlan=zipPlanFixture();else{app.on_ble_disconnected();app.connected=true;app.pendingDownloads=1;}
    gate.resolve();await pending;assert.equal(executions,0);
    if(change==='session')assert.equal(app.pendingDownloads,1);
  }
});

test('3.22 cancelling the ZIP confirmation preserves the preview without importing', async()=>{
  let executions=0;const h=harness({executeZipImport:async()=>{executions++;}}),app=connected(h),plan=readyZip(app);
  app.$confirm=async()=>{throw'cancel';};await app.run_zip();
  assert.equal(executions,0);assert.equal(app.zipPlan,plan);assert.equal(app.busy,false);assert.equal(h.messages.length,0);
});

test('3.22 late ZIP parse and preview callbacks cannot repopulate or unlock a replacement session', async()=>{
  for(const phase of ['parse','preview']){
    let observed;const gate=deferred(),h=harness({loadBackupZip:async(_file,options)=>{observed=options;return gate.promise;},previewZipImport:async options=>{observed=options;return gate.promise;}}),app=connected(h);
    app.open_zip();app._zipArchive=zipArchiveFixture();
    const pending=phase==='parse'?app.on_zip_file({target:{files:[{name:'private.zip'}],value:'x'}}):app.preview_zip();
    app.on_ble_disconnected();app.connected=true;app.zipBusy=true;app.zipStatus='new-session';const newController=new AbortController();app._zipController=newController;
    observed.onProgress({phase:phase==='parse'?'parsing':'checking',done:9,total:9});
    gate.resolve(phase==='parse'?zipArchiveFixture():zipPlanFixture());await pending;
    assert.equal(app._zipArchive,null);assert.equal(app.zipPlan,null);assert.equal(app.zipFilename,'');assert.equal(app.zipStatus,'new-session');
    assert.equal(app.zipBusy,true);assert.equal(app._zipController,newController);assert.equal(newController.signal.aborted,false);
  }
});

test('3.22 old ZIP execution failure retains recovery evidence without unlocking a new session', async()=>{
  let observed;const gate=deferred(),h=harness({executeZipImport:async options=>{observed=options;return gate.promise;}}),app=connected(h);readyZip(app);
  const pending=app.run_zip();await new Promise(setImmediate);
  app.on_ble_disconnected();app.connected=true;app.pendingDownloads=1;app.set_transfer({phase:'download',path:'new-session',done:3,total:9});
  observed.onProgress({phase:'uploading',done:8,total:9,path:'old-session'});
  gate.reject(Object.assign(Error('lost'),{importProgress:{completedPaths:[],createdFolders:[],recoveryFiles:[{path:'E:/private-recovery',role:'stage',state:'possible'}]}}));await pending;
  assert.equal(app.pendingDownloads,1);assert.equal(app.transfer.path,'new-session');assert.equal(app.transfer.done,3);assert.equal(app.zipPlan,null);
  assert(app.recoveryNotes.some(record=>record.includes('private-recovery')));
});

test('3.22 partial ZIP failure invalidates the preview and keeps confirmed recovery evidence', async()=>{
  const h=harness({executeZipImport:async()=>{throw Object.assign(Error('second write failed'),{importProgress:{completedPaths:['E:/new.bin'],createdFolders:[],recoveryFiles:[{path:'E:/old-backup',role:'backup',state:'possible'}]}});}}),app=connected(h);readyZip(app);
  await app.run_zip();assert.equal(app.zipPlan,null);assert.equal(app.zipSelected.length,0);assert.equal(app.zipStatus,'workflow.partial');
  assert.equal(app.lastTransfer.status,'failed');assert.equal(app.busy,false);assert.equal(app.recoveryNotes.length,1);
});

test('3.22 cancellation during ZIP commit is cooperative and keeps UI/device lock until the engine settles', async()=>{
  let observed;const gate=deferred(),h=harness({executeZipImport:async options=>{observed=options;return gate.promise;}}),app=connected(h);readyZip(app);
  const pending=app.run_zip();await new Promise(setImmediate);assert.equal(app.connectionDisconnectLocked,true);
  app.cancel_transfer();assert.equal(observed.signal.aborted,true);assert.equal(app.busy,true);assert.equal(h.disconnects(),0);
  let closed=false;app.close_zip(()=>{closed=true;});assert.equal(closed,false);assert.equal(app.zipDialog,true);
  gate.reject(Object.assign(Error('cancelled after checked commit'),{name:'AbortError',importProgress:{completedPaths:['E:/new.bin'],createdFolders:[],recoveryFiles:[]}}));await pending;
  assert.equal(app.busy,false);assert.equal(app.lastTransfer.status,'cancelled');assert.equal(app.zipPlan,null);assert.equal(h.messages.length,0);
});

test('3.22 backup checkpoint survives disconnect, prevents resume while busy, and is reused after settling', async()=>{
  const gate=deferred();let calls=0,created=0,lastOptions;
  const state={files:2,bytes:1080,busy:false,rootPath:'E:/',firmwareVersion:'2.21.0-DE3.24'};
  const checkpoint={summary:()=>({...state}),clear(){state.files=0;state.bytes=0;}};
  const h=harness({createBackupCheckpoint:()=>{created++;return checkpoint;},createBackup:async options=>{calls++;lastOptions=options;if(calls===1){state.busy=true;options.onProgress({phase:'reading',bytesDone:1080,bytesTotal:2160});await gate.promise;state.busy=false;throw Error('interrupted');}return{blob:new Blob(['zip']),filename:'resumed.zip',manifest:{files:2,bytes:1080}};}}),app=connected(h);
  app.firmwareVersion=state.firmwareVersion;const pending=app.on_backup();assert.equal(app.backupResumeInfo.files,2);
  app.on_ble_disconnected();assert.equal(lastOptions.signal.aborted,true);assert.equal(app._backupCheckpoint,checkpoint);assert.equal(app.backupResumeInfo.busy,true);
  app.connected=true;app.current_dir='';app.firmwareVersion=state.firmwareVersion;
  await app.on_backup(true);assert.equal(calls,1);app.discard_backup_checkpoint();assert.equal(app._backupCheckpoint,checkpoint);
  gate.resolve();await pending;assert.equal(app.backupResumeInfo.busy,false);assert.equal(app.backupResumeInfo.files,2);
  await app.on_backup(true);assert.equal(calls,2);assert.equal(created,1);assert.equal(lastOptions.checkpointState,checkpoint);assert.equal(lastOptions.deviceKey,'private-test-device');
  assert.equal(app.lastBackup.filename,'resumed.zip');assert.equal(lastOptions.rootPath,'E:/');
});

test('backup resumes the saved root regardless of navigation and rejects another device or firmware before BLE reads', async()=>{
  const {createBackup,createBackupCheckpoint}=await import('../src/lib/backup.js');
  for(const change of ['device','firmware','root']){
    let reads=0;const override={deviceKey:'private-test-device',createBackup,createBackupCheckpoint,vfs_read_folder:async()=>{reads++;return{status:0,data:[]};}};
    const h=harness(override),app=connected(h);app.firmwareVersion='2.21.0-DE3.24';
    app._backupCheckpoint=createBackupCheckpoint({rootPath:'E:/',deviceKey:'private-test-device',firmwareVersion:app.firmwareVersion,preserveLegacyNames:true});
    app.refresh_backup_checkpoint();
    if(change==='device')override.deviceKey='different';else if(change==='firmware')app.firmwareVersion='other';else app.current_dir='E:/other';
    await app.on_backup(true);assert.equal(app.busy,false);
    if(change==='root'){assert.equal(reads,2);assert.equal(app.lastBackup.manifest.rootPath,'E:/');continue;}
    assert.equal(reads,0);assert.equal(app.lastBackup,null);
    assert.equal(h.messages.at(-1).message,'workflow.checkpointIdentity');
  }
});

test('reconnect from the drive list validates identical-length changed files through the UI and includes their current contents', async()=>{
  const {createBackup,createBackupCheckpoint}=await import('../src/lib/backup.js');
  const crypto=require('node:crypto'), hash=data=>crypto.createHash('sha256').update(data).digest('hex');
  const meta={valid:true,notes:'',flags:{raw:0,hide:false,readonly:false},amiibo:{head:0,tail:0}};
  const source=new Map([['E:/a.bin',Uint8Array.of(1,2)],['E:/b.bin',Uint8Array.of(3,4)]]);
  const digestCalls=[], transfers=[];
  let interrupt=true,app;
  const h=harness({createBackup,createBackupCheckpoint,
    vfs_read_folder:async path=>{assert.equal(path,'E:/');return{status:0,data:[...source].map(([name,b])=>({name:name.slice(3),type:0,size:b.length,meta}))};},
    vfs_backup_digest:async(path, size, firmware)=>{
      digestCalls.push(path);assert.equal(size,2);assert.equal(firmware,'2.22.0-DE3.66');return hash(source.get(path));
    },
    vfs_helper_read_file(path,resolve,reject){
      if(interrupt && path==='E:/b.bin'){app.on_ble_disconnected();reject(Error('disconnected'));return;}
      transfers.push(path);resolve(source.get(path).buffer);
    }
  });
  app=connected(h);app.firmwareVersion='2.22.0-DE3.66';await app.on_backup();
  assert.equal(app.connected,false);assert.equal(app.backupResumeInfo.files,1);
  assert.equal(app.backupResumeMatches,false);source.get('E:/a.bin').fill(7);
  interrupt=false;app.connected=true;app.current_dir='';app.firmwareVersion='2.22.0-DE3.66';
  assert.equal(app.backupResumeMatches,true);
  await app.on_backup(true);assert.equal(app.lastBackup.manifest.files,2);
  const first=app.lastBackup.manifest.entries.find(file=>file.sourcePath==='E:/a.bin');
  assert.equal(first.sha256,hash(Uint8Array.of(7,7)));
  assert.deepEqual({...app.backupReadSummary},{freshFiles:2,freshBytes:4,reusedFiles:0,reusedBytes:0});
  assert.deepEqual(digestCalls,['E:/a.bin']);assert.deepEqual(transfers,['E:/a.bin','E:/a.bin','E:/b.bin']);
});

test('3.22 completed backup drops the resume byte cache but keeps its savable complete archive', async()=>{
  const {createBackup,createBackupCheckpoint}=await import('../src/lib/backup.js');
  const meta={valid:true,notes:'note',flags:{raw:0,hide:false,readonly:false},amiibo:{head:1,tail:2}};
  const h=harness({createBackup,createBackupCheckpoint,
    vfs_read_folder:async()=>({status:0,data:[{name:'a.bin',type:0,size:2,meta}]}),
    vfs_helper_read_file(_path,yes){yes(Uint8Array.from([1,2]).buffer);}}),app=connected(h);
  app.firmwareVersion='2.21.0-DE3.24';await app.on_backup();
  assert.equal(app.lastBackup.manifest.files,1);assert.equal(app.lastBackup.manifest.completed,true);assert(app.lastBackup.blob.size>2);
  assert.deepEqual({...app.backupReadSummary},{freshFiles:1,freshBytes:2,reusedFiles:0,reusedBytes:0});
  assert.equal(app._backupCheckpoint?.summary().files||0,0);assert.equal(app._backupCheckpoint?.summary().bytes||0,0);
  assert.equal(app.backupResumeInfo?.files||0,0);assert.equal(app.backupResumeInfo?.busy||false,false);
  let prevented=0;app.on_before_unload({preventDefault(){prevented++;}});assert.equal(prevented,1);
  assert.equal(app.lastBackup.savedConfirmed,false);
});

test('ready ZIP panel renders fresh and reused counts and bytes in both languages for this session', async () => {
  const Vue = require('vue'), { renderToString } = require('@vue/server-renderer');
  const { compile } = require('@vue/compiler-dom');
  const { createI18n } = await import('vue-i18n');
  const { toolsEnglish, toolsGerman } = await import('../src/i18n/tools.js');
  const section = descriptor.template.content.match(/<section v-if="lastBackup"[^>]*>[\s\S]*?<\/section>/)[0];
  const render = new Function('Vue', compile(section, { mode: 'function', prefixIdentifiers: true }).code)(Vue);
  const manifest = { files: 3, bytes: 12, resume: { reusedFiles: 1, reusedBytes: 5 } };
  const h = harness({ createBackup: async () => ({ filename: 'resume.zip', manifest }) });
  const app = connected(h);
  await app.on_backup();
  const panel = async (locale, tools) => {
    const view = Vue.createSSRApp({ render, data: () => ({ lastBackup: app.lastBackup, backupReadSummary: app.backupReadSummary }),
      methods: { format_size: app.format_size, save_last_backup() {}, confirm_backup_saved() {} } });
    view.use(createI18n({ legacy: false, locale, messages: { [locale]: { tools, info: { discard: '×' } } } }));
    return renderToString(view);
  };
  let german = await panel('de', toolsGerman);
  assert.match(german, /2 Dateien frisch vom Gerät gelesen \(7 B\)/);
  assert.match(german, /1 Datei nach Prüfsummenvergleich wiederverwendet \(5 B\)/);
  let english = await panel('en', toolsEnglish);
  assert.match(english, /2 files read from the device \(7 B\)/);
  assert.match(english, /1 file reused after checksum verification \(5 B\)/);

  manifest.resume = { reusedFiles: 3, reusedBytes: 12 };
  await app.on_backup();
  english = await panel('en', toolsEnglish);
  assert.match(english, /0 files read from the device \(0 B\)/);
  assert.match(english, /3 files reused after checksum verification \(12 B\)/);
  app.on_ble_disconnected();
  assert.equal(app.backupReadSummary, null);
  german = await panel('de', toolsGerman);
  assert.match(german, /Frühere Sicherung/);
  assert.match(german, /resume\.zip/);
  assert.doesNotMatch(german, /frisch vom Gerät|wiederverwendet/);
});

test('3.22 retained backup cache requires explicit discard confirmation and protects page unload', async()=>{
  let cleared=0,created=0,calls=0;const h=harness({createBackupCheckpoint:()=>{created++;return{summary:()=>({files:0,busy:false}),clear(){}};},createBackup:async()=>{calls++;return{blob:new Blob(['zip']),filename:'new.zip',manifest:{files:0,bytes:0}};}}),app=connected(h);
  const checkpoint={summary:()=>({files:3,bytes:1620,busy:false,rootPath:'E:/'}),clear(){cleared++;}};app._backupCheckpoint=checkpoint;app.refresh_backup_checkpoint();
  let prevented=0;const event={preventDefault(){prevented++;}};app.on_before_unload(event);assert.equal(prevented,1);assert.equal(event.returnValue,'');
  app.$confirm=async()=>{throw'cancel';};await app.on_backup(false);assert.equal(app._backupCheckpoint,checkpoint);assert.equal(cleared+created+calls,0);
  app.$confirm=async()=>{};await app.on_backup(false);assert.equal(cleared,1);assert.equal(created,1);assert.equal(calls,1);
});
const test323 = (name, fn) => test('3.23 ' + name, fn);
test323('direct upload rejects case or Unicode alias before device writes', async()=>{
  for(const [existing,incoming] of [['Mario.bin','mario.bin'],['A\u0308.bin','Ä.bin']]){
    let writes=0; const h=harness({vfs_read_folder:async()=>({status:0,data:[file(existing)]}),vfs_helper_write_file(path,data,progress,yes){writes++;yes();}}),app=connected(h);
    app.verifyUploads=false;app.replaceUploads=true;
    await assert.rejects(app.on_upload_request({file:{name:incoming,size:1},onProgress(){}}));
    assert.equal(writes,0);assert.equal(app.pendingUploads,0);
  }
});
test323('closing idle sync dialog releases selected files and stale plan',()=>{
  const h=harness(),app=connected(h);app.syncDialog=true;app._syncFiles=[{name:'a',size:1048576}];app.syncFileCount=1;app.syncPlan={entries:[]};let closed=0;
  app.close_sync(()=>closed++);assert.equal(closed,1);assert.equal(app.syncDialog,false);assert.equal(app.syncPlan,null);assert.equal(app.syncFileCount,0);assert.equal(app._syncFiles.length,0);
});
test323('add-only selection shortcuts never select changes and respect busy lock',()=>{
  const h=harness(),app=connected(h); const entries=[{status:'add',targetPath:'E:/new'},{status:'change',targetPath:'E:/replace'},{status:'same',targetPath:'E:/same'},{status:'blocked',targetPath:'E:/blocked'}];
  for(const kind of ['zip','sync']){app[kind+'Plan']={entries};app.select_plan(kind,true);assert.deepEqual(Array.from(app[kind+'Selected']),['E:/new']);app.mutating=true;app.select_plan(kind,false);assert.equal(app[kind+'Selected'].length,1);app.mutating=false;app.select_plan(kind,false);assert.equal(app[kind+'Selected'].length,0);}
});
test323('sync local selection can be selected again and active close retains commit lock',()=>{
  const h=harness(),app=connected(h);app.syncDialog=true;const event={target:{files:[{name:'same.bin'}],value:'selected'}};
  app.on_sync_files(event);assert.equal(event.target.value,'');assert.equal(app.syncFileCount,1);
  let aborts=0,closed=0;app.syncing=true;app._syncController={abort(){aborts++;}};app.close_sync(()=>closed++);
  assert.equal(aborts,1);assert.equal(closed,0);assert.equal(app.syncing,true);assert.equal(app.workflowCancelling,true);assert.equal(app._syncFiles.length,1);
});
test323('ZIP cancellation shows pending completion and never disconnects the committing session',()=>{
  const h=harness(),app=connected(h);let aborts=0;app.zipBusy=true;app._zipController={abort(){aborts++;}};
  app.cancel_transfer();assert.equal(aborts,1);assert.equal(app.workflowCancelling,true);assert.equal(app.transferCancelling,true);assert.equal(app.zipStatus,'info.finishingCommit');assert.equal(h.disconnects(),0);assert.equal(app.zipBusy,true);
  app.invalidate_zip();assert.equal(app.workflowCancelling,false);
});
test323('safe progress reaches100 only when engine confirms completion including empty files',()=>{
  const h=harness(),app=connected(h);
  app.show_safe_progress({phase:'verifying',done:540,total:540},'E:/x',540);assert.equal(app.transferStats.complete,false);assert.equal(app.transferPercent,99);
  app.show_safe_progress({phase:'complete',done:540,total:540},'E:/x',540);assert.equal(app.transferStats.complete,true);assert.equal(app.transferPercent,100);
  app.show_safe_progress({phase:'uploading',done:0,total:0},'E:/empty',0);assert.equal(app.transferPercent,0);
  app.show_safe_progress({phase:'complete',done:0,total:0},'E:/empty',0);assert.equal(app.transferPercent,100);
});
test323('quick status distinguishes preview and teardown, and details opening sends no device command',()=>{
  const h=harness(),app=h.instance;assert.equal(app.connectionSummaryKey,'info.disconnected');app.demoMode=true;assert.equal(app.connectionSummaryKey,'tools.previewOpen');app.connecting=true;assert.equal(app.connectionSummaryKey,'conn.connecting');app.disconnecting=true;assert.equal(app.connectionSummaryKey,'info.disconnecting');
  let scrolls=0;app.$refs.devicePanel={open:false,scrollIntoView(){scrolls++;}};app.show_device_panel();assert.equal(app.$refs.devicePanel.open,true);assert.equal(scrolls,1);assert.equal(h.disconnects(),0);
  app.driveInfo=[{label:'E',status:0,freeBytes:300}];app.current_dir='E:/';assert.equal(app.selectedDriveInfo,null);app.connected=true;assert.equal(app.selectedDriveInfo.freeBytes,300);
});
test323('all transfer dialogs contain live progress and reasons are localized',()=>{
  assert.equal((descriptor.template.content.match(/<TransferStatus /g)||[]).length,3);
  const h=harness(),app=h.instance;assert.equal(app.plan_reason('READONLY'),'workflow.READONLY');assert.equal(app.plan_reason('not-safe-to-render'),'workflow.blockedOther');
  assert.match(descriptor.template.content,/transfer && !upload_diag_visible && !zipDialog && !syncDialog/);
});

test('3.25.5 migration restart intent makes the expected disconnect informational without claiming reboot success',async()=>{
 const h=harness({vfs_import_state:async()=>({status:0,data:{ready:true}})}),app=connected(h);h.mount()
 await app.migration_session().restartDevice();assert.equal(app._disconnectIntent.reason,'migration-restart')
 app.on_ble_disconnected();assert.equal(h.notifications.at(-1).type,'info');assert.equal(h.notifications.at(-1).message,'info.migrationRestartDisconnected');assert.equal(app._migrationRestartAttempt,null)
})
test('3.25.5 migration restart rejection and timeout retire intent; a later unrelated disconnect remains an error',async()=>{
 for(const kind of ['reject','timeout']){
  const h=harness({vfs_import_state:async()=>{if(kind==='reject')throw Error('denied');return{status:0,data:{ready:true}}}}),app=connected(h);h.mount()
  if(kind==='reject')await assert.rejects(app.migration_session().restartDevice());else{await app.migration_session().restartDevice();const timer=h.timeouts.find(x=>x.delay===15000);assert(timer);timer.callback()}
  assert.equal(app._migrationRestartAttempt,null);assert.equal(app._disconnectIntent,null);app.on_ble_disconnected();assert.equal(h.notifications.at(-1).type,'error')
 }
})
test('3.25.5 migration restart old timer cannot clear a replacement session intent',async()=>{
 const h=harness({vfs_import_state:async()=>({status:0,data:{ready:true}})}),app=connected(h);h.mount()
 await app.migration_session().restartDevice();const old=h.timeouts.at(-1);app.on_ble_disconnected();app.connected=true;app.sessionGeneration++
 await app.migration_session().restartDevice();const current=app._disconnectIntent;old.callback();assert.equal(app._disconnectIntent,current)
 app.on_ble_disconnected();assert.equal(h.notifications.at(-1).type,'info')
})

test('3.32 device search adapter does not change current listing, selection or filters', async()=>{
 const h=harness({vfs_read_folder:async path=>({status:0,data:[{name:'A.bin',type:0,meta:{}}]})}),app=connected(h);
 const selected={name:'Selected.bin'};app.table_selection=[selected];app.tableData=[selected];app.searchQuery='keep';app.current_dir='E:/Keep';
 const session=app.device_search_session();assert.equal((await session.readDirectory('E:/Other'))[0].name,'A.bin');assert.equal(app.current_dir,'E:/Keep');assert.equal(app.table_selection[0],selected);assert.equal(app.searchQuery,'keep');
 ++app.sessionGeneration;await assert.rejects(session.readDirectory('E:/Other'));
});
test('3.32 search navigation opens containing folder, pages and focuses the exact file without downloading',async()=>{
 const files=Array.from({length:31},(_,i)=>({name:`File${i}.bin`,type:0,meta:{}}));let focused=0;
 const h=harness({vfs_read_folder:async path=>{assert.equal(path,'E:/Tags');return {status:0,data:files};}}),app=connected(h);app.pageSize=25;app.searchQuery='hidden';
 app.$refs.fileWorkspace={querySelectorAll:()=>[{getAttribute:()=> 'File30.bin',focus:()=>focused++,scrollIntoView(){}}]};
 await app.navigate_search_result({name:'File30.bin',path:'E:/Tags/File30.bin',parent:'E:/Tags',type:0,generation:app.sessionGeneration});assert.equal(app.page,2);assert.equal(focused,1);assert.equal(app.searchQuery,'');
});
test('3.32 stale search navigation cannot select another session or accept forged paths',async()=>{
 let reads=0;const h=harness({vfs_read_folder:async()=>{++reads;return {status:0,data:[]};}}),app=connected(h);
 for(const result of [{name:'A',parent:'E:/',path:'E:/A',type:0,generation:99},{name:'../A',parent:'E:/',path:'E:/A',type:0,generation:0}])await app.navigate_search_result(result);
 assert.equal(reads,0);
});
test('direct search download saves the exact remote path once and preserves the current file view', async () => {
  const reads = [];
  const h = harness({ vfs_helper_read_file(path, yes, no, done, options) {
    reads.push({path, yes, done, options});
  } }), app = connected(h), browser = browserSave(h);
  const selected = {name:'shared.bin', type:'REG'};
  app.current_dir = 'E:/Keep'; app.tableData = [selected]; app.table_selection = [selected]; app.searchQuery = 'shared';
  const result = {type:0, generation:app.sessionGeneration, path:'E:/Other/shared.bin', parent:'E:/Other', name:'shared.bin', size:2};
  for (const change of [{type:1}, {generation:result.generation + 1}, {path:'E:/Keep/shared.bin'}, {size:-1}]) {
    app.download_search_result({...result, ...change});
  }
  assert.equal(reads.length, 0);
  app.download_search_result(result);
  app.download_search_result(result);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].path, result.path);
  assert.equal(reads[0].options.max_bytes, 2);
  reads[0].yes(Uint8Array.of(2, 7)); reads[0].done();
  assert.equal(browser.clicks.length, 1);
  assert.equal(browser.clicks[0].filename, 'shared.bin');
  assert.deepEqual([...new Uint8Array(await browser.blobs[0].arrayBuffer())], [2, 7]);
  assert.equal(app.current_dir, 'E:/Keep'); assert.equal(app.searchQuery, 'shared');
  assert.equal(app.table_selection[0], selected); assert.equal(app.tableData[0], selected);
  assert.equal(app.pendingDownloads, 0);
});
test('direct search download skips incomplete and stale reads and keeps bytes to retry a failed browser save', () => {
  let read, reads = 0;
  const h = harness({ vfs_helper_read_file(path, yes, no, done) { ++reads; read = {yes, done}; } });
  const app = connected(h), browser = browserSave(h);
  const result = {type:0, generation:app.sessionGeneration, path:'E:/empty.bin', parent:'E:/', name:'empty.bin', size:0};
  app.download_search_result(result); read.yes(Uint8Array.of(1)); read.done();
  assert.equal(browser.clicks.length, 0); assert.equal(app.lastDownload, null);
  app.download_search_result(result);
  app.on_ble_disconnected(); app.connected = true;
  read.yes(new Uint8Array(0)); read.done();
  assert.equal(browser.clicks.length, 0); assert.equal(app.lastDownload, null);
  browser.failAt('click');
  app.download_search_result({...result, generation:app.sessionGeneration});
  read.yes(new Uint8Array(0)); read.done();
  assert.equal(app.lastDownload.blob.size, 0); assert.equal(browser.clicks.length, 0);
  browser.failAt(null); app.save_last_download();
  assert.equal(reads, 3); assert.equal(browser.clicks[0].filename, 'empty.bin');
});
test('3.32 unified folder picker stages original files for comparison and cannot interrupt upload queue',()=>{
 const h=harness(),app=connected(h),files=[{name:'Case.BIN',webkitRelativePath:'MyFolder/Case.BIN',size:540}];app.upload_diag_visible=true;
 app.on_upload_folder_choice({target:{files,value:'x'}});assert.equal(app.upload_diag_visible,false);assert.equal(app.syncDialog,true);assert.equal(app.syncFileCount,1);assert.equal(app._syncFiles[0],files[0]);assert.equal(app.syncRoot,'E:/');
 app.syncDialog=false;app.upload_diag_visible=true;app.pendingUploads=1;app.on_upload_folder_choice({target:{files,value:'x'}});assert.equal(app.syncDialog,false);assert.equal(app.upload_diag_visible,true);
});
test('nicknames follow the exact application identity across disconnects and device switches', async () => {
 const h = harness(), app = connected(h);
 let deviceId = 'browser-permission-A';
 h.pixl.get_device_key = () => deviceId;
 await app.load_device_nickname();
 assert.equal(app.nicknameReady,true);
 app.nicknameDraft = '  Familie 🌿  '; app.save_device_nickname();
 assert.equal(app.deviceNickname,'Familie 🌿');
 assert.equal(h.stored.size,1);
 assert.ok(![...h.stored.keys()][0].includes(deviceId));
 app.on_ble_disconnected();
 assert.equal(app.nicknameDraft,''); assert.equal(app.deviceNickname,'');
 deviceId = 'browser-permission-B'; app.connected = true;
 await app.load_device_nickname();
 assert.equal(app.deviceNickname,'');
 app.nicknameDraft = 'Gerät B'; app.save_device_nickname();
 deviceId = 'browser-permission-A'; app.nicknameDraft = 'Falsches Gerät'; app.save_device_nickname();
 await app.load_device_nickname(); assert.equal(app.deviceNickname,'Familie 🌿');
 app.nicknameDraft = 'Nähe'; app.save_device_nickname(); assert.equal(app.deviceNickname,'Nähe');
 app.save_device_nickname(true); assert.equal(app.deviceNickname,'');
 await app.load_device_nickname(); assert.equal(app.deviceNickname,'');
 const obsolete = app.load_device_nickname(); ++app.sessionGeneration; deviceId = 'browser-permission-B';
 await app.load_device_nickname(); await obsolete;
 assert.equal(app.deviceNickname,'Gerät B');
 app.save_diagnostics();
 assert.doesNotMatch(app.diagnosticsJson,/Gerät B|browser-permission-B/);
 assert.ok(!app.dfuPageUrl.includes('Gerät') && !app.dfuPageUrl.includes(deviceId));
});
test('folder comparison maps contents against the selected device folder and clears stale selection on rejection', () => {
 const app = connected(harness());
 const file = {name:'link.bin', webkitRelativePath:'Backup/Series2/link.bin'};
 app.open_sync();
 app.on_sync_files({target:{files:[file]}}, true);
 assert.equal(app._syncFiles[0].relativePath,'Series2/link.bin');
 assert.equal(app._syncFiles[0].file,file);
 assert.equal(app.syncFolderName,'Backup');
 app.syncSelected = ['E:/stale.bin'];
 app.on_sync_files({target:{files:Array(4097).fill(file)}}, true);
 assert.equal(app.syncFileCount,0);
 assert.equal(app.syncSelected.length,0);
 assert.equal(app.syncPlan,null);
});
test('comparison filters and pages the whole relative path union and saves only a current device-side result', () => {
 const app = connected(harness());
 const deviceOnly = Array.from({length:1001}, (_,i) => ({path:'E:/tags/nested/' + String(i).padStart(4,'0') + '.bin',size:3}));
 const entries = ['same','add','change','blocked'].map(comparison => ({
   status:comparison, comparison, relativePath:comparison+'.bin',targetPath:'E:/tags/'+comparison+'.bin',size:7,
   expected:comparison === 'change' ? {size:2} : null
 }));
 app.syncPlan = {rootPath:'E:/tags',entries,deviceOnly};
 app._syncGeneration = app.sessionGeneration;
 app._syncDeviceKey = 'private-test-device';
 const calls = [];
 app.download_device_file = (...args) => calls.push(args);
 assert.deepEqual({...app.syncCounts},{all:1005,add:1,deviceOnly:1001,change:1,same:1,blocked:1});
 app.syncFilter = 'deviceOnly'; app.syncPage = 11;
 assert.equal(app.syncPageCount,11);
 assert.deepEqual(Array.from(app.syncPagedEntries, e => e.relativePath), ['nested/1000.bin']);
 app.download_sync_entry('E:/tags/nested/1000.bin');
 app.download_sync_entry('E:/tags/change.bin');
 app.download_sync_entry('E:/tags/add.bin');
 app.download_sync_entry('E:/tags/absent.bin');
 app._syncGeneration--;
 app.download_sync_entry('E:/tags/nested/1000.bin');
 assert.deepEqual(calls, [['E:/tags/nested/1000.bin','1000.bin',3,true], ['E:/tags/change.bin','change.bin',2,true]]);
});
test('3.32 unified ZIP picker uses existing validator and only stages archive until explicit preview/import',async()=>{
 let checked=0;const file={name:'backup.zip',size:100};const h=harness({loadBackupZip:async selected=>{assert.equal(selected,file);checked++;return {fileCount:1,byteCount:540};}}),app=connected(h);app.upload_diag_visible=true;
 await app.on_upload_zip_choice({target:{files:[file],value:'x'}});assert.equal(checked,1);assert.equal(app.zipDialog,true);assert.equal(app.upload_diag_visible,false);assert.equal(app.zipFilename,'backup.zip');assert.equal(app.zipPlan,null);
});

test('3.32 file single-click resolves valid metadata immediately without any file reads',()=>{
 let reads=0;const h=harness({vfs_helper_read_file(){reads++;}}),app=connected(h);const row={...figureRow(),amiibo:{head:0,tail:2}};
 app.select_file_row(0,row);assert.equal(reads,0);assert.equal(app.previewSelection.id,'0000000000000002');assert.equal(app.previewSelection.source,'metadata');assert.equal(app.lastDownload,null);assert.equal(app.meta_diag_visible,false);
});
test('3.32 automatic preview reads only selected supported file once, never writes or downloads',async()=>{
 let reads=0;const h=harness({vfs_helper_read_file(path,yes,no,done,options){reads++;assert.equal(path,'E:/Figure.bin');assert.equal(options.max_bytes,540);yes(figureBytes());}}),app=connected(h);
 await app.select_file_row(0,figureRow());await app._previewTail;assert.equal(reads,1);assert.equal(app.previewSelection.id,'0000000000000002');assert.equal(app.previewSelection.source,'file');assert.equal(app.lastDownload,null);assert.equal(app.previewBusy,false);
 for(const size of [0,14,541,999999])await app.select_file_row(0,figureRow('Other.dat',size));assert.equal(reads,1);assert.equal(app.previewSelection.state,'unsupported');
});
test('3.32 fast selection change retains new metadata image and ignores old read result',async()=>{
 let success;const h=harness({vfs_helper_read_file(path,yes){success=yes;}}),app=connected(h);const old=app.select_file_row(0,figureRow('Old.bin'));await Promise.resolve();
 app.select_file_row(0,{...figureRow('New.bin'),amiibo:{head:0x01010000,tail:0x000e0002}});assert.equal(app.previewSelection.id,'01010000000e0002');success(figureBytes());await old;await app._previewTail;assert.equal(app.previewSelection.row.name,'New.bin');assert.equal(app.previewSelection.id,'01010000000e0002');assert.equal(app.previewBusy,false);
});
test('3.32 rapid unknown previews coalesce obsolete queued reads and serialize the latest',async()=>{
 const calls=[],resolve=[];const h=harness({vfs_helper_read_file(path,yes){calls.push(path);resolve.push(yes);}}),app=connected(h);
 const a=app.select_file_row(0,figureRow('A.bin'));await Promise.resolve();const b=app.select_file_row(0,figureRow('B.bin'));const c=app.select_file_row(0,figureRow('C.bin'));assert.deepEqual(calls,['E:/A.bin']);resolve[0](figureBytes());await a;await b;await Promise.resolve();assert.deepEqual(calls,['E:/A.bin','E:/C.bin']);resolve[1](figureBytes());await c;await app._previewTail;assert.equal(app.previewSelection.row.name,'C.bin');assert.equal(app.previewBusy,false);
});
test('3.32 preview disconnect cannot paint old image or unlock replacement session',async()=>{
 let success;const h=harness({vfs_helper_read_file(path,yes){success=yes;}}),app=connected(h);const pending=app.select_file_row(0,figureRow());await Promise.resolve();app.on_ble_disconnected();app.connected=true;app.previewBusy=true;app.previewSelection={row:{name:'New'}};success(figureBytes());await pending;assert.equal(app.previewSelection.row.name,'New');assert.equal(app.previewBusy,true);
});
test('3.32 corrupt and truncated previews never assign an otherwise plausible figure image',async()=>{
 for(const bytes of [new Uint8Array(540).buffer,figureBytes(532)]){const h=harness({vfs_helper_read_file(path,yes){yes(bytes);}}),app=connected(h);await app.select_file_row(0,figureRow());assert.equal(app.previewSelection.id,null);assert.ok(['invalid','failed'].includes(app.previewSelection.state));}
});
test('3.32 all six workspaces remain mounted and navigation preserves table selection, jobs and preview',()=>{
 const h=harness(),app=connected(h);const selection={name:'keep'};app.table_selection=[selection];app.previewSelection={row:selection};app.transfer={phase:'reading',done:9};
 for(const [name,ref] of Object.entries({files:'fileWorkspace',backup:'backupWorkspace',update:'updateWorkspace',remote:'remoteWorkspace',device:'devicePanel',catalogue:'catalogueWorkspace'})){app.$refs[ref]={open:false,scrollIntoView(){},querySelector:()=>({focus(){}}),focus(){}};app.show_workspace(name);assert.equal(app.activeWorkspace,name);assert.equal(app.table_selection[0],selection);assert.equal(app.transfer.done,9);assert.equal(app.previewSelection.row,selection);assert.match(descriptor.template.content,new RegExp(`v-show="activeWorkspace === '${name}'"`));}
 assert.equal(app.catalogueOpen,true);assert.equal(h.disconnects(),0);assert.doesNotMatch(descriptor.template.content,/<(?:MigrationAssistant|RemoteControl|StartupDiagnostics)[^>]*v-if=/);
});

test('3.32 repeated click on selected file reuses pending preview; mobile dismissal ignores its result',async()=>{
 let success,reads=0;const h=harness({vfs_helper_read_file(path,yes){reads++;success=yes;}}),app=connected(h),row=figureRow();const pending=app.select_file_row(0,row);await Promise.resolve();app.select_file_row(0,row);assert.equal(reads,1);app.close_preview_selection();success(figureBytes());await pending;await app._previewTail;assert.equal(app.previewSelection,null);assert.equal(app.previewBusy,false);assert.match(appSource,/max-height:50svh/);assert.match(descriptor.template.content,/@click="close_preview_selection"/);
});

test('3.32 offline demo offers two public figure previews without BLE or device actions and keeps 245 rows',async()=>{
 let reads=0;const h=harness({vfs_helper_read_file(){reads++;}}),app=h.instance;app.toggle_preview();assert.equal(app.demoMode,true);assert.equal(app.tableData.length,245);
 const examples=app.tableData.filter(row=>row.demoFigure);assert.equal(examples.length,2);
 for(const row of examples){await app.select_file_row(0,row);assert.equal(app.previewSelection.source,'demo');assert.match(app.previewSelection.id,/^[a-f0-9]{16}$/);assert.equal(app.previewSelection.row,row);await app.download_preview_selection();app.open_preview_properties();assert.equal(app.meta_diag_visible,false);}
 assert.equal(reads,0);assert.equal(app.lastDownload,null);assert.equal(app.pendingDownloads,0);app.toggle_preview();assert.equal(app.previewSelection,null);assert.equal(app.tableData.length,0);
});

test('3.32.1 returning to drive overview clears figure preview and leaves no stale properties action',async()=>{
 const app=connected(harness()),row={...figureRow(),amiibo:{head:0,tail:2}};app.tableData=[row];app.select_file_row(0,row);
 await app.on_btn_up();assert.equal(app.current_dir,'');assert.equal(app.previewSelection,null);
 assert.doesNotThrow(()=>app.open_preview_properties());assert.equal(app.meta_diag_visible,false);
});

test('3.32.1 confirmed bulk deletion retires only the deleted selected preview',async()=>{
 const removed=[],app=connected(harness({vfs_remove:async path=>{removed.push(path);return{status:0};}}));
 const row={...figureRow('Keep.bin'),amiibo:{head:0,tail:2}},other={...figureRow('Remove.bin'),amiibo:{head:0,tail:2}};app.tableData=[row,other];app.select_file_row(0,row);
 app.table_selection=[other];await app.on_btn_remove();assert.equal(app.previewSelection.row,row);app.open_preview_properties();assert.equal(app.meta_form.path,'E:/Keep.bin');app.meta_diag_visible=false;
 app.table_selection=[row];await app.on_btn_remove();assert.equal(app.tableData.length,0);assert.equal(app.previewSelection,null);app.open_preview_properties();assert.equal(app.meta_diag_visible,false);
 assert.deepEqual(removed,['E:/Remove.bin','E:/Keep.bin']);
});

test('3.32.1 preview actions reject a changed parent or a replacement row with the same filename',async()=>{
 for(const invalidation of ['directory','replacement','removed']){
  let reads=0;const app=connected(harness({vfs_helper_read_file(){reads++;}})),row={...figureRow(),amiibo:{head:0,tail:2}};app.tableData=[row];app.select_file_row(0,row);
  if(invalidation==='directory')app.current_dir='E:/Other';else app.tableData=invalidation==='replacement'?[{...row}]:[];
  await app.download_preview_selection();assert.doesNotThrow(()=>app.open_preview_properties());assert.equal(reads,0);assert.equal(app.meta_diag_visible,false);
 }
});

test('3.32.1 a dismissed pending preview download cannot act on a reselected same-path file',async()=>{
 let reads=0;const app=connected(harness({vfs_helper_read_file(){reads++;}})),row={...figureRow(),amiibo:{head:0,tail:2}},gate=deferred();app.tableData=[row];app.select_file_row(0,row);app._previewTail=gate.promise;
 const pending=app.download_preview_selection();app.close_preview_selection();app.select_file_row(0,row);gate.resolve();await pending;assert.equal(reads,0);assert.equal(app.previewSelection.row,row);
});

test('3.32.1 an explicit download waits for its selected file preview then reads the same file',async()=>{
 let finish;const paths=[],app=connected(harness({vfs_helper_read_file(path,yes,no,done){paths.push(path);if(paths.length===1)finish=yes;else{yes(figureBytes());done?.();}}})),row=figureRow();app.tableData=[row];
 const preview=app.select_file_row(0,row);await Promise.resolve();const download=app.download_preview_selection();finish(figureBytes());await preview;await download;
 assert.deepEqual(paths,['E:/Figure.bin','E:/Figure.bin']);assert.equal(app.lastDownload.filename,'Figure.bin');assert.equal(app.pendingDownloads,0);assert.equal(app.previewSelection.id,'0000000000000002');
});


test('3.35 combined diagnostic reads serialize eight sections, export startup and tolerate unsupported old firmware', async()=>{
 const order=[];let active=0;
 const reader=(key,value)=>async()=>{order.push(key);assert.equal(active++,0);await new Promise(setImmediate);--active;return value;};
 const startup={schemaVersion:1,scope:'application-storage-start-to-first-dispatch',phaseMask:63,elapsedMilliseconds:[0,2473,2504,2558,2558,2576]};
 const h=harness({get_runtime_diagnostics:reader('runtime',{schemaVersion:1,scope:'since-device-restart',heapFreeBytes:10668,stackMinFreeBytes:null}),
  get_boot_diagnostics:reader('boot',null),get_power_diagnostics:reader('power',null),get_startup_diagnostics:reader('startup',startup),
  vfs_get_drive_list:reader('drives',{status:0,data:[{label:'E',status:0,total_size:100,free_size:40}]}),
  vfs_storage_info_extended:reader('storage',{status:255}),get_mtu_diagnostics:reader('mtu',null),get_ui_diagnostics:reader('ui',null)});
 const app=connected(h);app.firmwareVersion='2.22.0-DE3.56';const pending=app.read_all_diagnostics();
 assert.equal(app.busy,true);await app.read_all_diagnostics();app.save_diagnostics();assert.equal(app.diagnosticsDialog,false);
 await pending;assert.deepEqual(order,['runtime','boot','power','startup','drives','storage','mtu','ui']);assert.equal(app.busy,false);
 assert.equal(app.fullDiagnosticSnapshot.sections.startup.data.elapsedMilliseconds[5],2576);
 assert.equal(app.fullDiagnosticSnapshot.sections.boot.state,'unavailable');assert.equal(app.runtimeState,'available');
 app.save_diagnostics();const exported=JSON.parse(app.diagnosticsJson);assert.equal(exported.applicationVersion,'3.48.2');
 assert.equal(exported.startup.elapsedMilliseconds[1],2473);assert.equal(exported.runtime.heapFreeBytes,10668);
 assert.equal(exported.diagnosticSnapshot.sections.storage.state,'unavailable');assert.equal(order.length,8);
});

test('3.35 changed Bluetooth session discards a pending diagnostic without more reads or unlocking the replacement',async()=>{
 const gate=deferred();let bootReads=0;
 const app=connected(harness({get_runtime_diagnostics:()=>gate.promise,get_boot_diagnostics:async()=>{++bootReads;return null;}}));
 const pending=app.read_all_diagnostics();++app.sessionGeneration;app.fullDiagnosticBusy=true;
 gate.resolve(null);await pending;assert.equal(bootReads,0);assert.equal(app.fullDiagnosticSnapshot,null);
 assert.equal(app.fullDiagnosticBusy,true);
});

test('DE3.70 reads the additional first-menu snapshot and exports it without substituting settings counts',async()=>{
 const trace={schemaVersion:1,scope:'first-main-menu-since-restart',menuEntered:true,selectionAttempted:true,
   launcherReturned:true,targetActive:true,leftBeforeSelection:false,countsSaturated:false,
   targetAppId:2,launchCallMilliseconds:45,centerCounts:{press:1,release:1,short:1}};
 const versions=[];
 const app=connected(harness({
   get_menu_diagnostics:async version=>{versions.push(version);return trace;},
   vfs_storage_info_extended:async()=>({status:255})
 }));
 app.firmwareVersion='2.22.0-DE3.70';
 const read=app.read_all_diagnostics();
 assert.equal(app.fullDiagnosticProgress.total,9);
 await read; app.save_diagnostics();
 const sections=JSON.parse(app.diagnosticsJson).diagnosticSnapshot.sections;
 assert.deepEqual(versions,['2.22.0-DE3.70']);
 assert.deepEqual(sections.menu.data,trace);
 assert.equal(sections.ui.state,'unavailable');
});

test('completed diagnostics publish partial results without queuing extra requests on the render clock', async () => {
 const next = deferred(); let bootReads = 0;
 const app = connected(harness({
   get_runtime_diagnostics: async () => null,
   get_boot_diagnostics: () => { ++bootReads; return next.promise; }
 }));
 const pending = app.read_all_diagnostics();
 assert.equal(app.fullDiagnosticProgress.completed, 0);
 await new Promise(setImmediate);
 assert.equal(app.fullDiagnosticProgress.completed, 1);
 assert.equal(app.fullDiagnosticProgress.sections.runtime.state, 'unavailable');
 const progress = app.fullDiagnosticProgress;
 app.refresh_local_metrics();
 assert.equal(app.fullDiagnosticProgress, progress);
 assert.equal(bootReads, 1);
 assert.ok(app.readClock >= progress.updatedAt);
 next.reject(Object.assign(Error('timeout'), { code:'TIMEOUT' }));
 await pending;
 assert.equal(app.fullDiagnosticProgress, null);
 assert.equal(app.fullDiagnosticSnapshot, null);
 assert.equal(app.fullDiagnosticBusy, false);
 assert.equal(app.fullDiagnosticInterrupted, true);
 app.on_ble_disconnected();
 assert.equal(app.fullDiagnosticInterrupted, false);
});

test('3.35 failed fresh drive reads clear old space; primitive failure is exported without arbitrary text',async()=>{
 const h=harness({get_runtime_diagnostics:async()=>{throw null;},vfs_get_drive_list:async()=>{throw Error('PRIVATE FILE');},vfs_storage_info_extended:async()=>({status:255})});
 const app=connected(h);app.driveInfo=[{label:'E',status:0,totalBytes:100,freeBytes:99}];await app.read_all_diagnostics();
 assert.equal(app.driveInfo.length,0);assert.equal(app.fullDiagnosticSnapshot.sections.runtime.state,'failed');
 assert.equal(app.fullDiagnosticSnapshot.sections.drives.state,'failed');app.save_diagnostics();
 assert.doesNotMatch(app.diagnosticsJson,/PRIVATE/);assert.equal(JSON.parse(app.diagnosticsJson).drives.length,0);
 app.driveInfo=[{label:'E',status:0,totalBytes:100,freeBytes:99}];await app.refresh_device_info();
 assert.equal(app.driveInfo.length,0);assert.equal(app.fullDiagnosticSnapshot,null);
});

test('3.35 storage diagnostic uses only info and layout reads and never import/format operations',async()=>{
 const calls=[];const info={schema:1,drive:'E',backend:3,mounted:true,flags:15,metaLen:128,pathMax:64,nameMax:48};
 const layout={schema:1,drive:'E',backend:3,mounted:true,magic:0x31534650,flags:7,flashBytes:2097152,blockSize:4096,blockCount:512,readSize:16,progSize:16,cacheSize:256,metadataBytes:128,shardTarget:4096,maxShards:16,pathCap:64,nameCap:48,maxHandles:4,engineSha256:'a'.repeat(64)};
 const app=connected(harness({vfs_storage_info_extended:async drive=>{calls.push('info'+drive);return {status:0,data:info};},
  vfs_storage_layout:async drive=>{calls.push('layout'+drive);return {status:0,data:layout};},
  vfs_import_state:async()=>assert.fail('Must not import'),vfs_drive_format:async()=>assert.fail('Must not format')}));
 await app.read_all_diagnostics();assert.deepEqual(calls,['infoE','layoutE']);assert.equal(app.fullDiagnosticSnapshot.sections.storage.data.layout.cacheSize,256);
});

test('backup picker opens the available legacy E drive from Backup without starting a transfer', async () => {
  const paths = [], listing = deferred();
  const {instance: app} = harness({vfs_read_folder: path => { paths.push(path); return listing.promise; }});
  Object.assign(app, {connected: true, current_dir: '', activeWorkspace: 'backup',
    driveInfo: [{label:'I', status:1}, {label:'E', status:0}], searchQuery:'Mario', typeFilter:'REG'});
  assert.deepEqual(Array.from(app.availableBackupDrives, drive => drive.label), ['E']);
  assert.equal(app.btn_disabled(), true);
  await app.open_backup_drive('I');
  await app.open_backup_drive('E:/other');
  assert.deepEqual(paths, []);
  const pending = app.open_backup_drive('E');
  assert.equal(app.btn_disabled(), true);
  await app.open_backup_drive('E');
  listing.resolve({status:0, data:[file('test.bin')]});
  await pending;
  assert.deepEqual(paths, ['E:/']);
  assert.equal(app.searchQuery, '');
  assert.equal(app.current_dir, 'E:/');
  assert.equal(app.tableData[0].name, 'test.bin');
  assert.equal(app.activeWorkspace, 'backup');
  assert.equal(app.btn_disabled(), false);
  assert.equal(app.backingUp, false);
  assert.equal(app.transfer, null);
});

test('failed backup drive listing returns to drive selection and permits a read-only retry', async () => {
  let attempts = 0, scans = 0;
  const {instance: app} = harness({
    vfs_read_folder: async () => { if (++attempts === 1) throw Error('Interrupted'); return {status:0,data:[]}; },
    vfs_get_drive_list: async () => { ++scans; return {status:0,data:[{label:'E', name:'Internal', status:0,total_size:1920401,free_size:649086}]}; }
  });
  Object.assign(app, {connected:true, current_dir:'', activeWorkspace:'backup', driveInfo:[{label:'E',status:0}]});
  await app.open_backup_drive('E');
  assert.equal(app.current_dir, '');
  assert.equal(app.btn_disabled(), true);
  assert.equal(scans, 1);
  // The real fallback refresh clears the shared listing flag. Keep the
  // backup opening failure visible until an explicit retry succeeds.
  assert.equal(app.listingError, false);
  assert.equal(app.backupDriveOpenError, true);
  assert.match(descriptor.template.content, /v-else-if="\(listingError \|\| backupDriveOpenError\) && connected"/);
  await app.open_backup_drive('E');
  assert.equal(app.current_dir, 'E:/');
  assert.equal(app.btn_disabled(), false);
  assert.equal(app.backupDriveOpenError, false);
});

test('backup opening errors are cleared by each connection reset and late fallback completion stays cleared', async () => {
  for (const cleanup of ['on_ble_disconnected', 'on_ble_connect_error']) {
    const {instance: app} = harness();
    Object.assign(app, {connected:true, backupDriveOpenError:true});
    app[cleanup](Error('Synthetic reset'));
    assert.equal(app.backupDriveOpenError, false, cleanup);
  }
  const {instance: newSession} = harness({get_version:async()=>({status:0,data:{ver:'2.22.0-DE3.62'}})});
  newSession.backupDriveOpenError = true;
  await newSession.on_ble_connected();
  assert.equal(newSession.backupDriveOpenError, false);
  const fallback = deferred();
  const {instance: app} = harness({
    vfs_read_folder:async()=>{throw Error('Folder read failed');},
    vfs_get_drive_list:()=>fallback.promise
  });
  Object.assign(app, {connected:true, current_dir:'', driveInfo:[{label:'E',status:0}]});
  const opening = app.open_backup_drive('E');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.backupDriveOpenError, true);
  assert.equal(app.table_loading, true);
  app.on_ble_disconnected();
  fallback.resolve({status:0,data:[]});
  await opening;
  assert.equal(app.backupDriveOpenError, false);
  assert.equal(app.connected, false);
});

test('backup picker ignores stale failures and refuses new opens while disconnected or occupied', async () => {
  const listing = deferred(); let calls = 0, scans = 0;
  const {instance: app} = harness({
    vfs_read_folder: () => { ++calls; return listing.promise; },
    vfs_get_drive_list: () => { ++scans; throw Error('unexpected scan'); }
  });
  Object.assign(app,{connected:false,driveInfo:[{label:'E',status:0}]});
  await app.open_backup_drive('E');
  app.connected = true;
  for (const flag of ['table_loading','upload_diag_visible','disconnecting']) {
    app[flag] = true; await app.open_backup_drive('E'); app[flag] = false;
  }
  assert.equal(calls,0);
  const pending = app.open_backup_drive('E');
  ++app.sessionGeneration; ++app.listingGeneration;
  Object.assign(app,{current_dir:'I:/',table_loading:false});
  listing.reject(Error('late failure from previous session'));
  await pending;
  assert.equal(calls,1);
  assert.equal(scans,0);
  assert.equal(app.current_dir,'I:/');
});

test('T1 completed ZIP keeps unload protection through anchor download until explicit save confirmation',async()=>{
  const h=harness({createBackup:async()=>({blob:new Blob(['zip']),filename:'backup.zip',manifest:{files:1}})}),app=connected(h),browser=browserSave(h);
  const prevented=()=>{let count=0;const event={preventDefault(){count++;}};app.on_before_unload(event);return {count,event};};
  await app.on_backup();assert.equal(prevented().count,1);assert.equal(prevented().event.returnValue,'');
  app.confirm_backup_saved();assert.equal(prevented().count,1,'confirmation before a download request cannot dismiss the guard');
  await app.save_last_backup();assert.equal(browser.clicks.length,1);assert.equal(prevented().count,1);
  assert.equal(app.lastBackup.downloadRequested,true);assert.equal(app.lastBackup.savedConfirmed,false);
  app.on_ble_disconnected();assert.equal(prevented().count,1,'local ZIP protection survives Bluetooth disconnect');
  app.confirm_backup_saved();assert.equal(app.lastBackup.savedConfirmed,true);assert.equal(prevented().count,0);
  app.connected=true;app.current_dir='E:/';await app.on_backup();assert.equal(prevented().count,1,'a new archive must not inherit the old save confirmation');
  app.lastBackup=null;assert.equal(prevented().count,0,'explicit discard releases the completed archive guard');
});

test('T1 ZIP picker confirms saving only after write and close; cancellation and write errors retain protection',async()=>{
  for(const outcome of ['saved','cancelled','write','close']){
    const h=harness(),app=h.instance,browser=browserSave(h),archive={blob:new Blob(['zip']),filename:'test.zip'};
    app.lastBackup=archive;const operations=[];
    h.window.showSaveFilePicker=async options=>{
      operations.push(['picker',options.suggestedName]);
      if(outcome==='cancelled')throw Object.assign(new Error('cancelled'),{name:'AbortError'});
      return{async createWritable(){return{async write(blob){operations.push(['write',blob]);if(outcome==='write')throw new Error('write failed');},
        async close(){operations.push(['close']);if(outcome==='close')throw new Error('close failed');},async abort(){operations.push(['abort']);}};}};
    };
    await app.save_last_backup();let protectedCount=0;app.on_before_unload({preventDefault(){protectedCount++;}});
    assert.equal(browser.clicks.length,0,'picker never silently falls back to an anchor');assert.equal(app.lastBackup,archive);
    assert.equal(archive.savedConfirmed===true,outcome==='saved');assert.equal(protectedCount,outcome==='saved'?0:1);
    assert.equal(h.messages.length,['write','close'].includes(outcome)?1:0);
    if(outcome==='saved')assert.deepEqual(operations.map(row=>row[0]),['picker','write','close']);
    if(outcome==='cancelled')assert.equal(archive.saveStatus,'cancelled');
  }
});

test('T1 a delayed picker belongs to its captured ZIP and cannot confirm a newer archive',async()=>{
  const h=harness(),app=h.instance,gate=deferred(),old={blob:new Blob(['old']),filename:'old.zip'},fresh={blob:new Blob(['new']),filename:'new.zip'};
  app.lastBackup=old;let opens=0;
  h.window.showSaveFilePicker=async()=>{opens++;return{async createWritable(){return{async write(){await gate.promise;},async close(){}};}};};
  const pending=app.save_last_backup();assert.equal(old.saving,true);await app.save_last_backup();assert.equal(opens,1);
  app.lastBackup=fresh;gate.resolve();await pending;
  assert.equal(old.savedConfirmed,true);assert.equal(app.lastBackup,fresh);assert.equal(fresh.savedConfirmed,undefined);
  let prevented=0;app.on_before_unload({preventDefault(){prevented++;}});assert.equal(prevented,1);
});
