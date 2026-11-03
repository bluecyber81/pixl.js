import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker} from 'node:worker_threads'
import {createHash} from 'node:crypto'

// tests/dist -> web/dist: production artifacts, not source-module substitutes.
const actualDist=path.resolve(process.env.ALLMIIBO_DIST_DIR||fileURLToPath(new URL('../../dist',import.meta.url)))
const base=process.env.ALLMIIBO_TEST_BASE_PATH||'/'
assert.ok(['/', '/pixl.js/'].includes(base))
const deployed=url=>base+url.slice(1)
const sha=data=>createHash('sha256').update(data).digest('hex')
const profiles={
 current:{url:'/lfs-capacity-de355.wasm',wasm:'652dfaab0f7078ffa5def2186b1cf962387097e431dd9513579aa0d7cf3388f9',engine:'2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248',counter:628,version:'2.22.0-DE3.56'},
 de354:{url:'/lfs-capacity-current.wasm',wasm:'50466efc477831b665df8f07ae2a2d45f004a655c5198f71f237a46cb3f5a105',engine:'7f1c05d5159815922a89821ea23b080d25548ac3b2a075372b54905ca836496d',counter:626,version:'2.22.0-DE3.54'},
 de350:{url:'/lfs-capacity-de350.wasm',wasm:'0a2802690d575b2db70cbe49e2b6f0fd895b98eafcdf9cc2c654c98789cb611b',engine:'a69d7b41bcb3ea72d02869290651efd00eea837109230f37364b3e1477a87059',counter:622,version:'2.22.0-DE3.50'},
 de345:{url:'/lfs-capacity-de345.wasm',wasm:'a4cfd3b1d823f2d596ba67625364260bbe74979b28c7123fc863e549b7199c99',engine:'532b316e72fd7b9edef868bd318d30c8a6be45880d98b68464bf12da31bac9e8',counter:617,version:'2.22.0-DE3.45'},
 de344:{url:'/lfs-capacity-de344.wasm',wasm:'06500c5b69bd61310352cecc07eadb50a17b0eecd22c9381d1118c3cf0f8ec9f',engine:'e3f8e958d347a0df58888253916393db8afec3fe7c5466b215f471d346e2493e',counter:616,version:'2.22.0-DE3.44'},
 previous:{url:'/lfs-capacity-previous.wasm',wasm:'410f213e0818a3a5e1d0ce381e202514f7dd3b834b1cec854d5fe6f180574b1f',engine:'d13c90a1907cd9ee563cf7b14ad4d2b73307c49874021c369a0623fa7b382e6e',counter:609,version:'2.22.0-DE3.37'},
 legacy:{url:'/lfs-capacity.wasm',wasm:'8830aece6d900679ccfec27e4b1321ffc160aba9381023cd26c397d3e0dcb1d4',engine:'637a0dd2e7fbfbc0305191dc755a647c2d76c4d72cf1289090f3ef7136bf4bbd',counter:603,version:'2.22.0-DE3.31'},
}
function artifact(){
 const names=fs.readdirSync(path.join(actualDist,'assets')).filter(name=>/^migration-capacity-worker-[\w-]+\.js$/.test(name))
 assert.equal(names.length,1,'production build must contain exactly one bundled capacity worker')
 return path.join(actualDist,'assets',names[0])
}
const rows=[{path:'/Leer',kind:1,size:0},{path:'/Leer/Figur',kind:0,size:540},{path:'/Null',kind:0,size:0}]
 .map((row,i)=>({...row,rawMeta128Hex:Buffer.alloc(128,i+1).toString('hex')}))
const bootstrap=`const {parentPort,workerData}=require('node:worker_threads');
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 globalThis.self=globalThis;globalThis.crypto=require('node:crypto').webcrypto;
 self.postMessage=data=>parentPort.postMessage(data);
 globalThis.fetch=async(url,options)=>{
   if(typeof url!=='string'||!url.startsWith(workerData.base))throw Error('Request escaped deployment base');
   const canonical='/'+url.slice(workerData.base.length);
   if(!['/lfs-capacity-de355.wasm','/lfs-capacity-de350.wasm','/lfs-capacity.wasm','/lfs-capacity-current.wasm','/lfs-capacity-previous.wasm','/lfs-capacity-de344.wasm','/lfs-capacity-de345.wasm'].includes(canonical))throw Error('Unexpected request');
   parentPort.postMessage({kind:'test-fetch',url,cache:options.cache,credentials:options.credentials});
   const selected=workerData.swapAsset?(canonical==='/lfs-capacity.wasm'?'/lfs-capacity-current.wasm':'/lfs-capacity.wasm'):canonical;
   const data=fs.readFileSync(path.join(workerData.dist,selected.slice(1)));
   return new Response(data,{status:200,headers:{'content-length':String(data.length)}})
 };
 vm.runInThisContext(fs.readFileSync(workerData.workerFile,'utf8'),{filename:workerData.workerFile});
 if(typeof self.onmessage!=='function')throw Error('Worker did not register message handler');
 parentPort.on('message',data=>self.onmessage({data}));`
async function runWorker(message,{swapAsset=false}={}) {
 const worker=new Worker(bootstrap,{eval:true,workerData:{workerFile:artifact(),dist:actualDist,swapAsset,base}}),progress=[],fetches=[]
 try {
  const result=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Built worker did not finish')),15000)
   worker.once('error',error=>{clearTimeout(timer);reject(error)})
   worker.on('message',data=>{
    if(data.kind==='progress')progress.push(data.progress)
    else if(data.kind==='test-fetch')fetches.push(data)
    else if(data.kind==='result'||data.kind==='error'){clearTimeout(timer);resolve(data)}
   })
   worker.postMessage(message)
  })
  return {result,progress,fetches}
 }finally{await worker.terminate()}
}

test('production worker is one self-contained referenced artifact with all seven exact pinned WASM assets',()=>{
 const worker=artifact(),name=path.basename(worker),data=fs.readFileSync(worker,'utf8')
 const clients=fs.readdirSync(path.join(actualDist,'assets')).filter(x=>x.endsWith('.js')&&x!==name)
 assert(clients.some(x=>fs.readFileSync(path.join(actualDist,'assets',x),'utf8').includes(name)))
 assert.doesNotMatch(data,/\bimport\s+(?:\{|\*|[A-Za-z_$]|['"])/,'no unresolved source imports')
 assert.doesNotMatch(data,/from\s*['"]\.\/migration-/)
 for(const profile of Object.values(profiles))assert.equal(sha(fs.readFileSync(path.join(actualDist,profile.url.slice(1)))),profile.wasm)
})

for(const [id,profile]of Object.entries(profiles)) {
 test(`${id}: built worker runs its real WASM and returns the matching engine/application through messages`,async()=>{
  const {result,progress,fetches}=await runWorker({rows,archiveSha256:'ab'.repeat(32),capacityProfile:id})
  assert.equal(result.kind,'result',JSON.stringify(result));const report=result.report
  assert.equal(report.passed,true);assert.equal(report.verifiedEntries,3);assert.equal(report.capacityProfile,id)
  assert.equal(report.engineSha256,profile.engine);assert.equal(report.wasmSha256,profile.wasm)
  assert.equal(report.applicationCounter,profile.counter);assert.equal(report.firmwareVersion,profile.version)
  assert(report.peakUsedBlocks*100<=report.totalBlocks*80);assert(progress.length>0)
  assert.deepEqual(fetches,[{kind:'test-fetch',url:deployed(profile.url),cache:'no-store',credentials:'same-origin'}])
 })
 test(`${id}: built worker rejects a server that supplies the other profile's WASM`,async()=>{
  const {result,progress,fetches}=await runWorker({rows,archiveSha256:'ab'.repeat(32),capacityProfile:id},{swapAsset:true})
  assert.equal(result.kind,'error');assert.equal(result.code,'MIGRATION_CAPACITY');assert.match(result.message,/hash mismatch/)
  assert.equal(progress.length,0);assert.equal(fetches.length,1);assert.equal(fetches[0].url,deployed(profile.url))
 })
}
test('built worker defaults an omitted profile to current, without selecting legacy implicitly',async()=>{
 const {result,fetches}=await runWorker({rows:[],archiveSha256:'ab'.repeat(32)})
 assert.equal(result.kind,'result');assert.equal(result.report.capacityProfile,'current');assert.equal(result.report.applicationCounter,628)
 assert.equal(fetches[0].url,deployed(profiles.current.url))
})
test('built worker rejects unknown profiles and raw target injection before any fetch or progress',async()=>{
 for(const payload of [
  {capacityProfile:''},{capacityProfile:'future'},{capacityProfile:null},{capacityProfile:{}},{capacityProfile:false},
  {capacityProfile:'current',target:{approved:true,url:profiles.legacy.url}},
 ]) {
  const {result,progress,fetches}=await runWorker({rows,archiveSha256:'ab'.repeat(32),...payload})
  assert.equal(result.kind,'error',JSON.stringify(payload));assert.equal(result.code,'MIGRATION_CAPACITY')
  assert.equal(fetches.length,0);assert.equal(progress.length,0)
 }
})
