import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createBackup } from '../src/lib/backup.js'
import { inspectCollectionBackup } from '../src/lib/collection-backup-audit.js'
import { memoryVfs, metadata } from './helpers/memory-vfs.mjs'
import { mountSfc, nodes, text } from './helpers/vue-component-host.mjs'

const JSZip = createRequire(import.meta.url)('../public/dfu/vendor/jszip-3.10.2.min.js')
const known = '0102030400000002', other = '0102030500000002', unknown = '0102030600000002'
const catalogue = { entries: [known, other].map(id => ({ id, name: id, release: { eu: '2020-01-01' } })) }
function tag(id, variant = 0) {
  const bytes = new Uint8Array(540)
  bytes.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4])
  bytes.set(Buffer.from(id, 'hex'), 84)
  bytes[230] = variant
  return bytes
}
function info(id) {
  return { ...metadata(), amiibo: { head: parseInt(id.slice(0,8), 16), tail: parseInt(id.slice(8), 16) } }
}
async function fixture(rootPath = 'E:/') {
  const vfs = memoryVfs()
  for (const name of ['Sortiert', 'amiibolink', 'chameleon', 'player', 'Tags2']) vfs.nodes.set('E:/' + name, { type: 1, meta: metadata() })
  vfs.put('E:/Sortiert/A.bin', tag(known), info(known))
  vfs.put('E:/Sortiert/A2.bin', tag(known, 1), info(other))
  vfs.put('E:/Sortiert/New.bin', tag(unknown), info(unknown))
  vfs.put('E:/Tags2/B.bin', tag(other), info(other))
  vfs.put('E:/amiibolink/00.bin', tag(other), { ...metadata(), amiibo: { head:0, tail:0 } })
  vfs.put('E:/player/animation.bin', tag(other), info(other))
  vfs.put('E:/chameleon/00.bin', tag(other), info(other))
  vfs.put('E:/key_retail.bin', tag(other), info(other))
  return (await createBackup({ rootPath, ...vfs.api })).blob
}
test('verified backup collection defaults to Sortiert, resolves metadata, variants and unknown IDs, and separates slots', async () => {
  const blob = await fixture()
  const options = { catalogue, JSZip }
  const { rootPath, report, choices } = await inspectCollectionBackup(blob, options)
  assert.equal(rootPath, 'E:/Sortiert')
  assert.deepEqual(choices, ['E:/Sortiert','E:/','E:/amiibolink'])
  assert(report.complete)
  assert.equal(report.stats.filesRead, 3)
  assert.equal(report.stats.presentIds, 1)
  assert.deepEqual(report.missing.map(r => r.id), [other])
  assert.deepEqual(report.unknown.map(r => r.id), [unknown])
  assert.equal(report.duplicates[0].contentGroups.length, 2)
  assert.deepEqual(report.metadataMismatches, [{ path:'E:/Sortiert/A2.bin', metadataId:other, contentId:known }])
  const all = await inspectCollectionBackup(blob, { ...options, scope:'E:/' })
  assert.equal(all.report.stats.presentIds, 2)
  assert.equal(all.report.stats.filesRead, 4)
  const slots = await inspectCollectionBackup(blob, { ...options, scope:'E:/amiibolink' })
  assert(slots.checkingSlots)
  assert.equal(slots.report.stats.filesRead, 1)
  assert.equal(slots.report.stats.metadataMissing, 1)
  assert.deepEqual(slots.report.present.map(r => r.id), [other])
})
test('subfolder exports preserve original scope; cancelled reads and corrupt ZIPs do not return complete observations', async () => {
  const blob = await fixture('E:/Tags2')
  const result = await inspectCollectionBackup(blob, { catalogue, JSZip })
  assert.deepEqual(result.choices, ['E:/Tags2'])
  assert.equal(result.report.present[0].paths[0], 'E:/Tags2/B.bin')
  await assert.rejects(inspectCollectionBackup(blob, { scope:'E:/', JSZip }), /scope/)
  const controller = new AbortController()
  await assert.rejects(inspectCollectionBackup(blob, { JSZip, signal:controller.signal, onProgress: () => controller.abort() }), { name:'AbortError' })
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  zip.file('files/B.bin', tag(known), { createFolders:false })
  const corrupt = await zip.generateAsync({ type:'uint8array', compression:'DEFLATE' })
  await assert.rejects(inspectCollectionBackup(corrupt, { JSZip }), { code:'ZIP_HASH' })
})
test('offline panel works disconnected in both languages; cancelled or replaced work never publishes stale results', async () => {
  const blob = await fixture()
  const calls = []
  const deps = { '../lib/collection-backup-audit.js': { inspectCollectionBackup(file, options) {
    return new Promise((resolve,reject) => calls.push({ file,options,resolve,reject }))
  } } }
  const h = await mountSfc(new URL('../src/components/CollectionBackupAudit.vue',import.meta.url), {locale:'de_DE',catalogue}, deps)
  try {
    assert.match(text(h.root), /PC und Gerät vergleichen/)
    const input = nodes(h.root,'input')[0]
    input.props.onChange({target:{files:[blob]}}); await h.tick()
    nodes(h.root,'button').find(n => text(n) === 'Abbrechen').props.onClick()
    assert(calls[0].options.signal.aborted)
    input.props.onChange({target:{files:[blob]}}); await h.tick()
    calls[0].reject(Error('old check')); await h.tick()
    const result = await inspectCollectionBackup(blob, { JSZip,catalogue })
    calls[1].resolve(result); await h.tick(); await h.tick()
    assert.match(text(h.root), /1 \/ 2 Katalog-IDs gefunden/)
    assert.match(text(h.root), /Abweichende Metadaten-IDs \(1\)/)
    h.state.locale = 'en_US'; await h.tick()
    assert.match(text(h.root), /Compare PC and device/)
    assert.match(text(h.root), /1 \/ 2 catalogue IDs found/)
    nodes(h.root,'details')[0].props.onToggle({currentTarget:{open:false}}); await h.tick()
    assert.doesNotMatch(text(h.root), /catalogue IDs found/)
  } finally { h.app.unmount() }
})
