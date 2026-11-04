// A structural Nordic INIT fixture. Its zero signature is never used on a device.
module.exports = function initPacket(size, type = 0, binary = size === 2 ? [2,3] : [4,5,6,7]) {
  function number(n) {
    const out = [];
    while (n >= 128) { out.push(n % 128 + 128); n = Math.floor(n / 128); }
    return [...out, n];
  }
  const value = (id, n) => [id * 8, ...number(n)];
  const block = (id, bytes) => [id * 8 + 2, ...number(bytes.length), ...bytes];
  const hash = require('node:crypto').createHash('sha256').update(Buffer.from(binary)).digest().reverse();
  const init = [...value(1, 630), ...value(2, 52), ...block(3, [...number(259), ...number(294)]), ...value(4, type), ...value(7, size), ...block(8,[...value(1,3), ...block(2,hash)])];
  const command = [...value(1, 1), ...block(2, init)];
  return Uint8Array.from(block(2, [...block(1, command), ...value(2, 0), ...block(3, Array(64).fill(0))]));
};
