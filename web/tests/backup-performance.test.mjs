import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createBackup, createBackupCheckpoint } from '../src/lib/backup.js'
import { loadBackupIndex, loadBackupReference, loadBackupZip, previewZipImport, readBackupArchiveFile } from '../src/lib/zip-import.js'
import { memoryVfs, metadata } from './helpers/memory-vfs.mjs'

const JSZip = createRequire(import.meta.url)('../public/dfu/vendor/jszip-3.10.2.min.js')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const zipOptions = { JSZip }
const context = { rootPath: 'E:/', deviceKey: 'test', firmwareVersion: '2.22.0-DE3.75', exporterVersion: '3.53.0' }

test('a stable PackedFS revision verifies 56 backup directories in two round trips', async () => {
  const vfs = memoryVfs()
  vfs.nodes.delete('E:/tags')
  for (let n = 0; n < 55; n++) {
    const path = 'E:/d' + n
    vfs.nodes.set(path, { type: 1, meta: metadata() })
    vfs.put(path + '/figure.bin', [n])
  }
  let queries = 0
  const result = await createBackup({ ...context, ...vfs.api, readStorageRevision: async () => {
    queries++
    return '0000000100000005'
  } })
  assert.equal(queries, 2)
  assert.equal(result.profile.operations.listingCalls, 56)
  assert.equal(result.profile.operations.verificationListingCalls, 0)
  const archive = await loadBackupZip(result.blob, zipOptions)
  for (let n = 0; n < 55; n++) {
    assert.deepEqual([...readBackupArchiveFile(archive, 'E:/d' + n + '/figure.bin')], [n])
  }
  const legacy = await createBackup({ ...context, ...vfs.api, readStorageRevision: async () => null })
  assert.equal(legacy.profile.operations.verificationListingCalls, 56)
})

test('a changed mount, changed generation, missing final reply or malformed token blocks the ZIP', async () => {
  for (const final of ['0000000200000005', '0000000100000006', null]) {
    const vfs = memoryVfs()
    vfs.put('E:/tags/a.bin', [1, 2])
    const revisions = ['0000000100000005', final]
    await assert.rejects(createBackup({ ...context, ...vfs.api,
      readFile: async (...args) => {
        const bytes = await vfs.api.readFile(...args)
        vfs.put('E:/tags/a.bin', [3, 4])
        return bytes
      }, readStorageRevision: async () => revisions.shift()
    }), {code:'BACKUP_CHANGED'})
  }
  for (const invalid of [undefined, '0000000000000000', 'not-a-revision']) {
    await assert.rejects(createBackup({ ...context, ...memoryVfs().api, readStorageRevision: async () => invalid }), {code:'BACKUP_CHANGED'})
  }
})

test('repeat a 1081-file, 55-folder backup with the same size distribution using only current hashes for small files', async () => {
  const vfs = memoryVfs()
  vfs.nodes.delete('E:/tags')
  for (let n = 0; n < 55; ++n) vfs.nodes.set('E:/d' + n, { type: 1, meta: metadata() })
  // Only aggregate sizes from the performance case, all bytes, paths and notes are synthetic.
  const sizes = [[540,1033], [2048,25], [572,10], [238,2], [160,2], [80,2], [594,2],
    [532,1], [320,1], [68,1], [40976,1], [26,1]]
  let file = 0, commands = 0
  for (const [size, count] of sizes) for (let i = 0; i < count; ++i) {
    vfs.put('E:/d' + (file % 55) + '/' + file + '.bin', new Uint8Array(size).fill(file++ % 256))
  }
  const options = { ...context, ...vfs.api,
    readDirectory: async p => { ++commands; return vfs.api.readDirectory(p) },
    readFile: async (p, o) => { commands += 3; return vfs.api.readFile(p, o) },
    readFileDigest: async p => { ++commands; return sha(vfs.nodes.get(p).bytes) },
    readTransportStats: () => ({ completedCommands: commands, txFrames: commands, rxFrames: commands, txBytes: 0, rxBytes: 0 })
  }
  const initial = await createBackup(options)
  assert.equal(initial.manifest.bytes,658806)
  assert.equal(initial.manifest.files,1081)
  assert.equal(initial.manifest.directories,55)
  assert.equal(commands,3355)
  const reference = await loadBackupReference(initial.blob, zipOptions)
  assert.throws(() => readBackupArchiveFile(reference,'E:/d'+(1033%55)+'/1033.bin'), { code:'ZIP_ARCHIVE' })
  await assert.rejects(previewZipImport({ archive:reference, rootPath:'E:/', deviceKey:'test', ...vfs.api }), { code:'ZIP_ARCHIVE' })
  const repeat = await createBackup({ ...options, previousArchive: reference, compression: 'deflate' })
  assert.equal(repeat.profile.transport.completedCommands,1249)
  assert.equal(repeat.profile.operations.fileReads,28)
  assert.equal(repeat.profile.operations.previousZipFiles,1053)
  assert.equal(repeat.profile.operations.digestReplies,1053)
  assert.equal(repeat.profile.operations.listingCalls,56)
  assert.equal(repeat.profile.operations.verificationListingCalls,56)
  assert(repeat.profile.compressedFiles > 0)
  assert(repeat.blob.size < initial.blob.size)
  const verified = await loadBackupIndex(repeat.blob,zipOptions)
  assert.deepEqual(reference.entries,verified.entries)
  assert.equal(repeat.manifest.exporter.version,context.exporterVersion)
  assert(repeat.profile.phasesMs.total >= repeat.profile.phasesMs.packing)
  assert(repeat.profile.phasesMs.packing >= repeat.manifest.performance.phasesMs.packingFileEntries)
})

test('previous ZIP matches content only: current metadata, changed, added, deleted and unsupported files are handled', async () => {
  const vfs = memoryVfs()
  vfs.put('E:/tags/unchanged', [1,2], metadata(0,'old'))
  vfs.put('E:/tags/changed', [2]); vfs.put('E:/tags/deleted',[3]); vfs.put('E:/tags/large',new Uint8Array(573))
  const original = await createBackup({ ...context, ...vfs.api })
  const reference = await loadBackupReference(original.blob,zipOptions)
  assert.deepEqual([...readBackupArchiveFile(reference,'E:/tags/unchanged')],[1,2])
  vfs.nodes.get('E:/tags/unchanged').meta = metadata(1,'new')
  vfs.put('E:/tags/changed',[4]);vfs.put('E:/tags/added',[5]);vfs.nodes.delete('E:/tags/deleted')
  const readFileDigest = async p => sha(vfs.nodes.get(p).bytes)
  const options = { ...context, ...vfs.api, previousArchive:reference, readFileDigest }
  const good = await createBackup(options)
  assert.equal(good.profile.operations.previousZipFiles,1); assert.equal(good.profile.operations.digestReplies,2)
  assert.equal(good.profile.operations.fileReads,3)
  const archive = await loadBackupZip(good.blob,zipOptions)
  assert.deepEqual([...readBackupArchiveFile(archive,'E:/tags/changed')],[4])
  assert.deepEqual(archive.entries.find(e=>e.sourcePath==='E:/tags/unchanged').metadata,metadata(1,'new'))
  assert(!archive.entries.some(e=>e.sourcePath==='E:/tags/deleted'))
  const legacy = await createBackup({ ...options, readFileDigest:async()=>null })
  assert.equal(legacy.profile.operations.fileReads,4); assert.equal(legacy.profile.operations.previousZipFiles,0)
  await assert.rejects(createBackup({ ...options, readFileDigest:async()=>{ throw Error('link lost') } }),/link lost/)
  await assert.rejects(createBackup({ ...options, readFileDigest:async()=>'bad' }), { code:'BACKUP_DIGEST' })
  await assert.rejects(createBackup({ ...options, previousArchive:{...reference} }), { code:'BACKUP_BASELINE' })
  await assert.rejects(createBackup({ ...options, rootPath:'E:/tags' }), { code:'BACKUP_BASELINE' })
  await assert.rejects(createBackup({ ...options, readRawMetadata:async()=>new Uint8Array(128) }), { code:'BACKUP_API' })
})

test('fresh bytes must still match the device digest after a same-size change', async () => {
  const vfs = memoryVfs()
  const path = 'E:/tags/selection.bin'
  vfs.put(path, [1, 2])
  const first = await createBackup({ ...context, ...vfs.api })
  const previousArchive = await loadBackupReference(first.blob, zipOptions)
  vfs.put(path, [3, 4])
  let queries = 0
  const options = { ...context, ...vfs.api, previousArchive,
    readFileDigest: async p => { ++queries; return sha(vfs.nodes.get(p).bytes) } }

  const stable = await createBackup(options)
  const archive = await loadBackupZip(stable.blob, zipOptions)
  assert.deepEqual([...readBackupArchiveFile(archive, path)], [3, 4])
  assert.equal(queries, 1)

  const checkpointState = createBackupCheckpoint(context)
  await assert.rejects(createBackup({ ...options, checkpointState,
    readFile: (p, readOptions) => {
      vfs.put(path, [5, 6])
      return vfs.api.readFile(p, readOptions)
    }
  }), { code: 'BACKUP_CHANGED' })
  assert.equal(queries, 2)
  assert.equal(checkpointState.summary().files, 0)
})

test('ZIP reuse is checkpointed and an interrupted repeat can resume without the original ZIP', async () => {
  const vfs = memoryVfs()
  vfs.put('E:/tags/one',[1])
  const options = { ...context, ...vfs.api, checkpointState:createBackupCheckpoint(context),
    readFileDigest: async p => sha(vfs.nodes.get(p).bytes) }
  const reference = await loadBackupReference((await createBackup(options)).blob,zipOptions)
  const controller=new AbortController()
  await assert.rejects(createBackup({ ...options, previousArchive:reference, signal:controller.signal,
    onProgress:p=>{if(p.filesDone===1)controller.abort()} }), { name:'AbortError' })
  assert.equal(options.checkpointState.summary().files,1)
  const resumed=await createBackup(options)
  assert.equal(resumed.profile.operations.fileReads,0)
  assert.equal(resumed.manifest.resume.reusedFiles,1)
})

test('native compression fallback still yields a checked STORE ZIP; packing can be cancelled', async t => {
  const vfs = memoryVfs()
  vfs.put('E:/tags/unicode-ä.bin',new Uint8Array(40000))
  const options = { ...vfs.api, ...context, compression:'deflate' }
  t.mock.method(globalThis,'CompressionStream',function () { throw new Error('unsupported codec') })
  const result=await createBackup(options)
  assert.equal(result.profile.compressionFallback,true); assert.equal(result.profile.compressedFiles,0)
  const loaded=await loadBackupZip(result.blob,zipOptions)
  assert.equal(readBackupArchiveFile(loaded,'E:/tags/unicode-ä.bin').length,40000)
  const controller=new AbortController()
  await assert.rejects(createBackup({ ...options, signal:controller.signal,
    onProgress:p=>{if(p.phase==='archiving')setTimeout(()=>controller.abort(),0)} }), { name:'AbortError' })
})

test('optional render rate limit publishes phase changes and preserves final counts', async () => {
  const vfs=memoryVfs()
  for(let i=0;i<20;++i) vfs.put('E:/tags/f'+i,[i])
  const events=[]
  const result=await createBackup({...context,...vfs.api,progressIntervalMs:1000,onProgress:p=>events.push(p)})
  assert.deepEqual([...new Set(events.map(e=>e.phase))],['listing','reading','verifying','archiving','complete'])
  assert(events.filter(e=>e.phase==='reading').length<20)
  assert.equal(events.at(-1).filesDone,20)
  assert.equal(result.profile.transport,null)
})
