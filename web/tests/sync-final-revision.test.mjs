import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { decodeRawMetadata } from '../src/lib/raw-metadata.js'
import { createSyncJob, createSyncPlan, executeSyncJob } from '../src/lib/sync-plan.js'
import { localFile, memoryVfs } from './helpers/memory-vfs.mjs'

const root = 'E:/tags'
const deviceKey = 'sync-completion-lcd'
const defaults = new Uint8Array(128).fill(255)
const original = [7, 8, 9]
const changed = [9, 8, 7] // Same size as the prior contents.

async function fixture({ mode, files, resume = true }) {
  const vfs = memoryVfs()
  let generation = 49
  const revision = () => mode === 'legacy' ? null : '00000001' + generation.toString(16).padStart(8, '0')
  const persist = (path, bytes) => vfs.put(path, bytes, decodeRawMetadata(defaults))
  const digest = path => createHash('sha256').update(vfs.nodes.get(path).bytes).digest('hex')
  const controller = new AbortController()
  const io = { writes: [], finalReads: [], finalRevisions: 0 }
  let closing = false
  const plan = await createSyncPlan({ ...vfs.api, files, rootPath: root, deviceKey, readCreateRevision: revision })
  const job = createSyncJob(plan)
  if (resume) {
    persist(`${root}/a`, original)
    generation++
    job.completed.push(`${root}/a`)
    job.state = 'paused'
  }
  const state = {
    job, vfs, io, controller,
    changePriorFile() { persist(`${root}/a`, changed); generation++ },
    run({ onClosing, afterRawWrite, duringFinalRevision } = {}) {
      closing = false
      return executeSyncJob({ ...vfs.api, job, plan, deviceKey, files, signal: controller.signal, quickPacked: true,
        readCreateRevision: () => {
          if (closing) { io.finalRevisions++; duringFinalRevision?.() }
          return revision()
        },
        readFileDigest: async path => {
          if (closing) io.finalReads.push(path)
          return digest(path)
        },
        readFileDigestsBatch: async (records, guard) => {
          assert.equal(guard.revision, revision())
          if (closing) io.finalReads.push(...records.map(row => row.path))
          return records.map(({ path, size }) => ({ path, size, sha256: digest(path) }))
        },
        readFile: async (path, options) => {
          if (closing) io.finalReads.push(path)
          return vfs.api.readFile(path, options)
        },
        createDirectory: async path => {
          await vfs.api.createDirectory(path)
          generation++
        },
        readRawMetadata: async () => defaults.slice(),
        canGuardedCreate: async () => mode === 'guarded' || mode === 'mixed',
        guardedCreate: async (parent, parts, expectedRevision) => {
          assert.equal(expectedRevision, revision())
          for (const { name, bytes } of parts) persist(`${parent}/${name}`, bytes)
          io.writes.push({ mode: 'guarded', count: parts.length })
          generation++
          return revision()
        },
        writeNewPackedFile: async (path, bytes, options) => {
          await options.beforeWrite()
          persist(path, bytes)
          io.writes.push({ mode: 'raw', path })
          generation++
          afterRawWrite?.()
        },
        uploadFile: async () => assert.fail('Unexpected upload adapter'),
        onProgress: update => {
          if (!closing && update.phase === 'syncing' && update.filesDone === files.length) {
            closing = true
            onClosing?.()
          }
        }
      })
    }
  }
  return state
}

for (const mode of ['guarded', 'raw', 'legacy']) {
  test(`resume rejects a changed, previously completed file after the final ${mode} write`, async () => {
    const state = await fixture({ mode, files: [localFile('a'), localFile('b')] })
    await assert.rejects(state.run({ onClosing: state.changePriorFile }), { code: 'SYNC_STALE' })
    assert.equal(state.job.state, 'failed')
    assert.deepEqual(state.vfs.bytes(`${root}/a`), changed)
    assert.deepEqual(state.vfs.bytes(`${root}/b`), original)
    assert.equal(state.io.writes.length, 1)
    assert.equal(state.job.pendingGuarded, undefined)
    await assert.rejects(state.run(), { code: 'SYNC_STALE' })
    assert.equal(state.io.writes.length, 1, 'retry must preserve the externally changed file')
  })

  test(`a stable resumed ${mode} upload completes with a single new file`, async () => {
    const state = await fixture({ mode, files: [localFile('a'), localFile('b')] })
    const result = await state.run()
    assert.equal(state.job.state, 'complete')
    assert.equal(result.completed, 1)
    assert.equal(result.skipped, 1)
    assert.equal(state.io.writes.length, 1)
    if (mode !== 'legacy') assert.deepEqual(state.io.finalReads, [])
  })
}

test('a later guarded receipt cannot hide an external change during an earlier unguarded write', async () => {
  const state = await fixture({ mode: 'mixed', files: [localFile('a'), localFile('large', new Uint8Array(600)), localFile('b')] })
  await assert.rejects(state.run({ afterRawWrite: state.changePriorFile }), { code: 'SYNC_STALE' })
  assert.equal(state.job.state, 'failed')
  assert.equal(state.io.writes[0]?.mode, 'raw')
  assert.deepEqual(state.vfs.bytes(`${root}/a`), changed)
})

test('a chain of confirmed small-file groups finishes by checking the revision without rereading any payload', async () => {
  const files = Array.from({ length: 12 }, (_, index) => localFile(`f${index}`))
  const state = await fixture({ mode: 'guarded', files, resume: false })
  const result = await state.run()
  assert.equal(result.completed, 12)
  assert.deepEqual(state.io.writes, Array(3).fill({ mode: 'guarded', count: 4 }))
  assert.equal(state.io.finalRevisions, 1)
  assert.deepEqual(state.io.finalReads, [])
  assert.equal(state.vfs.log.filter(call => call.op === 'read').length, 0)
})

test('a new folder, a raw write and a guarded group retain their fast combined completion check', async () => {
  const files = [
    { relativePath: 'nested/large', file: localFile('large', new Uint8Array(600)) },
    { relativePath: 'nested/b', file: localFile('b') },
    { relativePath: 'nested/c', file: localFile('c') }
  ]
  const state = await fixture({ mode: 'mixed', files, resume: false })
  const result = await state.run()
  assert.equal(result.completed, 3)
  assert.deepEqual(state.io.writes, [{ mode: 'raw', path: root + '/nested/large' }, { mode: 'guarded', count: 2 }])
  assert.equal(state.io.finalRevisions, 1)
  assert.deepEqual(state.io.finalReads, [])
  assert.equal(state.vfs.log.filter(call => call.op === 'read').length, 0)
})

test('cancellation while the final revision is outstanding leaves the saved job resumable', async () => {
  const state = await fixture({ mode: 'guarded', files: [localFile('a'), localFile('b')] })
  await assert.rejects(state.run({ duringFinalRevision: () => state.controller.abort() }), { code: 'SYNC_CANCELLED' })
  assert.equal(state.job.state, 'paused')
  assert.deepEqual(state.job.completed, [`${root}/a`, `${root}/b`])
})
