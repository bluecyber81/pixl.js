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

test('RAM sample evidence is visible before technical details and follows locale fallback and fresh missing data',async()=>{
 const h=await mount();
 try {
  for(const [samples,de,en] of [[0,/Noch keine Speicherstichprobe/,/No memory samples/],
    [1,/Nur 1 Speicherstichprobe/,/Only 1 memory sample/],[3,/Erst 3 Speicherstichproben/,/Only 3 memory samples/],
    [25,/25 Speicherstichproben erfasst/,/25 memory samples recorded/],[undefined,/Stichprobenzahl nicht verfügbar/,/Sample count unavailable/]]){
   const snapshot=diagnosticSnapshot();snapshot.sections.runtime.data.memorySamples=samples;
   for(const locale of ['de_DE','en','ja_JP']){
    await change(h,{snapshot,locale});const ram=card(h.root,'runtime'),note=nodes(ram,'p').find(n=>n.props.class==='sample-note');
    assert.ok(note);assert.equal(note.parent,ram);assert.match(text(note),locale==='de_DE'?de:en);
    assert.doesNotMatch(text(note),/RAM.*(?:OK|bestanden)|healthy|passed/);
   }
  }
  const snapshot=diagnosticSnapshot();snapshot.sections.runtime={state:'unavailable',observedAt:null,data:null,errorCode:null};
  await change(h,{snapshot});assert.equal(nodes(card(h.root,'runtime'),'p').filter(n=>n.props.class==='sample-note').length,0);
 }finally{h.app.unmount();}
});

test('overview is passive and gates read/export while disconnected, blocked or loading',async()=>{
 const h=await mount({connected:false});
 try{
  assert.equal(h.events.length,0);assert.equal(nodes(h.root,'article').length,8);
  const read=()=>button(h.root,'Alle Diagnosewerte auslesen'),save=()=>button(h.root,'Gesamtdiagnose speichern');
  assert.equal(read().props.disabled,true);read().props.onClick();assert.equal(h.events.length,0);
  assert.equal(save().props.disabled,true);save().props.onClick();assert.equal(h.events.length,0);
  await change(h,{connected:true,blocked:true});read().props.onClick();assert.equal(h.events.length,0);
  await change(h,{blocked:false});read().props.onClick();assert.deepEqual(h.events,[['read']]);
  await change(h,{loading:true,progress:{completed:0,total:8,startedAt:0,updatedAt:0,sections:{}}});
  assert.equal(button(h.root,'Diagnose wird gelesen …').props.disabled,true);
  button(h.root,'Diagnose wird gelesen …').props.onClick();assert.equal(h.events.length,1);
  assert.match(text(nodes(h.root).find(n=>n.props.role==='status')),/RAM und Laufzeit/);
  await change(h,{loading:false,snapshot:diagnosticSnapshot()});
  save().props.onClick();assert.equal(h.events[1][0],'export');assert.equal(h.events[1][1],h.state.snapshot);
  assert.equal(nodes(h.root,'p').filter(n=>n.props.class==='snapshot-time').length,1);
  await change(h,{loading:true,progress:{completed:0,total:8,startedAt:0,updatedAt:0,sections:{}}});
  assert.equal(nodes(h.root,'p').filter(n=>n.props.class==='snapshot-time').length,0,'pending read must hide the earlier completion timestamp');
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
  assert.equal(row(ram,'Unberührter Stack seit Anwendungsstart'),'Nicht erfasst');
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
test('combined view shows schema3 mount evidence, unavailable profile and failure without stale counters',async()=>{
 const snapshot=diagnosticSnapshot(),startup=snapshot.sections.startup.data;
 Object.assign(startup,{schemaVersion:3,storageDetailMask:3,storageElapsedMilliseconds:[2100,2180],mount:{scope:'last-packedfs-mount',flags:23,result:0,
  configureMilliseconds:100,scanMilliseconds:2000,physicalReadAttempts:500,physicalReadBytes:128000,cacheHits:850,cacheMisses:450,bypassReads:50,physicalReadErrors:0}});
 const h=await mount({snapshot});
 try{
  assert.match(text(card(h.root,'startup')),/PackedFS einlesen2000 ms/);assert.match(text(card(h.root,'startup')),/128000 B/);
  assert.match(text(card(h.root,'storage')),/Konfigurationswert/);
  const unavailable=structuredClone(snapshot);unavailable.sections.startup.data.mount=null;await change(h,{snapshot:unavailable});
  assert.match(text(card(h.root,'startup')),/Kein abgeschlossenes PackedFS/);assert.doesNotMatch(text(card(h.root,'startup')),/128000 B/);
  unavailable.sections.startup={state:'failed',observedAt:snapshot.completedAt,data:null,errorCode:'RESPONSE_INVALID'};
  await change(h,{snapshot:structuredClone(unavailable)});assert.doesNotMatch(text(card(h.root,'startup')),/Mountprofil|128000 B/);
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
  assert.match(text(card(h.root,'mtu')),/keine aktuelle ATT-MTU gemeldet/);
 }finally{h.app.unmount();}
});

test('storage detail durations appear in the combined overview only when supplied by firmware',async()=>{
 const snapshot=diagnosticSnapshot(),h=await mount({snapshot});
 try{
  assert.doesNotMatch(text(card(h.root,'startup')),/Journal|journal/);
  const startup=snapshot.sections.startup.data;
  snapshot.sections.startup.data={...startup,schemaVersion:2,storageDetailMask:3,storageElapsedMilliseconds:[106,2011]};
  await change(h,{snapshot:structuredClone(snapshot)});
  assert.equal(row(card(h.root,'startup'),'Bis das Laufwerk eingebunden ist'),'106 ms');
  assert.equal(row(card(h.root,'startup'),'Prüfen und Wiederherstellen des Speicherjournals'),'1905 ms');
  assert.equal(row(card(h.root,'startup'),'Übrige Speicherinitialisierung'),'207 ms');
  snapshot.sections.startup.data.storageDetailMask=1;
  snapshot.sections.startup.data.storageElapsedMilliseconds=[106,null];
  await change(h,{snapshot:structuredClone(snapshot),locale:'en_US'});
  assert.equal(row(card(h.root,'startup'),'Storage journal check and recovery'),'Not recorded');
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
  next.sections.ui.data.active=false; next.sections.ui.data.sessions=0;
  await change(h,{snapshot:structuredClone(next)});assert.match(text(card(h.root,'ui')),/keine Einstellungssitzung erfasst/);
  for(const locale of ['de_DE','en_US']){
    await change(h,{locale});
    const empty=card(h.root,'ui');
    assert.equal(nodes(empty,'table').length,0);
    assert.equal(nodes(empty,'details').length,0);
    assert.equal(row(empty,locale==='de_DE'?'Gezählte Einstellungssitzungen':'Counted settings sessions'),'0');
    assert.match(text(empty),locale==='de_DE'?/Hauptmenü/:/Main menu/);
  }
 }finally{h.app.unmount();}
});

test('first menu displays the frozen launch call separately from settings and hardware display timing',async()=>{
 const snapshot=diagnosticSnapshot(),h=await mount({snapshot});
 try{
  assert.equal(card(h.root,'menu'),undefined);
  const base={schemaVersion:1,scope:'first-main-menu-since-restart',menuEntered:false,selectionAttempted:false,
    launcherReturned:false,targetActive:false,leftBeforeSelection:false,countsSaturated:false,targetAppId:null,
    launchCallMilliseconds:null,centerCounts:{press:0,release:0,short:0}};
  const present=async(patch,locale='de_DE')=>{
    snapshot.sections.menu={state:'available',observedAt:snapshot.completedAt,data:{...base,...patch},errorCode:null};
    await change(h,{snapshot:structuredClone(snapshot),locale});
    return card(h.root,'menu');
  };
  assert.match(text(await present({})),/Hauptmenü noch nicht geöffnet/);
  assert.doesNotMatch(text(card(h.root,'menu')),/0 ms|0 \/ 0 \/ 0/);
  assert.match(text(await present({menuEntered:true,leftBeforeSelection:true})),/ohne App-Auswahl verlassen/);
  const selected={menuEntered:true,selectionAttempted:true,targetAppId:2};
  assert.match(text(await present(selected)),/Rückkehr des Startaufrufs offen/);
  assert.doesNotMatch(text(card(h.root,'menu')),/0 ms/);
  const shown=await present({...selected,launcherReturned:true,targetActive:true,launchCallMilliseconds:0,
    countsSaturated:true,centerCounts:{press:255,release:254,short:254}});
  assert.equal(row(shown,'Gewählte App'),'Amiibo-Emulator');
  assert.equal(row(shown,'Dauer des App-Startaufrufs'),'0 ms');
  assert.match(text(shown),/≥255 \/ 254 \/ 254/);
  const unknown=await present({...selected,targetAppId:42,launcherReturned:true,launchCallMilliseconds:120},'en_US');
  assert.equal(row(unknown,'Selected app'),'App 42');
  assert.match(text(unknown),/inactive when launch finished/);
 }finally{h.app.unmount();}
});

test('PXMI v2 shows actual return separately in both languages, including missing center icon and no-return state',async()=>{
 const snapshot=diagnosticSnapshot(),h=await mount({snapshot});
 const base={schemaVersion:2,scope:'first-menu-launch-and-last-app-return',menuEntered:true,selectionAttempted:true,
   launcherReturned:true,targetActive:true,leftBeforeSelection:false,countsSaturated:false,targetAppId:3,
   launchCallMilliseconds:42,centerCounts:{press:1,release:1,short:1},
   lastAppReturn:{sourceContext:2,targetContext:3,staleEventsDiscarded:65535,sourceAppId:8,targetAppId:8,
     firstLabelAppId:8,lastLabelAppId:8,firstIconAppId:null,lastIconAppId:8}};
 try{
  for(const locale of ['de_DE','en_US']) {
   snapshot.sections.menu={state:'available',observedAt:snapshot.completedAt,data:structuredClone(base),errorCode:null};
   await change(h,{snapshot:structuredClone(snapshot),locale});const menu=card(h.root,'menu');
   assert.equal(row(menu,locale==='de_DE'?'Gewählte App':'Selected app'),locale==='de_DE'?'Amiibo-Datenbank':'Amiibo Database');
   assert.match(row(menu,locale==='de_DE'?'Letzte Rückkehr aus einer App':'Last return from an app'),locale==='de_DE'?/Kartenemulator → Hauptmenü/:/Card Emulator → Main menu/);
   assert.match(row(menu,locale==='de_DE'?'Erster Zeichenaufruf · Name / Symbol':'First draw call · label / icon'),locale==='de_DE'?/Kein Symbol in der Mitte/:/No icon at center/);
   assert.equal(row(menu,locale==='de_DE'?'Veraltete Eingaben verworfen':'Stale input events discarded'),'≥65535');
   assert.match(text(menu),locale==='de_DE'?/beweisen nicht/:/do not establish/);
   snapshot.sections.menu.data.lastAppReturn=null;
   await change(h,{snapshot:structuredClone(snapshot)});
   assert.match(text(card(h.root,'menu')),locale==='de_DE'?/noch keine Rückkehr erfasst/:/No app return recorded/);
   assert.doesNotMatch(text(card(h.root,'menu')),/65535|Card Emulator →|Kartenemulator →/);
  }
  await change(h,{snapshot:null,connected:false,firmwareVersion:''});
  assert.equal(card(h.root,'menu'),undefined);
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

test('read progress uses completed replies, ticks without more reads and clears on interruption', async () => {
  const sample = diagnosticSnapshot();
  const progress = { startedAt: 1000, updatedAt: 5000, total: 8, completed: 2,
    sections: { runtime: sample.sections.runtime, boot: { state: 'unavailable', observedAt: null, data: null, errorCode: null } } };
  const h = await mount({ loading: true, readClock: 5000, progress });
  try {
    const bar = () => nodes(h.root, 'progress')[0];
    assert.equal(bar().props.value, 2);
    assert.equal(bar().props.max, 8);
    assert.match(text(h.root), /Bereich 3 von 8 · Strom und Ruhezeit/);
    assert.match(text(h.root), /Noch ca. 0:12/);
    assert.match(text(card(h.root, 'runtime')), /Ausgelesen/);
    assert.match(text(card(h.root, 'boot')), /Nicht verfügbar/);
    await change(h, { readClock: 6100 });
    assert.match(text(h.root), /Noch ca. 0:11/);
    assert.match(text(h.root), /Vergangen 0:05/);
    await change(h, { readClock: 17000 });
    assert.match(text(h.root), /Warte auf Geräteantwort/);
    assert.doesNotMatch(text(h.root), /Noch ca\./);
    await change(h, { loading: false, interrupted: true, progress: null });
    assert.match(text(h.root), /Abfrage wurde unterbrochen/);
    assert.equal(bar(), undefined);
    assert.equal(h.events.length, 0);
  } finally { h.app.unmount(); }
});

test('English and Chinese locales use coherent English fallback and localized progress',async()=>{
 const h=await mount({locale:'en_US',snapshot:diagnosticSnapshot(),loading:true,progress:{completed:5,total:8,startedAt:0,updatedAt:2000,sections:{}}});
 try{
  assert.match(text(h.root),/Storage layout and cache/);assert.match(text(h.root),/Read timestamps|read timestamps/);
  assert.equal(text(nodes(h.root).find(n=>n.props.role==='status')),'Section 6 of 8 · Storage layout and cache');
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

test('build reference separates reported version/counter from package SourceID and BIN hash in both languages',async()=>{
 const snapshot=structuredClone(diagnosticSnapshot());snapshot.sections.boot.data.applicationCounter=644;
 const h=await mount({snapshot,firmwareVersion:'2.22.0-DE3.71t1'});
 try{
  for(const locale of ['de_DE','en']){
   await change(h,{locale});
   assert.match(text(h.root),/3c62a24a8aecab7a81af6b73cb86642d4a248755d739c5e37b1fcdeea7451d02/);
   assert.match(text(h.root),/fbade80d03a44a3bb3bb7e76df422b24a879d2ff81b433e6bf4f6d6e1b955273/);
   assert.match(text(h.root),locale==='en'?/application hash not verified/:/App-Hash nicht geprüft/);
   assert.match(text(h.root),locale==='en'?/Full functional testing is pending/:/vollständige Funktionsprüfung steht aus/);
  }
  await change(h,{firmwareVersion:'2.22.0-DE3.70'});assert.match(text(h.root),/Different reported version/);
  await change(h,{snapshot:null});assert.doesNotMatch(text(h.root),/fbade80d03a44a3b/);
 }finally{h.app.unmount();}
});
