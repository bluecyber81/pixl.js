'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const base = path.resolve(__dirname, '..');
const Package = require('../public/dfu/package.js');
const Updater = require('../public/dfu/updater.js');
const Bundled = require('../public/dfu/bundled-packages.js');
const readCatalog = root => Bundled.validateCatalog(JSON.parse(fs.readFileSync(path.join(root, 'public/firmware/releases.json'))));
const catalog = readCatalog(base);
const archive = name => fs.readFileSync(path.join(base, 'public/firmware', name));
const app85 = archive('Allmiibo_OLED_DE3_85_Test5_APP.zip');
const app84 = archive('Allmiibo_OLED_DE3_84_Test4_APP.zip');
const sha85 = '16e019fde2cd5283a462bba31fe4ee65fafc7dcddaa7c4bccd200f334af26a1f';
const source85 = 'fe3647d69c2c418da2eec528bd09812916fbd3a6d0157be27a515941b6962a13';
const version85 = '2.22.0-DE3.85-OLEDt5';
const mod = name => import(pathToFileURL(path.join(base, 'src/lib', name)).href);

test('an exact App85 archive is rejected by a catalogue which has not explicitly approved App85', async () => {
  const parsed = await new Package(app85).load();
  assert.equal(parsed.archiveSha256, sha85);
  assert.deepEqual(parsed.image.target, {counter:85,hardware:52,softDevices:[0x0103]});
  const prior = Bundled.validateCatalog({schema:1,packages:catalog.packages.filter(entry=>entry.id!=='de3.85-oled-t5-app')});
  assert.throws(() => Bundled.validatePackage(parsed, 'OLED', prior), /veröffentlichte OLED/);
});

test('public Test 6 ZIP requires its exact digest, OLED, counter 86 and S112 0x0103 before manual readiness', async () => {
  const entry = catalog.packages.find(item => item.id === 'de3.87-oled-t6-app');
  const bytes = archive(entry.file);
  const parsed = await new Package(bytes).load();
  assert.deepEqual(parsed.image.target, {counter:86, hardware:52, softDevices:[0x0103]});
  assert.equal(bytes.length,entry.bytes);
  assert.equal(parsed.archiveSha256,entry.sha256);
  assert.equal(Bundled.validatePackage(parsed,'OLED',catalog).id,entry.id);
  assert.throws(()=>Bundled.validatePackage(parsed,'LCD',catalog));
  const old = Bundled.validateCatalog({schema:1,packages:catalog.packages.filter(item=>item.id!==entry.id)});
  assert.throws(()=>Bundled.validatePackage(parsed,'OLED',old));
  const updater = new Updater({Package,validatePackage:p=>Bundled.validatePackage(p,'OLED',catalog),createDfu(){assert.fail('unexpected Bluetooth access');}});
  const loader = new Bundled.Loader({catalog,updater,pageUrl:'http://localhost:8765/dfu/web.html'});
  assert.equal(await loader.manual(bytes),true);
  const {nrfDfuLink}=await import(pathToFileURL(path.join(base,'public/dfu/nrf-dfu-link.mjs')).href);
  assert.equal(new URL(nrfDfuLink(entry)).searchParams.get('file'), 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/'+entry.file);
  const {diagnosticBuildIdentity}=await mod('firmware-build-reference.js');
  const identity=diagnosticBuildIdentity({firmwareVersion:entry.version,boot:{settingsCrcValid:true,applicationCounter:86}});
  assert.equal(identity.packageReference.otaSha256,entry.sha256);
  assert.equal(identity.packageReference.hardwareAcceptance,'tester-reported-remote-and-screen-capture-on-one-oled');
  assert.equal(identity.packageReference.artifactStatus,'experimental-signed-application');
  assert.equal(identity.applicationHashVerified,false);
});

test('candidate accepts the exact signed App85 bytes and keeps the original image identity', async () => {
  const parsed = await new Package(app85).load();
  assert.equal(app85.length, 249461); assert.equal(parsed.archiveSha256, sha85);
  assert.equal(Bundled.validatePackage(parsed, 'OLED', catalog).id, 'de3.85-oled-t5-app');
  const image = new Uint8Array((await parsed.getAppImage()).imageData);
  assert.equal(image.length, 360652);
  assert.equal(crypto.createHash('sha256').update(image).digest('hex'), 'e403e5afe50e9dc47e27ef2c1292144f905481f20f2ddfbab639b38707a1c050');
});

test('the exact App84 continues to pass its old catalogue profile', async () => {
  const parsed = await new Package(app84).load();
  assert.equal(Bundled.validatePackage(parsed, 'OLED', catalog).id, 'de3.84-oled-t4-app');
  assert.equal(parsed.image.target.counter, 84);
});

test('manual App85 selection reaches ready without requesting a radio connection', async () => {
  let radioCalls = 0;
  const updater = new Updater({Package,validatePackage:p => Bundled.validatePackage(p,'OLED',catalog),
    createDfu() { ++radioCalls; throw new Error('A separate user action is required'); }});
  const loader = new Bundled.Loader({catalog,updater,pageUrl:'http://localhost:8765/dfu/web.html'});
  assert.equal(await loader.manual(app85), true); assert(updater.package); assert.equal(radioCalls, 0);
});

test('same-origin bounded download validates the actual App85 archive before readiness', async () => {
  const entry = catalog.packages.find(p => p.id === 'de3.85-oled-t5-app');
  const url = 'http://localhost:8765/firmware/' + entry.file;
  let radioCalls = 0, delivered = false;
  const updater = new Updater({Package,validatePackage:p => Bundled.validatePackage(p,'OLED',catalog),createDfu(){++radioCalls;}});
  const loader = new Bundled.Loader({catalog,updater,pageUrl:'http://localhost:8765/dfu/web.html',cryptoImpl:crypto.webcrypto,
    fetchImpl:async (request,options) => {assert.equal(request,url);assert.equal(options.redirect,'error');
      return {ok:true,redirected:false,url,headers:{get:()=>String(app85.length)},body:{getReader:()=>({
        read:async()=>delivered?{done:true}:(delivered=true,{done:false,value:new Uint8Array(app85)}),cancel:async()=>{},releaseLock(){}})}};}});
  assert.equal(await loader.load(entry.id),true); assert.equal(radioCalls,0); assert.equal(updater.package.archiveSha256,sha85);
});

test('App85 still cannot be used with LCD or with mismatching init targets', async () => {
  const parsed = await new Package(app85).load();
  assert.throws(() => Bundled.validatePackage(parsed, 'LCD', catalog), /anderen Display/);
  for (const target of [{counter:84,hardware:52,softDevices:[259]},{counter:85,hardware:51,softDevices:[259]},
    {counter:85,hardware:52,softDevices:[294]},{counter:85,hardware:52,softDevices:[259,294]}])
    assert.throws(() => Bundled.validatePackage({...parsed,image:{target}},'OLED',catalog),/Startpaket/);
});

test('unknown digest or altered archive length remains rejected', async () => {
  const parsed = await new Package(app85).load();
  for (const changes of [{archiveSha256:'e'.repeat(64)},{archiveBytes:parsed.archiveBytes-1}])
    assert.throws(()=>Bundled.validatePackage({...parsed,...changes},'OLED',catalog),/veröffentlichte OLED/);
});

test('a syntactically valid repacked archive is not accepted under the signed download identity', async () => {
  const JSZip = require('../public/dfu/vendor/jszip-3.10.2.min.js');
  const zip = await JSZip.loadAsync(app85);
  const repacked = await zip.generateAsync({type:'uint8array',compression:'STORE'});
  const parsed = await new Package(repacked).load();
  assert.notEqual(parsed.archiveSha256,sha85);
  assert.throws(()=>Bundled.validatePackage(parsed,'OLED',catalog),/veröffentlichte OLED/);
});

test('App85 build reference reports SourceID match without asserting measured BIN or device identity', async () => {
  const {diagnosticBuildIdentity} = await mod('firmware-build-reference.js');
  const common = {firmwareVersion:version85,boot:{settingsCrcValid:true,applicationCounter:85},
    build:{schemaVersion:1,board:'OLED',sourceId:source85,previousFault:null}};
  const result = diagnosticBuildIdentity(common);
  assert.equal(result.packageReference.applicationCounter,85); assert.equal(result.packageReference.hardwareAcceptance,'pending');
  assert.equal(result.firmwareReportedSourceRelation,'matches-package');assert.equal(result.referenceRelation,'version-and-counter');
  assert.equal(result.observed.sourceId,source85);assert.equal(result.observed.applicationBinSha256,null);
  assert.equal(result.applicationHashVerified,false);assert.equal(result.samePhysicalDeviceVerified,false);
  assert.equal(diagnosticBuildIdentity({...common,build:{...common.build,sourceId:'a'.repeat(64)}}).firmwareReportedSourceRelation,'differs-from-package');
  assert.equal(diagnosticBuildIdentity({...common,boot:{settingsCrcValid:true,applicationCounter:84}}).referenceRelation,'different-counter');
});

test('known OLED diagnostics include App85 while App84 stays supported and future variants stay unknown', async () => {
  const profile = await mod('hardware-profile.js'), build = await mod('lcd-build-diagnostics.js');
  const {supportsMenuDiagnostics} = await mod('device-extra-diagnostics.js');
  for (const version of [version85,'2.22.0-DE3.84-OLEDt4','2.22.0-DE3.87-OLEDt6']) {
    assert.equal(profile.hasOledSystemDiagnostics(version),true);assert.equal(build.buildDiagnosticBoard(version),'OLED');
    assert.equal(profile.displayBuildReference(version).controllerDriver,'SH1106'); assert.equal(supportsMenuDiagnostics(version),true);
  }
  assert.equal(profile.hasOledSystemDiagnostics('2.22.0-DE3.86-OLEDt6'),false);
  assert.equal(build.buildDiagnosticBoard('2.22.0-DE3.86-OLEDt6'),null);
});

test('three build catalogue copies agree and keep all approved OLED packages', () => {
  const vm = require('node:vm'); const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(base,'public/firmware/releases.js'),'utf8'),context);
  const json = JSON.parse(fs.readFileSync(path.join(base,'public/firmware/releases.json')));
  assert.deepEqual(JSON.parse(JSON.stringify(context.AllmiiboFirmwareReleases)),json);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(base,'src/data/firmware-releases.json'))),json);
  assert.deepEqual(json.packages.filter(entry=>entry.board==='OLED').map(entry=>entry.counter),[86,85,84]);
  assert.equal(Bundled.validateCatalog(json).packages.length,json.packages.length);
});

async function mount(props) {
  const Vue = require('vue'), {parse,compileScript,compileTemplate} = require('@vue/compiler-sfc');
  const file = path.join(base,'src/components/FirmwareBoardChoice.vue');
  const {descriptor} = parse(fs.readFileSync(file,'utf8'),{filename:file});
  const compiled = compileScript(descriptor,{id:'board-choice'});
  const script = compiled.content.replace(/^import .*$/gm,'').replace('export default','const Component=');
  const template = compileTemplate({source:descriptor.template.content,id:'board-choice',filename:file,compilerOptions:{hoistStatic:false,bindingMetadata:compiled.bindings}}).code
    .replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,(_,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=Vue;`).replace('export function render','function render');
  const profile = await mod('hardware-profile.js'), {dfuReference} = await mod('release-packages.js');
  const factory = new Function('Vue','computed','ref','watch','firmwareBoard','hasOledSystemDiagnostics','lacksOledSystemDiagnostics','deploymentPath','dfuReference',script+'\n'+template+'\nComponent.render=render;return Component;');
  const Component = factory(Vue,Vue.computed,Vue.ref,Vue.watch,profile.firmwareBoard,profile.hasOledSystemDiagnostics,profile.lacksOledSystemDiagnostics,p=>'/'+p,dfuReference);
  const node = (type,text='')=>({type,text,props:{},children:[],parent:null});
  const renderer = Vue.createRenderer({createElement:t=>node(t),createText:t=>node('#text',t),createComment:t=>node('#comment',t),setText:(n,t)=>n.text=t,
    setElementText:(n,t)=>{n.text=t;n.children=[];},patchProp:(n,k,o,v)=>n.props[k]=v,
    insert(n,p,a=null){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=p.children.indexOf(a);i<0?p.children.push(n):p.children.splice(i,0,n);},
    remove(n){n.parent?.children.splice(n.parent.children.indexOf(n),1);},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]||null});
  const root=node('root'), app=renderer.createApp({render:()=>Vue.h(Component,props)}); app.mount(root);
  const flat=n=>[n,...n.children.flatMap(flat)], text=n=>n.text+n.children.map(text).join('');
  return {app,root,text:()=>text(root),links:()=>flat(root).filter(n=>n.type==='a').map(n=>n.props.href)};
}
const boot = {settingsCrcValid:true,applicationCounter:85,bootloaderCounter:4,softDeviceValid:true,softDeviceFwid:259,softDeviceVariant:112,softDeviceVersion:7002000,geometryValid:true,chipPart:0x52832,addressConflict:false};
for(const locale of ['de_DE','en']) test('public Test 6 offers only the correct board and counter for '+locale,async()=>{
  const h=await mount({connected:true,version:'2.22.0-DE3.87-OLEDt6',boot:{...boot,applicationCounter:86},locale});
  try{
    assert(h.links().some(url=>url.includes('?package=de3.87-oled-t6-app#board=OLED')));
    assert(h.links().some(url=>url.endsWith('/Allmiibo_OLED_DE3_87_Test6_APP.zip')));
    assert(h.links().some(url=>url.endsWith(locale==='en'?'/GUIDE_OLED_Test6_EN.txt':'/ANLEITUNG_OLED_Test6_DE.txt')));
    assert.equal(h.links().some(url=>url.includes('?package=de3.85-oled-t5-app')),false);
  }finally{h.app.unmount();}
});

test('older supported OLED can update to Test 6; foreign boards and inconsistent counters hide transfer links',async()=>{
  const old=await mount({connected:true,version:version85,boot,locale:'en'});
  try {assert(old.links().some(url=>url.includes('?package=de3.87-oled-t6-app')));}finally{old.app.unmount();}
  for(const props of [{version:'2.22.0-DE3.81'},{version:'2.22.0-DE3.86-OLEDt6'},{boot:{...boot,applicationCounter:86}},{boot:{...boot,softDeviceFwid:294}},{boot:{...boot,chipPart:0x52840}}]){
    const h=await mount({connected:true,version:version85,boot,locale:'en',...props});
    try{assert.equal(h.links().some(url=>url.includes('?package=')||url.endsWith('_APP.zip')),false);}finally{h.app.unmount();}
  }
});
