// Host model only. Pass the private comparison fixture directory; no BLE access.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { memoryVfs, metadata } from '../tests/helpers/memory-vfs.mjs'
import * as candidate from '../src/lib/sync-plan.js'

const fixture = process.argv[2]
if (!fixture) throw Error('Usage: node web/scripts/benchmark-existing-folder.mjs <folder containing fixture.json and Collection/>')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const manifestBytes = await readFile(join(fixture, 'fixture.json'))
assert.equal(sha(manifestBytes), 'ff21262037114d9c879e06092e7b564f8612a733e2db2740bf370eae1094dc37')
const manifest = JSON.parse(manifestBytes)
const files = await Promise.all(manifest.entries.map(async entry => {
  const bytes = await readFile(join(fixture, 'Collection', entry.path))
  assert.equal(bytes.length, entry.size)
  assert.equal(sha(bytes), entry.sha256)
  return {relativePath:entry.path, file:new File([bytes], entry.path.split('/').at(-1))}
}))
assert.equal(files.length, 1081)
assert.equal(files.reduce((sum, row)=>sum+row.file.size,0), 658806)
let comparisonFiles = files
if (process.argv[3]) {
  const order = JSON.parse(await readFile(process.argv[3], 'utf8'))
  const byPath = new Map(files.map(row=>[row.relativePath,row]))
  assert.equal(order.length,files.length)
  assert.equal(new Set(order).size,files.length)
  comparisonFiles = order.map(path=>{ assert(byPath.has(path)); return byPath.get(path) })
}

// Load the released planner itself, including its actual preflight implementation.
const priorCommit = '85427d801d6ffb90b14e9e15b9edf42b88839ce9'
const lib = new URL('../src/lib/', import.meta.url)
const previous = execFileSync('git', ['show', priorCommit+':web/src/lib/sync-plan.js'], {cwd:dirname(fileURLToPath(import.meta.url)), encoding:'utf8'})
const priorModule = previous.replace(/from '(\.\/[^']+)'/g, (_, path)=>"from '"+new URL(path,lib).href+"'")
const prior = await import('data:text/javascript;base64,'+Buffer.from(priorModule).toString('base64'))

async function run(planner, mode) {
  const midFile = mode === 'interrupt-during-33'
  const root = midFile ? 'E:/T/Collection' : 'E:/tags', vfs = memoryVfs(), key = 'test-device'
  if (midFile) {
    vfs.nodes.set('E:/T', {type:1, meta:metadata()})
    vfs.nodes.set(root, {type:1, meta:metadata()})
  }
  const foreign = root+'/~u0123456789ab'
  if (!midFile) vfs.put(foreign, [1,3,5])
  const originalNodes = vfs.nodes.size
  for (const path of manifest.directories) vfs.nodes.set(root+'/'+path, {type:1, meta:metadata()})
  const initial = mode === 'add-four' ? files.length-4 : 0
  for (const row of files.slice(0, initial)) vfs.put(root+'/'+row.relativePath, new Uint8Array(await row.file.arrayBuffer()))
  let revision = 1, writes = 0, attempts = 0, interrupted = null
  const counts = {list:0, singleDigest:0, groupDigest:0, revision:0}
  const revisionToken = ()=> '00000001'+revision.toString(16).padStart(8,'0')
  const options = {
    ...vfs.api, syncSession:1, quickPacked:true, rootPath:root, files:midFile ? comparisonFiles : files, deviceKey:key, maxRequestPayload:243,
    readDirectory:async path=>{counts.list++; return vfs.api.readDirectory(path)},
    readCreateRevision:async ()=>{counts.revision++; return revisionToken()},
    readFileDigest:async path=>{counts.singleDigest++; return sha(vfs.nodes.get(path).bytes)},
    readFileDigestsBatch:async (rows, request)=>{
      counts.groupDigest++
      assert.equal(request.revision, revisionToken())
      return rows.map(row=>({...row, sha256:sha(vfs.nodes.get(row.path).bytes)}))
    },
    uploadFile:async ()=>assert.fail('Unexpected replacement'),
    writeNewPackedFile:async (path, bytes, {beforeWrite})=>{
      await beforeWrite()
      assert(!vfs.nodes.has(path), 'Unexpected overwrite or replay')
      attempts++
      if (midFile && attempts === 33) {
        assert(bytes.length > 242)
        // RAW128 keeps all received fragments private until the atomic CLOSE.
        interrupted = {afterBytes:242, pathSha256:sha(path.slice(root.length+1))}
        vfs.disconnect()
        vfs.api.assertSession()
      }
      vfs.put(path, bytes); revision++; writes++
      if (mode === 'interrupt-after-33' && writes === 33) {
        interrupted = {afterBytes:bytes.length, pathSha256:sha(path.slice(root.length+1))}
        vfs.disconnect()
        vfs.api.assertSession()
      }
    }
  }
  const plan = await planner.createSyncPlan(options)
  const job = planner.createSyncJob(plan)
  const execute = ()=>planner.executeSyncJob({...options, plan, job})
  if (mode !== 'add-four') {
    await assert.rejects(execute(), {code:'SESSION_CHANGED'})
    assert.equal(job.completed.length,32)
    vfs.reconnect(); options.syncSession++
  }
  const result = await execute()
  assert.equal(result.completed+result.skipped,files.length-initial)
  assert.equal(writes,files.length-initial)
  assert.equal(vfs.nodes.size,originalNodes+manifest.directories.length+files.length)
  for (const entry of manifest.entries) assert.equal(sha(vfs.nodes.get(root+'/'+entry.path).bytes),entry.sha256)
  if (!midFile) assert.deepEqual(vfs.bytes(foreign),[1,3,5])
  return {filesVerified:files.length, extraFiles:0, writes, attempts, interrupted, resumedSkipped:result.skipped, counts,
    digestCommands:counts.singleDigest+counts.groupDigest}
}

const report = {model:'memoryVfs', baselineCommit:priorCommit, fixtureSha256:sha(manifestBytes), bytes:manifest.bytes,
  midFileOrderSha256:sha(comparisonFiles.map(row=>row.relativePath).join('\n'))}
for (const mode of ['interrupt-after-33','add-four','interrupt-during-33']) {
  report[mode] = {baseline:await run(prior,mode), candidate:await run(candidate,mode)}
}
console.log(JSON.stringify(report,null,2))
