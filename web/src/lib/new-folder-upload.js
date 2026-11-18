import { assertWritableDevicePath, devicePathSpace, joinDevicePath, portableNameKey, splitDevicePath } from './portable-names.js'
import { checkedDirectory, deviceFileSha256, metadataKey, sha256Bytes, snapshotFile, targetEntry, writableDirectoryPath } from './safe-upload.js'
import { decodeRawMetadata } from './raw-metadata.js'
import { SyncError, syncPlanFingerprint, syncSourcesOf } from './sync-plan.js'

const emptyMetadata = new Uint8Array(128).fill(255)
const emptyKey = metadataKey(decodeRawMetadata(emptyMetadata))
const stale = () => { throw new SyncError('SYNC_STALE', 'The destination or working folder changed. Inspect it before continuing.') }
const localChanged = () => { throw new SyncError('SYNC_LOCAL_CHANGED', 'Local files changed since the comparison.') }
const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => n.toString(16).padStart(2, '0')).join('')
const isNeutral = entry => metadataKey(entry.meta) === emptyKey

// The random sibling replaces the first component. Allow enough room for every
// selected descendant, including when the user's top directory is a single letter.
function tokenLength(root, entries) {
  const nameBytes = new TextEncoder().encode(splitDevicePath(root).name).length
  return Math.min(12, ...entries.map(entry => nameBytes + devicePathSpace(entry.targetPath).pathRemaining - 2))
}

export function newFolderUploadRoot(plan, selectedPaths) {
  if (plan?.schema !== 1 || !plan.rootPath?.startsWith('E:/') || !Array.isArray(selectedPaths) || !selectedPaths.length) return null
  const selected = new Set(selectedPaths)
  const wanted = plan.entries.filter(entry => selected.has(entry.targetPath))
  if (selected.size !== selectedPaths.length || selected.size !== wanted.length || wanted.some(entry => entry.status !== 'add' || entry.expected)) return null
  const root = plan.directories.find(dir => dir.status === 'create' && splitDevicePath(dir.path).parent === plan.rootPath &&
    wanted.every(entry => entry.targetPath.startsWith(dir.path + '/')))?.path
  return root && tokenLength(root, wanted) >= 8 ? root : null
}

/** Publish a wholly new PackedFS subtree. Only the caller's capability-checked
 * PackedFS writer may supply RAW128 writes with disconnect-abort semantics.
 * job.completed tracks acknowledged writes. Publication requires full hashes. */
export async function executeNewFolderUpload({ plan, job, files, selectedPaths, deviceKey, assertSession, signal, onProgress,
  createDirectory, writeFile, readDirectory, readFile, readFileDigest, rename, getFreeBytes, randomToken = randomHex }) {
  const check = () => {
    assertSession()
    if (signal?.aborted) throw new SyncError('SYNC_CANCELLED', 'Folder upload cancelled.')
  }
  check()
  const targetPath = newFolderUploadRoot(plan, selectedPaths)
  if (!targetPath || !job || job.schema !== 1 || !deviceKey || job.deviceKey !== deviceKey || plan.deviceKey !== deviceKey ||
      job.planFingerprint !== plan.fingerprint || ['validating', 'running'].includes(job.state)) stale()
  job.state = 'validating'
  try {
    if (await syncPlanFingerprint(plan) !== plan.fingerprint) stale()
    check()
    const selected = new Set(selectedPaths)
    const wanted = plan.entries.filter(entry => selected.has(entry.targetPath))
    const ordered = wanted.map(entry => entry.targetPath)
    const sources = syncSourcesOf(files, plan.rootPath).files
    if (sources.size !== plan.entries.length) localChanged()
    const payloads = new Map()
    for (const entry of plan.entries) {
      const source = sources.get(entry.targetPath)
      if (!source || source.size !== entry.size) localChanged()
      const bytes = await snapshotFile(source.file)
      if (await sha256Bytes(bytes) !== entry.sha256) localChanged()
      if (selected.has(entry.targetPath)) payloads.set(entry.targetPath, bytes)
      check()
    }
    const completed = new Set(job.completed)
    if (!Array.isArray(job.completed) || completed.size !== job.completed.length || job.completed.some(path => !selected.has(path))) stale()
    const dirs = plan.directories.filter(dir => dir.path !== targetPath && wanted.some(entry => entry.targetPath.startsWith(dir.path + '/')))
      .map(dir => dir.path).sort((a, b) => a.length - b.length)
    const children = new Map([targetPath, ...dirs].map(dir => [dir, new Map()]))
    for (const path of dirs) children.get(splitDevicePath(path).parent).set(splitDevicePath(path).name, { path, type: 1 })
    for (const entry of wanted) children.get(splitDevicePath(entry.targetPath).parent).set(splitDevicePath(entry.targetPath).name, { path: entry.targetPath, type: 0, entry })
    const parent = plan.rootPath
    const targetName = splitDevicePath(targetPath).name
    let state = job.newFolderUpload
    if (state) {
      if (state.targetPath !== targetPath || !Array.isArray(state.selection) || state.selection.length !== ordered.length ||
          state.selection.some((value, index) => value !== ordered[index]) || !Array.isArray(state.dirs) ||
          state.dirs.some(dir => !dirs.includes(dir)) || state.inFlight && !selected.has(state.inFlight)) stale()
      const parts = splitDevicePath(state.stagePath)
      if (parts.parent !== parent || !/^~u[a-f0-9]{8,12}$/.test(parts.name) || parts.name.length !== tokenLength(targetPath, wanted) + 2 ||
          portableNameKey(parts.name) === portableNameKey(targetName)) stale()
    }
    if (!state && completed.size) stale()
    async function list(path) { check(); const result = checkedDirectory(await readDirectory(path)); check(); return result }
    async function writableParent() {
      if (!await writableDirectoryPath(parent, readDirectory, check)) stale()
      check()
    }
    async function ownerListing() {
      await writableParent()
      return list(parent)
    }
    const stageName = () => splitDevicePath(state.stagePath).name
    const staged = (base, path) => assertWritableDevicePath(base + path.slice(targetPath.length))
    const checkWorkingFolder = entries => {
      const stage = targetEntry(entries, stageName())
      if (!state.owned || !stage || stage.type !== 1 || !isNeutral(stage) || targetEntry(entries, targetName)) stale()
    }
    function progress(phase, done) {
      try { onProgress?.({phase, path:targetPath, done, total:wanted.length, filesDone:done, filesTotal:wanted.length}) }
      catch { /* observers do not own the transfer */ }
    }
    const digest = async (path, entry) => {
      if (await deviceFileSha256(path, entry.size, {readFileDigest, readFile, check, sizeError:'SYNC_STALE'}) !== entry.sha256) stale()
    }
    // Traverse only selected directories. A foreign, aliased, missing, or
    // modified item blocks publication and is never removed from the device.
    async function inventory(base, partial = false, verify = true) {
      const found = new Set(), seenDirs = new Set()
      async function visit(path) {
        const planned = children.get(path)
        const entries = await list(staged(base, path))
        if (!partial && entries.length !== planned.size) stale()
        for (const actual of entries) {
          const item = planned.get(actual.name)
          if (!item || item.type !== actual.type || !isNeutral(actual)) stale()
          if (item.type === 1) {
            if (partial && !state.dirs.includes(item.path)) stale()
            seenDirs.add(item.path)
            await visit(item.path)
          } else {
            if (actual.size !== item.entry.size || partial && !completed.has(item.path) && state.inFlight !== item.path) stale()
            if (verify) await digest(staged(base, item.path), item.entry)
            found.add(item.path)
          }
        }
      }
      await visit(targetPath)
      if (partial && (job.completed.some(path => !found.has(path)) || state.dirs.some(path => !seenDirs.has(path)))) stale()
      return found
    }
    let fromCheckpoint = 0
    let uploadedBytes = 0
    const finish = () => {
      job.completed = [...ordered]; job.equalPaths = plan.entries.filter(entry => entry.comparison === 'same').map(entry => entry.targetPath)
      state.phase = 'complete'; job.state = 'complete'
      return {completed:wanted.length - fromCheckpoint, skipped:fromCheckpoint, total:wanted.length, uploadedBytes, job}
    }
    async function published(entries) {
      const final = targetEntry(entries, targetName)
      if (!final || final.type !== 1 || !isNeutral(final) || targetEntry(entries, stageName())) return false
      await inventory(targetPath)
      return true
    }
    job.state = 'running'
    const initial = await ownerListing()
    // A lost MKDIR acknowledgement does not prove ownership of an entry. If
    // the candidate never appeared, a fresh reservation is safe.
    if (state?.phase === 'reserving' && !state.owned && !targetEntry(initial, stageName())) {
      state = null; job.newFolderUpload = null
    }
    if (state && ['publishing','complete'].includes(state.phase) && await published(initial)) {
      fromCheckpoint = wanted.length
      return finish()
    }
    if (targetEntry(initial, targetName)) stale()
    if (state) {
      checkWorkingFolder(initial)
      const found = await inventory(state.stagePath, true)
      if (state.inFlight && found.has(state.inFlight) && !completed.has(state.inFlight)) {
        completed.add(state.inFlight); job.completed.push(state.inFlight)
      }
      state.inFlight = null
      fromCheckpoint = completed.size
    }
    const remainingBytes = wanted.reduce((sum, entry) => sum + (completed.has(entry.targetPath) ? 0 : entry.size), 0)
    const free = await getFreeBytes(parent)
    check()
    if (!Number.isSafeInteger(free) || free < remainingBytes) throw new SyncError('UPLOAD_SPACE', 'Insufficient space for the selected files.')
    if (!state) {
      const occupied = new Set(initial.map(entry => portableNameKey(entry.name)))
      occupied.add(portableNameKey(targetName))
      for (let attempt = 0; attempt < 16; attempt++) {
        const token = randomToken()
        if (!/^[a-f0-9]{12}$/.test(token)) stale()
        const name = '~u' + token.slice(0, tokenLength(targetPath, wanted))
        if (occupied.has(portableNameKey(name))) continue
        state = {targetPath, stagePath:joinDevicePath(parent, name), selection:ordered, owned:false, phase:'reserving', dirs:[], inFlight:null}
        break
      }
      if (!state) throw new SyncError('UPLOAD_COLLISION', 'Cannot reserve an unused working folder.')
      job.newFolderUpload = state
      await createDirectory(state.stagePath)
      state.owned = true
      check()
      checkWorkingFolder(await ownerListing())
    }
    state.phase = 'staging'
    for (const dir of dirs) {
      if (state.dirs.includes(dir)) continue
      const stageDir = staged(state.stagePath, dir), parts = splitDevicePath(stageDir)
      if (targetEntry(await list(parts.parent), parts.name)) stale()
      await createDirectory(stageDir); state.dirs.push(dir); check()
    }
    for (const entry of wanted) {
      if (completed.has(entry.targetPath)) continue
      const path = staged(state.stagePath, entry.targetPath), parts = splitDevicePath(path)
      await writeFile(path, payloads.get(entry.targetPath), {
        rawMeta128:emptyMetadata.slice(),
        beforeWrite:async () => {
          if (targetEntry(await list(parts.parent), parts.name)) stale()
          state.inFlight = entry.targetPath
        }
      })
      completed.add(entry.targetPath); job.completed.push(entry.targetPath); state.inFlight = null
      uploadedBytes += entry.size
      check(); progress('syncing', completed.size)
    }
    state.phase = 'verifying'
    progress('checking', completed.size)
    await inventory(state.stagePath)
    // Hashing the tree can take time. Recheck all names and metadata before publishing.
    await inventory(state.stagePath, false, false)
    checkWorkingFolder(await ownerListing())
    state.phase = 'publishing'
    try {
      await rename(state.stagePath, targetPath)
      check()
    } catch (error) {
      check()
      if (!await published(await ownerListing())) throw error
    }
    return finish()
  } catch (error) {
    job.state = signal?.aborted ? 'paused' : 'failed'
    error.syncJob = job
    throw error
  }
}
