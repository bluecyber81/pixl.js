import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto, createHash } from 'node:crypto';
import { CATALOGUE_UPDATE_SOURCE as SOURCE, CATALOGUE_UPDATE_LIMITS as LIMITS,
  normalizeCatalogueSource, compareCatalogueEntries, mergeCatalogueEntries,
  checkCatalogueUpdates, CatalogueUpdateError } from '../src/lib/catalogue-updates.js';
import reference from '../src/data/online-usage-reference.json' with { type: 'json' };

const sha = 'a'.repeat(40);
const ref = { ref: 'refs/heads/master', object: { type: 'commit', sha } };
const release = () => ({ au: '2024-02-29', na: null, eu: '2024-03-01', jp: null });
const entry = (id = '0100000000040002', name = 'Link') => ({ id, name,
  series: 'Super Smash Bros.', game: 'The Legend of Zelda', type: 'Figure',
  release: release(), firmwareIdKnown: true });
function source(entries = [entry()]) {
  const result = { amiibos: {}, amiibo_series: {}, game_series: {}, types: {} };
  for (const e of entries) {
    result.amiibos[`0x${e.id}`] = { name: e.name, release: { ...e.release } };
    result.amiibo_series[`0x${e.id.slice(12, 14)}`] = e.series;
    result.game_series[`0x${e.id.slice(0, 3)}`] = e.game;
    result.types[`0x${e.id.slice(6, 8)}`] = e.type;
  }
  return result;
}
const response = value => new Response(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value),
  { status: 200, headers: { 'content-type': 'application/json' } });
function fakeFetch(data = source(), options = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return calls.length === 1 ? response(options.ref || ref) : response(data); };
  return { fetchImpl, calls };
}
const run = (options = {}) => checkCatalogueUpdates({ baseline: [entry()], cryptoImpl: webcrypto, ...options });
const isCode = code => error => error instanceof CatalogueUpdateError && error.code === code;

test('online catalogue errors are shown in the selected language and retain the HTTP status', async () => {
  for (const [status, code, english] of [[403, 'rate-limit', /GitHub is limiting/], [503, 'http', /unavailable \(HTTP 503\)/]]) {
    await assert.rejects(run({fetchImpl: async () => new Response(null, {status})}), error => {
      assert.equal(error.code, code);
      assert.match(error.localizedMessage('en'), english);
      assert.equal(error.localizedMessage('de_DE'), error.message);
      return true;
    });
  }
});

test('normalizes exactly public metadata, excluding machine records and remote URLs/support flags', () => {
  const raw = source(); raw.machine = { '0x1f00000004c41e03': { name: 'Warp Star' } };
  raw.amiibos[`0x${entry().id}`].image = 'https://untrusted.invalid/private';
  raw.amiibos[`0x${entry().id}`].firmwareIdKnown = true;
  raw.download = 'https://untrusted.invalid/dumps';
  assert.deepEqual(normalizeCatalogueSource(raw), [{ ...entry(), firmwareIdKnown: false }]);
});
test('all 954 bundled entries roundtrip through the researched raw schema without metadata drift', async () => {
  const bundled = JSON.parse(await readFile(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'));
  const normalized = normalizeCatalogueSource(source(bundled.entries));
  const diff = compareCatalogueEntries(bundled, normalized);
  assert.equal(bundled.entries.length, 954);
  assert.deepEqual([diff.added, diff.changed, diff.absentFromSource], [[], [], []]);
});
test('addition, metadata change and source absence are distinct; union never deletes baseline IDs', () => {
  const a = entry(), b = entry('0101000000050002', 'Zelda'), c = entry('0102000000060002', 'New');
  const next = { ...a, name: 'Link (new name)', release: { ...a.release, eu: null }, firmwareIdKnown: false };
  const baseline = [a, b], remote = [next, c], saved = structuredClone({ baseline, remote });
  const diff = compareCatalogueEntries(baseline, remote);
  assert.equal(diff.added[0].id, c.id); assert.equal(diff.added[0].firmwareIdKnown, false);
  assert.deepEqual(diff.changed[0].fields, ['name', 'release.eu']);
  assert.deepEqual(diff.absentFromSource, [b]);
  assert.deepEqual(diff.counts, { baseline: 2, source: 2, added: 1, changed: 1, absentFromSource: 1, merged: 3 });
  const merged = mergeCatalogueEntries(baseline, remote);
  assert.deepEqual(merged.map(e => [e.id, e.firmwareIdKnown]), [[a.id, true], [b.id, true], [c.id, false]]);
  assert.deepEqual({ baseline, remote }, saved);
  merged[0].release.au = null; assert.equal(a.release.au, '2024-02-29');
});
test('remote firmware knowledge and metadata key order alone do not count as changes', () => {
  const a = entry(), b = { ...a, firmwareIdKnown: false, release: { jp: null, eu: '2024-03-01', na: null, au: '2024-02-29' } };
  assert.equal(compareCatalogueEntries([a], [b]).changed.length, 0);
});
test('plain text markup stays plain metadata; no injected links/html fields survive', () => {
  const raw = source(); raw.amiibos[`0x${entry().id}`].name = '<img src=x onerror=alert(1)>';
  assert.equal(normalizeCatalogueSource(raw)[0].name, '<img src=x onerror=alert(1)>');
  assert.equal(Object.keys(normalizeCatalogueSource(raw)[0]).length, 7);
});
for (const [name, mutate] of [
  ['array payload', () => []], ['empty catalogue', raw => { raw.amiibos = {}; return raw; }],
  ['invalid ID', raw => { raw.amiibos = { '../file': { name: 'X', release: release() } }; return raw; }],
  ['uppercase ID', raw => { raw.amiibos = { '0x010000000004000A': { name: 'X', release: release() } }; return raw; }],
  ['unknown series', raw => { raw.amiibo_series = { '0xff': 'Other' }; return raw; }],
  ['missing region', raw => { delete raw.amiibos[`0x${entry().id}`].release.jp; return raw; }],
  ['invalid date', raw => { raw.amiibos[`0x${entry().id}`].release.eu = '2023-02-29'; return raw; }],
  ['object name', raw => { raw.amiibos[`0x${entry().id}`].name = {}; return raw; }],
  ['long name', raw => { raw.amiibos[`0x${entry().id}`].name = 'x'.repeat(161); return raw; }],
  ['control name', raw => { raw.amiibos[`0x${entry().id}`].name = 'x\u0000'; return raw; }],
  ['bidi override', raw => { raw.amiibos[`0x${entry().id}`].name = 'x\u202e'; return raw; }],
  ['lone surrogate', raw => { raw.amiibos[`0x${entry().id}`].name = 'x\ud800'; return raw; }],
  ['inherited record', raw => { raw.amiibos = Object.create(raw.amiibos); return raw; }],
]) test(`rejects ${name}`, () => assert.throws(() => normalizeCatalogueSource(mutate(source())), isCode('invalid-data')));
test('rejects duplicate baseline/remote IDs and oversized source entry count', () => {
  assert.throws(() => compareCatalogueEntries([entry(), entry()], [entry()]), isCode('invalid-data'));
  assert.throws(() => mergeCatalogueEntries([entry()], [entry(), entry()]), isCode('invalid-data'));
  const raw = source(); raw.amiibos = Object.fromEntries(Array.from({ length: LIMITS.entries + 1 }, (_, n) => [`0x${n.toString(16).padStart(16, '0')}`, { name: 'X', release: release() }]));
  assert.throws(() => normalizeCatalogueSource(raw), isCode('invalid-data'));
});
test('an accumulated session catalogue may exceed one response, but the union remains bounded', () => {
  const baseline = Array.from({ length: LIMITS.entries + 1 }, (_, n) => entry(n.toString(16).padStart(16, '0')));
  const merged = mergeCatalogueEntries(baseline, [baseline[0]]);
  assert.equal(merged.length, LIMITS.entries + 1);
  assert.equal(compareCatalogueEntries(merged, [baseline[0]]).counts.absentFromSource, LIMITS.entries);
  assert.throws(() => compareCatalogueEntries([], baseline), isCode('invalid-data'));
  const full = Array.from({ length: LIMITS.mergedEntries }, (_, n) => entry(n.toString(16).padStart(16, '0')));
  assert.throws(() => mergeCatalogueEntries(full, [entry('ffffffffffffffff')]), isCode('invalid-data'));
});
test('fixed branch ref then exact commit raw URL; no cookies, redirects, referrer, writes or automatic polling', async () => {
  const fake = fakeFetch(); const result = await run(fake);
  assert.equal(fake.calls.length, 3);
  assert.equal(fake.calls[0].url, SOURCE.refUrl);
  assert.equal(fake.calls[1].url, `https://raw.githubusercontent.com/8bitDream/AmiiboAPI/${sha}/database/amiibo.json`);
  assert.equal(fake.calls[2].url, `https://raw.githubusercontent.com/8bitDream/AmiiboAPI/${sha}/database/games_info.json`);
  for (const { opts } of fake.calls) {
    assert.equal(opts.credentials, 'omit'); assert.equal(opts.redirect, 'error'); assert.equal(opts.cache, 'no-store');
    assert.equal(opts.mode, 'cors'); assert.equal(opts.referrerPolicy, 'no-referrer');
    assert.equal(opts.body, undefined); assert.equal(opts.headers, undefined);
  }
  assert.equal(result.source.sha256, createHash('sha256').update(JSON.stringify(source())).digest('hex'));
  assert.equal(result.source.commit, sha); assert.equal(result.entries.length, 1);
  assert.ok(Number.isFinite(Date.parse(result.observedAt)));
});

test('pinned public source retains reviewed notes without downloading the same usage file again', async () => {
  const fake = fakeFetch(source(), { ref: { ...ref, object: { type: 'commit', sha: reference.commit } } });
  assert.deepEqual((await run(fake)).gameUsage, { status: 'reference' });
  assert.equal(fake.calls.length, 2);
});

test('new source without usage counts triggers per-field warning without blocking figure metadata', async () => {
  const figure = { gamesWiiU: [], games3DS: [], gamesSwitch: [], gamesSwitch2: [] };
  const blank = { amiibos: { [reference.profiles[0].figures[0]]: figure } };
  const data = source([entry(), entry('0101000000050002', 'Zelda')]);
  const fetchImpl = async url => response(url === SOURCE.refUrl ? ref : url.endsWith('/games_info.json') ? blank : data);
  const updated = await run({ fetchImpl });
  assert.deepEqual(updated.gameUsage, { status: 'loss', missingNotes: 12513, missingWriteFlags: 1391 });
  assert.equal(updated.counts.added, 1);
});

test('malformed, interrupted and oversized usage responses preserve independent figure metadata', async () => {
  for (const makeResponse of [() => response({}), () => { throw new Error('offline'); },
    () => new Response(null, { headers: { 'content-length': String(LIMITS.usageBytes + 1) } })]) {
    const result = await run({ fetchImpl: async url => url === SOURCE.refUrl ? response(ref)
      : url.endsWith('/games_info.json') ? makeResponse() : response(source()) });
    assert.deepEqual(result.gameUsage, { status: 'unavailable' });
    assert.equal(result.counts.source, 1);
  }
});

test('external cancellation during the usage request never publishes a partial result', async () => {
  const controller = new AbortController();
  const fetchImpl = async url => {
    if (url === SOURCE.refUrl) return response(ref);
    if (url.endsWith('/amiibo.json')) return response(source());
    controller.abort();
    return new Promise(() => {});
  };
  await assert.rejects(run({ fetchImpl, signal: controller.signal }), { name: 'AbortError' });
});

test('timed-out usage request keeps metadata and reports that the game notes are unchecked', async () => {
  const fetchImpl = async url => {
    if (url === SOURCE.refUrl) return response(ref);
    if (url.endsWith('/amiibo.json')) return response(source());
    return new Promise(() => {});
  };
  const result = await run({ fetchImpl, timeoutMs: 150, cryptoImpl: { subtle:{ digest: () => new Uint8Array(32) } } });
  assert.deepEqual(result.gameUsage, { status: 'unavailable' });
  assert.equal(result.counts.source, 1);
});
for (const [name, value] of [
  ['bad sha', { ...ref, object: { type: 'commit', sha: '../main' } }],
  ['tag rather than commit', { ...ref, object: { type: 'tag', sha } }],
  ['wrong branch', { ...ref, ref: 'refs/heads/other' }],
]) test(`ref rejects ${name} before data fetch`, async () => {
  const fake = fakeFetch(source(), { ref: value });
  await assert.rejects(run(fake), isCode('invalid-data')); assert.equal(fake.calls.length, 1);
});
test('URL fields returned by source/ref cannot redirect the fetch', async () => {
  const fake = fakeFetch(source(), { ref: { ...ref, url: 'https://evil.invalid', object: { ...ref.object, url: 'https://evil.invalid' } } });
  await run(fake); assert.ok(fake.calls[1].url.startsWith('https://raw.githubusercontent.com/8bitDream/AmiiboAPI/'));
});
for (const [name, body] of [
  ['duplicate JSON keys', '{"amiibos":{},"amiibos":{}}'],
  ['invalid JSON', '<html>unrelated page</html>'],
  ['invalid UTF8', new Uint8Array([0xc3, 0x28])],
  ['deep JSON', '['.repeat(66) + '0' + ']'.repeat(66)],
]) test(`rejects ${name}`, async () => { await assert.rejects(run(fakeFetch(body)), isCode('invalid-data')); });
test('rejects excessive declared length before reading and cancels the body', async () => {
  let cancelled = false;
  await assert.rejects(run({ fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }),
    { headers: { 'content-length': String(LIMITS.refBytes + 1) } }) }), isCode('too-large'));
  assert.equal(cancelled, true);
});
test('streaming byte bound rejects undeclared overflow and cancels reader', async () => {
  let call = 0, cancelled = false;
  const fetchImpl = async () => ++call === 1 ? response(ref) : new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(LIMITS.bytes)); controller.enqueue(new Uint8Array([1])); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(run({ fetchImpl }), isCode('too-large')); assert.equal(cancelled, true);
});
test('rejects a flood of empty chunks rather than allocating an unbounded collection', async () => {
  let cancelled = false, reads = 0;
  const body = { getReader: () => ({ read: async () => { reads++; return { done: false, value: new Uint8Array() }; },
    cancel: () => { cancelled = true; }, releaseLock() {} }) };
  await assert.rejects(run({ fetchImpl: async () => ({ ok: true, status: 200, body }) }), isCode('too-large'));
  assert.equal(reads, LIMITS.chunks + 1); assert.equal(cancelled, true);
});
for (const [status, code] of [[403, 'rate-limit'], [429, 'rate-limit'], [500, 'http']])
  test(`reports HTTP ${status}`, async () => assert.rejects(run({ fetchImpl: async () => new Response('', { status }) }), isCode(code)));
test('network/CORS error is described without claiming a specific cause', async () => {
  await assert.rejects(run({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), error =>
    isCode('network')(error) && /CORS/u.test(error.message));
});
test('HTML content-type, redirects and opaque responses are rejected', async () => {
  await assert.rejects(run({ fetchImpl: async () => new Response('{}', { headers: { 'content-type': 'text/html' } }) }), isCode('invalid-data'));
  for (const extra of [{ redirected: true }, { url: 'https://other.invalid' }, { type: 'opaque' }])
    await assert.rejects(run({ fetchImpl: async () => ({ ...extra, ok: true, status: 200 }) }), isCode('source-redirect'));
});
test('unsupported crypto/streaming fail with useful error and no unbounded text() fallback', async () => {
  let fetched = false;
  await assert.rejects(run({ cryptoImpl: null, fetchImpl: async () => { fetched = true; } }), isCode('unsupported-browser'));
  assert.equal(fetched, false);
  await assert.rejects(run({ fetchImpl: async () => ({ ok: true, status: 200, text() { throw new Error('must not call'); } }) }), isCode('unsupported-browser'));
});
test('already aborted requests never fetch', async () => {
  const controller = new AbortController(); controller.abort(); let fetched = false;
  await assert.rejects(run({ signal: controller.signal, fetchImpl: () => { fetched = true; } }), { name: 'AbortError' });
  assert.equal(fetched, false);
});
test('abort settles even when fetch ignores signal; late body is cancelled', async () => {
  const controller = new AbortController(); let complete, cancelled = false;
  const pending = run({ signal: controller.signal, fetchImpl: () => new Promise(resolve => { complete = resolve; }) });
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  complete({ body: { cancel() { cancelled = true; } } });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true);
});
test('abort while streaming cancels reader and cannot publish a partial result', async () => {
  const controller = new AbortController(); let started, cancelled = false;
  const reading = new Promise(resolve => { started = resolve; });
  const pending = run({ signal: controller.signal, fetchImpl: async () => ({ ok: true, status: 200,
    body: { getReader: () => ({ read: () => { started(); return new Promise(() => {}); }, cancel() { cancelled = true; }, releaseLock() {} }) } }) });
  await reading; controller.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(cancelled, true);
});
test('timeout settles a stalled fetch and aborts its signal', async () => {
  let fetchSignal;
  await assert.rejects(run({ timeoutMs: 5, fetchImpl: (url, options) => { fetchSignal = options.signal; return new Promise(() => {}); } }), isCode('timeout'));
  assert.equal(fetchSignal.aborted, true);
});
test('the same total deadline also bounds a stalled response body', async () => {
  let cancelled = false;
  await assert.rejects(run({ timeoutMs: 5, fetchImpl: async () => ({ ok: true, status: 200,
    body: { getReader: () => ({ read: () => new Promise(() => {}), cancel() { cancelled = true; }, releaseLock() {} }) } }) }), isCode('timeout'));
  assert.equal(cancelled, true);
});
test('cancellation during digest prevents stale publication while a separate request succeeds', async () => {
  const controller = new AbortController(); let began;
  const digestStarted = new Promise(resolve => { began = resolve; });
  const old = run({ ...fakeFetch(), signal: controller.signal,
    cryptoImpl: { subtle: { digest: () => { began(); return new Promise(() => {}); } } } });
  await digestStarted; controller.abort(); await assert.rejects(old, { name: 'AbortError' });
  assert.equal((await run(fakeFetch())).counts.source, 1);
});
test('timeout cannot be disabled or enlarged by caller', async () => {
  for (const timeoutMs of [0, -1, Infinity, 25001, 0.5])
    await assert.rejects(run({ ...fakeFetch(), timeoutMs }), isCode('invalid-options'));
});
