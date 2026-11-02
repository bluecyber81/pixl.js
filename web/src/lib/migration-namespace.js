import { checkedDirectory } from './safe-upload.js'
import { decodeRawMetadata } from './raw-metadata.js'

const parent = path => path.lastIndexOf('/') === 2 ? 'E:/' : path.slice(0, path.lastIndexOf('/'))
const leaf = path => path.slice(path.lastIndexOf('/') + 1)
const copy = value => structuredClone(value)
const stale = () => Object.assign(new Error('The migration namespace changed or became uncertain; start a fresh resume.'), { code: 'MIGRATION_INDEX_STALE' })

/** Ephemeral namespace for ONE serialized, bound pending Packed import only.
 * It replaces repetitive listings, never content/raw reads or the final scan.
 * Any error permanently disables it and blocks further mutations. Recovery
 * inspection may still use the original, live readDirectory adapter. */
export function migrationNamespace(o, listings, binding) {
  if (!o.deviceKey || binding?.deviceKey !== o.deviceKey || binding?.backend !== 3 ||
      binding?.pending !== true || binding?.mounted !== true || binding?.bound !== true ||
      !/^[a-f0-9]{64}$/u.test(binding.archiveSha256 || '')) throw stale()
  const directories = new Map([...listings].map(([path, entries]) =>
    [path, new Map(checkedDirectory(copy(entries)).map(entry => [entry.name, entry]))]))
  let dirty = false, cachedListings = 0, liveListings = 0, disposed = false
  const invalidate = () => { dirty = true; directories.clear() }
  function current() {
    try { o.assertSession() } catch (error) { invalidate(); throw error }
    // safeUpload deliberately completes a started rename/commit after Abort.
    // It and the outer migration own cancellation boundaries; invalidating here
    // would strand target->backup before stage->target. Session/I/O errors still
    // invalidate immediately. The outer finally disposes this call's index.
  }
  function healthy() { current(); if (dirty || disposed) throw stale() }
  const node = path => directories.get(parent(path))?.get(leaf(path))
  function add(path, entry) {
    const entries = directories.get(parent(path))
    if (!entries || entries.has(leaf(path))) throw stale()
    entries.set(leaf(path), { ...copy(entry), name: leaf(path) })
  }
  async function read(method, ...args) {
    current()
    try { const result = await o[method](...args); current(); return result }
    catch (error) { invalidate(); throw error }
  }
  async function mutate(method, args, update) {
    healthy()
    try {
      const result = await o[method](...args)
      healthy()
      await update?.()
      healthy()
      return result
    } catch (error) { invalidate(); throw error }
  }
  async function raw(path) {
    const value = await read('readRawMetadata', path)
    if (!dirty) { const entry = node(path); if (entry) entry.meta = decodeRawMetadata(value) }
    return value
  }
  const adapters = {
    ...o,
    readDirectory: async path => {
      current()
      if (!dirty && !disposed && directories.has(path)) {
        ++cachedListings
        return copy([...directories.get(path).values()])
      }
      ++liveListings
      return read('readDirectory', path)
    },
    readFile: (...args) => read('readFile', ...args),
    getFreeBytes: (...args) => read('getFreeBytes', ...args),
    readRawMetadata: raw,
    createDirectory: path => {
      healthy(); if (node(path) || !directories.has(parent(path))) throw stale()
      return mutate('createDirectory', [path], () => {
        add(path, { type: 1, size: 0, meta: decodeRawMetadata(new Uint8Array(128).fill(255)) })
        directories.set(path, new Map())
      })
    },
    writeFile: (path, bytes, options) => {
      healthy(); const existing=node(path)
      const replace=options?.atomicReplace===true&&options?.rawMeta128 instanceof Uint8Array&&options.rawMeta128.length===128&&
        o.storageInfo?.backend===3&&o.storageInfo?.flags===15&&existing?.type===0
      if ((existing&&!replace) || !directories.has(parent(path))) throw stale()
      return mutate('writeFile', [path, bytes, options], () => {
        if(replace)directories.get(parent(path)).delete(leaf(path))
        add(path, { type: 0, size: bytes.byteLength, meta: options?.rawMeta128 ? {valid:false} : decodeRawMetadata(new Uint8Array(128).fill(255)) })
      })
    },
    updateMetadata: (path, value) => {
      healthy(); if (!node(path)) throw stale()
      // This migration now deliberately verifies only at the final full pass.
      // Do not present expected/acknowledged metadata as confirmed device data.
      return mutate('updateMetadata', [path, value], () => { node(path).meta = { valid: false } })
    },
    updateRawMetadata: (path, bytes) => {
      healthy(); if (!node(path)) throw stale()
      return mutate('updateRawMetadata', [path, bytes], () => { node(path).meta = { valid: false } })
    },
    rename: (from, to) => {
      healthy(); const entry = node(from)
      if (!entry || entry.type !== 0 || node(to) || !directories.has(parent(to))) throw stale()
      return mutate('rename', [from, to], () => {
        directories.get(parent(from)).delete(leaf(from)); add(to, entry)
      })
    },
    remove: path => {
      healthy(); if (node(path)?.type !== 0) throw stale()
      return mutate('remove', [path], () => directories.get(parent(path)).delete(leaf(path)))
    }
  }
  return { adapters, assertHealthy: healthy,
    stats: () => ({ cachedListings, liveListings, invalidated: dirty }),
    dispose: () => { disposed = true; directories.clear() } }
}
