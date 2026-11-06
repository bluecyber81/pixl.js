import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import * as Vue from 'vue';
import * as VueI18n from 'vue-i18n';
import { parse, compileScript } from '@vue/compiler-sfc';

// Compile the actual SFC and mount it with Vue's real renderer/reactivity. The
// small host records elements/events instead of accessing a browser or network.
async function component(filename) {
  const {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
  let source=compileScript(descriptor,{id:filename,inlineTemplate:true}).content;
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


test('selection preview immediately requests only public figure image and keeps paths out of request',async()=>{
 const selection={row:{name:'Private-owner-name.bin',sizeBytes:540,notes:'Local note'},path:'E:/Private/Private-owner-name.bin',id:'0000000000000002',state:'ready',source:'metadata'};
 const {root,app}=await mount('SelectionPreview',{selection});
 try{const img=nodes(root,'img')[0];assert.ok(img);assert.match(img.props.src,/icon_00000000-00000002\.png$/);assert.equal(img.props.referrerpolicy,'no-referrer');assert.doesNotMatch(img.props.src,/Private|owner|Local/);assert.equal(img.props.alt,'Mario');assert.match(text(root),/Dateiinhalt ungeprüft/);}finally{app.unmount();}
});
test('selection changes never retain previous image and a stale image error cannot hide the new figure',async()=>{
 const selection=id=>({row:{name:'Tag.bin',sizeBytes:540},id,state:'ready',source:'metadata'});
 const {root,state,app}=await mount('SelectionPreview',{selection:selection('0000000000000002')});
 try{const old=nodes(root,'img')[0];state.selection=selection('01010000000e0002');await Vue.nextTick();const current=nodes(root,'img')[0];assert.equal(current.props.alt,'Zelda');old.props.onError({target:{getAttribute:()=>old.props.src}});await Vue.nextTick();assert.equal(nodes(root,'img').length,1);current.props.onError({target:{getAttribute:()=>current.props.src}});await Vue.nextTick();assert.equal(nodes(root,'img').length,0);assert.match(text(root),/Bild nicht verfügbar/);await click(root,'Erneut laden');assert.equal(nodes(root,'img')[0].props.alt,'Zelda');state.selection=null;await Vue.nextTick();assert.equal(nodes(root,'img').length,0);}finally{app.unmount();}
});
test('unknown, malformed and unsupported file previews have no guessed image',async()=>{
 const {root,state,app}=await mount('SelectionPreview',{selection:{row:{name:'Unknown.bin',sizeBytes:540},id:'ffffffffffffffff',state:'ready'}});
 try{assert.equal(nodes(root,'img').length,0);assert.match(text(root),/unbekannt/);state.selection={row:{name:'Bad.bin',sizeBytes:540},id:null,state:'invalid'};await Vue.nextTick();assert.match(text(root),/Dateistruktur ist auffällig/);assert.equal(nodes(root,'img').length,0);state.selection={row:{name:'Other.dat',sizeBytes:12},id:null,state:'unsupported'};await Vue.nextTick();assert.match(text(root),/Keine unterstützte/);}finally{app.unmount();}
});

test('offline selected example states catalogue-only origin and leaves device actions disabled',async()=>{
 const {root,app}=await mount('SelectionPreview',{selection:{row:{name:'Demo-Mario.bin',sizeBytes:540},id:'0000000000000002',state:'ready',source:'demo'},blocked:true});
 try{assert.equal(nodes(root,'img')[0].props.alt,'Mario');assert.match(text(root),/Keine? Gerät|Kein Gerät/);assert.match(text(root),/keine Figurendatei gelesen oder erzeugt/);const actions=nodes(root,'button').filter(button=>['Eigenschaften & QR','Datei herunterladen'].includes(text(button)));assert.equal(actions.length,2);for(const button of actions)assert.equal(button.props.disabled,true);const expand=nodes(root,'button').find(button=>text(button).startsWith('Alle '));assert.ok(expand);assert.notEqual(expand.props.disabled,true);expand.props.onClick();await Vue.nextTick();assert.match(text(root),/Weniger anzeigen/);}finally{app.unmount();}
});

test('an online catalogue addition resolves the selected figure and pins its image to the same revision',async()=>{
 const id='f123456700000002',commit='a'.repeat(40);
 const selection={row:{name:'Private-name.bin',sizeBytes:540,notes:'Local only'},id,state:'ready',source:'metadata'};
 const {root,state,app}=await mount('SelectionPreview',{selection});
 try{
  assert.equal(nodes(root,'img').length,0);assert.match(text(root),/unbekannt/);
  state.catalogue={commit,entries:[{id,name:'Future Figure Review Fixture',series:'New Series'}]};await Vue.nextTick();
  const img=nodes(root,'img')[0];assert.ok(img);assert.equal(img.props.alt,'Future Figure Review Fixture');
  assert.ok(img.props.src.includes('/'+commit+'/images/'));assert.match(img.props.src,/icon_f1234567-00000002\.png$/);
  assert.doesNotMatch(img.props.src,/Private|Local/);assert.equal(img.props.referrerpolicy,'no-referrer');
 }finally{app.unmount();}
});

test('same-ID catalogue image revisions clear failures and ignore errors from older URLs',async()=>{
 const id='f123456700000002',entry={id,name:'Fixture',series:'Series'};
 const {root,state,app}=await mount('SelectionPreview',{selection:{row:{name:'Fixture.bin',sizeBytes:540},id,state:'ready'},catalogue:{commit:'a'.repeat(40),entries:[entry]}});
 try{
  const first=nodes(root,'img')[0];first.props.onError({target:{getAttribute:()=>first.props.src}});await Vue.nextTick();assert.equal(nodes(root,'img').length,0);
  state.catalogue={commit:'b'.repeat(40),entries:[entry]};await Vue.nextTick();const updated=nodes(root,'img')[0];
  assert.ok(updated.props.src.includes('/'+'b'.repeat(40)+'/images/'));
  first.props.onError({target:{getAttribute:()=>first.props.src}});await Vue.nextTick();assert.equal(nodes(root,'img').length,1);
  state.catalogue={commit:'https://example.invalid/private',entries:[entry]};await Vue.nextTick();
  assert.match(nodes(root,'img')[0].props.src,/^https:\/\/raw\.githubusercontent\.com\/8bitDream\/AmiiboAPI\/[a-f0-9]{40}\//);
  assert.doesNotMatch(nodes(root,'img')[0].props.src,/example\.invalid/);
  state.selection={row:{name:'Bad.bin',sizeBytes:540},id:'invalid',state:'invalid'};state.catalogue={entries:[{id:'invalid',name:'Wrong name'}]};await Vue.nextTick();
  assert.equal(nodes(root,'img').length,0);assert.doesNotMatch(text(root),/Wrong name/);
 }finally{app.unmount();}
});
