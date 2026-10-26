// Origin-local proof of an actual completed source comparison. No ZIP contents,
// filenames, device addresses or imported reports enter this store.
const valid=r=>r?.schema===1&&r.kind==='verified-migration-source'&&r.verified===true&&
  /^[a-f0-9]{64}$/u.test(r.archiveSha256||'')&&/^[a-f0-9]{64}$/u.test(r.deviceIdentitySha256||'')&&
  typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt))&&Number.isSafeInteger(r.entries)&&r.entries>=0
const unavailable=()=>Object.assign(new Error('The durable local migration receipt is unavailable. Backups remain usable, but initialization or persistent finish is blocked until browser storage works.'),{code:'MIGRATION_TICKET'})
const validMarker=r=>r?.schema===1&&r.kind==='migration-format-marker'&&['format_attempted','finished'].includes(r.state)&&
  /^[a-f0-9]{64}$/u.test(r.archiveSha256||'')&&/^[a-f0-9]{64}$/u.test(r.deviceIdentitySha256||'')&&
  /^[a-f0-9]{64}$/u.test(r.engineSha256||'')&&Number.isSafeInteger(r.applicationCounter)&&r.applicationCounter>0&&typeof r.firmwareVersion==='string'
const sameBinding=(a,b)=>['archiveSha256','deviceIdentitySha256','engineSha256','applicationCounter','firmwareVersion'].every(k=>a[k]===b[k])
export function createMigrationTicketStore({indexedDB=globalThis.indexedDB,timeoutMs=3000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let opening
  function database(){
    if(!indexedDB)return Promise.reject(unavailable())
    if(opening)return opening
    let request,settled=false,pending
    pending=new Promise((resolve,reject)=>{
      const timer=setTimer(()=>finish(false),timeoutMs)
      const finish=(ok,db)=>{if(settled){if(ok)db.close();return}settled=true;clearTimer(timer);if(!ok){if(opening===pending)opening=null;reject(unavailable())}else resolve(db)}
      try{request=indexedDB.open('allmiibo-migration-receipts',1)}catch{finish(false);return}
      request.onupgradeneeded=()=>{try{request.result.createObjectStore('source',{keyPath:'key'})}catch{finish(false)}}
      request.onerror=request.onblocked=()=>finish(false)
      request.onsuccess=()=>{const db=request.result;const invalidate=()=>{if(opening===pending)opening=null};db.onclose=invalidate;db.onversionchange=()=>{db.close();invalidate()};finish(true,db)}
    })
    opening=pending
    pending.catch(()=>{if(opening===pending)opening=null})
    return pending
  }
  async function transaction(mode,action){const connection=database(),db=await connection;return new Promise((resolve,reject)=>{
    let tx,value,settled=false
    const finish=ok=>{if(settled)return;settled=true;clearTimer(timer);ok?resolve(value):reject(unavailable())}
    const invalidate=()=>{if(opening===connection)opening=null;try{db.close()}catch{}}
    const timer=setTimer(()=>{finish(false);try{tx?.abort()}catch{}invalidate()},timeoutMs)
    try{tx=db.transaction('source',mode);tx.oncomplete=()=>finish(true);tx.onerror=tx.onabort=()=>finish(false)
      action(tx.objectStore('source'),result=>{value=result},()=>{try{tx.abort()}catch{}finish(false)})
    }catch(error){try{tx?.abort()}catch{}if(!tx&&error?.name==='InvalidStateError')invalidate();finish(false)}
  })}
  return Object.freeze({
    async put(receipt){if(!valid(receipt))throw unavailable();const key=receipt.archiveSha256+':'+receipt.deviceIdentitySha256;await transaction('readwrite',(store,_value,fail)=>{const request=store.get('device:'+receipt.deviceIdentitySha256);request.onsuccess=()=>{if(request.result?.marker){fail();return}store.put({key,receipt:{...receipt}})}})},
    async mark(marker){if(!validMarker(marker))throw unavailable();const key=marker.archiveSha256+':'+marker.deviceIdentitySha256,deviceKey='device:'+marker.deviceIdentitySha256;await transaction('readwrite',(store,_value,fail)=>{const request=store.get(deviceKey);request.onsuccess=()=>{const old=request.result?.marker;if(old&&(!validMarker(old)||!sameBinding(old,marker)||(old.state==='finished'&&marker.state!=='finished'))){fail();return}store.put({key,marker:{...marker}});store.put({key:deviceKey,marker:{...marker}})}})},
    async getMarker(_archiveSha256,deviceIdentitySha256){const record=await transaction('readonly',(store,value)=>{const request=store.get('device:'+deviceIdentitySha256);request.onsuccess=()=>value(request.result)});if(record?.marker&&!validMarker(record.marker))throw unavailable();return validMarker(record?.marker)?Object.freeze({...record.marker}):null},
    async get(archiveSha256,deviceIdentitySha256){const record=await transaction('readonly',(store,value)=>{const request=store.get(archiveSha256+':'+deviceIdentitySha256);request.onsuccess=()=>value(request.result)});return !record?.marker&&valid(record?.receipt)?Object.freeze({...record.receipt}):null}
  })
}
export const migrationTicketStore=createMigrationTicketStore()
export function validMigrationTicket(value,archiveSha256,deviceIdentitySha256){return valid(value)&&value.archiveSha256===archiveSha256&&value.deviceIdentitySha256===deviceIdentitySha256}
