const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const vendor=path.resolve(__dirname,'../public/dfu/vendor'),JSZip=require(process.env.JSZIP_VENDOR_PATH||path.join(vendor,'jszip-3.10.2.min.js'));
const payload=[0,1,2,127,128,255],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const type of ['Uint8Array','ArrayBuffer'])test(`JSZip accepts foreign-realm ${type} without changing binary bytes`,async()=>{
 const foreign=vm.runInNewContext(`new Uint8Array(${JSON.stringify(payload)})${type==='ArrayBuffer'?'.buffer':''}`);
 assert.equal(foreign instanceof (type==='ArrayBuffer'?ArrayBuffer:Uint8Array),false);
 const zip=new JSZip().file('Figuren/ü.bin',foreign);
 const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 const result=await JSZip.loadAsync(bytes,{checkCRC32:true});
 assert.deepEqual(Array.from(await result.file('Figuren/ü.bin').async('uint8array')),payload);
});
test('JSZip reads foreign-realm archive ArrayBuffer and verifies its CRC',async()=>{
 const bytes=await new JSZip().file('a.bin',new Uint8Array(payload)).generateAsync({type:'uint8array'});
 const foreign=vm.runInNewContext(`new Uint8Array(${JSON.stringify(Array.from(bytes))}).buffer`);
 const result=await JSZip.loadAsync(foreign,{checkCRC32:true});
 assert.deepEqual(Array.from(await result.file('a.bin').async('uint8array')),payload);
});
test('JSZip reads a standards Blob without FileReader in current Node',async()=>{
 assert.equal(typeof FileReader,'undefined');const blob=new Blob([new Uint8Array(payload)]);
 const bytes=await new JSZip().file('a.bin',blob).generateAsync({type:'uint8array'});
 const result=await JSZip.loadAsync(bytes,{checkCRC32:true});
 assert.deepEqual(Array.from(await result.file('a.bin').async('uint8array')),payload);
});
test('vendored JSZip 3.10.2 and its license match the recorded pinned upstream hashes',()=>{
 assert.equal(JSZip.version,'3.10.2');const sources=JSON.parse(fs.readFileSync(path.join(vendor,'SOURCES.json')));
 for(const name of ['jszip-3.10.2.min.js','JSZip-LICENSE.txt']){
  const bytes=fs.readFileSync(path.join(vendor,name)),record=sources[name];assert.equal(record.version,'3.10.2');assert.equal(record.bytes,bytes.length);assert.equal(record.sha256,sha(bytes));
  assert.equal(record.registry,'https://registry.npmjs.org/jszip/3.10.2');
 }
});
