import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { BACKUP_LIMITS, createBackup } from '../src/lib/backup.js'
import { assertPortableEntryName } from '../src/lib/portable-names.js'

const encode = value => new TextEncoder().encode(value)
const digest = value => createHash('sha256').update(value).digest('hex')
const meta = (notes = '', raw = 0) => ({ valid: true, notes,
  flags: { raw, hide: !!(raw & 1), readonly: !!(raw & 4) }, amiibo: { head: 0x01020304, tail: 0xf1f2f3f4 } })
const file = (name, size = 9, metadata = meta()) => ({ name, size, type: 0, meta: metadata })
const dir = name => ({ name, size: 0, type: 1, meta: meta() })
const rejection = code => error => error.code === code

test('3.30.3 decoded backup rejects notes that would truncate on restore before file reads', async () => {
  const f = fixture({readDirectory: async () => [file('a.bin',9,meta('keep\0lost'))]});
  await assert.rejects(createBackup(f.options), rejection('BACKUP_METADATA'));
  assert.equal(f.reads.length, 0);
})

function fixture(overrides = {}) {
  const calls = [], reads = [], progress = []
  const files = new Map([['E:/a.bin', encode('123456789')], ['E:/日本/é.bin', new Uint8Array([0, 1, 255])], ['E:/zero', new Uint8Array()]])
  const folders = new Map([['E:/', [dir('日本'), file('zero', 0), dir('empty'), file('a.bin', 9, meta('Ä note', 0xa5))]],
    ['E:/日本', [file('é.bin', 3)]], ['E:/empty', []]])
  let active = 0
  const options = {
    rootPath: 'E:/', firmwareVersion: '2.21.0-DE3.16', onProgress: value => progress.push(value),
    readDirectory: async path => {
      assert.equal(active, 0, 'No listing while a file transaction is open')
      calls.push(['list', path]); assert.ok(folders.has(path), path)
      return structuredClone(folders.get(path))
    },
    readFile: async (path, settings) => {
      assert.equal(active++, 0, 'File transactions are serial')
      try {
        calls.push(['read', path]); reads.push([path, settings.maxBytes])
        const bytes = files.get(path); assert.ok(bytes, path)
        assert.equal(settings.maxBytes, bytes.length, 'Expected length reaches bounded protocol reader')
        settings.onProgress({ received_bytes: bytes.length })
        await Promise.resolve()
        return bytes
      } finally { --active }
    }, ...overrides,
  }
  return { options, files, folders, calls, reads, progress }
}

// Independent ZIP reader: use EOCD + central records, then check local records.
// Tests validate STORE/UTF-8, CRC's published check vector, offsets and lengths.
async function unzip(blob) {
  assert.equal(blob.type, 'application/zip')
  const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer)
  const end = bytes.length - 22
  assert.equal(view.getUint32(end, true), 0x06054b50)
  assert.equal(view.getUint16(end + 4, true), 0)
  assert.equal(view.getUint16(end + 6, true), 0)
  assert.equal(view.getUint16(end + 8, true), view.getUint16(end + 10, true))
  const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true)
  assert.equal(start + view.getUint32(end + 12, true), end)
  const entries = new Map()
  let cursor = start, nextLocal = 0
  for (let i = 0; i < count; ++i) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50)
    const size = view.getUint32(cursor + 24, true), crc = view.getUint32(cursor + 16, true)
    const n = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true)
    const offset = view.getUint32(cursor + 42, true)
    assert.equal(offset, nextLocal)
    assert.equal(view.getUint16(cursor + 8, true), 0x0800)
    assert.equal(view.getUint16(cursor + 10, true), 0)
    assert.equal(view.getUint32(cursor + 20, true), size)
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(cursor + 46, cursor + 46 + n))
    assert.equal(view.getUint32(offset, true), 0x04034b50)
    assert.equal(view.getUint16(offset + 6, true), 0x0800)
    assert.equal(view.getUint16(offset + 8, true), 0)
    assert.equal(view.getUint32(offset + 14, true), crc)
    assert.equal(view.getUint32(offset + 18, true), size)
    assert.equal(view.getUint32(offset + 22, true), size)
    assert.equal(view.getUint16(offset + 26, true), n)
    assert.equal(view.getUint16(offset + 28, true), 0)
    assert.equal(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + n)), name)
    assert.ok(!entries.has(name), 'No duplicate archive entries')
    entries.set(name, { bytes: bytes.slice(offset + 30 + n, offset + 30 + n + size), crc,
      attributes: view.getUint32(cursor + 38, true) })
    nextLocal = offset + 30 + n + size
    cursor += 46 + n + extra + comment
  }
  assert.equal(cursor, end); assert.equal(nextLocal, start)
  return entries
}

test('recursive ZIP retains exact file bytes, empty folders, Unicode, decoded metadata and SHA-256', async () => {
  const f = fixture(), result = await createBackup(f.options), entries = await unzip(result.blob)
  assert.match(result.filename, /^allmiibo-backup-E-[A-Za-z0-9-]+\.zip$/)
  assert.deepEqual([...entries.keys()], ['files/a.bin', 'files/empty/', 'files/zero', 'files/日本/', 'files/日本/é.bin', 'manifest.json', 'SHA256SUMS.txt'])
  assert.equal(entries.get('files/a.bin').crc, 0xcbf43926, 'Standard CRC-32 check vector')
  assert.equal(entries.get('files/zero').crc, 0)
  assert.ok(entries.get('files/empty/').attributes & 0x10)
  assert.deepEqual(entries.get('files/日本/é.bin').bytes, f.files.get('E:/日本/é.bin'))
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json').bytes))
  assert.deepEqual(manifest, result.manifest)
  assert.equal(manifest.completed, true); assert.equal(manifest.files, 3)
  assert.equal(manifest.directories, 2); assert.equal(manifest.bytes, 12)
  assert.equal(manifest.firmwareVersion, '2.21.0-DE3.16')
  assert.deepEqual(manifest.entries[0].metadata, meta('Ä note', 0xa5))
  assert.match(manifest.consistency, /Not an atomic snapshot/)
  assert.match(manifest.metadataEncoding, /not raw metadata bytes/)
  const sums = new TextDecoder().decode(entries.get('SHA256SUMS.txt').bytes).trim().split('\n')
  assert.equal(sums.length, 4)
  for (const line of sums) {
    const hash = line.slice(0, 64), path = line.slice(66)
    assert.equal(hash, digest(entries.get(path).bytes), path)
  }
  assert.deepEqual(f.reads.map(r => r[1]), [9, 0, 3])
  const firstRead = f.calls.findIndex(call => call[0] === 'read')
  assert.ok(f.calls.slice(0, firstRead).every(call => call[0] === 'list'))
  assert.equal(f.calls.filter(call => call[0] === 'list').length, 6, 'Every directory verified again')
  assert.equal(f.progress.at(-1).phase, 'complete')
  assert.equal(f.progress.at(-1).bytesDone, 12)
  assert.equal(f.progress.at(-1).filesDone, 3)
})

test('empty root still produces a verified manifest and checksum archive', async () => {
  const f = fixture(); f.folders.set('E:/', [])
  const result = await createBackup(f.options), entries = await unzip(result.blob)
  assert.deepEqual([...entries.keys()], ['manifest.json', 'SHA256SUMS.txt'])
  assert.equal(result.manifest.files, 0); assert.equal(result.manifest.bytes, 0)
  assert.equal(f.reads.length, 0); assert.equal(f.calls.length, 2)
})

test('selected subfolder and optional trailing slash never leak the drive into ZIP paths', async () => {
  const f = fixture({ rootPath: 'E:/日本/' })
  const result = await createBackup(f.options), entries = await unzip(result.blob)
  assert.equal(result.manifest.rootPath, 'E:/日本')
  assert.ok(entries.has('files/é.bin'))
  assert.ok(result.filename.startsWith('allmiibo-backup-__-'))
})

test('directory reordering alone is accepted; contents are matched by complete records', async () => {
  const f = fixture(), reader = f.options.readDirectory
  let count = 0
  f.options.readDirectory = async path => { const rows = await reader(path); return ++count > 3 ? rows.reverse() : rows }
  assert.ok((await createBackup(f.options)).blob.size > 0)
})

test('each unsafe root is rejected before device access', async () => {
  for (const rootPath of ['', '/', 'E:', 'E://', 'e:/', 'E:/../x', 'E:/a//b', 'E:/a\\b', 'E:/a\u0000', 'E:/a:/x', 'E:/a/./b']) {
    const f = fixture({ rootPath })
    await assert.rejects(createBackup(f.options))
    assert.deepEqual(f.calls, [])
  }
})

test('unsafe, ambiguous and non-extractable file names are rejected before file reads', async () => {
  for (const name of ['..', '.', '', '../a', 'a/b', 'a\\b', '/absolute', 'C:evil', 'a\nfile', 'a\u0000',
    'a.', 'a ', 'CON', 'nul.txt', 'LPT1.bin', 'COM¹', 'NUL.x', 'CON .txt', 'CONIN$', 'conout$.txt',
    'x<y', 'x?y', 'x*y', 'x|y', 'x"y', '\ud800', '\udfff']) {
    const f = fixture(); f.folders.set('E:/', [file(name)])
    await assert.rejects(createBackup(f.options), rejection('BACKUP_NAME'), JSON.stringify(name))
    assert.equal(f.reads.length, 0)
  }
})

test('duplicate, case-folded and normalization-equivalent sibling names cannot overwrite on extraction', async () => {
  for (const pair of [['a', 'a'], ['a.bin', 'A.bin'], ['é', 'e\u0301']]) {
    const f = fixture(); f.folders.set('E:/', pair.map(name => file(name)))
    await assert.rejects(createBackup(f.options), rejection('BACKUP_DUPLICATE'))
    assert.equal(f.reads.length, 0)
  }
})

test('all fields needed for a complete metadata export must be valid', async () => {
  for (const bad of [null, { valid: false }, { ...meta(), notes: 'x'.repeat(90) },
    { ...meta(), notes: '\ud800' }, { ...meta(), flags: { raw: 256, hide: false, readonly: false } },
    { ...meta(), flags: { raw: 1, hide: false, readonly: false } }, { ...meta(), amiibo: { head: -1, tail: 0 } }]) {
    const f = fixture(); f.folders.set('E:/', [file('a.bin', 9, bad)])
    await assert.rejects(createBackup(f.options)); assert.equal(f.reads.length, 0)
  }
})

test('unknown types and malformed lengths cannot become successful backups', async () => {
  for (const row of [{ ...file('a'), type: 2 }, { ...file('a'), type: '0' }, file('a', -1), file('a', 1.5), file('a', NaN), file('a', '9')]) {
    const f = fixture(); f.folders.set('E:/', [row])
    await assert.rejects(createBackup(f.options), rejection('BACKUP_RECORD'))
    assert.equal(f.reads.length, 0)
  }
})

test('path limits use UTF-8 bytes and exclude the drive prefix', async () => {
  const allowed = 'x'.repeat(62), f = fixture()
  f.folders.set('E:/', [file(allowed, 0)]); f.files.set(`E:/${allowed}`, new Uint8Array())
  assert.equal((await createBackup(f.options)).manifest.files, 1)
  for (const name of ['x'.repeat(63), 'é'.repeat(32)]) {
    const f = fixture(); f.folders.set('E:/', [file(name, 0)])
    await assert.rejects(createBackup(f.options), rejection('BACKUP_PATH')); assert.equal(f.reads.length, 0)
  }
})

test('file, total and listing count limits are checked before allocating file response buffers', async () => {
  for (const rows of [[file('large', BACKUP_LIMITS.maxFileBytes + 1)],
    [file('a', BACKUP_LIMITS.maxFileBytes), file('b', BACKUP_LIMITS.maxFileBytes), file('c', 1)],
    Array.from({ length: BACKUP_LIMITS.maxEntries + 1 }, (_, i) => file(`f${i}`, 0))]) {
    const f = fixture(); f.folders.set('E:/', rows)
    await assert.rejects(createBackup(f.options), rejection('BACKUP_LIMIT')); assert.equal(f.reads.length, 0)
  }
})

test('the entry count limit is global across folders', async () => {
  const f = fixture(); f.folders.set('E:/', [dir('one'), dir('two')])
  f.folders.set('E:/one', Array.from({ length: 2048 }, (_, i) => file(`f${i}`, 0)))
  f.folders.set('E:/two', Array.from({ length: 2048 }, (_, i) => file(`f${i}`, 0)))
  await assert.rejects(createBackup(f.options), rejection('BACKUP_LIMIT')); assert.equal(f.reads.length, 0)
})

test('list errors, READ errors and CLOSE errors reject without returning an archive', async () => {
  const errors = [new Error('Listing error'), new Error('READ error'), new Error('CLOSE error')]
  for (let i = 0; i < errors.length; ++i) {
    const f = fixture(i === 0 ? { readDirectory: async () => { throw errors[i] } } : { readFile: async () => { throw errors[i] } })
    await assert.rejects(createBackup(f.options), error => error === errors[i])
    assert.ok(!f.progress.some(p => p.phase === 'complete'))
  }
})

test('truncated, grown and nonbinary file reads reject', async () => {
  for (const value of [new Uint8Array(8), new Uint8Array(10), '123456789', new DataView(new ArrayBuffer(9))]) {
    const f = fixture({ readFile: async () => value })
    await assert.rejects(createBackup(f.options), error => ['BACKUP_SIZE', 'BACKUP_DATA'].includes(error.code))
    assert.ok(!f.progress.some(p => p.phase === 'complete'))
  }
})

test('changed names, sizes, metadata and removals after reads fail final verification', async () => {
  for (const change of [rows => [...rows, file('added', 0)], rows => rows.slice(1),
    rows => rows.map(row => row.name === 'a.bin' ? { ...row, size: 10 } : row),
    rows => rows.map(row => row.name === 'a.bin' ? { ...row, meta: meta('changed') } : row)]) {
    const f = fixture(), reader = f.options.readDirectory
    let rootReads = 0
    f.options.readDirectory = async path => {
      const rows = await reader(path)
      return path === 'E:/' && ++rootReads > 1 ? change(rows) : rows
    }
    await assert.rejects(createBackup(f.options), rejection('BACKUP_CHANGED'))
    assert.ok(!f.progress.some(p => p.phase === 'complete'))
  }
})

test('late verification failure rejects a backup even after all file reads succeeded', async () => {
  const f = fixture(), reader = f.options.readDirectory
  let calls = 0
  f.options.readDirectory = async path => { if (++calls > 3) throw new Error('verification disconnected'); return reader(path) }
  await assert.rejects(createBackup(f.options), /verification disconnected/)
  assert.equal(f.reads.length, 3)
})

test('data is owned before a protocol adapter can reuse its receive buffer', async () => {
  const shared = new Uint8Array(9), f = fixture()
  f.folders.set('E:/', [file('a', 9), file('b', 9)])
  f.options.readFile = async path => { shared.fill(path.endsWith('a') ? 1 : 2); return shared }
  const result = await createBackup(f.options), entries = await unzip(result.blob)
  assert.deepEqual(entries.get('files/a').bytes, new Uint8Array(9).fill(1))
  assert.deepEqual(entries.get('files/b').bytes, new Uint8Array(9).fill(2))
  shared.fill(3)
  assert.equal(result.manifest.entries[0].sha256, digest(new Uint8Array(9).fill(1)))
})

test('ArrayBuffer and sliced Uint8Array include only the actual file bytes', async () => {
  for (const value of [encode('123456789').buffer, encode('X123456789Y').subarray(1, 10)]) {
    const f = fixture({ readFile: async () => value }); f.folders.set('E:/', [file('a.bin')])
    const entries = await unzip((await createBackup(f.options)).blob)
    assert.deepEqual(entries.get('files/a.bin').bytes, encode('123456789'))
  }
})

test('Uint8Array subclasses with shared slice semantics cannot alter already collected files', async () => {
  const shared = Buffer.alloc(9), f = fixture()
  f.folders.set('E:/', [file('a', 9), file('b', 9)])
  f.options.readFile = async path => { shared.fill(path.endsWith('a') ? 1 : 2); return shared }
  const entries = await unzip((await createBackup(f.options)).blob)
  assert.deepEqual(entries.get('files/a').bytes, new Uint8Array(9).fill(1))
})

test('already aborted export performs no device requests', async () => {
  const controller = new AbortController(); controller.abort()
  const f = fixture({ signal: controller.signal })
  await assert.rejects(createBackup(f.options), { name: 'AbortError' })
  assert.equal(f.calls.length, 0)
})

test('cancel waits for an active reader to settle, then performs no further operations', async () => {
  const controller = new AbortController(), f = fixture({ signal: controller.signal })
  let settle, started, settled = false
  const ready = new Promise(resolve => { started = resolve })
  f.options.readFile = async () => { started(); return new Promise(resolve => { settle = () => { settled = true; resolve(encode('123456789')) } }) }
  const run = createBackup(f.options)
  await ready; controller.abort()
  let completed = false; run.finally(() => { completed = true }).catch(() => {})
  await Promise.resolve(); assert.equal(completed, false, 'No premature file-handle abandonment')
  const calls = f.calls.length; settle()
  await assert.rejects(run, { name: 'AbortError' })
  assert.equal(settled, true); assert.equal(f.calls.length, calls)
  assert.ok(!f.progress.some(p => p.phase === 'complete'))
})

test('cancel during directory loading stops recursion and all file reads', async () => {
  const controller = new AbortController(), f = fixture({ signal: controller.signal }), reader = f.options.readDirectory
  f.options.readDirectory = async path => { const value = await reader(path); controller.abort(); return value }
  await assert.rejects(createBackup(f.options), { name: 'AbortError' })
  assert.equal(f.calls.length, 1); assert.equal(f.reads.length, 0)
})

test('ZIP generation yields to cancellation before completion', async () => {
  const controller = new AbortController(), f = fixture({ signal: controller.signal })
  f.options.onProgress = value => { f.progress.push(value); if (value.phase === 'archiving') setTimeout(() => controller.abort(), 0) }
  await assert.rejects(createBackup(f.options), { name: 'AbortError' })
  assert.ok(!f.progress.some(p => p.phase === 'complete'))
})

test('bad progress events do not falsify completed byte counts', async () => {
  const f = fixture(), reader = f.options.readFile
  f.options.readFile = async (path, options) => {
    for (const received_bytes of [-1, NaN, Infinity, '2', options.maxBytes + 1]) options.onProgress({ received_bytes })
    return reader(path, options)
  }
  await createBackup(f.options)
  assert.ok(f.progress.every(p => p.bytesDone >= 0 && p.bytesDone <= p.bytesTotal))
  assert.equal(f.progress.at(-1).bytesDone, 12)
})

test('observer exceptions are not thrown into the active protocol callback', async () => {
  const f = fixture(); let callbackReturned = false
  f.options.onProgress = value => { if (value.phase === 'reading' && value.bytesDone > 0) throw new Error('observer failure') }
  f.options.readFile = async (_path, options) => { options.onProgress({ received_bytes: 9 }); callbackReturned = true; return encode('123456789') }
  await assert.rejects(createBackup(f.options), /observer failure/)
  assert.equal(callbackReturned, true)
})

test('one maximum-sized file is bounded and produces an extractable complete ZIP', async () => {
  const bytes = new Uint8Array(BACKUP_LIMITS.maxFileBytes); bytes[0] = 19; bytes[bytes.length - 1] = 71
  const f = fixture({ readFile: async (_path, options) => { assert.equal(options.maxBytes, bytes.length); return bytes } })
  f.folders.set('E:/', [file('large.bin', bytes.length)])
  const result = await createBackup(f.options), entries = await unzip(result.blob)
  assert.deepEqual(entries.get('files/large.bin').bytes, bytes)
  assert.equal(result.manifest.entries[0].sha256, digest(bytes))
  assert.ok(result.blob.size < BACKUP_LIMITS.maxFileBytes + 8192)
})

test('legacy name preservation maps unsafe and case/Unicode-colliding names without changing bytes or original identities', async () => {
  const f = fixture({ preserveLegacyNames: true })
  const names = ['CON.bin', 'A.bin', 'a.bin', 'Café.bin', 'Cafe\u0301.bin', '~file-000001', 'foo.', 'x:y']
  f.folders.set('E:/', [...names.map(name => file(name, 9)), dir('NUL'), dir('~folder-000001')])
  for (const name of names) f.files.set('E:/' + name, encode('123456789'))
  f.folders.set('E:/NUL', [file('tail ', 9)]); f.files.set('E:/NUL/tail ', encode('123456789'))
  f.folders.set('E:/~folder-000001', [])
  const result = await createBackup(f.options), zip = await unzip(result.blob)
  const seen = new Set()
  for (const record of result.manifest.entries) {
    const key = record.archivePath.normalize('NFC').toLowerCase()
    assert(!seen.has(key), record.archivePath); seen.add(key)
    record.archivePath.split('/').filter(Boolean).forEach(assertPortableEntryName)
    if (record.type === 'file') {
      assert.deepEqual(zip.get(record.archivePath).bytes, f.files.get(record.sourcePath))
      assert.equal(record.sha256, digest(f.files.get(record.sourcePath)))
      assert.equal(zip.get(record.archivePath).crc, 0xcbf43926)
    }
  }
  assert(result.manifest.entries.some(record => record.sourcePath === 'E:/NUL/tail ' && record.nameMapped))
  assert(result.manifest.entries.some(record => record.sourcePath === 'E:/~file-000001' && record.archivePath === 'files/~file-000001'))
  assert.match(result.manifest.nameMapping, /exact original device identity/)
  const decodedManifest = JSON.parse(new TextDecoder().decode(zip.get('manifest.json').bytes))
  assert.deepEqual(decodedManifest, result.manifest)
})

test('legacy mapping also allows a nonportable selected root and keeps its raw identity in the manifest', async () => {
  const f = fixture({ preserveLegacyNames: true, rootPath: 'E:/CON./' })
  f.folders.set('E:/CON.', [file('a.bin', 9)]); f.files.set('E:/CON./a.bin', encode('123456789'))
  const result = await createBackup(f.options), zip = await unzip(result.blob)
  assert.equal(result.manifest.rootPath, 'E:/CON.'); assert.equal(result.manifest.entries[0].sourcePath, 'E:/CON./a.bin')
  assert.deepEqual(zip.get('files/a.bin').bytes, encode('123456789'))
})

test('legacy mapping still rejects traversal, malformed Unicode, NUL, duplicates and changed identity snapshots', async () => {
  for (const name of ['.', '..', 'a/b', '\0bad', '\ud800']) {
    const f = fixture({ preserveLegacyNames: true }); f.folders.set('E:/', [file(name, 9)])
    await assert.rejects(createBackup(f.options), rejection('BACKUP_NAME')); assert.equal(f.reads.length, 0)
  }
  const duplicate = fixture({ preserveLegacyNames: true }); duplicate.folders.set('E:/', [file('CON', 9), file('CON', 9)])
  await assert.rejects(createBackup(duplicate.options), rejection('BACKUP_DUPLICATE'))
  const changed = fixture({ preserveLegacyNames: true }), reader = changed.options.readFile
  changed.options.readFile = async (path, options) => { const data = await reader(path, options); changed.folders.get('E:/')[0].name = 'other'; return data }
  await assert.rejects(createBackup(changed.options), rejection('BACKUP_CHANGED'))
})
