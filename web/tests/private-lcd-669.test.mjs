import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import DfuPackage from '../public/dfu/package.js';
import Bundled from '../public/dfu/bundled-packages.js';
import Updater from '../public/dfu/updater.js';
import {lcdPreview669 as lcdPreview, lcdPreviews, lcdPreviewPackage669 as lcdPreviewPackage, lcdPreviewPackages} from '../public/dfu/lcd-private-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {buildDiagnosticBoard} from '../src/lib/lcd-build-diagnostics.js';
import {supportsFolderPublication, firmwareBoard, displayBuildReference} from '../src/lib/hardware-profile.js';
import JSZip from '../public/dfu/vendor/jszip-3.10.2.min.js';
import {nrfDfuLink} from '../public/dfu/nrf-dfu-link.mjs';

const catalog = Bundled.validateCatalog(JSON.parse(readFileSync(new URL('../public/firmware/releases.json', import.meta.url))));
const filename = 'Allmiibo_LCD_DE3_96_669_TEST1_NUR_APP.zip';
test('App669 TEST1 native handoff uses the isolated published path and rejects mismatched profiles', () => {
  assert.equal(new URL(nrfDfuLink(lcdPreviewPackage)).searchParams.get('file'),
    'https://bluecyber81.github.io/pixl.js/test/app669/firmware/' + filename);
  for (const patch of [{counter:668},{board:'OLED'},{bootloader:'Z20'},{softDevice:'S112 7.2.0'},
    {channel:'stable'},{applicationOnly:false},{migrationRequired:true},{file:'Allmiibo_LCD_DE3_96_669_NUR_APP.zip'},
    {version:'2.22.0-DE3.97'},{storage:'SPIFFS'}]) {
    assert.equal(nrfDfuLink({...lcdPreviewPackage,...patch}),null);
    assert.throws(()=>Bundled.validateCatalog({schema:1,packages:[{...lcdPreviewPackage,...patch}]}));
  }
});
function signedBytes() {
  assert.equal(lcdPreview.artifactStatus, 'experimental-signed-application', 'App669 signed package identity is pending; this final release gate must wait.');
  for (const key of ['sourceId','applicationBinSha256','otaSha256']) assert.match(lcdPreview[key] || '', /^[a-f0-9]{64}$/);
  return readFileSync(new URL('../public/firmware/' + filename, import.meta.url));
}

function directApp669(bytes = signedBytes()) {
  const runtimeCatalog = Bundled.validateCatalog({schema:catalog.schema, packages:[...catalog.packages,...lcdPreviewPackages]});
  const observed = {parserCalls:0, bluetoothSelections:0, requests:[], statuses:[], state:null, reference:null};
  // Count parser entry without replacing any ZIP, init-packet or BIN validation.
  class ObservedPackage extends DfuPackage {
    async load() { observed.parserCalls++; return super.load(); }
  }
  const updater = new Updater({
    Package:ObservedPackage,
    validatePackage(candidate) {
      observed.reference = Bundled.validatePackage(candidate, 'LCD', runtimeCatalog, lcdPreviews);
      return observed.reference;
    },
    createDfu() { observed.bluetoothSelections++; assert.fail('Package loading must not select a Bluetooth device'); },
    onState(state) { observed.state = state; },
  });
  const pageUrl = 'https://bluecyber81.github.io/pixl.js/dfu/web.html';
  const loader = new Bundled.Loader({
    catalog:runtimeCatalog, updater, pageUrl, cryptoImpl:webcrypto,
    fetchImpl:async (url, options) => {
      observed.requests.push({url,options});
      // The real Response stream also models downloads advertised as generic binary.
      const response = new Response(bytes, {status:200, headers:{
        'content-type':'application/octet-stream', 'content-length':String(bytes.length),
      }});
      Object.defineProperty(response, 'url', {value:url});
      return response;
    },
    onStatus(message) { observed.statuses.push(message); },
  });
  return {loader,updater,observed};
}

test('App669 direct loading verifies the real signed ZIP through Loader, Updater and Package without Bluetooth selection', async () => {
  const {loader,updater,observed} = directApp669();
  assert.equal(await loader.load(lcdPreviewPackage.id), true);
  assert.equal(observed.requests.length, 1);
  assert.equal(observed.requests[0].url, 'https://bluecyber81.github.io/pixl.js/firmware/' + filename);
  assert.equal(observed.requests[0].options.redirect, 'error');
  assert.equal(observed.parserCalls, 1);
  assert.equal(observed.bluetoothSelections, 0);
  assert.ok(updater.package instanceof DfuPackage);
  assert.equal(updater.package.archiveSha256, lcdPreview.otaSha256);
  assert.equal(updater.package.archiveBytes, lcdPreview.otaBytes);
  assert.equal(createHash('sha256').update(new Uint8Array(updater.package.image.imageData)).digest('hex'), lcdPreview.applicationBinSha256);
  assert.deepEqual(observed.reference, {board:'LCD',counter:669,version:'2.22.0-DE3.96',privatePreview:true});
  assert.equal(observed.state.ready, true);
  assert.equal(observed.state.previewVersion, '2.22.0-DE3.96');
  assert.equal(observed.state.target.counter, 669);
  assert.equal(observed.state.target.hardware, 52);
  assert.deepEqual(observed.state.target.softDevices, [0x0126]);
  assert.equal(updater.busy, false);
  assert.equal(loader.loading, false);
});

test('App669 direct loading blocks a same-length changed archive at ZIP SHA-256 before parsing or Bluetooth', async () => {
  const changed = Buffer.from(signedBytes());
  changed[Math.floor(changed.length / 2)] ^= 1;
  assert.equal(changed.length, lcdPreview.otaBytes);
  const {loader,updater,observed} = directApp669(changed);
  assert.equal(await loader.load(lcdPreviewPackage.id), false);
  assert.equal(observed.requests.length, 1);
  assert.equal(observed.parserCalls, 0);
  assert.equal(observed.bluetoothSelections, 0);
  assert.equal(updater.package, null);
  assert.equal(observed.state.ready, false);
  assert.equal(loader.loading, false);
  assert.match(observed.statuses.at(-1), /SHA-256 stimmt nicht/);
});

for (const type of ['application/x-zip-compressed','application/octet-stream']) {
  test(`App669 valid signed File with ${type} keeps the same package checks and requires a separate Bluetooth action`, async () => {
    const bytes = signedBytes(), {loader,updater,observed} = directApp669(bytes);
    const file = new File([bytes], filename, {type});
    assert.equal(file.type, type);
    assert.equal(await loader.manual(file), true);
    assert.equal(observed.requests.length, 0);
    assert.equal(observed.parserCalls, 1);
    assert.equal(observed.bluetoothSelections, 0);
    assert.equal(updater.package.archiveSha256, lcdPreview.otaSha256);
    assert.equal(updater.package.archiveBytes, lcdPreview.otaBytes);
    assert.equal(observed.reference.privatePreview, true);
    assert.equal(observed.reference.board, 'LCD');
    assert.equal(observed.state.previewVersion, '2.22.0-DE3.96');
    assert.equal(observed.state.target.counter, 669);
    assert.equal(observed.state.ready, true);
  });
}

test('private App669 recognition binds the actual signed application ZIP, BIN and embedded target', async () => {
  const bytes = signedBytes();
  const parsed = new DfuPackage(bytes);
  await parsed.load();
  assert.equal(lcdPreview.firmwareVersion, '2.22.0-DE3.96');
  assert.equal(lcdPreview.applicationCounter, 669);
  assert.equal(parsed.archiveSha256, lcdPreview.otaSha256);
  assert.equal(parsed.archiveBytes, lcdPreview.otaBytes);
  assert.equal(createHash('sha256').update(new Uint8Array(parsed.image.imageData)).digest('hex'), lcdPreview.applicationBinSha256);
  assert.equal(parsed.image.imageData.byteLength, lcdPreview.applicationBytes);
  assert.equal(parsed.image.target.counter, 669);
  assert.equal(parsed.image.target.hardware, 52);
  assert.deepEqual(parsed.image.target.softDevices, [0x0126]);
  assert.equal(Bundled.validatePackage(parsed, 'LCD', catalog, lcdPreviews).version, lcdPreview.firmwareVersion);
  assert.throws(() => Bundled.validatePackage(parsed, 'OLED', catalog, lcdPreviews), /anderen Display/);
  assert.equal(Bundled.validatePackage({...parsed, archiveSha256:'f'.repeat(64)}, 'LCD', catalog, lcdPreviews), undefined);
  assert.equal(Bundled.validatePackage({...parsed, archiveBytes:parsed.archiveBytes + 1}, 'LCD', catalog, lcdPreviews), undefined);
  assert.throws(() => Bundled.validatePackage({...parsed, image:{target:{...parsed.image.target, counter:665}}}, 'LCD', catalog, lcdPreviews), /Startpaket/);
  let state;
  const updater = new Updater({Package:DfuPackage, validatePackage:p=>Bundled.validatePackage(p,'LCD',catalog,lcdPreviews),
    createDfu(){assert.fail('unrequested Bluetooth connection');}, onState:value=>{state=value;}});
  assert.equal(await updater.setPackage(new File([bytes], 'renamed.zip')), true);
  assert.equal(state.previewVersion, '2.22.0-DE3.96');
  assert.equal(state.ready, true);
  assert.equal(catalog.packages[0].counter, 671);
  assert.equal(catalog.packages.find(item => item.id === 'de3.89-lcd-app').counter, 662);
  assert.equal(catalog.packages.some(item => item.counter === 669), false);
  assert.deepEqual(lcdPreviews.map(item => item.applicationCounter), [670,669,668,667,665,664]);
});

test('App669 diagnostics and capacity require the new exact source, counter and engine while retaining previous profiles', () => {
  signedBytes();
  const evidence = JSON.parse(readFileSync(new URL('../../docs/validation/DE3_96_PFS.json', import.meta.url)));
  const version = lcdPreview.firmwareVersion;
  assert.equal(buildDiagnosticBoard(version), 'LCD');
  assert.equal(firmwareBoard(version), 'LCD');
  assert.equal(displayBuildReference(version).controllerDriver, 'ST7567');
  assert.equal(lcdPreview.sourceId, evidence.sourceId);
  assert.equal(lcdPreview.applicationBinSha256, evidence.buildArtifacts['pixljs.bin']);
  assert.equal(lcdPreview.applicationBytes, evidence.elfLoadBytesCompared);
  const boot = {settingsCrcValid:true, applicationCounter:669};
  const build = {schemaVersion:1,board:'LCD',sourceId:lcdPreview.sourceId,previousFault:null};
  const identity = diagnosticBuildIdentity({firmwareVersion:version,boot,build});
  assert.equal(identity.referenceRelation, 'version-and-counter');
  assert.equal(identity.firmwareReportedSourceRelation, 'matches-package');
  assert.equal(identity.applicationHashVerified, false);
  assert.equal(identity.packageReference.artifactStatus, 'experimental-signed-application');
  assert.equal(identity.packageReference.hardwareAcceptance, 'pending');
  assert.equal(diagnosticBuildIdentity({firmwareVersion:version,boot:{...boot,applicationCounter:665},build}).referenceRelation,'different-counter');
  assert.equal(diagnosticBuildIdentity({firmwareVersion:version,boot,build:{...build,sourceId:'a'.repeat(64)}}).firmwareReportedSourceRelation,'differs-from-package');
  const profile = getMigrationCapacityTarget('de396');
  assert.deepEqual(profile.approvedApplications, [{firmwareVersion:version,applicationCounter:669}]);
  assert.equal(profile.layout.engineSha256, evidence.engine.engineSha256);
  assert.equal(profile.wasmSha256, evidence.wasmSha256);
  assert.equal(supportsFolderPublication(version,profile.layout.engineSha256),true);
  for (const previous of ['de394','de392','de391','de389'])
    assert.equal(supportsFolderPublication(version,getMigrationCapacityTarget(previous).layout.engineSha256),false);
  assert.equal(supportsFolderPublication('2.22.0-DE3.92',profile.layout.engineSha256),false);
  assert.equal(supportsFolderPublication('2.22.0-DE3.87-OLEDt6',profile.layout.engineSha256),false);
});

test('the mobile current download uses normal App671 while retained App669 keeps its own runtime package', () => {
  const html = readFileSync(new URL('../public/dfu/web.html', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../public/dfu/page.js', import.meta.url), 'utf8');
  assert.match(html, /App671 direkt laden und prüfen/);
  assert.ok(lcdPreviewPackages.includes(lcdPreviewPackage));
  assert.ok(html.includes('../firmware/Allmiibo_LCD_DE3_98_671_NUR_APP.zip'));
  assert.match(html, /DE3\.98 \/ App671/);
  assert.ok(page.includes("'./lcd-private-reference.mjs?v=3.61.0'"));
  assert.equal(catalog.packages[0].version, '2.22.0-DE3.98');
  assert.ok(page.includes("'./lcd-release-reference.mjs?v=3.61.0'"));
});

