const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/dfu/web.html'),'utf8');
const Bundled=require('../public/dfu/bundled-packages.js'),crypto=require('node:crypto');
function harness(supported=true,extra={}){
    const node=()=>({disabled:false,hidden:false,textContent:'',value:'',children:[],dataset:{},events:{},setAttribute(n,v){this[n]=v;},removeAttribute(n){delete this[n];},addEventListener(n,fn){this.events[n]=fn;},appendChild(child){this.children.push(child);}});
    const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],node()]));
    const windowEvents={},calls=[];let options,instance;
    class FakeUpdater{constructor(o){options=o;instance=this;this.busy=false;}setPackage(f){calls.push(['package',f]);options.onState({busy:this.busy,loading:false,ready:!!f});return Promise.resolve(!!f);}selectDevice(){calls.push(['select']);}}
    const context=vm.createContext({URLSearchParams,document:{documentElement:{},querySelectorAll:()=>[],getElementById:id=>nodes.get(id),createElement:node,visibilityState:'visible',addEventListener(){},removeEventListener(){}},navigator:{language:'de-DE',bluetooth:supported?{requestDevice(){}}:undefined},isSecureContext:supported,
        location:{href:'http://127.0.0.1:8768/dfu/web.html'},AllmiiboBundledPackages:Bundled,AllmiiboFirmwareReleases:{schema:1,packages:[]},
        addEventListener:(n,fn)=>windowEvents[n]=fn,AllmiiboDfuUpdater:FakeUpdater,SecureDfuPackage:class{},SecureDfu:class{},CRC32:{buf(){}},...extra});
    context.window=context;
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/language-preference.js'),'utf8'),context);
    context.createScreenAwake = require('../public/dfu/screen-awake.mjs').createScreenAwake;
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/dfu/phase-labels.js'),'utf8'),context);
    const page = fs.readFileSync(path.join(__dirname,'../public/dfu/page.js'),'utf8');
    vm.runInContext(page.replace("import { createScreenAwake } from './screen-awake.mjs';", ''), context);
    return {nodes,windowEvents,calls,context,get options(){return options;},get updater(){return instance;}};
}
test('page binds one click to device selection and one file event to package load',()=>{
    const h=harness();h.nodes.get('file').files=['selected'];h.nodes.get('file').events.change();h.nodes.get('button').events.click();
    assert.deepEqual(h.calls,[['package',null],['package','selected'],['select']]);
});
test('wake lock starts only in DFU, releases late/failed sessions and honors the opt-out',async()=>{
    const tick=()=>new Promise(resolve=>setImmediate(resolve));
    let requests=0,releases=0,grant;
    const navigator={wakeLock:{request(){requests++;return new Promise(resolve=>{grant=()=>resolve({release(){releases++;},addEventListener(){}});});}}};
    const h=harness(true,{navigator}), choice=h.nodes.get('awake-choice'), panel=h.nodes.get('awake-panel');
    choice.checked=true;
    h.options.onPhase(null);await tick();assert.equal(requests,0);
    h.options.onPhase('transfer');await tick();assert.equal(requests,1);assert.equal(panel.hidden,false);
    h.options.onPhase('reconnect');grant();await tick();assert.equal(releases,1);assert.equal(panel.hidden,true);
    h.options.onPhase('transfer');await tick();grant();await tick();h.options.onPhase('verify',true);
    assert.equal(releases,2);
    choice.checked=false;h.options.onPhase('transfer');await tick();assert.equal(requests,2);
    choice.checked=true;choice.events.change();await tick();assert.equal(requests,3);
    h.windowEvents.pagehide();grant();await tick();assert.equal(releases,3);
    h.options.onPhase('reconnect');h.windowEvents.pageshow();await tick();assert.equal(requests,3);
});
test('page locks changing package while busy and disables unsupported Bluetooth',()=>{
    for(const supported of [true,false]){const h=harness(supported);h.options.onState({busy:true,ready:false});assert.equal(h.nodes.get('file').disabled,true);
        assert.equal(h.nodes.get('button').disabled,true);h.options.onState({busy:false,ready:true});assert.equal(h.nodes.get('file').disabled,false);
        assert.equal(h.nodes.get('button').disabled,!supported);}
});
test('selected ZIP is compared with a recent file-manager read, and clearing it clears the preview',()=>{
  const target={counter:631,hardware:52,softDevices:[259,294]};
  for(const recent of [true,false]){
    const read=Date.now()-(recent?0:700000);
    const h=harness(true,{URLSearchParams,location:{href:'https://example.test/dfu/web.html',hash:'#read='+read+'&app=632&bl=11&sd=300'}});
    h.options.onState({ready:true,target});
    const text=h.nodes.get('package-target').textContent;
    assert.match(text,/Hardwarefeld 52/);assert.match(text,/0x0126/);
    assert.equal(text.includes('älter als'),recent);assert.equal(text.includes('steht nicht'),recent);
      assert.equal(text.includes('Z15 kann sie bei gültiger Signatur installieren'),recent);
    h.options.onState({ready:false});assert.equal(h.nodes.get('package-target').textContent,'');
  }
});
test('progress clamps invalid values and unload warning only applies while running',()=>{
    const h=harness();h.options.onProgress({object:'firmware',currentBytes:900,totalBytes:100});assert.equal(h.nodes.get('progress').value,100);
    h.options.onProgress({currentBytes:0,totalBytes:0});assert.equal(h.nodes.get('progress').hidden,true);
    let stopped=0;const e={preventDefault(){stopped++;}};h.windowEvents.beforeunload(e);assert.equal(stopped,0);
    h.updater.busy=true;h.windowEvents.beforeunload(e);assert.equal(stopped,1);
});
test('DFU speed and remaining time count only bytes acknowledged in this attempt',()=>{
    let clock=0;
    const h=harness(true,{performance:{now:()=>clock}});
    const read=bytes=>{
        h.options.onProgress({object:'firmware',totalBytes:102400,currentBytes:bytes});
        return h.nodes.get('transfer').textContent;
    };
    assert.doesNotMatch(read(81920),/KiB\/s/);
    clock=2000;
    assert.match(read(83968),/1 KiB\/s · ≈ 0:18 min/);
    assert.doesNotMatch(read(4096),/KiB\/s/);
    clock=4000;
    assert.match(read(8192),/2 KiB\/s · ≈ 0:46 min/);
    h.options.onProgress(null);
    assert.doesNotMatch(read(50000),/KiB\/s/);
    assert.doesNotMatch(read(102400),/KiB\/s/);
});
test('all scripts/styles are bundled locally and order includes CRC before bounded package loader',()=>{
    const resources=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
    for(const resource of resources){assert.ok(!/^(https?:|\/\/)/.test(resource));assert.ok(fs.existsSync(path.join(__dirname,'../public/dfu',resource)),resource);}
    assert.ok(html.indexOf('vendor/crc32.js')<html.indexOf('src="package.js"'));
    assert.ok(html.indexOf('src="secure-dfu.js"')<html.indexOf('src="page.js"'));
    assert.ok(html.indexOf('../firmware/releases.js')<html.indexOf('src="page.js"'));
    assert.match(html,/connect-src 'self'/);assert.doesNotMatch(html,/connect-src[^;]*\*/);
    const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(anchors,['../','../guide/index.html','../firmware/Allmiibo_LCD_DE3_65_637_NUR_APP.zip','../firmware/Allmiibo_LCD_DE3_67_639_NUR_APP.zip','https://github.com/bluecyber81/pixl.js/releases/tag/de3.67','https://github.com/bluecyber81/pixl.js/archive/3a5ea8a3662a942cb4ed9ea56a9a68939c07b5a9.zip','../','../licenses/index.html']);
    assert.match(html,/<a\b[^>]* href="https:\/\/github.com\/[^"\s]+" target="_blank" rel="noopener noreferrer">/);
});

test('phases distinguish full payload from acknowledged completion and reset on retry',()=>{
    const {options,nodes}=harness();
    options.onPhase('verify');
    options.onProgress({object:'firmware',totalBytes:16,currentBytes:16});
    assert.equal(nodes.get('progress').value,100);
    assert.equal(nodes.get('phase-verify')['aria-current'],'step');
    assert.equal(nodes.get('reconnect-link').hidden,true);
    options.onPhase('finalize',true);
    assert.equal(nodes.get('phase-finalize').className,'failed');
    assert.match(nodes.get('phase-detail').textContent,/nicht bestätigt/);
    assert.equal(nodes.get('reconnect-link').hidden,true);
    options.onPhase(null);assert.equal(nodes.get('phases').hidden,true);
    options.onPhase('reconnect');
    assert.equal(nodes.get('phase-finalize').className,'done');
    assert.equal(nodes.get('phase-reconnect')['aria-current'],'step');
    assert.equal(nodes.get('reconnect-link').hidden,false);
    assert.match(nodes.get('phase-detail').textContent,/Version im Gerätemenü/);
});

test('DFU step labels follow all saved file-manager languages and tolerate blocked storage',()=>{
    for(const [saved,lang] of Object.entries({en:'en',es:'es',de_DE:'de',sv_SE:'sv',ru_RU:'ru',ja_JP:'ja',zh_CN:'zh-Hans',zh_TW:'zh-Hant',unexpected:'de'})){
        const h=harness(true,{localStorage:{getItem:()=>saved}});
        assert.equal(h.nodes.get('phases').lang,lang);
        for(const phase of ['transfer','verify','finalize','reconnect']){
            h.options.onPhase(phase);
            assert.ok(h.nodes.get('phase-'+phase).textContent);
            assert.ok(h.nodes.get('phase-detail').textContent);
        }
    }
    assert.equal(harness(true,{localStorage:{getItem(){throw Error('blocked');}}}).nodes.get('phases').lang,'de');
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

test('only a unique bundled catalogue ID is preselected, with no load or transfer on navigation', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/firmware-releases.json'), 'utf8'));
    const [stable, preview] = catalog.packages;
    const pages = 'https://bluecyber81.github.io/pixl.js/dfu/web.html';
    for (const [query, expected] of [
        ['?package=' + preview.id, preview], ['?package=' + stable.id, stable],
        ['', null], ['?package=https://example.org/file.zip', null],
        ['?package=' + stable.id + '&package=' + preview.id, null], ['?package=', null]
    ]) {
        const recentBoot = '#read=' + Date.now() + '&app=638&bl=19&sd=294';
        const h = harness(true, {location:new URL(pages + query + recentBoot), AllmiiboFirmwareReleases:catalog});
        const select = h.nodes.get('bundled');
        assert.equal(select.value, expected?.id || '');
        assert.equal(h.nodes.get('load-bundled').disabled, !expected);
        assert.equal(h.nodes.get('button').disabled, true);
        assert.deepEqual(h.calls, []);
        if (expected) assert.ok(h.nodes.get('bundled-info').textContent.includes(expected.version));
        else if (query) assert.match(h.nodes.get('bundled-info').textContent, /Bitte ein Paket auswählen/);
        h.options.onState({ready:true,target:{counter:637,hardware:52,softDevices:[294]}});
        assert.match(h.nodes.get('package-target').textContent, /App-Zähler 638/);
    }
});

test('changing the selected package clears a previously ready image and a manual file clears the dropdown', async () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/firmware-releases.json'), 'utf8'));
    const h = harness(true, {AllmiiboFirmwareReleases:catalog});
    const select = h.nodes.get('bundled'), manual = h.nodes.get('file');
    select.value = catalog.packages[0].id;
    manual.files = ['manual.zip'];
    await manual.events.change();
    assert.equal(select.value, '');
    assert.equal(h.nodes.get('button').disabled, false);
    manual.value = 'manual.zip';
    select.value = catalog.packages[1].id;
    select.events.change();
    assert.equal(manual.value, '');
    assert.deepEqual(h.calls.at(-1), ['package', null]);
    assert.equal(h.nodes.get('button').disabled, true);
    assert.equal(h.nodes.get('load-bundled').disabled, false);
});

test('DFU changes display language during a transfer without starting or resetting it', () => {
    const navigator = { languages: ['es-MX', 'de-CH'], bluetooth: {requestDevice(){}} };
    const h = harness(true, {navigator});
    assert.equal(h.context.document.documentElement.lang, 'de');
    assert.equal(h.nodes.get('phases').lang, 'es');
    h.options.onPhase('transfer');
    h.options.onProgress({object:'firmware', currentBytes:20, totalBytes:100});
    h.options.onState({busy:true,ready:false});
    h.options.onStatus('Verbunden', 'Connected');
    navigator.languages = ['es-MX', 'en-CA'];
    h.windowEvents.languagechange();
    assert.equal(h.context.document.documentElement.lang, 'en');
    assert.equal(h.nodes.get('guide-link').href, '../guide/en.html');
    assert.equal(h.nodes.get('status').textContent, 'Connected');
    assert.match(h.nodes.get('transfer').textContent, /20 \/ 100 bytes acknowledged/);
    h.context.AllmiiboLanguage.setMode('en');
    assert.equal(h.nodes.get('phase-transfer').textContent, 'Transfer');
    assert.equal(h.nodes.get('phase-transfer')['aria-current'], 'step');
    assert.equal(h.nodes.get('progress').value, 20);
    assert.equal(h.nodes.get('button').disabled, true);
    assert.deepEqual(h.calls, []);
});
