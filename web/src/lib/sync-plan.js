import { assertPortableEntryName, assertDevicePath, assertWritableDevicePath, joinDevicePath, portableNameKey, splitDevicePath } from './portable-names.js'
import { snapshotFile, sha256Bytes, deviceFileSha256, checkedDirectory, targetEntry, copyMetadata, metadataKey, directoryPathAccess, writableDirectoryPath as writableRoot, UPLOAD_LIMITS } from './safe-upload.js'
import { decodeRawMetadata } from './raw-metadata.js'
import { commonVersion, folderBinding, isHistoryConflict } from './sync-history.js'
import { readSmallFileDigests } from './small-file-read-group.js'

export const SYNC_LIMITS = Object.freeze({ maxEntries: 4096, maxDepth: 32, maxBytes: 16 * 1024 * 1024 })
export class SyncError extends Error {
  constructor(code, message, details) { super(message); this.name = 'SyncError'; this.code = code; if (details) this.details = details }
}
const fail = (code, message) => { throw new SyncError(code, message) }
const pathKey = path => path.split('/').map(part => part.normalize('NFC').toLowerCase()).join('/')
// Live previews only. A reloaded page or a different BLE session must obtain a fresh inventory.
const previewRevisions = new WeakMap()
const validRevision = value => typeof value === 'string' && /^[0-9a-f]{16}$/u.test(value) && value !== '0000000000000000'
async function probeComparisonRevision(read) {
  try { return await read() }
  catch (error) {
    // PXSC can explicitly decline an idle PackedFS revision. Ordinary comparison
    // still works on that device. Transport and malformed-reply errors propagate.
    if (error?.cmd === 0x22 && error.status === 1) return null
    throw error
  }
}
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value) } return value }
const observe = (fn, value) => { try { fn?.(value) } catch { /* observers do not control device I/O */ } }
function checkpoint(assertSession, signal) {
  if (typeof assertSession !== 'function') fail('SYNC_API', 'A session guard is required.')
  assertSession()
  if (signal?.aborted) { const error = new SyncError('SYNC_CANCELLED', 'Comparison or sync cancelled.'); error.name = 'AbortError'; throw error }
}
function checkedDeviceKey(key) {
  if (typeof key !== 'string' || !key || key.length > 256) fail('SYNC_DEVICE', 'A stable browser device identity is required.')
  return key
}
function rootPathOf(root) { return assertDevicePath(root?.length > 3 && root.endsWith('/') ? root.slice(0, -1) : root) }
function sourcesOf(files, rootPath) {
  const result = new Map(), identities = new Map(), directories = new Map()
  let bytesTotal = 0
  if (!files || typeof files[Symbol.iterator] !== 'function') fail('SYNC_FILES', 'Select local files first.')
  for (const input of files) {
    if (result.size >= SYNC_LIMITS.maxEntries) fail('SYNC_LIMIT', 'Too many selected files.')
    const file = input?.file || input
    const relativePath = input?.relativePath || file?.webkitRelativePath || file?.name
    if (typeof relativePath !== 'string' || !relativePath) fail('SYNC_PATH', 'A relative file path is required.')
    const segments = relativePath.split('/')
    if (segments.length > SYNC_LIMITS.maxDepth) fail('SYNC_LIMIT', 'Selected folders are too deep.')
    segments.forEach(assertPortableEntryName)
    if (!Number.isSafeInteger(file?.size) || file.size < 0 || file.size > UPLOAD_LIMITS.maxFileBytes || typeof file.arrayBuffer !== 'function') fail('SYNC_SIZE', 'Invalid or oversized local file.')
    bytesTotal += file.size
    if (bytesTotal > SYNC_LIMITS.maxBytes) fail('SYNC_LIMIT', 'Selected file data exceeds 16 MiB.')
    let current = rootPath, relative = ''
    for (let index = 0; index < segments.length; ++index) {
      current = assertWritableDevicePath(joinDevicePath(current, segments[index])); relative += (relative ? '/' : '') + segments[index]
      const type = index === segments.length - 1 ? 'file' : 'directory', key = pathKey(current)
      const known = identities.get(key)
      if (known && (known.path !== current || known.type !== type || type === 'file')) {
        throw new SyncError('SYNC_COLLISION', 'Selected paths collide by case, Unicode or file/folder type.', { first: known.path, second: current })
      }
      identities.set(key, { path: current, type })
      if (identities.size > SYNC_LIMITS.maxEntries) fail('SYNC_LIMIT', 'Selected files and required folders exceed 4096 entries.')
      if (type === 'directory') directories.set(current, { path: current, relativePath: relative })
    }
    result.set(current, { file, targetPath: current, relativePath, size: file.size })
  }
  if (!result.size) fail('SYNC_FILES', 'Select at least one local file.')
  return { files: result, directories, bytesTotal }
}
function coreOf(plan) {
  return { schema: 1, deviceKey: plan.deviceKey, rootPath: plan.rootPath, entries: plan.entries, directories: plan.directories, deviceOnly: plan.deviceOnly }
}
async function fingerprint(plan) { return sha256Bytes(new TextEncoder().encode(JSON.stringify(coreOf(plan)))) }
export { sourcesOf as syncSourcesOf, fingerprint as syncPlanFingerprint }
function writableDirectory(entry) {
  if (entry?.type !== 1) return false
  try { return !copyMetadata(entry.meta).flags.readonly }
  catch (error) { if (error.code === 'UPLOAD_METADATA') return false; throw error }
}
/** Entirely read-only. It compares bytes, not timestamps or filename guesses.
 * Device-only entries are informational and NEVER deletion candidates. */
export async function createSyncPlan({ rootPath, deviceKey, files, readDirectory, readFile, readFileDigest, readFileDigestsBatch, readCreateRevision,
  syncSession, maxRequestPayload, assertSession, signal, onProgress, history, localFolder, includeDeviceOnly = true }) {
  const root = rootPathOf(rootPath), identity = checkedDeviceKey(deviceKey)
  if (history && history.binding !== await folderBinding(identity, root, localFolder)) fail('SYNC_HISTORY_BINDING', 'This reference belongs to a different comparison.')
  const sources = sourcesOf(files, root), remote = new Map(), remoteKeys = new Map()
  if (typeof readDirectory !== 'function' || typeof readFile !== 'function') fail('SYNC_API', 'Directory and file readers are required.')
  const check = () => checkpoint(assertSession, signal)
  let totalEntries = 0, filesDone = 0
  const progress = (phase, path, done = filesDone, total = sources.files.size) => observe(onProgress, { phase, path, done, total, filesDone, filesTotal: sources.files.size })
  async function walk(path, depth) {
    check(); if (depth > SYNC_LIMITS.maxDepth) fail('SYNC_LIMIT', 'The device folder tree is too deep.')
    progress('listing', path)
    const entries = checkedDirectory(await readDirectory(path)); check()
    totalEntries += entries.length
    if (totalEntries > SYNC_LIMITS.maxEntries) fail('SYNC_LIMIT', 'The device folder exceeds 4096 entries.')
    for (const entry of entries) {
      check()
      const child = joinDevicePath(path, entry.name)
      remote.set(child, entry)
      const aliases = remoteKeys.get(pathKey(child)) || []
      aliases.push(child); remoteKeys.set(pathKey(child), aliases)
      if (entry.type === 1 && (includeDeviceOnly || history || sources.directories.has(child))) {
        await walk(child, depth + 1)
      }
    }
  }
  const canRemember = includeDeviceOnly && Number.isSafeInteger(syncSession)
  check()
  const revision = root.startsWith('E:/') && typeof readCreateRevision === 'function'
    ? await probeComparisonRevision(readCreateRevision) : null
  check()
  const rootAccess = await directoryPathAccess(root, readDirectory, check)
  if (rootAccess === 'unavailable') fail('SYNC_STALE', 'The device folder is no longer available under its original path.')
  await walk(root, 0)
  const directories = [...sources.directories.values()].map(directory => {
    const aliases = remoteKeys.get(pathKey(directory.path)) || [], actual = remote.get(directory.path)
    const pathConflict = aliases.some(path => path !== directory.path) || aliases.length > 1 || !!actual && actual.type !== 1
    const blocked = pathConflict || actual && !writableDirectory(actual)
    return { ...directory, pathConflict, status: blocked ? 'blocked' : actual ? 'existing' : 'create' }
  })
  const blockedDirectories = directories.filter(directory => directory.status === 'blocked')
  // Prepare only existing, unambiguous files which the comparison will hash.
  let batched = new Map()
  if (validRevision(revision) && readFileDigestsBatch) {
    const candidates = []
    for (const path of sources.files.keys()) {
      const actual = remote.get(path)
      if (actual?.type !== 0 || actual.size > 572 || remoteKeys.get(pathKey(path))?.length !== 1) continue
      try { copyMetadata(actual.meta) } catch (error) { if (error.code === 'UPLOAD_METADATA') continue; throw error }
      candidates.push({path, size:actual.size})
    }
    batched = await readSmallFileDigests(candidates, {revision, readFileDigestsBatch, maxRequestPayload, check,
      invalidReply:message => fail('SYNC_CHANGED', message), onGroup:(...args) => progress('checking', ...args)})
  }
  const entries = []
  for (const source of sources.files.values()) {
    check(); progress('checking', source.targetPath, 0, source.size)
    const bytes = await snapshotFile(source.file); check(); const hash = await sha256Bytes(bytes); check()
    const entry = { relativePath: source.relativePath, targetPath: source.targetPath, size: source.size, sha256: hash, status: 'add', expected: null }
    const aliases = remoteKeys.get(pathKey(source.targetPath)) || [], actual = remote.get(source.targetPath)
    const blockedParents = blockedDirectories.filter(directory => source.targetPath.startsWith(directory.path + '/'))
    if (aliases.some(path => path !== source.targetPath) || aliases.length > 1) {
      entry.status = 'blocked'; entry.reason = 'NAME_COLLISION'
    } else if (actual) {
      if (actual.type !== 0) { entry.status = 'blocked'; entry.reason = 'DIRECTORY_CONFLICT' }
      else if (actual.size > UPLOAD_LIMITS.maxExistingBytes) { entry.status = 'blocked'; entry.reason = 'EXISTING_SIZE_LIMIT' }
      else {
        try {
          const metadata = copyMetadata(actual.meta)
          const sha256 = batched.get(source.targetPath) ?? await deviceFileSha256(source.targetPath, actual.size, {readFile, readFileDigest, check, sizeError:'SYNC_CHANGED',
            onProgress: value => progress('checking', source.targetPath, value.received_bytes ?? value.done ?? 0, actual.size)})
          entry.expected = { size: actual.size, sha256, metadata }
          entry.status = actual.size === source.size && sha256 === hash ? 'same' : metadata.flags.readonly ? 'blocked' : 'change'
          if (entry.status === 'blocked') entry.reason = 'READONLY'
        } catch (error) {
          if (error.code !== 'UPLOAD_METADATA') throw error
          entry.status = 'blocked'; entry.reason = 'INVALID_METADATA'
        }
      }
    }
    // Reading a protected file may establish equality or a difference, while transfer remains blocked.
    entry.comparison = entry.reason === 'READONLY' ? 'change' : entry.status
    if (rootAccess !== 'writable' || blockedParents.length) {
      if (blockedParents.some(directory => directory.pathConflict)) entry.comparison = 'blocked'
      entry.status = 'blocked'; entry.reason = 'PARENT_BLOCKED'
    }
    if (history && entry.comparison !== 'blocked') {
      const previous = history.files.get(entry.relativePath)
      const state = !previous && entry.comparison === 'change' ? 'noCommonVersion' :
        commonVersion(previous, hash, entry.expected?.sha256 ?? null)
      if (state) entry.history = state
      if (isHistoryConflict(state)) entry.comparison = 'conflict'
    }
    entries.push(entry); ++filesDone; progress('compared', source.targetPath)
  }
  check()
  const selected = new Set(sources.files.keys())
  const deviceOnly = includeDeviceOnly || history
    ? [...remote.entries()].filter(([path, entry]) => entry.type === 0 && !selected.has(path)).map(([path, entry]) => ({ path, size: entry.size }))
    : []
  if (history) {
    const prefix = root.endsWith('/') ? root : root + '/'
    for (const row of deviceOnly) {
      const previous = history.files.get(row.path.slice(prefix.length))
      if (!previous) continue
      check()
      if (row.size !== previous.size) row.history = 'localDeletedDeviceChanged'
      else {
        progress('checking', row.path, 0, row.size)
        const hash = await deviceFileSha256(row.path, row.size, {readFile, readFileDigest, check, sizeError:'SYNC_CHANGED'})
        row.history = commonVersion(previous, null, hash)
      }
      if (isHistoryConflict(row.history)) row.comparison = 'conflict'
    }
  }
  const summary = { add: 0, change: 0, same: 0, blocked: 0, deviceOnly: deviceOnly.length }
  entries.forEach(entry => ++summary[entry.status])
  const plan = { schema: 1, deviceKey: identity, rootPath: root, entries, directories, deviceOnly, summary }
  plan.fingerprint = await fingerprint(plan); check()
  if (validRevision(revision)) {
    const endRevision = await probeComparisonRevision(readCreateRevision)
    check()
    if (endRevision !== revision) fail('SYNC_CHANGED', 'The device changed during comparison. Compare again.')
    previewRevisions.set(plan, {revision, reusable:canRemember, session:syncSession})
  }
  check()
  return frozen(plan)
}

export function createSyncJob(plan) {
  if (plan?.schema !== 1 || !/^[a-f0-9]{64}$/u.test(plan.fingerprint || '')) fail('SYNC_PLAN', 'A verified comparison plan is required.')
  return { schema: 1, deviceKey: checkedDeviceKey(plan.deviceKey), planFingerprint: plan.fingerprint, completed: [], state: 'ready' }
}
const newFileMetadataKey = metadataKey(decodeRawMetadata(new Uint8Array(128).fill(255)))
const sameExpectation = (a, b) => !a && !b || !!a && !!b && a.size === b.size && a.sha256 === b.sha256 && metadataKey(a.metadata) === metadataKey(b.metadata)
const desiredPresent = (original, current) => current?.expected?.size === original.size && current.expected.sha256 === original.sha256 &&
  (!original.expected || metadataKey(current.expected.metadata) === metadataKey(original.expected.metadata))

/** Job data stays in RAM. Every invocation verifies the device identity, plan,
 * local bytes and actual destination bytes afresh. No blind offset resume and
 * no deletes. The caller keeps the same file selection and serializes the job. */
export async function executeSyncJob(options) {
  const { job, plan, deviceKey, files, selectedPaths, readDirectory, readFile, readFileDigest, createDirectory, uploadFile, writeNewPackedFile, assertSession, signal, onProgress } = options
  const check = () => checkpoint(assertSession, signal)
  check()
  if (job?.schema !== 1 || ['running', 'validating'].includes(job.state) || job.deviceKey !== checkedDeviceKey(deviceKey) || plan?.deviceKey !== deviceKey ||
      job.planFingerprint !== plan.fingerprint) fail('SYNC_STALE', 'The comparison or device identity changed; compare again.')
  // Claim the job before awaiting crypto, so two rapid Execute clicks cannot
  // both pass the idle check and interleave whole-file transactions.
  const previousState = job.state
  if (job.leafUpload && !['failed', 'paused'].includes(previousState)) fail('SYNC_JOB', 'Unexpected working folder checkpoint.')
  job.state = 'validating'
  try {
    if (await fingerprint(plan) !== plan.fingerprint) fail('SYNC_STALE', 'The comparison plan changed; compare again.')
    check()
  } catch (error) { job.state = previousState; throw error }
  job.state = previousState // Remaining preflight below is synchronous until 'running'.
  if (typeof createDirectory !== 'function' || typeof uploadFile !== 'function') fail('SYNC_API', 'Directory creation and checked upload adapters are required.')
  const localSelection = Array.from(files || [])
  const sources = sourcesOf(localSelection, plan.rootPath)
  if (selectedPaths !== undefined && (!Array.isArray(selectedPaths) || selectedPaths.some(path => typeof path !== 'string'))) { job.state = previousState; fail('SYNC_SELECTION', 'Invalid selected paths.') }
  const selected = new Set(selectedPaths ?? plan.entries.filter(entry => ['add', 'change'].includes(entry.status) &&
    (!entry.history || entry.history === 'localChanged')).map(entry => entry.targetPath))
  if (selected.size === 0) { job.state = previousState; return { completed: 0, skipped: 0, uploadedBytes: 0, total: 0, job } }
  const wanted = plan.entries.filter(entry => selected.has(entry.targetPath))
  if (wanted.length !== selected.size || wanted.some(entry => !['add', 'change'].includes(entry.status))) fail('SYNC_SELECTION', 'Only planned additions and changes can be selected.')
  const expectedLocal = new Map(plan.entries.map(entry => [entry.targetPath, entry]))
  if (sources.files.size !== expectedLocal.size || [...sources.files.keys()].some(path => !expectedLocal.has(path))) fail('SYNC_LOCAL_CHANGED', 'The local file selection changed; compare again.')
  if (!Array.isArray(job.completed) || job.completed.some(path => !expectedLocal.has(path)) || new Set(job.completed).size !== job.completed.length) fail('SYNC_JOB', 'Invalid completion checkpoint.')
  if (job.publishedLeaves !== undefined && !Array.isArray(job.publishedLeaves)) fail('SYNC_JOB', 'Invalid published folder checkpoint.')
  const publishedDirectories = new Set(job.publishedLeaves)
  if (job.publishedLeaves && (publishedDirectories.size !== job.publishedLeaves.length ||
      [...publishedDirectories].some(path => !plan.directories.some(dir => dir.path === path && dir.status === 'create')))) fail('SYNC_JOB', 'Invalid published folder checkpoint.')
  job.state = 'running'
  let completed = 0, skipped = 0, uploadedBytes = 0
  try {
    // A matching live preview proves the initial device inventory. Reconnects,
    // resumed transfers and intervening changes all require a fresh inventory.
    const revision = () => options.readCreateRevision?.()
    const preview = previewRevisions.get(plan)
    const matchedPreview = preview?.reusable === true && previousState === 'ready' && !job.completed.length && preview.session === options.syncSession &&
      await probeComparisonRevision(revision) === preview.revision
    check()
    let fresh = plan
    let validatedRevision = null
    if (matchedPreview) {
      // The revision proves the entire device snapshot. Local files can change independently.
      for (const entry of plan.entries) {
        const bytes = await snapshotFile(sources.files.get(entry.targetPath).file); check()
        if (bytes.length !== entry.size || await sha256Bytes(bytes) !== entry.sha256) fail('SYNC_LOCAL_CHANGED', 'Local file contents changed; compare again.')
        check()
      }
      validatedRevision = await options.readCreateRevision()
      if (validatedRevision !== preview.revision) fail('SYNC_STALE', 'The device changed during upload preflight.')
      check()
    } else {
      fresh = await createSyncPlan({ rootPath: plan.rootPath, deviceKey, files: localSelection, readDirectory, readFile, readFileDigest,
        readFileDigestsBatch:options.readFileDigestsBatch, readCreateRevision:options.readCreateRevision, maxRequestPayload:options.maxRequestPayload,
        assertSession, signal, onProgress, includeDeviceOnly:false })
    }
    // A mounted PackedFS revision belongs to this connection. A raw CLOSE on
    // this engine acknowledges the complete write and 128-byte metadata.
    const startRevision = options.quickPacked && typeof writeNewPackedFile === 'function' ? validatedRevision ?? await probeComparisonRevision(revision) : null
    const quick = validRevision(startRevision)
    const acknowledgedOnly = new Set()
    const currentByPath = new Map(fresh.entries.map(entry => [entry.targetPath, entry]))
    for (const entry of plan.entries) {
      const current = currentByPath.get(entry.targetPath)
      if (current?.sha256 !== entry.sha256 || current.size !== entry.size) fail('SYNC_LOCAL_CHANGED', 'Local file contents changed; compare again.')
      if (!selected.has(entry.targetPath) && !job.completed.includes(entry.targetPath)) continue
      if (job.completed.includes(entry.targetPath)) {
        if (!desiredPresent(entry, current) || publishedDirectories.has(splitDevicePath(entry.targetPath).parent) &&
            metadataKey(current.expected.metadata) !== newFileMetadataKey) fail('SYNC_STALE', 'A previously completed file changed on the device; compare again.')
      } else if (current.status === 'blocked' || !desiredPresent(entry, current) && !sameExpectation(entry.expected, current.expected)) {
        throw new SyncError('SYNC_STALE', 'A destination changed after comparison; compare again.', { preflightTarget: entry.targetPath })
      }
    }
    // An atomic creation checks its entire path while PackedFS owns the writer
    // lock. This set only avoids repeated mkdir discovery, never authorizes a write.
    const knownDirectories = new Set(fresh.directories.filter(dir => dir.status === 'existing').map(dir => dir.path))
    const leaves = options.prepareLeafUploads && typeof writeNewPackedFile === 'function'
      ? await options.prepareLeafUploads({options, fresh, wanted, sources, check}) : new Map()
    // An uncertain guarded COMMIT is reconciled before any new write on resume.
    if (job.pendingGuarded) {
      const pending = job.pendingGuarded
      if (!Array.isArray(pending) || pending.length < 1 || pending.length > 4 ||
          new Set(pending).size !== pending.length || !pending.every(path => selected.has(path))) {
        fail('SYNC_STALE', 'Resume with the original grouped selection.')
      }
      const captured = previewRevisions.get(fresh)?.revision
      if (!validRevision(captured)) fail('SYNC_STALE', 'The grouped comparison could not observe a storage revision.')
      const present = pending.filter(path => currentByPath.get(path)?.expected)
      if (present.length && present.length !== pending.length) fail('SYNC_STALE', 'Only some grouped files are present.')
      for (const path of present) {
        const expected = plan.entries.find(entry => entry.targetPath === path)
        if (expected?.expected || !desiredPresent(expected,currentByPath.get(path)) || typeof options.readRawMetadata !== 'function')
          fail('SYNC_STALE', 'Unconfirmed grouped contents differ from the comparison.')
        const raw = await options.readRawMetadata(path)
        check()
        if (!(raw instanceof Uint8Array) || raw.length !== 128 || !raw.every(byte => byte === 255))
          fail('SYNC_STALE', 'Unexpected metadata on an unconfirmed grouped file.')
      }
      const afterMetadata = await probeComparisonRevision(revision)
      check()
      if (afterMetadata !== captured) fail('SYNC_STALE', 'Storage changed during grouped recovery verification.')
      delete job.pendingGuarded
    }
    const pendingLeaf = job.leafUpload?.targetPath
    if (job.leafUpload && (!leaves.has(pendingLeaf) || leaves.get(pendingLeaf).entries.some(entry => job.completed.includes(entry.targetPath)))) fail('SYNC_STALE', 'The pending folder publication requires the original selection and device capability.')
    // Reconcile an interrupted or unacknowledged rename before starting another group.
    const order = pendingLeaf ? [...leaves.get(pendingLeaf).entries, ...wanted.filter(entry => splitDevicePath(entry.targetPath).parent !== pendingLeaf)] : wanted
    const publishedLeaves = new Set()
    let guarded = quick && typeof options.guardedCreate === 'function' && typeof options.readRawMetadata === 'function' &&
      typeof options.canGuardedCreate === 'function' && await options.canGuardedCreate()
    check()
    const deferredParents = new Set()
    let guardedRevision = startRevision
    const canGroup = entry => entry && !entry.expected && !currentByPath.get(entry.targetPath)?.expected &&
      entry.size <= 572 && /^[\x20-\x7e]+$/u.test(entry.targetPath) && !job.completed.includes(entry.targetPath)
    for (let index = 0; index < order.length; index++) {
      const entry = order[index]
      check()
      const leafPath = splitDevicePath(entry.targetPath).parent
      if (publishedLeaves.has(leafPath)) continue
      let leaf = leaves.get(leafPath)
      if (leaf && !job.leafUpload && !await leaf.canStart()) {
        leaves.delete(leafPath)
        leaf = null
      }
      const current = currentByPath.get(entry.targetPath)
      if (!leaf && desiredPresent(entry, current)) {
        if (!job.completed.includes(entry.targetPath)) job.completed.push(entry.targetPath)
        ++skipped; observe(onProgress, { phase: 'syncing', path: entry.targetPath, done: completed + skipped, total: wanted.length, filesDone: completed + skipped, filesTotal: wanted.length }); continue
      }
      const atomicAdd = !entry.expected && typeof writeNewPackedFile === 'function'
      const ancestors = plan.directories.filter(directory => entry.targetPath.startsWith(directory.path + '/')).sort((a, b) => a.path.length - b.path.length)
      for (const directory of ancestors) {
        if (leaf?.path === directory.path || atomicAdd && knownDirectories.has(directory.path)) continue
        if (job.leafUpload) fail('SYNC_STALE', 'An ancestor of the working folder is no longer available.')
        check()
        const slash = directory.path.lastIndexOf('/'), parent = slash === 2 ? directory.path.slice(0, 3) : directory.path.slice(0, slash), name = directory.path.slice(slash + 1)
        const listing = checkedDirectory(await readDirectory(parent)); check()
        const aliases = listing.filter(item => portableNameKey(item.name) === portableNameKey(name))
        if (aliases.some(item => item.name !== name || !writableDirectory(item)) || aliases.length > 1) fail('SYNC_STALE', 'A destination folder changed or is read-only; compare again.')
        if (!aliases.length) {
          if (!await writableRoot(parent, readDirectory, check)) fail('SYNC_STALE', 'The selected folder or an ancestor is no longer writable.')
          await createDirectory(directory.path); check()
          guardedRevision = null
        }
        knownDirectories.add(directory.path)
      }
      check()
      if (leaf) {
        guardedRevision = null
        const result = await leaf.run(update => observe(onProgress, {...update,
          filesDone:completed + skipped + (update.filesDone || 0), filesTotal:wanted.length}))
        // Child checkpoints refer to private staging. Only a verified publication
        // authorizes these final path names in the outer checkpoint.
        for (const item of leaf.entries) if (!job.completed.includes(item.targetPath)) job.completed.push(item.targetPath)
        for (const path of result.job.acknowledgedOnly || []) acknowledgedOnly.add(path)
        job.leafUpload = null
        publishedDirectories.add(leafPath)
        job.publishedLeaves = [...publishedDirectories]
        publishedLeaves.add(leafPath)
        completed += result.completed; skipped += result.skipped; uploadedBytes += result.uploadedBytes
        check()
        observe(onProgress, {phase:'syncing',path:leafPath,done:completed+skipped,total:wanted.length,filesDone:completed+skipped,filesTotal:wanted.length})
        continue
      }
      if (guarded && !deferredParents.has(leafPath) && canGroup(entry)) {
        const siblings = [entry]
        for (let next = index+1; next < order.length && siblings.length < 4; next++) {
          const item = order[next]
          if (!canGroup(item) || splitDevicePath(item.targetPath).parent !== leafPath) break
          siblings.push(item)
        }
        if (!guardedRevision) guardedRevision = await probeComparisonRevision(revision)
        check()
        if (validRevision(guardedRevision)) {
          const parts = []
          for (const item of siblings) {
            const bytes = await snapshotFile(sources.files.get(item.targetPath).file)
            check()
            if (await sha256Bytes(bytes) !== item.sha256) fail('SYNC_LOCAL_CHANGED', 'A grouped local file changed before upload.')
            check()
            parts.push({name:splitDevicePath(item.targetPath).name,bytes})
          }
          check()
          job.pendingGuarded = siblings.map(item => item.targetPath)
          const next = await options.guardedCreate(leafPath,parts,guardedRevision)
          check()
          if (next === null) {
            // Only an authenticated, same-transaction DEFER can request the ordinary locked path.
            delete job.pendingGuarded
            deferredParents.add(leafPath)
          } else {
            if (!validRevision(next) || next.slice(0,8) !== guardedRevision.slice(0,8) ||
                parseInt(next.slice(8),16) !== parseInt(guardedRevision.slice(8),16)+1)
              fail('SYNC_STALE','Unconfirmed guarded group revision.')
            guardedRevision = next
            for (const item of siblings) {
              job.completed.push(item.targetPath)
              acknowledgedOnly.add(item.targetPath)
              uploadedBytes += item.size
            }
            completed += siblings.length
            delete job.pendingGuarded
            index += siblings.length-1
            observe(onProgress,{phase:'syncing',path:entry.targetPath,done:completed+skipped,total:wanted.length,filesDone:completed+skipped,filesTotal:wanted.length})
            continue
          }
        } else guarded = false
      }
      guardedRevision = null
      // Pin an immutable byte snapshot immediately before handing it to the
      // writer; an adapter must not re-read a changed host file after approval.
      const uploadBytes = await snapshotFile(sources.files.get(entry.targetPath).file); check()
      if (await sha256Bytes(uploadBytes) !== entry.sha256) fail('SYNC_LOCAL_CHANGED', 'A selected file changed before upload; compare again.')
      check()
      const {parent, name} = splitDevicePath(entry.targetPath)
      const requireWritableParent = async () => {
        if (!await writableRoot(parent, readDirectory, check)) fail('SYNC_STALE', 'The selected folder or an ancestor is no longer writable.')
      }
      const progress = update => observe(onProgress, { ...update, filesDone: completed + skipped, filesTotal: wanted.length })
      try {
        if (atomicAdd) {
          // RAW128 OPEN stages privately; only CLOSE publishes. Read the old
          // namespace after OPEN, while the engine excludes competing mutations.
          // A failed guard aborts the writer even for a zero-length payload.
          await writeNewPackedFile(entry.targetPath, uploadBytes, {
            rawMeta128: new Uint8Array(128).fill(255),
            beforeWrite: async () => {
              check()
              await requireWritableParent()
              const entries = checkedDirectory(await readDirectory(parent))
              check()
              if (targetEntry(entries, name)) fail('SYNC_STALE', 'The new file name is already occupied.')
            },
            onProgress: value => progress({phase:'uploading', path:entry.targetPath, done:value.written_bytes, total:entry.size})
          })
          check()
          if (quick) acknowledgedOnly.add(entry.targetPath)
          else {
            const sha = await deviceFileSha256(entry.targetPath, entry.size, {readFile, readFileDigest, check, sizeError:'SYNC_VERIFY'})
            if (sha !== entry.sha256) fail('SYNC_VERIFY', 'The new file failed device SHA-256 verification.')
          }
        } else {
          await requireWritableParent()
          const result = await uploadFile({ path: entry.targetPath, file: new Blob([uploadBytes]), replace: !!entry.expected,
            expected: entry.expected, onProgress: progress })
          if (!result?.verified || result.sha256 !== entry.sha256 || result.size !== entry.size) fail('SYNC_VERIFY', 'The upload adapter did not confirm the planned contents.')
        }
      } catch (error) {
        // Even then it is re-read before any resumed operation.
        if (error.committed === true && !job.completed.includes(entry.targetPath)) job.completed.push(entry.targetPath)
        throw error
      }
      if (!job.completed.includes(entry.targetPath)) job.completed.push(entry.targetPath)
      ++completed; uploadedBytes += entry.size; check()
      observe(onProgress, { phase: 'syncing', path: entry.targetPath, done: completed + skipped, total: wanted.length, filesDone: completed + skipped, filesTotal: wanted.length })
    }
    if (quick) {
      const endRevision = await revision()
      check()
      if (typeof endRevision !== 'string' || !/^[0-9a-f]{16}$/.test(endRevision) || endRevision.slice(0,8) !== startRevision.slice(0,8) ||
          Number.parseInt(endRevision.slice(8),16) < Number.parseInt(startRevision.slice(8),16)) fail('SYNC_STALE', 'The storage generation changed during upload.')
    }
    if (acknowledgedOnly.size) job.acknowledgedOnly = [...acknowledgedOnly]
    else delete job.acknowledgedOnly
    job.equalPaths = fresh.entries.filter(entry => entry.comparison === 'same').map(entry => entry.targetPath)
    job.state = 'complete'
    return { completed, skipped, uploadedBytes, total: wanted.length, job }
  } catch (error) {
    job.state = signal?.aborted ? 'paused' : 'failed'
    error.syncJob = job
    throw error
  }
}
