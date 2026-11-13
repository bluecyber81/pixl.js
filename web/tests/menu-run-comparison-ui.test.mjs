import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSfc,nodes,text} from './helpers/vue-component-host.mjs';
import {parseMenuDiagnostics} from '../src/lib/device-extra-diagnostics.js';
import {createCombinedDiagnosticReport} from '../src/lib/diagnostic-snapshot.js';
import {diagnosticSnapshot} from './fixtures/diagnostic-overview-data.mjs';
const url=new URL('../src/components/MenuRunComparison.vue',import.meta.url);
function file(stale){const snapshot=diagnosticSnapshot();const data=parseMenuDiagnostics(Uint8Array.from(Buffer.from('50584d49022001000101010000000000feffffffffffffff0200080808030803','hex')));
 snapshot.sections.menu={state:'available',observedAt:snapshot.completedAt,errorCode:null,data:{...data,lastAppReturn:{...data.lastAppReturn,staleEventsDiscarded:stale}}};
 return new Blob([JSON.stringify(createCombinedDiagnosticReport({baseReport:{firmwareVersion:'2.22.0-DE3.71t1'},snapshot}))],{type:'application/json'});}
for(const locale of ['de_DE','en'])test(`actual Vue offline run comparison renders deltas and exports sanitized state (${locale})`,async()=>{
 const saved=[],h=await mountSfc(url,{locale},{'../lib/browser-tools.js':{saveBlob:(blob,name)=>saved.push({blob,name})}});
 try{
  const inputs=nodes(h.root,'input');await inputs[0].props.onChange({target:{files:[file(2)]}});await inputs[1].props.onChange({target:{files:[file(65535)]}});await h.tick();
  assert.match(text(h.root),/≥65535/);assert.match(text(h.root),locale==='en'?/same physical device/:/dasselbe physische Gerät/);
  const rows=nodes(h.root,'tr');assert.equal(rows.length,2);assert.match(text(rows[1]),/2≥65535—/);
  assert.equal(saved.length,0);nodes(h.root,'button')[0].props.onClick();assert.equal(saved.length,1);
  const report=JSON.parse(await saved[0].blob.text());assert.equal(report.changedFields,1);assert.equal(report.comparison.applicationHashVerified,false);
  await inputs[1].props.onChange({target:{files:[new Blob(['bad'])]}});await h.tick();assert.equal(nodes(h.root,'table').length,0);assert.equal(nodes(h.root,'button').length,0);
 }finally{h.app.unmount();}
});

test('replacing a pending JSON selection makes its late result inert',async()=>{
 let finish;const h=await mountSfc(url,{locale:'en'});const input=nodes(h.root,'input')[0];
 try{
  const pending=input.props.onChange({target:{files:[{size:20,text:()=>new Promise(resolve=>finish=resolve)}]}});
  await input.props.onChange({target:{files:[]}});finish(await file(2).text());await pending;await h.tick();
  assert.doesNotMatch(text(h.root),/PXMI v2 validated/);assert.equal(nodes(h.root,'table').length,0);
 }finally{h.app.unmount();}
});
