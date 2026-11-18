// The picker and BLE event listeners stay synchronous. Only a file-protocol
// operation needs the wire codec. Share its load across simultaneous requests.
export let ByteBuffer = null
let pending

export function loadFileCodec() {
  if (!pending) {
    pending = import('bytebuffer').then(module => {
      ByteBuffer = module.default
      ByteBuffer.DEFAULT_ENDIAN = ByteBuffer.LITTLE_ENDIAN
      return ByteBuffer
    }).catch(error => {
      pending = null
      throw error
    })
  }
  return pending
}
