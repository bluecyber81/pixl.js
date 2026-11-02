import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {memoryVfs} from './helpers/memory-vfs.mjs'
import {simulateCapacityInWorker} from '../src/lib/migration-capacity-worker-client.js'

const require=createRequire(import.meta.url),JSZip=require('../public/dfu/vendor/jszip-3.10.2.min.js')
const layout={schema:1,drive:'E',backend:3,magic:0x31534650,flashBytes:2097152,blockSize:4096,blockCount:512,
  readSize:256,progSize:256,cacheSize:256,metadataBytes:128,shardTarget:32768,maxShards:64,pathCap:64,nameCap:48,maxHandles:8,flags:7}
const profiles={
  de350:{approved:true,layout:{...layout,engineSha256:"9".repeat(64)},wasmSha256:"0".repeat(64),firmwareVersion:"2.22.0-DE3.50",applicationCounter:622},
  de344:{approved:true,layout:{...layout,engineSha256:'7'.repeat(64)},wasmSha256:'8'.repeat(64),firmwareVersion:'2.22.0-DE3.44',applicationCounter:616},
  de345:{approved:true,layout:{...layout,engineSha256:'5'.repeat(64)},wasmSha256:'6'.repeat(64),firmwareVersion:'2.22.0-DE3.45',applicationCounter:617},
  de354:{approved:true,layout:{...layout,engineSha256:'c'.repeat(64)},wasmSha256:'d'.repeat(64),firmwareVersion:'2.22.0-DE3.54',applicationCounter:626},
  current:{approved:true,layout:{...layout,engineSha256:'1'.repeat(64)},wasmSha256:'2'.repeat(64),firmwareVersion:'2.22.0-DE3.55',applicationCounter:627},
  previous:{approved:true,layout:{...layout,engineSha256:'a'.repeat(64)},wasmSha256:'b'.repeat(64),firmwareVersion:'2.22.0-DE3.37',applicationCounter:609},
  legacy:{approved:true,layout:{...layout,engineSha256:'e'.repeat(64)},wasmSha256:'f'.repeat(64),firmwareVersion:'2.22.0-DE3.33',applicationCounter:605},
}
let serial=0
async function fixture(wrongReport=false){
  // Exercise workflow binding only. These synthetic profiles and worker reports
  // do not claim physical capacity or approve any shipped simulator.
  const file=new URL('../src/lib/migration.js',import.meta.url)
  const source=fs.readFileSync(file,'utf8')
    .replace(/^import \{ getMigrationCapacityTarget \}.*$/m,`const profiles=${JSON.stringify(profiles)};const getMigrationCapacityTarget=id=>{if(!Object.hasOwn(profiles,id))throw Object.assign(Error('unknown'),{code:'MIGRATION_CAPACITY'});return profiles[id]};`)
    .replace(/^import \{ simulateCapacityInWorker \}.*$/m,`const simulateCapacityInWorker=async(rows,o)=>{const t=getMigrationCapacityTarget(o.capacityProfile);return {passed:true,capacityProfile:${wrongReport?"o.capacityProfile==='current'?'legacy':'current'":"o.capacityProfile"},wasmSha256:t.wasmSha256,engineSha256:t.layout.engineSha256,archiveSha256:o.archiveSha256,verifiedEntries:rows.length,peakUsedBlocks:100,totalBlocks:512}};`)
    .replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,file).href}'`)
  const api=await import('data:text/javascript;base64,'+Buffer.from(source+`\n// isolated profile fixture ${serial++}`).toString('base64'))
  const vfs=memoryVfs();vfs.put('E:/a.bin',[1,2,3])
  const storageInfo={schema:1,drive:'E',backend:1,mounted:true,flags:7,metaLen:128,pathMax:64,nameMax:48}
  const archive=await api.loadMigrationArchive((await api.createMigrationBackup({...vfs.api,storageInfo,readRawMetadata:async()=>new Uint8Array(128).fill(255)})).blob,{JSZip})
  const target=profile=>({archive,deviceKey:'device',assertSession:()=>{},readStorageLayout:async()=>({...profiles[profile].layout,mounted:true}),
    readApplicationIdentity:async()=>({firmwareVersion:profiles[profile].firmwareVersion,applicationCounter:profiles[profile].applicationCounter,settingsCrcValid:true}),
    readImportState:async()=>({schema:1,drive:'E',backend:3,mounted:true,pending:true,ready:false,bound:true,rebootRequired:true,archiveSha256:archive.archiveSha256})})
  return {api,archive,vfs,target}
}

test('all seven capacity proofs stay bound to their exact engine and application',async()=>{
  const f=await fixture()
  for(const capacityProfile of ['current','de354','de350','de345','de344','previous','legacy']){
    const proof=await f.api.checkMigrationCapacity(f.archive,{capacityProfile})
    assert.equal(proof.capacityProfile,capacityProfile)
    const result=await f.api.inspectMigrationTarget({...f.target(capacityProfile),capacityProof:proof})
    assert.equal(result.identity.applicationCounter,profiles[capacityProfile].applicationCounter)
    const other=capacityProfile==='current'?'legacy':'current'
    await assert.rejects(f.api.inspectMigrationTarget({...f.target(other),capacityProof:proof}),{code:'MIGRATION_LAYOUT'})
    await assert.rejects(f.api.inspectMigrationTarget({...f.target(capacityProfile),capacityProof:proof,capacityProfile:other}),{code:'MIGRATION_CAPACITY'})
    await assert.rejects(f.api.inspectMigrationTarget({...f.target(capacityProfile),capacityProof:{...proof}}),{code:'MIGRATION_CAPACITY'})
  }
  assert(!f.vfs.log.some(e=>['write','remove','mkdir','rename','meta'].includes(e.op)))
})

test('omitted capacity ID selects current, while mismatched report IDs cannot create a proof',async()=>{
  const f=await fixture();assert.equal((await f.api.checkMigrationCapacity(f.archive)).capacityProfile,'current')
  const bad=await fixture(true)
  for(const capacityProfile of ['current','de354','de350','de345','de344','previous','legacy'])await assert.rejects(bad.api.checkMigrationCapacity(bad.archive,{capacityProfile}),{code:'MIGRATION_CAPACITY'})
})

test('unknown capacity IDs are rejected before constructing a worker',async()=>{
  let created=0
  class Worker{constructor(){created++}}
  for(const capacityProfile of ['next','',null,{},['legacy'],1]){
    await assert.rejects(simulateCapacityInWorker([],{capacityProfile,WorkerImpl:Worker}),{code:'MIGRATION_CAPACITY'})
  }
  assert.equal(created,0)
})

test('worker messages carry the selected local profile ID and never a caller-supplied raw target',async()=>{
  const workers=[]
  class Worker{constructor(){workers.push(this)}postMessage(message){this.message=message}terminate(){this.stopped=true}}
  for(const capacityProfile of ['current','de354','de350','de345','de344','previous','legacy']){
    const pending=simulateCapacityInWorker([],{capacityProfile,WorkerImpl:Worker,archiveSha256:'a'.repeat(64),target:{approved:true,url:'https://invalid.example/a.wasm'}})
    const worker=workers.at(-1)
    assert.deepEqual(worker.message,{rows:[],archiveSha256:'a'.repeat(64),capacityProfile})
    worker.onmessage({data:{kind:'result',report:{capacityProfile}}})
    assert.equal((await pending).capacityProfile,capacityProfile);assert.equal(worker.stopped,true)
  }
})
