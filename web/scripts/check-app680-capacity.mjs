// Replay the public aggregate workload with synthetic bytes and raw128 attributes.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js'
import {simulateCapacity} from '../src/lib/migration-capacity-engine.js'

const spec = JSON.parse(readFileSync(new URL('../tests/fixtures/capacity-app680-sizes.json', import.meta.url)))
const rows = []
function add(path, kind, size) {
  const ordinal = rows.length
  const raw = Uint8Array.from({length:128}, (_, i) => (ordinal + i) & 255)
  rows.push({path,kind,size,rawMeta128Hex:Buffer.from(raw).toString('hex')})
}
for (let i=0; i<spec.directories; i++) add('/d'+i, 1, 0)
let files = 0, payload = 0
for (const [size,count] of spec.sizeCounts) {
  for (let i=0; i<count; i++) {
    add('/d'+(files % spec.directories)+'/'+files+'.bin', 0, size)
    files++
    payload += size
  }
}
assert.equal(files, spec.fileCount)
assert.equal(payload, spec.payloadBytes)
const rowsSha256 = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
const target = getMigrationCapacityTarget('de42')
const wasm = readFileSync(new URL('../public'+target.url, import.meta.url))
const report = await simulateCapacity(rows, target, {archiveSha256:rowsSha256, fetchImpl:async()=>new Response(wasm)})
assert.equal(report.verifiedEntries, files + spec.directories)
assert.ok(report.coreHeapPeakBytes < 18432)
console.log(JSON.stringify({schema:1, synthetic:true, files, directories:spec.directories, payloadBytes:payload, rowsSha256, report}, null, 2))
