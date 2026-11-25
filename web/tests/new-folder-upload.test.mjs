import test from 'node:test'
import assert from 'node:assert/strict'
import { newFolderUploadRoot, executeNewFolderUpload } from '../src/lib/new-folder-upload.js'
import { createSyncPlan, createSyncJob } from '../src/lib/sync-plan.js'
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
