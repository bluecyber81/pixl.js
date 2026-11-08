import test from 'node:test'
import assert from 'node:assert/strict'
import { loadZipReader } from '../src/lib/zip-reader.js'

test('one shared ZIP script load, independent cancellation, retry after error', async () => {
  const scripts = []
  const previousDocument = globalThis.document
  const previousReader = globalThis.JSZip
  try {
    delete globalThis.JSZip
    globalThis.document = {
      createElement: () => ({remove() { this.removed = true }}),
      head: {appendChild(script) { scripts.push(script) }},
    }
    const first = loadZipReader()
    assert.equal(loadZipReader(), first)
    const controller = new AbortController()
    const cancelled = loadZipReader(controller.signal)
    controller.abort()
    await assert.rejects(cancelled, {name:'AbortError'})
    assert.equal(scripts.length, 1)
    scripts[0].onerror()
    await assert.rejects(first, {code:'ZIP_API'})
    assert.ok(scripts[0].removed)
    const retry = loadZipReader()
    assert.equal(scripts.length, 2)
    globalThis.JSZip = {loadAsync: async () => ({})}
    scripts[1].onload()
    assert.equal(await retry, globalThis.JSZip)
    assert.equal(await loadZipReader(), globalThis.JSZip)
    assert.equal(scripts.length, 2)
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
    if (previousReader === undefined) delete globalThis.JSZip
    else globalThis.JSZip = previousReader
  }
})
