// Opt-in checkpoint for ordinary folder exports. One slot per web origin.
// Web Locks release on navigation/process exit. IndexedDB transactions never span device I/O.
import { BACKUP_LIMITS, BackupError, backupContext } from './backup.js'

const NAME = 'allmiibo-folder-backup'
const SCHEMA = 1
const LOCK = NAME + ':writer'
const missing = () => new BackupError('STORED_BACKUP_CHANGED', 'The checkpoint changed. Refresh its details.')
const corrupt = () => new BackupError('STORED_BACKUP_CORRUPT', 'The stored checkpoint is damaged.')
const unavailable = () => new BackupError('STORED_BACKUP_UNAVAILABLE', 'Browser checkpoint storage is unavailable.')
const sameContext = (a, b) => a?.deviceKey === b.deviceKey && a.rootPath === b.rootPath &&
  a.firmwareVersion === b.firmwareVersion && a.preserveLegacyNames === b.preserveLegacyNames
const countInRange = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max

function dbError(error) {
  if (error instanceof BackupError) return error
  if (error?.name === 'QuotaExceededError') return new BackupError('STORED_BACKUP_QUOTA', 'Browser storage is full.')
  return new BackupError('STORED_BACKUP_IO', 'Browser storage could not finish this operation.')
}
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function openDatabase() {
  try {
    if (!globalThis.indexedDB) throw unavailable()
    // No explicit version: even a newer, incompatible copy can be shown and discarded.
    const req = indexedDB.open(NAME)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('state')
      req.result.createObjectStore('files').createIndex('listing', ['path', 'size', 'identity'])
    }
    const db = await request(req)
    db.onversionchange = () => db.close()
    return db
  } catch (error) { throw dbError(error) }
}
async function transaction(db, mode, work) {
  let tx
  try { tx = db.transaction(['state','files'], mode) } catch (error) { throw dbError(error) }
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onabort = () => reject(tx.error || new Error('Aborted storage transaction.'))
  })
  // A failed operation may precede the transaction's abort event.
  done.catch(() => {})
  try {
    const value = await work(tx.objectStore('state'), tx.objectStore('files'))
    await done
    return value
  } catch (error) {
    try { tx.abort() } catch { /* already completed */ }
    await done.catch(() => {})
    throw dbError(error)
  }
}
function usable(db) {
  if (db.version !== SCHEMA || !db.objectStoreNames.contains('state') || !db.objectStoreNames.contains('files')) return false
  return db.transaction('files').objectStore('files').indexNames.contains('listing')
}
async function header(db) {
  if (!usable(db)) return {invalid:true, id:'schema-' + db.version, revision:0}
  return transaction(db, 'readonly', async (state, files) => {
    const [head, count] = await Promise.all([request(state.get('current')), request(files.count())])
    if (head === undefined && count === 0) return null
    const invalid = {invalid:true, id:typeof head?.id === 'string' ? head.id : 'invalid', revision:Number.isSafeInteger(head?.revision) ? head.revision : 0}
    if (head?.schema !== SCHEMA || typeof head.id !== 'string' || !Number.isSafeInteger(head.revision) ||
        !countInRange(head.files, BACKUP_LIMITS.maxEntries) || count !== head.files ||
        !countInRange(head.bytes, BACKUP_LIMITS.maxBytes) || !['incomplete','exported'].includes(head.status)) return invalid
    try { if (!sameContext(head.context, backupContext(head.context))) return invalid } catch { return invalid }
    return head
  })
}
export async function inspectStoredBackup() {
  if (!globalThis.navigator?.locks?.request) throw unavailable()
  const db = await openDatabase()
  try { return await header(db) } finally { db.close() }
}
async function locked(work) {
  if (!globalThis.navigator?.locks?.request) throw unavailable()
  return navigator.locks.request(LOCK, {ifAvailable:true}, lock => {
    if (!lock) throw new BackupError('STORED_BACKUP_BUSY', 'Another tab is using this checkpoint.')
    return work()
  })
}
function assertExpected(actual, expected) {
  if (!actual || !expected || actual.id !== expected.id || actual.revision !== expected.revision || !!actual.invalid !== !!expected.invalid) throw missing()
}
export async function discardStoredBackup(expected) {
  return locked(async () => {
    const db = await openDatabase()
    try {
      assertExpected(await header(db), expected)
      if (usable(db)) {
        await transaction(db, 'readwrite', (state, files) => Promise.all([request(state.clear()), request(files.clear())]))
      } else {
        db.close()
        await request(indexedDB.deleteDatabase(NAME))
      }
    } finally { db.close() }
  })
}

export async function withStoredBackup(options, expected, work) {
  const context = backupContext(options)
  return locked(async () => {
    const db = await openDatabase()
    try {
      let head = await header(db)
      if (head?.invalid) throw corrupt()
      if (expected == null) {
        if (head) throw missing()
        head = {schema:SCHEMA, id:crypto.randomUUID(), revision:0, context, files:0, bytes:0, status:'incomplete'}
      } else {
        assertExpected(head, expected)
        if (!sameContext(head.context, context)) throw new BackupError('BACKUP_CHECKPOINT_IDENTITY', 'The checkpoint belongs to a different device, folder or firmware profile.')
      }
      async function change(edit, creating = false) {
        head = await transaction(db, 'readwrite', async (state, files) => {
          const existing = await request(state.get('current'))
          if (creating) { if (existing !== undefined) throw missing() } else assertExpected(existing, head)
          const next = {...head, revision:head.revision + 1}
          await edit(next, files)
          await request(state.put(next, 'current'))
          return next
        })
      }
      await change(next => { next.status = 'incomplete' }, expected == null)
      const retainedPaths = new Set()
      const storage = {
        matches: other => sameContext(context, other),
        prune: async current => change((next, files) => new Promise((resolve, reject) => {
          // The index lets us drop renamed/changed records without loading their data.
          let seen = 0, total = 0
          const req = files.index('listing').openKeyCursor()
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            const cursor = req.result
            if (!cursor) { if (seen !== head.files || total !== head.bytes) reject(corrupt()); else resolve(); return }
            const [path, size, identity] = cursor.key
            if (path !== cursor.primaryKey || !countInRange(size, BACKUP_LIMITS.maxFileBytes) || typeof identity !== 'string') { reject(corrupt()); return }
            seen++; total += size
            if (current.get(path) !== identity) {
              files.delete(path)
              next.files--; next.bytes -= size
            } else retainedPaths.add(path)
            cursor.continue()
          }
        })),
        get: (path, identity, size) => !retainedPaths.has(path) ? null : transaction(db, 'readonly', async (state, files) => {
          const row = await request(files.get(path))
          if (!row || row.identity !== identity || row.path !== path || row.size !== size || !(row.bytes instanceof Uint8Array) ||
              row.bytes.length !== size || !/^[a-f0-9]{64}$/u.test(row.sha256)) throw corrupt()
          return row
        }),
        put: (path, entry) => change(async (next, files) => {
          // The fresh listing has removed any entry with different size or metadata.
          if (!retainedPaths.has(path)) { next.files++; next.bytes += entry.bytes.byteLength }
          if (!countInRange(next.files, BACKUP_LIMITS.maxEntries) || !countInRange(next.bytes, BACKUP_LIMITS.maxBytes)) throw corrupt()
          await request(files.put({...entry, path, size:entry.bytes.length}, path))
        }),
      }
      const result = await work(storage)
      if (result?.manifest?.completed) {
        // The verified ZIP already exists. A late storage error must not hide it.
        try { await change(next => { next.status = 'exported' }) }
        catch (error) { return {...result, storedCompletionError:error} }
      }
      return result
    } finally { db.close() }
  })
}
