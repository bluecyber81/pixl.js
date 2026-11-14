import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRemoteClient,encodeRemoteRequest,parseRemoteReply,REMOTE_UUIDS,REMOTE_NAME,remoteAvailability} from '../src/lib/remote-control.js';
import {claimGatt, ownsGatt} from '../src/lib/gatt-owner.js';
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
class Events{listeners=new Map();addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}emit(name){for(const fn of [...this.listeners.get(name)||[]])fn({target:this});}}
function fixture(options={}){
  const states=[],packets=[],pickers=[];const device=new Events(),rx=new Events(),tx={properties:{write:true,writeWithoutResponse:true}};
  let disconnects=0,stops=0,starts=0;
  const reply=(request,{status=0,state=1,caps=15,sequence=request[4]|request[5]<<8,opcode=request[3]}={})=>Uint8Array.of(0x50,0x58,1,0x80|opcode,sequence&255,sequence>>>8,status,state,caps&255,caps>>>8,0,0);
  const notify=bytes=>{rx.value=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);rx.emit('characteristicvaluechanged');};
  tx.writeValueWithResponse=bytes=>{const request=new Uint8Array(bytes);packets.push(request);return options.write?options.write(request,notify,reply,packets.length):Promise.resolve(notify(reply(request,request[3]===1?{status:8,state:2}:{})));};
  tx.writeValueWithoutResponse=()=>{throw Error('response-capable characteristic should prefer writeWithResponse');};
  rx.startNotifications=async()=>{starts++;if(options.start)return options.start();return rx;};
  rx.stopNotifications=()=>{stops++;return options.stop?options.stop():Promise.resolve();};
  const service={getCharacteristic:async uuid=>{assert([REMOTE_UUIDS.write,REMOTE_UUIDS.notify].includes(uuid));return uuid===REMOTE_UUIDS.write?tx:rx;}};
  const server={getPrimaryService:async uuid=>{assert.equal(uuid,REMOTE_UUIDS.service);if(options.service)return options.service();return service;}};
  device.gatt={connected:false,connect:()=>{if(options.connect)return options.connect(device,server);device.gatt.connected=true;return Promise.resolve(server);},disconnect:()=>{disconnects++;device.gatt.connected=false;device.emit('gattserverdisconnected');}};
  const environment={isSecureContext:true,navigator:{bluetooth:{requestDevice:request=>{pickers.push(request);return options.picker?options.picker():Promise.resolve(device);}}}};
  const client=createRemoteClient({environment,onState:s=>states.push(s),stepMs:40,commandMs:40,stopMs:5,...options.client});
  return{client,device,rx,tx,states,packets,pickers,notify,reply,get counts(){return{disconnects,stops,starts};}};
}
test('remote is inert until explicit connect and filters exact name plus NUS',async()=>{
 const f=fixture();assert.equal(f.pickers.length,0);assert.equal(f.packets.length,0);await f.client.connect();
 assert.deepEqual(f.pickers,[{filters:[{name:REMOTE_NAME,services:[REMOTE_UUIDS.service]}],optionalServices:[REMOTE_UUIDS.service]}]);
 assert.deepEqual([...f.packets[0]],[80,88,1,0,1,0,0,0]);assert.equal(f.client.snapshot().phase,'ready');await f.client.disconnect();
});
test('same-link handoff requires capability and transfers sole ownership without stopping notifications',async()=>{
 const f=fixture({write:(req,notify,reply)=>notify(reply(req,{caps:31,...(req[3]===4?{state:3}:{})}))});
 await f.client.connect();const receipt=await f.client.command('files');assert.equal(receipt.opcode,4);assert.equal(receipt.status,0);assert.equal(receipt.state,3);
 let accepted;assert.equal(f.client.releaseFileConnection(session=>{accepted=session;return true;}),true);
 assert.equal(accepted.device,f.device);assert.equal(accepted.rx,f.rx);assert.equal(accepted.tx,f.tx);
 assert.equal(f.client.snapshot().phase,'disconnected');assert.equal(f.device.gatt.connected,true);assert.equal(f.counts.stops,0);assert.equal(f.counts.disconnects,0);
 assert.equal(f.rx.listeners.get('characteristicvaluechanged').size,0);assert.equal(f.device.listeners.get('gattserverdisconnected').size,0);
 await f.client.disconnect();assert.equal(f.device.gatt.connected,true);assert.equal(f.counts.disconnects,0);
 assert.throws(()=>f.client.releaseFileConnection(()=>true),{code:'REMOTE_PROTOCOL'});await assert.rejects(f.client.command('left'),{code:'REMOTE_BUSY'});
});
test('same-link opt-out retains legacy operation and never guesses a supported extension',async()=>{
 for(const caps of [15,31]){
  const f=fixture({write:(req,notify,reply)=>notify(reply(req,{caps,...(req[3]===1?{status:8,state:2}:{})}))});
  await f.client.connect();assert.equal((await f.client.command('files',{sameLink:false})).opcode,1);
  assert.throws(()=>f.client.releaseFileConnection(()=>true),{code:'REMOTE_PROTOCOL'});await f.client.disconnect();assert(f.counts.disconnects>0);
 }
});
test('same-link rejects requested-only, wrong state, lost capability and wrong ACK without retry',async()=>{
 for(const bad of [{status:8,state:2},{status:0,state:1},{status:0,state:3,caps:15}]){
  const f=fixture({write:(req,notify,reply)=>notify(reply(req,{caps:31,...(req[3]===4?bad:{})}))});
  await f.client.connect();await assert.rejects(f.client.command('files'),{code:'REMOTE_PROTOCOL'});
  assert.deepEqual(f.packets.map(p=>p[3]),[0,4]);assert.equal(f.client.snapshot().phase,'disconnected');
 }
});
test('same-link closes on rejected ownership and cannot hand over a disconnected device',async()=>{
 for(const mode of ['refuse','throw','gone']){
  const f=fixture({write:(req,notify,reply)=>notify(reply(req,{caps:31,...(req[3]===4?{state:3}:{})}))});
  await f.client.connect();await f.client.command('files');let calls=0;
  if(mode==='gone')f.device.gatt.disconnect();
  assert.throws(()=>f.client.releaseFileConnection(()=>{calls++;if(mode==='throw')throw Error('receiver failed');return false;}));
  assert.equal(calls,mode==='gone'?0:1);assert.equal(f.device.gatt.connected,false);assert.equal(f.packets.length,2);
 }
});
test('exact frame boundaries and byte-offset DataViews are validated',()=>{
 for(const seq of [1,255,256,65535]){const req=encodeRemoteRequest(2,seq,2);assert.equal(req.length,8);assert.equal(req[4]|req[5]<<8,seq);}
 for(const seq of [0,-1,65536,1.2,NaN,'1'])assert.throws(()=>encodeRemoteRequest(2,seq,1),{code:'REMOTE_PROTOCOL'});
 for(const args of [[6,1,0],[5,1,-1],[5,1,128],[0,1,1],[2,1,3],[2,1,-1]])assert.throws(()=>encodeRemoteRequest(...args),{code:'REMOTE_PROTOCOL'});
 const original=Uint8Array.of(80,88,1,130,4,0,0,1,15,0,0,0),padded=new Uint8Array(20);padded.set(original,3);
 assert.equal(parseRemoteReply(new DataView(padded.buffer,3,12)).sequence,4);
 for(const [index,value]of [[0,0],[1,0],[2,2],[3,0],[3,133],[6,9],[7,5],[10,1],[11,1]]){const changed=original.slice();changed[index]=value;assert.throws(()=>parseRemoteReply(changed),{code:'REMOTE_PROTOCOL'});}
 for(const n of [0,11,13,20])assert.throws(()=>parseRemoteReply(new Uint8Array(n)),{code:'REMOTE_PROTOCOL'});
});
test('no Bluetooth support or insecure context fails before picker',async()=>{
 for(const environment of [{},{navigator:{bluetooth:{requestDevice:true}}},{isSecureContext:false,navigator:{bluetooth:{requestDevice(){throw Error('must not run');}}}}]){
  assert.equal(remoteAvailability(environment),'REMOTE_UNAVAILABLE');await assert.rejects(createRemoteClient({environment}).connect(),{code:'REMOTE_UNAVAILABLE'});
 }
});
const lcdImage=Uint8Array.from({length:1024},(_,i)=>(i*37+Math.floor(i/128))&255);
test('unmodified remote client decodes the full transcript from the production C remote protocol',async()=>{
 // Generated by fw/tests/de3/test_ble_remote_de347.py --lcd-vectors FILE
 const source=process.env.REMOTE_LCD_C_VECTORS||new URL('./fixtures/remote-lcd-de374-vectors.txt',import.meta.url);
 const lines=fs.readFileSync(source,'utf8').trim().split(/\r?\n/);
 assert.equal(lines.length,9); // One handshake and eight 128-byte chunks at GATT capacity 247.
 let row=0;
 const f=fixture({write:(req,notify)=>{
   const match=/^([0-9a-f]{16}) ([0-9a-f]+)$/.exec(lines[row++]);
   assert(match);assert.equal(Buffer.from(req).toString('hex'),match[1]);
   notify(Uint8Array.from(Buffer.from(match[2],'hex')));
 }});
 await f.client.connect();
 assert.deepEqual(await f.client.captureDisplay(),lcdImage);assert.equal(row,lines.length);
 await f.client.disconnect();
});
function lcdReply(req,reply,size=128){
 const index=req[6],chunk=lcdImage.slice(index*8,index*8+size);
 const out=new Uint8Array(12+chunk.length);
 out.set(reply(req,{caps:63}));out[10]=index;out[11]=chunk.length;out.set(chunk,12);
 return out;
}
test('remote display requires explicit capture and negotiated capability, including on reconnect',async()=>{
 let caps=63;const f=fixture({write:(req,notify,reply)=>notify(reply(req,{caps}))});
 await f.client.connect();assert.equal(f.packets.length,1);await f.client.disconnect();
 caps=31;await f.client.connect();
 await assert.rejects(f.client.captureDisplay(),{code:'REMOTE_UNSUPPORTED'});
 await f.client.command('right');await f.client.disconnect();
 assert.deepEqual(f.packets.map(p=>p[3]),[0,0,2]);
});
for(const size of [8,72,128])test('remote LCD assembles one frozen frame with '+size+'-byte chunks',async()=>{
 const f=fixture({write:(req,notify,reply)=>{
   if(req[3]!==5)return notify(reply(req,{caps:63}));
   const bytes=lcdReply(req,reply,size);
   notify(bytes);notify(bytes.slice()); // matching duplicated notice before write receipt.
 }});
 await f.client.connect();assert.deepEqual(await f.client.captureDisplay(),lcdImage);
 const chunks=f.packets.slice(1);
 assert.equal(chunks.length,Math.ceil(1024/size));
 assert(chunks.every((p,i)=>p[3]===5 && p[4]===i+2 && p[6]===i*size/8 && p[7]===0));
 await f.client.command('right');await f.client.disconnect();
});
test('remote LCD rejects malformed lengths, wrong offset, lost capability and inconsistent duplicates',async()=>{
 const problems=[
   bytes=>{bytes[11]=0;return bytes;}, bytes=>bytes.slice(0,-1),
   bytes=>{bytes[11]=7;return bytes.slice(0,19);}, bytes=>{bytes[10]=127;return bytes;},
   bytes=>{bytes[10]=1;return bytes;}, bytes=>{bytes[8]=31;return bytes;}, bytes=>{bytes[7]=3;return bytes;},
   bytes=>{const b=new Uint8Array(148);b.set(bytes);b[11]=136;return b;},
 ];
 for(const change of [...problems,null]){
   const f=fixture({write:(req,notify,reply)=>{
     if(req[3]===0)return notify(reply(req,{caps:63}));
     const bytes=lcdReply(req,reply);
     if(change)return notify(change(bytes));
     notify(bytes);bytes[12]^=1;notify(bytes);
   }});
   await f.client.connect();await assert.rejects(f.client.captureDisplay(),{code:'REMOTE_PROTOCOL'});
   assert.equal(f.client.snapshot().phase,'disconnected');assert.equal(f.packets.length,2);
 }
});
test('display read is exclusive, cancel discards a partial frame and a new capture begins at zero',async()=>{
 let delayed,delaySecond=true;
 const f=fixture({write:(req,notify,reply)=>{
   if(req[3]===0)return notify(reply(req,{caps:63}));
   const send=()=>notify(lcdReply(req,reply));
   if(req[6] && delaySecond){delayed=send;return;}
   send();
 }});
 await f.client.connect();
 const capture=f.client.captureDisplay(),cancelled=assert.rejects(capture,{code:'REMOTE_CANCELLED'});
 await turn();
 await assert.rejects(f.client.command('files'),{code:'REMOTE_BUSY'});
 await assert.rejects(f.client.captureDisplay(),{code:'REMOTE_BUSY'});
 await f.client.disconnect();await cancelled;
 delayed();delaySecond=false;
 await f.client.connect();assert.deepEqual(await f.client.captureDisplay(),lcdImage);
 assert.deepEqual(f.packets.slice(0,5).map(p=>[p[3],p[6]]),[[0,0],[5,0],[5,16],[0,0],[5,0]]);
 await f.client.disconnect();
});
test('unfinished LCD reads have bounded chunk and overall deadlines and never retry',async()=>{
 for(const [commandMs,photoMs] of [[20,200],[200,20]]){
   const f=fixture({client:{commandMs,photoMs},write:(req,notify,reply)=>{
     if(!req[3])notify(reply(req,{caps:63}));
   }});
   await f.client.connect();await assert.rejects(f.client.captureDisplay(),{code:'REMOTE_PHOTO_TIMEOUT'});
   assert.equal(f.client.snapshot().phase,'disconnected');
   assert.deepEqual(f.packets.map(p=>p[3]),[0,5]);
 }
});
test('left center right and back send one command each with incrementing sequences',async()=>{
 const f=fixture();await f.client.connect();for(const name of ['left','center','right','back'])await f.client.command(name);
 assert.deepEqual(f.packets.map(x=>[x[3],x[4],x[6]]),[[0,1,0],[2,2,0],[2,3,1],[2,4,2],[3,5,0]]);await f.client.disconnect();
});
test('optional back capability is checked without disabling supported short taps',async()=>{
 const f=fixture({write:(req,notify,reply)=>notify(reply(req,{caps:13}))});await f.client.connect();await assert.rejects(f.client.command('back'),{code:'REMOTE_UNSUPPORTED'});assert.equal(f.packets.length,1);await f.client.command('center');await f.client.disconnect();
});
test('file transition requires REQUESTED and transition state rather than claiming file mode open',async()=>{
 const f=fixture();await f.client.connect();const reply=await f.client.command('files');assert.equal(reply.status,8);assert.equal(reply.state,2);assert.equal(f.client.snapshot().phase,'handoff');await assert.rejects(f.client.command('left'),{code:'REMOTE_BUSY'});assert.equal(f.packets.length,2);await f.client.disconnect();assert(f.counts.disconnects>0);
 for(const response of [{status:0,state:3},{status:0,state:1},{status:8,state:3}]){
  const bad=fixture({write:(req,notify,reply)=>notify(reply(req,req[3]===1?response:{}))});await bad.client.connect();await assert.rejects(bad.client.command('files'),{code:'REMOTE_PROTOCOL'});assert.equal(bad.client.snapshot().phase,'disconnected');
 }
});

test('missing remote service after device selection is unsupported, not a cancelled picker',async()=>{
 const missing=new DOMException('service missing','NotFoundError');assert.equal(missing.code,8);
 const f=fixture({service:()=>Promise.reject(missing)});await assert.rejects(f.client.connect(),{code:'REMOTE_UNSUPPORTED'});
 assert.equal(f.packets.length,0);assert.equal(f.client.snapshot().phase,'disconnected');assert(f.counts.disconnects>0);
});
test('native DOMException picker cancellation is normalized rather than exposing numeric code 8',async()=>{
 for(const synchronous of [false,true]){
  const failure=new DOMException('No device selected','NotFoundError');
  const f=fixture({picker:()=>{if(synchronous)throw failure;return Promise.reject(failure);}});
  await assert.rejects(f.client.connect(),{code:'REMOTE_CANCELLED'});assert.equal(f.packets.length,0);assert.equal(f.client.snapshot().phase,'disconnected');
 }
});
test('native DOMException write failure closes transport using a readable error code',async()=>{
 const f=fixture({write:(req,notify,reply,count)=>{if(count>1)throw new DOMException('Disconnected','InvalidStateError');notify(reply(req));}});
 await f.client.connect();await assert.rejects(f.client.command('center'),{code:'REMOTE_DISCONNECTED'});assert.equal(f.client.snapshot().phase,'disconnected');
});

const contractBytes=fs.readFileSync(new URL('../public/remote-protocol-v1.json',import.meta.url));
const contract=JSON.parse(contractBytes);
test('shared frozen C/browser contract encodes every frame byte exactly',()=>{
 assert.equal(createHash('sha256').update(contractBytes).digest('hex'),'466a406be11f010e452eca096ab3a01f6177f1078e8332d4473629e6931d0df3');
 assert.equal(contract.device_name,REMOTE_NAME);assert.equal(contract.service_uuid,REMOTE_UUIDS.service);assert.equal(contract.write_uuid,REMOTE_UUIDS.write);assert.equal(contract.notify_uuid,REMOTE_UUIDS.notify);
 assert.equal(contract.vectors.length,11);
 for(const vector of contract.vectors){
  const r=vector.request;assert.deepEqual([...encodeRemoteRequest(r[3],r[4]|r[5]<<8,r[6])],r,vector.name);
  const p=vector.reply;assert.deepEqual(parseRemoteReply(Uint8Array.from(p)),{opcode:p[3]&127,sequence:p[4]|p[5]<<8,status:p[6],state:p[7],capabilities:p[8]|p[9]<<8},vector.name);
 }
 assert.deepEqual(contract.vectors.find(v=>v.name==='duplicate_left').request,contract.vectors.find(v=>v.name==='left').request);
 assert.deepEqual(contract.vectors.find(v=>v.name==='duplicate_left').reply,contract.vectors.find(v=>v.name==='left').reply);
});
test('real remote client exchanges shared HELLO, buttons, BACK and OPEN_FILE vectors with mocked GATT',async()=>{
 const names=['initial_status','left','center','right','back','file_requested'];let index=0;
 const f=fixture({write:(req,notify)=>{
  const name=names[index++],vector=contract.vectors.find(v=>v.name===name);assert.deepEqual([...req],vector.request);
  notify(Uint8Array.from(vector.reply));return Promise.resolve();
 }});
 await f.client.connect();for(const command of ['left','center','right','back','files'])await f.client.command(command);
 assert.equal(index,names.length);assert.equal(f.client.snapshot().phase,'handoff');await f.client.disconnect();
});
for(const [status,code]of [[1,'REMOTE_BUSY'],[5,'REMOTE_UNSAFE'],[6,'REMOTE_QUEUE']])test(`remote status ${status} is reported without retry or repeated input`,async()=>{
 const f=fixture({write:(req,notify,reply)=>notify(reply(req,req[3]===0?{}:{status}))});await f.client.connect();await assert.rejects(f.client.command('center'),{code});assert.equal(f.packets.length,2);assert.equal(f.client.snapshot().phase,'ready');await f.client.disconnect();
});
for(const [status,code]of [[2,'REMOTE_PROTOCOL'],[3,'REMOTE_DISABLED'],[4,'REMOTE_UNSUPPORTED'],[7,'REMOTE_PROTOCOL']])test(`unsafe protocol state ${status} closes the link without replay`,async()=>{
 const f=fixture({write:(req,notify,reply)=>notify(reply(req,req[3]===0?{}:{status}))});await f.client.connect();await assert.rejects(f.client.command('center'),{code});assert.equal(f.packets.length,2);assert.equal(f.client.snapshot().phase,'disconnected');
});
test('old protocol or missing mandatory capabilities never enables or sends buttons',async()=>{
 for(const invalid of [Uint8Array.of(0,1,2),Uint8Array.of(80,88,1,128,1,0,0,1,7,0,0,0)]){
  const f=fixture({write:(req,notify)=>notify(invalid)});await assert.rejects(f.client.connect(),{code:'REMOTE_UNSUPPORTED'});await assert.rejects(f.client.command('center'));assert.equal(f.packets.length,1);
 }
});
test('wrong sequence or wrong command ACK cannot acknowledge an outstanding tap',async()=>{
 for(const mismatch of [{sequence:1},{opcode:3}]){
  const f=fixture({write:(req,notify,reply)=>notify(reply(req,req[3]===0?{}:mismatch)),client:{commandMs:12}});await f.client.connect();await assert.rejects(f.client.command('center'),{code:'REMOTE_TIMEOUT'});assert.equal(f.packets.length,2);assert.equal(f.client.snapshot().phase,'disconnected');
 }
});
test('a receipt arriving before the GATT write settles cannot prematurely confirm success',async()=>{
 const gate=defer();const f=fixture({write:(req,notify,reply,count)=>{notify(reply(req));return count===2?gate.promise:Promise.resolve();}});await f.client.connect();let done=false;const p=f.client.command('center').then(()=>done=true);await turn();assert.equal(done,false);assert.equal(f.client.snapshot().phase,'command');await assert.rejects(f.client.command('right'),{code:'REMOTE_BUSY'});gate.resolve();await p;assert(done);await f.client.disconnect();
});
test('write rejection after early ACK fails and disconnects; no false success',async()=>{
 const f=fixture({write:(req,notify,reply,count)=>{notify(reply(req));return count===2?Promise.reject(Error('GATT write failed')):Promise.resolve();}});await f.client.connect();await assert.rejects(f.client.command('center'),{code:'REMOTE_DISCONNECTED'});assert.equal(f.client.snapshot().phase,'disconnected');assert.equal(f.packets.length,2);
});
test('write that never settles is bounded even if an ACK arrives',async()=>{
 const f=fixture({write:(req,notify,reply,count)=>{notify(reply(req));return count===2?new Promise(()=>{}):Promise.resolve();},client:{commandMs:10}});await f.client.connect();await assert.rejects(f.client.command('center'),{code:'REMOTE_TIMEOUT'});assert.equal(f.packets.length,2);
});
test('pending request rejects on disconnect, removes listeners and cannot consume a late ACK',async()=>{
 const f=fixture({write:(req,notify,reply,count)=>{if(count===1)notify(reply(req));}});await f.client.connect();const p=f.client.command('center');const rejection=assert.rejects(p,{code:'REMOTE_CANCELLED'});await f.client.disconnect();await rejection;f.notify(f.reply(f.packets[1]));assert.equal(f.client.snapshot().phase,'disconnected');assert.equal(f.rx.listeners.get('characteristicvaluechanged').size,0);assert.equal(f.device.listeners.get('gattserverdisconnected').size,0);
});
test('hung unsubscription does not keep the local client connected indefinitely',async()=>{
 const f=fixture({stop:()=>new Promise(()=>{})});await f.client.connect();await f.client.disconnect();assert.equal(f.client.snapshot().phase,'disconnected');assert(f.counts.disconnects>0);
});
test('cancelled picker completion never starts GATT and a fresh connection resets sequence',async()=>{
 const gate=defer();const f=fixture({picker:()=>gate.promise});const p=f.client.connect();await f.client.disconnect();gate.resolve(f.device);await assert.rejects(p,{code:'REMOTE_CANCELLED'});assert.equal(f.packets.length,0);assert.equal(f.counts.starts,0);
 const g=fixture();await g.client.connect();await g.client.command('left');await g.client.disconnect();await g.client.connect();assert.deepEqual(g.packets.filter(x=>x[3]===0).map(x=>x[4]),[1,1]);await g.client.disconnect();
});
test('late GATT connection after timeout is cleaned instead of silently connecting',async()=>{
 const gate=defer();const f=fixture({connect:(device,server)=>gate.promise.then(()=>{device.gatt.connected=true;return server;}),client:{stepMs:8}});await assert.rejects(f.client.connect(),{code:'REMOTE_TIMEOUT'});gate.resolve();await turn();assert.equal(f.device.gatt.connected,false);assert.equal(f.packets.length,0);
});
test('an abandoned GATT open that rejects late is cleaned once without closing a replacement', async () => {
 const began = defer(), gate = defer();
 const f = fixture({connect() { began.resolve(); return gate.promise; }});
 const cancelled = assert.rejects(f.client.connect(), {code:'REMOTE_CANCELLED'});
 await began.promise;
 await f.client.disconnect();
 await cancelled;
 const replacement = {};
 claimGatt(f.device, replacement);
 f.device.gatt.connected = true;
 const disconnects = f.counts.disconnects;
 gate.reject(new DOMException('Previous connection failed', 'NetworkError'));
 await turn();
 assert.equal(f.device.gatt.connected, true);
 assert.equal(ownsGatt(f.device, replacement), true);
 assert.equal(f.counts.disconnects, disconnects);
 assert.equal(f.device.listeners.get('gattserverdisconnected').size, 0);
 assert.deepEqual(f.packets, []);
});
test('manual connection check sends only STATUS and accepts only a fresh, corresponding reply', async () => {
 const f = fixture();
 await assert.rejects(f.client.command('status'), {code:'REMOTE_BUSY'});
 await f.client.connect();
 const response = await f.client.command('status');
 assert.equal(response.opcode, 0);
 assert.equal(response.sequence, 2);
 assert.equal(response.state, 1);
 assert.deepEqual(f.packets.map(packet => [...packet]), [[80,88,1,0,1,0,0,0], [80,88,1,0,2,0,0,0]]);
 await f.client.disconnect();
});
test('a stale STATUS reply cannot confirm a manual check; timeout sends no repeat or key', async () => {
 const f = fixture({write(request, notify, reply, count) {
  notify(reply(request, {sequence:1}));
 }});
 await f.client.connect();
 await assert.rejects(f.client.command('status'), {code:'REMOTE_TIMEOUT'});
 assert.equal(f.client.snapshot().phase, 'disconnected');
 assert.deepEqual(f.packets.map(packet => packet[3]), [0,0]);
});
test('a cancelled connection completing after a new file handoff leaves the new owner connected', async () => {
 const oldOpen = defer(), opening = defer();
 let attempts = 0;
 const f = fixture({
  async connect(device, server) {
   if (++attempts === 1) { opening.resolve(); await oldOpen.promise; }
   device.gatt.connected = true;
   return server;
  },
  write(request, notify, reply) { notify(reply(request, {caps:31, state:request[3] === 4 ? 3 : 1})); }
 });
 const cancelled = assert.rejects(f.client.connect(), {code:'REMOTE_CANCELLED'});
 await opening.promise;
 await f.client.disconnect();
 await cancelled;
 await f.client.connect();
 await f.client.command('files');
 f.client.releaseFileConnection(() => true);
 assert.equal(f.device.gatt.connected, true);
 const disconnects = f.counts.disconnects;
 oldOpen.resolve();
 await turn();
 assert.equal(f.device.gatt.connected, true);
 assert.equal(f.counts.disconnects, disconnects);
 assert.deepEqual(f.packets.map(packet => packet[3]), [0,4]);
});
test('handing a link to a receiver that claims it preserves its own session token', async () => {
 const f = fixture({write(request, notify, reply) { notify(reply(request, {caps:31, state:request[3] === 4 ? 3 : 1})); }});
 await f.client.connect();
 await f.client.command('files');
 const fileOwner = {};
 f.client.releaseFileConnection(({device}) => {
  claimGatt(device, fileOwner);
  return true;
 });
 assert.equal(ownsGatt(f.device, fileOwner), true);
 await f.client.disconnect();
 assert.equal(f.device.gatt.connected, true);
});
test('finishing an old disconnect leaves another client’s notifications and connection intact', async () => {
 const f = fixture();
 await f.client.connect();
 const closing = f.client.disconnect();
 const newOwner = {};
 claimGatt(f.device, newOwner);
 await closing;
 assert.equal(f.counts.stops, 0);
 assert.equal(f.counts.disconnects, 0);
 assert.equal(f.device.gatt.connected, true);
 assert.equal(ownsGatt(f.device, newOwner), true);
});
test('disconnect event and observer failure still release pending state',async()=>{
 const f=fixture({client:{onState(){throw Error('observer');}}});await f.client.connect();f.device.gatt.connected=false;f.device.emit('gattserverdisconnected');assert.equal(f.client.snapshot().phase,'disconnected');await assert.rejects(f.client.command('left'));
});
test('a delayed disconnect notification for the previous connection cannot close a live reconnection', async () => {
 const f=fixture();
 await f.client.connect(); await f.client.disconnect(); await f.client.connect();
 f.device.emit('gattserverdisconnected');
 assert.equal(f.client.snapshot().phase,'ready');
 assert.equal(f.device.gatt.connected,true);
 await f.client.disconnect();
});
test('a queued disconnect while GATT is opening does not cancel a new DE session', async () => {
 const began = defer(), gate = defer();
 let attempts = 0;
 const f = fixture({async connect(device, server) {
  if (++attempts === 2) { began.resolve(); await gate.promise; }
  device.gatt.connected = true;
  return server;
 }});
 await f.client.connect();
 await f.client.disconnect();
 const reconnecting = f.client.connect();
 await began.promise;
 assert.equal(f.device.gatt.connected, false);
 f.device.emit('gattserverdisconnected');
 gate.resolve();
 await reconnecting;
 assert.equal(f.client.snapshot().phase, 'ready');
 await f.client.command('status');
 assert.deepEqual(f.packets.map(packet => packet[3]), [0,0,0]);
 await f.client.disconnect();
});
test('a genuine GATT failure after a queued disconnect rejects and permits reconnect', async () => {
 const began = defer(), gate = defer();
 let attempts = 0;
 const f = fixture({async connect(device, server) {
  if (++attempts === 1) { began.resolve(); await gate.promise; }
  device.gatt.connected = true;
  return server;
 }});
 const failed = assert.rejects(f.client.connect(), {code:'REMOTE_UNSUPPORTED'});
 await began.promise;
 f.device.emit('gattserverdisconnected');
 gate.reject(new DOMException('Could not connect', 'NetworkError'));
 await failed;
 assert.equal(f.client.snapshot().phase, 'disconnected');
 assert.equal(f.device.listeners.get('gattserverdisconnected').size, 0);
 assert.deepEqual(f.packets, []);
 await f.client.connect();
 assert.equal(f.client.snapshot().phase, 'ready');
 await f.client.disconnect();
});
test('a notify-only legacy transport cannot bypass the required GATT write acknowledgement',async()=>{
 const f=fixture();f.tx.properties.write=false;await assert.rejects(f.client.connect(),{code:'REMOTE_UNSUPPORTED'});assert.equal(f.packets.length,0);
});
test('duplicate matching ACKs do not duplicate actions; contradictory duplicate closes the session',async()=>{
 const gate=defer();const f=fixture({write:(req,notify,reply,count)=>{notify(reply(req));notify(reply(req));return count===2?gate.promise:undefined;}});await f.client.connect();const p=f.client.command('left');await turn();assert.equal(f.packets.length,2);gate.resolve();await p;await f.client.disconnect();
 const bad=fixture({write:(req,notify,reply,count)=>{notify(reply(req));if(count===2)notify(reply(req,{status:1}));}});await bad.client.connect();await assert.rejects(bad.client.command('left'),{code:'REMOTE_PROTOCOL'});assert.equal(bad.packets.length,2);
});
test('the actual client wraps sequence65535 to1 without emitting sequence0 or replaying any request',async()=>{
 const f=fixture();await f.client.connect();for(let n=0;n<65535;n++)await f.client.command('left');
 assert.equal(f.packets.length,65536);assert.deepEqual(f.packets.slice(-3).map(x=>x[4]|x[5]<<8),[65534,65535,1]);assert(!f.packets.some(x=>(x[4]|x[5]<<8)===0));await f.client.disconnect();
});
