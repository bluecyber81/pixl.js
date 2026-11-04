const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Loader,validateCatalog,MAX_BYTES}=require('../public/dfu/bundled-packages.js');
const bytes=Uint8Array.from([1,2,3,4,5]);
const entry={id:'de3.53-lcd-app',version:'2.22.0-DE3.53',counter:625,file:'Allmiibo_LCD_DE3_53_625_TESTSTAND.zip',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),board:'LCD',storage:'PFS1',bootloader:'BL8',softDevice:'S112 7.3.0',applicationOnly:true,migrationRequired:false};
const catalog={schema:1,packages:[entry]},pageUrl='http://127.0.0.1:8768/dfu/web.html';
const url='http://127.0.0.1:8768/firmware/'+entry.file;
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function response(data=bytes,options={}){let i=0;return{ok:true,url,redirected:false,headers:{get:()=>null},body:{getReader:()=>({read:async()=>i++?{done:true}:{done:false,value:data},cancel:async()=>{},releaseLock(){}})},...options};}
function harness(options={}){
 const calls=[],status=[],states=[];
 const updater={busy:false,package:null,async setPackage(file){calls.push(file);this.package=file;return Boolean(file);}};
 const loader=new Loader({catalog,updater,pageUrl,cryptoImpl:crypto.webcrypto,fetchImpl:async()=>response(),onStatus:s=>status.push(s),onState:s=>states.push(s),...options});
 return{loader,updater,calls,status,states};
}
test('reviewed local package is hashed before the existing ZIP parser, without BLE access',async()=>{
 let fetchOptions;const h=harness({fetchImpl:async(actual,options)=>{assert.equal(actual,url);fetchOptions=options;return response();}});
 assert.equal(await h.loader.load(entry.id),true);assert.equal(h.updater.package.name,entry.file);
 assert.deepEqual(new Uint8Array(await h.updater.package.arrayBuffer()),bytes);
 assert.equal(fetchOptions.redirect,'error');assert.equal(fetchOptions.cache,'no-store');
 assert.match(h.status.at(-1),/Paketidentität.*SHA-256/);assert.match(h.status.at(-1),/nicht automatisch geprüft/);
 assert.equal(h.loader.loading,false);assert.equal(h.calls.filter(Boolean).length,1);
});
test('default browser fetch retains its global receiver rather than the Loader instance',async()=>{
 const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout,Uint8Array,crypto:crypto.webcrypto,testResponse:()=>response()});
 vm.runInContext(`globalThis.fetchCalls = 0; globalThis.fetch = function (url, options) {
  if (this !== globalThis) throw new TypeError('Illegal invocation');
  globalThis.fetchCalls++; globalThis.requestUrl = url; globalThis.requestOptions = options;
  return Promise.resolve(globalThis.testResponse());
 };`,context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/dfu/bundled-packages.js'),'utf8'),context);
 const updater={busy:false,package:null,async setPackage(file){this.package=file;return Boolean(file);}};
 const loader=new context.AllmiiboBundledPackages.Loader({catalog,updater,pageUrl});
 assert.equal(await loader.load(entry.id),true);
 assert.equal(context.fetchCalls,1);assert.equal(context.requestUrl,url);
 assert.equal(context.requestOptions.redirect,'error');assert.equal(context.requestOptions.cache,'no-store');
 assert.equal(updater.package.name,entry.file);assert.equal(loader.loading,false);
});
test('catalogue is bounded, strict and rejects traversal, external URLs, malformed metadata and unsupported scope',()=>{
 assert.deepEqual(validateCatalog({schema:1,packages:[]}).packages,[]);
 const changed=[{file:'../evil.zip'},{file:'https://example.com/a.zip'},{file:'//evil/a.zip'},{file:entry.file+'?x'},{file:entry.file+'#x'},
 {sha256:'0'.repeat(64)},{sha256:'bad'},{bytes:0},{bytes:MAX_BYTES+1},{counter:1},{board:'OLED'},{storage:'SPIFFS'},
 {softDevice:'S140'},{applicationOnly:false},{migrationRequired:true},{extra:true},{version:'2.22.0-DE3.53-PREP'}];
 for(const patch of changed)assert.throws(()=>validateCatalog({schema:1,packages:[{...entry,...patch}]}),JSON.stringify(patch));
 for(const bad of [{schema:2,packages:[]},{schema:1,packages:[],extra:1},{schema:1,packages:[entry,entry]},{schema:1,packages:Array(9).fill(entry)}])assert.throws(()=>validateCatalog(bad));
 assert(Object.isFrozen(validateCatalog(catalog).packages[0]));
});
test('tampered/truncated/oversized bytes and header/redirect failures clear any prior selection',async()=>{
 const cases=[()=>response(Uint8Array.of(1,2,3,4,6)),()=>response(bytes.slice(0,4)),()=>response(new Uint8Array(6)),
 ()=>response(bytes,{headers:{get:()=>String(bytes.length+1)}}),()=>response(bytes,{redirected:true}),
 ()=>response(bytes,{url:'https://elsewhere.example/package.zip'}),()=>response(bytes,{ok:false}),()=>response(bytes,{body:null})];
 for(const get of cases){const h=harness({fetchImpl:async()=>get()});h.updater.package={name:'old'};
  assert.equal(await h.loader.load(entry.id),false);assert.equal(h.updater.package,null);assert.equal(h.calls.filter(Boolean).length,0);assert.equal(h.loader.loading,false);}
});
test('unsupported SHA-256 never fetches or permits the previous package',async()=>{
 let fetched=false;const h=harness({cryptoImpl:{},fetchImpl:async()=>{fetched=true;}});h.updater.package={};
 assert.equal(await h.loader.load(entry.id),false);assert.equal(fetched,false);assert.equal(h.updater.package,null);assert.match(h.status.at(-1),/SHA-256/);
});
test('wrong selection and an empty catalogue cannot fetch or leave readiness set',async()=>{
 let fetched=0;const h=harness({catalog:{schema:1,packages:[]},fetchImpl:async()=>{fetched++;}});
 assert.equal(await h.loader.load('invented'),false);assert.equal(fetched,0);assert.equal(h.updater.package,null);
});
test('manual selection supersedes a pending fetched package even when fetch ignores abort',async()=>{
 const gate=defer();let signal;const h=harness({fetchImpl:async(_,options)=>{signal=options.signal;return gate.promise;}});
 const pending=h.loader.load(entry.id);const file={name:'manual.zip'};assert.equal(await h.loader.manual(file),true);
 assert.equal(signal.aborted,true);gate.resolve(response());assert.equal(await pending,false);assert.equal(h.updater.package,file);
 assert.equal(h.calls.filter(Boolean).length,1);
});
test('a new download invalidates an older delayed download',async()=>{
 const gates=[defer(),defer()];let n=0;const h=harness({fetchImpl:()=>gates[n++].promise});
 const first=h.loader.load(entry.id),second=h.loader.load(entry.id);gates[1].resolve(response());assert.equal(await second,true);
 const selected=h.updater.package;gates[0].resolve(response());assert.equal(await first,false);assert.equal(h.updater.package,selected);
});
test('cancel during SHA leaves no stale package and no accidental transfer',async()=>{
 const gate=defer();const h=harness({cryptoImpl:{subtle:{digest:()=>gate.promise}}});
 const pending=h.loader.load(entry.id);await new Promise(setImmediate);assert.equal(h.loader.cancel(),true);
 gate.resolve(await crypto.webcrypto.subtle.digest('SHA-256',bytes));assert.equal(await pending,false);assert.equal(h.updater.package,null);
 assert.equal(h.calls.filter(Boolean).length,0);assert.equal(h.loader.loading,false);
});
test('hash-verified bytes pass the real ZIP parser and updater without starting DFU',async()=>{
 const JSZip=require('../public/dfu/vendor/jszip-3.10.2.min.js'),Updater=require('../public/dfu/updater.js'),Package=require('../public/dfu/package.js');
 const zip=new JSZip();zip.file('manifest.json',JSON.stringify({manifest:{application:{dat_file:'app.dat',bin_file:'app.bin'}}}));zip.file('app.dat',require('./dfu-init-fixture.cjs')(2));zip.file('app.bin',Uint8Array.of(2,3));
 const data=await zip.generateAsync({type:'uint8array'});const selected={...entry,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};
 let creates=0;const updater=new Updater({Package,createDfu:()=>{creates++;throw Error('must require separate click');}});
 const h=harness({catalog:{schema:1,packages:[selected]},updater,fetchImpl:async()=>response(data)});
 assert.equal(await h.loader.load(entry.id),true);assert.equal(creates,0);assert(updater.package);
 assert.deepEqual(new Uint8Array((await updater.package.getAppImage()).imageData),Uint8Array.of(2,3));
});
test('cancel while the real updater awaits ZIP validation invalidates that validation generation',async()=>{
 const Updater=require('../public/dfu/updater.js'),gate=defer(),entered=defer();
 class SlowPackage{async load(){entered.resolve();await gate.promise;}}
 const updater=new Updater({Package:SlowPackage,createDfu:()=>{throw Error('no device');}});
 const h=harness({updater}),pending=h.loader.load(entry.id);await entered.promise;
 assert.equal(updater.loading,true);h.loader.cancel();gate.resolve();assert.equal(await pending,false);
 assert.equal(updater.package,null);assert.equal(updater.loading,false);
});
test('fetch cancellation and timeout clear loading without waiting for a later response',async()=>{
 const gate=defer();let signal;const h=harness({timeoutMs:10,fetchImpl:(_,options)=>{signal=options.signal;return gate.promise;}});
 const pending=h.loader.load(entry.id);await new Promise(r=>setTimeout(r,25));assert.equal(signal.aborted,true);assert.equal(h.loader.loading,false);
 assert.match(h.status.at(-1),/zu lange/);gate.resolve(response());assert.equal(await pending,false);assert.equal(h.updater.package,null);
});
test('existing ZIP rejection cannot turn a hash-matching file into a ready package',async()=>{
 const h=harness();h.updater.setPackage=async file=>{h.updater.package=null;return !file;};
 assert.equal(await h.loader.load(entry.id),false);assert.equal(h.updater.package,null);assert.match(h.status.at(-1),/ZIP-Prüfung/);
});
test('transfer in progress rejects loading, cancellation and replacement',async()=>{
 const h=harness();h.updater.busy=true;const old=h.updater.package={name:'in-transfer'};
 assert.equal(await h.loader.load(entry.id),false);assert.equal(await h.loader.manual({}),false);assert.equal(h.loader.cancel(),false);assert.equal(h.updater.package,old);
});
test('published JSON, source JSON and browser data agree exactly and pass schema',()=>{
 const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/data/firmware-releases.json'),'utf8'));
 const publicData=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/firmware/releases.json'),'utf8'));
 const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/firmware/releases.js'),'utf8'),context);
 assert.deepEqual(source,publicData);assert.deepEqual(JSON.parse(JSON.stringify(context.AllmiiboFirmwareReleases)),publicData);validateCatalog(source);
});
