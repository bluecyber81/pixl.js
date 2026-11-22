import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {rgbaToFrame,frameToRgba} from '../src/lib/ble-image-stream.js';
import {createFramePump,demoRgba,drawMediaFrame,loadLocalMedia} from '../src/lib/stream-media.js';
const filename=new URL('../src/components/BleImageSender.vue',import.meta.url);
const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename:filename.pathname});
const script=compileScript(descriptor,{id:'stream-ui'}).content.replace(/^import .*$/gm,'').replace('export default','const Component=');
const template=compileTemplate({source:descriptor.template.content,id:'stream-ui',filename:filename.pathname,compilerOptions:{hoistStatic:false}}).code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,(_,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=Vue;`).replace('export function render','function render');
const factory=new Function('Vue','BleImageStream','rgbaToFrame','frameToRgba','createFramePump','demoRgba','drawMediaFrame','loadLocalMedia','document','globalThis','performance',script+'\n'+template+'\nComponent.render=render;return Component;');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Vue.nextTick();};
function element(type,text=''){
 const listeners=new Map();const n={type,tagName:type.toUpperCase(),text,props:{},children:[],parent:null,style:{},value:'',paused:true,ended:false,currentTime:0,naturalWidth:640,naturalHeight:480,videoWidth:640,videoHeight:480,
 addEventListener(e,fn){if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(fn);},removeEventListener(e,fn){listeners.get(e)?.delete(fn);},emit(e){for(const fn of [...(listeners.get(e)||[])])fn({target:this});const callback=this.props['on'+e[0].toUpperCase()+e.slice(1)];callback?.({target:this});},removeAttribute(name){this[name]='';},setAttribute(name,v){this[name]=v;},load(){},pause(){if(!this.paused){this.paused=true;this.emit('pause');}},async play(){this.paused=false;this.emit('play');},get options(){return this.children.filter(v=>v.type==='option');},
 getContext(){return this.context??=( {createImageData:()=>({data:new Uint8ClampedArray(32768)}),putImageData:img=>this.pixels=img.data.slice(),fillRect(){},drawImage(){},getImageData:()=>({data:demoRgba(2)})});}};
 return n;
}
const renderer=Vue.createRenderer({createElement:t=>element(t),createText:t=>element('#text',t),createComment:t=>element('#comment',t),setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,o,v)=>{n.props[k]=v;if(k==='value'||k==='type'||k==='multiple')n[k]=v;},insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=p.children.indexOf(a);i<0?p.children.push(n):p.children.splice(i,0,n);},remove(n){n.parent?.children.splice(n.parent.children.indexOf(n),1);n.parent=null;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null});
const flat=n=>[n,...n.children.flatMap(flat)],text=n=>n.text+n.children.map(text).join('');
function mount(options={}){
 const calls=[],active=[],sending=[],timers=new Map(),revoked=[],sources=[],doc=element('document'),root=element('root');let time=0,timerID=0,notify;
 doc.createElement=t=>element(t);doc.hidden=false;
 const clock={now:()=>time,schedule:(fn,delay)=>{const id=++timerID;timers.set(id,{fn,at:time+delay});return id;},cancel:id=>timers.delete(id)};
 const browser={navigator:options.unavailable?{}:{bluetooth:{requestDevice(){}}},isSecureContext:!options.insecure,addEventListener:doc.addEventListener.bind(doc),removeEventListener:doc.removeEventListener.bind(doc),requestAnimationFrame:fn=>clock.schedule(fn,16),cancelAnimationFrame:clock.cancel};
 const state=(phase,error='')=>notify({phase,error,deviceName:'Pixl.js'});
 class Client{constructor({onState}){notify=onState;}async connect(){calls.push('connect');state('connecting');try{await options.connect?.();state('connected');}catch(error){state('error',error.code);throw error;}}disconnect(){calls.push('disconnect');state('idle');}async sendFrame(frame,opts){calls.push({frame:frame.slice(),opts});return options.send?await options.send(frame):{packetBytes:21,payloadBytes:16,mode:'rle'};}}
 class Image{constructor(){const item=element('img');sources.push(item);return item;}}
 const loader=(file,{video})=>loadLocalMedia(file,{video,ImageClass:Image,urlApi:{createObjectURL:()=>`blob:test-${sources.length}`,revokeObjectURL:url=>revoked.push(url)},schedule:clock.schedule,cancel:clock.cancel});
 const Component=factory(Vue,Client,rgbaToFrame,frameToRgba,config=>createFramePump({...config,...clock}),demoRgba,drawMediaFrame,loader,doc,browser,{now:clock.now});
 const props=Vue.reactive({locale:options.locale||'de_DE',blocked:!!options.blocked,onActive:v=>active.push(v),onSending:v=>sending.push(v)});let vm;
 const app=renderer.createApp({render:()=>Vue.h(Component,{...props,ref:v=>vm=v})});app.mount(root);
 return {root,app,props,calls,active,sending,doc,timers,sources,revoked,state,get vm(){return vm;},button:label=>flat(root).find(n=>n.type==='button'&&text(n).includes(label)),video:()=>flat(root).find(n=>n.type==='video'),async advance(ms){time+=ms;for(const[id,t]of[...timers])if(t.at<=time){timers.delete(id);t.fn();}await flush();}};
}

test('sender opens with a bounded demo preview and no connection or transmission',()=>{
 const h=mount();try{assert.deepEqual(h.calls,[]);assert.equal(h.vm.sourceKind,'demo');assert.equal(h.vm.ready,true);assert.equal(flat(h.root).find(n=>n.type==='canvas').pixels.length,32768);assert(h.button('Demo senden').props.disabled);assert.match(text(h.root),/Dateiverbindung und Fernbedienung trennen/);assert.match(text(h.root),/OLED unterstützt diesen Bildempfang nicht/);}finally{h.app.unmount();}
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
