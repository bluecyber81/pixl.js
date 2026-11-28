import {assertWritableDevicePath, assertPortableEntryName, joinDevicePath, portableNameKey, splitDevicePath} from './portable-names.js'

const encoder = new TextEncoder()
const maxMembers = 4
const maxBytes = 572
const maxBody = 2585
const privateFolder = /^~u[a-f0-9]{8,12}$/u

// The digest covers the command's names, sizes and bytes together. PackedFS
// creates all siblings in one transaction, with 128 neutral metadata bytes each.
export async function groupCreateFrames(parent, entries, revision, id, limit, guarded = false) {
  if (!Number.isInteger(id) || id < 1 || id > 0xffffffff || !/^[a-f0-9]{16}$/u.test(revision) ||
      revision === '0000000000000000' || !Number.isInteger(limit) || limit < 16 || limit > 243 ||
      !Array.isArray(entries) || !entries.length || entries.length > maxMembers ||
      !parent.startsWith('E:/') || (guarded ? !/^[\x20-\x7e]+$/u.test(parent) : !parent.split('/').some(name => privateFolder.test(name)))) {
    throw new Error('Invalid grouped create request.')
  }
  const prefix = encoder.encode(assertWritableDevicePath(parent).slice(2))
  const names = new Set()
  const parts = [Uint8Array.of(entries.length, prefix.length), prefix]
  for (const {name, bytes} of entries) {
    if (guarded && !/^[\x20-\x7e]+$/u.test(name)) throw new Error('Invalid guarded name.')
    if (guarded) assertPortableEntryName(name)
    const path = joinDevicePath(parent,name), key = portableNameKey(name)
    if (splitDevicePath(path).parent !== parent || names.has(key) || !(bytes instanceof Uint8Array) || bytes.length > maxBytes) {
      throw new Error('Invalid grouped file.')
    }
    names.add(key)
    const encoded = encoder.encode(name)
    parts.push(Uint8Array.of(encoded.length, bytes.length & 255, bytes.length >>> 8), encoded, bytes)
  }
  const size = parts.reduce((sum, part) => sum + part.length, 0), body = new Uint8Array(size + 32)
  if (body.length > maxBody) throw new Error('Grouped create body exceeds capacity.')
  let offset = 0
  for (const part of parts) { body.set(part, offset); offset += part.length }
  body.set(new Uint8Array(await crypto.subtle.digest('SHA-256', body.subarray(0, size))), size)
  function frame(kind, length) {
    const wire = new Uint8Array(length)
    wire[0] = kind
    new DataView(wire.buffer).setUint32(1, id, true)
    return wire
  }
  const begin = frame(0, 15), view = new DataView(begin.buffer)
  view.setUint32(5, parseInt(revision.slice(8),16), true)
  view.setUint32(9, parseInt(revision.slice(0,8),16), true)
  view.setUint16(13, body.length, true)
  const frames = [begin]
  for (let start=0; start<body.length; start+=limit-7) {
    const chunk = body.subarray(start,start+limit-7)
    const data = frame(1,7+chunk.length)
    new DataView(data.buffer).setUint16(5,start,true)
    data.set(chunk,7)
    frames.push(data)
  }
  frames.push(frame(2,5))
  return frames
}
