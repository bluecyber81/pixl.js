import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker} from 'node:worker_threads'
import {createHash} from 'node:crypto'

// tests/dist -> web/dist: production artifacts, not source-module substitutes.
const actualDist=path.resolve(process.env.ALLMIIBO_DIST_DIR||fileURLToPath(new URL('../../dist',import.meta.url)))
const sha=data=>createHash('sha256').update(data).digest('hex')
const profiles={
 current:{url:'/lfs-capacity-current.wasm',wasm:'410f213e0818a3a5e1d0ce381e202514f7dd3b834b1cec854d5fe6f180574b1f',engine:'d13c90a1907cd9ee563cf7b14ad4d2b73307c49874021c369a0623fa7b382e6e',counter:609,version:'2.22.0-DE3.37'},
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
   if(!['/lfs-capacity.wasm','/lfs-capacity-current.wasm'].includes(url))throw Error('Unexpected request');
   parentPort.postMessage({kind:'test-fetch',url,cache:options.cache,credentials:options.credentials});
   const selected=workerData.swapAsset?(url==='/lfs-capacity.wasm'?'/lfs-capacity-current.wasm':'/lfs-capacity.wasm'):url;
   const data=fs.readFileSync(path.join(workerData.dist,selected.slice(1)));
   return new Response(data,{status:200,headers:{'content-length':String(data.length)}})
 };
 vm.runInThisContext(fs.readFileSync(workerData.workerFile,'utf8'),{filename:workerData.workerFile});
 if(typeof self.onmessage!=='function')throw Error('Worker did not register message handler');
 parentPort.on('message',data=>self.onmessage({data}));`
async function runWorker(message,{swapAsset=false}={}) {
 const worker=new Worker(bootstrap,{eval:true,workerData:{workerFile:artifact(),dist:actualDist,swapAsset}}),progress=[],fetches=[]
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

test('production worker is one self-contained referenced artifact with both exact pinned WASM assets',()=>{
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
  assert.deepEqual(fetches,[{kind:'test-fetch',url:profile.url,cache:'no-store',credentials:'same-origin'}])
 })
 test(`${id}: built worker rejects a server that supplies the other profile's WASM`,async()=>{
  const {result,progress,fetches}=await runWorker({rows,archiveSha256:'ab'.repeat(32),capacityProfile:id},{swapAsset:true})
  assert.equal(result.kind,'error');assert.equal(result.code,'MIGRATION_CAPACITY');assert.match(result.message,/hash mismatch/)
  assert.equal(progress.length,0);assert.equal(fetches.length,1);assert.equal(fetches[0].url,profile.url)
 })
}
test('built worker defaults an omitted profile to current, without selecting legacy implicitly',async()=>{
 const {result,fetches}=await runWorker({rows:[],archiveSha256:'ab'.repeat(32)})
 assert.equal(result.kind,'result');assert.equal(result.report.capacityProfile,'current');assert.equal(result.report.applicationCounter,609)
 assert.equal(fetches[0].url,profiles.current.url)
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
