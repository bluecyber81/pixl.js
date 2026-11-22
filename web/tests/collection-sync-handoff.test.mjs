import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { uploadNameTree, reviewUploadNames } from '../src/lib/upload-names.js'

const descriptor = parse(readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')).descriptor
const unexpected = () => { throw new Error('Collection handoff must not read or write device/file contents') }
const bindings = { defineAsyncComponent: () => ({}), DeviceStorageCard: {}, catalogueBaseline: {},
  uploadNameTree, reviewUploadNames, createSyncPlan: unexpected, createSyncJob: unexpected, executeSyncJob: unexpected,
  proto: new Proxy({}, { get: () => unexpected }), pixl: new Proxy({}, { get: () => unexpected }) }
const { methods } = new Function(...Object.keys(bindings), descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'return'))(...Object.values(bindings))
const file = (name, webkitRelativePath = '') => ({ name, webkitRelativePath, size: 540, arrayBuffer: unexpected })
function fixture(changes = {}) {
  const errors = [], state = { ...methods, connected: true, busy: false, current_dir: 'E:/Figures',
    upload_diag_visible: false, remoteActive: false, syncDialog: false, zipDialog: false, meta_diag_visible: false,
    syncNameSerial: 0, syncPlan: { old: true }, syncSelected: ['old'], syncStatus: 'old', syncHistoryReady: { old: true },
    $t: key => key, show_transfer_error: error => errors.push(error.message), ...changes }
  return { state, errors }
}

test('collection handoff uses the actual existing App sync setup and name review without reading or transferring', () => {
  const { state, errors } = fixture(), selected = file('figure.bin')
  state.open_collection_sync({ files: [selected], folderContents: false })
  assert.equal(state.syncDialog, true)
  assert.equal(state.syncRoot, 'E:/Figures')
  assert.equal(state.syncFileCount, 1)
  assert.deepEqual(state._syncFiles, [selected])
  assert.equal(state.syncNames.rows[0].target, 'E:/Figures/figure.bin')
  assert.equal(state.syncPlan, null)
  assert.deepEqual(state.syncSelected, [])
  assert.equal(state.syncHistoryReady, null)
  assert.deepEqual(errors, [])
})

test('folder handoff retains the old folder-content convention and existing name conflict checks', () => {
  const { state, errors } = fixture(), a = file('figure.bin', 'PC Library/Sub/figure.bin'), b = file('FIGURE.bin', 'PC Library/Sub/FIGURE.bin')
  state.open_collection_sync({ files: [a, b], folderContents: true })
  assert.equal(state.syncFolderName, 'PC Library')
  assert.equal(state.syncFolderContents, true)
  assert.deepEqual(state._syncInputs.map(row => row.relativePath), ['Sub/figure.bin', 'Sub/FIGURE.bin'])
  assert(state.syncNames.problems > 0)
  assert.equal(state.syncPlan, null)
  assert.deepEqual(state.syncSelected, [])
  assert.deepEqual(errors, [])
})

test('collection handoff preserves session and dialog gates and never replaces an already open preview', () => {
  for (const changes of [{ connected: false }, { busy: true }, { current_dir: '' }, { upload_diag_visible: true },
    { remoteActive: true }, { syncDialog: true }, { zipDialog: true }, { meta_diag_visible: true }]) {
    const { state, errors } = fixture(changes), oldPlan = state.syncPlan
    state.open_collection_sync({ files: [file('figure.bin')] })
    assert.equal(state.syncPlan, oldPlan, JSON.stringify(changes))
    assert.equal(state._syncFiles, undefined)
    assert.deepEqual(errors, [])
  }
  for (const selection of [undefined, {}, { files: [] }, { files: { length: 1 } }]) {
    const { state } = fixture(), oldPlan = state.syncPlan
    state.open_collection_sync(selection)
    assert.equal(state.syncPlan, oldPlan)
  }
})

test('larger PC audit selections still obey the existing 4096-file transfer preview limit', () => {
  const { state, errors } = fixture()
  state.open_collection_sync({ files: Array(4097).fill(file('figure.bin')) })
  assert.equal(state.syncDialog, true)
  assert.equal(state.syncFileCount, 0)
  assert.equal(state.syncPlan, null)
  assert.deepEqual(state.syncSelected, [])
  assert.deepEqual(errors, ['info.syncTooMany'])
})
