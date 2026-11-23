import test from 'node:test';
import assert from 'node:assert/strict';
import {STREAM_OPTION_DEFAULTS, normalizeStreamOptions, readStreamOptions, saveStreamOptions, resetStreamOptions} from '../src/lib/stream-options.js';
import {createStreamSession, STREAM_SESSION_MAX_FILE_BYTES, STREAM_SESSION_TTL_MS} from '../src/lib/stream-session.js';

function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}

test('only bounded image preferences survive storage, with defaults for invalid values',()=>{
  const s=storage();assert.deepEqual(readStreamOptions(s),STREAM_OPTION_DEFAULTS);
  const wanted={fit:'crop',rotation:270,dither:'bayer',threshold:201,invert:true,fps:10,loopVideo:false};
  assert.equal(saveStreamOptions({...wanted,file:'private.mp4',url:'blob:private',playing:true},s),true);
  assert.deepEqual(readStreamOptions(s),wanted);
  assert.doesNotMatch([...s.values.values()][0],/private|file|url|playing/);
  assert.deepEqual(normalizeStreamOptions({fit:'bad',rotation:45,dither:'noise',threshold:999,invert:1,fps:100,loopVideo:'true'}),STREAM_OPTION_DEFAULTS);
  assert.deepEqual(normalizeStreamOptions(null),STREAM_OPTION_DEFAULTS);
});

test('corrupt, oversized, unknown-version and restricted storage never block the sender',()=>{
  for(const raw of ['{bad','x'.repeat(2049),'null','[]','{"schema":2,"options":{"fps":10}}']){
    const s=storage();s.setItem('allmiibo.stream.options.v1',raw);assert.deepEqual(readStreamOptions(s),STREAM_OPTION_DEFAULTS);
  }
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');},removeItem(){throw Error('blocked');}};
  assert.deepEqual(readStreamOptions(blocked),STREAM_OPTION_DEFAULTS);assert.equal(saveStreamOptions({},blocked),false);assert.deepEqual(resetStreamOptions(blocked),STREAM_OPTION_DEFAULTS);
  assert.equal(saveStreamOptions({rotation:90,fps:10},blocked),false);
  assert.equal(readStreamOptions(blocked).rotation,90);assert.equal(readStreamOptions(blocked).fps,10);
  resetStreamOptions(blocked);assert.deepEqual(readStreamOptions(blocked),STREAM_OPTION_DEFAULTS);
});

test('reset removes only sender options and leaves unrelated preferences intact',()=>{
  const s=storage();s.setItem('other-preference','keep');saveStreamOptions({fps:15},s);
  assert.deepEqual(resetStreamOptions(s),STREAM_OPTION_DEFAULTS);assert.equal(s.values.size,1);assert.equal(s.getItem('other-preference'),'keep');
});

test('one in-memory file is replaced, bounded by size and expired after thirty minutes',()=>{
  let now=0,next=0;const timers=new Map();
  const session=createStreamSession({now:()=>now,schedule:fn=>{timers.set(++next,fn);return next;},cancel:id=>timers.delete(id)});
  const first={name:'first.mp4',size:20},second={name:'second.png',size:STREAM_SESSION_MAX_FILE_BYTES};
  assert.equal(session.remember(first,{start:2,end:4}),true);assert.equal(session.get().file,first);assert.equal(timers.size,1);
  assert.equal(session.remember(second),true);assert.equal(session.get().file,second);assert.equal(timers.size,1);
  session.updateClip({start:3,end:6});const seen=session.get();seen.clip.start=999;assert.equal(session.get().clip.start,3);
  now=STREAM_SESSION_TTL_MS;assert.equal(session.get(),null);assert.equal(timers.size,0);
  assert.equal(session.remember({name:'large.mp4',size:STREAM_SESSION_MAX_FILE_BYTES+1}),false);assert.equal(session.get(),null);
  assert.equal(session.remember({name:'invalid.mp4',size:-1}),false);
  now=0;session.remember(first);[...timers.values()][0]();assert.equal(session.get(),null);assert.equal(timers.size,0);
});
