import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import DfuPackage from '../public/dfu/package.js';
import Bundled from '../public/dfu/bundled-packages.js';
import Updater from '../public/dfu/updater.js';
import {nrfDfuLink} from '../public/dfu/nrf-dfu-link.mjs';
import {lcdRelease, lcdReleasePackage as entry} from '../public/dfu/lcd-release-reference.mjs';
import {lcdPreviews} from '../public/dfu/lcd-private-reference.mjs';
import {packagePresentation, firmwarePackageText} from '../src/lib/release-packages.js';

const read = name => readFileSync(new URL(name, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = read('../public/firmware/' + entry.file);
const catalog = JSON.parse(read('../src/data/firmware-releases.json'));
const qualification = JSON.parse(read('../../docs/validation/DE3_98_PFS.json'));
const references = [lcdRelease, ...lcdPreviews];

test('normal App671 archive binds its ZIP, BIN and init target to the qualified firmware without the private-test label', async () => {
  assert.equal(lcdRelease.artifactStatus, 'stable-signed-application');
  assert.equal(lcdRelease.firmwareChannel, 'normal');
  assert.equal(lcdRelease.hardwareAcceptance, 'pending-for-this-build');
  assert.equal(entry.id, 'de3.98-lcd-app');
  assert.equal(entry.file, 'Allmiibo_LCD_DE3_98_671_NUR_APP.zip');
  assert.equal(entry.channel, undefined);
  assert.equal(packagePresentation(entry).releaseNotesUrl, '/guide/index.html#lcd-de398');
  for (const language of ['de_DE','en']) {
    assert.match(firmwarePackageText(language).source, /DE3\.98 \/ App671/);
    assert.match(firmwarePackageText(language).scope, /DE3\.98 \/ App671/);
    assert.doesNotMatch(firmwarePackageText(language).scope, /confirmed operation|Besitzer bestätigte/);
  }
  assert.equal(catalog.packages.filter(item => item.id === entry.id).length, 1);
  assert.deepEqual(catalog.packages.find(item => item.id === entry.id), entry);
  assert.equal(sha(original), lcdRelease.otaSha256);
  assert.equal(original.byteLength, lcdRelease.otaBytes);
  const parsed = await new DfuPackage(original).load();
  assert.equal(parsed.archiveSha256, lcdRelease.otaSha256);
  assert.equal(parsed.archiveBytes, lcdRelease.otaBytes);
  assert.equal(parsed.image.imageData.byteLength, lcdRelease.applicationBytes);
  assert.equal(sha(new Uint8Array(parsed.image.imageData)), lcdRelease.applicationBinSha256);
  assert.equal(lcdRelease.applicationBinSha256, qualification.buildArtifacts['pixljs.bin']);
  assert.equal(lcdRelease.applicationBytes, qualification.elfLoadBytesCompared);
  assert.equal(lcdRelease.sourceId, qualification.sourceId);
  assert.deepEqual(parsed.image.target, {counter:671,hardware:52,softDevices:[0x0126]});
  assert.deepEqual(Bundled.validatePackage(parsed, 'LCD', catalog, references),
    {board:'LCD',counter:671,version:'2.22.0-DE3.98',privatePreview:false});
  assert.throws(() => Bundled.validatePackage(parsed, 'OLED', catalog, references), /anderen Display/);
  for (const changed of [{counter:670},{hardware:51},{softDevices:[0x0103]}])
    assert.throws(() => Bundled.validatePackage({...parsed,image:{target:{...parsed.image.target,...changed}}}, 'LCD', catalog, references), /Startpaket/);
});

test('normal App671 native handoff requires the exact release profile and uses the normal Pages root', () => {
  const link = new URL(nrfDfuLink(entry));
  assert.equal(link.origin + link.pathname, 'https://www.nordicsemi.com/dfu/');
  assert.deepEqual([...link.searchParams], [['file', 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file]]);
  assert.equal(link.hash, '');
  for (const patch of [{board:'OLED'},{version:'2.22.0-DE3.99'},{id:'de3.98-lcd-app-test1'},
    {counter:670},{bootloader:'Z20'},{softDevice:'S112 7.2.0'},{storage:'SPIFFS'},
    {channel:'prerelease'},{channel:'stable'},{applicationOnly:false},{migrationRequired:true},
    {file:'Allmiibo_LCD_DE3_98_671_TEST1_NUR_APP.zip'}])
    assert.equal(nrfDfuLink({...entry,...patch}), null, JSON.stringify(patch));
});

function updaterProbe() {
  const observed = {parserCalls:0,bluetoothSelections:0,state:null};
  class CountedPackage extends DfuPackage {
    async load() { observed.parserCalls++; return super.load(); }
  }
  const updater = new Updater({Package:CountedPackage,
    validatePackage:candidate => Bundled.validatePackage(candidate, 'LCD', catalog, references),
    createDfu() { observed.bluetoothSelections++; throw Error('Package inspection must not start Bluetooth'); },
    onState:state => { observed.state = state; }});
  return {updater,observed};
}

test('normal App671 bounded download uses the real parser and rejects a same-size changed ZIP before parsing', async () => {
  for (const corrupt of [false,true]) {
    const {updater,observed} = updaterProbe();
    let requests = 0;
    const data = new Uint8Array(original);
    if (corrupt) data[data.length - 1] ^= 1;
    const loader = new Bundled.Loader({catalog,updater,
      pageUrl:'https://bluecyber81.github.io/pixl.js/dfu/web.html',cryptoImpl:webcrypto,
      fetchImpl:async (url, options) => {
        requests++;
        assert.equal(url, 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file);
        assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        let sent = false;
        return {ok:true,redirected:false,url,headers:{get:() => String(data.length)},body:{getReader:() => ({
          read:async () => sent ? {done:true} : (sent = true,{done:false,value:data}),
          cancel:async () => {},releaseLock() {}})}};
      }});
    assert.equal(await loader.load(entry.id), !corrupt);
    assert.equal(requests, 1);
    assert.equal(observed.parserCalls, corrupt ? 0 : 1);
    assert.equal(observed.bluetoothSelections, 0);
    assert.equal(observed.state.ready, !corrupt);
    assert.equal(observed.state.previewVersion, undefined);
    assert.equal(loader.loading, false);
    if (corrupt) assert.equal(updater.package, null);
    else assert.equal(observed.state.target.counter, 671);
  }
});

test('normal App671 manual phone ZIP selection preserves exact package validation without a test label or Bluetooth', async () => {
  for (const type of ['application/x-zip-compressed','application/octet-stream']) {
    const {updater,observed} = updaterProbe();
    assert.equal(await updater.setPackage(new File([original], entry.file, {type})), true);
    assert.equal(observed.parserCalls, 1);
    assert.equal(observed.bluetoothSelections, 0);
    assert.equal(updater.package.archiveSha256, entry.sha256);
    assert.equal(observed.state.target.counter, 671);
    assert.equal(observed.state.previewVersion, undefined);
    assert.equal(observed.state.ready, true);
  }
});
