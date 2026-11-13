import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createBackup } from '../src/lib/backup.js'
import { compareBackupFiles } from '../src/lib/backup-comparison.js'
import { isVerifiedBackupArchive, loadBackupIndex, readBackupArchiveFile } from '../src/lib/zip-import.js'
import { memoryVfs, metadata } from './helpers/memory-vfs.mjs'

const JSZip = createRequire(import.meta.url)('../public/dfu/vendor/jszip-3.10.2.min.js')
const compare = (a, b, extra = {}) => compareBackupFiles(a, b, { JSZip, ...extra })
async function backup(vfs, options = {}) {
  return (await createBackup({ rootPath: 'E:/tags', ...vfs.api, preserveLegacyNames: true, ...options })).blob
}

test('compares completed archives by original relative path, including aliases, exact case and directories', async () => {
  const a = memoryVfs(), b = memoryVfs()
  a.put('E:/tags/Mario.bin', [1]); b.put('E:/tags/mario.bin', [1])
  a.put('E:/tags/a:b.bin', [1]); b.put('E:/tags/a:b.bin', [2])
  a.put('E:/tags/keep.bin', [5]); b.put('E:/tags/keep.bin', [5])
  a.put('E:/tags/new-note', [], metadata(0, 'old')); b.put('E:/tags/new-note', [], metadata(0, 'new'))
  a.nodes.set('E:/tags/change', { type: 1, meta: metadata() }); b.put('E:/tags/change', [])
  b.nodes.set('E:/tags/empty', { type: 1, meta: metadata() })
  const report = await compare(await backup(a), await backup(b))
  assert.deepEqual(report.counts, { added: 2, removed: 1, content: 1, metadata: 1, type: 1, unresolved: 0, same: 1 })
  assert.deepEqual(report.rows.map(({ path, status }) => [path, status]), [
    ['Mario.bin', 'removed'], ['a:b.bin', 'content'], ['change', 'type'], ['empty', 'added'],
    ['keep.bin', 'same'], ['mario.bin', 'added'], ['new-note', 'metadata']
  ])
})

test('compares roots explicitly by relative path, including two empty source folders', async () => {
  const a = memoryVfs(), b = memoryVfs()
  b.nodes.set('E:/different', { type: 1, meta: metadata() })
  const empty = await compare(await backup(a), await backup(b, { rootPath: 'E:/different' }))
  assert.deepEqual(empty.roots, ['E:/tags', 'E:/different'])
  assert.equal(empty.rows.length, 0)
  a.put('E:/tags/tag.bin', [1]); b.put('E:/different/tag.bin', [1])
  assert.equal((await compare(await backup(a), await backup(b, { rootPath: 'E:/different' }))).counts.same, 1)
})

test('schema 2 compares raw metadata including opaque bytes; mixed schemas use only valid decoded fields', async () => {
  const device = memoryVfs()
  device.put('E:/tags/tag.bin', [42], { ...metadata(), amiibo: { head: 0, tail: 0 } })
  const raw = async (tail, first = 0) => {
    const bytes = new Uint8Array(128); bytes[0] = first; bytes[127] = tail
    return backup(device, { readRawMetadata: async () => bytes })
  }
  const before = await raw(0), after = await raw(4), old = await backup(device)
  const exact = await compare(before, after)
  assert.equal(exact.exactMetadata, true); assert.equal(exact.counts.metadata, 1)
  const mixed = await compare(old, after)
  assert.equal(mixed.exactMetadata, false); assert.equal(mixed.counts.same, 1)
  assert.equal((await compare(old, await raw(0, 254))).counts.unresolved, 1)
})

test('rejects damaged bytes, wrong ZIPs and cancelled reads without returning a partial result', async () => {
  const device = memoryVfs(); device.put('E:/tags/tag.bin', [8])
  const good = await backup(device), zip = await JSZip.loadAsync(await good.arrayBuffer())
  zip.file('files/tag.bin', new Uint8Array([7]), { createFolders: false })
  const damaged = new Blob([await zip.generateAsync({ type: 'uint8array' })])
  await assert.rejects(compare(good, damaged), { code: 'ZIP_HASH' })
  await assert.rejects(compare(new Blob(['no zip']), good), { code: 'ZIP_LIMIT' })
  const controller = new AbortController()
  await assert.rejects(compare(good, good, {
    signal: controller.signal, onProgress: ({ side }) => { if (side === 'B') controller.abort() }
  }), { code: 'ZIP_CANCELLED' })
})

test('comparison index neither keeps file bytes for extraction nor authorizes an import', async () => {
  const device = memoryVfs(); device.put('E:/tags/tag.bin', [8])
  const index = await loadBackupIndex(await backup(device), { JSZip })
  assert.equal(isVerifiedBackupArchive(index), false)
  assert.throws(() => readBackupArchiveFile(index, 'E:/tags/tag.bin'), { code: 'ZIP_ARCHIVE' })
})

test('offline filters preserve exact paths and select every requested status without pagination loss',async()=>{
  const {filterBackupComparison,backupComparisonReport}=await import('../src/lib/backup-comparison.js');
  const a=memoryVfs(),b=memoryVfs();
  for(let i=0;i<61;i++){a.put(`E:/tags/Ä ${i}.bin`,[1]);b.put(`E:/tags/Ä ${i}.bin`,[2]);}
  a.put('E:/tags/Keep.bin',[7]);b.put('E:/tags/Keep.bin',[7]);b.put('E:/tags/=1+2.bin',[1]);
  const result=await compare(await backup(a),await backup(b)),before=JSON.stringify(result);
  assert.equal(filterBackupComparison(result).length,62);
  assert.equal(filterBackupComparison(result,{showSame:true}).length,63);
  assert.deepEqual(filterBackupComparison(result,{status:'same'}).map(r=>r.path),['Keep.bin']);
  assert.equal(filterBackupComparison(result,{status:'content',path:'ä '}).length,61);
  const report=backupComparisonReport(result,{status:'content',path:'ä '});
  assert.equal(report.exportedEntries,61);assert.equal(report.totalEntries,63);
  assert.equal(report.counts.content,61);assert.equal(report.rows[0].path,'Ä 0.bin');
  assert.deepEqual(Object.keys(report.rows[0]),['path','status','type']);
  assert.equal(JSON.stringify(result),before);
  assert.throws(()=>filterBackupComparison(result,{status:'__proto__'}));
  assert.throws(()=>filterBackupComparison(result,{path:'x'.repeat(257)}));
});

test('CSV exports use the shared spreadsheet-safe quoting and JSON preserves original names',async()=>{
  const {backupComparisonCsv,backupComparisonReport}=await import('../src/lib/backup-comparison.js');
  const a=memoryVfs(),b=memoryVfs();
  for(const path of ['=2+2.bin','＠SUM(1).bin','a;"b.bin'])b.put('E:/tags/'+path,[1]);
  const result=await compare(await backup(a),await backup(b));
  const german=backupComparisonCsv(result,{},'de_DE'),english=backupComparisonCsv(result,{},'en');
  assert.match(german,/^\uFEFF"Relativer Originalpfad";/);
  assert.match(english,/^\uFEFF"Original relative path",/);
  assert.match(german,/"'=2\+2.bin"/);assert.match(german,/"'＠SUM\(1\).bin"/);
  assert.match(german,/"a;""b.bin"/);
  const json=JSON.parse(JSON.stringify(backupComparisonReport(result,{})));
  assert.deepEqual(json.rows.map(r=>r.path),result.rows.map(r=>r.path));
  assert.equal(json.format,'allmiibo-backup-comparison');assert.equal(json.version,1);
});
