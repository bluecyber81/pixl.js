import { normalizeDiagnosticSnapshot } from './diagnostic-snapshot.js';
import { diagnosticBuildIdentity } from './firmware-build-reference.js';
export const MENU_RUN_FILE_LIMIT = 256 * 1024;
const bad = () => Object.assign(new Error('Choose a complete Allmiibo diagnostic JSON containing PXMI v2.'), {code:'MENU_RUN_INVALID'});
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,48})?$/.test(value) ? value : null;
const runs = new WeakSet();
export function parseMenuRun(text) {
  if (typeof text !== 'string' || !text.length || text.length > MENU_RUN_FILE_LIMIT || new TextEncoder().encode(text).length > MENU_RUN_FILE_LIMIT) throw bad();
  let data;try{data=JSON.parse(text);}catch{throw bad();}
  if (!data || data.schema !== 1 || data.application !== 'Allmiibo Dateimanager' || (data.firmwareVersion !== null && !version(data.firmwareVersion))) throw bad();
  const snapshot=normalizeDiagnosticSnapshot(data.diagnosticSnapshot), menu=snapshot?.sections.menu;
  if (!snapshot || menu?.state !== 'available' || menu.data.schemaVersion !== 2) throw bad();
  // Imported identity claims and reference hashes are not observations. Derive
  // only the allowlisted fields already validated by the snapshot decoder.
  const identity=diagnosticBuildIdentity({firmwareVersion:data.firmwareVersion,boot:snapshot.sections.boot?.data});
  const run=Object.freeze({schemaVersion:1,startedAt:snapshot.startedAt,completedAt:snapshot.completedAt,
    observedAt:menu.observedAt,identity:Object.freeze(identity.observed),menu:menu.data});
  runs.add(run);return run;
}
const fields = Object.freeze(['menuEntered','selectionAttempted','launcherReturned','targetActive','leftBeforeSelection',
 'targetAppId','launchCallMilliseconds','countsSaturated','centerCounts.press','centerCounts.release','centerCounts.short',
 'lastAppReturn.sourceContext','lastAppReturn.targetContext','lastAppReturn.staleEventsDiscarded','lastAppReturn.sourceAppId',
 'lastAppReturn.targetAppId','lastAppReturn.firstLabelAppId','lastAppReturn.lastLabelAppId','lastAppReturn.firstIconAppId','lastAppReturn.lastIconAppId']);
const valueAt=(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object)??null;
const equalField=(a,b)=>a==null||b==null?'unknown':a===b?'equal':'different';
export function compareMenuRuns(first,second) {
  if (!runs.has(first) || !runs.has(second)) throw bad();
  const hardwareKeys=['chipPart','chipVariantRaw','flashBytes','ramBytes'];
  const hardware=hardwareKeys.map(key=>equalField(first.identity[key],second.identity[key]));
  const rows=fields.map(field=>{
    const before=valueAt(first.menu,field),after=valueAt(second.menu,field);
    const bound=(menu,value)=>field==='lastAppReturn.staleEventsDiscarded'&&value===65535 || field.startsWith('centerCounts.')&&menu.countsSaturated&&value===255;
    const beforeSaturated=bound(first.menu,before),afterSaturated=bound(second.menu,after),saturated=beforeSaturated||afterSaturated;
    return {field,before,after,changed:before!==after,saturated,beforeSaturated,afterSaturated,
      difference:typeof before==='number'&&typeof after==='number'&&!saturated?after-before:null};
  });
  return {format:'allmiibo-pxmi-comparison',schemaVersion:1,
    first:{startedAt:first.startedAt,completedAt:first.completedAt,observedAt:first.observedAt,identity:first.identity},
    second:{startedAt:second.startedAt,completedAt:second.completedAt,observedAt:second.observedAt,identity:second.identity},
    comparison:{firmwareVersion:equalField(first.identity.firmwareVersion,second.identity.firmwareVersion),
      applicationCounter:equalField(first.identity.applicationCounter,second.identity.applicationCounter),
      hardwareProfile:hardware.includes('different')?'different':hardware.includes('unknown')?'unknown':'equal',
      bootRegionSha256:equalField(first.identity.bootRegionSha256,second.identity.bootRegionSha256),
      samePhysicalDeviceVerified:false,applicationHashVerified:false},
    changedFields:rows.filter(row=>row.changed).length,rows,
    limitations:['No unique device identifier is exported; equal hardware profiles do not establish the same physical device.',
      'Version and application counter are reported values, not a measured application BIN hash or SourceID.',
      'Raw value differences are not elapsed event counts: a restart, a new return or context wrap can reset/replace values.',
      'Saturated counter values are lower bounds; no exact difference is reported for them.',
      'PXMI records drawing calls, not physical LCD visibility or display latency.']};
}
