const test=require('node:test');
const assert=require('node:assert/strict');
const SecureDfu=require('../public/dfu/secure-dfu.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const INIT=Uint8Array.from([1,3,5,7,9]);
const IMAGE=Uint8Array.from({length:93},(_,i)=>(i*37+11)&255);
function crc(bytes){let r=0xffffffff;for(const b of bytes){r^=b;for(let i=0;i<8;i++)r=(r>>>1)^((r&1)?0xedb88320:0);}return (r^0xffffffff)>>>0;}
class Events{
  constructor(){this.events=new Map();}
  addEventListener(name,callback){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(callback);}
  removeEventListener(name,callback){this.events.get(name)?.delete(callback);}
  emit(name,detail={}){for(const callback of [...this.events.get(name)||[]])callback(detail);}
  listenerCount(){return [...this.events.values()].reduce((sum,v)=>sum+v.size,0);}
}
function peripheral(options={}){
  const device=new Events(),control=new Events(),packet=new Events();
  const state={selected:1,prn:0,packetCount:0,init:[...(options.init||[])],data:[...(options.data||[])],commands:[],writes:[],executes:0,disconnects:0,connections:0,packetSizes:[],activeWrites:0,overlap:false};
  const max=options.maxSize||32;
  control.uuid='8ec90001-f315-4f60-9fb8-838830daea50';packet.uuid='8ec90002-f315-4f60-9fb8-838830daea50';control.properties={notify:true};control.startNotifications=async()=>control;
  const reply=(opcode,data=new Uint8Array(),result=1)=>{let bytes=Uint8Array.from([0x60,opcode,result,...data]);if(options.viewOffset){const wrapped=new Uint8Array(bytes.length+11);wrapped.set(bytes,7);control.value=new DataView(wrapped.buffer,7,bytes.length);}else control.value=new DataView(bytes.buffer);control.emit('characteristicvaluechanged',{target:control});};
  control.writeValue=async value=>{
    state.activeWrites++;if(state.activeWrites>1)state.overlap=true;
    try{
      const v=new DataView(value.buffer,value.byteOffset,value.byteLength),op=v.getUint8(0);state.commands.push([...value]);
      if(options.writeError)throw new Error('mock write failure');
      if(options.hangWrite)return await new Promise(()=>{});
      if(options.noAck===op)return;
      if(options.malformed===op){control.value=new DataView(Uint8Array.from([0x60,op]).buffer);control.emit('characteristicvaluechanged',{target:control});return;}
      if(op===6){state.selected=v.getUint8(1);const bytes=state.selected===1?state.init:state.data;const r=new Uint8Array(12),dv=new DataView(r.buffer);dv.setUint32(0,options.invalidMax??max,true);dv.setUint32(4,options.invalidOffset??bytes.length,true);dv.setUint32(8,(crc(bytes)+(options.badResumeCrc&&state.selected===2?1:0))>>>0,true);reply(op,r);}
      else if(op===1){state.selected=v.getUint8(1);const size=v.getUint32(2,true);assert.ok(size>0);if(state.selected===1)state.init=[];state.writes.push({type:state.selected,size});reply(op);}
      else if(op===3){const bytes=state.selected===1?state.init:state.data;const r=new Uint8Array(8),dv=new DataView(r.buffer);dv.setUint32(0,bytes.length+(options.badOffset?1:0),true);dv.setUint32(4,(crc(bytes)+(options.badCrc||(options.badFinalCrc&&state.selected===2&&bytes.length===IMAGE.length)?1:0))>>>0,true);reply(op,r);}
      else if(op===4){state.executes++;const final=state.selected===2&&state.data.length===IMAGE.length;
        if(final&&options.disconnectBeforeAck){device.gatt.disconnect();return;}
        reply(op);
        if(final&&options.finalDisconnect!==false)device.gatt.disconnect();
      }else if(op===2){state.prn=v.getUint16(1,true);state.packetCount=0;reply(op);}else throw new Error('unexpected opcode '+op);
      if(options.slowControlWrite)await wait(3);
    }finally{state.activeWrites--;}
  };
  packet.writeValue=async value=>{if(state.activeWrites>0)state.overlap=true;state.packetSizes.push(value.length);const bytes=state.selected===1?state.init:state.data;bytes.push(...value);
    if(state.prn&&++state.packetCount===state.prn){state.packetCount=0;const r=new Uint8Array(8),dv=new DataView(r.buffer);dv.setUint32(0,bytes.length,true);dv.setUint32(4,crc(bytes),true);reply(3,r);}
  };
  const server={getPrimaryService:async()=>({getCharacteristics:async()=>[control,packet]})};
  device.gatt={connected:false,connect:async()=>{state.connections++;if(options.connectFail)throw new Error('mock connect failure');if(options.slowConnect)await wait(options.slowConnect);device.gatt.connected=true;return server;},disconnect(){if(!device.gatt.connected)return;state.disconnects++;device.gatt.connected=false;device.emit('gattserverdisconnected');}};
  return{device,control,packet,state,reply};
}
function dfu(){return new SecureDfu(crc,{},0,{timeouts:{operation:30,gatt:35,reboot:5}});}
test('fresh update CRC/offset/EXECUTE verification, bounded20B packets and cleanup',async()=>{const p=peripheral(),d=dfu();await d.update(p.device,INIT,IMAGE);assert.deepEqual(p.state.data,[...IMAGE]);assert.ok(p.state.packetSizes.every(n=>n<=20&&n>0));assert.equal(p.state.executes,4);assert.deepEqual(d.lastResult,{transferVerified:true,executeAcknowledged:true,rebootObserved:true});assert.equal(p.device.listenerCount()+p.control.listenerCount(),0);});
test('a confirmed final ACK without reboot is distinguished',async()=>{const p=peripheral({finalDisconnect:false}),d=dfu();await d.update(p.device,INIT,IMAGE);assert.equal(d.lastResult.rebootObserved,false);assert.equal(d.lastResult.transferVerified,true);assert.equal(p.device.gatt.connected,false);});
test('a disconnect without final ACK is never success',async()=>{const p=peripheral({disconnectBeforeAck:true}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/disconnected/);assert.equal(d.lastResult,null);});
test('DataView byteOffset and length are respected',async()=>{const p=peripheral({viewOffset:true}),d=dfu();await d.update(p.device,INIT,IMAGE);assert.equal(d.lastResult.transferVerified,true);});
test('control writes settle before another GATT operation begins',async()=>{const p=peripheral({slowControlWrite:true}),d=dfu();await d.update(p.device,INIT,IMAGE);assert.equal(p.state.overlap,false);});
for(const len of [0,7,32,64,91,93])test('valid prefix firmware resume at '+len,async()=>{const p=peripheral({data:IMAGE.slice(0,len)}),d=dfu();await d.update(p.device,INIT,IMAGE);assert.deepEqual(p.state.data,[...IMAGE]);assert.equal(d.lastResult.transferVerified,true);assert.ok(!p.state.writes.some(w=>w.size===0));});
for(const len of [2,5])test('init prefix/full resume executes init at '+len,async()=>{const p=peripheral({init:INIT.slice(0,len)}),d=dfu();await d.update(p.device,INIT,IMAGE);assert.equal(p.state.writes.filter(w=>w.type===1).length,0);assert.deepEqual(p.state.init,[...INIT]);assert.equal(p.state.executes,4);});
test('mismatching init is restarted',async()=>{const p=peripheral({init:[99,98]}),d=dfu();await d.update(p.device,INIT,IMAGE);assert.equal(p.state.writes.filter(w=>w.type===1).length,1);assert.deepEqual(p.state.init,[...INIT]);});
test('mismatching resume CRC rejects without creating or writing firmware',async()=>{const p=peripheral({data:IMAGE.slice(0,32),badResumeCrc:true}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/Resume CRC32/);assert.equal(p.state.writes.filter(w=>w.type===2).length,0);assert.deepEqual(p.state.data,[...IMAGE.slice(0,32)]);});
for(const [key,pattern]of [['badCrc',/CRC32 mismatch/],['badOffset',/offset mismatch/]])test(key+' rejects before Execute',async()=>{const p=peripheral({[key]:true}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),pattern);assert.equal(p.state.executes,0);assert.equal(d.lastResult,null);});
for(const settings of [{invalidMax:0},{invalidOffset:99999}])test('invalidSELECT '+JSON.stringify(settings),async()=>{const p=peripheral(settings),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/Invalid DFU object/);assert.equal(p.state.executes,0);});
test('empty payloads fail before GATT access',async()=>{const p=peripheral(),d=dfu();await assert.rejects(d.update(p.device,new Uint8Array(),IMAGE),/Empty/);assert.equal(p.state.connections,0);});
test('write failure rejects promptly, no blind retry, listeners removed',async()=>{const p=peripheral({writeError:true}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/write failure/);assert.equal(p.state.commands.length,1);assert.equal(p.device.listenerCount()+p.control.listenerCount(),0);});
test('write with no ACK times out',async()=>{const p=peripheral({noAck:2}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/acknowledgement timed out/);assert.equal(p.device.gatt.connected,false);});
test('hanging write times out and does not leave unhandled promise',async()=>{const p=peripheral({hangWrite:true}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/timed out/);await wait(5);assert.equal(d.lastResult,null);});
test('malformed notification rejects promptly',async()=>{const p=peripheral({malformed:2}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/Truncated/);});
test('connection failure is propagated with no invisible update retry',async()=>{const p=peripheral({connectFail:true}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/connect failure/);assert.equal(p.state.connections,1);});
test('late connection after timeout is disconnected and cannot start writes',async()=>{const p=peripheral({slowConnect:65}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/connection timed out/);await wait(40);assert.equal(p.device.gatt.connected,false);assert.equal(p.state.commands.length,0);});
test('concurrent updates are rejected; first transfer remains valid',async()=>{const p=peripheral(),d=dfu();const first=d.update(p.device,INIT,IMAGE);await assert.rejects(d.update(p.device,INIT,IMAGE),/already running/);await first;assert.equal(d.lastResult.transferVerified,true);});
test('parallel Bluetooth pickers rejected and service filter is FE59',async()=>{let release,seen;const d=new SecureDfu(crc,{requestDevice:options=>{seen=options;return new Promise(resolve=>release=resolve);}});const first=d.requestDevice(false);await assert.rejects(d.requestDevice(false),/already running/);assert.deepEqual(seen.filters,[{services:[0xfe59]}]);release({});await first;});
test('fresh success after an error does not retain stale listeners/result',async()=>{const d=dfu(),bad=peripheral({writeError:true}),good=peripheral();await assert.rejects(d.update(bad.device,INIT,IMAGE));assert.equal(d.lastResult,null);await d.update(good.device,INIT,IMAGE);assert.equal(bad.device.listenerCount()+bad.control.listenerCount()+good.device.listenerCount()+good.control.listenerCount(),0);assert.equal(d.lastResult.transferVerified,true);});
test('CRC function required',()=>assert.throws(()=>new SecureDfu(null,{}),/CRC32/));
test('input buffers snapshot before awaiting connection',async()=>{const p=peripheral({slowConnect:2}),d=dfu(),image=IMAGE.slice();const operation=d.update(p.device,INIT,image);image.fill(0);await operation;assert.deepEqual(p.state.data,[...IMAGE]);});
test('final CRC mismatch never executes final object or reports success',async()=>{const p=peripheral({badFinalCrc:true}),d=dfu();await assert.rejects(d.update(p.device,INIT,IMAGE),/CRC32 mismatch/);assert.equal(p.state.executes,3);assert.equal(d.lastResult,null);});
test('modern control and packet write APIs respect characteristic capabilities',async()=>{const p=peripheral(),d=dfu();let controlWrites=0,packetWrites=0;const cw=p.control.writeValue,pw=p.packet.writeValue;
  p.control.properties.write=true;p.packet.properties={write:false,writeWithoutResponse:true};
  p.control.writeValueWithResponse=async value=>{controlWrites++;return cw(value);};p.control.writeValueWithoutResponse=()=>{throw new Error('incorrect control write mode');};
  p.packet.writeValueWithResponse=()=>{throw new Error('incorrect packet write mode');};p.packet.writeValueWithoutResponse=async value=>{packetWrites++;return pw(value);};
  p.control.writeValue=p.packet.writeValue=()=>{throw new Error('deprecated fallback not needed');};await d.update(p.device,INIT,IMAGE);assert.ok(controlWrites>0&&packetWrites>0);
});
test('two instances cannot concurrently own one device',async()=>{const p=peripheral({slowConnect:2}),d1=dfu(),d2=dfu();const first=d1.update(p.device,INIT,IMAGE);await assert.rejects(d2.update(p.device,INIT,IMAGE),/already has an active/);await first;assert.equal(d1.lastResult.transferVerified,true);});
test('cancelling a pending ACK rejects and removes listeners',async()=>{const p=peripheral({noAck:2}),d=dfu();const update=d.update(p.device,INIT,IMAGE);await wait(3);d.cancel();await assert.rejects(update,/cancelled/);assert.equal(p.device.listenerCount()+p.control.listenerCount(),0);assert.equal(d.lastResult,null);});
test('integration: real ZIP package, UI coordinator and transport; invalid manifest never opens picker',async()=>{
  const Package=require('../public/dfu/package.js'),Updater=require('../public/dfu/updater.js');
  const JSZip=require('../public/dfu/vendor/jszip-3.10.1.min.js'),CRC32=require('../public/dfu/vendor/crc32.js');
  const zip=new JSZip();
  zip.file('manifest.json',JSON.stringify({manifest:{application:{dat_file:'application.dat',bin_file:'application.bin'}}}));
  zip.file('application.dat',INIT);zip.file('application.bin',IMAGE);
  const file=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});file.name='synthetic-application.zip';
  const p=peripheral();let requests=0,creations=0;const statuses=[];
  const updater=new Updater({Package,createDfu:()=>{creations++;return new SecureDfu(CRC32.buf,{requestDevice:async options=>{requests++;assert.deepEqual(options.filters,[{services:[0xfe59]}]);return p.device;}},0,{timeouts:{operation:30,gatt:35,reboot:5}});},onStatus:value=>statuses.push(value)});
  assert.equal(await updater.setPackage(file),true);
  assert.equal(requests,0);
  assert.equal(await updater.selectDevice(),true);
  assert.deepEqual(updater.lastResult,{transferVerified:true,executeAcknowledged:true,rebootObserved:true});
  assert.deepEqual(p.state.init,[...INIT]);assert.deepEqual(p.state.data,[...IMAGE]);
  assert.equal(CRC32.buf(Uint8Array.from(p.state.data))>>>0,crc(IMAGE));
  assert.equal(p.state.executes,4);assert.equal(requests,1);assert.equal(creations,1);
  assert.match(statuses.at(-1),/Menü und Firmwareversion/);
  const invalid=new JSZip();invalid.file('manifest.json',JSON.stringify({manifest:{}}));
  const empty=await invalid.generateAsync({type:'nodebuffer',compression:'DEFLATE'});empty.name='empty-manifest.zip';
  assert.equal(await updater.setPackage(empty),false);assert.equal(updater.package,null);assert.equal(updater.lastResult,null);
  assert.equal(await updater.selectDevice(),false);assert.equal(requests,1);assert.equal(creations,1);
  assert.match(statuses.at(-1),/^Paket abgewiesen:/);
});
