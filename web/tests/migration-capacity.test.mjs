import test from 'node:test'
import assert from 'node:assert/strict'
import { simulateCapacity, conservativeTransactionBlocks } from '../src/lib/migration-capacity-engine.js'
import { sha256Bytes } from '../src/lib/safe-upload.js'
// Only the host integration contract is mocked. No approved simulator is shipped.
const bytes=Uint8Array.from([0,97,115,109,1,0,0,0])
async function fixture(overrides={}){
  const calls=[],instances=[]
  const target={approved:true,wasmSha256:await sha256Bytes(bytes),url:'/lfs-capacity.wasm',minimumReservePercent:20,
    geometry:{totalBlocks:512,blockSize:4096,metadataBytes:128,includesRestoreStaging:true},layout:{engineSha256:'cc'.repeat(32),shardTarget:32768},firmwareVersion:'2.22.0-DE3.31'}
  const options={archiveSha256:'a'.repeat(64),fetchImpl:async(url,options)=>{calls.push(['fetch',url,options]);return {ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer}},
    instantiate:async()=>{let count=0;const memory=new WebAssembly.Memory({initial:1});new Uint8Array(memory.buffer,768,32).fill(0xcc);const api={memory,begin:()=>0,path_buffer:()=>32,metadata_buffer:()=>128,archive_buffer:()=>512,engine_identity_buffer:()=>768,add:(kind,size)=>{count++;calls.push(['add',new TextDecoder().decode(new Uint8Array(memory.buffer,32,66)).split('\0')[0],kind,size]);return 0},finish:()=>0,verified_entries:()=>count,peak_used_blocks:()=>200,core_heap_peak_bytes:()=>2000,used_blocks:()=>200,total_blocks:()=>512,block_size:()=>4096,...overrides};instances.push(api);return {instance:{exports:api}}}}
  return {target,options,calls,instances}
}
const rows=[{path:'/z/file',kind:0,size:540},{path:'/z',kind:1,size:0},{path:'/empty',kind:0,size:0}].map(r=>({...r,rawMeta128Hex:'ff'.repeat(128)}))
test('simulator contract hashes local WASM first, uses fresh instances, parent-first synthetic paths and 20% reserve',async()=>{
  const f=await fixture(),report=await simulateCapacity(rows,f.target,f.options)
  assert.deepEqual(f.calls.filter(x=>x[0]==='add').map(x=>x.slice(1)),[['/z',1,0],['/empty',0,0],['/z/file',0,540]])
  assert.equal(report.passed,true);assert.equal(report.usedBlocks,200);assert.equal(report.minimumReservePercent,20);assert.equal(report.includesRestoreStaging,true)
  await simulateCapacity(rows,f.target,f.options);assert.equal(f.instances.length,2);assert.notEqual(f.instances[0].memory,f.instances[1].memory)
  assert.deepEqual(Object.keys(f.calls[0][2]).sort(),['cache','credentials','signal'])
})
test('unapproved module, wrong hash and geometry fail before simulation or false success',async()=>{
  const f=await fixture();await assert.rejects(simulateCapacity(rows,{...f.target,approved:false},f.options),{code:'MIGRATION_CAPACITY'});assert.equal(f.calls.length,0)
  await assert.rejects(simulateCapacity(rows,{...f.target,wasmSha256:'0'.repeat(64)},f.options),{code:'MIGRATION_CAPACITY'});assert.equal(f.instances.length,0)
  const g=await fixture({block_size:()=>8192});await assert.rejects(simulateCapacity(rows,g.target,g.options),{code:'MIGRATION_CAPACITY'});assert(!g.calls.some(x=>x[0]==='add'))
})
test('filesystem add failure and physical reserve shortfall never produce a capacity proof',async()=>{
  for(const overrides of [{add:()=>-28},{used_blocks:()=>480,peak_used_blocks:()=>480},{used_blocks:()=>-1},{finish:()=>-84},{verified_entries:()=>2},{peak_used_blocks:()=>400}]){
    const f=await fixture(overrides);await assert.rejects(simulateCapacity(rows,f.target,f.options),{code:'MIGRATION_CAPACITY'})
  }
})
test('conservative transaction allowance grows with oversized files and is added beyond observed peaks',async()=>{
  const normal=conservativeTransactionBlocks(rows,{blockSize:4096}),big=conservativeTransactionBlocks([{kind:0,size:200000}],{blockSize:4096})
  assert.equal(normal.additionalBlocks,27);assert(big.additionalBlocks>normal.additionalBlocks)
  const f=await fixture(),report=await simulateCapacity(rows,f.target,f.options)
  assert.equal(report.observedPeakUsedBlocks,200);assert.equal(report.peakUsedBlocks,227);assert.equal(report.conservativeReserveBytes,(512-227)*4096)
})
test('invalid names, sizes, kind, duplicates and buffers reject boundedly',async()=>{
  for(const input of [[{path:'/../x',kind:0,size:1}],[{path:'/x',kind:0,size:-1}],[{path:'/x',kind:2,size:0}],[rows[0],rows[0]],[{path:'x',kind:0,size:0}]]){
    const f=await fixture();await assert.rejects(simulateCapacity(input,f.target,f.options),{code:'MIGRATION_CAPACITY'});assert.equal(f.calls.length,0)
  }
  const f=await fixture({path_buffer:()=>65530});await assert.rejects(simulateCapacity(rows,f.target,f.options),{code:'MIGRATION_CAPACITY'})
})
test('cancellation prevents loading or subsequent entries and reports cannot authorize formatting',async()=>{
  const f=await fixture(),controller=new AbortController();controller.abort()
  await assert.rejects(simulateCapacity(rows,f.target,{...f.options,signal:controller.signal}),{name:'AbortError'});assert.equal(f.calls.length,0)
  const r=await simulateCapacity(rows,f.target,f.options);assert.match(r.limits,/not a hardware readback or authorization to format/)
})
