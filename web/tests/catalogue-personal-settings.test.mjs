import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFigureLinks, figureDownloadLinkKey, importFigureLinks, LINK_FILE_LIMIT, observeFigureDownloadLink, previewFigureLinks, readFigureDownloadLink, writeFigureDownloadLink } from '../src/lib/figure-download-links.js';
import { CATALOGUE_PREFERENCES_KEY, readCataloguePreferences, updateCataloguePreferences } from '../src/lib/catalogue-preferences.js';

const A = '0000000000000001', B = '0000000000000002', C = '0000000000000003';
const one = 'https://files.example.com/a.bin?signature=one%2Ftwo', two = 'https://files.example.com/b.bin';
const bundle = links => JSON.stringify({ format:'allmiibo.figure-links', version:1, count:links.length, links });
function mockBrowser(t) {
  const map = new Map();
  const storage = { get length() { return map.size; }, key:i => [...map.keys()][i] ?? null,
    getItem:key => map.get(key) ?? null, setItem:(key,value) => map.set(key,value), removeItem:key => map.delete(key) };
  const win = Object.assign(new EventTarget(), { localStorage:storage });
  const old = Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  t.after(() => old ? Object.defineProperty(globalThis,'window',old) : Reflect.deleteProperty(globalThis,'window'));
  return {map,storage,win};
}

test('full URLs and leading-zero IDs survive legacy export and a reversible merge without device or network access', async t => {
  const {map,storage} = mockBrowser(t);
  t.mock.method(globalThis,'fetch',() => assert.fail('import attempted a download'));
  map.set(figureDownloadLinkKey(A),one); map.set('other.preferences','private');
  writeFigureDownloadLink(C,two);
  const original = exportFigureLinks();
  assert.deepEqual(JSON.parse(original).links, [{id:A,url:one},{id:C,url:two}]);
  const text = bundle([{id:A,url:two},{id:B,url:'https://FILES.example.com/Groß.bin'},{id:C,url:two}]);
  const pending = previewFigureLinks(text);
  assert.deepEqual(pending.counts,{added:1,same:1,changed:1,invalid:0,conflict:0});
  let notices = 0;
  const stop = observeFigureDownloadLink(()=>A,()=>notices++);
  const set = t.mock.method(storage,'setItem');
  assert.equal(await importFigureLinks(pending,'add'),1);
  assert.equal(set.mock.callCount(),1,'one storage commit for the whole import');
  assert.equal(notices,1);
  assert.equal(storage.getItem(figureDownloadLinkKey(A)),null,'legacy private URLs are removed after the authoritative snapshot commits');
  assert.equal(readFigureDownloadLink(A),one);
  assert.equal(readFigureDownloadLink(B),'https://files.example.com/Gro%C3%9F.bin');
  assert.equal(await importFigureLinks(previewFigureLinks(text),'replace'),1);
  assert.equal(readFigureDownloadLink(A),two);
  assert.equal(readFigureDownloadLink(C),two);
  writeFigureDownloadLink(B,'');
  assert.equal(readFigureDownloadLink(B),'');
  writeFigureDownloadLink(A,one);
  assert.equal(exportFigureLinks(),original);
  stop();
});

test('invalid, duplicate, oversized, truncated and unknown imports never write a subset', async t => {
  const {map} = mockBrowser(t);
  const badUrls = ['http://files.example.com/a','https://files.example.com/'+'ß'.repeat(1800),'https://a:b@files.example.com/file'];
  for (const url of badUrls) {
    const p = previewFigureLinks(bundle([{id:A,url:one},{id:B,url}]));
    assert.equal(p.counts.invalid,1); await assert.rejects(importFigureLinks(p,'replace'));
  }
  for (const url of [one,two]) {
    const p = previewFigureLinks(bundle([{id:A,url:one},{id:A,url},{id:B,url:two}]));
    assert.equal(p.counts.conflict,2); await assert.rejects(importFigureLinks(p,'add'));
  }
  for (const s of ['{', '{"format":"other","version":1,"count":0,"links":[]}',bundle([]).replace('"count":0','"count":2')]) assert.throws(()=>previewFigureLinks(s),{code:'FIGURE_LINK_FORMAT'});
  assert.throws(()=>previewFigureLinks(' '.repeat(LINK_FILE_LIMIT+1)),{code:'FIGURE_LINK_LIMIT'});
  assert.equal(map.size,0);
});

test('another edit invalidates the preview; quota leaves old bytes and notifications intact', async t => {
  const {map,storage} = mockBrowser(t);
  writeFigureDownloadLink(A,one);
  const pending = previewFigureLinks(bundle([{id:A,url:two},{id:B,url:one}]));
  writeFigureDownloadLink(A,two);
  await assert.rejects(importFigureLinks(pending,'replace'),{code:'FIGURE_LINK_STALE'});
  assert.equal(readFigureDownloadLink(B),'');
  const before=[...map], next=previewFigureLinks(pending.text);
  let notices=0;const stop=observeFigureDownloadLink(()=>B,()=>notices++);
  storage.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
  await assert.rejects(importFigureLinks(next,'add'),{code:'FIGURE_STORAGE'});
  assert.deepEqual([...map],before);assert.equal(notices,0);stop();
});

test('saved filters preserve language-independent fields and explicit overwrite, remove and quota semantics', t => {
  const {storage,map}=mockBrowser(t);
  const criteria={query:'Mario',series:'Super Mario Bros.',kind:'Figure',knownOnly:false,presence:'attention',favoritesOnly:true};
  updateCataloguePreferences({op:'favorite',id:A,enabled:true},storage);
  updateCataloguePreferences({op:'create',name:'  Für später  ',criteria},storage);
  assert.deepEqual(readCataloguePreferences(storage),{version:1,favorites:[A],filters:[{name:'Für später',criteria}]});
  assert.throws(()=>updateCataloguePreferences({op:'create',name:'Fu\u0308r später',criteria},storage),{code:'PREF_EXISTS'});
  updateCataloguePreferences({op:'update',name:'Für später',criteria:{...criteria,query:''}},storage);
  assert.equal(readCataloguePreferences(storage).filters[0].criteria.query,'');
  const before=map.get(CATALOGUE_PREFERENCES_KEY);
  assert.throws(()=>updateCataloguePreferences({op:'update',name:'Für später',criteria:{...criteria,presence:'bad'}},storage));
  assert.equal(map.get(CATALOGUE_PREFERENCES_KEY),before);
  updateCataloguePreferences({op:'remove',name:'Für später'},storage);
  storage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>updateCataloguePreferences({op:'favorite',id:A,enabled:false},storage));
  assert.deepEqual(readCataloguePreferences(storage),{version:1,favorites:[A],filters:[]});
});
