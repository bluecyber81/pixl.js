import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenAwake } from '../src/lib/screen-awake.js';

const settle = async () => { for (let i=0; i<8; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((a,b) => { resolve=a; reject=b; });
  return {promise,resolve,reject};
}
function fixture({visible=true,request,observer}={}) {
  class Page extends EventTarget {
    visibilityState = visible ? 'visible' : 'hidden';
    listenerCount = 0;
    addEventListener(type,...args) { if(type==='visibilitychange')this.listenerCount++; super.addEventListener(type,...args); }
    removeEventListener(type,...args) { if(type==='visibilitychange')this.listenerCount--; super.removeEventListener(type,...args); }
    show(value) { this.visibilityState=value?'visible':'hidden'; this.dispatchEvent(new Event('visibilitychange')); }
  }
  class Sentinel extends EventTarget {
    released=false;
    releaseCalls=0;
    async release() { this.releaseCalls++; this.externalRelease(); }
    externalRelease() { this.released=true; this.dispatchEvent(new Event('release')); }
  }
  const document=new Page(),sentinels=[],requests=[],states=[];
  const wakeLock={request: type => {
    requests.push(type);
    if(request) return request({sentinels,requests,Sentinel});
    const sentinel=new Sentinel(); sentinels.push(sentinel); return Promise.resolve(sentinel);
  }};
  const controller=createScreenAwake({wakeLock,document,onChange:s=>{states.push(s);observer?.(s);}});
  return {controller,document,sentinels,requests,states,Sentinel};
}

test('idle construction does not request a lock; active work requests screen only once',async()=>{
  const f=fixture();
  assert.equal(f.requests.length,0); assert.equal(f.controller.getState().status,'idle');
  f.controller.setActive(true); f.controller.setActive(true); f.controller.retry();
  await settle();
  assert.deepEqual(f.requests,['screen']); assert.equal(f.controller.getState().held,true);
  assert.equal(f.controller.getState().status,'active');
  f.controller.dispose();
});

test('completion releases its held lock and a later operation can request another',async()=>{
  const f=fixture(); f.controller.setActive(true); await settle();
  f.controller.setActive(false); await settle();
  assert.equal(f.sentinels[0].releaseCalls,1); assert.equal(f.controller.getState().held,false);
  assert.equal(f.controller.getState().status,'idle');
  f.controller.setActive(true); await settle(); assert.equal(f.requests.length,2);
  f.controller.dispose();
});

test('immediate completion or unmount cancels a queued browser request before it starts',async()=>{
  for(const action of ['inactive','dispose']){
    const f=fixture();f.controller.setActive(true);
    if(action==='dispose')f.controller.dispose();else f.controller.setActive(false);
    await settle();assert.equal(f.requests.length,0);assert.equal(f.controller.getState().held,false);
    assert.equal(f.controller.getState().status,'idle');f.controller.dispose();
  }
});

test('pending acquisition resolving after operation completion is immediately released',async()=>{
  const task=deferred(),f=fixture({request:()=>task.promise});
  f.controller.setActive(true); await settle(); f.controller.setActive(false);
  const sentinel=new f.Sentinel(); task.resolve(sentinel); await settle();
  assert.equal(sentinel.releaseCalls,1); assert.equal(f.controller.getState().status,'idle');
  assert.equal(f.controller.getState().held,false); assert.equal(f.requests.length,1);
  f.controller.dispose();
});

test('new active operation during a pending request releases stale lock and acquires once',async()=>{
  const first=deferred(); const f=fixture({request:({requests,Sentinel,sentinels})=>{
    if(requests.length===1)return first.promise;
    const s=new Sentinel();sentinels.push(s);return Promise.resolve(s);
  }});
  f.controller.setActive(true); await settle();
  f.controller.setActive(false);f.controller.setActive(true);
  const stale=new f.Sentinel();first.resolve(stale);await settle();
  assert.equal(stale.releaseCalls,1);assert.equal(f.requests.length,2);
  assert.equal(f.controller.getState().status,'active');f.controller.dispose();
});

test('hidden active page requests nothing until visible, then releases again when hidden',async()=>{
  const f=fixture({visible:false});f.controller.setActive(true);await settle();
  assert.equal(f.requests.length,0);assert.equal(f.controller.getState().status,'hidden');
  f.document.show(true);await settle();assert.equal(f.requests.length,1);
  f.document.show(false);await settle();assert.equal(f.sentinels[0].releaseCalls,1);
  assert.equal(f.controller.getState().status,'hidden');
  f.document.show(true);await settle();assert.equal(f.requests.length,2);
  assert.equal(f.controller.getState().held,true);f.controller.dispose();
});

test('visibility bounce while acquisition is pending does not retain the stale sentinel',async()=>{
  const first=deferred();const f=fixture({request:({requests,Sentinel,sentinels})=>{
    if(requests.length===1)return first.promise;
    const s=new Sentinel();sentinels.push(s);return Promise.resolve(s);
  }});
  f.controller.setActive(true);await settle();
  f.document.show(false);f.document.show(true);f.document.show(false);f.document.show(true);
  const old=new f.Sentinel();first.resolve(old);await settle();
  assert.equal(old.releaseCalls,1);assert.equal(f.requests.length,2);
  assert.equal(f.controller.getState().held,true);f.controller.dispose();
});

test('a request resolving while hidden is released and waits for a visible event',async()=>{
  const first=deferred();const f=fixture({request:()=>first.promise});
  f.controller.setActive(true);await settle();f.document.show(false);
  const sentinel=new f.Sentinel();first.resolve(sentinel);await settle();
  assert.equal(sentinel.releaseCalls,1);assert.equal(f.requests.length,1);
  assert.equal(f.controller.getState().status,'hidden');f.controller.dispose();
});

test('permission denial is contained and retries only on explicit retry or new operation',async()=>{
  const f=fixture({request:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))});
  assert.doesNotThrow(()=>f.controller.setActive(true));await settle();
  assert.equal(f.controller.getState().active,true);assert.equal(f.controller.getState().status,'unavailable');
  await settle();f.controller.setActive(true);await settle();assert.equal(f.requests.length,1);
  f.controller.retry();await settle();assert.equal(f.requests.length,2);
  f.controller.setActive(false);f.controller.setActive(true);await settle();assert.equal(f.requests.length,3);
  f.controller.dispose();
});

test('synchronous browser request failure is contained without aborting active work',async()=>{
  const f=fixture({request:()=>{throw new Error('Unsupported policy');}});
  assert.doesNotThrow(()=>f.controller.setActive(true));await settle();
  assert.equal(f.controller.getState().status,'unavailable');assert.equal(f.controller.getState().active,true);
  f.controller.setActive(false);assert.equal(f.controller.getState().status,'idle');f.controller.dispose();
});

test('spontaneous OS release while visible never creates an automatic retry loop',async()=>{
  const f=fixture();f.controller.setActive(true);await settle();
  f.sentinels[0].externalRelease();await settle();await settle();
  assert.equal(f.requests.length,1);assert.equal(f.controller.getState().status,'released');
  assert.equal(f.controller.getState().active,true);assert.equal(f.controller.getState().held,false);
  f.controller.retry();await settle();assert.equal(f.requests.length,2);
  f.sentinels[0].externalRelease();await settle();
  assert.equal(f.controller.getState().held,true);assert.equal(f.requests.length,2);f.controller.dispose();
});

test('missing wake-lock support is informational; active transfer state remains available',async()=>{
  const doc=new EventTarget();doc.visibilityState='visible';
  const c=createScreenAwake({wakeLock:{},document:doc});
  assert.doesNotThrow(()=>c.setActive(true));await settle();
  assert.equal(c.getState().available,false);assert.equal(c.getState().status,'unsupported');
  assert.equal(c.getState().active,true);c.retry();c.setActive(false);c.dispose();
});

test('observer errors do not prevent acquisition or release',async()=>{
  const f=fixture({observer:()=>{throw new Error('UI observer');}});
  f.controller.setActive(true);await settle();assert.equal(f.controller.getState().held,true);
  f.controller.setActive(false);await settle();assert.equal(f.sentinels[0].releaseCalls,1);f.controller.dispose();
});

test('dispose releases held lock, unregisters visibility listener and is idempotent',async()=>{
  const f=fixture();f.controller.setActive(true);await settle();assert.equal(f.document.listenerCount,1);
  f.controller.dispose();f.controller.dispose();await settle();
  assert.equal(f.sentinels[0].releaseCalls,1);assert.equal(f.document.listenerCount,0);
  f.document.show(false);f.document.show(true);f.controller.setActive(true);f.controller.retry();await settle();
  assert.equal(f.requests.length,1);assert.equal(f.controller.getState().status,'idle');
  assert.equal(f.controller.getState().active,false);
});

test('dispose while acquisition is pending releases late sentinel without publishing later UI state',async()=>{
  const pending=deferred(),f=fixture({request:()=>pending.promise});
  f.controller.setActive(true);await settle();f.controller.dispose();const events=f.states.length;
  const sentinel=new f.Sentinel();pending.resolve(sentinel);await settle();
  assert.equal(sentinel.releaseCalls,1);assert.equal(f.states.length,events);
  assert.equal(f.controller.getState().held,false);assert.equal(f.document.listenerCount,0);
});

test('release rejection or throw remains best effort and never escapes inactive/dispose',async()=>{
  for(const throws of [true,false]){
    const f=fixture({request:({Sentinel,sentinels})=>{
      const s=new Sentinel();s.release=()=>{if(throws)throw new Error('Release failure');return Promise.reject(new Error('Release failure'));};
      sentinels.push(s);return Promise.resolve(s);
    }});
    f.controller.setActive(true);await settle();
    assert.doesNotThrow(()=>f.controller.setActive(false));await settle();
    assert.equal(f.controller.getState().held,false);assert.equal(f.controller.getState().status,'idle');
    assert.doesNotThrow(()=>f.controller.dispose());
  }
});
