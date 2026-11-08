import { deploymentPath } from './deployment-path.js'

let pending

function unavailable() {
  return Object.assign(new Error('The bundled ZIP reader could not be loaded. Please try again.'), { code: 'ZIP_API' })
}

function loadScript() {
  if (!globalThis.document?.head) return Promise.reject(unavailable())
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = deploymentPath('dfu/vendor/jszip-3.10.2.min.js')
    const failed = () => { script.remove(); reject(unavailable()) }
    script.onerror = failed
    script.onload = () => typeof globalThis.JSZip?.loadAsync === 'function' ? resolve(globalThis.JSZip) : failed()
    document.head.appendChild(script)
  })
}

export function loadZipReader(signal) {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  if (typeof globalThis.JSZip?.loadAsync === 'function') return Promise.resolve(globalThis.JSZip)
  pending ??= loadScript().finally(() => { pending = undefined })
  if (!signal) return pending
  // Cancelling an import must not cancel a second caller's shared script load.
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
