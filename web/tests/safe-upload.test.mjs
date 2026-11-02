import test from 'node:test'
import assert from 'node:assert/strict'
import { safeUpload, snapshotFile } from '../src/lib/safe-upload.js'
import { memoryVfs, metadata, localFile } from './helpers/memory-vfs.mjs'

const target = 'E:/tags/a.bin', stage = 'E:/tags/~uabcdef012345', backup = 'E:/tags/~babcdef012345'
function setup(meta = metadata(0x80, 'Keep this note')) { const vfs = memoryVfs(); vfs.put(target, [1, 2, 3], meta); return vfs }
const run = (vfs, options = {}) => safeUpload({ ...vfs.api, path: target, file: localFile('a.bin'), replace: true, ...options })
const mutations = vfs => vfs.log.filter(entry => ['write', 'rename', 'remove', 'meta'].includes(entry.op))

test('3.30.3 NUL in existing or requested notes is rejected before staging or any mutation', async () => {
  for (const origin of ['existing','requested']) {
    const bad = metadata(0x80, 'keep\0lost'), vfs = setup(origin === 'existing' ? bad : metadata());
    await assert.rejects(run(vfs, origin === 'requested' ? { metadata: bad } : {}), { code: 'UPLOAD_METADATA' });
    assert.equal(mutations(vfs).length, 0); assert.deepEqual(vfs.bytes(target), [1,2,3]);
  }
})

test('replacement stages and hashes before target mutation, preserves complete metadata and confirms target before backup removal', async () => {
  const vfs = setup(), oldMeta = structuredClone(vfs.nodes.get(target).meta)
  const result = await run(vfs)
  assert.equal(result.verified, true); assert.equal(result.replaced, true)
  assert.deepEqual(vfs.bytes(target), [7, 8, 9]); assert.deepEqual(vfs.nodes.get(target).meta, oldMeta)
  assert.equal(vfs.nodes.has(stage), false); assert.equal(vfs.nodes.has(backup), false)
  const firstRename = vfs.log.findIndex(entry => entry.op === 'rename')
  assert(vfs.log.slice(0, firstRename).some(entry => entry.op === 'read' && entry.args[0] === stage))
  assert.equal(vfs.log.filter(entry => entry.op === 'read' && entry.args[0] === target).length, 3)
  assert.deepEqual(mutations(vfs).filter(entry => entry.op === 'rename').map(entry => entry.args), [[target, backup], [stage, target]])
})
test('a new file is also staged and read back, with no backup removal', async () => {
  const vfs = memoryVfs(); const result = await run(vfs, { replace: false })
  assert.equal(result.replaced, false); assert.deepEqual(vfs.bytes(target), [7, 8, 9]); assert(!vfs.log.some(entry => entry.op === 'remove'))
})
test('read-only, uncertain metadata, no overwrite approval and case aliases cannot mutate anything', async () => {
  for (const [vfs, options, code] of [[setup(metadata(4)), {}, 'UPLOAD_READONLY'], [setup({ valid: false }), {}, 'UPLOAD_METADATA'], [setup(), { replace: false }, 'UPLOAD_EXISTS']]) {
    await assert.rejects(run(vfs, options), { code }); assert.equal(mutations(vfs).length, 0)
  }
  const vfs = setup(); vfs.put('E:/tags/A.bin', [4]); await assert.rejects(run(vfs), { code: 'UPLOAD_COLLISION' }); assert.equal(mutations(vfs).length, 0)
})
test('staging requires the entire new allocation before any write', async () => {
  const vfs = setup(); vfs.setFree(2); await assert.rejects(run(vfs), { code: 'UPLOAD_SPACE' }); assert.equal(mutations(vfs).length, 0)
})

for (const location of ['destination', 'ancestor']) {
  test(`upload refuses a readonly ${location} before reading or changing destination content`, async () => {
    const vfs = memoryVfs(), folder = location === 'ancestor' ? 'E:/tags/nested' : 'E:/tags'
    if (location === 'ancestor') vfs.nodes.set(folder, { type: 1, meta: metadata() })
    vfs.nodes.get('E:/tags').meta = metadata(4)
    const path = folder + '/a.bin'; vfs.put(path, [1, 2, 3])
    await assert.rejects(run(vfs, { path }), { code: 'UPLOAD_PARENT' })
    assert.equal(mutations(vfs).length, 0); assert(!vfs.log.some(item => item.op === 'read'))
    assert.deepEqual(vfs.bytes(path), [1, 2, 3])
  })
}
test('upload does not write through ambiguous or invalid parent metadata', async () => {
  for (const configure of [
    vfs => { vfs.nodes.get('E:/tags').meta = { valid: false } },
    vfs => { vfs.nodes.set('E:/TAGS', { type: 1, meta: metadata() }) }
  ]) {
    const vfs = setup(); configure(vfs)
    await assert.rejects(run(vfs), { code: 'UPLOAD_PARENT' })
    assert.equal(mutations(vfs).length, 0)
  }
})
test('parent becoming readonly during preflight prevents staging; during verification preserves the original', async () => {
  for (const phase of ['preflight', 'verification']) {
    const vfs = setup()
    vfs.setHook(({ op, when, args }) => {
      if (when === 'after' && (phase === 'preflight' && op === 'free' || phase === 'verification' && op === 'read' && args[0] === stage)) {
        vfs.nodes.get('E:/tags').meta = metadata(4)
      }
    })
    await assert.rejects(run(vfs), { code: 'UPLOAD_PARENT' })
    assert.deepEqual(vfs.bytes(target), [1, 2, 3]); assert(!vfs.nodes.has(stage)); assert(!vfs.log.some(item => item.op === 'rename'))
    if (phase === 'preflight') assert.equal(mutations(vfs).length, 0)
  }
})
test('readonly incoming file metadata still restores inside a writable folder', async () => {
  const vfs = memoryVfs(), wanted = metadata(5, 'preserved readonly tag')
  const result = await run(vfs, { replace: false, metadata: wanted })
  assert.equal(result.verified, true); assert.deepEqual(vfs.nodes.get(target).meta, wanted)
})

function deepFolder(vfs, remaining) {
  const first = 'E:/' + 'é'.repeat(20), parent = first + '/' + 'b'.repeat(20 - remaining)
  vfs.nodes.set(first, { type: 1, meta: metadata() }); vfs.nodes.set(parent, { type: 1, meta: metadata() })
  return parent
}
for (const remaining of [1, 2, 3, 8, 14]) {
  test(`checked replacement fits staging and recovery names into ${remaining} remaining UTF-8 path bytes`, async () => {
    const vfs = memoryVfs(), parent = deepFolder(vfs, remaining), path = parent + '/x', oldMeta = metadata(0x80, 'Keep')
    vfs.put(path, [1, 2, 3], oldMeta)
    const result = await run(vfs, { path, file: localFile('x') })
    assert.equal(result.verified, true); assert.deepEqual(vfs.bytes(path), [7, 8, 9]); assert.deepEqual(vfs.nodes.get(path).meta, oldMeta)
    assert.notEqual(result.recovery.stagePath, result.recovery.backupPath)
    for (const value of [result.recovery.stagePath, result.recovery.backupPath]) {
      assert(new TextEncoder().encode(value.slice(2)).length <= 63); assert.equal(vfs.nodes.has(value), false)
    }
  })
}

test('compact staging collision is retried, preserving the colliding file and the old target until verification', async () => {
  const probe = memoryVfs(), parent = deepFolder(probe, 1), path = parent + '/x'
  const sample = await run(probe, { path, replace: false, file: localFile('x') })
  const vfs = memoryVfs(); deepFolder(vfs, 1); vfs.put(path, [1, 2, 3]); vfs.put(sample.recovery.stagePath, [99])
  let calls = 0
  const result = await run(vfs, { path, file: localFile('x'), randomToken: () => ++calls === 1 ? 'abcdef012345' : '0123456789ab' })
  assert.equal(result.verified, true); assert.equal(calls, 2); assert.deepEqual(vfs.bytes(sample.recovery.stagePath), [99]); assert.deepEqual(vfs.bytes(path), [7, 8, 9])
})

test('compact namespace exhaustion and case-folded aliases fail without mutating files', async () => {
  const probe = memoryVfs(), parent = deepFolder(probe, 1), path = parent + '/x'
  const sample = await run(probe, { path, replace: false, file: localFile('x') })
  const vfs = memoryVfs(); deepFolder(vfs, 1); vfs.put(path, [1, 2, 3])
  const alias = sample.recovery.stagePath.slice(0, -1) + sample.recovery.stagePath.slice(-1).toUpperCase()
  vfs.put(alias, [99]); let attempts = 0
  await assert.rejects(run(vfs, { path, file: localFile('x'), randomToken: () => { ++attempts; return 'abcdef012345' } }), { code: 'UPLOAD_COLLISION' })
  assert.equal(attempts, 16); assert.equal(mutations(vfs).length, 0); assert.deepEqual(vfs.bytes(path), [1, 2, 3]); assert.deepEqual(vfs.bytes(alias), [99])
})

test('compact recovery paths restore the old verified file after stage-to-target rename fails', async () => {
  const vfs = memoryVfs(), parent = deepFolder(vfs, 1), path = parent + '/x', oldMeta = metadata(0x80, 'original')
  vfs.put(path, [1, 2, 3], oldMeta)
  vfs.setHook(event => { if (event.op === 'rename' && event.when === 'before' && event.count === 2) throw new Error('Rename failed') })
  await assert.rejects(run(vfs, { path, file: localFile('x') }), error => {
    assert.equal(error.recovery.restored, true); assert.equal(error.committed, false)
    for (const value of [error.recovery.stagePath, error.recovery.backupPath]) {
      assert(new TextEncoder().encode(value.slice(2)).length <= 63); assert.equal(vfs.nodes.has(value), false)
    }
    return true
  })
  assert.deepEqual(vfs.bytes(path), [1, 2, 3]); assert.deepEqual(vfs.nodes.get(path).meta, oldMeta)
})
test('staging name collisions never truncate an existing temporary file', async () => {
  const vfs = setup(); vfs.put(stage, [99]); await assert.rejects(run(vfs), { code: 'UPLOAD_COLLISION' })
  assert.deepEqual(vfs.bytes(stage), [99]); assert.equal(mutations(vfs).length, 0)
})
test('corrupt staged read-back keeps old destination and cleans only the generated stage', async () => {
  const vfs = setup(); vfs.setHook(({ op, when, args }) => { if (op === 'read' && when === 'before' && args[0] === stage) vfs.nodes.get(stage).bytes[0] ^= 1 })
  await assert.rejects(run(vfs), { code: 'UPLOAD_VERIFY' }); assert.deepEqual(vfs.bytes(target), [1, 2, 3]); assert(!vfs.nodes.has(stage)); assert(!vfs.log.some(entry => entry.op === 'rename'))
})
test('metadata write failure never reaches commit', async () => {
  const vfs = setup(); vfs.setHook(({ op, when }) => { if (op === 'meta' && when === 'before') throw new Error('Metadata write failed') })
  await assert.rejects(run(vfs)); assert.deepEqual(vfs.bytes(target), [1, 2, 3]); assert(!vfs.nodes.has(stage))
})
test('same-size target changes immediately before commit are caught by content re-read', async () => {
  const vfs = setup(); let count = 0
  vfs.setHook(({ op, when, args }) => { if (op === 'read' && when === 'before' && args[0] === target && ++count === 2) vfs.nodes.get(target).bytes[0] = 55 })
  await assert.rejects(run(vfs), { code: 'UPLOAD_STALE' }); assert.deepEqual(vfs.bytes(target), [55, 2, 3]); assert(!vfs.log.some(entry => entry.op === 'rename'))
})
for (const phase of ['initial', 'write', 'verify', 'metadata', 'before-commit']) {
  test(`abort ${phase} preserves old file and metadata`, async () => {
    const vfs = setup(), controller = new AbortController()
    if (phase === 'initial') controller.abort()
    vfs.setHook(({ op, when, args }) => {
      if (when === 'after' && (phase === 'write' && op === 'write' || phase === 'verify' && op === 'read' && args[0] === stage || phase === 'metadata' && op === 'meta')) controller.abort()
    })
    await assert.rejects(run(vfs, { signal: controller.signal, onProgress: p => { if (phase === 'before-commit' && p.phase === 'committing') controller.abort() } }), { name: 'AbortError' })
    assert.deepEqual(vfs.bytes(target), [1, 2, 3]); assert(!vfs.nodes.has(stage)); assert(!vfs.log.some(entry => entry.op === 'rename'))
  })
}
for (const count of [1, 2]) {
  test(`abort during commit rename ${count} finishes verification instead of abandoning the rename sequence`, async () => {
    const vfs = setup(), controller = new AbortController()
    vfs.setHook(event => { if (event.op === 'rename' && event.when === 'before' && event.count === count) controller.abort() })
    const result = await run(vfs, { signal: controller.signal })
    assert.equal(result.cancelledAfterCommit, true); assert.equal(result.verified, true); assert.deepEqual(vfs.bytes(target), [7, 8, 9]); assert(!vfs.nodes.has(backup))
  })
}
test('stale session after write prevents all later I/O and keeps concrete recovery paths', async () => {
  const vfs = setup(); let atDisconnect
  vfs.setHook(event => { if (event.op === 'write' && event.when === 'after') { vfs.disconnect(); atDisconnect = vfs.log.length } })
  await assert.rejects(run(vfs), error => { assert.equal(error.code, 'SESSION_CHANGED'); assert.equal(error.recovery.stagePath, stage); assert.equal(error.committed, false); return true })
  assert.equal(vfs.log.length, atDisconnect); assert.deepEqual(vfs.bytes(target), [1, 2, 3]); assert(vfs.nodes.has(stage))
})
test('stage-to-target rename failure restores the verified old backup in the same session', async () => {
  const vfs = setup(); vfs.setHook(event => { if (event.op === 'rename' && event.when === 'before' && event.args[0] === stage) throw new Error('Rename failed') })
  await assert.rejects(run(vfs), error => { assert.equal(error.recovery.restored, true); assert.equal(error.committed, false); return true })
  assert.deepEqual(vfs.bytes(target), [1, 2, 3]); assert(!vfs.nodes.has(stage)); assert(!vfs.nodes.has(backup))
})
test('lost rename acknowledgement is reconciled; verified new target keeps old backup for recovery', async () => {
  const vfs = setup(); vfs.setHook(event => { if (event.op === 'rename' && event.when === 'after' && event.args[0] === stage) throw new Error('ACK lost') })
  await assert.rejects(run(vfs), error => { assert.equal(error.committed, true); assert(error.recoveryFiles.some(file => file.path === backup)); return true })
  assert.deepEqual(vfs.bytes(target), [7, 8, 9]); assert.deepEqual(vfs.bytes(backup), [1, 2, 3])
})
test('uncertain postcommit verification retains old backup and reports unknown state', async () => {
  const vfs = setup(); let replaced = false
  vfs.setHook(event => { if (event.op === 'rename' && event.when === 'after' && event.args[0] === stage) { replaced = true; vfs.nodes.get(target).bytes[0] = 66 } })
  await assert.rejects(run(vfs), error => { assert.equal(error.committed, null); return true })
  assert(replaced); assert.deepEqual(vfs.bytes(backup), [1, 2, 3]); assert(!vfs.log.some(entry => entry.op === 'remove' && entry.args[0] === backup))
})
test('backup cleanup failure is visible even after a successfully verified commit', async () => {
  const vfs = setup(); vfs.setHook(event => { if (event.op === 'remove' && event.when === 'before' && event.args[0] === backup) throw new Error('Cleanup failed') })
  const result = await run(vfs); assert.equal(result.verified, true); assert.deepEqual(result.recoveryFiles.map(file => file.path), [backup]); assert.deepEqual(vfs.bytes(backup), [1, 2, 3])
})
test('session loss during commit does not issue rollback commands into another session', async () => {
  const vfs = setup(); let count
  vfs.setHook(event => { if (event.op === 'rename' && event.when === 'after' && event.count === 1) { vfs.disconnect(); count = vfs.log.length } })
  await assert.rejects(run(vfs), error => { assert.equal(error.committed, null); assert.equal(error.recovery.backupPath, backup); return true })
  assert.equal(vfs.log.length, count); assert.deepEqual(vfs.bytes(backup), [1, 2, 3]); assert(vfs.nodes.has(stage))
})

test('a backup name introduced during staging is not overwritten by commit', async () => {
  const vfs = setup(); vfs.setHook(event => { if (event.op === 'meta' && event.when === 'after') vfs.put(backup, [99]) })
  await assert.rejects(run(vfs), { code: 'UPLOAD_COLLISION' })
  assert.deepEqual(vfs.bytes(backup), [99]); assert.deepEqual(vfs.bytes(target), [1, 2, 3]); assert(!vfs.log.some(entry => entry.op === 'rename'))
})
test('binary snapshots own their bytes even for subclasses with shared slice semantics', async () => {
  const source = Buffer.from([1, 2, 3]), snapshot = await snapshotFile(source)
  source[0] = 99; assert.deepEqual([...snapshot], [1, 2, 3])
})
