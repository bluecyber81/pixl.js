// Read-only folder export. No protocol globals, device writes or ZIP dependency.
// The caller must serialize this job with other UI operations on its session.
import { rawMetadataHex, decodeRawMetadata } from './raw-metadata.js'
import { updateZipCrc32 } from './zip-crc32.js'
export const BACKUP_LIMITS = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  maxFileBytes: 8 * 1024 * 1024,
  maxEntries: 4096,
  maxDepth: 32,
  maxPathBytes: 63,
  maxManifestBytes: 4 * 1024 * 1024,
})

const encoder = new TextEncoder()
const unsafeCharacters = /[\u0000-\u001f\u007f<>:"/\\|?*]/u
const reservedWindowsName = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/iu

export class BackupError extends Error {
  constructor(code, message) { super(message); this.name = 'BackupError'; this.code = code }
}

function fail(code, message) { throw new BackupError(code, message) }

// A checkpoint has no serializable data or public byte buffers. A page reload
// drops it; it is intentionally not an archive, a filesystem snapshot or storage.
const backupCheckpoints = new WeakMap()

function checkedFirmwareVersion(version) {
  if (typeof version !== 'string' || version.length > 128 || !validUnicode(version)) {
    fail('BACKUP_API', 'Invalid firmware version label.')
  }
  return version
}

function checkedDeviceKey(key) {
  if (typeof key !== 'string' || !key || key.length > 512 || !validUnicode(key)) {
    fail('BACKUP_API', 'A stable device identity is required to resume a backup.')
  }
  return key
}

/** Retain only completed file reads in this browser page, up to maxBytes. */
export function createBackupCheckpoint({ rootPath, deviceKey, firmwareVersion, preserveLegacyNames = false }) {
  if (typeof preserveLegacyNames !== 'boolean') fail('BACKUP_API', 'Invalid name preservation option.')
  const state = {
    root: checkedRoot(rootPath, preserveLegacyNames), deviceKey: checkedDeviceKey(deviceKey),
    firmwareVersion: checkedFirmwareVersion(firmwareVersion), preserveLegacyNames,
    entries: new Map(), bytes: 0, busy: false,
  }
  if (!state.firmwareVersion) fail('BACKUP_API', 'A firmware version is required to resume a backup.')
  const handle = Object.freeze({
    summary: () => Object.freeze({ rootPath: state.root, firmwareVersion: state.firmwareVersion,
      preserveLegacyNames: state.preserveLegacyNames, files: state.entries.size, bytes: state.bytes, busy: state.busy }),
    clear: () => {
      if (state.busy) fail('BACKUP_CHECKPOINT_BUSY', 'The backup checkpoint is in use.')
      state.entries.clear(); state.bytes = 0
    },
  })
  backupCheckpoints.set(handle, state)
  return handle
}

function fileIdentity(record) {
  // The path is the Map key; archive aliases may change between fresh listings.
  return JSON.stringify([record.type, record.size, record.metadata])
}

function validUnicode(text) {
  // TextEncoder would silently replace an unpaired UTF-16 surrogate.
  for (let i = 0; i < text.length; ++i) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (c >= 0xdc00 && c <= 0xdfff) return false
  }
  return true
}

function checkedName(name) {
  if (typeof name !== 'string' || name.length === 0 || name === '.' || name === '..' ||
      unsafeCharacters.test(name) || /[. ]$/u.test(name) || reservedWindowsName.test(name.split('.')[0].trimEnd()) ||
      !validUnicode(name)) {
    fail('BACKUP_NAME', 'A file or folder name cannot be represented safely in the backup ZIP.')
  }
  return name
}

function checkedExistingName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\0/]/u.test(name) || !validUnicode(name)) {
    fail('BACKUP_NAME', 'Invalid original file or folder identity.')
  }
  return name
}

function checkedRoot(root, preserveLegacyNames) {
  if (typeof root !== 'string' || !/^[A-Z]:\//u.test(root) || root.endsWith('//')) {
    fail('BACKUP_PATH', 'Select a device drive or folder to back up.')
  }
  // Accept the UI's optional trailing slash, but never normalize dot segments.
  if (root.length > 3 && root.endsWith('/')) root = root.slice(0, -1)
  const tail = root.slice(3)
  if (tail) tail.split('/').forEach(preserveLegacyNames ? checkedExistingName : checkedName)
  checkedPath(root)
  return root
}

function checkedPath(path) {
  if (encoder.encode(path.slice(2)).length > BACKUP_LIMITS.maxPathBytes) {
    fail('BACKUP_PATH', 'A device path exceeds the supported 63-byte limit.')
  }
  return path
}

function uint(value, max, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    fail('BACKUP_RECORD', `Invalid ${label} in the directory response.`)
  }
  return value
}

function checkedMetadata(meta) {
  if (!meta || meta.valid !== true || typeof meta.notes !== 'string' || !validUnicode(meta.notes) || meta.notes.includes('\0') ||
      encoder.encode(meta.notes).length > 89 || !meta.flags || !meta.amiibo ||
      typeof meta.flags.hide !== 'boolean' || typeof meta.flags.readonly !== 'boolean') {
    fail('BACKUP_METADATA', 'A directory entry has invalid or incomplete metadata; no complete backup can be made.')
  }
  const raw = uint(meta.flags.raw, 255, 'metadata flags')
  if (meta.flags.hide !== !!(raw & 1) || meta.flags.readonly !== !!(raw & 4)) {
    fail('BACKUP_METADATA', 'Directory metadata flags disagree.')
  }
  return {
    valid: true, notes: meta.notes,
    flags: { raw, hide: meta.flags.hide, readonly: meta.flags.readonly },
    amiibo: { head: uint(meta.amiibo.head, 0xffffffff, 'amiibo head'),
      tail: uint(meta.amiibo.tail, 0xffffffff, 'amiibo tail') },
  }
}

function checkedListing(list, path, preserveLegacyNames = false, rawMode = false) {
  if (!Array.isArray(list) || list.length > BACKUP_LIMITS.maxEntries) {
    fail('BACKUP_LIMIT', 'The directory response exceeds the backup entry limit.')
  }
  const names = new Set()
  const entries = list.map(entry => {
    if (!entry || (entry.type !== 0 && entry.type !== 1)) {
      fail('BACKUP_RECORD', 'Unknown directory entry type.')
    }
    const name = preserveLegacyNames ? checkedExistingName(entry.name) : checkedName(entry.name)
    // Reject aliases before extraction onto case-insensitive/normalizing hosts.
    const key = preserveLegacyNames ? name : name.normalize('NFC').toLowerCase()
    if (names.has(key)) fail('BACKUP_DUPLICATE', 'Directory names collide in the backup archive.')
    names.add(key)
    checkedPath(path + (path.endsWith('/') ? '' : '/') + name)
    return { name, type: entry.type, size: uint(entry.size, 0xffffffff, 'file size'),
      meta: rawMode ? null : checkedMetadata(entry.meta) }
  })
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  if (preserveLegacyNames) {
    const key = name => name.normalize('NFC').toLowerCase()
    const counts = new Map(), occupied = new Set(entries.map(entry => key(entry.name)))
    for (const entry of entries) counts.set(key(entry.name), (counts.get(key(entry.name)) || 0) + 1)
    let number = 0
    for (const entry of entries) {
      let portable = entry.name === entry.name.normalize('NFC') && counts.get(key(entry.name)) === 1
      try { checkedName(entry.name) } catch { portable = false }
      if (portable) entry.archiveName = entry.name
      else {
        // Reserve all original names first, including names encountered later.
        // File/folder aliases share one counter and namespace per directory.
        let alias
        do { alias = `~${entry.type === 1 ? 'folder' : 'file'}-${String(++number).padStart(6, '0')}` } while (occupied.has(key(alias)))
        occupied.add(key(alias)); entry.archiveName = alias
      }
    }
  }
  return entries
}

function bytesOf(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (data instanceof Uint8Array) return data
  fail('BACKUP_DATA', 'A file read did not return binary data.')
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) fail('BACKUP_CRYPTO', 'SHA-256 requires a secure browser context.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
}

// Standard ZIP CRC-32, STORE records and UTF-8 names. No ZIP64 is required under
// the fixed limits. Blob parts avoid joining the complete archive into another
// large Uint8Array; the bounded source bytes are still held during construction.
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0))

async function crc32(bytes, checkpoint) {
  let crc = 0xffffffff
  for (let offset = 0; offset < bytes.length; offset += 0x40000) {
    if (offset !== 0) { await yieldToBrowser(); checkpoint() }
    crc = updateZipCrc32(crc, bytes.subarray(offset, offset + 0x40000))
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function zipStore(entries, date, checkpoint) {
  const parts = [], central = []
  let offset = 0, centralSize = 0
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()))
  const dosDate = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1)
  for (let index = 0; index < entries.length; ++index) {
    if (index % 32 === 0) { await yieldToBrowser(); checkpoint() }
    const entry = entries[index]
    checkpoint()
    const name = encoder.encode(entry.path), data = entry.bytes
    const crc = await crc32(data, checkpoint)
    const local = new Uint8Array(30), l = new DataView(local.buffer)
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true)
    l.setUint16(6, 0x0800, true); l.setUint16(10, dosTime, true); l.setUint16(12, dosDate, true)
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true)
    l.setUint16(26, name.length, true)
    const header = new Uint8Array(46), c = new DataView(header.buffer)
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 0x0314, true); c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true)
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(38, entry.directory ? ((0o40755 << 16) | 0x10) >>> 0 : (0o100644 << 16) >>> 0, true)
    c.setUint32(42, offset, true)
    parts.push(local, name, data); central.push(header, name)
    offset += local.length + name.length + data.length
    centralSize += header.length + name.length
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true)
  e.setUint32(12, centralSize, true); e.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

/**
 * Build a complete, read-only export or reject without an archive.
 * readDirectory(path) -> checked protocol data [{name,size,type,meta}].
 * readFile(path,{maxBytes,onProgress}) -> ArrayBuffer/Uint8Array. The adapter
 * MUST enforce maxBytes before growing its response buffer, and settle only
 * after its read transaction has closed. Cancellation never abandons a live
 * file handle: it waits for the current callback and then stops further I/O.
 * This is a checked sequential export, not an atomic filesystem snapshot or a
 * raw-metadata backup. Same-size content changes between reads are not detected.
 */
export async function createBackup({ rootPath, readDirectory, readFile, readRawMetadata, onProgress, signal, firmwareVersion = '', preserveLegacyNames = false, deviceKey, checkpointState }) {
  if (typeof preserveLegacyNames !== 'boolean') fail('BACKUP_API', 'Invalid name preservation option.')
  const root = checkedRoot(rootPath, preserveLegacyNames)
  if (typeof readDirectory !== 'function' || typeof readFile !== 'function') {
    fail('BACKUP_API', 'Directory and file readers are required.')
  }
  checkedFirmwareVersion(firmwareVersion)
  if (readRawMetadata !== undefined && (typeof readRawMetadata !== 'function' || checkpointState != null)) fail('BACKUP_API', 'Raw migration backups require fresh reads without a resume checkpoint.')
  let resume = null
  if (checkpointState != null) {
    resume = backupCheckpoints.get(checkpointState)
    if (!resume) fail('BACKUP_API', 'Invalid backup checkpoint; create a new checkpoint in this page.')
    if (resume.root !== root || resume.deviceKey !== deviceKey || resume.firmwareVersion !== firmwareVersion ||
        resume.preserveLegacyNames !== preserveLegacyNames) {
      fail('BACKUP_CHECKPOINT_IDENTITY', 'The device, folder, firmware or name mode differs from this backup checkpoint.')
    }
    if (resume.busy) fail('BACKUP_CHECKPOINT_BUSY', 'The backup checkpoint is in use.')
    resume.busy = true
  }
  try {
    const result = await buildBackup({ root, readDirectory, readFile, readRawMetadata, onProgress, signal, firmwareVersion, preserveLegacyNames, resume })
    // A returned Blob owns its bytes. Keep no second resumable copy after success.
    if (resume) { resume.entries.clear(); resume.bytes = 0 }
    return result
  } finally {
    if (resume) resume.busy = false
  }
}

async function buildBackup({ root, readDirectory, readFile, readRawMetadata, onProgress, signal, firmwareVersion, preserveLegacyNames, resume }) {
  const started = new Date()
  const snapshots = [], records = [], zipEntries = [], checksums = []
  let filesTotal = 0, filesDone = 0, bytesTotal = 0, bytesDone = 0, observerError = null
  let reusedFiles = 0, reusedBytes = 0
  const jobStartedAt = performance.now()
  let step = '', startedAt = jobStartedAt, updatedAt = jobStartedAt, previousDone = 0
  let cachedFiles = 0, cachedBytes = 0, verifiedFolders = 0
  function checkpoint() {
    if (signal?.aborted) { const e = new Error('Backup cancelled. No archive was created.'); e.name = 'AbortError'; throw e }
    if (observerError) throw observerError
  }
  function progress(phase, path, activeBytes = 0) {
    if (onProgress) {
      // Compare completed BLE reads across file boundaries. Already retained
      // files add no new BLE work. For one or two files use chunk progress.
      let completed = 0, total = null
      if (phase === 'listing') completed = snapshots.length
      if (phase === 'reading') {
        const count = filesTotal - cachedFiles
        if (count <= 2 && bytesTotal > cachedBytes) {
          completed = bytesDone + activeBytes - reusedBytes
          total = bytesTotal - cachedBytes
        } else {
          completed = filesDone - reusedFiles
          total = count
        }
      }
      if (phase === 'verifying') { completed = verifiedFolders; total = snapshots.length }
      const now = performance.now()
      if (step !== phase) { step = phase; startedAt = now; updatedAt = now }
      if (completed !== previousDone) updatedAt = now
      previousDone = completed
      const timing = { jobStartedAt, startedAt, updatedAt, completed, total }
      try { onProgress(Object.freeze({ phase, path, filesDone, filesTotal, bytesDone: bytesDone + activeBytes, bytesTotal, reusedFiles, reusedBytes, timing, foldersListed: snapshots.length })) }
      catch (error) { observerError = error }
    }
  }
  async function listDirectory(path, relative, depth) {
    checkpoint()
    if (depth > BACKUP_LIMITS.maxDepth) fail('BACKUP_LIMIT', 'The folder tree is too deep for this backup.')
    progress('listing', path); checkpoint()
    const list = checkedListing(await readDirectory(path), path, preserveLegacyNames, !!readRawMetadata)
    checkpoint()
    snapshots.push({ path, entries: list })
    for (const entry of list) {
      checkpoint()
      if (records.length >= BACKUP_LIMITS.maxEntries) fail('BACKUP_LIMIT', 'The backup exceeds 4096 entries.')
      const sourcePath = path + (path.endsWith('/') ? '' : '/') + entry.name
      const archiveName = entry.archiveName || entry.name
      const archivePath = 'files/' + (relative ? relative + '/' : '') + archiveName
      const record = { sourcePath, archivePath: archivePath + (entry.type === 1 ? '/' : ''),
        type: entry.type === 1 ? 'directory' : 'file', size: entry.size, metadata: entry.meta }
      if (preserveLegacyNames) record.nameMapped = archiveName !== entry.name
      records.push(record)
      if (entry.type === 1) await listDirectory(sourcePath, (relative ? relative + '/' : '') + archiveName, depth + 1)
      else {
        if (entry.size > BACKUP_LIMITS.maxFileBytes) fail('BACKUP_LIMIT', 'A file exceeds the 8 MiB backup limit.')
        bytesTotal += entry.size; ++filesTotal
        if (bytesTotal > BACKUP_LIMITS.maxBytes) fail('BACKUP_LIMIT', 'The backup exceeds the 16 MiB file-data limit.')
      }
    }
  }
  checkpoint()
  if (!globalThis.crypto?.subtle) fail('BACKUP_CRYPTO', 'SHA-256 requires a secure browser context.')
  await listDirectory(root, '', 0)
  if (resume) {
    const current = new Map(records.filter(record => record.type === 'file').map(record => [record.sourcePath, fileIdentity(record)]))
    // Evict removed/renamed/changed files before retaining any new bytes. The
    // fresh complete listing has already passed the same 16 MiB total limit.
    for (const [path, entry] of resume.entries) {
      if (current.get(path) !== entry.identity) {
        resume.entries.delete(path); resume.bytes -= entry.bytes.length
      }
    }
    cachedFiles = resume.entries.size
    cachedBytes = resume.bytes
  }
  for (const record of records) {
    checkpoint()
    if (readRawMetadata) {
      record.rawMeta128Hex = rawMetadataHex(await readRawMetadata(record.sourcePath)); checkpoint()
      record.metadata = decodeRawMetadata(record.rawMeta128Hex)
    }
    if (record.type === 'directory') {
      zipEntries.push({ path: record.archivePath, bytes: new Uint8Array(), directory: true })
      continue
    }
    progress('reading', record.sourcePath); checkpoint()
    const identity = fileIdentity(record)
    let cached = resume?.entries.get(record.sourcePath)
    if (cached) {
      ++reusedFiles; reusedBytes += cached.bytes.length
    } else {
      let highWater = 0
      const result = await readFile(record.sourcePath, {
        maxBytes: record.size,
        onProgress: value => {
          const received = value?.received_bytes
          if (Number.isSafeInteger(received) && received >= highWater && received <= record.size) {
            highWater = received; progress('reading', record.sourcePath, highWater)
          }
        },
      })
      checkpoint()
      const source = bytesOf(result)
      if (source.byteLength !== record.size) fail('BACKUP_SIZE', 'A file size changed or a file read was incomplete.')
      // Own the bytes: an adapter is allowed to reuse its receive buffer later.
      const bytes = new Uint8Array(source)
      const hash = await sha256(bytes)
      checkpoint()
      cached = { identity, bytes, sha256: hash }
      if (resume) {
        if (resume.entries.size >= BACKUP_LIMITS.maxEntries || resume.bytes + bytes.length > BACKUP_LIMITS.maxBytes) {
          fail('BACKUP_LIMIT', 'The backup checkpoint exceeds its memory limit.')
        }
        resume.entries.set(record.sourcePath, cached); resume.bytes += bytes.length
      }
    }
    record.sha256 = cached.sha256
    zipEntries.push({ path: record.archivePath, bytes: cached.bytes })
    checksums.push(`${record.sha256}  ${record.archivePath}\n`)
    bytesDone += cached.bytes.length; ++filesDone
    progress('reading', record.sourcePath); checkpoint()
  }
  for (const snapshot of snapshots) {
    checkpoint(); progress('verifying', snapshot.path); checkpoint()
    const current = checkedListing(await readDirectory(snapshot.path), snapshot.path, preserveLegacyNames, !!readRawMetadata)
    checkpoint()
    if (JSON.stringify(current) !== JSON.stringify(snapshot.entries)) {
      fail('BACKUP_CHANGED', 'Directory contents, sizes or metadata changed during the backup.')
    }
    ++verifiedFolders
  }
  if (readRawMetadata) for (const record of records) {
    checkpoint()
    if (rawMetadataHex(await readRawMetadata(record.sourcePath)) !== record.rawMeta128Hex) fail('BACKUP_CHANGED', 'Raw metadata changed during backup.')
    checkpoint()
  }
  const manifest = {
    format: 'allmiibo-folder-backup', version: readRawMetadata ? 2 : 1, completed: true,
    createdAt: started.toISOString(), finishedAt: new Date().toISOString(),
    rootPath: root, firmwareVersion,
    files: filesTotal, directories: snapshots.length - 1, bytes: bytesTotal,
    metadataEncoding: readRawMetadata ? 'Exact 128-byte VFS attributes in rawMeta128Hex; decoded metadata is informational, including unknown or malformed fields.' : 'Decoded protocol fields: notes, raw flags, hide/readonly and amiibo IDs; not raw metadata bytes.',
    nameMapping: preserveLegacyNames ? 'Unportable or colliding names have unique portable ZIP aliases. Each sourcePath is the exact original device identity; archivePath locates its unchanged data. Do not infer original names from ZIP aliases.' : 'Original names retained; unsafe or colliding names rejected.',
    consistency: 'Serial reads; exact listed sizes; directory name/type/size/decoded-metadata snapshots compared before and after. Not an atomic snapshot; same-size content changes between reads or retries without listed metadata changes are not detected.',
    resume: { reusedFiles, reusedBytes, retainedInBrowserMemoryOnly: !!resume },
    entries: records,
  }
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2) + '\n')
  if (manifestBytes.length > BACKUP_LIMITS.maxManifestBytes) fail('BACKUP_LIMIT', 'Backup metadata exceeds the memory limit.')
  checksums.push(`${await sha256(manifestBytes)}  manifest.json\n`)
  checkpoint(); progress('archiving', root); checkpoint()
  zipEntries.push({ path: 'manifest.json', bytes: manifestBytes },
    { path: 'SHA256SUMS.txt', bytes: encoder.encode(checksums.join('')) })
  const blob = await zipStore(zipEntries, started, checkpoint)
  checkpoint()
  const label = root.length === 3 ? root[0] : root.split('/').at(-1)
  const safeLabel = label.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'folder'
  const filename = `allmiibo-backup-${safeLabel}-${started.toISOString().replace(/[:.]/g, '-')}.zip`
  progress('complete', root); checkpoint()
  return { blob, filename, manifest }
}
