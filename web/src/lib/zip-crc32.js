// ZIP's CRC-32/ISO-HDLC. Shared by export and streaming import; caller owns
// scheduling/cancellation. Accepts a running, unfinalized CRC and byte view.
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; ++bit) value = (value >>> 1) ^ (0xedb88320 & -(value & 1))
  return value >>> 0
})

export function updateZipCrc32(crc, bytes) {
  for (let i = 0; i < bytes.length; ++i) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 255]
  return crc >>> 0
}
