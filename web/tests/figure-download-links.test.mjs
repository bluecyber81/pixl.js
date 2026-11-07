import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGURE_DOWNLOAD_LINK_CHANGED, figureDownloadLinkKey, readFigureDownloadLink, writeFigureDownloadLink } from '../src/lib/figure-download-links.js';

const A = '000a000404451c02', B = '0000000404431c02';
const source = 'https://files.example.com/one.bin?signature=a%2Fb';

function useWindow(t, browserWindow) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'window', old);
    else Reflect.deleteProperty(globalThis, 'window');
  });
}

function useStorage(t) {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, url) => values.set(key, url),
    removeItem: key => values.delete(key)
  };
  const browser = Object.assign(new EventTarget(), { localStorage });
  useWindow(t, browser);
  return { values, localStorage, browser };
}

test('links persist under independent canonical IDs and preserve signed URL parameters', t => {
  const { values } = useStorage(t);
  assert.equal(figureDownloadLinkKey(A.toUpperCase()), figureDownloadLinkKey(A));
  assert.notEqual(figureDownloadLinkKey(A), figureDownloadLinkKey(B));
  assert.equal(writeFigureDownloadLink(A.toUpperCase(), source.replace('files', 'FILES')), source);
  const other = 'https://files.example.com/two.bin';
  writeFigureDownloadLink(B, other);
  assert.equal(values.size, 2);
  assert.equal(readFigureDownloadLink(A), source);
  assert.equal(readFigureDownloadLink(B), other);
  assert.equal(writeFigureDownloadLink(A, other), other);
  assert.equal(writeFigureDownloadLink(A, ''), '');
  assert.equal(readFigureDownloadLink(A), '');
  assert.equal(readFigureDownloadLink(B), other);
});

test('invalid input leaves an existing link intact and corrupt stored links are ignored', t => {
  const { values } = useStorage(t);
  writeFigureDownloadLink(A, source);
  for (const url of ['http://files.example.com/a.bin', 'https://a:b@files.example.com/a.bin',
    'https://localhost/a.bin', 'https://files.example.com/' + 'ß'.repeat(1100), null]) {
    assert.throws(() => writeFigureDownloadLink(A, url), { code: 'FIGURE_URL' });
    assert.equal(readFigureDownloadLink(A), source);
  }
  for (const id of [null, 'wrong', '0000000000000000']) {
    assert.equal(figureDownloadLinkKey(id), null);
    assert.equal(readFigureDownloadLink(id), '');
    assert.throws(() => writeFigureDownloadLink(id, source), { code: 'FIGURE_ID' });
  }
  values.set(figureDownloadLinkKey(A), 'javascript:alert(1)');
  assert.equal(readFigureDownloadLink(A), '');
  assert.equal(values.get(figureDownloadLinkKey(A)), 'javascript:alert(1)');
});

test('blocked browser storage permits reading an empty result and reports failed changes', t => {
  useWindow(t, { get localStorage() { throw new DOMException('Blocked', 'SecurityError'); } });
  assert.equal(readFigureDownloadLink(A), '');
  for (const value of [source, '']) {
    assert.throws(() => writeFigureDownloadLink(A, value), { code: 'FIGURE_STORAGE' });
  }
});

test('quota failure preserves previously saved links', t => {
  const { localStorage, browser } = useStorage(t);
  const notices = [];
  browser.addEventListener(FIGURE_DOWNLOAD_LINK_CHANGED, event => notices.push(event.detail));
  writeFigureDownloadLink(A.toUpperCase(), source);
  assert.deepEqual(notices, [A]);
  localStorage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  assert.throws(() => writeFigureDownloadLink(A, 'https://files.example.com/new.bin'), { code: 'FIGURE_STORAGE' });
  assert.deepEqual(notices, [A]);
  assert.equal(readFigureDownloadLink(A), source);
  assert.equal(readFigureDownloadLink(B), '');
  writeFigureDownloadLink(A, '');
  assert.deepEqual(notices, [A, A]);
});
