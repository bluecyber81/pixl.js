// Exact VFS attributes. Unknown fields remain opaque and are never rewritten.
export const RAW_METADATA_BYTES = 128
export function rawMetadataHex(value) {
  if (typeof value === 'string' && /^[a-f0-9]{256}$/u.test(value)) return value
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null
  if (!bytes || bytes.length !== RAW_METADATA_BYTES) throw new Error('Exactly 128 raw metadata bytes are required.')
  return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')
}
export function rawMetadataBytes(value) {
  const hex = rawMetadataHex(value)
  return Uint8Array.from(hex.match(/../gu), n => parseInt(n, 16))
}
export function decodeRawMetadata(value) {
  const bytes = rawMetadataBytes(value)
  const empty = valid => ({valid, notes:'', flags:{raw:0,hide:false,readonly:false},amiibo:{head:0,tail:0}})
  const result = empty(true), size = bytes[0]
  if (!size || size === 255) return result
  if (size >= 128) return empty(false)
  let p = 1
  try {
    while (p <= size) {
      const type = bytes[p++]
      if (type === 1) {
        if (p > size) throw Error()
        const length = bytes[p++]
        if (p + length > size + 1) throw Error()
        result.notes = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(bytes.subarray(p,p+length)); p += length
      } else if (type === 2) {
        if (p > size) throw Error()
        const raw = bytes[p++]; result.flags = {raw, hide:!!(raw&1), readonly:!!(raw&4)}
      } else if (type === 3) {
        if (p + 8 > size + 1) throw Error()
        const view = new DataView(bytes.buffer,bytes.byteOffset+p,8)
        result.amiibo = {head:view.getUint32(0,true),tail:view.getUint32(4,true)}; p += 8
      } else throw Error()
    }
    return result
  } catch { return empty(false) }
}
