import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {simulateCapacity} from '../src/lib/migration-capacity-engine.js'
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js'
const bytes=fs.readFileSync(new URL('./fixtures/capacity-collection-1208.json',import.meta.url))
const rows=JSON.parse(bytes),archiveSha256=createHash('sha256').update(bytes).digest('hex')
for(const profile of ['current','de354','de350','de345','de344','previous','legacy'])test(`complete synthetic collection survives ${profile} engine staging/remount/content/raw128 verification`,{timeout:120000},async()=>{
 const target=getMigrationCapacityTarget(profile)
 const wasm=fs.readFileSync(new URL('../public'+target.url,import.meta.url))
 assert.equal(rows.filter(r=>r.kind===0).length,1131)
 assert.equal(rows.filter(r=>r.kind===1).length,77)
 const report=await simulateCapacity(rows,target,{archiveSha256,fetchImpl:async()=>new Response(wasm)})
 assert.equal(report.verifiedEntries,1208)
 // Atomic commits use one extra 4KiB metadata block on this fixed fixture.
 assert.equal(report.usedBlocks,['current','de354'].includes(profile)?238:237)
 assert.equal(report.peakUsedBlocks,['current','de354'].includes(profile)?301:300)
 assert(report.coreHeapPeakBytes<18432)
 assert.equal(report.engineSha256,target.layout.engineSha256)
})
