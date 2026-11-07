import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { BACKUP_LIMITS, createBackup, createBackupCheckpoint } from '../src/lib/backup.js'
import { memoryVfs, metadata } from './helpers/memory-vfs.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const code = expected => error => error.code === expected

function fixture(overrides = {}) {
  const fs = memoryVfs(), progress = []
  fs.put('E:/tags/a.bin', [1, 2, 3]); fs.put('E:/tags/b.bin', [4, 5])
  fs.nodes.set('E:/tags/sub', { type: 1, meta: metadata() })
  fs.put('E:/tags/sub/c.bin', [6])
  const identity = { rootPath: 'E:/tags', firmwareVersion: '2.21.0-DE3.24', deviceKey: 'browser-device-1', ...overrides }
  const checkpointState = createBackupCheckpoint(identity)
  const options = { ...identity, checkpointState, onProgress: p => progress.push(p),
    readDirectory: async path => { fs.api.assertSession(); const rows = await fs.api.readDirectory(path); fs.api.assertSession(); return rows },
    readFileDigest: async path => { fs.api.assertSession(); return digest(fs.nodes.get(path).bytes) },
    readFile: async (path, settings) => { fs.api.assertSession(); const bytes = await fs.api.readFile(path, settings); fs.api.assertSession(); return bytes },
  }
  return { fs, progress, identity, checkpointState, options }
}

function reads(f) { return f.fs.log.filter(event => event.op === 'read').map(event => event.args[0]) }
function lists(f) { return f.fs.log.filter(event => event.op === 'list').map(event => event.args[0]) }

test('backup time samples separate listing, aggregate BLE reads, directory verification and ZIP', async () => {
  const f = fixture();
  await createBackup(f.options);
  const forPhase = phase => f.progress.filter(p => p.phase === phase);
  assert.ok(forPhase('listing').every(p => p.timing.total === null));
  const reading = forPhase('reading');
  assert.deepEqual([...new Set(reading.map(p => p.timing.completed))], [0, 1, 2, 3]);
  assert.ok(reading.every(p => p.timing.startedAt === reading[0].timing.startedAt && p.timing.total === 3));
  assert.deepEqual(forPhase('verifying').map(p => [p.timing.completed, p.timing.total]), [[0,2],[1,2]]);
  assert.equal(forPhase('archiving')[0].timing.total, null);
  // Successful ZIP creation clears the checkpoint. Interrupt after the final
  // file to exercise a retry which only has directories left to verify.
  await interruptAfterFiles(f, 3);
  f.progress.length = 0;
  f.fs.log.length = 0;
  await createBackup(f.options);
  assert.deepEqual(reads(f), []);
  assert.ok(forPhase('reading').every(p => p.timing.completed === p.filesDone && p.timing.total === 3));
});

test('resumed folder backup counts digest checks and fresh files in the time estimate', async () => {
  const f = fixture();
  await interruptAfterFiles(f);
  await createBackup(f.options);
  const reading = f.progress.filter(p => p.phase === 'reading');
  assert.ok(reading.every(p => p.timing.total === 3 && p.timing.completed === p.filesDone));
  assert.equal(reading.at(-1).timing.completed, 3);
});

async function interruptAfterFiles(f, count = 1) {
  const controller = new AbortController()
  await assert.rejects(createBackup({ ...f.options, signal: controller.signal,
    onProgress: value => { if (value.filesDone === count) controller.abort() },
  }), { name: 'AbortError' })
  assert.equal(f.checkpointState.summary().files, count)
  assert.equal(f.checkpointState.summary().busy, false)
  f.fs.log.length = 0
}

async function zipFile(blob, wanted) {
  const data = new Uint8Array(await blob.arrayBuffer()), view = new DataView(data.buffer)
  let offset = 0
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true), length = view.getUint16(offset + 26, true)
    const start = offset + 30 + length + view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(data.subarray(offset + 30, offset + 30 + length))
    if (name === wanted) return data.slice(start, start + size)
    offset = start + size
  }
  assert.fail('ZIP entry missing: ' + wanted)
}

test('disconnect retains only closed complete reads; retry re-lists all folders and reuses verified bytes', async () => {
  const f = fixture()
  f.fs.setHook(({ when, op, args }) => {
    if (when === 'before' && op === 'read' && args[0].endsWith('/b.bin')) { f.fs.disconnect(); throw new Error('Disconnected') }
  })
  await assert.rejects(createBackup(f.options), /Disconnected/)
  assert.deepEqual(f.checkpointState.summary(), { rootPath: 'E:/tags', firmwareVersion: '2.21.0-DE3.24',
    preserveLegacyNames: false, files: 1, bytes: 3, busy: false })
  f.fs.reconnect(); f.fs.setHook(async () => {}); f.fs.log.length = 0
  const result = await createBackup(f.options)
  assert.deepEqual(reads(f), ['E:/tags/b.bin', 'E:/tags/sub/c.bin'])
  assert.deepEqual(lists(f), ['E:/tags', 'E:/tags/sub', 'E:/tags', 'E:/tags/sub'])
  assert.deepEqual(result.manifest.resume, { reusedFiles: 1, reusedBytes: 3, retainedInBrowserMemoryOnly: true })
  for (const record of result.manifest.entries.filter(record => record.type === 'file')) {
    const data = await zipFile(result.blob, record.archivePath)
    assert.equal(digest(data), record.sha256)
    assert.deepEqual(data, f.fs.nodes.get(record.sourcePath).bytes)
  }
  assert.equal(f.checkpointState.summary().files, 0); assert.equal(f.checkpointState.summary().bytes, 0)
  assert.equal(f.checkpointState.summary().busy, false)
  assert(f.progress.every(p => p.bytesDone <= p.bytesTotal && p.reusedBytes <= p.bytesDone))
})

test('cancel at a completed file preserves it; clear forces a fresh read of every file', async () => {
  const f = fixture(); await interruptAfterFiles(f)
  f.checkpointState.clear(); assert.equal(f.checkpointState.summary().bytes, 0)
  const result = await createBackup(f.options)
  assert.equal(reads(f).length, 3); assert.equal(result.manifest.resume.reusedFiles, 0)
})

test('cancel waits for active file close; busy checkpoints cannot be reused or cleared', async () => {
  const f = fixture(), controller = new AbortController()
  let release, entered
  const ready = new Promise(resolve => { entered = resolve })
  const read = f.options.readFile
  f.options.readFile = async (path, options) => {
    if (path.endsWith('/b.bin')) { entered(); await new Promise(resolve => { release = resolve }) }
    return read(path, options)
  }
  const pending = createBackup({ ...f.options, signal: controller.signal })
  await ready; controller.abort()
  assert.equal(f.checkpointState.summary().busy, true)
  assert.throws(() => f.checkpointState.clear(), code('BACKUP_CHECKPOINT_BUSY'))
  const before = f.fs.log.length
  await assert.rejects(createBackup(f.options), code('BACKUP_CHECKPOINT_BUSY'))
  assert.equal(f.fs.log.length, before)
  let settled = false; pending.finally(() => { settled = true }).catch(() => {})
  await Promise.resolve(); assert.equal(settled, false)
  release(); await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(f.checkpointState.summary().files, 1)
  assert.equal(reads(f).length, 2, 'No third file starts after cancellation')
  assert.equal(f.checkpointState.summary().busy, false)
})

test('wrong device, root, firmware, name mode and missing identity fail before all I/O', async () => {
  const f = fixture(); await interruptAfterFiles(f)
  for (const changed of [{ deviceKey: 'another-device' }, { deviceKey: undefined }, { rootPath: 'E:/' },
    { firmwareVersion: '2.21.0-DE3.23' }, { preserveLegacyNames: true }]) {
    await assert.rejects(createBackup({ ...f.options, ...changed }), code('BACKUP_CHECKPOINT_IDENTITY'))
    assert.equal(f.fs.log.length, 0); assert.equal(f.checkpointState.summary().files, 1)
  }
  assert.equal((await createBackup({ ...f.options, rootPath: 'E:/tags/' })).manifest.resume.reusedFiles, 1)
})

test('checkpoint is opaque and immutable; serialization, copying and invalid identities cannot restore it', async () => {
  const f = fixture()
  assert.equal(JSON.stringify(f.checkpointState), '{}')
  assert(Object.isFrozen(f.checkpointState)); assert(Object.isFrozen(f.checkpointState.summary()))
  assert(!Object.hasOwn(f.checkpointState.summary(), 'deviceKey'))
  for (const invalid of [{}, { ...f.checkpointState }, JSON.parse(JSON.stringify(f.checkpointState)), 'checkpoint']) {
    await assert.rejects(createBackup({ ...f.options, checkpointState: invalid }), code('BACKUP_API'))
  }
  for (const invalid of [{ deviceKey: '' }, { deviceKey: null }, { firmwareVersion: '' },
    { firmwareVersion: 'x'.repeat(129) }, { preserveLegacyNames: 'yes' }]) {
    assert.throws(() => createBackupCheckpoint({ ...f.identity, ...invalid }), code('BACKUP_API'))
  }
  assert.equal(f.fs.log.length, 0)
})

test('all decoded metadata changes and file size changes force a new bounded read', async () => {
  const mutations = [node => { node.bytes = new Uint8Array([7, 8, 9, 10]) },
    node => { node.meta.notes = 'new note' }, node => { node.meta.flags = { raw: 5, hide: true, readonly: true } },
    node => { node.meta.amiibo.head++ }, node => { node.meta.amiibo.tail++ }]
  for (const mutate of mutations) {
    const f = fixture(); await interruptAfterFiles(f, 2)
    mutate(f.fs.nodes.get('E:/tags/a.bin'))
    const result = await createBackup(f.options)
    assert.deepEqual(reads(f), ['E:/tags/a.bin', 'E:/tags/sub/c.bin'])
    assert.equal(result.manifest.resume.reusedFiles, 1)
    assert.equal(result.manifest.entries[0].sha256, digest(f.fs.nodes.get('E:/tags/a.bin').bytes))
  }
})

test('renamed, removed and file-to-directory entries are evicted using exact path and type', async () => {
  for (const kind of ['rename', 'remove', 'directory']) {
    const f = fixture(); await interruptAfterFiles(f, 2)
    const previous = f.fs.nodes.get('E:/tags/a.bin'); f.fs.nodes.delete('E:/tags/a.bin')
    if (kind === 'rename') f.fs.nodes.set('E:/tags/renamed.bin', previous)
    if (kind === 'directory') f.fs.nodes.set('E:/tags/a.bin', { type: 1, meta: metadata() })
    const result = await createBackup(f.options)
    assert.equal(result.manifest.resume.reusedFiles, 1)
    assert.deepEqual(reads(f), kind === 'rename' ? ['E:/tags/renamed.bin', 'E:/tags/sub/c.bin'] : ['E:/tags/sub/c.bin'])
    assert(!result.manifest.entries.some(e => e.sourcePath === 'E:/tags/a.bin' && e.type === 'file'))
  }
})

test('directory verification failure prevents success and retry checks a fresh complete tree', async () => {
  const f = fixture()
  f.fs.setHook(({ when, op, args, count }) => {
    if (when === 'before' && op === 'list' && args[0] === 'E:/tags' && count === 3) throw new Error('verification disconnected')
  })
  await assert.rejects(createBackup(f.options), /verification disconnected/)
  assert.equal(f.checkpointState.summary().files, 3)
  f.fs.setHook(async () => {}); f.fs.log.length = 0
  const result = await createBackup(f.options)
  assert.deepEqual(reads(f), []); assert.equal(lists(f).length, 4)
  assert.equal(result.manifest.resume.reusedFiles, 3)
})

test('changed final directory snapshot rejects a fully cached retry too', async () => {
  const f = fixture(); await interruptAfterFiles(f, 3)
  let rootLists = 0
  f.fs.setHook(({ when, op, args }) => {
    if (when === 'before' && op === 'list' && args[0] === 'E:/tags' && ++rootLists === 2) f.fs.put('E:/tags/new.bin', [9])
  })
  await assert.rejects(createBackup(f.options), code('BACKUP_CHANGED'))
  assert.deepEqual(reads(f), []); assert.equal(f.checkpointState.summary().files, 3)
  f.fs.setHook(async () => {}); f.fs.log.length = 0
  const result = await createBackup(f.options)
  assert.deepEqual(reads(f), ['E:/tags/new.bin']); assert.equal(result.manifest.files, 4)
})

test('new legacy ZIP aliases are recomputed, but cached data is matched only by exact source identity', async () => {
  const f = fixture({ preserveLegacyNames: true })
  f.fs.nodes.delete('E:/tags/a.bin'); f.fs.put('E:/tags/CON', [7, 8, 9])
  await interruptAfterFiles(f, 1)
  f.fs.put('E:/tags/A?', [42])
  const result = await createBackup(f.options)
  const con = result.manifest.entries.find(e => e.sourcePath === 'E:/tags/CON')
  assert.equal(con.archivePath, 'files/~file-000002')
  assert.deepEqual(await zipFile(result.blob, con.archivePath), new Uint8Array([7, 8, 9]))
  assert(!reads(f).includes('E:/tags/CON')); assert.equal(result.manifest.resume.reusedFiles, 1)
})

test('same-size file changes after disconnection are recovered with and without on-device digest support', async () => {
  for (const mode of ['supported', 'unsupported', 'legacy']) {
    const f = fixture(); await interruptAfterFiles(f)
    f.fs.nodes.get('E:/tags/a.bin').bytes.fill(99)
    if (mode === 'unsupported') f.options.readFileDigest = async () => null
    if (mode === 'legacy') delete f.options.readFileDigest
    const result = await createBackup(f.options)
    assert.deepEqual(await zipFile(result.blob, 'files/a.bin'), new Uint8Array([99, 99, 99]))
    assert.equal(result.manifest.resume.reusedFiles, 0)
    assert.equal(result.manifest.entries.find(row => row.sourcePath.endsWith('/a.bin')).sha256, digest(new Uint8Array([99,99,99])))
  }
})

test('an invalid or interrupted digest never publishes unchecked cached bytes', async () => {
  const f = fixture(); await interruptAfterFiles(f)
  const valid = f.options.readFileDigest
  f.options.readFileDigest = async () => 'abc'
  await assert.rejects(createBackup(f.options), code('BACKUP_DIGEST'))
  f.options.readFileDigest = async () => { throw new Error('Disconnected during digest') }
  await assert.rejects(createBackup(f.options), /Disconnected during digest/)
  assert.equal(f.checkpointState.summary().files, 1)
  f.options.readFileDigest = valid
  assert.equal((await createBackup(f.options)).manifest.resume.reusedFiles, 1)
})

test('cache owns adapter buffers; failed or incomplete reads are not cached', async () => {
  const f = fixture(), shared = new Uint8Array([1, 2, 3])
  f.options.readFile = async path => {
    if (path.endsWith('/a.bin')) return shared
    shared.fill(9); return new Uint8Array(1)
  }
  await assert.rejects(createBackup(f.options), code('BACKUP_SIZE'))
  assert.equal(f.checkpointState.summary().files, 1)
  f.options.readFile = f.fs.api.readFile
  const result = await createBackup(f.options)
  assert.deepEqual(await zipFile(result.blob, 'files/a.bin'), new Uint8Array([1, 2, 3]))
})

test('a reader that received bytes but failed to close is read again on retry', async () => {
  const f = fixture()
  f.fs.setHook(({ when, op, args }) => {
    if (when === 'after' && op === 'read' && args[0].endsWith('/b.bin')) throw new Error('CLOSE failed')
  })
  await assert.rejects(createBackup(f.options), /CLOSE failed/)
  assert.equal(f.checkpointState.summary().files, 1)
  f.fs.setHook(async () => {}); f.fs.log.length = 0
  const result = await createBackup(f.options)
  assert.deepEqual(reads(f), ['E:/tags/b.bin', 'E:/tags/sub/c.bin'])
  assert.equal(result.manifest.resume.reusedFiles, 1)
})

test('already-aborted retry performs no I/O and preserves completed files', async () => {
  const f = fixture(); await interruptAfterFiles(f)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(createBackup({ ...f.options, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(f.fs.log.length, 0); assert.equal(f.checkpointState.summary().files, 1)
  assert.equal(f.checkpointState.summary().busy, false)
})

test('archiving cancellation and observer failure retain files and release the lock for retry', async () => {
  for (const mode of ['cancel', 'observer']) {
    const f = fixture(), controller = new AbortController()
    const options = { ...f.options, signal: controller.signal, onProgress: value => {
      if (mode === 'cancel' && value.phase === 'archiving') setTimeout(() => controller.abort(), 0)
      if (mode === 'observer' && value.phase === 'complete') throw new Error('observer failed')
    } }
    await assert.rejects(createBackup(options), mode === 'cancel' ? { name: 'AbortError' } : /observer failed/)
    assert.equal(f.checkpointState.summary().files, 3); assert.equal(f.checkpointState.summary().busy, false)
    f.fs.log.length = 0; assert.equal((await createBackup(f.options)).manifest.resume.reusedFiles, 3)
    assert.deepEqual(reads(f), [])
  }
})

test('16 MiB retention bound survives failures and replacement listings evict stale bytes first', async () => {
  const f = fixture(), size = BACKUP_LIMITS.maxFileBytes
  f.fs.nodes.delete('E:/tags/sub/c.bin'); f.fs.nodes.delete('E:/tags/sub')
  f.fs.put('E:/tags/a.bin', new Uint8Array(size)); f.fs.put('E:/tags/b.bin', new Uint8Array(size))
  await interruptAfterFiles(f, 2)
  assert.equal(f.checkpointState.summary().bytes, BACKUP_LIMITS.maxBytes)
  f.fs.put('E:/tags/overflow.bin', [1])
  await assert.rejects(createBackup(f.options), code('BACKUP_LIMIT'))
  assert.deepEqual(reads(f), []); assert.equal(f.checkpointState.summary().bytes, BACKUP_LIMITS.maxBytes)
  f.fs.nodes.delete('E:/tags/overflow.bin')
  f.fs.nodes.delete('E:/tags/a.bin'); f.fs.nodes.delete('E:/tags/b.bin')
  f.fs.put('E:/tags/new-a.bin', new Uint8Array(size)); f.fs.put('E:/tags/new-b.bin', new Uint8Array(size))
  await interruptAfterFiles(f, 2)
  assert.equal(f.checkpointState.summary().bytes, BACKUP_LIMITS.maxBytes)
  assert.equal(f.checkpointState.summary().files, 2)
  f.checkpointState.clear(); assert.equal(f.checkpointState.summary().bytes, 0)
})

test('empty and ordinary backups remain compatible without a checkpoint or device key', async () => {
  const f = fixture(), { checkpointState, deviceKey, ...ordinary } = f.options
  const first = await createBackup(ordinary)
  assert.equal(first.manifest.files, 3); assert.equal(first.manifest.resume.retainedInBrowserMemoryOnly, false)
  f.fs.nodes.delete('E:/tags/a.bin'); f.fs.nodes.delete('E:/tags/b.bin')
  f.fs.nodes.delete('E:/tags/sub/c.bin'); f.fs.nodes.delete('E:/tags/sub')
  assert.equal((await createBackup(f.options)).manifest.files, 0)
  assert.equal(checkpointState.summary().files, 0)
})
