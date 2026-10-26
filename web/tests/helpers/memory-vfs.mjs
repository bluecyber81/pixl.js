export const metadata = (raw = 0, notes = '') => ({ valid: true, notes, flags: { raw, hide: !!(raw & 1), readonly: !!(raw & 4) }, amiibo: { head: 0x12345678, tail: 0x87654321 } })
export const localFile = (name, bytes = [7, 8, 9], relativePath = '') => new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' })
export function memoryVfs() {
  const nodes = new Map([['E:/', { type: 1, meta: metadata() }], ['E:/tags', { type: 1, meta: metadata() }]])
  const log = [], counters = new Map()
  let active = true, hook = async () => {}, freeBytes = 1024 * 1024
  const clone = value => structuredClone(value)
  async function event(when, op, args, value) {
    if (when === 'before') { log.push({ op, args }); counters.set(op, (counters.get(op) || 0) + 1) }
    return hook({ when, op, args, value, count: counters.get(op), nodes, log })
  }
  async function operation(op, args, action) {
    await event('before', op, args)
    const value = action()
    await event('after', op, args, value)
    return value
  }
  const api = {
    readDirectory: path => operation('list', [path], () => {
      if (nodes.get(path)?.type !== 1) throw new Error('No such folder: ' + path)
      const prefix = path.endsWith('/') ? path : path + '/'
      return [...nodes.entries()].filter(([key]) => key.startsWith(prefix) && key.length > prefix.length && !key.slice(prefix.length).includes('/'))
        .map(([key, node]) => ({ name: key.slice(prefix.length), type: node.type, size: node.bytes?.length || 0, meta: clone(node.meta) }))
    }),
    readFile: (path, options = {}) => operation('read', [path, options], () => {
      const node = nodes.get(path)
      if (node?.type !== 0) throw new Error('Not a file: ' + path)
      if (node.bytes.length > options.maxBytes) throw new Error('Read limit')
      options.onProgress?.({ received_bytes: node.bytes.length })
      return node.bytes.slice()
    }),
    writeFile: (path, bytes, options = {}) => operation('write', [path, bytes], () => {
      nodes.set(path, { type: 0, bytes: bytes.slice(), meta: metadata(0, '') })
      options.onProgress?.({ written_bytes: bytes.length, total_bytes: bytes.length })
    }),
    rename: (from, to) => operation('rename', [from, to], () => {
      if (!nodes.has(from) || nodes.has(to)) throw new Error('Rename collision or missing source')
      nodes.set(to, nodes.get(from)); nodes.delete(from)
    }),
    remove: path => operation('remove', [path], () => {
      if (nodes.get(path)?.type !== 0) throw new Error('Only files are removed in this fixture')
      nodes.delete(path)
    }),
    updateMetadata: (path, meta) => operation('meta', [path, meta], () => {
      if (!nodes.has(path)) throw new Error('Missing metadata target')
      nodes.get(path).meta = clone(meta)
    }),
    getFreeBytes: () => operation('free', [], () => freeBytes),
    createDirectory: path => operation('mkdir', [path], () => {
      if (nodes.has(path)) throw new Error('Existing folder')
      nodes.set(path, { type: 1, meta: metadata() })
    }),
    assertSession: () => { if (!active) { const error = new Error('Session changed'); error.code = 'SESSION_CHANGED'; throw error } },
    randomToken: () => 'abcdef012345',
  }
  return { api, nodes, log, setHook: value => { hook = value }, disconnect: () => { active = false }, reconnect: () => { active = true }, setFree: value => { freeBytes = value },
    put: (path, bytes, meta = metadata()) => nodes.set(path, { type: 0, bytes: new Uint8Array(bytes), meta }),
    bytes: path => [...(nodes.get(path)?.bytes || [])] }
}
