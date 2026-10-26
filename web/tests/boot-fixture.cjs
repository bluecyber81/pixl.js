// Synthetic schema fixture. A separately generated C wire fixture is checked
// when supplied by the firmware host suite; this file does not claim hardware.
module.exports = function bootPacket() {
  const bytes = new Uint8Array(128), view = new DataView(bytes.buffer);
  bytes.set([80,88,66,68,1,1]); view.setUint16(6,0x1bf,true);
  for (const [offset,value] of [[8,0x52832],[12,0x41414230],[16,524288],[20,65536],[24,4096],
    [28,112],[32,7000000],[40,0x77000],[44,0x77000],[48,0x77000],[52,0x7f000],[56,2],
    [60,578],[64,7],[68,0x12345678],[72,0x12345678],[76,0x7000],
    [112,0x7e000],[116,0x7e000],[120,0x7e000]]) view.setUint32(offset,value,true);
  view.setUint16(36,0x103,true);bytes.set(Array.from({length:32},(_,index)=>index),80);
  return bytes;
};
