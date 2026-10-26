import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createBackup } from '../src/lib/backup.js'
import { createMigrationBackup,loadMigrationArchive,preflightMigrationArchive,verifyMigrationArchive,restoreMigrationArchive,checkMigrationCapacity,checkedStorage,migrationTreeSha256 } from '../src/lib/migration.js'
import { rawMetadataHex,rawMetadataBytes,decodeRawMetadata } from '../src/lib/raw-metadata.js'
import { parseUniqueJson } from '../src/lib/unique-json.js'
import { previewZipImport,readBackupArchiveFile } from '../src/lib/zip-import.js'
import { sha256Bytes } from '../src/lib/safe-upload.js'
import { memoryVfs } from './helpers/memory-vfs.mjs'
const require=createRequire(import.meta.url),JSZip=require('../public/dfu/vendor/jszip-3.10.1.min.js')
const storage=()=>({schema:1,drive:'E',backend:1,mounted:true,flags:7,metaLen:128,pathMax:64,nameMax:48})
function fixture(){
  const vfs=memoryVfs(),raw=new Map(),rawLog=[]
  const fallback=new Uint8Array(128).fill(255)
  vfs.put('E:/tags/zero',[]);vfs.put('E:/tags/Cafe\u0301.bin',[0,1,254,255]);vfs.nodes.set('E:/empty',{type:1,meta:{valid:false}})
  raw.set('E:/tags/Cafe\u0301.bin',Uint8Array.from({length:128},(_,i)=>i));raw.set('E:/empty',new Uint8Array(128))
  const options={...vfs.api,deviceKey:'device-A',firmwareVersion:'2.22.0-DE3.30-PREP',storageInfo:storage(),
    readRawMetadata:async path=>{rawLog.push(['read',path]);assert(vfs.nodes.has(path));return (raw.get(path)||fallback).slice()},
    updateRawMetadata:async(path,value)=>{rawLog.push(['write',path]);assert(vfs.nodes.has(path));raw.set(path,value.slice());vfs.nodes.get(path).meta=decodeRawMetadata(value)}}
  return {vfs,raw,rawLog,options}
}
async function archive(f){return loadMigrationArchive((await createMigrationBackup(f.options)).blob,{JSZip})}
const writes=f=>f.vfs.log.filter(x=>['write','mkdir','rename','remove','meta'].includes(x.op)).length+f.rawLog.filter(x=>x[0]==='write').length

test('raw128 retains all FF, opaque fields and trailing bytes with owned copies',()=>{
  const original=Uint8Array.from({length:128},(_,i)=>i*2),hex=rawMetadataHex(original),copy=rawMetadataBytes(hex)
  original.fill(0);copy.fill(0);assert.equal(rawMetadataBytes(hex)[127],254)
  assert.equal(decodeRawMetadata(new Uint8Array(128).fill(255)).valid,true)
  assert.equal(decodeRawMetadata(Uint8Array.from([2,99,...new Array(126).fill(0)])).valid,false)
  for(const invalid of [new Uint8Array(127),new Uint8Array(129),'ff','GG'.repeat(128)])assert.throws(()=>rawMetadataHex(invalid))
})
test('raw decoder reports complete TLV notes, hidden/readonly/unknown flag bits, IDs and invalid encoding',()=>{
  const raw=new Uint8Array(128).fill(255),note=new TextEncoder().encode('Ü\uFEFF'+'.'.repeat(90)),view=new DataView(raw.buffer)
  raw[0]=2+note.length+2+9;raw.set([1,note.length,...note,2,0xa5,3],1)
  view.setUint32(1+2+note.length+2+1,0x12345678,true);view.setUint32(1+2+note.length+2+5,0xfedcba98,true)
  const value=decodeRawMetadata(raw);assert.equal(value.valid,true);assert.equal(value.notes,'Ü\uFEFF'+'.'.repeat(90));assert.deepEqual(value.flags,{raw:0xa5,hide:true,readonly:true});assert.deepEqual(value.amiibo,{head:0x12345678,tail:0xfedcba98})
  raw[3]=0xff;assert.equal(decodeRawMetadata(raw).valid,false)
})
test('duplicate JSON keys including escaped aliases are rejected without prototype mutation',()=>{
  for(const value of ['{"x":1,"x":2}','{"nested":{"a":1,"\\u0061":2}}','[1,]','{"a":1,}','[01]','"unterminated'])assert.throws(()=>parseUniqueJson(value))
  assert.deepEqual(parseUniqueJson('{"text":"a\\\"b\\\\c","array":[true,null,-1.2e+3]}'),{text:'a"b\\c',array:[true,null,-1200]})
  const proto=parseUniqueJson('{"__proto__":{"polluted":true}}');assert.equal(Object.hasOwn(proto,'__proto__'),true);assert.equal({}.polluted,undefined)
  assert.throws(()=>parseUniqueJson('['.repeat(66)+'0'+']'.repeat(66)),/nesting/)
})
test('schema2 exports and rereads every raw byte, empty file, empty folder and original Unicode',async()=>{
  const f=fixture(),a=await archive(f)
  assert.equal(a.version,2);assert.equal(a.fileCount,2);assert.equal(a.directoryCount,2);assert.match(a.archiveSha256,/^[a-f0-9]{64}$/)
  for(const e of a.entries)assert.equal(e.rawMeta128Hex,rawMetadataHex(await f.options.readRawMetadata(e.sourcePath)))
  assert.deepEqual([...readBackupArchiveFile(a,'E:/tags/Cafe\u0301.bin')],[0,1,254,255])
  assert.equal(writes(f),0);assert.equal(a.entries.find(e=>e.sourcePath==='E:/empty').metadata.valid,true)
  await assert.rejects(previewZipImport({archive:a,...f.vfs.api,rootPath:'E:/',deviceKey:'device-A'}),{code:'ZIP_METADATA'})
})

test('complete migration backup uses three listing passes while retaining every file read and both raw128 comparisons',async()=>{
 const f=fixture(),backup=await createMigrationBackup(f.options),a=await loadMigrationArchive(backup.blob,{JSZip})
 assert.equal(f.vfs.log.filter(x=>x.op==='list').length,3*(a.directoryCount+1))
 assert.equal(f.vfs.log.filter(x=>x.op==='read').length,a.fileCount)
 assert.equal(f.rawLog.filter(x=>x[0]==='read').length,2*a.entries.length)
 assert.equal(writes(f),0)
})

test('a namespace change after raw backup checks still rejects the returned archive',async()=>{
 const f=fixture();let changed=false
 await assert.rejects(createMigrationBackup({...f.options,onProgress:p=>{if(p.phase==='archiving'&&!changed){changed=true;f.vfs.put('E:/late-file',[3])}}}),{code:'MIGRATION_CHANGED'})
 assert.equal(changed,true);assert.equal(writes(f),0)
})
test('full schema2 source comparison freshly reads every file and raw record, with no migration approval',async()=>{
  const f=fixture(),a=await archive(f),before=f.vfs.log.length,r=await verifyMigrationArchive({...f.options,archive:a})
  assert.equal(r.verified,true);assert.equal(r.migrationReady,false);assert.equal(r.filesVerified,2);assert.equal(r.bytesVerified,4)
  assert.equal(f.vfs.log.slice(before).filter(x=>x.op==='read').length,2);assert.equal(writes(f),0);assert(!JSON.stringify(r).includes('device-A'))
})
test('same-sized changed file and changed trailing raw bytes produce explicit hash/metadata differences',async()=>{
  const f=fixture(),a=await archive(f);f.vfs.nodes.get('E:/tags/Cafe\u0301.bin').bytes[0]=42;f.raw.get('E:/empty')[127]=77
  const r=await verifyMigrationArchive({...f.options,archive:a});assert.equal(r.verified,false)
  assert(r.differences.some(x=>x.reason==='sha256'));assert(r.differences.some(x=>x.reason==='metadata'));assert.equal(writes(f),0)
})
test('missing, extra and changed-type entries prevent a complete verification',async()=>{
  const f=fixture(),a=await archive(f);f.vfs.nodes.delete('E:/tags/zero');f.vfs.put('E:/extra',[1]);f.vfs.put('E:/empty',[])
  const r=await verifyMigrationArchive({...f.options,archive:a});assert.equal(r.verified,false)
  for(const reason of ['missing','unexpected','type'])assert(r.differences.some(x=>x.reason===reason))
})
test('old/new journals are archived and source-hashed, then explicitly excluded from target comparison',async()=>{
  const f=fixture();f.vfs.put('E:/.pixl_txn_old',[2,3]);f.vfs.put('E:/.pixl_txn_new',[4])
  const a=await archive(f),source=await verifyMigrationArchive({...f.options,archive:a});assert.equal(source.filesVerified,4)
  f.vfs.nodes.get('E:/.pixl_txn_old').bytes=new Uint8Array([99]);f.vfs.nodes.delete('E:/.pixl_txn_new')
  const target=await verifyMigrationArchive({...f.options,archive:a,target:true,storageInfo:{...storage(),backend:2}})
  assert.equal(target.verified,true);assert.deepEqual(target.excludedArchiveJournals.sort(),['E:/.pixl_txn_new','E:/.pixl_txn_old']);assert.deepEqual(target.excludedTargetJournals,['E:/.pixl_txn_old']);assert.equal(target.filesVerified,2)
})
test('pending and unknown journals are fully backed up but explicitly block restoration and capacity checks',async()=>{
  for(const path of ['E:/.pixl_txn_pending','E:/.pixl_txn_future']){
    const f=fixture();f.vfs.put(path,[7,8]);const a=await archive(f),r=await verifyMigrationArchive({...f.options,archive:a})
    assert.equal(r.verified,true);assert(r.restoreBlockers.some(x=>x.path===path&&x.code==='MIGRATION_PENDING'))
    assert.throws(()=>preflightMigrationArchive(a),{code:'MIGRATION_PENDING'})
    await assert.rejects(restoreMigrationArchive({...f.options,archive:a,storageInfo:{...storage(),backend:2}}),{code:'MIGRATION_PENDING'});assert.equal(writes(f),0)
  }
})
test('a target folder using a known journal name is never hidden from the full verification',async()=>{
  const f=fixture(),a=await archive(f)
  f.vfs.nodes.set('E:/.pixl_txn_old',{type:1,meta:{valid:false}})
  const report=await verifyMigrationArchive({...f.options,archive:a,target:true,storageInfo:{...storage(),backend:2}})
  assert.equal(report.verified,false);assert.deepEqual(report.excludedTargetJournals,[])
  assert(report.differences.some(x=>x.path==='E:/.pixl_txn_old'&&x.reason==='reserved-transaction-entry'))
  assert.equal(report.entriesObserved,a.entries.length+1)
})
test('case/Unicode alias originals remain in full backup but cannot be approved for restoration',async()=>{
  const f=fixture();f.vfs.put('E:/tags/CAFÉ.bin',[6]);const a=await archive(f)
  assert.equal(a.fileCount,3);assert.throws(()=>preflightMigrationArchive(a),{code:'MIGRATION_COLLISION'})
  const r=await verifyMigrationArchive({...f.options,archive:a});assert.equal(r.verified,true);assert(r.restoreBlockers.length)
})
test('capability absent, unmounted, wrong backend and changed path contract fail without device reads',async()=>{
  for(const change of [{flags:3},{metaLen:127},{mounted:false},{pathMax:128},{schema:2},{drive:'I'}]){
    const f=fixture();await assert.rejects(createMigrationBackup({...f.options,storageInfo:{...storage(),...change}}),{code:'MIGRATION_CAPABILITY'});assert.equal(f.vfs.log.length,0)
  }
  assert.throws(()=>checkedStorage(storage(),{target:true}),{code:'MIGRATION_BACKEND'})
})
test('schema1, selected-subfolder backups and forged archive objects cannot claim a migration backup',async()=>{
  const f=fixture(),ordinary=await createBackup({...memoryVfs().api,rootPath:'E:/'})
  await assert.rejects(loadMigrationArchive(ordinary.blob,{JSZip}),{code:'MIGRATION_ARCHIVE'})
  const partial=await createBackup({...f.options,rootPath:'E:/tags',preserveLegacyNames:true});await assert.rejects(loadMigrationArchive(partial.blob,{JSZip}),{code:'MIGRATION_ARCHIVE'})
  assert.throws(()=>preflightMigrationArchive({version:2,rootPath:'E:/',entries:[]}),{code:'MIGRATION_ARCHIVE'})
})
test('raw changes during backup or full verification reject the inconsistent proof',async()=>{
  const f=fixture();let count=0;const original=f.options.readRawMetadata
  f.options.readRawMetadata=async path=>{const value=await original(path);if(path==='E:/empty'&&++count>1)value[127]^=1;return value}
  await assert.rejects(createMigrationBackup(f.options),{code:'BACKUP_CHANGED'})
  const g=fixture(),a=await archive(g);let called=0;const reader=g.options.readRawMetadata
  await assert.rejects(verifyMigrationArchive({...g.options,archive:a,readRawMetadata:async path=>{const value=await reader(path);if(path==='E:/empty'&&++called>1)value[127]=1;return value}}),{code:'MIGRATION_CHANGED'})
})
test('cancellation and session changes prevent subsequent reads and all mutations',async()=>{
  const f=fixture(),a=await archive(f),controller=new AbortController();controller.abort()
  const count=f.vfs.log.length;await assert.rejects(verifyMigrationArchive({...f.options,archive:a,signal:controller.signal}),{name:'AbortError'});assert.equal(f.vfs.log.length,count)
  f.vfs.disconnect();await assert.rejects(verifyMigrationArchive({...f.options,archive:a}),{code:'SESSION_CHANGED'});assert.equal(writes(f),0)
})
test('without a genuine worker result no fetch injection, restore write or forged proof can bypass the gate',async()=>{
  const f=fixture(),a=await archive(f);let fetched=0
  await assert.rejects(checkMigrationCapacity(a,{fetchImpl:()=>{fetched++}}),{code:'MIGRATION_CAPACITY'})
  await assert.rejects(restoreMigrationArchive({...f.options,archive:a,storageInfo:{...storage(),backend:2},capacityProof:{firmwareVersion:f.options.firmwareVersion,passed:true}}),{code:'MIGRATION_CAPACITY'})
  assert.equal(fetched,0);assert.equal(writes(f),0)
})
test('capacity tree fingerprint binds exact original paths/types/sizes, excludes only known journals',async()=>{
  const f=fixture(),a=await archive(f),hash=await migrationTreeSha256(a);f.vfs.put('E:/.pixl_txn_old',[1]);const b=await archive(f)
  assert.equal(await migrationTreeSha256(b),hash);f.vfs.nodes.get('E:/tags/zero').bytes=new Uint8Array([0]);assert.notEqual(await migrationTreeSha256(await archive(f)),hash)
})
test('saved ZIP modified raw metadata without matching checksums is rejected',async()=>{
  const f=fixture(),backup=await createMigrationBackup(f.options),zip=await JSZip.loadAsync(await backup.blob.arrayBuffer()),manifest=JSON.parse(await zip.file('manifest.json').async('string'))
  manifest.entries[0].rawMeta128Hex='00'.repeat(128);manifest.entries[0].metadata=decodeRawMetadata(manifest.entries[0].rawMeta128Hex);zip.file('manifest.json',JSON.stringify(manifest))
  await assert.rejects(loadMigrationArchive(new Blob([await zip.generateAsync({type:'uint8array'})]),{JSZip}),{code:'ZIP_HASH'})
})
