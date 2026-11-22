import { auditCollection, COLLECTION_AUDIT_LIMITS } from './collection-audit.js'
import { snapshotFile } from './safe-upload.js'

const excludedNames = new Set(['key_retail.bin', 'locked-secret.bin', 'unfixed-info.bin', 'settings.bin'])
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }

// The same content auditor reads a bounded, flat view of the selected files.
// Synthetic device paths are internal only: local names need not fit device
// path limits. Original paths are restored for display, never used for writes.
export async function inspectLocalCollection(input, { catalogue, signal, onProgress, folderContents = false } = {}) {
  const files = Array.from(input || [])
  if (!files.length || files.length > COLLECTION_AUDIT_LIMITS.entries)
    fail('COLLECTION_LOCAL_LIMIT', 'Choose between 1 and 8192 local files.')
  const candidates = [], pathNames = new Map()
  for (const file of files) {
    if (typeof file?.name !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.arrayBuffer !== 'function')
      fail('COLLECTION_LOCAL_FILE', 'Invalid local file.')
    const original = file.webkitRelativePath || file.name
    const parts = original.split('/')
    if (!/\.bin$/iu.test(file.name) || excludedNames.has(file.name.toLowerCase()) || parts.some(part => part.startsWith('.pixl_txn'))) continue
    const name = String(candidates.length).padStart(5, '0') + '.bin'
    const path = 'E:/' + name
    candidates.push({ file, name, path })
    pathNames.set(path, 'PC:/' + original)
  }
  if (!candidates.length) fail('COLLECTION_LOCAL_EMPTY', 'No figure BIN files in this selection.')
  const byPath = new Map(candidates.map(item => [item.path, item]))
  const report = await auditCollection({
    rootPath: 'E:/', catalogue, mode: 'full', signal, onProgress,
    assertSession() {},
    async readDirectory() { return candidates.map(({ file, name }) => ({ name, type: 0, size: file.size })) },
    async readFile(path, { maxBytes }) { return snapshotFile(byPath.get(path).file, maxBytes) },
  })
  const transferable = new Set(report.files.filter(row => row.status === 'structure-consistent').map(row => row.path))
  const selectedFiles = candidates.filter(item => transferable.has(item.path)).map(item => item.file)
  function display(value) {
    if (typeof value === 'string') return pathNames.get(value) || value
    if (Array.isArray(value)) return Object.freeze(value.map(display))
    if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, display(item)])))
    return value
  }
  const folder = folderContents ? files[0].webkitRelativePath?.split('/')[0] : ''
  return {
    report: display({ ...report, rootPath: folder ? 'PC:/' + folder : 'PC:/',
      claims: { ...report.claims, fileScope: 'Selected local BIN files; settings, keys and transaction files excluded.',
        consistency: 'Contents read from selected browser File objects; not a live directory watcher.' } }),
    files: selectedFiles, folderContents, sourceLabel: folder || '', ignoredFiles: files.length - candidates.length,
  }
}
