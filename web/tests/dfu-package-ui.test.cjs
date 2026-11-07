const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('../public/dfu/vendor/jszip-3.10.2.min.js');
const Package = require('../public/dfu/package.js');
const Updater = require('../public/dfu/updater.js');
const wait = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function archive(manifest = { application: { dat_file: 'app.dat', bin_file: 'app.bin' } }, options = {}) {
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify({manifest}));
    zip.file('app.dat', require('./dfu-init-fixture.cjs')(4)); zip.file('app.bin', new Uint8Array([4,5,6,7]));
    if (options.edit) options.edit(zip);
    return zip.generateAsync({ type: 'uint8array', compression: options.compression || 'STORE' });
}
test('valid STORED and DEFLATE application archives load and image buffers are independent copies', async () => {
    for (const compression of ['STORE', 'DEFLATE']) {
        const pkg = await new Package(await archive(undefined,{compression})).load();
        assert.deepEqual(pkg.image.target, {counter:630,hardware:52,softDevices:[259,294]});
        const first = await pkg.getAppImage(); new Uint8Array(first.imageData)[0] = 9;
        assert.deepEqual([...new Uint8Array((await pkg.getAppImage()).imageData)], [4,5,6,7]);
    }
});
test('Nordic start packet must describe the actual application before choosing a device', async () => {
    for (const dat of [Uint8Array.of(1,2,3), require('./dfu-init-fixture.cjs')(3), require('./dfu-init-fixture.cjs')(4,2)]) {
        await assert.rejects(new Package(await archive(undefined,{edit: z => z.file('app.dat', dat)})).load());
    }
    await assert.rejects(new Package(await archive(undefined,{edit:z=>z.file('app.bin',Uint8Array.of(7,6,5,4))})).load(),/SHA-256/);
});
const fixtureFolder = process.env.ALLMIIBO_DFU_FIXTURES || path.resolve(__dirname, '../../../../outputs/allmiibo_de317_20261023');
const realFixtures = {
    'Allmiibo_LCD_DE3_17_574_TESTSTAND.zip': '23a56242eaed0a32e47a7c34bfe49d6dd06f04a81f25fbf6c3f83c07fe5aa4e7',
    'Allmiibo_LCD_DE3_16_RUECKKEHR_575.zip': '453200678d2bd212cdd53dc4e57e1b21d89e09acc7590c9dbe0b6fdbbdde4231'
};
const haveRealFixtures = Object.keys(realFixtures).every(name => fs.existsSync(path.join(fixtureFolder, name)));
// Portable source archives contain only synthetic test ZIPs. This additional
// local release check is explicit and hash-pinned; no OTA is served publicly.
test('real immutable DE3.17 and recovery575 application archives pass without device access',
    { skip: !haveRealFixtures && !process.env.ALLMIIBO_DFU_FIXTURES ? 'Optional local OTA fixtures absent; set ALLMIIBO_DFU_FIXTURES to their folder' : false }, async () => {
    for (const [name, expected] of Object.entries(realFixtures)) {
        const bytes = fs.readFileSync(path.join(fixtureFolder, name));
        assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), expected);
        const p = await new Package(bytes).load();
        assert.ok((await p.getAppImage()).imageData.byteLength > 350000);
    }
});
test('empty manifest cannot become a successful no-op', async () => {
    await assert.rejects(new Package(await archive({})).load(), /ausschließlich/);
});
test('bootloader/SoftDevice mixed packages are rejected before connection', async () => {
    await assert.rejects(new Package(await archive({application:{dat_file:'app.dat',bin_file:'app.bin'},bootloader:{}})).load(), /ausschließlich/);
});
test('missing init, empty application, oversized application and extra files rejected', async () => {
    for (const edit of [z => z.remove('app.dat'), z => z.file('app.bin',new Uint8Array()),
        z => z.file('app.bin',new Uint8Array(372737)), z => z.file('extra.bin','x')]) {
        await assert.rejects(new Package(await archive(undefined,{edit})).load());
    }
});
test('bad CRC rejected and failed reload clears formerly valid image', async () => {
    const bytes = await archive(), pkg = new Package(bytes); await pkg.load();
    const bad = bytes.slice(), signature = Buffer.from([4,5,6,7]);
    const index = Buffer.from(bad).indexOf(signature); assert.ok(index >= 0); bad[index] ^= 1;
    pkg.buffer = bad; await assert.rejects(pkg.load(), /Prüfsumme/); await assert.rejects(pkg.getAppImage(), /nicht erfolgreich/);
});
test('path entries, case duplicates and duplicate directory names rejected', async () => {
    for (const edit of [z => z.file('../escape.bin','x'), z => z.file('APP.BIN','x')]) {
        await assert.rejects(new Package(await archive(undefined,{edit})).load(), /Dateiname|Struktur/);
    }
});
test('forged oversized ZIP expansion is rejected before inflation', async () => {
    const bytes = await archive(); const v = new DataView(bytes.buffer);
    for(let p=0;p<bytes.length-46;p++) if(v.getUint32(p,true)===0x02014b50){v.setUint32(p+24,0x7fffffff,true);break;}
    await assert.rejects(new Package(bytes).load(), /zu groß/);
});
test('DEFLATE stream producing more than declared size is bounded and rejected', async () => {
    const bytes = await archive(undefined,{compression:'DEFLATE',edit:z=>z.file('app.bin',new Uint8Array(500000))});
    const v = new DataView(bytes.buffer);
    for(let p=0;p<bytes.length-46;p++) if(v.getUint32(p,true)===0x02014b50){
        const n=v.getUint16(p+28,true), name=Buffer.from(bytes.subarray(p+46,p+46+n)).toString();
        if(name==='app.bin'){v.setUint32(p+24,4,true);v.setUint32(v.getUint32(p+42,true)+22,4,true);break;}
    }
    await assert.rejects(new Package(bytes).load(), /überschreitet|size mismatch/);
});
test('truncation, wrong ZIP header and missing manifest rejected', async () => {
    const bytes = await archive(); await assert.rejects(new Package(bytes.slice(0,-1)).load());
    const bad=bytes.slice();bad[0]=0;await assert.rejects(new Package(bad).load());
    await assert.rejects(new Package(await archive(undefined,{edit:z=>z.remove('manifest.json')})).load());
});
function harness(overrides = {}) {
    const statuses=[], states=[], calls=[], progressListeners=new Set();
    const dfu={ lastResult:{transferVerified:true,executeAcknowledged:true,rebootObserved:false},
        addEventListener:(name,fn)=>progressListeners.add(fn),removeEventListener:(name,fn)=>progressListeners.delete(fn),
        requestDevice: mode => { calls.push(['request',mode]);return Promise.resolve({}); },
        update:async (device,init,image)=>{calls.push(['update',new Uint8Array(image)[0]]);}, ...overrides };
    const updater=new Updater({Package,createDfu:()=>dfu,onStatus:s=>statuses.push(s),onState:s=>states.push(s)});
    return {updater,dfu,statuses,states,calls,progressListeners};
}
test('double click makes one request; package changes during transfer do not replace selected image', async () => {
    const gate=deferred(),h=harness({update:async()=>gate.promise});await h.updater.setPackage(await archive());
    const first=h.updater.selectDevice();assert.equal(await h.updater.selectDevice(),false);
    assert.equal(await h.updater.setPackage(await archive({})),false);await wait();
    assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0],['request',false]);
    gate.resolve();assert.equal(await first,true);assert.equal(h.progressListeners.size,0);
});
test('stale package loader cannot overwrite later successful selection', async () => {
    const gates=[deferred(),deferred()], images=[{id:1},{id:2}];let index=0;
    class FakePackage {constructor(){this.index=index++;}async load(){await gates[this.index].promise;return this;}}
    const u=new Updater({Package:FakePackage,createDfu:()=>{throw Error('not expected');}});
    const a=u.setPackage(images[0]),b=u.setPackage(images[1]);gates[1].resolve();await b;gates[0].resolve();await a;
    assert.equal(u.package.index,1);assert.equal(u.loading,false);
});
test('connection failure and CRC failure do not become completion and always unlock controls', async () => {
    for(const overrides of [{requestDevice:async()=>{throw Error('cancelled');}}, {update:async()=>{throw Error('CRC mismatch');}}]) {
        const h=harness(overrides);await h.updater.setPackage(await archive());assert.equal(await h.updater.selectDevice(),false);
        assert.equal(h.updater.lastResult,null);assert.equal(h.updater.busy,false);assert.equal(h.progressListeners.size,0);
        assert.match(h.statuses.at(-1),/nicht bestätigt/);
    }
});
test('resolved transport without verified final EXECUTE is not success', async () => {
    const h=harness({lastResult:{transferVerified:true,executeAcknowledged:false}});await h.updater.setPackage(await archive());
    assert.equal(await h.updater.selectDevice(),false);assert.equal(h.updater.lastResult,null);
});
test('final ACK without disconnect leaves reboot unconfirmed and never claims application boot', async () => {
    const h=harness();await h.updater.setPackage(await archive());assert.equal(await h.updater.selectDevice(),true);
    assert.match(h.statuses.at(-1),/Neustart noch nicht beobachtet/);assert.equal(h.updater.lastResult.rebootObserved,false);
});
test('observed disconnect still asks for menu/version verification', async () => {
    const h=harness({lastResult:{transferVerified:true,executeAcknowledged:true,rebootObserved:true}});
    await h.updater.setPackage(await archive());assert.equal(await h.updater.selectDevice(),true);
    assert.match(h.statuses.at(-1),/Bluetooth wurde getrennt/);
    assert.match(h.statuses.at(-1),/Menü und Firmwareversion/);
});
test('local post-ACK disconnect gets a distinct completion message for both event timings', async () => {
    for (const disconnectObserved of [false,true]) {
        const h=harness({lastResult:{resultSchema:2,transferVerified:true,executeAcknowledged:true,
            disconnectObserved,localDisconnectRequested:true,rebootObserved:false}});
        await h.updater.setPackage(await archive());
        assert.equal(await h.updater.selectDevice(),true);
        assert.match(h.statuses.at(-1),/Übertragung bestätigt.*Browser.*Trennung angefordert.*Menü und Firmwareversion/);
    }
});
test('no package or package still loading cannot open Bluetooth chooser', async () => {
    const h=harness();assert.equal(await h.updater.selectDevice(),false);const load=h.updater.setPackage(await archive());
    assert.equal(await h.updater.selectDevice(),false);await load;assert.equal(h.calls.length,0);
});
test('cleared file selection invalidates the previously loaded package', async () => {
    const h=harness();await h.updater.setPackage(await archive());await h.updater.setPackage(null);
    assert.equal(h.updater.package,null);assert.equal(await h.updater.selectDevice(),false);assert.equal(h.calls.length,0);
});

test('failed transfer retains last confirmed byte position until the next attempt', async () => {
    const positions=[],listeners=new Map();let attempts=0;
    const d={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
      requestDevice:async()=>({}),update:async()=>{attempts++;listeners.get('progress')({object:'firmware',totalBytes:4096,currentBytes:240});throw Error('DFU byte offset mismatch: expected 260, received 240');}};
    const u=new Updater({Package,createDfu:()=>d,onProgress:value=>positions.push(value)});
    await u.setPackage(await archive());assert.equal(await u.selectDevice(),false);
    assert.equal(positions.at(-1).currentBytes,240);assert.equal(u.lastResult,null);
    const boundary=positions.length;assert.equal(await u.selectDevice(),false);
    assert.equal(positions[boundary],null);assert.equal(attempts,2);
    assert.equal(positions.at(-1).currentBytes,240);
});

test('3.30.1 init recovery explanation is visible and listeners are removed after success or failure', async () => {
  for (const failed of [false,true]) {
    const listeners=new Map(),statuses=[];
    const d={lastResult:{transferVerified:true,executeAcknowledged:true,rebootObserved:false},
      addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
      requestDevice:async()=>({}),update:async()=>{
        listeners.get('log')({message:'Ein längeres Init-Paket wird neu angelegt.'});
        listeners.get('log')({message:undefined});
        if(failed)throw Error('CRC mismatch');
      }};
    const u=new Updater({Package,createDfu:()=>d,onStatus:value=>statuses.push(value)});
    await u.setPackage(await archive());assert.equal(await u.selectDevice(),!failed);
    assert.ok(statuses.includes('Ein längeres Init-Paket wird neu angelegt.'));
    assert.equal(listeners.size,0);assert.equal(u.busy,false);
    assert.match(statuses.at(-1),failed?/nicht bestätigt/:/Neustart noch nicht beobachtet/);
  }
});
