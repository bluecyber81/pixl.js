import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/lib/backup-comparison.js';
import {mountSfc,nodes,text} from './helpers/vue-component-host.mjs';
const url=new URL('../src/components/BackupComparison.vue',import.meta.url);
const report={rows:[...Array.from({length:63},(_,i)=>({path:`Ä ${i}.bin`,status:'content',type:'file'})),{path:'same.bin',status:'same',type:'file'}],
 counts:{added:0,removed:0,content:63,metadata:0,type:0,unresolved:0,same:1},roots:['E:/A','E:/B'],exactMetadata:true};
const click=(h,label)=>{const node=nodes(h.root,'button').find(n=>text(n)===label);assert(node,label);return node.props.onClick();};
for(const locale of ['de_DE','en'])test(`offline comparison actual Vue controls filter all rows and export only explicit clicks (${locale})`,async()=>{
  const saved=[],h=await mountSfc(url,{locale},{'../lib/backup-comparison.js':{...api,compareBackupFiles:async()=>report},
    '../lib/browser-tools.js':{saveBlob:(blob,name)=>saved.push({blob,name})}});
  try{
    const inputs=nodes(h.root,'input');inputs[0].props.onChange({target:{files:[{}]}});inputs[1].props.onChange({target:{files:[{}]}});await h.tick();
    await click(h,locale==='en'?'Compare backups':'Sicherungen vergleichen');await h.tick();
    assert.equal(saved.length,0);assert.equal(nodes(h.root,'li').filter(n=>nodes(n,'span').length).length,50);
    await click(h,locale==='en'?'Next':'Weiter');await h.tick();
    assert.equal(nodes(h.root,'li').filter(n=>nodes(n,'span').length).length,13);
    const query=nodes(h.root,'input').find(n=>n.props.type==='search');query.props['onUpdate:modelValue']('ä 2');await h.tick();
    assert.match(text(h.root),/11 \/ 64/);assert.equal(nodes(h.root,'nav').length,0);
    click(h,locale==='en'?'Save matches as JSON':'Treffer als JSON speichern');
    const json=JSON.parse(await saved[0].blob.text());assert.equal(json.exportedEntries,11);assert.equal(json.filters.path,'ä 2');
    query.props['onUpdate:modelValue']('');nodes(h.root,'select')[0].props['onUpdate:modelValue']('same');await h.tick();
    assert.match(text(h.root),/same.bin/);assert.match(text(h.root),/1 \/ 64/);
    click(h,locale==='en'?'Save matches as CSV':'Treffer als CSV speichern');
    assert.match(await saved[1].blob.text(),/"same.bin"/);assert.equal(saved.length,2);
    nodes(h.root,'input')[0].props.onChange({target:{files:[{}]}});await h.tick();assert.equal(nodes(h.root,'select').length,0);
  }finally{h.app.unmount();}
});
