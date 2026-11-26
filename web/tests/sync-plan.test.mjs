import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncPlan, createSyncJob, executeSyncJob } from '../src/lib/sync-plan.js'
import { safeUpload } from '../src/lib/safe-upload.js'
import { createHash } from 'node:crypto'
import { memoryVfs, metadata, localFile } from './helpers/memory-vfs.mjs'

const key = 'browser-device-a'
const compare = (vfs, files, options = {}) => createSyncPlan({ ...vfs.api, rootPath: 'E:/tags', deviceKey: key, files, ...options })
const execute = (vfs, plan, files, options = {}) => executeSyncJob({ ...vfs.api, plan, job: createSyncJob(plan), files, deviceKey: key,
  uploadFile: input => safeUpload({ ...vfs.api, ...input }), ...options })
const isMutation = entry => ['write', 'rename', 'remove', 'mkdir', 'meta'].includes(entry.op)

function packedComparison(vfs) {
  const calls = {groups:[], single:[]}
  const hash = path => createHash('sha256').update(vfs.nodes.get(path).bytes).digest('hex')
  const options = {
    syncSession:1, readCreateRevision:async () => '0000000100000031',
    readFileDigest:async path => { calls.single.push(path); return hash(path) },
    readFileDigestsBatch:async (group, {revision}) => {
      assert.equal(revision, '0000000100000031')
      calls.groups.push(group)
      return group.map(row => ({...row, sha256:hash(row.path)}))
    }
  }
  return {calls, options}
}

test('existing-folder comparison batches small hashes and reuses its verified inventory only on the same session and revision', async () => {
  for (const state of ['current', 'changed revision', 'new session', 'unavailable revision']) {
    const vfs = memoryVfs(), {calls, options} = packedComparison(vfs)
    const files = Array.from({length:8}, (_,i) => localFile('f'+i,[i]))
    for (const [i, file] of files.entries()) vfs.put('E:/tags/'+file.name, [i])
    files.push(localFile('new'))
    const plan = await compare(vfs, files, options)
    assert.deepEqual(calls.groups.map(group=>group.length), [4,4])
    assert.equal(calls.single.length, 0)
    if (state === 'changed revision') {
      options.readCreateRevision = async () => '0000000100000032'
      options.readFileDigestsBatch = async group => { calls.groups.push(group); return null }
    }
    if (state === 'new session') options.syncSession++
    if (state === 'unavailable revision') options.readCreateRevision = async () => { throw Object.assign(Error(), {cmd:0x22,status:1}) }
    const result = await execute(vfs, plan, files, options)
    assert.equal(result.completed, 1)
    if (state === 'unavailable revision') assert.ok(calls.single.length >= 8)
    else assert.equal(calls.groups.length === 2, state === 'current')
    assert.deepEqual(vfs.bytes('E:/tags/new'), [7,8,9])
  }
})

test('group identity, size, hash and complete replies are checked before any upload, and only capability absence falls back', async () => {
  const vfs = memoryVfs(), {options, calls} = packedComparison(vfs)
  const files = [localFile('a'), localFile('b')]
  for (const file of files) vfs.put('E:/tags/'+file.name, [7,8,9])
  for (const mutate of [rows=>rows.reverse(), rows=>rows.slice(1), rows=>{rows[0].sha256='invalid'; return rows},
    rows=>{rows[1].size++; return rows}]) {
    await assert.rejects(compare(vfs, files, {...options, readFileDigestsBatch:async (...args)=>mutate(await options.readFileDigestsBatch(...args))}), {code:'SYNC_CHANGED'})
  }
  await assert.rejects(compare(vfs, files, {...options, readFileDigestsBatch:async ()=>{throw Error('link lost')}}), /link lost/)
  assert.equal(calls.single.length, 0)
  const plan = await compare(vfs, files, {...options, readFileDigestsBatch:async ()=>null})
  assert.equal(plan.summary.same, 2)
  assert.equal(calls.single.length, 2)
  const decline = async () => { throw Object.assign(Error('No idle PackedFS revision'), {cmd:0x22,status:1}) }
  const ordinary = await compare(vfs, files, {...options, readCreateRevision:decline})
  assert.equal(ordinary.summary.same,2)
  assert.equal(calls.single.length,4)
  await assert.rejects(compare(vfs, files, {...options, readCreateRevision:async ()=>{throw Error('link lost')}}), /link lost/)
  assert(!vfs.log.some(isMutation))
})

test('a reused preview rechecks local files and stops if the storage changes while validating them', async () => {
  const vfs = memoryVfs(), {options} = packedComparison(vfs)
  const files = [localFile('a'),localFile('b')]
  const plan = await compare(vfs, files, options)
  await assert.rejects(execute(vfs, plan, [localFile('a',[0,0,0]), files[1]], options), {code:'SYNC_LOCAL_CHANGED'})
  let calls = 0
  await assert.rejects(execute(vfs, plan, files, {...options, readCreateRevision:async () => ++calls === 1 ? '0000000100000031' : '0000000100000032'}), {code:'SYNC_STALE'})
  assert(!vfs.log.some(isMutation))
})

test('comparison includes device-only trees and resuming an upload only revisits branches with local targets', async () => {
  const vfs = memoryVfs(), files = [localFile('hero.bin')]
  for (let i = 0; i < 55; i++) {
    const path = 'E:/tags/library' + i
    vfs.nodes.set(path, {type:1, meta:metadata()})
    vfs.put(path + '/existing.bin', [i])
  }
  const plan = await compare(vfs, files)
  assert.equal(plan.deviceOnly.length, 55)
  const revisited = []
  const result = await execute(vfs, plan, files, { readDirectory: async path => {
    revisited.push(path)
    return vfs.api.readDirectory(path)
  } })
  assert.equal(result.completed, 1)
  assert.ok(revisited.includes('E:/tags'))
  assert.ok(!revisited.some(path => path.startsWith('E:/tags/library')))
  assert.deepEqual(vfs.bytes('E:/tags/library54/existing.bin'), [54])
})

test('small-file digests verify staged, committed and previously completed data; fallback rereads bytes', async () => {
  const {sha256Bytes} = await import('../src/lib/safe-upload.js')
  const vfs = memoryVfs(), files = [localFile('a.bin'), localFile('b.bin')]
  const plan = await compare(vfs, files), job = createSyncJob(plan), digests = []
  const readFileDigest = async (path, size) => {
    const data = Uint8Array.from(vfs.bytes(path))
    assert.equal(data.length, size)
    digests.push(path)
    return sha256Bytes(data)
  }
  let calls = 0
  await assert.rejects(execute(vfs, plan, files, {job, readFileDigest, uploadFile: input => {
    if (++calls === 2) throw Error('link lost')
    return safeUpload({...vfs.api, ...input, readFileDigest})
  }}), /link lost/)
  assert.deepEqual(job.completed, ['E:/tags/a.bin'])
  assert.equal(digests.length, 2)
  assert.equal(digests[1], 'E:/tags/a.bin')
  assert.equal(vfs.log.filter(x => x.op === 'read').length, 0)

  vfs.put('E:/tags/a.bin', [9, 9, 9])
  const writes = vfs.log.filter(isMutation).length
  await assert.rejects(execute(vfs, plan, files, {job, readFileDigest}), {code:'SYNC_STALE'})
  assert.equal(vfs.log.filter(isMutation).length, writes)
  await assert.rejects(compare(vfs, files, {readFileDigest: async () => ''}), {code:'UPLOAD_VERIFY'})
  const changed = await compare(vfs, files, {readFileDigest:async () => null})
  assert.equal(changed.entries[0].status, 'change')
  assert.ok(vfs.log.some(x => x.op === 'read' && x.args[0] === 'E:/tags/a.bin'))
})

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

test('rejected names identify the original input before any local or device read', async () => {
  for (const [names, code, details] of [
    [['Link.bin', 'link.bin'], 'SYNC_COLLISION', { first: 'E:/Link.bin', second: 'E:/link.bin' }],
    [['CON.bin'], 'NAME_PORTABLE', { value: 'CON.bin' }],
    [['e\u0301.bin'], 'NAME_NORMALIZATION', { value: 'e\u0301.bin', normalized: 'é.bin' }]
  ]) {
    const vfs = memoryVfs();
    let reads = 0;
    const files = names.map(name => ({ name, size: 1, arrayBuffer() { ++reads; throw Error('unexpected read'); } }));
    await assert.rejects(compare(vfs, files, { rootPath: 'E:/' }), { code, details });
    assert.equal(reads, 0);
    assert.equal(vfs.log.length, 0);
  }
});

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
test('comparison inventories a protected device folder and distinguishes contents without allowing uploads', async () => {
  const vfs = memoryVfs()
  vfs.nodes.get('E:/tags').meta = metadata(4)
  vfs.put('E:/tags/remote.bin', [1])
  vfs.put('E:/tags/same.bin', [2])
  vfs.put('E:/tags/different.bin', [3])
  const files = [localFile('same.bin', [2]), localFile('different.bin', [4]), localFile('local.bin', [5])]
  const plan = await compare(vfs, files)
  assert.deepEqual(plan.entries.map(e => [e.status, e.comparison]), [['blocked', 'same'], ['blocked', 'change'], ['blocked','add']])
  assert.deepEqual(plan.deviceOnly, [{path:'E:/tags/remote.bin', size:1}])
  await assert.rejects(execute(vfs, plan, files, {selectedPaths:['E:/tags/different.bin']}), {code:'SYNC_SELECTION'})
  assert(!vfs.log.some(isMutation))
})

test('a missing or renamed root does not produce spurious device inventory results', async () => {
  const vfs = memoryVfs()
  await assert.rejects(compare(vfs, [localFile('new.bin')], {rootPath:'E:/other'}), {code:'SYNC_STALE'})
  assert(!vfs.log.some(isMutation))
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
  assert.equal(result.skipped, 1); assert.equal(result.completed, 1); assert.equal(result.uploadedBytes, 1)
  assert.equal(vfs.log.filter(entry => entry.op === 'write').length, before + 1); assert.equal(job.state, 'complete')
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


test('PackedFS folder additions publish directly, hash each result, and reserve the staged replacement path for existing files', async () => {
  const vfs = memoryVfs()
  vfs.put('E:/tags/old.bin', [0], metadata(0, 'keep this note'))
  const files = [localFile('one', []), localFile('old.bin', [4]),
    { relativePath:'series/two', file:localFile('two', [1, 2]) },
    { relativePath:'series/three', file:localFile('three', [3]) }]
  const plan = await compare(vfs, files)
  const direct = [], replacements = []
  await execute(vfs, plan, files, {
    writeNewPackedFile: async (path, bytes, options) => {
      direct.push(path)
      assert.deepEqual(options.rawMeta128, new Uint8Array(128).fill(255))
      await options.beforeWrite()
      await vfs.api.writeFile(path, bytes, options)
    },
    uploadFile: options => {
      replacements.push(options.path)
      return safeUpload({...vfs.api, ...options})
    }
  })
  assert.deepEqual(replacements, ['E:/tags/old.bin'])
  assert.deepEqual(direct, ['E:/tags/one', 'E:/tags/series/two', 'E:/tags/series/three'])
  assert.equal(vfs.nodes.get(replacements[0]).meta.notes, 'keep this note')
  for (const path of direct) assert(vfs.log.some(event => event.op === 'read' && event.args[0] === path))
  assert.equal(vfs.log.filter(event => event.op === 'mkdir').length, 1)
  assert.deepEqual(vfs.bytes('E:/tags/one'), [])
  assert.deepEqual(vfs.bytes('E:/tags/series/three'), [3])
})

test('the locked PackedFS guard detects late collisions, parent changes and cancellation without committing a file', async () => {
  for (const change of ['exact', 'case', 'parent permission', 'ancestor permission', 'folder', 'abort']) {
    const vfs = memoryVfs()
    const parent = 'E:/tags/series', path = parent + '/New.bin'
    vfs.nodes.set(parent, {type:1, meta:metadata()})
    const files = [{relativePath:'series/New.bin', file:localFile('New.bin', [])}]
    const plan = await compare(vfs, files), controller = new AbortController()
    let afterGuard = false, collision
    await assert.rejects(execute(vfs, plan, files, { signal:controller.signal,
      writeNewPackedFile: async (_path, _bytes, {beforeWrite}) => {
        if (change === 'exact' || change === 'case') {
          collision = change === 'exact' ? path : parent + '/new.bin'
          vfs.put(collision, [9])
        }
        if (change === 'parent permission') vfs.nodes.get(parent).meta = metadata(4)
        if (change === 'ancestor permission') vfs.nodes.get('E:/tags').meta = metadata(4)
        if (change === 'folder') vfs.nodes.set(path, {type:1, meta:metadata()})
        if (change === 'abort') controller.abort()
        await beforeWrite()
        afterGuard = true
      }
    }), change)
    assert.equal(afterGuard, false, change)
    if (collision) assert.deepEqual(vfs.bytes(collision), [9])
    else if (change === 'folder') assert.equal(vfs.nodes.get(path).type, 1)
    else assert(!vfs.nodes.has(path))
  }
})

test('a cut before or after PackedFS CLOSE resumes with just the planned files and verified bytes', async () => {
  for (const lostCloseReply of [false, true]) {
    const vfs = memoryVfs(), files = [localFile('a'),localFile('b')], written = []
    // Other uploads can own recovery files in this same folder.
    const foreignStage = 'E:/tags/~u0123456789ab'
    vfs.put(foreignStage, [0x51, 0x52])
    const plan = await compare(vfs, files), job = createSyncJob(plan)
    let cut = true
    const run = () => execute(vfs, plan, files, {job, writeNewPackedFile: async (path, bytes, {beforeWrite}) => {
      await beforeWrite()
      written.push(path)
      if (cut && path.endsWith('/b')) {
        cut = false
        if (lostCloseReply) vfs.put(path, bytes)
        vfs.disconnect()
        vfs.api.assertSession()
      }
      vfs.put(path, bytes)
    }})
    await assert.rejects(run(), {code:'SESSION_CHANGED'})
    assert.deepEqual(job.completed, ['E:/tags/a'])
    assert.equal(vfs.nodes.has('E:/tags/b'), lostCloseReply)
    vfs.reconnect()
    const result = await run()
    assert.equal(result.skipped, lostCloseReply ? 2 : 1)
    assert.equal(written.length, lostCloseReply ? 2 : 3)
    assert.deepEqual([...vfs.nodes.keys()].sort(), ['E:/','E:/tags','E:/tags/a','E:/tags/b',foreignStage])
    assert.deepEqual(vfs.bytes(foreignStage), [0x51, 0x52])
    assert.deepEqual(vfs.bytes('E:/tags/b'), [7,8,9])
  }
})

test('an incorrect device hash after PackedFS CLOSE is never checkpointed as verified', async () => {
  const vfs = memoryVfs(), files = [localFile('a')]
  const plan = await compare(vfs, files), job = createSyncJob(plan)
  await assert.rejects(execute(vfs, plan, files, {job,
    writeNewPackedFile: async (path, _bytes, {beforeWrite}) => {
      await beforeWrite()
      vfs.put(path, [9,9,9])
    }
  }), {code:'SYNC_VERIFY'})
  assert.deepEqual(job.completed, [])
})
