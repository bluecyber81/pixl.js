const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/dfu/web.html'),'utf8');
const Bundled=require('../public/dfu/bundled-packages.js'),crypto=require('node:crypto');
function harness(supported=true,extra={}){
    const node=()=>({disabled:false,hidden:false,_text:'',get textContent(){return this._text;},set textContent(value){this._text=value;this.children=[];},value:'',children:[],dataset:{},events:{},setAttribute(n,v){this[n]=v;},removeAttribute(n){delete this[n];},addEventListener(n,fn){this.events[n]=fn;},appendChild(child){this.children.push(child);}});
    const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],node()]));
    const windowEvents={},calls=[];let options,instance;
    class FakeUpdater{constructor(o){options=o;instance=this;this.busy=false;}setPackage(f){calls.push(['package',f]);options.onState({busy:this.busy,loading:false,ready:!!f});return Promise.resolve(!!f);}selectDevice(){calls.push(['select']);}}
    const context=vm.createContext({URLSearchParams,document:{documentElement:{},querySelectorAll:()=>[],getElementById:id=>nodes.get(id),createElement:node,visibilityState:'visible',addEventListener(){},removeEventListener(){}},navigator:{language:'de-DE',bluetooth:supported?{requestDevice(){}}:undefined},isSecureContext:supported,
        location:{href:'http://127.0.0.1:8768/dfu/web.html'},AllmiiboBundledPackages:Bundled,AllmiiboFirmwareReleases:JSON.parse(fs.readFileSync(path.join(__dirname,'../src/data/firmware-releases.json'),'utf8')),
        addEventListener:(n,fn)=>windowEvents[n]=fn,AllmiiboDfuUpdater:FakeUpdater,SecureDfuPackage:class{},SecureDfu:class{},CRC32:{buf(){}},...extra});
    context.window=context;
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/language-preference.js'),'utf8'),context);
    context.lcdTest676 = require('../public/dfu/lcd-app676-reference.mjs').lcdTest676;
    context.lcdTest677 = require('../public/dfu/lcd-app677-reference.mjs').lcdTest677;
    Object.assign(context, require('../public/dfu/lcd-app685-reference.mjs'), require('../public/dfu/lcd-app684-reference.mjs'), require('../public/dfu/lcd-app683-reference.mjs'), require('../public/dfu/lcd-app679-reference.mjs'), require('../public/dfu/lcd-app680-reference.mjs'));
    context.lcdPreviews = require('../public/dfu/lcd-private-reference.mjs').lcdPreviews;
    context.lcdRelease = require('../public/dfu/lcd-release-reference.mjs').lcdRelease;
    context.lcdReleasePackage = require('../public/dfu/lcd-release-reference.mjs').lcdReleasePackage;
    context.lcdPreviewPackages = require('../public/dfu/lcd-private-reference.mjs').lcdPreviewPackages;
    context.createScreenAwake = require('../public/dfu/screen-awake.mjs').createScreenAwake;
    context.bluetoothAccessIssue = require('../public/dfu/bluetooth-access.mjs').bluetoothAccessIssue;
    context.nrfDfuLink = require('../public/dfu/nrf-dfu-link.mjs').nrfDfuLink;
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/dfu/phase-labels.js'),'utf8'),context);
    const page = fs.readFileSync(path.join(__dirname,'../public/dfu/page.js'),'utf8');
    vm.runInContext(page.replace(/^import .*;$/gm, ''), context);
    return {nodes,windowEvents,calls,context,get options(){return options;},get updater(){return instance;}};
}
test('page binds one click to device selection and one file event to package load',()=>{
    const h=harness();h.nodes.get('file').files=['selected'];h.nodes.get('file').events.change();h.nodes.get('button').events.click();
    assert.deepEqual(h.calls,[['package',null],['package','selected'],['select']]);
});

test('The normal updater selects App680 by default and binds the optional App679 package and Android handoff', async () => {
    const {lcdTest679, lcdTest679Package} = require('../public/dfu/lcd-app679-reference.mjs');
    const catalog = require('../src/data/firmware-releases.json');
    const checked = Bundled.validateCatalog(catalog);
    assert.deepEqual(checked.packages.find(item => item.counter === 679), lcdTest679Package);
    const pages = 'https://bluecyber81.github.io/pixl.js/dfu/web.html';
    assert.equal(harness(true,{location:new URL(pages)}).nodes.get('bundled').value,'de4.2-lcd-app');
    const ctx = (app, bl, sd, board='LCD') => harness(true, {
        location:new URL(pages + '?package=' + lcdTest679Package.id + '#board=' + board +
            '&read=' + Date.now() + '&app=' + app + '&bl=' + bl + '&sd=' + sd)
    });
    const good = ctx(678, 21, 294);
    assert.deepEqual(good.calls, []);
    assert.equal(good.nodes.get('load-bundled').disabled, false);
    assert.equal(good.nodes.get('bundled').value, lcdTest679Package.id);
    assert.match(good.nodes.get('profile-source').textContent, /DE4\.2-b1 \/ App679/);
    assert.equal(good.nodes.get('profile-source').href, 'https://github.com/bluecyber81/pixl.js/tree/' + lcdTest679.releaseTag);
    assert.equal(new URL(good.nodes.get('android-dfu-link').href).searchParams.get('file'),
        'https://github.com/bluecyber81/pixl.js/releases/download/' + lcdTest679.releaseTag + '/' + lcdTest679Package.file);
    const bytes = fs.readFileSync(path.join(__dirname, '../public/firmware', lcdTest679Package.file));
    const candidate = await new (require('../public/dfu/package.js'))(bytes).load();
    assert.deepEqual(candidate.image.target.softDevices, [294]);
    assert.equal(candidate.archiveSha256, lcdTest679.otaSha256);
    assert.equal(candidate.archiveBytes, lcdTest679.otaBytes);
    assert.equal(crypto.createHash('sha256').update(new Uint8Array(candidate.image.imageData)).digest('hex'), lcdTest679.applicationBinSha256);
    assert.equal(good.options.validatePackage(candidate).counter, 679);
    const oled = ctx(678, 21, 294, 'OLED');
    assert.equal(oled.nodes.get('bundled').value, '');
    assert.throws(() => oled.options.validatePackage(candidate), /anderen Display/);
    for (const [app, bl, sd] of [[680,21,294], [678,20,294], [678,21,259]]) {
        const h = ctx(app,bl,sd);
        assert.equal(h.nodes.get('load-bundled').disabled,true);
        assert.equal(h.nodes.get('android-handoff').hidden,true);
        h.options.onState({ready:true,target:candidate.image.target});
        h.nodes.get('button').events.click();
        assert.equal(h.nodes.get('button').disabled,true);
        assert.deepEqual(h.calls,[]);
    }
    for (const delta of [{sha256:'f'.repeat(64)}, {bytes:257001}, {counter:680}, {channel:undefined}]) {
        const wrong = {...lcdTest679Package,...delta};
        assert.throws(() => Bundled.validateCatalog({schema:1,packages:[wrong]}));
        assert.equal(require('../public/dfu/nrf-dfu-link.mjs').nrfDfuLink(wrong),null);
    }
    assert.throws(() => good.options.validatePackage({...candidate, archiveSha256:'f'.repeat(64)}), /App679/);
    assert.throws(() => good.options.validatePackage({...candidate, image:{target:{...candidate.image.target,softDevices:[294,259]}}}), /App679/);
});
test('an OLED handoff offers only OLED packages and never preselects a bookmarked LCD package',async()=>{
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname,'../src/data/firmware-releases.json'),'utf8'));
    const location = new URL('https://example.test/dfu/web.html?package=' + catalog.packages[0].id + '#board=OLED');
    const h = harness(true,{AllmiiboFirmwareReleases:catalog,location});
    assert.equal(h.nodes.get('board-profile').value,'OLED');
    assert.equal(h.nodes.get('lcd-downloads').hidden,true);
    assert.equal(h.nodes.get('lcd-candidate-status').hidden,true);
    assert.equal(h.nodes.get('oled-downloads').hidden,false);
    assert.equal(h.nodes.get('bundled').disabled,false);
    assert.equal(h.nodes.get('bundled').value,'');
    assert.deepEqual(h.nodes.get('bundled').children.slice(1).map(n=>n.value),catalog.packages.filter(e=>e.board==='OLED').map(e=>e.id));
    assert.equal(h.nodes.get('android-handoff').hidden,true);
    assert.equal(h.nodes.get('android-dfu-link').href,undefined);
    await h.nodes.get('load-bundled').events.click();
    h.nodes.get('button').events.click();
    assert.deepEqual(h.calls,[]);
});

test('the OLED package link preselects the profile without loading or requesting a device',()=>{
    const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/data/firmware-releases.json'),'utf8'));
    const oled=catalog.packages.find(e=>e.board==='OLED');
    const h=harness(true,{AllmiiboFirmwareReleases:catalog,location:new URL('https://example.test/dfu/web.html?package='+oled.id)});
    assert.equal(h.nodes.get('board-profile').value,'OLED');
    assert.equal(h.nodes.get('bundled').value,oled.id);
    assert.equal(h.nodes.get('load-bundled').disabled,false);
    assert.equal(h.nodes.get('button').disabled,true);
    assert.match(h.nodes.get('profile-description').textContent,/SH1106/);
    assert.deepEqual(h.calls,[]);
});

test('changing display clears package readiness, and conflicting handoff blocks a new transfer',()=>{
    for(const hash of ['', '#board=OLED', '#board=OLED&board=LCD']){
        const h=harness(true,{location:new URL('https://example.test/dfu/web.html'+hash)});
        h.options.onState({ready:true,target:{counter:84,hardware:52,softDevices:[259]}});
        h.nodes.get('board-profile').value='LCD';h.nodes.get('board-profile').events.change();
        assert.equal(h.nodes.get('button').disabled,true);
        h.nodes.get('button').events.click();
        assert.equal(h.calls.some(c=>c[0]==='select'),false);
        assert.equal(h.nodes.get('file').disabled,!!hash);
    }
});
test('iPad desktop mode keeps ZIP inspection available and updates the transfer action if Bluetooth appears', () => {
    const navigator = {language:'de-DE',userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',maxTouchPoints:5};
    const h = harness(true, {navigator});
    h.options.onState({busy:false, loading:false, ready:true});
    const guide = h.nodes.get('apple-guide'), button = h.nodes.get('button');
    assert.equal(button.disabled, true);
    assert.equal(h.nodes.get('file').disabled, false);
    assert.match(h.nodes.get('capability').textContent, /Firmware-ZIP prüfen/);
    assert.equal(guide.hidden, false);
    assert.equal(guide.href, '../guide/index.html#iphone');
    h.context.AllmiiboLanguage.setMode('en');
    assert.equal(guide.href, '../guide/en.html#iphone');
    assert.match(h.nodes.get('capability').textContent, /check the firmware ZIP/);
    navigator.bluetooth = {requestDevice() { throw new Error('Should only run after a user selection'); }};
    h.windowEvents.focus();
    assert.equal(guide.hidden, true);
    assert.equal(h.nodes.get('capability').textContent, '');
    assert.equal(button.disabled, false);
    assert.deepEqual(h.calls, []);
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
      assert.equal(text.includes('Z15, Z17 und Z19 können sie bei gültiger Signatur installieren'),recent);
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
    for(const resource of resources){assert.ok(!/^(https?:|\/\/)/.test(resource));assert.ok(fs.existsSync(path.join(__dirname,'../public/dfu',resource.split('?')[0])),resource);}
    assert.ok(html.indexOf('vendor/crc32.js')<html.indexOf('src="package.js?v=3.68.0-beta.5"'));
    assert.ok(html.indexOf('src="secure-dfu.js?v=3.68.0-beta.5"')<html.indexOf('src="page.js?v=3.68.0-beta.5"'));
    assert.ok(html.indexOf('../firmware/releases.js')<html.indexOf('src="page.js?v=3.68.0-beta.5"'));
    assert.match(html,/connect-src 'self'/);assert.doesNotMatch(html,/connect-src[^;]*\*/);
    const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(anchors,['../','../guide/index.html#oled','../guide/index.html','https://github.com/bluecyber81/pixl.js/releases/download/de4.2/Allmiibo_LCD_DE4_2_App680_NUR_APP.zip','https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_APP.zip','../firmware/Allmiibo_LCD_DE3_89_662_NUR_APP.zip','https://github.com/bluecyber81/pixl.js/releases/tag/de3.89','https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip','../firmware/Allmiibo_LCD_DE3_81_654_NUR_APP.zip','../guide/#android-de381','../firmware/Allmiibo_LCD_DE3_88_661_NUR_APP.zip','../guide/#lcd-de388','../firmware/Allmiibo_LCD_DE3_87_660_NUR_APP.zip','../guide/#lcd-de387','../firmware/Allmiibo_LCD_DE3_75_648_NUR_APP.zip','../firmware/Allmiibo_LCD_DE3_65_637_NUR_APP.zip','https://github.com/bluecyber81/pixl.js/tree/de4.2','../guide/index.html#iphone','../','../licenses/index.html']);
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

test('empty OLED catalogue does not claim availability or offer the private LCD package',()=>{
 const h=harness(true,{location:new URL('https://example.test/dfu/web.html#board=OLED'),AllmiiboFirmwareReleases:{schema:1,packages:[]}});assert.match(h.nodes.get('bundled-info').textContent,/Kein mitgeliefertes Paket/);
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
    const stable = catalog.packages.find(entry => entry.counter === 637), preview = catalog.packages.find(entry => entry.counter === 645);
    const previous = catalog.packages.find(entry => entry.id === 'de3.89-lcd-app'), current = catalog.packages.find(entry => entry.id === 'de4.2-lcd-app');
    const pages = 'https://bluecyber81.github.io/pixl.js/dfu/web.html';
    for (const [query, expected] of [
        ['?package=de3.89-lcd-test1-app', previous], ['?package=de3.89-lcd-app', previous], ['?package=' + preview.id, preview], ['?package=' + stable.id, stable],
        ['', current], ['?package=de4.2-b2-lcd-app-test', current], ['?package=de4.2-lcd-app', current],
        ['?package=de4.1-lcd-app', catalog.packages.find(entry => entry.counter === 678)],
        ['?package=de3.100-lcd-app', catalog.packages.find(entry => entry.counter === 673)], ['?package=https://example.org/file.zip', null],
        ['?package=' + stable.id + '&package=' + preview.id, null], ['?package=', null]
    ]) {
        const recentBoot = '#read=' + Date.now() + '&app=636&bl=' + (expected?.bootloader === 'Z21' ? 21 : 19) + '&sd=294';
        const h = harness(true, {location:new URL(pages + query + recentBoot), AllmiiboFirmwareReleases:catalog});
        const select = h.nodes.get('bundled');
        assert.match(select.children[1].textContent, /DE4\.2-b2.*Stabile Ausgabe.*Z21/);
        assert.match(select.children.find(option => option.value === previous.id).textContent, /DE3\.89.*Frühere stabile Ausgabe/);
        assert.match(select.children.find(option => option.value === 'de3.76-lcd-app').textContent, /DE3\.76.*Testversion.*Z19/);
        assert.match(select.children.find(option => option.value === 'de3.77-lcd-app').textContent, /DE3\.77.*Testversion.*Z19/);
        assert.match(select.children.find(option => option.value === 'de3.80-lcd-app').textContent, /DE3\.80.*Testversion.*Z19\/Z20/);
        assert.match(select.children.find(option => option.value === 'de3.79-lcd-app').textContent, /DE3\.79.*Testversion.*Z19/);
        assert.match(select.children.find(option => option.value === 'de3.74-lcd-app').textContent, /DE3\.74.*Frühere stabile Ausgabe/);
        assert.match(select.children.find(option => option.value === 'de3.65-lcd-app').textContent, /DE3\.65.*Frühere stabile Ausgabe/);
        assert.equal(select.value, expected?.id || '');
        assert.equal(h.nodes.get('load-bundled').disabled, !expected);
        assert.equal(h.nodes.get('button').disabled, true);
        assert.deepEqual(h.calls, []);
        if (expected) assert.ok(h.nodes.get('bundled-info').textContent.includes(expected.version));
        else if (query) assert.match(h.nodes.get('bundled-info').textContent, /Bitte ein Paket auswählen/);
        h.options.onState({ready:true,target:{counter:637,hardware:52,softDevices:[294]}});
        assert.match(h.nodes.get('package-target').textContent, /App-Zähler 636/);
    }
});

test('bundled Web and Android actions honor fresh bootloader, SoftDevice and application counters', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/firmware-releases.json'), 'utf8'));
    for (const [id, app, bl, sd, allowed] of [
        ['de3.81-lcd-app', 653, 20, 294, true], ['de3.81-lcd-app', 654, 21, 294, true],
        ['de3.81-lcd-app', 655, 21, 294, false], ['de3.81-lcd-app', 653, 20, 259, false],
        ['de3.80-lcd-app', 652, 19, 294, true], ['de3.80-lcd-app', 653, 20, 294, true],
        ['de3.80-lcd-app', 654, 20, 294, false], ['de3.80-lcd-app', 652, 15, 294, false],
        ['de3.80-lcd-app', 652, 20, 259, false],
        ['de3.79-lcd-app', 651, 19, 294, true], ['de3.79-lcd-app', 652, 19, 294, true],
        ['de3.79-lcd-app', 653, 19, 294, false], ['de3.79-lcd-app', 651, 15, 294, false],
        ['de3.79-lcd-app', 651, 19, 259, false],
        ['de3.77-lcd-app', 649, 19, 294, true], ['de3.77-lcd-app', 650, 19, 294, true],
        ['de3.77-lcd-app', 651, 19, 294, false], ['de3.77-lcd-app', 649, 15, 294, false],
        ['de3.77-lcd-app', 649, 19, 259, false],
        ['de3.76-lcd-app', 648, 19, 294, true], ['de3.76-lcd-app', 649, 19, 294, true],
        ['de3.76-lcd-app', 650, 19, 294, false], ['de3.76-lcd-app', 648, 15, 294, false],
        ['de3.75-lcd-app', 647, 19, 294, true], ['de3.75-lcd-app', 648, 19, 294, true],
        ['de3.75-lcd-app', 649, 19, 294, false], ['de3.75-lcd-app', 647, 15, 294, false],
        ['de3.74-lcd-app', 646, 19, 294, true], ['de3.74-lcd-app', 647, 19, 294, true],
        ['de3.74-lcd-app', 648, 19, 294, false], ['de3.74-lcd-app', 636, 15, 294, false],
        ['de3.74-lcd-app', 645, 19, 259, false], ['de3.65-lcd-app', 636, 15, 294, true],
        ['de3.65-lcd-app', 647, 19, 294, false],
    ]) {
        const location = new URL('https://example.test/dfu/web.html?package=' + id);
        location.hash = new URLSearchParams({ read:Date.now(), app, bl, sd });
        const h = harness(true, {location, AllmiiboFirmwareReleases:catalog});
        assert.equal(h.nodes.get('load-bundled').disabled, !allowed, id + '/' + app + '/' + bl + '/' + sd);
        assert.equal(h.nodes.get('android-handoff').hidden, !allowed);
        if (!allowed) h.nodes.get('load-bundled').events.click();
        assert.deepEqual(h.calls, []);
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

test('native DFU follows the selected release, omits device data and clears the link for incompatible states', async () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/firmware-releases.json'), 'utf8'));
    const stable = catalog.packages.find(entry => entry.counter === 637), preview = catalog.packages.find(entry => entry.counter === 645);
    const previous = catalog.packages.find(entry => entry.id === 'de3.89-lcd-app'), current = catalog.packages.find(entry => entry.id === 'de4.1-lcd-app');
    const location = new URL('https://example.test/dfu/web.html?package=' + preview.id);
    location.hash = new URLSearchParams({ read:Date.now(), app:preview.counter, bl:19, sd:294 });
    const h = harness(false, {location, AllmiiboFirmwareReleases:catalog});
    const link = h.nodes.get('android-dfu-link'), panel = h.nodes.get('android-handoff');
    const verify = entry => {
        assert.equal(panel.hidden, false);
        const url = new URL(link.href);
        assert.equal(url.origin + url.pathname, 'https://www.nordicsemi.com/dfu/');
        assert.deepEqual([...url.searchParams], [['file', 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file]]);
        assert.equal(url.hash, '');
    };
    verify(preview);
    assert.deepEqual(h.calls, []);
    const select = h.nodes.get('bundled');
    select.value = stable.id;
    select.events.change();
    assert.equal(panel.hidden, true);
    assert.equal(link.href, undefined);
    location.hash = '';
    select.events.change();
    verify(stable);
    h.options.onState({busy:true});
    assert.equal(panel.hidden, true);
    assert.equal(link.href, undefined);
    h.options.onState({busy:false});
    verify(stable);
    const manual = h.nodes.get('file');
    manual.files = ['my-private-package.zip'];
    await manual.events.change();
    assert.equal(panel.hidden, true);
    assert.equal(link.href, undefined);
    assert.equal(h.calls.some(([type]) => type === 'select'), false);
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
    assert.equal(h.nodes.get('oled-guide').href, '../guide/en.html#oled');
    assert.equal(h.nodes.get('status').textContent, 'Connected');
    assert.match(h.nodes.get('transfer').textContent, /20 \/ 100 bytes acknowledged/);
    h.context.AllmiiboLanguage.setMode('en');
    assert.equal(h.nodes.get('phase-transfer').textContent, 'Transfer');
    assert.equal(h.nodes.get('phase-transfer')['aria-current'], 'step');
    assert.equal(h.nodes.get('progress').value, 20);
    assert.equal(h.nodes.get('button').disabled, true);
    assert.deepEqual(h.calls, []);
});


test('the archived LCD application and the retained Z21 package identify App662 separately',()=>{
 const row=html.match(/<p><a data-en="Archived DE3\.89 [\s\S]*?<\/p>/)?.[0];
 assert.ok(row);
 assert.match(row,/App662/);
 assert.match(row,/\.\.\/firmware\/Allmiibo_LCD_DE3_89_662_NUR_APP\.zip/);
 assert.match(row,/Z21.*S112 7\.3\.0/);
 assert.match(row,/releases\/tag\/de3\.89"/);
 const app=fs.readFileSync(path.join(__dirname,'../src/App.vue'),'utf8');
 const label=app.match(/<a :href="archiveLinks\.lcdKit"[\s\S]*?<\/a>/)?.[0];
 assert.match(label,/LCD DE3\.89 \/ App662 · Prüfpaket/);
 assert.match(label,/LCD DE3\.89 \/ App662 · test kit/);
 assert.doesNotMatch(label,/App65[78]/);
});


for (const preview of require('../public/dfu/lcd-private-reference.mjs').lcdPreviewPackages)
test(`App${preview.counter} runtime choice and deep link retain the stable catalogue and never auto-load or select Bluetooth`, () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/firmware-releases.json'), 'utf8'));
    const original = JSON.stringify(catalog);
    const location = new URL('https://bluecyber81.github.io/pixl.js/dfu/web.html?package=' + preview.id);
    location.hash = new URLSearchParams({board:'LCD', read:Date.now(), app:665, bl:21, sd:294});
    const h = harness(true, {location, AllmiiboFirmwareReleases:catalog});
    assert.equal(JSON.stringify(catalog), original);
    assert.equal(catalog.packages[0].counter, 680);
    assert.equal(catalog.packages.some(entry => entry.counter === preview.counter), false);
    assert.equal(h.nodes.get('bundled').value, preview.id);
    assert.equal(h.nodes.get('bundled').children.filter(option => option.value === preview.id).length, 1);
    const label = h.nodes.get('bundled').children.find(option => option.value === preview.id).textContent;
    assert.ok(label.includes(preview.version));
    assert.match(label, /Testversion.*Z21/);
    assert.equal(h.nodes.get('load-lcd-preview').disabled, false);
    assert.equal(h.nodes.get('lcd-preview-download').hidden, false);
    assert.equal(h.nodes.get('button').disabled, true);
    assert.deepEqual(h.calls, []);
    if ([683,684,685].includes(preview.counter)) {
        const tag = preview.counter === 685 ? 'de4.3-b4-lcd-test1' : preview.counter === 684 ? 'de4.3-b3-lcd-test1' : 'de4.3-b2-lcd-test1';
        assert.equal(h.nodes.get('android-handoff').hidden, false);
        assert.equal(new URL(h.nodes.get('android-dfu-link').href).searchParams.get('file'),'https://github.com/bluecyber81/pixl.js/releases/download/'+tag+'/'+preview.file);
        assert.equal(h.nodes.get('profile-source').href,'https://github.com/bluecyber81/pixl.js/tree/'+tag);
        return;
    }
    const native = new URL(h.nodes.get('android-dfu-link').href);
    assert.deepEqual([...native.searchParams], [['file', 'https://bluecyber81.github.io/pixl.js/' + ([669,670].includes(preview.counter) ? 'test/app' + preview.counter + '/' : '') + 'firmware/' + preview.file]]);
    assert.equal(native.hash, '');
    assert.equal(h.nodes.get('android-handoff').hidden, false);
});

test('normal App680 direct click uses the single bounded loader and keeps device selection a separate action', async () => {
    const preview = require('../public/dfu/lcd-app680-reference.mjs').lcdFinal680Package;
    const data = new Uint8Array(fs.readFileSync(path.join(__dirname, '../public/firmware', preview.file)));
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/firmware-releases.json'), 'utf8'));
    let resolve, loaders = 0, fetches = 0, fetchedUrl, fetchOptions;
    const response = new Promise(done => { resolve = done; });
    class CheckedLoader extends Bundled.Loader {
        constructor(options) {
            loaders++;
            super({...options, cryptoImpl:crypto.webcrypto, fetchImpl:(url, options) => {
                fetches++; fetchedUrl = url; fetchOptions = options; return response;
            }});
        }
    }
    const location = new URL('https://bluecyber81.github.io/pixl.js/dfu/web.html?package=de3.89-lcd-app');
    location.hash = new URLSearchParams({board:'LCD', read:Date.now(), app:665, bl:21, sd:294});
    const h = harness(true, {location, AllmiiboFirmwareReleases:catalog, AllmiiboBundledPackages:{Loader:CheckedLoader}});
    assert.equal(loaders, 1);
    assert.equal(h.nodes.get('load-bundled').disabled, true); // The selected stable App662 is older.
    assert.equal(h.nodes.get('load-lcd-preview').disabled, false);
    assert.equal(fetches, 0);
    h.nodes.get('file').value = 'previous.zip';
    const loading = h.nodes.get('load-lcd-preview').events.click();
    assert.equal(h.nodes.get('file').value, '');
    assert.equal(h.nodes.get('bundled').value, preview.id);
    assert.equal(fetches, 1);
    assert.equal(fetchedUrl, 'https://bluecyber81.github.io/pixl.js/firmware/' + preview.file);
    assert.equal(fetchOptions.redirect, 'error');
    assert.equal(fetchOptions.cache, 'no-store');
    assert.equal(h.nodes.get('load-lcd-preview').disabled, true);
    assert.equal(h.nodes.get('button').disabled, true);
    assert.equal(h.nodes.get('cancel-bundled').hidden, false);
    h.nodes.get('load-lcd-preview').events.click();
    h.nodes.get('button').events.click();
    assert.equal(fetches, 1);
    let read = false;
    resolve({ok:true, redirected:false, url:fetchedUrl, headers:{get:() => String(data.length)},
        body:{getReader:() => ({read:async() => read ? {done:true} : (read=true,{done:false,value:data}), cancel:async()=>{},releaseLock(){}})}});
    assert.equal(await loading, true);
    assert.equal(h.nodes.get('load-lcd-preview').disabled, false);
    assert.equal(h.nodes.get('button').disabled, false);
    assert.equal(h.nodes.get('cancel-bundled').hidden, true);
    assert.equal(h.calls.filter(([kind]) => kind === 'select').length, 0);
    const loaded = h.calls.filter(([kind, file]) => kind === 'package' && file);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0][1].name, preview.file);
    assert.deepEqual(new Uint8Array(await loaded[0][1].arrayBuffer()), data);
    h.nodes.get('button').events.click();
    assert.equal(h.calls.filter(([kind]) => kind === 'select').length, 1);
});

test('normal App680 direct and catalogue handlers share board, recent boot, downgrade, busy and loading guards', () => {
    const preview = require('../public/dfu/lcd-app680-reference.mjs').lcdFinal680Package;
    for (const sample of [
        {app:665, bl:21, sd:294, allowed:true}, {app:667, bl:21, sd:294, allowed:true}, {app:668, bl:21, sd:294, allowed:true},
        {app:669, bl:21, sd:294, allowed:true}, {app:670, bl:21, sd:294, allowed:true}, {app:673, bl:21, sd:294, allowed:true}, {app:675, bl:21, sd:294, allowed:true}, {app:677, bl:21, sd:294, allowed:true}, {app:678, bl:21, sd:294, allowed:true}, {app:679, bl:21, sd:294, allowed:true}, {app:680, bl:21, sd:294, allowed:true}, {app:681, bl:21, sd:294}, {app:665, bl:20, sd:294}, {app:665, bl:21, sd:259},
        {app:665, bl:21, sd:294, board:'OLED'}, {app:665, bl:21, sd:294, duplicateBoard:true},
        {app:665, bl:21, sd:294, state:{busy:true}}, {app:665, bl:21, sd:294, state:{loading:true}}
    ]) {
        const location = new URL('https://example.test/pixl.js/dfu/web.html?package=' + preview.id);
        location.hash = new URLSearchParams({board:sample.board || 'LCD', read:Date.now(), app:sample.app, bl:sample.bl, sd:sample.sd});
        if (sample.duplicateBoard) location.hash += '&board=OLED';
        const h = harness(true, {location});
        if (sample.state) h.options.onState(sample.state);
        assert.equal(h.nodes.get('load-lcd-preview').disabled, !sample.allowed, JSON.stringify(sample));
        assert.equal(h.nodes.get('load-bundled').disabled, !sample.allowed, JSON.stringify(sample));
        assert.equal(h.nodes.get('android-handoff').hidden, !sample.allowed, JSON.stringify(sample));
        if (!sample.allowed) {
            h.nodes.get('load-lcd-preview').events.click();
            h.nodes.get('load-bundled').events.click();
        }
        assert.deepEqual(h.calls, []);
        assert.equal(h.nodes.get('lcd-preview-download').hidden, sample.board === 'OLED');
    }
});

test('changing board invalidates a pending direct normal App680 download even if its response arrives later', async () => {
    let resolve, signal;
    const response = new Promise(done => { resolve = done; });
    class DelayedLoader extends Bundled.Loader {
        constructor(options) { super({...options, cryptoImpl:crypto.webcrypto, fetchImpl:(_url, options) => {
            signal = options.signal; return response;
        }}); }
    }
    const h = harness(true, {AllmiiboBundledPackages:{Loader:DelayedLoader}});
    const loading = h.nodes.get('load-lcd-preview').events.click();
    assert.equal(h.nodes.get('button').disabled, true);
    h.nodes.get('board-profile').value = 'OLED';
    h.nodes.get('board-profile').events.change();
    assert.equal(signal.aborted, true);
    resolve({});
    assert.equal(await loading, false);
    assert.equal(h.nodes.get('load-lcd-preview').disabled, true);
    assert.equal(h.nodes.get('lcd-preview-download').hidden, true);
    assert.equal(h.nodes.get('button').disabled, true);
    assert.equal(h.calls.some(([kind, file]) => kind === 'select' || kind === 'package' && file), false);
});

test('firmware file picker advertises common ZIP and generic binary MIME types without promising native picker behavior', () => {
    const input = html.match(/<input id="file"[^>]*>/)[0];
    assert.match(input, /accept="\.zip,application\/zip,application\/x-zip-compressed,application\/octet-stream"/);
    assert.match(input, /aria-describedby="firmware-file-help"/);
    assert.match(html, /Firmware-ZIP, nicht das große Übergabearchiv/);
    assert.match(html, /App680 direkt laden und prüfen/);
    assert.match(html, /Load and check App680 directly/);
    assert(html.indexOf('id="load-lcd-preview"') < html.indexOf('for="file"'), 'Direct normal App680 action precedes the manual file picker');
});

test('App670 deep link selects only its signed isolated package and never implicitly loads or starts Bluetooth', () => {
    const preview=require('../public/dfu/lcd-private-reference.mjs').lcdPreviewPackage670;
    const location = new URL('https://bluecyber81.github.io/pixl.js/test/app670/dfu/web.html?package='+preview.id);
    location.hash = new URLSearchParams({board:'LCD',read:Date.now(),app:669,bl:21,sd:294});
    const h=harness(true,{location});
    assert.equal(h.nodes.get('bundled').children.filter(option=>option.value===preview.id).length,1);
    assert.equal(h.nodes.get('bundled').value,preview.id);
    assert.equal(h.nodes.get('load-bundled').disabled,false);
    assert.equal(h.nodes.get('android-handoff').hidden,false);
    const native=new URL(h.nodes.get('android-dfu-link').href);
    assert.equal(native.searchParams.get('file'),'https://bluecyber81.github.io/pixl.js/test/app670/firmware/'+preview.file);
    assert.equal(h.nodes.get('button').disabled,true);
    assert.deepEqual(h.calls,[]);
    assert.match(html,/App680 ist die stabile Vorauswahl/);
    assert.ok(html.includes('href="https://github.com/bluecyber81/pixl.js/releases/download/de4.2/Allmiibo_LCD_DE4_2_App680_NUR_APP.zip"'));
    assert.match(html,/App680 direkt laden und prüfen/);
});


test('normal App680 is selected exactly once by default without loading a package or opening Bluetooth', () => {
    const release = require('../public/dfu/lcd-app680-reference.mjs').lcdFinal680Package;
    const h = harness();
    const select = h.nodes.get('bundled');
    assert.equal(select.value, release.id);
    assert.equal(select.children.filter(option => option.value === release.id).length, 1);
    assert.match(select.children.find(option => option.value === release.id).textContent, /DE4\.2-b2.*Stabile Ausgabe/);
    assert.equal(h.nodes.get('load-lcd-preview').disabled, false);
    assert.equal(h.nodes.get('button').disabled, true);
    assert.equal(h.nodes.get('profile-source').href, 'https://github.com/bluecyber81/pixl.js/tree/de4.2');
    assert.deepEqual(h.calls, []);
    assert.match(html, /App680 ist die stabile Vorauswahl/);
    assert.doesNotMatch(html, /App670 TEST1 direkt|App678 TEST/);
});

test('the page validates the real normal App680 ZIP before historical references and does not label it private', async () => {
    const release = require('../public/dfu/lcd-app680-reference.mjs').lcdFinal680Package;
    const Package = require('../public/dfu/package.js');
    const parsed = await new Package(fs.readFileSync(path.join(__dirname, '../public/firmware', release.file))).load();
    const h = harness();
    assert.deepEqual(h.options.validatePackage(parsed), {board:'LCD',counter:680,version:'2.22.0-DE4.2-b2',privatePreview:false});
    h.nodes.get('board-profile').value = 'OLED';
    assert.throws(() => h.options.validatePackage(parsed), /anderen Display/);
});

test('public App676 deep link, manual ZIP and changes back to App678 show the respective source', () => {
    const location = new URL('https://example.test/dfu/web.html?package=de3.103-lcd-app-test1#board=LCD');
    const h = harness(true, {location});
    const select = h.nodes.get('bundled');
    const source = h.nodes.get('profile-source');
    const current = h.context.lcdTest676;
    assert.equal(select.value, 'de3.103-lcd-app-test1');
    assert.match(select.children.find(option => option.value === select.value).textContent, /Testversion/);
    assert.equal(source.href, 'https://github.com/bluecyber81/pixl.js/tree/' + current.sourceCommit);
    select.value = 'de3.102-lcd-app';
    select.events.change();
    assert.match(source.href, /release\/lcd-de3102-app675$/);
    select.value = 'de4.1-lcd-app';
    select.events.change();
    assert.match(source.href, /\/de4\.1$/);
    select.value = '';
    h.options.onState({busy:false, loading:false, ready:true, previewVersion:current.firmwareVersion,
        target:{counter:676,hardware:52,softDevices:[0x0126]}});
    assert.match(h.nodes.get('package-target').textContent, /LCD-Testversion.*DE3\.103/);
    assert.equal(source.href, 'https://github.com/bluecyber81/pixl.js/tree/' + current.sourceCommit);
});

test('LCD App680 binds the original signed ZIP, keeps App679 and requires Z21/S112', async () => {
    const {lcdFinal680, lcdFinal680Package:entry} = require('../public/dfu/lcd-app680-reference.mjs');
    const catalog = require('../src/data/firmware-releases.json');
    assert.deepEqual(Bundled.validateCatalog(catalog).packages.slice(0,3).map(item=>item.counter),[680,678,679]);
    const bytes = fs.readFileSync(path.join(__dirname,'../public/firmware',entry.file));
    const candidate = await new (require('../public/dfu/package.js'))(bytes).load();
    assert.equal(candidate.archiveSha256,lcdFinal680.otaSha256);
    assert.equal(candidate.archiveBytes,entry.bytes);
    assert.equal(crypto.createHash('sha256').update(new Uint8Array(candidate.image.imageData)).digest('hex'),lcdFinal680.applicationBinSha256);
    const url = 'https://bluecyber81.github.io/pixl.js/dfu/web.html';
    assert.equal(harness(true,{location:new URL(url)}).nodes.get('bundled').value,'de4.2-lcd-app');
    const page = (app=679, bl=21, sd=294, board='LCD') => harness(true, {location:new URL(url+'?package='+entry.id+'#'+
        new URLSearchParams({app,bl,sd,board,read:Date.now()}))});
    const good = page();
    assert.equal(good.nodes.get('bundled').value,entry.id);
    assert.equal(good.nodes.get('load-bundled').disabled,false);
    assert.equal(good.options.validatePackage(candidate).counter,680);
    assert.equal(good.nodes.get('profile-source').href,'https://github.com/bluecyber81/pixl.js/tree/' + lcdFinal680.releaseTag);
    const android = new URL(require('../public/dfu/nrf-dfu-link.mjs').nrfDfuLink(entry));
    assert.equal(android.searchParams.get('file'), 'https://github.com/bluecyber81/pixl.js/releases/download/' + lcdFinal680.releaseTag + '/' + entry.file);
    for (const args of [[681,21,294],[679,20,294],[679,21,259]]) {
        const h=page(...args);
        assert.equal(h.nodes.get('load-bundled').disabled,true);
        h.options.onState({busy:false,loading:false,ready:true,target:candidate.image.target});
        assert.equal(h.nodes.get('button').disabled,true);
    }
    assert.throws(()=>page(679,21,294,'OLED').options.validatePackage(candidate));
    assert.throws(()=>good.options.validatePackage({...candidate,archiveSha256:'0'.repeat(64)}),/App680/);
    assert.throws(()=>good.options.validatePackage({...candidate,image:{target:{...candidate.image.target,softDevices:[294,259]}}}),/App680/);
    for (const delta of [{counter:679},{sha256:'f'.repeat(64)},{bytes:entry.bytes+1},{applicationOnly:false},{storage:'SPIFFS'}])
        assert.throws(()=>Bundled.validateCatalog({schema:1,packages:[{...entry,...delta}]}));
});

test('normal updater enables wide initial packets and firmware windows only for LCD', () => {
    const settings = [];
    const h = harness(true,{SecureDfu:class {constructor(crc, callback, delay, options) {settings.push(options);}}});
    for (const board of ['LCD','OLED']) {
        h.nodes.get('board-profile').value = board;
        h.options.createDfu();
        assert.equal(settings.at(-1).probeInitPacket, board === 'LCD');
        assert.equal(settings.at(-1).windowedFirmwareWrites, board === 'LCD');
    }
});
for (const firmware of [require('../public/dfu/lcd-app683-reference.mjs').lcdTest683Package, require('../public/dfu/lcd-app684-reference.mjs').lcdTest684Package, require('../public/dfu/lcd-app685-reference.mjs').lcdTest685Package])
test(`App${firmware.counter} needs a recent LCD Z21/S112 handoff before Bluetooth selection`,()=>{
 for(const [query,allowed] of [
  ['',false],['#board=LCD',false],['#board=OLED&read='+Date.now()+'&app=680&bl=21&sd=294',false],
  ['#board=LCD&read='+(Date.now()-700000)+'&app=680&bl=21&sd=294',false],
  ['#board=LCD&read='+Date.now()+'&app=680&bl=20&sd=294',false],
  ['#board=LCD&read='+Date.now()+'&app='+(firmware.counter+1)+'&bl=21&sd=294',false],
  ['#board=LCD&read='+Date.now()+'&app=680&bl=21&sd=294',true],
 ]) {
  const location=new URL('https://example.org/dfu/web.html?package='+firmware.id+query)
  const h=harness(true,{location})
  h.options.onState({busy:false,loading:false,ready:true,target:{counter:firmware.counter,hardware:52,softDevices:[294]},previewVersion:firmware.version})
  assert.equal(h.nodes.get('button').disabled,!allowed)
 }
})
