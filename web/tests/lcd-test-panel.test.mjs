import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountSfc,nodes,text} from './helpers/vue-component-host.mjs';
import {parseMtuDiagnostics} from '../src/lib/device-extra-diagnostics.js';
const url=new URL('../src/components/LcdTestPanel.vue',import.meta.url);
const fixture=JSON.parse(readFileSync(new URL('./fixtures/ble-link-diagnostic-v3.json',import.meta.url),'utf8'));
function data(enabled=false,result=0){const raw=Uint8Array.from(Buffer.from(fixture.responsePayloadHex,'hex'));raw[32]=enabled?3:1;new DataView(raw.buffer).setUint32(36,result,true);return parseMtuDiagnostics(raw);}
const button=(h,label)=>{const b=nodes(h.root,'button').find(n=>text(n)===label);assert.ok(b,label);return b;};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function mount(extra={}){const events=[],calls=[];
 const h=await mountSfc(url,{connected:true,firmwareVersion:'2.22.0-DE3.96',generation:1,locale:'de_DE',blocked:false,
 readDiagnostics:async()=>{calls.push('read');return data();},setExtension:async enabled=>{calls.push(enabled);return data(enabled);},
 runStorageTest:async()=>{calls.push('file');return{schema:1,status:'passed',startedAt:'2026-11-21T12:00:00.000Z',bytes:512,freeBeforeBytes:1000,freeAfterWriteBytes:0,freeAfterBytes:1000,spaceRecovered:true,removed:true,verified:true,durationMilliseconds:100};},
 onBusy:value=>events.push(['busy',value]),onExport:report=>events.push(['export',report]),...extra});return{...h,calls,events};}
async function click(h,label){await h.tick();await button(h,label).props.onClick();await h.tick();}
const read='Teststatus lesen',off='Baseline: Verlängerung AUS',on='Test: Verlängerung EIN',file='512-Byte-Prüflauf starten';

test('test panel has no automatic calls and stays out of normal or older-device UI',async()=>{
 const h=await mount();try{
  assert.deepEqual(h.calls,[]);assert.equal(button(h,on).props.disabled,true);await click(h,on);assert.deepEqual(h.calls,[]);
  assert.match(text(h.root),/App669 · Test 1/);assert.match(text(h.root),/Neuverbinden/);assert.match(text(h.root),/keine gemessene Funkzeit/);
  for(const firmwareVersion of ['2.22.0-DE3.95','2.22.0-DE3.98','2.22.0-DE3.96-OLEDt1','']){h.state.firmwareVersion=firmwareVersion;await h.tick();assert.equal(nodes(h.root,'section').length,0);}
  assert.deepEqual(h.calls,[]);
 }finally{h.app.unmount();}
});

test('fresh capability enables only explicit idle actions and the SDK result decides whether change is confirmed',async()=>{
 const h=await mount();try{
  await click(h,read);assert.deepEqual(h.calls,['read']);assert.equal(button(h,off).props.disabled,true);assert.equal(button(h,on).props.disabled,false);
  await click(h,on);assert.deepEqual(h.calls,['read',true]);assert.match(text(h.root),/Testkonfiguration EIN bestätigt/);assert.equal(button(h,on).props.disabled,true);
  h.state.setExtension=async()=>data(true,7);await click(h,off);assert.match(text(h.root),/abgelehnt/);assert.match(text(h.root),/Fehlercode: 7/);assert.equal(button(h,on).props.disabled,true);
  h.state.blocked=true;await h.tick();await click(h,off);await click(h,read);await click(h,file);assert.deepEqual(h.calls,['read',true]);
 }finally{h.app.unmount();}
});

test('unsupported fresh reply clears prior capability and leaves the ordinary app outside the test panel usable',async()=>{
 const h=await mount();try{
  await click(h,read);const old={...data(),schemaVersion:2};delete old.experiment;
  h.state.readDiagnostics=async()=>old;await click(h,read);assert.match(text(h.root),/Testfunktion nicht bestätigt/);
  assert.equal(button(h,on).props.disabled,true);assert.equal(button(h,file).props.disabled,true);assert.equal(button(h,read).props.disabled,false);
  assert.equal(nodes(h.root,'dl').length,0);
 }finally{h.app.unmount();}
});

test('pending, disconnected, replaced and unmounted requests never overwrite or unlock a new test action',async()=>{
 const old=deferred(),fresh=deferred();const h=await mount({readDiagnostics:()=>old.promise});try{
  const pending=button(h,read).props.onClick();await h.tick();assert.equal(button(h,read).props.disabled,true);
  h.state.generation=2;await h.tick();h.state.readDiagnostics=()=>fresh.promise;await h.tick();
  const replacement=button(h,read).props.onClick();await h.tick();old.resolve(data(true));await pending;await h.tick();
  assert.equal(button(h,read).props.disabled,true);assert.doesNotMatch(text(h.root),/Test · EIN/);
  fresh.resolve(data(false));await replacement;await h.tick();assert.equal(button(h,on).props.disabled,false);
  h.state.connected=false;await h.tick();assert.equal(button(h,read).props.disabled,true);assert.equal(nodes(h.root,'dl').length,0);
 }finally{h.app.unmount();}
 const gate=deferred(),g=await mount({readDiagnostics:()=>gate.promise}),pending=button(g,read).props.onClick();await g.tick();g.app.unmount();const count=g.events.length;gate.resolve(data(true));await pending;assert.equal(g.events.length,count);
});

test('phone test starts only after capability and exposes exact fresh free-space results through explicit report export',async()=>{
 const h=await mount();try{
  assert.equal(button(h,file).props.disabled,true);await click(h,file);assert.deepEqual(h.calls,[]);
  await click(h,read);await click(h,file);assert.deepEqual(h.calls,['read','file']);assert.match(text(h.root),/Rücklesen und Entfernen bestätigt/);
  assert.match(text(h.root),/1.000 B/);assert.match(text(h.root),/0 B/);assert.match(text(h.root),/kein belastbarer Durchsatzvergleich/);
  assert.equal(h.events.filter(e=>e[0]==='export').length,0);await click(h,'Prüfbericht speichern');
  const report=h.events.find(e=>e[0]==='export')[1];assert.equal(report.verified,true);assert.equal(report.freeAfterBytes,1000);
  h.state.runStorageTest=async()=>{throw Object.assign(Error('private arbitrary message'),{testReport:{status:'failed',cleanupRequired:true,folder:'E:/~t669-0123456789abcdef01234567',phase:'readback'}});};
  await click(h,file);assert.match(text(h.root),/Testordner übrig/);assert.match(text(h.root),/nicht automatisch weitergelöscht/);assert.doesNotMatch(text(h.root),/private arbitrary/);
 }finally{h.app.unmount();}
});

test('late file failure can retain its dated leftover-folder report while disconnected but cannot replace a newer run',async()=>{
 const gate=deferred(),h=await mount({runStorageTest:()=>gate.promise});try{
  await click(h,read);const p=button(h,file).props.onClick();await h.tick();h.state.connected=false;h.state.generation=2;await h.tick();
  gate.reject(Object.assign(Error('lost'),{code:'DISCONNECTED',testReport:{status:'failed',cleanupRequired:true,folder:'E:/~t669-old',startedAt:'2026-11-21T12:00:00.000Z'}}));await p;await h.tick();assert.match(text(h.root),/Testordner übrig/);
  h.state.connected=true;await h.tick();assert.equal(button(h,file).props.disabled,true);assert.match(text(h.root),/kein Livezustand/);
 }finally{h.app.unmount();}
});

const comparison='Kurzvergleich starten',cancelComparison='Kurzvergleich abbrechen';
function comparisonResult(status='passed',label='current') {
 return {schema:1,kind:'lcd-small-read-comparison',status,runLabel:label,startedAt:'2026-11-21T15:00:00.000Z',
  files:[{path:'E:/a',size:1},{path:'E:/b',size:1}],payloadBytes:2,
  passes:[{mode:'single-before',durationMilliseconds:20,requests:2}],verified:status==='passed'};
}

test('App670 short comparison requires its own explicit click, current test capability and the App670 version',async()=>{
 let comparisons=0;const h=await mount({runReadComparison:async()=>{comparisons++;return comparisonResult();}});
 try {
  assert.equal(nodes(h.root,'button').some(n=>text(n)===comparison),false);assert.equal(comparisons,0);
  h.state.firmwareVersion='2.22.0-DE3.97';await h.tick();
  assert.equal(button(h,comparison).props.disabled,true);await click(h,comparison);assert.equal(comparisons,0);
  await click(h,read);assert.equal(button(h,comparison).props.disabled,false);assert.equal(comparisons,0);
  h.state.blocked=true;await click(h,comparison);assert.equal(comparisons,0);
  h.state.blocked=false;await click(h,comparison);assert.equal(comparisons,1);
  assert.match(text(h.root),/Dateiinhalte und Geräte-Prüfsummen stimmen überein/);
  assert.equal(h.events.filter(e=>e[0]==='export').length,0);
  await click(h,'Kurzvergleich speichern');assert.equal(h.events.filter(e=>e[0]==='export').length,1);
  const old={...data(),schemaVersion:2};delete old.experiment;h.state.readDiagnostics=async()=>old;
  await click(h,read);await click(h,comparison);assert.equal(comparisons,1);assert.equal(button(h,comparison).props.disabled,true);
 } finally {h.app.unmount();}
});

test('App670 short comparison cancellation holds the UI lock until the active read settles and preserves its incomplete report',async()=>{
 const gate=deferred();let options,settled=false;
 const h=await mount({firmwareVersion:'2.22.0-DE3.97',runReadComparison:input=>{options=input;return gate.promise;}});
 try {
  await click(h,read);const pending=button(h,comparison).props.onClick().then(()=>{settled=true;});await h.tick();
  assert.equal(options.signal.aborted,false);assert.equal(button(h,file).props.disabled,true);
  await click(h,cancelComparison);assert.equal(options.signal.aborted,true);assert.equal(settled,false);
  assert.equal(button(h,comparison).props.disabled,true);assert.equal(button(h,read).props.disabled,true);
  assert.equal(button(h,cancelComparison).props.disabled,true);assert.deepEqual(h.events.at(-1),['busy',true]);
  assert.match(text(h.root),/Abbruch nach der laufenden Leseanfrage/);
  gate.reject(Object.assign(Error('Stopped after current read'),{code:'LCD_COMPARE_CANCELLED',testReport:comparisonResult('cancelled')}));
  await pending;await h.tick();assert.equal(settled,true);assert.deepEqual(h.events.at(-1),['busy',false]);
  assert.match(text(h.root),/Kurzvergleich abgebrochen/);assert.equal(button(h,read).props.disabled,false);
  await click(h,'Kurzvergleich speichern');assert.equal(h.events.at(-1)[1].status,'cancelled');
 } finally {h.app.unmount();}
});

test('App670 late comparison progress, success or failure cannot replace a newer session report or release its active lock',async()=>{
 for(const outcome of ['success','failure']) {
  const old=deferred(),fresh=deferred();let oldOptions;
  const h=await mount({firmwareVersion:'2.22.0-DE3.97',runReadComparison:options=>{oldOptions=options;return old.promise;}});
  try {
   await click(h,read);const pending=button(h,comparison).props.onClick();await h.tick();
   h.state.generation=2;await h.tick();assert.equal(oldOptions.signal.aborted,true);
   h.state.runReadComparison=options=>{options.onProgress({phase:'single-before'});return fresh.promise;};await h.tick();
   await click(h,read);const replacement=button(h,comparison).props.onClick();await h.tick();
   oldOptions.onProgress({phase:'batch'});
   if(outcome==='success')old.resolve(comparisonResult('passed','old'));
   else old.reject(Object.assign(Error('Old failure'),{testReport:comparisonResult('failed','old')}));
   await pending;await h.tick();
   assert.equal(button(h,comparison).props.disabled,true);assert.deepEqual(h.events.at(-1),['busy',true]);
   assert.match(text(h.root),/Einzeln vorher …/);assert.doesNotMatch(text(h.root),/Dateiinhalte und Geräte-Prüfsummen stimmen überein/);
   fresh.resolve(comparisonResult('passed','fresh'));await replacement;await h.tick();
   await click(h,'Kurzvergleich speichern');assert.equal(h.events.at(-1)[1].runLabel,'fresh');
  } finally {h.app.unmount();}
 }
});
