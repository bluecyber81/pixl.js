import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {captureTransferLink,createBackupTransferObservation,normalizeTransferObservation} from '../src/lib/transfer-observation.js';
import {parseMtuDiagnostics} from '../src/lib/device-extra-diagnostics.js';
import {createBackup} from '../src/lib/backup.js';
import {createDiagnostics} from '../src/lib/device-info.js';
import {createCombinedDiagnosticReport} from '../src/lib/diagnostic-snapshot.js';
import {loadBackupReference} from '../src/lib/zip-import.js';
import {memoryVfs} from './helpers/memory-vfs.mjs';
const JSZip=createRequire(import.meta.url)('../public/dfu/vendor/jszip-3.10.2.min.js');
const raw=JSON.parse(readFileSync(new URL('./fixtures/ble-link-diagnostic-v3.json',import.meta.url),'utf8'));
const link=()=>parseMtuDiagnostics(Uint8Array.from(Buffer.from(raw.responsePayloadHex,'hex')));
const iso=n=>new Date(Date.UTC(2026,10,21,12,0,n)).toISOString();
const observed=(n,data=link())=>({state:'available',observedAt:iso(n),data,errorCode:null});
function sample(){return{schemaVersion:1,scope:'completed-browser-backup',startedAt:iso(1),completedAt:iso(6),sameBrowserConnection:true,
 files:4,totalFileBytes:2000,readFileBytes:800,reusedFiles:2,reusedFileBytes:1200,
 phasesMs:{listing:20,reading:1800,verifying:1000,packingFileEntries:100,packing:200,total:3020},
 operations:{listingCalls:3,fileReads:2,digestReplies:2,rawMetadataReads:0,verificationListingCalls:3,previousZipFiles:2},
 transport:{completedCommands:9,txFrames:12,rxFrames:17,txBytes:100,rxBytes:1100},link:{before:observed(0),after:observed(7)}};}

test('completed backup records fresh file payload separately from digest-verified reuse and transport framing',()=>{
 const record=sample();const value=normalizeTransferObservation({...record,privateDevice:'PRIVATE',path:'E:/private',
  phasesMs:{...record.phasesMs,private:'PRIVATE'},operations:{...record.operations,private:'PRIVATE'},
  link:{before:{...record.link.before,data:{...record.link.before.data,private:'PRIVATE'}},after:record.link.after}});
 assert.deepEqual(value,record);assert.equal(value.readFileBytes,800);assert.equal(value.transport.rxBytes,1100);
 assert.doesNotMatch(JSON.stringify(value),/PRIVATE|E:\/private/);
 const changed=sample();changed.link.after.data={...link(),link:{...link().link,rxPhy:1,txPhy:1}};
 assert.equal(normalizeTransferObservation(changed).link.after.data.link.rxPhy,1,'changing link endpoints are preserved, not homogenized');
});

test('normalization rejects malformed or unbounded profile values and inconsistent byte reuse or time brackets',()=>{
 for(const patch of [{schemaVersion:2},{sameBrowserConnection:false},{files:4097},{totalFileBytes:16777217},{reusedFileBytes:2001},
 {reusedFiles:5},{readFileBytes:799},{startedAt:iso(8)},{completedAt:'yesterday'},{transport:{}},{operations:{fileReads:-1}},
 {phasesMs:{...sample().phasesMs,total:86400001}},{phasesMs:{...sample().phasesMs,reading:3021}},
 {link:{...sample().link,before:observed(2)}},{link:{...sample().link,after:observed(5)}},
 {link:{...sample().link,after:{...observed(7),data:{...link(),scope:'guessed'}}}}])assert.equal(normalizeTransferObservation({...sample(),...patch}),null,JSON.stringify(patch));
});

test('history export remains compatible with old entries and carries a bounded profile only on a successful backup',()=>{
 const measurement=sample(),history=[{kind:'download',status:'success',bytes:4,verified:true},
 {kind:'backup',status:'success',bytes:2000,verified:false,measurement}];
 const report=createDiagnostics({firmwareVersion:'2.22.0-DE3.96',history});
 assert.deepEqual(report.recentTransfers[0],history[0]);assert.deepEqual(report.recentTransfers[1].measurement,measurement);
 assert.equal(report.recentTransfers[1].verified,false,'archive observation is not restore verification');
 const combined=createCombinedDiagnosticReport({baseReport:report});assert.deepEqual(combined.recentTransfers,report.recentTransfers);
 assert.match(combined.limitations.join(' '),/not continuously/);
 for(const kind of ['upload','download','sync','backup'])for(const status of ['cancelled','failed','interrupted']){
  const value=createDiagnostics({history:[{kind,status,bytes:0,measurement}]});assert.equal(Object.hasOwn(value.recentTransfers[0],'measurement'),false);
 }
});

test('optional link captures are explicit, bounded and cannot publish after a replaced or interrupted session',async()=>{
 let calls=0;const current={value:true};const args={read:async()=>{calls++;return link();},isCurrent:()=>current.value,now:()=>iso(0)};
 assert.deepEqual(await captureTransferLink(args),observed(0));assert.equal(calls,1);
 const offline=await captureTransferLink({...args,read:undefined});assert.equal(offline.state,'unavailable');assert.equal(calls,1);
 const failed=await captureTransferLink({...args,read:async()=>{throw Object.assign(Error('PRIVATE'),{code:'TIMEOUT'});}});
 assert.equal(failed.state,'failed');assert.equal(failed.errorCode,'TIMEOUT');assert.doesNotMatch(JSON.stringify(failed),/PRIVATE/);
 const prior=await captureTransferLink({...args,read:async()=>{current.value=false;return link();}});assert.equal(prior,null);
 current.value=true;
 assert.equal(await captureTransferLink({...args,read:async()=>{current.value=false;throw Error('late');}}),null);
 current.value=true;
 assert.equal(await captureTransferLink({...args,now:()=> 'invalid'}),null);
});

test('real backup profiles retain fresh-byte/reuse accounting without an extra link read inside file work',async()=>{
 const vfs=memoryVfs();vfs.put('E:/tags/a.bin',[1,2,3]);vfs.put('E:/tags/b.bin',[4,5]);
 const events=[],context={rootPath:'E:/',deviceKey:'private-device',firmwareVersion:'2.22.0-DE3.96'};
 const base={...context,...vfs.api,readDirectory:async p=>{events.push('list');return vfs.api.readDirectory(p);},
  readFile:async(p,o)=>{events.push('file');return vfs.api.readFile(p,o);},
  readFileDigest:async p=>{events.push('digest');return createHash('sha256').update(vfs.nodes.get(p).bytes).digest('hex');}};
 const original=await createBackup(base),reference=await loadBackupReference(original.blob,{JSZip});events.length=0;
 const before=await captureTransferLink({read:async()=>{events.push('link-before');return link();},isCurrent:()=>true,now:()=>iso(0)});
 const result=await createBackup({...base,previousArchive:reference});
 const after=await captureTransferLink({read:async()=>{events.push('link-after');return link();},isCurrent:()=>true,now:()=>iso(7)});
 const record=createBackupTransferObservation({manifest:result.manifest,profile:result.profile,startedAt:iso(1),completedAt:iso(6),before,after});
 assert.ok(record);assert.equal(record.totalFileBytes,5);assert.equal(record.reusedFileBytes,5);assert.equal(record.readFileBytes,0);assert.equal(record.reusedFiles,2);
 assert.equal(record.operations.fileReads,0);assert.equal(record.operations.digestReplies,2);assert.equal(events[0],'link-before');assert.equal(events.at(-1),'link-after');
 assert.equal(events.filter(e=>e.startsWith('link')).length,2);assert.doesNotMatch(JSON.stringify(record),/private-device|a\.bin|b\.bin/);
 assert.equal(createBackupTransferObservation({manifest:{...result.manifest,completed:false},profile:result.profile,startedAt:iso(1),completedAt:iso(6),before,after}),null);
});
