import { assertPortableEntryName, assertDeviceEntryName, assertDevicePath, joinDevicePath, splitDevicePath, portableNameKey, validUnicode } from './portable-names.js'

export const UPLOAD_LIMITS = Object.freeze({ maxFileBytes: 2 * 1024 * 1024, maxExistingBytes: 8 * 1024 * 1024, maxEntries: 4096 })
export class UploadError extends Error {
  constructor(code, message) { super(message); this.name = 'UploadError'; this.code = code }
}
const fail = (code, message) => { throw new UploadError(code, message) }
const uint = (n, max = 0xffffffff) => Number.isSafeInteger(n) && n >= 0 && n <= max

export async function sha256Bytes(data) {
  if (!globalThis.crypto?.subtle) fail('UPLOAD_CRYPTO', 'SHA-256 requires a secure browser context.')
  const bytes = asBytes(data)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
}
export function asBytes(data) {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  fail('UPLOAD_DATA', 'A binary file was expected.')
}
export async function snapshotFile(file, maxBytes = UPLOAD_LIMITS.maxFileBytes) {
  let bytes
  if (file instanceof Uint8Array || file instanceof ArrayBuffer) bytes = asBytes(file)
  else {
    if (!file || typeof file.arrayBuffer !== 'function' || !uint(file.size, maxBytes)) fail('UPLOAD_SIZE', 'Invalid file or file too large.')
    bytes = asBytes(await file.arrayBuffer())
    if (bytes.byteLength !== file.size) fail('UPLOAD_CHANGED', 'The local file changed while being read.')
  }
  if (bytes.byteLength > maxBytes) fail('UPLOAD_SIZE', 'File too large.')
  return new Uint8Array(bytes) // Also copies Buffer/subclasses whose slice() may share storage.
}
export function copyMetadata(meta) {
  if (!meta || meta.valid !== true || !validUnicode(meta.notes) || meta.notes.includes('\0') || new TextEncoder().encode(meta.notes).length > 89 ||
      !uint(meta.flags?.raw, 255) || typeof meta.flags?.hide !== 'boolean' || typeof meta.flags?.readonly !== 'boolean' ||
      meta.flags.hide !== !!(meta.flags.raw & 1) || meta.flags.readonly !== !!(meta.flags.raw & 4) ||
      !uint(meta.amiibo?.head) || !uint(meta.amiibo?.tail)) fail('UPLOAD_METADATA', 'The existing metadata cannot be preserved safely.')
  return { valid: true, notes: meta.notes, flags: { ...meta.flags }, amiibo: { head: meta.amiibo.head, tail: meta.amiibo.tail } }
}
export const metadataKey = meta => {
  const copy = copyMetadata(meta)
  return JSON.stringify([copy.notes, copy.flags.raw, copy.amiibo.head, copy.amiibo.tail])
}
export function checkedDirectory(entries) {
  if (!Array.isArray(entries) || entries.length > UPLOAD_LIMITS.maxEntries) fail('UPLOAD_LIST', 'Invalid directory response.')
  const seen = new Set()
  return entries.map(entry => {
    if (!entry || ![0, 1].includes(entry.type) || !uint(entry.size)) fail('UPLOAD_LIST', 'Invalid directory entry.')
    assertDeviceEntryName(entry.name)
    if (seen.has(entry.name)) fail('UPLOAD_LIST', 'Duplicate directory entry.')
    seen.add(entry.name)
    return entry
  })
}
export function targetEntry(entries, name) {
  const aliases = entries.filter(entry => portableNameKey(entry.name) === portableNameKey(name))
  if (aliases.some(entry => entry.name !== name) || aliases.length > 1) fail('UPLOAD_COLLISION', 'The destination collides by case or Unicode normalization.')
  return aliases[0] || null
}
// A folder's metadata lives in its parent listing, not in its own list.
// Drive roots have no metadata record. Never normalize an existing identity.
export async function directoryPathAccess(path, readDirectory, check, stopAtReadonly = false) {
  const root = assertDevicePath(path)
  let current = root.slice(0, 3)
  let access = 'writable'
  for (const segment of root.slice(3).split('/').filter(Boolean)) {
    check(); const entries = checkedDirectory(await readDirectory(current)); check()
    const aliases = entries.filter(entry => portableNameKey(entry.name) === portableNameKey(segment))
    if (aliases.length !== 1 || aliases[0].name !== segment || aliases[0].type !== 1) return 'unavailable'
    try { if (copyMetadata(aliases[0].meta).flags.readonly) access = 'readonly' }
    catch (error) { if (error.code !== 'UPLOAD_METADATA') throw error; access = 'readonly' }
    if (stopAtReadonly && access === 'readonly') return access
    current = joinDevicePath(current, segment)
  }
  return access
}
export async function writableDirectoryPath(path, readDirectory, check) {
  return await directoryPathAccess(path, readDirectory, check, true) === 'writable'
}
const sameExpected = (a, b) => !a && !b || !!a && !!b && a.size === b.size && a.sha256 === b.sha256 && metadataKey(a.metadata) === metadataKey(b.metadata)
function randomHex() {
  if (!globalThis.crypto?.getRandomValues) fail('UPLOAD_CRYPTO', 'Secure random staging names are unavailable.')
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), n => n.toString(16).padStart(2, '0')).join('')
}

export function temporaryNames(parent, token) {
  const prefix = parent + (parent.endsWith('/') ? '' : '/')
  const available = 63 - new TextEncoder().encode(prefix.slice(2)).length
  if (available < 1) fail('UPLOAD_PATH', 'No room for a temporary name in this folder.')
  if (available >= 3) {
    const suffix = token.slice(0, Math.min(12, available - 2))
    return ['~u' + suffix, '~b' + suffix]
  }
  // A valid one-character destination can fill all 63 path bytes. Retain two
  // distinct portable candidates even there; full paths/roles remain in the
  // recovery receipt. Short names still undergo all collision checks below.
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  const index = parseInt(token.slice(0, 6), 16) % alphabet.length
  const marker = available === 2 ? '~' : ''
  return [marker + alphabet[index], marker + alphabet[(index + 1) % alphabet.length]]
}

/**
 * Sequential staging, mandatory SHA-256 read-back, then a recoverable rename
 * sequence. This is NOT atomic across power loss. The caller serializes this
 * entire operation with all other device operations. Adapters reject nonzero
 * protocol status, drain/close handles before settling, and enforce maxBytes.
 * Cancellation before commit preserves the old destination. Once commit starts
 * it is finished (or reconciled) while the same BLE session is alive.
 */
export async function safeUpload({ path, file, replace = false, expected, readDirectory, readFile, writeFile, rename,
  remove, updateMetadata, getFreeBytes, assertSession, signal, onProgress, randomToken = randomHex,
  allowLegacyNames = false, metadata }) {
  const { parent, name } = splitDevicePath(path)
  if (typeof allowLegacyNames !== 'boolean') fail('UPLOAD_API', 'Invalid legacy name option.')
  if (allowLegacyNames) {
    assertDeviceEntryName(name)
    if (new TextEncoder().encode(name).length > 47) fail('UPLOAD_PATH', 'The restored name exceeds 47 UTF-8 bytes.')
  } else assertPortableEntryName(name)
  const requestedMetadata = metadata === undefined ? null : copyMetadata(metadata)
  for (const fn of [readDirectory, readFile, writeFile, rename, remove, updateMetadata, getFreeBytes, assertSession, randomToken]) {
    if (typeof fn !== 'function') fail('UPLOAD_API', 'A complete upload adapter is required.')
  }
  const receipt = { phase: 'preparing', committed: false, targetPath: path, stagePath: null, backupPath: null, recoveryFiles: [], restored: false }
  let stageAttempted = false, commitStarted = false, original = null, sourceHash, sourceBytes, desiredMetadata = requestedMetadata
  const stillCurrent = () => { try { assertSession(); return true } catch { return false } }
  function check(ignoreAbort = false) {
    assertSession()
    if (!ignoreAbort && signal?.aborted) { const e = new UploadError('UPLOAD_CANCELLED', 'Upload cancelled.'); e.name = 'AbortError'; throw e }
  }
  function progress(phase, done = 0, total = sourceBytes?.byteLength || 0) {
    receipt.phase = phase
    // UI callbacks are observers; they cannot abandon a file handle/commit.
    try { onProgress?.({ phase, path, done, total }) } catch { /* observer only */ }
  }
  async function list(ignoreAbort = false) { check(ignoreAbort); const entries = checkedDirectory(await readDirectory(parent)); check(ignoreAbort); return entries }
  async function checkWritableParent() {
    if (!await writableDirectoryPath(parent, readDirectory, check)) fail('UPLOAD_PARENT', 'The destination folder or an ancestor is read-only, missing or has invalid metadata.')
  }
  async function digestAt(target, size, ignoreAbort = false, phase = 'verifying') {
    check(ignoreAbort)
    const bytes = asBytes(await readFile(target, { maxBytes: size, onProgress: value => progress(phase, value.received_bytes ?? value.done ?? 0, size) }))
    check(ignoreAbort)
    if (bytes.byteLength !== size) fail('UPLOAD_CHANGED', 'The device file size changed during the read.')
    const hash = await sha256Bytes(bytes); check(ignoreAbort); return hash
  }
  async function snapshot(entry, ignoreAbort = false) {
    if (!entry) return null
    if (entry.type !== 0) fail('UPLOAD_DIRECTORY', 'A folder already uses the destination name.')
    if (entry.size > UPLOAD_LIMITS.maxExistingBytes) fail('UPLOAD_SIZE', 'The existing file exceeds the checked replacement limit.')
    const metadata = copyMetadata(entry.meta)
    if (metadata.flags.readonly) fail('UPLOAD_READONLY', 'The destination is read-only.')
    return { size: entry.size, metadata, sha256: await digestAt(path, entry.size, ignoreAbort, 'checking') }
  }
  async function cleanStage() {
    if (!stageAttempted || !receipt.stagePath || !stillCurrent()) return false
    try {
      const entry = (await list(true)).find(entry => joinDevicePath(parent, entry.name) === receipt.stagePath)
      if (!entry) return true
      if (entry.type !== 0) return false
      check(true); await remove(receipt.stagePath); check(true)
      return !(await list(true)).some(entry => joinDevicePath(parent, entry.name) === receipt.stagePath)
    } catch { return false }
  }
  async function reconcile() {
    // A failed command can have completed on the device before its ACK was lost.
    // Never infer success from the last resolved Promise, nor delete uncertain data.
    receipt.committed = null
    if (!stillCurrent()) return
    try {
      const entries = await list(true), target = entries.find(entry => entry.name === name)
      if (target?.type === 0 && target.size === sourceBytes.byteLength &&
          await digestAt(path, target.size, true) === sourceHash && (!desiredMetadata || metadataKey(target.meta) === metadataKey(desiredMetadata))) {
        receipt.committed = true; return
      }
      if (original && target?.type === 0 && target.size === original.size &&
          await digestAt(path, target.size, true) === original.sha256 && metadataKey(target.meta) === metadataKey(original.metadata)) {
        receipt.committed = false; return
      }
      if (!target && original && receipt.backupPath) {
        const backup = entries.find(entry => joinDevicePath(parent, entry.name) === receipt.backupPath)
        if (backup?.type === 0 && backup.size === original.size && metadataKey(backup.meta) === metadataKey(original.metadata) &&
            await digestAt(receipt.backupPath, backup.size, true) === original.sha256) {
          check(true); await rename(receipt.backupPath, path); check(true)
          if (await digestAt(path, original.size, true) === original.sha256) { receipt.committed = false; receipt.restored = true }
        }
      } else if (!target && !original) receipt.committed = false
    } catch { /* exact recovery paths remain in the receipt */ }
  }
  try {
    check(); sourceBytes = await snapshotFile(file); check(); sourceHash = await sha256Bytes(sourceBytes); check()
    await checkWritableParent()
    let entries = await list(), existing = targetEntry(entries, name)
    if (existing && !replace) fail('UPLOAD_EXISTS', 'The destination already exists; replacement was not enabled.')
    original = await snapshot(existing)
    desiredMetadata = requestedMetadata || original?.metadata || null
    if (expected !== undefined && !sameExpected(original, expected)) fail('UPLOAD_STALE', 'The destination changed after the comparison.')
    const free = await getFreeBytes(parent[0]); check()
    // The original must coexist with the complete staged file. Never subtract
    // its allocation here. Filesystem overhead may still make the write fail.
    if (!uint(free) || free < sourceBytes.byteLength) fail('UPLOAD_SPACE', 'Not enough free space to stage the complete file.')
    const occupied = new Set(entries.map(entry => portableNameKey(entry.name)))
    occupied.add(portableNameKey(name))
    for (let attempt = 0; attempt < 16; ++attempt) {
      const token = randomToken()
      if (typeof token !== 'string' || !/^[a-f0-9]{12}$/u.test(token)) fail('UPLOAD_API', 'Invalid staging token.')
      const [stage, backup] = temporaryNames(parent, token)
      if (occupied.has(portableNameKey(stage)) || original && occupied.has(portableNameKey(backup))) continue
      receipt.stagePath = joinDevicePath(parent, stage); receipt.backupPath = original ? joinDevicePath(parent, backup) : null
      break
    }
    if (!receipt.stagePath) fail('UPLOAD_COLLISION', 'No unused staging name was found.')
    entries = await list()
    if (entries.some(entry => [receipt.stagePath, receipt.backupPath].filter(Boolean).some(candidate =>
      portableNameKey(candidate.slice(candidate.lastIndexOf('/') + 1)) === portableNameKey(entry.name)))) fail('UPLOAD_COLLISION', 'A staging name is already in use.')
    await checkWritableParent()
    check(); stageAttempted = true; progress('uploading')
    await writeFile(receipt.stagePath, sourceBytes, { onProgress: value => progress('uploading', value.written_bytes ?? value.done ?? 0) })
    check(); progress('verifying')
    if (await digestAt(receipt.stagePath, sourceBytes.byteLength) !== sourceHash) fail('UPLOAD_VERIFY', 'The staged file failed SHA-256 verification.')
    if (desiredMetadata) { check(); await updateMetadata(receipt.stagePath, copyMetadata(desiredMetadata)); check() }
    entries = await list()
    const staged = entries.find(entry => joinDevicePath(parent, entry.name) === receipt.stagePath)
    if (!staged || staged.type !== 0 || staged.size !== sourceBytes.byteLength ||
        desiredMetadata && metadataKey(staged.meta) !== metadataKey(desiredMetadata)) fail('UPLOAD_METADATA', 'Staged file or preserved metadata changed.')
    if (!sameExpected(await snapshot(targetEntry(entries, name)), original)) fail('UPLOAD_STALE', 'The destination changed before commit.')
    // The old-content read can take time. Check names and metadata once more,
    // especially the backup destination (some backends overwrite on rename).
    entries = await list()
    const latest = targetEntry(entries, name)
    if (!!latest !== !!original || latest && (latest.type !== 0 || latest.size !== original.size || metadataKey(latest.meta) !== metadataKey(original.metadata))) {
      fail('UPLOAD_STALE', 'The destination changed before commit.')
    }
    if (receipt.backupPath && entries.some(entry => portableNameKey(entry.name) === portableNameKey(receipt.backupPath.slice(receipt.backupPath.lastIndexOf('/') + 1)))) {
      fail('UPLOAD_COLLISION', 'The backup name is already in use.')
    }
    await checkWritableParent()
    check(); progress('committing'); check(); commitStarted = true
    if (original) { check(true); await rename(path, receipt.backupPath); check(true) }
    await rename(receipt.stagePath, path); check(true)
    if (await digestAt(path, sourceBytes.byteLength, true) !== sourceHash) fail('UPLOAD_VERIFY', 'The committed file failed SHA-256 verification.')
    const committed = (await list(true)).find(entry => entry.name === name)
    if (!committed || committed.type !== 0 || desiredMetadata && metadataKey(committed.meta) !== metadataKey(desiredMetadata)) fail('UPLOAD_METADATA', 'Committed metadata could not be confirmed.')
    receipt.committed = true
    if (receipt.backupPath) {
      try {
        check(true); await remove(receipt.backupPath); check(true)
        if ((await list(true)).some(entry => joinDevicePath(parent, entry.name) === receipt.backupPath)) throw new Error('Backup remains')
      } catch { receipt.recoveryFiles.push({ path: receipt.backupPath, role: 'backup', state: 'possible' }) }
    }
    progress('complete', sourceBytes.byteLength)
    return { path, size: sourceBytes.byteLength, sha256: sourceHash, replaced: !!original, verified: true,
      cancelledAfterCommit: signal?.aborted === true, recoveryFiles: receipt.recoveryFiles.slice(), recovery: { ...receipt } }
  } catch (cause) {
    receipt.failurePhase = receipt.phase
    if (commitStarted) await reconcile()
    if (!commitStarted || receipt.restored) {
      if (!(await cleanStage()) && stageAttempted) receipt.recoveryFiles.push({ path: receipt.stagePath, role: 'stage', state: 'possible' })
    } else {
      if (receipt.stagePath) receipt.recoveryFiles.push({ path: receipt.stagePath, role: 'stage', state: 'possible' })
      if (receipt.backupPath) receipt.recoveryFiles.push({ path: receipt.backupPath, role: 'backup', state: 'possible' })
    }
    const error = cause instanceof Error ? cause : new UploadError('UPLOAD_FAILED', String(cause))
    error.code ||= 'UPLOAD_FAILED'; error.recovery = { ...receipt, recoveryFiles: receipt.recoveryFiles.slice() }
    error.recoveryFiles = error.recovery.recoveryFiles; error.committed = receipt.committed
    throw error
  }
}
