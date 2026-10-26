import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';
const file = new URL('../src/components/TransferStatus.vue', import.meta.url);
const { descriptor } = parse(fs.readFileSync(file, 'utf8'), {filename:file.pathname});
let source = compileScript(descriptor, {id:'transfer-status-test', inlineTemplate:true}).content;
source = source.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,
  (_, bindings) => `const {${bindings.replace(/\s+as\s+/g, ':')}}=Vue;`);
const Component = new Function('Vue', source.replace('export default', 'return'))(Vue);
const node = (type,text='') => ({type,text,props:{},children:[],parent:null});
const renderer = Vue.createRenderer({
  createElement:tag=>node(tag),createText:t=>node('#text',t),createComment:t=>node('#comment',t),
  setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,o,v)=>n.props[k]=v,
  insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=p.children.indexOf(a);i<0?p.children.push(n):p.children.splice(i,0,n);},
  remove(n){n.parent?.children.splice(n.parent.children.indexOf(n),1);n.parent=null;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null
});
const flat = n=>[n,...n.children.flatMap(flat)], text=n=>n.text+n.children.map(text).join('');
function mount(overrides={}) {
  const root=node('root'), events=[];
  const props=Vue.reactive({transfer:{phase:'uploading',path:'E:/long/name.bin',done:17,total:540},stats:{percent:3.1},formatSize:n=>`${n} B`,canCancel:true,cancelling:false,onCancel:()=>events.push('cancel'),...overrides});
  const app=renderer.createApp({render:()=>Vue.h(Component,props)});
  app.config.globalProperties.$t=(key,values)=>key+(values?' '+JSON.stringify(values):'');app.mount(root);
  return {root,props,events,app};
}
test('real progress component renders file, byte progress and functional cancellation inside dialog',()=>{
  const h=mount();try{
    assert.match(text(h.root),/E:\/long\/name.bin/);assert.match(text(h.root),/17 B \/ 540 B/);
    const bar=flat(h.root).find(n=>n.type==='progress');assert.equal(bar.props.value,3);assert.equal(bar.props.max,'100');
    flat(h.root).find(n=>n.type==='button').props.onClick();assert.deepEqual(h.events,['cancel']);
  }finally{h.app.unmount();}
});
test('commit cancellation remains visibly locked; stale estimate is not shown as progress rate',async()=>{
  const h=mount();try{
    h.props.cancelling=true;h.props.stats={percent:99,stalled:true,bytesPerSecond:null,etaSeconds:null};await Vue.nextTick();
    const button=flat(h.root).find(n=>n.type==='button');assert.equal(button.props.disabled,true);
    assert.match(text(button),/info.finishingCommit/);assert.match(text(h.root),/info.waiting/);assert.doesNotMatch(text(h.root),/\/s/);
  }finally{h.app.unmount();}
});
test('empty file and unknown total are distinct and coarse screen-reader updates avoid byte chatter',async()=>{
  const h=mount({transfer:{phase:'listing',path:'E:/',done:0,total:null},stats:{percent:null}});try{
    assert.equal(flat(h.root).find(n=>n.type==='progress').props.value,undefined);
    h.props.transfer={phase:'complete',path:'E:/empty',done:0,total:0};h.props.stats={percent:100,complete:true};await Vue.nextTick();
    assert.equal(flat(h.root).find(n=>n.type==='progress').props.value,100);assert.match(text(h.root),/0 B \/ 0 B/);
    h.props.transfer={phase:'uploading',path:'E:/x',done:61,total:540};h.props.stats={percent:11.2};await Vue.nextTick();
    const status=flat(h.root).find(n=>n.props.role==='status');const previous=text(status);assert.match(previous,/10%/);
    h.props.transfer.done=100;h.props.stats.percent=18.5;await Vue.nextTick();assert.equal(text(status),previous);
  }finally{h.app.unmount();}
});
