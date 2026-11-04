import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {MIGRATION_CAPACITY_TARGET, DE354_MIGRATION_CAPACITY_TARGET, DE350_MIGRATION_CAPACITY_TARGET, DE345_MIGRATION_CAPACITY_TARGET, DE344_MIGRATION_CAPACITY_TARGET, PREVIOUS_MIGRATION_CAPACITY_TARGET, LEGACY_MIGRATION_CAPACITY_TARGET, getMigrationCapacityTarget} from '../src/lib/migration-capacity.js'
import {simulateCapacity} from '../src/lib/migration-capacity-engine.js'
const root=new URL('../',import.meta.url),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
const profiles=[
 {id:'current',folder:'packed-simulator-de355',target:MIGRATION_CAPACITY_TARGET,counter:630,version:'2.22.0-DE3.58',approvedCounters:[627,628,629,630],wasmSha256:'652dfaab0f7078ffa5def2186b1cf962387097e431dd9513579aa0d7cf3388f9',engineSha256:'2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248'},
 {id:'de354',folder:'packed-simulator-current',target:DE354_MIGRATION_CAPACITY_TARGET,counter:626,version:'2.22.0-DE3.54',approvedCounters:[623,624,625,626],wasmSha256:'50466efc477831b665df8f07ae2a2d45f004a655c5198f71f237a46cb3f5a105',engineSha256:'7f1c05d5159815922a89821ea23b080d25548ac3b2a075372b54905ca836496d'},
 {id:'de350',folder:'packed-simulator-de350',target:DE350_MIGRATION_CAPACITY_TARGET,counter:622,version:'2.22.0-DE3.50',approvedCounters:[618,619,620,621,622],
  wasmSha256:'0a2802690d575b2db70cbe49e2b6f0fd895b98eafcdf9cc2c654c98789cb611b',engineSha256:'a69d7b41bcb3ea72d02869290651efd00eea837109230f37364b3e1477a87059'},
 {id:'de345',folder:'packed-simulator-de345',target:DE345_MIGRATION_CAPACITY_TARGET,counter:617,version:'2.22.0-DE3.45',approvedCounters:[617],
  wasmSha256:'a4cfd3b1d823f2d596ba67625364260bbe74979b28c7123fc863e549b7199c99',engineSha256:'532b316e72fd7b9edef868bd318d30c8a6be45880d98b68464bf12da31bac9e8'},
 {id:'de344',folder:'packed-simulator-de344',target:DE344_MIGRATION_CAPACITY_TARGET,counter:616,version:'2.22.0-DE3.44',approvedCounters:[614,615,616],
  wasmSha256:'06500c5b69bd61310352cecc07eadb50a17b0eecd22c9381d1118c3cf0f8ec9f',engineSha256:'e3f8e958d347a0df58888253916393db8afec3fe7c5466b215f471d346e2493e'},
 {id:'previous',folder:'packed-simulator-previous',target:PREVIOUS_MIGRATION_CAPACITY_TARGET,counter:609,version:'2.22.0-DE3.37',approvedCounters:[608,609],
  wasmSha256:'410f213e0818a3a5e1d0ce381e202514f7dd3b834b1cec854d5fe6f180574b1f',engineSha256:'d13c90a1907cd9ee563cf7b14ad4d2b73307c49874021c369a0623fa7b382e6e'},
 {id:'legacy',folder:'packed-simulator',target:LEGACY_MIGRATION_CAPACITY_TARGET,counter:603,version:'2.22.0-DE3.31',approvedCounters:[603,604,605],
  wasmSha256:'8830aece6d900679ccfec27e4b1321ffc160aba9381023cd26c397d3e0dcb1d4',engineSha256:'637a0dd2e7fbfbc0305191dc755a647c2d76c4d72cf1289090f3ef7136bf4bbd'},
].map(profile=>({...profile,wasm:fs.readFileSync(new URL('public'+profile.target.url,root))}))
function optionsFor(profile,overrides={}) {
 return {archiveSha256:'ab'.repeat(32),fetchImpl:async(url,options)=>{
  assert.equal(url,profile.target.url);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin')
  return {ok:true,headers:{get:()=>String(profile.wasm.length)},arrayBuffer:async()=>profile.wasm.buffer.slice(profile.wasm.byteOffset,profile.wasm.byteOffset+profile.wasm.length)}
 },...overrides}
}
const sourceNames=['core/packed_fs.c','core/packed_fs.h','littlefs/lfs.c','littlefs/lfs.h','littlefs/lfs_util.c','littlefs/lfs_util.h',
 'sim/capacity_simulator.c','sim/minilib.c','sim/freestanding/string.h','sim/freestanding/inttypes.h','packed_identity.py','sim/sim_identity.h']
const rows=[{path:'/Leer',kind:1,size:0},{path:'/Ordner',kind:1,size:0},{path:'/Ordner/Ümlaut',kind:0,size:540},{path:'/Null',kind:0,size:0},{path:'/large',kind:0,size:40976}]
 .map((row,index)=>({...row,rawMeta128Hex:Buffer.from(Array.from({length:128},(_,i)=>(i*11+index*7)&255)).toString('hex')}))

for(const profile of profiles) {
 test(`${profile.id}: shipped WASM and complete sources are bound to their exact engine, application and unchanged geometry`,()=>{
  const {target,wasm}=profile,folder='third-party/'+profile.folder+'/'
  const binding=JSON.parse(fs.readFileSync(new URL(folder+'SOURCE_BINDING.json',root))),identity=JSON.parse(fs.readFileSync(new URL(folder+'ENGINE_IDENTITY.json',root)))
  assert.deepEqual(Object.keys(binding.sourceFiles).sort(),[...sourceNames].sort(),'complete simulator source set')
  for(const [name,digest]of Object.entries(binding.sourceFiles))assert.equal(sha(fs.readFileSync(new URL(folder+name,root))),digest,name)
  for(const [name,digest]of Object.entries(identity.manifest.files))assert.equal(binding.sourceFiles[(name.startsWith('packed_')?'core/':'littlefs/')+name],digest,name)
  assert.equal(sha(wasm),binding.wasmSha256);assert.equal(sha(wasm),target.wasmSha256);assert.equal(sha(wasm),profile.wasmSha256)
  assert.equal(sha(Buffer.from(JSON.stringify(canonical(identity.manifest)))),target.layout.engineSha256)
  assert.equal(identity.engineSha256,target.layout.engineSha256);assert.equal(binding.engineSha256,profile.engineSha256);assert.equal(target.layout.engineSha256,profile.engineSha256)
  assert.equal(target.layout.shardTarget,32768);assert.equal(target.layout.blockSize,4096);assert.equal(target.layout.blockCount,512)
  assert.equal(target.applicationCounter,profile.counter);assert.equal(target.firmwareVersion,profile.version)
  assert.deepEqual(target.approvedApplications.map(app=>app.applicationCounter),profile.approvedCounters)
  assert.deepEqual(binding.defines,['LFS_NO_ASSERT','LFS_NO_DEBUG','LFS_NO_ERROR','LFS_NO_MALLOC','LFS_NO_WARN'])
  const module=new WebAssembly.Module(wasm)
  assert.deepEqual(WebAssembly.Module.imports(module),[],'no hidden host imports')
  assert.deepEqual(WebAssembly.Module.exports(module).filter(item=>item.kind==='function').map(item=>item.name).sort(),[...binding.exports].sort())
  assert.equal(WebAssembly.Module.exports(module).filter(item=>item.name==='memory'&&item.kind==='memory').length,1)
  assert.equal(target.approved,true);assert.match(target.scope,/individual archive/)
  assert.equal(getMigrationCapacityTarget(profile.id),target)
  for(const item of [target,target.layout,target.geometry,target.approvedApplications,...target.approvedApplications])assert(Object.isFrozen(item))
 })

 test(`${profile.id}: real WASM preserves synthetic bytes/raw128/empty paths through staging, rename, remount and namespace verification`,async()=>{
  const {target}=profile,options=optionsFor(profile)
  const report=await simulateCapacity(rows,target,options)
  assert.equal(report.passed,true);assert.equal(report.verifiedEntries,5);assert.equal(report.engineSha256,profile.engineSha256)
  assert.equal(report.applicationCounter,profile.counter);assert.equal(report.firmwareVersion,profile.version);assert.equal(report.wasmSha256,profile.wasmSha256)
  assert(report.coreHeapPeakBytes<18432);assert(report.peakUsedBlocks>report.observedPeakUsedBlocks);assert(report.peakUsedBlocks*100<=report.totalBlocks*80)
  const empty=await simulateCapacity([],target,options);assert.equal(empty.verifiedEntries,0);assert(empty.usedBlocks<report.usedBlocks)
 })

 test(`${profile.id}: wrong physical WASM or embedded identity is rejected before any filesystem initialization`,async()=>{
  const other=profiles.find(item=>item!==profile)
  let instantiations=0,begins=0,adds=0
  const instantiate=async bytes=>{
   instantiations++;const result=await WebAssembly.instantiate(bytes,{}),api=result.instance.exports
   return {exports:{...api,begin:()=>{begins++;return api.begin()},add:(...args)=>{adds++;return api.add(...args)}}}
  }
  const fetchImpl=async url=>{assert.equal(url,profile.target.url);return {ok:true,headers:{get:()=>String(other.wasm.length)},arrayBuffer:async()=>other.wasm}}
  // A stale/swapped server asset must fail its pinned SHA before instantiation.
  await assert.rejects(simulateCapacity(rows,profile.target,{...optionsFor(profile),fetchImpl,instantiate}),{code:'MIGRATION_CAPACITY'})
  assert.equal(instantiations,0)
  // Even a changed outer hash cannot make a different embedded engine pass.
  await assert.rejects(simulateCapacity(rows,{...profile.target,wasmSha256:other.wasmSha256},{...optionsFor(profile),fetchImpl,instantiate}),{code:'MIGRATION_CAPACITY'})
  assert.equal(instantiations,1);assert.equal(begins,0);assert.equal(adds,0)
  await assert.rejects(simulateCapacity(rows,{...profile.target,layout:{...profile.target.layout,engineSha256:'ff'.repeat(32)}},{...optionsFor(profile),instantiate}),{code:'MIGRATION_CAPACITY'})
  assert.equal(instantiations,2);assert.equal(begins,0);assert.equal(adds,0)
 })
}

test('profile registry defaults only an omitted ID and rejects every unknown or non-string profile',()=>{
 assert.equal(getMigrationCapacityTarget(),MIGRATION_CAPACITY_TARGET)
 for(const value of ['','CURRENT','future','../legacy',null,0,false,{},[],MIGRATION_CAPACITY_TARGET])assert.throws(()=>getMigrationCapacityTarget(value),{code:'MIGRATION_CAPACITY'})
 assert.notEqual(MIGRATION_CAPACITY_TARGET,LEGACY_MIGRATION_CAPACITY_TARGET)
 assert.notEqual(MIGRATION_CAPACITY_TARGET.wasmSha256,LEGACY_MIGRATION_CAPACITY_TARGET.wasmSha256)
 assert.notEqual(MIGRATION_CAPACITY_TARGET.layout.engineSha256,LEGACY_MIGRATION_CAPACITY_TARGET.layout.engineSha256)
 assert.deepEqual(MIGRATION_CAPACITY_TARGET.geometry,LEGACY_MIGRATION_CAPACITY_TARGET.geometry)
})
