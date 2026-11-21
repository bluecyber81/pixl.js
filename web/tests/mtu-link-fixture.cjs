// MTUD v2: firmware GAP event values, not an estimated radio throughput.
module.exports = function mtuLinkPacket() {
  const b = new Uint8Array(32), v = new DataView(b.buffer);
  b.set([77,84,85,68,2,7]);
  [250,250,250,247].forEach((value, i) => v.setUint16(6 + 2 * i, value, true));
  b[14] = 7; b[15] = 0;
  v.setUint16(16, 6, true); v.setUint16(18, 0, true); v.setUint16(20, 400, true);
  b[22] = 2; b[23] = 2; b[24] = 1;
  v.setUint32(28, 0, true);
  return b;
};
