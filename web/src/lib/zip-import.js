import { assertDeviceEntryName, assertDevicePath, portableNameKey } from './portable-names.js'
import { safeUpload, checkedDirectory, copyMetadata, metadataKey, sha256Bytes, asBytes, writableDirectoryPath, UPLOAD_LIMITS } from './safe-upload.js'
import { rawMetadataHex, decodeRawMetadata } from './raw-metadata.js'
import { parseUniqueJson } from './unique-json.js'
import { updateZipCrc32 } from './zip-crc32.js'
import { loadZipReader } from './zip-reader.js'

export const ZIP_IMPORT_LIMITS = Object.freeze({ zipBytes: 32 * 1024 * 1024, expandedBytes: 24 * 1024 * 1024,
  dataBytes: 16 * 1024 * 1024, fileBytes: 8 * 1024 * 1024, manifestBytes: 4 * 1024 * 1024, entries: 4096, depth: 32 })
const archives = new WeakMap(), plans = new WeakMap(), activePlans = new WeakSet(), encoder = new TextEncoder()
export class ZipImportError extends Error { constructor(code, message) { super(message); this.name = 'ZipImportError'; this.code = code } }
const fail = (code, message) => { throw new ZipImportError(code, message) }
const requireThat = (condition, code, message) => { if (!condition) fail(code, message) }
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
const observe = (callback, value) => { try { callback?.(value) } catch { /* observer only */ } }
function check(signal, assertSession) {
  assertSession?.()
  if (signal?.aborted) { const error = new ZipImportError('ZIP_CANCELLED', 'ZIP import cancelled.'); error.name = 'AbortError'; throw error }
}
const uint = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max
const digestPattern = /^[a-f0-9]{64}$/u
const pathKey = path => path.split('/').map(part => part.normalize('NFC').toLowerCase()).join('/')
const parentOf = path => path.slice(0, path.lastIndexOf('/')) || ''
const deviceParent = path => path.lastIndexOf('/') === 2 ? path.slice(0, 3) : parentOf(path)
const nameOf = path => path.slice(path.lastIndexOf('/') + 1)
const sourcePrefix = root => root.endsWith('/') ? root : root + '/'
// Firmware reserves this exact, case-sensitive prefix at a drive root. OLD/NEW
// files without another transaction entry are retained in backups but must not
// be restored. Directories, descendants and unknown suffixes are not inactive.
function transactionKind(path, type) {
  const local = path.slice(2)
  if (!local.startsWith('/.pixl_txn')) return null
  return type === 'file' && ['/.pixl_txn_old', '/.pixl_txn_new'].includes(local) ? 'inactive' : 'pending'
}
const pendingTransactions = (entries, root) => entries.some(entry => transactionKind(root + entry.name, entry.type === 1 ? 'directory' : 'file') === 'pending')
function rootOf(value) {
  const root = value?.length > 3 && value.endsWith('/') ? value.slice(0, -1) : value
  assertDevicePath(root)
  requireThat(/^[IE]:\//u.test(root), 'ZIP_PATH', 'Only I:/ and E:/ are supported device roots.')
  return root
}
function legacyPath(path) {
  assertDevicePath(path)
  for (const name of path.slice(3).split('/').filter(Boolean)) {
    assertDeviceEntryName(name)
    requireThat(encoder.encode(name).length <= 47, 'ZIP_PATH', 'A restored name exceeds 47 UTF-8 bytes.')
  }
  return path
}
function archiveName(name) {
  requireThat(typeof name === 'string' && name && encoder.encode(name).length <= 1024 && !/[\\\u0000-\u001f\u007f]/u.test(name) && !name.startsWith('/') && !/^[A-Za-z]:/u.test(name), 'ZIP_PATH', 'Unsafe ZIP entry path.')
  const body = name.endsWith('/') ? name.slice(0, -1) : name
  const segments = body.split('/')
  requireThat(segments.length <= ZIP_IMPORT_LIMITS.depth + 2 && segments.every(part => part && part !== '.' && part !== '..'), 'ZIP_PATH', 'Unsafe ZIP path segments.')
  return name
}
function readName(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { fail('ZIP_ENCODING', 'The ZIP contains an invalid UTF-8 name.') }
}

// Validate bounds and entry identity BEFORE asking JSZip to inflate anything.
function inspectZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); --p) {
    if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break }
  }
  requireThat(end >= 0, 'ZIP_STRUCTURE', 'A complete ZIP directory is required.')
  const count = view.getUint16(end + 10, true), start = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true)
  requireThat(view.getUint16(end + 4, true) === 0 && view.getUint16(end + 6, true) === 0 && view.getUint16(end + 8, true) === count && count >= 2 && count <= ZIP_IMPORT_LIMITS.entries + 2 && start + size === end, 'ZIP_STRUCTURE', 'Unsupported ZIP directory or entry count.')
  const entries = new Map(), aliases = new Set(), spans = []
  let p = start, expanded = 0
  for (let i = 0; i < count; ++i) {
    requireThat(p + 46 <= end && view.getUint32(p, true) === 0x02014b50, 'ZIP_STRUCTURE', 'Invalid ZIP directory record.')
    const flags = view.getUint16(p + 8, true), method = view.getUint16(p + 10, true), packed = view.getUint32(p + 20, true), unpacked = view.getUint32(p + 24, true)
    const nl = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true), local = view.getUint32(p + 42, true)
    requireThat(nl > 0 && nl <= 1024 && p + 46 + nl + extra + comment <= end, 'ZIP_STRUCTURE', 'Invalid ZIP name length.')
    const name = archiveName(readName(bytes.subarray(p + 46, p + 46 + nl))), directory = name.endsWith('/'), identity = name.replace(/\/$/u, '').normalize('NFC').toLowerCase()
    requireThat(!aliases.has(identity), 'ZIP_COLLISION', 'Duplicate or colliding ZIP entry paths.'); aliases.add(identity)
    const unixType = (view.getUint32(p + 38, true) >>> 16) & 0xf000
    requireThat(unixType === 0 || unixType === (directory ? 0x4000 : 0x8000), 'ZIP_TYPE', 'Links and special ZIP entries are unsupported.')
    requireThat(!(flags & 0x41) && [0, 8].includes(method) && view.getUint16(p + 34, true) === 0, 'ZIP_FORMAT', 'Encrypted or unsupported ZIP entries.')
    expanded += unpacked
    requireThat(packed <= ZIP_IMPORT_LIMITS.zipBytes && unpacked <= ZIP_IMPORT_LIMITS.fileBytes && expanded <= ZIP_IMPORT_LIMITS.expandedBytes && (!directory || unpacked === 0), 'ZIP_LIMIT', 'ZIP expansion exceeds the import limits.')
    requireThat(local + 30 <= start && view.getUint32(local, true) === 0x04034b50, 'ZIP_STRUCTURE', 'Missing local ZIP header.')
    const localNameLength = view.getUint16(local + 26, true), payload = local + 30 + localNameLength + view.getUint16(local + 28, true)
    requireThat(payload + packed <= start && localNameLength === nl && readName(bytes.subarray(local + 30, local + 30 + nl)) === name && view.getUint16(local + 6, true) === flags && view.getUint16(local + 8, true) === method, 'ZIP_STRUCTURE', 'ZIP headers disagree.')
    const crc = view.getUint32(p + 16, true)
    if (!(flags & 8)) requireThat(view.getUint32(local + 14, true) === crc && view.getUint32(local + 18, true) === packed && view.getUint32(local + 22, true) === unpacked, 'ZIP_STRUCTURE', 'ZIP sizes or CRC fields disagree.')
    requireThat(method !== 0 || packed === unpacked, 'ZIP_STRUCTURE', 'Invalid stored ZIP size.')
    entries.set(name, { name, size: unpacked, crc, directory }); spans.push([local, payload + packed]); p += 46 + nl + extra + comment
  }
  spans.sort((a, b) => a[0] - b[0])
  requireThat(p === end && spans.every((span, i) => !i || spans[i - 1][1] <= span[0]), 'ZIP_STRUCTURE', 'Overlapping ZIP entries.')
  return entries
}
function boundedEntry(zip, entry, signal) {
  return new Promise((resolve, reject) => {
    const file = zip.files[entry.name]
    if (!file || file.name !== entry.name || file.dir !== entry.directory) { reject(new ZipImportError('ZIP_STRUCTURE', 'ZIP library entry identity differs.')); return }
    const stream = file.internalStream('uint8array'), chunks = []
    let size = 0, crc = 0xffffffff, settled = false
    const failed = error => { if (!settled) { settled = true; stream.pause(); chunks.length = 0; reject(error) } }
    stream.on('data', chunk => {
      if (settled) return
      try { check(signal); size += chunk.length; requireThat(size <= entry.size, 'ZIP_LIMIT', 'ZIP entry expands beyond its declared size.'); crc = updateZipCrc32(crc, chunk); chunks.push(chunk) } catch (error) { failed(error) }
    })
    stream.on('error', failed)
    stream.on('end', () => {
      if (settled) return
      try {
        check(signal); requireThat(size === entry.size && ((crc ^ 0xffffffff) >>> 0) === entry.crc, 'ZIP_CRC', 'ZIP entry size or CRC does not match.')
        const result = new Uint8Array(size); let offset = 0
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
        settled = true; resolve(result)
      } catch (error) { failed(error) }
    })
    stream.resume()
  })
}
function metadataOf(value) {
  const metadata = copyMetadata(value)
  requireThat(!metadata.notes.includes('\0'), 'ZIP_METADATA', 'A NUL in metadata notes cannot round-trip through the device.')
  return metadata
}

/** Parses our checked backup schema only. No device/network/Windows filesystem I/O. */
export function loadBackupZip(input, options = {}) {
  return readVerifiedBackup(input, options, true)
}

// Verify the same bytes as an import, but retain only records for offline comparison.
export function loadBackupIndex(input, options = {}) {
  return readVerifiedBackup(input, options, false)
}

async function readVerifiedBackup(input, { JSZip, signal, onProgress }, keepFileData) {
  check(signal)
  requireThat(uint(input?.size ?? input?.byteLength, ZIP_IMPORT_LIMITS.zipBytes) && (input.size ?? input.byteLength) >= 22, 'ZIP_LIMIT', 'ZIP file is empty or larger than 32 MiB.')
  const bytes = typeof input.arrayBuffer === 'function' ? new Uint8Array(await input.arrayBuffer()) : new Uint8Array(asBytes(input))
  check(signal); requireThat(bytes.length <= ZIP_IMPORT_LIMITS.zipBytes && bytes.length >= 22, 'ZIP_LIMIT', 'ZIP byte length changed.')
  const entries = inspectZip(bytes), manifestEntry = entries.get('manifest.json'), sumsEntry = entries.get('SHA256SUMS.txt')
  requireThat(manifestEntry && !manifestEntry.directory && manifestEntry.size > 0 && manifestEntry.size <= ZIP_IMPORT_LIMITS.manifestBytes && sumsEntry && !sumsEntry.directory && sumsEntry.size <= 2 * 1024 * 1024, 'ZIP_MANIFEST', 'Choose an Allmiibo backup ZIP with manifest.json and SHA256SUMS.txt; firmware and private correction packages are not supported here.')
  const reader = JSZip ?? await loadZipReader(signal)
  check(signal)
  requireThat(typeof reader?.loadAsync === 'function', 'ZIP_API', 'The bundled ZIP reader is unavailable.')
  const zip = await reader.loadAsync(bytes, { checkCRC32: false, createFolders: false })
  check(signal)
  requireThat(Object.keys(zip.files).length === entries.size && Object.keys(zip.files).every(name => entries.has(name)), 'ZIP_STRUCTURE', 'The ZIP reader changed entry paths.')
  const manifestBytes = await boundedEntry(zip, manifestEntry, signal), sumsBytes = await boundedEntry(zip, sumsEntry, signal)
  let manifest
  try { manifest = parseUniqueJson(readName(manifestBytes)) } catch { fail('ZIP_MANIFEST', 'Invalid or ambiguous backup manifest JSON.') }
  requireThat(manifest?.format === 'allmiibo-folder-backup' && [1,2].includes(manifest.version) && manifest.completed === true && Array.isArray(manifest.entries) && manifest.entries.length <= ZIP_IMPORT_LIMITS.entries, 'ZIP_MANIFEST', 'Only completed Allmiibo backup schema 1 or 2 is supported.')
  const rootPath = legacyPath(rootOf(manifest.rootPath)), prefix = sourcePrefix(rootPath), originals = new Map(), archivePaths = new Set(), records = []
  let byteCount = 0, fileCount = 0, directoryCount = 0
  for (const value of manifest.entries) {
    check(signal)
    requireThat(value && typeof value.sourcePath === 'string' && value.sourcePath.startsWith(prefix) && value.sourcePath.length > prefix.length && ['file', 'directory'].includes(value.type), 'ZIP_MANIFEST', 'Invalid backup source identity.')
    legacyPath(value.sourcePath)
    const relativePath = value.sourcePath.slice(prefix.length)
    requireThat(relativePath.split('/').length <= ZIP_IMPORT_LIMITS.depth + 1 && !originals.has(value.sourcePath), 'ZIP_COLLISION', 'Duplicate or excessive backup source path.')
    const archivePath = archiveName(value.archivePath), directory = value.type === 'directory', stored = entries.get(archivePath)
    requireThat(archivePath.startsWith('files/') && archivePath !== 'files/' && !archivePaths.has(archivePath) && stored && stored.directory === directory && archivePath.endsWith('/') === directory && uint(value.size, ZIP_IMPORT_LIMITS.fileBytes) && stored.size === (directory ? 0 : value.size), 'ZIP_MANIFEST', 'Backup entry and ZIP contents disagree.')
    let rawMeta128Hex, metadata
    if (manifest.version === 2) {
      try { rawMeta128Hex = rawMetadataHex(value.rawMeta128Hex); metadata = decodeRawMetadata(rawMeta128Hex) }
      catch { fail('ZIP_METADATA', 'A schema2 entry requires exact 128-byte metadata.') }
      requireThat(JSON.stringify(value.metadata) === JSON.stringify(metadata), 'ZIP_METADATA', 'Raw and decoded metadata disagree.')
    } else metadata = metadataOf(value.metadata)
    const record = { sourcePath: value.sourcePath, relativePath, archivePath, type: value.type, size: directory ? 0 : value.size, metadata,
      ...(rawMeta128Hex ? {rawMeta128Hex} : {}) }
    if (!directory) { requireThat(digestPattern.test(value.sha256 || ''), 'ZIP_HASH', 'Missing backup SHA-256.'); record.sha256 = value.sha256; byteCount += value.size; ++fileCount } else ++directoryCount
    originals.set(record.sourcePath, record); archivePaths.add(archivePath); records.push(record)
  }
  requireThat(entries.size === records.length + 2 && byteCount <= ZIP_IMPORT_LIMITS.dataBytes && manifest.files === fileCount && manifest.directories === directoryCount && manifest.bytes === byteCount, 'ZIP_MANIFEST', 'Backup totals or archive contents disagree.')
  for (const record of records) {
    const parent = deviceParent(record.sourcePath), archiveParent = parentOf(record.archivePath.replace(/\/$/u, ''))
    if (parent === rootPath) requireThat(archiveParent === 'files', 'ZIP_MANIFEST', 'Invalid root archive mapping.')
    else requireThat(originals.get(parent)?.type === 'directory' && archiveParent === originals.get(parent).archivePath.replace(/\/$/u, ''), 'ZIP_MANIFEST', 'Missing parent or inconsistent backup mapping.')
  }
  const checksums = new Map()
  for (const line of readName(sumsBytes).split(/\r?\n/u).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line)
    requireThat(match && !checksums.has(match[2]), 'ZIP_HASH', 'Invalid or duplicate checksum line.'); checksums.set(match[2], match[1])
  }
  requireThat(checksums.size === fileCount + 1 && checksums.get('manifest.json') === await sha256Bytes(manifestBytes), 'ZIP_HASH', 'Backup manifest checksum does not match.')
  const data = keepFileData ? new Map() : null; let done = 0
  for (const record of records) {
    const contents = await boundedEntry(zip, entries.get(record.archivePath), signal); check(signal)
    if (record.type === 'file') {
      requireThat(checksums.get(record.archivePath) === record.sha256 && await sha256Bytes(contents) === record.sha256, 'ZIP_HASH', 'Backup file checksum does not match.')
      check(signal)
      data?.set(record.sourcePath, contents); ++done
    }
    observe(onProgress, { phase: 'parsing', unit: 'files', path: record.sourcePath, done, total: fileCount })
  }
  check(signal)
  const archiveSha256 = keepFileData ? await sha256Bytes(bytes) : undefined
  // Web Crypto cannot be interrupted. Honour cancellation after it settles,
  // before exposing the archive as verified or retaining its owned file bytes.
  check(signal)
  const archive = freeze({ format: 'allmiibo-folder-backup', version: manifest.version, rootPath, entries: records, fileCount, directoryCount, byteCount,
    ...(keepFileData ? { archiveSha256 } : {}), firmwareVersion: typeof manifest.firmwareVersion === 'string' ? manifest.firmwareVersion.slice(0,128) : '' })
  if (data) archives.set(archive, data)
  return archive
}

// Only a validated in-memory archive can yield owned file bytes.
export function readBackupArchiveFile(archive, sourcePath) {
  requireThat(archives.has(archive) && archives.get(archive).has(sourcePath), 'ZIP_ARCHIVE', 'Validated file entry required.')
  return new Uint8Array(archives.get(archive).get(sourcePath))
}
export const isVerifiedBackupArchive = archive => archives.has(archive)

/** Explicit target-root remap. Original spelling and metadata are never normalized. */
export async function previewZipImport({ archive, rootPath, deviceKey, readDirectory, readFile, assertSession, signal, onProgress }) {
  requireThat(archives.has(archive), 'ZIP_ARCHIVE', 'Load and verify the backup ZIP first.')
  requireThat(archive.version === 1, 'ZIP_METADATA', 'Use the migration assistant for exact raw-metadata schema2 restores.')
  requireThat(typeof deviceKey === 'string' && deviceKey && typeof assertSession === 'function' && typeof readDirectory === 'function' && typeof readFile === 'function', 'ZIP_API', 'A live session and bounded file readers are required.')
  const root = legacyPath(rootOf(rootPath)), identities = new Set(), targets = archive.entries.map(record => {
    const targetPath = legacyPath(sourcePrefix(root) + record.relativePath), key = pathKey(targetPath)
    requireThat(!identities.has(key), 'ZIP_COLLISION', 'Backup target names collide by case or Unicode normalization.'); identities.add(key)
    return { ...record, targetPath }
  }).sort((a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length || a.targetPath.localeCompare(b.targetPath))
  const listings = new Map(), folders = new Map([[root, { available: true }]]), records = []
  const checkpoint = () => check(signal, assertSession)
  async function list(path) { checkpoint(); if (!listings.has(path)) { const entries = checkedDirectory(await readDirectory(path)); checkpoint(); listings.set(path, entries) } return listings.get(path) }
  // Check original identities as well as remapped paths: moving a journal into
  // a subfolder does not make it user data, and remapping can create a reserved
  // target from a formerly ordinary nested name. One unresolved transaction
  // blocks the entire restore, including otherwise unrelated selected files.
  const archivePending = targets.some(record => transactionKind(record.sourcePath, record.type) === 'pending' || transactionKind(record.targetPath, record.type) === 'pending')
  const driveRoot = root.slice(0, 3)
  const transactionPending = archivePending || pendingTransactions(await list(driveRoot), driveRoot)
  const rootWritable = !transactionPending && await writableDirectoryPath(root, list, checkpoint)
  folders.set(root, { available: rootWritable, blocked: !rootWritable })
  if (rootWritable) await list(root)
  for (const record of targets) {
    checkpoint(); const parent = deviceParent(record.targetPath), parentState = folders.get(parent), name = nameOf(record.targetPath)
    const entry = { ...record, status: 'add', expected: null }
    const internalJournal = transactionKind(record.sourcePath, record.type) === 'inactive' || transactionKind(record.targetPath, record.type) === 'inactive'
    if (transactionPending) { entry.status = 'blocked'; entry.reason = 'TRANSACTION_PENDING' }
    else if (internalJournal) { entry.status = 'blocked'; entry.reason = 'INTERNAL_TRANSACTION_JOURNAL' }
    else if (!parentState || parentState.blocked) { entry.status = 'blocked'; entry.reason = 'PARENT_BLOCKED' }
    else if (parentState.available) {
      const aliases = (await list(parent)).filter(item => portableNameKey(item.name) === portableNameKey(name)), existing = aliases[0]
      if (aliases.length > 1 || existing && existing.name !== name) { entry.status = 'blocked'; entry.reason = 'NAME_COLLISION' }
      else if (existing) {
        if (existing.type !== (record.type === 'directory' ? 1 : 0)) { entry.status = 'blocked'; entry.reason = 'TYPE_CONFLICT' }
        else try {
          const metadata = metadataOf(existing.meta)
          if (record.type === 'file') {
            if (existing.size > UPLOAD_LIMITS.maxExistingBytes) { entry.status = 'blocked'; entry.reason = 'EXISTING_SIZE_LIMIT' }
            else {
              const bytes = asBytes(await readFile(record.targetPath, { maxBytes: existing.size })); checkpoint()
              requireThat(bytes.length === existing.size, 'ZIP_CHANGED', 'A destination changed while being read.')
              entry.expected = { size: existing.size, sha256: await sha256Bytes(bytes), metadata }; checkpoint()
              entry.status = existing.size === record.size && entry.expected.sha256 === record.sha256 && metadataKey(metadata) === metadataKey(record.metadata) ? 'same' : 'change'
            }
          } else { entry.expected = { type: 1, metadata }; entry.status = metadataKey(metadata) === metadataKey(record.metadata) ? 'same' : 'change' }
          if (metadata.flags.readonly && entry.status !== 'same') { entry.status = 'blocked'; entry.reason = 'READONLY' }
        } catch (error) {
          if (!['UPLOAD_METADATA', 'ZIP_METADATA'].includes(error.code)) throw error
          entry.status = 'blocked'; entry.reason = 'INVALID_METADATA'
        }
      }
    }
    if (!transactionPending && !internalJournal && record.type === 'file' && record.size > UPLOAD_LIMITS.maxFileBytes) { entry.status = 'blocked'; entry.reason = 'UPLOAD_SIZE_LIMIT' }
    if (record.type === 'directory') folders.set(record.targetPath, { available: !!entry.expected, blocked: entry.status === 'blocked' || entry.expected?.metadata.flags.readonly === true })
    records.push(entry); observe(onProgress, { phase: 'checking', unit: 'entries', path: record.targetPath, done: records.length, total: targets.length })
  }
  checkpoint()
  const summary = { add: 0, change: 0, same: 0, blocked: 0 }; records.forEach(record => ++summary[record.status])
  const plan = freeze({ rootPath: root, sourceRoot: archive.rootPath, deviceKey, entries: records, summary })
  plans.set(plan, archive)
  return plan
}
const expectedKey = expected => expected ? JSON.stringify([expected.type || 0, expected.size ?? null, expected.sha256 ?? null, metadataKey(expected.metadata)]) : 'absent'

/** Only explicitly selected additions/changes; full fresh preview precedes writes. */
export async function executeZipImport({ plan, deviceKey, selectedPaths = [], readDirectory, readFile, createDirectory, writeFile,
  rename, remove, updateMetadata, getFreeBytes, assertSession, signal, onProgress, randomToken }) {
  requireThat(plans.has(plan) && deviceKey === plan.deviceKey && !activePlans.has(plan), 'ZIP_STALE', 'The ZIP plan or device identity is no longer current.')
  requireThat(Array.isArray(selectedPaths) && selectedPaths.every(path => typeof path === 'string') && new Set(selectedPaths).size === selectedPaths.length, 'ZIP_SELECTION', 'Invalid ZIP import selection.')
  const wanted = new Set(selectedPaths), selected = plan.entries.filter(entry => wanted.has(entry.targetPath))
  requireThat(selected.length === wanted.size && selected.every(entry => ['add', 'change'].includes(entry.status)), 'ZIP_SELECTION', 'Select only planned additions or changes.')
  const selectedFiles = selected.filter(entry => entry.type === 'file')
  const checkpoint = () => check(signal, assertSession), archive = plans.get(plan)
  checkpoint(); if (!selected.length) return { completed: 0, filesCompleted: 0, directoriesCompleted: 0, recoveryFiles: [] }
  for (const fn of [createDirectory, writeFile, rename, remove, updateMetadata, getFreeBytes, assertSession]) requireThat(typeof fn === 'function', 'ZIP_API', 'Complete checked transfer adapters are required.')
  activePlans.add(plan)
  const completedPaths = [], createdFolders = [], attemptedFolders = [], recoveryFiles = [], directorySnapshots = new Map()
  async function directorySnapshot(path) {
    checkpoint(); const entries = checkedDirectory(await readDirectory(deviceParent(path))); checkpoint()
    const aliases = entries.filter(item => portableNameKey(item.name) === portableNameKey(nameOf(path)))
    requireThat(aliases.length === 1 && aliases[0].name === nameOf(path) && aliases[0].type === 1, 'ZIP_STALE', 'A destination folder changed.')
    let meta
    try { meta = copyMetadata(aliases[0].meta) } catch { fail('ZIP_STALE', 'A destination folder has invalid metadata.') }
    requireThat(!meta.flags.readonly, 'ZIP_STALE', 'The destination folder is no longer writable.')
    return metadataKey(meta)
  }
  try {
    const fresh = await previewZipImport({ archive, rootPath: plan.rootPath, deviceKey, readDirectory, readFile, assertSession, signal, onProgress })
    const current = new Map(fresh.entries.map(entry => [entry.targetPath, entry]))
    const requiredDirs = plan.entries.filter(entry => entry.type === 'directory' && (wanted.has(entry.targetPath) || selected.some(item => item.targetPath.startsWith(entry.targetPath + '/'))))
    for (const entry of [...selected, ...requiredDirs]) {
      const now = current.get(entry.targetPath)
      requireThat(now && now.status !== 'blocked' && expectedKey(now.expected) === expectedKey(entry.expected), 'ZIP_STALE', 'A destination changed after the ZIP preview; preview again.')
    }
    // Hash comparisons can take time. Re-read the transaction namespace after
    // that work, before the first mutating adapter (including mkdir) can run.
    checkpoint(); const driveRoot = plan.rootPath.slice(0, 3)
    const rootEntries = checkedDirectory(await readDirectory(driveRoot)); checkpoint()
    requireThat(!pendingTransactions(rootEntries, driveRoot), 'ZIP_STALE', 'A destination transaction appeared after the ZIP preview; resolve it before restoring.')
    for (const entry of requiredDirs) {
      checkpoint()
      requireThat(await writableDirectoryPath(deviceParent(entry.targetPath), readDirectory, checkpoint), 'ZIP_STALE', 'The destination folder or an ancestor is no longer writable.')
      const listing = checkedDirectory(await readDirectory(deviceParent(entry.targetPath))); checkpoint()
      const aliases = listing.filter(item => portableNameKey(item.name) === portableNameKey(nameOf(entry.targetPath)))
      if (entry.expected) {
        requireThat(aliases.length === 1 && aliases[0].name === nameOf(entry.targetPath) && aliases[0].type === 1 && metadataKey(aliases[0].meta) === metadataKey(entry.expected.metadata), 'ZIP_STALE', 'A destination folder changed.')
        directorySnapshots.set(entry.targetPath, metadataKey(entry.expected.metadata))
      }
      else {
        requireThat(aliases.length === 0, 'ZIP_STALE', 'A destination folder appeared after preview.')
        // A rejected adapter can mean the folder was created but its ACK was
        // lost. Preserve that uncertainty; do not issue speculative removal.
        const attempt = { path: entry.targetPath, state: 'possible' }
        attemptedFolders.push(attempt)
        await createDirectory(entry.targetPath)
        attempt.state = 'created'; createdFolders.push(entry.targetPath); checkpoint()
        // Capture the actual defaults of our newly created folder. Children can
        // change its contents, but must not silently replace later user metadata.
        directorySnapshots.set(entry.targetPath, await directorySnapshot(entry.targetPath))
      }
    }
    for (const entry of selectedFiles) {
      checkpoint()
      const bytes = archives.get(archive).get(entry.sourcePath)
      const result = await safeUpload({ path: entry.targetPath, file: bytes, replace: !!entry.expected, expected: entry.expected,
        metadata: entry.metadata, allowLegacyNames: true, readDirectory, readFile, writeFile, rename, remove, updateMetadata,
        getFreeBytes: () => getFreeBytes(entry.targetPath), assertSession, signal, randomToken,
        onProgress: progress => observe(onProgress, { ...progress, unit: 'bytes',
          filesDone: completedPaths.length + (progress.phase === 'complete' ? 1 : 0), filesTotal: selectedFiles.length }) })
      recoveryFiles.push(...result.recoveryFiles); completedPaths.push(entry.targetPath); checkpoint()
    }
    // Delay readonly/hidden directory attributes until all selected children exist.
    const changedDirs = requiredDirs.filter(entry => createdFolders.includes(entry.targetPath) || wanted.has(entry.targetPath)).reverse()
    for (const entry of changedDirs) {
      requireThat(await writableDirectoryPath(deviceParent(entry.targetPath), readDirectory, checkpoint), 'ZIP_STALE', 'The destination folder or an ancestor is no longer writable.')
      requireThat(await directorySnapshot(entry.targetPath) === directorySnapshots.get(entry.targetPath), 'ZIP_STALE', 'A destination folder changed during the import; preview again.')
      checkpoint(); await updateMetadata(entry.targetPath, copyMetadata(entry.metadata)); checkpoint()
      const actual = checkedDirectory(await readDirectory(deviceParent(entry.targetPath))).find(item => item.name === nameOf(entry.targetPath)); checkpoint()
      requireThat(actual?.type === 1 && metadataKey(actual.meta) === metadataKey(entry.metadata), 'ZIP_METADATA', 'Imported directory metadata was not confirmed.')
      completedPaths.push(entry.targetPath)
    }
    return { completed: completedPaths.length, filesCompleted: selectedFiles.length, directoriesCompleted: changedDirs.length, completedPaths, recoveryFiles }
  } catch (error) {
    error.importProgress = { completedPaths: completedPaths.slice(), createdFolders: createdFolders.slice(),
      attemptedFolders: attemptedFolders.map(attempt => ({ ...attempt })),
      recoveryFiles: [...recoveryFiles, ...(error.recoveryFiles || [])] }
    throw error
  } finally { activePlans.delete(plan) }
}
