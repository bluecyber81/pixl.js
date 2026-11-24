import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {rgbaToFrame,frameToRgba} from '../src/lib/ble-image-stream.js';
import {createFramePump,demoRgba,drawMediaFrame,loadLocalMedia,measureTicker,drawTicker} from '../src/lib/stream-media.js';
import {readStreamOptions,saveStreamOptions,resetStreamOptions} from '../src/lib/stream-options.js';
import {createStreamSession,STREAM_SESSION_MAX_FILE_BYTES} from '../src/lib/stream-session.js';
import {planPlayerExport,createPlayerExport,playerExportName,seekVideoFrame} from '../src/lib/stream-player-export.js';
// Vue's number-input directive checks the root's DOM type even with a custom
// renderer. These constructors model the inert document used by this harness.
globalThis.Document ??= class Document {};
globalThis.ShadowRoot ??= class ShadowRoot {};
const filename=new URL('../src/components/BleImageSender.vue',import.meta.url);
const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename:filename.pathname});
const script=compileScript(descriptor,{id:'stream-ui'}).content.replace(/^import .*$/gm,'').replace('export default','const Component=');
const template=compileTemplate({source:descriptor.template.content,id:'stream-ui',filename:filename.pathname,compilerOptions:{hoistStatic:false}}).code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,(_,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=Vue;`).replace('export function render','function render');
const factory=new Function('Vue','BleImageStream','rgbaToFrame','frameToRgba','createFramePump','demoRgba','drawMediaFrame','loadLocalMedia','readStreamOptions','saveStreamOptions','resetStreamOptions','streamSession','STREAM_SESSION_MAX_FILE_BYTES','planPlayerExport','createPlayerExport','playerExportName','seekVideoFrame','document','globalThis','performance','measureTicker','drawTicker',script+'\n'+template+'\nComponent.render=render;return Component;');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Vue.nextTick();};
function element(type,text=''){
 const listeners=new Map();let position=0;const n={type,tagName:type.toUpperCase(),text,props:{},children:[],parent:null,style:{},value:'',paused:true,ended:false,duration:20,readyState:2,seeking:false,get currentTime(){return position;},set currentTime(v){position=v;queueMicrotask(()=>this.emit('seeked'));},naturalWidth:640,naturalHeight:480,videoWidth:640,videoHeight:480,
 addEventListener(e,fn){if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(fn);},removeEventListener(e,fn){listeners.get(e)?.delete(fn);},emit(e){for(const fn of [...(listeners.get(e)||[])])fn({target:this});const callback=this.props['on'+e[0].toUpperCase()+e.slice(1)];callback?.({target:this});},removeAttribute(name){this[name]='';},setAttribute(name,v){this[name]=v;},getRootNode(){return {activeElement:null};},load(){},pause(){if(!this.paused){this.paused=true;this.emit('pause');}},async play(){this.paused=false;this.emit('play');},get options(){return this.children.filter(v=>v.type==='option');},
 getContext(){return this.context??=( {createImageData:()=>({data:new Uint8ClampedArray(32768)}),putImageData:img=>this.pixels=img.data.slice(),fillRect(){},measureText:value=>({width:value.length*16}),fillText(){},drawImage(){},save(){},restore(){},translate(){},rotate(){},getImageData:()=>({data:demoRgba(2)})});}};
 return n;
}
const renderer=Vue.createRenderer({createElement:t=>element(t),createText:t=>element('#text',t),createComment:t=>element('#comment',t),setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,o,v)=>{n.props[k]=v;if(k==='value'||k==='type'||k==='multiple')n[k]=v;},insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=p.children.indexOf(a);i<0?p.children.push(n):p.children.splice(i,0,n);},remove(n){n.parent?.children.splice(n.parent.children.indexOf(n),1);n.parent=null;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null});
const flat=n=>[n,...n.children.flatMap(flat)],text=n=>n.text+n.children.map(text).join('');
function mount(options={}){
 const calls=[],active=[],sending=[],exporting=[],timers=new Map(),revoked=[],sources=[],blobs=new Map(),doc=element('document'),root=element('root');let time=0,timerID=0,notify;
 doc.createElement=t=>element(t);doc.hidden=false;
 const clock={now:()=>time,schedule:(fn,delay)=>{const id=++timerID;timers.set(id,{fn,at:time+delay});return id;},cancel:id=>timers.delete(id)};
 const browser={navigator:options.unavailable?{}:{bluetooth:{requestDevice(){}}},isSecureContext:!options.insecure,addEventListener:doc.addEventListener.bind(doc),removeEventListener:doc.removeEventListener.bind(doc),requestAnimationFrame:fn=>clock.schedule(fn,16),cancelAnimationFrame:clock.cancel,URL:{createObjectURL:blob=>{const url='blob:export-'+blobs.size;blobs.set(url,blob);return url;},revokeObjectURL:url=>{revoked.push(url);blobs.delete(url);}}};
 const state=(phase,error='')=>notify({phase,error,deviceName:'Pixl.js'});
 class Client{constructor({onState}){notify=onState;}async connect(){calls.push('connect');state('connecting');try{await options.connect?.();state('connected');}catch(error){state('error',error.code);throw error;}}disconnect(){calls.push('disconnect');state('idle');}async sendFrame(frame,opts){calls.push({frame:frame.slice(),opts});return options.send?await options.send(frame):{packetBytes:21,payloadBytes:16,mode:'rle'};}}
 class Image{constructor(){const item=element('img');sources.push(item);return item;}}
 const loader=(file,{video})=>loadLocalMedia(file,{video,ImageClass:Image,urlApi:{createObjectURL:()=>`blob:test-${sources.length}`,revokeObjectURL:url=>revoked.push(url)},schedule:clock.schedule,cancel:clock.cancel});
 const values=new Map(),storage=options.storage||{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const session=options.session||createStreamSession({...clock,now:clock.now});
 const Component=factory(Vue,Client,rgbaToFrame,frameToRgba,config=>createFramePump({...config,...clock}),demoRgba,drawMediaFrame,loader,()=>readStreamOptions(storage),value=>saveStreamOptions(value,storage),()=>resetStreamOptions(storage),session,STREAM_SESSION_MAX_FILE_BYTES,planPlayerExport,options.exporter||createPlayerExport,playerExportName,seekVideoFrame,doc,browser,{now:clock.now},measureTicker,drawTicker);
 const props=Vue.reactive({locale:options.locale||'de_DE',blocked:!!options.blocked,onActive:v=>active.push(v),onSending:v=>sending.push(v),onExporting:v=>exporting.push(v)});let vm;
 const app=renderer.createApp({render:()=>Vue.h(Component,{...props,ref:v=>vm=v})});app.mount(root);
 return {root,app,props,calls,active,sending,exporting,doc,timers,sources,revoked,blobs,storage,session,state,get vm(){return vm;},button:label=>flat(root).find(n=>n.type==='button'&&text(n).includes(label)),video:()=>flat(root).find(n=>n.type==='video'),async advance(ms){time+=ms;for(const[id,t]of[...timers])if(t.at<=time){timers.delete(id);t.fn();}await flush();}};
}

test('sender opens with a bounded demo preview and no connection or transmission',()=>{
 const h=mount();try{assert.deepEqual(h.calls,[]);assert.equal(h.vm.sourceKind,'demo');assert.equal(h.vm.ready,true);assert.equal(flat(h.root).find(n=>n.type==='canvas').pixels.length,32768);assert(h.button('Demo senden').props.disabled);assert.match(text(h.root),/Dateiverbindung und Fernbedienung trennen/);assert.match(text(h.root),/OLED unterstützt diesen Bildempfang nicht/);}finally{h.app.unmount();}
});

test('scrolling text stays local until sent and exports a full player loop in both languages',async()=>{
 for(const locale of ['en','de_DE']){
  const h=mount({locale});try{
   h.button(locale==='en'?'Scrolling text':'Lauftext').props.onClick();await flush();
   assert.equal(h.vm.canExport,false);
   h.vm.tickerText='   ';await flush();assert.equal(h.vm.canExport,false);
   h.vm.tickerText='Grüße vom LCD';await flush();
   const expectedFrames=Math.ceil(h.vm.tickerLayout.period/h.vm.tickerSpeed*h.vm.fps);
   h.vm.toggleTickerPreview();await h.advance(220);
   assert.equal(h.vm.tickerPreviewing,true);assert.deepEqual(h.calls,[]);
   h.vm.toggleTickerPreview();assert.equal(h.vm.tickerPreviewing,false);assert.equal(h.timers.size,0);
   await h.vm.startExport();await flush();
   assert.equal(h.vm.exportCompleted,expectedFrames);assert.equal(h.vm.exportFileName,'ticker_lcd.bin');
   const url=h.vm.exportUrl,bin=new DataView(await h.blobs.get(url).arrayBuffer());
   assert.equal(bin.getUint16(4,true),expectedFrames);assert.equal(bin.byteLength,16+expectedFrames*1024);
   h.vm.tickerSpeed=60;await flush();assert.equal(h.vm.exportUrl,'');assert(h.revoked.includes(url));
   await h.vm.connectStream();await h.vm.startSending();await flush();
   assert.equal(h.vm.sending,true);assert.equal(h.calls.filter(v=>v.frame).length,1);
   assert.equal(h.vm.selectionLocked,true);assert.equal(h.vm.canExport,false);
   h.doc.hidden=true;h.vm.visibilityChanged();assert.equal(h.vm.sending,false);assert.equal(h.timers.size,0);
   h.vm.resetSender();assert.equal(h.vm.tickerText,'');assert.equal(h.vm.tickerSpeed,40);
  }finally{h.app.unmount();}
 }
});

test('text wrapping covers the last letter, repeats with a gap, and rejects an oversized export',async()=>{
 const positions=[],ctx={measureText:()=>({width:200}),fillRect(){},fillText:(msg,x,y)=>positions.push([msg,x,y])};
 const layout=measureTicker(ctx,'  Äß  ');assert.deepEqual(layout,{text:'Äß',period:224});
 drawTicker(ctx,layout,0,40);assert.deepEqual(positions.splice(0),[['Äß',4,32]]);
 drawTicker(ctx,layout,5,40);assert.deepEqual(positions.splice(0),[['Äß',-196,32],['Äß',28,32]]);
 drawTicker(ctx,layout,224/40,40);assert.deepEqual(positions.splice(0),[['Äß',4,32]]);
 const h=mount({unavailable:true});try{
  h.vm.selectGenerated('ticker');h.vm.tickerText='W'.repeat(120);h.vm.tickerSpeed=24;h.vm.fps=15;await flush();
  assert.equal(h.vm.exportValidation.error,'EXPORT_TOO_LARGE');assert.equal(h.vm.canExport,false);
  h.vm.fps=2;await flush();assert.equal(h.vm.canExport,true);
  h.vm.toggleTickerPreview();h.doc.hidden=true;h.vm.visibilityChanged();assert.equal(h.timers.size,0);assert.deepEqual(h.calls,[]);
 }finally{h.app.unmount();}
});
test('other connections and unsupported/insecure browsers block both button and method',async()=>{
 for(const options of [{blocked:true},{unavailable:true},{insecure:true}]){const h=mount(options);try{assert(h.button('verbinden').props.disabled);await h.vm.connectStream();assert.deepEqual(h.calls,[]);if(options.blocked)assert.match(text(h.root),/Dateiverbindung oben auf der Seite/);}finally{h.app.unmount();}}
});
test('handshake rejection explains receiver mode in both languages without sending image data',async()=>{
 for(const locale of ['de_DE','en']){const h=mount({locale,connect:async()=>{throw Object.assign(Error('timeout'),{code:'STREAM_HANDSHAKE_TIMEOUT'});}});try{await h.vm.connectStream();await flush();assert.equal(h.vm.phase,'error');assert.deepEqual(h.calls,['connect']);assert.match(text(h.root),locale==='de_DE'?/keine Bilddaten gesendet/:/No image data was sent/);assert.equal(h.active.at(-1),false);}finally{h.app.unmount();}}
});
test('explicit demo start uses sequential sends and stop ignores a late receipt',async()=>{
 const gate=defer(),h=mount({send:()=>gate.promise});try{await h.vm.connectStream();await h.vm.startSending();await flush();assert.equal(h.calls.filter(v=>typeof v==='object').length,1);assert.equal(h.vm.sending,true);await h.advance(3000);assert.equal(h.calls.filter(v=>typeof v==='object').length,1);h.vm.stopStream('stopped');gate.resolve({});await flush();assert.equal(h.vm.sentFrames,0);assert.equal(h.vm.sending,false);assert.equal(h.active.at(-1),false);assert.equal(h.timers.size,0);assert.match(text(h.root),/Übertragung gestoppt und Verbindung getrennt/);}finally{h.app.unmount();}
});
test('selecting an image stays local, sends only on request, and allows an adjusted second still frame',async()=>{
 const h=mount();try{const selected=h.vm.chooseFile({target:{files:[{name:'own.png',type:'image/png'}]}});h.sources[0].emit('load');await selected;assert.equal(h.vm.sourceKind,'image');assert.equal(h.vm.ready,true);assert.equal(h.calls.filter(v=>typeof v==='object').length,0);await h.vm.connectStream();await h.vm.startSending();await flush();const first=h.calls.find(v=>typeof v==='object');assert.equal(first.frame.length,1024);assert.equal(first.opts.forceKeyframe,true);assert.equal(h.vm.sentFrames,1);assert.equal(h.vm.sending,false);assert.match(text(h.root),/Bild übertragen/);h.vm.invert=true;h.vm.refreshPreview();await h.vm.startSending();const frames=h.calls.filter(v=>typeof v==='object');for(let i=0;i<1024;i++)assert.equal(frames[0].frame[i]^frames[1].frame[i],255);assert.deepEqual(h.revoked,[]);}finally{h.app.unmount();}assert.equal(h.revoked.length,1);
});
test('new selection cancels old decoding and late completion cannot replace the selected preview',async()=>{
 const h=mount();try{const first=h.vm.chooseFile({target:{files:[{name:'first.png',type:'image/png'}]}});const old=h.sources[0];const second=h.vm.chooseFile({target:{files:[{name:'second.jpg',type:'image/jpeg'}]}});h.sources[1].emit('load');await second;old.emit('load');await first;assert.equal(h.vm.fileName,'second.jpg');assert.equal(h.vm._source,h.sources[1]);assert.equal(h.vm.error,'');assert.equal(h.vm.loading,false);assert.equal(h.revoked.length,1);h.vm.selectDemo();assert.equal(h.revoked.length,2);assert.equal(h.vm.sourceKind,'demo');}finally{h.app.unmount();}
});
test('hiding the document or acquiring another workspace connection ends streaming without automatic resume',async()=>{
 for(const reason of ['hidden','blocked']){const h=mount();try{await h.vm.connectStream();await h.vm.startSending();await flush();if(reason==='hidden'){h.doc.hidden=true;h.vm.visibilityChanged();}else{h.props.blocked=true;await flush();}assert.equal(h.vm.sending,false);assert.equal(h.active.at(-1),false);assert.equal(h.timers.size,0);const count=h.calls.length;h.doc.hidden=false;h.vm.visibilityChanged();h.props.blocked=false;await h.advance(5000);assert.equal(h.calls.length,count);}finally{h.app.unmount();}}
});
test('disconnect and failed send stop the pump and retain the actionable transport error',async()=>{
 for(const reason of ['disconnect','error']){const h=mount({send:reason==='error'?async()=>{throw Object.assign(Error('ack'),{code:'STREAM_ACK_TIMEOUT'});}:undefined});try{await h.vm.connectStream();await h.vm.startSending();await flush();if(reason==='disconnect')h.state('error','STREAM_DISCONNECTED');await flush();assert.equal(h.vm.sending,false);assert.equal(h.active.at(-1),false);assert.equal(h.vm.error,reason==='error'?'STREAM_ACK_TIMEOUT':'STREAM_DISCONNECTED');const sent=h.calls.filter(v=>typeof v==='object').length;await h.advance(3000);assert.equal(h.calls.filter(v=>typeof v==='object').length,sent);}finally{h.app.unmount();}}
});
test('video can preview without BLE and native pause stops a running transfer',async()=>{
 const gate=defer(),h=mount({send:()=>gate.promise});try{const selected=h.vm.chooseFile({target:{files:[{name:'own.mp4',type:'video/mp4'}]}});const video=h.video();video.emit('loadeddata');await selected;await video.play();await h.advance(16);assert.equal(h.calls.filter(v=>typeof v==='object').length,0);video.pause();await h.vm.connectStream();await h.vm.startSending();await flush();assert.equal(h.vm.sending,true);assert.equal(h.calls.filter(v=>typeof v==='object').length,1);video.pause();assert.equal(h.vm.sending,false);assert.equal(h.active.at(-1),false);assert.equal(h.vm.notice,'paused');gate.resolve({});await flush();assert.equal(h.vm.sentFrames,0);}finally{h.app.unmount();}
});
test('unmount cancels media load, pending connection, and timers, and ignores late callbacks',async()=>{
 const gate=defer(),h=mount({connect:()=>gate.promise});const p=h.vm.connectStream();h.app.unmount();const events=h.active.length;gate.resolve();await p;assert.equal(h.active.length,events);assert.equal(h.active.at(-1),false);assert.equal(h.sending.at(-1),false);assert.equal(h.timers.size,0);
 const m=mount();const selected=m.vm.chooseFile({target:{files:[{name:'pending.png',type:'image/png'}]}});m.app.unmount();await selected;assert.equal(m.revoked.length,1);assert.equal(m.timers.size,0);
});


test('a connected idle receiver survives image and demo selection without sending until explicitly requested',async()=>{
 const h=mount();try{
  await h.vm.connectStream();assert.equal(h.vm.connected,true);
  const selection=h.vm.chooseFile({target:{files:[{name:'after-connect.png',type:'image/png'}]}});
  assert.equal(h.vm.connected,true);assert.equal(h.vm.loading,true);assert.deepEqual(h.calls,['connect']);
  h.sources[0].emit('load');await selection;await flush();
  assert.equal(h.vm.connected,true);assert.equal(h.vm.canSend,true);assert.deepEqual(h.calls,['connect']);assert.equal(h.active.includes(false),false);
  await h.vm.startSending();await flush();
  assert.equal(h.calls.filter(v=>typeof v==='object').length,1);assert.equal(h.vm.connected,true);assert.equal(h.vm.sending,false);
  h.vm.selectDemo();await flush();
  assert.equal(h.vm.connected,true);assert.equal(h.vm.sourceKind,'demo');assert.equal(h.revoked.length,1);
  assert.equal(h.calls.filter(v=>v==='disconnect').length,0);assert.equal(h.calls.filter(v=>typeof v==='object').length,1);
  await h.vm.startSending();await flush();assert.equal(h.calls.filter(v=>typeof v==='object').length,2);
  h.vm.stopStream('stopped');assert.equal(h.vm.connected,false);assert.equal(h.calls.filter(v=>v==='disconnect').length,1);
 }finally{h.app.unmount();}
});

test('media selection cannot interrupt a pending connection or an unacknowledged send',async()=>{
 for(const stage of ['connecting','sending']){
  const gate=defer(),h=mount(stage==='connecting'?{connect:()=>gate.promise}:{send:()=>gate.promise});
  try{
   const connect=h.vm.connectStream();
   if(stage==='sending'){await connect;await h.vm.startSending();}
   const before=h.calls.length;
   await h.vm.chooseFile({target:{files:[{name:'blocked.png',type:'image/png'}]}});h.vm.selectDemo();
   assert.equal(h.sources.length,0);assert.equal(h.vm._selection,0);assert.equal(h.calls.length,before);assert.equal(h.vm.phase,stage==='connecting'?'connecting':'connected');
   gate.resolve({});await connect;await flush();
  }finally{h.app.unmount();}
 }
});

test('workspace return restores one local file and image options without connecting or sending',async()=>{
 const h=mount(),file={name:'remember.mp4',type:'video/mp4',size:4096};
 const selected=h.vm.chooseFile({target:{files:[file]}});h.video().emit('loadeddata');await selected;
 Object.assign(h.vm,{fit:'crop',rotation:90,dither:'bayer',threshold:177,invert:true,fps:10,loopVideo:false,clipStart:2,clipEnd:4});await flush();
 await h.vm.connectStream();h.app.unmount();assert.equal(h.session.get().file,file);assert(h.calls.includes('disconnect'));assert(h.revoked.length>0);
 const returned=mount({session:h.session,storage:h.storage});
 try{
  assert.equal(returned.vm.loading,true);returned.video().emit('loadeddata');await flush();
  assert.equal(returned.vm.fileName,'remember.mp4');assert.equal(returned.vm.sourceKind,'video');assert.equal(returned.vm.ready,true);
  assert.equal(returned.vm.rotation,90);assert.equal(returned.vm.dither,'bayer');assert.equal(returned.vm.threshold,177);assert.equal(returned.vm.fps,10);assert.equal(returned.vm.loopVideo,false);
  assert.equal(returned.vm.clipStart,2);assert.equal(returned.vm.clipEnd,4);assert.equal(returned.vm.phase,'idle');assert.deepEqual(returned.calls,[]);assert.equal(returned.vm.sessionNotice,'restored');
 }finally{returned.app.unmount();h.session.clear();}
});

test('a large file works without session retention, and reset clears only this sender state',async()=>{
 const h=mount();try{
  const selected=h.vm.chooseFile({target:{files:[{name:'large.png',type:'image/png',size:STREAM_SESSION_MAX_FILE_BYTES+1}]}});h.sources[0].emit('load');await selected;
  assert.equal(h.vm.ready,true);assert.equal(h.vm.sessionNotice,'tooLarge');assert.equal(h.session.get(),null);
  Object.assign(h.vm,{rotation:270,dither:'bayer',threshold:44,fps:15,invert:true});await flush();
  h.storage.setItem('other','keep');h.vm.resetSender();await flush();
  assert.equal(h.vm.sourceKind,'demo');assert.equal(h.vm.fileName,'');assert.equal(h.vm.rotation,0);assert.equal(h.vm.dither,'threshold');assert.equal(h.vm.threshold,128);assert.equal(h.vm.fps,5);assert.equal(h.vm.invert,false);assert.equal(h.storage.getItem('other'),'keep');
 }finally{h.app.unmount();}
});

test('a rapid workspace change during restoration keeps the File without extending its lifetime',async()=>{
 const h=mount(),file={name:'keep.png',type:'image/png',size:1024};
 const selected=h.vm.chooseFile({target:{files:[file]}});h.sources[0].emit('load');await selected;h.app.unmount();
 await h.advance(29*60*1000);
 const loading=mount({session:h.session,storage:h.storage});assert.equal(loading.vm.loading,true);loading.app.unmount();await flush();
 assert.equal(h.session.get().file,file);
 const returned=mount({session:h.session,storage:h.storage});
 try{
  returned.sources[0].emit('load');await flush();assert.equal(returned.vm.ready,true);assert.equal(returned.vm.sessionNotice,'restored');assert.deepEqual(returned.calls,[]);
  await h.advance(60*1000);assert.equal(h.session.get(),null);assert.equal(returned.vm.ready,true);
 }finally{returned.app.unmount();}
});

test('failed selection clears the picker so the same file can be retried, and a drop never sends',async()=>{
 const h=mount();try{
  const file={name:'same.png',type:'image/png'},target={files:[file],value:'same.png'};
  const attempt=h.vm.chooseFile({target});assert.equal(target.value,'');h.sources[0].emit('error');await attempt;assert.equal(h.vm.error,'MEDIA_DECODE');
  const retry=h.vm.chooseFile({target});h.sources[1].emit('load');await retry;assert.equal(h.vm.ready,true);assert.equal(h.vm.error,'');
  h.vm.dropFile({dataTransfer:{files:[file,file]}});assert.equal(h.vm.error,'MEDIA_MULTIPLE');assert.equal(h.sources.length,2);
  h.vm.dropFile({dataTransfer:{files:[{name:'drop.png',type:'application/octet-stream'}]}});h.sources[2].emit('load');await flush();assert.equal(h.vm.fileName,'drop.png');assert.equal(h.vm.ready,true);assert.deepEqual(h.calls,[]);
 }finally{h.app.unmount();}
});

test('demo and still-image exports create only a local complete BIN download with progress',async()=>{
 const h=mount();try{
  h.vm.clipEnd=0.6;await flush();await h.vm.startExport();await flush();
  assert.equal(h.vm.exporting,false);assert.equal(h.vm.exportNotice,'ready');assert.equal(h.vm.exportCompleted,3);assert.equal(h.vm.exportBytes,3088);assert.deepEqual(h.calls,[]);
  const url=h.vm.exportUrl,bytes=new Uint8Array(await h.blobs.get(url).arrayBuffer());assert.deepEqual([...bytes.slice(0,6)],[0x56,0x58,0x49,0x50,3,0]);assert(h.exporting.includes(true));assert.equal(h.exporting.at(-1),false);
  h.vm.threshold=150;await flush();assert.equal(h.vm.exportUrl,'');assert(h.revoked.includes(url));
  const selected=h.vm.chooseFile({target:{files:[{name:'photo.png',type:'image/png'}]}});h.sources[0].emit('load');await selected;await flush();await h.vm.startExport();assert.equal(h.vm.exportBytes,1040);assert.equal(h.vm.exportFileName,'photo_lcd.bin');
 }finally{h.app.unmount();}assert.equal(h.blobs.size,0);
});

test('video export seeks through the chosen clip without playback or a Bluetooth write',async()=>{
 const h=mount();try{
  const selected=h.vm.chooseFile({target:{files:[{name:'clip.mp4',type:'video/mp4'}]}});h.video().emit('loadeddata');await selected;
  h.vm.clipStart=1;h.vm.clipEnd=1.6;await flush();await h.vm.startExport();
  assert.equal(h.vm.exportError,'');assert.equal(h.vm.exportCompleted,3);assert.equal(h.vm.exportBytes,3088);assert.equal(h.video().paused,true);assert.equal(h.video().currentTime,1.4);assert.deepEqual(h.calls,[]);
 }finally{h.app.unmount();}
});

test('hidden page, unmount and explicit cancellation suppress a late export result and never restart',async()=>{
 for(const reason of ['hidden','unmount','cancel']){
  const gate=defer();let signal,starts=0;
  const h=mount({exporter:(_plan,options)=>{starts++;signal=options.signal;return gate.promise;}});
  const vm=h.vm,pending=vm.startExport();assert.equal(vm.exporting,true);assert.equal(vm.canSend,false);
  await vm.connectStream();assert.deepEqual(h.calls,[]);
  if(reason==='hidden'){h.doc.hidden=true;vm.visibilityChanged();}else if(reason==='unmount')h.app.unmount();else vm.cancelExport('cancelled');
  assert.equal(signal.aborted,true);gate.resolve(new Uint8Array(51216));await pending;await flush();assert.equal(h.blobs.size,0);assert.equal(h.exporting.at(-1),false);
  if(reason!=='unmount'){h.doc.hidden=false;vm.visibilityChanged();assert.equal(starts,1);assert.equal(vm.exporting,false);assert.equal(vm.exportUrl,'');assert.equal(vm.exportNotice,reason==='hidden'?'hidden':'cancelled');h.app.unmount();}
 }
});

test('export size errors block work, while a failed export offers no incomplete file',async()=>{
 const h=mount();try{h.vm.clipEnd=10000;await flush();assert.equal(h.vm.canExport,false);await h.vm.startExport();assert.equal(h.vm.exporting,false);assert.equal(h.vm.exportValidation.error,'EXPORT_TOO_LARGE');assert.equal(h.blobs.size,0);}finally{h.app.unmount();}
 const failed=mount({exporter:async()=>{throw Object.assign(Error('frame'),{code:'EXPORT_FRAME'});}});try{await failed.vm.startExport();assert.equal(failed.vm.exportError,'EXPORT_FRAME');assert.equal(failed.vm.exportUrl,'');assert.equal(failed.vm.exporting,false);}finally{failed.app.unmount();}
});
