import { assertPortableEntryName, assertDevicePath, joinDevicePath, portableNameKey } from './portable-names.js'
import { snapshotFile, sha256Bytes, asBytes, checkedDirectory, copyMetadata, metadataKey, directoryPathAccess, writableDirectoryPath as writableRoot, UPLOAD_LIMITS } from './safe-upload.js'

export const SYNC_LIMITS = Object.freeze({ maxEntries: 4096, maxDepth: 32, maxBytes: 16 * 1024 * 1024 })
export class SyncError extends Error {
  constructor(code, message, details) { super(message); this.name = 'SyncError'; this.code = code; if (details) this.details = details }
}
const fail = (code, message) => { throw new SyncError(code, message) }
const pathKey = path => path.split('/').map(part => part.normalize('NFC').toLowerCase()).join('/')
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
      current = joinDevicePath(current, segments[index]); relative += (relative ? '/' : '') + segments[index]
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
function writableDirectory(entry) {
  if (entry?.type !== 1) return false
  try { return !copyMetadata(entry.meta).flags.readonly }
  catch (error) { if (error.code === 'UPLOAD_METADATA') return false; throw error }
}
/** Entirely read-only. It compares bytes, not timestamps or filename guesses.
 * Device-only entries are informational and NEVER deletion candidates. */
export async function createSyncPlan({ rootPath, deviceKey, files, readDirectory, readFile, assertSession, signal, onProgress }) {
  const root = rootPathOf(rootPath), identity = checkedDeviceKey(deviceKey)
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
      if (entry.type === 1) await walk(child, depth + 1)
    }
  }
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
          const data = asBytes(await readFile(source.targetPath, { maxBytes: actual.size, onProgress: value => progress('checking', source.targetPath, value.received_bytes ?? value.done ?? 0, actual.size) })); check()
          if (data.byteLength !== actual.size) fail('SYNC_CHANGED', 'A device file changed while creating the comparison.')
          const sha256 = await sha256Bytes(data); check()
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
    entries.push(entry); ++filesDone; progress('compared', source.targetPath)
  }
  check()
  const selected = new Set(sources.files.keys())
  const deviceOnly = [...remote.entries()].filter(([path, entry]) => entry.type === 0 && !selected.has(path)).map(([path, entry]) => ({ path, size: entry.size }))
  const summary = { add: 0, change: 0, same: 0, blocked: 0, deviceOnly: deviceOnly.length }
  entries.forEach(entry => ++summary[entry.status])
  const plan = { schema: 1, deviceKey: identity, rootPath: root, entries, directories, deviceOnly, summary }
  plan.fingerprint = await fingerprint(plan); check()
  return frozen(plan)
}

export function createSyncJob(plan) {
  if (plan?.schema !== 1 || !/^[a-f0-9]{64}$/u.test(plan.fingerprint || '')) fail('SYNC_PLAN', 'A verified comparison plan is required.')
  return { schema: 1, deviceKey: checkedDeviceKey(plan.deviceKey), planFingerprint: plan.fingerprint, completed: [], state: 'ready' }
}
const sameExpectation = (a, b) => !a && !b || !!a && !!b && a.size === b.size && a.sha256 === b.sha256 && metadataKey(a.metadata) === metadataKey(b.metadata)
const desiredPresent = (original, current) => current?.expected?.size === original.size && current.expected.sha256 === original.sha256 &&
  (!original.expected || metadataKey(current.expected.metadata) === metadataKey(original.expected.metadata))

/** Job data stays in RAM. Every invocation verifies the device identity, plan,
 * local bytes and actual destination bytes afresh. No blind offset resume and
 * no deletes. The caller keeps the same file selection and serializes the job. */
export async function executeSyncJob({ job, plan, deviceKey, files, selectedPaths, readDirectory, readFile, createDirectory, uploadFile, assertSession, signal, onProgress }) {
  const check = () => checkpoint(assertSession, signal)
  check()
  if (job?.schema !== 1 || ['running', 'validating'].includes(job.state) || job.deviceKey !== checkedDeviceKey(deviceKey) || plan?.deviceKey !== deviceKey ||
      job.planFingerprint !== plan.fingerprint) fail('SYNC_STALE', 'The comparison or device identity changed; compare again.')
  // Claim the job before awaiting crypto, so two rapid Execute clicks cannot
  // both pass the idle check and interleave whole-file transactions.
  const previousState = job.state
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
  const selected = new Set(selectedPaths ?? plan.entries.filter(entry => ['add', 'change'].includes(entry.status)).map(entry => entry.targetPath))
  if (selected.size === 0) { job.state = previousState; return { completed: 0, skipped: 0, total: 0, job } }
  const wanted = plan.entries.filter(entry => selected.has(entry.targetPath))
  if (wanted.length !== selected.size || wanted.some(entry => !['add', 'change'].includes(entry.status))) fail('SYNC_SELECTION', 'Only planned additions and changes can be selected.')
  const expectedLocal = new Map(plan.entries.map(entry => [entry.targetPath, entry]))
  if (sources.files.size !== expectedLocal.size || [...sources.files.keys()].some(path => !expectedLocal.has(path))) fail('SYNC_LOCAL_CHANGED', 'The local file selection changed; compare again.')
  if (!Array.isArray(job.completed) || job.completed.some(path => !expectedLocal.has(path)) || new Set(job.completed).size !== job.completed.length) fail('SYNC_JOB', 'Invalid completion checkpoint.')
  job.state = 'running'
  let completed = 0, skipped = 0
  try {
    // This second read-only pass catches stale plans and validates completed
    // entries too. No mkdir/upload happens before this entire pass succeeds.
    const fresh = await createSyncPlan({ rootPath: plan.rootPath, deviceKey, files: localSelection, readDirectory, readFile, assertSession, signal, onProgress })
    const currentByPath = new Map(fresh.entries.map(entry => [entry.targetPath, entry]))
    for (const entry of plan.entries) {
      const current = currentByPath.get(entry.targetPath)
      if (current?.sha256 !== entry.sha256 || current.size !== entry.size) fail('SYNC_LOCAL_CHANGED', 'Local file contents changed; compare again.')
      if (!selected.has(entry.targetPath) && !job.completed.includes(entry.targetPath)) continue
      if (job.completed.includes(entry.targetPath)) {
        if (!desiredPresent(entry, current)) fail('SYNC_STALE', 'A previously completed file changed on the device; compare again.')
      } else if (current.status === 'blocked' || !desiredPresent(entry, current) && !sameExpectation(entry.expected, current.expected)) {
        fail('SYNC_STALE', 'A destination changed after comparison; compare again.')
      }
    }
    for (const entry of wanted) {
      check()
      const current = currentByPath.get(entry.targetPath)
      if (desiredPresent(entry, current)) {
        if (!job.completed.includes(entry.targetPath)) job.completed.push(entry.targetPath)
        ++skipped; observe(onProgress, { phase: 'syncing', path: entry.targetPath, done: completed + skipped, total: wanted.length, filesDone: completed + skipped, filesTotal: wanted.length }); continue
      }
      const ancestors = plan.directories.filter(directory => entry.targetPath.startsWith(directory.path + '/')).sort((a, b) => a.path.length - b.path.length)
      for (const directory of ancestors) {
        check()
        const slash = directory.path.lastIndexOf('/'), parent = slash === 2 ? directory.path.slice(0, 3) : directory.path.slice(0, slash), name = directory.path.slice(slash + 1)
        const listing = checkedDirectory(await readDirectory(parent)); check()
        const aliases = listing.filter(item => portableNameKey(item.name) === portableNameKey(name))
        if (aliases.some(item => item.name !== name || !writableDirectory(item)) || aliases.length > 1) fail('SYNC_STALE', 'A destination folder changed or is read-only; compare again.')
        if (!aliases.length) {
          if (!await writableRoot(parent, readDirectory, check)) fail('SYNC_STALE', 'The selected folder or an ancestor is no longer writable.')
          await createDirectory(directory.path); check()
        }
      }
      check()
      // Pin an immutable byte snapshot immediately before handing it to the
      // writer; an adapter must not re-read a changed host file after approval.
      const uploadBytes = await snapshotFile(sources.files.get(entry.targetPath).file); check()
      if (await sha256Bytes(uploadBytes) !== entry.sha256) fail('SYNC_LOCAL_CHANGED', 'A selected file changed before upload; compare again.')
      check()
      const parentPath = entry.targetPath.slice(0, entry.targetPath.lastIndexOf('/')) + (entry.targetPath.lastIndexOf('/') === 2 ? '/' : '')
      if (!await writableRoot(parentPath, readDirectory, check)) fail('SYNC_STALE', 'The selected folder or an ancestor is no longer writable.')
      try {
        const result = await uploadFile({ path: entry.targetPath, file: new Blob([uploadBytes]), replace: !!entry.expected, expected: entry.expected,
          onProgress: update => observe(onProgress, { ...update, filesDone: completed + skipped, filesTotal: wanted.length }) })
        if (!result?.verified || result.sha256 !== entry.sha256 || result.size !== entry.size) fail('SYNC_VERIFY', 'The upload adapter did not confirm the planned contents.')
      } catch (error) {
        // Even then it is re-read before any resumed operation.
        if (error.committed === true && !job.completed.includes(entry.targetPath)) job.completed.push(entry.targetPath)
        throw error
      }
      if (!job.completed.includes(entry.targetPath)) job.completed.push(entry.targetPath)
      ++completed; check()
      observe(onProgress, { phase: 'syncing', path: entry.targetPath, done: completed + skipped, total: wanted.length, filesDone: completed + skipped, filesTotal: wanted.length })
    }
    job.state = 'complete'
    return { completed, skipped, total: wanted.length, job }
  } catch (error) {
    job.state = signal?.aborted ? 'paused' : 'failed'
    error.syncJob = job
    throw error
  }
}
