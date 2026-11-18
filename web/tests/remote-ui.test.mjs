import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {createAutoDisplayPhoto} from '../src/lib/auto-display-photo.js';
import {remoteText} from '../src/lib/remote-text.js';
import {REMOTE_LCD_CAPABILITY} from '../src/lib/remote-control.js';
const file=process.env.REMOTE_UI_COMPONENT_URL?new URL(process.env.REMOTE_UI_COMPONENT_URL):new URL('../src/components/RemoteControl.vue',import.meta.url);
function componentFactory(file, bindings) {
  const {descriptor}=parse(fs.readFileSync(file,'utf8'),{filename:file.pathname});
  const script=compileScript(descriptor,{id:'remote-ui'}).content.replace(/^import .*$/gm,'').replace('export default','const Component=');
  const template=compileTemplate({source:descriptor.template.content,id:'remote-ui',filename:file.pathname,compilerOptions:{hoistStatic:false}}).code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,(_,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=Vue;`).replace('export function render','function render');
  return new Function('Vue', ...bindings, script+'\n'+template+'\nComponent.render=render;return Component;');
}
const factory=componentFactory(file,['createRemoteClient','remoteAvailability','remoteText','PixLinkRemote','DisplayPhoto','REMOTE_LCD_CAPABILITY','createAutoDisplayPhoto']);
const photoFactory=componentFactory(new URL('../src/components/DisplayPhoto.vue',import.meta.url),
  ['renderDisplayPhoto','supportsDisplayPhoto','firmwareBoard','ResizeObserver','document']);
const node=(type,text='')=>({type,text,props:{},children:[],parent:null});
const renderer=Vue.createRenderer({createElement:t=>node(t),createText:t=>node('#text',t),createComment:t=>node('#comment',t),setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,o,v)=>n.props[k]=v,insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=p.children.indexOf(a);i<0?p.children.push(n):p.children.splice(i,0,n);},remove(n){n.parent?.children.splice(n.parent.children.indexOf(n),1);n.parent=null;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null});
const text=n=>n.text+n.children.map(text).join(''),flat=n=>[n,...n.children.flatMap(flat)];
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};};
function mount(options={}){
 const calls=[],active=[],root=node('root');let notify;const emit=(phase,error='')=>notify({phase,error,capabilities:options.caps??15});
 const client={captureDisplay:async()=>{calls.push('photo');emit('command');try{return options.photo?await options.photo():new Uint8Array(1024);}finally{emit('ready');}},connect:async()=>{calls.push('connect');emit('connecting');if(options.connect)await options.connect(calls.filter(value=>value==='connect').length);emit('ready');},command:async name=>{calls.push(name);emit('command');try{if(options.command)await options.command(name);return {opcode:name==='files'&&options.sameLink?4:undefined,status:name==='files'?8:0,state:name==='files'?2:1};}finally{emit('ready');}},releaseFileConnection:accept=>{calls.push('handoff');try{assert.equal(accept({fixture:true}),true);}finally{emit('disconnected');}return true;},disconnect:async()=>{calls.push('disconnect');emit('disconnected');}};
 const Component=factory(Vue,({onState})=>{notify=onState;return client;},()=>options.unavailable||'',remoteText,{render:()=>Vue.h('div')}, options.photoComponent || {props:['readPhoto'],methods:{capture(){return this.readPhoto();}},render:()=>Vue.h('div')},REMOTE_LCD_CAPABILITY,config=>createAutoDisplayPhoto({...config,...options.clock}));
 const props=Vue.reactive({blocked:!!options.blocked,locale:options.locale||'de_DE',onActive:v=>active.push(v),handoffFileConnection:options.handoff});
 let vm;const app=renderer.createApp({render:()=>Vue.h(Component,{...props,ref:v=>vm=v})});app.mount(root);
 return{root,app,props,calls,active,emit,get vm(){return vm;},button:label=>flat(root).find(n=>n.type==='button'&&text(n).includes(label))};
}
test('remote component starts inert, explains optional awake-only mode and keeps physical controls active',()=>{
 const h=mount();try{assert.deepEqual(h.calls,[]);assert.match(text(h.root),/Nach Ausschalten oder Neustart ist sie wieder aus/);assert.match(text(h.root),/Bluetooth-Reichweite/);assert.match(text(h.root),/echten Tasten bleiben/);assert.match(text(h.root),/nicht aufwecken/);assert(h.button('Mitte').props.disabled);assert(h.button('Dateiübertragung').props.disabled);}finally{h.app.unmount();}
});
test('file connection or unsupported browser blocks both UI and connect method',async()=>{
 for(const options of [{blocked:true},{unavailable:'REMOTE_UNAVAILABLE'}]){const h=mount(options);try{assert(h.button('verbinden').props.disabled);await h.vm.connectRemote();assert.deepEqual(h.calls,[]);}finally{h.app.unmount();}}
});
test('manual connection alone enables buttons and emits an independent active lock',async()=>{
 const h=mount();try{await h.vm.connectRemote();await Vue.nextTick();assert.deepEqual(h.calls,['connect']);assert.deepEqual(h.active,[true,true]);assert.equal(h.button('Mitte').props.disabled,false);assert.match(text(h.root),/Fernbedienung bereit/);await h.vm.disconnectRemote();await Vue.nextTick();assert.equal(h.active.at(-1),false);assert(h.button('Mitte').props.disabled);}finally{h.app.unmount();}
});
test('manual STATUS shows a local time only on acknowledgement, and forgets it after disconnect', async () => {
 const gate=defer(), h=mount({command:() => gate.promise});
 try {
  assert.equal(h.button('Verbindung prüfen'),undefined);
  await h.vm.connectRemote(); await Vue.nextTick();
  assert.equal(h.vm.checkedAt, null);
  const request=h.button('Verbindung prüfen').props.onClick(); await Vue.nextTick();
  assert.equal(h.vm.checkedAt, null);
  assert.equal(h.button('Verbindung prüfen').props['aria-disabled'], true);
  await h.vm.press('status'); await h.vm.press('center');
  gate.resolve(); await request; await Vue.nextTick();
  assert.deepEqual(h.calls,['connect','status']);
  assert.match(text(h.root), /Die Fernbedienung hat um \d\d:\d\d:\d\d geantwortet/);
  h.props.locale='en_US'; await Vue.nextTick();
  assert.match(text(h.root), /The remote responded at \d{1,2}:\d\d:\d\d/);
  h.emit('disconnected','REMOTE_DISCONNECTED');await Vue.nextTick();
  assert.equal(h.vm.checkedAt, null); assert.doesNotMatch(text(h.root), /responded at/);
  await h.vm.press('status'); assert.deepEqual(h.calls,['connect','status']);
 }finally{h.app.unmount();}
});
test('an unanswered status check reports a timed out connection check and no key uncertainty', async () => {
 const h=mount({command:()=>{throw Object.assign(Error('timeout'),{code:'REMOTE_TIMEOUT'});}});
 try {
  await h.vm.connectRemote(); await h.vm.press('status'); await Vue.nextTick();
  assert.equal(h.vm.checkedAt, null);
  assert.match(text(h.root), /nicht rechtzeitig auf die Verbindungsprüfung/);
  h.props.locale='en_US'; await Vue.nextTick();
  assert.match(text(h.root), /did not respond to the connection check in time/);
  assert.deepEqual(h.calls,['connect','status']);
 }finally{h.app.unmount();}
});
test('one user tap sends one command and pending acknowledgement disables all new input',async()=>{
 const gate=defer(),h=mount({command:()=>gate.promise});try{await h.vm.connectRemote();const p=h.vm.press('center');await Vue.nextTick();assert.equal(h.button('Mitte').props['aria-disabled'],true);await h.vm.press('left');assert.deepEqual(h.calls,['connect','center']);assert.match(text(h.root),/Warte auf Gerätebestätigung/);gate.resolve();await p;await Vue.nextTick();assert.match(text(h.root),/Tastendruck „Mitte“ bestätigt/);}finally{h.app.unmount();}
});
test('file handoff reports requested, disconnects remote, and requires a separate file-manager handshake',async()=>{
 const h=mount();try{await h.vm.connectRemote();await h.vm.press('files');await Vue.nextTick();assert.deepEqual(h.calls,['connect','files','disconnect']);assert.match(text(h.root),/Wechsel wurde angefordert/);assert.match(text(h.root),/erst nach dem Funkabbau/);assert.match(text(h.root),/Versionsabfrage bestätigt/);assert(h.button('Mitte').props.disabled);assert.equal(h.active.at(-1),false);}finally{h.app.unmount();}
});
test('timeout has explicit uncertainty and never reports success or retries',async()=>{
 const h=mount({command:async()=>{throw Object.assign(Error('timeout'),{code:'REMOTE_TIMEOUT',commandUnconfirmed:true});}});try{await h.vm.connectRemote();await h.vm.press('center');await Vue.nextTick();assert.match(text(h.root),/kann bereits angekommen sein/);assert.doesNotMatch(text(h.root),/Tastendruck „Mitte“ bestätigt/);assert.deepEqual(h.calls,['connect','center']);}finally{h.app.unmount();}
});
test('dismissing the picker explains how to select Pixl.Remote without implying a sent command',async()=>{
 for(const [locale,selection,path] of [['de_DE',/Kein Gerät ausgewählt/,/Einstellungen → Fernsteuern → bis Aus/],['en',/No device selected/,/Settings → Remote → until off/]]){
  const h=mount({locale,connect:()=>{throw Object.assign(Error('picker'),{code:'REMOTE_NO_SELECTION'});}});
  try{
   await h.vm.connectRemote();h.emit('disconnected','REMOTE_NO_SELECTION');await Vue.nextTick();
   assert.match(text(h.root),selection);assert.match(text(h.root),path);assert.match(text(h.root),/Pixl\.Remote/);
   assert.doesNotMatch(text(h.root),/angekommen|may already have arrived/);
   assert.equal(flat(h.root).some(n=>n.props.role==='alert'),false);assert.deepEqual(h.calls,['connect']);
  }finally{h.app.unmount();}
 }
});
test('a wrong device selection shows an actionable message in German and English',async()=>{
 for(const [locale,hint] of [['de_DE',/andere Geräte/],['en',/other Bluetooth serial devices/]]){
  const h=mount({locale,connect:async()=>{throw Object.assign(Error('name mismatch'),{code:'REMOTE_WRONG_DEVICE'});}});
  try{await h.vm.connectRemote();await Vue.nextTick();assert.match(text(h.root),hint);assert.match(text(h.root),/Pixl\.Remote/);assert.deepEqual(h.calls,['connect']);}
  finally{h.app.unmount();}
 }
});
test('a file-transfer lock arriving during remote use disconnects rather than sharing GATT',async()=>{
 const h=mount();try{await h.vm.connectRemote();h.props.blocked=true;await Vue.nextTick();assert.deepEqual(h.calls,['connect','disconnect']);assert(h.button('verbinden').props.disabled);}finally{h.app.unmount();}
});
test('optional long-back command stays disabled without the advertised capability',async()=>{
 const h=mount({caps:13});try{await h.vm.connectRemote();await Vue.nextTick();assert(h.button('Zurück').props.disabled);assert.equal(h.button('Mitte').props.disabled,false);}finally{h.app.unmount();}
});
test('unmount disconnects once and ignores a late connection completion',async()=>{
 const gate=defer(),h=mount({connect:()=>gate.promise});const p=h.vm.connectRemote();h.app.unmount();const count=h.active.length;gate.resolve();await p;assert.deepEqual(h.calls,['connect','disconnect']);assert.equal(h.active.length,count);assert.equal(h.active.at(-1),false);
});
test('English remote instructions keep the same awake-only and transition limits',async()=>{
 const h=mount({locale:'en_US'});try{assert.match(text(h.root),/off again after power-off or restart/);assert.match(text(h.root),/cannot wake/);await h.vm.connectRemote();await h.vm.press('files');await Vue.nextTick();assert.match(text(h.root),/switch was requested/);assert.match(text(h.root),/handshake confirms/);}finally{h.app.unmount();}
});
test('the actual main file-connect method refuses a concurrent remote session',()=>{
 const source=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8');
 const start=source.indexOf('    on_btn_ble_connect() {'),end=source.indexOf('    async on_ble_connected()',start);assert(start>0&&end>start);
 const method=new Function('pixl','return ({'+source.slice(start,end)+'}).on_btn_ble_connect;')({connect(){throw Error('must not connect files');},disconnect(){throw Error('must not disconnect files');}});
 method.call({remoteActive:true,connected:false,connecting:false});
 assert.match(source,/:disabled="remoteActive \|\| disconnecting/);
 assert.match(source,/:blocked="connected \|\| connecting \|\| disconnecting \|\| busy"/);
});
test('holding a keyboard button does not synthesize native repeat clicks',()=>{
 const h=mount();try{
  let prevented=0;
  const keydown=(key,repeat,tagName)=>h.vm.preventRepeat({key,repeat,target:{tagName},preventDefault:()=>prevented++});
  keydown('Enter',true,'BUTTON');keydown(' ',true,'BUTTON');keydown('Enter',false,'BUTTON');
  keydown('Tab',true,'BUTTON');keydown('Enter',true,'INPUT');assert.equal(prevented,2);
 }finally{h.app.unmount();}
});

test('focused pad maps shortcuts to acknowledged taps with no repeats or queued keys',async()=>{
 const gate=defer(),h=mount({locale:'en_US',command:name=>name==='right'?gate.promise:undefined});
 try{
  const pad=flat(h.root).find(n=>n.props.class==='remote-pad');
  const key=(key,options={})=>{const e={key,target:pad,currentTarget:pad,preventDefault(){this.defaultPrevented=true;},...options};return [pad.props.onKeydown(e),e];};
  assert.equal(pad.props.tabindex,-1);assert(!key('ArrowRight')[1].defaultPrevented);
  await h.vm.connectRemote();await Vue.nextTick();assert.equal(pad.props.tabindex,0);
  const [right,e]=key('ArrowRight');assert(e.defaultPrevented);
  assert(key('ArrowLeft')[1].defaultPrevented);gate.resolve();await right;await Vue.nextTick();
  assert.match(text(h.root),/device acknowledged the Right press/);
  assert(key('ArrowRight',{repeat:true})[1].defaultPrevented);
  for(const options of [{ctrlKey:true},{altKey:true},{shiftKey:true},{metaKey:true},{isComposing:true},{defaultPrevented:true}]) key('ArrowLeft',options);
  assert(!key('Enter',{target:h.button('Left')})[1].defaultPrevented);
  assert(!key('Tab')[1].defaultPrevented);
  await key('Enter')[0];await key('Escape')[0];assert.deepEqual(h.calls,['connect','right','center','back']);
  assert.match(text(h.root),/device acknowledged Back/);
  h.emit('disconnected','REMOTE_DISCONNECTED');await Vue.nextTick();assert.equal(pad.props.tabindex,-1);assert.equal(h.vm.notice,'');
 }finally{h.app.unmount();}
});

test('pad offers Escape only for a remote with the long-back capability',async()=>{
 const h=mount({caps:13});
 try{await h.vm.connectRemote();await Vue.nextTick();
  const pad=flat(h.root).find(n=>n.props.class==='remote-pad');
  const e={key:'Escape',target:pad,currentTarget:pad,preventDefault(){throw Error('unsupported shortcut consumed');}};
  pad.props.onKeydown(e);assert.deepEqual(h.calls,['connect']);assert.doesNotMatch(text(h.root),/Esc geht zurück/);
  assert.doesNotMatch(pad.props['aria-keyshortcuts'],/Escape/);
 }finally{h.app.unmount();}
});

test('setup help retains all limits but closes on connect and leaves controls before the help',async()=>{
 const h=mount();try{
  assert.equal(h.vm.setupOpen,false);h.vm.setupOpen=true;await Vue.nextTick();
  const help=()=>flat(h.root).find(n=>n.type==='details');assert.equal(help().props.open,true);
  await h.vm.connectRemote();await Vue.nextTick();assert.equal(h.vm.setupOpen,false);assert.equal(help().props.open,false);
  const nodes=flat(h.root);assert(nodes.indexOf(h.button('Mitte'))<nodes.indexOf(help()));
  assert.match(text(help()),/Bluetooth-Reichweite/);assert.match(text(help()),/nicht aufwecken/);assert.match(text(help()),/echten Tasten bleiben/);
  assert.match(text(help()),/wie ein kurzer Tastendruck/);assert.match(text(help()),/Nach Ausschalten oder Neustart ist sie wieder aus/);
  assert(!nodes.some(n=>n.props.class==='remote-setup-short'));
 }finally{h.app.unmount();}
});

test('cancelled picker cannot paint a stale error over a later successful connection',async()=>{
 const oldPicker=defer(),h=mount({connect:attempt=>attempt===1?oldPicker.promise:Promise.resolve()});
 try{
  const old=h.vm.connectRemote();await h.vm.disconnectRemote();
  await h.vm.connectRemote();await Vue.nextTick();
  assert.equal(h.vm.phase,'ready');assert.equal(h.vm.error,'');
  oldPicker.reject(Object.assign(new Error('cancelled old picker'),{code:'REMOTE_CANCELLED'}));
  await old;await Vue.nextTick();
  assert.equal(h.vm.phase,'ready');assert.equal(h.vm.error,'');
  assert.equal(h.button('Mitte').props.disabled,false);
 }finally{h.app.unmount();}
});

test('a rejected old button command cannot replace feedback from the new connection',async()=>{
 const oldCommand=defer(),h=mount({command:()=>oldCommand.promise});
 try{
  await h.vm.connectRemote();const old=h.vm.press('center');
  await h.vm.disconnectRemote();await h.vm.connectRemote();await Vue.nextTick();
  oldCommand.reject(Object.assign(new Error('old command ended'),{code:'REMOTE_CANCELLED'}));
  await old;await Vue.nextTick();
  assert.equal(h.vm.phase,'ready');assert.equal(h.vm.error,'');assert.equal(h.vm.notice,'');
 }finally{h.app.unmount();}
});

test('an acknowledged old button cannot report success in a replacement session',async()=>{
 const oldCommand=defer(),h=mount({command:()=>oldCommand.promise});
 try{
  await h.vm.connectRemote();const old=h.vm.press('center');
  await h.vm.disconnectRemote();await h.vm.connectRemote();
  oldCommand.resolve();await old;await Vue.nextTick();
  assert.equal(h.vm.phase,'ready');assert.equal(h.vm.notice,'');
 }finally{h.app.unmount();}
});

test('an old file handoff cannot disconnect a replacement remote session',async()=>{
 const oldCommand=defer(),h=mount({command:()=>oldCommand.promise});
 try{
  await h.vm.connectRemote();const old=h.vm.press('files');
  await h.vm.disconnectRemote();await h.vm.connectRemote();
  oldCommand.resolve();await old;await Vue.nextTick();
  assert.deepEqual(h.calls,['connect','files','disconnect','connect']);
  assert.equal(h.vm.phase,'ready');assert.equal(h.vm.notice,'');
 }finally{h.app.unmount();}
});

test('a current connection failure is still visible with operation guards',async()=>{
 const h=mount({connect:async()=>{throw Object.assign(new Error('unsupported current device'),{code:'REMOTE_UNSUPPORTED'});}});
 try{await h.vm.connectRemote();await Vue.nextTick();assert.equal(h.vm.error,'REMOTE_UNSUPPORTED');}
 finally{h.app.unmount();}
});


test('same-link handoff opens file client without remote disconnect or a second picker',async()=>{
 let transferred=0;const h=mount({sameLink:true,caps:31,handoff:session=>{assert.equal(session.fixture,true);transferred++;return true;}})
 try{await h.vm.connectRemote();await h.vm.press('files');await Vue.nextTick();
  assert.equal(transferred,1);assert.deepEqual(h.calls,['connect','files','handoff']);assert.equal(h.active.at(-1),false);
  assert.match(text(h.root),/keine neue Geräteauswahl|eine neue Geräteauswahl ist nicht nötig/);assert.equal(h.vm.phase,'disconnected');
  h.props.blocked=true;await Vue.nextTick();assert(!h.calls.includes('disconnect'));
 }finally{h.app.unmount();}
});
test('same-link receiver failure does not claim successful transfer or retry',async()=>{
 const h=mount({sameLink:true,caps:31,handoff:()=>{throw Object.assign(Error('busy'),{code:'REMOTE_BUSY'})}})
 try{await h.vm.connectRemote();await h.vm.press('files');await Vue.nextTick();assert.equal(h.vm.error,'REMOTE_BUSY');assert.equal(h.vm.notice,'');assert.deepEqual(h.calls,['connect','files','handoff']);}
 finally{h.app.unmount();}
});

function photoClock() {
 let time=0,id=0;const timers=new Map();
 return {now:()=>time,schedule:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},unschedule:id=>timers.delete(id),
  async advance(ms){const end=time+ms;for(;;){const first=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;time=first[1].at;timers.delete(first[0]);first[1].fn();await Promise.resolve();await Vue.nextTick();}time=end;await Promise.resolve();await Vue.nextTick();}};
}
test('optional auto photo defaults off, never probes legacy firmware and only follows acknowledged navigation',async()=>{
 for(const caps of [15,63]){
  const clock=photoClock(),h=mount({caps,clock});
  try{await h.vm.connectRemote();await Vue.nextTick();assert.equal(h.vm.autoPhoto,false);
   await h.vm.press('left');await clock.advance(2000);assert(!h.calls.includes('photo'));
   h.vm.autoPhoto=true;await Vue.nextTick();await h.vm.press('status');await clock.advance(2000);assert(!h.calls.includes('photo'));
   await h.vm.press('right');await clock.advance(199);assert(!h.calls.includes('photo'));
   await clock.advance(1);assert.equal(h.calls.filter(x=>x==='photo').length,caps===63?1:0);
   if(caps===63)assert.match(text(h.root),/Displayfoto nach Tastendruck automatisch/);
  }finally{h.app.unmount();}
 }
});
test('auto photo waits for receipt, coalesces quick keys and never resends a rejected key',async()=>{
 const clock=photoClock(),gate=defer(),h=mount({caps:63,clock,command:name=>name==='right'?gate.promise:undefined});
 try{await h.vm.connectRemote();await Vue.nextTick();h.vm.autoPhoto=true;await Vue.nextTick();
  const pending=h.vm.press('right');await clock.advance(5000);assert(!h.calls.includes('photo'));
  gate.resolve();await pending;await clock.advance(100);await h.vm.press('left');await clock.advance(199);assert(!h.calls.includes('photo'));
  await clock.advance(1);assert.deepEqual(h.calls,['connect','right','left','photo']);
  await clock.advance(5000);assert.equal(h.calls.filter(x=>x==='photo').length,1);
 }finally{h.app.unmount();}
 const failed=mount({caps:63,clock,command:()=>Promise.reject({code:'REMOTE_BUSY'})});
 try{await failed.vm.connectRemote();await Vue.nextTick();failed.vm.autoPhoto=true;await Vue.nextTick();await failed.vm.press('center');await clock.advance(5000);assert.deepEqual(failed.calls,['connect','center']);}
 finally{failed.app.unmount();}
});
test('auto photo pending work is cancelled by off, disconnect, handoff, blocked, protocol change and unmount',async()=>{
 for(const action of ['off','disconnect','handoff','blocked','protocol','unmount']){
  const clock=photoClock(),h=mount({caps:63,clock,sameLink:true,handoff:()=>true});
  try{await h.vm.connectRemote();await Vue.nextTick();h.vm.autoPhoto=true;await Vue.nextTick();await h.vm.press('center');
   if(action==='off')h.vm.autoPhoto=false;
   if(action==='disconnect')await h.vm.disconnectRemote();
   if(action==='handoff')await h.vm.press('files');
   if(action==='blocked')h.props.blocked=true;
   if(action==='protocol')h.vm.protocol='pixlink';
   if(action==='unmount')h.app.unmount();
   await Vue.nextTick();await clock.advance(5000);assert(!h.calls.includes('photo'),action);
  }finally{if(action!=='unmount')h.app.unmount();}
 }
});
test('manual photo replaces queued auto photo, captures serialize and disconnect cancels active photo ownership',async()=>{
 const clock=photoClock(),gate=defer(),h=mount({caps:63,clock,photo:()=>gate.promise});
 try{await h.vm.connectRemote();await Vue.nextTick();h.vm.autoPhoto=true;await Vue.nextTick();await h.vm.press('back');
  const manual=h.vm.captureDisplay();await clock.advance(5000);await h.vm.press('left');
  assert.deepEqual(h.calls,['connect','back','photo']);
  await h.vm.disconnectRemote();gate.resolve(new Uint8Array(1024));await manual;await clock.advance(5000);
  assert.deepEqual(h.calls,['connect','back','photo','disconnect']);assert.equal(h.vm.autoPhoto,false);
 }finally{h.app.unmount();}
});

test('phone view keeps one photo above four adjacent controls, preserves errors and orientation across layout changes',async()=>{
  const frame = new Uint8Array(1024);
  let rejectPhoto=false;
  const Photo=photoFactory(Vue,(_pixels,_canvas,rotated)=>rotated?'data:rotated':'data:first',()=>true,()=>null,
    class {observe(){} disconnect(){}}, {createElement:()=>({})});
  const h=mount({caps:63,photoComponent:Photo, photo:()=>{if(rejectPhoto)throw {code:'REMOTE_BUSY'};return frame;}});
  try {
    h.vm.onScreenChange({matches:true});
    await h.vm.connectRemote(); await Vue.nextTick();
    const nodes=()=>flat(h.root);
    const pad=()=>nodes().find(n=>n.props.class==='remote-pad');
    const picture=()=>nodes().find(n=>n.type==='img');
    const time=()=>nodes().find(n=>n.type==='time');
    const options=()=>nodes().find(n=>n.type==='details'&&text(n).includes('Bildoptionen'));
    const mode=()=>h.button('Kompakte Ansicht');
    assert.equal(mode().props['aria-pressed'],true);
    assert.deepEqual(h.calls,['connect']);
    assert.deepEqual(pad().children.filter(n=>n.type==='button').map(n=>text(n.children.find(c=>c.type==='strong'))),['Links','Mitte','Rechts','Zurück']);
    await h.button('Displaybild aktualisieren').props.onClick(); await Vue.nextTick();
    assert.ok(nodes().indexOf(picture())<nodes().indexOf(pad()));
    assert.equal(pad().parent.children.filter(n=>n.type==='section'||n.type==='div').indexOf(pad()),
      pad().parent.children.filter(n=>n.type==='section'||n.type==='div').indexOf(picture().parent.parent.parent)+1);
    assert.equal(options().props.open,undefined);
    assert.ok(text(options()).includes('PNG speichern'));
    assert.ok(text(options()).includes('Bildgröße'));
    const timestamp=time().props.datetime;
    await h.button('Um 180° drehen').props.onClick(); await Vue.nextTick();
    assert.equal(picture().props.src,'data:rotated');
    rejectPhoto=true;
    await h.button('Displaybild aktualisieren').props.onClick(); await Vue.nextTick();
    assert.equal(time().props.datetime,timestamp);
    assert.match(text(h.root),/Letzte erfolgreiche Aufnahme|Das Gerät kann gerade kein Displayfoto liefern/);
    const oldPicture=picture();
    await mode().props.onClick(); await Vue.nextTick();
    assert.equal(mode().props['aria-pressed'],false);
    assert.equal(picture(),oldPicture);
    assert.ok(nodes().indexOf(pad())<nodes().indexOf(picture()));
    assert.equal(pad().children.filter(n=>n.type==='button').length,3);
    assert.equal(options(),undefined);
    assert.equal(time().props.datetime,timestamp);
    await mode().props.onClick(); await Vue.nextTick();
    assert.equal(picture().props.src,'data:rotated');
    assert.equal(options().props.open,undefined);
    await h.button('Zurück').props.onClick(); await Vue.nextTick();
    assert.equal(h.calls.at(-1),'back');
    await h.vm.disconnectRemote(); await Vue.nextTick();
    assert.equal(picture(),undefined);
  } finally {h.app.unmount();}
});

test('compact display follows the viewport until explicitly changed and respects old remote and PixLink capabilities', async()=>{
  const h=mount({caps:13,locale:'en'});
  try {
    await h.vm.connectRemote(); await Vue.nextTick();
    const mode=()=>h.button('Compact view');
    assert.equal(mode().props['aria-pressed'],false);
    h.vm.onScreenChange({matches:true}); await Vue.nextTick();
    assert.equal(mode().props['aria-pressed'],true);
    assert.equal(h.button('Back').props.disabled,true);
    assert.equal(h.button('Refresh screen'),undefined);
    await mode().props.onClick(); await Vue.nextTick();
    h.vm.onScreenChange({matches:false});h.vm.onScreenChange({matches:true});await Vue.nextTick();
    assert.equal(mode().props['aria-pressed'],false);
    await h.vm.disconnectRemote();await Vue.nextTick();
    h.vm.protocol='pixlink';await Vue.nextTick();
    assert.equal(mode(),undefined);
  } finally {h.app.unmount();}
});
