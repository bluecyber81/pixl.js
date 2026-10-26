import test from 'node:test';
import assert from 'node:assert/strict';
import { saveBlobWithPicker } from '../src/lib/browser-tools.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const abortError = message => Object.assign(new Error(message), { name: 'AbortError' });
async function withPicker(picker, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'showSaveFilePicker');
  Object.defineProperty(globalThis, 'showSaveFilePicker', { configurable: true, writable: true, value: picker });
  try { await run(); }
  finally {
    if (original) Object.defineProperty(globalThis, 'showSaveFilePicker', original);
    else delete globalThis.showSaveFilePicker;
  }
}
const blob = new Blob([Uint8Array.of(0, 1, 128, 255)], { type: 'application/zip' });

test('missing or non-function picker reports unsupported without a download fallback', async () => {
  // Node has no document/window fallback: accidental anchor saving would fail.
  for (const picker of [undefined, null, false, {}]) {
    await withPicker(picker, async () => {
      assert.deepEqual(await saveBlobWithPicker(blob, 'backup.zip'), { status: 'unsupported' });
    });
  }
});

test('picker runs immediately with the browser receiver, filename and supplied types before any await', async () => {
  const chosen = deferred(), types = [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }];
  let calls = 0, seen, receiver;
  await withPicker(function (options) { calls++; seen = options; receiver = this; return chosen.promise; }, async () => {
    const pending = saveBlobWithPicker(blob, 'allmiibo ü.zip', { types });
    assert.equal(calls, 1, 'native picker opens in the initiating synchronous gesture');
    assert.equal(receiver, globalThis);
    assert.deepEqual(seen, { suggestedName: 'allmiibo ü.zip', types });
    chosen.reject(abortError('user cancelled'));
    assert.deepEqual(await pending, { status: 'cancelled' });
  });
});

test('picker AbortError is cancellation for synchronous throws and rejected promises, without writing', async () => {
  for (const picker of [() => { throw abortError('cancel'); }, () => Promise.reject(abortError('cancel'))]) {
    await withPicker(picker, async () => assert.deepEqual(await saveBlobWithPicker(blob, 'backup.zip'), { status: 'cancelled' }));
  }
});

test('real picker failures propagate unchanged and do not become unsupported or cancelled', async () => {
  for (const name of ['SecurityError', 'NotAllowedError', 'TypeError']) {
    const error = Object.assign(new Error(name), { name });
    await withPicker(() => Promise.reject(error), async () => {
      await assert.rejects(saveBlobWithPicker(blob, 'backup.zip'), actual => actual === error);
    });
  }
});

test('saved is returned only after opening, writing the original Blob and successful close', async () => {
  const written = deferred(), closed = deferred(), events = []; let settled = false;
  const writable = {
    write(value) { assert.equal(value, blob); events.push('write'); return written.promise; },
    close() { events.push('close'); return closed.promise; },
    abort() { events.push('abort'); },
  };
  await withPicker(options => {
    assert.deepEqual(options, { suggestedName: 'backup.zip' });
    events.push('picker');
    return { createWritable() { events.push('open'); return writable; } };
  }, async () => {
    const pending = saveBlobWithPicker(blob, 'backup.zip').then(result => { settled = true; return result; });
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(events, ['picker', 'open', 'write']); assert.equal(settled, false);
    written.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(events, ['picker', 'open', 'write', 'close']); assert.equal(settled, false);
    closed.resolve(); assert.deepEqual(await pending, { status: 'saved' });
    assert.equal(settled, true); assert.equal(events.includes('abort'), false);
  });
});

test('createWritable AbortError is a writing error, not user picker cancellation', async () => {
  const error = abortError('permission lost after picker');
  await withPicker(() => ({ createWritable: async () => { throw error; } }), async () => {
    await assert.rejects(saveBlobWithPicker(blob, 'backup.zip'), actual => actual === error);
  });
});

test('write and close failures abort best effort and preserve the original failure including AbortError', async () => {
  for (const phase of ['write', 'close']) for (const failure of [new Error('disk full'), abortError('write aborted')]) {
    for (const abortMode of ['success', 'reject', 'throw', 'missing']) {
      const events = [], writable = {
        write() { events.push('write'); if (phase === 'write') throw failure; },
        close() { events.push('close'); if (phase === 'close') return Promise.reject(failure); },
      };
      if (abortMode !== 'missing') writable.abort = () => {
        events.push('abort');
        if (abortMode === 'throw') throw new Error('secondary abort failure');
        if (abortMode === 'reject') return Promise.reject(new Error('secondary abort failure'));
      };
      await withPicker(() => ({ createWritable: () => writable }), async () => {
        await assert.rejects(saveBlobWithPicker(blob, 'backup.zip'), actual => actual === failure);
        const expected = phase === 'write' ? ['write'] : ['write', 'close'];
        if (abortMode !== 'missing') expected.push('abort');
        assert.deepEqual(events, expected);
      });
    }
  }
});
