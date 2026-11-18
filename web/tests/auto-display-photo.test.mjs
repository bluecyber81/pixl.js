import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoDisplayPhoto} from '../src/lib/auto-display-photo.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function clock(){let now=0,id=0;const timers=new Map();return {now:()=>now,schedule:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},unschedule:id=>timers.delete(id),async advance(ms){const end=now+ms;for(;;){const first=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;now=first[1].at;timers.delete(first[0]);first[1].fn();await Promise.resolve();await Promise.resolve();}now=end;await Promise.resolve();},pending:()=>timers.size};}
test('bursts coalesce; at most one photo per second and no idle polling',async()=>{
 const c=clock(),times=[],s=createAutoDisplayPhoto({...c,canCapture:()=>true,capture:()=>times.push(c.now())});
 s.request();await c.advance(100);s.request();await c.advance(199);assert.deepEqual(times,[]);await c.advance(1);assert.deepEqual(times,[300]);
 s.request();await c.advance(999);assert.deepEqual(times,[300]);await c.advance(1);assert.deepEqual(times,[300,1300]);await c.advance(60000);assert.equal(c.pending(),0);assert.equal(times.length,2);
});
test('captures serialize, multiple requests while reading combine and cancellation discards pending work',async()=>{
 const c=clock(),gate=deferred();let calls=0;const s=createAutoDisplayPhoto({...c,canCapture:()=>true,capture:()=>{calls++;return gate.promise;}});
 s.request();await c.advance(200);s.request();s.request();await c.advance(2000);assert.equal(calls,1);s.cancel();gate.resolve();await c.advance(5000);assert.equal(calls,1);assert.equal(c.pending(),0);
 s.dispose();s.request();await c.advance(5000);assert.equal(calls,1);
});
test('late blocked state and capture failure do not retry or poll',async()=>{
 const c=clock();let enabled=true,calls=0;const s=createAutoDisplayPhoto({...c,canCapture:()=>enabled,capture:()=>{calls++;throw Error('busy');}});
 s.request();enabled=false;await c.advance(200);assert.equal(calls,0);enabled=true;await c.advance(5000);assert.equal(calls,0);
 s.request();await c.advance(200);assert.equal(calls,1);await c.advance(60000);assert.equal(calls,1);assert.equal(c.pending(),0);
});
