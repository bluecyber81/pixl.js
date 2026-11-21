// Bounded, explicit, read-only comparison on one unchanged storage revision.
// No file contents enter the export; only paths, sizes, hashes and observations.
import { asBytes, checkedDirectory, sha256Bytes } from './safe-upload.js';
import { assertDevicePath, joinDevicePath } from './portable-names.js';

const MAX_FILES = 12, MAX_DIRECTORIES = 8, MAX_FILE_BYTES = 572;
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const equal = (a,b) => a.length === b.length && a.every((n,i) => n === b[i]);
const counters = ['txFrames','txBytes','rxFrames','rxBytes'];
const round = n => Math.round(n * 1000) / 1000;

export async function runLcdReadComparison({rootPath = 'E:/', adapters, signal,
  now = () => performance.now(), onProgress} = {}) {
  for (const key of ['assertSession','probeBatch','readRevision','readDirectory','readSingle','readBatch','digestBatch','readLink','transport'])
    if (typeof adapters?.[key] !== 'function') fail('LCD_COMPARE_ARGUMENT', 'Missing comparison adapter.');
  assertDevicePath(rootPath);
  if (!rootPath.startsWith('E:/')) fail('LCD_COMPARE_ARGUMENT', 'The LCD E drive is required.');
  const started = now();
  const report = {schema:1,kind:'lcd-small-read-comparison',status:'running',startedAt:new Date().toISOString(),
    completedAt:null,rootPath,maxFiles:MAX_FILES,maxDirectories:MAX_DIRECTORIES,directoriesRead:0,
    revision:null,files:[],payloadBytes:0,passes:[],digest:null,radioBefore:null,radioAfter:null,
    sameStorageRevision:false,verified:false,durationMilliseconds:null,
    limitations:[
      'A bounded read-only sample, not a complete backup or restore test.',
      'Single, batch, single run in that fixed order; cache, scheduling and browser effects may differ.',
      'Read durations include browser/transport scheduling; local hashes and byte comparisons are outside the timed read loops.',
      'Before/after link snapshots do not establish continuous PHY, interval or event airtime.',
      'No file contents are included in this report. No storage writes or radio-setting changes are performed.'
    ]};
  function check() {
    adapters.assertSession();
    if (signal?.aborted) fail('LCD_COMPARE_CANCELLED', 'Comparison cancelled.');
  }
  async function call(key,...args) { check(); const value = await adapters[key](...args); check(); return value; }
  const progress = phase => { check(); onProgress?.({phase,files:report.files.length,directories:report.directoriesRead}); };
  async function revision() {
    const value = await call('readRevision');
    if (typeof value !== 'string' || !/^[0-9a-f]{16}$/u.test(value) || /^0{16}$/u.test(value))
      fail('LCD_COMPARE_UNSUPPORTED','No storage revision.');
    return value;
  }
  const finish = () => { report.completedAt=new Date().toISOString(); report.durationMilliseconds=round(now()-started); };
  try {
    check();
    if (!(await call('probeBatch'))) fail('LCD_COMPARE_UNSUPPORTED','Batch reading is unavailable.');
    const beforeLink=await call('readLink');
    report.radioBefore = {observedAt:new Date().toISOString(),data:beforeLink};
    report.revision = await revision();
    const maximum = Math.min(243, adapters.transport()?.maxRequestPayload ?? 243);
    if (!Number.isInteger(maximum) || maximum < 16) fail('LCD_COMPARE_UNSUPPORTED','Request capacity is unavailable.');
    const pending=[rootPath],seen=new Set();
    while (pending.length && report.directoriesRead < MAX_DIRECTORIES && report.files.length < MAX_FILES) {
      progress('listing');
      const directory=pending.pop();
      if (seen.has(directory)) fail('LCD_COMPARE_LIST','Repeated directory.');
      seen.add(directory);
      const entries=checkedDirectory(await call('readDirectory',directory));
      report.directoriesRead++;
      entries.sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      const subdirectories=[];
      for (const entry of entries) {
        const path=joinDevicePath(directory,entry.name);
        if (entry.type===1) subdirectories.push(path);
        else if (entry.size>0 && entry.size<=MAX_FILE_BYTES && report.files.length<MAX_FILES &&
            14+new TextEncoder().encode(path).length<=maximum) report.files.push({path,size:entry.size});
      }
      pending.push(...subdirectories.reverse());
    }
    if (report.files.length<2) fail('LCD_COMPARE_NO_FILES','Open a folder with at least two small files.');
    if (await revision()!==report.revision) fail('LCD_COMPARE_CHANGED','Storage changed during listing.');
    const groups=[];
    let group=[],requestBytes=10;
    for (const file of report.files) {
      const bytes=4+new TextEncoder().encode(file.path).length;
      if (group.length===4 || requestBytes+bytes>maximum) {groups.push(group);group=[];requestBytes=10;}
      group.push({path:file.path,size:file.size});requestBytes+=bytes;
    }
    if (group.length) groups.push(group);
    if (!groups.some(files=>files.length>1)) fail('LCD_COMPARE_UNSUPPORTED','No multi-file request fits this connection.');
    report.payloadBytes=report.files.reduce((sum,file)=>sum+file.size,0);
    report.batchGroups=groups.map(files=>files.length);
    let baseline;
    for (const mode of ['single-before','batch','single-after']) {
      progress(mode);
      const statsBefore=adapters.transport(),begin=now(),received=[];
      if (mode==='batch') {
        for (const files of groups) {
          const results=await call('readBatch',files,report.revision);
          if (!Array.isArray(results) || results.length!==files.length) fail('LCD_COMPARE_UNSUPPORTED','Batch reply is unavailable.');
          for (let i=0;i<files.length;i++) {
            const item=results[i],file=files[i];
            if (item?.path!==file.path || item.size!==file.size) fail('LCD_COMPARE_MISMATCH','Batch identity mismatch.');
            const bytes=asBytes(item.bytes);
            if (bytes.length!==file.size) fail('LCD_COMPARE_MISMATCH','Batch size mismatch.');
            received.push(new Uint8Array(bytes));
          }
        }
      } else {
        for (const file of report.files) {
          const bytes=asBytes(await call('readSingle',file.path,file.size));
          if (bytes.length!==file.size) fail('LCD_COMPARE_MISMATCH','Single-file size mismatch.');
          received.push(new Uint8Array(bytes));
        }
      }
      const duration=round(now()-begin),statsAfter=adapters.transport();
      const transport={};
      for (const key of counters) if (Number.isSafeInteger(statsBefore?.[key]) && Number.isSafeInteger(statsAfter?.[key]) && statsAfter[key]>=statsBefore[key])
        transport[key]=statsAfter[key]-statsBefore[key];
      const pass={mode,files:received.length,payloadBytes:report.payloadBytes,requests:mode==='batch'?groups.length:report.files.length,
        durationMilliseconds:duration,transport,verified:false};
      report.passes.push(pass);
      if (!baseline) {
        baseline=received;
        for (let i=0;i<received.length;i++) {report.files[i].sha256=await sha256Bytes(received[i]);check();}
      } else if (received.some((bytes,i)=>!equal(bytes,baseline[i]))) fail('LCD_COMPARE_MISMATCH','Read contents differ.');
      pass.verified=true;
      if (await revision()!==report.revision) fail('LCD_COMPARE_CHANGED','Storage changed during the comparison.');
    }
    progress('digest');
    const begin=now();let index=0;
    for (const files of groups) {
      const results=await call('digestBatch',files,report.revision);
      if (!Array.isArray(results) || results.length!==files.length) fail('LCD_COMPARE_UNSUPPORTED','Digest reply is unavailable.');
      for (const item of results) {
        const file=report.files[index++];
        if (item?.path!==file.path || item.size!==file.size || item.sha256!==file.sha256)
          fail('LCD_COMPARE_MISMATCH','Device SHA-256 differs from the read bytes.');
      }
    }
    report.digest={files:index,requests:groups.length,durationMilliseconds:round(now()-begin),verified:true};
    if (await revision()!==report.revision) fail('LCD_COMPARE_CHANGED','Storage changed after the comparison.');
    report.sameStorageRevision=true;
    const afterLink=await call('readLink');
    report.radioAfter={observedAt:new Date().toISOString(),data:afterLink};
    report.verified=true;report.status='passed';finish();return report;
  } catch (error) {
    report.status=error?.code==='LCD_COMPARE_CANCELLED'?'cancelled':'failed';
    report.errorCode=typeof error?.code==='string'?error.code:'LCD_COMPARE_FAILED';finish();
    throw Object.assign(error instanceof Error?error:new Error('Comparison failed.'),{testReport:report});
  }
}
