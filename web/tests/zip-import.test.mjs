import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createBackup } from '../src/lib/backup.js'
import { loadBackupZip, previewZipImport, executeZipImport, ZIP_IMPORT_LIMITS } from '../src/lib/zip-import.js'
import { sha256Bytes } from '../src/lib/safe-upload.js'
import { memoryVfs, metadata } from './helpers/memory-vfs.mjs'
const require = createRequire(import.meta.url), JSZip = require('../public/dfu/vendor/jszip-3.10.1.min.js')
const key = 'test-device', encoder = new TextEncoder()
const preview = (archive, vfs, options = {}) => previewZipImport({ archive, rootPath: 'E:/', deviceKey: key, ...vfs.api, ...options })
const execute = (plan, vfs, selectedPaths, options = {}) => executeZipImport({ plan, deviceKey: key, selectedPaths, ...vfs.api, ...options })
const mutations = vfs => vfs.log.filter(item => ['write', 'rename', 'remove', 'mkdir', 'meta'].includes(item.op))
async function backup(vfs, rootPath = 'E:/') { return createBackup({ rootPath, ...vfs.api, preserveLegacyNames: true }) }
async function load(blob) { return loadBackupZip(blob, { JSZip }) }
async function simple() { const vfs = memoryVfs(); vfs.put('E:/tags/a.bin', [1, 2, 3], metadata(0x81, 'original note')); return { vfs, result: await backup(vfs) } }
async function rewritten(blob, change, updateManifestHash = false) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer()); await change(zip)
  if (updateManifestHash) {
    const manifest = await zip.file('manifest.json').async('uint8array')
    let sums = await zip.file('SHA256SUMS.txt').async('string')
    sums = sums.replace(/^[a-f0-9]{64}  manifest\.json$/mu, await sha256Bytes(manifest) + '  manifest.json')
    zip.file('SHA256SUMS.txt', sums)
  }
  return new Blob([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })])
}

test('complete backup loads without device access and preserves owned bytes, exact names, directories and metadata', async () => {
  const source = memoryVfs(), legacy = ['CON.bin', 'last. ', 'Cafe\u0301.bin', 'a:b', 'back\\slash.bin']
  for (const [index, name] of legacy.entries()) source.put('E:/tags/' + name, [index, 255], metadata(0xa1, 'Ü note'))
  source.nodes.set('E:/empty', { type: 1, meta: metadata(0x85, 'empty') })
  const result = await backup(source), bytes = new Uint8Array(await result.blob.arrayBuffer()), archive = await load(bytes)
  bytes.fill(0)
  assert.equal(archive.fileCount, legacy.length); assert.equal(archive.directoryCount, 2); assert(Object.isFrozen(archive.entries[0]))
  for (const name of legacy) assert(archive.entries.some(entry => entry.sourcePath === 'E:/tags/' + name))
  const target = memoryVfs(), plan = await preview(archive, target), selected = plan.entries.filter(entry => entry.status === 'add').map(entry => entry.targetPath)
  const imported = await execute(plan, target, selected)
  assert.equal(imported.filesCompleted, legacy.length)
  for (const [index, name] of legacy.entries()) {
    assert.deepEqual(target.bytes('E:/tags/' + name), [index, 255]); assert.deepEqual(target.nodes.get('E:/tags/' + name).meta, metadata(0xa1, 'Ü note'))
  }
  assert.deepEqual(target.nodes.get('E:/empty').meta, metadata(0x85, 'empty'))
})

test('explicit target root maps original source hierarchy directly without Windows extraction', async () => {
  const source = memoryVfs(); source.put('E:/tags/a.bin', [6], metadata(0, 'a'))
  const archive = await load((await backup(source, 'E:/tags')).blob), target = memoryVfs()
  target.nodes.set('E:/destination', { type: 1, meta: metadata() })
  const plan = await preview(archive, target, { rootPath: 'E:/destination' })
  assert.equal(plan.sourceRoot, 'E:/tags'); assert.equal(plan.entries[0].targetPath, 'E:/destination/a.bin')
  const freePaths = []
  await execute(plan, target, [plan.entries[0].targetPath], { getFreeBytes: path => { freePaths.push(path); assert.equal(path, 'E:/destination/a.bin'); return target.api.getFreeBytes(path) } })
  assert.deepEqual(freePaths, ['E:/destination/a.bin']); assert.deepEqual(target.bytes('E:/destination/a.bin'), [6]); assert(!target.nodes.has('E:/tags/a.bin'))
})

for (const location of ['destination', 'ancestor']) {
  test(`ZIP preview blocks a readonly ${location} outside its exported hierarchy`, async () => {
    const source = memoryVfs(); source.put('E:/tags/a.bin', [6])
    const archive = await load((await backup(source, 'E:/tags')).blob), target = memoryVfs()
    target.nodes.get('E:/tags').meta = metadata(4)
    const rootPath = location === 'ancestor' ? 'E:/tags/nested' : 'E:/tags'
    if (location === 'ancestor') target.nodes.set(rootPath, { type: 1, meta: metadata() })
    const plan = await preview(archive, target, { rootPath })
    assert.equal(plan.entries[0].status, 'blocked'); assert.equal(plan.entries[0].reason, 'PARENT_BLOCKED')
    await assert.rejects(execute(plan, target, [plan.entries[0].targetPath]), { code: 'ZIP_SELECTION' })
    assert.equal(mutations(target).length, 0); assert(!target.log.some(item => item.op === 'read'))
  })
}
test('ZIP preview blocks malformed destination metadata, and execution rechecks a changed destination root', async () => {
  const source = memoryVfs(); source.put('E:/tags/a.bin', [6])
  const archive = await load((await backup(source, 'E:/tags')).blob), target = memoryVfs()
  const plan = await preview(archive, target, { rootPath: 'E:/tags' })
  target.nodes.get('E:/tags').meta = metadata(4)
  await assert.rejects(execute(plan, target, ['E:/tags/a.bin']), { code: 'ZIP_STALE' })
  target.nodes.get('E:/tags').meta = { valid: false }
  const invalid = await preview(archive, target, { rootPath: 'E:/tags' })
  assert.equal(invalid.entries[0].reason, 'PARENT_BLOCKED'); assert.equal(mutations(target).length, 0)
})
test('ZIP directory creation rechecks parent protection after the fresh preview', async () => {
  const source = memoryVfs(); source.nodes.set('E:/tags/child', { type: 1, meta: metadata() })
  const archive = await load((await backup(source, 'E:/tags')).blob), target = memoryVfs()
  const plan = await preview(archive, target, { rootPath: 'E:/tags' })
  target.setHook(({ op, when, args }) => {
    if (op === 'list' && when === 'after' && args[0] === 'E:/tags') target.nodes.get('E:/tags').meta = metadata(4)
  })
  await assert.rejects(execute(plan, target, ['E:/tags/child']), { code: 'ZIP_STALE' })
  assert.equal(mutations(target).length, 0)
})

test('preview reads and hashes; replacements require an explicit selected change and preserve archive metadata', async () => {
  const { result } = await simple(), archive = await load(result.blob), target = memoryVfs()
  target.put('E:/tags/a.bin', [9], metadata(0, 'old target'))
  const plan = await preview(archive, target), file = plan.entries.find(entry => entry.type === 'file')
  assert.equal(file.status, 'change'); assert.equal(mutations(target).length, 0)
  await execute(plan, target, []); assert.equal(mutations(target).length, 0)
  await execute(plan, target, [file.targetPath]); assert.deepEqual(target.bytes(file.targetPath), [1, 2, 3]); assert.deepEqual(target.nodes.get(file.targetPath).meta, file.metadata)
})

test('new readonly folder metadata is applied only after its selected child has been verified', async () => {
  const source = memoryVfs(); source.nodes.set('E:/nested', { type: 1, meta: metadata(5, 'folder') }); source.put('E:/nested/x', [8])
  const archive = await load((await backup(source)).blob), target = memoryVfs(), plan = await preview(archive, target)
  await execute(plan, target, ['E:/nested/x'])
  assert.deepEqual(target.nodes.get('E:/nested').meta, metadata(5, 'folder'))
  assert(target.log.findIndex(item => item.op === 'meta' && item.args[0] === 'E:/nested') > target.log.findIndex(item => item.op === 'rename' && item.args[1] === 'E:/nested/x'))
})

test('existing directory metadata changes only when that directory is explicitly selected', async () => {
  const { vfs: source, result } = await simple(); source.nodes.get('E:/tags').meta = metadata(1, 'restored folder')
  const archive = await load((await backup(source)).blob), target = memoryVfs(), oldMeta = structuredClone(target.nodes.get('E:/tags').meta)
  let plan = await preview(archive, target); assert.equal(plan.entries.find(item => item.type === 'directory').status, 'change')
  await execute(plan, target, ['E:/tags/a.bin']); assert.deepEqual(target.nodes.get('E:/tags').meta, oldMeta)
  plan = await preview(archive, target); await execute(plan, target, ['E:/tags']); assert.deepEqual(target.nodes.get('E:/tags').meta, metadata(1, 'restored folder'))
})

for (const newlyCreated of [false, true]) for (const readonly of [false, true]) {
  test(`ZIP preserves late ${readonly ? 'protection' : 'notes'} on a ${newlyCreated ? 'new' : 'existing'} folder after its child commits`, async () => {
    const source = memoryVfs(); source.nodes.get('E:/tags').meta = metadata(0, 'archive folder'); source.put('E:/tags/a.bin', [1, 2, 3])
    const archive = await load((await backup(source)).blob), target = memoryVfs()
    if (newlyCreated) target.nodes.delete('E:/tags')
    else target.nodes.get('E:/tags').meta = metadata(0, 'target folder')
    const plan = await preview(archive, target), changed = metadata(readonly ? 4 : 0, 'new operator note')
    target.setHook(({ op, when, args }) => {
      if (op === 'rename' && when === 'after' && args[1] === 'E:/tags/a.bin') target.nodes.get('E:/tags').meta = structuredClone(changed)
    })
    await assert.rejects(execute(plan, target, ['E:/tags', 'E:/tags/a.bin']), error => {
      assert.equal(error.code, 'ZIP_STALE'); assert.deepEqual(error.importProgress.completedPaths, ['E:/tags/a.bin'])
      assert.deepEqual(error.importProgress.createdFolders, newlyCreated ? ['E:/tags'] : []); return true
    })
    assert.deepEqual(target.bytes('E:/tags/a.bin'), [1, 2, 3]); assert.deepEqual(target.nodes.get('E:/tags').meta, changed)
    assert(!target.log.some(item => item.op === 'meta' && item.args[0] === 'E:/tags'))
  })
}

test('ZIP snapshots actual new folder defaults and still applies final nested readonly metadata', async () => {
  const source = memoryVfs(); source.nodes.set('E:/new', { type: 1, meta: metadata(5, 'parent') })
  source.nodes.set('E:/new/child', { type: 1, meta: metadata(4, 'child') }); source.put('E:/new/child/a.bin', [3])
  const archive = await load((await backup(source)).blob), target = memoryVfs(), plan = await preview(archive, target)
  target.setHook(({ op, when, args }) => {
    if (op === 'mkdir' && when === 'after') target.nodes.get(args[0]).meta = metadata(0x80, 'device default')
  })
  const result = await execute(plan, target, ['E:/new/child/a.bin'])
  assert.equal(result.filesCompleted, 1); assert.equal(result.directoriesCompleted, 2)
  assert.deepEqual(target.nodes.get('E:/new').meta, metadata(5, 'parent')); assert.deepEqual(target.nodes.get('E:/new/child').meta, metadata(4, 'child'))
})

for (const changed of ['missing', 'file', 'alias', 'invalid-metadata']) {
  test(`ZIP rejects a late ${changed} folder before applying its metadata`, async () => {
    const source = memoryVfs(); source.nodes.get('E:/tags').meta = metadata(0, 'archive folder'); source.put('E:/tags/a.bin', [1])
    const archive = await load((await backup(source)).blob), target = memoryVfs(), plan = await preview(archive, target)
    target.setHook(({ op, when, args }) => {
      if (op !== 'rename' || when !== 'after' || args[1] !== 'E:/tags/a.bin') return
      if (changed === 'missing') target.nodes.delete('E:/tags')
      else if (changed === 'file') target.put('E:/tags', [9])
      else if (changed === 'alias') target.nodes.set('E:/TAGS', { type: 1, meta: metadata() })
      else target.nodes.get('E:/tags').meta = { valid: false }
    })
    // Some variants make the committed child's readback impossible first;
    // regardless of the earliest failure, the folder must never be overwritten.
    await assert.rejects(execute(plan, target, ['E:/tags', 'E:/tags/a.bin']))
    assert(!target.log.some(item => item.op === 'meta' && item.args[0] === 'E:/tags'))
  })
}

test('stale target, different device, blocked readonly entries and unknown selections never mutate', async () => {
  const { result } = await simple(), archive = await load(result.blob), target = memoryVfs(), plan = await preview(archive, target)
  await assert.rejects(execute(plan, target, ['E:/tags/a.bin'], { deviceKey: 'different' }), { code: 'ZIP_STALE' })
  await assert.rejects(execute(plan, target, ['E:/unknown']), { code: 'ZIP_SELECTION' })
  target.put('E:/tags/a.bin', [99]); await assert.rejects(execute(plan, target, ['E:/tags/a.bin']), { code: 'ZIP_STALE' })
  target.nodes.get('E:/tags/a.bin').meta = metadata(4)
  const locked = await preview(archive, target); assert.equal(locked.entries.find(item => item.type === 'file').reason, 'READONLY')
  await assert.rejects(execute(locked, target, ['E:/tags/a.bin']), { code: 'ZIP_SELECTION' }); assert.equal(mutations(target).length, 0)
})

test('case/Unicode target aliases are rejected before any device access; existing aliases are blocked', async () => {
  const source = memoryVfs(); source.put('E:/tags/a.bin', [1]); source.put('E:/tags/A.bin', [2])
  const archive = await load((await backup(source)).blob), target = memoryVfs()
  await assert.rejects(preview(archive, target), { code: 'ZIP_COLLISION' }); assert.equal(target.log.length, 0)
  const { result } = await simple(), one = await load(result.blob); target.put('E:/tags/A.bin', [3])
  const plan = await preview(one, target); assert.equal(plan.entries.find(item => item.type === 'file').reason, 'NAME_COLLISION')
})

test('metadata restore failure cannot replace the old file; recovery receipt remains available', async () => {
  const { result } = await simple(), archive = await load(result.blob), target = memoryVfs(); target.put('E:/tags/a.bin', [9])
  const plan = await preview(archive, target)
  target.setHook(event => { if (event.op === 'meta' && event.when === 'before') throw new Error('metadata failure') })
  await assert.rejects(execute(plan, target, ['E:/tags/a.bin']), error => { assert(error.importProgress); assert.equal(error.committed, false); return true })
  assert.deepEqual(target.bytes('E:/tags/a.bin'), [9]); assert(!target.log.some(item => item.op === 'rename'))
})

test('parse/preview cancellation prevents writes and concurrent imports cannot claim one plan', async () => {
  const { result } = await simple(), controller = new AbortController(); controller.abort()
  await assert.rejects(loadBackupZip(result.blob, { JSZip, signal: controller.signal }), { name: 'AbortError' })
  const archive = await load(result.blob), target = memoryVfs()
  await assert.rejects(preview(archive, target, { signal: controller.signal }), { name: 'AbortError' }); assert.equal(target.log.length, 0)
  const plan = await preview(archive, target), first = execute(plan, target, ['E:/tags/a.bin'])
  await assert.rejects(execute(plan, target, ['E:/tags/a.bin']), { code: 'ZIP_STALE' }); await first
})

test('folder-only and empty backups are supported without fabricating files', async () => {
  const source = memoryVfs(); source.nodes.delete('E:/tags')
  let archive = await load((await backup(source)).blob); assert.equal(archive.entries.length, 0)
  const target = memoryVfs(); let plan = await preview(archive, target); assert.equal((await execute(plan, target, [])).completed, 0)
  source.nodes.set('E:/empty', { type: 1, meta: metadata(1, 'empty folder') })
  archive = await load((await backup(source)).blob); plan = await preview(archive, target)
  const imported = await execute(plan, target, ['E:/empty']); assert.equal(imported.filesCompleted, 0); assert.equal(imported.directoriesCompleted, 1)
})

test('ordinary, firmware and correction ZIPs are explicitly unsupported', async () => {
  const zip = new JSZip(); zip.file('file.bin', new Uint8Array([1])); zip.file('README.txt', 'hello')
  await assert.rejects(load(new Blob([await zip.generateAsync({ type: 'uint8array' })])), { code: 'ZIP_MANIFEST' })
})

test('traversal, absolute, backslash, symlink and extra ZIP entries are rejected before device operations', async () => {
  const { result } = await simple()
  for (const name of ['../outside', '/absolute', 'C:/drive', 'files/a/../x', 'files\\x']) {
    const blob = await rewritten(result.blob, zip => zip.file(name, 'x', { createFolders: false }))
    await assert.rejects(load(blob), { code: 'ZIP_PATH' })
  }
  const extra = await rewritten(result.blob, zip => zip.file('extra', 'x'))
  await assert.rejects(load(extra), { code: 'ZIP_MANIFEST' })
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer()); zip.file('files/link', 'target', { unixPermissions: 0o120777 })
  await assert.rejects(load(new Blob([await zip.generateAsync({ type: 'uint8array', platform: 'UNIX' })])), { code: 'ZIP_TYPE' })
})

test('valid ZIP CRC alone cannot hide a changed file or manifest SHA-256', async () => {
  const { result } = await simple()
  const changedFile = await rewritten(result.blob, zip => zip.file('files/tags/a.bin', new Uint8Array([9, 9, 9])))
  await assert.rejects(load(changedFile), { code: 'ZIP_HASH' })
  const changedManifest = await rewritten(result.blob, async zip => { const m = JSON.parse(await zip.file('manifest.json').async('string')); m.entries[0].metadata.notes = 'changed'; zip.file('manifest.json', JSON.stringify(m)) })
  await assert.rejects(load(changedManifest), { code: 'ZIP_HASH' })
})

test('invalid manifests, source traversal, missing parents, metadata and extra checksum records are rejected', async () => {
  const { result } = await simple()
  for (const mutate of [m => { m.completed = false }, m => { m.rootPath = 'E:/../bad' }, m => { m.entries[1].sourcePath = 'E:/tags/../a.bin' },
    m => { m.entries[1].metadata.flags.hide = !m.entries[1].metadata.flags.hide }, m => { m.entries[1].metadata.notes = 'bad\0note' }, m => { m.files = 99 }]) {
    const bad = await rewritten(result.blob, async zip => { const m = JSON.parse(await zip.file('manifest.json').async('string')); mutate(m); zip.file('manifest.json', JSON.stringify(m)) }, true)
    await assert.rejects(load(bad))
  }
  const checksum = await rewritten(result.blob, async zip => { zip.file('SHA256SUMS.txt', await zip.file('SHA256SUMS.txt').async('string') + '0'.repeat(64) + '  extra\n') })
  await assert.rejects(load(checksum), { code: 'ZIP_HASH' })
})

test('advertised expansion bounds are checked before JSZip runs', async () => {
  const { result } = await simple(), bytes = new Uint8Array(await result.blob.arrayBuffer()), view = new DataView(bytes.buffer), end = bytes.length - 22, central = view.getUint32(end + 16, true)
  view.setUint32(central + 24, ZIP_IMPORT_LIMITS.fileBytes + 1, true)
  let called = false
  await assert.rejects(loadBackupZip(bytes, { JSZip: { loadAsync() { called = true; throw new Error('must not run') } } }), { code: 'ZIP_LIMIT' })
  assert.equal(called, false)
})

function zipRecords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), records = []
  let offset = view.getUint32(bytes.length - 6, true)
  const count = view.getUint16(bytes.length - 12, true)
  for (let index = 0; index < count; index++) {
    const nameLength = view.getUint16(offset + 28, true), local = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    records.push({ name, central: offset, local, payload: local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true) })
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  return { records, view }
}

test('ZIP CRC is checked independently from matching manifest and checksum hashes', async () => {
  const { result } = await simple(), bytes = new Uint8Array(await result.blob.arrayBuffer())
  const { records, view } = zipRecords(bytes), entry = records.find(item => item.name === 'files/tags/a.bin')
  // Coherent local and central fields, but the CRC is wrong for unchanged data.
  view.setUint32(entry.central + 16, 0xdeadbeef, true); view.setUint32(entry.local + 14, 0xdeadbeef, true)
  await assert.rejects(load(bytes), { code: 'ZIP_CRC' })
})

test('actual deflate expansion may not exceed the advertised entry allocation', async () => {
  const source = memoryVfs(); source.put('E:/tags/a.bin', new Uint8Array(1024 * 1024))
  const result = await backup(source), blob = await rewritten(result.blob, () => {})
  const bytes = new Uint8Array(await blob.arrayBuffer()), { records, view } = zipRecords(bytes)
  const entry = records.find(item => item.name === 'files/tags/a.bin')
  view.setUint32(entry.central + 24, 3, true); view.setUint32(entry.local + 22, 3, true)
  // Change manifest too, so coherent declared bounds reach the bounded inflator.
  const zip = await JSZip.loadAsync(bytes)
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'))
  // Keep compressed payload intact: rewrite only the small STORE manifest in a
  // separately crafted ZIP below, before falsifying the final size fields.
  manifest.entries.find(item => item.type === 'file').size = 3; manifest.bytes = 3
  const adjusted = await rewritten(blob, z => z.file('manifest.json', JSON.stringify(manifest)), true)
  const altered = new Uint8Array(await adjusted.arrayBuffer()), details = zipRecords(altered)
  const file = details.records.find(item => item.name === 'files/tags/a.bin')
  details.view.setUint32(file.central + 24, 3, true); details.view.setUint32(file.local + 22, 3, true)
  await assert.rejects(load(altered), { code: 'ZIP_LIMIT' })
})

test('mismatching local names and duplicate central records are rejected before decompression', async () => {
  const { result } = await simple(), original = new Uint8Array(await result.blob.arrayBuffer())
  let bytes = original.slice(), details = zipRecords(bytes), entry = details.records.find(item => item.name === 'files/tags/a.bin')
  bytes[entry.local + 30] ^= 1
  await assert.rejects(load(bytes), { code: 'ZIP_STRUCTURE' })
  bytes = original.slice(); details = zipRecords(bytes); entry = details.records.find(item => item.name === 'files/tags/a.bin')
  const directory = details.records.find(item => item.name === 'files/tags/')
  // Repoint the final directory record to an existing local header: a name and
  // local identity mismatch must fail before JSZip can collapse dictionary keys.
  details.view.setUint32(entry.central + 42, directory.local, true)
  await assert.rejects(load(bytes), { code: 'ZIP_STRUCTURE' })
})

test('cancel after one commit reports that file, retains original later files, and creates no later writes', async () => {
  const source = memoryVfs(); source.put('E:/tags/a.bin', [1]); source.put('E:/tags/b.bin', [2])
  const archive = await load((await backup(source)).blob), target = memoryVfs(), plan = await preview(archive, target), controller = new AbortController()
  target.setHook(event => { if (event.op === 'rename' && event.when === 'after' && event.args[1] === 'E:/tags/a.bin') controller.abort() })
  await assert.rejects(execute(plan, target, ['E:/tags/a.bin', 'E:/tags/b.bin'], { signal: controller.signal }), error => {
    assert.equal(error.name, 'AbortError'); assert.deepEqual(error.importProgress.completedPaths, ['E:/tags/a.bin']); return true
  })
  assert.deepEqual(target.bytes('E:/tags/a.bin'), [1]); assert(!target.nodes.has('E:/tags/b.bin'))
  assert.equal(target.log.filter(item => item.op === 'write').length, 1)
})

test('cancel immediately after creating a required folder retains that confirmed path in the receipt', async () => {
  const source = memoryVfs(); source.nodes.set('E:/new', { type: 1, meta: metadata() }); source.put('E:/new/a.bin', [1])
  const archive = await load((await backup(source)).blob), target = memoryVfs(), plan = await preview(archive, target), controller = new AbortController()
  target.setHook(event => { if (event.op === 'mkdir' && event.when === 'after') controller.abort() })
  await assert.rejects(execute(plan, target, ['E:/new/a.bin'], { signal: controller.signal }), error => {
    assert.equal(error.name, 'AbortError'); assert.deepEqual(error.importProgress.createdFolders, ['E:/new'])
    assert.deepEqual(error.importProgress.attemptedFolders, [{ path: 'E:/new', state: 'created' }]); return true
  })
  assert.equal(target.nodes.get('E:/new').type, 1); assert(!target.nodes.has('E:/new/a.bin'))
  assert(!target.log.some(item => item.op === 'write'))
})

test('failed or lost mkdir acknowledgements report possible folders without claiming creation or deleting anything', async () => {
  const source = memoryVfs(); source.nodes.set('E:/new', { type: 1, meta: metadata() }); source.put('E:/new/a.bin', [1])
  const archive = await load((await backup(source)).blob)
  for (const mode of ['before', 'after', 'disconnected']) {
    const target = memoryVfs(), plan = await preview(archive, target)
    target.setHook(event => {
      if (event.op === 'mkdir' && event.when === (mode === 'before' ? 'before' : 'after')) {
        if (mode === 'disconnected') target.disconnect()
        throw new Error('mkdir response unavailable')
      }
    })
    await assert.rejects(execute(plan, target, ['E:/new/a.bin']), error => {
      assert.deepEqual(error.importProgress.createdFolders, [])
      assert.deepEqual(error.importProgress.completedPaths, [])
      assert.deepEqual(error.importProgress.attemptedFolders, [{ path: 'E:/new', state: 'possible' }])
      return true
    })
    assert.equal(target.nodes.has('E:/new'), mode !== 'before')
    assert(!target.nodes.has('E:/new/a.bin'))
    assert(!target.log.some(item => ['write', 'remove', 'rename', 'meta'].includes(item.op)))
    assert.equal(target.log.at(-1).op, 'mkdir', 'No follow-up device operation after uncertain mkdir')
  }
})

test('restore cannot exceed the device path or per-component UTF-8 bounds after root remapping', async () => {
  const { result } = await simple(), archive = await load(result.blob), target = memoryVfs()
  await assert.rejects(preview(archive, target, { rootPath: 'E:/' + 'é'.repeat(23) + '/abcdefghi' }))
  assert.equal(target.log.length, 0)
})
