// Common synthetic peripheral for Node and browser tests; no real BLE connections.
export function installPixLinkPeripheral({cp,nus}, host=globalThis) {
  const device=new EventTarget(), writes=[], selections=[];
  const sim={device,writes,selections,mode:0,modeStatus:null,dropMode:false,wrongService:false,
    missingFiles:false,badVersion:false,emptyDrive:false,holdButton:false,services:0,disconnects:0};
  function emit(rx, arr) {
    rx.value=new DataView(Uint8Array.from(arr).buffer);
    rx.dispatchEvent(new Event('characteristicvaluechanged'));
  }
  const string=s=>[s.length,0,...new TextEncoder().encode(s)];
  const services=new Map();
  for(const [type,ids] of [['cp',cp],['nus',nus]]) {
    const rx=Object.assign(new EventTarget(),{uuid:ids.notify,properties:{notify:true},enabled:false,
      async startNotifications(){this.enabled=true;return this;}});
    const tx={uuid:ids.write,properties:{write:true},async writeValueWithResponse(bytes){
      const arr=Array.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes), [op]=arr;
      if(!rx.enabled) throw Error('Unexpected write before subscription');
      writes.push([type,...arr]);
      if(type==='cp') {
        if(op===3) {
          if(sim.holdButton) await new Promise(resolve=>sim.releaseWrite=resolve);
          return;
        }
        if(sim.dropMode) return;
        const status=sim.modeStatus??(sim.mode===op?2:0);
        if(!status) sim.mode=op;
        emit(rx,sim.customModeReply??[op,status,0,0]);
      } else if(sim.mode!==1) throw Error('Not in file transfer mode');
      else if(op===1) emit(rx,[1,0,0,0,...(sim.badVersion?[99,0]:string('2.27.11'))]);
      else if(op===0x10) emit(rx,[op,0,0,0,...(sim.emptyDrive?[0]:[1,0,69,...string('External Flash'),0,0,32,0,0,0,16,0])]);
      else if(op===0x16 || op===0x12) {
        const length=arr[4]|arr[5]<<8;
        const path=new TextDecoder().decode(Uint8Array.from(arr.slice(6,6+length)));
        if(op===0x16 && path==='E:/') emit(rx,[op,0,0,0,...string('Proof.txt'),3,0,0,0,0,0]);
        else if(op===0x12 && path==='E:/Proof.txt' && arr[6+length]===8 && !sim.fileOpen) {
          sim.fileOpen=true;
          emit(rx,[op,0,0,0,1]);
        } else throw Error('Unexpected file operation');
      }
      else if(op===0x14 && sim.fileOpen && arr[4]===1) emit(rx,[op,0,0,0,17,34,51]);
      else if(op===0x13 && sim.fileOpen && arr[4]===1) {sim.fileOpen=false;emit(rx,[op,0,0,0]);}
      else if(op===0x03) emit(rx,[op,255,0,0]); // Legacy file transport.
      else emit(rx,[op,255,0,0]);
    }};
    services.set(ids.service,{uuid:ids.service, async getCharacteristic(id){
      if(id===ids.write)return tx;
      if(id===ids.notify)return rx;
      throw Error('Invalid characteristic');
    }});
    if(type==='cp') sim.notify=arr=>emit(rx,arr);
  }
  device.name='Pixl.js';device.id='pixlink-test';
  device.gatt={connected:false,
    async connect(){this.connected=true;return this;},
    async getPrimaryService(id){
      sim.services++;
      if(sim.wrongService)return {uuid:'mismatch'};
      if(sim.missingFiles && id===nus.service) throw Error('File service missing');
      if(!services.has(id)) throw Error('Unknown service');
      return services.get(id);
    },
    disconnect(){
      if(!this.connected)return;
      sim.disconnects++;this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));
    }
  };
  const bluetooth={requestDevice(options){
    selections.push(options);
    if(sim.waitPicker) return new Promise(resolve=>sim.choose=()=>resolve(device));
    return Promise.resolve(device);
  }};
  sim.environment={navigator:{bluetooth},isSecureContext:true};
  if(host.window) {
    Object.defineProperty(host.navigator,'bluetooth',{value:bluetooth});
    host.window.testPixLink=sim;
  }
  return sim;
}
