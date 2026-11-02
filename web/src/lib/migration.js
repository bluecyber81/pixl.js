import { createBackup, BACKUP_LIMITS } from './backup.js'
import { loadBackupZip, isVerifiedBackupArchive, readBackupArchiveFile } from './zip-import.js'
import { rawMetadataHex, rawMetadataBytes } from './raw-metadata.js'
import { assertDevicePath, assertDeviceEntryName, portableNameKey } from './portable-names.js'
import { checkedDirectory, sha256Bytes, asBytes, UPLOAD_LIMITS } from './safe-upload.js'
import { getMigrationCapacityTarget } from './migration-capacity.js'
import { simulateCapacityInWorker } from './migration-capacity-worker-client.js'
import { matchMigrationLayout, checkImportState, migrationApplicationMatches } from './migration-layout.js'
import { migrationTicketStore, validMigrationTicket } from './migration-tickets.js'
import { migrationStagingPlan } from './migration-staging.js'
import { migrationNamespace } from './migration-namespace.js'
import { migrationStagedUpload } from './migration-staged-upload.js'

export class MigrationError extends Error { constructor(code,message) { super(message); this.name='MigrationError';this.code=code } }
const need=(yes,code,text)=>{if(!yes)throw new MigrationError(code,text)}
const encoder=new TextEncoder(), root='E:/', prefix='E:/.pixl_txn'
const journalPaths=new Set(['E:/.pixl_txn_old','E:/.pixl_txn_new'])
const capacityProofs=new WeakMap()
const sourceReports=new WeakMap(), targetReports=new WeakMap(), sourceTickets=new Map(), formatMarkers=new Map()
const parent=p=>p.lastIndexOf('/')===2?root:p.slice(0,p.lastIndexOf('/'))
const name=p=>p.slice(p.lastIndexOf('/')+1)
const checkpoint=o=>{o.assertSession();if(o.signal?.aborted){const e=new MigrationError('MIGRATION_CANCELLED','Migration operation cancelled.');e.name='AbortError';throw e}}
const observe=(o,phase,path,done,total)=>{try{o.onProgress?.({phase,path,done,total})}catch{/* observer */}}
const detail=(o,value)=>{try{o.onProgress?.(value)}catch{/* observer */}}
export function checkedStorage(info,{target=false}={}) {
  need(info?.schema===1 && info.drive==='E' && [1,2,3].includes(info.backend) && info.mounted===true &&
    Number.isInteger(info.flags) && (info.flags&7)===7 && !(info.flags&~15) && (!(info.flags&8)||info.backend===3) && info.metaLen===128 && info.pathMax===64 && info.nameMax===48,
    'MIGRATION_CAPABILITY','A mounted E: drive with exact raw128 access and no automatic format is required.')
  need(!target || [2,3].includes(info.backend),'MIGRATION_BACKEND','Target verification requires an explicitly reported LittleFS target.')
  return Object.freeze({...info})
}
const checkJournal=entry=>{
  if(entry.sourcePath.startsWith(prefix)) need(journalPaths.has(entry.sourcePath)&&entry.type==='file',
    'MIGRATION_PENDING','An active or unknown internal transaction entry must be resolved before migration.')
}
export function preflightMigrationArchive(archive,{forRestore=true}={}) {
  need(isVerifiedBackupArchive(archive)&&archive.version===2&&archive.rootPath===root,'MIGRATION_ARCHIVE','Select a complete schema2 E:/ backup with raw128 metadata.')
  const keys=new Set(), excluded=[],restoreBlockers=[]
  const restriction=(yes,code,text,path)=>{if(!yes){restoreBlockers.push({path,code,reason:text});if(forRestore)need(false,code,text)}}
  for(const entry of archive.entries){
    restriction(!entry.sourcePath.startsWith(prefix)||(journalPaths.has(entry.sourcePath)&&entry.type==='file'),'MIGRATION_PENDING','An active or unknown transaction entry must be resolved before migration.',entry.sourcePath)
    rawMetadataHex(entry.rawMeta128Hex);assertDevicePath(entry.sourcePath)
    for(const part of entry.relativePath.split('/')) restriction(encoder.encode(part).length<=47,'MIGRATION_NAME','A name exceeds the restore limit.',entry.sourcePath)
    const key=entry.relativePath.split('/').map(portableNameKey).join('/')
    restriction(!keys.has(key),'MIGRATION_COLLISION','Case or Unicode aliases cannot be restored safely. Original names have not been changed.',entry.sourcePath);keys.add(key)
    restriction(entry.type!=='file'||entry.size<=UPLOAD_LIMITS.maxFileBytes,'MIGRATION_SIZE','A file exceeds the verified restore size limit.',entry.sourcePath)
    if(journalPaths.has(entry.sourcePath))excluded.push(entry.sourcePath)
  }
  return {rootPath:root,files:archive.fileCount,directories:archive.directoryCount,bytes:archive.byteCount,
    excludedInternalJournals:excluded,entriesToRestore:archive.entries.filter(e=>!journalPaths.has(e.sourcePath)).length,
    archiveSha256:archive.archiveSha256,rawMetadataBytes:128,restoreBlockers}
}
export async function loadMigrationArchive(input,options={}) {
  const archive=await loadBackupZip(input,options);preflightMigrationArchive(archive,{forRestore:false});return archive
}
export async function migrationTreeSha256(archive){
  preflightMigrationArchive(archive)
  const rows=archive.entries.filter(e=>!journalPaths.has(e.sourcePath)).map(e=>[e.sourcePath,e.type,e.size]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)
  return sha256Bytes(encoder.encode(JSON.stringify({metadataBytesPerEntry:128,rows})))
}
export async function checkMigrationCapacity(archive,options={}){
  preflightMigrationArchive(archive)
  const capacityProfile=options.capacityProfile===undefined?'current':options.capacityProfile
  const target=getMigrationCapacityTarget(capacityProfile)
  need(target.approved===true,'MIGRATION_CAPACITY','Physical LittleFS capacity for the exact geometry is not confirmed. Migration and restore remain unavailable.')
  // Prove that the actual deterministic upload names fit before any format can
  // be authorized, including very short remaining path/name budgets.
  await migrationStagingPlan(archive)
  const rows=archive.entries.filter(e=>!journalPaths.has(e.sourcePath)).map(e=>({path:e.sourcePath.slice(2),kind:e.type==='directory'?1:0,size:e.size,rawMeta128Hex:e.rawMeta128Hex}))
  const report=await simulateCapacityInWorker(rows,{...options,capacityProfile,archiveSha256:archive.archiveSha256})
  need(report?.passed===true&&report.wasmSha256===target.wasmSha256&&report.engineSha256===target.layout.engineSha256&&
    report.capacityProfile===capacityProfile&&report.archiveSha256===archive.archiveSha256&&report.verifiedEntries===rows.length&&report.peakUsedBlocks*100<=report.totalBlocks*80,
    'MIGRATION_CAPACITY','The capacity worker did not return a matching complete verification.')
  const handle=Object.freeze({...report,archiveSha256:archive.archiveSha256,treeSha256:await migrationTreeSha256(archive)})
  capacityProofs.set(handle,{archive,target,capacityProfile});return handle
}
async function listing(o,path){checkpoint(o);const entries=checkedDirectory(await o.readDirectory(path));checkpoint(o);return entries}
function listingKey(entries){return JSON.stringify(entries.map(e=>[e.name,e.type,e.type?0:e.size]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0))}
async function scan(o){
  const records=new Map(),snapshots=new Map();let bytes=0
  async function walk(path,depth){
    need(depth<=BACKUP_LIMITS.maxDepth,'MIGRATION_LIMIT','Directory tree is too deep.')
    const entries=await listing(o,path);snapshots.set(path,listingKey(entries))
    for(const entry of entries){
      const sourcePath=path+(path.endsWith('/')?'':'/')+entry.name;assertDevicePath(sourcePath)
      need(records.size<BACKUP_LIMITS.maxEntries,'MIGRATION_LIMIT','Too many directory entries.')
      const row={sourcePath,type:entry.type?'directory':'file',size:entry.type?0:entry.size};if(!o.allowPending)checkJournal(row)
      if(!entry.type){bytes+=entry.size;need(entry.size<=BACKUP_LIMITS.maxFileBytes&&bytes<=BACKUP_LIMITS.maxBytes,'MIGRATION_LIMIT','File data exceeds verification bounds.')}
      records.set(sourcePath,row)
      if(entry.type)await walk(sourcePath,depth+1)
    }
  }
  await walk(root,0);return {records,snapshots}
}
async function rawAt(o,path){checkpoint(o);const value=rawMetadataHex(await o.readRawMetadata(path));checkpoint(o);return value}
async function hashAt(o,path,size){checkpoint(o);const bytes=asBytes(await o.readFile(path,{maxBytes:size}));checkpoint(o);need(bytes.length===size,'MIGRATION_CHANGED','A file changed size during verification.');const hash=await sha256Bytes(bytes);checkpoint(o);return hash}
export async function createMigrationBackup(o){
  checkedStorage(o.storageInfo);checkpoint(o)
  // createBackup already reads and rechecks every directory. Record its first
  // real listing instead of adding a redundant full scan before that pass.
  const snapshots=new Map()
  // Archive even unresolved journals for diagnosis; they still block restoration.
  const result=await createBackup({...o,rootPath:root,preserveLegacyNames:true,checkpointState:undefined,
    readDirectory:async path=>{const entries=await listing(o,path);if(!snapshots.has(path))snapshots.set(path,listingKey(entries));return entries},
    readFile:async(path,options)=>{checkpoint(o);const bytes=await o.readFile(path,options);checkpoint(o);return bytes},
    readRawMetadata:path=>rawAt(o,path)})
  checkpoint(o)
  const after=await scan({...o,allowPending:true})
  need(snapshots.size===after.snapshots.size&&[...snapshots].every(([path,key])=>after.snapshots.get(path)===key),'MIGRATION_CHANGED','The source tree changed during export.')
  return result
}
/** Always fresh device reads; no upload, format, delete, DFU, or cached data. */
export async function verifyMigrationArchive(o){
  const {archive,target=false}=o;const preflight=preflightMigrationArchive(archive,{forRestore:false});checkedStorage(o.storageInfo,{target});checkpoint(o)
  need(typeof o.deviceKey==='string'&&o.deviceKey,'MIGRATION_IDENTITY','A current device identity is required.')
  observe(o,'verify-listing','',0,0)
  const {records,snapshots}=await scan({...o,allowPending:true}), differences=[], excluded=[]
  const expected=new Map(archive.entries.filter(e=>!target||!journalPaths.has(e.sourcePath)||e.type!=='file').map(e=>[e.sourcePath,e]))
  const observedRaw=new Map();let filesVerified=0,bytesVerified=0,done=0
  for(const [path,actual]of records){
    if(target&&journalPaths.has(path)&&actual.type==='file'){excluded.push(path);continue}
    if(target&&path.startsWith(prefix))differences.push({path,reason:'reserved-transaction-entry'})
    const entry=expected.get(path)
    const raw=await rawAt(o,path);observedRaw.set(path,raw)
    if(!entry)differences.push({path,reason:'unexpected'})
    else if(entry.type!==actual.type)differences.push({path,reason:'type'})
    else {
      if(entry.rawMeta128Hex!==raw)differences.push({path,reason:'metadata'})
      if(actual.type==='file'){
        const hash=await hashAt(o,path,actual.size);filesVerified++;bytesVerified+=actual.size
        if(actual.size!==entry.size)differences.push({path,reason:'size'})
        if(hash!==entry.sha256)differences.push({path,reason:'sha256'})
      }
    }
    observe(o,'verifying',path,++done,records.size)
  }
  for(const path of expected.keys())if(!records.has(path))differences.push({path,reason:'missing'})
  observe(o,'verify-tree-again','',0,0)
  const after=await scan({...o,allowPending:true})
  need(snapshots.size===after.snapshots.size&&[...snapshots].every(([path,key])=>after.snapshots.get(path)===key),'MIGRATION_CHANGED','The directory tree changed during verification.')
  let rawDone=0
  for(const[path,raw]of observedRaw){need(await rawAt(o,path)===raw,'MIGRATION_CHANGED','Raw metadata changed during verification.');observe(o,'verify-metadata-again',path,++rawDone,observedRaw.size)}
  checkpoint(o)
  const report=Object.freeze({schema:1,kind:target?'migration-target-verification':'migration-source-verification',
    verified:differences.length===0,migrationReady:false,capacityStatus:'separate-proof-required',rootPath:root,archiveSha256:archive.archiveSha256,
    deviceIdentitySha256:await sha256Bytes(encoder.encode(o.deviceKey)),storageInfo:{...o.storageInfo},
    firmwareVersion:o.firmwareVersion||'',createdAt:new Date().toISOString(),filesVerified,bytesVerified,
    entriesExpected:expected.size,entriesObserved:records.size-excluded.length,differences,restoreBlockers:preflight.restoreBlockers,
    excludedArchiveJournals:target?archive.entries.filter(e=>journalPaths.has(e.sourcePath)&&e.type==='file').map(e=>e.sourcePath):[],
    excludedTargetJournals:excluded,limits:'Fresh sequential reads and before/after tree/raw-metadata comparisons; not an atomic filesystem snapshot.'})
  if(!target&&report.verified&&!report.restoreBlockers.length&&o.storageInfo.backend===1)sourceReports.set(report,{archive,deviceKey:o.deviceKey})
  if(target)targetReports.set(report,{archive,deviceKey:o.deviceKey,repairs:differences.filter(d=>['sha256','size'].includes(d.reason)).map(d=>d.path)})
  return report
}
/** Only a report produced by actual complete reads can create a source receipt. */
export async function retainMigrationSource({archive,report},store=migrationTicketStore){
  need(sourceReports.get(report)?.archive===archive,'MIGRATION_TICKET','A fresh complete source comparison is required.')
  const receipt=Object.freeze({schema:1,kind:'verified-migration-source',verified:true,archiveSha256:archive.archiveSha256,
    deviceIdentitySha256:report.deviceIdentitySha256,createdAt:report.createdAt,entries:report.entriesExpected})
  sourceReports.delete(report)
  const key=receipt.archiveSha256+':'+receipt.deviceIdentitySha256
  need(!formatMarkers.has(key),'MIGRATION_TICKET','This source receipt has already been used. It cannot authorize another format.')
  sourceTickets.set(key,receipt)
  try{await store.put(receipt);return {retained:true,persistent:true}}
  catch{return {retained:true,persistent:false}}
}
async function markFormat(o,state,identity){
  const deviceHash=await sha256Bytes(encoder.encode(o.deviceKey)),key=o.archive.archiveSha256+':'+deviceHash
  const target=proof(o)
  need(migrationApplicationMatches(identity,target),'MIGRATION_IDENTITY','The format/completion receipt needs the current approved application identity.')
  const previous=state==='finished'?(await migrationTicketStore.getMarker(o.archive.archiveSha256,deviceHash)||formatMarkers.get(key)):null
  if(previous)need(previous.archiveSha256===o.archive.archiveSha256&&previous.deviceIdentitySha256===deviceHash&&previous.engineSha256===target.layout.engineSha256&&
    migrationApplicationMatches({...previous,settingsCrcValid:true},target),'MIGRATION_TICKET','An existing receipt belongs to another archive, engine or application.')
  // An earlier 603 format receipt remains a 603 receipt after a compatible
  // 604 update. Only its terminal state changes; no historical binding is rewritten.
  const marker=Object.freeze(previous?{...previous,state}:{schema:1,kind:'migration-format-marker',state,archiveSha256:o.archive.archiveSha256,
    deviceIdentitySha256:deviceHash,engineSha256:target.layout.engineSha256,applicationCounter:identity.applicationCounter,firmwareVersion:identity.firmwareVersion})
  sourceTickets.delete(key)
  await migrationTicketStore.mark(marker)
  formatMarkers.set(key,marker)
  checkpoint(o)
}
function proof(o){
  const binding=capacityProofs.get(o.capacityProof),target=binding?.target
  need(target?.approved===true&&binding.archive===o.archive&&target===getMigrationCapacityTarget(binding.capacityProfile)&&
    (o.capacityProfile===undefined||o.capacityProfile===binding.capacityProfile)&&o.capacityProof.capacityProfile===binding.capacityProfile&&o.capacityProof.wasmSha256===target.wasmSha256&&
    o.capacityProof.engineSha256===target.layout.engineSha256,'MIGRATION_CAPACITY','A complete current capacity proof for this exact archive is required.')
  return target
}
async function targetState(o,{mounted=false}={}){
  const target=proof(o);checkpoint(o);need(typeof o.deviceKey==='string'&&o.deviceKey,'MIGRATION_IDENTITY','A current device identity is required.')
  const layout=await o.readStorageLayout();checkpoint(o)
  const identity=await o.readApplicationIdentity();checkpoint(o)
  matchMigrationLayout(layout,identity,target,{mounted})
  const state=checkImportState(await o.readImportState(),{mounted});checkpoint(o)
  need(state.mounted===layout.mounted,'MIGRATION_LAYOUT','The mounted state changed during the target check.')
  return {layout,identity,state}
}
export async function inspectMigrationTarget(o){preflightMigrationArchive(o.archive);return targetState(o)}
/** Explicit first format only; never used for an interrupted pending import. */
export async function formatMigrationTarget(o){
  preflightMigrationArchive(o.archive);let snapshot=await targetState(o)
  const confirmedIdentity=snapshot.identity
  need(!snapshot.state.mounted,'MIGRATION_PENDING','Packed storage already exists. Resume or verify it without another format.')
  const deviceHash=await sha256Bytes(encoder.encode(o.deviceKey)),key=o.archive.archiveSha256+':'+deviceHash
  const target=proof(o)
  const marker=await migrationTicketStore.getMarker(o.archive.archiveSha256,deviceHash)||formatMarkers.get(key)
  checkpoint(o)
  const retry=!!marker
  if(marker)need(marker.state==='format_attempted'&&marker.archiveSha256===o.archive.archiveSha256&&marker.deviceIdentitySha256===deviceHash&&
    marker.engineSha256===target.layout.engineSha256&&marker.applicationCounter===confirmedIdentity.applicationCounter&&marker.firmwareVersion===confirmedIdentity.firmwareVersion,
    'MIGRATION_TICKET','The prior attempt is finished or belongs to another target. Its old source receipt cannot authorize formatting.')
  let receipt=sourceTickets.get(key)
  if(!receipt){try{receipt=await migrationTicketStore.get(o.archive.archiveSha256,deviceHash)}catch{/* fail closed below */}}
  need(retry||validMigrationTicket(receipt,o.archive.archiveSha256,deviceHash),'MIGRATION_TICKET','The verified source receipt is absent in this browser. No format is authorized.')
  need(typeof o.confirmFormat==='function','MIGRATION_CONFIRM','Explicit format confirmation is required.')
  await o.confirmFormat({archiveSha256:o.archive.archiveSha256,deviceKey:o.deviceKey,files:o.archive.fileCount,rootPath:root,recoveryAttempt:retry});checkpoint(o)
  snapshot=await targetState(o)
  need(snapshot.identity.applicationCounter===confirmedIdentity.applicationCounter&&snapshot.identity.firmwareVersion===confirmedIdentity.firmwareVersion,'MIGRATION_IDENTITY','The application changed after format confirmation.')
  need(!snapshot.state.mounted,'MIGRATION_PENDING','Packed storage appeared. No second format was attempted.')
  // Persist the one-shot intent before any destructive command. Ambiguous
  // completion cannot be retried using an old SPIFFS comparison receipt.
  await markFormat(o,'format_attempted',snapshot.identity)
  const progress={operation:'format',state:'possible'}
  try{await o.formatStorage();progress.state='acknowledged';checkpoint(o)
    const state=checkImportState(await o.readImportState(),{mounted:true,pending:true});checkpoint(o)
    need(!state.bound,'MIGRATION_STATE','A new format must begin unbound.');return {formatted:true,state}
  }catch(error){error.migrationProgress={attempts:[progress],completed:[],recoveryFiles:[]};throw error}
}
/** Crash-safe archive binding can resume on a different PC without a new format. */
export async function initializeMigrationImport(o){
  preflightMigrationArchive(o.archive);const {state}=await targetState(o,{mounted:true})
  checkImportState(state,{pending:true})
  if(state.bound)return checkImportState(state,{archiveSha256:o.archive.archiveSha256})
  const current=await scan(o);need(current.records.size===0,'MIGRATION_EXTRA','An unbound import must be empty before selecting its archive.')
  need(typeof o.confirmInitialize==='function','MIGRATION_CONFIRM','Explicit recovery initialization is required.')
  await o.confirmInitialize({archiveSha256:o.archive.archiveSha256,files:o.archive.fileCount,rootPath:root});checkpoint(o)
  const fresh=await targetState(o,{mounted:true});checkImportState(fresh.state,{pending:true})
  if(fresh.state.bound)return checkImportState(fresh.state,{archiveSha256:o.archive.archiveSha256})
  // The confirmation can remain open indefinitely. Do not bind a target whose
  // namespace changed while waiting, even when its import flags are unchanged.
  const confirmed=await scan(o);need(confirmed.records.size===0,'MIGRATION_EXTRA','The unbound target is no longer empty. No archive binding was attempted.')
  const result=await o.bindImport(o.archive.archiveSha256);checkpoint(o)
  return checkImportState(result,{mounted:true,pending:true,archiveSha256:o.archive.archiveSha256})
}
/** Complete fresh comparison is repeated immediately before the persistent seal. */
export async function finishMigrationImport(o){
  const snapshot=await targetState(o,{mounted:true});checkImportState(snapshot.state,{archiveSha256:o.archive.archiveSha256})
  const verification=await verifyMigrationArchive({...o,target:true,storageInfo:{schema:1,drive:'E',backend:3,mounted:true,flags:7,metaLen:128,pathMax:64,nameMax:48}})
  if(!verification.verified||verification.restoreBlockers.length){const error=new MigrationError('MIGRATION_VERIFY','Fresh full byte, raw128 and namespace verification did not match.');error.verification=verification;throw error}
  const fresh=await targetState(o,{mounted:true});checkImportState(fresh.state,{archiveSha256:o.archive.archiveSha256});checkpoint(o)
  await markFormat(o,'finished',fresh.identity)
  const state=checkImportState(await o.finishImport(),{mounted:true,ready:true,archiveSha256:o.archive.archiveSha256});checkpoint(o)
  return {verification,state,finished:true}
}
export async function restartAfterMigration(o){
  const snapshot=await targetState(o,{mounted:true});checkImportState(snapshot.state,{ready:true,archiveSha256:o.archive.archiveSha256})
  need(typeof o.confirmRestart==='function','MIGRATION_CONFIRM','Explicit restart confirmation is required.')
  await o.confirmRestart();checkpoint(o)
  const fresh=await targetState(o,{mounted:true});checkImportState(fresh.state,{ready:true,archiveSha256:o.archive.archiveSha256})
  // A disconnect can immediately follow the acknowledged reboot; do not turn
  // an expected generation change into a retry or an automatic second command.
  return o.restartDevice()
}
/** Full restoration, no format or automatic deletion of unrelated target entries. */
export async function restoreMigrationArchive(o){
  const {archive}=o;preflightMigrationArchive(archive);checkedStorage(o.storageInfo,{target:true});checkpoint(o)
  need(o.deferFinalVerification===undefined||typeof o.deferFinalVerification==='boolean','MIGRATION_API','Invalid final-verification option.')
  const snapshot=await targetState(o,{mounted:true});checkImportState(snapshot.state,{pending:true,archiveSha256:archive.archiveSha256})
  const repairs=new Set()
  if(o.repairVerification){
    const bound=targetReports.get(o.repairVerification)
    need(bound?.archive===archive&&bound.deviceKey===o.deviceKey&&!o.repairVerification.verified,'MIGRATION_REPAIR','Only a fresh comparison produced for this archive and device can select repairs.')
    for(const path of bound.repairs)repairs.add(path)
  }
  const entries=archive.entries.filter(e=>!journalPaths.has(e.sourcePath)).slice().sort((a,b)=>(b.type==='directory')-(a.type==='directory')||a.relativePath.split('/').length-b.relativePath.split('/').length||(a.sourcePath<b.sourcePath?-1:a.sourcePath>b.sourcePath?1:0))
  const staging=await migrationStagingPlan(archive);checkpoint(o)
  const listings=new Map()
  const initial=await scan({...o,readDirectory:async path=>{const values=await o.readDirectory(path);listings.set(path,structuredClone(checkedDirectory(values)));return values}}), intended=new Map(entries.map(e=>[e.sourcePath,e])), completed=[],attempts=[]
  const recovery=new Map(),cleanup=[]
  for(const plan of staging.values()){recovery.set(plan.stage,plan);recovery.set(plan.backup,plan)}
  const collisionKey=path=>parent(path)+'\0'+portableNameKey(name(path)),peersByName=new Map()
  for(const existing of initial.records.values()){
    const key=collisionKey(existing.sourcePath),peers=peersByName.get(key)
    if(peers)peers.push(existing.sourcePath);else peersByName.set(key,[existing.sourcePath])
  }
  // No late discovery of known conflicts after the first write.
  for(const entry of entries){
    const existing=initial.records.get(entry.sourcePath)
    need(!existing||existing.type===entry.type,'MIGRATION_CONFLICT','Destination file/folder type differs.')
    need(!existing||entry.type!=='file'||existing.size<=entry.size,'MIGRATION_CONFLICT','An existing file is larger than the archived source; its staging cost is not covered by this capacity proof.')
    const peers=peersByName.get(collisionKey(entry.sourcePath))||[]
    need(peers.every(path=>path===entry.sourcePath),'MIGRATION_COLLISION','A destination name collides.')
  }
  for(const existing of initial.records.values())if(!intended.has(existing.sourcePath)&&!journalPaths.has(existing.sourcePath)){
    const plan=recovery.get(existing.sourcePath),source=plan&&intended.get(plan.sourcePath)
    need(plan&&existing.type==='file'&&existing.size<=source.size,'MIGRATION_EXTRA','The destination contains unrelated entries; no automatic deletion was attempted.')
    checkpoint(o);const actual=asBytes(await o.readFile(existing.sourcePath,{maxBytes:existing.size}));checkpoint(o)
    const expected=readBackupArchiveFile(archive,source.sourcePath)
    need(actual.length===existing.size&&actual.every((byte,i)=>byte===expected[i]),'MIGRATION_EXTRA','An interrupted staging/backup file contains different bytes. It was preserved; resolve this recovery copy before continuing. No automatic deletion was attempted.')
    cleanup.push(existing.sourcePath)
  }
  // This index never leaves this call and is never used for the final proof.
  const index=o.useNamespaceIndex===false?null:migrationNamespace(o,listings,{...snapshot.state,deviceKey:o.deviceKey})
  const io=index?.adapters||o
  try{
    const current=await targetState(o,{mounted:true});checkImportState(current.state,{pending:true,archiveSha256:archive.archiveSha256})
    // Only exact names derived from this bound archive and verified prefixes.
    // Unknown entries were all checked before any cleanup mutation starts.
    for(const path of cleanup){checkpoint(o);const attempt={path,operation:'recovery-stage-cleanup',state:'possible'};attempts.push(attempt)
      await io.remove(path);attempt.state='acknowledged';checkpoint(o)
      // Cleanup of a previous interrupted attempt stays a physical readback.
      need(!(await listing(o,parent(path))).some(e=>e.name===name(path)),'MIGRATION_RECOVERY','The confirmed staging cleanup could not be verified.')
      initial.records.delete(path)
    }
    for(const entry of entries.filter(e=>e.type==='directory'))if(!initial.records.has(entry.sourcePath)){
      checkpoint(o);const attempt={path:entry.sourcePath,operation:'mkdir',state:'possible'};attempts.push(attempt)
      await io.createDirectory(entry.sourcePath);attempt.state='acknowledged';checkpoint(o)
    }
    for(const entry of entries.filter(e=>e.type==='file')){
      checkpoint(o);const existing=initial.records.get(entry.sourcePath)
      let rawCommitted=false
      // Size-matching entries remain explicitly UNVERIFIED until the single
      // final comparison. A real failed comparison selects exact byte repairs.
      const same=existing&&existing.size===entry.size&&!repairs.has(entry.sourcePath)
      if(!same){
        const attempt={path:entry.sourcePath,operation:'file',state:'possible'};attempts.push(attempt)
        const receipt=await migrationStagedUpload({...io,
          onProgress:p=>detail(o,{phase:'restoring',path:entry.sourcePath,done:completed.length,total:entries.length,
            filePhase:p.phase,fileDone:p.done??0,fileTotal:p.total??entry.size})},
          entry,readBackupArchiveFile(archive,entry.sourcePath),staging.get(entry.sourcePath),existing)
        rawCommitted=receipt.rawCommitted===true
        index?.assertHealthy()
        attempt.state='acknowledged';checkpoint(o)
      }
      if(!rawCommitted){const attempt={path:entry.sourcePath,operation:'raw-metadata',state:'possible'};attempts.push(attempt)
        await io.updateRawMetadata(entry.sourcePath,rawMetadataBytes(entry.rawMeta128Hex));attempt.state='acknowledged';checkpoint(o)}
      completed.push(entry.sourcePath);observe(o,'restoring',entry.sourcePath,completed.length,entries.length)
    }
    for(const entry of entries.filter(e=>e.type==='directory').reverse()){
      checkpoint(o);const attempt={path:entry.sourcePath,operation:'raw-metadata',state:'possible'};attempts.push(attempt)
      await io.updateRawMetadata(entry.sourcePath,rawMetadataBytes(entry.rawMeta128Hex));attempt.state='acknowledged';checkpoint(o)
      completed.push(entry.sourcePath);observe(o,'restoring',entry.sourcePath,completed.length,entries.length)
    }
    index?.assertHealthy()
    const namespace=index?.stats()||null
    if(o.deferFinalVerification===true)return {completed,attempts,verification:null,verified:false,deferred:true,readyForFinalVerification:true,namespace}
    const verification=await verifyMigrationArchive({...o,target:true})
    return {completed,attempts,verification,verified:verification.verified,deferred:false,namespace}
  }catch(error){error.migrationProgress={completed:completed.slice(),attempts:attempts.map(x=>({...x})),recoveryFiles:error.recoveryFiles||[],uploadReceipt:error.migrationUploadReceipt||null,namespace:index?.stats()||null};throw error}
  finally{index?.dispose()}
}
