import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncPlan, createSyncJob, executeSyncJob } from '../src/lib/sync-plan.js'
import { safeUpload } from '../src/lib/safe-upload.js'
import { memoryVfs, metadata, localFile } from './helpers/memory-vfs.mjs'

const key = 'browser-device-a'
const compare = (vfs, files, options = {}) => createSyncPlan({ ...vfs.api, rootPath: 'E:/tags', deviceKey: key, files, ...options })
const execute = (vfs, plan, files, options = {}) => executeSyncJob({ ...vfs.api, plan, job: createSyncJob(plan), files, deviceKey: key,
  uploadFile: input => safeUpload({ ...vfs.api, ...input }), ...options })
const isMutation = entry => ['write', 'rename', 'remove', 'mkdir', 'meta'].includes(entry.op)

test('sync blocks readonly or malformed ancestor metadata before any child upload', async () => {
  for (const meta of [metadata(4), {...metadata(),valid:false}]) {
    const vfs=memoryVfs();vfs.nodes.set('E:/tags/locked',{type:1,meta});
    const files=[{relativePath:'locked/new/deep.bin',file:localFile('deep.bin')}];
    const plan=await compare(vfs,files);
    assert.equal(plan.entries[0].status,'blocked');assert.equal(plan.entries[0].reason,'PARENT_BLOCKED');
    await assert.rejects(execute(vfs,plan,files,{selectedPaths:['E:/tags/locked/new/deep.bin']}),{code:'SYNC_SELECTION'});
    assert(!vfs.log.some(isMutation));
  }
})

test('sync local entry limit includes distinct required folders before any device read', async () => {
  const vfs=memoryVfs();let reads=0;
  const files=Array.from({length:2050},(_,i)=>({relativePath:`d${i}/x`,file:{name:'x',size:0,arrayBuffer(){reads++;return Promise.resolve(new ArrayBuffer(0));}}}));
  await assert.rejects(compare(vfs,files),{code:'SYNC_LIMIT'});
  assert.equal(vfs.log.length,0);assert.equal(reads,0);
})

test('sync rechecks ancestor metadata after preview and before creating a child', async () => {
  for(const when of ['before-preflight','after-preflight']) {
    const vfs=memoryVfs();vfs.nodes.set('E:/tags/series',{type:1,meta:metadata()});
    const files=[{relativePath:'series/new/x',file:localFile('x')}],plan=await compare(vfs,files);
    if(when==='before-preflight')vfs.nodes.get('E:/tags/series').meta=metadata(4);
    else { let parentReads=0;vfs.setHook(event=>{if(event.op==='list'&&event.when==='after'&&event.args[0]==='E:/tags'&&++parentReads===2){
      event.value.find(e=>e.name==='series').meta=metadata(4);vfs.nodes.get('E:/tags/series').meta=metadata(4);
    }});}
    await assert.rejects(execute(vfs,plan,files),{code:'SYNC_STALE'});assert(!vfs.log.some(isMutation));
  }
})

test('selected sync folder and all its ancestors are protected, including changes during local hashing',async()=>{
 for(const locked of ['E:/tags','E:/tags/series']){
  const vfs=memoryVfs();vfs.nodes.set('E:/tags/series',{type:1,meta:metadata()});vfs.nodes.get(locked).meta=metadata(4);
  const files=[localFile('x')],plan=await compare(vfs,files,{rootPath:'E:/tags/series'});
  assert.equal(plan.entries[0].status,'blocked');assert.equal(plan.entries[0].reason,'PARENT_BLOCKED');assert(!vfs.log.some(isMutation));
 }
 const vfs=memoryVfs();let reads=0;const files=[{name:'x',size:1,arrayBuffer:async()=>{if(++reads===3)vfs.nodes.get('E:/tags').meta=metadata(4);return Uint8Array.of(7).buffer;}}];
 const plan=await compare(vfs,files);await assert.rejects(execute(vfs,plan,files),{code:'SYNC_STALE'});assert(!vfs.log.some(isMutation));
})

test('oversized new file and folder names fail before listing, hashing, or creating any folder', async () => {
  for (const name of ['x'.repeat(48), 'é'.repeat(24)]) {
    for (const relativePath of [name, name + '/x']) {
      const vfs = memoryVfs()
      await assert.rejects(compare(vfs, [{ relativePath, file: localFile('x') }], { rootPath: 'E:/' }), { code: 'NAME_LIMIT' })
      assert.equal(vfs.log.length, 0)
    }
  }
})

test('sync keeps exact 47-byte names and 63-byte internal paths including the leading slash', async () => {
  const name = 'ä'.repeat(23) + 'x'
  const directory = 'ö'.repeat(7)
  const relativePath = directory + '/' + name
  const vfs = memoryVfs()
  const plan = await compare(vfs, [{ relativePath, file: localFile(name) }], { rootPath: 'E:/' })
  assert.deepEqual(plan.entries.map(entry => [entry.targetPath, entry.status]), [['E:/' + relativePath, 'add']])
  assert.ok(!vfs.log.some(isMutation))
})

test('comparison is read-only, hashes bytes rather than names/sizes and lists device-only files without deleting', async () => {
  const vfs = memoryVfs(); vfs.put('E:/tags/same.bin', [1, 2]); vfs.put('E:/tags/change.bin', [1, 2]); vfs.put('E:/tags/device.bin', [99])
  const files = [localFile('same.bin', [1, 2]), localFile('change.bin', [3, 4]), localFile('new.bin', [5])]
  const plan = await compare(vfs, files)
  assert.deepEqual(plan.entries.map(entry => entry.status), ['same', 'change', 'add'])
  assert.deepEqual(plan.summary, { add: 1, change: 1, same: 1, blocked: 0, deviceOnly: 1 })
  assert.deepEqual(plan.deviceOnly, [{ path: 'E:/tags/device.bin', size: 1 }]); assert(!vfs.log.some(isMutation)); assert(Object.isFrozen(plan.entries[0]))
})
test('recursive plan and execution create only required folders and transfer only changed files', async () => {
  const vfs = memoryVfs(); vfs.put('E:/tags/same.bin', [1]); vfs.put('E:/tags/keep.bin', [99])
  const files = [localFile('same.bin', [1]), { relativePath: 'series/link.bin', file: localFile('link.bin', [3, 4]) }]
  const plan = await compare(vfs, files), result = await execute(vfs, plan, files)
  assert.equal(result.completed, 1); assert.deepEqual(vfs.bytes('E:/tags/series/link.bin'), [3, 4]); assert.deepEqual(vfs.bytes('E:/tags/keep.bin'), [99])
  assert.equal(vfs.log.filter(entry => entry.op === 'write').length, 1)
  assert(!vfs.log.some(entry => entry.op === 'remove' && entry.args[0].includes('keep.bin')))
})
test('selected paths explicitly restrict changes and may omit blocked entries', async () => {
  const vfs = memoryVfs(); vfs.put('E:/tags/locked.bin', [0], metadata(4))
  const files = [localFile('one.bin'), localFile('two.bin'), localFile('locked.bin')], plan = await compare(vfs, files)
  await execute(vfs, plan, files, { selectedPaths: ['E:/tags/one.bin'] })
  assert(vfs.nodes.has('E:/tags/one.bin')); assert(!vfs.nodes.has('E:/tags/two.bin')); assert.deepEqual(vfs.bytes('E:/tags/locked.bin'), [0])
  await assert.rejects(execute(vfs, plan, files, { selectedPaths: ['E:/tags/locked.bin'] }), { code: 'SYNC_SELECTION' })
})
test('case, Unicode and file/folder collisions are rejected before device I/O', async () => {
  const vfs = memoryVfs()
  for (const files of [[localFile('A.bin'), localFile('a.bin')], [localFile('Café.bin'), localFile('Cafe\u0301.bin')],
    [{ relativePath: 'a/x.bin', file: localFile('x.bin') }, { relativePath: 'A/y.bin', file: localFile('y.bin') }],
    [localFile('series'), { relativePath: 'series/x.bin', file: localFile('x.bin') }]]) await assert.rejects(compare(vfs, files))
  assert.equal(vfs.log.length, 0)
})
test('existing differently spelled aliases and directory conflicts are blocked, not silently renamed', async () => {
  const vfs = memoryVfs(); vfs.put('E:/tags/A.bin', [3]); vfs.nodes.set('E:/tags/folder', { type: 1, meta: metadata() }); vfs.put('E:/tags/series', [4])
  const plan = await compare(vfs, [localFile('a.bin'), localFile('folder'), { relativePath: 'series/x.bin', file: localFile('x.bin') }])
  assert.deepEqual(plan.entries.map(entry => entry.status), ['blocked', 'blocked', 'blocked']); assert(!vfs.log.some(isMutation))
})
test('an unrelated legacy Windows-incompatible filename remains visible and is never addressed for mutation', async () => {
  const vfs = memoryVfs(); vfs.put('E:/tags/CON.bin', [8]); const files = [localFile('new.bin')], plan = await compare(vfs, files)
  assert.equal(plan.deviceOnly[0].path, 'E:/tags/CON.bin'); await execute(vfs, plan, files)
  assert.deepEqual(vfs.bytes('E:/tags/CON.bin'), [8])
})
test('device identity and altered plan fingerprints reject before any new I/O', async () => {
  const vfs = memoryVfs(), files = [localFile('a.bin')], plan = await compare(vfs, files), count = vfs.log.length
  await assert.rejects(execute(vfs, plan, files, { deviceKey: 'brother-device' }), { code: 'SYNC_STALE' }); assert.equal(vfs.log.length, count)
  const changed = structuredClone(plan); changed.entries[0].sha256 = '0'.repeat(64)
  await assert.rejects(execute(vfs, changed, files), { code: 'SYNC_STALE' }); assert.equal(vfs.log.length, count)
})
test('same-size remote changes after comparison fail before mutation', async () => {
  const vfs = memoryVfs(); vfs.put('E:/tags/a.bin', [1, 2]); const files = [localFile('a.bin', [3, 4])], plan = await compare(vfs, files)
  vfs.put('E:/tags/a.bin', [5, 6]); await assert.rejects(execute(vfs, plan, files), { code: 'SYNC_STALE' }); assert(!vfs.log.some(isMutation))
})
test('same-size local changes and changed selection fail before mutation', async () => {
  const vfs = memoryVfs(), files = [localFile('a.bin', [1, 2])], plan = await compare(vfs, files)
  await assert.rejects(execute(vfs, plan, [localFile('a.bin', [3, 4])]), { code: 'SYNC_LOCAL_CHANGED' })
  await assert.rejects(execute(vfs, plan, [localFile('b.bin', [1, 2])]), { code: 'SYNC_LOCAL_CHANGED' }); assert(!vfs.log.some(isMutation))
})
test('resume re-reads completed contents and skips only exactly matching files', async () => {
  const vfs = memoryVfs(), files = [localFile('a.bin', [1]), localFile('b.bin', [2])], plan = await compare(vfs, files), job = createSyncJob(plan)
  let count = 0
  await assert.rejects(execute(vfs, plan, files, { job, uploadFile: async input => { if (++count === 2) throw new Error('Transient failure'); return safeUpload({ ...vfs.api, ...input }) } }))
  assert.deepEqual(job.completed, ['E:/tags/a.bin']); assert.equal(job.state, 'failed')
  const before = vfs.log.filter(entry => entry.op === 'write').length, result = await execute(vfs, plan, files, { job })
  assert.equal(result.skipped, 1); assert.equal(result.completed, 1); assert.equal(vfs.log.filter(entry => entry.op === 'write').length, before + 1); assert.equal(job.state, 'complete')
})
test('resume refuses changed completed contents instead of trusting the journal', async () => {
  const vfs = memoryVfs(), files = [localFile('a.bin', [1])], plan = await compare(vfs, files), job = createSyncJob(plan)
  await execute(vfs, plan, files, { job }); vfs.put('E:/tags/a.bin', [9]); const before = vfs.log.filter(isMutation).length
  await assert.rejects(execute(vfs, plan, files, { job }), { code: 'SYNC_STALE' }); assert.equal(vfs.log.filter(isMutation).length, before)
})
test('cancellation during read-only comparison and stale session cannot reach mkdir/upload', async () => {
  for (const mode of ['abort', 'disconnect']) {
    const vfs = memoryVfs(), files = [localFile('a.bin')], plan = await compare(vfs, files), controller = new AbortController()
    vfs.setHook(event => { if (event.op === 'list' && event.when === 'after') { if (mode === 'abort') controller.abort(); else vfs.disconnect() } })
    await assert.rejects(execute(vfs, plan, files, { signal: controller.signal })); assert(!vfs.log.some(isMutation))
  }
})
test('cancellation after one committed file stores its checkpoint and prevents the next write', async () => {
  const vfs = memoryVfs(), files = [localFile('a.bin'), localFile('b.bin')], plan = await compare(vfs, files), job = createSyncJob(plan), controller = new AbortController()
  await assert.rejects(execute(vfs, plan, files, { job, signal: controller.signal, uploadFile: async input => { const result = await safeUpload({ ...vfs.api, ...input }); controller.abort(); return result } }), { name: 'AbortError' })
  assert.deepEqual(job.completed, ['E:/tags/a.bin']); assert.equal(job.state, 'paused'); assert(!vfs.nodes.has('E:/tags/b.bin'))
})
test('local source changes between preflight and upload are checked again before writing', async () => {
  const vfs = memoryVfs(); let reads = 0
  const file = { name: 'a.bin', size: 1, arrayBuffer: async () => new Uint8Array([++reads <= 2 ? 1 : 2]).buffer }
  const plan = await compare(vfs, [file]); await assert.rejects(execute(vfs, plan, [file]), { code: 'SYNC_LOCAL_CHANGED' }); assert(!vfs.log.some(entry => entry.op === 'write'))
})
test('UTF-8 byte and size limits are validated before scanning the device', async () => {
  const vfs = memoryVfs()
  await assert.rejects(compare(vfs, [{ relativePath: 'é'.repeat(20) + '/' + 'é'.repeat(11), file: localFile('x') }]), { code: 'PATH_LIMIT' })
  await assert.rejects(compare(vfs, [{ name: 'x', size: 2 * 1024 * 1024 + 1, arrayBuffer: async () => { throw new Error('Must not read') } }]), { code: 'SYNC_SIZE' })
  assert.equal(vfs.log.length, 0)
})

test('two immediate Execute calls cannot both claim the same job across crypto await', async () => {
  const vfs = memoryVfs(), files = [localFile('a.bin')], plan = await compare(vfs, files), job = createSyncJob(plan)
  const first = execute(vfs, plan, files, { job })
  await assert.rejects(execute(vfs, plan, files, { job }), { code: 'SYNC_STALE' })
  await first
  assert.equal(vfs.log.filter(entry => entry.op === 'write').length, 1)
})
