import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountSfc,nodes,text} from './helpers/vue-component-host.mjs';
import {deviceGames,deviceFolderSpec,previewDeviceFolder,applyDeviceFolder,suggestedGameFolder} from '../src/lib/game-folder.js';

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

test('folder suggestions form valid 25-byte portable names for every firmware group', () => {
  for (const group of games) {
    const name = suggestedGameFolder(group);
    assert.equal(deviceFolderSpec(group, name, [group.figures.keys().next().value]).folder, name);
  }
  assert.equal(suggestedGameFolder(totk), 'Tears of the Kingdom');
  const suggest = label => suggestedGameFolder({id:42, label});
  assert.equal(suggest('Parent › Amiibo Cards › Series 2'), 'Series 2');
  assert.equal(suggest('ä'.repeat(11) + '🌿x'), 'ä'.repeat(11));
  assert.equal(suggest('E\u0301dition / Amiibo'), 'Édition Amiibo');
  assert.equal(suggest('COM1'), '42');
  assert.equal(suggest('?. '), '42');
});

for (const locale of ['de_DE','en_US']) test('game folder selection, manual names and verified preview in '+locale, async () => {
  const de = locale === 'de_DE';
  const figures = Array.from({length:8}, (_,index) => ({
    id:index.toString(16).padStart(16,'0'), name:index === 0 ? 'Link' : 'Zelda '+index
  }));
  const groups = [{id:1, labelPath:['First title']}, {id:2, labelPath:['Second title']}]
    .map(group => ({...group, sourceLine:1}));
  const usage = {groups,figures:figures.map(({id})=>({id,associations:groups.map(group=>({groupId:group.id,sourceLine:1}))}))};
  const {session,add,writes} = fixture();
  const calls = [];
  const vm = await mountSfc(new URL('../src/components/GameFolder.vue',import.meta.url), {
    locale, connected:true,supported:true,blocked:false,generation:1,catalogue:{entries:figures},
    async withSession(write,fn){calls.push(write);await fn(session);}
  }, {'../data/figure-usage.json':{default:usage}});
  const button = label => nodes(vm.root,'button').find(node=>text(node).trim()===label);
  async function click(label) {
    const node=button(label);assert.ok(node,label);assert.ok(!node.props.disabled,label);
    await node.props.onClick();await vm.tick();
  }
  async function setModel(node,value) {
    node.props['onUpdate:modelValue'](value);
    node.props.onInput?.();
    await vm.tick();
  }
  const gamePicker=nodes(vm.root,'select')[0];
  const folder=()=>nodes(vm.root,'input').find(node=>node.props.placeholder==='Zelda');
  const search=()=>nodes(vm.root,'input').find(node=>node.props.type==='search');
  const select=de?'Alle Treffer markieren':'Select all matches';
  const clear=de?'Auswahl leeren':'Clear selection';
  const preview=de?'Ordner auf dem Gerät prüfen':'Preview device folder';
  try {
    await setModel(gamePicker,1);assert.equal(folder().value,'First title');
    await setModel(folder(),'Custom');
    await setModel(gamePicker,2);assert.equal(folder().value,'Custom');
    await click(de?'Spielnamen übernehmen':'Use game name');assert.equal(folder().value,'Second title');
    await setModel(gamePicker,1);assert.equal(folder().value,'First title');
    await setModel(search(),'Link');await click(select);assert.equal(button(select).props.disabled,true);
    await setModel(search(),'Zelda');await click(select);assert.match(text(vm.root),/8 \/ 8/);
    await setModel(search(),'nobody');assert.equal(button(select).props.disabled,true);
    assert.deepEqual(calls,[]);
    add('E:/amiibo',1);add('E:/amiibo/fav',1);add('E:/amiibo/fav/First title',1);
    function addMarker(idx,type){const id=figures[idx].id;add('E:/amiibo/fav/First title/1_'+id.slice(0,8)+'_'+id.slice(8)+'.fav',type);}
    for (let i=0;i<3;++i) addMarker(i,0);
    await click(preview);
    const summary=()=>text(nodes(vm.root,'p').find(node=>node.props.class==='preview-summary')).trim();
    assert.match(summary(), de?/8 ausgewählt · 5 neu · 3 schon vorhanden/:/8 selected · 5 new · 3 already present/);
    addMarker(3,1);await click(preview);
    assert.match(summary(), de?/8 ausgewählt · 4 neu · 3 schon vorhanden · 1 mit Namenskonflikt/:/8 selected · 4 new · 3 already present · 1 with name conflicts/);
    assert.deepEqual(calls,[false,false]);assert.deepEqual(writes,[]);
    await click(clear);
    assert.match(text(vm.root),/0 \/ 8/);assert.ok(!nodes(vm.root,'p').some(node=>node.props.class==='preview-summary'));
    assert.equal(button(preview).props.disabled,true);
  } finally { vm.app.unmount(); }
});
