import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE_PREFERENCES_KEY as KEY, CATALOGUE_PROFILE_FILE_LIMIT as LIMIT, CATALOGUE_PROFILE_FORMAT as FORMAT, exportCatalogueProfile, previewCatalogueProfile, importCatalogueProfile, readCataloguePreferences, updateCataloguePreferences } from '../src/lib/catalogue-preferences.js';
const A='0000000000000001', B='0000000000000002', C='0000000000000003';
const criteria=(query='')=>({query,series:'',kind:'',presence:'',knownOnly:false,favoritesOnly:false});
const filter=(name,query='')=>({name,criteria:criteria(query)});
const state=(favorites=[],filters=[])=>({version:1,favorites,filters});
const bundle=(favorites=[],filters=[])=>JSON.stringify({format:FORMAT,...state(favorites,filters)});
function store(initial){const data=new Map(initial?[[KEY,JSON.stringify(initial)]]:[]);let writes=0;return{data,get writes(){return writes;},getItem:key=>data.get(key)??null,setItem(key,value){writes++;data.set(key,value);}};}
function browser(t,navigator={}){const old=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{navigator}});t.after(()=>old?Object.defineProperty(globalThis,'window',old):Reflect.deleteProperty(globalThis,'window'));}

test('export preserves normalized IDs and language-independent criteria without exporting extra local fields or writing',()=>{
 const storage=store({...state([A],[{name:' Fu\u0308r später ',criteria:{...criteria('Mario'),game:'kirby-air-riders',presence:'observed'}}]),private:'not exported'});
 storage.data.set('other','kept');const before=[...storage.data],doc=JSON.parse(exportCatalogueProfile(storage));
 assert.equal(doc.format,FORMAT);assert.equal(doc.version,1);assert.deepEqual(doc.favorites,[A]);assert.equal(doc.filters[0].name,'Für später');assert.equal(doc.filters[0].criteria.game,'kirby-air-riders');assert.equal(doc.private,undefined);assert.deepEqual([...storage.data],before);assert.equal(storage.writes,0);
 assert.deepEqual(JSON.parse(exportCatalogueProfile(store())),{format:FORMAT,...state()});
});
test('preview reports exact merge/replace conflicts and deletion counts without writes',()=>{
 const storage=store(state([A,C],[filter('Shared','old'),filter('Local')]));
 const p=previewCatalogueProfile(bundle([A,B],[filter('Shared','new'),filter('Imported')]),storage);
 assert.deepEqual(p.incoming,{favorites:2,filters:2});assert.deepEqual(p.favorites.map(r=>r.state),['same','added']);assert.deepEqual(p.filters.map(r=>r.state),['changed','added']);assert.equal(p.filters[0].previous.query,'old');assert.equal(p.filters[0].incoming.query,'new');
 assert.deepEqual(p.modes.merge,{favoritesAdded:1,favoritesRemoved:0,filtersAdded:1,filtersReplaced:0,filtersRemoved:0,conflictsKept:1,favoritesTotal:3,filtersTotal:3,allowed:true});
 assert.deepEqual(p.modes.replace,{favoritesAdded:1,favoritesRemoved:1,filtersAdded:1,filtersReplaced:1,filtersRemoved:1,conflictsKept:0,favoritesTotal:2,filtersTotal:2,allowed:true});assert.equal(storage.writes,0);
});
test('merge keeps local name conflicts, adds new entries and commits one value',async()=>{
 const storage=store(state([A,C],[filter('Shared','old'),filter('Local')]));storage.data.set('other','kept');
 const p=previewCatalogueProfile(bundle([A,B],[filter('Shared','new'),filter('Imported')]),storage),r=await importCatalogueProfile(p,'merge');
 assert.equal(r.changed,true);assert.equal(storage.writes,1);assert.equal(storage.data.get('other'),'kept');assert.deepEqual(readCataloguePreferences(storage),state([A,B,C],[filter('Shared','old'),filter('Local'),filter('Imported')]));
 await assert.rejects(importCatalogueProfile(p,'replace'),{code:'PREF_PREVIEW'});assert.equal(storage.writes,1);
});
test('replace removes local-only entries and supports an explicit empty-profile clear',async()=>{
 const s=store(state([A,C],[filter('Shared','old'),filter('Local')]));await importCatalogueProfile(previewCatalogueProfile(bundle([B],[filter('Shared','new')]),s),'replace');assert.deepEqual(readCataloguePreferences(s),state([B],[filter('Shared','new')]));
 const p=previewCatalogueProfile(bundle(),s);assert.equal(p.modes.replace.favoritesRemoved,1);assert.equal(p.modes.replace.filtersRemoved,1);await importCatalogueProfile(p,'replace');assert.deepEqual(readCataloguePreferences(s),state());assert.equal(s.writes,2);
});
test('policy must be explicit and preview must be authentic and immutable',async()=>{
 const s=store(),p=previewCatalogueProfile(bundle([A]),s);
 for(const mode of ['',undefined,'add','delete'])await assert.rejects(importCatalogueProfile(p,mode),{code:'PREF_POLICY'});
 await assert.rejects(importCatalogueProfile(structuredClone(p),'merge'),{code:'PREF_PREVIEW'});assert.throws(()=>{p.modes.merge.favoritesRemoved=8;},TypeError);assert.throws(()=>{p.favorites[0].id=B;},TypeError);assert.equal(s.writes,0);
});
test('foreign, truncated, unsupported and unknown-field envelopes fail before any write',()=>{
 const s=store(),bad=['{','null','[]','{}',bundle().replace('"version":1','"version":2'),bundle().replace(FORMAT,'other'),JSON.stringify({format:FORMAT,...state(),device:'bad'}),bundle([],[{...filter('x'),private:'bad'}]),bundle([],[{name:'x',criteria:{...criteria(),unexpected:true}}])];
 for(const raw of bad)assert.throws(()=>previewCatalogueProfile(raw,s),{code:'PREF_PROFILE_FORMAT'});assert.equal(s.writes,0);
});
test('invalid IDs and duplicate case-folded IDs or NFC filter names reject the whole profile',()=>{
 const s=store();for(const ids of [[A,A],[A,'0000000000000000'],[A,'bad'],[A,1],['0100000004FD0902','0100000004fd0902']])assert.throws(()=>previewCatalogueProfile(bundle(ids),s),{code:'PREF_FORMAT'});
 assert.throws(()=>previewCatalogueProfile(bundle([],[filter('Für'),filter(' Fu\u0308r ')]),s),{code:'PREF_FORMAT'});assert.equal(s.writes,0);
});
test('existing bounded name/query/presence/type/game validation governs imports',()=>{
 const s=store();for(const name of ['',' ','x'.repeat(49),'bad\nname',null])assert.throws(()=>previewCatalogueProfile(bundle([],[filter(name)]),s),{code:'PREF_NAME'});
 for(const change of [{query:'x'.repeat(201)},{series:3},{kind:null},{presence:'live'},{knownOnly:1},{favoritesOnly:null},{game:'UPPER_CASE'}])assert.throws(()=>previewCatalogueProfile(bundle([],[{name:'x',criteria:{...criteria(),...change}}]),s),{code:'PREF_FORMAT'});assert.equal(s.writes,0);
});
test('4096 favourite/80 filter limits apply independently to input and merged result',async()=>{
 const ids=Array.from({length:4096},(_,i)=>(i+1).toString(16).padStart(16,'0')),filters=Array.from({length:80},(_,i)=>filter('Filter '+i)),s=store(state(ids,filters));
 assert.equal(previewCatalogueProfile(bundle(ids,filters),s).modes.merge.allowed,true);assert.throws(()=>previewCatalogueProfile(bundle([...ids,'ffffffffffffffff']),s),{code:'PREF_LIMIT'});assert.throws(()=>previewCatalogueProfile(bundle([],[...filters,filter('extra')]),s),{code:'PREF_LIMIT'});
 const p=previewCatalogueProfile(bundle(['ffffffffffffffff'],[filter('extra')]),s);assert.equal(p.modes.merge.allowed,false);assert.equal(p.modes.replace.allowed,true);await assert.rejects(importCatalogueProfile(p,'merge'),{code:'PREF_LIMIT'});assert.equal(s.writes,0);await importCatalogueProfile(p,'replace');assert.equal(s.writes,1);
});
test('512KiB input bound counts UTF-8 bytes before parsing and accepts the exact boundary',()=>{
 const s=store(),raw=bundle([],[filter('ä')]),n=Buffer.byteLength(raw);assert.equal(n,raw.length+1);assert.doesNotThrow(()=>previewCatalogueProfile(' '.repeat(LIMIT-n)+raw,s));assert.throws(()=>previewCatalogueProfile(' '.repeat(LIMIT-n+1)+raw,s),{code:'PREF_PROFILE_LIMIT'});assert.throws(()=>previewCatalogueProfile(4,s),{code:'PREF_PROFILE_FORMAT'});assert.equal(s.writes,0);
});
test('intervening local edits invalidate a preview while unrelated keys do not',async()=>{
 const s=store(),p=previewCatalogueProfile(bundle([A],[filter('new')]),s);updateCataloguePreferences({op:'favorite',id:B,enabled:true},s);const before=s.getItem(KEY);await assert.rejects(importCatalogueProfile(p,'replace'),{code:'PREF_STALE'});assert.equal(s.getItem(KEY),before);assert.equal(s.writes,1);
 const fresh=previewCatalogueProfile(bundle([A]),s);s.data.set('unrelated','changed');await importCatalogueProfile(fresh,'merge');assert.deepEqual(readCataloguePreferences(s).favorites,[A,B]);
});
test('quota failure leaves original bytes intact and permits retry of the unchanged preview',async()=>{
 const s=store(state([A])),p=previewCatalogueProfile(bundle([B]),s),before=[...s.data],set=s.setItem;s.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};await assert.rejects(importCatalogueProfile(p,'replace'),{code:'PREF_STORAGE'});assert.deepEqual([...s.data],before);s.setItem=set;await importCatalogueProfile(p,'replace');assert.deepEqual(readCataloguePreferences(s).favorites,[B]);
});
test('blocked storage and corrupt existing preferences are not bypassed by a valid import',()=>{
 const denied={getItem(){throw new DOMException('Blocked','SecurityError');}};assert.throws(()=>exportCatalogueProfile(denied),{code:'PREF_STORAGE'});assert.throws(()=>previewCatalogueProfile(bundle([A]),denied),{code:'PREF_STORAGE'});
 const s=store();s.data.set(KEY,'{bad');assert.throws(()=>previewCatalogueProfile(bundle([A]),s),{code:'PREF_FORMAT'});assert.equal(s.getItem(KEY),'{bad');assert.equal(s.writes,0);
});
test('shared origin lock validates the snapshot only after the lock is granted',async t=>{
 const s=store(),p=previewCatalogueProfile(bundle([A]),s);let grant,key;browser(t,{locks:{request(k,work){key=k;return new Promise((resolve,reject)=>{grant=()=>{try{resolve(work());}catch(e){reject(e);}};});}}});
 const operation=importCatalogueProfile(p,'merge');assert.equal(key,KEY);updateCataloguePreferences({op:'favorite',id:B,enabled:true},s);grant();await assert.rejects(operation,{code:'PREF_STALE'});assert.deepEqual(readCataloguePreferences(s).favorites,[B]);
});
test('unmount/cancel signal while waiting for a lock prevents the eventual commit',async t=>{
 const s=store(),p=previewCatalogueProfile(bundle([A]),s),controller=new AbortController();let grant;browser(t,{locks:{request(k,work){return new Promise((resolve,reject)=>{grant=()=>{try{resolve(work());}catch(e){reject(e);}};});}}});
 const operation=importCatalogueProfile(p,'replace',{signal:controller.signal});controller.abort();grant();await assert.rejects(operation,{code:'PREF_CANCELLED'});assert.equal(s.writes,0);
});
test('no-op imports do not rewrite storage and successful changes retain the old-reader schema',async()=>{
 const s=store(state([A],[filter('x')])),raw=s.getItem(KEY),r=await importCatalogueProfile(previewCatalogueProfile(bundle([A],[filter('x')]),s),'merge');assert.equal(r.changed,false);assert.equal(s.writes,0);assert.equal(s.getItem(KEY),raw);assert.deepEqual(r.preferences,readCataloguePreferences(s));
 await importCatalogueProfile(previewCatalogueProfile(bundle([A,B],[filter('x')]),s),'merge');assert.equal(JSON.parse(s.getItem(KEY)).format,undefined);assert.deepEqual(readCataloguePreferences(s),state([A,B],[filter('x')]));
});
