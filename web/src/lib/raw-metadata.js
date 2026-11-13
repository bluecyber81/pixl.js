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
function parseMetadata(bytes, fields) {
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
        if (fields) {
          if (fields.flags !== undefined) return empty(false)
          fields.flags = p
        }
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

export function decodeRawMetadata(value) {
  return parseMetadata(rawMetadataBytes(value))
}

// Preserve the field order, opaque padding and bits outside HIDE and READONLY.
// If there is no FLAGS field, use the first two unused bytes when available.
export function editMetadataFlags(value, expected, flags) {
  const bytes = rawMetadataBytes(value), fields = {}
  const old = parseMetadata(bytes, fields)
  if (!old.valid || old.notes !== (expected.notes || '') ||
      old.amiibo.head !== (expected.amiibo.head || 0) || old.amiibo.tail !== (expected.amiibo.tail || 0) ||
      old.flags.hide !== !!expected.flags.hide || old.flags.readonly !== !!expected.flags.readonly) return null
  const raw = (old.flags.raw & ~5) | (flags.hide ? 1 : 0) | (flags.readonly ? 4 : 0)
  if (fields.flags !== undefined) bytes[fields.flags] = raw
  else if (raw) {
    const size = bytes[0] === 255 ? 0 : bytes[0]
    if (size + 2 >= bytes.length) return null
    bytes[size + 1] = 2
    bytes[size + 2] = raw
    bytes[0] = size + 2
  }
  return { bytes, raw }
}
