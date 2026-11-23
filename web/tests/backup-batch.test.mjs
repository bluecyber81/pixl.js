import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createBackup, createBackupCheckpoint } from '../src/lib/backup.js'
import { loadBackupReference, loadBackupZip, readBackupArchiveFile } from '../src/lib/zip-import.js'
import { memoryVfs, metadata } from './helpers/memory-vfs.mjs'

const JSZip = createRequire(import.meta.url)('../public/dfu/vendor/jszip-3.10.2.min.js')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const revision = '0000000700000009'
const context = { rootPath:'E:/', deviceKey:'batch-device', firmwareVersion:'2.22.0-DE3.97' }
function fixture() {
  const vfs = memoryVfs(), readBatches = [], digestBatches = [], singles = []
  vfs.nodes.delete('E:/tags')
  const options = { ...context, ...vfs.api, readStorageRevision:async()=>revision,
    readFile:async(path,settings)=>{singles.push(path);return vfs.api.readFile(path,settings)},
    readFileDigest:async path=>sha(vfs.nodes.get(path).bytes),
    readFilesBatch:async(files,settings)=>{
      vfs.api.assertSession();assert.equal(settings.revision,revision);readBatches.push(structuredClone(files))
      assert(files.length<=4);assert(10+files.reduce((sum,f)=>sum+4+Buffer.byteLength(f.path),0)<=243)
      return files.map(file=>({...file,bytes:vfs.nodes.get(file.path).bytes.slice()}))
    },
    readFileDigestsBatch:async(files,settings)=>{
      vfs.api.assertSession();assert.equal(settings.revision,revision);digestBatches.push(structuredClone(files))
      return files.map(file=>({...file,sha256:sha(vfs.nodes.get(file.path).bytes)}))
    }
  }
  return {vfs,options,readBatches,digestBatches,singles}
}
const addSmall = f => {
  for(let n=0;n<6;n++)f.vfs.put('E:/'+String.fromCharCode(97+n)+'.bin',new Uint8Array(n).fill(n))
}

test('App670 full backup uses bounded read batches and preserves empty files, hashes, metadata and large-file fallback',async()=>{
  const f=fixture();addSmall(f);f.vfs.put('E:/g-large',new Uint8Array(573).fill(9));f.vfs.put('E:/h-small',[8,7],metadata(4,'note'))
  const result=await createBackup(f.options),archive=await loadBackupZip(result.blob,{JSZip})
  assert.deepEqual(f.readBatches.map(files=>files.length),[4,2]);assert.deepEqual(f.singles,['E:/g-large','E:/h-small'])
  assert.equal(result.profile.operations.fileReads,8);assert.equal(result.profile.operations.digestReplies,0)
  assert.equal(result.manifest.resume.reusedFiles,0)
  for(const entry of archive.entries.filter(entry=>entry.type==='file')) {
    const bytes=readBackupArchiveFile(archive,entry.sourcePath)
    assert.deepEqual(bytes,f.vfs.nodes.get(entry.sourcePath).bytes);assert.equal(entry.sha256,sha(bytes))
  }
  assert.deepEqual(archive.entries.find(entry=>entry.sourcePath==='E:/h-small').metadata,metadata(4,'note'))
})

test('App670 cached ZIP digests are genuinely batched and changed members are freshly read as a batch',async()=>{
  const f=fixture();addSmall(f)
  const initial=await createBackup({...f.options,readFilesBatch:undefined,readFileDigestsBatch:undefined})
  const previousArchive=await loadBackupReference(initial.blob,{JSZip})
  f.vfs.put('E:/b.bin',[99]);f.vfs.put('E:/d.bin',[44,44,44]);f.singles.length=0
  const result=await createBackup({...f.options,previousArchive}),archive=await loadBackupZip(result.blob,{JSZip})
  assert.deepEqual(f.digestBatches.map(files=>files.length),[4,2]);assert.deepEqual(f.readBatches.map(files=>files.map(f=>f.path)),[['E:/b.bin','E:/d.bin']])
  assert.equal(f.singles.length,0);assert.equal(result.profile.operations.fileReads,2);assert.equal(result.profile.operations.digestReplies,6)
  assert.equal(result.profile.operations.previousZipFiles,4);assert.equal(result.manifest.resume.reusedFiles,4)
  assert.deepEqual([...readBackupArchiveFile(archive,'E:/d.bin')],[44,44,44])
})

test('App670 invalid late batch elements or a failed exchange cannot enter the resume cache or trigger a silent fallback',async()=>{
  for(const mode of ['count','order','path','size','data','device']){
    const f=fixture();addSmall(f);const checkpointState=createBackupCheckpoint(context)
    const valid=f.options.readFilesBatch
    await assert.rejects(createBackup({...f.options,checkpointState,readFilesBatch:async(...args)=>{
      const result=await valid(...args)
      if(mode==='device')throw Error('device refused batch')
      if(mode==='count')result.pop()
      if(mode==='order')[result[0],result[3]]=[result[3],result[0]]
      if(mode==='path')result[3].path='E:/wrong'
      if(mode==='size')result[3].size++
      if(mode==='data')result[3].bytes=new Uint8Array(1)
      return result
    }}))
    assert.equal(checkpointState.summary().files,0,mode);assert.equal(checkpointState.summary().bytes,0,mode)
    assert.equal(checkpointState.summary().busy,false);assert.equal(f.singles.length,0,mode)
  }
})

test('App670 a malformed digest batch and content changed after digest leave no newly cached members',async()=>{
  for(const mode of ['digest','changed']){
    const f=fixture();addSmall(f)
    const initial=await createBackup({...f.options,readFilesBatch:undefined,readFileDigestsBatch:undefined})
    const previousArchive=await loadBackupReference(initial.blob,{JSZip}),checkpointState=createBackupCheckpoint(context)
    f.vfs.put('E:/b.bin',[8]);f.vfs.put('E:/d.bin',[9,9,9]);f.singles.length=0
    const digest=f.options.readFileDigestsBatch,read=f.options.readFilesBatch
    await assert.rejects(createBackup({...f.options,previousArchive,checkpointState,
      readFileDigestsBatch:async(...args)=>{const values=await digest(...args);if(mode==='digest')values.at(-1).sha256='bad';return values},
      readFilesBatch:async(...args)=>{const values=await read(...args);if(mode==='changed')values.at(-1).bytes.fill(7);return values}
    }))
    assert.equal(checkpointState.summary().files,0);assert.equal(f.singles.length,0)
  }
})

test('App670 cancellation and session loss at the batch completion boundary publish no files and start no next group',async()=>{
  for(const mode of ['abort','disconnect']){
    const f=fixture();addSmall(f);const controller=new AbortController(),checkpointState=createBackupCheckpoint(context)
    const valid=f.options.readFilesBatch
    await assert.rejects(createBackup({...f.options,checkpointState,signal:controller.signal,readFilesBatch:async(...args)=>{
      const result=await valid(...args)
      if(mode==='abort')controller.abort()
      else {f.vfs.disconnect();f.vfs.api.assertSession()}
      return result
    }}))
    assert.equal(f.readBatches.length,1);assert.equal(f.singles.length,0);assert.equal(checkpointState.summary().files,0)
  }
})

test('App670 unsupported capability preserves fresh single-file cancellation boundaries and does not keep probing',async()=>{
  const f=fixture();addSmall(f);let probes=0
  const result=await createBackup({...f.options,readFilesBatch:async()=>{probes++;return null}})
  assert.equal(probes,1);assert.equal(f.singles.length,6);assert.equal(result.manifest.files,6)
  const controller=new AbortController(),checkpointState=createBackupCheckpoint(context);f.singles.length=0
  await assert.rejects(createBackup({...f.options,checkpointState,signal:controller.signal,
    readFilesBatch:async()=>null,onProgress:p=>{if(p.filesDone===1)controller.abort()}
  }),{name:'AbortError'})
  assert.equal(f.singles.length,1);assert.equal(checkpointState.summary().files,1)
  const legacy=fixture();addSmall(legacy)
  await createBackup({...legacy.options,readStorageRevision:async()=>null})
  assert.equal(legacy.readBatches.length,0);assert.equal(legacy.singles.length,6)
})

test('App670 UTF-8 request accounting splits long identities below 243 bytes without changing archive mapping',async()=>{
  const f=fixture(),folder='E:/'+'d'.repeat(14);f.vfs.nodes.set(folder,{type:1,meta:metadata()})
  for(let n=0;n<5;n++)f.vfs.put(folder+'/'+String(n)+'ä'.repeat(23),[n])
  const result=await createBackup(f.options),archive=await loadBackupZip(result.blob,{JSZip})
  assert.deepEqual(f.readBatches.map(files=>files.length),[3,2]);assert.equal(f.singles.length,0)
  assert.equal(archive.entries.filter(entry=>entry.type==='file').length,5)
})

test('App670 persistent cached bytes still need local integrity and a fresh batched device digest',async()=>{
  for(const corrupt of [false,true]){
    const f=fixture();addSmall(f);const saved=new Map([...f.vfs.nodes].filter(([,v])=>v.type===0).map(([path,node])=>[path,{bytes:node.bytes.slice(),sha256:sha(node.bytes)}]))
    if(corrupt)saved.get('E:/d.bin').bytes.fill(91)
    const puts=[];const storedBackup={matches:()=>true,prune:async()=>{},get:async path=>saved.get(path),put:async(path,value)=>puts.push([path,value])}
    const promise=createBackup({...f.options,storedBackup})
    if(corrupt){await assert.rejects(promise,{code:'STORED_BACKUP_CORRUPT'});assert.equal(f.digestBatches.length,0)}
    else {const result=await promise;assert.equal(result.manifest.resume.reusedFiles,6);assert.deepEqual(f.digestBatches.map(files=>files.length),[4,2])}
    assert.equal(f.singles.length,0);assert.equal(f.readBatches.length,0);assert.equal(puts.length,0)
  }
})
