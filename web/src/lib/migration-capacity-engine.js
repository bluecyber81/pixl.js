import { sha256Bytes } from './safe-upload.js'
import { deploymentPath } from './deployment-path.js'

// Only the locally served, release-pinned simulator may produce a capacity proof.
// File contents are synthetic; original paths and raw128 metadata stay local.
const requireValue=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'MIGRATION_CAPACITY'})}
const checkpoint=signal=>{if(signal?.aborted)throw Object.assign(new Error('Cancelled'),{name:'AbortError'})}
// API-boundary samples cannot see every internal transaction instant. Add an
// intentionally conservative allowance based on packed_fs reserve()/blocks_for:
// two maximum shard copies, the largest file stage and eight metadata blocks.
// Imported operations never rename directory subtrees. Two possible path-name
// changes add at most 2*63 bytes to a shard; raw records are fixed 128 bytes.
export function conservativeTransactionBlocks(rows,{blockSize,shardTarget=32768}={}){
  requireValue(blockSize===4096&&shardTarget===32768,'Unknown transaction reserve geometry.')
  const largest=Math.max(0,...rows.filter(r=>r.kind===0).map(r=>r.size))
  const maxShardBytes=Math.max(shardTarget,largest+16+63+128+4+24+12+4)+126
  const blocks=bytes=>Math.ceil(bytes/(blockSize-32))
  return {additionalBlocks:8+2*blocks(maxShardBytes)+blocks(largest),maxShardBytes,largestFileBytes:largest,
    basis:'8 metadata blocks + two conservatively bounded shard copies + largest staged file; added to observed API-boundary peak.'}
}
export async function simulateCapacity(rows,target,{signal,fetchImpl=globalThis.fetch,instantiate=WebAssembly.instantiate,onProgress,archiveSha256}={}){
  requireValue(target?.approved===true && /^[a-f0-9]{64}$/u.test(target.wasmSha256||'') && ['/lfs-capacity-de355.wasm','/lfs-capacity.wasm','/lfs-capacity-previous.wasm','/lfs-capacity-current.wasm','/lfs-capacity-de344.wasm','/lfs-capacity-de345.wasm','/lfs-capacity-de350.wasm'].includes(target.url) &&
    target.minimumReservePercent===20 && target.geometry?.metadataBytes===128 && target.geometry?.includesRestoreStaging===true &&
    typeof target.firmwareVersion==='string'&&/^[a-f0-9]{64}$/u.test(target.layout?.engineSha256||'')&&/^[a-f0-9]{64}$/u.test(archiveSha256||'')&&!/^0{64}$/u.test(archiveSha256),'No approved exact-geometry simulator is available.')
  requireValue(Array.isArray(rows)&&rows.length<=4096,'Invalid capacity input size.')
  const names=new Set(), encoder=new TextEncoder()
  const input=rows.map(row=>{
    requireValue(row&&typeof row.path==='string'&&row.path.startsWith('/')&&row.path!=='/'&&
      !row.path.includes('\0')&&!row.path.endsWith('/')&&!row.path.split('/').slice(1).some(p=>!p||p==='.'||p==='..')&&
      [0,1].includes(row.kind)&&Number.isSafeInteger(row.size)&&row.size>=0&&row.size<=8*1024*1024&&
      (row.kind===0||row.size===0)&&/^[a-f0-9]{256}$/u.test(row.rawMeta128Hex||''),'Invalid capacity entry.')
    requireValue(!names.has(row.path),'Duplicate capacity entry.');names.add(row.path)
    const bytes=encoder.encode(row.path);requireValue(bytes.length<64&&row.path.split('/').every(p=>encoder.encode(p).length<48),'Capacity path is too long.')
    return {...row,bytes}
  }).sort((a,b)=>b.kind-a.kind || a.path.split('/').length-b.path.split('/').length || (a.path<b.path?-1:1))
  checkpoint(signal)
  // target.url is still one of the seven exact release-pinned identities above.
  // Resolve its location only after validation; profile and proof hashes stay unchanged.
  const response=await fetchImpl(deploymentPath(target.url.slice(1)),{signal,cache:'no-store',credentials:'same-origin'})
  requireValue(response?.ok,'Capacity simulator could not be loaded.')
  const declared=Number(response.headers?.get?.('content-length')||0)
  requireValue(Number.isFinite(declared)&&declared<=1024*1024,'Capacity simulator exceeds size limit.')
  const bytes=new Uint8Array(await response.arrayBuffer())
  requireValue(bytes.length>0&&bytes.length<=1024*1024&&await sha256Bytes(bytes)===target.wasmSha256,'Capacity simulator hash mismatch.')
  checkpoint(signal)
  // No instance is reused across archives or rechecks.
  const result=await instantiate(bytes,{}), api=(result.instance||result).exports
  requireValue(api?.memory instanceof WebAssembly.Memory && ['begin','path_buffer','metadata_buffer','archive_buffer','engine_identity_buffer','add','finish','verified_entries','peak_used_blocks','used_blocks','total_blocks','block_size','core_heap_peak_bytes'].every(k=>typeof api[k]==='function'),'Capacity simulator API mismatch.')
  const buffer=(method,length)=>{const pointer=api[method]();requireValue(Number.isInteger(pointer)&&pointer>=0&&pointer+length<=api.memory.buffer.byteLength,'Invalid simulator buffer.');return new Uint8Array(api.memory.buffer,pointer,length)}
  requireValue(Array.from(buffer('engine_identity_buffer',32),x=>x.toString(16).padStart(2,'0')).join('')===target.layout.engineSha256,'Embedded simulator engine identity mismatch.')
  buffer('archive_buffer',32).set(archiveSha256.match(/../g).map(x=>parseInt(x,16)))
  requireValue(api.begin()===0,'Capacity simulator initialization failed.')
  const total=api.total_blocks(),block=api.block_size()
  requireValue(total===target.geometry.totalBlocks&&block===target.geometry.blockSize&&total>0&&block>0,'Capacity geometry mismatch.')
  let done=0
  for(const row of input){
    checkpoint(signal)
    const view=buffer('path_buffer',66);view.fill(0);view.set(row.bytes)
    buffer('metadata_buffer',128).set(row.rawMeta128Hex.match(/../g).map(x=>parseInt(x,16)))
    requireValue(api.add(row.kind,row.size)===0,'The complete archive does not fit the simulated filesystem.')
    try{onProgress?.({phase:'capacity',path:row.path,done:++done,total:input.length})}catch{/* observer */}
    if(done%16===0)await new Promise(resolve=>setTimeout(resolve,0))
  }
  checkpoint(signal)
  try{onProgress?.({phase:'capacity-verifying',done:input.length,total:input.length})}catch{/* observer */}
  requireValue(api.finish()===0&&api.verified_entries()===input.length,'Simulator remount, complete readback, metadata or namespace verification failed.')
  const used=api.used_blocks(),peak=api.peak_used_blocks(),heap=api.core_heap_peak_bytes()
  const transactionAllowance=conservativeTransactionBlocks(input,{blockSize:block,shardTarget:target.layout.shardTarget})
  const guardedPeak=peak+transactionAllowance.additionalBlocks
  requireValue(Number.isInteger(used)&&used>=0&&used<=total&&Number.isInteger(peak)&&peak>=used&&peak<=total&&guardedPeak*100<=total*80,'Less than the required 20% reserve remains after the conservative transaction allowance.')
  requireValue(Number.isInteger(heap)&&heap>0&&heap<=65536,'Invalid core allocation measurement.')
  return Object.freeze({schema:1,kind:'littlefs-capacity-simulation',passed:true,wasmSha256:target.wasmSha256,
    firmwareVersion:target.firmwareVersion,applicationCounter:target.applicationCounter,engineSha256:target.layout?.engineSha256,
    archiveSha256,geometry:Object.freeze({...target.geometry}),entries:input.length,verifiedEntries:api.verified_entries(),usedBlocks:used,observedPeakUsedBlocks:peak,
    peakUsedBlocks:guardedPeak,transactionAllowance:Object.freeze(transactionAllowance),totalBlocks:total,coreHeapPeakBytes:heap,
    freeBytes:(total-used)*block,conservativeReserveBytes:(total-guardedPeak)*block,minimumReservePercent:20,metadataBytesPerEntry:128,includesRestoreStaging:true,
    limits:'Synthetic exact-geometry simulation; not a hardware readback or authorization to format.'})
}
