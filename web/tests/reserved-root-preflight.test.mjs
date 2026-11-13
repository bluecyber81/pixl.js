import test from 'node:test'
import assert from 'node:assert/strict'
import { assertDevicePath, assertWritableDevicePath } from '../src/lib/portable-names.js'
import { createSyncPlan } from '../src/lib/sync-plan.js'
import { safeUpload } from '../src/lib/safe-upload.js'
import { memoryVfs } from './helpers/memory-vfs.mjs'

const local = path => ({ relativePath: path, file: new File(['abc'], path.split('/').at(-1)) })

test('reserved root file or directory stops sync and upload before device calls', async () => {
  for (const drive of ['E:/', 'I:/']) {
    for (const name of ['.pixl_txn', '.pixl_txn_pending', '.pixl_txn_old', '.pixl_txn_new', '.pixl_txn_other/a.bin']) {
      const vfs = memoryVfs(), path = drive + name
      const expected = { code: 'PATH_RESERVED' }
      assert.equal(assertDevicePath(path), path)
      await assert.rejects(createSyncPlan({ rootPath: drive, files: [local('normal.bin'), local(name)], deviceKey: 'test', ...vfs.api }), expected)
      await assert.rejects(safeUpload({ path, file: new Uint8Array([1]), ...vfs.api }), expected)
      assert.equal(vfs.log.length, 0, path)
    }
  }
})

test('the reserved prefix applies only at the root and is case-sensitive', async () => {
  for (const name of ['tags/.pixl_txn_pending', '.PIXL_TXN_pending', 'tags/.pixl_txn_dir/a.bin']) {
    const vfs = memoryVfs(), path = 'E:/' + name
    assert.equal(assertWritableDevicePath(path), path)
    const plan = await createSyncPlan({ rootPath: 'E:/', files: [local(name)], deviceKey: 'test', ...vfs.api })
    assert.equal(plan.entries[0].status, 'add')
  }
})
