// Run with Node >=22 and Playwright. Set CHROME_EXECUTABLE for a system Chrome.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const context = { deviceKey: 'fixture-A', rootPath: 'E:/tags', firmwareVersion: '2.22.0-DE3.66', preserveLegacyNames: false };
const initial = { 'a.bin': [1, 2], 'b.bin': [3], 'c.bin': [4, 5], 'd.bin': [6] };
const changed = { 'a.bin': [9, 8], 'b.bin': [3], 'd.bin': [6], 'new.bin': [7, 8, 9] };
const hash = bytes => createHash('sha256').update(Uint8Array.from(bytes)).digest('hex');
const checks = [];

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<!doctype html><title>Stored backup fixture</title><script src="/jszip.js"></script>');
    }
    let url;
    if (pathname === '/jszip.js') url = new URL('../public/dfu/vendor/jszip-3.10.2.min.js', import.meta.url);
    else if (pathname === '/memory-vfs.mjs') url = new URL('../tests/helpers/memory-vfs.mjs', import.meta.url);
    else if (/^\/lib\/[a-z0-9-]+\.js$/.test(pathname)) url = new URL('../src' + pathname, import.meta.url);
    if (!url) throw Error('Unknown fixture route');
    const source = await readFile(url);
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(source);
  } catch { res.writeHead(404); res.end(); }
});

const profile = await mkdtemp(path.join(tmpdir(), 'allmiibo-stored-backup-'));
let browser;
async function openProfile() {
  browser = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined,
  });
  browser.setDefaultTimeout(7000);
}

async function prepare(page, files) {
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.evaluate(async ({ identity, files }) => {
    const { memoryVfs } = await import('/memory-vfs.mjs');
    const api = await import('/lib/stored-backup.js');
    const { createBackup } = await import('/lib/backup.js');
    const vfs = memoryVfs();
    for (const [name, bytes] of Object.entries(files)) vfs.put('E:/tags/' + name, bytes);
    async function readFileDigest(path) {
      const sha = await crypto.subtle.digest('SHA-256', vfs.nodes.get(path).bytes);
      return Array.from(new Uint8Array(sha), x => x.toString(16).padStart(2, '0')).join('');
    }
    const options = { ...vfs.api, ...identity, readFileDigest };
    const backup = (head, extra = {}) => api.withStoredBackup(identity, head, storage =>
      createBackup({ ...options, ...extra, storedBackup: storage }));
    async function zipContents(result) {
      const archive = await window.JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
      const manifest = JSON.parse(await archive.file('manifest.json').async('string'));
      const paths = Object.keys(archive.files).filter(name => name.startsWith('files/') && !archive.files[name].dir).sort();
      const contents = [];
      for (const entry of manifest.entries.filter(entry => entry.type === 'file')) {
        contents.push({ name: entry.archivePath, sha256: entry.sha256,
          bytes: Array.from(await archive.file(entry.archivePath).async('uint8array')) });
      }
      return { paths, contents, reused: manifest.resume.reusedFiles };
    }
    async function alterRecord(store, key, update) {
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('allmiibo-folder-backup');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite');
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
          const rows = tx.objectStore(store), read = rows.get(key);
          read.onsuccess = () => rows.put(update(read.result), key);
        });
      } finally { db.close(); }
    }
    window.fixture = { api, vfs, identity, backup, head: () => api.inspectStoredBackup(),
      plain: () => createBackup(options), zipContents, alterRecord };
  }, { identity: context, files });
}

const headOf = page => page.evaluate(() => fixture.head());
async function assertRejected(page, fn, arg, label) {
  await assert.rejects(page.evaluate(fn, arg), undefined, label);
}

try {
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  await openProfile();
  let page = await browser.newPage();
  await prepare(page, initial);
  assert.equal(await headOf(page), null);
  const stopped = await page.evaluate(async () => {
    const controller = new AbortController();
    try {
      await fixture.backup(null, { signal: controller.signal, onProgress(p) {
        if (p.phase === 'reading' && p.filesDone === 3) controller.abort();
      } });
      return null;
    } catch (error) { return error.name; }
  });
  assert.equal(stopped, 'AbortError');
  const first = await headOf(page);
  assert.deepEqual(first.context, context);
  assert.equal(first.files, 3);
  assert.equal(first.bytes, 5);
  await prepare(page, changed);
  assert.deepEqual(await headOf(page), first);
  await browser.close();
  browser = null;
  await openProfile();
  page = await browser.newPage();
  await prepare(page, changed);
  assert.deepEqual(await headOf(page), first);
  checks.push('Three completed files survived reload and a complete Chrome process restart.');

  for (const mismatch of [{ deviceKey: 'fixture-B' }, { rootPath: 'E:/' },
    { firmwareVersion: '2.22.0-DE3.65' }, { preserveLegacyNames: true }]) {
    await assertRejected(page, async ({ first, mismatch }) => fixture.api.withStoredBackup(
      { ...fixture.identity, ...mismatch }, first, () => { window.wrongIdentityEntered = true; }), { first, mismatch }, 'identity was accepted');
    assert.equal(await page.evaluate(() => !!window.wrongIdentityEntered), false);
  }
  assert.deepEqual(await headOf(page), first);
  checks.push('Device, folder, firmware and naming-mode mismatches preserve the checkpoint.');

  const other = await browser.newPage();
  await prepare(other, changed);
  await assertRejected(other, () => fixture.backup(null), undefined, 'new backup overwrote saved backup');
  const resumedPromise = page.evaluate(async head => {
    let firstRead = true;
    fixture.vfs.setHook(async event => {
      if (firstRead && event.when === 'before' && event.op === 'read') {
        firstRead = false;
        await new Promise(resolve => { window.releaseRead = resolve; });
      }
    });
    const result = await fixture.zipContents(await fixture.backup(head));
    return { result, read: fixture.vfs.log.filter(e => e.op === 'read').map(e => e.args[0]),
      ops: [...new Set(fixture.vfs.log.map(e => e.op))] };
  }, first);
  await page.waitForFunction(() => typeof window.releaseRead === 'function');
  await other.evaluate(head => {
    window.competitor = fixture.api.withStoredBackup(fixture.identity, head, () => { window.contenderEntered = true; })
      .then(() => { window.contenderResult = 'accepted'; }, error => { window.contenderResult = error.code; });
  }, first);
  await other.waitForFunction(() => window.contenderResult !== undefined);
  assert.equal(await other.evaluate(() => window.contenderResult), 'STORED_BACKUP_BUSY');
  assert.equal(await other.evaluate(() => !!window.contenderEntered), false);
  await page.evaluate(() => window.releaseRead());
  const resumed = await resumedPromise;
  const current = await headOf(page);
  assert.notEqual(current.revision, first.revision);
  await assertRejected(other, stale => fixture.api.discardStoredBackup(stale), first, 'old tab discarded newer data');
  assert.deepEqual(await headOf(other), current);
  checks.push('Concurrent tabs and a stale discard cannot replace the active or newer checkpoint.');

  const fresh = await page.evaluate(async () => fixture.zipContents(await fixture.plain()));
  const archivePaths = Object.keys(changed).map(n => 'files/' + n).sort();
  assert.deepEqual(resumed.result.paths, archivePaths);
  assert.deepEqual(resumed.result.contents, fresh.contents);
  for (const entry of resumed.result.contents) {
    const bytes = changed[entry.name.slice('files/'.length)];
    assert.deepEqual(entry.bytes, bytes);
    assert.equal(entry.sha256, hash(bytes));
  }
  assert.equal(resumed.result.reused, 1);
  assert.deepEqual(resumed.read.sort(), ['E:/tags/a.bin', 'E:/tags/d.bin', 'E:/tags/new.bin']);
  assert.ok(resumed.ops.every(op => op === 'list' || op === 'read'));
  assert.equal(current.files, Object.keys(changed).length);
  checks.push('Fresh archive bytes, CRC and independent SHA-256 agree after a same-size change, deletion and addition.');

  await page.evaluate(head => fixture.api.discardStoredBackup(head), current);
  assert.equal(await headOf(other), null);
  for (const fault of ['abort', 'quota']) {
    const failure = await page.evaluate(async fault => {
      const original = IDBObjectStore.prototype.put;
      let injected = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name !== 'files' || ++injected !== 2) return original.apply(this, args);
        if (fault === 'quota') throw new DOMException('Test storage quota', 'QuotaExceededError');
        const request = original.apply(this, args);
        this.transaction.abort();
        return request;
      };
      try {
        await fixture.backup(null);
        return { unexpectedSuccess: true, injected };
      } catch (error) { return { injected, code: error.code }; }
      finally { IDBObjectStore.prototype.put = original; }
    }, fault);
    assert.equal(failure.unexpectedSuccess, undefined);
    assert.equal(failure.injected, 2);
    assert.equal(failure.code, fault === 'quota' ? 'STORED_BACKUP_QUOTA' : 'STORED_BACKUP_IO');
    const kept = await headOf(page);
    assert.equal(kept.files, 1);
    assert.equal(kept.bytes, 2);
    await prepare(page, changed);
    assert.deepEqual(await headOf(page), kept);
    const retry = await page.evaluate(async kept => fixture.zipContents(await fixture.backup(kept)), kept);
    assert.equal(retry.reused, 1);
    assert.deepEqual(retry.contents, fresh.contents);
    await page.evaluate(async () => fixture.api.discardStoredBackup(await fixture.head()));
    assert.equal(await headOf(other), null);
  }
  checks.push('Transaction abort or quota failure retained exactly one file; after reload the full ZIP reused that file.');

  const raw = await page.evaluate(async () => {
    let rawReads = 0;
    fixture.vfs.log.length = 0;
    try { await fixture.backup(null, { readRawMetadata() { ++rawReads; } }); }
    catch (error) { return { code: error.code, deviceOps: fixture.vfs.log.length, rawReads }; }
    return null;
  });
  assert.deepEqual(raw, { code: 'BACKUP_API', deviceOps: 0, rawReads: 0 });
  await page.evaluate(async () => fixture.api.discardStoredBackup(await fixture.head()));
  checks.push('Raw128 plus persistent storage is rejected before any device access.');

  const late = await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    let injected = 0;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'state' && value?.status === 'exported') {
        ++injected;
        throw new DOMException('Test completion quota', 'QuotaExceededError');
      }
      return put.call(this, value, ...args);
    };
    try {
      const result = await fixture.backup(null);
      const zipSha = await crypto.subtle.digest('SHA-256', await result.blob.arrayBuffer());
      const link = document.createElement('a');
      link.id = 'download-completed-fixture';
      link.download = result.filename;
      link.textContent = result.filename;
      link.href = URL.createObjectURL(result.blob);
      document.body.append(link);
      return { injected, code: result.storedCompletionError?.code, contents: (await fixture.zipContents(result)).contents,
        hash: Array.from(new Uint8Array(zipSha), n => n.toString(16).padStart(2, '0')).join('') };
    } finally { IDBObjectStore.prototype.put = put; }
  });
  assert.equal(late.injected, 1);
  assert.equal(late.code, 'STORED_BACKUP_QUOTA');
  assert.deepEqual(late.contents, fresh.contents);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-completed-fixture').click()]);
  assert.equal(await download.failure(), null);
  assert.equal(hash(await readFile(await download.path())), late.hash);
  const stillIncomplete = await headOf(page);
  assert.equal(stillIncomplete.status, 'incomplete');
  await page.evaluate(head => fixture.api.discardStoredBackup(head), stillIncomplete);
  checks.push('Late completion quota preserves a downloadable ZIP; downloaded bytes and file hashes are verified.');

  await page.evaluate(async () => {
    await fixture.backup(null);
    await fixture.alterRecord('files', 'E:/tags/b.bin', row => {
      row.bytes[0] ^= 0xff;
      return row;
    });
  });
  const corruptCode = await page.evaluate(async () => {
    try { await fixture.backup(await fixture.head()); }
    catch (error) { return error.code; }
    return null;
  });
  assert.equal(corruptCode, 'STORED_BACKUP_CORRUPT');
  await page.evaluate(() => fixture.alterRecord('state', 'current', row => ({ ...row, schema: 999 })));
  const badHeader = await headOf(page);
  assert.equal(badHeader.invalid, true);
  await assertRejected(page, head => fixture.backup(head), badHeader, 'unknown checkpoint format was accepted');
  assert.deepEqual(await headOf(page), badHeader);
  await page.evaluate(head => fixture.api.discardStoredBackup(head), badHeader);
  assert.equal(await headOf(page), null);
  checks.push('Corrupted stored bytes prevent ZIP creation; unknown checkpoint metadata is preserved until an explicit discard.');

  await page.close();
  await other.close();
  await browser.close();
  browser = null;
  await openProfile();
  page = await browser.newPage();
  await prepare(page, changed);
  assert.equal(await headOf(page), null);
  // Create the next database version from a tab without open production handles.
  await page.reload();
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const db = databases.find(item => item.name === 'allmiibo-folder-backup');
    const request = indexedDB.open(db.name, db.version + 1);
    await new Promise((resolve, reject) => {
      request.onblocked = () => reject(Error('Unexpected connection blocking the fixture upgrade'));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
  });
  await prepare(page, changed);
  const future = await headOf(page);
  assert.equal(future.invalid, true);
  await assertRejected(page, () => fixture.backup(null), undefined, 'a future database version was overwritten');
  assert.deepEqual(await headOf(page), future);
  await page.evaluate(head => fixture.api.discardStoredBackup(head), future);
  assert.equal(await headOf(page), null);
  checks.push('Explicit discard survived restart; an unsupported IndexedDB version was retained until explicitly discarded.');

  const report = { chrome: browser.browser().version(), checks, scope: 'Real Chrome IndexedDB, synthetic read-only device, injected storage faults.' };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  try { await browser?.close(); } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
