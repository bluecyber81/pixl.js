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


test('device search UI reads local catalogue metadata, emits navigation and keeps no results across sessions',async()=>{
 const busy=[],navigations=[],reads=[];
 const {root,state,app}=await mount('DeviceSearch',{connected:true,generation:4,directory:'E:/',getSession:()=>({readDirectory:async p=>{reads.push(p);return [{name:'Original.BIN',type:0,meta:{amiibo:{head:0,tail:2}}}];}}),onBusy:v=>busy.push(v),onNavigate:v=>navigations.push(v)});
 try{
  nodes(root,'input')[0].props['onUpdate:modelValue']('mario');await Vue.nextTick();
  await nodes(root,'form')[0].props.onSubmit({preventDefault(){}});await Vue.nextTick();
  assert.match(text(root),/Mario/);assert.match(text(root),/Suche abgeschlossen/);assert.deepEqual(reads,['E:/']);assert.deepEqual(busy,[true,false]);
  const result=nodes(root,'button').find(n=>text(n).includes('Original.BIN'));result.props.onClick();assert.equal(navigations[0].generation,4);assert.equal(navigations[0].path,'E:/Original.BIN');
  state.generation=5;await Vue.nextTick();assert.doesNotMatch(text(root),/Original.BIN/);
 }finally{app.unmount();}
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
