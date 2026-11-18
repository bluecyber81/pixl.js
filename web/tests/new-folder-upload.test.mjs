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
async function setup(selected = [0,1,2]) {
  const vfs = packedVfs(), files = fixtureFiles()
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
