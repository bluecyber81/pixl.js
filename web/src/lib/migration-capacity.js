// Exact reviewed simulation engine. This alone never authorizes formatting.
const legacy={
  "approved": true,
  "scope": "Exact simulator approval only; every individual archive and current device still require all migration gates.",
  "wasmSha256": "8830aece6d900679ccfec27e4b1321ffc160aba9381023cd26c397d3e0dcb1d4",
  "url": "/lfs-capacity.wasm",
  "minimumReservePercent": 20,
  "firmwareVersion": "2.22.0-DE3.31",
  "applicationCounter": 603,
  "approvedApplications": [
    { "firmwareVersion": "2.22.0-DE3.31", "applicationCounter": 603 },
    { "firmwareVersion": "2.22.0-DE3.32", "applicationCounter": 604 },
    { "firmwareVersion": "2.22.0-DE3.33", "applicationCounter": 605 }
  ],
  "geometry": {
    "totalBlocks": 512,
    "blockSize": 4096,
    "metadataBytes": 128,
    "includesRestoreStaging": true
  },
  "layout": {
    "schema": 1,
    "drive": "E",
    "backend": 3,
    "magic": 827541072,
    "flashBytes": 2097152,
    "blockSize": 4096,
    "blockCount": 512,
    "readSize": 256,
    "progSize": 256,
    "cacheSize": 256,
    "metadataBytes": 128,
    "shardTarget": 32768,
    "maxShards": 64,
    "pathCap": 64,
    "nameCap": 48,
    "maxHandles": 8,
    "flags": 7,
    "engineSha256": "637a0dd2e7fbfbc0305191dc755a647c2d76c4d72cf1289090f3ef7136bf4bbd"
  }
}
const current={...legacy,
  wasmSha256:'410f213e0818a3a5e1d0ce381e202514f7dd3b834b1cec854d5fe6f180574b1f',
  url:'/lfs-capacity-current.wasm',
  firmwareVersion:'2.22.0-DE3.37',applicationCounter:609,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.36',applicationCounter:608},{firmwareVersion:'2.22.0-DE3.37',applicationCounter:609}],
  geometry:{...legacy.geometry},
  layout:{...legacy.layout,engineSha256:'d13c90a1907cd9ee563cf7b14ad4d2b73307c49874021c369a0623fa7b382e6e'}
}
function freezeTarget(target){
  Object.freeze(target.layout);Object.freeze(target.geometry)
  target.approvedApplications.forEach(Object.freeze);Object.freeze(target.approvedApplications)
  return Object.freeze(target)
}
export const LEGACY_MIGRATION_CAPACITY_TARGET=freezeTarget(legacy)
export const MIGRATION_CAPACITY_TARGET=freezeTarget(current)
export function getMigrationCapacityTarget(profile='current'){
  if(profile==='current')return MIGRATION_CAPACITY_TARGET
  if(profile==='legacy')return LEGACY_MIGRATION_CAPACITY_TARGET
  throw Object.assign(new Error('Unknown migration capacity profile.'),{code:'MIGRATION_CAPACITY'})
}
