// Install as web/tests/c4-web-cd.test.mjs in the real Web A+B+C+D worktree.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncPlan} from '../src/lib/sync-plan.js';
import {readSmallFileDigests} from '../src/lib/small-file-read-group.js';
import {memoryVfs,localFile} from './helpers/memory-vfs.mjs';
const initial='0000000100000031', changed='0000000100000032';
const compare=(vfs,files,options={})=>createSyncPlan({...vfs.api,rootPath:'E:/tags',deviceKey:'c4-web-cd-test',files,...options});
const isMutation=entry=>['write','rename','remove','mkdir','meta'].includes(entry.op);
for(const includeDeviceOnly of [true,false]){
 test(`one-file comparison rejects changed revision (includeDeviceOnly=${includeDeviceOnly})`,async()=>{
  const vfs=memoryVfs(),file=localFile('a');vfs.put('E:/tags/a',[7,8,9]);let reads=0;
  await assert.rejects(compare(vfs,[file],{includeDeviceOnly,readCreateRevision:async()=>++reads===1?initial:changed}),{code:'SYNC_CHANGED'});
  assert.equal(reads,2);assert(!vfs.log.some(isMutation));
 });
 test(`one-file unchanged revision succeeds (includeDeviceOnly=${includeDeviceOnly})`,async()=>{
  const vfs=memoryVfs(),file=localFile('a');vfs.put('E:/tags/a',[7,8,9]);let reads=0;
  const plan=await compare(vfs,[file],{includeDeviceOnly,readCreateRevision:async()=>{reads++;return initial}});
  assert.equal(plan.summary.same,1);assert.equal(reads,2);assert(!vfs.log.some(isMutation));
 });
}
test('explicit unsupported revision retains legacy comparison',async()=>{
 const vfs=memoryVfs(),file=localFile('a');vfs.put('E:/tags/a',[7,8,9]);let reads=0;
 const plan=await compare(vfs,[file],{readCreateRevision:async()=>{reads++;return null}});assert.equal(plan.summary.same,1);assert.equal(reads,1);assert(!vfs.log.some(isMutation));
});
test('pre-cancelled comparison does not request revision',async()=>{
 const vfs=memoryVfs(),controller=new AbortController();controller.abort();let reads=0;
 await assert.rejects(compare(vfs,[localFile('a')],{signal:controller.signal,readCreateRevision:async()=>{reads++;return initial}}),{code:'SYNC_CANCELLED'});assert.equal(reads,0);assert(!vfs.log.some(isMutation));
});
test('cancellation during group progress is checked before device command',async()=>{
 let cancelled=false,commands=0;
 await assert.rejects(readSmallFileDigests([{path:'E:/a',size:1},{path:'E:/b',size:1}],{revision:initial,readFileDigestsBatch:async()=>{commands++;return null},maxRequestPayload:243,check:()=>{if(cancelled)throw Error('cancelled')},invalidReply:message=>{throw Error(message)},onGroup:()=>{cancelled=true}}),/cancelled/);assert.equal(commands,0);
});
