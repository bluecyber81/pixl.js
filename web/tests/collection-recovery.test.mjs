import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Vue from 'vue';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

// WEB_REVIEW_SOURCE allows the three-file candidate overlay to be exercised
// against unchanged release libraries without copying or modifying the release.
const root = process.env.WEB_REVIEW_SOURCE ? path.resolve(process.env.WEB_REVIEW_SOURCE) :
  fileURLToPath(new URL('../', import.meta.url));
const at = name => pathToFileURL(path.join(root, name));
const { memoryVfs } = await import(at('tests/helpers/memory-vfs.mjs'));
const { auditCollection } = await import(at('src/lib/collection-audit.js'));
const { prepareFigureTransfer, transferFigureToDevice, suggestedFigureFilename } = await import(at('src/lib/figure-transfer.js'));
const { observeFigureDownloadLink, readFigureDownloadLink } = await import(at('src/lib/figure-download-links.js'));
const { filterCatalogue, releaseLabel } = await import(at('src/lib/catalogue.js'));
const { formatReadDuration, readTimeEstimate } = await import(at('src/lib/read-time-estimate.js'));
const componentFile = process.env.PIXL_COLLECTION_SOURCE || path.join(root,'src/components/CollectionAssistant.vue');
const appFile = process.env.PIXL_APP_SOURCE || path.join(root,'src/App.vue');
const appSource = fs.readFileSync(appFile,'utf8');
function appMethod(name, args = '', bindings = {}) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match = appSource.match(new RegExp('    '+escaped+'\\([^)]*\\) \\{([\\s\\S]*?)\\r?\\n    \\},'));
  assert(match, 'actual App method: '+name);
  return new Function(...Object.keys(bindings), 'return function('+args+'){'+match[1]+'\n}')( ...Object.values(bindings));
}
const { descriptor } = parse(fs.readFileSync(componentFile,'utf8'),{filename:componentFile});
const script = compileScript(descriptor,{id:'collection-recovery'}).content.replace(/^import .*$/gm,'').replace('export default','const component=');
const compiled = compileTemplate({source:descriptor.template.content,id:'collection-recovery',filename:componentFile,compilerOptions:{hoistStatic:false}});
assert.deepEqual(compiled.errors,[]);
const template = compiled.code.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,
  (_, names) => `const {${names.replace(/\s+as\s+/g, ':')}}=Vue;`).replace('export function render','function render');
const make = new Function('Vue','baseline','checkCatalogueUpdates','auditCollection','prepareFigureTransfer',
  'transferFigureToDevice','suggestedFigureFilename','filterCatalogue','releaseLabel','saveBlob','saveBlobWithPicker',
  'readTimeEstimate','formatReadDuration','readFigureDownloadLink','observeFigureDownloadLink',script+'\n'+template+'\ncomponent.render=render;return component;');
const A = '0000000000000102', baseline={entries:[{id:A,name:'Synthetic A',series:'Test',release:{eu:'2020-01-01'}}]};
const tag = () => { const bytes=new Uint8Array(540);bytes[0]=4;bytes[3]=0x8c;bytes.set(A.match(/../g).map(x=>parseInt(x,16)),84);return bytes; };
const deferred = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
const node = (type,text='') => ({type,text,props:{},children:[],parent:null,focus(){}});
const renderer = Vue.createRenderer({createElement:type=>node(type),createText:text=>node('#text',text),createComment:text=>node('#comment',text),
  setText:(n,t)=>n.text=t,setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,old,value)=>n.props[k]=value,
  insert(n,parent,anchor=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=parent;const i=parent.children.indexOf(anchor);i<0?parent.children.push(n):parent.children.splice(i,0,n);},
  remove(n){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=null;},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null});
const tick = async () => { await Promise.resolve();await Vue.nextTick(); };

function mount(transfer = transferFigureToDevice) {
  const vfs=memoryVfs(), events=[], notes=[], tree=node('root');let vm,key='opaque-device-A';
  const props=Vue.reactive({connected:true,blocked:false,generation:1,revision:0,directory:'E:/tags',locale:'de_DE'});
  const parent={recoveryNotes:notes,
    get sessionGeneration(){return props.generation;},
    assert_session(generation){if(!props.connected||generation!==props.generation)throw Error('Session changed');},
    transfer_adapters(generation){return {...vfs.api,assertSession:()=>{this.assert_session(generation);vfs.api.assertSession();}};}};
  parent.remember_recovery=appMethod('remember_recovery','value');
  parent.collection_transfer_session=appMethod('collection_transfer_session','',{pixl:{get_device_key:()=>key}});
  props.getTransferSession=()=>parent.collection_transfer_session();
  props.getSession=()=>parent.collection_transfer_session();
  const Component=make({...Vue,vModelText:{},vModelSelect:{}},baseline,()=>{throw Error('No network');},auditCollection,
    prepareFigureTransfer,transfer,suggestedFigureFilename,filterCatalogue,releaseLabel,
    ()=>{throw Error('No download');},()=>{throw Error('No download');},readTimeEstimate,formatReadDuration,readFigureDownloadLink,observeFigureDownloadLink);
  const app=renderer.createApp({render:()=>Vue.h(Component,{...props,ref:value=>vm=value,
    onBusy:value=>events.push({name:'busy',value}),onWriting:value=>events.push({name:'writing',value}),
    onChanged:value=>events.push({name:'changed',value}),
    onRecovery:value=>{events.push({name:'recovery',value});parent.remember_recovery(value);}})});
  app.mount(tree);
  return {app,vfs,events,props,parent,get vm(){return vm;},
    async prepare(){vm.choose(baseline.entries[0],false);await vm.prepare({file:tag()});vm.filename='a.bin';vm.destination='E:/tags';},
    async disconnect(){vfs.disconnect();props.connected=false;props.generation=2;await tick();},
    async reconnect(){key='opaque-device-B';vfs.reconnect();props.connected=true;props.generation=3;await tick();}
  };
}

for (const point of ['write','rename']) for (const mode of ['connected','disconnected','reconnected']) {
  test(`collection recovery retains origin after ${point} ACK loss, ${mode}`,async()=>{
    const h=mount();let injected=false,rawError,mutationCountAtFailure;
    try {
      await h.prepare();
      h.vfs.setHook(async({when,op})=>{
        if(injected||when!=='after'||op!==point)return;injected=true;
        if(mode!=='connected')await h.disconnect();
        if(mode==='reconnected'){
          await h.reconnect();h.vm.running='scan';h.vm.message='new session message';h.vm.report={schema:1,session:'B',files:[],present:[],missing:[],duplicates:[]};
        }
        mutationCountAtFailure=h.vfs.log.filter(x=>['write','rename','remove','meta'].includes(x.op)).length;
        rawError=Error('Synthetic acknowledgement lost');throw rawError;
      });
      await h.vm.upload();await tick();assert.equal(injected,true);
      const recovery=h.events.filter(x=>x.name==='recovery');
      assert.equal(recovery.length,1,'the real safeUpload receipt reaches the parent even after session invalidation');
      assert.equal(recovery[0].value.recovery,rawError.recovery,'no invented transaction result');
      assert.deepEqual(recovery[0].value.recoveryOrigin,{sessionGeneration:1,deviceKey:'opaque-device-A'});
      assert(Object.isFrozen(recovery[0].value.recoveryOrigin));
      assert.equal(h.events.filter(x=>x.name==='changed').length,0);
      if(mode!=='connected'){
        assert.equal(h.parent.recoveryNotes.length,1);
        const note=JSON.parse(h.parent.recoveryNotes[0]);
        assert.deepEqual(note.sourceSession,{sessionGeneration:1,deviceKey:'opaque-device-A'});
        assert.equal(note.targetPath,'E:/tags/a.bin');
        assert.equal(note.committed,point==='rename'?null:false);
        assert(note.files.some(x=>x.path==='E:/tags/~uabcdef012345'));
        assert.equal(h.vfs.log.filter(x=>['write','rename','remove','meta'].includes(x.op)).length,mutationCountAtFailure,
          'old-session completion must not issue cleanup writes to the replacement session');
        assert.equal(h.vfs.nodes.has(point==='write'?'E:/tags/~uabcdef012345':'E:/tags/a.bin'),true);
      }
      if(mode==='reconnected'){
        assert.equal(h.vm.running,'scan');assert.equal(h.vm.message,'new session message');assert.equal(h.vm.report.session,'B');
      } else assert.equal(h.vm.message,'');
    }finally{h.app.unmount();}
  });
}

test('late confirmed success from device A does not update device B or manufacture a recovery warning',async()=>{
  const completed=deferred(),deliver=deferred();
  const h=mount(async options=>{const result=await transferFigureToDevice(options);completed.resolve(result);await deliver.promise;return result;});
  try{
    await h.prepare();const active=h.vm.upload();const receipt=await completed.promise;
    assert.equal(receipt.verified,true);const calls=h.vfs.log.length;
    await h.disconnect();await h.reconnect();h.vm.running='scan';h.vm.message='new session message';h.vm.report={schema:1,session:'B',files:[],present:[],missing:[],duplicates:[]};
    const events=h.events.length;deliver.resolve();await active;await tick();
    assert.equal(h.vfs.log.length,calls);assert.equal(h.events.length,events);assert.equal(h.parent.recoveryNotes.length,0);
    assert.equal(h.vm.running,'scan');assert.equal(h.vm.message,'new session message');assert.equal(h.vm.report.session,'B');
  }finally{deliver.resolve();h.app.unmount();}
});

test('late success carrying an uncertain cleanup receipt is retained without refreshing the new device',async()=>{
  const gate=deferred(),h=mount(()=>gate.promise);
  try{
    await h.prepare();const active=h.vm.upload();await tick();await h.disconnect();await h.reconnect();
    h.vm.running='scan';h.vm.message='new session message';
    gate.resolve({path:'E:/tags/a.bin',verified:true,recovery:{committed:true,targetPath:'E:/tags/a.bin',
      recoveryFiles:[{path:'E:/tags/~b123456789abc',role:'backup',state:'possible'}]}});
    await active;await tick();assert.equal(h.parent.recoveryNotes.length,1);
    assert.equal(JSON.parse(h.parent.recoveryNotes[0]).sourceSession.deviceKey,'opaque-device-A');
    assert.equal(h.events.filter(x=>x.name==='changed').length,0);assert.equal(h.vm.running,'scan');assert.equal(h.vm.message,'new session message');
  }finally{gate.resolve();h.app.unmount();}
});

test('normal successful upload preserves the live message and exactly one current-device refresh',async()=>{
  const h=mount();try{
    await h.prepare();await h.vm.upload();await tick();
    assert.equal(h.vfs.nodes.has('E:/tags/a.bin'),true);assert.match(h.vm.message,/SHA-256/);
    assert.equal(h.events.filter(x=>x.name==='changed').length,1);assert.equal(h.parent.recoveryNotes.length,0);
    assert.equal(h.vm.running,'');
  }finally{h.app.unmount();}
});

test('the production workspace toggle keeps CollectionAssistant mounted; full unmount remains a RAM-only boundary',()=>{
  const {descriptor:app}=parse(appSource,{filename:appFile});
  assert.match(app.template.content,/<section v-show="activeWorkspace === 'catalogue'"[\s\S]*?<CollectionAssistant\s/);
  const tag=app.template.content.match(/<CollectionAssistant\s[^>]*\/>/)[0];
  assert.doesNotMatch(tag,/\bv-if=|\b:key=/);
  const h=mount();const vm=h.vm;h.app.unmount();assert.equal(vm._alive,false);
});

test('a confirmed upload stays visible during navigation and clears on disconnect', async () => {
  const h = mount();
  try {
    await h.prepare();
    await h.vm.upload();
    assert.match(h.vm.message, /SHA-256/);

    h.props.directory = 'E:/';
    h.props.revision++;
    await tick();
    assert.match(h.vm.message, /SHA-256/);

    await h.disconnect();
    assert.equal(h.vm.message, '');
    await h.reconnect();
    assert.equal(h.vm.message, '');
    assert.equal(h.events.filter(event => event.name === 'changed').length, 1);
  } finally {
    h.app.unmount();
  }
});

test('disconnect clears a device error while retaining its recovery note and later local file errors', async () => {
  const h = mount();
  try {
    await h.prepare();
    h.vfs.setHook(({ when, op }) => {
      if (when === 'after' && op === 'write') throw Error('Stage acknowledgement lost');
      if (when === 'before' && op === 'remove') throw Error('Stage cleanup failed');
    });
    await h.vm.upload();
    assert.equal(h.vm.error, 'Stage acknowledgement lost');
    assert.equal(h.parent.recoveryNotes.length, 1);
    const note = h.parent.recoveryNotes[0];
    const { files, sourceSession } = JSON.parse(note);
    assert.deepEqual(sourceSession, { sessionGeneration: 1, deviceKey: 'opaque-device-A' });
    assert.deepEqual(files, [{ path: 'E:/tags/~uabcdef012345', role: 'stage', state: 'possible' }]);

    await h.disconnect();
    assert.equal(h.vm.error, '');
    assert.deepEqual(h.parent.recoveryNotes, [note]);

    await h.vm.prepare({ file: new Uint8Array(1) });
    const localError = h.vm.error;
    assert.equal(localError, 'Die Dateigröße passt zu keinem unterstützten BIN-Format.');
    await h.reconnect();
    assert.equal(h.vm.error, localError);
    assert.deepEqual(h.parent.recoveryNotes, [note]);
  } finally {
    h.app.unmount();
  }
});
