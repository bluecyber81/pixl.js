import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createBackup } from '../src/lib/backup.js'
import { loadBackupZip, readBackupArchiveFile, previewZipImport, executeZipImport } from '../src/lib/zip-import.js'
import { memoryVfs, metadata } from './helpers/memory-vfs.mjs'

const require = createRequire(import.meta.url), JSZip = require('../public/dfu/vendor/jszip-3.10.2.min.js')
const deviceKey = 'journal-test-device'
const journals = ['.pixl_txn_old', '.pixl_txn_new']
const preview = (archive, vfs, rootPath = 'E:/') => previewZipImport({ archive, rootPath, deviceKey, ...vfs.api })
const execute = (plan, vfs, selectedPaths) => executeZipImport({ plan, deviceKey, selectedPaths, ...vfs.api })
const mutations = vfs => vfs.log.filter(item => ['write', 'rename', 'remove', 'mkdir', 'meta'].includes(item.op))
function device() {
  const vfs = memoryVfs()
  vfs.nodes.clear()
  for (const drive of ['E', 'I']) vfs.nodes.set(drive + ':/', { type: 1, meta: metadata() })
  return vfs
}
async function archiveOf(vfs, rootPath = 'E:/') {
  const backup = await createBackup({ rootPath, ...vfs.api, preserveLegacyNames: true })
  return loadBackupZip(backup.blob, { JSZip })
}
const child = (root, name) => root + (root.endsWith('/') ? '' : '/') + name

for (const sourceDrive of ['E', 'I']) for (const targetRoot of ['E:/', 'I:/', 'E:/restored', 'I:/restored']) {
  test(`schema1 ${sourceDrive}:/ inactive journals remain archived and excluded when restored to ${targetRoot}`, async () => {
    const source = device(), sourceRoot = sourceDrive + ':/'
    for (const [i, name] of journals.entries()) source.put(sourceRoot + name, [10 + i, 20], metadata(0x85, 'source journal'))
    source.put(sourceRoot + 'safe.bin', [1, 2, 3], metadata(1, 'user file'))
    const archive = await archiveOf(source, sourceRoot), target = device(), targetDrive = targetRoot.slice(0, 3)
    assert.equal(archive.version, 1); assert.equal(archive.fileCount, 3)
    if (targetRoot.length > 3) target.nodes.set(targetRoot, { type: 1, meta: metadata() })
    for (const name of journals) target.put(targetDrive + name, [91, 92], metadata(4, 'target journal'))
    const plan = await preview(archive, target, targetRoot)
    assert.deepEqual(plan.summary, { add: 1, change: 0, same: 0, blocked: 2 })
    assert(Object.isFrozen(plan)); assert(Object.isFrozen(plan.entries[0]))
    for (const name of journals) {
      const row = plan.entries.find(entry => entry.sourcePath === sourceRoot + name)
      assert.equal(row.status, 'blocked'); assert.equal(row.reason, 'INTERNAL_TRANSACTION_JOURNAL')
      await assert.rejects(execute(plan, target, [row.targetPath]), { code: 'ZIP_SELECTION' })
    }
    assert.equal(mutations(target).length, 0)
    const result = await execute(plan, target, [child(targetRoot, 'safe.bin')])
    assert.equal(result.filesCompleted, 1); assert.deepEqual(target.bytes(child(targetRoot, 'safe.bin')), [1, 2, 3])
    for (const [i, name] of journals.entries()) {
      assert.deepEqual([...readBackupArchiveFile(archive, sourceRoot + name)], [10 + i, 20])
      assert.deepEqual(source.bytes(sourceRoot + name), [10 + i, 20])
      assert.deepEqual(target.bytes(targetDrive + name), [91, 92])
      assert.deepEqual(target.nodes.get(targetDrive + name).meta, metadata(4, 'target journal'))
      if (targetRoot.length > 3) assert(!target.nodes.has(child(targetRoot, name)))
    }
    assert(!mutations(target).some(event => event.args.some(value => typeof value === 'string' && value.includes('.pixl_txn'))))
    assert(!target.log.some(event => event.op === 'read' && event.args[0].includes('.pixl_txn')))
    assert.equal(mutations(source).length, 0)
  })
}

for (const targetDrive of ['E', 'I']) {
  test(`remapping ordinary nested names to ${targetDrive}:/ still excludes the reserved OLD/NEW targets`, async () => {
    const source = device(); source.nodes.set('I:/export', { type: 1, meta: metadata() })
    for (const name of journals) source.put('I:/export/' + name, [5])
    source.put('I:/export/safe.bin', [6])
    const archive = await archiveOf(source, 'I:/export'), target = device(), plan = await preview(archive, target, targetDrive + ':/')
    assert.equal(plan.entries.filter(entry => entry.reason === 'INTERNAL_TRANSACTION_JOURNAL').length, 2)
    await execute(plan, target, [targetDrive + ':/safe.bin'])
    assert.deepEqual(target.bytes(targetDrive + ':/safe.bin'), [6])
    for (const name of journals) assert(!target.nodes.has(targetDrive + ':/' + name))
  })
}

test('nested journal-like files and folders and different-case root names remain ordinary user entries', async () => {
  const source = device(); source.nodes.set('E:/user', { type: 1, meta: metadata() })
  source.nodes.set('E:/user/.pixl_txn_old', { type: 1, meta: metadata() })
  for (const path of ['E:/user/.pixl_txn_old/child', 'E:/user/.pixl_txn_new', 'E:/user/.pixl_txn_pending', 'E:/.PIXL_TXN_pending']) source.put(path, [7, 8])
  const archive = await archiveOf(source), target = device(), plan = await preview(archive, target)
  assert.equal(plan.summary.blocked, 0)
  const result = await execute(plan, target, plan.entries.map(entry => entry.targetPath))
  assert.equal(result.filesCompleted, 4); assert.equal(result.directoriesCompleted, 2)
  for (const entry of archive.entries.filter(entry => entry.type === 'file')) assert.deepEqual(target.bytes(entry.sourcePath), [7, 8])
})

for (const [name, type] of [['.pixl_txn_pending', 0], ['.pixl_txn_unknown', 0], ['.pixl_txn', 0], ['.pixl_txn_old_extra', 0], ['.pixl_txn_old', 1], ['.pixl_txn_new', 1]]) {
  test(`archive ${name} ${type ? 'directory' : 'file'} blocks every restore row before destination access`, async () => {
    const source = device(); source.put('I:/safe.bin', [3])
    if (type) { source.nodes.set('I:/' + name, { type: 1, meta: metadata() }); source.put('I:/' + name + '/child', [4]) }
    else source.put('I:/' + name, [4])
    const archive = await archiveOf(source, 'I:/'), target = device()
    target.nodes.set('E:/restored', { type: 1, meta: metadata() })
    const plan = await preview(archive, target, 'E:/restored')
    assert(plan.entries.every(entry => entry.status === 'blocked' && entry.reason === 'TRANSACTION_PENDING'))
    assert.equal(plan.summary.blocked, archive.entries.length); assert.equal(target.log.length, 0)
    await assert.rejects(execute(plan, target, ['E:/restored/safe.bin']), { code: 'ZIP_SELECTION' })
    assert.equal(mutations(target).length, 0)
    assert.deepEqual([...readBackupArchiveFile(archive, type ? 'I:/' + name + '/child' : 'I:/' + name)], [4])
  })
}

test('a backup rooted inside a reserved directory cannot hide its original transaction identity', async () => {
  const source = device(); source.nodes.set('E:/.pixl_txn_old', { type: 1, meta: metadata() }); source.put('E:/.pixl_txn_old/safe.bin', [4])
  const archive = await archiveOf(source, 'E:/.pixl_txn_old'), target = device(), plan = await preview(archive, target, 'I:/')
  assert.equal(plan.entries[0].reason, 'TRANSACTION_PENDING')
  await assert.rejects(execute(plan, target, ['I:/safe.bin']), { code: 'ZIP_SELECTION' })
  assert.equal(target.log.length, 0)
})

test('a nested pending filename becomes a whole-plan blocker when remapped to a drive root', async () => {
  const source = device(); source.nodes.set('E:/export', { type: 1, meta: metadata() })
  source.put('E:/export/.pixl_txn_pending', [5]); source.put('E:/export/safe.bin', [6])
  const archive = await archiveOf(source, 'E:/export'), target = device(), plan = await preview(archive, target, 'I:/')
  assert(plan.entries.every(entry => entry.reason === 'TRANSACTION_PENDING'))
  await assert.rejects(execute(plan, target, ['I:/safe.bin']), { code: 'ZIP_SELECTION' })
  assert.equal(target.log.length, 0)
})

test('a reserved destination directory blocks ordinary children even when that directory is outside the archive', async () => {
  const source = device(); source.put('E:/safe.bin', [5])
  const archive = await archiveOf(source), target = device(); target.nodes.set('I:/.pixl_txn_old', { type: 1, meta: metadata() })
  const plan = await preview(archive, target, 'I:/.pixl_txn_old')
  assert.equal(plan.entries[0].reason, 'TRANSACTION_PENDING')
  await assert.rejects(execute(plan, target, ['I:/.pixl_txn_old/safe.bin']), { code: 'ZIP_SELECTION' })
  assert.equal(target.log.length, 0)
})

for (const [name, type] of [['.pixl_txn_pending', 0], ['.pixl_txn_future', 0], ['.pixl_txn_old', 1], ['.pixl_txn_new', 1]]) {
  test(`live target ${name} ${type ? 'directory' : 'file'} blocks a subfolder restore and a previously valid plan`, async () => {
    const source = device(); source.put('E:/safe.bin', [1])
    const archive = await archiveOf(source), target = device(); target.nodes.set('I:/restored', { type: 1, meta: metadata() })
    const oldPlan = await preview(archive, target, 'I:/restored')
    if (type) target.nodes.set('I:/' + name, { type: 1, meta: metadata() })
    else target.put('I:/' + name, [90])
    await assert.rejects(execute(oldPlan, target, ['I:/restored/safe.bin']), error => {
      assert.equal(error.code, 'ZIP_STALE'); assert.deepEqual(error.importProgress.completedPaths, []); return true
    })
    const blocked = await preview(archive, target, 'I:/restored')
    assert(blocked.entries.every(entry => entry.status === 'blocked' && entry.reason === 'TRANSACTION_PENDING'))
    await assert.rejects(execute(blocked, target, ['I:/restored/safe.bin']), { code: 'ZIP_SELECTION' })
    assert.equal(mutations(target).length, 0)
    assert(target.nodes.has('I:/' + name))
  })
}

test('a transaction appearing during fresh hash comparison prevents even the first directory creation', async () => {
  const source = device(); source.put('E:/safe.bin', [1]); source.nodes.set('E:/new', { type: 1, meta: metadata() }); source.put('E:/new/child', [2])
  const archive = await archiveOf(source), target = device(); target.put('E:/safe.bin', [99])
  const plan = await preview(archive, target)
  target.setHook(event => {
    if (event.when === 'after' && event.op === 'read' && event.args[0] === 'E:/safe.bin') target.put('E:/.pixl_txn_pending', [90])
  })
  await assert.rejects(execute(plan, target, ['E:/safe.bin', 'E:/new/child']), error => {
    assert.equal(error.code, 'ZIP_STALE'); assert.deepEqual(error.importProgress.attemptedFolders, []); return true
  })
  assert.equal(mutations(target).length, 0); assert.deepEqual(target.bytes('E:/safe.bin'), [99]); assert(!target.nodes.has('E:/new'))
})

test('forged plans and selections cannot turn an excluded journal into a mutation', async () => {
  const source = device(); source.put('E:/.pixl_txn_old', [1]); source.put('E:/safe.bin', [2])
  const archive = await archiveOf(source), target = device(), plan = await preview(archive, target)
  const journal = plan.entries.find(entry => entry.targetPath === 'E:/.pixl_txn_old')
  assert.throws(() => { journal.status = 'add' }, TypeError)
  const forged = structuredClone(plan); forged.entries.find(entry => entry.targetPath === journal.targetPath).status = 'add'
  await assert.rejects(execute(forged, target, [journal.targetPath]), { code: 'ZIP_STALE' })
  await assert.rejects(execute(plan, target, ['E:/safe.bin', journal.targetPath]), { code: 'ZIP_SELECTION' })
  assert.equal(mutations(target).length, 0)
})
