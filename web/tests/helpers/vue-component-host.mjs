import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as Vue from 'vue';
import {parse,compileScript} from '@vue/compiler-sfc';

// Actual Vue script/template/reactivity with in-memory host nodes. This does not
// model browser layout, File System Access permissions or Bluetooth hardware.
export async function loadSfc(url, overrides={}) {
  const filename=fileURLToPath(url), {descriptor}=parse(fs.readFileSync(filename,'utf8'),{filename});
  let source=compileScript(descriptor,{id:filename,inlineTemplate:true}).content;
  const imports=[];
  source=source.replace(/import\s+(.+?)\s+from\s+['"]([^'"]+)['"];?/g,(_,binding,spec)=>{imports.push({binding,spec});return '';});
  const modules=[];
  for(const {spec} of imports) modules.push(spec==='vue'?Vue:overrides[spec]??await import(pathToFileURL(path.resolve(path.dirname(filename),spec))));
  const bindings=imports.map(({binding},index)=>binding.startsWith('{')
    ?`const ${binding.replace(/\s+as\s+/g,':')}=modules[${index}];`:`const ${binding}=modules[${index}].default;`).join('\n');
  return new Function('modules',bindings+'\n'+source.replace('export default','return'))(modules);
}
export function hostNode(type,text='') {
  return {type,tagName:type.toUpperCase(),text,props:{},children:[],parent:null,value:'',checked:false,
    getRootNode(){return globalThis.document;},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},removeEventListener(event){delete this.listeners[event];},
    get options(){return nodes(this,'option');}};
}
const renderer=Vue.createRenderer({
 createElement:tag=>hostNode(tag),createText:text=>hostNode('#text',text),createComment:text=>hostNode('#comment',text),
 setText:(node,text)=>node.text=text,setElementText:(node,text)=>{node.text=text;node.children=[];},
 patchProp:(node,key,previous,next)=>{node.props[key]=next;if(['value','checked','selected','multiple'].includes(key))node[key]=next;},
 insert(node,parent,anchor=null){if(node.parent){const index=node.parent.children.indexOf(node);if(index>=0)node.parent.children.splice(index,1);}node.parent=parent;const index=anchor?parent.children.indexOf(anchor):-1;index<0?parent.children.push(node):parent.children.splice(index,0,node);},
 remove(node){const index=node.parent?.children.indexOf(node);if(index>=0)node.parent.children.splice(index,1);node.parent=null;},
 parentNode:node=>node.parent,nextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]||null,
});
export const nodes=(node,type)=>[node,...node.children.flatMap(child=>nodes(child))].filter(item=>!type||item.type===type);
export const text=node=>node.type==='#comment'?'':node.text+node.children.map(text).join('');
export async function mountSfc(url,props={},overrides={}) {
  globalThis.Document??=class Document {}; globalThis.ShadowRoot??=class ShadowRoot {};
  globalThis.document??=Object.assign(new globalThis.Document(),{activeElement:null});
  const state=Vue.reactive(props),root=hostNode('root'),Component=await loadSfc(url,overrides);
  const app=renderer.createApp({render:()=>Vue.h(Component,state)});app.mount(root);await Vue.nextTick();
  return {state,root,app,tick:Vue.nextTick};
}
