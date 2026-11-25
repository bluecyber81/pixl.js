const test = require('node:test')
const assert = require('node:assert/strict')
const {createHash} = require('node:crypto')
const {readDigestWire} = require('./helpers/read-digest-wire.cjs')
const {groupCreateFrames} = require('../src/lib/group-create-wire.js')

const version='2.22.0-DE4.2-b1', parent='E:/Files/~uabcdef012345', revision='00000001000000fe'
const next='00000001000000ff'
const entry=(name,n)=>({name,bytes:new Uint8Array(n).fill(n & 255)})
const entries=[entry('a.bin',0),entry('b.bin',572),entry('é.bin',540),entry('d.bin',305)]
const cap=Buffer.from('5058424701043c02fe00000001000000','hex')
const receipt=(id=1,count=4,rev=next)=>{
  const bytes=Buffer.alloc(14);bytes[0]=1;bytes[1]=count;bytes.writeUInt32LE(id,2)
  bytes.writeBigUInt64LE(BigInt('0x'+rev),6);return bytes
}

test('group codec preserves UTF-8 names and hashes all framed bytes within the actual GATT limit',async()=>{
  const frames=await groupCreateFrames(parent,entries,revision,7,196)
  assert.equal(frames[0][0],0);assert.equal(frames.at(-1)[0],2)
  const blocks=[],start=Buffer.from(frames[0]);assert.equal(start.readBigUInt64LE(5),BigInt('0x'+revision))
  let at=0
  for(const part of frames.slice(1,-1)){
    assert(part.length<=196);const f=Buffer.from(part);assert.equal(f.readUInt16LE(5),at)
    assert.equal(f.readUInt32LE(1),7);blocks.push(f.subarray(7));at+=f.length-7
  }
  const body=Buffer.concat(blocks);assert.equal(body.length,start.readUInt16LE(13))
  assert.deepEqual(body.subarray(-32),createHash('sha256').update(body.subarray(0,-32)).digest())
  assert.equal(body[0],4);let p=2+body[1];assert.equal(body.toString('utf8',2,p),parent.slice(2))
  for(const item of entries){
    const n=body[p],len=body.readUInt16LE(p+1);p+=3
    assert.equal(body.toString('utf8',p,p+n),item.name);p+=n
    assert.deepEqual(body.subarray(p,p+len),Buffer.from(item.bytes));p+=len
  }
  assert.equal(p,body.length-32)
  for(const [folder,items] of [['E:/Files',entries],[parent,[]],[parent,[...entries,entries[0]]],
    [parent,[entry('bad.bin',573)]],[parent,[entry('A.bin',3),entry('a.bin',2)]],[parent,[entry('../file',2)]]])
    await assert.rejects(groupCreateFrames(folder,items,revision,1,243))
})

test('actual queue serializes group writes with ATT responses and waits for one correlated app receipt',async()=>{
  let started, unblock
  const begin=new Promise(r=>{started=r}), latch=new Promise(r=>{unblock=r})
  const f=await readDigestWire({},{groupWire:async(cmd,data,withoutResponse)=>{
    assert.equal(withoutResponse,false)
    if(cmd===0x27)return {payload:cap}
    if(data[0]===0){started();await latch}
    if(data[0]===2)return {payload:receipt()}
    return null
  }})
  assert.equal(await f.api.vfs_probe_group_create('2.22.0-DE4.1'),false);assert.equal(f.requests.length,0)
  assert.equal(await f.api.vfs_probe_group_create(version),true)
  assert.equal(await f.api.vfs_probe_group_create(version),true)
  const group=f.api.vfs_group_create(parent,entries,revision);await begin
  const queued=f.api.vfs_small_create_revision(version)
  assert.equal(f.requests.filter(f=>f[0]===0x22).length,0)
  unblock();assert.equal(await group,next);await queued
  assert.equal(f.replies.filter(f=>f[0]===0x28).length,1)
  assert.equal(f.requests.at(-1)[0],0x22)
})

test('unsupported, malformed, unrelated, early and wrong-generation receipts never complete a group',async()=>{
  for(const mode of ['unsupported','cap','id','count','revision','early','reject']){
    const f=await readDigestWire({},{groupWire:async(cmd,data)=>{
      if(cmd===0x27)return mode==='unsupported'?{status:255,payload:[]}:{payload:mode==='cap'?cap.subarray(1):cap}
      if(mode==='early'&&data[0]===0)return {payload:receipt()}
      if(mode==='reject'&&data[0]===1)return {status:1,payload:[]}
      if(data[0]===2)return {payload:receipt(mode==='id'?3:1,mode==='count'?3:4,mode==='revision'?'00000002000000ff':next)}
      return null
    }})
    if(mode==='unsupported'){assert.equal(await f.api.vfs_probe_group_create(version),false);continue}
    if(mode==='cap'){await assert.rejects(f.api.vfs_probe_group_create(version));continue}
    await f.api.vfs_probe_group_create(version);await assert.rejects(f.api.vfs_group_create(parent,entries,revision))
    if(mode==='early'||mode==='reject')assert(!f.requests.some(w=>w[0]===0x28&&w[4]===2))
  }
})
