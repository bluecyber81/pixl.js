import test from 'node:test';
import assert from 'node:assert/strict';
import { packagePresentation,firmwarePackageText,currentLcdDownloads,dfuReference } from '../src/lib/release-packages.js';
import { parseBootDiagnostics } from '../src/lib/boot-diagnostics.js';
import { nrfDfuLink } from '../public/dfu/nrf-dfu-link.mjs';
import { readFileSync } from 'node:fs';
import bootPacket from './boot-fixture.cjs';
const entry={id:'de3.53-lcd-app',version:'2.22.0-DE3.53',counter:625,file:'Allmiibo_LCD_DE3_53_625_TESTSTAND.zip'};

test('the final signed package reaches Android and is compared when only the device version is available', () => {
  const { packages } = JSON.parse(readFileSync(new URL('../src/data/firmware-releases.json', import.meta.url)));
  const candidate = packages.find(item => item.version === '2.22.0-DE3.81');
  assert.equal(candidate, packages[0]);
  assert.equal(candidate.channel, undefined);
  const android = new URL(nrfDfuLink(candidate));
  assert.equal(android.searchParams.get('file'), 'https://bluecyber81.github.io/pixl.js/firmware/' + candidate.file);
  for (const changed of [{applicationOnly:false}, {file:'../' + candidate.file}, {counter:644}]) {
    assert.equal(nrfDfuLink({...candidate, ...changed}), null);
  }
  assert.equal(packagePresentation(packages.find(item => item.counter === 637), {connected:true, firmwareVersion:candidate.version}).newer, true);
  assert.equal(packagePresentation(candidate, {connected:true, firmwareVersion:'2.22.0-DE3.82'}).newer, true);
  assert.equal(packagePresentation(candidate).releaseNotesUrl,'https://github.com/bluecyber81/pixl.js/releases/tag/de3.81');
  assert.deepEqual(packages.map(item=>item.counter),[654,648,653,652,650,649,647,637,646,645]);
});
for (const [version, counter] of [['DE3.76', 649], ['DE3.77', 650], ['DE3.79', 652], ['DE3.80', 653]]) {
  test(version + ' preview offers its signed application ZIP on Android', () => {
    const { packages } = JSON.parse(readFileSync(new URL('../src/data/firmware-releases.json', import.meta.url)));
    const preview = packages.find(item => item.counter === counter);
    assert.equal(preview.version, '2.22.0-' + version);
    assert.equal(preview.channel, 'prerelease');
    assert.equal(packagePresentation(preview).releaseNotesUrl, 'https://github.com/bluecyber81/pixl.js/releases/tag/' + version.toLowerCase());
    assert.equal(new URL(nrfDfuLink(preview)).searchParams.get('file'), 'https://bluecyber81.github.io/pixl.js/firmware/' + preview.file);
  });
}

test('package presentation is explicit local scope and never claims unread storage compatibility',()=>{
 for(const locale of ['de_DE','en_US']){const t=firmwarePackageText(locale);assert.ok(t.scope&&t.unread&&t.limits&&t.empty&&t.local);}
 assert.match(firmwarePackageText('de_DE').unread,/nicht ausgelesen.*keine Gerätekompatibilität/);
 assert.match(firmwarePackageText('en_US').unread,/not read.*does not confirm/);
 assert.deepEqual(packagePresentation(entry,null),packagePresentation(entry));
 assert.deepEqual(packagePresentation(entry),{newer:false,profileMismatch:false,installed:null,releaseNotesUrl:'https://github.com/bluecyber81/pixl.js/releases/tag/de3.53',downloadUrl:'/firmware/'+entry.file,dfuUrl:'/dfu/web.html?package=de3.53-lcd-app'});
});
test('newer application version or CRC-verified counter suppresses downgrade links',()=>{
 for(const firmwareVersion of ['2.22.0-DE3.54','2.23.0-DE3.1','3.0.0-DE3.1','2.27.0','3.0.0'])assert.equal(packagePresentation(entry,{connected:true,firmwareVersion}).newer,true);
 for(const firmwareVersion of ['2.22.0-DE3.52','2.22.0-DE3.53','2.22.0-DE3.30-PREP'])assert.equal(packagePresentation(entry,{connected:true,firmwareVersion}).newer,false);
 const bytes=bootPacket();new DataView(bytes.buffer).setUint32(60,626,true);
 assert.equal(packagePresentation(entry,{connected:true,firmwareVersion:'2.22.0-DE3.52'},parseBootDiagnostics(bytes)).newer,true);
});
test('the LCD final reports incompatible boot details while the older stable profile still works for Z15', () => {
 const { packages } = JSON.parse(readFileSync(new URL('../src/data/firmware-releases.json', import.meta.url)));
 const current = packages.find(p=>p.counter === 648), legacy = packages.find(p=>p.counter === 637);
 const bytes = bootPacket(), view = new DataView(bytes.buffer);
 view.setUint32(64,15,true); view.setUint32(32,7003000,true); view.setUint16(36,294,true);
 bytes.set(Buffer.from('c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade','hex'),80);
 const show = (entry, connected=true) => packagePresentation(entry,{connected},parseBootDiagnostics(bytes));
 assert.equal(show(current).profileMismatch,true); assert.equal(show(legacy).profileMismatch,false);
 assert.equal(show(current,false).profileMismatch,false);
 view.setUint32(64,19,true);
 assert.equal(show(current).profileMismatch,true);
 bytes.set(Buffer.from('51f47a2fae5739d4a59114f7d84e9da10a3ca140f1a558c44685fbe0d97811fd','hex'),80);
 assert.equal(show(current).profileMismatch,false);
 const latest = packages.find(p => p.counter === 653);
 assert.equal(show(latest).profileMismatch, false);
 view.setUint32(64,20,true);
 assert.equal(show(latest).profileMismatch, true);
 bytes.set(Buffer.from('4340d5080aca4205b576c31e7d7b96d5061a4fd3e52a2467e9eb1dabe0c064db','hex'),80);
 assert.equal(show(latest).profileMismatch, false);
 assert.equal(show(current).profileMismatch, true);
 const next = packages.find(p => p.counter === 654);
 assert.equal(show(next).profileMismatch, false);
 view.setUint32(64,21,true);
 assert.equal(show(next).profileMismatch,true);
 bytes.set(Buffer.from('d3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb','hex'),80);
 assert.equal(show(next).profileMismatch,false);
 assert.equal(show(latest).profileMismatch,true);
 view.setUint16(36,259,true); assert.equal(show(next).profileMismatch,true);
});

test('disconnect ignores the former device version and private session fields are not copied',()=>{
 const p=packagePresentation(entry,{connected:false,firmwareVersion:'2.22.0-DE3.99',deviceId:'PRIVATE'});
 assert.equal(p.newer,false);assert.equal(p.installed,null);assert.doesNotMatch(JSON.stringify(p),/PRIVATE/);
});

test('each card links its own catalogue ID and keeps the diagnostics fragment intact', () => {
 const diagnostic = '#read=100&app=637&bl=19&sd=294';
 for (const id of ['de3.65-lcd-app', 'de3.72-lcd-app']) {
   const item = {...entry, id};
   const url = new URL(packagePresentation(item, {dfuReference:diagnostic}).dfuUrl, 'https://example.test');
   assert.equal(url.pathname, '/dfu/web.html');
   assert.deepEqual([...url.searchParams], [['package', id]]);
   assert.equal(url.hash, diagnostic);
 }
});

test('only a named LCD app release can be handed to nRF DFU', () => {
 const app = {...entry, board:'LCD', applicationOnly:true, file:'Allmiibo_LCD_DE3_53_625_NUR_APP.zip'};
 const link = new URL(nrfDfuLink(app));
 assert.deepEqual([...link.searchParams], [['file','https://bluecyber81.github.io/pixl.js/firmware/' + app.file]]);
 for (const changed of [null, {...app, applicationOnly:false}, {...app, board:'OLED'}, {...app, counter:626},
   {...app, file:entry.file}, {...app, id:'de3.65-lcd-app'}, {...app, file:'../test.zip'},
   {...app, file:'https://example.com/firmware.zip'}, {...app, file:app.file + '?device=private'}]) {
   assert.equal(nrfDfuLink(changed),null);
 }
});

test('current LCD download choices respect the installed application, system profile and OLED variant', () => {
 const current = JSON.parse(readFileSync(new URL('../src/data/firmware-releases.json', import.meta.url))).packages[0];
 const bytes = bootPacket(), view = new DataView(bytes.buffer);
 view.setUint32(32,7003000,true); view.setUint16(36,294,true); view.setUint32(60,654,true);
 view.setUint32(64,21,true); bytes.set(Buffer.from('d3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb','hex'),80);
 const choices = (firmwareVersion,boot = parseBootDiagnostics(bytes)) => currentLcdDownloads(current,{connected:true,firmwareVersion},boot);
 assert.deepEqual(currentLcdDownloads(current,{connected:false},null),{app:true,combo:true});
 assert.deepEqual(choices(current.version),{app:true,combo:false});
 assert.deepEqual(choices('2.22.0-DE3.82'),{app:false,combo:false});
 assert.deepEqual(choices('2.22.0-DE3.81-OLEDt1'),{app:false,combo:false});
 for (const version of ['2.22.0-DE3.81-OLEDt2','2.23.0-DE3.91-OLEDt10']) {
   assert.deepEqual(choices(version),{app:false,combo:false});
   assert.equal(packagePresentation(current,{connected:true,firmwareVersion:version}).profileMismatch,true);
   assert.equal(dfuReference(null, 123, version),'#board=OLED');
 }
 assert.deepEqual(choices(current.version,null),{app:false,combo:false});
 view.setUint32(64,15,true);view.setUint32(32,7002000,true);view.setUint16(36,0x0103,true);
 bytes.set(Buffer.from('c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade','hex'),80);
 assert.deepEqual(choices('2.22.0-DE3.60'),{app:false,combo:true});
 assert.deepEqual(choices('2.22.0-DE3.81-OLEDt2'),{app:false,combo:false});
 view.setUint32(28,140,true);
 assert.deepEqual(choices('2.22.0-DE3.60'),{app:false,combo:false});
});
