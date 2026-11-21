import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {DE395_MIGRATION_CAPACITY_TARGET, DE393_MIGRATION_CAPACITY_TARGET, DE392_MIGRATION_CAPACITY_TARGET, DE391_MIGRATION_CAPACITY_TARGET, DE389_MIGRATION_CAPACITY_TARGET, MIGRATION_CAPACITY_TARGET, DE354_MIGRATION_CAPACITY_TARGET, DE350_MIGRATION_CAPACITY_TARGET, DE345_MIGRATION_CAPACITY_TARGET, DE344_MIGRATION_CAPACITY_TARGET, PREVIOUS_MIGRATION_CAPACITY_TARGET, LEGACY_MIGRATION_CAPACITY_TARGET, getMigrationCapacityTarget} from '../src/lib/migration-capacity.js'
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js'
import {simulateCapacity} from '../src/lib/migration-capacity-engine.js'
const root=new URL('../',import.meta.url),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
const profiles=[
 {id:'de395',folder:'packed-simulator-de395',target:DE395_MIGRATION_CAPACITY_TARGET,counter:668,version:'2.22.0-DE3.95',approvedCounters:[668],wasmSha256:'311519a0da49474b57376908f836f2f45deccb90a9bbda855ae09343633b151c',engineSha256:'a9bdec38eaa41680e1c9fdebd5fd12995e9d38ff070560ff605fd387d471dabd'},
 {id:'de393',folder:'packed-simulator-de393',target:DE393_MIGRATION_CAPACITY_TARGET,counter:666,version:'2.22.0-DE3.93',approvedCounters:[666],wasmSha256:'f63157b7c22552cf0b23e9502e1c047cc40a205e198b908633bef8a8921e9c96',engineSha256:'7c7f2d25b90892980e9ce76e18cdaaa3782f18b940d95b8e37be6eb40831318e'},
 {id:'de392',folder:'packed-simulator-de392',target:DE392_MIGRATION_CAPACITY_TARGET,counter:665,version:'2.22.0-DE3.92',approvedCounters:[665],wasmSha256:'08428602391b6d9f8ee1bfb28abf683a5a774b97d75242da70d8d0f2f6314d16',engineSha256:'605356ff74646392adcfb26adf5c7d39fe7138272e84b4e4a0f167b94e34c2c1'},
 {id:'de391',folder:'packed-simulator-de391',target:DE391_MIGRATION_CAPACITY_TARGET,counter:664,version:'2.22.0-DE3.91',approvedCounters:[664],wasmSha256:'91ca3ef469ea6ecfca1dc18c80ad39d60977fc591b823274324c516bb7024548',engineSha256:'a0d15c28160774dd83ba80a71e8aad61fb41cd7ae0209eeec5486be7ea00d7a2'},
 {id:'de389',folder:'packed-simulator-de389',target:DE389_MIGRATION_CAPACITY_TARGET,counter:662,version:'2.22.0-DE3.89',approvedCounters:[662],wasmSha256:'e62f5857d60acea148edc365b85aaa22756fba8bd7f566d03d2f70ef605cad5c',engineSha256:'b0ae389e7fac3c7ce5f28607de7cd1cadad5465ab2ad4c1e2dc853fbfa2533da'},
 {id:'current',folder:'packed-simulator-de355',target:MIGRATION_CAPACITY_TARGET,counter:660,version:'2.22.0-DE3.87',approvedCounters:[627,628,629,630,631,632,633,634,635,636,637,638,639,640,641,642,644,645,646,647,648,649,650,652,653,654,655,656,657,658,659,660,661],wasmSha256:'652dfaab0f7078ffa5def2186b1cf962387097e431dd9513579aa0d7cf3388f9',engineSha256:'2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248'},
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

for (const [version, counter, document, bytes, binSha256] of [
  ['2.22.0-DE3.95', 668, 'DE3_95_PFS.json', 361992, 'cf1a310059338da51bc4acdcfc2cb4dd97ddbe6fb63491db6ea7d0de41b59bc9'],
  ['2.22.0-DE3.93', 666, 'DE3_93_PFS.json', 357964, 'bc08b79455d525667c03a1c03193bfb8d11a2e0416331dcc0d8ed90381550652'],
  ['2.22.0-DE3.92', 665, 'DE3_92_PFS.json', 364524, '10442542d2dd714cfb785d633890c91fd00709bcb1e4dbcf5531cfa3513ba776'],
  ['2.22.0-DE3.88', 661, 'DE3_88_PFS.json', 363608, '65ad4ae6946b2b9b1bb7ce025d4f8c6b035ec58016a05870bb1bf7639cfc7f47'],
  ['2.22.0-DE3.91', 664, 'DE3_91_PFS.json', 364128, '1e26b814eabf0789c0903e284a0bbd24bb885a3b2af01e09a25e5ce297073b7a'],
  ['2.22.0-DE3.89', 662, 'DE3_89_PFS.json', 363752, '401e9517ad3c199b48122caadcec86a72e15bb3ada491cea1b3d1342b34983ec'],
  ['2.22.0-DE3.75', 648, 'DE3_75_PFS.json', 358304, '3593cfc6e2dfc517a14e76f1802adf580148818cb41ba86a5739fc3c9ca41867'],
  ['2.22.0-DE3.87', 660, 'DE3_87_PFS.json', 360728, '2d9f35be88f6d5c258743a9c832c4993476bbdd6095d2c9fb4f741e20ec1290e'],
  ['2.22.0-DE3.86', 659, 'DE3_86_PFS.json', 359336, '431f211ff87825fb6df6bc5f6d2ae4a23f3ad275126d91d579b16fc717d17a65'],
  ['2.22.0-DE3.84', 657, 'DE3_84_PFS.json', 356216, 'b98eb45868a5bb80e6b770569a8402678d4a326b927820341ab728cf78e8f323'],
  ['2.22.0-DE3.83', 656, 'DE3_83_PFS.json', 355312, 'dc4a1440b20a0ddff202ee6739490ca5faf3bf1f6dcb245039b6d773b0665183'],
  ['2.22.0-DE3.82', 655, 'DE3_82_PFS.json', 362904, 'e08ec6c3f343750bde9689f0ba70f0d679a734a69dc8a426dd354183ea5c163e'],
  ['2.22.0-DE3.81', 654, 'DE3_81_PFS.json', 362892, '632c29cb9408bcd390d887db36f81b350b2d514b4252f00e674ceb972293e918'],
  ['2.22.0-DE3.80', 653, 'DE3_80_PFS.json', 362652, '34bb85efbf2fc1e5429ce09361aa2b39831d252f9fad80de425c6a992b78cfb8'],
  ['2.22.0-DE3.79', 652, 'DE3_79_PFS.json', 362652, 'd7d09513ae197c27ffce76707f8f764bf08568b1abd1372beaaa85e26d1eff0f'],
  ['2.22.0-DE3.77', 650, 'DE3_77_PFS.json', 362588, 'e8ff7f50571c988f2ade44fad601b00edd7f0e6c90fd880711fed0cb7d9cf055'],
  ['2.22.0-DE3.76', 649, 'DE3_76_PFS.json', 362188, '3e3899226d773b9f664400efdf536eb6bc1cea1fe61277218b63e730d29aed2a'],
]) {
  test(`App${counter} capacity binding matches the linked firmware and the qualified simulator`, () => {
    const evidence = JSON.parse(fs.readFileSync(new URL('../docs/validation/' + document, root)));
    const profile = profiles.find(item => item.target.approvedApplications.some(app => app.firmwareVersion === version && app.applicationCounter === counter));
    assert.equal(evidence.firmware, version);
    assert.equal(evidence.counter, counter);
    assert.equal(evidence.engine.engineSha256, profile.engineSha256);
    assert.equal(evidence.wasmSha256, sha(profile.wasm));
    assert.equal(evidence.buildArtifacts['pixljs.bin'], binSha256);
    assert.equal(evidence.intelHex.flashBytesCompared, bytes);
    assert.equal(evidence.elfLoadBytesCompared, bytes);
    assert.deepEqual(evidence.armLayoutCases.map(row => row.result === 0), [true, true, false, false]);
    assert.deepEqual(evidence.capacityCrossMount, {cases: 6, files: 1131, folders: 77, synthetic: true});
  });
}

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
  if (profile.id === 'current') assert.deepEqual(target.approvedApplications.filter(app=>app.applicationCounter >= 633), [
    {firmwareVersion:'2.22.0-DE3.61',applicationCounter:633},
    {firmwareVersion:'2.22.0-DE3.62',applicationCounter:634},
    {firmwareVersion:'2.22.0-DE3.63',applicationCounter:635},
    {firmwareVersion:'2.22.0-DE3.64',applicationCounter:636},
    {firmwareVersion:'2.22.0-DE3.65',applicationCounter:637},
    {firmwareVersion:'2.22.0-DE3.66',applicationCounter:638},
    {firmwareVersion:'2.22.0-DE3.67',applicationCounter:639},
    {firmwareVersion:'2.22.0-DE3.68',applicationCounter:640},
    {firmwareVersion:'2.22.0-DE3.69',applicationCounter:641},
    {firmwareVersion:'2.22.0-DE3.70',applicationCounter:642},
    {firmwareVersion:'2.22.0-DE3.71t1',applicationCounter:644},
    {firmwareVersion:'2.22.0-DE3.72',applicationCounter:645},
    {firmwareVersion:'2.22.0-DE3.73',applicationCounter:646},
    {firmwareVersion:'2.22.0-DE3.74',applicationCounter:647},
    {firmwareVersion:'2.22.0-DE3.75',applicationCounter:648},
    {firmwareVersion:'2.22.0-DE3.76',applicationCounter:649},
    {firmwareVersion:'2.22.0-DE3.77',applicationCounter:650},
    {firmwareVersion:'2.22.0-DE3.79',applicationCounter:652},
    {firmwareVersion:'2.22.0-DE3.80',applicationCounter:653},
    {firmwareVersion:'2.22.0-DE3.81',applicationCounter:654},
    {firmwareVersion:'2.22.0-DE3.82',applicationCounter:655},
    {firmwareVersion:'2.22.0-DE3.83',applicationCounter:656},
    {firmwareVersion:'2.22.0-DE3.84',applicationCounter:657},
    {firmwareVersion:'2.22.0-DE3.85',applicationCounter:658},
    {firmwareVersion:'2.22.0-DE3.86',applicationCounter:659},
    {firmwareVersion:'2.22.0-DE3.87',applicationCounter:660},
    {firmwareVersion:'2.22.0-DE3.88',applicationCounter:661}
  ])
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


for (const [release, counter, acceptance] of [
  ['85', 658, 'owner-reported-on-one-lcd'],
  ['86', 659, 'pending'],
  ['87', 660, 'pending'],
  ['88', 661, 'folder-transfer-and-resume-on-one-lcd'],
  ['89', 662, 'owner-reported-general-use-and-system-readback-on-one-lcd'],
]) {
 test(`App${counter} capacity evidence binds the candidate BIN, SourceID and engine to its stated hardware status`, () => {
 const version = '2.22.0-DE3.' + release;
 const evidence=JSON.parse(fs.readFileSync(new URL(`../docs/validation/DE3_${release}_PFS.json`,root)));
 const {packageReference:reference}=diagnosticBuildIdentity({firmwareVersion:version});
 const profile=profiles.find(item=>item.target.approvedApplications.some(app=>app.firmwareVersion===version && app.applicationCounter===counter));
 assert.equal(evidence.firmware,version);assert.equal(evidence.counter,counter);
 assert.equal(evidence.sourceId,reference.sourceId);
 assert.equal(evidence.engine.engineSha256,profile.engineSha256);
 assert.equal(evidence.wasmSha256,sha(profile.wasm));
 assert.equal(evidence.buildArtifacts['pixljs.bin'],reference.applicationBinSha256);
 assert.equal(evidence.intelHex.flashBytesCompared,reference.applicationBytes);
 assert.equal(evidence.elfLoadBytesCompared,reference.applicationBytes);
 assert.deepEqual(evidence.armLayoutCases.map(row=>row.result===0),[true,true,false,false]);
 assert.deepEqual(evidence.capacityCrossMount,{cases:6,files:1131,folders:77,synthetic:true});
 assert.equal(reference.hardwareAcceptance,acceptance);
});
}
