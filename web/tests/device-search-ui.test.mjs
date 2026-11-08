import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

// Compile the actual SFC and mount it with Vue's real renderer/reactivity. The
// small host records elements/events instead of accessing a browser or network.
async function component(filename) {
  const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
  let source=compileScript(descriptor,{id:filename}).content.replace('export default','const Component =');
  const template=compileTemplate({source:descriptor.template.content,id:filename,filename,compilerOptions:{hoistStatic:false}});assert.deepEqual(template.errors,[]);
  source+='\n'+template.code.replace('export function render','function render')+'\nComponent.render=render;export default Component;';
  const imports=[];
  source=source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g,(_,binding,spec)=>{
    imports.push({binding,spec}); return '';
  });
  const values=[];
  for (const {spec} of imports) {
    // Native v-model DOM listeners belong to Vue's browser adapter. This
    // renderer drives the compiled onUpdate:modelValue handlers directly.
    if(spec==='vue') values.push({...Vue,vModelText:{},vModelSelect:{},vModelCheckbox:{}});
    else if(spec==='vue-i18n') values.push(VueI18n);
    else {
      const target=path.resolve(path.dirname(filename),spec);
      values.push(spec.endsWith('.vue')?{default:await component(target)}:spec.endsWith('.json')?{default:JSON.parse(fs.readFileSync(target,'utf8'))}:await import(pathToFileURL(target)));
    }
  }
  const bindings=imports.map(({binding},index)=>binding.startsWith('{')
    ? `const ${binding.replace(/\s+as\s+/g,':')}=modules[${index}];`
    : `const ${binding}=modules[${index}].default;`).join('\n');
  return new Function('modules',`${bindings}\n${source.replace('export default','return')}`)(values);
}
function hostNode(type,text='') { return {type,text,props:{},children:[],parent:null}; }
const renderer=Vue.createRenderer({
  createElement:tag=>hostNode(tag),createText:text=>hostNode('#text',text),createComment:text=>hostNode('#comment',text),
  setText:(node,text)=>node.text=text,setElementText:(node,text)=>{node.text=text;node.children=[];},
  patchProp:(node,key,previous,next)=>node.props[key]=next,
  insert(node,parent,anchor=null){ if(node.parent){ const old=node.parent.children.indexOf(node); if(old>=0)node.parent.children.splice(old,1); } node.parent=parent;const index=anchor?parent.children.indexOf(anchor):-1;index<0?parent.children.push(node):parent.children.splice(index,0,node); },
  remove(node){ const index=node.parent?.children.indexOf(node);if(index>=0)node.parent.children.splice(index,1);node.parent=null; },
  parentNode:node=>node.parent,nextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]||null
});
function nodes(node,type){ return [node,...node.children.flatMap(child=>nodes(child))].filter(item=>!type||item.type===type); }
function text(node){ return node.text+node.children.map(text).join(''); }
async function mount(name,props={}){
  const Comp=await component(fileURLToPath(new URL(`../src/components/${name}.vue`,import.meta.url)));
  const state=Vue.reactive(props), root=hostNode('root');
  const app=renderer.createApp({render:()=>Vue.h(Comp,state)});
  app.use(VueI18n.createI18n({legacy:false,locale:'de_DE',messages:{de_DE:{}}}));
  app.mount(root);await Vue.nextTick();return{root,state,app};
}
async function click(root,label){ const button=nodes(root,'button').find(node=>text(node)===label);assert.ok(button,label);button.props.onClick();await Vue.nextTick(); }

test('device card renders a measured zero but hides an unavailable folder count or drive', async () => {
  const {root, state, app} = await mount('DeviceStorageCard', {connected:true, directory:'I:/', entries:null, drive:null, locale:'en'});
  const count = () => nodes(root, 'span').find(node => node.props.class === 'device-count');
  try {
    assert.equal(count(), undefined);
    assert.deepEqual(nodes(root, 'meter'), []);
    state.entries = 0; await Vue.nextTick();
    assert.equal(text(count()), '0 entries');
    state.locale = 'de_DE'; state.entries = 1; await Vue.nextTick();
    assert.equal(text(count()), '1 Eintrag');
    state.entries = null; await Vue.nextTick();
    assert.equal(count(), undefined);
  } finally { app.unmount(); }
});

test('a single selected file without metadata is read on demand and cannot deliver an old preview after reconnect',async()=>{
 const reads=[],bytes=new Uint8Array(540);
 bytes[0]=4;bytes[3]=0x88^4;bytes[91]=2;
 let finish;
 const {root,state,app}=await mount('DeviceSearch',{connected:true,generation:1,directory:'E:/',getSession:()=>({
  readDirectory:async()=>[{name:'custom.bin',type:0,size:540,meta:{}}],
  readFile:(name,options)=>{reads.push([name,options.maxBytes]);return new Promise(resolve=>finish=resolve);}
 })});
 try{
  nodes(root,'input')[0].props['onUpdate:modelValue']('custom');
  await Vue.nextTick();await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();
  const item=nodes(root,'button').find(node=>text(node).includes('custom.bin'));
  assert.equal(reads.length,0);
  const selected=item.props.onClick();finish(bytes);await selected;await Vue.nextTick();
  assert.match(text(root),/ID aus dem Dateiinhalt/);assert.equal(nodes(root,'img').length,1);
  await item.props.onClick();const late=item.props.onClick();
  state.generation=2;await Vue.nextTick();finish(bytes);await late;await Vue.nextTick();
  assert.equal(nodes(root,'img').length,0);assert.deepEqual(reads,[['E:/custom.bin',540],['E:/custom.bin',540]]);
 }finally{app.unmount();}
});


test('device search UI reads local catalogue metadata, emits navigation and keeps no results across sessions',async()=>{
 const busy=[],navigations=[],reads=[];
 const {root,state,app}=await mount('DeviceSearch',{connected:true,generation:4,directory:'E:/',getSession:()=>({readDirectory:async p=>{reads.push(p);return [{name:'Original.BIN',type:0,meta:{amiibo:{head:0,tail:2}}}];}}),onBusy:v=>busy.push(v),onNavigate:v=>navigations.push(v)});
 try{
  nodes(root,'input')[0].props['onUpdate:modelValue']('mario');await Vue.nextTick();
  await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();
  assert.match(text(root),/Mario/);assert.match(text(root),/Suche abgeschlossen/);assert.deepEqual(reads,['E:/']);assert.deepEqual(busy,[true,false]);
  const result=nodes(root,'button').find(n=>text(n).includes('Original.BIN'));await result.props.onClick();await Vue.nextTick();
  assert.match(nodes(root,'img')[0].props.src,/icon_00000000-00000002\.png$/);
  assert.equal(navigations.length,0);assert.deepEqual(reads,['E:/']);
  await click(root,'Im Ordner anzeigen');assert.equal(navigations[0].generation,4);assert.equal(navigations[0].path,'E:/Original.BIN');
  state.generation=5;await Vue.nextTick();assert.doesNotMatch(text(root),/Original.BIN/);
 }finally{app.unmount();}
});
test('each file result can download directly while the search and preview stay open', async () => {
  const downloads = [];
  const {root, state, app} = await mount('DeviceSearch', {
    connected: true, generation: 9, directory: 'E:/Tags',
    getSession: () => ({readDirectory: async () => [
      {name:'Mario', type:1}, {name:'Mario.bin', type:0, size:540, meta:{amiibo:{head:0,tail:2}}}
    ]}),
    onDownload: result => downloads.push(result)
  });
  try {
    nodes(root, 'input')[0].props['onUpdate:modelValue']('Mario');
    nodes(root, 'select')[0].props['onUpdate:modelValue']('folder');
    await Vue.nextTick();
    await nodes(root, 'form')[0].props.onSubmit({preventDefault() {}});
    await Vue.nextTick();
    const fileButton = nodes(root, 'button').find(node => text(node).includes('Mario.bin'));
    const actions = nodes(root, 'button').filter(node => text(node) === 'Vom Gerät herunterladen');
    assert.equal(actions.length, 1);
    assert.match(actions[0].props['aria-label'], /E:\/Tags\/Mario\.bin/);
    await click(root, 'Vom Gerät herunterladen');
    assert.equal(downloads[0].path, 'E:/Tags/Mario.bin');
    assert.equal(downloads[0].generation, 9);
    await fileButton.props.onClick(); await Vue.nextTick();
    state.blocked = true; state.locale = 'en'; await Vue.nextTick();
    assert.ok(actions[0].props.disabled);
    await click(root, 'Download from device');
    assert.equal(downloads.length, 1);
    state.blocked = false; await Vue.nextTick();
    await click(root, 'Download from device');
    assert.equal(downloads.length, 2);
    assert.equal(fileButton.props['aria-expanded'], true);
    assert.equal(nodes(root, 'li').length, 2);
    state.generation++; await Vue.nextTick();
    actions[0].props.onClick();
    assert.equal(downloads.length, 2);
  } finally { app.unmount(); }
});
test('in-flight stale search cannot overwrite a new connection or emit busy late',async()=>{
 let finish;const busy=[];const {root,state,app}=await mount('DeviceSearch',{connected:true,generation:1,directory:'E:/',getSession:()=>({readDirectory:()=>new Promise(r=>finish=r)}),onBusy:v=>busy.push(v)});
 try{
  nodes(root,'input')[0].props['onUpdate:modelValue']('mario');await Vue.nextTick();const running=nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();
  state.connected=false;state.generation=2;await Vue.nextTick();const count=busy.length;finish([{name:'Mario.bin',type:0,meta:{}}]);await running;await Vue.nextTick();assert.equal(busy.length,count);assert.doesNotMatch(text(root),/Mario.bin|Suche abgeschlossen/);
 }finally{app.unmount();}
});
test('current-folder search honors selected scope; blocked search issues no request',async()=>{
 let reads=0;const {root,state,app}=await mount('DeviceSearch',{connected:true,blocked:true,generation:1,directory:'E:/Tags',getSession:()=>({readDirectory:async path=>{++reads;assert.equal(path,'E:/Tags');return [{name:'child',type:1,meta:{}}];}})});
 try{
  nodes(root,'input')[0].props['onUpdate:modelValue']('child');nodes(root,'select')[0].props['onUpdate:modelValue']('folder');await Vue.nextTick();
  await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});assert.equal(reads,0);state.blocked=false;await Vue.nextTick();await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();assert.equal(reads,1);assert.match(text(root),/child/);
 }finally{app.unmount();}
});
test('cancel keeps completed-folder results and releases busy only after pending read settles',async()=>{
 let finish;const busy=[];const {root,app}=await mount('DeviceSearch',{connected:true,generation:1,directory:'E:/',getSession:()=>({readDirectory:async path=>path==='E:/'?[{name:'Mario.bin',type:0,meta:{}},{name:'child',type:1,meta:{}}]:new Promise(r=>finish=r)}),onBusy:v=>busy.push(v)});
 try{
  nodes(root,'input')[0].props['onUpdate:modelValue']('mario');await Vue.nextTick();const pending=nodes(root,'form')[0].props.onSubmit({preventDefault(){}});for(let n=0;n<5&&!finish;n++)await Vue.nextTick();
  await click(root,'Abbrechen');assert.deepEqual(busy,[true]);finish([]);await pending;await Vue.nextTick();assert.match(text(root),/Suche abgebrochen/);assert.match(text(root),/Mario.bin/);assert.deepEqual(busy,[true,false]);
 }finally{app.unmount();}
});

test('content search checkbox is off by default and explicitly resolves missing IDs without mutation',async()=>{
 let reads=0;const bytes=new Uint8Array(540);bytes[0]=4;bytes[3]=0x88^4;bytes[91]=2;
 const {root,app}=await mount('DeviceSearch',{connected:true,generation:1,directory:'E:/',getSession:()=>({
  readDirectory:async()=>[{name:'anonymous.bin',type:0,size:540,meta:{}}],readFile:async(path,{maxBytes})=>{++reads;assert.equal(path,'E:/anonymous.bin');assert.equal(maxBytes,540);return bytes;}
 })});
 try{
  const checkbox=nodes(root,'input').find(n=>n.props.type==='checkbox');assert.ok(checkbox);
  nodes(root,'input').find(n=>n.props.type==='search').props['onUpdate:modelValue']('mario');await Vue.nextTick();
  await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();assert.equal(reads,0);assert.doesNotMatch(text(root),/anonymous.bin/);
  checkbox.props['onUpdate:modelValue'](true);await Vue.nextTick();assert.match(text(root),/128 Dateien \/ 256 KiB/);
  assert.doesNotMatch(text(root),/Keine BIN-Dateien werden heruntergeladen/);
  await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();
  assert.equal(reads,1);assert.match(text(root),/anonymous.bin/);assert.match(text(root),/Mario/);assert.match(text(root),/1 BIN-Dateien gelesen · 540 B/);
 }finally{app.unmount();}
});
test('content read cancellation and session replacement keep the actual component locked until its request drains',async()=>{
 for(const replacement of [false,true]){
  let finish;const busy=[],bytes=new Uint8Array(540);bytes[0]=4;bytes[3]=0x88^4;bytes[91]=2;
  const {root,state,app}=await mount('DeviceSearch',{connected:true,generation:1,directory:'E:/',onBusy:value=>busy.push(value),getSession:()=>({
   readDirectory:async()=>[{name:'anonymous.bin',type:0,size:540,meta:{}}],readFile:()=>new Promise(resolve=>finish=resolve)
  })});
  try{
   nodes(root,'input').find(n=>n.props.type==='search').props['onUpdate:modelValue']('mario');
   nodes(root,'input').find(n=>n.props.type==='checkbox').props['onUpdate:modelValue'](true);await Vue.nextTick();
   const pending=nodes(root,'form')[0].props.onSubmit({preventDefault(){}});
   while(!finish)await Vue.nextTick();
   assert.equal(nodes(root,'input').find(n=>n.props.type==='checkbox').props.disabled,true);
   if(replacement){state.connected=false;state.generation=2;await Vue.nextTick();}
   else{await click(root,'Abbrechen');assert.deepEqual(busy,[true]);}
   const count=busy.length;finish(bytes);await pending;await Vue.nextTick();assert.doesNotMatch(text(root),/anonymous.bin/);
   if(replacement)assert.equal(busy.length,count);else{assert.deepEqual(busy,[true,false]);assert.match(text(root),/Suche abgebrochen/);}
  }finally{app.unmount();}
 }
});

test('device search uses the active online catalogue without downloading tag contents',async()=>{
 const id='f123456700000002', reads=[], navigations=[];
 const catalogue={commit:'a'.repeat(40),entries:[{id,name:'Future Figure Review Fixture',series:'New Series',game:'New Game'}]};
 const {root,app}=await mount('DeviceSearch',{catalogue,connected:true,generation:3,directory:'E:/',onNavigate:value=>navigations.push(value),getSession:()=>({
  readDirectory:async path=>{reads.push(path);return[{name:'anonymous.bin',type:0,size:540,meta:{amiibo:{head:0xf1234567,tail:2}}}];},
  readFile:async()=>{throw Error('Metadata search must not read a BIN');}
 })});
 try{
  nodes(root,'input').find(n=>n.props.type==='search').props['onUpdate:modelValue']('future figure');await Vue.nextTick();
  await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();
  assert.deepEqual(reads,['E:/']);assert.match(text(root),/Future Figure Review Fixture/);assert.match(text(root),/New Series/);
  await nodes(root,'button').find(n=>text(n).includes('anonymous.bin')).props.onClick();await Vue.nextTick();
  assert.match(nodes(root,'img')[0].props.src,/a{40}\/images\/icon_f1234567-00000002/);
  await click(root,'Im Ordner anzeigen');
  assert.equal(navigations[0].id,id);assert.equal(navigations[0].path,'E:/anonymous.bin');
 }finally{app.unmount();}
});

test('catalogue replacement cancels stale search results but keeps BLE busy until the pending read drains',async()=>{
 let finish,reads=0;const busy=[];
 const entry={id:'f123456700000002',name:'Old Fixture',series:'Series'};
 const {root,state,app}=await mount('DeviceSearch',{catalogue:{entries:[entry]},connected:true,generation:1,directory:'E:/',onBusy:value=>busy.push(value),getSession:()=>({
  readDirectory:()=>{++reads;return new Promise(resolve=>finish=resolve);}
 })});
 try{
  nodes(root,'input').find(n=>n.props.type==='search').props['onUpdate:modelValue']('fixture');await Vue.nextTick();
  const pending=nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();
  state.catalogue={entries:[{...entry,name:'Updated Fixture'}]};await Vue.nextTick();
  assert.deepEqual(busy,[true]);assert.match(text(root),/Katalog aktualisiert/);
  await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});assert.equal(reads,1);
  finish([{name:'anonymous.bin',type:0,meta:{amiibo:{head:0xf1234567,tail:2}}}]);await pending;await Vue.nextTick();
  assert.deepEqual(busy,[true,false]);assert.equal(reads,1);assert.doesNotMatch(text(root),/anonymous.bin/);assert.match(text(root),/Suche erneut starten/);
 }finally{app.unmount();}
});
