import { auditCollection } from './collection-audit.js'
import { loadBackupZip, readBackupArchiveFile } from './zip-import.js'
import { splitDevicePath } from './portable-names.js'

function belongsTo(path, folder) {
  return path === folder || path.startsWith(folder.endsWith('/') ? folder : folder + '/')
}

// These are device namespaces, scoped to their original drive paths. A figure
// folder with the same name below a user directory must still be inspected.
const systemFolders = ['E:/amiibolink', 'E:/chameleon', 'E:/player']
const keySizes = new Map([['key_retail.bin', 160], ['locked-secret.bin', 80], ['unfixed-info.bin', 80]])

export async function inspectCollectionBackup(file, { scope, catalogue, signal, onProgress, JSZip } = {}) {
  const archive = await loadBackupZip(file, { signal, onProgress, JSZip })
  const slots = 'E:/amiibolink'
  const root = archive.rootPath
  const folders = new Map([[root, []]])
  for (const entry of archive.entries) {
    if (entry.type === 'directory') folders.set(entry.sourcePath, [])
  }
  // Subfolder exports use their actual root. For a full backup, prefer the
  // curated collection and offer the other figure folders and slots separately.
  const choices = [root]
  if (root === 'E:/') {
    if (folders.has('E:/Sortiert')) choices.unshift('E:/Sortiert')
    if (folders.has(slots)) choices.push(slots)
  }
  const rootPath = scope ?? choices[0]
  if (!choices.includes(rootPath)) throw new TypeError('Unknown backup scope')
  const checkingSlots = belongsTo(rootPath, slots)
  for (const entry of archive.entries) {
    const path = entry.sourcePath
    if (!belongsTo(path, rootPath)) continue
    if (systemFolders.some(folder => belongsTo(path, folder) && !(checkingSlots && folder === slots))) continue
    const { parent, name } = splitDevicePath(path)
    if (entry.type === 'file' && keySizes.get(name) === entry.size || path === 'E:/key_retail.bin' ||
        path === 'E:/settings.bin' || path.startsWith('E:/.pixl_txn')) continue
    folders.get(parent).push({ name, type: entry.type === 'directory' ? 1 : 0, size: entry.size, meta: entry.metadata })
  }
  const report = await auditCollection({
    rootPath, catalogue, mode: 'full', signal, onProgress,
    assertSession() {}, // The validated archive is immutable for this scan.
    readDirectory: path => folders.get(path),
    readFile: path => readBackupArchiveFile(archive, path),
  })
  return { rootPath, choices, report, checkingSlots }
}
