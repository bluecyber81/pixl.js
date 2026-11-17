// PXBI is a firmware declaration; it does not hash the running application.
export const LCD_BUILD_DIAGNOSTICS_VERSION = '2.22.0-DE3.84';
const kinds = ['none', 'nordic-sdk', 'hardfault', 'libc-exit'];
function validSourceId(id) {
  return typeof id === 'string' && /^[0-9a-f]{64}$/.test(id);
}
export function normalizeLcdBuildDiagnostics(value) {
  if (value?.schemaVersion !== 1 || value.board !== 'LCD' || !validSourceId(value.sourceId)) return null;
  const fault = value.previousFault;
  if (fault === null) return {schemaVersion:1, board:'LCD', sourceId:value.sourceId, previousFault:null};
  if (!fault || !kinds.slice(1).includes(fault.kind)) return null;
  if (fault.kind === 'nordic-sdk') {
    if (!Number.isInteger(fault.sdkId) || fault.sdkId < 0 || fault.sdkId > 0xffffffff ||
        !(fault.pc === null || (Number.isInteger(fault.pc) && fault.pc > 0 && fault.pc < 0x80000))) return null;
  } else if (fault.pc !== null || fault.sdkId !== null) return null;
  return {schemaVersion:1, board:'LCD', sourceId:value.sourceId,
    previousFault:{kind:fault.kind, sdkId:fault.sdkId, pc:fault.pc}};
}
export function parseLcdBuildDiagnostics(payload) {
  const b = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const invalid = () => Object.assign(new Error('Invalid LCD build/fault reply'), {code:'RESPONSE_INVALID'});
  if (b.byteLength !== 80 || String.fromCharCode(...b.subarray(0,4)) !== 'PXBI' || b[4] !== 1 ||
      b[5] !== 80 || b[6] !== 1 || b[7] >= kinds.length) throw invalid();
  const words = new DataView(b.buffer,b.byteOffset,b.byteLength);
  const sdkId = words.getUint32(72,true), pc = words.getUint32(76,true);
  if (b[7] !== 1 && (sdkId || pc)) throw invalid();
  const result = normalizeLcdBuildDiagnostics({schemaVersion:1, board:'LCD', sourceId:String.fromCharCode(...b.subarray(8,72)),
    previousFault:b[7] === 0 ? null : {kind:kinds[b[7]], sdkId:b[7] === 1 ? sdkId : null, pc:pc || null}});
  if (!result) throw invalid();
  return result;
}
