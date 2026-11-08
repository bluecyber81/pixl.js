import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript } from '@vue/compiler-sfc';

const A='0000000000000102', B='0000000000000202';
const baseline={commit:'a'.repeat(40),checkedDate:'2026-11-02',sourceUrl:'https://github.com/8bitDream/AmiiboAPI',entries:[A,B].map(id=>({id,name:`Synthetic ${id}`,series:'Test',release:{eu:'2020-01-01'}}))};
const report=(changes={})=>({schema:1,rootPath:'E:/',mode:'full',status:'complete',complete:true,scanComplete:true,contentComplete:true,
  cancelled:false,sessionChanged:false,errors:[],limitsReached:[],stats:{readErrors:0,invalidEntries:0},
  present:[{id:A,contentConfirmed:true,paths:['E:/a.bin']}],missing:[{id:B,state:'no-structurally-consistent-file-observed'}],
  files:[{id:A,metadataId:A,path:'E:/a.bin',size:540,status:'structure-consistent',issues:[],formatContext:'classic-540'}],metadataMismatches:[],...changes});
const appSource=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8');
const appDescriptor=parse(appSource).descriptor;
const node=()=>({children:[],parent:null});
const renderer=Vue.createRenderer({createElement:node,createText:node,createComment:node,setText(){},setElementText(){},patchProp(){},
  insert(n,p){n.parent=p;p.children.push(n);},remove(){},parentNode:n=>n.parent,nextSibling:()=>null});
function mountApp(){
  let connects=0;
  const options=new Function('defineAsyncComponent','DeviceStorageCard','catalogueBaseline','proto','pixl','window',
    appDescriptor.script.content.replace(/^import .*$/gm,'').replace('export default','return'))(
      loader=>({loader}),{name:'DeviceStorageCard'},baseline,{get_version:async()=>({status:0,data:{ver:'2.22.0-DE3.55'}})},
      {get_connection_state:()=> 'disconnected',connect(){connects++;},disconnect(){}},
      { AllmiiboLanguage: { getMode: () => 'auto' } });
  const quiet={};
  for(const name of ['reset_figure_info','remember_interruption','clear_dfu_attempt','clear_migration_restart','refresh_local_metrics',
    'invalidate_sync','invalidate_zip','refresh_backup_checkpoint','set_transfer','reload_drive'])quiet[name]=()=>{};
  const app=renderer.createApp({data:options.data,computed:options.computed,watch:options.watch,methods:{...options.methods,...quiet},render:()=>Vue.h('div')});
  app.config.globalProperties.$t=x=>x;app.config.globalProperties.$notify=()=>{};
  app.config.globalProperties.$i18n = { locale: 'en' };
  const vm=app.mount(node());vm.connected=true;
  return {vm,app,get connects(){return connects;}};
}
const tick=async()=>{await Vue.nextTick();await Promise.resolve();};

test('idle disconnect keeps only a dated completed observation; child invalidation cannot erase or replace it',async()=>{
  const h=mountApp();
  try{
    h.vm.on_collection_report(report());const saved=h.vm.collectionObservation;
    assert.ok(Number.isFinite(Date.parse(saved.checkedAt)));
    assert.equal(h.vm.catalogueObservationHistorical,false);
    h.vm.on_ble_disconnected();h.vm.on_collection_report(null);h.vm.on_collection_stale(false);await tick();
    assert.equal(h.vm.collectionReport,null);assert.equal(h.vm.collectionObservation,saved);
    assert.equal(h.vm.catalogueObservationHistorical,true);assert.equal(h.vm.cataloguePresenceReport,saved.report);
    assert.equal(h.vm.catalogueObservationAt,saved.checkedAt);
    h.vm.on_collection_report(report({rootPath:'E:/old-late'}));await tick();
    assert.equal(h.vm.collectionReport,null);assert.equal(h.vm.collectionObservation,saved);
  }finally{h.app.unmount();}
});

test('partial, cancelled, session-changed, read-error and unsupported reports cannot become offline observations',async()=>{
  const h=mountApp();
  try{
    const invalid=[{status:'partial'},{status:'cancelled'},{cancelled:true},{sessionChanged:true},{complete:false},{scanComplete:false},
      {contentComplete:false},{errors:[{}]},{limitsReached:['entries']},{stats:{readErrors:1}},{stats:{invalidEntries:1}},
      {schema:2},{files:null},{present:null},{missing:null},{errors:null},{limitsReached:null},{mode:'unknown'}];
    for(const change of invalid){h.vm.on_collection_report(report(change));assert.equal(h.vm.collectionObservation,null,JSON.stringify(change));}
    h.vm.on_ble_disconnected();await tick();assert.equal(h.vm.cataloguePresenceReport,null);
  }finally{h.app.unmount();}
});

test('all writes and revision changes discard the old observation, including immediate disconnect before watchers flush',async()=>{
  const h=mountApp();
  try{
    for(const field of ['mutating','pendingUploads','syncing','zipBusy','migrationBusy','collectionWriting']){
      h.vm.connected=true;h.vm.on_collection_report(report());assert.ok(h.vm.collectionObservation,field);
      h.vm[field]=field==='pendingUploads'?1:true;h.vm.on_ble_disconnected();await tick();
      assert.equal(h.vm.collectionObservation,null,field);assert.equal(h.vm.catalogueObservationHistorical,false,field);
      h.vm[field]=field==='pendingUploads'?0:false;await tick();
    }
    h.vm.connected=true;h.vm.on_collection_report(report());h.vm.collectionRevision++;await tick();assert.equal(h.vm.collectionObservation,null);
    h.vm.on_collection_report(report());h.vm.on_collection_stale(true);h.vm.on_ble_disconnected();await tick();assert.equal(h.vm.collectionObservation,null);
  }finally{h.app.unmount();}
});

test('connection attempt and accepted new session clear history before any new device read can finish',async()=>{
  const h=mountApp();
  try{
    h.vm.on_collection_report(report());h.vm.on_ble_disconnected();await tick();assert.ok(h.vm.collectionObservation);
    h.vm.on_btn_ble_connect();assert.equal(h.connects,1);assert.equal(h.vm.collectionObservation,null);assert.equal(h.vm.catalogueObservationHistorical,false);
    h.vm.connecting=false;h.vm.connected=true;h.vm.on_collection_report(report());assert.ok(h.vm.collectionObservation);
    await h.vm.on_ble_connected();await tick();assert.equal(h.vm.collectionObservation,null);assert.equal(h.vm.collectionReport,null);
  }finally{h.app.unmount();}
});

test('new scan and catalogue refresh cannot reuse an earlier completed observation',async()=>{
  const h=mountApp();
  try{
    h.vm.on_collection_report(report());h.vm.on_collection_report(null);assert.equal(h.vm.collectionObservation,null);
    h.vm.on_collection_report(report());h.vm.on_collection_catalogue({entries:baseline.entries,observedAt:'2026-11-02T12:00:00Z',source:{commit:'a'.repeat(40),url:'https://example.com'}});
    assert.equal(h.vm.collectionObservation,null);
  }finally{h.app.unmount();}
});

const components=new Map();
async function component(filename){
  if(components.has(filename))return components.get(filename);
  const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
  let source=compileScript(descriptor,{id:filename,inlineTemplate:true}).content;const imports=[];
  source=source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g,(_,binding,spec)=>{imports.push({binding,spec});return '';});
  const values=[];
  for(const {spec} of imports){
    if(spec==='vue')values.push(Vue);else if(spec==='vue-i18n')values.push(VueI18n);
    else{const target=path.resolve(path.dirname(filename),spec);values.push(spec.endsWith('.vue')?{default:await component(target)}:
      spec.endsWith('.json')?{default:JSON.parse(fs.readFileSync(target,'utf8'))}:await import(pathToFileURL(target)));}
  }
  const bindings=imports.map(({binding},i)=>binding.startsWith('{')?`const ${binding.replace(/\s+as\s+/g,':')}=modules[${i}];`:`const ${binding}=modules[${i}].default;`).join('\n');
  const value=new Function('modules',`${bindings}\n${source.replace('export default','return')}`)(values);components.set(filename,value);return value;
}
async function renderCatalogue(extra={},locale='de_DE'){
  const Comp=await component(fileURLToPath(new URL('../src/components/CataloguePanel.vue',import.meta.url)));
  const app=Vue.createSSRApp(Comp,{catalogue:baseline,collectionReport:report(),collectionHistorical:true,collectionObservedAt:'2026-11-02T12:34:56Z',...extra});
  app.use(VueI18n.createI18n({legacy:false,locale,messages:{[locale]:{}}}));return renderToString(app);
}

test('historical cards retain full borders but every card says last check and displays the observation date',async()=>{
  const html=await renderCatalogue();
  assert.match(html,/Gerät getrennt/);assert.match(html,/keinen aktuellen Live-Bestand/);
  assert.match(html,/data-presence="present"/);assert.match(html,/data-presence="missing"/);
  assert.equal((html.match(/class="observation-date"/g)||[]).length,2);
  assert.match(html,/Letzte Prüfung · ID gefunden/);assert.match(html,/Letzte Prüfung · Nicht gefunden/);
  assert.doesNotMatch(html,/Vorhanden · ID bestätigt/);
  assert.match(html,/2\.11\.2026/);
  const english=await renderCatalogue({},'en_GB');assert.match(english,/Last check · ID found/);assert.match(english,/not the current live collection/);
});

test('stale or undated history is neutral; folder or quick observations never gain red missing claims',async()=>{
  for(const extra of [{collectionStale:true},{collectionObservedAt:'not-a-date'}]){
    const html=await renderCatalogue(extra);assert.doesNotMatch(html,/data-presence="(?:present|attention|missing)"/);
    assert.match(html,/data-presence="stale"/);assert.doesNotMatch(html,/class="observation-date"/);
  }
  for(const changes of [{rootPath:'E:/subset'},{mode:'quick',contentComplete:false}]){
    const html=await renderCatalogue({collectionReport:report(changes)});assert.doesNotMatch(html,/data-presence="missing"/);
  }
  const attention=await renderCatalogue({collectionReport:report({files:[{...report().files[0],formatContext:'classic-without-final-eight-bytes'}]})});
  assert.match(attention,/data-presence="attention"/);assert.match(attention,/Letzte Prüfung · Prüfhinweis/);
});
