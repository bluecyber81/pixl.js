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
async function moduleFixture(pairs=false){
  const testProfile=pairs?{...profile,approvedApplications:[{firmwareVersion:"2.22.0-DE3.31",applicationCounter:603},{firmwareVersion:"2.22.0-DE3.32",applicationCounter:604}]}:profile
  // Only worker/profile boundaries are replaced. This tests workflow guards,
  // NOT physical capacity. The shipped approval gate remains unchanged.
  const file=new URL('../src/lib/migration.js',import.meta.url)
  let source=fs.readFileSync(file,'utf8').replace(/^import \{ getMigrationCapacityTarget \}.*$/m,`const MIGRATION_CAPACITY_TARGET=${JSON.stringify(testProfile)};const getMigrationCapacityTarget=id=>{if(!['current','legacy'].includes(id))throw Error('profile');return MIGRATION_CAPACITY_TARGET};`)
    .replace(/^import \{ migrationTicketStore, validMigrationTicket \}.*$/m,`import {validMigrationTicket} from '${new URL('../src/lib/migration-tickets.js',import.meta.url).href}'; const receipts=new Map(),markers=new Map();const migrationTicketStore={put:async r=>{if(markers.has(r.deviceIdentitySha256))throw Error('consumed');receipts.set(r.archiveSha256+':'+r.deviceIdentitySha256,r)},get:async(a,d)=>receipts.get(a+':'+d),getMarker:async(a,d)=>markers.get(d),mark:async m=>{const key=m.archiveSha256+':'+m.deviceIdentitySha256,old=markers.get(m.deviceIdentitySha256);if(old?.state==='finished'&&m.state!=='finished')throw Error('terminal');markers.set(m.deviceIdentitySha256,m);receipts.delete(key)}};`)
    .replace(/^import \{ simulateCapacityInWorker \}.*$/m,`const simulateCapacityInWorker=async(rows,o)=>({passed:true,capacityProfile:o.capacityProfile,wasmSha256:MIGRATION_CAPACITY_TARGET.wasmSha256,engineSha256:MIGRATION_CAPACITY_TARGET.layout.engineSha256,archiveSha256:o.archiveSha256,verifiedEntries:rows.length,peakUsedBlocks:100,totalBlocks:512,firmwareVersion:MIGRATION_CAPACITY_TARGET.firmwareVersion});`)
    .replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,file).href}'`)
  return import('data:text/javascript;base64,'+Buffer.from(source+`\nexport const inspectTestMarker=(a,d)=>migrationTicketStore.getMarker(a,d);\n// isolated lifecycle fixture ${serial++}`).toString('base64'))
}
async function fixture(pairs=false){
  const api=await moduleFixture(pairs),vfs=memoryVfs(),raw=new Map(),events=[]
  vfs.put('E:/tags/first',[0,1,2,3]);vfs.put('E:/tags/zero',[]);vfs.nodes.set('E:/empty',{type:1,meta:decodeRawMetadata(new Uint8Array(128).fill(255))})
  let importState=state({mounted:false,pending:false}),appIdentity=identity(),mounted=false,bindAfter=null
  const options={...vfs.api,deviceKey:'test-device',firmwareVersion:'2.22.0-DE3.30-PREP',storageInfo:storage(1),
    readRawMetadata:async p=>(raw.get(p)||new Uint8Array(128).fill(255)).slice(),updateRawMetadata:async(p,b)=>{assert(vfs.nodes.has(p));raw.set(p,b.slice());vfs.nodes.get(p).meta=decodeRawMetadata(b);events.push('raw')},
    readStorageLayout:async()=>({...layout,mounted}),readApplicationIdentity:async()=>({...appIdentity}),readImportState:async()=>({...importState}),
    formatStorage:async()=>{events.push('format');for(const p of [...vfs.nodes.keys()])if(p!=='E:/')vfs.nodes.delete(p);raw.clear();mounted=true;importState=state()},
    bindImport:async hash=>{events.push('bind');assert(importState.pending);if(importState.bound&&importState.archiveSha256!==hash)throw Error('different');importState=state({bound:true,archiveSha256:hash});if(bindAfter)bindAfter();return {...importState}},
    finishImport:async()=>{events.push('finish');assert(importState.bound);importState={...importState,pending:false,ready:true};return {...importState}},
    restartDevice:async()=>{events.push('restart');return {...importState}},
    confirmFormat:async()=>events.push('confirm-format'),confirmInitialize:async()=>events.push('confirm-bind'),confirmRestart:async()=>events.push('confirm-restart')}
  const archive=await api.loadMigrationArchive((await api.createMigrationBackup(options)).blob,{JSZip})
  const proof=await api.checkMigrationCapacity(archive)
  const source=await api.verifyMigrationArchive({...options,archive})
  const o=()=>({...options,archive,capacityProof:proof,storageInfo:storage(3),firmwareVersion:profile.firmwareVersion})
  return {api,vfs,raw,events,options,archive,proof,source,o,setIdentity:x=>{appIdentity=x},setState:x=>{importState=x;mounted=x.mounted},getState:()=>importState,afterBind:fn=>{bindAfter=fn}}
}
const mutations=f=>f.events.filter(x=>['format','bind','finish','restart','raw'].includes(x)).length+f.vfs.log.filter(x=>['write','rename','remove','mkdir','meta'].includes(x.op)).length
async function prepared(f){await f.api.retainMigrationSource({archive:f.archive,report:f.source},{put:async()=>{}});await f.api.formatMigrationTarget(f.o());await f.api.initializeMigrationImport(f.o())}

test('exact target layout, current counter and CRC are all required; version alone never grants a match',()=>{
  assert.equal(matchMigrationLayout({...layout,mounted:false},identity(),profile).mounted,false)
  for(const key of Object.keys(layout)){const changed={...layout,mounted:true,[key]:typeof layout[key]==='number'?layout[key]+1:'wrong'};assert.throws(()=>matchMigrationLayout(changed,identity(),profile),{code:'MIGRATION_LAYOUT'})}
  for(const value of [{...identity(),settingsCrcValid:false},{...identity(),applicationCounter:602},{...identity(),firmwareVersion:'2.22.0-DE3.30'},null])assert.throws(()=>matchMigrationLayout({...layout,mounted:true},value,profile))
  assert.throws(()=>matchMigrationLayout({...layout,mounted:false},identity(),profile,{mounted:true}));assert.throws(()=>matchMigrationLayout({...layout,mounted:true},identity(),{...profile,approved:false}))
})
test('fresh source receipt, capacity proof and explicit confirmations precede first format and bind',async()=>{
  const f=await fixture();await assert.rejects(f.api.formatMigrationTarget(f.o()),{code:'MIGRATION_TICKET'});assert.equal(mutations(f),0)
  await assert.rejects(f.api.retainMigrationSource({archive:f.archive,report:{...f.source}}),{code:'MIGRATION_TICKET'})
  await prepared(f);assert.deepEqual(f.events,['confirm-format','format','confirm-bind','bind']);assert.equal(f.getState().archiveSha256,f.archive.archiveSha256)
  await assert.rejects(f.api.formatMigrationTarget(f.o()),{code:'MIGRATION_PENDING'});assert.equal(f.events.filter(x=>x==='format').length,1)
})
test('different device or changed target after format confirmation prevents the destructive command',async()=>{
  const f=await fixture();await f.api.retainMigrationSource({archive:f.archive,report:f.source},{put:async()=>{}})
  await assert.rejects(f.api.formatMigrationTarget({...f.o(),deviceKey:'different'}),{code:'MIGRATION_TICKET'})
  await assert.rejects(f.api.formatMigrationTarget({...f.o(),confirmFormat:async()=>f.setIdentity({...identity(),applicationCounter:604})}),{code:'MIGRATION_LAYOUT'});assert.equal(mutations(f),0)
})
test('an empty pending unbound device can be explicitly initialized after a browser loss without a second format',async()=>{
  const f=await fixture();for(const p of [...f.vfs.nodes.keys()])if(p!=='E:/')f.vfs.nodes.delete(p);f.setState(state())
  await f.api.initializeMigrationImport(f.o());assert.deepEqual(f.events,['confirm-bind','bind']);assert.equal(f.getState().archiveSha256,f.archive.archiveSha256)
  await f.api.initializeMigrationImport(f.o());assert.equal(f.events.filter(x=>x==='bind').length,1)
})
test('wrong bound archive and unexpected unbound data block all restoration mutations',async()=>{
  const f=await fixture();f.setState(state({bound:true,archiveSha256:'b'.repeat(64)}))
  await assert.rejects(f.api.initializeMigrationImport(f.o()),{code:'MIGRATION_LAYOUT'});await assert.rejects(f.api.restoreMigrationArchive(f.o()),{code:'MIGRATION_LAYOUT'})
  f.setState(state());await assert.rejects(f.api.initializeMigrationImport(f.o()),{code:'MIGRATION_EXTRA'});assert.equal(mutations(f),0)
})

test('files appearing while initialization confirmation is open prevent binding the formerly empty target',async()=>{
 const f=await fixture();await f.api.retainMigrationSource({archive:f.archive,report:f.source},{put:async()=>{}})
 await f.api.formatMigrationTarget(f.o())
 await assert.rejects(f.api.initializeMigrationImport({...f.o(),confirmInitialize:async()=>{f.vfs.put('E:/new-user-file',[7,8,9])}}),{code:'MIGRATION_EXTRA'})
 assert(!f.events.includes('bind'));assert.equal(f.getState().bound,false)
 assert.deepEqual(f.vfs.bytes('E:/new-user-file'),[7,8,9])
})

test('cancellation during confirmation or the fresh empty-target scan prevents archive binding',async()=>{
 for(const phase of ['confirmation','fresh-scan']){
  const f=await fixture();await f.api.retainMigrationSource({archive:f.archive,report:f.source},{put:async()=>{}});await f.api.formatMigrationTarget(f.o())
  const controller=new AbortController();let confirmed=false
  await assert.rejects(f.api.initializeMigrationImport({...f.o(),signal:controller.signal,
    confirmInitialize:async()=>{confirmed=true;if(phase==='confirmation')controller.abort()},
    readDirectory:async path=>{const entries=await f.options.readDirectory(path);if(confirmed&&phase==='fresh-scan')controller.abort();return entries}}),{name:'AbortError'})
  assert(!f.events.includes('bind'));assert.equal(f.getState().bound,false)
 }
})
test('restore preserves all bytes/raw128/empty folders then finish freshly rechecks before a separate reboot',async()=>{
  const f=await fixture();await prepared(f);const restored=await f.api.restoreMigrationArchive(f.o());assert.equal(restored.verified,true);assert.deepEqual(f.vfs.bytes('E:/tags/first'),[0,1,2,3]);assert(f.vfs.nodes.has('E:/empty'))
  assert.equal(f.getState().pending,true);assert(!f.events.includes('finish'));assert(!f.events.includes('restart'))
  const start=f.vfs.log.length,result=await f.api.finishMigrationImport(f.o());assert.equal(result.finished,true);assert(f.vfs.log.slice(start).filter(x=>x.op==='read').length>=2);assert.equal(f.getState().ready,true);assert(!f.events.includes('restart'))
  await f.api.restartAfterMigration(f.o());assert.deepEqual(f.events.slice(-2),['confirm-restart','restart'])
  await assert.rejects(f.api.formatMigrationTarget(f.o()),{code:'MIGRATION_PENDING'});assert.equal(f.events.filter(x=>x==='format').length,1)
  f.setState(state({mounted:false,pending:false}));await assert.rejects(f.api.formatMigrationTarget(f.o()),{code:'MIGRATION_TICKET'});assert.equal(f.events.filter(x=>x==='format').length,1)
})
test('a same-length corruption or extra namespace entry prevents persistent finish',async()=>{
  for(const defect of ['bytes','extra','raw']){const f=await fixture();await prepared(f);await f.api.restoreMigrationArchive(f.o())
    if(defect==='bytes')f.vfs.nodes.get('E:/tags/first').bytes[0]=99
    if(defect==='extra')f.vfs.put('E:/extra',[1])
    if(defect==='raw')f.raw.get('E:/tags/first')[127]^=1
    await assert.rejects(f.api.finishMigrationImport(f.o()),{code:'MIGRATION_VERIFY'});assert.equal(f.getState().pending,true);assert(!f.events.includes('finish'))}
})
test('resume removes only deterministic archive-bound stages whose bytes match the expected prefix',async()=>{
  const f=await fixture();await prepared(f);await f.options.createDirectory('E:/tags');const plan=(await migrationStagingPlan(f.archive)).get('E:/tags/first')
  f.vfs.put(plan.stage,[0,1]);const result=await f.api.restoreMigrationArchive(f.o());assert.equal(result.verified,true);assert(!f.vfs.nodes.has(plan.stage));assert(result.attempts.some(x=>x.operation==='recovery-stage-cleanup'&&x.state==='acknowledged'))
})
test('unknown or altered staging entries block before cleanup, preserving all unexpected data',async()=>{
  for(const defect of ['unknown','wrongbytes']){const f=await fixture();await prepared(f);await f.options.createDirectory('E:/tags');const plan=(await migrationStagingPlan(f.archive)).get('E:/tags/first'),path=defect==='unknown'?'E:/~uunknown':plan.stage
    f.vfs.put(path,[99]);const before=mutations(f);await assert.rejects(f.api.restoreMigrationArchive(f.o()),{code:'MIGRATION_EXTRA'});assert.equal(mutations(f),before);assert.deepEqual(f.vfs.bytes(path),[99])}
})
test('cancellation after a format acknowledgement reports uncertainty and never triggers automatic reformat',async()=>{
  const f=await fixture();await f.api.retainMigrationSource({archive:f.archive,report:f.source},{put:async()=>{}});const controller=new AbortController()
  await assert.rejects(f.api.formatMigrationTarget({...f.o(),signal:controller.signal,formatStorage:async()=>{await f.options.formatStorage();controller.abort()}}),error=>error.name==='AbortError'&&error.migrationProgress.attempts[0].state==='acknowledged')
  assert.equal(f.getState().pending,true);assert.equal(f.events.filter(x=>x==='format').length,1);assert(!f.events.includes('bind'))
})

test('ambiguous unmounted first format can only repeat after a second explicit confirmation of the same target/archive',async()=>{
 const f=await fixture();await f.api.retainMigrationSource({archive:f.archive,report:f.source});let writes=0,confirmed
 await assert.rejects(f.api.formatMigrationTarget({...f.o(),formatStorage:async()=>{writes++;throw Error('lost before format')}}));assert.equal(writes,1)
 await assert.rejects(f.api.retainMigrationSource({archive:f.archive,report:f.source}),{code:'MIGRATION_TICKET'})
 await assert.rejects(f.api.formatMigrationTarget({...f.o(),confirmFormat:async value=>{confirmed=value;throw Error('cancel')}}));assert.equal(writes,1);assert.equal(confirmed.recoveryAttempt,true)
 await f.api.formatMigrationTarget({...f.o(),confirmFormat:async value=>{confirmed=value},formatStorage:async()=>{writes++;await f.options.formatStorage()}});assert.equal(writes,2);assert.equal(confirmed.recoveryAttempt,true)
 await assert.rejects(f.api.formatMigrationTarget(f.o()),{code:'MIGRATION_PENDING'})
})

test('actual staging namespace must fit before any capacity proof or format can be authorized',async()=>{
 const api=await moduleFixture(),vfs=memoryVfs(),folder='E:/'+ 'a'.repeat(30)+'/'+ 'b'.repeat(29)
 vfs.nodes.set('E:/'+ 'a'.repeat(30),{type:1,meta:decodeRawMetadata(new Uint8Array(128).fill(255))});vfs.nodes.set(folder,{type:1,meta:decodeRawMetadata(new Uint8Array(128).fill(255))})
 for(const name of '0123456789abc')vfs.put(folder+'/'+name,[])
 const options={...vfs.api,deviceKey:'staging-test',firmwareVersion:'PREP',storageInfo:storage(1),readRawMetadata:async()=>new Uint8Array(128).fill(255)}
 const archive=await api.loadMigrationArchive((await api.createMigrationBackup(options)).blob,{JSZip})
 await assert.rejects(api.checkMigrationCapacity(archive),{code:'MIGRATION_STAGING'})
 assert(!vfs.log.some(x=>['rename','write','remove'].includes(x.op)))
})
test('worker cancellation and timeout terminate synchronous computation without a result or device mutation',async()=>{
  const workers=[];class Worker {constructor(){workers.push(this)}postMessage(x){this.input=x}terminate(){this.stopped=true}}
  const controller=new AbortController(),p=simulateCapacityInWorker([],{WorkerImpl:Worker,signal:controller.signal,archiveSha256:'a'.repeat(64)});controller.abort();await assert.rejects(p,{name:'AbortError'});assert.equal(workers[0].stopped,true)
  await assert.rejects(simulateCapacityInWorker([],{WorkerImpl:Worker,timeoutMs:2}),{code:'MIGRATION_CAPACITY_TIMEOUT'});assert.equal(workers[1].stopped,true)
})
test('malformed import-state objects cannot be accepted as ready or bound',()=>{
  for(const bad of [state({ready:true}),state({bound:true}),state({archiveSha256:'a'.repeat(64)}),state({mounted:false,pending:false,ready:true}),{...state(),backend:2}])assert.throws(()=>checkImportState(bad))
})

test('3.25.5 approved migration pairs are exact and preserve all geometry/CRC gates',async()=>{
 const {LEGACY_MIGRATION_CAPACITY_TARGET:target}=await import('../src/lib/migration-capacity.js')
 for(const [firmwareVersion,applicationCounter]of [['2.22.0-DE3.31',603],['2.22.0-DE3.32',604],['2.22.0-DE3.33',605]])assert(matchMigrationLayout({...target.layout,mounted:true},{firmwareVersion,applicationCounter,settingsCrcValid:true},target))
 for(const [firmwareVersion,applicationCounter]of [['2.22.0-DE3.31',604],['2.22.0-DE3.32',603],['2.22.0-DE3.34',606],['2.22.0-DE3.33',604],['2.22.0-DE3.30-PREP',600]])assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{firmwareVersion,applicationCounter,settingsCrcValid:true},target),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true,engineSha256:'f'.repeat(64)},{firmwareVersion:'2.22.0-DE3.32',applicationCounter:604,settingsCrcValid:true},target))
 assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{firmwareVersion:'2.22.0-DE3.32',applicationCounter:604,settingsCrcValid:false},target))
})
test('3.29 previous engine retains only reviewed DE3.36/608 and DE3.37/609 pairs',async()=>{
 const {PREVIOUS_MIGRATION_CAPACITY_TARGET:target}=await import('../src/lib/migration-capacity.js')
 for(const [firmwareVersion,applicationCounter]of [['2.22.0-DE3.36',608],['2.22.0-DE3.37',609]]){
  const identity={firmwareVersion,applicationCounter,settingsCrcValid:true}
  assert(matchMigrationLayout({...target.layout,mounted:true},identity,target))
  assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true,engineSha256:'f'.repeat(64)},identity,target),{code:'MIGRATION_LAYOUT'})
  assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{...identity,settingsCrcValid:false},target),{code:'MIGRATION_LAYOUT'})
 }
 for(const [firmwareVersion,applicationCounter]of [['2.22.0-DE3.36',609],['2.22.0-DE3.37',608],['2.22.0-DE3.38',610]])
  assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{firmwareVersion,applicationCounter,settingsCrcValid:true},target),{code:'MIGRATION_LAYOUT'})
})

test('3.30.1 retained DE344 engine accepts only exact DE3.42/614, DE3.43/615 and DE3.44/616 pairs',async()=>{
 const {DE344_MIGRATION_CAPACITY_TARGET:target}=await import('../src/lib/migration-capacity.js')
 const layout={...target.layout,mounted:true}
 for(const [firmwareVersion,applicationCounter]of [['2.22.0-DE3.42',614],['2.22.0-DE3.43',615],['2.22.0-DE3.44',616]]){
  const identity={firmwareVersion,applicationCounter,settingsCrcValid:true}
  assert(matchMigrationLayout(layout,identity,target))
  for(const changed of [{firmwareVersion:'2.22.0-DE3.41'},{applicationCounter:613},{settingsCrcValid:false}])
   assert.throws(()=>matchMigrationLayout(layout,{...identity,...changed},target),{code:'MIGRATION_LAYOUT'})
  for(const changed of [{engineSha256:'f'.repeat(64)},{blockCount:511},{metadataBytes:64}])
   assert.throws(()=>matchMigrationLayout({...layout,...changed},identity,target),{code:'MIGRATION_LAYOUT'})
 }
 for(const [firmwareVersion,applicationCounter]of [['2.22.0-DE3.42',615],['2.22.0-DE3.43',614],['2.22.0-DE3.44',615],['2.22.0-DE3.45',617]])
  assert.throws(()=>matchMigrationLayout(layout,{firmwareVersion,applicationCounter,settingsCrcValid:true},target),{code:'MIGRATION_LAYOUT'})
})

test('3.30.1 DE345 and retained DE344 need their exact distinct engine and app identity despite matching geometry',async()=>{
 const {DE345_MIGRATION_CAPACITY_TARGET:current,DE344_MIGRATION_CAPACITY_TARGET:retained}=await import('../src/lib/migration-capacity.js')
 const identity={firmwareVersion:'2.22.0-DE3.45',applicationCounter:617,settingsCrcValid:true}
 const oldIdentity={firmwareVersion:'2.22.0-DE3.44',applicationCounter:616,settingsCrcValid:true}
 assert.deepEqual(current.geometry,retained.geometry)
 assert.notEqual(current.layout.engineSha256,retained.layout.engineSha256)
 assert(matchMigrationLayout({...current.layout,mounted:true},identity,current))
 assert(matchMigrationLayout({...retained.layout,mounted:true},oldIdentity,retained))
 for(const changed of [{firmwareVersion:'2.22.0-DE3.44'},{applicationCounter:616},{settingsCrcValid:false}])
  assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true},{...identity,...changed},current),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...retained.layout,mounted:true},identity,current),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true},oldIdentity,retained),{code:'MIGRATION_LAYOUT'})
 for(const changed of [{blockCount:511},{metadataBytes:64}])
  assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true,...changed},identity,current),{code:'MIGRATION_LAYOUT'})
})

test('3.30.1 DE346 and retained DE345 need their exact distinct engine and app identity despite matching geometry',async()=>{
 const {DE350_MIGRATION_CAPACITY_TARGET:current,DE345_MIGRATION_CAPACITY_TARGET:retained}=await import('../src/lib/migration-capacity.js')
 const identity={firmwareVersion:'2.22.0-DE3.46',applicationCounter:618,settingsCrcValid:true}
 const oldIdentity={firmwareVersion:'2.22.0-DE3.45',applicationCounter:617,settingsCrcValid:true}
 assert.deepEqual(current.geometry,retained.geometry)
 assert.notEqual(current.layout.engineSha256,retained.layout.engineSha256)
 assert(matchMigrationLayout({...current.layout,mounted:true},identity,current))
 assert(matchMigrationLayout({...retained.layout,mounted:true},oldIdentity,retained))
 for(const changed of [{firmwareVersion:'2.22.0-DE3.45'},{applicationCounter:617},{settingsCrcValid:false}])
  assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true},{...identity,...changed},current),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...retained.layout,mounted:true},identity,current),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true},oldIdentity,retained),{code:'MIGRATION_LAYOUT'})
 for(const changed of [{blockCount:511},{metadataBytes:64}])
  assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true,...changed},identity,current),{code:'MIGRATION_LAYOUT'})
})

test('3.30.2 unchanged current engine accepts exact DE346 through DE350 pairs and rejects crossed counters',async()=>{
 const {DE350_MIGRATION_CAPACITY_TARGET:target}=await import('../src/lib/migration-capacity.js')
 for(const [version,counter] of [[46,618],[47,619],[48,620],[49,621],[50,622]]) {
  const identity={firmwareVersion:`2.22.0-DE3.${version}`,applicationCounter:counter,settingsCrcValid:true}
  assert(matchMigrationLayout({...target.layout,mounted:true},identity,target))
  for(const other of [618,619,620,621,622].filter(value=>value!==counter))
   assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{...identity,applicationCounter:other},target),{code:'MIGRATION_LAYOUT'})
  assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true,engineSha256:'00'.repeat(32)},identity,target),{code:'MIGRATION_LAYOUT'})
 }
 assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{firmwareVersion:'2.22.0-DE3.51',applicationCounter:623,settingsCrcValid:true},target),{code:'MIGRATION_LAYOUT'})
})

test('3.25.5 new604 formats bind604; compatible finish preserves an existing603 receipt instead of rewriting its identity',async()=>{
 for(const prior603 of [false,true]){
  const f=await fixture(true);if(!prior603)f.setIdentity({firmwareVersion:'2.22.0-DE3.32',applicationCounter:604,settingsCrcValid:true})
  await prepared(f);const before=await f.api.inspectTestMarker(f.archive.archiveSha256,f.source.deviceIdentitySha256);assert.equal(before.applicationCounter,prior603?603:604)
  f.setIdentity({firmwareVersion:'2.22.0-DE3.32',applicationCounter:604,settingsCrcValid:true});await f.api.restoreMigrationArchive(f.o());await f.api.finishMigrationImport(f.o())
  const after=await f.api.inspectTestMarker(f.archive.archiveSha256,f.source.deviceIdentitySha256);assert.equal(after.state,'finished');assert.equal(after.applicationCounter,before.applicationCounter);assert.equal(after.firmwareVersion,before.firmwareVersion)
 }
})
test('3.25.5 a603 unfinished format receipt cannot authorize a604 format retry or an identity change during confirmation',async()=>{
 const f=await fixture(true);await f.api.retainMigrationSource({archive:f.archive,report:f.source})
 await assert.rejects(f.api.formatMigrationTarget({...f.o(),formatStorage:async()=>{throw Error('ambiguous')}}))
 f.setIdentity({firmwareVersion:'2.22.0-DE3.32',applicationCounter:604,settingsCrcValid:true});await assert.rejects(f.api.formatMigrationTarget(f.o()),{code:'MIGRATION_TICKET'});assert(!f.events.includes('format'))
 const g=await fixture(true);await g.api.retainMigrationSource({archive:g.archive,report:g.source})
 await assert.rejects(g.api.formatMigrationTarget({...g.o(),confirmFormat:async()=>g.setIdentity({firmwareVersion:'2.22.0-DE3.32',applicationCounter:604,settingsCrcValid:true})}),{code:'MIGRATION_IDENTITY'});assert(!g.events.includes('format'))
})


test('DE351 current profile and retained DE350 cannot cross their application or engine identities',async()=>{
 const {DE354_MIGRATION_CAPACITY_TARGET:current,DE350_MIGRATION_CAPACITY_TARGET:retained}=await import('../src/lib/migration-capacity.js')
 const identity={firmwareVersion:'2.22.0-DE3.51',applicationCounter:623,settingsCrcValid:true},old={firmwareVersion:'2.22.0-DE3.50',applicationCounter:622,settingsCrcValid:true}
 assert.deepEqual(current.geometry,retained.geometry);assert.notEqual(current.layout.engineSha256,retained.layout.engineSha256)
 assert(matchMigrationLayout({...current.layout,mounted:true},identity,current));assert(matchMigrationLayout({...retained.layout,mounted:true},old,retained))
 assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true},old,current),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...retained.layout,mounted:true},identity,current),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...current.layout,mounted:true},{...identity,applicationCounter:622},current),{code:'MIGRATION_LAYOUT'})
})

test('unchanged DE351 through DE354 engine accepts only its four exact application/counter pairs',async()=>{
 const {DE354_MIGRATION_CAPACITY_TARGET:target}=await import('../src/lib/migration-capacity.js')
 for(const [firmwareVersion,applicationCounter] of [['2.22.0-DE3.51',623],['2.22.0-DE3.52',624],['2.22.0-DE3.53',625],['2.22.0-DE3.54',626]]){
  const identity={firmwareVersion,applicationCounter,settingsCrcValid:true}
  assert(matchMigrationLayout({...target.layout,mounted:true},identity,target))
  for(const mismatchedCounter of [623,624,625,626,627].filter(value=>value!==applicationCounter))
   assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{...identity,applicationCounter:mismatchedCounter},target),{code:'MIGRATION_LAYOUT'})
  assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},{...identity,settingsCrcValid:false},target),{code:'MIGRATION_LAYOUT'})
 }
})

test('DE355 keeps PFS1 geometry but cannot reuse a DE354 capacity or identity proof',async()=>{
 const {MIGRATION_CAPACITY_TARGET:target,DE354_MIGRATION_CAPACITY_TARGET:previous,getMigrationCapacityTarget}=await import('../src/lib/migration-capacity.js')
 const current={firmwareVersion:'2.22.0-DE3.55',applicationCounter:627,settingsCrcValid:true}
 const old={firmwareVersion:'2.22.0-DE3.54',applicationCounter:626,settingsCrcValid:true}
 assert.equal(getMigrationCapacityTarget(),target);assert.equal(getMigrationCapacityTarget('de354'),previous)
 assert.deepEqual(target.geometry,previous.geometry)
 assert.deepEqual({...target.layout,engineSha256:null},{...previous.layout,engineSha256:null})
 assert.notEqual(target.layout.engineSha256,previous.layout.engineSha256)
 assert.notEqual(target.wasmSha256,previous.wasmSha256);assert.notEqual(target.url,previous.url)
 assert(matchMigrationLayout({...target.layout,mounted:true},current,target))
 assert(matchMigrationLayout({...previous.layout,mounted:true},old,previous))
 for(const observation of [old,{...current,applicationCounter:626},{...current,settingsCrcValid:false}])
  assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},observation,target),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...previous.layout,mounted:true},current,target),{code:'MIGRATION_LAYOUT'})
 assert.throws(()=>matchMigrationLayout({...target.layout,mounted:true},old,previous),{code:'MIGRATION_LAYOUT'})
})

test('the final PFS1 profile requires the matching engine, version, counter and settings CRC for 636 through 641',async()=>{
 const {MIGRATION_CAPACITY_TARGET:target}=await import('../src/lib/migration-capacity.js')
 const layout={...target.layout,mounted:true}
 for (const [version,counter] of [['2.22.0-DE3.64',636],['2.22.0-DE3.65',637],['2.22.0-DE3.66',638],['2.22.0-DE3.67',639],['2.22.0-DE3.68',640],['2.22.0-DE3.69',641]]) {
  const observation={firmwareVersion:version,applicationCounter:counter,settingsCrcValid:true}
  assert(matchMigrationLayout(layout,observation,target))
  for (const altered of [{...observation,applicationCounter:counter-1},{...observation,settingsCrcValid:false}])
   assert.throws(()=>matchMigrationLayout(layout,altered,target),{code:'MIGRATION_LAYOUT'})
  assert.throws(()=>matchMigrationLayout({...layout,engineSha256:'ab'.repeat(32)},observation,target),{code:'MIGRATION_LAYOUT'})
 }
})
