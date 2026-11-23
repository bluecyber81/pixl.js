import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, createPublicKey, verify, webcrypto} from 'node:crypto';
import DfuPackage from '../public/dfu/package.js';
import Bundled from '../public/dfu/bundled-packages.js';
import Updater from '../public/dfu/updater.js';
import {lcdPreview670, lcdPreviewPackage670, lcdPreviewPackages, lcdPreviews} from '../public/dfu/lcd-private-reference.mjs';

const reference=lcdPreview670, entry=lcdPreviewPackage670;
const original=readFileSync(new URL('../public/firmware/'+entry.file,import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=JSON.parse(readFileSync(new URL('../public/firmware/releases.json',import.meta.url)));
const catalog=Bundled.validateCatalog({schema:stable.schema,packages:[...stable.packages,...lcdPreviewPackages]});

test('real App670 signed archive binds its complete ZIP, BIN and exact LCD init target', async () => {
  assert.equal(reference.artifactStatus,'experimental-signed-application');
  assert.equal(original.byteLength,364489);
  assert.equal(sha(original),'ff2c056d66f423afade03a47b730f92033645f0db9d74f946cbafd65734d7786');
  assert.equal(sha(original),entry.sha256);
  const parsed=await new DfuPackage(original).load();
  assert.equal(parsed.archiveSha256,reference.otaSha256);
  assert.equal(parsed.archiveBytes,reference.otaBytes);
  assert.equal(parsed.image.imageData.byteLength,363888);
  assert.equal(sha(new Uint8Array(parsed.image.imageData)),reference.applicationBinSha256);
  assert.deepEqual(parsed.image.target,{counter:670,hardware:52,softDevices:[0x0126]});
  assert.deepEqual(Bundled.validatePackage(parsed,'LCD',catalog,lcdPreviews),
    {board:'LCD',counter:670,version:'2.22.0-DE3.97',privatePreview:true});
  assert.throws(()=>Bundled.validatePackage(parsed,'OLED',catalog,lcdPreviews),/anderen Display/);
  for(const changed of [{counter:669},{hardware:51},{softDevices:[0x0103]}])
    assert.throws(()=>Bundled.validatePackage({...parsed,image:{target:{...parsed.image.target,...changed}}},'LCD',catalog,lcdPreviews),/Startpaket/);
});

// Decode the actual signature envelope independently of the browser preflight.
// Nordic signs the inner InitCommand bytes, not the outer opcode envelope.
function envelope(bytes) {
  let offset=0;
  const uint=()=>{
    let result=0;
    for(let shift=0;shift<35;shift+=7){
      assert(offset<bytes.length);
      const value=bytes[offset++]; result+=(value&127)*2**shift;
      if(value<128){assert(result<=0xffffffff);return result;}
    }
    assert.fail('Invalid envelope varint');
  };
  const fields=new Map();
  while(offset<bytes.length){
    const tag=uint(), id=Math.floor(tag/8), wire=tag%8;
    assert(id>0&&!fields.has(id)); assert(wire===0||wire===2);
    let value=uint();
    if(wire===2){assert(value<=bytes.length-offset);const end=offset+value;value=bytes.subarray(offset,end);offset=end;}
    fields.set(id,value);
  }
  return fields;
}

test('real App670 ECDSA signature verifies with the pinned Z21 public point and rejects changed init or signature', async () => {
  const parsed=await new DfuPackage(original).load();
  const packet=envelope(new Uint8Array(parsed.image.initData));
  assert.equal(packet.has(1),false);
  const signed=envelope(packet.get(2)), command=envelope(signed.get(1)), raw=signed.get(3), init=command.get(2);
  assert.equal(command.get(1),1);
  assert.equal(signed.get(2),0);assert.equal(raw.byteLength,64);
  const source=readFileSync(new URL('../../fw/bootloader/src/dfu_public_key.c',import.meta.url),'utf8');
  const publicPoint=Buffer.from([...source.matchAll(/0x([a-f0-9]{2})/gi)].map(match=>parseInt(match[1],16)));
  assert.equal(publicPoint.byteLength,64);
  assert.equal(sha(publicPoint),'9ee942fb8b5fa84aa3287f02451c7f2bf2168f5df2c97af253172d2e90f03a83');
  const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',
    x:Buffer.from(publicPoint.subarray(0,32)).reverse().toString('base64url'),
    y:Buffer.from(publicPoint.subarray(32)).reverse().toString('base64url')}});
  const signature=Buffer.concat([Buffer.from(raw.subarray(0,32)).reverse(),Buffer.from(raw.subarray(32)).reverse()]);
  const valid=(data,sig)=>verify('sha256',data,{key,dsaEncoding:'ieee-p1363'},sig);
  assert.equal(valid(init,signature),true);
  const changedInit=Buffer.from(init);changedInit[0]^=1;
  const changedSignature=Buffer.from(signature);changedSignature[0]^=1;
  assert.equal(valid(changedInit,signature),false);
  assert.equal(valid(init,changedSignature),false);
});

function updaterProbe() {
  const observed={parserCalls:0,bluetoothSelections:0,state:null};
  class ObservedPackage extends DfuPackage {async load(){++observed.parserCalls;return super.load();}}
  const updater=new Updater({Package:ObservedPackage,
    validatePackage:candidate=>Bundled.validatePackage(candidate,'LCD',catalog,lcdPreviews),
    createDfu(){++observed.bluetoothSelections;assert.fail('Package selection must not request Bluetooth');},
    onState:value=>{observed.state=value;}});
  return {updater,observed};
}

test('App670 isolated direct loader uses the real parser and blocks a same-size changed ZIP before parsing or Bluetooth', async () => {
  for(const corrupt of [false,true]){
    const bytes=Buffer.from(original);if(corrupt)bytes[Math.floor(bytes.length/2)]^=1;
    const {updater,observed}=updaterProbe();let requests=0;
    const loader=new Bundled.Loader({catalog,updater,
      pageUrl:'https://bluecyber81.github.io/pixl.js/test/app670/dfu/web.html',cryptoImpl:webcrypto,
      fetchImpl:async(url,options)=>{
        ++requests;assert.equal(url,'https://bluecyber81.github.io/pixl.js/test/app670/firmware/'+entry.file);
        assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
        const response=new Response(bytes,{status:200,headers:{'content-type':'application/octet-stream','content-length':String(bytes.length)}});
        Object.defineProperty(response,'url',{value:url});return response;
      }});
    assert.equal(await loader.load(entry.id),!corrupt);
    assert.equal(requests,1);assert.equal(observed.parserCalls,corrupt?0:1);
    assert.equal(observed.bluetoothSelections,0);assert.equal(observed.state.ready,!corrupt);
    assert.equal(loader.loading,false);
    if(corrupt)assert.equal(updater.package,null);
    else {assert.equal(updater.package.archiveSha256,entry.sha256);assert.equal(observed.state.target.counter,670);}
  }
});

test('real App670 manual ZIPs with both phone MIME types retain the exact package checks without Bluetooth', async () => {
  for(const type of ['application/x-zip-compressed','application/octet-stream']){
    const {updater,observed}=updaterProbe();
    assert.equal(await updater.setPackage(new File([original],entry.file,{type})),true);
    assert.equal(observed.parserCalls,1);assert.equal(observed.bluetoothSelections,0);
    assert.equal(updater.package.archiveSha256,entry.sha256);
    assert.equal(observed.state.target.counter,670);assert.equal(observed.state.previewVersion,'2.22.0-DE3.97');
    assert.equal(observed.state.ready,true);
  }
});
