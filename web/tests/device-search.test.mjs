import test from 'node:test';
import assert from 'node:assert/strict';
import { searchDevice, SEARCH_LIMITS } from '../src/lib/device-search.js';
const file=(name,meta={})=>({name,type:0,size:540,meta});
const folder=name=>({name,type:1,meta:{}});
const catalogue=[{id:'0000000000000002',name:'Mario',series:'Super Smash Bros.',game:'Super Mario'}];
function setup(tree, extra={}){const reads=[];return {reads,run:options=>searchDevice({rootPath:'E:/',query:'mario',catalogue,readDirectory:async path=>{reads.push(path);assert.ok(Object.hasOwn(tree,path),path);return tree[path];},...extra,...options})};}

test('recursive search matches metadata figure names/series without reading files or changing identities',async()=>{
 const original=file('PreserveCase.BIN',{amiibo:{head:0,tail:2},notes:'My note'}), tree={'E:/':[folder('Tags')],'E:/Tags':[original]};
 const frozen=JSON.stringify(tree),h=setup(tree),result=await h.run({query:'smash mario'});
 assert.equal(result.complete,true);assert.equal(result.results.length,1);assert.equal(result.results[0].path,'E:/Tags/PreserveCase.BIN');assert.equal(result.results[0].figureName,'Mario');assert.deepEqual(h.reads,['E:/','E:/Tags']);assert.equal(JSON.stringify(tree),frozen);
});
test('current folder is not recursive and search ignores case and accents',async()=>{
 const h=setup({'E:/':[file('Étoile.BIN',{notes:'Private NOTE'}),folder('Other')],'E:/Other':[file('Etoile.bin')]});
 const result=await h.run({query:'etoile note',recursive:false});assert.equal(result.results.length,1);assert.deepEqual(h.reads,['E:/']);
});
test('invalid metadata never creates a catalogue match but filename stays searchable',async()=>{
 const h=setup({'E:/':[file('safe.bin',{valid:false,amiibo:{head:0,tail:2},notes:'mario'})]});
 assert.equal((await h.run()).matches,0);assert.equal((await h.run({query:'safe'})).matches,1);
});
test('result, entry and folder limits stop reads and clearly identify partial results',async()=>{
 for(const [limits,tree] of [
  [{...SEARCH_LIMITS,results:1},{'E:/':[file('mario1'),file('mario2')]}],
  [{...SEARCH_LIMITS,entries:1},{'E:/':[file('no'),file('mario')]}],
  [{...SEARCH_LIMITS,folders:1},{'E:/':[folder('A')],'E:/A':[file('mario')]}]
 ]){const h=setup(tree),r=await h.run({limits});assert.equal(r.complete,false);assert.equal(r.limited,true);assert.ok(r.results.length<=limits.results);assert.ok(r.entries<=limits.entries);assert.ok(h.reads.length<=limits.folders);}
});
test('depth limit and traversal-like malformed names cannot escape or recurse',async()=>{
 const h=setup({'E:/':[folder('A'),folder('../escape'),folder('bad\\path'),folder('A')],'E:/A':[folder('B')]});
 const r=await h.run({limits:{...SEARCH_LIMITS,depth:1}});assert.deepEqual(h.reads,['E:/','E:/A']);assert.equal(r.skipped,3);assert.equal(r.limited,true);
});
test('aborting during directory read prevents processing and further device requests',async()=>{
 const controller=new AbortController();let finish;const reads=[];
 const pending=searchDevice({rootPath:'E:/',query:'mario',signal:controller.signal,readDirectory:path=>{reads.push(path);return new Promise(resolve=>finish=resolve);}});
 controller.abort();finish([folder('A')]);await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(reads,['E:/']);
});
test('session replacement after an await rejects the stale listing',async()=>{
 let valid=true;const h=setup({'E:/':[]},{assertSession:()=>{if(!valid)throw new Error('stale');},readDirectory:async()=>{valid=false;return [file('mario')];}});
 await assert.rejects(h.run(),/stale/);
});
test('partial progress preserves bounded matches before cancellation without mutating later snapshots',async()=>{
 const controller=new AbortController(), snapshots=[];const h=setup({'E:/':[file('Mario'),folder('A')],'E:/A':[]});
 await assert.rejects(h.run({signal:controller.signal,onProgress:(stats,results)=>{snapshots.push({stats,results});controller.abort();}}),{name:'AbortError'});
 assert.equal(snapshots[0].stats.matches,1);assert.equal(snapshots[0].results[0].name,'Mario');
});
test('malformed listings and invalid budgets fail explicitly; blank search reads nothing',async()=>{
 const h=setup({'E:/':null});await assert.rejects(h.run(),/Invalid directory/);
 const fresh=setup({'E:/':[]});for(const opts of [{query:''},{query:'x'.repeat(201)},{rootPath:'E:/../bad'},{limits:{entries:99999999}}])await assert.rejects(fresh.run(opts));assert.deepEqual(fresh.reads,[]);
});

function tagBytes(size=540, id='0000000000000002') {
 const bytes=new Uint8Array(size); bytes[0]=4; bytes[3]=0x88^4;
 for(let i=0;i<8;i++)bytes[84+i]=parseInt(id.slice(i*2,i*2+2),16);
 return bytes;
}
test('missing-ID lookup is strictly opt-in and never downloads metadata-resolved or filename-matching files',async()=>{
 const reads=[],h=setup({'E:/':[file('hidden.bin'),file('known.bin',{amiibo:{head:0,tail:2}}),file('Mario.bin')]},
  {readFile:async(path,options)=>{reads.push([path,options]);return tagBytes();}});
 assert.equal((await h.run()).matches,2);assert.deepEqual(reads,[]);
 const result=await h.run({inspectMissingIds:true});assert.equal(result.matches,3);
 assert.deepEqual(reads,[['E:/hidden.bin',{maxBytes:540}]]);assert.equal(result.filesRead,1);assert.equal(result.bytesRead,540);
 assert.equal(result.results.find(item=>item.name==='hidden.bin').figureName,'Mario');
 assert.equal(JSON.stringify(result).includes('Uint8Array'),false);
});
test('content search only reads BIN files with known amiibo lengths and invalid metadata does not supply its ID',async()=>{
 const reads=[],h=setup({'E:/':[
  {...file('a.bin'),size:532}, {...file('b.BIN'),size:540}, {...file('c.bin'),size:572}, {...file('d.bin'),size:2048},
  {...file('large.bin'),size:1024*1024},file('note.txt'),folder('folder.bin'),
  file('bad-meta.bin',{valid:false,amiibo:{head:0,tail:99}})
 ]},{readFile:async(path,{maxBytes})=>{reads.push(path);return tagBytes(maxBytes).buffer;}});
 const result=await h.run({recursive:false,inspectMissingIds:true});assert.equal(result.matches,5);
 assert.deepEqual(reads,['E:/a.bin','E:/b.BIN','E:/c.bin','E:/d.bin','E:/bad-meta.bin']);
});
test('file and byte budgets stop content reads while later metadata and filenames still match',async()=>{
 for(const contentLimits of [{files:1,bytes:4096},{files:128,bytes:540}]){
  const reads=[],h=setup({'E:/':[file('unknown1.bin'),file('unknown2.bin'),file('known.bin',{amiibo:{head:0,tail:2}}),file('Mario.bin')]},
   {readFile:async path=>{reads.push(path);return tagBytes();}});
  const r=await h.run({inspectMissingIds:true,contentLimits});assert.deepEqual(reads,['E:/unknown1.bin']);
  assert.equal(r.matches,3);assert.equal(r.contentLimited,true);assert.equal(r.complete,false);assert.equal(r.filesRead,1);assert.equal(r.bytesRead,540);
 }
});
test('a byte budget smaller than the next file does not issue a read',async()=>{
 const h=setup({'E:/':[file('unknown.bin')]},{readFile:()=>{throw Error('must not read');}});
 const r=await h.run({inspectMissingIds:true,contentLimits:{files:1,bytes:539}});assert.equal(r.filesRead,0);assert.equal(r.contentLimited,true);
});
test('malformed tag structure is not falsely assigned a catalogue figure',async()=>{
 const h=setup({'E:/':[file('unknown.bin')]},{readFile:async()=>{const bytes=tagBytes();bytes[3]=0;return bytes;}});
 const r=await h.run({inspectMissingIds:true});assert.equal(r.matches,0);assert.equal(r.invalidFiles,1);assert.equal(r.complete,false);
});
test('cancelling during a content read drains that read, retains earlier results and never reads another file',async()=>{
 const controller=new AbortController(),reads=[],snapshots=[];let finish;
 const h=setup({'E:/':[file('one.bin'),file('two.bin'),file('three.bin')]},{readFile:async path=>{
  reads.push(path);return reads.length===1?tagBytes():new Promise(resolve=>finish=resolve);
 }});
 const p=h.run({inspectMissingIds:true,signal:controller.signal,onProgress:(stats,results)=>snapshots.push({stats,results})});
 while(!finish)await new Promise(setImmediate);controller.abort();finish(tagBytes());await assert.rejects(p,{name:'AbortError'});
 assert.deepEqual(reads,['E:/one.bin','E:/two.bin']);assert.equal(snapshots.at(-1).results[0].name,'one.bin');assert.equal(snapshots.at(-1).stats.filesRead,1);
});
test('session replacement during content read cannot publish its bytes or start another request',async()=>{
 let valid=true;const reads=[],snapshots=[],h=setup({'E:/':[file('one.bin'),file('two.bin')]},{assertSession:()=>{if(!valid)throw Error('stale');},
  readFile:async path=>{reads.push(path);valid=false;return tagBytes();}});
 await assert.rejects(h.run({inspectMissingIds:true,onProgress:(stats,results)=>snapshots.push(results)}),/stale/);
 assert.deepEqual(reads,['E:/one.bin']);assert.deepEqual(snapshots,[]);
});
test('changed file lengths, failed reads and invalid content options fail without a false completion',async()=>{
 for(const readFile of [async()=>new Uint8Array(92),async()=>{throw Error('transport failure');}]){
  const h=setup({'E:/':[file('unknown.bin')]},{readFile});await assert.rejects(h.run({inspectMissingIds:true}));
 }
 const h=setup({'E:/':[]});
 for(const opts of [{inspectMissingIds:true},{inspectMissingIds:'yes'},{contentLimits:{files:129}},{contentLimits:{bytes:0}}])await assert.rejects(h.run(opts));
 assert.deepEqual(h.reads,[]);
});
