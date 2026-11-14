// DE remote protocol PX v1. NUS is used exclusively by the awake remote mode;
// no file command or button is sent before the capability handshake succeeds.
import { claimGatt, ownsGatt, releaseGatt } from './gatt-owner.js';
export const REMOTE_UUIDS=Object.freeze({service:'6e400001-b5a3-f393-e0a9-e50e24dcca9e',write:'6e400002-b5a3-f393-e0a9-e50e24dcca9e',notify:'6e400003-b5a3-f393-e0a9-e50e24dcca9e'});
export const REMOTE_NAME='Pixl.Remote';
export const REMOTE_LCD_CAPABILITY=0x20;
const lcdOpcode=5, lcdBytes=1024;
const commands=Object.freeze({status:[0,0],files:[1,0],left:[2,0],center:[2,1],right:[2,2],back:[3,0]});
const error=code=>Object.assign(new Error(code),{code});
const remoteCode=(failure,fallback)=>typeof failure?.code==='string'&&/^REMOTE_[A-Z_]+$/.test(failure.code)?failure.code:fallback;
const statusErrors={1:'REMOTE_BUSY',2:'REMOTE_PROTOCOL',3:'REMOTE_DISABLED',4:'REMOTE_UNSUPPORTED',5:'REMOTE_UNSAFE',6:'REMOTE_QUEUE',7:'REMOTE_PROTOCOL'};
export function remoteAvailability(environment=globalThis){return environment.isSecureContext===false||typeof environment.navigator?.bluetooth?.requestDevice!=='function'?'REMOTE_UNAVAILABLE':'';}
export function encodeRemoteRequest(opcode,sequence,arg=0){
  if(!Number.isInteger(sequence)||sequence<1||sequence>65535||![0,1,2,3,4,lcdOpcode].includes(opcode)||!Number.isInteger(arg))throw error('REMOTE_PROTOCOL');
  const maxArg=opcode===2?2:opcode===lcdOpcode?127:0;
  if(arg<0||arg>maxArg)throw error('REMOTE_PROTOCOL');
  return Uint8Array.of(0x50,0x58,1,opcode,sequence&255,sequence>>>8,arg,0);
}
export function parseRemoteReply(value){
  const bytes=value instanceof DataView?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):value;
  if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes[0]!==0x50||bytes[1]!==0x58||bytes[2]!==1||![0x80,0x81,0x82,0x83,0x84,0x85].includes(bytes[3])||bytes[6]>8||bytes[7]>4)throw error('REMOTE_PROTOCOL');
  const reply={opcode:bytes[3]&0x7f,sequence:bytes[4]|bytes[5]<<8,status:bytes[6],state:bytes[7],capabilities:bytes[8]|bytes[9]<<8};
  if(reply.opcode===lcdOpcode && reply.status===0){
    const index=bytes[10],length=bytes[11];
    if(index>127 || length<8 || length>128 || length%8 || index*8+length>lcdBytes || bytes.length!==12+length)throw error('REMOTE_PROTOCOL');
    return {...reply,index,pixels:bytes.slice(12)};
  }
  if(bytes.length!==12||bytes[10]!==0||bytes[11]!==0)throw error('REMOTE_PROTOCOL');
  return reply;
}
export function createRemoteClient(options={}){
  const environment=options.environment||globalThis,report=options.onState||(()=>{});
  const stepMs=options.stepMs??20000,commandMs=options.commandMs??4000,stopMs=options.stopMs??1000;
  let generation=0,phase='disconnected',device=null,owner=null,tx=null,rx=null,pending=null,seq=1,caps=0,connectPromise=null,closing=null,handoffMode=null;
  const cancels=new Set();
  const state=(next,code='')=>{phase=next;try{report({phase,error:code,capabilities:caps});}catch{/*Observers cannot control transport cleanup.*/}};
  function disconnectGatt(target, token){
    if(!ownsGatt(target,token))return;
    try{if(token.opening||target.gatt.connected)target.gatt.disconnect();}catch{/*Already gone.*/}
    // An aborted connect can still settle successfully. Keep its token until then.
    if(!token.opening)releaseGatt(target,token);
  }
  function bounded(operation,ms,check){
    return new Promise((resolve,reject)=>{
      let done=false;const finish=(failure,value)=>{if(done)return;done=true;clearTimeout(timer);cancels.delete(cancel);failure?reject(failure):resolve(value);};
      const cancel=()=>finish(error('REMOTE_CANCELLED'));cancels.add(cancel);
      const timer=setTimeout(()=>finish(error('REMOTE_TIMEOUT')),ms);
      Promise.resolve(operation).then(value=>{try{check?.();finish(null,value);}catch(failure){finish(failure);}},failure=>finish(failure));
    });
  }
  function failPending(failure){if(!pending)return;const item=pending;pending=null;clearTimeout(item.timer);item.reject(failure);}
  function detach(){
    const snapshot={device,owner,rx,tx};
    rx?.removeEventListener('characteristicvaluechanged',notification);
    device?.removeEventListener('gattserverdisconnected',disconnected);
    device=null;owner=null;tx=null;rx=null;caps=0;handoffMode=null;return snapshot;
  }
  function terminate(code='REMOTE_DISCONNECTED'){
    ++generation;for(const cancel of [...cancels])cancel();failPending(error(code));
    const old=detach();connectPromise=null;disconnectGatt(old.device,old.owner);state('disconnected',code);
  }
  function disconnected(event){
    // A queued event from the previous session can arrive while reconnecting.
    // The pending connect has its own rejection and timeout.
    if(event.target===device && !owner.opening && !device.gatt.connected)terminate('REMOTE_DISCONNECTED');
  }
  function finishPending(){if(pending?.reply&&pending.writeDone){const item=pending;pending=null;clearTimeout(item.timer);item.resolve(item.reply);}}
  function notification(event){
    if(event.target!==rx)return;
    let reply;try{reply=parseRemoteReply(event.target.value);}catch{terminate(phase==='connecting'?'REMOTE_UNSUPPORTED':'REMOTE_PROTOCOL');return;}
    // Old duplicate receipts cannot acknowledge a newer operation.
    if(!pending||reply.sequence!==pending.sequence||reply.opcode!==pending.opcode)return;
    if(pending.reply){
      const same=Object.keys(reply).every(key=>key==='pixels'
        ? pending.reply.pixels?.length===reply.pixels.length && reply.pixels.every((byte,i)=>pending.reply.pixels[i]===byte)
        : pending.reply[key]===reply[key]);
      if(!same)terminate('REMOTE_PROTOCOL');
      return;
    }
    pending.reply=reply;finishPending();
  }
  function request(opcode,arg){
    if(pending) return Promise.reject(error('REMOTE_BUSY'));
    if(!device?.gatt?.connected||!tx)return Promise.reject(error('REMOTE_DISCONNECTED'));
    const sequence=seq;seq=seq===65535?1:seq+1;
    const payload=encodeRemoteRequest(opcode,sequence,arg);
    return new Promise((resolve,reject)=>{
      const item={sequence,opcode,resolve,reject,writeDone:false,reply:null,timer:null};pending=item;
      item.timer=setTimeout(()=>terminate(opcode===lcdOpcode?'REMOTE_PHOTO_TIMEOUT':'REMOTE_TIMEOUT'),commandMs);
      let write;
      try{
        if(tx.properties?.write&&typeof tx.writeValueWithResponse==='function')write=tx.writeValueWithResponse(payload);
        else throw error('REMOTE_UNSUPPORTED');
      }catch(failure){terminate(remoteCode(failure,'REMOTE_DISCONNECTED'));return;}
      Promise.resolve(write).then(()=>{if(pending===item){item.writeDone=true;finishPending();}},()=>{if(pending===item)terminate('REMOTE_DISCONNECTED');});
    });
  }
  function accept(reply,opcode){
    if(reply.status!==0&&!(opcode===1&&reply.status===8))throw error(statusErrors[reply.status]||'REMOTE_PROTOCOL');
    if((reply.capabilities&0x0d)!==0x0d)throw error('REMOTE_UNSUPPORTED');
    if(reply.state!==(opcode===1?2:opcode===4?3:1)||reply.status!==(opcode===1?8:0))throw error('REMOTE_PROTOCOL');
    if(opcode===4&&!(reply.capabilities&0x10))throw error('REMOTE_PROTOCOL');
    return reply;
  }
  async function connect(){
    if(connectPromise)return connectPromise;
    if(phase!=='disconnected'||closing)throw error('REMOTE_BUSY');
    const unavailable=remoteAvailability(environment);if(unavailable)throw error(unavailable);
    const current=++generation, token={opening:false};let selected;
    const check=()=>{if(current!==generation || (selected && !ownsGatt(selected,token)))throw error('REMOTE_CANCELLED');};
    state('connecting');
    // Invoke the picker in the user's click stack; never bound its interaction time.
    let picker;try{picker=environment.navigator.bluetooth.requestDevice({filters:[{name:REMOTE_NAME,services:[REMOTE_UUIDS.service]}],optionalServices:[REMOTE_UUIDS.service]});}catch(failure){state('disconnected');throw error(remoteCode(failure,failure.name==='NotFoundError'?'REMOTE_CANCELLED':'REMOTE_UNSUPPORTED'));}
    const task=(async()=>{
      try{
        const chosen=await picker;check();selected=chosen;device=chosen;owner=token;claimGatt(device,token);seq=1;
        device.addEventListener('gattserverdisconnected',disconnected);
        async function openGatt(){
          token.opening=true;
          try{return await chosen.gatt.connect();}
          finally{token.opening=false;if(current!==generation)disconnectGatt(chosen,token);}
        }
        const server=await bounded(openGatt(),stepMs,check);check();
        const service=await bounded(server.getPrimaryService(REMOTE_UUIDS.service),stepMs,check);check();
        tx=await bounded(service.getCharacteristic(REMOTE_UUIDS.write),stepMs,check);check();
        rx=await bounded(service.getCharacteristic(REMOTE_UUIDS.notify),stepMs,check);check();
        rx.addEventListener('characteristicvaluechanged',notification);
        await bounded(rx.startNotifications(),stepMs,check);check();
        const hello=accept(await request(0,0),0);check();caps=hello.capabilities;state('ready');
      }catch(failure){
        const code=remoteCode(failure,failure.name==='NotFoundError'&&!selected?'REMOTE_CANCELLED':'REMOTE_UNSUPPORTED');
        if(current===generation)terminate(code);
        throw error(code);
      }finally{if(connectPromise===task)connectPromise=null;}
    })();
    connectPromise=task;return task;
  }
  async function command(name,options={}){
    if(phase!=='ready')throw error('REMOTE_BUSY');
    if(!Object.hasOwn(commands,name)||(name==='back'&&!(caps&2)))throw error('REMOTE_UNSUPPORTED');
    const current=generation,[legacyOpcode,arg]=commands[name];
    const opcode=name==='files'&&options.sameLink!==false&&(caps&0x10)?4:legacyOpcode;let handoff=false;state('command');
    try{const reply=accept(await request(opcode,arg),opcode);if(current!==generation)throw error('REMOTE_DISCONNECTED');handoff=opcode===1||opcode===4;if(handoff)handoffMode=opcode===4?'same-link':'reconnect';return reply;}
    catch(failure){if(current===generation&&['REMOTE_PROTOCOL','REMOTE_DISABLED','REMOTE_UNSUPPORTED'].includes(failure.code))terminate(failure.code);throw failure;}
    finally{if(current===generation)state(handoff?'handoff':'ready');}
  }
  async function captureDisplay(){
    if(phase!=='ready')throw error('REMOTE_BUSY');
    if(!(caps&REMOTE_LCD_CAPABILITY))throw error('REMOTE_UNSUPPORTED');
    const current=generation;
    const pixels=new Uint8Array(lcdBytes);
    state('command');
    const deadline=setTimeout(()=>{if(current===generation)terminate('REMOTE_PHOTO_TIMEOUT');},options.photoMs??45000);
    try{
      // Offset zero freezes a fresh frame on the LCD device. Every chunk is
      // requested once; an older device is never probed, even on timeout.
      for(let offset=0;offset<pixels.length;){
        const index=offset/8;
        const reply=accept(await request(lcdOpcode,index),lcdOpcode);
        if(current!==generation)throw error('REMOTE_DISCONNECTED');
        if(reply.index!==index || !(reply.capabilities&REMOTE_LCD_CAPABILITY))throw error('REMOTE_PROTOCOL');
        pixels.set(reply.pixels,offset);
        offset+=reply.pixels.length;
      }
      return pixels;
    }catch(failure){
      if(current===generation&&['REMOTE_PROTOCOL','REMOTE_DISABLED','REMOTE_UNSUPPORTED'].includes(failure.code))terminate(failure.code);
      throw failure;
    }finally{clearTimeout(deadline);if(current===generation)state('ready');}
  }
  // Synchronous ownership transfer: the new owner attaches its listeners before
  // any queued browser event can run. Keep notifications and GATT alive. The
  // receiver returns true only after taking ownership; failures close this link.
  function releaseFileConnection(acceptConnection){
    if(phase!=='handoff'||handoffMode!=='same-link'||pending||!device?.gatt?.connected||typeof acceptConnection!=='function')throw error('REMOTE_PROTOCOL');
    ++generation;const session=detach();connectPromise=null;
    try{if(acceptConnection(Object.freeze({device:session.device,rx:session.rx,tx:session.tx}))!==true)throw error('REMOTE_REJECTED');releaseGatt(session.device,session.owner);state('disconnected');return true;}
    catch(failure){disconnectGatt(session.device,session.owner);state('disconnected',remoteCode(failure,'REMOTE_DISCONNECTED'));throw failure;}
  }
  function disconnect(){
    if(closing)return closing;
    ++generation;for(const cancel of [...cancels])cancel();failPending(error('REMOTE_CANCELLED'));
    const old=detach();connectPromise=null;
    if(!old.device){state('disconnected');return Promise.resolve();}
    state('disconnecting');
    const task=new Promise(resolve=>{
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);disconnectGatt(old.device,old.owner);closing=null;state('disconnected');resolve();};
      const timer=setTimeout(finish,stopMs);
      Promise.resolve().then(()=>{if(ownsGatt(old.device,old.owner))return old.rx?.stopNotifications?.();}).then(finish,finish);
    });closing=task;return task;
  }
  return Object.freeze({connect,command,disconnect,releaseFileConnection,captureDisplay,snapshot:()=>({phase,capabilities:caps})});
}
