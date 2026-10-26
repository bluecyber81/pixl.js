import { temporaryNames, sha256Bytes } from './safe-upload.js'
import { joinDevicePath, portableNameKey } from './portable-names.js'
const encoder=new TextEncoder()
const parent=p=>p.lastIndexOf('/')===2?'E:/':p.slice(0,p.lastIndexOf('/'))
const canonical=p=>p.split('/').map(portableNameKey).join('/')
/** The same safe-upload name rule, with archive/path binding for crash recovery. */
export async function migrationStagingPlan(archive){
  const occupied=new Set(archive.entries.map(e=>canonical(e.sourcePath))),plans=new Map()
  for(const entry of archive.entries.filter(e=>e.type==='file'&&!e.sourcePath.startsWith('E:/.pixl_txn')).slice().sort((a,b)=>a.sourcePath<b.sourcePath?-1:1)){
    let found
    for(let attempt=0;attempt<64&&!found;attempt++){
      const token=(await sha256Bytes(encoder.encode(`packed-import-v1\0${archive.archiveSha256}\0${entry.sourcePath}\0${attempt}`))).slice(0,12)
      const [a,b]=temporaryNames(parent(entry.sourcePath),token),stage=joinDevicePath(parent(entry.sourcePath),a),backup=joinDevicePath(parent(entry.sourcePath),b)
      if(occupied.has(canonical(stage))||occupied.has(canonical(backup))||canonical(stage)===canonical(backup))continue
      occupied.add(canonical(stage));occupied.add(canonical(backup));found=Object.freeze({token,stage,backup,sourcePath:entry.sourcePath})
    }
    if(!found)throw Object.assign(new Error('No unique archive-bound staging names fit this folder. No names were changed.'),{code:'MIGRATION_STAGING'})
    plans.set(entry.sourcePath,found)
  }
  return plans
}
