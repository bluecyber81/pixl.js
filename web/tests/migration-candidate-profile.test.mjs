import test from 'node:test';
import assert from 'node:assert/strict';
import {MIGRATION_CAPACITY_TARGET as target} from '../src/lib/migration-capacity.js';
import {migrationApplicationMatches,matchMigrationLayout,checkImportState} from '../src/lib/migration-layout.js';
const identity={firmwareVersion:'2.22.0-DE3.71t1',applicationCounter:644,settingsCrcValid:true};
const layout={...target.layout,mounted:true};

test('only exact engine-qualified T1 version/counter joins the existing unchanged simulator profile',()=>{
 assert.equal(target.firmwareVersion,'2.22.0-DE3.70');assert.equal(target.applicationCounter,642);
 assert.equal(target.layout.engineSha256,'2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248');
 assert.equal(target.wasmSha256,'652dfaab0f7078ffa5def2186b1cf962387097e431dd9513579aa0d7cf3388f9');
 assert.equal(migrationApplicationMatches(identity,target),true);
 assert.deepEqual(matchMigrationLayout(layout,identity,target,{mounted:true}),layout);
 for(const patch of [{applicationCounter:643},{applicationCounter:645},{settingsCrcValid:false},{settingsCrcValid:undefined},
  {firmwareVersion:'2.22.0-DE3.71'},{firmwareVersion:'2.22.0-DE3.71-T1'},{firmwareVersion:'2.22.0-DE3.71t2'},{firmwareVersion:'2.22.0-DE3.72'}]){
  assert.equal(migrationApplicationMatches({...identity,...patch},target),false);
  assert.throws(()=>matchMigrationLayout(layout,{...identity,...patch},target),{code:'MIGRATION_LAYOUT'});
 }
});

test('T1 registration does not bypass any exact geometry/engine/mounted or archive-bound import guard',()=>{
 for(const key of Object.keys(target.layout)){
  const value=target.layout[key],changed=typeof value==='number'?value+1:value+'changed';
  assert.throws(()=>matchMigrationLayout({...layout,[key]:changed},identity,target,{mounted:true}),{code:'MIGRATION_LAYOUT'},key);
 }
 assert.throws(()=>matchMigrationLayout({...layout,mounted:false},identity,target,{mounted:true}),{code:'MIGRATION_LAYOUT'});
 assert.throws(()=>matchMigrationLayout(layout,identity,{...target,approved:false}),{code:'MIGRATION_LAYOUT'});
 const state={schema:1,drive:'E',backend:3,mounted:true,pending:true,ready:false,bound:true,rebootRequired:false,archiveSha256:'a'.repeat(64)};
 assert.equal(checkImportState(state,{mounted:true,pending:true,archiveSha256:'a'.repeat(64)}).pending,true);
 assert.throws(()=>checkImportState(state,{archiveSha256:'b'.repeat(64)}),{code:'MIGRATION_LAYOUT'});
 assert.throws(()=>checkImportState(state,{ready:true}),{code:'MIGRATION_LAYOUT'});
});

test('DE3.72 is qualified only with its exact counter and verified settings',()=>{
 const current={...identity,firmwareVersion:'2.22.0-DE3.72',applicationCounter:645};
 assert.equal(migrationApplicationMatches(current,target),true);
 for(const patch of [{applicationCounter:644},{applicationCounter:646},{settingsCrcValid:false},{firmwareVersion:'2.22.0-DE3.71'}])
   assert.equal(migrationApplicationMatches({...current,...patch},target),false);
});

for (const [version, counter] of [['2.22.0-DE3.73',646],['2.22.0-DE3.74',647]])
test('local ' + version + ' must report its exact version/counter, valid settings, and matching mounted layout',()=>{
 const current={...identity,firmwareVersion:version,applicationCounter:counter};
 assert.deepEqual(matchMigrationLayout(layout,current,target,{mounted:true}),layout);
 for(const bad of [{applicationCounter:645},{firmwareVersion:'2.22.0-DE3.72'},{settingsCrcValid:false}])
   assert.throws(()=>matchMigrationLayout(layout,{...current,...bad},target),{code:'MIGRATION_LAYOUT'});
 for(const bad of [{mounted:false},{blockCount:511},{metadataBytes:64},{engineSha256:'0'.repeat(64)}])
   assert.throws(()=>matchMigrationLayout({...layout,...bad},current,target,{mounted:true}),{code:'MIGRATION_LAYOUT'});
 assert.equal(migrationApplicationMatches({...identity,firmwareVersion:'2.22.0-DE3.71',applicationCounter:643},target),false);
});
