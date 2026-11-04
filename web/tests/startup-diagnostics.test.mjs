import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareStartup, parseStartupDiagnostics, normalizeStartupDiagnostics, startupDiagnosticRows, createStartupDiagnosticReport, startupDiagnosticsText } from '../src/lib/startup-diagnostics.js';
function packet(mask=63, times=[0,37,45,92,97,101]) {
  const bytes=new Uint8Array(32),view=new DataView(bytes.buffer);bytes.set([80,88,83,84,1,32,mask,0]);
  times.forEach((ms,i)=>view.setUint32(8+4*i,mask&(1<<i)?ms:0,true));return bytes;
}
test('previous saved start and full report compare the same two intervals; partial measurements are excluded',()=>{
  const prior=parseStartupDiagnostics(packet()), now=parseStartupDiagnostics(packet(63,[0,30,38,86,100,110]));
  for(const report of [{reportSchema:1,startup:prior},{schema:1,startup:prior,diagnosticSnapshot:{}}])
    assert.deepEqual(compareStartup(report,now),{storage:-7,total:9});
  assert.equal(compareStartup({startup:parseStartupDiagnostics(packet(31))},now),null);
  assert.equal(compareStartup({startup:{...prior,scope:'other'}},now),null);
});
test('startup parses exact v1 six-marker wire data including offset buffers and unsigned times',()=>{
  const bytes=packet(),p=parseStartupDiagnostics(bytes),padded=new Uint8Array(50);padded.set(bytes,7);
  assert.deepEqual(parseStartupDiagnostics(padded.subarray(7,39)),p);assert.deepEqual(parseStartupDiagnostics(bytes.buffer),p);
  assert.deepEqual(p.elapsedMilliseconds,[0,37,45,92,97,101]);assert(Object.isFrozen(p));assert(Object.isFrozen(p.elapsedMilliseconds));
  assert.equal(parseStartupDiagnostics(packet(63,[0,1,2,3,4,0xffffffff])).elapsedMilliseconds[5],0xffffffff);
  assert.deepEqual(startupDiagnosticRows(p).map(row=>row.sincePreviousMilliseconds),[null,37,8,47,5,4]);
});
test('all allowed partial prefixes retain null for unrecorded markers and permit equal times',()=>{
  for(const mask of [0,1,3,7,15,31,63]) {
    const p=parseStartupDiagnostics(packet(mask,[0,0,0,0,0,0]));
    p.elapsedMilliseconds.forEach((ms,i)=>assert.equal(ms,mask&(1<<i)?0:null));
    assert(normalizeStartupDiagnostics(p));
  }
});
test('startup rejects all invalid masks, schema, padding, order, start offset and unrecorded data',()=>{
  for(let mask=0;mask<256;mask++)if(![0,1,3,7,15,31,63].includes(mask))assert.throws(()=>parseStartupDiagnostics(packet(mask)));
  for(const length of [0,16,31,33,64])assert.throws(()=>parseStartupDiagnostics(new Uint8Array(length)));
  for(const [offset,value]of [[0,0],[1,0],[2,0],[3,0],[4,2],[5,31],[7,1]]){const b=packet();b[offset]=value;assert.throws(()=>parseStartupDiagnostics(b));}
  for(const times of [[1,37,45,92,97,101],[0,37,36,92,97,101]])assert.throws(()=>parseStartupDiagnostics(packet(63,times)));
  const unset=packet(1);new DataView(unset.buffer).setUint32(28,1,true);assert.throws(()=>parseStartupDiagnostics(unset));
  for(const input of [null,{},[],new DataView(packet().buffer)])assert.throws(()=>parseStartupDiagnostics(input));
});
test('report normalization is bounded, defensive and allowlisted, with no device identifiers',()=>{
  const valid=parseStartupDiagnostics(packet()),dirty={...valid,path:'SECRET',address:'SECRET'};
  const normalized=normalizeStartupDiagnostics(dirty);assert.notEqual(normalized.elapsedMilliseconds,valid.elapsedMilliseconds);
  const report=createStartupDiagnosticReport(dirty,'2026-10-27T10:00:00.000Z');assert.doesNotMatch(JSON.stringify(report),/SECRET/);
  assert.match(report.limits.join(' '),/Bootloader|bootloader/);assert.equal(report.phases.length,6);
  for(const patch of [{schemaVersion:2},{scope:'boot'},{phaseMask:5},{phaseMask:64},{elapsedMilliseconds:[0,1,2]},{elapsedMilliseconds:new Array(6)},{elapsedMilliseconds:[0,1,2,3,4,-1]},{elapsedMilliseconds:[0,1,2,3,4,NaN]},{elapsedMilliseconds:[0,1,2,3,4,0x100000000]},{phaseMask:31}])assert.equal(normalizeStartupDiagnostics({...valid,...patch}),null);
  assert.deepEqual(startupDiagnosticRows({}),[]);
  for(const date of ['SECRET','2026-02-31T10:00:00.000Z','2026-10-27',''])assert.throws(()=>createStartupDiagnosticReport(valid,date));
  for(const locale of ['de_DE','en_US'])for(const row of report.phases)assert(startupDiagnosticsText(locale).phases[row.id]);
});
async function loadComponent(Vue) {
  const {parse,compileScript}=await import('@vue/compiler-sfc');
  const filename=fileURLToPath(new URL('../src/components/StartupDiagnostics.vue',import.meta.url));
  const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
  let source=compileScript(descriptor,{id:filename,inlineTemplate:true}).content;
  const imports=[];source=source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g,(_,binding,spec)=>{imports.push({binding,spec});return '';});
  const modules=await Promise.all(imports.map(({spec})=>spec==='vue'?Vue:import(pathToFileURL(path.resolve(path.dirname(filename),spec)))));
  const bindings=imports.map(({binding},i)=>`const ${binding.replace(/\s+as\s+/g,':')}=modules[${i}];`).join('\n');
  return new Function('modules',`${bindings}\n${source.replace('export default','return')}`)(modules);
}
const node=(type,text='')=>({type,text,props:{},children:[],parent:null});
function renderer(Vue) {return Vue.createRenderer({
  createElement:tag=>node(tag),createText:value=>node('#text',value),createComment:value=>node('#comment',value),
  setText:(item,value)=>item.text=value,setElementText:(item,value)=>{item.text=value;item.children=[];},
  patchProp:(item,key,previous,value)=>item.props[key]=value,
  insert(item,parent,anchor=null){if(item.parent)item.parent.children.splice(item.parent.children.indexOf(item),1);item.parent=parent;const index=parent.children.indexOf(anchor);index<0?parent.children.push(item):parent.children.splice(index,0,item);},
  remove(item){item.parent?.children.splice(item.parent.children.indexOf(item),1);item.parent=null;},
  parentNode:item=>item.parent,nextSibling:item=>item.parent?.children[item.parent.children.indexOf(item)+1]||null
});}
const text=item=>item.text+item.children.map(text).join('');
const nodes=item=>[item,...item.children.flatMap(nodes)];
const readButton=root=>nodes(root).find(item=>item.type==='button');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function mount(props={}) {
  const Vue=await import('vue'),Component=await loadComponent(Vue),root=node('root'),busy=[];
  const data=Vue.reactive({connected:true,blocked:false,generation:1,locale:'de_DE',...props,onBusy:value=>busy.push(value)});
  const app=renderer(Vue).createApp({render:()=>Vue.h(Component,data)});app.mount(root);
  return{Vue,root,data,app,busy};
}
test('3.29 startup summary highlights the longest actual interval, with bounded decorative bars',async()=>{
  let calls=0;const f=await mount({readDiagnostics:async()=>{calls++;return parseStartupDiagnostics(packet());}});
  try {
    assert.doesNotMatch(text(f.root),/Längster gemessener Abschnitt/);
    await readButton(f.root).props.onClick();await f.Vue.nextTick();
    const summary=nodes(f.root).find(n=>n.props.class==='timing-summary');
    assert.match(text(summary),/Gemessener Anwendungsstart101 ms/);
    assert.match(text(summary),/Längster gemessener AbschnittOberfläche und Display initialisiert47 ms/);
    const bars=nodes(f.root).filter(n=>n.props.class==='phase-meter');assert.equal(bars.length,5);
    assert(bars.every(n=>n.props['aria-hidden']==='true'));
    const widths=bars.map(n=>Number.parseFloat(n.children[0].props.style.width));
    assert(widths.every(w=>w>0&&w<=100));assert(Math.abs(widths.reduce((a,b)=>a+b,0)-100)<0.0001);
    assert.equal(calls,1);f.data.locale='en';await f.Vue.nextTick();assert.match(text(f.root),/Longest measured interval/);assert.equal(calls,1);
  }finally{f.app.unmount();}
});
test('3.29 partial or all-zero startup series never claim an overall bottleneck',async()=>{
  for(const value of [packet(7),packet(63,[0,0,0,0,0,0])]){
    const f=await mount({readDiagnostics:async()=>parseStartupDiagnostics(value)});
    try {await readButton(f.root).props.onClick();await f.Vue.nextTick();assert(!nodes(f.root).some(n=>n.props.class==='timing-summary'||n.props.class==='phase-meter'));}
    finally{f.app.unmount();}
  }
});
test('real component never calls automatically, blocks duplicate actions and displays six markers only after explicit read',async()=>{
  const d=deferred();let calls=0;const f=await mount({readDiagnostics:()=>{calls++;return d.promise;}});
  try {
    assert.equal(calls,0);assert.match(text(f.root),/noch nicht gelesen/);assert.equal(nodes(f.root).filter(n=>n.type==='table').length,0);
    f.data.blocked=true;await f.Vue.nextTick();await readButton(f.root).props.onClick();assert.equal(calls,0);
    f.data.blocked=false;await f.Vue.nextTick();const read=readButton(f.root).props.onClick();await f.Vue.nextTick();
    assert.equal(calls,1);assert.equal(readButton(f.root).props.disabled,true);await readButton(f.root).props.onClick();assert.equal(calls,1);
    d.resolve(parseStartupDiagnostics(packet()));await read;await f.Vue.nextTick();
    assert.match(text(f.root),/101 ms/);assert.equal(nodes(f.root).filter(n=>n.type==='tbody')[0].children.filter(n=>n.type==='tr').length,6);assert.deepEqual(f.busy,[true,false]);
    f.data.locale='en_US';await f.Vue.nextTick();assert.match(text(f.root),/Application startup times/);assert.equal(calls,1);
    f.data.connected=false;await f.Vue.nextTick();assert.doesNotMatch(text(f.root),/101 ms/);assert.match(text(f.root),/Disconnected/);
  }finally{f.app.unmount();}
});
test('unsupported, malformed, failed and partial reads have distinct states without stale data',async()=>{
  const f=await mount();
  try {
    for(const [result,pattern]of [[parseStartupDiagnostics(packet(7)),/Nicht aufgezeichnet/],[null,/keine Startzeiten/],[{},/nicht gültig/]]){
      f.data.readDiagnostics=async()=>result;await f.Vue.nextTick();await readButton(f.root).props.onClick();await f.Vue.nextTick();assert.match(text(f.root),pattern);
      if(result===null||!result.schemaVersion)assert.equal(nodes(f.root).filter(n=>n.type==='table').length,0);
    }
    f.data.readDiagnostics=async()=>{throw new Error('SECRET');};await f.Vue.nextTick();await readButton(f.root).props.onClick();await f.Vue.nextTick();
    assert.match(text(f.root),/nicht gültig/);assert.doesNotMatch(text(f.root),/SECRET/);
  }finally{f.app.unmount();}
});
test('export uses the existing host dialog event, is explicit and cannot emit cleared or unread observations',async()=>{
  let calls=0;const reports=[];
  const f=await mount({readDiagnostics:async()=>{calls++;return{...parseStartupDiagnostics(packet()),deviceId:'SECRET'};},onExport:report=>reports.push(report)});
  const exportButton=()=>nodes(f.root).filter(n=>n.type==='button')[1];
  try{
    await exportButton().props.onClick();assert.equal(reports.length,0);assert.equal(calls,0);
    await readButton(f.root).props.onClick();await f.Vue.nextTick();assert.equal(calls,1);assert.equal(reports.length,0);
    await exportButton().props.onClick();assert.equal(reports.length,1);assert.equal(calls,1);
    assert.deepEqual(reports[0].startup,parseStartupDiagnostics(packet()));assert.match(reports[0].observedAt,/^\d{4}-/);assert.doesNotMatch(JSON.stringify(reports),/SECRET/);
    f.data.generation++;await f.Vue.nextTick();await exportButton().props.onClick();assert.equal(reports.length,1);
    assert.equal(exportButton().props.disabled,true);
  }finally{f.app.unmount();}
});
test('disconnect, generation changes, and unmount ignore both late success and late failure without unlocking newer work',async()=>{
  for(const outcome of ['resolve','reject'])for(const kind of ['disconnect','generation','unmount']){
    const d=deferred(),f=await mount({readDiagnostics:()=>d.promise});const old=readButton(f.root).props.onClick();
    if(kind==='unmount')f.app.unmount();else {if(kind==='disconnect')f.data.connected=false;else f.data.generation++;await f.Vue.nextTick();}
    assert.deepEqual(f.busy,[true,false]);
    let next,pending;
    if(kind!=='unmount'){
      f.data.connected=true;pending=deferred();f.data.readDiagnostics=()=>pending.promise;await f.Vue.nextTick();next=readButton(f.root).props.onClick();await f.Vue.nextTick();
    }
    outcome==='resolve'?d.resolve(parseStartupDiagnostics(packet())):d.reject(new Error('old'));
    await old;await f.Vue.nextTick();assert.deepEqual(f.busy,kind==='unmount'?[true,false]:[true,false,true]);
    assert.doesNotMatch(text(f.root),/101 ms|nicht gültig/);
    if(next){pending.resolve(null);await next;assert.deepEqual(f.busy,[true,false,true,false]);f.app.unmount();}
  }
});
