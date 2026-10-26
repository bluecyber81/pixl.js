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

test('figure images need opt-in for each identity; QR is local and resets on identity switch',async()=>{
  const {root,state,app}=await mount('FigureDetails',{id:'0000000000000002'});
  try {
    assert.equal(nodes(root,'img').length,0);
    assert.match(text(root),/Besitzer-, Spitznamen- und Spieldaten werden hier nicht entschlüsselt/);
    await click(root,'Info-QR-Code anzeigen');
    assert.match(nodes(root,'img')[0].props.src,/^data:image\/svg/);
    await click(root,'Bild einmal laden');
    const external=nodes(root,'img').find(node=>node.props.src.startsWith('https:'));
    assert.ok(external);assert.equal(external.props.referrerpolicy,'no-referrer');
    state.id='01010000000e0002';await Vue.nextTick();
    assert.equal(nodes(root,'img').length,0);
    await click(root,'Bild einmal laden');
    nodes(root,'img')[0].props.onError();await Vue.nextTick();
    assert.equal(nodes(root,'img').length,0);assert.match(text(root),/Bild nicht verfügbar/);
  } finally { app.unmount(); }
});

test('unknown and metadata-only IDs do not imply invalid file or request images',async()=>{
  const {root,app}=await mount('FigureDetails',{metadata:{head:0xffffffff,tail:0xffffffff},source:'metadata'});
  try {
    assert.match(text(root),/Dateiinhalt wurde dafür nicht gelesen/);
    assert.match(text(root),/Das allein bedeutet nicht/);
    assert.equal(nodes(root,'img').length,0);
    assert.equal(nodes(root,'button').some(node=>text(node)==='Bild einmal laden'),false);
  } finally { app.unmount(); }
});

test('explicit raw-file results show structural limits and raw ID without requesting an image',async()=>{
  const {root,app}=await mount('FigureDetails',{id:'0000000000000002',metadata:null,source:'local',inspection:{status:'attention',size:540,issues:['bcc0']}});
  try {
    assert.match(text(root),/Mario/);assert.match(text(root),/0000000000000002/);
    assert.match(text(root),/Erstes UID-Prüfbyte stimmt nicht überein/);
    assert.match(text(root),/kryptografische Gültigkeit sind damit nicht bestätigt/);
    assert.doesNotMatch(text(root),/Dateiinhalt wurde dafür nicht gelesen/);
    assert.equal(nodes(root,'img').length,0);
  } finally { app.unmount(); }
});

test('local file picker ignores stale reads, clears selection, and does not leak filename',async()=>{
  const {root,app}=await mount('LocalTagInspector');
  try {
    const input=nodes(root,'input')[0];let finish;
    const pending=new Promise(resolve=>finish=resolve);
    const first={target:{files:[{name:'private-owner-name.bin',size:540,arrayBuffer:()=>pending}],value:'private'}};
    const firstRead=input.props.onChange(first);assert.equal(first.target.value,'');
    await input.props.onChange({target:{files:[{name:'another.bin',size:10000,arrayBuffer(){throw Error('too large');}}],value:'private'}});
    await Vue.nextTick();assert.match(text(root),/10000 Bytes/);
    finish(new ArrayBuffer(540));await firstRead;await Vue.nextTick();
    assert.match(text(root),/10000 Bytes/);assert.doesNotMatch(text(root),/private-owner|another.bin/);
    assert.equal(nodes(root,'img').length,0);
    await click(root,'Prüfergebnis entfernen');assert.doesNotMatch(text(root),/10000 Bytes/);
  } finally { app.unmount(); }
});

test('compact figure details keep warnings and image consent visible while technical explanations start collapsed',async()=>{
  const {root,app}=await mount('FigureDetails',{id:'0000000000000002',source:'local',inspection:{status:'attention',size:540,issues:['bcc0']}});
  const insideDetails=node=>{for(let p=node.parent;p;p=p.parent)if(p.type==='details')return true;return false;};
  try {
    const extra=nodes(root,'details').find(node=>String(node.props.class).includes('verification-details'));
    assert.ok(extra);assert.notEqual(extra.props.open,true);assert.match(text(extra),/Besitzer-, Spitznamen-/);
    const warning=nodes(root,'li').find(node=>text(node).includes('Erstes UID-Prüfbyte'));
    assert.ok(warning);assert.equal(insideDetails(warning),false);
    const limit=nodes(root,'p').find(node=>text(node).includes('keine HMAC-/Signaturprüfung'));
    assert.ok(limit);assert.equal(insideDetails(limit),false);
    const consent=nodes(root,'p').find(node=>text(node).includes('Externes Bild von GitHub'));
    assert.ok(consent);assert.equal(insideDetails(consent),false);assert.match(text(consent),/IP-Adresse/);assert.match(text(consent),/Keine UID oder Datei/);
    assert.equal(nodes(root,'img').length,0);
    await click(root,'Info-QR-Code anzeigen');assert.equal(nodes(root,'figure').length,1);
    assert.match(text(nodes(root,'figure')[0]),/Info-QR-Code.*Keine NFC-Übertragung/s);
  } finally { app.unmount(); }
});

test('catalogue search reset and selection changes preserve pagination and clear earlier image permission',async()=>{
  const {root,app}=await mount('CataloguePanel');
  try {
    assert.equal(nodes(root,'li').length,40);
    const detailsButton=nodes(root,'button').find(node=>text(node)==='Details und Bild');
    detailsButton.props.onClick({currentTarget:detailsButton});await Vue.nextTick();await Vue.nextTick();
    assert.match(text(root),/Ausgewählte Figur/);assert.equal(nodes(root,'img').length,0);
    await click(root,'Bild einmal laden');assert.equal(nodes(root,'img').length,1);
    const search=nodes(root,'input').find(node=>node.props.type==='search');
    search.props['onUpdate:modelValue']('zzzz-no-match');await Vue.nextTick();
    assert.equal(nodes(root,'img').length,0);assert.match(text(root),/Keine passenden Figuren/);assert.doesNotMatch(text(root),/Ausgewählte Figur/);
    await click(root,'Suche und Filter zurücksetzen');assert.equal(nodes(root,'li').length,40);assert.equal(nodes(root,'img').length,0);
    const filters=nodes(root,'details').find(node=>node.props.class==='filter-details');
    assert.ok(filters);assert.notEqual(filters.props.open,true);
  } finally { app.unmount(); }
});
