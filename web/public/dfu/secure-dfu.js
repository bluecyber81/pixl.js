/*
 * Web Bluetooth DFU — based on the protocol implementation by Rob Moran.
 * Copyright (c) 2018 Rob Moran
 * Local bounded transport revision, 2026. No physical-device validation yet.
 *
 * The MIT License (MIT)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SecureDfu = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CONTROL = '8ec90001-f315-4f60-9fb8-838830daea50';
  const PACKET = '8ec90002-f315-4f60-9fb8-838830daea50';
  const OWNERS = new WeakMap();
  const RESULT = {2:'Opcode not supported',3:'Invalid parameter',4:'Insufficient object memory',5:'Firmware/init validation failed',7:'Invalid object type',8:'Operation not permitted',10:'Operation failed',11:'Extended DFU error'};
  const EXTENDED = {5:'Firmware version too low',6:'Hardware version mismatch',7:'SoftDevice requirement mismatch',8:'Missing signature',12:'Firmware image hash mismatch',13:'Insufficient flash space'};
  const asBytes = value => {
    if (value instanceof ArrayBuffer) return new Uint8Array(value).slice();
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice();
    throw new Error('Expected binary firmware data');
  };
  class SecureDfu {
    static SERVICE_UUID = 0xFE59;
    static EVENT_LOG = 'log';
    static EVENT_PROGRESS = 'progress';
    constructor(crc32, bluetooth, delay = 0, options = {}) {
      if (typeof crc32 !== 'function') throw new Error('A CRC32 implementation is required');
      this.crc32 = crc32;
      this.bluetooth = bluetooth || globalThis.navigator?.bluetooth;
      this.delay = Math.max(0,Number(delay)||0);
      this.timeouts = {operation:10000,gatt:15000,reboot:3000,...options.timeouts};
      for (const value of Object.values(this.timeouts)) if (!Number.isFinite(value)||value<1) throw new Error('Invalid DFU timeout');
      this._events = new Map(); this._listeners=[]; this._pending=null;
      this._busy=false;this._selecting=false;this._active=false;this._epoch=0;
      this._device=null;this.controlChar=null;this.packetChar=null;this.lastResult=null;
    }
    addEventListener(name, callback) { if (!this._events.has(name)) this._events.set(name,new Set());this._events.get(name).add(callback); }
    removeEventListener(name, callback) { this._events.get(name)?.delete(callback); }
    dispatchEvent(name, detail) { for(const callback of this._events.get(name)||[]) {try{callback(detail);}catch(error){globalThis.console?.error('DFU event listener failed',error);}} }
    log(message) {this.dispatchEvent('log',{message});}
    progress(object,totalBytes,currentBytes) {this.dispatchEvent('progress',{object,totalBytes,currentBytes});}
    _listen(target,name,callback){target.addEventListener(name,callback);this._listeners.push(()=>target.removeEventListener(name,callback));}
    _assertActive(epoch=this._epoch){if(!this._active||epoch!==this._epoch)throw new Error('DFU session ended');}
    _disconnect(){if(!this._device||OWNERS.get(this._device)!==this._ownerToken)return;try{this._device.gatt.disconnect();}catch(_) {}}
    _rejectPending(error){if(this._pending){const pending=this._pending;this._pending=null;clearTimeout(pending.timer);pending.reject(error);}}
    _finishPending(){const pending=this._pending;if(pending?.ackData&&pending.writeSettled){this._pending=null;clearTimeout(pending.timer);pending.resolve(pending.ackData);}}
    _cleanup(){this._active=false;if(this._ownerToken)this._ownerToken.active=false;this._rejectPending(new Error('DFU session ended'));for(const remove of this._listeners.splice(0))remove();this.controlChar=null;this.packetChar=null;this._rebootResolve=null;}
    _bounded(promise,ms,label){
      const epoch=this._epoch;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{if(this._active&&epoch===this._epoch){this._active=false;this._rejectPending(new Error(label+' timed out'));this._disconnect();}reject(new Error(label+' timed out'));},ms);
        Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
      });
    }
    async _gattConnect(device){
      const epoch=this._epoch,owner=this._ownerToken;
      const connection=device.gatt.connected?Promise.resolve(device.gatt):device.gatt.connect();
      Promise.resolve(connection).then(()=>{if((!this._active||epoch!==this._epoch)&&OWNERS.get(device)===owner){try{device.gatt.disconnect();}catch(_){}}},()=>{});
      const server=await this._bounded(connection,this.timeouts.gatt,'Bluetooth connection');this._assertActive(epoch);
      const service=await this._bounded(server.getPrimaryService(SecureDfu.SERVICE_UUID),this.timeouts.gatt,'DFU service lookup');this._assertActive(epoch);
      const chars=await this._bounded(service.getCharacteristics(),this.timeouts.gatt,'DFU characteristic lookup');this._assertActive(epoch);return chars;
    }
    _start(device){
      if(OWNERS.get(device)?.active)throw new Error('This Bluetooth device already has an active DFU session');
      this._ownerToken={active:true};OWNERS.set(device,this._ownerToken);
      this._active=true;this._epoch++;this._device=device;this._disconnected=false;this._finalAck=false;this._finalExecute=false;
      this._listen(device,'gattserverdisconnected',()=>{
        this._disconnected=true;
        if(this._finalAck){this._rebootResolve?.();return;}
        this._active=false;this._rejectPending(new Error('Bluetooth disconnected before confirmed DFU completion'));
      });
    }
    async connect(device){
      const chars=await this._gattConnect(device);
      this.controlChar=chars.find(c=>c.uuid===CONTROL);this.packetChar=chars.find(c=>c.uuid===PACKET);
      if(!this.controlChar||!this.packetChar)throw new Error('DFU control/packet characteristics missing; enter DFU mode on the device');
      if(!this.controlChar.properties.notify&&!this.controlChar.properties.indicate)throw new Error('DFU control notifications unavailable');
      this._listen(this.controlChar,'characteristicvaluechanged',event=>this.handleNotification(event));
      await this._bounded(this.controlChar.startNotifications(),this.timeouts.gatt,'DFU notifications');this._assertActive();
    }
    handleNotification(event){
      if(!this._active||!this._pending)return;
      const pending=this._pending;
      try{
        const view=event?.target?.value;
        if(!view||view.byteLength<3)throw new Error('Truncated DFU response');
        if(view.getUint8(0)!==0x60)throw new Error('Unexpected DFU response marker');
        if(view.getUint8(1)!==pending.opcode)throw new Error('Unexpected DFU response opcode');
        const result=view.getUint8(2);
        if(result!==1){
          if(result===11&&view.byteLength<4)throw new Error('Truncated extended DFU error');
          const extended=result===11?view.getUint8(3):null;
          const error=new Error(extended===null?(RESULT[result]||'DFU error '+result):(EXTENDED[extended]||'Extended DFU error '+extended));
          error.code=result;error.extendedCode=extended;throw error;
        }
        if(this._finalExecute&&pending.opcode===4)this._finalAck=true;
        const data=new DataView(view.buffer,view.byteOffset+3,view.byteLength-3);
        // Retain a private copy; Web Bluetooth may reuse characteristic buffers.
        const copied=new DataView(new Uint8Array(data.buffer,data.byteOffset,data.byteLength).slice().buffer);
        pending.ackData=copied;this._finishPending();
      }catch(error){this._rejectPending(error);}
    }
    async _write(characteristic,value){
      this._assertActive();
      // Modern methods exist on every characteristic object, even when that
      // write mode is not supported. Nordic's packet endpoint commonly allows
      // only Write Without Response; choose by advertised properties.
      let write;
      if(characteristic.properties?.write&&typeof characteristic.writeValueWithResponse==='function')write=characteristic.writeValueWithResponse.bind(characteristic);
      else if(characteristic.properties?.writeWithoutResponse&&typeof characteristic.writeValueWithoutResponse==='function')write=characteristic.writeValueWithoutResponse.bind(characteristic);
      else if(typeof characteristic.writeValue==='function')write=characteristic.writeValue.bind(characteristic);
      else throw new Error('DFU characteristic has no supported write method');
      await this._bounded(write(value),this.timeouts.operation,'Bluetooth write');
    }
    sendOperation(characteristic,operation,buffer){
      const extra=buffer?asBytes(buffer):new Uint8Array();const value=new Uint8Array(operation.length+extra.length);value.set(operation);value.set(extra,operation.length);
      return this._sendAndWait(characteristic,value,operation[0]);
    }
    _sendAndWait(characteristic,value,opcode){
      try{this._assertActive();if(this._pending)throw new Error('Concurrent DFU command rejected');if(!characteristic)throw new Error('DFU characteristic missing');}catch(error){return Promise.reject(error);}
      return new Promise((resolve,reject)=>{
        const pending={opcode,resolve,reject,timer:null,ackData:null,writeSettled:false};this._pending=pending;
        pending.timer=setTimeout(()=>{if(this._pending!==pending)return;this._rejectPending(new Error('DFU acknowledgement timed out'));this._active=false;this._disconnect();},this.timeouts.operation);
        // Never retry an ambiguous command: the bootloader may already have
        // accepted it despite a browser-side write failure.
        this._write(characteristic,value).then(()=>{if(this._pending===pending){pending.writeSettled=true;this._finishPending();}},error=>{if(this._pending===pending)this._rejectPending(error);});
      });
    }
    async sendControl(operation,buffer){const result=await this.sendOperation(this.controlChar,operation,buffer);if(this.delay)await new Promise(resolve=>setTimeout(resolve,this.delay));return result;}
    _crc(bytes){return this.crc32(bytes)>>>0;}
    async _select(type,total){
      const v=await this.sendControl([6,type]);if(v.byteLength!==12)throw new Error('Invalid DFU SELECT response length');
      const state={maxSize:v.getUint32(0,true),offset:v.getUint32(4,true),crc:v.getUint32(8,true)};
      // A previous command object may be longer than the newly selected init
      // packet. It can be replaced after SELECT, as in Nordic pc-nrfutil. Its
      // offset must still fit the command-object limit. Firmware data offsets
      // remain bounded to the exact selected image and are never reset here.
      if(state.maxSize===0||state.maxSize>16*1024*1024||state.offset>(type===1?state.maxSize:total))throw new Error('Invalid DFU object size or resume offset');return state;
    }
    async _create(type,size){if(size<=0)throw new Error('Empty DFU object rejected');const b=new ArrayBuffer(4);new DataView(b).setUint32(0,size,true);await this.sendControl([1,type],b);}
    _checkOffset(v,expectedOffset,type){
      if(v.byteLength!==8)throw new Error('Invalid DFU checksum response length');
      const received=v.getUint32(0,true);
      if(received!==expectedOffset){
        const error=new Error(`DFU byte offset mismatch${type?' ('+type+')':''}: expected ${expectedOffset}, received ${received}`);
        error.expectedOffset=expectedOffset;error.receivedOffset=received;throw error;
      }
    }
    async _checksum(bytes,expectedOffset){
      const v=await this.sendControl([3]);this._checkOffset(v,expectedOffset);
      if(v.getUint32(4,true)!==this._crc(bytes.subarray(0,expectedOffset)))throw new Error('DFU CRC32 mismatch');
    }
    async _stream(bytes,start,end,type){
      for(let pos=start;pos<end;pos+=20){
        this._assertActive();const next=Math.min(pos+20,end);
        // A resolved Write Without Response only describes the host write.
        // PRN=1 makes the bootloader confirm acceptance before another packet.
        // Arm the waiter before writing: the receipt can precede write settlement.
        const receipt=await this._sendAndWait(this.packetChar,bytes.slice(pos,next),3);
        this._checkOffset(receipt,next,type);
        // Yield even for delay=0, as the original browser flasher does.
        await new Promise(resolve=>setTimeout(resolve,this.delay));this._assertActive();
        this.progress(type,bytes.length,next);
      }
      // Check the cumulative CRC once per object, rather than rehashing the
      // whole image for every 20-byte receipt. Never Execute an unchecked object.
      await this._checksum(bytes,end);
    }
    async _execute(final=false){this._finalExecute=final;try{await this.sendControl([4]);}finally{this._finalExecute=false;}}
    async transferInit(input){
      const bytes=asBytes(input),state=await this._select(1,bytes.length);
      if(bytes.length>state.maxSize)throw new Error('Init packet exceeds bootloader object size');
      let offset=state.offset;
      if(offset>bytes.length)this.log('Ein längeres Init-Paket eines früheren DFU-Versuchs wird neu angelegt. Die Firmwaredaten werden anschließend weiter mit CRC geprüft.');
      if(!offset||offset>bytes.length||state.crc!==this._crc(bytes.subarray(0,offset))){await this._create(1,bytes.length);offset=0;}
      this.progress('init',bytes.length,offset);
      if(offset<bytes.length)await this._stream(bytes,offset,bytes.length,'init');
      // A complete matching init packet still requires Execute; SELECT alone
      // does not prove it was previously executed (Nordic pc-nrfutil behavior).
      await this._execute();
    }
    async transferFirmware(input){
      const bytes=asBytes(input),state=await this._select(2,bytes.length);let offset=state.offset;
      if(offset&&state.crc!==this._crc(bytes.subarray(0,offset)))throw new Error('Resume CRC32 differs; existing partial data does not match this package. No firmware data was overwritten. A previous interrupted transfer may be the cause.');
      this.progress('firmware',bytes.length,offset);
      if(offset){
        const remainder=offset%state.maxSize;
        if(remainder&&offset<bytes.length){const end=Math.min(offset+state.maxSize-remainder,bytes.length);await this._stream(bytes,offset,end,'firmware');offset=end;}
        await this._execute(offset===bytes.length);
      }
      while(offset<bytes.length){const end=Math.min(offset+state.maxSize,bytes.length);await this._create(2,end-offset);await this._stream(bytes,offset,end,'firmware');offset=end;await this._execute(offset===bytes.length);}
    }
    async requestDevice(buttonless=false,filters){
      if(this._busy||this._selecting)throw new Error('A DFU operation is already running');
      if(!this.bluetooth?.requestDevice)throw new Error('Web Bluetooth is unavailable; use a supported browser on a secure origin');
      this._selecting=true;
      try{return await this.bluetooth.requestDevice({filters:filters||[{services:[SecureDfu.SERVICE_UUID]}],optionalServices:[SecureDfu.SERVICE_UUID]});}
      finally{this._selecting=false;}
    }
    async update(device,init,firmware){
      if(this._busy||this._selecting)throw new Error('A DFU operation is already running');
      if(!device?.gatt)throw new Error('A Bluetooth DFU device is required');
      const initBytes=asBytes(init),firmwareBytes=asBytes(firmware);
      if(!initBytes.length||!firmwareBytes.length)throw new Error('Empty init/firmware rejected');
      this._busy=true;this.lastResult=null;
      try{
        this._start(device);
        await this.connect(device);
        await this.sendControl([2,1,0]); // PRN=1: one device-confirmed packet in flight.
        await this.transferInit(initBytes);await this.transferFirmware(firmwareBytes);
        if(!this._finalAck)throw new Error('Final firmware Execute was not acknowledged');
        if(!this._disconnected)await new Promise(resolve=>{const timer=setTimeout(()=>{this._rebootResolve=null;resolve();},this.timeouts.reboot);this._rebootResolve=()=>{clearTimeout(timer);this._rebootResolve=null;resolve();};});
        this.lastResult=Object.freeze({transferVerified:true,executeAcknowledged:true,rebootObserved:this._disconnected});
        return device;
      }catch(error){this._disconnect();throw error;}
      finally{this._cleanup();this._disconnect();this._busy=false;}
    }
    cancel(){if(this._busy){this._active=false;this._rejectPending(new Error('DFU cancelled; completion is unconfirmed'));this._disconnect();}}
  }
  return SecureDfu;
});
