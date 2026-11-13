import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as Vue from 'vue';
import * as I18n from 'vue-i18n';
import {parse,compileScript} from '@vue/compiler-sfc';
import {CATALOGUE_PREFERENCES_KEY as KEY,CATALOGUE_PROFILE_FORMAT as FORMAT,CATALOGUE_PROFILE_FILE_LIMIT as LIMIT,readCataloguePreferences} from '../src/lib/catalogue-preferences.js';
const A='0000000000000001',B='0000000000000002',C='0000000000000003';
const criteria=query=>({query,series:'',kind:'',presence:'',knownOnly:false,favoritesOnly:false});
const filter=(name,query='')=>({name,criteria:criteria(query)});
const profile=(favorites=[],filters=[])=>JSON.stringify({format:FORMAT,version:1,favorites,filters});
const stored=(favorites=[],filters=[])=>JSON.stringify({version:1,favorites,filters});
const bytes=text=>new TextEncoder().encode(text).buffer;
function node(type,text=''){return{type,text,props:{},children:[],parent:null,focus(){},scrollIntoView(){},get isConnected(){return!!this.parent;}};}
const renderer=Vue.createRenderer({
 createElement:tag=>node(tag),createText:text=>node('#text',text),createComment:text=>node('#comment',text),
 setText:(n,text)=>n.text=text,setElementText:(n,text)=>{n.text=text;n.children=[];},patchProp:(n,key,old,value)=>n.props[key]=value,
 insert(n,p,anchor=null){if(n.parent){const i=n.parent.children.indexOf(n);if(i>=0)n.parent.children.splice(i,1);}n.parent=p;const i=anchor?p.children.indexOf(anchor):-1;i<0?p.children.push(n):p.children.splice(i,0,n);},
 remove(n){const i=n.parent?.children.indexOf(n);if(i>=0)n.parent.children.splice(i,1);n.parent=null;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null,
});
const nodes=(n,type)=>[n,...n.children.flatMap(c=>nodes(c))].filter(n=>!type||n.type===type);
const text=n=>n.text+n.children.map(text).join('');
const klass=(n,name)=>nodes(n).find(n=>String(n.props.class||'').split(' ').includes(name));
const button=(n,label)=>{const b=nodes(n,'button').find(b=>text(b)===label);assert.ok(b,label);return b;};
function browser(t){
 const data=new Map(),downloads=[];let writes=0;
 const storage={getItem:key=>data.get(key)??null,setItem(key,value){writes++;data.set(key,value);}};
 const win=Object.assign(new EventTarget(),{localStorage:storage,navigator:{}});
 const old=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:win});
 t.after(()=>old?Object.defineProperty(globalThis,'window',old):Reflect.deleteProperty(globalThis,'window'));
 t.mock.method(globalThis,'fetch',()=>assert.fail('Profile attempted network access'));
 return{data,storage,win,downloads,get writes(){return writes;}};
}
async function component(downloads){
 const filename=fileURLToPath(new URL('../src/components/CataloguePanel.vue',import.meta.url)),{descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
 let code=compileScript(descriptor,{id:filename,inlineTemplate:true}).content;const imports=[];
 code=code.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g,(_,binding,spec)=>{imports.push({binding,spec});return'';});
 const modules=[];
 for(const{spec}of imports){
  if(spec==='vue')modules.push({...Vue,vModelText:{},vModelSelect:{},vModelCheckbox:{}});
  else if(spec==='vue-i18n')modules.push(I18n);
  else if(spec.endsWith('.vue'))modules.push({default:{render:()=>null}}); // unrelated panels are named rendering boundaries
  else if(spec.endsWith('browser-tools.js'))modules.push({saveBlob:(blob,name)=>downloads.push({blob,name})}); // no real download dialog
  else{const target=path.resolve(path.dirname(filename),spec);modules.push(spec.endsWith('.json')?{default:JSON.parse(fs.readFileSync(target,'utf8'))}:await import(pathToFileURL(target)));}
 }
 const bindings=imports.map(({binding},i)=>binding.startsWith('{')?`const ${binding.replace(/\s+as\s+/g,':')}=modules[${i}];`:`const ${binding}=modules[${i}].default;`).join('\n');
 return new Function('modules',bindings+'\n'+code.replace('export default','return'))(modules);
}
async function mount(env,locale='en_US'){
 const c=await component(env.downloads),root=node('root'),data={commit:'a'.repeat(40),checkedDate:'2026-11-12',sourceUrl:'https://example.invalid',entries:[A,B,C].map((id,i)=>({id,name:'Figure '+(i+1),series:'Test',type:'Figure',firmwareIdKnown:true,release:{eu:'2020-01-01'}}))};
 const app=renderer.createApp({render:()=>Vue.h(c,{catalogue:data})}),i18n=I18n.createI18n({legacy:false,locale,messages:{en_US:{},de_DE:{}}});app.use(i18n);app.mount(root);await Vue.nextTick();return{root,app,i18n,get panel(){return klass(root,'profile-transfer');}};
}
async function choose(h,raw){const picker=nodes(klass(h.panel,'profile-file'),'input')[0],target={files:[{size:Buffer.byteLength(raw),arrayBuffer:async()=>bytes(raw)}],value:'profile.json'};await picker.props.onChange({target});await Vue.nextTick();assert.equal(target.value,'');}
async function mode(h,value){nodes(klass(h.panel,'profile-policy'),'select')[0].props['onUpdate:modelValue'](value);await Vue.nextTick();}
async function click(h,label){const b=button(h.panel,label);assert.notEqual(b.props.disabled,true,label);await b.props.onClick();await Vue.nextTick();}

test('actual DE/EN SFC requires preview and explicit policy, shows conflicts, then updates local favourites',async t=>{
 const env=browser(t);
 for(const locale of ['de_DE','en_US']){
  env.data.set(KEY,stored([A,C],[filter('Shared','old'),filter('Local')]));const h=await mount(env,locale),de=locale==='de_DE',before=env.writes;
  try{
   await choose(h,profile([A,B],[filter('Shared','new'),filter('Imported')]));assert.equal(env.writes,before);assert.match(text(h.panel),de?/Gleicher Name, andere Einstellungen/:/Same name, different settings/);assert.match(text(h.panel),/old/);assert.match(text(h.panel),/new/);
   const apply=de?'Profil jetzt übernehmen':'Apply profile now';assert.equal(button(h.panel,apply).props.disabled,true);
   await mode(h,'merge');assert.match(text(h.panel),de?/Gleichnamige Filter behalten/:/Filters with an existing name keep/);
   await click(h,apply);assert.equal(env.writes,before+1);assert.deepEqual(readCataloguePreferences(env.storage).favorites,[A,B,C]);assert.equal(readCataloguePreferences(env.storage).filters[0].criteria.query,'old');assert.equal(klass(h.panel,'profile-preview'),undefined);assert.match(text(h.panel),de?/Profil in diesem Browser übernommen/:/Profile applied in this browser/);
  }finally{h.app.unmount();}
 }
});
test('replace preview explains deletions and an empty file clears only the catalogue profile',async t=>{
 const env=browser(t);env.data.set(KEY,stored([A,C],[filter('old')]));env.data.set('other.preference','kept');const h=await mount(env);
 try{await choose(h,profile());await mode(h,'replace');assert.match(text(h.panel),/Entries missing from the file are removed/);assert.match(text(klass(h.panel,'profile-counts')),/2/);await click(h,'Apply profile now');assert.deepEqual(readCataloguePreferences(env.storage),{version:1,favorites:[],filters:[]});assert.equal(env.data.get('other.preference'),'kept');}finally{h.app.unmount();}
});
test('storage event refreshes preview and resets the policy rather than silently applying stale choices',async t=>{
 const env=browser(t),h=await mount(env);
 try{await choose(h,profile([A]));await mode(h,'replace');env.data.set(KEY,stored([B]));const e=new Event('storage');Object.defineProperty(e,'key',{value:KEY});env.win.dispatchEvent(e);await Vue.nextTick();assert.equal(button(h.panel,'Apply profile now').props.disabled,true);assert.match(text(h.panel),/Review the new preview and choose again/);assert.equal(env.writes,0);h.i18n.global.locale.value='de_DE';await Vue.nextTick();assert.match(text(h.panel),/Prüfe die neue Vorschau/);assert.doesNotMatch(text(klass(h.panel,'profile-feedback')),/Review the new preview/);}finally{h.app.unmount();}
});
test('stale snapshot without a storage event is rejected and returned to a fresh unapproved preview',async t=>{
 const env=browser(t),h=await mount(env);
 try{await choose(h,profile([A]));await mode(h,'replace');env.data.set(KEY,stored([B]));await click(h,'Apply profile now');assert.equal(env.writes,0);assert.deepEqual(readCataloguePreferences(env.storage).favorites,[B]);assert.match(text(h.panel),/Review the new preview and choose again/);assert.equal(button(h.panel,'Apply profile now').props.disabled,true);}finally{h.app.unmount();}
});
test('quota error keeps the old profile and localizes the live error after a language switch',async t=>{
 const env=browser(t);env.data.set(KEY,stored([A]));const h=await mount(env),set=env.storage.setItem;
 try{await choose(h,profile([B]));await mode(h,'replace');env.storage.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};await click(h,'Apply profile now');assert.deepEqual(readCataloguePreferences(env.storage).favorites,[A]);assert.match(text(klass(h.panel,'profile-feedback')),/blocked or full/);h.i18n.global.locale.value='de_DE';await Vue.nextTick();assert.match(text(klass(h.panel,'profile-feedback')),/gesperrt oder voll/);env.storage.setItem=set;await click(h,'Profil jetzt übernehmen');assert.deepEqual(readCataloguePreferences(env.storage).favorites,[B]);}finally{h.app.unmount();}
});
test('latest file wins and cancelling invalidates a pending read without preference writes',async t=>{
 const env=browser(t),h=await mount(env);let resolve;
 try{const picker=nodes(klass(h.panel,'profile-file'),'input')[0];const slow=picker.props.onChange({target:{files:[{size:40,arrayBuffer:()=>new Promise(r=>resolve=r)}],value:'slow.json'}});await choose(h,profile([B],[filter('New file')]));resolve(bytes(profile([A],[filter('Old file')])));await slow;await Vue.nextTick();assert.match(text(h.panel),/New file/);assert.doesNotMatch(text(h.panel),/Old file/);
  let resolveCancelled;const pending=picker.props.onChange({target:{files:[{size:40,arrayBuffer:()=>new Promise(r=>resolveCancelled=r)}],value:'later.json'}});await Vue.nextTick();await click(h,'Cancel profile import');resolveCancelled(bytes(profile([A])));await pending;await Vue.nextTick();assert.equal(klass(h.panel,'profile-preview'),undefined);assert.match(text(h.panel),/Profile import cancelled/);assert.equal(env.writes,0);
 }finally{h.app.unmount();}
});
test('oversized and invalid UTF-8 files fail before preview; failed previews never enable Apply',async t=>{
 const env=browser(t),h=await mount(env);
 try{const picker=nodes(klass(h.panel,'profile-file'),'input')[0];await picker.props.onChange({target:{files:[{size:LIMIT+1,arrayBuffer:()=>assert.fail('oversized file was read')}],value:'large.json'}});await Vue.nextTick();assert.match(text(h.panel),/exceeds 512 KiB/);assert.equal(klass(h.panel,'profile-preview'),undefined);await picker.props.onChange({target:{files:[{size:1,arrayBuffer:async()=>Uint8Array.of(255).buffer}],value:'bad.json'}});await Vue.nextTick();assert.match(text(h.panel),/unsupported profile format/);assert.equal(klass(h.panel,'profile-preview'),undefined);assert.equal(env.writes,0);}finally{h.app.unmount();}
});
test('unmount aborts a queued Apply before the shared origin lock can commit',async t=>{
 const env=browser(t);let grant;env.win.navigator.locks={request(key,work){return new Promise((resolve,reject)=>{grant=()=>{try{resolve(work());}catch(e){reject(e);}};});}};const h=await mount(env);
 await choose(h,profile([A]));await mode(h,'merge');const applying=button(h.panel,'Apply profile now').props.onClick();h.app.unmount();grant();await applying;assert.equal(env.writes,0);
});
test('export uses the live profile and describes a requested download rather than confirmed disk storage',async t=>{
 const env=browser(t);env.data.set(KEY,stored([A],[filter('Portable','Mario')]));const h=await mount(env);
 try{await click(h,'Save profile as JSON');assert.equal(env.downloads.length,1);assert.equal(env.downloads[0].name,'Allmiibo-Catalogue-Profile.json');assert.equal(JSON.parse(await env.downloads[0].blob.text()).format,FORMAT);assert.match(text(h.panel),/download requested/);assert.equal(env.writes,0);h.i18n.global.locale.value='de_DE';await Vue.nextTick();assert.match(text(h.panel),/Download der Profildatei angefordert/);}finally{h.app.unmount();}
});
