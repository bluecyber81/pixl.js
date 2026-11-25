import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import DfuPackage from '../public/dfu/package.js';
import Bundled from '../public/dfu/bundled-packages.js';
import Updater from '../public/dfu/updater.js';
import {nrfDfuLink} from '../public/dfu/nrf-dfu-link.mjs';
import {lcdTest677} from '../public/dfu/lcd-app677-reference.mjs';
import {lcdTest676} from '../public/dfu/lcd-app676-reference.mjs';
import {diagnosticBuildIdentity} from '../src/lib/firmware-build-reference.js';
import {supportsFolderPublication, displayBuildReference} from '../src/lib/hardware-profile.js';
import {packagePresentation} from '../src/lib/release-packages.js';
import {UPDATE_TARGET} from '../src/lib/update-target.js';

const file = name => readFileSync(new URL(name, import.meta.url));
const hash = input => createHash('sha256').update(input).digest('hex');
const catalog = Bundled.validateCatalog(JSON.parse(file('../src/data/firmware-releases.json')));
for (const ref of [lcdTest676, lcdTest677]) {
  const counter = ref.applicationCounter;
  const entry = catalog.packages.find(item => item.counter === counter && item.board === ref.board);


  test('signed App' + counter + ' is identified on manual and bundled LCD DFU', async () => {
    assert.equal(UPDATE_TARGET.application.counter, 678);
    assert.equal(catalog.packages[0].counter, 678);
    assert.equal(entry.channel, 'prerelease');
    assert.equal(entry.version, ref.firmwareVersion);
    const blob = file('../public/firmware/' + entry.file);
    assert.deepEqual(blob, file('../../fw/releases/' + entry.file));
    assert.equal(hash(blob), entry.sha256);
    assert.equal(blob.length, entry.bytes);
    const parsed = await new DfuPackage(blob).load();
    assert.equal(parsed.archiveSha256, ref.otaSha256);
    assert.equal(parsed.archiveBytes, ref.otaBytes);
    const bin = Buffer.from(parsed.image.imageData);
    assert.equal(hash(bin), ref.applicationBinSha256);
    assert.equal(bin.length, ref.applicationBytes);
    assert.deepEqual(parsed.image.target, {counter, hardware:52, softDevices:[0x0126]});
    assert.deepEqual(Bundled.validatePackage(parsed, 'LCD', catalog), entry);
    assert.throws(() => Bundled.validatePackage(parsed, 'OLED', catalog), /anderen Display/);
    const states = [];
    const updater = new Updater({Package:DfuPackage, validatePackage:pkg => Bundled.validatePackage(pkg, 'LCD', catalog),
      onState:state => states.push(state), createDfu() { assert.fail('ZIP inspection cannot select Bluetooth'); }});
    assert.equal(await updater.setPackage(new File([blob], entry.file)), true);
    assert.equal(states.at(-1).previewVersion, entry.version);
    assert.equal(states.at(-1).ready, true);
    assert.equal(new URL(nrfDfuLink(entry)).searchParams.get('file'), 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file);
    assert.equal(packagePresentation(entry).releaseNotesUrl, 'https://github.com/bluecyber81/pixl.js/releases/tag/' + ref.releaseTag);
    for (const changes of [{board:'OLED'}, {counter:675}, {version:'2.22.0-DE3.105'},
      {id:entry.id.replace('-test1','')}, {file:entry.file.replace('_NUR_APP','_TEST1_NUR_APP')},
      {channel:undefined}, {bootloader:'Z20'}, {storage:'SPIFFS'}, {softDevice:'S112 7.2.0'}]) {
      const changed = {...entry, ...changes};
      assert.equal(nrfDfuLink(changed), null);
      assert.throws(() => Bundled.validateCatalog({schema:1,packages:[changed]}));
    }
  });

  test('App' + counter + ' diagnostics and folder publication match the reference and packed engine', async () => {
    const identity = diagnosticBuildIdentity({firmwareVersion:entry.version, boot:{settingsCrcValid:true, applicationCounter:counter},
      build:{schemaVersion:1, board:'LCD', sourceId:ref.sourceId, previousFault:null}});
    assert.equal(identity.packageReference, ref);
    assert.equal(identity.packageReference.hardwareAcceptance, counter === 677 ? 'one-lcd-readback-and-owner-confirmed-general-operation' : 'pending');
    assert.equal(identity.firmwareReportedSourceRelation, 'matches-package');
    assert.equal(identity.referenceRelation, 'version-and-counter');
    assert.equal(identity.applicationHashVerified, false);
    const engine = '3ba6db5d72cb6c292beedd36b0b5126d4b63783ff054d07bcbc5c097d19ecd0f';
    const parsed = await new DfuPackage(file('../public/firmware/'+entry.file)).load();
    const bin = Buffer.from(parsed.image.imageData);
    assert.ok(bin.includes(Buffer.from(engine, 'hex')));
    assert.ok(bin.includes(Buffer.from(ref.sourceId)));
    assert.equal(supportsFolderPublication(entry.version, engine), true);
    assert.equal(supportsFolderPublication(entry.version, '0'.repeat(64)), false);
    assert.equal(displayBuildReference(entry.version).controllerDriver, 'ST7567');
  });
}
