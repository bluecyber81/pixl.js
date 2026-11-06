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
const previous={...legacy,
  wasmSha256:'410f213e0818a3a5e1d0ce381e202514f7dd3b834b1cec854d5fe6f180574b1f',
  url:'/lfs-capacity-previous.wasm',
  firmwareVersion:'2.22.0-DE3.37',applicationCounter:609,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.36',applicationCounter:608},{firmwareVersion:'2.22.0-DE3.37',applicationCounter:609}],
  geometry:{...legacy.geometry},
  layout:{...legacy.layout,engineSha256:'d13c90a1907cd9ee563cf7b14ad4d2b73307c49874021c369a0623fa7b382e6e'}
}
// Exact unchanged DE3.42–DE3.44 engine; older reviewed profiles remain separately selectable.
const de344={...previous,url:'/lfs-capacity-de344.wasm',
  wasmSha256:'06500c5b69bd61310352cecc07eadb50a17b0eecd22c9381d1118c3cf0f8ec9f',
  firmwareVersion:'2.22.0-DE3.44',applicationCounter:616,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.42',applicationCounter:614},{firmwareVersion:'2.22.0-DE3.43',applicationCounter:615},{firmwareVersion:'2.22.0-DE3.44',applicationCounter:616}],
  geometry:{...previous.geometry},layout:{...previous.layout,engineSha256:'e3f8e958d347a0df58888253916393db8afec3fe7c5466b215f471d346e2493e'}}
// Exact frozen DE3.45 engine; retained profiles keep their original source and binary identity.
const de345={...de344,approved:true,url:'/lfs-capacity-de345.wasm',wasmSha256:'a4cfd3b1d823f2d596ba67625364260bbe74979b28c7123fc863e549b7199c99',
  firmwareVersion:'2.22.0-DE3.45',applicationCounter:617,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.45',applicationCounter:617}],
  geometry:{...de344.geometry},layout:{...de344.layout,engineSha256:'532b316e72fd7b9edef868bd318d30c8a6be45880d98b68464bf12da31bac9e8'}}
// Exact unchanged DE3.46–DE3.50 engine; retained profiles keep their original source and binary identity.
const de350={...de345,approved:true,url:'/lfs-capacity-de350.wasm',wasmSha256:'0a2802690d575b2db70cbe49e2b6f0fd895b98eafcdf9cc2c654c98789cb611b',
  firmwareVersion:'2.22.0-DE3.50',applicationCounter:622,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.46',applicationCounter:618},{firmwareVersion:'2.22.0-DE3.47',applicationCounter:619},{firmwareVersion:'2.22.0-DE3.48',applicationCounter:620},{firmwareVersion:'2.22.0-DE3.49',applicationCounter:621},{firmwareVersion:'2.22.0-DE3.50',applicationCounter:622}],
  geometry:{...de345.geometry},layout:{...de345.layout,engineSha256:'a69d7b41bcb3ea72d02869290651efd00eea837109230f37364b3e1477a87059'}}
const de354={...de350,url:'/lfs-capacity-current.wasm',wasmSha256:'50466efc477831b665df8f07ae2a2d45f004a655c5198f71f237a46cb3f5a105',
  firmwareVersion:'2.22.0-DE3.54',applicationCounter:626,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.51',applicationCounter:623},{firmwareVersion:'2.22.0-DE3.52',applicationCounter:624},{firmwareVersion:'2.22.0-DE3.53',applicationCounter:625},{firmwareVersion:'2.22.0-DE3.54',applicationCounter:626}],
  geometry:{...de350.geometry},layout:{...de350.layout,engineSha256:'7f1c05d5159815922a89821ea23b080d25548ac3b2a075372b54905ca836496d'}}
// DE3.55 through DE3.62 use this CRC/wear engine and geometry.
const current={...de354,url:'/lfs-capacity-de355.wasm',wasmSha256:'652dfaab0f7078ffa5def2186b1cf962387097e431dd9513579aa0d7cf3388f9',
  firmwareVersion:'2.22.0-DE3.62',applicationCounter:634,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.55',applicationCounter:627},{firmwareVersion:'2.22.0-DE3.56',applicationCounter:628},{firmwareVersion:'2.22.0-DE3.57',applicationCounter:629},{firmwareVersion:'2.22.0-DE3.58',applicationCounter:630},{firmwareVersion:'2.22.0-DE3.59',applicationCounter:631},{firmwareVersion:'2.22.0-DE3.60',applicationCounter:632},{firmwareVersion:'2.22.0-DE3.61',applicationCounter:633},{firmwareVersion:'2.22.0-DE3.62',applicationCounter:634}],
  geometry:{...de354.geometry},layout:{...de354.layout,engineSha256:'2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248'}}
function freezeTarget(target){
  Object.freeze(target.layout);Object.freeze(target.geometry)
  target.approvedApplications.forEach(Object.freeze);Object.freeze(target.approvedApplications)
  return Object.freeze(target)
}
export const LEGACY_MIGRATION_CAPACITY_TARGET=freezeTarget(legacy)
export const PREVIOUS_MIGRATION_CAPACITY_TARGET=freezeTarget(previous)
export const DE344_MIGRATION_CAPACITY_TARGET=freezeTarget(de344)
export const DE345_MIGRATION_CAPACITY_TARGET=freezeTarget(de345)
export const DE350_MIGRATION_CAPACITY_TARGET=freezeTarget(de350)
export const DE354_MIGRATION_CAPACITY_TARGET=freezeTarget(de354)
export const MIGRATION_CAPACITY_TARGET=freezeTarget(current)
export function getMigrationCapacityTarget(profile='current'){
  if(profile==='current')return MIGRATION_CAPACITY_TARGET
  if(profile==='de354')return DE354_MIGRATION_CAPACITY_TARGET
  if(profile==='de350')return DE350_MIGRATION_CAPACITY_TARGET
  if(profile==='de345')return DE345_MIGRATION_CAPACITY_TARGET
  if(profile==='de344')return DE344_MIGRATION_CAPACITY_TARGET
  if(profile==='previous')return PREVIOUS_MIGRATION_CAPACITY_TARGET
  if(profile==='legacy')return LEGACY_MIGRATION_CAPACITY_TARGET
  throw Object.assign(new Error('Unknown migration capacity profile.'),{code:'MIGRATION_CAPACITY'})
}
