import test from 'node:test';
import assert from 'node:assert/strict';
import {createPixLink,PIXLINK_UUIDS as cp} from '../src/lib/pixlink.js';
import {REMOTE_UUIDS as nus} from '../src/lib/remote-control.js';
import {installPixLinkPeripheral} from '../scripts/pixlink-test-peripheral.mjs';

function setup(settings={}) {
  const sim=installPixLinkPeripheral({cp,nus});
  Object.assign(sim,settings);
  const states=[];
  const client=createPixLink({environment:sim.environment,onState:s=>states.push(s),timeoutMs:120});
  return {client,sim,states};
}

test('explicit picker filters only the PixLink service; connection does not change mode or press a key',async()=>{
  const {client,sim,states}=setup();
  assert.deepEqual(sim.selections,[]);await client.connect();
  assert.deepEqual(sim.selections,[{filters:[{services:[cp.service]}],optionalServices:[nus.service]}]);
  assert.equal(states.at(-1).phase,'linked');assert.deepEqual(sim.writes,[]);
  await assert.rejects(client.tap('left'),{code:'busy'});client.disconnect();
  assert.deepEqual(sim.writes,[]);assert.equal(sim.disconnects,1);
});

test('same-mode receipt accepted, full short taps send exact down/up frames with no fake app receipt',async()=>{
  const {client,sim}=setup({mode:2});await client.connect();
  assert.equal(await client.enableControl(),'already');
  for(const key of ['left','center','right'])await client.tap(key);
  assert.deepEqual(sim.writes,[['cp',2,0,0,0],['cp',3,0,0,0,1,0,0],['cp',3,0,0,0,0,0,0],
    ['cp',3,0,0,0,0,1,0],['cp',3,0,0,0,0,0,0],['cp',3,0,0,0,0,0,1],['cp',3,0,0,0,0,0,0]]);
  await assert.rejects(client.tap('back'),{code:'busy'});client.disconnect();
});

test('checking only the service never activates control on a mismatched device',async()=>{
  const {client,sim}=setup({wrongService:true});await assert.rejects(client.connect(),{code:'service'});
  assert.deepEqual(sim.writes,[]);assert.equal(sim.disconnects,1);
});

test('cancelling the picker ignores subsequent selection',async()=>{
  const {client,sim}=setup({waitPicker:true});const result=client.connect();
  client.disconnect();sim.choose();await assert.rejects(result,{code:'cancelled'});assert.equal(sim.services,0);
});

test('closure during outstanding button write sends nothing on a replacement session',async()=>{
  const {client,sim,states}=setup({holdButton:true});await client.connect();await client.enableControl();
  const first=client.tap('left');
  await assert.rejects(client.tap('center'),{code:'busy'});
  sim.device.gatt.disconnect();
  assert.equal(states.at(-1).error,'lost');sim.releaseWrite();
  await assert.rejects(first,{code:'cancelled'});await client.connect();
  assert.equal(sim.writes.filter(w=>w[1]===3).length,1);client.disconnect();
});

test('declined, unsupported, malformed and unsolicited replies do not falsely acknowledge control',async()=>{
  for(const [settings,code] of [[{modeStatus:1},'rejected'],[{modeStatus:255},'unsupported'],
    [{customModeReply:[2,0,1,0]},'reply'],[{customModeReply:[1,0,0,0]},'timeout']]) {
    const {client,sim,states}=setup(settings);await client.connect();
    await assert.rejects(client.enableControl(),{code});assert.equal(sim.writes.length,1);
    assert.equal(states.at(-1).phase,'disconnected');assert.equal(sim.disconnects,1);
  }
});

test('same-link handoff requires mode reply, real firmware and readable drive; no extra scan or reboot',async()=>{
  for(const initialMode of [0,1,2]) {
    const {client,sim,states}=setup({mode:initialMode});await client.connect();let handoffs=0;
    await client.openFiles(session=>{
      handoffs++;assert.equal(session.device,sim.device);assert.equal(session.rx.uuid,nus.notify);
      assert.equal(session.tx.uuid,nus.write);return true;
    });
    assert.equal(handoffs,1);assert.equal(states.at(-1).phase,'disconnected');
    assert.deepEqual(sim.writes,[['cp',1,0,0,0],['nus',1,0,0,0],['nus',16,0,0,0]]);
    client.disconnect();assert.equal(sim.device.gatt.connected,true);assert.equal(sim.selections.length,1);
  }
});

test('file handoff fails closed for missing NUS, missing mode reply, unreadable data or rejection by owner',async()=>{
  for(const [settings,code,called] of [[{missingFiles:true},'files',0],[{dropMode:true},'timeout',0],[{badVersion:true},'files',0],[{emptyDrive:true},'files',0],[{},'files',1]]) {
    const {client,sim}=setup(settings);await client.connect();let count=0;
    await assert.rejects(client.openFiles(()=>{count++;return false;}),{code});
    assert.equal(count,called);assert.equal(sim.disconnects,1);
    if(settings.missingFiles)assert.deepEqual(sim.writes,[]);
  }
});

test('a cancelled GATT open completing late cannot tear down a later file-manager handoff for the same device',async()=>{
  const {client,sim}=setup();
  const server=sim.device.gatt;
  const connect=server.connect.bind(server);
  let finishOld;
  server.connect=async()=>{
    server.connect=connect;
    await new Promise(resolve=>finishOld=resolve);
    return connect();
  };
  const old=client.connect();
  while(!finishOld)await new Promise(resolve=>setTimeout(resolve,0));
  client.disconnect();
  await assert.rejects(old,{code:'cancelled'});
  await client.connect();
  await client.openFiles(()=>true);
  finishOld();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(server.connected,true);
});
