const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/dfu/web.html'),'utf8');
const Bundled=require('../public/dfu/bundled-packages.js'),crypto=require('node:crypto');
function harness(supported=true,extra={}){
    const node=()=>({disabled:false,hidden:false,textContent:'',value:'',children:[],events:{},addEventListener(n,fn){this.events[n]=fn;},appendChild(child){this.children.push(child);}});
    const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],node()]));
    const windowEvents={},calls=[];let options,instance;
    class FakeUpdater{constructor(o){options=o;instance=this;this.busy=false;}setPackage(f){calls.push(['package',f]);options.onState({busy:this.busy,loading:false,ready:!!f});return Promise.resolve(!!f);}selectDevice(){calls.push(['select']);}}
    const context=vm.createContext({document:{getElementById:id=>nodes.get(id),createElement:node},navigator:{bluetooth:supported?{requestDevice(){}}:undefined},isSecureContext:supported,
        location:{href:'http://127.0.0.1:8768/dfu/web.html'},AllmiiboBundledPackages:Bundled,AllmiiboFirmwareReleases:{schema:1,packages:[]},
        window:{addEventListener:(n,fn)=>windowEvents[n]=fn},AllmiiboDfuUpdater:FakeUpdater,SecureDfuPackage:class{},SecureDfu:class{},CRC32:{buf(){}},...extra});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/dfu/page.js'),'utf8'),context);
    return {nodes,windowEvents,calls,get options(){return options;},get updater(){return instance;}};
}
test('page binds one click to device selection and one file event to package load',()=>{
    const h=harness();h.nodes.get('file').files=['selected'];h.nodes.get('file').events.change();h.nodes.get('button').events.click();
    assert.deepEqual(h.calls,[['package',null],['package','selected'],['select']]);
});
test('page locks changing package while busy and disables unsupported Bluetooth',()=>{
    for(const supported of [true,false]){const h=harness(supported);h.options.onState({busy:true,ready:false});assert.equal(h.nodes.get('file').disabled,true);
        assert.equal(h.nodes.get('button').disabled,true);h.options.onState({busy:false,ready:true});assert.equal(h.nodes.get('file').disabled,false);
        assert.equal(h.nodes.get('button').disabled,!supported);}
});
test('selected ZIP is compared with a recent file-manager read, and clearing it clears the preview',()=>{
  const target={counter:630,hardware:52,softDevices:[259,294]};
  for(const recent of [true,false]){
    const read=Date.now()-(recent?0:700000);
    const h=harness(true,{URLSearchParams,location:{href:'https://example.test/dfu/web.html',hash:'#read='+read+'&app=631&bl=11&sd=300'}});
    h.options.onState({ready:true,target});
    const text=h.nodes.get('package-target').textContent;
    assert.match(text,/Hardwarefeld 52/);assert.match(text,/0x0126/);
    assert.equal(text.includes('älter als'),recent);assert.equal(text.includes('steht nicht'),recent);
    h.options.onState({ready:false});assert.equal(h.nodes.get('package-target').textContent,'');
  }
});
test('progress clamps invalid values and unload warning only applies while running',()=>{
    const h=harness();h.options.onProgress({object:'firmware',currentBytes:900,totalBytes:100});assert.equal(h.nodes.get('progress').value,100);
    h.options.onProgress({currentBytes:0,totalBytes:0});assert.equal(h.nodes.get('progress').hidden,true);
    let stopped=0;const e={preventDefault(){stopped++;}};h.windowEvents.beforeunload(e);assert.equal(stopped,0);
    h.updater.busy=true;h.windowEvents.beforeunload(e);assert.equal(stopped,1);
});
test('all scripts/styles are bundled locally and order includes CRC before bounded package loader',()=>{
    const resources=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
    for(const resource of resources){assert.ok(!/^(https?:|\/\/)/.test(resource));assert.ok(fs.existsSync(path.join(__dirname,'../public/dfu',resource)),resource);}
    assert.ok(html.indexOf('vendor/crc32.js')<html.indexOf('src="package.js"'));
    assert.ok(html.indexOf('src="secure-dfu.js"')<html.indexOf('src="page.js"'));
    assert.ok(html.indexOf('../firmware/releases.js')<html.indexOf('src="page.js"'));
    assert.match(html,/connect-src 'self'/);assert.doesNotMatch(html,/connect-src[^;]*\*/);
    const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(anchors,['../','https://github.com/bluecyber81/pixl.js/releases/download/de3.58/Allmiibo_DE3_58_Quellcode.zip','../licenses/index.html']);
    assert.match(html,/<a href="https:\/\/github.com\/[^"\s]+" target="_blank" rel="noopener noreferrer">/);
});

test('empty bundled catalogue does not claim availability or request a device',()=>{
 const h=harness();assert.match(h.nodes.get('bundled-info').textContent,/Kein mitgeliefertes Paket/);
 assert.equal(h.nodes.get('bundled').disabled,true);assert.equal(h.nodes.get('load-bundled').disabled,true);assert.equal(h.calls.length,0);
});

test('bundled loading disables manual/device controls while keeping cancellation available',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),data=Uint8Array.from([1,2]);
 const entry={id:'de3.53-lcd-app',version:'2.22.0-DE3.53',counter:625,file:'Allmiibo_LCD_DE3_53_625_TESTSTAND.zip',bytes:2,sha256:crypto.createHash('sha256').update(data).digest('hex'),board:'LCD',storage:'PFS1',bootloader:'BL8',softDevice:'S112 7.3.0',applicationOnly:true,migrationRequired:false};
 class InjectedLoader extends Bundled.Loader{constructor(options){super({...options,fetchImpl:()=>pending,cryptoImpl:crypto.webcrypto});}}
 const h=harness(true,{AllmiiboBundledPackages:{Loader:InjectedLoader},AllmiiboFirmwareReleases:{schema:1,packages:[entry]}});
 assert.equal(h.calls.length,0);h.nodes.get('bundled').value=entry.id;h.nodes.get('bundled').events.change();
 const loading=h.nodes.get('load-bundled').events.click();
 assert.equal(h.nodes.get('file').disabled,true);assert.equal(h.nodes.get('button').disabled,true);assert.equal(h.nodes.get('cancel-bundled').hidden,false);
 h.nodes.get('button').events.click();assert.equal(h.calls.some(c=>c[0]==='select'),false);
 h.nodes.get('cancel-bundled').events.click();assert.equal(h.nodes.get('file').disabled,false);assert.equal(h.nodes.get('button').disabled,true);
 resolve({});await loading;assert.equal(h.calls.some(c=>c[0]==='select'),false);
});
