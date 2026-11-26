import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import JSZip from '../public/dfu/vendor/jszip-3.10.2.min.js'
import {lcdFinal680} from '../public/dfu/lcd-app680-reference.mjs'
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js'
import {pendingMigrationProfile} from '../src/lib/migration.js'
import {matchMigrationLayout} from '../src/lib/migration-layout.js'

const read = name => readFileSync(new URL('../../'+name,import.meta.url))
const json = name => JSON.parse(read(name))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

test('App680 binds the real handler, PFS1 engine and release BIN to a dedicated simulator',async()=>{
  const target=getMigrationCapacityTarget('de42'), previous=getMigrationCapacityTarget('de41')
  const proof=json('docs/validation/DE4_2_PFS.json'), cross=read('docs/validation/DE4_2_CROSS_MOUNT.json')
  assert.deepEqual(target.approvedApplications,[{firmwareVersion:lcdFinal680.firmwareVersion,applicationCounter:lcdFinal680.applicationCounter}])
  assert.equal(proof.sourceId,lcdFinal680.sourceId)
  assert.equal(proof.buildArtifacts['pixljs.bin'],lcdFinal680.applicationBinSha256)
  assert.equal(proof.engine.engineSha256,lcdFinal680.engineSha256)
  assert.equal(proof.engine.engineSha256,target.layout.engineSha256)
  assert.notEqual(target.wasmSha256,previous.wasmSha256)
  assert.notEqual(target.layout.engineSha256,previous.layout.engineSha256)
  assert.equal(proof.wasmSha256,sha(read('web/public'+target.url)))
  assert.equal(proof.wasmSha256,target.wasmSha256)
  assert.deepEqual(proof.armLayoutCases.map(c=>[c.drive,c.mounted,c.geometry,c.result]),[
    ['E',true,true,0],['E',false,true,0],['I',true,true,0xfffffffa],['E',true,false,0xfffffffa]])
  assert.equal(proof.armEntryPoint,'df_proto_handler_vfs_packed_layout')
  assert.equal(proof.crossMountReportSha256,sha(cross))
  const run=JSON.parse(cross)
  assert.deepEqual(run.engines,{old:previous.layout.engineSha256,new:target.layout.engineSha256})
  assert.equal(run.cases.length,6)
  assert.ok(run.cases.every(c=>c.exitCode===0&&c.result.passed))
  assert.deepEqual([run.filesInitially,run.directoriesInitially,run.payloadBytesInitially],[1081,55,658806])
  const identity={...target.approvedApplications[0],settingsCrcValid:true}
  assert.equal(matchMigrationLayout({...target.layout,mounted:true},identity,target).engineSha256,lcdFinal680.engineSha256)
  assert.throws(()=>matchMigrationLayout({...previous.layout,mounted:true},identity,target),{code:'MIGRATION_LAYOUT'})
  const source=json('docs/validation/DE4_2_SIMULATOR_SOURCES.json'), bytes=read(source.path)
  assert.equal(sha(bytes),source.sha256); assert.equal(bytes.length,source.bytes)
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true})
  assert.equal(Object.keys(zip.files).length,source.files)
  for(const [name,file] of Object.entries(zip.files)){
    assert.deepEqual(Buffer.from(await file.async('uint8array')),read(name),name)
  }
})

test('App680 stages, remounts and verifies the complete 1081-file synthetic collection and all raw128 entries',{timeout:120000},()=>{
  const script=fileURLToPath(new URL('../scripts/check-app680-capacity.mjs',import.meta.url))
  const fresh=JSON.parse(execFileSync(process.execPath,[script],{timeout:110000}))
  assert.deepEqual(fresh,json('docs/validation/DE4_2_CAPACITY_1081.json'))
  assert.deepEqual([fresh.files,fresh.directories,fresh.payloadBytes],[1081,55,658806])
  assert.deepEqual([fresh.report.verifiedEntries,fresh.report.metadataBytesPerEntry],[1136,128])
  assert.ok(fresh.report.peakUsedBlocks<=0.8*fresh.report.totalBlocks)
})

test('a recovery profile requires the matching pending receipt for this archive and device',async()=>{
  const archive={archiveSha256:'a'.repeat(64)},deviceKey='opaque-test-lcd'
  const previous=getMigrationCapacityTarget('de41')
  const marker={state:'format_attempted',archiveSha256:archive.archiveSha256,
    deviceIdentitySha256:sha(deviceKey),engineSha256:previous.layout.engineSha256,
    ...previous.approvedApplications[0]}
  const choose=(overrides={})=>pendingMigrationProfile(archive,deviceKey,['de42','de41'],{getMarker:async()=>({...marker,...overrides})})
  assert.equal(await choose(),'de41')
  for(const mismatch of [{archiveSha256:'b'.repeat(64)},{deviceIdentitySha256:'c'.repeat(64)},
    {state:'finished'},{applicationCounter:680},{engineSha256:getMigrationCapacityTarget('de42').layout.engineSha256}]){
    assert.equal(await choose(mismatch),null)
  }
})
