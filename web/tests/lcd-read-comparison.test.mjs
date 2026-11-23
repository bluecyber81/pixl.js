import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { runLcdReadComparison } from '../src/lib/lcd-read-comparison.js';
globalThis.crypto ??= webcrypto;

function fixture(overrides={}) {
  const calls=[];let ticks=0,commands=0;
  const data=Array.from({length:12},(_,i)=>({path:`E:/f${String(i).padStart(2,'0')}.bin`,size:540,bytes:new Uint8Array(540).fill(i)}));
  const map=new Map(data.map(file=>[file.path,file]));
  const tx=()=>{commands++;ticks+=10;};
  const adapters={
    assertSession(){},probeBatch:async()=>({maxCount:4}),readRevision:async()=> '0000000100000001',
    readDirectory:async path=>{calls.push(['list',path]);return path==='E:/'?data.map(f=>({name:f.path.slice(3),type:0,size:f.size})):[];},
    readSingle:async path=>{calls.push(['single',path]);tx();return map.get(path).bytes;},
    readBatch:async files=>{calls.push(['batch',files.length]);tx();return files.map(f=>({...f,bytes:map.get(f.path).bytes}));},
    digestBatch:async files=>{calls.push(['digest',files.length]);tx();return Promise.all(files.map(async f=>({...f,sha256:Buffer.from(await webcrypto.subtle.digest('SHA-256',map.get(f.path).bytes)).toString('hex')})));},
    readLink:async()=>({mode:'test'}),transport:()=>({maxRequestPayload:243,txFrames:commands,rxFrames:commands*3,txBytes:commands*20,rxBytes:commands*540}),
    ...overrides
  };
  return {adapters,calls,data,options:{adapters,now:()=>ticks}};
}

test('short comparison reads identical bounded contents single/batch/single and verifies device digests without mutations',async()=>{
  const f=fixture(),r=await runLcdReadComparison(f.options);
  assert.equal(r.status,'passed');assert.equal(r.verified,true);assert.equal(r.sameStorageRevision,true);
  assert.equal(r.files.length,12);assert.equal(r.payloadBytes,6480);assert.deepEqual(r.batchGroups,[4,4,4]);
  assert.deepEqual(r.passes.map(p=>p.requests),[12,3,12]);
  assert.deepEqual(r.passes.map(p=>p.transport.txFrames),[12,3,12]);
  assert.deepEqual(r.passes.map(p=>p.durationMilliseconds),[120,30,120]);
  assert.equal(r.digest.verified,true);assert.equal(f.calls.filter(c=>c[0]==='single').length,24);
  assert.ok(r.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));assert.equal(JSON.stringify(r).includes('"bytes"'),false);
});

test('content, size, order and digest differences never return a passed comparison',async()=>{
  for (const mode of ['bytes','size','order','digest']) {
    const f=fixture(),read=f.adapters.readBatch,digest=f.adapters.digestBatch;
    if(mode==='digest')f.adapters.digestBatch=async(...args)=>{const r=await digest(...args);r[0].sha256='0'.repeat(64);return r;};
    else f.adapters.readBatch=async(...args)=>{const r=await read(...args);if(mode==='bytes')r[0].bytes=new Uint8Array(540).fill(255);if(mode==='size')r[0].size=539;if(mode==='order')r.reverse();return r;};
    await assert.rejects(runLcdReadComparison(f.options),e=>e.code==='LCD_COMPARE_MISMATCH'&&e.testReport.status==='failed'&&!e.testReport.verified);
  }
});

test('changed revision aborts before adopting any measured batch result',async()=>{
  let n=0;const f=fixture({readRevision:async()=>++n<3?'0000000100000001':'0000000100000002'});
  await assert.rejects(runLcdReadComparison(f.options),e=>e.code==='LCD_COMPARE_CHANGED'&&!e.testReport.sameStorageRevision);
  assert.equal(f.calls.some(c=>c[0]==='batch'),false);
});

test('disconnect and cancellation stop subsequent operations and retain an incomplete report',async()=>{
  for (const cancel of [false,true]) {
    const controller=new AbortController(),f=fixture();let lost=false;
    f.adapters.assertSession=()=>{if(lost)throw Object.assign(Error('lost'),{code:'DISCONNECTED'});};
    const read=f.adapters.readSingle;f.adapters.readSingle=async(...args)=>{const result=await read(...args);if(cancel)controller.abort();else lost=true;return result;};
    await assert.rejects(runLcdReadComparison({...f.options,signal:controller.signal}),e=>e.testReport.status===(cancel?'cancelled':'failed')&&!e.testReport.verified);
    assert.equal(f.calls.filter(c=>c[0]==='single').length,1);assert.equal(f.calls.some(c=>c[0]==='batch'),false);
  }
});

test('directory exploration and payload are bounded, and missing capability never triggers reads',async()=>{
  const f=fixture({readDirectory:async path=>Array.from({length:8},(_,i)=>({name:`d${i}`,type:1,size:0}))});
  await assert.rejects(runLcdReadComparison(f.options),e=>e.code==='LCD_COMPARE_NO_FILES'&&e.testReport.directoriesRead===8);
  const absent=fixture({probeBatch:async()=>null});
  await assert.rejects(runLcdReadComparison(absent.options),e=>e.code==='LCD_COMPARE_UNSUPPORTED');assert.deepEqual(absent.calls,[]);
});

test('small negotiated requests cannot silently turn a batch comparison into singleton reads',async()=>{
  const f=fixture({transport:()=>({maxRequestPayload:28})});
  await assert.rejects(runLcdReadComparison(f.options),e=>e.code==='LCD_COMPARE_UNSUPPORTED');
  assert.equal(f.calls.some(c=>c[0]==='single'),false);
});
