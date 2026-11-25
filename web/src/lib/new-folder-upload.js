import { assertWritableDevicePath, devicePathSpace, joinDevicePath, portableNameKey, splitDevicePath } from './portable-names.js'
import { checkedDirectory, deviceFileSha256, metadataKey, sha256Bytes, snapshotFile, targetEntry, writableDirectoryPath } from './safe-upload.js'
import { decodeRawMetadata } from './raw-metadata.js'
import { createSyncJob, SyncError, syncPlanFingerprint, syncSourcesOf } from './sync-plan.js'

const emptyMetadata = new Uint8Array(128).fill(255)
const emptyKey = metadataKey(decodeRawMetadata(emptyMetadata))
const stale = () => { throw new SyncError('SYNC_STALE', 'The destination or working folder changed. Inspect it before continuing.') }
const localChanged = () => { throw new SyncError('SYNC_LOCAL_CHANGED', 'Local files changed since the comparison.') }
const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => n.toString(16).padStart(2, '0')).join('')
const isNeutral = entry => metadataKey(entry.meta) === emptyKey
const validRevision = value => typeof value === 'string' && /^[0-9a-f]{16}$/.test(value) && value !== '0000000000000000'
const fitsSmallCreate = entry => entry.size <= 572
// Keep each leaf rename within the 100-file subtree exercised on the 2 MiB model.
const maxLeafFiles = 100
const consecutiveCommits = (before, after, count = 1) => before.slice(0,8) === after.slice(0,8) &&
  parseInt(before.slice(8),16) + count === parseInt(after.slice(8),16)
const siblingSnapshot = Symbol('validated sibling directory')
const leafSpace = Symbol('leaf space sample')

// The random sibling replaces the first component. Allow enough room for every
// selected descendant, including when the user's top directory is a single letter.
function tokenLength(root, entries) {
  const nameBytes = new TextEncoder().encode(splitDevicePath(root).name).length
  return Math.min(12, ...entries.map(entry => nameBytes + devicePathSpace(entry.targetPath).pathRemaining - 2))
}

export function newFolderUploadRoot(plan, selectedPaths, bounded = false) {
  if (plan?.schema !== 1 || !plan.rootPath?.startsWith('E:/') || !Array.isArray(selectedPaths) || !selectedPaths.length || (bounded && selectedPaths.length > maxLeafFiles)) return null
  const selected = new Set(selectedPaths)
  const wanted = plan.entries.filter(entry => selected.has(entry.targetPath))
  if (selected.size !== selectedPaths.length || selected.size !== wanted.length || wanted.some(entry => entry.status !== 'add' || entry.expected)) return null
  const root = plan.directories.find(dir => dir.status === 'create' && splitDevicePath(dir.path).parent === plan.rootPath &&
    wanted.every(entry => entry.targetPath.startsWith(dir.path + '/')))?.path
  return root && tokenLength(root, wanted) >= 8 ? root : null
}

// Group only physically absent leaf directories. Each group uses the same
// audited, no-clobber publication as a newly uploaded top-level folder.
export async function prepareLeafUploads({ options, fresh, wanted, sources, check }) {
  const { plan, job } = options
  const groups = new Map()
  const pending = job.leafUpload
  const parentSample = {} // Shared only by sibling groups in this invocation.
  if (!plan.rootPath.startsWith('E:/') || !['createSmall','publishSmallFolder','readCreateRevision','writeFile','getFreeBytes'].every(key => typeof options[key] === 'function')) return groups
  const branches = new Set(plan.directories.map(dir => splitDevicePath(dir.path).parent))
  const current = new Map(fresh.directories.map(dir => [dir.path, dir.status]))
  for (const dir of plan.directories) {
    if (dir.status !== 'create' || branches.has(dir.path) || dir.path.split('/').some(name => /^~u[a-f0-9]{8,12}$/.test(name))) continue
    if (current.get(dir.path) !== 'create' && pending?.targetPath !== dir.path) continue
    groups.set(dir.path, {path:dir.path, directory:dir, entries:[]})
  }
  for (const entry of wanted) groups.get(splitDevicePath(entry.targetPath).parent)?.entries.push(entry)
  for (const [path, group] of groups) {
    const {parent, name} = splitDevicePath(path)
    const entries = group.entries
    const paths = entries.map(entry => entry.targetPath)
    const relativePath = entry => name + '/' + splitDevicePath(entry.targetPath).name
    const child = {schema:1, deviceKey:plan.deviceKey, rootPath:parent, deviceOnly:[],
      directories:[{...group.directory, relativePath:name}],
      entries:entries.map(entry => ({...entry, relativePath:relativePath(entry)}))}
    const batchable = entries.some(fitsSmallCreate) || (options.quickPacked && entries.length > 1)
    if (!batchable || entries.length > maxLeafFiles || newFolderUploadRoot(child, paths) !== path) {
      groups.delete(path)
      continue
    }
    // PackedFS rewrites the affected shards on rename. Account for both record
    // copies, the engine's eight reserve blocks, and one shared 32 KiB shard.
    // The engine remains authoritative if the free-space snapshot becomes stale.
    const block = 4096, payload = entries.reduce((sum, entry) => sum + entry.size, 0)
    const recordBytes = payload + (entries.length + 1) * (16 + 64 + 128 + 4 + 12)
    const headroom = 2 * Math.ceil(recordBytes / (block - 32)) * block + 8 * block + 32768
    let boundSpace
    group.canStart = async () => {
      const revision = options.quickPacked ? await options.readCreateRevision() : null
      const free = await options.getFreeBytes(plan.rootPath)
      check()
      if (!Number.isSafeInteger(free) || free < payload) throw new SyncError('UPLOAD_SPACE', 'Insufficient space for the selected files.')
      boundSpace = validRevision(revision) ? {revision, free} : null
      return free >= headroom
    }
    group.run = async onProgress => {
      child.fingerprint = await syncPlanFingerprint(child)
      check()
      if (!job.leafUpload) job.leafUpload = {targetPath:path, job:createSyncJob(child)}
      if (job.leafUpload.targetPath !== path) stale()
      const files = entries.map(entry => ({relativePath:relativePath(entry), file:sources.files.get(entry.targetPath).file}))
      return executeNewFolderUpload({...options, plan:child, job:job.leafUpload.job, files, selectedPaths:paths, requireSmallCreate:true, [siblingSnapshot]:parentSample, [leafSpace]:boundSpace, onProgress})
    }
  }
  if (groups.size) {
    const revision = await options.readCreateRevision()
    check()
    if (revision === null) groups.clear()
    else if (!validRevision(revision)) stale()
  }
  return groups
}

export function pendingFolderUpload(job) {
  return job?.newFolderUpload || job?.leafUpload?.job?.newFolderUpload
}

/** Publish a wholly new PackedFS subtree. Only the caller's capability-checked
 * PackedFS writer may supply RAW128 writes with disconnect-abort semantics.
 * job.completed tracks acknowledged writes. Short checks record ordinary CLOSE separately from a digest. */
export async function executeNewFolderUpload({ plan, job, files, selectedPaths, deviceKey, assertSession, signal, onProgress,
  createDirectory, writeFile, readDirectory, readFile, readFileDigest, readRawMetadata, readCreateRevision, createSmall, canGroupCreate, createGroup, publishSmallFolder,
  rename, getFreeBytes, requireSmallCreate = false, quickPacked = false, [siblingSnapshot]:parentSample, [leafSpace]:boundSpace, randomToken = randomHex }) {
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
      if (state.inFlightGroup) {
        const pending = state.inFlightGroup
        if (state.inFlight || !state.groupReceipts || !Array.isArray(pending) || !pending.length || pending.length > 4 ||
            new Set(pending).size !== pending.length || pending.some(path => !selected.has(path) || completed.has(path) ||
              splitDevicePath(path).parent !== splitDevicePath(pending[0]).parent || !fitsSmallCreate(wanted.find(entry => entry.targetPath === path)))) stale()
      }
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
            if (actual.size !== item.entry.size || partial && !completed.has(item.path) && state.inFlight !== item.path && !state.inFlightGroup?.includes(item.path)) stale()
            if (verify) {
              const actualPath = staged(base,item.path)
              await digest(actualPath, item.entry)
              if (state.groupReceipts) {
                const meta = await readRawMetadata(actualPath)
                if (!(meta instanceof Uint8Array) || meta.length !== 128 || !meta.every(byte => byte === 255)) stale()
              }
            }
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
    const acknowledgedOnly = new Set()
    const finish = () => {
      job.completed = [...ordered]; job.equalPaths = plan.entries.filter(entry => entry.comparison === 'same').map(entry => entry.targetPath)
      state.phase = 'complete'; job.state = 'complete'
      if (acknowledgedOnly.size) job.acknowledgedOnly = [...acknowledgedOnly]
      else delete job.acknowledgedOnly
      return {completed:wanted.length - fromCheckpoint, skipped:fromCheckpoint, total:wanted.length, uploadedBytes, job}
    }
    function isPublished(entries) {
      const final = targetEntry(entries, targetName)
      return !!final && final.type === 1 && isNeutral(final) && !targetEntry(entries, stageName())
    }
    // A revision binds the directory names, permissions and hashes to the same
    // PackedFS state. Proofs are local to this call and never survive reconnect.
    const revision = async () => {
      check()
      const value = await readCreateRevision()
      check()
      if (!validRevision(value)) stale()
      return value
    }
    async function audit(base, partial) {
      const before = await revision()
      const entries = await ownerListing()
      if (base === targetPath) { if (!isPublished(entries)) stale() }
      else checkWorkingFolder(entries)
      const found = await inventory(base, partial)
      if (await revision() !== before) stale()
      return {found, revision:before}
    }
    let proof = null
    // Only observations made during this call are eligible for the final CAS.
    // A resumed checkpoint must earn its proof again from names, metadata and SHA.
    let coveredPaths = new Set()
    let continuousReceipts = true
    const candidate = !/^~u[a-f0-9]{8,12}$/.test(targetName) &&
      typeof createSmall === 'function' && typeof readCreateRevision === 'function' && typeof publishSmallFolder === 'function' &&
      (wanted.some(fitsSmallCreate) || (quickPacked && !dirs.length && wanted.length > 1)) ? await readCreateRevision() : null
    check()
    if (candidate !== null && !validRevision(candidate) || (requireSmallCreate || state?.nativeReceipts) && !candidate) stale()
    if (state?.groupReceipts && typeof readRawMetadata !== 'function') stale()
    async function published(entries) {
      if (!isPublished(entries)) return false
      if (candidate) await audit(targetPath, false)
      else await inventory(targetPath)
      return true
    }
    job.state = 'running'
    // A previous guarded rename proves this exact sibling listing. Discard it
    // on a new revision, a different parent or any checkpoint reconciliation.
    const quick = Boolean(quickPacked && candidate)
    const initial = quick && !state && parentSample?.parent === parent && parentSample.revision === candidate
      ? parentSample.entries : await ownerListing()
    const grouped = quick && typeof createGroup === 'function' && typeof canGroupCreate === 'function' &&
      typeof readRawMetadata === 'function' && wanted.some(fitsSmallCreate) && await canGroupCreate()
    let firstGroupChecksMkdir = false
    let freshLeaf = false
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
      const checkedStage = candidate ? await audit(state.stagePath, true) : null
      const found = checkedStage ? checkedStage.found : await inventory(state.stagePath, true)
      proof = checkedStage?.revision ?? null
      if (checkedStage) coveredPaths = checkedStage.found
      if (state.inFlight && found.has(state.inFlight) && !completed.has(state.inFlight)) {
        completed.add(state.inFlight); job.completed.push(state.inFlight)
      }
      if (state.inFlightGroup) {
        const present = state.inFlightGroup.filter(path => found.has(path))
        if (present.length && present.length !== state.inFlightGroup.length) stale()
        for (const path of present) { completed.add(path); job.completed.push(path) }
        delete state.inFlightGroup
      }
      state.inFlight = null
      fromCheckpoint = completed.size
    }
    const remainingBytes = wanted.reduce((sum, entry) => sum + (completed.has(entry.targetPath) ? 0 : entry.size), 0)
    // The outer leaf-suitability check already read free space. The same live
    // revision proves that no intervening allocation changed that observation.
    const free = quick && boundSpace?.revision === candidate ? boundSpace.free : await getFreeBytes(parent)
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
      // A single generation increment across this exclusive MKDIR proves the
      // random folder is empty and the parent listing did not change otherwise.
      if (quick && !dirs.length) {
        const beforeMkdir = parseInt(candidate.slice(8), 16)
        if (grouped && wanted.every(fitsSmallCreate) && beforeMkdir < 0xffffffff) {
          // The first group's conditional create checks this expectation on the device.
          // No other write or publication may rely on it before the matching receipt.
          proof = candidate.slice(0, 8) + (beforeMkdir + 1).toString(16).padStart(8, '0')
          firstGroupChecksMkdir = true
          freshLeaf = true
        } else {
          const after = await revision()
          freshLeaf = consecutiveCommits(candidate, after)
          if (freshLeaf) proof = after
        }
      }
      if (!freshLeaf) checkWorkingFolder(await ownerListing())
    }
    state.phase = 'staging'
    if (candidate) state.nativeReceipts = true
    for (const dir of dirs) {
      if (state.dirs.includes(dir)) continue
      const stageDir = staged(state.stagePath, dir), parts = splitDevicePath(stageDir)
      if (targetEntry(await list(parts.parent), parts.name)) stale()
      await createDirectory(stageDir); state.dirs.push(dir); check()
      proof = null
    }
    // Keep ordinary CLOSE acknowledgements together. A fresh quick leaf binds
    // them to one revision check. Other leaves audit their stored bytes.
    const writeOrder = candidate ? [...wanted.filter(entry => !fitsSmallCreate(entry)), ...wanted.filter(fitsSmallCreate)] : wanted
    let ordinaryStart = null
    const ordinaryReceipts = []
    async function confirmOrdinaryWrites() {
      if (!ordinaryReceipts.length) return
      const after = await revision()
      if (consecutiveCommits(ordinaryStart, after, ordinaryReceipts.length)) {
        for (const path of ordinaryReceipts) {
          coveredPaths.add(path)
          acknowledgedOnly.add(path)
        }
        proof = after
      } else {
        // An outside mutation invalidates the namespace proof. Re-read bytes,
        // names and metadata before including an ordinary CLOSE in publication.
        freshLeaf = false
        const checked = await audit(state.stagePath, true)
        coveredPaths = checked.found; proof = checked.revision
        acknowledgedOnly.clear()
      }
      ordinaryReceipts.length = 0
    }
    check()
    for (let index = 0; index < writeOrder.length; ++index) {
      const entry = writeOrder[index]
      if (completed.has(entry.targetPath)) continue
      const path = staged(state.stagePath, entry.targetPath), parts = splitDevicePath(path)
      let consecutive = true
      if (candidate && fitsSmallCreate(entry)) {
        await confirmOrdinaryWrites()
        if (!proof) {
          const anchor = await audit(state.stagePath, true)
          proof = anchor.revision
          coveredPaths = anchor.found
        }
        if (grouped) {
          const members = [entry]
          while (members.length < 4 && index+1 < writeOrder.length) {
            const next = writeOrder[index+1]
            if (!fitsSmallCreate(next) || completed.has(next.targetPath) || splitDevicePath(next.targetPath).parent !== splitDevicePath(entry.targetPath).parent) break
            members.push(next); ++index
          }
          state.groupReceipts = true
          const pendingPaths = members.map(member => member.targetPath)
          const entries = members.map(member => ({
            name: splitDevicePath(member.targetPath).name,
            bytes: payloads.get(member.targetPath)
          }))
          async function storeGroup(expectedRevision) {
            state.inFlightGroup = pendingPaths
            try {
              return await createGroup(parts.parent, entries, expectedRevision)
            } catch (error) {
              // Only an explicit rejection proves that none of the names were created.
              // Keep the checkpoint when the COMMIT reply may have been lost.
              if (error.cmd === 0x28 && error.status === 1) delete state.inFlightGroup
              throw error
            }
          }
          let after
          try {
            after = await storeGroup(proof)
          } catch (error) {
            if (!firstGroupChecksMkdir || error.cmd !== 0x28 || error.status !== 1) throw error
            const checked = await audit(state.stagePath, true)
            if (checked.revision.slice(0, 8) !== candidate.slice(0, 8)) stale()
            if (checked.revision === proof) throw error
            // An unrelated mutation may have advanced this mount. Retry once only
            // after checking both the still-empty stage and its writable parent.
            freshLeaf = false // The parent listing from before the external mutation is stale.
            coveredPaths = checked.found
            proof = checked.revision
            after = await storeGroup(proof)
          }
          if (!validRevision(after) || !consecutiveCommits(proof,after)) stale()
          firstGroupChecksMkdir = false
          proof = after
          for (const member of members) {
            completed.add(member.targetPath); job.completed.push(member.targetPath)
            coveredPaths.add(member.targetPath); acknowledgedOnly.add(member.targetPath)
            uploadedBytes += member.size
          }
          delete state.inFlightGroup
          check(); progress('syncing', completed.size)
          continue
        }
        state.inFlight = entry.targetPath
        let next
        try {
          next = await createSmall(path, payloads.get(entry.targetPath), entry.sha256, proof)
        } catch (error) {
          if (error.cmd === 0x23 && error.status === 1) {
            state.inFlight = null
            await audit(state.stagePath, true)
          }
          throw error
        }
        if (!validRevision(next) || next === proof) stale()
        consecutive = consecutiveCommits(proof,next)
        if (consecutive) coveredPaths.add(entry.targetPath)
        proof = next
      } else {
        await writeFile(path, payloads.get(entry.targetPath), {
          rawMeta128:emptyMetadata.slice(),
          beforeWrite:async () => {
            if (targetEntry(await list(parts.parent), parts.name)) stale()
            state.inFlight = entry.targetPath
          }
        })
        if (freshLeaf) {
          if (!ordinaryReceipts.length) ordinaryStart = proof
          ordinaryReceipts.push(entry.targetPath)
        }
        proof = null
      }
      completed.add(entry.targetPath); job.completed.push(entry.targetPath); state.inFlight = null
      if (!consecutive) {
        continuousReceipts = false
        freshLeaf = false
        acknowledgedOnly.clear()
        proof = (await audit(state.stagePath, true)).revision
      }
      uploadedBytes += entry.size
      check(); progress('syncing', completed.size)
    }
    await confirmOrdinaryWrites()
    state.phase = 'verifying'
    progress('checking', completed.size)
    if (candidate) {
      // The anchor included every selected directory and ruled out foreign
      // entries. A small-create receipt proves the digest. A raw CLOSE proves
      // a completed write and is tracked separately for later comparison.
      // The firmware checks this exact revision and the no-clobber rename
      // under the same writer lock. Any intervening mutation rejects publication.
      if (!proof || !continuousReceipts || !ordered.every(path => coveredPaths.has(path))) {
        proof = (await audit(state.stagePath, false)).revision
        acknowledgedOnly.clear()
      }
    } else {
      await inventory(state.stagePath)
      // Hashing the tree can take time. Recheck all names and metadata before publishing.
      await inventory(state.stagePath, false, false)
      checkWorkingFolder(await ownerListing())
    }
    check()
    state.phase = 'publishing'
    let publishedRevision
    try {
      if (candidate) publishedRevision = await publishSmallFolder(state.stagePath, targetPath, proof)
      else await rename(state.stagePath, targetPath)
      check()
    } catch (error) {
      check()
      if (candidate && error.cmd === 0x23 && error.status === 1) {
        state.phase = 'verifying'
        throw error
      }
      if (!await published(await ownerListing())) throw error
      acknowledgedOnly.clear()
      return finish()
    }
    // Rename itself advances the revision. An interleaved mutation invalidates
    // every receipt, including changes of the same byte length.
    if (candidate && (!validRevision(publishedRevision) || !consecutiveCommits(proof, publishedRevision))) {
      await audit(targetPath, false)
      acknowledgedOnly.clear()
    } else if (parentSample && freshLeaf) {
      parentSample.parent = parent
      parentSample.revision = publishedRevision
      parentSample.entries = [...initial, {name:targetName, type:1, size:0, meta:decodeRawMetadata(emptyMetadata)}]
    }
    return finish()
  } catch (error) {
    job.state = signal?.aborted ? 'paused' : 'failed'
    error.syncJob = job
    throw error
  }
}
