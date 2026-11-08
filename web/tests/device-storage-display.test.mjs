import test from 'node:test';
import assert from 'node:assert/strict';
import {storageUsage,storageAmount,occupiedPercent} from '../src/lib/device-storage-display.js';
const drive=(totalBytes,freeBytes,status=0)=>({label:'E',status,totalBytes,freeBytes});
test('device card distinguishes an empty or full drive from an unknown or inconsistent counter',()=>{
 for(const d of [null,drive(0,0),drive(60,61),drive(60,-1),drive(60,NaN),drive(60,45,1)]) assert.equal(storageUsage(d),null);
 assert.equal(storageUsage(drive(1024,0)).used,1024);
 assert.equal(storageUsage(drive(1024,1024)).used,0);
 const u=storageUsage(drive(2097152,1093632));assert.deepEqual(u,{total:2097152,free:1093632,used:1003520});
 assert.match(occupiedPercent(u,'de_DE'),/^48\s*%$/);
 assert.equal(occupiedPercent(storageUsage(drive(2097152,2097151)),'en'),'< 1 %');
 assert.equal(occupiedPercent(storageUsage(drive(2097152,1)),'en'),'> 99 %');
 assert.equal(storageAmount(1048576,'de_DE'),'1 MiB');assert.equal(storageAmount(1000000,'de_DE'),'976,56 KiB');
 assert.equal(storageAmount(0,'en_GB'),'0 B');
});
