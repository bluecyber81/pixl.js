import { quoteCsvCell } from './csv-export.js'
import { metadataKey } from './safe-upload.js'
import { loadBackupIndex } from './zip-import.js'

function metadataDifference(first, second) {
  if (first.rawMeta128Hex && second.rawMeta128Hex) return first.rawMeta128Hex !== second.rawMeta128Hex
  if (!first.metadata.valid || !second.metadata.valid) return null
  return metadataKey(first.metadata) !== metadataKey(second.metadata)
}

function statusOf(first, second) {
  if (!first) return 'added'
  if (!second) return 'removed'
  if (first.type !== second.type) return 'type'
  if (first.type === 'file' && (first.size !== second.size || first.sha256 !== second.sha256)) return 'content'
  const different = metadataDifference(first, second)
  if (different === null) return 'unresolved'
  return different ? 'metadata' : 'same'
}

export async function compareBackupFiles(firstFile, secondFile, { JSZip, signal, onProgress } = {}) {
  const read = (file, side) => {
    onProgress?.({ side, done: 0, total: null })
    return loadBackupIndex(file, {
      JSZip, signal,
      onProgress: ({ done, total }) => onProgress?.({ side, done, total })
    })
  }
  const first = await read(firstFile, 'A')
  const second = await read(secondFile, 'B')
  const byPath = index => new Map(index.entries.map(record => [record.relativePath, record]))
  const a = byPath(first), b = byPath(second)
  const counts = { added: 0, removed: 0, content: 0, metadata: 0, type: 0, unresolved: 0, same: 0 }
  // The original path is the identity. ZIP-safe aliases, case and Unicode normalisation can differ.
  const rows = [...new Set([...a.keys(), ...b.keys()])].sort().map(path => {
    const before = a.get(path), after = b.get(path)
    const status = statusOf(before, after)
    counts[status]++
    return { path, status, type: (after ?? before).type }
  })
  return { rows, counts, roots: [first.rootPath, second.rootPath], exactMetadata: first.version === 2 && second.version === 2 }
}

// Filters affect this view/export only; original relative paths remain identities.
export const backupComparisonStatuses = Object.freeze(['added', 'removed', 'content', 'metadata', 'type', 'unresolved', 'same'])
function viewOptions({ status = 'all', path = '', showSame = false } = {}) {
  if (!['all', ...backupComparisonStatuses].includes(status) || typeof path !== 'string' || path.length > 256 || typeof showSame !== 'boolean') {
    throw new Error('Invalid backup comparison filter')
  }
  return { status, path: path.trim(), showSame }
}
export function filterBackupComparison(comparison, options) {
  const { status, path, showSame } = viewOptions(options)
  const query = path.toLocaleLowerCase('en-US')
  return (comparison?.rows || []).filter(row =>
    (status === 'all' ? showSame || row.status !== 'same' : row.status === status) &&
    (!query || row.path.toLocaleLowerCase('en-US').includes(query)))
}
export function backupComparisonReport(comparison, options) {
  if (!comparison || !Array.isArray(comparison.rows) || !Array.isArray(comparison.roots) || comparison.roots.length !== 2) {
    throw new Error('No completed backup comparison')
  }
  const filters = viewOptions(options), rows = filterBackupComparison(comparison, filters)
  const counts = Object.fromEntries(backupComparisonStatuses.map(status => [status, rows.filter(row => row.status === status).length]))
  return { format: 'allmiibo-backup-comparison', version: 1, roots: [...comparison.roots],
    exactMetadata: comparison.exactMetadata === true, filters, totalEntries: comparison.rows.length,
    exportedEntries: rows.length, totalCounts: Object.fromEntries(backupComparisonStatuses.map(status => [status, comparison.counts[status]])),
    counts, rows: rows.map(({ path, status, type }) => ({ path, status, type })) }
}
export function backupComparisonCsv(comparison, options, locale = 'en') {
  const report = backupComparisonReport(comparison, options), de = locale.startsWith('de'), delimiter = de ? ';' : ','
  const header = de ? ['Relativer Originalpfad', 'Art', 'Status', 'Sicherungsordner A', 'Sicherungsordner B']
    : ['Original relative path', 'Type', 'Status', 'Backup folder A', 'Backup folder B']
  // Stable status codes match the JSON report; the UI explains them in DE/EN.
  const lines = [header, ...report.rows.map(row => [row.path, row.type, row.status, ...report.roots])]
  return '\uFEFF' + lines.map(row => row.map(quoteCsvCell).join(delimiter)).join('\r\n') + '\r\n'
}
