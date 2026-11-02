import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {memoryVfs} from './helpers/memory-vfs.mjs'
import {decodeRawMetadata} from '../src/lib/raw-metadata.js'
import {migrationStagingPlan} from '../src/lib/migration-staging.js'
import {matchMigrationLayout,checkImportState} from '../src/lib/migration-layout.js'
import {simulateCapacityInWorker} from '../src/lib/migration-capacity-worker-client.js'
const require=createRequire(import.meta.url),JSZip=require('../public/dfu/vendor/jszip-3.10.2.min.js')
const layout={schema:1,drive:'E',backend:3,magic:0x31534650,flashBytes:2097152,blockSize:4096,blockCount:512,
  readSize:256,progSize:256,cacheSize:256,metadataBytes:128,shardTarget:32768,maxShards:64,pathCap:64,nameCap:48,maxHandles:8,flags:7,engineSha256:'c'.repeat(64)}
const profile={approved:true,layout,firmwareVersion:'2.22.0-DE3.31',applicationCounter:603,wasmSha256:'d'.repeat(64)}
const identity=()=>({firmwareVersion:profile.firmwareVersion,applicationCounter:603,settingsCrcValid:true})
const storage=backend=>({schema:1,drive:'E',backend,mounted:true,flags:7,metaLen:128,pathMax:64,nameMax:48})
const state=(overrides={})=>({schema:1,drive:'E',backend:3,mounted:true,pending:true,ready:false,bound:false,rebootRequired:true,archiveSha256:null,...overrides})
let serial=0
async function moduleFixture(countNames=false){
  // Only worker/profile boundaries are replaced. This tests workflow guards,
  // NOT physical capacity. The shipped approval gate remains unchanged.
  const file=new URL('../src/lib/migration.js',import.meta.url)
  let source=fs.readFileSync(file,'utf8').replace(/^import \{ getMigrationCapacityTarget \}.*$/m,`const MIGRATION_CAPACITY_TARGET=${JSON.stringify(profile)};const getMigrationCapacityTarget=id=>{if(!['current','legacy'].includes(id))throw Error('profile');return MIGRATION_CAPACITY_TARGET};`)
    .replace(/^import \{ migrationTicketStore, validMigrationTicket \}.*$/m,`import {validMigrationTicket} from '${new URL('../src/lib/migration-tickets.js',import.meta.url).href}'; const receipts=new Map(),markers=new Map();const migrationTicketStore={put:async r=>{if(markers.has(r.deviceIdentitySha256))throw Error('consumed');receipts.set(r.archiveSha256+':'+r.deviceIdentitySha256,r)},get:async(a,d)=>receipts.get(a+':'+d),getMarker:async(a,d)=>markers.get(d),mark:async m=>{const key=m.archiveSha256+':'+m.deviceIdentitySha256,old=markers.get(m.deviceIdentitySha256);if(old?.state==='finished'&&m.state!=='finished')throw Error('terminal');markers.set(m.deviceIdentitySha256,m);receipts.delete(key)}};`)
    .replace(/^import \{ simulateCapacityInWorker \}.*$/m,`const simulateCapacityInWorker=async(rows,o)=>({passed:true,capacityProfile:o.capacityProfile,wasmSha256:MIGRATION_CAPACITY_TARGET.wasmSha256,engineSha256:MIGRATION_CAPACITY_TARGET.layout.engineSha256,archiveSha256:o.archiveSha256,verifiedEntries:rows.length,peakUsedBlocks:100,totalBlocks:512,firmwareVersion:MIGRATION_CAPACITY_TARGET.firmwareVersion});`)
    .replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,file).href}'`)
  if(countNames)source=source.replace('assertDeviceEntryName, portableNameKey }','assertDeviceEntryName, portableNameKey as normalizeMigrationName }')+
    '\nlet normalizationCount=0; function portableNameKey(value){normalizationCount++;return normalizeMigrationName(value)}; export const resetNormalizationCount=()=>{normalizationCount=0}; export const getNormalizationCount=()=>normalizationCount;'
  return import('data:text/javascript;base64,'+Buffer.from(source+`\n// isolated lifecycle fixture ${serial++}`).toString('base64'))
}
async function fixture(extraFiles=0,countNames=false,rawSeed=null){
  const api=await moduleFixture(countNames),vfs=memoryVfs(),raw=new Map(),events=[]
  vfs.put('E:/tags/first',[0,1,2,3]);vfs.put('E:/tags/zero',[]);vfs.nodes.set('E:/empty',{type:1,meta:decodeRawMetadata(new Uint8Array(128).fill(255))})
  for(let i=0;i<extraFiles;i++)vfs.put(`E:/tags/file-${String(i).padStart(4,'0')}`,[i&255])
  let importState=state({mounted:false,pending:false}),appIdentity=identity(),mounted=false,bindAfter=null
  const options={...vfs.api,deviceKey:'test-device',firmwareVersion:'2.22.0-DE3.30-PREP',storageInfo:storage(1),
    readRawMetadata:async p=>(raw.get(p)||new Uint8Array(128).fill(255)).slice(),updateRawMetadata:async(p,b)=>{assert(vfs.nodes.has(p));raw.set(p,b.slice());vfs.nodes.get(p).meta=decodeRawMetadata(b);events.push('raw')},
    readStorageLayout:async()=>({...layout,mounted}),readApplicationIdentity:async()=>({...appIdentity}),readImportState:async()=>({...importState}),
    formatStorage:async()=>{events.push('format');for(const p of [...vfs.nodes.keys()])if(p!=='E:/')vfs.nodes.delete(p);raw.clear();mounted=true;importState=state()},
    bindImport:async hash=>{events.push('bind');assert(importState.pending);if(importState.bound&&importState.archiveSha256!==hash)throw Error('different');importState=state({bound:true,archiveSha256:hash});if(bindAfter)bindAfter();return {...importState}},
    finishImport:async()=>{events.push('finish');assert(importState.bound);importState={...importState,pending:false,ready:true};return {...importState}},
    restartDevice:async()=>{events.push('restart');return {...importState}},
    confirmFormat:async()=>events.push('confirm-format'),confirmInitialize:async()=>events.push('confirm-bind'),confirmRestart:async()=>events.push('confirm-restart')}
  if(rawSeed){raw.set('E:/tags/first',rawSeed.slice());vfs.nodes.get('E:/tags/first').meta=decodeRawMetadata(rawSeed)}
  const archive=await api.loadMigrationArchive((await api.createMigrationBackup(options)).blob,{JSZip})
  const proof=await api.checkMigrationCapacity(archive)
  const source=await api.verifyMigrationArchive({...options,archive})
  const o=()=>({...options,archive,capacityProof:proof,storageInfo:storage(3),firmwareVersion:profile.firmwareVersion})
  return {api,vfs,raw,events,options,archive,proof,source,o,setIdentity:x=>{appIdentity=x},setState:x=>{importState=x;mounted=x.mounted},getState:()=>importState,afterBind:fn=>{bindAfter=fn}}
}
const mutations=f=>f.events.filter(x=>['format','bind','finish','restart','raw'].includes(x)).length+f.vfs.log.filter(x=>['write','rename','remove','mkdir','meta'].includes(x.op)).length
async function prepared(f){await f.api.retainMigrationSource({archive:f.archive,report:f.source},{put:async()=>{}});await f.api.formatMigrationTarget(f.o());await f.api.initializeMigrationImport(f.o())}

function atomicOptions(f,afterCommit=()=>{}){
 return {...f.o(),storageInfo:{...storage(3),flags:15},writeFile:async(path,bytes,options={})=>{
  assert(options.rawMeta128 instanceof Uint8Array);assert.equal(options.rawMeta128.length,128)
  // Model the newly advertised atomic primitive. Actual flash failure atomicity
  // is covered independently by the firmware tests, not this JS fixture.
  await f.options.writeFile(path,bytes,options);f.raw.set(path,options.rawMeta128.slice());f.vfs.nodes.get(path).meta=decodeRawMetadata(options.rawMeta128)
  await afterCommit(path,bytes,options)
 }}
}
test('atomic capability restores exact raw128 including readonly and opaque tail in one file commit',async()=>{
 const raw=new Uint8Array(128).fill(255);raw.set([2,2,4]);raw[127]=41
 const f=await fixture(0,false,raw);await prepared(f);f.vfs.log.length=0;f.events.length=0
 const result=await f.api.restoreMigrationArchive({...atomicOptions(f),deferFinalVerification:true})
 assert.equal(result.verified,false);assert.equal(result.deferred,true)
 assert.deepEqual(f.vfs.log.filter(x=>['write','meta','rename','remove'].includes(x.op)).map(x=>x.op),['write','write'])
 assert.deepEqual(f.raw.get('E:/tags/first'),raw);assert.equal(f.vfs.nodes.get('E:/tags/first').meta.flags.readonly,true)
 assert.equal(f.events.filter(x=>x==='raw').length,2,'only two directory attributes need separate raw writes')
 const done=await f.api.finishMigrationImport(f.o());assert.equal(done.verification.filesVerified,2);assert.equal(done.finished,true)
});
test('atomic replacement uses the real target without a public stage or rename and checks final bytes',async()=>{
 const f=await fixture();await prepared(f);await f.options.createDirectory('E:/tags');f.vfs.put('E:/tags/first',[0,1]);f.vfs.log.length=0
 let replacements=0;await f.api.restoreMigrationArchive({...atomicOptions(f,(path,bytes,o)=>{if(path==='E:/tags/first'){assert.equal(o.atomicReplace,true);replacements++}}),deferFinalVerification:true})
 assert.equal(replacements,1);assert(!f.vfs.log.some(x=>['rename','remove','meta'].includes(x.op)))
 assert.deepEqual(f.vfs.bytes('E:/tags/first'),[0,1,2,3]);assert.equal((await f.api.finishMigrationImport(f.o())).finished,true)
});
test('lost atomic close acknowledgement invalidates namespace without retry or deleting the target',async()=>{
 const f=await fixture();await prepared(f);f.vfs.log.length=0;let writes=0
 await assert.rejects(f.api.restoreMigrationArchive({...atomicOptions(f,()=>{writes++;throw Error('lost atomic CLOSE ACK')}),deferFinalVerification:true}),e=>{
  assert.equal(e.migrationProgress.namespace.invalidated,true);assert.equal(e.uploadReceipt?.committed,undefined)
  assert.equal(e.migrationUploadReceipt.committed,null);assert(e.recoveryFiles.some(x=>x.role==='target'));return /lost atomic/.test(e.message)
 })
 assert.equal(writes,1);assert(!f.vfs.log.some(x=>['rename','remove','meta'].includes(x.op)));assert(f.vfs.nodes.has('E:/tags/first'));assert(!f.events.includes('finish'))
 await f.api.restoreMigrationArchive({...atomicOptions(f),deferFinalVerification:true});assert.equal((await f.api.finishMigrationImport(f.o())).finished,true)
});
test('atomic acknowledged corruption still blocks final import completion',async()=>{
 for(const field of ['bytes','raw']){
  const f=await fixture();await prepared(f)
  await f.api.restoreMigrationArchive({...atomicOptions(f,path=>{if(path==='E:/tags/first'){if(field==='bytes')f.vfs.nodes.get(path).bytes[0]^=1;else f.raw.get(path)[127]^=1}}),deferFinalVerification:true})
  await assert.rejects(f.api.finishMigrationImport(f.o()),{code:'MIGRATION_VERIFY'});assert(!f.events.includes('finish'));assert(f.getState().pending)
 }
});


const mutops=new Set(['mkdir','write','meta','rename','remove'])
const trace=f=>f.vfs.log.filter(x=>mutops.has(x.op)).map(x=>[x.op,...x.args.map(v=>v instanceof Uint8Array?[...v]:v)])
test('fast pending restore has no intermediate content/raw reads or free-space probes; remains unverified until finish',async()=>{
 const f=await fixture();await prepared(f);f.vfs.log.length=0;let rawReads=0
 const result=await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true,readRawMetadata:async()=>{rawReads++;throw Error('intermediate raw read')}})
 assert.equal(result.verified,false);assert.equal(result.verification,null);assert.equal(result.deferred,true);assert.equal(result.readyForFinalVerification,true)
 assert.equal(rawReads,0);assert(!f.vfs.log.some(x=>x.op==='read'||x.op==='free'));assert(!f.events.includes('finish'))
 assert.deepEqual(f.vfs.log.filter(x=>['write','meta','rename'].includes(x.op)).map(x=>x.op),['write','meta','rename','write','meta','rename'])
 const done=await f.api.finishMigrationImport(f.o());assert.equal(done.finished,true);assert.equal(done.verification.filesVerified,2)
})
test('ephemeral namespace reduces physical lists with identical mutations, bytes, raw attributes and empty folders',async()=>{
 const f=await fixture();await prepared(f);const nodes=structuredClone(f.vfs.nodes),raw=structuredClone(f.raw);f.vfs.log.length=0
 const indexed=await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true});const indexedTrace=trace(f),firstLists=f.vfs.log.filter(x=>x.op==='list').length,firstNodes=structuredClone(f.vfs.nodes),firstRaw=structuredClone(f.raw)
 f.vfs.nodes.clear();for(const [k,v]of nodes)f.vfs.nodes.set(k,v);f.raw.clear();for(const [k,v]of raw)f.raw.set(k,v);f.vfs.log.length=0
 await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true,useNamespaceIndex:false})
 assert.deepEqual(trace(f),indexedTrace);assert.deepEqual(f.vfs.nodes,firstNodes);assert.deepEqual(f.raw,firstRaw)
 assert(firstLists<f.vfs.log.filter(x=>x.op==='list').length);assert.equal(indexed.namespace.cachedListings,2)
})
test('size-matching corruption is never called verified, final comparison blocks seal and its bound repair rewrites exact bad files',async()=>{
 const f=await fixture();await prepared(f);await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true});f.vfs.nodes.get('E:/tags/first').bytes[0]=99;f.vfs.log.length=0
 await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true});assert(!f.vfs.log.some(x=>x.op==='write'||x.op==='read'))
 let evidence;await assert.rejects(f.api.finishMigrationImport(f.o()),e=>{evidence=e.verification;return e.code==='MIGRATION_VERIFY'&&evidence.differences.some(d=>d.reason==='sha256')});assert(!f.events.includes('finish'))
 await assert.rejects(f.api.restoreMigrationArchive({...f.o(),repairVerification:{...evidence},deferFinalVerification:true}),{code:'MIGRATION_REPAIR'})
 f.vfs.log.length=0;const repair=await f.api.restoreMigrationArchive({...f.o(),repairVerification:evidence,deferFinalVerification:true});assert.equal(repair.verified,false)
 assert.equal(f.vfs.log.filter(x=>x.op==='write').length,1);assert.deepEqual(f.vfs.bytes('E:/tags/first'),[0,1,2,3]);assert.equal((await f.api.finishMigrationImport(f.o())).finished,true)
})
test('actual mutation followed by lost ACK stops immediately for mkdir/write/meta/rename/remove/raw and invalidates namespace',async()=>{
 for(const op of ['mkdir','write','meta','rename','remove','raw']){
  const f=await fixture();await prepared(f)
  if(op==='remove'){await f.options.createDirectory('E:/tags');f.vfs.put('E:/tags/first',[0,1])}
  let observed=false,afterFailure=0
  f.vfs.setHook(({when,op:actual})=>{if(when==='before'&&observed&&mutops.has(actual))afterFailure++;if(when==='after'&&actual===op&&!observed){observed=true;throw Error('lost '+op+' ACK')}})
  const options={...f.o(),deferFinalVerification:true}
  if(op==='raw')options.updateRawMetadata=async(...args)=>{await f.options.updateRawMetadata(...args);observed=true;throw Error('lost raw ACK')}
  await assert.rejects(f.api.restoreMigrationArchive(options),e=>{assert.equal(e.migrationProgress.namespace.invalidated,true);return /lost/.test(e.message)})
  assert(observed);assert.equal(afterFailure,0);assert(!f.events.includes('finish'))
 }
})
test('abort after stage write preserves the stage; fresh resume checks its prefix before cleanup without promoting early',async()=>{
 const f=await fixture();await prepared(f);const controller=new AbortController()
 f.vfs.setHook(({when,op})=>{if(when==='after'&&op==='write')controller.abort()})
 await assert.rejects(f.api.restoreMigrationArchive({...f.o(),signal:controller.signal,deferFinalVerification:true}),{name:'AbortError'})
 assert(!f.vfs.nodes.has('E:/tags/first'));const plan=(await migrationStagingPlan(f.archive)).get('E:/tags/first');assert(f.vfs.nodes.has(plan.stage))
 f.vfs.setHook(()=>{});f.vfs.log.length=0;await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true})
 assert(!f.vfs.nodes.has(plan.stage));assert(f.vfs.log.some(x=>x.op==='read'&&x.args[0]===plan.stage));assert.equal((await f.api.finishMigrationImport(f.o())).finished,true)
})
test('abort after first replacement rename completes the commit then stops before raw metadata or another file',async()=>{
 const f=await fixture();await prepared(f);await f.options.createDirectory('E:/tags');f.vfs.put('E:/tags/first',[0,1]);f.vfs.log.length=0;f.events.length=0
 const controller=new AbortController();f.vfs.setHook(({when,op,count})=>{if(when==='after'&&op==='rename'&&count===1)controller.abort()})
 await assert.rejects(f.api.restoreMigrationArchive({...f.o(),signal:controller.signal,deferFinalVerification:true}),{name:'AbortError'})
 assert.deepEqual(f.vfs.bytes('E:/tags/first'),[0,1,2,3]);assert.equal(f.vfs.log.filter(x=>x.op==='rename').length,2);assert.equal(f.vfs.log.filter(x=>x.op==='remove').length,1);assert(!f.events.includes('raw'));assert(!f.vfs.nodes.has('E:/tags/zero'))
})
test('session change during stage write prevents promotion and cannot reuse the old namespace on fresh resume',async()=>{
 const f=await fixture();await prepared(f);f.vfs.setHook(({when,op})=>{if(when==='after'&&op==='write')f.vfs.disconnect()})
 await assert.rejects(f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true}),e=>e.code==='SESSION_CHANGED'&&e.migrationProgress.namespace.invalidated)
 assert(!f.vfs.nodes.has('E:/tags/first'));f.vfs.reconnect();f.vfs.setHook(()=>{});await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true});assert.equal((await f.api.finishMigrationImport(f.o())).finished,true)
})
test('acknowledged but corrupt bytes or raw attributes never bypass final seal verification',async()=>{
 for(const mode of ['bytes','raw']){const f=await fixture();await prepared(f)
  const options={...f.o(),deferFinalVerification:true}
  if(mode==='bytes')options.writeFile=async(path,bytes,o)=>{const bad=bytes.slice();if(bad.length)bad[0]^=1;return f.options.writeFile(path,bad,o)}
  else options.updateRawMetadata=async(path,bytes)=>{const bad=bytes.slice();bad[127]^=1;return f.options.updateRawMetadata(path,bad)}
  const result=await f.api.restoreMigrationArchive(options);assert.equal(result.verified,false)
  await assert.rejects(f.api.finishMigrationImport(f.o()),{code:'MIGRATION_VERIFY'});assert(!f.events.includes('finish'));assert(f.getState().pending)
 }
})
test('a corrupt old backup after an ambiguous repair commit is preserved and blocks further restore rather than deleted',async()=>{
 const f=await fixture();await prepared(f);await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true});f.vfs.nodes.get('E:/tags/first').bytes[0]=99
 let report;await assert.rejects(f.api.finishMigrationImport(f.o()),e=>{report=e.verification;return true})
 f.vfs.setHook(({when,op,args})=>{if(when==='after'&&op==='rename'&&args[0]==='E:/tags/first')throw Error('lost repair ACK')})
 await assert.rejects(f.api.restoreMigrationArchive({...f.o(),repairVerification:report,deferFinalVerification:true}))
 f.vfs.setHook(()=>{});const plan=(await migrationStagingPlan(f.archive)).get('E:/tags/first');assert.equal(f.vfs.bytes(plan.backup)[0],99);const before=mutations(f)
 await assert.rejects(f.api.restoreMigrationArchive({...f.o(),repairVerification:report,deferFinalVerification:true}),e=>e.code==='MIGRATION_EXTRA'&&/preserved/.test(e.message))
 assert.equal(mutations(f),before);assert.equal(f.vfs.bytes(plan.backup)[0],99);assert(!f.events.includes('finish'))
})

test('large resumed imports normalize names in linear work and do not rewrite equal-sized file contents',async t=>{
 const f=await fixture(800,true);await prepared(f)
 await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true})
 f.api.resetNormalizationCount();f.vfs.log.length=0
 const result=await f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true})
 t.diagnostic(`${f.api.getNormalizationCount()} migration name normalizations for ${f.archive.entries.length} entries`)
 assert(f.api.getNormalizationCount()<=6*f.archive.entries.length,`normalization calls ${f.api.getNormalizationCount()} for ${f.archive.entries.length} entries`)
 assert.equal(result.completed.length,f.archive.entries.length)
 assert.equal(result.verified,false)
 assert(!f.vfs.log.some(x=>x.op==='read'||x.op==='write'))
 assert.equal((await f.api.finishMigrationImport(f.o())).verification.filesVerified,802)
})

test('the indexed restore preflight still blocks case aliases before any cleanup or file mutation',async()=>{
 const f=await fixture();await prepared(f)
 f.vfs.nodes.set('E:/TAGS',{type:1,meta:decodeRawMetadata(new Uint8Array(128).fill(255))})
 const before=mutations(f)
 await assert.rejects(f.api.restoreMigrationArchive({...f.o(),deferFinalVerification:true}),{code:'MIGRATION_COLLISION'})
 assert.equal(mutations(f),before);assert(f.vfs.nodes.has('E:/TAGS'));assert(!f.vfs.nodes.has('E:/tags'))
})
