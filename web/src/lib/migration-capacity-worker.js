import { simulateCapacity } from './migration-capacity-engine.js'
import { getMigrationCapacityTarget } from './migration-capacity.js'
let started=false
self.onmessage=async({data})=>{
  if(started)return;started=true
  try{
    if(!data||typeof data!=='object'||Object.keys(data).some(key=>!['rows','archiveSha256','capacityProfile'].includes(key)))
      throw Object.assign(new Error('Only a local capacity profile ID may select the simulator.'),{code:'MIGRATION_CAPACITY'})
    const capacityProfile=data.capacityProfile===undefined?'current':data.capacityProfile,target=getMigrationCapacityTarget(capacityProfile)
    const report=await simulateCapacity(data.rows,target,{archiveSha256:data.archiveSha256,
      onProgress:progress=>self.postMessage({kind:'progress',progress})});self.postMessage({kind:'result',report:{...report,capacityProfile}})}
  catch(error){self.postMessage({kind:'error',code:error.code||'MIGRATION_CAPACITY',message:error.message})}
}
