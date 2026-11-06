import { startupSeries, startupStorageIntervals, startupMountPresentation } from '../src/lib/startup-diagnostics.js';
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

function detailedPacket(mask, mount, journal, phaseMask=63) {
  const bytes = new Uint8Array(40), view = new DataView(bytes.buffer);
  bytes.set(packet(phaseMask)); bytes.set([2,40,phaseMask,mask],4);
  view.setUint32(32,mount,true); view.setUint32(36,journal,true);
  return bytes;
}
function mountPacket(flags=23,result=0) {
 const bytes=new Uint8Array(80),view=new DataView(bytes.buffer);bytes.set(detailedPacket(3,20,30));bytes.set([3,80],4);
 view.setUint32(40,flags,true);view.setInt32(44,result,true);
 [5,15,200,51200,800,180,20,0].forEach((n,i)=>view.setUint32(48+i*4,n,true));return bytes;
}
test('schema3 consumes the independently generated production C and DF-transport fixture',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/startup-de362-wire.json',import.meta.url),'utf8'));
 const actual=parseStartupDiagnostics(Uint8Array.from(Buffer.from(fixture.wireHex,'hex'))),expected=fixture.expected;
 assert.equal(actual.schemaVersion,3);assert.equal(actual.phaseMask,0);
 assert.deepEqual(actual.elapsedMilliseconds,[null,null,null,null,null,null]);
 assert.deepEqual(actual.storageElapsedMilliseconds,[null,null]);
 for(const field of ['flags','result','configureMilliseconds','scanMilliseconds','physicalReadAttempts','cacheHits','bypassReads','physicalReadErrors'])
  assert.equal(actual.mount[field],expected[field],field);
 assert.equal(actual.mount.physicalReadBytes,expected.successfulReadBytes);
 assert.equal(actual.mount.cacheMisses,expected.eligibleCacheMisses);
 assert.equal(fixture.deviceAccess,false);
});
test('schema3 mount profile retains counters and signed result, uses exact bounds and preserves legacy comparisons',()=>{
 const bytes=mountPacket(),p=parseStartupDiagnostics(bytes),padded=new Uint8Array(90);padded.set(bytes,5);
 assert.deepEqual(parseStartupDiagnostics(padded.subarray(5,85)),p);
 assert.deepEqual(p.mount,{scope:'last-packedfs-mount',flags:23,result:0,configureMilliseconds:5,scanMilliseconds:15,
  physicalReadAttempts:200,physicalReadBytes:51200,cacheHits:800,cacheMisses:180,bypassReads:20,physicalReadErrors:0});
 assert(Object.isFrozen(p.mount));assert.deepEqual(startupStorageIntervals(p).map(r=>r.milliseconds),[20,10,7]);
 assert.deepEqual(compareStartup({startup:parseStartupDiagnostics(detailedPacket(3,20,30))},p).storageIntervals.map(r=>r.milliseconds),[0,0,0]);
 assert.equal(parseStartupDiagnostics(mountPacket(17,-12)).mount.result,-12);
 const noTime=parseStartupDiagnostics(mountPacket(3));assert.equal(noTime.mount.configureMilliseconds,null);
 assert.match(startupMountPresentation(noTime).rows[1][1],/Nicht gemessen/);
 assert.match(startupMountPresentation(parseStartupDiagnostics(mountPacket(31)),'en').note,/lower bounds/);
 assert.match(startupMountPresentation(parseStartupDiagnostics(mountPacket(31))).rows[4][1],/≥ 200/);
 const empty=mountPacket();empty.fill(0,40);const absent=parseStartupDiagnostics(empty);assert.equal(absent.mount,null);
 assert.equal(startupMountPresentation(absent).rows.length,0);assert.match(startupMountPresentation(absent).note,/Fehlende Werte/);
 for(const [offset,n] of [[4,4],[5,79],[40,0],[40,2],[40,55],[44,1]]){const b=mountPacket();new DataView(b.buffer).setUint8(offset,n);assert.throws(()=>parseStartupDiagnostics(b));}
 for(const n of [79,81,96])assert.throws(()=>parseStartupDiagnostics(new Uint8Array(n)));
 for(const patch of [{mount:undefined},{mount:{...p.mount,scope:'boot'}},{mount:{...p.mount,flags:0}},
  {mount:{...p.mount,cacheHits:-1}},{mount:{...p.mount,cacheHits:0x100000000}},{mount:{...p.mount,scanMilliseconds:null}}])
  assert.equal(normalizeStartupDiagnostics({...p,...patch}),null);
 const dirty={...p,mount:{...p.mount,deviceId:'SECRET'}};
 assert.doesNotMatch(JSON.stringify(createStartupDiagnosticReport(dirty,'2026-11-06T12:00:00.000Z')),/SECRET/);
});
test('extended wire snapshots export a bounded storage breakdown and compare with both schemas', () => {
  const original=parseStartupDiagnostics(packet());
  const current=parseStartupDiagnostics(detailedPacket(3,20,30));
  const prior=parseStartupDiagnostics(detailedPacket(3,24,32));
  assert.deepEqual(startupStorageIntervals(current).map(row=>row.milliseconds), [20,10,7]);
  assert.deepEqual(compareStartup({startup:original},current),{storage:0,total:0});
  assert.deepEqual(compareStartup({startup:current},original),{storage:0,total:0});
  assert.deepEqual(compareStartup({startup:prior},current).storageIntervals.map(row=>row.milliseconds),[-4,2,2]);
  assert.deepEqual(createStartupDiagnosticReport(current,'2026-11-05T10:00:00.000Z').startup.storageElapsedMilliseconds,[20,30]);
  assert.deepEqual(startupStorageIntervals(parseStartupDiagnostics(detailedPacket(1,0,0))).map(row=>row.milliseconds),[0,null,null]);
  assert.deepEqual(startupStorageIntervals(parseStartupDiagnostics(detailedPacket(0,0,0))).map(row=>row.milliseconds),[null,null,null]);
  for (const args of [[2,0,30],[1,5,10],[3,23,22],[3,22,38],[3,0,0,0],[0,1,0]]) {
    assert.throws(()=>parseStartupDiagnostics(detailedPacket(...args)));
  }
});
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
test('actual startup panel renders profile evidence and clears it on a fresh unsupported read',async()=>{
 const f=await mount({readDiagnostics:async()=>parseStartupDiagnostics(mountPacket())});
 try{
  await readButton(f.root).props.onClick();await f.Vue.nextTick();
  assert.match(text(f.root),/Laufwerk einbinden: Zeit und Lesezugriffe/);assert.match(text(f.root),/51200 B/);
  assert.match(text(f.root),/kein Messzeitpunkt/);assert.match(text(f.root),/Temporärer Lesecache erhalten/);
  f.data.locale='ja_JP';await f.Vue.nextTick();assert.match(text(f.root),/Mounting the drive/);
  f.data.readDiagnostics=async()=>parseStartupDiagnostics(packet());await f.Vue.nextTick();
  await readButton(f.root).props.onClick();await f.Vue.nextTick();assert.doesNotMatch(text(f.root),/Mounting the drive|51200 B/);
 }finally{f.app.unmount();}
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

test('cold starts: equal firmware, independent marker sets, protected median/range and legacy fallback', () => {
  const sample = t => createStartupDiagnosticReport(parseStartupDiagnostics(packet(63,[0,t,t+3,t+50,t+50,t+55])),
    '2026-11-04T10:00:00.000Z','2.22.0-DE3.59');
  const a=sample(2100), b=sample(2300), c=sample(2200), d=sample(2000);
  assert.deepEqual(startupSeries([a,b,c]).storage,{min:2100,median:2200,max:2300});
  assert.equal(startupSeries([a,b,c,d]).total.median,2205);
  for (const list of [[a,b],[a,b,{...a,observedAt:'later'}],[a,b,{...c,firmwareVersion:null}],
    [a,b,{...c,firmwareVersion:'2.22.0-DE3.58'}],[a,b,{...c,startup:null}]]) assert.equal(startupSeries(list),null);
});
