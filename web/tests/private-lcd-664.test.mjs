import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import DfuPackage from '../public/dfu/package.js';
import Bundled from '../public/dfu/bundled-packages.js';
import Updater from '../public/dfu/updater.js';
import {lcdPreviousPreview as lcdPreview} from '../public/dfu/lcd-private-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {getMigrationCapacityTarget} from '../src/lib/migration-capacity.js';
import {supportsFolderPublication} from '../src/lib/hardware-profile.js';

const catalog = Bundled.validateCatalog(JSON.parse(readFileSync(new URL('../public/firmware/releases.json', import.meta.url))));
const bytes = readFileSync(new URL('../public/firmware/Allmiibo_LCD_DE3_91_664_NUR_APP.zip', import.meta.url));

test('private App664 recognition uses the entire local ZIP and its parsed application target', async () => {
  const parsed = new DfuPackage(bytes);
  await parsed.load();
  assert.equal(parsed.archiveSha256, lcdPreview.otaSha256);
  assert.equal(parsed.archiveBytes, lcdPreview.otaBytes);
  assert.equal(createHash('sha256').update(new Uint8Array(parsed.image.imageData)).digest('hex'), lcdPreview.applicationBinSha256);
  assert.equal(parsed.image.imageData.byteLength, lcdPreview.applicationBytes);
  assert.equal(Bundled.validatePackage(parsed, 'LCD', catalog, lcdPreview).version, lcdPreview.firmwareVersion);
  assert.throws(() => Bundled.validatePackage(parsed, 'OLED', catalog, lcdPreview), /anderen Display/);
  assert.equal(Bundled.validatePackage({...parsed, archiveSha256: 'f'.repeat(64)}, 'LCD', catalog, lcdPreview), undefined);
  assert.throws(() => Bundled.validatePackage({...parsed, image:{target:{...parsed.image.target, counter:663}}}, 'LCD', catalog, lcdPreview), /Startpaket/);
  let state;
  const updater = new Updater({Package:DfuPackage, validatePackage:p=>Bundled.validatePackage(p,'LCD',catalog,lcdPreview),
    createDfu(){assert.fail('unrequested Bluetooth connection');}, onState:value=>{state=value;}});
  assert.equal(await updater.setPackage(new File([bytes], 'renamed.zip')), true);
  assert.equal(state.previewVersion, '2.22.0-DE3.91');
  assert.equal(state.ready, true);
  assert.equal(catalog.packages[0].counter, 662);
  assert.equal(catalog.packages.some(item => item.counter === 664), false);
});

test('App664 build reference and PackedFS identity require the LCD version, expected counter and matching source', () => {
  const version = lcdPreview.firmwareVersion;
  const boot = {settingsCrcValid:true, applicationCounter:664};
  const build = {schemaVersion:1,board:'LCD',sourceId:lcdPreview.sourceId,previousFault:null};
  const identity = diagnosticBuildIdentity({firmwareVersion:version,boot,build});
  assert.equal(identity.referenceRelation, 'version-and-counter');
  assert.equal(identity.firmwareReportedSourceRelation,'matches-package');
  assert.equal(identity.applicationHashVerified, false);
  assert.equal(identity.packageReference.hardwareAcceptance,'pending');
  assert.equal(diagnosticBuildIdentity({firmwareVersion:version,boot:{...boot,applicationCounter:663},build}).referenceRelation,'different-counter');
  assert.equal(diagnosticBuildIdentity({firmwareVersion:version,boot,build:{...build,sourceId:'a'.repeat(64)}}).firmwareReportedSourceRelation,'differs-from-package');
  const profile=getMigrationCapacityTarget('de391');
  assert.deepEqual(profile.approvedApplications,[{firmwareVersion:version, applicationCounter:664}]);
  assert.equal(supportsFolderPublication(version,profile.layout.engineSha256),true);
  assert.equal(supportsFolderPublication(version,getMigrationCapacityTarget('de389').layout.engineSha256),false);
  assert.equal(supportsFolderPublication('2.22.0-DE3.87-OLEDt6',profile.layout.engineSha256),false);
});
