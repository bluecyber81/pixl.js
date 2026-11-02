const abort=()=>Object.assign(new Error('Cancelled'),{name:'AbortError'})
/** Bounded worker keeps the UI responsive and can terminate synchronous WASM. */
export function simulateCapacityInWorker(rows,{archiveSha256,capacityProfile='current',signal,onProgress,WorkerImpl,timeoutMs=300000}={}){
  if(signal?.aborted)return Promise.reject(abort())
  if(!['current','de354','de350','de345','de344','previous','legacy'].includes(capacityProfile))return Promise.reject(Object.assign(new Error('Unknown local capacity profile.'),{code:'MIGRATION_CAPACITY'}))
  if(typeof (WorkerImpl===undefined?globalThis.Worker:WorkerImpl)!=='function')return Promise.reject(Object.assign(new Error('A Web Worker is required for the bounded local capacity check.'),{code:'MIGRATION_CAPACITY'}))
  return new Promise((resolve,reject)=>{
    let worker,timer,settled=false
    const stop=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker?.terminate();error?reject(error):resolve(result)}
    const cancel=()=>stop(abort())
    try{
      // Vite recognizes only the direct Worker(new URL(...)) form. An aliased
      // constructor emits the source as a plain asset without bundling imports.
      // The injected constructor is solely the local host-test seam.
      worker=WorkerImpl===undefined
        ? new Worker(new URL('./migration-capacity-worker.js',import.meta.url),{type:'module'})
        : new WorkerImpl()
      timer=setTimeout(()=>stop(Object.assign(new Error('The local capacity check exceeded five minutes. No device operation was started.'),{code:'MIGRATION_CAPACITY_TIMEOUT'})),Math.min(300000,Math.max(1,timeoutMs)))
      signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted){cancel();return}
      worker.onerror=()=>stop(Object.assign(new Error('The local capacity worker failed.'),{code:'MIGRATION_CAPACITY'}))
      worker.onmessage=({data})=>{if(settled)return;if(data?.kind==='progress'){try{onProgress?.(data.progress)}catch{/* observer */}}
        else if(data?.kind==='result')stop(null,data.report)
        else if(data?.kind==='error')stop(Object.assign(new Error(data.message),{code:data.code}))}
      worker.postMessage({rows,archiveSha256,capacityProfile})
    }catch(error){stop(error)}
  })
}
