import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceKind, sourceRectangle, rotatedSourceRectangle, demoRgba, drawMediaFrame, loadLocalMedia, createFramePump} from '../src/lib/stream-media.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function clock(){let time=0,id=0;const pending=new Map();return{now:()=>time,schedule(fn,ms){const key=++id;pending.set(key,{fn,at:time+ms});return key;},cancel:key=>pending.delete(key),async advance(ms){time+=ms;for(const [key,value]of [...pending])if(value.at<=time){pending.delete(key);value.fn();}await flush();},pending};}
function source(video=false){const listeners=new Map();return{naturalWidth:640,naturalHeight:480,videoWidth:video?1920:0,videoHeight:video?1080:0,src:'',paused:false,loads:0,addEventListener(e,fn){if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(fn);},removeEventListener(e,fn){listeners.get(e)?.delete(fn);},emit(e){for(const fn of [...(listeners.get(e)||[])])fn();},removeAttribute(){this.src='';},pause(){this.paused=true;},load(){this.loads++;},listeners};}
function mediaFixture(video=false){const item=source(video),urls=[],revoked=[],timers=clock();const handle=loadLocalMedia({name:video?'clip.mp4':'photo.png',type:video?'video/mp4':'image/png'},{video:video?item:undefined,ImageClass:class{constructor(){return item;}},urlApi:{createObjectURL:file=>{urls.push(file);return 'blob:fixture';},revokeObjectURL:url=>revoked.push(url)},schedule:timers.schedule,cancel:timers.cancel});return{item,handle,urls,revoked,timers};}

test('media classification supports local browser types and filename fallback, rejects active SVG and non-media',()=>{
 assert.equal(sourceKind({type:'image/png'}),'image');assert.equal(sourceKind({name:'CLIP.MP4',type:''}),'video');assert.equal(sourceKind({name:'test.GIF'}),'image');assert.equal(sourceKind({type:'video/webm'}),'video');
 for(const file of [{type:'image/svg+xml'},{name:'hidden.svg',type:'image/png'},{name:'archive.zip'},{type:'text/html',name:'clip.mp4'},{}])assert.throws(()=>sourceKind(file),{code:'MEDIA_TYPE'});
});
test('generic binary MIME types use a media extension, while explicit non-media and SVG remain rejected',()=>{
 assert.equal(sourceKind({name:'photo.PNG',type:'application/octet-stream'}),'image');
 assert.equal(sourceKind({name:'movie.mp4',type:'binary/octet-stream'}),'video');
 for(const file of [{name:'photo.png',type:'text/html'},{name:'photo.png',type:'image/svg+xml;charset=utf-8'},{name:'archive.zip',type:'application/octet-stream'}])assert.throws(()=>sourceKind(file),{code:'MEDIA_TYPE'});
});
test('fitting preserves a square image with equal side bars, cropping keeps its centered middle, stretching fills',()=>{
 assert.deepEqual(sourceRectangle(100,100,'fit'),{sx:0,sy:0,sw:100,sh:100,dx:32,dy:0,dw:64,dh:64});
 assert.deepEqual(sourceRectangle(100,100,'crop'),{sx:0,sy:25,sw:100,sh:50,dx:0,dy:0,dw:128,dh:64});
 assert.deepEqual(sourceRectangle(300,100,'crop'),{sx:50,sy:0,sw:200,sh:100,dx:0,dy:0,dw:128,dh:64});
 assert.deepEqual(sourceRectangle(100,100,'stretch'),{sx:0,sy:0,sw:100,sh:100,dx:0,dy:0,dw:128,dh:64});
 for(const values of [[0,100],[Infinity,1],[1,NaN],[10000,10000],[10,10,'other']])assert.throws(()=>sourceRectangle(...values),{code:'MEDIA_DIMENSIONS'});
});
test('canvas capture clears letterbox pixels and draws the centered source rectangle into exactly 128x64',()=>{
 const calls=[],rgba=new Uint8ClampedArray(32768);const context={fillRect:(...args)=>calls.push(['fill',...args]),drawImage:(...args)=>calls.push(['draw',...args]),getImageData:(...args)=>{calls.push(['read',...args]);return{data:rgba};}};
 const src={videoWidth:1920,videoHeight:1080};assert.equal(drawMediaFrame(context,src,'fit'),rgba);assert.equal(context.fillStyle,'#000');assert.deepEqual(calls[0],['fill',0,0,128,64]);assert.deepEqual(calls[1].slice(0,6),['draw',src,0,0,1920,1080]);assert(Math.abs(calls[1][6]-(64-512/9))<1e-10);assert.equal(calls[1][7],0);assert(Math.abs(calls[1][8]-1024/9)<1e-10);assert.equal(calls[1][9],64);assert.deepEqual(calls[2],['read',0,0,128,64]);
});
test('rotation is applied before fit/crop without a source-sized intermediate canvas',()=>{
 const fit=rotatedSourceRectangle(200,100,'fit',90);
 assert.deepEqual(fit.rectangle,{sx:0,sy:0,sw:100,sh:200,dx:48,dy:0,dw:32,dh:64});
 assert.deepEqual(fit.original,{sx:0,sy:0,sw:200,sh:100});
 for(const rotation of [90,270])assert.deepEqual(rotatedSourceRectangle(200,100,'crop',rotation).original,{sx:75,sy:0,sw:50,sh:100});
 assert.deepEqual(rotatedSourceRectangle(200,100,'crop',180).original,{sx:0,sy:0,sw:200,sh:100});
 assert.throws(()=>rotatedSourceRectangle(100,100,'fit',45),{code:'MEDIA_ROTATION'});
 const calls=[],source={naturalWidth:200,naturalHeight:100},context={fillRect(){},save(){calls.push(['save']);},restore(){calls.push(['restore']);},translate:(...v)=>calls.push(['translate',...v]),rotate:v=>calls.push(['rotate',v]),drawImage:(...v)=>calls.push(['draw',...v]),getImageData:()=>({data:new Uint8ClampedArray(32768)})};
 drawMediaFrame(context,source,'fit',90);
 assert.deepEqual(calls,[['save'],['translate',64,32],['rotate',Math.PI/2],['draw',source,0,0,200,100,-32,-16,64,32],['restore']]);
 context.drawImage=()=>{throw Error('decode');};assert.throws(()=>drawMediaFrame(context,source,'fit',180),/decode/);assert.deepEqual(calls.at(-1),['restore']);
});
test('demo is bounded opaque monochrome and changes between frames',()=>{
 const first=demoRgba(0),next=demoRgba(1);assert.equal(first.length,32768);assert.notDeepEqual(first,next);
 for(let i=0;i<first.length;i+=4){assert([0,255].includes(first[i]));assert.equal(first[i],first[i+1]);assert.equal(first[i],first[i+2]);assert.equal(first[i+3],255);}
});
test('loaded image URL is retained until selection is disposed, then revoked exactly once',async()=>{
 const f=mediaFixture();f.item.emit('load');assert.equal((await f.handle.ready).source,f.item);assert.deepEqual(f.revoked,[]);assert.equal(f.timers.pending.size,0);f.handle.dispose();f.handle.dispose();assert.deepEqual(f.revoked,['blob:fixture']);assert.equal(f.item.src,'');
});
test('reselection during image decode cancels the pending result and removes listeners/timer/URL',async()=>{
 const f=mediaFixture();const rejected=assert.rejects(f.handle.ready,{code:'MEDIA_CANCELLED'});f.handle.dispose();await rejected;f.item.emit('load');assert.equal(f.timers.pending.size,0);assert.deepEqual(f.revoked,['blob:fixture']);for(const values of f.item.listeners.values())assert.equal(values.size,0);
});
test('video waits for actual frame data, is muted/inline, and releases its source on disposal',async()=>{
 const f=mediaFixture(true);assert.equal(f.item.muted,true);assert.equal(f.item.playsInline,true);assert.equal(f.item.loads,1);let ready=false;f.handle.ready.then(()=>ready=true);f.item.emit('loadedmetadata');await flush();assert.equal(ready,false);f.item.emit('loadeddata');assert.equal((await f.handle.ready).kind,'video');f.handle.dispose();assert.equal(f.item.paused,true);assert.equal(f.item.loads,2);assert.deepEqual(f.revoked,['blob:fixture']);
});
test('decode failure, oversized image, and media timeout all release readiness without a late success',async()=>{
 for(const variant of ['decode','size','timeout']){const f=mediaFixture();const expected=variant==='decode'?'MEDIA_DECODE':variant==='size'?'MEDIA_DIMENSIONS':'MEDIA_TIMEOUT';const rejected=assert.rejects(f.handle.ready,{code:expected});if(variant==='decode')f.item.emit('error');else if(variant==='size'){f.item.naturalWidth=10000;f.item.naturalHeight=10000;f.item.emit('load');}else await f.timers.advance(30000);await rejected;f.item.emit('load');f.handle.dispose();assert.deepEqual(f.revoked,['blob:fixture']);assert.equal(f.timers.pending.size,0);}
});
test('a slow send never captures or queues the next frame until its acknowledgement completes',async()=>{
 const c=clock(),gate=deferred(),captures=[],receipts=[];let sends=0;
 const pump=createFramePump({capture:()=>{captures.push(c.now());return new Uint8Array(1024);},send:()=>{sends++;return sends===1?gate.promise:Promise.resolve('second');},onFrame:r=>receipts.push(r),...c});
 assert.equal(pump.start({fps:5}),true);assert.equal(pump.start({fps:5}),false);assert.equal(sends,1);await c.advance(1000);assert.equal(captures.length,1);gate.resolve('first');await flush();assert.deepEqual(receipts,['first']);await c.advance(0);assert.equal(sends,2);pump.stop();assert.equal(c.pending.size,0);
});
test('target frame timing waits only the remaining interval after send time',async()=>{
 const c=clock(),gate=deferred();let calls=0;const pump=createFramePump({capture:()=>new Uint8Array(1024),send:()=>{calls++;return calls===1?gate.promise:Promise.resolve();},...c});pump.start({fps:5});await c.advance(50);gate.resolve();await flush();await c.advance(149);assert.equal(calls,1);await c.advance(1);assert.equal(calls,2);pump.stop();
});
test('stop during acknowledgement ignores a late receipt, and stopped delay does not schedule another capture',async()=>{
 const c=clock(),gate=deferred();let frames=0,captures=0;const pump=createFramePump({capture:()=>++captures,send:()=>gate.promise,onFrame:()=>frames++,...c});pump.start();pump.stop();gate.resolve();await flush();assert.equal(frames,0);assert.equal(captures,1);assert.equal(c.pending.size,0);assert.equal(pump.running,false);
 const after=createFramePump({capture:()=>++captures,send:async()=>{},...c});after.start();await flush();assert.equal(c.pending.size,1);after.stop();await c.advance(10000);assert.equal(c.pending.size,0);assert.equal(captures,2);
});
test('send error is reported once with no retry, and stop from receipt leaves no timer',async()=>{
 const c=clock(),errors=[];let sends=0;const err=Object.assign(Error('ack'),{code:'STREAM_ACK_TIMEOUT'});const pump=createFramePump({capture:()=>0,send:async()=>{sends++;throw err;},onError:e=>errors.push(e),...c});pump.start();await flush();await c.advance(10000);assert.equal(sends,1);assert.deepEqual(errors,[err]);assert.equal(pump.running,false);
 let one;one=createFramePump({capture:()=>0,send:async()=>{},onFrame:()=>one.stop(),...c});one.start();await flush();assert.equal(c.pending.size,0);
});
test('a stopped run cannot report its result into a newly started run',async()=>{
 const c=clock(),first=deferred(),second=deferred(),seen=[];let count=0;const pump=createFramePump({capture:()=>++count,send:f=>f===1?first.promise:second.promise,onFrame:r=>seen.push(r),...c});pump.start();pump.stop();pump.start();first.resolve('old');await flush();assert.deepEqual(seen,[]);second.resolve('new');await flush();assert.deepEqual(seen,['new']);pump.stop();
});
