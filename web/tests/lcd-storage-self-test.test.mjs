import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { runLcdStorageSelfTest } from '../src/lib/lcd-storage-self-test.js';

const folder='E:/~t669-000102030405060708090a0b', file=folder+'/probe.txt';
const crypto={subtle:webcrypto.subtle,getRandomValues:bytes=>{bytes.set(Array.from({length:12},(_,i)=>i));return bytes;}};
function fixture(){
  const nodes=new Map([['E:/',{type:1}],['E:/keep.bin',{type:0,bytes:new Uint8Array([4,2])}]]),log=[];
  let active=true,hook=()=>{},freeCount=0;
  async function op(name,args,fn){log.push([name,...args]);await hook('before',name,args);const result=fn();await hook('after',name,args,result);return result;}
  const adapters={
    assertSession(){if(!active)throw Object.assign(new Error('Session changed'),{code:'SESSION_CHANGED'});},
    getFreeBytes:path=>op('free',[path],()=>[1155072,1150976,1155072][freeCount++] ?? 1155072),
    readDirectory:path=>op('list',[path],()=>{assert.equal(nodes.get(path)?.type,1);const prefix=path.endsWith('/')?path:path+'/';return [...nodes].filter(([p])=>p.startsWith(prefix)&&p.length>prefix.length&&!p.slice(prefix.length).includes('/')).map(([p,n])=>({name:p.slice(prefix.length),type:n.type,size:n.bytes?.length||0}));}),
    createDirectory:path=>op('mkdir',[path],()=>{if(nodes.has(path))throw new Error('Already exists');nodes.set(path,{type:1});}),
    writeFile:(path,bytes)=>op('write',[path],()=>nodes.set(path,{type:0,bytes:bytes.slice()})),
    readFile:(path,options)=>op('read',[path,options],()=>{assert.equal(options.maxBytes,512);assert.equal(options.exactBytes,512);return nodes.get(path).bytes.slice();}),
    // Match actual VFS_REMOVE, including recursive directory removal. The
    // product requires exclusive access to its fresh unpredictable test path;
    // it does not claim an atomic read/check/delete operation against a second
    // client that writes between the final empty check and this command.
    remove:path=>op('remove',[path],()=>{assert(nodes.has(path));for(const key of [...nodes.keys()])if(key===path||key.startsWith(path+'/'))nodes.delete(key);}),
  };
  return {nodes,log,adapters,setHook:fn=>{hook=fn;},disconnect:()=>{active=false;}};
}
const run=(f,extra={})=>runLcdStorageSelfTest({adapters:f.adapters,crypto,...extra});
const mutations=f=>f.log.filter(([op])=>['mkdir','write','remove'].includes(op));

test('explicit test writes, reads twice, verifies SHA and removes only its own file and empty folder',async()=>{
  const f=fixture(),r=await run(f);
  assert.equal(r.status,'passed');assert.equal(r.bytes,512);assert.match(r.sha256,/^[0-9a-f]{64}$/);
  assert.equal(r.verified,true);assert.equal(r.removed,true);assert.equal(r.cleanupRequired,false);
  assert.equal(r.folder,folder);assert.equal(r.freeBeforeBytes,1155072);assert.equal(r.freeAfterWriteBytes,1150976);assert.equal(r.freeAfterBytes,1155072);assert.equal(r.freeDeltaBytes,0);assert.equal(r.spaceRecovered,true);
  assert.equal(f.log.filter(([op])=>op==='read').length,2);
  assert.deepEqual(mutations(f),[['mkdir',folder],['write',file],['remove',file],['remove',folder]]);
  assert.deepEqual([...f.nodes.keys()],['E:/','E:/keep.bin']);assert.deepEqual([...f.nodes.get('E:/keep.bin').bytes],[4,2]);
});
test('preexisting exact and case-alias names cause no mutation',async()=>{
  for(const name of [folder,folder.toUpperCase().replace('E:/','E:/')]){
    const f=fixture();f.nodes.set(name,{type:1});
    await assert.rejects(run(f),e=>['LCD_TEST_COLLISION','UPLOAD_COLLISION'].includes(e.code)&&!e.testReport.cleanupRequired);
    assert.deepEqual(mutations(f),[]);
  }
});
test('unfamiliar data in a just-created folder is never overwritten or removed',async()=>{
  const f=fixture();f.setHook((when,op)=>{if(when==='after'&&op==='mkdir')f.nodes.set(folder+'/user.txt',{type:0,bytes:new Uint8Array([42])});});
  await assert.rejects(run(f),e=>e.code==='LCD_TEST_UNEXPECTED_CONTENT'&&e.testReport.cleanupRequired);
  assert.deepEqual(mutations(f),[['mkdir',folder]]);assert(f.nodes.has(folder+'/user.txt'));
});
test('partial writes and corrupted readback remain in the unique test folder for review',async()=>{
  for(const failure of ['write','readback','second-readback']){
    const f=fixture();let reads=0;
    f.setHook((when,op)=>{
      if(when==='after'&&op==='write'&&failure==='write')throw new Error('write acknowledgement lost');
      if(when==='before'&&op==='read'&&++reads===(failure==='second-readback'?2:1)&&failure!=='write')f.nodes.get(file).bytes[0]^=1;
    });
    await assert.rejects(run(f),e=>e.testReport.status==='failed'&&e.testReport.cleanupRequired);
    assert(!f.log.some(([op])=>op==='remove'));assert(f.nodes.has(file));assert(f.nodes.has('E:/keep.bin'));
  }
});
test('a new foreign entry before cleanup prevents every removal',async()=>{
  const f=fixture();let reads=0;
  f.setHook((when,op)=>{if(when==='after'&&op==='read'&&++reads===1)f.nodes.set(folder+'/foreign.bin',{type:0,bytes:new Uint8Array([9])});});
  await assert.rejects(run(f),{code:'LCD_TEST_UNEXPECTED_CONTENT'});
  assert(!f.log.some(([op])=>op==='remove'));assert(f.nodes.has(folder+'/foreign.bin'));
});
test('a new foreign entry after file removal prevents recursive directory removal',async()=>{
  const f=fixture();f.setHook((when,op,args)=>{if(when==='after'&&op==='remove'&&args[0]===file)f.nodes.set(folder+'/foreign.bin',{type:0,bytes:new Uint8Array([9])});});
  await assert.rejects(run(f),e=>e.testReport.cleanupRequired&&e.code==='LCD_TEST_UNEXPECTED_CONTENT');
  assert.deepEqual(f.log.filter(([op])=>op==='remove'),[['remove',file]]);assert(f.nodes.has(folder+'/foreign.bin'));
});
test('session loss at every I/O acknowledgement stops before any subsequent I/O',async()=>{
  const baseline=fixture();await run(baseline);
  for(let stop=0;stop<baseline.log.length;stop++){
    const f=fixture();let calls=0;f.setHook(when=>{if(when==='after'&&calls++===stop)f.disconnect();});
    await assert.rejects(run(f),e=>e.code==='SESSION_CHANGED'&&e.testReport.status==='failed');
    assert.equal(f.log.length,stop+1,`stop ${stop}`);assert(f.nodes.has('E:/keep.bin'));
  }
});
test('functional success reports unrecovered free space honestly',async()=>{
  const f=fixture();let calls=0;f.adapters.getFreeBytes=async()=>++calls===1?1155072:1150976;
  const r=await run(f);assert.equal(r.status,'passed');assert.equal(r.removed,true);assert.equal(r.spaceRecovered,false);assert.equal(r.freeDeltaBytes,-4096);
});
test('invalid fresh free space and unavailable crypto stop before mutation',async()=>{
  for(const value of [NaN,-1,1.5,2097153]){const f=fixture();f.adapters.getFreeBytes=async()=>value;await assert.rejects(run(f),{code:'LCD_TEST_FREE_SPACE'});assert.equal(mutations(f).length,0);}
  const f=fixture();await assert.rejects(run(f,{crypto:{}}),{code:'LCD_TEST_CRYPTO'});assert.equal(f.log.length,0);
});
test('remove failure retains cleanup hint, while a final free-space failure does not invent a leftover folder',async()=>{
  const f=fixture();f.setHook((when,op)=>{if(when==='before'&&op==='remove')throw new Error('remove failed');});
  await assert.rejects(run(f),e=>e.testReport.cleanupRequired&&!e.testReport.removed);assert(f.nodes.has(file));
  const g=fixture();let frees=0;g.setHook((when,op)=>{if(when==='before'&&op==='free'&&++frees===3)throw new Error('free-space read failed');});
  await assert.rejects(run(g),e=>!e.testReport.cleanupRequired&&e.testReport.removed&&e.testReport.freeAfterBytes===null);assert(!g.nodes.has(folder));
});
