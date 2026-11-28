import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncPlan, createSyncJob, executeSyncJob } from '../src/lib/sync-plan.js'
import { memoryVfs, localFile } from './helpers/memory-vfs.mjs'

const root = 'E:/tags'
const first = root + '/a'
const second = root + '/b'
const originalBytes = [7, 8, 9]
const changedBytes = [9, 8, 7]

for (const [scenario, expectedError] of [
  ['stable', null],
  ['generation-change', 'SYNC_STALE'],
  ['disappear', 'SYNC_STALE'],
  ['appear', 'SYNC_STALE'],
  ['legacy-null', null],
  ['abort', 'SYNC_CANCELLED'],
  ['new-mount', 'SYNC_STALE'],
  ['legacy-mode', null]
]) {
  test(`App683 resume: revision transition ${scenario}`, async () => {
    const vfs = memoryVfs()
    const files = [localFile('a', originalBytes), localFile('b', originalBytes)]
    const deviceKey = 'app683-review'
    const controller = new AbortController()
    let epoch = 1
    let generation = 49
    let reads = 0
    let writes = 0
    let available = !['appear', 'legacy-null'].includes(scenario)
    const revision = () => available
      ? epoch.toString(16).padStart(8, '0') + generation.toString(16).padStart(8, '0')
      : null

    const plan = await createSyncPlan({
      ...vfs.api, rootPath: root, deviceKey, files, readCreateRevision: revision
    })
    const job = createSyncJob(plan)
    vfs.put(first, originalBytes)
    generation++
    job.completed.push(first)
    job.state = 'paused'

    // A revision-aware inventory reads its token twice, a legacy inventory once.
    // The next probe is the boundary between the fresh inventory and execution.
    const firstProbeAfterInventory = available ? 3 : 2
    const input = {
      ...vfs.api, job, plan, deviceKey, files, quickPacked: scenario !== 'legacy-mode',
      signal: controller.signal,
      readCreateRevision() {
        if (++reads === firstProbeAfterInventory) {
          switch (scenario) {
            case 'generation-change':
              vfs.put(first, changedBytes)
              generation++
              break
            case 'disappear': available = false; break
            case 'appear': available = true; break
            case 'abort': controller.abort(); break
            case 'new-mount': epoch++; break
          }
        }
        return revision()
      },
      uploadFile: async () => assert.fail('Unexpected upload adapter'),
      async writeNewPackedFile(path, bytes, options) {
        await options.beforeWrite()
        vfs.put(path, bytes)
        generation++
        writes++
      }
    }

    if (expectedError) {
      await assert.rejects(executeSyncJob(input), { code: expectedError })
      assert.equal(writes, 0)
      assert.equal(vfs.nodes.has(second), false)
      assert.deepEqual(vfs.bytes(first), scenario === 'generation-change' ? changedBytes : originalBytes)
    } else {
      const result = await executeSyncJob(input)
      assert.equal(writes, 1)
      assert.equal(result.completed, 1)
      assert.equal(result.skipped, 1)
      assert.equal(job.state, 'complete')
      assert.deepEqual(vfs.bytes(first), originalBytes)
      assert.deepEqual(vfs.bytes(second), originalBytes)
    }
  })
}
