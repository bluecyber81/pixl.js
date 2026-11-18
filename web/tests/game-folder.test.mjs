import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deviceGames,deviceFolderSpec,previewDeviceFolder,applyDeviceFolder} from '../src/lib/game-folder.js';

const load = path => readFileSync(new URL(path,import.meta.url),'utf8');
const games = deviceGames(JSON.parse(load('../src/data/figure-usage.json')),JSON.parse(load('../src/data/catalogue.json')));
const totk = games.find(g => g.id === 1);
const ids = [...totk.figures.keys()];
const spec = (n=2, folder='Zelda') => deviceFolderSpec(totk,folder,ids.slice(0,n));
const meta = {valid:true,flags:{raw:0,readonly:false,hide:false},notes:'',amiibo:{head:0,tail:0}};
const entry = (name,type=1,size=0) => ({name,type,size,meta:structuredClone(meta)});

function fixture() {
  const dirs = new Map([['E:/',[]]]);
  const writes = [];
  const add = (path,type,size) => {
    const split = path.lastIndexOf('/');
    const parent = split === 2 ? 'E:/' : path.slice(0,split);
    assert.ok(dirs.has(parent));
    dirs.get(parent).push(entry(path.slice(split+1),type,size));
    if (type === 1) dirs.set(path,[]);
  };
  const session = {
    assertSession() {}, async readDirectory(path) { return structuredClone(dirs.get(path)); },
    async createDirectory(path) { writes.push(path); add(path,1); },
    async touchFile(path) { writes.push(path); add(path,0,0); }
  };
  return {session,dirs,writes,add};
}

test('uses only exact group/figure pairs supplied by firmware, including nested groups',() => {
  const firmwarePairs = new Set(load('../../fw/data/amiidb_link.csv').trim().split(/\r?\n/).map(line => line.split(',').slice(0,2).join(',')));
  const actual = new Set(games.flatMap(group => [...group.figures.keys()].map(id => group.id+','+id)));
  assert.deepEqual(actual,new Set([...firmwarePairs].filter(pair => !pair.startsWith('255,'))));
  assert.equal(totk.label,'The Legend of Zelda: Tears of the Kingdom');
  assert.equal(totk.figures.get('01000000034f0902'),'8-Bit Link');
  assert.ok(games.find(group => group.id === 56)?.label.includes('Animal Crossing'));
  assert.equal(deviceFolderSpec(totk,'Zelda',['01000000034f0902']).rows[0].path,'E:/amiibo/fav/Zelda/1_01000000_034F0902.fav');
  assert.throws(() => deviceFolderSpec(totk,'Zelda',['deadbeefdeadbeef']),{code:'FAV_SELECTION'});
  assert.equal(deviceFolderSpec(totk,'Zelda',[ids[0],ids[0]]).rows.length,1);
});

test('a portable named folder is limited to 25 UTF-8 bytes and single component',() => {
  for (const folder of ['', '..','foo/bar','a\\b','COM1','x.','ü'.repeat(13)]) assert.throws(() => spec(1,folder),{code:'FAV_FOLDER_NAME'});
  assert.equal(spec(1,'ü'.repeat(12)+'a').folder.length,13);
});

test('preview reads only, apply creates missing parents and empty markers, repeated apply skips all',async() => {
  const {session,dirs,writes} = fixture();
  const plan=await previewDeviceFolder(session,spec());
  assert.equal(plan.exists,false);
  assert.deepEqual(writes,[]);
  const result=await applyDeviceFolder(session,plan);
  assert.deepEqual(result.added,ids.slice(0,2));
  assert.deepEqual(dirs.get(plan.path).map(e=>e.size),[0,0]);
  const before=writes.slice();
  assert.deepEqual((await applyDeviceFolder(session,plan)).skipped,ids.slice(0,2));
  assert.deepEqual((await previewDeviceFolder(session,spec())).rows.map(r=>r.state),['present','present']);
  assert.deepEqual(writes,before);
});

test('legacy aliases, collisions, foreign files and read-only ancestors are preserved',async() => {
  const {session,dirs,add,writes} = fixture();
  const request=spec(3);
  for (const path of ['E:/amiibo','E:/amiibo/fav',request.path]) add(path,1);
  add(request.path+'/'+request.rows[0].name.replace(/^1_/,'001_').toLowerCase(),0,71);
  add(request.path+'/'+request.rows[1].name.toUpperCase(),1);
  add(request.path+'/mine.bin',0,540);
  const before=structuredClone(dirs.get(request.path));
  const plan=await previewDeviceFolder(session,request);
  assert.deepEqual(plan.rows.map(r=>r.state),['present','conflict','new']);
  await applyDeviceFolder(session,plan);
  assert.deepEqual(writes,[request.rows[2].path]);
  assert.deepEqual(dirs.get(request.path).slice(0,3),before);
  dirs.get('E:/')[0].meta.flags={raw:4,readonly:true,hide:false};
  await assert.rejects(previewDeviceFolder(session,request),{code:'FAV_FOLDER_BLOCKED'});
});

test('reconnect reconciles an interrupted group and a lost close acknowledgement',async() => {
  const {session,writes}=fixture();
  const request=spec(13);
  const plan=await previewDeviceFolder(session,request);
  const touch=session.touchFile;
  let online=true, calls=0;
  session.assertSession=()=>{if (!online) throw Error('offline');};
  session.touchFile=async path=>{
    await touch(path);
    if (++calls === 10) { online=false; throw Error('close ack lost'); }
  };
  await assert.rejects(applyDeviceFolder(session,plan),{message:'close ack lost',confirmed:8});
  online=true;
  const retry=await previewDeviceFolder(session,request);
  assert.equal(retry.rows.filter(r=>r.state==='present').length,10);
  assert.equal((await applyDeviceFolder(session,retry)).added.length,3);
  assert.equal(new Set(writes).size,writes.length);
});

test('no acknowledgement-only success when a marker cannot be read back',async() => {
  const {session}=fixture();
  session.touchFile=async()=>{};
  await assert.rejects(applyDeviceFolder(session,await previewDeviceFolder(session,spec(1))),{code:'FAV_VERIFY',confirmed:0});
});
