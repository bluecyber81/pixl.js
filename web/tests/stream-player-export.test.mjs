import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {planPlayerExport, createPlayerExport, seekVideoFrame, playerExportName, PLAYER_EXPORT_MAX_BYTES} from '../src/lib/stream-player-export.js';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('export planning validates clips, exact sizes, still images and the memory ceiling',()=>{
  const plan=planPlayerExport({kind:'video',start:2,end:12,duration:20,fps:5});assert.equal(plan.frames,50);assert.equal(plan.bytes,51216);
  assert.equal(planPlayerExport({kind:'image',fps:5}).bytes,1040);
  assert.equal(planPlayerExport({kind:'demo',end:0.3,fps:10}).frames,3);
  for(const change of [{start:-1},{end:0},{end:21},{fps:0},{fps:61},{duration:Infinity},{kind:'other'}])assert.throws(()=>planPlayerExport({kind:'video',start:0,end:10,duration:20,fps:5,...change}),{code:'EXPORT_RANGE'});
  assert.throws(()=>planPlayerExport({kind:'demo',fps:15,end:120}),{code:'EXPORT_TOO_LARGE'});
  assert(planPlayerExport({kind:'demo',fps:1,end:1023}).bytes<=PLAYER_EXPORT_MAX_BYTES);
  assert.throws(()=>planPlayerExport({kind:'demo',fps:1,end:1024}),{code:'EXPORT_TOO_LARGE'});
});

test('PIXV contains the exact little-endian header and sequential bounded frame samples',async()=>{
  const plan=planPlayerExport({kind:'video',start:1,end:1.6,duration:2,fps:5}),times=[],progress=[];
  const bytes=await createPlayerExport(plan,{capture:async(i,time)=>{times.push(time);return new Uint8Array(1024).fill(i+1);},onProgress:v=>progress.push(v.completed)});
  assert.equal(bytes.length,16+3*1024);assert.deepEqual([...bytes.subarray(0,16)],[0x56,0x58,0x49,0x50,3,0,5,0,128,0,64,0,0,0,0,0]);
  assert.deepEqual(times,[1,1.2,1.4]);assert.deepEqual(progress,[1,2,3]);
  for(let i=0;i<3;i++)assert(bytes.subarray(16+i*1024,16+(i+1)*1024).every(v=>v===i+1));
});

test('cancelled or failed capture never returns a partial file or captures another frame',async()=>{
  const plan=planPlayerExport({kind:'demo',end:2,fps:5}),abort=new AbortController(),gate=defer();let captures=0,progress=0;
  const work=createPlayerExport(plan,{signal:abort.signal,capture:()=>{captures++;return gate.promise;},onProgress:()=>progress++});
  abort.abort();gate.resolve(new Uint8Array(1024));await assert.rejects(work,{code:'EXPORT_CANCELLED'});assert.equal(captures,1);assert.equal(progress,0);
  await assert.rejects(createPlayerExport(plan,{capture:()=>new Uint8Array(1)}),{code:'EXPORT_FRAME'});
  await assert.rejects(createPlayerExport({...plan,bytes:plan.bytes+1},{capture:()=>new Uint8Array(1024)}),{code:'EXPORT_RANGE'});
});

test('cancellation at progress or a UI yield also prevents success and no frames are queued',async()=>{
  for(const mode of ['progress','yield']){
    const abort=new AbortController();let captures=0;
    await assert.rejects(createPlayerExport(planPlayerExport({kind:'demo',fps:5,end:2}),{
      signal:abort.signal,capture:()=>{captures++;return new Uint8Array(1024);},
      onProgress:()=>{if(mode==='progress')abort.abort();},yieldControl:async()=>abort.abort(),
    }),{code:'EXPORT_CANCELLED'});
    assert.equal(captures,mode==='progress'?1:8);
  }
});

function videoFixture(){
  const listeners=new Map(),timers=new Map();let time=0,id=0;
  const video={readyState:2,seeking:false,addEventListener(e,fn){if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(fn);},removeEventListener(e,fn){listeners.get(e)?.delete(fn);},emit(e){for(const fn of [...(listeners.get(e)||[])])fn();},get currentTime(){return time;},set currentTime(v){time=v;this.seeking=true;}};
  return {video,listeners,timers,schedule:fn=>{timers.set(++id,fn);return id;},cancel:key=>timers.delete(key)};
}

test('video export seeks only to decoded frames, handles same-time frames and cleans timeout/abort listeners',async()=>{
  const f=videoFixture();await seekVideoFrame(f.video,0,f);assert.equal(f.timers.size,0);
  const pending=seekVideoFrame(f.video,1,f);f.video.readyState=1;f.video.seeking=false;f.video.emit('seeked');let ready=false;pending.then(()=>ready=true);await Promise.resolve();assert.equal(ready,false);
  f.video.readyState=2;f.video.emit('loadeddata');await pending;assert.equal(f.timers.size,0);
  for(const mode of ['abort','timeout','error']){
    const c=videoFixture(),controller=new AbortController();const work=seekVideoFrame(c.video,2,{...c,signal:controller.signal});
    if(mode==='abort')controller.abort();else if(mode==='timeout')[...c.timers.values()][0]();else c.video.emit('error');
    await assert.rejects(work,{code:mode==='abort'?'EXPORT_CANCELLED':mode==='timeout'?'EXPORT_SEEK_TIMEOUT':'MEDIA_DECODE'});
    assert.equal(c.timers.size,0);for(const set of c.listeners.values())assert.equal(set.size,0);
  }
});

test('exported bytes pass the actual existing C player header parser',async t=>{
  const compiler=process.platform==='win32'?'gcc.exe':'gcc';
  if(spawnSync(compiler,['--version']).error){t.skip('A host C compiler is unavailable');return;}
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pixv-export-'));
  try{
    const header=fileURLToPath(new URL('../../fw/application/src/app/player/view/player_format.h',import.meta.url));
    fs.writeFileSync(path.join(temporary,'check.c'),'#include <stdio.h>\n#include "'+header.replaceAll('\\','/')+'"\nint main(int argc,char **argv){if(argc!=2)return 2;FILE*f=fopen(argv[1],"rb");if(!f)return 3;unsigned char h[16];if(fread(h,1,16,f)!=16)return 4;fseek(f,0,SEEK_END);long n=ftell(f);fclose(f);v_header_t v;size_t s;return !player_parse_header(h,16,(size_t)n,128,64,&v,&s);}\n');
    const binary=path.join(temporary,process.platform==='win32'?'check.exe':'check');
    const build=spawnSync(compiler,['-std=c11','-Wall','-Wextra','-Werror',path.join(temporary,'check.c'),'-o',binary],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
    const file=path.join(temporary,'video.bin'),bytes=await createPlayerExport(planPlayerExport({kind:'demo',end:10,fps:5}),{capture:()=>new Uint8Array(1024)});
    fs.writeFileSync(file,bytes);assert.equal(spawnSync(binary,[file]).status,0);
    fs.writeFileSync(file,bytes.subarray(0,-1));assert.equal(spawnSync(binary,[file]).status,1);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});

test('download names are short, portable BIN filenames without source paths',()=>{
  assert.equal(playerExportName('Meine schöne Datei.mp4'),'Meine_schone_Datei_lcd.bin');
  assert.doesNotMatch(playerExportName('../ä:test/clip.mp4'),/[/:\\]/);assert(playerExportName('x'.repeat(200)+'.mp4').length<=28);
});
