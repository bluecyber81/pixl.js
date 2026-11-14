import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncPlan, createSyncJob, executeSyncJob } from '../src/lib/sync-plan.js'
import { createSyncHistory, folderBinding, readSyncHistory } from '../src/lib/sync-history.js'
import { safeUpload } from '../src/lib/safe-upload.js'
import { memoryVfs, localFile, metadata } from './helpers/memory-vfs.mjs'

const rootPath = 'E:/tags', deviceKey = 'test-private-browser-device', localFolder = 'Collection'
const binding = await folderBinding(deviceKey, rootPath, localFolder)
const planFor = (vfs, files, history) => createSyncPlan({...vfs.api, rootPath, deviceKey, localFolder, files, history})
const read = data => readSyncHistory(new Blob([JSON.stringify(data)]), deviceKey, rootPath, localFolder)
const file = (name, value) => localFile(name, [value])
async function fixture(names) {
  const vfs = memoryVfs()
  for (const name of names) vfs.put(rootPath + '/' + name, [1])
  const plan = await planFor(vfs, names.map(name => file(name, 1)))
  const reference = createSyncHistory(plan, binding)
  return { vfs, reference, history:await read(reference) }
}

test('export/import keeps only shared hashes and binds the explicit reference to the device and folder pair', async () => {
  const {reference, history} = await fixture(['One.bin'])
  assert.equal(history.files.get('One.bin').size, 1)
  assert.ok(!JSON.stringify(reference).includes(deviceKey))
  assert.equal(await folderBinding(deviceKey, rootPath + '/', localFolder), binding)
  const blob = new Blob([JSON.stringify(reference)])
  for (const args of [['other',rootPath,localFolder],[deviceKey,'E:/',localFolder],[deviceKey,rootPath,'Other']]) {
    await assert.rejects(readSyncHistory(blob,...args), {code:'SYNC_HISTORY_BINDING'})
  }
  for (const row of [['../bad',1,'0'.repeat(64)],['One.bin',2,'0'.repeat(64)],['one.bin',1,'1'.repeat(64)],['x',1,'NaN']]) {
    await assert.rejects(read({...reference,files:[...reference.files,row]}), {code:'SYNC_HISTORY_INVALID'})
  }
  await assert.rejects(readSyncHistory(new Blob(['{"format":0,"format":1}']),deviceKey,rootPath,localFolder), {code:'SYNC_HISTORY_INVALID'})
})

test('three-way comparison distinguishes two modified copies and both directions of modify/delete', async () => {
  const names = ['both','local','remote','deviceGone','localGone','removeLocalChange','removeDeviceChange','bothGone','identical']
  const {vfs,history} = await fixture(names)
  for (const n of ['both','remote','removeLocalChange','identical']) vfs.put(rootPath+'/'+n, [3])
  for (const n of ['deviceGone','removeDeviceChange','bothGone']) vfs.nodes.delete(rootPath+'/'+n)
  const files = ['both','local','remote','deviceGone','removeDeviceChange','identical'].map(n => file(n,['both','local','removeDeviceChange'].includes(n)?2:n==='identical'?3:1))
  const plan = await planFor(vfs, files, history)
  assert.deepEqual(Object.fromEntries(plan.entries.map(e => [e.relativePath,e.history])),{both:'bothChanged',local:'localChanged',remote:'deviceChanged',deviceGone:'deviceDeleted',removeDeviceChange:'deviceDeletedLocalChanged',identical:undefined})
  assert.deepEqual(plan.deviceOnly.map(e=>[e.path.split('/').pop(),e.history,e.comparison]),[['localGone','localDeleted',undefined],['removeLocalChange','localDeletedDeviceChanged','conflict']])
  assert.deepEqual(plan.entries.filter(e => e.comparison === 'conflict').map(e=>e.relativePath),['both','removeDeviceChange'])
  const next = await read(createSyncHistory(plan,binding,history))
  assert.equal(next.files.has('bothGone'),false)
  for (const n of names.filter(n=>!['bothGone','identical'].includes(n))) assert.deepEqual(next.files.get(n),history.files.get(n))
  assert.notEqual(next.files.get('identical').sha256,history.files.get('identical').sha256)
  const execute = options => executeSyncJob({...vfs.api,deviceKey,files,plan,job:createSyncJob(plan),uploadFile:input=>safeUpload({...vfs.api,...input}),...options})
  const auto = await execute({})
  assert.deepEqual(auto.job.completed,[rootPath+'/local'])
  assert.deepEqual(vfs.bytes(rootPath+'/both'),[3])
  assert.equal(vfs.nodes.has(rootPath+'/deviceGone'),false)
  assert.deepEqual(vfs.bytes(rootPath+'/remote'),[3])
  const manual = await execute({selectedPaths:[rootPath+'/both']})
  assert.deepEqual(vfs.bytes(rootPath+'/both'),[2])
  const after = await read(createSyncHistory(plan,binding,history,manual.job))
  assert.notEqual(after.files.get('both').sha256,history.files.get('both').sha256)
  assert.deepEqual(after.files.get('remote'),history.files.get('remote'))
})

test('only verified success advances the receipt; cancellation, wrong device, stale metadata and bad verification fail closed', async () => {
  const {vfs,history} = await fixture(['changed','stable','new'])
  const files = [file('changed',2),file('stable',1),file('new',1)]
  const plan = await planFor(vfs, files, history)
  const execute = options => executeSyncJob({...vfs.api,deviceKey,files,plan,selectedPaths:[rootPath+'/changed'],uploadFile:input=>safeUpload({...vfs.api,...input}),...options})
  const aborted = new AbortController(); aborted.abort()
  for (const opts of [{signal:aborted.signal},{deviceKey:'other'},{uploadFile:async()=>({verified:false})}]) {
    const job=createSyncJob(plan)
    await assert.rejects(execute({...opts,job}))
    assert.throws(()=>createSyncHistory(plan,binding,history,job), {code:'SYNC_HISTORY_INVALID'})
  }
  vfs.nodes.get(rootPath+'/changed').meta = metadata(0,'changed between comparison and write')
  const job = createSyncJob(plan)
  await assert.rejects(execute({job}),{code:'SYNC_STALE'})
  assert.throws(()=>createSyncHistory(plan,binding,history,job),{code:'SYNC_HISTORY_INVALID'})
  assert.deepEqual(vfs.bytes(rootPath+'/changed'),[1])
})

test('divergent files first seen on both sides stay unselected without a known common version', async () => {
  const {vfs,history} = await fixture(['shared'])
  vfs.put(rootPath+'/new-on-both',[7])
  const files = [file('shared',1),file('new-on-both',8)]
  const plan = await planFor(vfs, files, history)
  assert.equal(plan.entries[1].comparison,'conflict')
  assert.equal(plan.entries[1].history,'noCommonVersion')
  const result = await executeSyncJob({...vfs.api,deviceKey,files,plan,job:createSyncJob(plan),uploadFile:()=>assert.fail('unexpected upload')})
  assert.equal(result.total,0)
  assert.equal((await read(createSyncHistory(plan,binding,history))).files.has('new-on-both'),false)
})
