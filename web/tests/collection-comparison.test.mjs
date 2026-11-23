import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectLocalCollection } from '../src/lib/collection-local-audit.js'
import { compareCollections } from '../src/lib/collection-comparison.js'
import { mountSfc, nodes, text } from './helpers/vue-component-host.mjs'

const ids = ['0102030400000002', '0102030500000002', '0102030600000002', '0102030700000002']
const catalogue = { entries: ids.map((id, n) => ({ id, name: 'Synthetic ' + n, release: { eu: '2020-01-01' } })) }
function tag(id, variant = 0) {
  const bytes = new Uint8Array(540)
  bytes.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4])
  bytes.set(Buffer.from(id, 'hex'), 84)
  bytes[230] = variant
  return bytes
}
function file(name, id = ids[0], variant = 0, relative = '') {
  const data = tag(id, variant), calls = []
  return { name, webkitRelativePath: relative, size: data.length, calls,
    async arrayBuffer() { calls.push(name); return data.slice().buffer } }
}
const scan = async files => (await inspectLocalCollection(files, { catalogue })).report
const tick = async h => { await new Promise(resolve => setImmediate(resolve)); await h.tick() }
async function settled(h) { for (let i = 0; i < 12; i++) await tick(h) }
async function waitForLocalReport(h) {
  const deadline = performance.now() + 5000
  while (!/PC:\/Folder/.test(text(h.root))) {
    assert.ok(performance.now() < deadline, 'The real asynchronous file hash must produce the local report within 5 seconds')
    await new Promise(resolve => setTimeout(resolve, 10))
    await h.tick()
  }
}

test('local audit reuses content hashes, accepts long PC paths and never reads keys/settings/transaction data', async () => {
  const good = file('a.bin', ids[0], 0, 'A very long local folder '.repeat(5) + '/a.bin')
  const second = file('other.bin', ids[1])
  const excluded = ['key_retail.bin', 'locked-secret.bin', 'unfixed-info.bin', 'settings.bin', 'readme.txt'].map(name => file(name))
  const transaction = file('pending.bin', ids[2], 0, 'Chosen/.pixl_txn/pending.bin')
  const result = await inspectLocalCollection([good, second, ...excluded, transaction], { catalogue })
  assert(result.report.complete)
  assert.equal(result.report.present.length, 2)
  assert.equal(result.ignoredFiles, 6)
  assert.equal(result.report.files[0].path, 'PC:/' + good.webkitRelativePath)
  assert.match(result.report.files[0].sha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(result.files, [good, second])
  for (const item of [...excluded, transaction]) assert.equal(item.calls.length, 0)
  assert(Object.isFrozen(result.report.files))
})

test('unsupported lengths are not read, changed local bytes fail the observation, and selection limits apply before reads', async () => {
  const unsupported = { ...file('other-format.bin'), size: 1000 }
  const result = await inspectLocalCollection([unsupported], { catalogue })
  assert.equal(unsupported.calls.length, 0)
  assert.equal(result.report.files[0].status, 'unsupported-length')
  assert.deepEqual(result.files, [])
  const changed = { ...file('changed.bin'), async arrayBuffer() { return new Uint8Array(539).buffer } }
  const partial = await inspectLocalCollection([changed], { catalogue })
  assert.equal(partial.report.contentComplete, false)
  assert.equal(partial.report.status, 'partial')
  await assert.rejects(inspectLocalCollection([], { catalogue }), { code: 'COLLECTION_LOCAL_LIMIT' })
  await assert.rejects(inspectLocalCollection(Array(8193).fill(file('x.bin')), { catalogue }), { code: 'COLLECTION_LOCAL_LIMIT' })
  await assert.rejects(inspectLocalCollection([file('key_retail.bin')], { catalogue }), { code: 'COLLECTION_LOCAL_EMPTY' })
})

test('cancellation produces no complete local inventory or readable transfer payload', async () => {
  const controller = new AbortController(), f = file('a.bin')
  const result = await inspectLocalCollection([f], { catalogue, signal: controller.signal,
    onProgress(value) { if (value.phase === 'reading') controller.abort() } })
  assert.equal(result.report.cancelled, true)
  assert.equal(result.report.contentComplete, false)
  assert.equal(f.calls.length, 0)
  assert.deepEqual(result.files, [])
})

test('combined collection counts exact IDs once and distinguishes equal IDs with different byte variants', async () => {
  const local = await scan([file('a.bin', ids[0]), file('same-id.bin', ids[0], 1), file('b.bin', ids[1])])
  const device = await scan([file('a.bin', ids[0]), file('c.bin', ids[2])])
  const before = JSON.stringify([local, device])
  const result = compareCollections(local, device)
  assert.deepEqual(result.counts, { local: 2, device: 2, shared: 1, union: 3, localOnly: 1, deviceOnly: 1, missingBoth: 1 })
  assert.deepEqual(result.localOnly.map(row => row.id), [ids[1]])
  assert.deepEqual(result.deviceOnly.map(row => row.id), [ids[2]])
  assert.deepEqual(result.missingBoth.map(row => row.id), [ids[3]])
  assert.equal(result.shared[0].contentComparison, 'different-byte-variants')
  assert.equal(compareCollections(device, device).shared[0].contentComparison, 'same-byte-variants')
  assert.equal(JSON.stringify([local, device]), before)
})

test('quick, stale, interrupted and missing observations never become one-sided or absence claims', async () => {
  const report = await scan([file('a.bin')])
  const partial = { ...report, status: 'cancelled', complete: false, contentComplete: false, cancelled: true }
  const observed = compareCollections(report, partial)
  assert.equal(observed.counts.shared, 1)
  assert.equal(observed.counts.deviceOnly, null)
  assert.deepEqual(observed.missingBoth, [])
  for (const [device, options] of [[null, {}], [{ ...report, mode: 'quick' }, {}], [report, { deviceStale: true }]]) {
    const result = compareCollections(report, device, options)
    assert.equal(result.comparable, false)
    assert.equal(result.counts.device, null)
    assert.equal(result.counts.union, null)
    assert.equal(result.counts.localOnly, null)
    assert.deepEqual(result.localOnly, [])
  }
})

test('positive counts require the exact content-confirmed row and its actual hash', async () => {
  const report = await scan([file('a.bin')])
  const metadataOnly = { ...report, present: report.present.map(row => ({ ...row, contentConfirmed: false })) }
  assert.equal(compareCollections(metadataOnly, report).counts.local, 0)
  const noHash = { ...report, files: report.files.map(row => ({ ...row, sha256: null })) }
  assert.equal(compareCollections(noHash, report).counts.local, 0)
})

test('actual combined panel reads PC files offline, invalidates device comparisons and hands off only to the existing preview', async () => {
  const device = await scan([file('device.bin', ids[1])]), events = []
  const h = await mountSfc(new URL('../src/components/CollectionBackupAudit.vue', import.meta.url), {
    catalogue, locale: 'de_DE', connected: false, deviceReport: device, directory: 'E:/Figures',
    onOpenSync: value => events.push(value),
  })
  try {
    const chosen = file('local.bin', ids[0], 0, 'Folder/local.bin')
    nodes(h.root, 'input')[2].props.onChange({ target: { files: [chosen], value: '' } })
    await waitForLocalReport(h)
    assert.match(text(h.root), /PC:\/Folder/)
    assert.match(text(h.root), /Gemeinsamer Figurenbestand/)
    let button = nodes(h.root, 'button').find(n => text(n) === 'Auswahl im Ordnerabgleich prüfen')
    assert.equal(button.props.disabled, true)
    h.state.connected = true; await h.tick()
    assert.match(text(h.root), /Nur im geprüften PC-Bestand \(1\)/)
    button.props.onClick(); await h.tick()
    assert.equal(events.length, 1)
    assert.deepEqual(events[0], { files: [chosen], folderContents: true })
    h.state.deviceStale = true; await h.tick()
    assert.match(text(h.root), /veraltet/)
    assert.doesNotMatch(text(h.root), /Nur im geprüften PC-Bestand \(1\)/)
    h.state.blocked = true; await h.tick()
    button.props.onClick(); assert.equal(events.length, 1)
    h.state.locale = 'en_US'; await h.tick()
    assert.match(text(h.root), /Combined figure collection/)
    assert.match(text(h.root), /Nothing is automatically replaced or deleted/)
  } finally { h.app.unmount() }
})

test('replaced local work cannot publish an old result or enable a handoff after cancel', async () => {
  const calls = [], h = await mountSfc(new URL('../src/components/CollectionBackupAudit.vue', import.meta.url), { catalogue, locale: 'de_DE', connected: true }, {
    '../lib/collection-local-audit.js': { inspectLocalCollection(files, options) { return new Promise((resolve, reject) => calls.push({ files, options, resolve, reject })) } },
  })
  try {
    const picker = nodes(h.root, 'input')[1], a = file('a.bin'), b = file('b.bin', ids[1])
    picker.props.onChange({ target: { files: [a] } }); await h.tick()
    picker.props.onChange({ target: { files: [b] } }); await h.tick()
    assert(calls[0].options.signal.aborted)
    calls[0].resolve(await inspectLocalCollection([a], { catalogue })); await settled(h)
    assert.doesNotMatch(text(h.root), /Katalog-IDs gefunden/)
    nodes(h.root, 'button').find(n => text(n) === 'Abbrechen').props.onClick()
    calls[1].resolve(await inspectLocalCollection([b], { catalogue })); await settled(h)
    assert.doesNotMatch(text(h.root), /Katalog-IDs gefunden/)
    assert.equal(nodes(h.root, 'button').find(n => text(n) === 'Auswahl im Ordnerabgleich prüfen'), undefined)
  } finally { h.app.unmount() }
})
