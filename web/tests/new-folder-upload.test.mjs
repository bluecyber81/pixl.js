import test from 'node:test'
import assert from 'node:assert/strict'
import { newFolderUploadRoot, executeNewFolderUpload, prepareLeafUploads, pendingFolderUpload } from '../src/lib/new-folder-upload.js'
import { createSyncPlan, createSyncJob, executeSyncJob } from '../src/lib/sync-plan.js'
import { sha256Bytes } from '../src/lib/safe-upload.js'
import { decodeRawMetadata } from '../src/lib/raw-metadata.js'

const root = 'E:/parent'
const target = root + '/ManySmall'
const identity = 'test-lcd'
const free = 1024 * 1024
const newMetadata = () => decodeRawMetadata(new Uint8Array(128).fill(255))
const directory = () => ({type:1, meta:newMetadata()})
const bytesOf = n => Uint8Array.from({length:540}, (_, j) => (n + j) % 256)
const parentOf = path => path.slice(0, path.lastIndexOf('/')) + (path.lastIndexOf('/') === 2 ? '/' : '')
function local(relativePath, n) {
  return {relativePath, file:new File([bytesOf(n)], relativePath.split('/').at(-1))}
}
const fixtureFiles = () => [local('ManySmall/f000.bin', 0), local('ManySmall/f001.bin', 1), local('ManySmall/nest/f002.bin', 2)]

// Models the PackedFS guarantees the fast path relies on: exclusive MKDIR, a
// raw128 OPEN that publishes both data and metadata on CLOSE, and no-clobber
// subtree RENAME. Each operation can lose its reply after durable publication.
function packedVfs() {
  const nodes = new Map([['E:/',directory()], [root,directory()]])
  const actions = []
  let alive = true, hook = () => {}
  const check = () => {
    if (!alive) throw Object.assign(new Error('Link lost'), {code:'DISCONNECTED'})
  }
  async function event(kind, path, phase, to) {
    check()
    const observed = {kind, path, phase, to}
    actions.push(observed)
    await hook(observed)
    check()
  }
  function entry(path, type) {
    const node = nodes.get(path)
    assert.equal(node?.type, type, path)
    return node
  }
  const api = {
    assertSession:check, randomToken:()=>'abcdef012345', getFreeBytes:async()=>free,
    readDirectory:async path => {
      await event('list',path,'before')
      entry(path,1)
      return [...nodes].filter(([key])=>key!==path && parentOf(key)===path)
        .map(([key,node])=>({name:key.split('/').at(-1),type:node.type,size:node.bytes?.length||0,meta:structuredClone(node.meta)}))
    },
    readFile:async path => {
      await event('read',path,'before')
      return entry(path,0).bytes.slice()
    },
    readFileDigest:async (path,size) => {
      await event('hash',path,'before')
      const bytes = entry(path,0).bytes
      assert.equal(bytes.length,size)
      return sha256Bytes(bytes)
    },
    createDirectory:async path => {
      await event('mkdir',path,'before')
      assert(!nodes.has(path), 'Exclusive MKDIR collision')
      entry(parentOf(path),1)
      nodes.set(path,directory())
      await event('mkdir',path,'after')
    },
    writeFile:async (path, data, options) => {
      entry(parentOf(path),1)
      assert.deepEqual(options.rawMeta128, new Uint8Array(128).fill(255))
      await event('open',path,'before')
      await options.beforeWrite() // The RAW128 handle holds the writer lock until CLOSE.
      await event('write',path,'data') // Accepted first chunk, before CLOSE.
      nodes.set(path,{type:0,bytes:Uint8Array.from(data),meta:decodeRawMetadata(options.rawMeta128)})
      await event('write',path,'after')
    },
    rename:async (from,to) => {
      await event('rename',from,'before',to)
      entry(from,1); entry(parentOf(to),1)
      if (nodes.has(to)) throw Error('No-clobber RENAME collision')
      for (const [path,node] of [...nodes]) {
        if (path === from || path.startsWith(from + '/')) {
          nodes.set(to+path.slice(from.length),node)
          nodes.delete(path)
        }
      }
      await event('rename',from,'after',to)
    }
  }
  return {api,nodes,actions,setHook(fn){hook=fn},disconnect(){alive=false},reconnect(){alive=true}}
}
const mutation = action => ['mkdir','write','rename'].includes(action.kind)
function nativeApi(s, hook = () => {}) {
  let generation = 17
  const rev = () => '00000001' + generation.toString(16).padStart(8,'0')
  const denied = () => Object.assign(new Error('Device rejected guarded operation'), {cmd:0x23,status:1})
  const bump = () => { ++generation }
  const actions = []
  return {
    actions, bump,
    readCreateRevision:async () => {s.api.assertSession(); return rev()},
    createDirectory:async p => {await s.api.createDirectory(p); bump()},
    createSmall:async (p,bytes,sha,expected) => {
      await hook('start',p,bump)
      if (expected !== rev() || s.nodes.has(p)) throw denied()
      assert.equal(await sha256Bytes(bytes),sha)
      actions.push(p)
      s.nodes.set(p,{type:0,bytes:bytes.slice(),meta:newMetadata()}); bump()
      assert.equal(await sha256Bytes(s.nodes.get(p).bytes),sha)
      const atCommit = rev()
      await hook('commit',p,bump)
      s.api.assertSession()
      return atCommit
    },
    publishSmallFolder:async (from,to,expected) => {
      await hook('publish',from,bump)
      if (expected !== rev()) throw denied()
      await s.api.rename(from,to); bump()
      await hook('published',to,bump); s.api.assertSession()
      return rev()
    }
  }
}
async function setup(selected = [0,1,2], files = fixtureFiles()) {
  const vfs = packedVfs()
  const plan = await createSyncPlan({...vfs.api,rootPath:root,deviceKey:identity,files})
  const job = createSyncJob(plan)
  const selectedPaths = selected.map(i => root + '/' + files[i].relativePath)
  const run = (overrides={}) => executeNewFolderUpload({...vfs.api,deviceKey:identity,files,plan,job,selectedPaths,...overrides})
  return {...vfs,plan,job,files,selectedPaths,run}
}

test('fast publication requires selected additions under one new direct child', async () => {
  const s = await setup()
  assert.equal(newFolderUploadRoot(s.plan,s.selectedPaths),target)
  assert.equal(newFolderUploadRoot(s.plan,[]),null)
  const files = [...s.files, local('other/second.bin',5), local('loose.bin',7)]
  const mixed = await createSyncPlan({...s.api,rootPath:root,deviceKey:identity,files})
  assert.equal(newFolderUploadRoot(mixed,[s.selectedPaths[0],root+'/other/second.bin']),null)
  assert.equal(newFolderUploadRoot(mixed,[root+'/loose.bin']),null)
  s.nodes.set(target,directory())
  const existing = await createSyncPlan({...s.api,rootPath:root,deviceKey:identity,files:s.files})
  assert.equal(newFolderUploadRoot(existing,s.selectedPaths),null)
})

test('publishes just the approved subset, including nested files, with neutral metadata', async () => {
  const s = await setup([0,2])
  const result = await s.run()
  assert.equal(result.total,2)
  assert.equal(result.uploadedBytes,1080)
  assert.deepEqual([...s.nodes.keys()].filter(path=>path.startsWith(target+'/')).sort(),
    [target+'/f000.bin',target+'/nest',target+'/nest/f002.bin'])
  for (const i of [0,2]) {
    const node = s.nodes.get(root+'/'+s.files[i].relativePath)
    assert.deepEqual(node.bytes,bytesOf(i)); assert.deepEqual(node.meta,newMetadata())
  }
  assert.equal(s.actions.filter(e=>e.kind==='rename' && e.phase==='after').length,1)
  assert.equal(s.actions.some(e=>e.kind==='write' && e.path.startsWith(target+'/')),false)
})

test('a changed device, unapproved target or newly read-only parent cannot start publication', async () => {
  for (const issue of ['identity','selection','readonly','occupied']) {
    const s = await setup()
    if (issue === 'readonly') s.nodes.get(root).meta.flags = {raw:4,readonly:true,hide:false}
    if (issue === 'occupied') s.nodes.set(target,directory())
    const overrides = issue === 'identity' ? {deviceKey:'different-lcd'} :
      issue === 'selection' ? {selectedPaths:[root+'/another/unapproved.bin']} : {}
    await assert.rejects(s.run(overrides), issue)
    assert.equal(s.actions.some(mutation),false,issue)
  }
})

test('mismatched content, changed metadata or an unexpected entry keeps the target unpublished', async () => {
  for (const issue of ['bytes','metadata','unexpected']) {
    const s = await setup()
    let changed = false
    s.setHook(({kind,phase,path})=>{
      if (kind!=='write' || phase!=='after' || !path.endsWith('/f000.bin')) return
      changed=true
      const node=s.nodes.get(path)
      if (issue==='bytes') node.bytes[0]^=255
      if (issue==='metadata') node.meta.notes='foreign note'
      if (issue==='unexpected') s.nodes.set(parentOf(path)+'/foreign.bin',{type:0,bytes:bytesOf(8),meta:newMetadata()})
    })
    await assert.rejects(s.run(), issue)
    assert(changed)
    assert.equal(s.nodes.has(target),false,issue)
    assert.equal(s.actions.some(e=>e.kind==='rename' && e.phase==='after'),false,issue)
  }
})

test('a link loss before atomic CLOSE leaves no partial file and can resume the same selection', async () => {
  const s = await setup()
  let cut = false, interruptedPath
  s.setHook(({kind,phase,path})=>{
    if (kind==='write' && phase==='data' && path.endsWith('/f001.bin') && !cut) {
      cut=true;interruptedPath=path;s.disconnect()
    }
  })
  await assert.rejects(s.run(), {code:'DISCONNECTED'})
  assert(cut); assert(!s.nodes.has(interruptedPath)); assert(!s.nodes.has(target))
  assert.equal(s.job.newFolderUpload.targetPath,target)
  const start=s.actions.length
  s.reconnect()
  await s.run()
  assert.equal(s.actions.slice(start).some(e=>e.kind==='write' && e.path.endsWith('/f000.bin')),false)
  for (let i=0;i<s.files.length;i++) assert.deepEqual(s.nodes.get(root+'/'+s.files[i].relativePath).bytes,bytesOf(i))
})

test('a pre-OPEN exact name or case alias and a rejected locked listing cannot publish new data', async () => {
  for (const situation of ['exact','alias','listing failed']) {
    const s = await setup()
    let attemptedPath, foreignPath, open = false
    s.setHook(({kind,phase,path})=>{
      if (kind === 'open' && phase === 'before' && path.endsWith('/f000.bin')) {
        open = true; attemptedPath = path
        if (situation !== 'listing failed') {
          foreignPath = situation === 'alias' ? parentOf(path)+'/F000.bin' : path
          s.nodes.set(foreignPath,{type:0,bytes:bytesOf(8),meta:newMetadata()})
        }
      }
      if (kind === 'list' && open && situation === 'listing failed') throw Error('Listing unavailable')
    })
    await assert.rejects(s.run())
    assert(open)
    assert.equal(s.actions.some(e=>e.kind==='write' && e.path===attemptedPath),false)
    assert.equal(s.nodes.has(target),false)
    if (foreignPath) assert.deepEqual(s.nodes.get(foreignPath).bytes,bytesOf(8))
    else assert.equal(s.nodes.has(attemptedPath),false)
  }
})

test('lost final RENAME confirmation is recovered by checking the target without another write', async () => {
  const s=await setup()
  s.setHook(({kind,phase})=>{if(kind==='rename' && phase==='after')s.disconnect()})
  await assert.rejects(s.run(), {code:'DISCONNECTED'})
  assert(s.nodes.has(target))
  const start=s.actions.length
  s.setHook(()=>{});s.reconnect()
  await s.run()
  assert.equal(s.actions.slice(start).some(mutation),false)
  for (let i=0;i<s.files.length;i++) assert.deepEqual(s.nodes.get(root+'/'+s.files[i].relativePath).bytes,bytesOf(i))
})

test('loss of the staging MKDIR acknowledgement never claims an existing folder on reconnect', async () => {
  const s=await setup()
  s.setHook(({kind,phase})=>{if(kind==='mkdir' && phase==='after')s.disconnect()})
  await assert.rejects(s.run(), {code:'DISCONNECTED'})
  const stage=s.job.newFolderUpload.stagePath
  assert(s.nodes.has(stage));assert.equal(s.job.newFolderUpload.owned,false)
  s.setHook(()=>{});s.reconnect()
  const start=s.actions.length
  await assert.rejects(s.run(), {code:'SYNC_STALE'})
  assert.equal(s.actions.slice(start).some(mutation),false)
  assert(s.nodes.has(stage));assert(!s.nodes.has(target))
})

test('an uncertain CLOSE is resolved by checking its bytes; a changed partial stage stops before writing', async () => {
  for (const tampered of [true,false]) {
    const s=await setup()
    let acknowledgedOnDevice
    s.setHook(({kind,phase,path})=>{
      if (kind==='write' && phase==='after' && path.endsWith('/f001.bin')) {
        acknowledgedOnDevice=path;s.disconnect()
      }
    })
    await assert.rejects(s.run(), {code:'DISCONNECTED'})
    assert.deepEqual(s.nodes.get(acknowledgedOnDevice).bytes,bytesOf(1))
    s.setHook(()=>{});s.reconnect()
    const start=s.actions.length
    if (tampered) {
      s.nodes.get(acknowledgedOnDevice).bytes[8] ^= 1
      await assert.rejects(s.run())
      assert.equal(s.actions.slice(start).some(mutation),false)
      assert(!s.nodes.has(target))
    } else {
      await s.run()
      assert(s.actions.slice(start).some(e=>e.kind==='hash' && e.path===acknowledgedOnDevice))
      assert.equal(s.actions.slice(start).some(e=>e.kind==='write' && e.path===acknowledgedOnDevice),false)
      assert.deepEqual(s.nodes.get(target+'/f001.bin').bytes,bytesOf(1))
    }
  }
})

test('a final-name collision at publication preserves the independent folder and the staged tree', async () => {
  const s=await setup()
  s.setHook(({kind,phase,to})=>{
    if (kind==='rename' && phase==='before') {
      assert.equal(to,target);s.nodes.set(to,directory())
      s.nodes.set(to+'/original.bin',{type:0,bytes:bytesOf(9),meta:newMetadata()})
    }
  })
  await assert.rejects(s.run())
  assert.deepEqual(s.nodes.get(target+'/original.bin').bytes,bytesOf(9))
  assert.equal(s.nodes.has(target+'/f000.bin'),false)
  assert(s.nodes.has(s.job.newFolderUpload.stagePath+'/f000.bin'))
})

test('persistent per-file receipts and a stable revision verify a closed small-file tree without redundant SHA requests', async () => {
  const s = await setup()
  let afterLastReceipt, atPublish
  const native = nativeApi(s, (phase,path) => {
    if (phase === 'commit' && path.endsWith('/f002.bin')) afterLastReceipt = s.actions.length
    if (phase === 'publish') atPublish = s.actions.length
  })
  const receipt = await s.run(native)
  assert.equal(receipt.uploadedBytes,1620); assert.equal(receipt.total,3)
  assert.equal(native.actions.length,3)
  assert.equal(s.actions.filter(a=>a.kind==='hash' || a.kind==='open').length,0)
  assert.equal(atPublish, afterLastReceipt, 'the guarded publish directly consumes the final receipt')
  for (let i=0;i<3;i++) assert.deepEqual(s.nodes.get(root+'/'+s.files[i].relativePath).bytes,bytesOf(i))
})

const mixedFiles = () => [572, 573, 0, 1024, 540].map((size, i) => ({
  relativePath: 'ManySmall/f' + i,
  file: new File([new Uint8Array(size).fill(i + 1)], 'f' + i)
}))
const mixedSetup = () => setup([0,1,2,3,4], mixedFiles())

test('mixed folders use guarded creates through 572 bytes and hash each ordinary write before the first create', async () => {
  const s = await mixedSetup()
  const verified = () => s.actions.filter(a => a.kind === 'hash').map(a => a.path.split('/').at(-1))
  const native = nativeApi(s, phase => {
    if (phase === 'start' || phase === 'publish') assert.deepEqual(verified(), ['f1','f3'])
  })
  const result = await s.run(native)
  assert.equal(result.uploadedBytes, 2709)
  assert.deepEqual(native.actions.map(p => p.split('/').at(-1)), ['f0','f2','f4'])
  assert.deepEqual(s.actions.filter(a => a.kind === 'open').map(a => a.path.split('/').at(-1)), ['f1','f3'])
  for (const {relativePath,file} of s.files) {
    assert.deepEqual(s.nodes.get(root + '/' + relativePath).bytes, new Uint8Array(await file.arrayBuffer()))
  }
})

test('a mixed folder refuses corrupt ordinary data before starting any small create', async () => {
  const s = await mixedSetup(), native = nativeApi(s)
  s.setHook(({kind, phase, path}) => {
    if (kind === 'write' && phase === 'after' && path.endsWith('/f1')) s.nodes.get(path).bytes[10] ^= 1
  })
  await assert.rejects(s.run(native), {code:'SYNC_STALE'})
  assert.equal(native.actions.length, 0)
  assert(!s.nodes.has(target))
})

test('mixed folder resume verifies a lost ordinary CLOSE or a lost small receipt and writes each file only once', async () => {
  for (const interrupt of ['large', 'small']) {
    const s = await mixedSetup()
    let cut = false
    function disconnect() { if (!cut) { cut = true; s.disconnect() } }
    const native = nativeApi(s, (phase,path) => {
      if (interrupt === 'small' && phase === 'commit' && path.endsWith('/f0')) disconnect()
    })
    s.setHook(({kind,phase,path}) => {
      if (interrupt === 'large' && kind === 'write' && phase === 'after' && path.endsWith('/f1')) disconnect()
    })
    await assert.rejects(s.run(native), {code:'DISCONNECTED'})
    s.reconnect()
    const result = await s.run(native)
    assert.equal(result.skipped, interrupt === 'large' ? 1 : 3)
    assert.equal(native.actions.length, 3)
    assert.equal(s.actions.filter(a => a.kind === 'open').length, 2)
    for (const {relativePath,file} of s.files) {
      assert.deepEqual(s.nodes.get(root + '/' + relativePath).bytes, new Uint8Array(await file.arrayBuffer()))
    }
  }
})

test('a gap in the receipt sequence requires fresh full hashes before conditional publication', async () => {
  const s = await setup(), native = nativeApi(s)
  const create = native.createSmall
  native.createSmall = async (...args) => {
    const next = await create(...args)
    if (!args[0].endsWith('/f001.bin')) return next
    native.bump()
    return native.readCreateRevision()
  }
  const done = await s.run(native)
  assert.equal(done.total, 3)
  const verified = s.actions.filter(action => action.kind === 'hash').map(action => action.path)
  for (const file of s.files) assert(verified.includes(s.job.newFolderUpload.stagePath + '/' + file.relativePath.split('/').slice(1).join('/')))
})

test('cancelling at the final progress update leaves the verified stage unpublished', async () => {
  const s = await setup(), native = nativeApi(s), controller = new AbortController()
  await assert.rejects(s.run({...native, signal:controller.signal, onProgress:progress => {
    if (progress.phase === 'checking') controller.abort()
  }}), error => error.code === 'SYNC_CANCELLED')
  assert.equal(s.nodes.has(target),false)
  assert.equal(s.nodes.has(s.job.newFolderUpload.stagePath),true)
  assert.equal(s.actions.some(action => action.kind === 'rename'),false)
})

test('an extra entry after the last receipt leaves the working directory intact and cannot be published on retry', async () => {
  const s = await setup()
  let inserted = false
  const native = nativeApi(s, (phase, path, bump) => {
    if (inserted || phase !== 'publish') return
    inserted = true
    s.nodes.set(path+'/unselected.bin',{type:0,meta:newMetadata(),bytes:bytesOf(57)})
    bump()
  })
  await assert.rejects(s.run(native), error => error.cmd === 0x23 && error.status === 1)
  await assert.rejects(s.run(native), error => error.code === 'SYNC_STALE')
  assert.equal(s.nodes.has(target),false)
  assert.deepEqual(s.nodes.get(s.job.newFolderUpload.stagePath+'/unselected.bin').bytes,bytesOf(57))
  assert.equal(native.actions.length,3)
})

test('a native file create refuses stale inventory and preserves an exact or case-equivalent foreign name', async () => {
  for(const name of ['f000.bin','F000.bin']) {
    const s=await setup(), native=nativeApi(s,(when,p,bump)=>{
      if(when!=='start') return
      s.nodes.set(parentOf(p)+'/'+name,{type:0,meta:newMetadata(),bytes:bytesOf(99)});bump()
    })
    await assert.rejects(s.run(native))
    assert.equal(native.actions.length,0)
    assert.equal(s.nodes.has(target),false)
    assert.deepEqual(s.nodes.get(s.job.newFolderUpload.stagePath+'/'+name).bytes,bytesOf(99))
  }
})

test('a modification of the same length before final inventory or after it prevents publication', async () => {
  for(const point of ['last receipt','before publish']) {
    const s=await setup()
    const native=nativeApi(s,(when,p,bump)=>{
      if (!(point==='before publish' && when==='publish' || point==='last receipt' && when==='commit' && p.endsWith('/f002.bin'))) return
      s.nodes.get(s.job.newFolderUpload.stagePath+'/f000.bin').bytes[0]^=1
      bump()
    })
    await assert.rejects(s.run(native))
    assert.equal(s.nodes.has(target),false)
    assert.equal(s.nodes.has(s.job.newFolderUpload.stagePath),true)
    assert.equal(s.nodes.get(s.job.newFolderUpload.stagePath+'/f000.bin').bytes[0],1)
    assert.equal(s.actions.some(a=>a.kind==='rename'),false)
  }
})

test('native reconnect rechecks every retained byte, including a lost create or publication reply', async () => {
  for (const point of ['after create','after rename','same size change','lost capability']) {
    const s=await setup()
    let cut=false
    const native=nativeApi(s,(when,p)=>{
      const trigger=point==='after rename' ? when==='published' : when==='commit' && p.endsWith('/f001.bin')
      if (!cut && trigger) {cut=true;s.disconnect()}
    })
    await assert.rejects(s.run(native))
    assert(cut);s.reconnect()
    const prior=native.actions.length
    if (point==='same size change') {
      s.nodes.get(s.job.newFolderUpload.stagePath+'/f000.bin').bytes[1]^=1;native.bump()
      await assert.rejects(s.run(native))
      assert.equal(s.nodes.has(target),false);assert.equal(native.actions.length,prior)
    } else if (point==='lost capability') {
      await assert.rejects(s.run({...native,readCreateRevision:async()=>null}))
      assert.equal(native.actions.length,prior);assert.equal(s.nodes.has(target),false)
    } else {
      const done=await s.run(native)
      assert.equal(native.actions.length,3);assert.equal(done.skipped,point==='after rename'?3:2)
      assert(s.actions.filter(e=>e.kind==='hash').length>=done.skipped)
    }
  }
})

async function setupExisting(files) {
  const vfs = packedVfs()
  const native = nativeApi(vfs)
  const plan = await createSyncPlan({...vfs.api,rootPath:root,deviceKey:identity,files})
  const job = createSyncJob(plan)
  const options = {...vfs.api,...native,files,plan,job,deviceKey:identity,prepareLeafUploads,
    writeNewPackedFile:async (...args) => { await vfs.api.writeFile(...args); native.bump() },
    uploadFile:async () => assert.fail('Unexpected replacement')}
  return {...vfs, native, plan, job, run:(overrides={}) => executeSyncJob({...options,...overrides})}
}

function smallFileWorkload() {
  // Anonymous directory topology and size counts. Contents are generated locally.
  const layout = [
    ["",[[238,2],[160,1],[26,1]]],
    ["d0/d0",[[540,2]]],
    ["d0/d1/d0",[[540,100]]],
    ["d0/d1/d1",[[540,100]]],
    ["d0/d1/d2",[[540,100]]],
    ["d0/d1/d3",[[540,100]]],
    ["d0/d1/d4",[[540,96]]],
    ["d0/d1/d5",[[540,3]]],
    ["d0/d1/d6",[[540,16]]],
    ["d0/d1/d7",[[540,6]]],
    ["d0/d1/d8",[[540,2]]],
    ["d0/d1/d9",[[540,50]]],
    ["d0/d2",[[540,1]]],
    ["d0/d3",[[540,1]]],
    ["d0/d4",[[540,1]]],
    ["d0/d5",[[540,1]]],
    ["d0/d6",[[540,3],[532,1]]],
    ["d0/d7",[[540,4]]],
    ["d0/d8",[[2048,25]]],
    ["d0/d9",[[540,90]]],
    ["d0/d10",[[540,1]]],
    ["d0/d11",[[540,7]]],
    ["d0/d12",[[540,6]]],
    ["d0/d13",[[540,12]]],
    ["d0/d14",[[540,6]]],
    ["d0/d15",[[540,2]]],
    ["d0/d16",[[540,1]]],
    ["d0/d17",[[540,2]]],
    ["d0/d18",[[540,12]]],
    ["d0/d19",[[540,1]]],
    ["d0/d20",[[540,2]]],
    ["d0/d21",[[540,5]]],
    ["d0/d22",[[540,4]]],
    ["d0/d23",[[540,30]]],
    ["d0/d24/d0",[[540,3]]],
    ["d0/d24/d1",[[540,60]]],
    ["d0/d25",[[540,35]]],
    ["d0/d26",[[572,6],[540,3]]],
    ["d0/d27",[[540,92],[572,4]]],
    ["d0/d28",[[540,2]]],
    ["d0/d29",[[540,5]]],
    ["d0/d30",[[540,7]]],
    ["d0/d31",[[540,33]]],
    ["d1/d0/d0",[[160,1],[80,2]]],
    ["d2",[[540,26]]],
    ["d3/d0",[[320,1]]],
    ["d3/d1",[[594,2],[68,1]]],
    ["d4",[[40976,1]]]
  ]
  const files = []
  for (const [directory, counts] of layout) {
    let index = 0
    for (const [size,count] of counts) for (let i=0; i<count; ++i) {
      const name = 'file' + index++ + '.bin'
      const contents = Uint8Array.from({length:size}, (_, pos) => (pos + files.length) % 251)
      files.push({relativePath:directory ? directory + '/' + name : name,file:new File([contents],name)})
    }
  }
  return files
}

test('same existing root, 1081 files: guarded leaf publication and direct writes give identical verified output', async t => {
  const files = smallFileWorkload()
  assert.equal(files.length,1081)
  assert.equal(files.reduce((n,f)=>n+f.file.size,0),658806)
  const stats = []
  for (const fast of [false,true]) {
    const s = await setupExisting(files)
    s.actions.length = 0
    const result = await s.run({prepareLeafUploads:fast ? prepareLeafUploads : undefined})
    assert.equal(result.completed,1081); assert.equal(result.uploadedBytes,658806)
    assert.equal(result.job.completed.length,1081); assert.equal(result.job.state,'complete')
    assert(![...s.nodes.keys()].some(p=>p.includes('/~u')))
    assert.equal([...s.nodes.values()].filter(node=>node.type===0).length,1081)
    for (const {relativePath,file} of files) {
      const node = s.nodes.get(root + '/' + relativePath)
      assert.deepEqual(node.bytes, new Uint8Array(await file.arrayBuffer()))
      assert.deepEqual(node.meta,newMetadata())
    }
    stats.push({lists:s.actions.filter(x=>x.kind==='list').length,hash:s.actions.filter(x=>x.kind==='hash').length,
      opens:s.actions.filter(x=>x.kind==='open').length,
      published:s.actions.filter(x=>x.kind==='rename' && x.phase==='after').length,small:s.native.actions.length})
  }
  t.diagnostic(JSON.stringify({ordinary:stats[0],leaf:stats[1]}))
  assert.equal(stats[1].small,1049)
  assert.equal(stats[1].published,45)
  assert(stats[1].lists < stats[0].lists/2)
})

for (const phase of ['start','commit','publish','published']) {
  test('existing root recovers a leaf after link loss at '+phase, async () => {
    const files = [local('group/leaf/a.bin',1),local('group/leaf/b.bin',2),local('next/c.bin',3),local('loose.bin',4)]
    const s = await setupExisting(files)
    let cut = false
    const native = nativeApi(s, async event => {
      if (!cut && event === phase) {cut=true;s.disconnect();s.api.assertSession()}
    })
    await assert.rejects(s.run(native),{code:'DISCONNECTED'})
    assert.equal(s.job.completed.length,0)
    assert(pendingFolderUpload(s.job)?.stagePath)
    s.reconnect()
    await assert.rejects(s.run({...native,readCreateRevision:async()=>null}),{code:'SYNC_STALE'})
    const result=await s.run(native)
    assert.equal(result.job.state,'complete'); assert.equal(result.completed + result.skipped,files.length)
    assert.equal(pendingFolderUpload(s.job),undefined)
    assert.equal(native.actions.length,3)
    assert.equal([...s.nodes.values()].filter(node=>node.type===0).length,4)
    assert(![...s.nodes.keys()].some(p=>p.includes('/~u')))
    for (const [i,file] of files.entries()) assert.deepEqual(s.nodes.get(root+'/'+file.relativePath).bytes,bytesOf(i+1))
  })
}

test('unknown firmware and older supported PackedFS keep ordinary checked writes', async () => {
  const files = [local('leaf/a.bin',1),local('leaf/b.bin',2)]
  const s = await setupExisting(files)
  const result = await s.run({readCreateRevision:async()=>null})
  assert.equal(result.completed,2); assert.equal(s.native.actions.length,0)
  assert.equal(s.actions.filter(x=>x.kind==='hash').length,2)
  assert(!pendingFolderUpload(s.job))
})

test('existing folders and their metadata are preserved, only missing selected leaves are published', async () => {
  const files = [local('old/a.bin',1),local('nested/new/b.bin',2),local('nested/new/c.bin',3)]
  const s = await setupExisting(files)
  const old = directory(); old.meta.notes = 'existing note'
  s.nodes.set(root+'/old',old)
  s.nodes.set(root+'/old/keep.bin',{type:0,bytes:bytesOf(9),meta:newMetadata()})
  const selectedPaths = files.slice(0,2).map(f=>root+'/'+f.relativePath)
  const result = await s.run({selectedPaths})
  assert.equal(result.completed,2); assert.equal(s.native.actions.length,1)
  assert.equal(s.nodes.get(root+'/old').meta.notes,'existing note')
  assert.deepEqual(s.nodes.get(root+'/old/keep.bin').bytes,bytesOf(9))
  assert(!s.nodes.has(root+'/nested/new/c.bin'))
})

test('ambiguous reservation or foreign data prevents resumed publication', async () => {
  for(const loseReservation of [true,false]) {
    const s = await setupExisting([local('leaf/a.bin',1),local('leaf/b.bin',2)])
    if(loseReservation) s.setHook(({kind,path,phase})=>{
      if(kind==='mkdir' && path.includes('/~u') && phase==='after') s.disconnect()
    })
    const native = nativeApi(s, async event=>{if(!loseReservation && event==='commit') s.disconnect()})
    await assert.rejects(s.run(native),{code:'DISCONNECTED'})
    const stage = pendingFolderUpload(s.job).stagePath
    s.setHook(()=>{}); s.reconnect()
    s.nodes.set(stage+'/unexpected',{type:0,meta:newMetadata(),bytes:bytesOf(10)})
    await assert.rejects(s.run(native),{code:'SYNC_STALE'})
    assert.equal(s.job.completed.length,0); assert(s.nodes.has(stage+'/unexpected'))
    assert(!s.nodes.has(root+'/leaf'))
  }
})

test('tight space chooses direct verified writes before allocating a stage; insufficient payload space refuses the leaf', async () => {
  const files=[local('Small/a.bin',1),local('Small/b.bin',2)]
  for(const [space, expected] of [[32768,'direct'],[539,'refuse'],[NaN,'refuse']]) {
    const s=await setupExisting(files)
    if(expected==='direct') {
      const result=await s.run({getFreeBytes:async()=>space})
      assert.equal(result.completed,2); assert.equal(s.actions.filter(x=>x.kind==='hash').length,2)
    } else {
      await assert.rejects(s.run({getFreeBytes:async()=>space}),{code:'UPLOAD_SPACE'})
      assert.equal(s.job.completed.length,0); assert(!s.nodes.has(root+'/Small'))
    }
    assert(!pendingFolderUpload(s.job)); assert.equal(s.native.actions.length,0)
  }
})

test('a completed outer job cannot import another active stage or silently accept changed bytes', async () => {
  const files=[local('Small/a.bin',1),local('Small/b.bin',2)]
  const s=await setupExisting(files)
  await s.run()
  s.job.leafUpload={targetPath:root+'/Small',job:{completed:[]}}
  await assert.rejects(s.run(),{code:'SYNC_JOB'})
  delete s.job.leafUpload
  s.nodes.get(root+'/Small/a.bin').meta.notes='external edit'
  await assert.rejects(s.run(),{code:'SYNC_STALE'})
  assert.equal(s.nodes.get(root+'/Small/a.bin').meta.notes,'external edit')
  s.nodes.get(root+'/Small/a.bin').meta=newMetadata()
  s.nodes.get(root+'/Small/a.bin').bytes=bytesOf(8)
  await assert.rejects(s.run(),{code:'SYNC_STALE'})
  assert.deepEqual(s.nodes.get(root+'/Small/a.bin').bytes,bytesOf(8))
  assert.equal(s.native.actions.length,2)
})

test('a parent removed after a staged interruption cannot be recreated on resume', async () => {
  const s=await setupExisting([local('ancestor/leaf/a.bin',1),local('ancestor/leaf/b.bin',2)])
  const native=nativeApi(s,async phase=>{if(phase==='commit') s.disconnect()})
  await assert.rejects(s.run(native),{code:'DISCONNECTED'})
  s.reconnect()
  for (const path of [...s.nodes.keys()]) if(path.startsWith(root+'/ancestor')) s.nodes.delete(path)
  const actions=s.actions.length
  await assert.rejects(s.run(native),{code:'SYNC_STALE'})
  assert(!s.nodes.has(root+'/ancestor'))
  assert(!s.actions.slice(actions).some(action=>mutation(action)))
})

test('long staged path, oversized leaf, or reserved temporary component uses the ordinary path', async () => {
  const component='x'.repeat(40)
  const groups=[
    [local('prefix/l/'+component+'.bin',1),local('prefix/l/'+component+'.dat',2)],
    Array.from({length:101},(_,i)=>local('many/f'+i+'.bin',i)),
    [local('~uabaabbcc/p/a.bin',1)]
  ]
  for (const group of groups) {
    const s=await setupExisting(group)
    const result=await s.run()
    assert.equal(result.completed,group.length); assert.equal(s.native.actions.length,0)
  }
})

test('capacity errors during atomic publication retain the private stage and retry the guarded rename', async () => {
  const files = [local('leaf/a.bin',1),local('leaf/b.bin',2)]
  const s=await setupExisting(files)
  let low=true
  const native=nativeApi(s,async phase=>{
    if (phase==='publish' && low) throw Object.assign(new Error('Insufficient transaction workspace'),{cmd:0x23,status:1})
  })
  await assert.rejects(s.run(native))
  assert.equal(s.job.completed.length,0); assert(!s.nodes.has(root+'/leaf'))
  const stage = pendingFolderUpload(s.job).stagePath
  assert(s.nodes.has(stage+'/a.bin'))
  low=false
  await s.run(native)
  assert(!s.nodes.has(stage)); assert.equal(s.job.completed.length,2); assert.equal(native.actions.length,2)
})

test('quick fresh leaves trust consecutive durable CLOSE replies and keep only actual digests in the sync history', async () => {
  const s = await mixedSetup()
  const native = nativeApi(s)
  const writeFile = async (...args) => { await s.api.writeFile(...args); native.bump() }
  const result = await s.run({...native, quickPacked:true, writeFile})
  assert.equal(s.actions.filter(e => e.kind === 'hash').length, 0)
  assert.deepEqual(result.job.acknowledgedOnly, [target+'/f1',target+'/f3'])
  const {createSyncHistory} = await import('../src/lib/sync-history.js')
  const history = createSyncHistory(s.plan, '1'.repeat(64), null, result.job)
  assert.deepEqual(history.files.map(row => row[0]), ['ManySmall/f0','ManySmall/f2','ManySmall/f4'])
})

test('quick leaf re-audits raw data when a foreign same-size write changes the revision', async () => {
  const s = await mixedSetup()
  const native = nativeApi(s)
  const writeFile = async (p,data,options) => {
    await s.api.writeFile(p,data,options); native.bump()
    if (p.endsWith('/f1')) {
      s.nodes.get(p).bytes[0] ^= 1
      native.bump()
    }
  }
  await assert.rejects(s.run({...native, quickPacked:true, writeFile}), {code:'SYNC_STALE'})
  assert.equal(native.actions.length,0)
  assert(!s.nodes.has(target))
})

test('quick sibling snapshot invalidates on a competing new folder, preserving its content', async () => {
  const files = [local('Group/first/a.bin', 1), local('Group/next/z.bin', 2)]
  const s = await setupExisting(files)
  const foreign = root+'/Group/next'
  let inserted = false
  const native = nativeApi(s, (point, p, bump) => {
    if (point==='published' && !inserted) {
      inserted=true
      s.nodes.set(foreign, directory())
      s.nodes.set(foreign+'/keep', {type:0,meta:newMetadata(),bytes:Uint8Array.of(44)})
      bump()
    }
  })
  await assert.rejects(s.run({...native,quickPacked:true}), {code:'SYNC_STALE'})
  assert.deepEqual(s.nodes.get(foreign+'/keep').bytes,Uint8Array.of(44))
  assert(!s.nodes.has(foreign+'/z.bin'))
})

test('quick existing-folder upload falls back to per-file verification without revision support', async () => {
  const s=await setupExisting([local('plain.bin',1)])
  const r=await s.run({quickPacked:true,readCreateRevision:async()=>null})
  assert.equal(r.completed,1)
  assert.equal(s.actions.filter(e=>e.kind==='hash').length,1)
  assert.equal(r.job.acknowledgedOnly,undefined)
})

test('quick existing-folder upload has one final status read and rejects a changed mount epoch', async () => {
  for (const badEpoch of [false,true]) {
    const s=await setupExisting([local('first.bin',1),local('second.bin',2)])
    let revisionReads=0
    const r=s.run({quickPacked:true,readCreateRevision:async()=>{
      revisionReads++
      return !s.nodes.has(root+'/first.bin') ? '0000000100000010' : badEpoch?'0000000200000012':'0000000100000012'
    }})
    if (badEpoch) await assert.rejects(r,{code:'SYNC_STALE'})
    else assert.equal((await r).job.acknowledgedOnly.length,2)
    assert.equal(revisionReads,4)
    assert.equal(s.actions.filter(e=>e.kind==='hash').length,0)
  }
})


test('default routing limits whole-tree publication while previously started jobs retain the full target', async () => {
  const sample = Array.from({length:101}, (_,i)=>local('ManySmall/sub/f'+i+'.bin',i))
  const s=await setup(sample.map((_,i)=>i),sample)
  assert.equal(newFolderUploadRoot(s.plan,s.selectedPaths),target)
  assert.equal(newFolderUploadRoot(s.plan,s.selectedPaths,true),null)
  assert.equal(newFolderUploadRoot(s.plan,s.selectedPaths.slice(0,100),true),target)
})

test('quick large-only leaf publishes once, acknowledges stored data, and retains singleton direct writes', async () => {
  const make = relativePath => ({relativePath,file:new File([new Uint8Array(2048)],relativePath.split('/').at(-1))})
  const s=await setupExisting(['batch/f1','batch/f2','single/f1'].map(make))
  const write=async (...args)=>{await s.api.writeFile(...args);s.native.bump()}
  const result=await s.run({quickPacked:true,writeNewPackedFile:write,writeFile:write})
  assert.equal(result.completed,3)
  assert.equal(result.job.acknowledgedOnly.length,3)
  assert.equal(s.actions.filter(a=>a.kind==='rename' && a.phase==='after').length,1)
  assert.equal(s.actions.filter(a=>a.kind==='hash').length,0)
  assert.equal(s.native.actions.length,0)
})

function groupedApi(s,stopAt) {
  const native=nativeApi(s), calls=[], rawReads=[]
  let stopped=false
  return {...native, calls, rawReads, quickPacked:true, canGroupCreate:async()=>true,
    async createGroup(folder,members,expected) {
      assert.equal(await native.readCreateRevision(),expected)
      const paths=members.map(member=>folder+'/'+member.name)
      if (paths.some(path=>s.nodes.has(path))) throw Object.assign(Error('Create collision'),{cmd:0x28,status:1})
      if(!stopped&&stopAt==='data'){stopped=true;throw Error('Uncertain DATA')}
      for(let i=0;i<members.length;++i)s.nodes.set(paths[i],{type:0,bytes:members[i].bytes.slice(),meta:newMetadata(),raw:new Uint8Array(128).fill(255)})
      native.bump();calls.push(paths)
      if(!stopped&&stopAt==='commit'){stopped=true;throw Error('Lost COMMIT reply')}
      return native.readCreateRevision()
    },
    async readRawMetadata(p){rawReads.push(p);return s.nodes.get(p).raw}
  }
}
async function groupFixture() {
  const files=Array.from({length:9},(_,n)=>local('ManySmall/file'+n+'.bin',n))
  return setup(files.map((_,n)=>n),files)
}
test('grouped leaf sends four siblings per transaction, confirms final publication and marks no per-file SHA',async()=>{
  const s=await groupFixture(), a=groupedApi(s)
  const result=await s.run(a)
  assert.deepEqual(a.calls.map(row=>row.length),[4,4,1]);assert.equal(result.completed,9)
  assert.equal(result.job.acknowledgedOnly.length,9);assert.equal(a.rawReads.length,0)
  assert.equal(s.actions.filter(action=>action.kind==='hash').length,0)
})
test('grouped leaf only adopts an uncertain COMMIT after individual SHA and exact opaque metadata match',async()=>{
  for(const failure of ['data','commit','content','metadata','partial']){
    const s=await groupFixture(),a=groupedApi(s,failure==='data'?'data':'commit')
    await assert.rejects(s.run(a));const state=s.job.newFolderUpload
    assert.equal(state.inFlightGroup.length,4);const paths=state.inFlightGroup.map(p=>state.stagePath+p.slice(target.length))
    if(failure==='content')s.nodes.get(paths[0]).bytes[1]^=255
    if(failure==='metadata')s.nodes.get(paths[0]).raw[127]=0
    if(failure==='partial')s.nodes.delete(paths[0])
    if(['data','commit'].includes(failure)){
      const result=await s.run(a);assert.equal(result.total,9);assert.equal(a.calls.flat().length,9)
      for(const p of paths)assert.equal(a.rawReads.includes(p),failure==='commit')
    }else{
      await assert.rejects(s.run(a),{code:'SYNC_STALE'});assert(!s.nodes.has(target))
      assert.equal(a.calls.length,1)
    }
  }
})
test('grouped completion cannot reuse another device checkpoint; absence of capability uses single guarded creates',async()=>{
  const s=await groupFixture(),a=groupedApi(s,'commit')
  await assert.rejects(s.run(a))
  await assert.rejects(s.run({...a,deviceKey:'other-lcd'}),{code:'SYNC_STALE'})
  const f=await groupFixture(),single=groupedApi(f)
  const done=await f.run({...single,canGroupCreate:async()=>false})
  assert.equal(done.total,9);assert.equal(single.calls.length,0);assert.equal(single.actions.length,9)
})

test('resuming a lost COMMIT batches the staged digests and still checks every RAW128 record', async t => {
  for (const mode of ['batch', 'unsupported', 'small MTU']) await t.test(mode, async () => {
    const s = await groupFixture(), api = groupedApi(s, 'commit')
    await assert.rejects(s.run(api), /Lost COMMIT/)
    const {stagePath, inFlightGroup} = s.job.newFolderUpload
    const paths = inFlightGroup.map(path => stagePath + path.slice(target.length))
    const requests = []
    const result = await s.run({...api, maxRequestPayload:mode === 'small MTU' ? 31 : 243,
      async readFileDigestsBatch(group, {revision}) {
        assert.equal(revision, await api.readCreateRevision())
        requests.push(group.map(file => file.path))
        if (mode === 'unsupported') return null
        return Promise.all(group.map(async file => ({...file, sha256:await sha256Bytes(s.nodes.get(file.path).bytes)})))
      }})
    assert.equal(result.total, 9)
    assert.deepEqual(requests, mode === 'small MTU' ? [] : [paths])
    assert.deepEqual(s.actions.filter(e => e.kind === 'hash').map(e => e.path), mode === 'batch' ? [] : paths)
    assert.deepEqual(api.rawReads, paths)
    assert.equal(api.calls.flat().length, 9)
  })
})

test('uncertain groups are never published after a failed inventory or a late device change', async t => {
  for (const issue of ['short', 'order', 'size', 'hash', 'malformed', 'foreign', 'duplicate', 'partial',
    'file changed', 'raw metadata', 'generation', 'disconnect', 'cancelled']) await t.test(issue, async () => {
    const s = await groupFixture(), api = groupedApi(s, 'commit'), controller = new AbortController()
    await assert.rejects(s.run(api), /Lost COMMIT/)
    const {stagePath, inFlightGroup} = s.job.newFolderUpload
    const path = stagePath + inFlightGroup[0].slice(target.length)
    if (issue === 'file changed') s.nodes.get(path).bytes[0] ^= 1
    if (issue === 'raw metadata') s.nodes.get(path).raw[127] = 0
    if (issue === 'foreign') s.nodes.set(stagePath+'/extra', {type:0,bytes:Uint8Array.of(42),meta:newMetadata()})
    if (issue === 'partial') s.nodes.delete(path)
    const mutations = s.actions.filter(mutation).length
    let batchCalls = 0
    const upload = s.run({...api, signal:controller.signal,
      async readDirectory(dir) {
        const rows = await s.api.readDirectory(dir)
        return issue === 'duplicate' && dir === stagePath ? [...rows, rows[0]] : rows
      },
      async readFileDigestsBatch(group) {
        ++batchCalls
        const reply = await Promise.all(group.map(async file => ({...file, sha256:await sha256Bytes(s.nodes.get(file.path).bytes)})))
        if (issue === 'short') return reply.slice(1)
        if (issue === 'order') return reply.reverse()
        if (issue === 'size') ++reply[0].size
        if (issue === 'hash') reply[0].sha256 = '0'.repeat(64)
        if (issue === 'malformed') return undefined
        if (issue === 'disconnect') s.disconnect()
        if (issue === 'cancelled') controller.abort()
        if (issue === 'generation') api.bump()
        return reply
      }})
    const code = {disconnect:'DISCONNECTED', cancelled:'SYNC_CANCELLED', duplicate:'UPLOAD_LIST'}[issue] || 'SYNC_STALE'
    await assert.rejects(upload, {code})
    if (issue === 'foreign' || issue === 'duplicate') assert.equal(batchCalls, 0)
    assert.equal(s.actions.filter(e => e.kind === 'hash').length, 0)
    assert.equal(s.actions.filter(mutation).length, mutations)
    assert.equal(api.calls.length, 1)
    assert(!s.nodes.has(target))
  })
})

test('lost RENAME audits the final paths and falls back only for files without a group reply', async () => {
  const s = await groupFixture(), api = groupedApi(s)
  await assert.rejects(s.run({...api, async publishSmallFolder(...args) {
    await api.publishSmallFolder(...args)
    s.disconnect()
    s.api.assertSession()
  }}), {code:'DISCONNECTED'})
  s.reconnect()
  assert(s.nodes.has(target))
  const paths = s.selectedPaths
  const requests = []
  const result = await s.run({...api, async readFileDigestsBatch(group, {revision}) {
    assert.equal(revision, await api.readCreateRevision())
    requests.push(group.map(row => row.path))
    if (requests.length === 2) return null
    return Promise.all(group.map(async file => ({...file, sha256:await sha256Bytes(s.nodes.get(file.path).bytes)})))
  }})
  assert.equal(result.total, 9)
  assert.deepEqual(requests, [paths.slice(0,4), paths.slice(4,8)])
  assert.deepEqual(s.actions.filter(e => e.kind === 'hash').map(e => e.path), paths.slice(4))
  assert.deepEqual(api.rawReads, paths)
  assert.equal(s.actions.filter(e => e.kind === 'rename' && e.phase === 'after').length, 1)
})

test('a fresh small leaf validates MKDIR in the first group instead of querying its revision again', async () => {
  const s = await groupFixture(), api = groupedApi(s)
  let revisionReads = 0, readsAfterMkdir, readsAtFirstGroup
  const result = await s.run({
    ...api,
    readCreateRevision:async () => { ++revisionReads; return api.readCreateRevision() },
    createDirectory:async path => {
      await api.createDirectory(path)
      readsAfterMkdir = revisionReads
    },
    createGroup:async (...args) => {
      readsAtFirstGroup ??= revisionReads
      return api.createGroup(...args)
    }
  })
  assert.equal(result.completed,9)
  assert.equal(readsAtFirstGroup,readsAfterMkdir)
  assert.deepEqual(api.calls.map(members=>members.length),[4,4,1])
})

test('a rejected first group rechecks the stage and retries only a changed revision of the same mount', async t => {
  for (const race of ['unrelated','foreign-file','occupied-target','remounted','same-revision','twice-rejected']) {
    await t.test(race,async () => {
      const s = await groupFixture(), api = groupedApi(s)
      let attempts = 0, remounted = false, stage
      const revision = async () => {
        const value = await api.readCreateRevision()
        return remounted ? '00000002' + value.slice(8) : value
      }
      const run = () => s.run({
        ...api, readCreateRevision:revision,
        createDirectory:async path => {
          stage = path
          await api.createDirectory(path)
          if (race !== 'same-revision') api.bump()
          if (race === 'foreign-file') s.nodes.set(path+'/foreign.bin',{type:0,bytes:Uint8Array.of(42),meta:newMetadata()})
          if (race === 'occupied-target') s.nodes.set(target,directory())
          if (race === 'remounted') remounted = true
        },
        createGroup:async (folder,members,expected) => {
          ++attempts
          if (race === 'same-revision' || race === 'twice-rejected' || await revision() !== expected)
            throw Object.assign(Error('Group rejected'),{cmd:0x28,status:1})
          return api.createGroup(folder,members,expected)
        }
      })
      if (race === 'unrelated') {
        assert.equal((await run()).completed,9)
        assert.equal(attempts,4)
        assert.equal(api.calls.flat().length,9)
      } else {
        await assert.rejects(run(),['same-revision','twice-rejected'].includes(race) ? {status:1} : {code:'SYNC_STALE'})
        assert.equal(attempts,race==='twice-rejected'?2:1)
        assert.equal(api.calls.length,0)
        assert.equal(s.job.newFolderUpload.inFlightGroup,undefined)
        assert.equal(s.nodes.has(target),race==='occupied-target')
        assert(![...s.nodes.keys()].some(path=>path.startsWith(target+'/')))
        if (race==='foreign-file') assert.equal(s.nodes.get(stage+'/foreign.bin').bytes[0],42)
      }
    })
  }
})

test('after a first-group revision conflict, the next leaf observes independently created siblings',async()=>{
  const s = await setupExisting([local('Group/first/a.bin',1),local('Group/next/z.bin',2)])
  const api = groupedApi(s), other = root+'/Group/next'
  let stagesCreated = 0
  const run = () => s.run({
    ...api,
    createDirectory:async path => {
      await api.createDirectory(path)
      if (!path.split('/').at(-1).startsWith('~u')) return
      if (++stagesCreated === 1) {
        s.nodes.set(other,directory())
        s.nodes.set(other+'/keep',{type:0,meta:newMetadata(),bytes:Uint8Array.of(71)})
        api.bump()
      }
    },
    createGroup:async (path,entries,expected) => {
      if (expected !== await api.readCreateRevision()) throw Object.assign(Error('Revision changed'),{cmd:0x28,status:1})
      return api.createGroup(path,entries,expected)
    }
  })
  await assert.rejects(run(),{code:'SYNC_STALE'})
  assert.equal(stagesCreated,1)
  assert.equal(api.calls.length,1)
  assert(s.nodes.has(root+'/Group/first/a.bin'))
  assert.deepEqual(s.nodes.get(other+'/keep').bytes,Uint8Array.of(71))
  assert(!s.nodes.has(other+'/z.bin'))
})
test('guarded existing-folder adds commit at most four neutral siblings and leave Unicode to RAW128', async () => {
  const files=['a','b','c','d','e','é'].map((n,i)=>local(n+'.bin',i))
  const s=await setupExisting(files), groups=[]
  const result=await s.run({...s.native,quickPacked:true,canGuardedCreate:async()=>true,
    readRawMetadata:async()=>new Uint8Array(128).fill(255),
    guardedCreate:async(parent,members,revision)=>{
      assert.equal(parent,root);assert.equal(revision,await s.native.readCreateRevision())
      groups.push(members.map(m=>m.name))
      for(const member of members) s.nodes.set(parent+'/'+member.name,{type:0,meta:newMetadata(),bytes:member.bytes.slice()})
      s.native.bump();return s.native.readCreateRevision()
    }})
  assert.equal(result.completed,6);assert.deepEqual(groups,[['a.bin','b.bin','c.bin','d.bin'],['e.bin']])
  assert.deepEqual(s.actions.filter(a=>a.kind==='open').map(a=>a.path),[root+'/é.bin'])
})
test('only an explicit guarded DEFER permits ordinary write guards, once per parent',async()=>{
  const s=await setupExisting(['a','b','c','d','e'].map((n,i)=>local(n+'.bin',i)));let groups=0
  const r=await s.run({quickPacked:true,canGuardedCreate:async()=>true,readRawMetadata:async()=>new Uint8Array(128).fill(255),
    guardedCreate:async()=>{groups++;return null}})
  assert.equal(groups,1);assert.equal(r.completed,5);assert.equal(s.actions.filter(a=>a.kind==='open').length,5)
})
test('uncertain guarded commit is reconciled by digest and RAW128 before retry',async()=>{
 for(const mode of ['lost-after','lost-before','wrong-metadata','changed-during-metadata','partial','malformed']) {
  const s=await setupExisting(['a','b','c','d'].map((n,i)=>local(n+'.bin',i)))
  let attempts=0,rawReads=0
  const opts={quickPacked:true,canGuardedCreate:async()=>true,readRawMetadata:async()=>{
       rawReads++;if(mode==='changed-during-metadata' && rawReads===1)s.native.bump();return new Uint8Array(128).fill(mode==='wrong-metadata'?0:255)
     },guardedCreate:async(parent,members)=>{
       attempts++
       for(const member of members) {
         if(attempts===1 && mode==='lost-before')break
         s.nodes.set(parent+'/'+member.name,{type:0,meta:newMetadata(),bytes:member.bytes.slice()})
         if(mode==='partial')break
       }
       s.native.bump()
       if(attempts===1) {if(mode==='malformed')return '1234';throw Error('lost acknowledgement')}
       return s.native.readCreateRevision()
     }}
  await assert.rejects(s.run(opts));assert.equal(attempts,1);assert.equal(s.job.pendingGuarded.length,4)
  assert.equal(s.actions.filter(a=>a.kind==='open').length,0)
  if(['partial','wrong-metadata','changed-during-metadata'].includes(mode)){await assert.rejects(s.run(opts),{code:'SYNC_STALE'});assert.equal(attempts,1);assert.equal(s.job.pendingGuarded.length,4);continue}
  const done=await s.run(opts)
  assert.equal(done.job.state,'complete');assert.equal(done.job.pendingGuarded,undefined)
  assert.equal(attempts,mode==='lost-before'?2:1);assert.equal(rawReads,mode==='lost-before'?0:4)
 }
})

test('direct existing-folder push compares guarded groups and RAW128 on all 1081 files',async t=>{
 const files=smallFileWorkload(), results=[]
 for(const enabled of [false,true]) {
  const s=await setupExisting(files),groups=[]
  s.actions.length=0
  const r=await s.run({quickPacked:true,prepareLeafUploads:undefined,
   canGuardedCreate:async()=>enabled,readRawMetadata:async()=>new Uint8Array(128).fill(255),
   guardedCreate:async(parent,entries,revision)=>{
    assert.equal(revision,await s.native.readCreateRevision()); groups.push(entries.length)
    for(const {name,bytes} of entries){
     const path=parent+'/'+name;assert.equal(s.nodes.has(path),false)
     s.nodes.set(path,{type:0,meta:newMetadata(),raw:new Uint8Array(128).fill(255),bytes:bytes.slice()})
    }
    s.native.bump();return s.native.readCreateRevision()
   }})
  assert.equal(r.completed,1081);assert.equal(r.uploadedBytes,658806)
  assert.equal([...s.nodes.values()].filter(n=>n.type===0).length,1081)
  for(const f of files){
   const n=s.nodes.get(root+'/'+f.relativePath);assert.deepEqual(n.bytes,new Uint8Array(await f.file.arrayBuffer()))
   assert.deepEqual(n.meta,newMetadata())
  }
  results.push({guarded:enabled,groups:groups.length,groupedFiles:groups.reduce((a,b)=>a+b,0),
   opens:s.actions.filter(a=>a.kind==='open').length,lists:s.actions.filter(a=>a.kind==='list').length})
 }
 t.diagnostic(JSON.stringify(results))
 assert.equal(results[1].groupedFiles,1053);assert.equal(results[1].opens,28)
 assert(results[1].lists < results[0].lists/3)
})
