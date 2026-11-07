import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse,compileScript,compileTemplate } from '@vue/compiler-sfc'
import * as Vue from 'vue'
const file=process.env.PIXL_MIGRATION_SOURCE?new URL(process.env.PIXL_MIGRATION_SOURCE):new URL('../src/components/MigrationAssistant.vue',import.meta.url)
const {descriptor}=parse(fs.readFileSync(file,'utf8'),{filename:file.pathname})
const vueImports=source=>source.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,(_,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=Vue;`)
const script=compileScript(descriptor,{id:'migration-ui'}).content.replace(/^import .*$/gm,'').replace('export default','const component=')
// Render every static option as a VNode: this lightweight host deliberately has no HTML parser.
// Five options cross Vue's static-string optimization threshold; no UI assertions are removed.
const template=vueImports(compileTemplate({source:descriptor.template.content,id:'migration-ui',filename:file.pathname,compilerOptions:{hoistStatic:false}}).code).replace('export function render','function render')
const makeComponent=new Function('Vue','createMigrationBackup','loadMigrationArchive','verifyMigrationArchive','restoreMigrationArchive','checkMigrationCapacity','MIGRATION_CAPACITY_TARGET','saveBlob','retainMigrationSource','inspectMigrationTarget','formatMigrationTarget','initializeMigrationImport','finishMigrationImport','restartAfterMigration','getMigrationCapacityTarget',script+'\n'+template+'\ncomponent.render=render;return component;')
const node=(type,text='')=>({type,text,props:{},children:[],parent:null})
const renderer=Vue.createRenderer({createElement:t=>node(t),createText:t=>node('#text',t),createComment:t=>node('#comment',t),
  setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[]},patchProp:(n,k,o,v)=>n.props[k]=v,
  insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=p.children.indexOf(a);i<0?p.children.push(n):p.children.splice(i,0,n)},
  remove(n){n.parent?.children.splice(n.parent.children.indexOf(n),1);n.parent=null},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null})
const text=n=>n.text+n.children.map(text).join(''),flat=n=>[n,...n.children.flatMap(flat)]
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise}}
function mount(overrides={}){
 const events=[],calls=[],saves=[],root=node('root'),archive=Object.freeze({version:2,fileCount:2,directoryCount:1,byteCount:540,archiveSha256:'a'.repeat(64)})
 const methods={backup:async()=>({blob:new Blob(['zip']),filename:'backup.zip'}),load:async()=>archive,verify:async()=>({verified:true,kind:'migration-source-verification',filesVerified:2,bytesVerified:540,migrationReady:false}),restore:async()=>{throw Error('Unexpected restore')},capacity:async()=>{throw Error('Not approved')},...overrides}
 const unexpected=async()=>{throw Error('Unexpected mutation')}
 const Component=makeComponent(Vue,async o=>{calls.push(['backup',o]);return methods.backup(o)},async(f,o)=>{calls.push(['load',f,o]);return methods.load(f,o)},async o=>{calls.push(['verify',o]);return methods.verify(o)},methods.restore,methods.capacity,{approved:overrides.approved===true},(...a)=>saves.push(a),methods.retain|| (async()=>({retained:true,persistent:true})),methods.inspect||unexpected,methods.format||unexpected,methods.initialize||unexpected,methods.finish||unexpected,methods.restart||unexpected,overrides.getCapacityTarget|| (profile=>({approved:overrides.approved===true})))
 const props=Vue.reactive({connected:true,blocked:false,generation:1,language:'de_DE',getSession:()=>{const generation=props.generation;return {deviceKey:'A',firmwareVersion:'2.22.0-DE3.30-PREP',assertSession:()=>{if(generation!==props.generation)throw Error('stale')},readStorageInfo:async()=>({schema:1})}},confirmRestore:async()=>{calls.push(['confirm'])},onBusy:x=>events.push(x)})
 let vm;const app=renderer.createApp({render:()=>Vue.h(Component,{...props,ref:value=>vm=value})});app.mount(root)
 return {root,props,events,calls,saves,app,archive,get vm(){return vm},button:label=>flat(root).find(n=>n.type==='button'&&text(n).includes(label)),input:()=>flat(root).find(n=>n.type==='input')}
}
async function load(h){await h.input().props.onChange({target:{files:[{name:'saved.zip'}],value:'saved.zip'}});await Vue.nextTick()}

test('3.29 selects each reviewed engine independently and never inherits approval from another profile',async()=>{
 const h=mount({getCapacityTarget:profile=>({approved:profile==='previous'})});try{
  await load(h);assert.equal(h.vm.capacityApproved,false);assert(h.button('simulieren').props.disabled);
  h.vm.capacityProof={passed:true};h.vm.changeCapacityProfile('previous');await Vue.nextTick();
  assert.equal(h.vm.capacityApproved,true);assert.equal(h.vm.capacityProof,null);assert.equal(h.button('simulieren').props.disabled,false);
  assert.match(h.vm.capacityProfileLabel,/DE3.36.*DE3.37/);
  h.vm.changeCapacityProfile('legacy');await Vue.nextTick();assert.equal(h.vm.capacityApproved,false);assert(h.button('simulieren').props.disabled);
  h.vm.changeCapacityProfile('de344');await Vue.nextTick();assert.match(h.vm.capacityProfileLabel,/DE3.42–DE3.44 \/ 614–616/);
  h.vm.changeCapacityProfile('de345');await Vue.nextTick();assert.match(h.vm.capacityProfileLabel,/DE3.45 \/ 617/);
  h.vm.changeCapacityProfile('de354');await Vue.nextTick();assert.match(h.vm.capacityProfileLabel,/DE3.51–DE3.54 \/ 623–626/);
  h.vm.changeCapacityProfile('current');await Vue.nextTick();assert.match(h.vm.capacityProfileLabel,/DE3.55–DE3.66 \/ 627–638/);assert.equal(h.calls.length,1);
 }finally{h.app.unmount()}
})

test('3.25.5 deferred restore keeps overall progress separate and never claims intermediate verification',async()=>{
 const gate=defer();let options;const h=mount({restore:o=>{options=o;o.onProgress({phase:'restoring',path:'E:/x',done:120,total:1208,filePhase:'uploading',fileDone:242,fileTotal:540});return gate.promise}})
 try{await load(h);h.vm.capacityProof={passed:true};const active=h.vm.restore();for(let n=0;n<5;n++)await Promise.resolve();await Vue.nextTick()
  assert.equal(options.deferFinalVerification,true);assert.match(text(h.root),/120\/1208/);assert.match(text(h.root),/242\/540 B/)
  gate.resolve({deferred:true,verified:false,verification:null,completed:['E:/x'],namespace:{cachedListings:1}});await active;await Vue.nextTick()
  assert.equal(h.vm.report.verified,false);assert.equal(h.vm.report.readyForFinalVerification,true);assert.match(h.vm.status,/noch nicht inhaltlich geprüft/);assert.doesNotMatch(h.vm.status,/einzeln nachgelesen/)
 }finally{h.app.unmount()}
})
test('3.25.5 a failed complete final report survives UI reset and is supplied for exact repair on next restore',async()=>{
 const evidence=Object.freeze({verified:false,kind:'migration-target-verification',differences:[{path:'E:/x',reason:'sha256'}]});let repair
 const h=mount({finish:async()=>{throw Object.assign(Error('mismatch'),{code:'MIGRATION_VERIFY',verification:evidence})},restore:async o=>{repair=o.repairVerification;return {deferred:true,verified:false,completed:[]}}})
 try{await load(h);h.vm.capacityProof={passed:true};await h.vm.finish();assert.equal(h.vm.report,evidence);assert.equal(h.vm.repairVerification,evidence)
  await h.vm.restore();assert.equal(repair,evidence);assert.equal(h.vm.report.verified,false)
  h.vm.clear();assert.equal(h.vm.repairVerification,null)
 }finally{h.app.unmount()}
})

test('3.25.5 source and target readback immediately replace an old error with the active comparison state',async()=>{
 for(const method of ['verifySource','verifyTarget']){
  const gate=defer(),h=mount({verify:()=>gate.promise})
  try{await load(h);h.vm.status='Prüfung angehalten: MIGRATION_CAPACITY';const active=h.vm[method]();await Vue.nextTick()
   assert.equal(h.vm.busy,true);assert.match(h.vm.status,method==='verifySource'?/Quelle wird vollständig gelesen/:/Ziel wird vollständig gelesen/)
   assert.doesNotMatch(h.vm.status,/angehalten|MIGRATION_CAPACITY/)
   gate.resolve({verified:true});await active;assert.equal(h.vm.busy,false)
  }finally{h.app.unmount()}
 }
})

test('3.25.5 simulation immediately clears a previous error while the worker is active',async()=>{
 const gate=defer(),h=mount({approved:true,capacity:()=>gate.promise})
 try{await load(h);h.vm.status='Old error';const active=h.vm.checkCapacity();await Vue.nextTick()
  assert.equal(h.vm.busy,true);assert.match(h.vm.status,/lokal simuliert/);assert.doesNotMatch(h.vm.status,/Old error/)
  gate.resolve({passed:true});await active;assert.match(h.vm.status,/bestanden/)
 }finally{h.app.unmount()}
})

test('migration UI keeps unavailable restore/capacity disabled and explicitly says not to format',()=>{
 const h=mount();try{assert.match(text(h.root),/Nicht formatieren/);assert.match(text(h.root),/1.131 Dateien und 77 Ordner/);assert.match(text(h.root),/PREP \(Zähler 600\)/);assert(h.button('wiederherstellen').props.disabled);assert(h.button('simulieren').props.disabled);assert.equal(h.calls.length,0)}finally{h.app.unmount()}
})
test('backup must be explicitly saved and saved ZIP reselected before fresh verification',async()=>{
 const h=mount();try{await h.button('Sicherung erstellen').props.onClick();await Vue.nextTick();assert.equal(h.vm.archive,null);assert.equal(h.saves.length,0)
 h.button('ZIP speichern').props.onClick();assert.equal(h.saves.length,1);await load(h);assert.equal(h.vm.filename,'saved.zip');assert.equal(h.calls.filter(x=>x[0]==='verify').length,0)
 await h.button('Quelle vollständig').props.onClick();await Vue.nextTick();assert.equal(h.calls.filter(x=>x[0]==='verify').length,1);assert.equal(h.vm.report.migrationReady,false);assert(h.button('wiederherstellen').props.disabled);assert.match(text(h.root),/gibt das Formatieren nicht frei/)
 }finally{h.app.unmount()}
})
test('shared busy lock prevents all engine calls while another device operation is active',async()=>{
 const h=mount();try{h.props.blocked=true;await Vue.nextTick();assert(h.button('Sicherung erstellen').props.disabled);await h.vm.makeBackup();assert.equal(h.calls.length,0)}finally{h.app.unmount()}
})
test('cancellation waits for active read settlement and preserves a partial error receipt without starting restore',async()=>{
 const gate=defer(),h=mount({verify:()=>gate.promise});try{await load(h);const active=h.vm.verifySource();await Vue.nextTick();h.vm.cancel();await Vue.nextTick();assert.equal(h.vm.busy,true);assert.equal(h.vm.cancelling,true)
 gate.reject(Object.assign(new Error('cancelled'),{name:'AbortError',migrationProgress:{completed:['E:/x']}}));await active
 assert.equal(h.vm.busy,false);assert.deepEqual(h.vm.report.migrationProgress.completed,['E:/x']);assert.deepEqual(h.events.slice(-2),[true,false]);assert.equal(h.calls.filter(x=>x[0]==='confirm').length,0)
 }finally{h.app.unmount()}
})
test('disconnect/generation changes abort old reads and cannot approve a stale backup result',async()=>{
 const gate=defer(),h=mount({verify:()=>gate.promise});try{await load(h);const active=h.vm.verifySource();await Vue.nextTick();h.props.connected=false;h.props.generation++;await Vue.nextTick();assert(h.calls.findLast(x=>x[0]==='verify')[1].signal.aborted)
 gate.resolve({verified:true});await active;assert.equal(h.vm.report.verified,false);assert.match(h.vm.status,/Abgebrochen/);assert(h.button('wiederherstellen').props.disabled)
 }finally{h.app.unmount()}
})
test('failed saved ZIP reread invalidates the earlier archive/proof and never permits a device operation',async()=>{
 let n=0;const h=mount({load:async()=>{if(n++)throw Object.assign(Error('bad'),{code:'ZIP_HASH'});return Object.freeze({fileCount:0,directoryCount:0,byteCount:0,archiveSha256:'a'.repeat(64)})}})
 try{await load(h);h.vm.capacityProof={passed:true};await load(h);assert.equal(h.vm.archive,null);assert.equal(h.vm.capacityProof,null);assert.match(h.vm.status,/ZIP_HASH/);assert.equal(h.calls.filter(x=>x[0]==='verify').length,0)}finally{h.app.unmount()}
})
test('English view exposes identical limits and explicit journal exclusions; report download is local only',async()=>{
 const h=mount();try{h.props.language='en_US';await Vue.nextTick();assert.match(text(h.root),/Do not format/);assert.match(text(h.root),/never restored/);await load(h);await h.vm.verifySource();h.vm.saveReport();assert.equal(h.saves.length,1);assert.equal(h.saves[0][1],'Allmiibo-Migrationspruefung.json');h.vm.clear();assert.equal(h.vm.archive,null);assert.equal(h.vm.report,null)}finally{h.app.unmount()}
})
test('3.27 unknown raw capability asks for a fresh query, never a PREP downgrade',async()=>{
 const h=mount();try{h.props.getSession=()=>({readStorageInfo:async()=>{throw Object.assign(new Error('255'),{code:'MIGRATION_PREPARATION_REQUIRED'})},assertSession(){}})
 await Vue.nextTick();await h.vm.makeBackup();assert.match(h.vm.status,/Speicherstatus lesen/);assert.match(h.vm.status,/Ordner sichern/);assert.doesNotMatch(h.vm.status,/PREP|600|Gerätefehler: 255/);assert.equal(h.vm.busy,false);assert.equal(h.calls.length,0)
 }finally{h.app.unmount()}
})

test('3.27 capability failures after a mounted LittleFS snapshot do not recommend SPIFFS preparation or claim no writes',async()=>{
 for(const backend of [2,3])for(const language of ['de_DE','en_US']){
  const h=mount({backup:async()=>{throw Object.assign(Error('capability'),{code:'MIGRATION_CAPABILITY'})}})
  try{h.props.language=language;h.props.getSession=()=>({readStorageInfo:async()=>({schema:1,drive:'E',backend,mounted:true}),assertSession(){}})
   await Vue.nextTick();await h.vm.makeBackup();await Vue.nextTick()
   assert.equal(h.vm.storageSnapshot.backend,backend);assert.equal(h.vm.busy,false)
   assert.doesNotMatch(h.vm.status,/PREP|600|Nothing was formatted|nichts formatiert/)
   assert.match(h.vm.status,language==='de_DE'?/Nicht aufgrund dieser Meldung formatieren/:/Do not format/)
   assert.match(text(h.root),language==='de_DE'?/ausschließlich für die Erstumstellung/:/only intended for the first migration/)
   assert.equal(h.calls.filter(c=>c[0]==='backup').length,1)
  }finally{h.app.unmount()}
 }
})

test('3.27 missing or mismatched recovery receipt offers context-specific recovery without a mutation',async()=>{
 const h=mount({retain:async()=>{throw Object.assign(Error('closed'),{code:'MIGRATION_TICKET'})}})
 try{await load(h);await h.vm.verifySource();await Vue.nextTick();assert.equal(h.vm.busy,false);assert.match(h.vm.status,/Wiederherstellungsbeleg ist nicht verfügbar oder passt nicht/)
  assert.match(h.vm.status,/Bei einem Browser-Speicherfehler die Aktion erneut starten/);assert.match(h.vm.status,/dieselbe ZIP, dasselbe Gerät/);assert.equal(h.calls.filter(c=>c[0]==='confirm').length,0);assert.equal(h.calls.filter(c=>c[0]==='verify').length,1)
 }finally{h.app.unmount()}
})

test('3.25 backup progress shows real byte percent and known completed counts, never an unexplained 0/0',async()=>{
 const gate=defer(),h=mount({backup:o=>{o.onProgress({phase:'reading',path:'E:/x',filesDone:119,filesTotal:1133,bytesDone:63652,bytesTotal:687553});return gate.promise}})
 try{const active=h.vm.makeBackup();await Vue.nextTick();await Promise.resolve();await Vue.nextTick();assert.match(text(h.root),/63652\/687553/);assert.match(text(h.root),/9%/);assert.match(text(h.root),/119 \/ 1133/)
 h.calls.find(x=>x[0]==='backup')[1].onProgress({phase:'scanning',filesDone:7,bytesDone:3780});await Vue.nextTick();assert.match(text(h.root),/Gesamtumfang wird ermittelt/);assert.match(text(h.root),/Bisher vollständig gelesen: 7/);assert.doesNotMatch(text(h.root),/0\/0/)
 gate.resolve({blob:new Blob(['zip']),filename:'saved.zip'});await active
 }finally{h.app.unmount()}
})

test('3.25 target inspection is read-only and mounted pending or ready targets never enable first format',async()=>{
 const target={identity:{firmwareVersion:'2.22.0-DE3.31',applicationCounter:603},state:{mounted:true,pending:true,bound:true,archiveSha256:'a'.repeat(64),ready:false,rebootRequired:true}}
 let reads=0;const h=mount({approved:true,capacity:async()=>({passed:true}),inspect:async()=>{reads++;return target}})
 try{await load(h);await h.vm.checkCapacity();assert.equal(reads,0);await h.vm.inspectTarget();await Vue.nextTick();assert.equal(reads,1);assert(h.button('initialisieren /').props.disabled);assert(!h.button('wiederherstellen /').props.disabled)
 target.state={...target.state,pending:false,ready:true};await h.vm.inspectTarget();await Vue.nextTick();assert(h.button('initialisieren /').props.disabled);assert(!h.button('bewusst neu starten').props.disabled)
 }finally{h.app.unmount()}
})

test('3.25 late target lookup after reconnect cannot enable any destructive action',async()=>{
 const gate=defer(),h=mount({approved:true,capacity:async()=>({passed:true}),inspect:()=>gate.promise})
 try{await load(h);await h.vm.checkCapacity();const active=h.vm.inspectTarget();await Vue.nextTick();h.props.generation++;await Vue.nextTick();gate.resolve({identity:{},state:{mounted:false}});await active;assert.equal(h.vm.target,null);assert.match(h.vm.status,/Abgebrochen/);assert(h.button('initialisieren /').props.disabled)}finally{h.app.unmount()}
})

test('3.25 ambiguous format error preserves its receipt and never automatically binds or retries',async()=>{
 let formats=0,binds=0;const h=mount({approved:true,capacity:async()=>({passed:true}),format:async()=>{formats++;throw Object.assign(Error('lost ACK'),{migrationProgress:{attempts:[{operation:'format',state:'possible'}]}})},initialize:async()=>binds++})
 try{await load(h);await h.vm.checkCapacity();await h.vm.formatTarget();assert.equal(formats,1);assert.equal(binds,0);assert.equal(h.vm.target,null);assert.equal(h.vm.report.migrationProgress.attempts[0].state,'possible');assert.equal(h.vm.busy,false)}finally{h.app.unmount()}
})

test('3.25 persistent finish and reboot remain separate, and acknowledged reboot accepts its expected disconnect',async()=>{
 let finishes=0,restarts=0;const target={identity:{},state:{mounted:true,pending:false,ready:true,bound:true,rebootRequired:true,archiveSha256:'a'.repeat(64)}}
 const h=mount({approved:true,capacity:async()=>({passed:true}),finish:async()=>{finishes++;return {verification:{verified:true}}},inspect:async()=>target,restart:async()=>{restarts++;h.props.connected=false;h.props.generation++;await Vue.nextTick();return {ready:true}}})
 try{await load(h);await h.vm.checkCapacity();await h.vm.finish();assert.equal(finishes,1);assert.equal(restarts,0);await h.vm.restart();assert.equal(restarts,1);assert.match(h.vm.status,/Neustart bestätigt/);assert.doesNotMatch(h.vm.status,/Abgebrochen/);assert.equal(h.vm.target,null)}finally{h.app.unmount()}
})

test('3.25 cancelling restore confirmation cannot cross a connection generation',async()=>{
 let writes=0;const gate=defer(),h=mount({approved:true,capacity:async()=>({passed:true}),restore:async()=>{writes++;return {verified:true}}})
 try{await load(h);await h.vm.checkCapacity();h.props.confirmRestore=()=>gate.promise;const active=h.vm.restore();await Vue.nextTick();h.props.generation++;await Vue.nextTick();gate.resolve();await active;assert.equal(writes,0);assert.equal(h.vm.busy,false)}finally{h.app.unmount()}
})

const completedProof=Object.freeze({verified:true,kind:'migration-target-verification',filesVerified:2,bytesVerified:540,archiveSha256:'a'.repeat(64),createdAt:'2026-10-25T00:00:00Z'})
const completedTarget={identity:{firmwareVersion:'2.22.0-DE3.31',applicationCounter:603},state:{mounted:true,pending:false,bound:true,archiveSha256:'a'.repeat(64),ready:true,rebootRequired:true}}
test('3.25.5 completion report survives target refresh and explicit reboot, and exports separately',async()=>{
 const h=mount({finish:async()=>({verification:completedProof,state:completedTarget.state,finished:true}),inspect:async()=>completedTarget,restart:async()=>({ready:true})})
 try{await load(h);h.vm.capacityProof={passed:true};await h.vm.finish();assert.equal(h.vm.report,completedProof)
  await h.vm.inspectTarget();assert.equal(h.vm.report,completedProof);await h.vm.restart();assert.equal(h.vm.report,completedProof)
  h.vm.saveCompletionReport();assert.equal(h.saves.at(-1)[1],'Allmiibo-Migrationsabschluss.json');assert.equal(JSON.parse(await h.saves.at(-1)[0].text()).verification.verified,true)
  h.vm.clear();assert.equal(h.vm.completion,null)
 }finally{h.app.unmount()}
})
test('3.25.5 completion stays acknowledged when the subsequent status query times out',async()=>{
 const h=mount({finish:async()=>({verification:completedProof,state:completedTarget.state,finished:true}),inspect:async()=>{throw Error('status timeout')}})
 try{await load(h);h.vm.capacityProof={passed:true};await h.vm.finish();await Vue.nextTick()
  assert.equal(h.vm.report,completedProof);assert.equal(h.vm.completion.verification,completedProof);assert.equal(h.vm.actionError.phase,'post-seal-status');assert.match(h.vm.status,/Importabschluss.*bestätigt/);assert.equal(h.vm.target,null);assert.equal(h.button('Prüfbericht speichern').props.disabled,false)
 }finally{h.app.unmount()}
})
test('3.25.5 completion prevents repeated finish while a separately requested verification remains available',async()=>{
 let calls=0;const h=mount({finish:async()=>{calls++;return{verification:completedProof,state:completedTarget.state,finished:true}},inspect:async()=>completedTarget})
 try{await load(h);h.vm.capacityProof={passed:true};await h.vm.finish();await Vue.nextTick()
  assert.equal(h.button('Import nach vollständiger').props.disabled,true);assert.equal(h.button('LittleFS vollständig nachprüfen').props.disabled,false)
  await h.vm.finish();assert.equal(calls,1)
 }finally{h.app.unmount()}
})
test('3.25.5 completion keeps a prior report historical when a later verification is cancelled or fails',async()=>{
 const h=mount({finish:async()=>({verification:completedProof,state:completedTarget.state,finished:true}),inspect:async()=>completedTarget,verify:async()=>{throw Error('later read failed')}})
 try{await load(h);h.vm.capacityProof={passed:true};await h.vm.finish();await h.vm.verifyTarget();await Vue.nextTick()
  assert.equal(h.vm.report,completedProof);assert.equal(h.vm.actionError.code,'later read failed');assert.match(text(h.root),/Gespeicherte Prüfmomentaufnahme/);assert.match(text(h.root),/Letzte Aktion nicht vollständig bestätigt/)
 }finally{h.app.unmount()}
})
test('3.25.5 completion cancellation after a seal ACK does not undo its known successful outcome',async()=>{
 let h;h=mount({finish:async()=>{h.vm.cancel();return{verification:completedProof,state:completedTarget.state,finished:true}},inspect:async()=>{throw Object.assign(Error('cancelled'),{name:'AbortError'})}})
 try{await load(h);h.vm.capacityProof={passed:true};await h.vm.finish();assert.equal(h.vm.report,completedProof);assert.equal(h.vm.completion.verification,completedProof);assert.match(h.vm.status,/Importabschluss.*bestätigt/)}finally{h.app.unmount()}
})
test('3.25.5 completion progress labels restarted counters as successive phase progress, never a reset overall percentage',async()=>{
 const gate=defer();let options;const h=mount({verify:o=>{options=o;return gate.promise}})
 try{await load(h);const active=h.vm.verifyTarget();for(let n=0;n<4;n++)await Promise.resolve()
  options.onProgress({phase:'verifying',done:1208,total:1208});await Vue.nextTick();assert.match(text(h.root),/Schritt 2\/4/);assert.match(text(h.root),/Teilfortschritt: 100%/)
  options.onProgress({phase:'verify-tree-again',done:0,total:0});await Vue.nextTick();assert.match(text(h.root),/Schritt 3\/4/);assert.match(text(h.root),/ohne Prozentangabe/)
  options.onProgress({phase:'verify-metadata-again',done:1,total:1208});await Vue.nextTick();assert.match(text(h.root),/Schritt 4\/4/);assert.match(text(h.root),/Teilfortschritt: 0%/)
  gate.resolve(completedProof);await active
 }finally{h.app.unmount()}
})

test('3.26 already-Packed notice requires a fresh explicit storage response, never a firmware name',async()=>{
 const h=mount();try{
  assert.equal(h.vm.packedMounted,false);h.props.getSession=()=>({firmwareVersion:'2.22.0-DE3.36',readStorageInfo:async()=>({schema:1,drive:'E',backend:3,mounted:true}),assertSession(){}});
  await Vue.nextTick();await h.vm.readStorageStatus();await Vue.nextTick();assert.equal(h.vm.packedMounted,true);assert.match(text(h.root),/E: verwendet bereits Packed LittleFS/);
  assert.equal(h.vm.target,null);assert.equal(h.vm.capacityProof,null);assert.equal(h.calls.length,0);
  h.props.connected=false;await Vue.nextTick();assert.equal(h.vm.storageSnapshot,null);assert.equal(h.vm.packedMounted,false);
  h.props.connected=true;await Vue.nextTick();assert.equal(h.vm.packedMounted,false);
 }finally{h.app.unmount()}
})

test('3.26 capacity profile is explicit and changes invalidate prior proof without modifying a bound import',async()=>{
 let observed;const h=mount({approved:true,capacity:async(a,o)=>{observed=o.capacityProfile;return{passed:true}}});try{
  await load(h);assert.equal(h.vm.capacityProfile,'current');await h.vm.checkCapacity();assert.equal(observed,'current');
  h.vm.target={identity:{},state:{mounted:false}};h.vm.changeCapacityProfile('legacy');assert.equal(h.vm.capacityProfile,'legacy');assert.equal(h.vm.capacityProof,null);assert.equal(h.vm.target,null);
  await h.vm.checkCapacity();assert.equal(observed,'legacy');h.vm.target={identity:{},state:{pending:true,bound:true}};
  h.vm.changeCapacityProfile('current');assert.equal(h.vm.capacityProfile,'legacy');assert(h.vm.capacityProof);
  h.vm.target=null;h.vm.busy=true;h.vm.changeCapacityProfile('current');assert.equal(h.vm.capacityProfile,'legacy');h.vm.busy=false;
  h.vm.changeCapacityProfile('__proto__');assert.equal(h.vm.capacityProfile,'legacy');
 }finally{h.app.unmount()}
})

test('3.26 next preparation action invokes one existing guarded step and never reformats a mounted store',async()=>{
 const h=mount();try{await load(h);h.vm.capacityProof={passed:true};const calls=[];
  h.vm.inspectTarget=async()=>calls.push('inspect');h.vm.formatTarget=async()=>calls.push('format');h.vm.initialize=async()=>calls.push('bind');
  await h.vm.prepareNext();h.vm.target={identity:{},state:{mounted:false}};await h.vm.prepareNext();
  h.vm.target={identity:{},state:{mounted:true,pending:true,bound:false}};await h.vm.prepareNext();
  h.vm.target={identity:{},state:{mounted:true,pending:true,bound:true}};await h.vm.prepareNext();
  h.vm.target={identity:{},state:{mounted:true,pending:false,ready:true}};await h.vm.prepareNext();
  assert.deepEqual(calls,['inspect','format','bind']);h.vm.target=null;h.vm.busy=true;await h.vm.prepareNext();assert.equal(calls.length,3);h.vm.busy=false;
 }finally{h.app.unmount()}
})

test('3.26 active migration stays open and separate full target verification is advanced-only',async()=>{
 const gate=defer(),h=mount({backup:()=>gate.promise});try{
  const active=h.vm.makeBackup();await Vue.nextTick();const panel=h.vm.$refs.migrationPanel;assert.equal(panel.open,true);
  panel.open=false;panel.props.onToggle();assert.equal(panel.open,true);
  const verify=h.button('LittleFS vollständig nachprüfen');let ancestor=verify.parent;while(ancestor&&!String(ancestor.props.class||'').includes('migration-advanced'))ancestor=ancestor.parent;
  assert(ancestor,'extra full verification is in advanced tools');assert.match(text(h.root),/Eine zusätzliche Zielprüfung davor ist nicht erforderlich/);
  gate.resolve({blob:new Blob(['zip']),filename:'backup.zip'});await active;panel.open=false;panel.props.onToggle();assert.equal(panel.open,false);
 }finally{h.app.unmount()}
})
