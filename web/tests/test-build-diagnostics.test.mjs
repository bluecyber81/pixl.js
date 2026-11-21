import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMtuDiagnostics,normalizeMtuDiagnostics,parseStorageGcDiagnostics,normalizeStorageGcDiagnostics,supportsBleTestDiagnostics,supportsLinkDiagnostics,supportsStorageGcDiagnostics} from '../src/lib/device-extra-diagnostics.js';
import {parseStartupDiagnostics,normalizeStartupDiagnostics,startupMountPresentation,createStartupDiagnosticReport} from '../src/lib/startup-diagnostics.js';
import {storageCleanupPresentation} from '../src/lib/device-storage-display.js';
import {normalizeStorageDiagnostics,createCombinedDiagnosticReport} from '../src/lib/diagnostic-snapshot.js';
import {diagnosticSnapshot} from './fixtures/diagnostic-overview-data.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`,import.meta.url),'utf8'));
const bytes=hex=>Uint8Array.from(Buffer.from(hex,'hex'));
const linkFixture=fixture('ble-link-diagnostic-v3'),link=()=>bytes(linkFixture.responsePayloadHex);
const gcFixtures=fixture('packed-gc-diagnostic-v1').cases,gc=name=>bytes(gcFixtures.find(f=>f.name===name).hex);
const startup=()=>bytes(fixture('startup-profile-v5').hex);

test('MTUD v3 decodes the production C serializer and preserves the global option meaning',()=>{
 const value=parseMtuDiagnostics(link());
 assert.equal(value.schemaVersion,3);assert.equal(value.effectiveAttMtu,250);assert.equal(value.link.connectionIntervalUnits,24);
 assert.equal(value.link.rxPhy,2);assert.equal(value.link.txPhy,2);
 assert.deepEqual(value.experiment,{scope:'softdevice-test-configuration',testBuild:true,eventLengthExtensionEnabled:true,nominalEventLengthUnits:6,lastOptionResult:0});
 assert.deepEqual(normalizeMtuDiagnostics({...value,path:'PRIVATE'}),value);
 const raw=link();raw[32]=1;new DataView(raw.buffer).setUint32(36,0xffffffff,true);
 assert.equal(parseMtuDiagnostics(raw).experiment.lastOptionResult,null);
 for(const version of ['2.22.0-DE3.95','2.22.0-DE3.98','2.22.0-DE3.96-OLEDt1','',null]) assert.equal(supportsBleTestDiagnostics(version),false);
 assert.equal(supportsBleTestDiagnostics('2.22.0-DE3.96'),true);
 assert.equal(supportsBleTestDiagnostics('2.22.0-DE3.97'),true);
});

test('test link parser rejects short/reserved/inconsistent payloads without a guessed option state',()=>{
 for(const input of [link().slice(0,39),new Uint8Array(41),null])assert.throws(()=>parseMtuDiagnostics(input));
 for(const [offset,value] of [[4,4],[32,0],[32,7],[33,1],[34,1],[25,1]]){
  const raw=link();raw[offset]=value;assert.throws(()=>parseMtuDiagnostics(raw),`offset ${offset}`);
 }
 const raw=link();new DataView(raw.buffer).setUint32(36,0xffffffff,true);assert.throws(()=>parseMtuDiagnostics(raw));
 const failed=link();new DataView(failed.buffer).setUint32(36,7,true);
 assert.equal(parseMtuDiagnostics(failed).experiment.eventLengthExtensionEnabled,true,'failed SDK option request keeps the previously successful state');
 assert.equal(parseMtuDiagnostics(failed).experiment.lastOptionResult,7);
});

test('PXGC production C cases distinguish unknown, clean, pins and the last completed error',()=>{
 for(const f of gcFixtures){const info=parseStorageGcDiagnostics(bytes(f.hex));assert.deepEqual(normalizeStorageGcDiagnostics({...info,reclaimableBytes:99999}),info);}
 assert.equal(parseStorageGcDiagnostics(gc('unmounted')).cleanupState,'unknown');
 assert.equal(parseStorageGcDiagnostics(gc('mountedUnknown')).lastGcResult,null);
 assert.equal(parseStorageGcDiagnostics(gc('clean')).cleanupState,'clean');
 const pinned=parseStorageGcDiagnostics(gc('pinned'));assert.equal(pinned.obsoletePinHandles,2);assert.equal(pinned.fileReaders,1);assert.equal(pinned.directorySnapshots,1);
 assert.equal(parseStorageGcDiagnostics(gc('writer')).writerActive,true);
 assert.equal(parseStorageGcDiagnostics(gc('cleanupNoSpace')).lastGcResult,-28);
 const io=parseStorageGcDiagnostics(gc('cleanupIoError'));assert.equal(io.lastGcResult,-5);assert.equal(io.poisoned,true);
 const view=storageCleanupPresentation(pinned,'de_DE');assert.match(view.state,/ausstehend/);assert.match(view.note,/keine Bytezahl/);assert.doesNotMatch(JSON.stringify(view.rows),/freigebbar|MiB|KiB/);
});

test('PXGC rejects reserved flags/bytes, invalid reader counts and fabricated clean state',()=>{
 for(const input of [gc('clean').slice(0,23),new Uint8Array(25),null])assert.throws(()=>parseStorageGcDiagnostics(input));
 for(const [offset,value] of [[4,2],[5,23],[6,73],[7,49],[8,3],[20,1],[9,9],[11,1]]){
  const raw=gc('clean');raw[offset]=value;assert.throws(()=>parseStorageGcDiagnostics(raw),`offset ${offset}`);
 }
 for(const [offset,value] of [[7,16],[7,2],[8,2]]) {const raw=gc('unmounted');raw[offset]=value;assert.throws(()=>parseStorageGcDiagnostics(raw));}
 const absent=gc('mountedUnknown');absent[16]=1;assert.throws(()=>parseStorageGcDiagnostics(absent));
 const pending=gc('pinned');pending[8]=2;assert.throws(()=>parseStorageGcDiagnostics(pending));
});

test('PXST v5 production C fixture exports RTC ticks and presents inclusive time with explicit units',()=>{
 const value=parseStartupDiagnostics(startup());assert.equal(value.schemaVersion,5);assert.deepEqual(normalizeStartupDiagnostics({...value,secret:'PRIVATE'}),value);
 assert.deepEqual(value.mountProfile,{scope:'last-packedfs-mount-scan',testBuild:true,available:true,countersSaturated:false,ticksPerSecond:16384,flashWaitTicks:32,flashTransferTicks:8,crcTicks:12,indexPassTicks:50,flashReadTransactions:1});
 const presentation=startupMountPresentation(value,'de_DE');
 assert.equal(presentation.rows.find(row=>/Indexprüfung/.test(row[0]))[1],'3,052 ms (50 Ticks)');
 assert.match(presentation.note,/nicht aufsummieren/);assert.match(presentation.note,/16384 Hz/);assert.match(presentation.note,/keine CPU-Zeit/);
 const report=createStartupDiagnosticReport(value,'2026-11-21T12:00:00.000Z','2.22.0-DE3.96');
 assert.equal(report.startup.mountProfile.flashWaitTicks,32);assert.match(report.limits.join(' '),/inclusive index pass/);
});

test('PXST v5 validates absent profiles, frequency, reserved flags, saturation and independent mount absence',()=>{
 for(const input of [startup().slice(0,111),new Uint8Array(113),null])assert.throws(()=>parseStartupDiagnostics(input));
 for(const offset of [4,5]){const raw=startup();raw[offset]=0;assert.throws(()=>parseStartupDiagnostics(raw));}
 const reserved=startup();reserved[84]=13;assert.throws(()=>parseStartupDiagnostics(reserved));
 const zeroHz=startup();zeroHz.fill(0,88,92);assert.throws(()=>parseStartupDiagnostics(zeroHz));
 const unknown=startup();unknown[84]=4;assert.throws(()=>parseStartupDiagnostics(unknown));unknown.fill(0,92);
 assert.equal(parseStartupDiagnostics(unknown).mountProfile.available,false);
 const absent=unknown.slice();absent.fill(0,40,84);assert.equal(parseStartupDiagnostics(absent).mount,null);
 const inconsistent=absent.slice();inconsistent[84]=5;assert.throws(()=>parseStartupDiagnostics(inconsistent));
 const saturated=startup();saturated.fill(255,92,96);assert.throws(()=>parseStartupDiagnostics(saturated));saturated[84]=7;
 assert.match(startupMountPresentation(parseStartupDiagnostics(saturated),'en').note,/lower bounds/);
 assert.match(startupMountPresentation(parseStartupDiagnostics(saturated),'en').rows.find(row=>/wait for ready/.test(row[0]))[1],/^≥/);
});

test('optional cleanup and test diagnostics survive the allowlisted combined JSON export; old storage shape is unchanged',()=>{
 const snapshot=diagnosticSnapshot(),storage=snapshot.sections.storage.data;
 assert.equal(Object.hasOwn(normalizeStorageDiagnostics(storage),'cleanup'),false);
 const cleanup=parseStorageGcDiagnostics(gc('pinned'));storage.cleanup={...cleanup,rawPayload:'PRIVATE'};
 assert.deepEqual(normalizeStorageDiagnostics(storage).cleanup,cleanup);
 assert.equal(normalizeStorageDiagnostics({...storage,cleanup:{...cleanup,obsoletePinHandles:77}}),null);
 snapshot.sections.mtu.data=parseMtuDiagnostics(link());snapshot.sections.startup.data=parseStartupDiagnostics(startup());
 const report=createCombinedDiagnosticReport({baseReport:{firmwareVersion:'2.22.0-DE3.96',connected:true},snapshot});
 assert.equal(report.diagnosticSnapshot.sections.storage.data.cleanup.obsoletePinHandles,2);
 assert.equal(report.diagnosticSnapshot.sections.startup.data.mountProfile.ticksPerSecond,16384);
 assert.match(report.limitations.join(' '),/global SoftDevice/);assert.match(report.limitations.join(' '),/must not be summed/);
 assert.doesNotMatch(JSON.stringify(report),/PRIVATE|rawPayload/);
});

test('App671 exposes normal read-only diagnostics without enabling the old experiment',()=>{
 assert.equal(supportsLinkDiagnostics('2.22.0-DE3.98'),true);
 assert.equal(supportsStorageGcDiagnostics('2.22.0-DE3.98'),true);
 assert.equal(supportsBleTestDiagnostics('2.22.0-DE3.98'),false);
 for(const version of ['2.22.0-DE3.99','2.22.0-DE3.98-OLEDt1',undefined]){
  assert.equal(supportsLinkDiagnostics(version),false);
  assert.equal(supportsStorageGcDiagnostics(version),false);
  assert.equal(supportsBleTestDiagnostics(version),false);
 }
});
