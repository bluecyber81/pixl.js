import { OLED_PARITY_VERSION, OLED_TEST5_VERSION, OLED_TEST6_VERSION } from './hardware-profile.js';

// PXBI is a firmware declaration; it does not hash the running application.
export const LCD_BUILD_DIAGNOSTICS_VERSION = '2.22.0-DE3.89';
export function buildDiagnosticBoard(version) {
  if (version === '2.22.0-DE3.96' || version === '2.22.0-DE3.95' || version === '2.22.0-DE3.94' || version === '2.22.0-DE3.93' || version === '2.22.0-DE3.92' || version === '2.22.0-DE3.91' || version === LCD_BUILD_DIAGNOSTICS_VERSION || version === '2.22.0-DE3.88' || version === '2.22.0-DE3.87' || version === '2.22.0-DE3.86' || version === '2.22.0-DE3.85' || version === '2.22.0-DE3.84') return 'LCD';
  if (version === OLED_PARITY_VERSION || version === OLED_TEST5_VERSION || version === OLED_TEST6_VERSION) return 'OLED';
  return null;
}
const kinds = ['none', 'nordic-sdk', 'hardfault', 'libc-exit'];
function validSourceId(id) {
  return typeof id === 'string' && /^[0-9a-f]{64}$/.test(id);
}
export function normalizeBuildDiagnostics(value, expectedBoard) {
  if (value?.schemaVersion !== 1 || !['LCD','OLED'].includes(value.board) || (expectedBoard && value.board !== expectedBoard) || !validSourceId(value.sourceId)) return null;
  const fault = value.previousFault;
  if (fault === null) return {schemaVersion:1, board:value.board, sourceId:value.sourceId, previousFault:null};
  if (!fault || !kinds.slice(1).includes(fault.kind)) return null;
  if (fault.kind === 'nordic-sdk') {
    if (!Number.isInteger(fault.sdkId) || fault.sdkId < 0 || fault.sdkId > 0xffffffff ||
        !(fault.pc === null || (Number.isInteger(fault.pc) && fault.pc > 0 && fault.pc < 0x80000))) return null;
  } else if (fault.pc !== null || fault.sdkId !== null) return null;
  return {schemaVersion:1, board:value.board, sourceId:value.sourceId,
    previousFault:{kind:fault.kind, sdkId:fault.sdkId, pc:fault.pc}};
}
export function parseBuildDiagnostics(payload, expectedBoard) {
  const b = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const invalid = () => Object.assign(new Error('Invalid build/fault reply'), {code:'RESPONSE_INVALID'});
  if (b.byteLength !== 80 || String.fromCharCode(...b.subarray(0,4)) !== 'PXBI' || b[4] !== 1 ||
      b[5] !== 80 || ![1,2].includes(b[6]) || b[7] >= kinds.length) throw invalid();
  const words = new DataView(b.buffer,b.byteOffset,b.byteLength);
  const sdkId = words.getUint32(72,true), pc = words.getUint32(76,true);
  if (b[7] !== 1 && (sdkId || pc)) throw invalid();
  const result = normalizeBuildDiagnostics({schemaVersion:1, board:b[6] === 1 ? 'LCD' : 'OLED', sourceId:String.fromCharCode(...b.subarray(8,72)),
    previousFault:b[7] === 0 ? null : {kind:kinds[b[7]], sdkId:b[7] === 1 ? sdkId : null, pc:pc || null}}, expectedBoard);
  if (!result) throw invalid();
  return result;
}
