import { assertPortableEntryName, assertWritableDevicePath, portableNameKey } from './portable-names.js'
import { sha256Bytes, UPLOAD_LIMITS } from './safe-upload.js'
import { parseUniqueJson } from './unique-json.js'

export const HISTORY_FILENAME = 'Allmiibo-Ordnervergleich.allmiibo-sync.json'
const FORMAT = 'allmiibo-folder-comparison-v1'
// There may be 4096 listed paths on each side, including unresolved removals.
const MAX_ENTRIES = 8192
const MAX_FILE_BYTES = 2 * 1024 * 1024
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
const prefixOf = root => root.endsWith('/') ? root : root + '/'

function invalid(code = 'SYNC_HISTORY_INVALID') {
  throw Object.assign(new Error('Invalid folder comparison reference.'), { code })
}

export async function folderBinding(deviceKey, rootPath, folderName) {
  if (!deviceKey || typeof folderName !== 'string' || !folderName || folderName.length > 255) invalid()
  const root = rootPath.length > 3 && rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath
  const identity = JSON.stringify([FORMAT, deviceKey, root, folderName])
  return sha256Bytes(new TextEncoder().encode(identity))
}

export async function readSyncHistory(file, deviceKey, rootPath, folderName) {
  if (!Number.isSafeInteger(file?.size) || file.size < 1 || file.size > MAX_FILE_BYTES) invalid()
  let data
  try {
    const bytes = await file.arrayBuffer()
    if (bytes.byteLength !== file.size) invalid()
    data = parseUniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { invalid() }
  if (data?.format !== FORMAT || !digest(data.binding) || !Array.isArray(data.files) || data.files.length > MAX_ENTRIES) invalid()
  if (data.binding !== await folderBinding(deviceKey, rootPath, folderName)) invalid('SYNC_HISTORY_BINDING')
  const files = new Map(), names = new Set()
  for (const row of data.files) {
    if (!Array.isArray(row) || row.length !== 3) invalid()
    const [path, size, hash] = row
    if (typeof path !== 'string' || !Number.isSafeInteger(size) || size < 0 || size > UPLOAD_LIMITS.maxFileBytes || !digest(hash)) invalid()
    try {
      path.split('/').forEach(assertPortableEntryName)
      assertWritableDevicePath(prefixOf(rootPath) + path)
    } catch { invalid() }
    const key = path.split('/').map(portableNameKey).join('/')
    if (names.has(key)) invalid()
    names.add(key)
    files.set(path, { size, sha256: hash })
  }
  return { binding: data.binding, files }
}

export function commonVersion(previous, localHash, deviceHash) {
  if (!previous || localHash === deviceHash) return null
  if (localHash === previous.sha256) return deviceHash === null ? 'deviceDeleted' : 'deviceChanged'
  if (deviceHash === previous.sha256) return localHash === null ? 'localDeleted' : 'localChanged'
  if (localHash === null) return 'localDeletedDeviceChanged'
  if (deviceHash === null) return 'deviceDeletedLocalChanged'
  return 'bothChanged'
}

export function isHistoryConflict(state) {
  return ['bothChanged', 'localDeletedDeviceChanged', 'deviceDeletedLocalChanged', 'noCommonVersion'].includes(state)
}

// Each path is advanced only after equality was observed or its upload was
// confirmed. Unresolved paths keep their last common version across sessions.
export function createSyncHistory(plan, binding, previous, job) {
  if (!digest(binding) || (previous && previous.binding !== binding) || (job && (job.state !== 'complete' ||
      job.deviceKey !== plan.deviceKey || job.planFingerprint !== plan.fingerprint))) invalid()
  const completed = new Set(job?.completed || [])
  const equal = new Set(job?.equalPaths || [])
  const remaining = new Set(plan.deviceOnly.map(row => row.path.slice(prefixOf(plan.rootPath).length)))
  const files = new Map()
  for (const entry of plan.entries) {
    const path = entry.relativePath
    if (completed.has(entry.targetPath) || (job ? equal.has(entry.targetPath) : entry.comparison === 'same')) {
      files.set(path, [path, entry.size, entry.sha256])
    } else remaining.add(path)
  }
  for (const path of remaining) {
    const original = previous?.files.get(path)
    if (original && !files.has(path)) files.set(path, [path, original.size, original.sha256])
  }
  return { format: FORMAT, binding, files: [...files.values()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) }
}
