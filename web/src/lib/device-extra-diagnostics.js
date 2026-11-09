// Read-only INFO 0x04 / 0x05 snapshots already provided by the LCD firmware.
// These describe firmware observations, not physical key or radio measurements.
const EVENTS = ['press', 'release', 'short', 'long', 'repeat'];
const KEYS = ['left', 'center', 'right'];
const uint = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
const word = value => uint(value, 0xffffffff);
const u16 = value => uint(value, 65535);
const booleanFields = (value, fields) => fields.every(name => typeof value[name] === 'boolean');
const invalid = name => { throw new Error(`Invalid ${name} diagnostic response`); };

function wire(buffer, length, magic) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length ||
      [...magic].some((char, index) => bytes[index] !== char.charCodeAt(0)) || bytes[4] !== 1) invalid(magic);
  return {bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)};
}

export function normalizeMtuDiagnostics(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== 'firmware-gatt-snapshot' ||
      !booleanFields(value, ['sessionReady', 'fileMode', 'transferIdle'])) return null;
  const maximum = value.configuredMaxAttMtu, next = value.nextConnectionAttMtu;
  if (!uint(maximum, 250) || maximum < 23 || !uint(next, maximum) || next < 23) return null;
  if (value.sessionReady ?
      (!uint(value.effectiveAttMtu, maximum) || value.effectiveAttMtu < 23 ||
       !uint(value.gattValueCapacity, value.effectiveAttMtu - 3) || value.gattValueCapacity < 20) :
      (value.effectiveAttMtu !== null || value.gattValueCapacity !== null)) return null;
  return Object.freeze({schemaVersion: 1, scope: 'firmware-gatt-snapshot',
    sessionReady: value.sessionReady, fileMode: value.fileMode, transferIdle: value.transferIdle,
    effectiveAttMtu: value.effectiveAttMtu, nextConnectionAttMtu: next,
    configuredMaxAttMtu: maximum, gattValueCapacity: value.gattValueCapacity});
}

export function parseMtuDiagnostics(buffer) {
  const {bytes, view} = wire(buffer, 16, 'MTUD');
  const flags = bytes[5], ready = !!(flags & 1);
  if ((flags & ~7) || bytes[14] || bytes[15] ||
      (!ready && (view.getUint16(6, true) || view.getUint16(12, true)))) invalid('MTU');
  const result = normalizeMtuDiagnostics({schemaVersion: 1, scope: 'firmware-gatt-snapshot',
    sessionReady: ready, fileMode: !!(flags & 2), transferIdle: !!(flags & 4),
    effectiveAttMtu: ready ? view.getUint16(6, true) : null,
    nextConnectionAttMtu: view.getUint16(8, true), configuredMaxAttMtu: view.getUint16(10, true),
    gattValueCapacity: ready ? view.getUint16(12, true) : null});
  if (!result) invalid('MTU');
  return result;
}

function eventCounts(value) {
  if (!value || !EVENTS.every(name => u16(value[name]))) return null;
  return Object.freeze(Object.fromEntries(EVENTS.map(name => [name, value[name]])));
}

function attempt(value) {
  if (!value || !word(value.selection) || !u16(value.count) || !u16(value.focus) || !uint(value.stage, 6)) return null;
  const result = value.saveResult;
  if (value.stage < 4 ? result !== null :
      (!Number.isInteger(result) || result < -2147483647 || result > 2147483647 ||
       (value.stage === 5 ? result === 0 : result !== 0))) return null;
  return Object.freeze({selection: value.selection, saveResult: result, count: value.count,
    focus: value.focus, stage: value.stage});
}

export function normalizeUiDiagnostics(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== 'last-settings-session' ||
      typeof value.active !== 'boolean' || !u16(value.sessions) || !uint(value.queueHighWater, 255)) return null;
  const rawEvents = Object.fromEntries(KEYS.map(key => [key, eventCounts(value.rawEvents?.[key])]));
  const centerPosted = eventCounts(value.centerPosted), centerDropped = eventCounts(value.centerDropped);
  const centerDelivered = eventCounts(value.centerDelivered);
  const shortAttempt = attempt(value.shortAttempt), longAttempt = attempt(value.longAttempt);
  if (KEYS.some(key => !rawEvents[key]) || !centerPosted || !centerDropped || !centerDelivered ||
      !shortAttempt || !longAttempt || (value.active && !value.sessions)) return null;
  return Object.freeze({schemaVersion: 1, scope: 'last-settings-session', active: value.active,
    sessions: value.sessions, rawEvents: Object.freeze(rawEvents), centerPosted, centerDropped,
    centerDelivered, queueHighWater: value.queueHighWater, shortAttempt, longAttempt});
}

export function parseUiDiagnostics(buffer) {
  const {bytes, view} = wire(buffer, 104, 'UIDG');
  if (bytes[5] > 1 || [69,70,71,85,86,87,101,102,103].some(offset => bytes[offset])) invalid('UI');
  const counts = offset => Object.fromEntries(EVENTS.map((name, index) => [name, view.getUint16(offset + 2 * index, true)]));
  const readAttempt = offset => {
    const result = view.getInt32(offset + 4, true);
    return {selection: view.getUint32(offset, true), saveResult: result === -2147483648 ? null : result,
      count: view.getUint16(offset + 8, true), focus: view.getUint16(offset + 10, true), stage: bytes[offset + 12]};
  };
  const result = normalizeUiDiagnostics({schemaVersion: 1, scope: 'last-settings-session',
    active: !!bytes[5], sessions: view.getUint16(6, true),
    rawEvents: Object.fromEntries(KEYS.map((key, index) => [key, counts(8 + index * 10)])),
    centerPosted: counts(38), centerDropped: counts(48), centerDelivered: counts(58),
    queueHighWater: bytes[68], shortAttempt: readAttempt(72), longAttempt: readAttempt(88)});
  if (!result) invalid('UI');
  return result;
}

export function supportsMenuDiagnostics(version) {
  const match = /^2\.22\.0-DE3\.(\d+)$/.exec(version || '');
  return !!match && Number(match[1]) >= 70;
}

export function normalizeMenuDiagnostics(value) {
  if (!value || value.schemaVersion !== 1 || value.scope !== 'first-main-menu-since-restart' ||
      !booleanFields(value, ['menuEntered', 'selectionAttempted', 'launcherReturned', 'targetActive',
        'leftBeforeSelection', 'countsSaturated'])) return null;
  const counts = value.centerCounts;
  if (!['press', 'release', 'short'].every(key => uint(counts?.[key], 255))) return null;
  const {menuEntered, selectionAttempted, launcherReturned, targetActive, leftBeforeSelection, countsSaturated,
    targetAppId, launchCallMilliseconds} = value;
  if ((!menuEntered && (selectionAttempted || leftBeforeSelection || counts.press || counts.release || counts.short)) ||
      (leftBeforeSelection && selectionAttempted) || (launcherReturned && !selectionAttempted) ||
      (targetActive && !launcherReturned) || (countsSaturated && Math.max(counts.press, counts.release, counts.short) !== 255) ||
      (selectionAttempted ? !uint(targetAppId, 255) || targetAppId === 0 : targetAppId !== null) ||
      (launcherReturned ? !word(launchCallMilliseconds) : launchCallMilliseconds !== null)) return null;
  return Object.freeze({schemaVersion: 1, scope: value.scope, menuEntered, selectionAttempted, launcherReturned,
    targetActive, leftBeforeSelection, countsSaturated, targetAppId, launchCallMilliseconds,
    centerCounts: Object.freeze({press: counts.press, release: counts.release, short: counts.short})});
}

export function parseMenuDiagnostics(buffer) {
  const {bytes, view} = wire(buffer, 16, 'PXMI');
  const flags = bytes[6], elapsed = view.getUint32(12, true);
  if (bytes[5] !== bytes.length || (flags & 0xc0) || bytes[11] ||
      (!(flags & 2) && bytes[7]) || (!(flags & 4) && elapsed)) invalid('menu');
  const result = normalizeMenuDiagnostics({schemaVersion: 1, scope: 'first-main-menu-since-restart',
    menuEntered: !!(flags & 1), selectionAttempted: !!(flags & 2), launcherReturned: !!(flags & 4),
    targetActive: !!(flags & 8), leftBeforeSelection: !!(flags & 16), countsSaturated: !!(flags & 32),
    targetAppId: flags & 2 ? bytes[7] : null, launchCallMilliseconds: flags & 4 ? elapsed : null,
    centerCounts: {press: bytes[8], release: bytes[9], short: bytes[10]}});
  if (!result) invalid('menu');
  return result;
}
