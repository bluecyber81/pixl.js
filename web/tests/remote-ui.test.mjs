import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';
import * as Vue from 'vue';
import {remoteText} from '../src/lib/remote-text.js';
const file=process.env.REMOTE_UI_COMPONENT_URL?new URL(process.env.REMOTE_UI_COMPONENT_URL):new URL('../src/components/RemoteControl.vue',import.meta.url);
const {descriptor}=parse(fs.readFileSync(file,'utf8'),{filename:file.pathname});
const script=compileScript(descriptor,{id:'remote-ui'}).content.replace(/^import .*$/gm,'').replace('export default','const Component=');
const template=compileTemplate({source:descriptor.template.content,id:'remote-ui',filename:file.pathname,compilerOptions:{hoistStatic:false}}).code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,(_,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=Vue;`).replace('export function render','function render');
const factory=new Function('Vue','createRemoteClient','remoteAvailability','remoteText','PixLinkRemote',script+'\n'+template+'\nComponent.render=render;return Component;');
const node=(type,text='')=>({type,text,props:{},children:[],parent:null});
const renderer=Vue.createRenderer({createElement:t=>node(t),createText:t=>node('#text',t),createComment:t=>node('#comment',t),setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,o,v)=>n.props[k]=v,insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=p.children.indexOf(a);i<0?p.children.push(n):p.children.splice(i,0,n);},remove(n){n.parent?.children.splice(n.parent.children.indexOf(n),1);n.parent=null;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null});
const text=n=>n.text+n.children.map(text).join(''),flat=n=>[n,...n.children.flatMap(flat)];
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};};
function mount(options={}){
 const calls=[],active=[],root=node('root');let notify;const emit=(phase,error='')=>notify({phase,error,capabilities:options.caps??15});
 const client={connect:async()=>{calls.push('connect');emit('connecting');if(options.connect)await options.connect(calls.filter(value=>value==='connect').length);emit('ready');},command:async name=>{calls.push(name);emit('command');try{if(options.command)await options.command(name);return {opcode:name==='files'&&options.sameLink?4:undefined,status:name==='files'?8:0,state:name==='files'?2:1};}finally{emit('ready');}},releaseFileConnection:accept=>{calls.push('handoff');try{assert.equal(accept({fixture:true}),true);}finally{emit('disconnected');}return true;},disconnect:async()=>{calls.push('disconnect');emit('disconnected');}};
 const Component=factory(Vue,({onState})=>{notify=onState;return client;},()=>options.unavailable||'',remoteText,{});
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
 const h=mount({command:async()=>{throw Object.assign(Error('timeout'),{code:'REMOTE_TIMEOUT'});}});try{await h.vm.connectRemote();await h.vm.press('center');await Vue.nextTick();assert.match(text(h.root),/kann bereits angekommen sein/);assert.doesNotMatch(text(h.root),/Tastendruck „Mitte“ bestätigt/);assert.deepEqual(h.calls,['connect','center']);}finally{h.app.unmount();}
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
  assert.match(text(help()),/kein Gerätebild/);assert.match(text(help()),/Nach Ausschalten oder Neustart ist sie wieder aus/);
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
