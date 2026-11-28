const {test}=require('node:test')
const assert=require('node:assert/strict')
const {readDigestWire}=require('./helpers/read-digest-wire.cjs')
const {lcdTest683:ref}=require('../public/dfu/lcd-app683-reference.mjs')
const target=require('../src/lib/migration-capacity.js').getMigrationCapacityTarget('de43b2')
const {groupCreateFrames}=require('../src/lib/group-create-wire.js')
const rev='0000000100000020', next='0000000100000021'
function identity(reference=ref, layoutProfile=target) {
  const boot=Buffer.from(require('./boot-fixture.cjs')())
  boot.writeUInt32LE(reference.applicationCounter,60);boot.writeUInt32LE(21,64);boot.writeUInt32LE(7003000,32);boot.writeUInt16LE(294,36)
  Buffer.from('d3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb','hex').copy(boot,80)
  const build=Buffer.alloc(80);build.set([80,88,66,73,1,80,1,0]);build.write(reference.sourceId,8,64,'ascii')
  const m=layoutProfile.layout, layout=Buffer.alloc(72)
  layout.set([1,69,3,1]);[m.magic,m.flashBytes,m.blockSize,m.blockCount].forEach((v,i)=>layout.writeUInt32LE(v,4+4*i))
  ;[m.readSize,m.progSize,m.cacheSize,m.metadataBytes].forEach((v,i)=>layout.writeUInt16LE(v,20+2*i))
  layout.writeUInt32LE(m.shardTarget,28);layout.set([m.maxShards,m.pathCap,m.nameCap,m.maxHandles],32);layout.writeUInt32LE(m.flags,36);Buffer.from(m.engineSha256,'hex').copy(layout,40)
  return {7:boot,12:build,31:layout}
}
test('App683 existing-directory protocol requires exact identity and correlated non-mutating DEFER',async()=>{
 for(const mode of ['ok','defer','unsupported','bad-source','wrong-id','wrong-rev','wrong-count','early','negative','malformed-cap']) {
  const identityPackets=identity()
  if(mode==='bad-source')identityPackets[12].write('0'.repeat(64),8,'ascii')
  const fixture=await readDigestWire({},{identityPackets,groupWire:async(cmd,data,withoutResponse)=>{
    if(cmd===0x29)return mode==='unsupported'?{status:255,payload:[]}:{payload:Buffer.from(mode==='malformed-cap'?'505847410104':'5058474101043c022000000001000000','hex')}
    assert.equal(cmd,0x2a);assert.equal(withoutResponse,data[0]===2)
    if(mode==='early' && data[0]===0)return {payload:Buffer.alloc(14)}
    if(mode==='negative' && data[0]===1)return {status:1,payload:[]}
    if(data[0]!==2)return null
    const deferred=['defer','wrong-id','wrong-rev','wrong-count'].includes(mode)
    const result=Buffer.alloc(14);result[0]=deferred?2:1;result[1]=deferred && mode!=='wrong-count'?0:1
    result.writeUInt32LE(mode==='wrong-id'?12:data.readUInt32LE(1),2)
    result.writeBigUInt64LE(BigInt('0x'+(deferred && mode!=='wrong-rev'?rev:next)),6);return {payload:result}
  }})
  assert.equal(await fixture.api.vfs_probe_guarded_create('2.22.0-DE4.2-b2'),false);assert.equal(fixture.requests.length,0)
  if(mode==='malformed-cap'){await assert.rejects(fixture.api.vfs_probe_guarded_create(ref.firmwareVersion));continue}
  const capable=await fixture.api.vfs_probe_guarded_create(ref.firmwareVersion)
  assert.equal(capable,!['unsupported','bad-source'].includes(mode))
  assert.equal(fixture.requests.filter(b=>b[0]===0x29).length,mode==='bad-source'?0:1)
  if(!capable){await assert.rejects(fixture.api.vfs_guarded_create('E:/',[],rev));continue}
  const run=fixture.api.vfs_guarded_create('E:/',[{name:'a.bin',bytes:new Uint8Array(540)}],rev)
  if(mode==='ok'||mode==='defer')assert.equal(await run,mode==='defer'?null:next)
  else await assert.rejects(run)
  const counts=fixture.api.get_transport_diagnostics().guardedCreateReceipts
  if(counts || mode==='ok' || mode==='defer') assert.deepEqual({...counts},
    {groups:mode==='ok'?1:0,files:mode==='ok'?1:0,deferred:mode==='defer'?1:0})
  if(mode==='negative'||mode==='early')assert(!fixture.requests.some(f=>f[0]===0x2a && f[4]===2))
 }
})
test('guarded wire accepts E root and refuses a nonportable or non-ASCII visible name',async()=>{
 const entries=[{name:'a.bin',bytes:new Uint8Array()}]
 const frames=await groupCreateFrames('E:/',entries,rev,1,243,true)
 const body=frames[1].subarray(7)
 assert.deepEqual([...body.subarray(0,3)],[1,1,47])
 for(const name of ['a/b','CON','a.','é.bin']) await assert.rejects(groupCreateFrames('E:/',[{name,bytes:new Uint8Array()}],rev,1,243,true))
 await assert.rejects(groupCreateFrames('E:/',entries,rev,1,243))
})

test('App684 negotiates four files using the actual signed source and refuses cross-version reuse on one link',async()=>{
 const {lcdTest684}=require('../public/dfu/lcd-app684-reference.mjs');
 const target684=require('../src/lib/migration-capacity.js').getMigrationCapacityTarget('de43b3');
 const entries=Array.from({length:4},(_,n)=>({name:'item'+n+'.bin',bytes:new Uint8Array(540)}));
 for(const [packets,maximum,capable] of [
  [identity(lcdTest684,target684),4,true],
  [identity(lcdTest684,target684),8,false],
  [identity(ref,target),4,false],
  [identity(lcdTest684,target),4,false],
 ]) {
  const fixture=await readDigestWire({},{identityPackets:packets,groupWire:async(cmd,data)=>{
   if(cmd===0x29){
    const payload=Buffer.from('5058474101043c022000000001000000','hex');
    payload[5]=maximum;return {payload};
   }
   assert.equal(cmd,0x2a);
   if(data[0]!==2)return null;
   const payload=Buffer.alloc(14);payload.set([1,4]);payload.writeUInt32LE(data.readUInt32LE(1),2);
   payload.writeBigUInt64LE(BigInt('0x'+next),6);return {payload};
  }});
  if(maximum!==4){await assert.rejects(fixture.api.vfs_probe_guarded_create(lcdTest684.firmwareVersion));continue;}
  assert.equal(await fixture.api.vfs_probe_guarded_create(lcdTest684.firmwareVersion),capable);
  if(!capable){assert.equal(fixture.requests.some(b=>b[0]===0x29),false);continue;}
  assert.equal(await fixture.api.vfs_guarded_create('E:/',entries,rev),next);
  await assert.rejects(fixture.api.vfs_guarded_create('E:/',[...entries,{name:'last',bytes:new Uint8Array()}],rev));
  assert.equal(await fixture.api.trusted_storage_session(ref.firmwareVersion),false);
  await assert.rejects(fixture.api.vfs_guarded_create('E:/',entries,rev));
  assert.equal(await fixture.api.trusted_storage_session(lcdTest684.firmwareVersion),true);
  assert.equal(fixture.requests.some(b=>b[0]===0x2b||b[0]===0x2c),false);
 }
});
