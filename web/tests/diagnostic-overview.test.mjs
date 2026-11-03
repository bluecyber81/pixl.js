import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as Vue from 'vue';
import {parse, compileScript} from '@vue/compiler-sfc';
import {diagnosticSnapshot} from './fixtures/diagnostic-overview-data.mjs';
import {normalizeDiagnosticSnapshot} from '../src/lib/diagnostic-snapshot.js';

// The actual SFC template and script run through Vue's real renderer/reactivity.
// No browser, Bluetooth or arbitrary network requests are made by this host.
async function component() {
  const filename=fileURLToPath(new URL('../src/components/DiagnosticOverview.vue',import.meta.url));
  const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
  let source=compileScript(descriptor,{id:filename,inlineTemplate:true}).content;
  const imports=[];
  source=source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g,(_,binding,spec)=>{imports.push({binding,spec});return '';});
  const modules=[];
  for(const {spec} of imports) modules.push(spec==='vue'?Vue:await import(pathToFileURL(path.resolve(path.dirname(filename),spec))));
  const bindings=imports.map(({binding},index)=>binding.startsWith('{')
    ?`const ${binding.replace(/\s+as\s+/g,':')}=modules[${index}];`:`const ${binding}=modules[${index}].default;`).join('\n');
  return new Function('modules',bindings+'\n'+source.replace('export default','return'))(modules);
}
function hostNode(type,text=''){return{type,text,props:{},children:[],parent:null};}
const renderer=Vue.createRenderer({
 createElement:tag=>hostNode(tag),createText:text=>hostNode('#text',text),createComment:text=>hostNode('#comment',text),
 setText:(node,text)=>node.text=text,setElementText:(node,text)=>{node.text=text;node.children=[];},
 patchProp:(node,key,previous,next)=>node.props[key]=next,
 insert(node,parent,anchor=null){if(node.parent){const index=node.parent.children.indexOf(node);if(index>=0)node.parent.children.splice(index,1);}node.parent=parent;const index=anchor?parent.children.indexOf(anchor):-1;index<0?parent.children.push(node):parent.children.splice(index,0,node);},
 remove(node){const index=node.parent?.children.indexOf(node);if(index>=0)node.parent.children.splice(index,1);node.parent=null;},
 parentNode:node=>node.parent,nextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]||null,
});
const nodes=(node,type)=>[node,...node.children.flatMap(child=>nodes(child))].filter(item=>!type||item.type===type);
const text=node=>node.text+node.children.map(text).join('');
const card=(root,key)=>nodes(root,'article').find(node=>node.props['data-section']===key);
const button=(root,label)=>{const value=nodes(root,'button').find(node=>text(node)===label);assert.ok(value,label);return value;};
const row=(root,label)=>{const title=nodes(root,'dt').find(node=>text(node)===label);assert.ok(title,label);return text(title.parent.children.find(node=>node.type==='dd'));};
async function mount(props={}){
 const events=[],state=Vue.reactive({connected:true,locale:'de_DE',...props,onRead:()=>events.push(['read']),onExport:value=>events.push(['export',value])});
 const root=hostNode('root'),Component=await component(),app=renderer.createApp({render:()=>Vue.h(Component,state)});
 app.mount(root);await Vue.nextTick();return{root,state,events,app};
}
const change=async(h,patch)=>{Object.assign(h.state,patch);await Vue.nextTick();};

test('overview is passive and gates read/export while disconnected, blocked or loading',async()=>{
 const h=await mount({connected:false});
 try{
  assert.equal(h.events.length,0);assert.equal(nodes(h.root,'article').length,8);
  const read=()=>button(h.root,'Alle Diagnosewerte auslesen'),save=()=>button(h.root,'Gesamtdiagnose speichern');
  assert.equal(read().props.disabled,true);read().props.onClick();assert.equal(h.events.length,0);
  assert.equal(save().props.disabled,true);save().props.onClick();assert.equal(h.events.length,0);
  await change(h,{connected:true,blocked:true});read().props.onClick();assert.equal(h.events.length,0);
  await change(h,{blocked:false});read().props.onClick();assert.deepEqual(h.events,[['read']]);
  await change(h,{loading:true,progress:'runtime'});
  assert.equal(button(h.root,'Diagnose wird gelesen …').props.disabled,true);
  button(h.root,'Diagnose wird gelesen …').props.onClick();assert.equal(h.events.length,1);
  assert.match(text(nodes(h.root).find(n=>n.props.role==='status')),/RAM und Laufzeit/);
  await change(h,{loading:false,snapshot:diagnosticSnapshot()});
  save().props.onClick();assert.equal(h.events[1][0],'export');assert.equal(h.events[1][1],h.state.snapshot);
 }finally{h.app.unmount();}
});

test('all real normalized sections render extra memory, startup, layout and firmware MTU values',async()=>{
 const snapshot=diagnosticSnapshot();assert.ok(normalizeDiagnosticSnapshot(snapshot),'fixture must obey collector contract');
 const h=await mount({snapshot});
 try{
  assert.match(text(h.root),/8 \/ 8 Bereiche ausgelesen/);
  for(const key of Object.keys(snapshot.sections)){assert.match(card(h.root,key).props.class,/state-available/);assert.equal(nodes(card(h.root,key),'time')[0].props.datetime,snapshot.completedAt);}
  const ram=card(h.root,'runtime');
  assert.match(row(ram,'Größter freier Heap-Block'),/10560 B/);
  assert.match(row(ram,'Kleinster beobachteter größter Block'),/9728 B/);
  assert.match(row(ram,'Maximal belegte Heap-Nutzdaten'),/5260 B/);
  assert.match(row(ram,'Reservierter Stackbereich'),/8192 B/);
  assert.equal(row(ram,'Gemeldeter kleinster freier Stack'),'Nicht erfasst');
  assert.match(text(ram),/Reservierter Stack ist kein gemessener freier Stack/);
  assert.equal(row(card(h.root,'startup'),'Anwendungsstart bis erste Verarbeitung'),'2312 ms');
  assert.match(row(card(h.root,'startup'),'Längster gemessener Abschnitt'),/2218 ms/);
  assert.equal(row(card(h.root,'mtu'),'Aktuelle ATT-MTU laut Firmware'),'250');
  assert.equal(row(card(h.root,'mtu'),'Aktuelle GATT-Wertkapazität'),'247 B');
  assert.equal(row(card(h.root,'storage'),'Konfigurierte LittleFS-Cachegröße'),'256 B');
  assert.match(text(card(h.root,'storage')),/keine Messung der Cachebelegung/);
  assert.match(text(card(h.root,'boot')),/S112 7\.3\.0/);assert.doesNotMatch(text(card(h.root,'boot')),/BL11/);
  assert.match(text(card(h.root,'power')),/4\.123 V/);
  assert.equal(nodes(h.root,'img').length,0);assert.equal(nodes(h.root,'a').length,0);assert.equal(h.events.length,0);
 }finally{h.app.unmount();}
});

test('fresh failed/unavailable sections remove old values and a partial report remains exportable',async()=>{
 const h=await mount({snapshot:diagnosticSnapshot()});
 try{
  const next=diagnosticSnapshot();
  next.sections.runtime={state:'failed',observedAt:next.completedAt,data:null,errorCode:'RESPONSE_INVALID'};
  next.sections.storage={state:'unavailable',observedAt:null,data:null,errorCode:null};
  await change(h,{snapshot:next,connected:false});
  assert.match(text(card(h.root,'runtime')),/Abfrage fehlgeschlagen/);
  assert.match(text(card(h.root,'runtime')),/RESPONSE_INVALID/);
  assert.doesNotMatch(text(card(h.root,'runtime')),/10668|8192|Größter freier/);
  assert.equal(nodes(card(h.root,'runtime'),'dl').length,0);
  assert.match(text(card(h.root,'storage')),/Nicht verfügbar/);
  assert.equal(nodes(card(h.root,'storage'),'time').length,0);
  assert.match(text(h.root),/früheren Abfrage/);
  assert.equal(button(h.root,'Gesamtdiagnose speichern').props.disabled,false);
  button(h.root,'Gesamtdiagnose speichern').props.onClick();assert.equal(h.events[0][1],h.state.snapshot);
  await change(h,{loading:true});assert.equal(button(h.root,'Gesamtdiagnose speichern').props.disabled,true);
 }finally{h.app.unmount();}
});

test('MTU capacity and next-connection configuration never substitute for an absent current MTU',async()=>{
 const snapshot=diagnosticSnapshot(),h=await mount({snapshot});
 try{
  snapshot.sections.mtu.data={...snapshot.sections.mtu.data,gattValueCapacity:20,nextConnectionAttMtu:23};
  await change(h,{snapshot:structuredClone(snapshot)});
  assert.equal(row(card(h.root,'mtu'),'Aktuelle ATT-MTU laut Firmware'),'250');
  assert.equal(row(card(h.root,'mtu'),'Aktuelle GATT-Wertkapazität'),'20 B');
  snapshot.sections.mtu.data={...snapshot.sections.mtu.data,sessionReady:false,effectiveAttMtu:null,gattValueCapacity:null};
  await change(h,{snapshot:structuredClone(snapshot)});
  assert.equal(row(card(h.root,'mtu'),'Aktuelle ATT-MTU laut Firmware'),'Nicht erfasst');
  assert.equal(row(card(h.root,'mtu'),'Aktuelle GATT-Wertkapazität'),'Nicht erfasst');
  assert.equal(row(card(h.root,'mtu'),'Grenze für nächste Verbindung'),'23');
  assert.match(text(card(h.root,'mtu')),/Browser misst die ATT-MTU nicht selbst/);
 }finally{h.app.unmount();}
});

test('button events retain settings-only scope and unrecorded results do not become success',async()=>{
 const h=await mount({snapshot:diagnosticSnapshot()});
 try{
  const ui=card(h.root,'ui');
  assert.match(text(ui),/aktuelle\/letzte Einstellungsansicht/);
  const lines=nodes(nodes(ui,'tbody')[0],'tr');
  assert.equal(lines.length,6);assert.match(text(lines[3]),/Mitte eingereiht88800/);
  assert.match(row(ui,'Letzter langer Mitteldruck'),/Speichern —/);
  assert.doesNotMatch(row(ui,'Letzter langer Mitteldruck'),/Speichern 0/);
  assert.match(row(ui,'Letzter kurzer Mitteldruck'),/Speichern 0/);
  const next=diagnosticSnapshot();next.sections.ui.data.queueHighWater=255;next.sections.ui.data.rawEvents.center.press=65535;
  await change(h,{snapshot:next});assert.match(text(card(h.root,'ui')),/65535/);
 }finally{h.app.unmount();}
});

test('partial startup markers have no invented total or slowest complete-start conclusion',async()=>{
 const snapshot=diagnosticSnapshot();snapshot.sections.startup.data={...snapshot.sections.startup.data,phaseMask:3,elapsedMilliseconds:[0,2000,null,null,null,null]};
 snapshot.sections.power.data={schemaVersion:1,scope:'application-start-and-cached-battery',resetCaptured:false,resetReasonRaw:null,sampleCollected:false,voltageValid:false,batteryMillivolts:null,lipoMode:false,chargingActive:false,configuredSleepSeconds:0};
 const h=await mount({snapshot});
 try{
  const startup=card(h.root,'startup');
  assert.equal(row(startup,'Anwendungsstart bis erste Verarbeitung'),'Unvollständige Aufzeichnung');
  assert.doesNotMatch(text(startup),/Längster gemessener Abschnitt|2312 ms/);
  assert.equal(row(startup,'Erste Ereignisverarbeitung beendet'),'Nicht erfasst');
  assert.equal(row(card(h.root,'power'),'Eingestellte Ruhezeit'),'Nicht erfasst');
  assert.equal(row(card(h.root,'power'),'LiPo-Modus / Ladeanzeige'),'Nicht erfasst / Nicht erfasst');
  const invalidVoltage=structuredClone(snapshot);invalidVoltage.sections.power.data.sampleCollected=true;invalidVoltage.sections.power.data.lipoMode=true;
  await change(h,{snapshot:invalidVoltage});
  assert.equal(row(card(h.root,'power'),'LiPo-Modus / Ladeanzeige'),'Ja / Nicht erfasst');
  assert.equal(row(card(h.root,'power'),'Gespeicherte Batteriespannung'),'Nicht erfasst');
 }finally{h.app.unmount();}
});

test('English and Chinese locales use coherent English fallback and localized progress',async()=>{
 const h=await mount({locale:'en_US',snapshot:diagnosticSnapshot(),loading:true,progress:'storage'});
 try{
  assert.match(text(h.root),/Storage layout and cache/);assert.match(text(h.root),/Read timestamps|read timestamps/);
  assert.equal(text(nodes(h.root).find(n=>n.props.role==='status')),'Storage layout and cache');
  await change(h,{locale:'zh_CN',loading:false});
  assert.ok(button(h.root,'Read all diagnostic values'));assert.ok(button(h.root,'Save combined diagnostics'));
  assert.match(text(card(h.root,'ui')),/Current\/last settings view only/);
 }finally{h.app.unmount();}
});

test('malformed section data fails closed in the rendered view and arbitrary payload fields are not displayed',async()=>{
 const snapshot=diagnosticSnapshot();
 snapshot.sections.storage.data.layout.engineSha256='PRIVATE_CONTENT';
 snapshot.sections.mtu.data.effectiveAttMtu=10000;
 snapshot.sections.runtime.data.privateFilename='PRIVATE_FILENAME';
 snapshot.sections.boot.observedAt='not a date';
 snapshot.sections.ui={state:'failed',observedAt:snapshot.completedAt,data:{note:'PRIVATE_NOTE'},errorCode:'C:\\private\\secret'};
 const h=await mount({snapshot});
 try{
  assert.match(card(h.root,'storage').props.class,/state-failed/);
  assert.match(card(h.root,'mtu').props.class,/state-failed/);
  assert.equal(nodes(card(h.root,'boot'),'time').length,0);
  assert.doesNotMatch(text(h.root),/PRIVATE|private/);assert.doesNotMatch(text(card(h.root,'mtu')),/10000/);
  assert.equal(nodes(card(h.root,'ui'),'table').length,0);
 }finally{h.app.unmount();}
});
