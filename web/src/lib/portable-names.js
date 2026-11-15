// Creation rules are intentionally stricter than addressing existing device names.
const encoder = new TextEncoder()
const forbidden = /[\u0000-\u001f\u007f<>:"/\\|?*]/u
const reserved = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/iu

export class NameError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'NameError'
    this.code = code
    if (details) this.details = details
  }
}
const fail = (code, text) => { throw new NameError(code, text) }

const nameLimit = 47
const pathLimit = 63

export function devicePathSpace(path) {
  return {
    pathRemaining: pathLimit - encoder.encode(path.slice(2)).length,
    nameRemaining: nameLimit - encoder.encode(path.slice(path.lastIndexOf('/') + 1)).length,
  }
}

// Report the tightest targets before a connected preview starts to read the device.
export function backupPathSpace(root, entries) {
  const prefix = root.endsWith('/') ? root : root + '/'
  const tight = []
  for (const entry of entries) {
    const path = prefix + entry.relativePath
    const {pathRemaining, nameRemaining} = devicePathSpace(path)
    const remaining = Math.min(pathRemaining, nameRemaining)
    if (remaining <= 4) tight.push({path, remaining})
  }
  tight.sort((a, b) => a.remaining - b.remaining || a.path.localeCompare(b.path))
  return {count: tight.length, shortest: tight.slice(0, 8)}
}

export function assertNameByteLimit(name) {
  const bytes = encoder.encode(name).length
  const limit = nameLimit
  if (bytes > limit) {
    throw new NameError('NAME_LIMIT', `The name “${name}” uses ${bytes} UTF-8 bytes. The limit is ${limit}.`, { value: name, bytes, limit })
  }
}

export function assertPathByteLimit(path) {
  // The device stores the leading slash, but not the drive label.
  const bytes = encoder.encode(path.slice(2)).length
  const limit = pathLimit
  if (bytes > limit) {
    throw new NameError('PATH_LIMIT', `The path “${path}” uses ${bytes} UTF-8 bytes on the device. The limit is ${limit}.`, { value: path, bytes, limit })
  }
}

export function validUnicode(text) {
  if (typeof text !== 'string') return false
  for (let i = 0; i < text.length; ++i) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

export function assertDeviceEntryName(name) {
  if (!validUnicode(name) || !name || name === '.' || name === '..' || /[\0/]/u.test(name)) {
    fail('NAME_INVALID', 'Invalid device entry name.')
  }
  return name
}

export function assertPortableEntryName(name) {
  assertDeviceEntryName(name)
  // The VFS stores each new component in a 48-byte NUL-terminated buffer.
  // Check before a sync plan can approve it or create its parent directories.
  assertNameByteLimit(name)
  if (forbidden.test(name) || /[. ]$/u.test(name) || reserved.test(name.split('.')[0].trimEnd())) {
    throw new NameError('NAME_PORTABLE', 'The new name is not portable to Windows, macOS and ZIP backups.', { value: name })
  }
  const normalized = name.normalize('NFC')
  if (name !== normalized) throw new NameError('NAME_NORMALIZATION', 'Use the NFC spelling of the new name.', { value: name, normalized })
  return name
}

// Used only to detect aliases, never to rewrite or address an existing object.
export function portableNameKey(name) { return assertDeviceEntryName(name).normalize('NFC').toLowerCase() }

export function assertDevicePath(path) {
  if (!validUnicode(path) || !/^[A-Z]:\//u.test(path)) fail('PATH_INVALID', 'Invalid device path.')
  const tail = path.slice(3)
  if (tail) tail.split('/').forEach(assertDeviceEntryName)
  assertPathByteLimit(path)
  return path
}

// Addressing stays read-capable for backups of internal journals. Only new
// write targets use this check, matching the firmware's case-sensitive root
// prefix. Identically named files inside ordinary folders remain user files.
export function assertWritableDevicePath(path) {
  assertDevicePath(path)
  if (path.slice(2).startsWith('/.pixl_txn')) {
    throw new NameError('PATH_RESERVED', 'This root path is reserved for internal recovery files.', { value: path })
  }
  return path
}

export function joinDevicePath(parent, name) {
  assertDeviceEntryName(name)
  const base = parent.length > 3 && parent.endsWith('/') ? parent.slice(0, -1) : parent
  assertDevicePath(base)
  return assertDevicePath(base + (base.endsWith('/') ? '' : '/') + name)
}

export function splitDevicePath(path) {
  assertDevicePath(path)
  if (path.length === 3) fail('PATH_INVALID', 'A file path is required.')
  const slash = path.lastIndexOf('/')
  return { parent: slash === 2 ? path.slice(0, 3) : path.slice(0, slash), name: path.slice(slash + 1) }
}
