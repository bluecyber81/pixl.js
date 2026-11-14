import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMenuRun,compareMenuRuns,MENU_RUN_FILE_LIMIT} from '../src/lib/menu-run-comparison.js';
import {parseMenuDiagnostics} from '../src/lib/device-extra-diagnostics.js';
import {createCombinedDiagnosticReport} from '../src/lib/diagnostic-snapshot.js';
import {TEST_FIRMWARE_REFERENCE,diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {diagnosticSnapshot} from './fixtures/diagnostic-overview-data.mjs';
const hex='50584d49022001000101010000000000feffffffffffffff0200080808030803';
function report(version='2.22.0-DE3.71t1',counter=644){
 const snapshot=structuredClone(diagnosticSnapshot());snapshot.sections.boot.data.applicationCounter=counter;
 snapshot.sections.menu={state:'available',observedAt:snapshot.completedAt,errorCode:null,data:parseMenuDiagnostics(Uint8Array.from(Buffer.from(hex,'hex')))};
 return createCombinedDiagnosticReport({baseReport:{firmwareVersion:version},snapshot});
}
const parsed=data=>parseMenuRun(JSON.stringify(data));

test('package hash and SourceID are references, never silently promoted to observed device identity',()=>{
 const value=report(),identity=value.buildIdentity;
 assert.equal(identity.referenceRelation,'version-and-counter');assert.equal(identity.applicationHashVerified,false);
 assert.equal(identity.samePhysicalDeviceVerified,false);assert.equal(identity.observed.applicationCounter,644);
 assert.equal(identity.observed.applicationBinSha256,null);assert.equal(identity.observed.sourceId,null);assert.equal(identity.observed.uniqueDeviceId,null);
 assert.equal(identity.packageReference,TEST_FIRMWARE_REFERENCE);assert.equal(TEST_FIRMWARE_REFERENCE.artifactStatus,'experimental-signed-application');
 assert.equal(TEST_FIRMWARE_REFERENCE.hardwareAcceptance,'first-device-run-reported');
 assert.equal(report('2.22.0-DE3.71',643).buildIdentity.referenceRelation,'different-version');
 assert.equal(report('2.22.0-DE3.71t1',643).buildIdentity.referenceRelation,'different-counter');
 assert.equal(diagnosticBuildIdentity({firmwareVersion:'2.22.0-DE3.71t1'}).referenceRelation,'version-only');
});

test('two validated v2 runs show explicit state changes and raw differences across firmware versions',()=>{
 const first=report('2.22.0-DE3.71',643),second=report();
 second.diagnosticSnapshot=structuredClone(second.diagnosticSnapshot);
 Object.assign(second.diagnosticSnapshot.sections.menu.data.lastAppReturn,{staleEventsDiscarded:5,lastLabelAppId:8,lastIconAppId:8});
 first.privateDeviceId='SECRET';first.buildIdentity.observed.uniqueDeviceId='SECRET';
 const result=compareMenuRuns(parsed(first),parsed(second));
 assert.equal(result.comparison.firmwareVersion,'different');assert.equal(result.comparison.applicationCounter,'different');
 assert.equal(result.comparison.hardwareProfile,'equal');assert.equal(result.comparison.samePhysicalDeviceVerified,false);
 assert.equal(result.changedFields,3);
 const stale=result.rows.find(row=>row.field==='lastAppReturn.staleEventsDiscarded');assert.equal(stale.difference,3);
 assert.doesNotMatch(JSON.stringify(result),/SECRET/);assert.equal(result.first.identity.uniqueDeviceId,null);
 assert.match(result.limitations.join(' '),/not elapsed event counts/);
});

test('saturation suppresses exact deltas per field and no-return stays distinct from zero observations',()=>{
 const a=report(),b=report();a.diagnosticSnapshot=structuredClone(a.diagnosticSnapshot);b.diagnosticSnapshot=structuredClone(b.diagnosticSnapshot);
 a.diagnosticSnapshot.sections.menu.data.lastAppReturn.staleEventsDiscarded=255;
 b.diagnosticSnapshot.sections.menu.data.lastAppReturn.staleEventsDiscarded=65535;
 let result=compareMenuRuns(parsed(a),parsed(b));let row=result.rows.find(r=>r.field==='lastAppReturn.staleEventsDiscarded');
 assert.equal(row.difference,null);assert.equal(row.beforeSaturated,false);assert.equal(row.afterSaturated,true);
 b.diagnosticSnapshot.sections.menu.data.lastAppReturn=null;
 result=compareMenuRuns(parsed(a),parsed(b));row=result.rows.find(r=>r.field==='lastAppReturn.sourceAppId');
 assert.equal(row.before,8);assert.equal(row.after,null);assert.equal(row.changed,true);assert.equal(row.difference,null);
});

test('unknown boot identity is explicitly noncomparable and reference claims from imported JSON are ignored',()=>{
 const a=report(),b=report();b.diagnosticSnapshot=structuredClone(b.diagnosticSnapshot);
 b.diagnosticSnapshot.sections.boot={state:'unavailable',observedAt:null,data:null,errorCode:null};
 b.buildIdentity={applicationHashVerified:true,observed:{sourceId:'FORGED',applicationCounter:644,uniqueDeviceId:'FORGED'}};
 const result=compareMenuRuns(parsed(a),parsed(b));assert.equal(result.comparison.hardwareProfile,'unknown');
 assert.equal(result.comparison.applicationCounter,'unknown');assert.equal(result.comparison.applicationHashVerified,false);
 assert.equal(result.second.identity.applicationCounter,null);assert.doesNotMatch(JSON.stringify(result),/FORGED/);
});

test('bounded imports reject nonreports, v1-only, malformed v2, missing sections and oversized Unicode JSON',()=>{
 for(const value of ['', 'null','{}','not json',' '.repeat(MENU_RUN_FILE_LIMIT+1)])assert.throws(()=>parseMenuRun(value),{code:'MENU_RUN_INVALID'});
 for(const mutate of [data=>data.schema=2,data=>data.application='Unknown',data=>data.firmwareVersion='<script>',
   data=>delete data.diagnosticSnapshot.sections.boot,data=>data.diagnosticSnapshot.sections.menu.data.schemaVersion=1,
   data=>data.diagnosticSnapshot.sections.menu.data.lastAppReturn.targetContext=-1]){
   const data=JSON.parse(JSON.stringify(report()));mutate(data);assert.throws(()=>parsed(data),{code:'MENU_RUN_INVALID'});
 }
 const data=report();data.unrelated='ä'.repeat(140000);assert.throws(()=>parsed(data),{code:'MENU_RUN_INVALID'});
 assert.throws(()=>compareMenuRuns({},{}),{code:'MENU_RUN_INVALID'});
});

export {report};

for(const [version,counter] of [['2.22.0-DE3.72',645],['2.22.0-DE3.73',646],['2.22.0-DE3.74',647]]) test(`App${counter} is tied to its own signed package and never claims device acceptance`,()=>{
 const {buildIdentity}=report(version,counter);
 assert.equal(buildIdentity.referenceRelation,'version-and-counter');
 assert.equal(buildIdentity.packageReference.applicationCounter,counter);
 assert.equal(buildIdentity.packageReference.hardwareAcceptance,'pending');
 assert.equal(buildIdentity.applicationHashVerified,false);
});
