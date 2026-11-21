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
// DE3.55 through DE3.70 use this CRC/wear engine and geometry.
const currentApplications = [
  {firmwareVersion:'2.22.0-DE3.55',applicationCounter:627},
  {firmwareVersion:'2.22.0-DE3.56',applicationCounter:628},
  {firmwareVersion:'2.22.0-DE3.57',applicationCounter:629},
  {firmwareVersion:'2.22.0-DE3.58',applicationCounter:630},
  {firmwareVersion:'2.22.0-DE3.59',applicationCounter:631},
  {firmwareVersion:'2.22.0-DE3.60',applicationCounter:632},
  {firmwareVersion:'2.22.0-DE3.61',applicationCounter:633},
  {firmwareVersion:'2.22.0-DE3.62',applicationCounter:634},
  {firmwareVersion:'2.22.0-DE3.63',applicationCounter:635},
  {firmwareVersion:'2.22.0-DE3.64',applicationCounter:636},
  {firmwareVersion:'2.22.0-DE3.65',applicationCounter:637},
  {firmwareVersion:'2.22.0-DE3.66',applicationCounter:638},
  {firmwareVersion:'2.22.0-DE3.67',applicationCounter:639},
  {firmwareVersion:'2.22.0-DE3.68',applicationCounter:640},
  {firmwareVersion:'2.22.0-DE3.69',applicationCounter:641},
  {firmwareVersion:'2.22.0-DE3.70',applicationCounter:642},
]
const current={...de354,url:'/lfs-capacity-de355.wasm',wasmSha256:'652dfaab0f7078ffa5def2186b1cf962387097e431dd9513579aa0d7cf3388f9',
  firmwareVersion:'2.22.0-DE3.87', applicationCounter:660,
  // Exact T1 qualification: identical six-file engine manifest, constants,
  // final ELF/BIN layout and embedded identity, and unchanged capacity WASM.
  // Subsequent exact profile bindings: docs/validation/DE3_72_PFS.json, DE3_73_PFS.json, DE3_74_PFS.json, DE3_75_PFS.json, DE3_76_PFS.json, DE3_77_PFS.json, DE3_79_PFS.json, DE3_80_PFS.json, DE3_81_PFS.json, DE3_82_PFS.json, DE3_83_PFS.json, DE3_84_PFS.json, DE3_85_PFS.json, DE3_86_PFS.json, DE3_87_PFS.json and DE3_88_PFS.json.
  // The simulator defaults to App660. Saved results must match an approved application and geometry.
  approvedApplications:[...currentApplications,{firmwareVersion:'2.22.0-DE3.71t1',applicationCounter:644},
    {firmwareVersion:'2.22.0-DE3.72',applicationCounter:645},
    {firmwareVersion:'2.22.0-DE3.73',applicationCounter:646},
    {firmwareVersion:'2.22.0-DE3.74',applicationCounter:647},
    {firmwareVersion:'2.22.0-DE3.75',applicationCounter:648},
    {firmwareVersion:'2.22.0-DE3.76',applicationCounter:649},
    {firmwareVersion:'2.22.0-DE3.77',applicationCounter:650},
    {firmwareVersion:'2.22.0-DE3.79',applicationCounter:652},
    {firmwareVersion:'2.22.0-DE3.80',applicationCounter:653},
    {firmwareVersion:'2.22.0-DE3.81',applicationCounter:654},
    {firmwareVersion:'2.22.0-DE3.82',applicationCounter:655},
    {firmwareVersion:'2.22.0-DE3.83',applicationCounter:656},
    {firmwareVersion:'2.22.0-DE3.84',applicationCounter:657},
    {firmwareVersion:'2.22.0-DE3.85',applicationCounter:658},
    {firmwareVersion:'2.22.0-DE3.86',applicationCounter:659},
    {firmwareVersion:'2.22.0-DE3.87',applicationCounter:660},
    {firmwareVersion:'2.22.0-DE3.88',applicationCounter:661}],
  geometry:{...de354.geometry},layout:{...de354.layout,engineSha256:'2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248'}}
const de389={...current,url:'/lfs-capacity-de389.wasm',wasmSha256:'e62f5857d60acea148edc365b85aaa22756fba8bd7f566d03d2f70ef605cad5c',
  firmwareVersion:'2.22.0-DE3.89',applicationCounter:662,
  approvedApplications:[{firmwareVersion:'2.22.0-DE3.89',applicationCounter:662}],
  geometry:{...current.geometry},layout:{...current.layout,engineSha256:'b0ae389e7fac3c7ce5f28607de7cd1cadad5465ab2ad4c1e2dc853fbfa2533da'}}
const de391 = {
  ...de389,
  url: '/lfs-capacity-de391.wasm',
  wasmSha256: '91ca3ef469ea6ecfca1dc18c80ad39d60977fc591b823274324c516bb7024548',
  firmwareVersion: '2.22.0-DE3.91',
  applicationCounter: 664,
  approvedApplications: [{firmwareVersion: '2.22.0-DE3.91', applicationCounter: 664}],
  geometry: {...de389.geometry},
  layout: {...de389.layout, engineSha256: 'a0d15c28160774dd83ba80a71e8aad61fb41cd7ae0209eeec5486be7ea00d7a2'},
}
// Private App665 has its own exact GC engine and separately pinned WASI toolchain.
const de392 = {
  ...de391,
  url: '/lfs-capacity-de392.wasm',
  wasmSha256: '08428602391b6d9f8ee1bfb28abf683a5a774b97d75242da70d8d0f2f6314d16',
  firmwareVersion: '2.22.0-DE3.92',
  applicationCounter: 665,
  approvedApplications: [{firmwareVersion: '2.22.0-DE3.92', applicationCounter: 665}],
  geometry: {...de391.geometry},
  layout: {...de391.layout, engineSha256: '605356ff74646392adcfb26adf5c7d39fe7138272e84b4e4a0f167b94e34c2c1'},
}
// App666 keeps the PFS1 layout and has its own exact collection engine.
const de393 = {
  ...de392,
  approved: true,
  url: '/lfs-capacity-de393.wasm',
  wasmSha256: 'f63157b7c22552cf0b23e9502e1c047cc40a205e198b908633bef8a8921e9c96',
  firmwareVersion: '2.22.0-DE3.93',
  applicationCounter: 666,
  approvedApplications: [{firmwareVersion: '2.22.0-DE3.93', applicationCounter: 666}],
  geometry: {...de392.geometry},
  layout: {...de392.layout, engineSha256: '7c7f2d25b90892980e9ce76e18cdaaa3782f18b940d95b8e37be6eb40831318e'},
}
// App667 reuses the exact DE393 engine/WASM with its own linked ARM qualification
// in docs/validation/DE3_94_PFS.json. Approval is specific to the new application.
const de394 = {
  ...de393,
  approved: true,
  firmwareVersion: '2.22.0-DE3.94',
  applicationCounter: 667,
  approvedApplications: [{firmwareVersion: '2.22.0-DE3.94', applicationCounter: 667}],
  geometry: {...de393.geometry},
  layout: {...de393.layout},
}
// App668 has its own bounded-catalog engine and a separately reproduced WASM.
// Exact linked LCD qualification: docs/validation/DE3_95_PFS.json.
const de395 = {
  ...de394,
  approved: true,
  url: '/lfs-capacity-de395.wasm',
  wasmSha256: '311519a0da49474b57376908f836f2f45deccb90a9bbda855ae09343633b151c',
  firmwareVersion: '2.22.0-DE3.95',
  applicationCounter: 668,
  approvedApplications: [{firmwareVersion: '2.22.0-DE3.95', applicationCounter: 668}],
  geometry: {...de394.geometry},
  layout: {...de394.layout, engineSha256: 'a9bdec38eaa41680e1c9fdebd5fd12995e9d38ff070560ff605fd387d471dabd'},
}
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
export const DE389_MIGRATION_CAPACITY_TARGET=freezeTarget(de389)
export const DE391_MIGRATION_CAPACITY_TARGET=freezeTarget(de391)
export const DE392_MIGRATION_CAPACITY_TARGET=freezeTarget(de392)
export const DE393_MIGRATION_CAPACITY_TARGET=freezeTarget(de393)
export const DE394_MIGRATION_CAPACITY_TARGET=freezeTarget(de394)
export const DE395_MIGRATION_CAPACITY_TARGET=freezeTarget(de395)
export function getMigrationCapacityTarget(profile='current'){
  if(profile==='de395')return DE395_MIGRATION_CAPACITY_TARGET
  if(profile==='de394')return DE394_MIGRATION_CAPACITY_TARGET
  if(profile==='de393')return DE393_MIGRATION_CAPACITY_TARGET
  if(profile==='de392')return DE392_MIGRATION_CAPACITY_TARGET
  if(profile==='de391')return DE391_MIGRATION_CAPACITY_TARGET
  if(profile==='current')return MIGRATION_CAPACITY_TARGET
  if(profile==='de389')return DE389_MIGRATION_CAPACITY_TARGET
  if(profile==='de354')return DE354_MIGRATION_CAPACITY_TARGET
  if(profile==='de350')return DE350_MIGRATION_CAPACITY_TARGET
  if(profile==='de345')return DE345_MIGRATION_CAPACITY_TARGET
  if(profile==='de344')return DE344_MIGRATION_CAPACITY_TARGET
  if(profile==='previous')return PREVIOUS_MIGRATION_CAPACITY_TARGET
  if(profile==='legacy')return LEGACY_MIGRATION_CAPACITY_TARGET
  throw Object.assign(new Error('Unknown migration capacity profile.'),{code:'MIGRATION_CAPACITY'})
}
