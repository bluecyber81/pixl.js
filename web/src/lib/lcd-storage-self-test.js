// An explicit, bounded functional test for the App669 LCD test panel. The
// caller must verify the test firmware and own the idle transfer session.
// It never intentionally selects a collection file or preexisting directory.
// VFS_REMOVE is recursive: the caller must keep this unique folder exclusive.
// The empty check and removal are not an atomic directory operation. Failed
// partial writes are left in place; no cleanup runs on any error.
import { checkedDirectory, targetEntry } from './safe-upload.js';

const ROOT = 'E:/', FILE = 'probe.txt', SIZE = 512;
const METHODS = ['assertSession', 'getFreeBytes', 'readDirectory', 'createDirectory', 'writeFile', 'readFile', 'remove'];
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const hex = bytes => [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export async function runLcdStorageSelfTest({ adapters, crypto = globalThis.crypto,
  now = () => globalThis.performance.now(), onProgress } = {}) {
  if (!METHODS.every(name => typeof adapters?.[name] === 'function'))
    fail('LCD_TEST_ADAPTER', 'The complete session-bound file adapter is required.');
  if (typeof crypto?.getRandomValues !== 'function' || typeof crypto?.subtle?.digest !== 'function')
    fail('LCD_TEST_CRYPTO', 'Secure random names and SHA-256 are required.');
  if (typeof now !== 'function' || (onProgress !== undefined && typeof onProgress !== 'function'))
    fail('LCD_TEST_ARGUMENT', 'Invalid test clock or progress callback.');

  const started = now();
  const report = { schema: 1, status: 'running', startedAt: new Date().toISOString(),
    completedAt: null, durationMilliseconds: null, phase: 'prepare', folder: null,
    bytes: SIZE, sha256: null, freeBeforeBytes: null, freeAfterWriteBytes: null,
    freeAfterBytes: null, freeDeltaBytes: null, spaceRecovered: null,
    verified: false, removed: false, cleanupRequired: false, folderOwnershipConfirmed: false,
    requiresExclusiveAccess: true, removalIsAtomicWithEmptyCheck: false };
  const check = () => adapters.assertSession();
  const phase = value => { report.phase = value; onProgress?.({ phase: value }); check(); };
  async function call(name, ...args) {
    check(); const value = await adapters[name](...args); check(); return value;
  }
  async function free() {
    const value = await call('getFreeBytes', ROOT);
    if (!Number.isSafeInteger(value) || value < 0 || value > 2097152)
      fail('LCD_TEST_FREE_SPACE', 'Invalid fresh free-space response.');
    return value;
  }
  async function list(path) { return checkedDirectory(await call('readDirectory', path)); }
  async function hash(bytes) {
    check(); const digest = await crypto.subtle.digest('SHA-256', bytes); check();
    if (!(digest instanceof ArrayBuffer) || digest.byteLength !== 32)
      fail('LCD_TEST_CRYPTO', 'Invalid SHA-256 result.');
    return hex(new Uint8Array(digest));
  }
  const finish = () => {
    report.completedAt = new Date().toISOString();
    const elapsed = now() - started;
    report.durationMilliseconds = Number.isFinite(elapsed) && elapsed >= 0 ? Math.round(elapsed * 1000) / 1000 : null;
  };

  try {
    check();
    const random = new Uint8Array(12);
    crypto.getRandomValues(random);
    const name = '~t669-' + hex(random), folder = ROOT + name, path = folder + '/' + FILE;
    report.folder = folder;
    // ASCII text, unique to this invocation, never valid amiibo/tag data.
    const text = `Allmiibo LCD App669 TEST1 storage probe ${hex(random)}\n`;
    const expected = new TextEncoder().encode(text.repeat(Math.ceil(SIZE / text.length)).slice(0, SIZE));
    report.sha256 = await hash(expected);
    phase('before-write');
    report.freeBeforeBytes = await free();
    if (targetEntry(await list(ROOT), name))
      fail('LCD_TEST_COLLISION', 'A file or folder already uses the test name; nothing was changed.');

    phase('create-folder');
    // A failed/unknown acknowledgement can leave this path behind. Do not
    // assume ownership and do not attempt cleanup in a later connection.
    report.cleanupRequired = true;
    await call('createDirectory', folder);
    report.folderOwnershipConfirmed = true;
    if ((await list(folder)).length)
      fail('LCD_TEST_UNEXPECTED_CONTENT', 'The new test folder is not empty.');
    phase('write');
    await call('writeFile', path, expected.slice());
    report.freeAfterWriteBytes = await free();

    async function verifyOwnedFile() {
      const entries = await list(folder);
      if (entries.length !== 1 || entries[0].name !== FILE || entries[0].type !== 0 || entries[0].size !== SIZE)
        fail('LCD_TEST_UNEXPECTED_CONTENT', 'The test folder contains an unexpected entry or size.');
      const data = await call('readFile', path, { maxBytes: SIZE, exactBytes: SIZE });
      const bytes = data instanceof Uint8Array ? new Uint8Array(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
      if (!bytes || !same(bytes, expected) || await hash(bytes) !== report.sha256)
        fail('LCD_TEST_MISMATCH', 'The file read back does not match the synthetic test data.');
    }
    phase('readback');
    await verifyOwnedFile();
    report.verified = true;
    // Revalidate immediately before removal. No recursive cleanup on error:
    // a partial file or unfamiliar content is deliberately left for review.
    phase('verify-before-remove');
    await verifyOwnedFile();
    phase('remove-file');
    await call('remove', path);
    if ((await list(folder)).length)
      fail('LCD_TEST_UNEXPECTED_CONTENT', 'The test folder is no longer empty; it was not removed.');
    phase('remove-folder');
    await call('remove', folder);
    if (targetEntry(await list(ROOT), name))
      fail('LCD_TEST_REMOVE_UNCONFIRMED', 'Test folder removal could not be confirmed.');
    report.removed = true;
    report.cleanupRequired = false;
    phase('after-remove');
    report.freeAfterBytes = await free();
    report.freeDeltaBytes = report.freeAfterBytes - report.freeBeforeBytes;
    report.spaceRecovered = report.freeDeltaBytes >= 0;
    // Storage recovery is an observation, not a general GC-health verdict.
    report.status = 'passed';
    report.phase = 'complete';
    finish();
    return report;
  } catch (cause) {
    report.status = 'failed';
    report.errorCode = typeof cause?.code === 'string' ? cause.code : 'LCD_TEST_FAILED';
    finish();
    const error = new Error(cause instanceof Error ? cause.message : 'The storage test did not complete.', { cause });
    error.code = report.errorCode;
    error.testReport = report;
    throw error;
  }
}
