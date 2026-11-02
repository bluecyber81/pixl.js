import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackup,createBackupCheckpoint} from '../src/lib/backup.js';
import {memoryVfs} from './helpers/memory-vfs.mjs';

test('raw128 backup API explicitly refuses a resume checkpoint before any device I/O',async()=>{
 const vfs=memoryVfs();vfs.put('E:/tags/a.bin',[1,2,3]);vfs.put('E:/tags/b.bin',[4,5]);
 const identity={rootPath:'E:/tags',deviceKey:'test-device',firmwareVersion:'2.22.0-DE3.47',preserveLegacyNames:true};
 const checkpointState=createBackupCheckpoint(identity);
 const options={...identity,checkpointState,readDirectory:vfs.api.readDirectory,readFile:vfs.api.readFile,readRawMetadata:async()=>new Uint8Array(128)};
 await assert.rejects(createBackup(options),/Raw migration backups require fresh reads without a resume checkpoint/);
 assert.equal(checkpointState.summary().files,0);
 assert.deepEqual(vfs.log,[]);
});
