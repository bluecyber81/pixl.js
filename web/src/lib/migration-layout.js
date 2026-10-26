const need=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'MIGRATION_LAYOUT'})}
const fields=['schema','drive','backend','magic','flashBytes','blockSize','blockCount','readSize','progSize','cacheSize',
  'metadataBytes','shardTarget','maxShards','pathCap','nameCap','maxHandles','flags','engineSha256']
export function migrationApplicationMatches(identity,target){
  const applications=target?.approvedApplications||[{firmwareVersion:target?.firmwareVersion,applicationCounter:target?.applicationCounter}]
  return identity?.settingsCrcValid===true&&applications.some(app=>identity.firmwareVersion===app.firmwareVersion&&identity.applicationCounter===app.applicationCounter)
}
export function matchMigrationLayout(layout,identity,target,{mounted=false}={}){
  need(target?.approved===true&&target.layout&&/^[a-f0-9]{64}$/u.test(target.layout.engineSha256||''),'No approved packed-storage engine is available.')
  need(layout&&fields.every(key=>layout[key]===target.layout[key])&&typeof layout.mounted==='boolean','The device storage engine or geometry does not match the simulator.')
  need(!mounted||layout.mounted,'The target is not mounted. A separate explicit format or recovery step is required.')
  need(migrationApplicationMatches(identity,target),
    'The freshly read application version/counter does not match this migration target.')
  return Object.freeze({...layout})
}
export function checkImportState(state,{mounted=false,archiveSha256=null,pending=false,ready=false}={}){
  need(state?.schema===1&&state.drive==='E'&&state.backend===3&&['mounted','pending','ready','bound','rebootRequired'].every(k=>typeof state[k]==='boolean')&&
    state.ready===(state.mounted&&!state.pending)&&
    (state.bound?/^[a-f0-9]{64}$/u.test(state.archiveSha256||'')&&!/^0{64}$/u.test(state.archiveSha256):state.archiveSha256===null),'Invalid target import state.')
  need(!mounted||state.mounted,'The import target is not mounted.')
  need(!pending||state.pending,'This target has no unfinished import. It must not be formatted again automatically.')
  need(!ready||state.ready,'The import is not complete.')
  need(!archiveSha256||state.bound&&state.archiveSha256===archiveSha256,'This device is bound to a different backup archive.')
  return Object.freeze({...state})
}
