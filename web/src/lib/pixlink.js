// cylin577/pixl.js v2.27.11: mod/ble/ble_control_plane.c and mod/df/df_proto_{info,vfs}.c.
import {REMOTE_UUIDS as NUS, remoteAvailability} from './remote-control.js';

export const PIXLINK_UUIDS = Object.freeze({
  service:'7e400001-b5a3-f393-e0a9-e50e24dcca9e',
  write:'7e400002-b5a3-f393-e0a9-e50e24dcca9e',
  notify:'7e400003-b5a3-f393-e0a9-e50e24dcca9e'
});
const buttons = ['left','center','right'];
const failure = code => Object.assign(new Error(code), {code});

function bounded(promise, signal, ms) {
  return new Promise((resolve,reject) => {
    let timer;
    const abort = () => finish(reject, failure('cancelled'));
    function finish(fn, value) {
      clearTimeout(timer);
      signal.removeEventListener('abort',abort);
      fn(value);
    }
    Promise.resolve(promise).then(value => finish(resolve,value), error => finish(reject,error));
    if (signal.aborted) return abort();
    signal.addEventListener('abort',abort,{once:true});
    if (ms) timer=setTimeout(() => finish(reject,failure('timeout')),ms);
  });
}

async function channels(session, ids) {
  const service = await session.step(() => session.server.getPrimaryService(ids.service));
  if (service.uuid !== ids.service) throw failure('service');
  const tx = await session.step(() => service.getCharacteristic(ids.write));
  const rx = await session.step(() => service.getCharacteristic(ids.notify));
  if (tx.uuid !== ids.write || rx.uuid !== ids.notify || !rx.properties?.notify ||
      !tx.properties?.write || typeof tx.writeValueWithResponse !== 'function') throw failure('service');
  await session.step(() => rx.startNotifications());
  return {tx,rx};
}

// Subscribe before the write; both the ATT write and the application's reply must succeed.
async function exchange(session, channel, opcode) {
  session.check();
  const {rx,tx}=channel;
  let listener;
  const response = new Promise((resolve,reject) => {
    listener = event => {
      const value=event.target.value;
      if (!value || value.byteLength < 1 || value.getUint8(0)!==opcode) return;
      if (value.byteLength < 4 || value.getUint16(2,true)!==0) return reject(failure('reply'));
      resolve(new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice());
    };
    rx.addEventListener('characteristicvaluechanged',listener);
  });
  try {
    const [bytes] = await session.wait(Promise.all([response, tx.writeValueWithResponse(Uint8Array.of(opcode,0,0,0))]));
    return bytes;
  } finally { rx.removeEventListener('characteristicvaluechanged',listener); }
}

async function mode(session, opcode) {
  const bytes=await exchange(session,session.cp,opcode);
  if (bytes.length!==4) throw failure('reply');
  if (bytes[1]===1) throw failure('rejected');
  if (bytes[1]===255) throw failure('unsupported');
  if (bytes[1]!==0 && bytes[1]!==2) throw failure('reply');
  // In v2.27.11 enter-file/control returns status 2 only when that mode is already active.
  return bytes[1]===2 ? 'already' : 'changed';
}

function readFileReply(bytes) {
  let at=4;
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (bytes[1]!==0) throw failure('files');
  function string() {
    const length=data.getUint16(at,true); at+=2;
    if (length>bytes.length-at) throw failure('files');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at,at+length));
    at+=length;
    return text;
  }
  if(bytes[0]===1) {
    const version=string();
    if (!version.trim() || version.length>128) throw failure('files');
    if (at<bytes.length) string(); // Optional BLE address. Do not store or display it.
    if (at!==bytes.length) throw failure('files');
    return version;
  }
  const count=data.getUint8(at++);
  const labels=new Set();
  let available=false;
  for (let i=0;i<count;i++) {
    const status=data.getUint8(at++), label=String.fromCharCode(data.getUint8(at++));
    string(); // Name supplied by the remote VFS.
    const total=data.getUint32(at,true), free=data.getUint32(at+4,true);
    at+=8;
    if (!['E','I'].includes(label) || labels.has(label) || free>total) throw failure('files');
    labels.add(label);
    if (status===0 && total>0) available=true;
  }
  if (at!==bytes.length || !available) throw failure('files');
}

// No picker, command or background scan runs until the caller explicitly asks for it.
export function createPixLink({environment=globalThis,onState=()=>{},timeoutMs=8000}={}) {
  let session=null;
  const owners=new WeakMap();
  function state(s, phase, error='') {
    s.phase=phase;
    onState({phase,error,name:s.device?.name || ''});
  }
  function close(s, error='', keepLink=false) {
    if (!s || session!==s) return;
    session=null;
    s.controller.abort();
    s.device?.removeEventListener('gattserverdisconnected',s.lost);
    if (!keepLink && s.device?.gatt && owners.get(s.device)===s) s.device.gatt.disconnect();
    if (keepLink) owners.delete(s.device);
    state(s,'disconnected',error);
  }
  function failed(s, e, fallback) {
    const code=typeof e?.code==='string' ? e.code : fallback;
    close(s,code);
    throw failure(code);
  }
  async function connect() {
    if (session) throw failure('busy');
    if (remoteAvailability(environment)) throw failure('unavailable');
    const s={controller:new AbortController()};
    s.check=()=>{if(session!==s)throw failure('cancelled');};
    s.wait=(p,ms=timeoutMs)=>bounded(p,s.controller.signal,ms).then(value=>{s.check();return value;});
    s.step=operation=>{s.check();return s.wait(operation());};
    s.lost=()=>close(s,'lost');
    session=s;
    state(s,'connecting');
    try {
      const picker = environment.navigator.bluetooth.requestDevice({
        filters:[{services:[PIXLINK_UUIDS.service]}],optionalServices:[NUS.service]
      });
      s.device=await s.wait(picker,0);
      s.check();
      owners.set(s.device,s);
      s.device.addEventListener('gattserverdisconnected',s.lost);
      const opening=s.device.gatt.connect().then(server=>{
        if (s.controller.signal.aborted && owners.get(s.device)===s && s.device.gatt.connected) s.device.gatt.disconnect();
        return server;
      });
      s.server=await s.wait(opening);
      s.cp=await channels(s,PIXLINK_UUIDS);
      s.check();
      state(s,'linked');
    } catch(e) { failed(s,e,e?.name==='NotFoundError' && !s.device ? 'cancelled' : 'service'); }
  }
  async function enableControl() {
    const s=session;
    if (s?.phase!=='linked') throw failure('busy');
    state(s,'pending');
    try {
      const result=await mode(s,2);
      s.check();
      state(s,'control');
      return result;
    } catch(e) {failed(s,e,'reply');}
  }
  async function tap(key) {
    const s=session, index=buttons.indexOf(key);
    if (s?.phase!=='control' || index<0) throw failure('busy');
    state(s,'pending');
    try {
      const down=Uint8Array.of(3,0,0,0,0,0,0);
      down[4+index]=1;
      await s.step(() => s.cp.tx.writeValueWithResponse(down));
      await s.step(() => s.cp.tx.writeValueWithResponse(Uint8Array.of(3,0,0,0,0,0,0)));
      s.check();
      state(s,'control');
    } catch(e) {failed(s,e,'lost');}
  }
  async function openFiles(accept) {
    const s=session;
    if (!['linked','control'].includes(s?.phase) || typeof accept!=='function') throw failure('busy');
    state(s,'pending');
    try {
      const nus=await channels(s,NUS);
      await mode(s,1);
      // Verify the actual file application on this link before the UI adopts it.
      readFileReply(await exchange(s,nus,0x01));
      readFileReply(await exchange(s,nus,0x10));
      s.check();
      if (accept({device:s.device,rx:nus.rx,tx:nus.tx})!==true) throw failure('files');
      close(s,'',true);
    } catch(e) {failed(s,e,'files');}
  }
  return {connect, enableControl, tap, openFiles, disconnect:()=>close(session)};
}
