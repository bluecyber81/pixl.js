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
