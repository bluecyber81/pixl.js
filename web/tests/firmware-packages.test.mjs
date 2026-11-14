import test from 'node:test';
import assert from 'node:assert/strict';
import { packagePresentation,firmwarePackageText } from '../src/lib/release-packages.js';
import { parseBootDiagnostics } from '../src/lib/boot-diagnostics.js';
import { nrfDfuLink } from '../public/dfu/nrf-dfu-link.mjs';
import { readFileSync } from 'node:fs';
import bootPacket from './boot-fixture.cjs';
const entry={id:'de3.53-lcd-app',version:'2.22.0-DE3.53',counter:625,file:'Allmiibo_LCD_DE3_53_625_TESTSTAND.zip'};

test('the signed test package reaches Android and is compared when only the device version is available', () => {
  const { packages } = JSON.parse(readFileSync(new URL('../src/data/firmware-releases.json', import.meta.url)));
  const candidate = packages.find(item => item.version === '2.22.0-DE3.74');
  assert.equal(candidate.channel, 'prerelease');
  const android = new URL(nrfDfuLink(candidate));
  assert.equal(android.searchParams.get('file'), 'https://bluecyber81.github.io/pixl.js/firmware/' + candidate.file);
  for (const changed of [{applicationOnly:false}, {file:'../' + candidate.file}, {counter:644}]) {
    assert.equal(nrfDfuLink({...candidate, ...changed}), null);
  }
  assert.equal(packagePresentation(packages[0], {connected:true, firmwareVersion:candidate.version}).newer, true);
  assert.equal(packagePresentation(candidate, {connected:true, firmwareVersion:'2.22.0-DE3.75'}).newer, true);
  assert.equal(packagePresentation(candidate).releaseNotesUrl,'https://github.com/bluecyber81/pixl.js/releases/tag/de3.74');
  assert.deepEqual(packages.map(item=>item.counter),[637,647,646,645]);
});
test('package presentation is explicit local scope and never claims unread storage compatibility',()=>{
 for(const locale of ['de_DE','en_US']){const t=firmwarePackageText(locale);assert.ok(t.scope&&t.unread&&t.limits&&t.empty&&t.local);}
 assert.match(firmwarePackageText('de_DE').unread,/nicht ausgelesen.*keine Gerätekompatibilität/);
 assert.match(firmwarePackageText('en_US').unread,/not read.*does not confirm/);
 assert.deepEqual(packagePresentation(entry,null),packagePresentation(entry));
 assert.deepEqual(packagePresentation(entry),{newer:false,installed:null,releaseNotesUrl:'https://github.com/bluecyber81/pixl.js/releases/tag/de3.53',downloadUrl:'/firmware/'+entry.file,dfuUrl:'/dfu/web.html?package=de3.53-lcd-app'});
});
test('newer application version or CRC-verified counter suppresses downgrade links',()=>{
 for(const firmwareVersion of ['2.22.0-DE3.54','2.23.0-DE3.1','3.0.0-DE3.1','2.27.0','3.0.0'])assert.equal(packagePresentation(entry,{connected:true,firmwareVersion}).newer,true);
 for(const firmwareVersion of ['2.22.0-DE3.52','2.22.0-DE3.53','2.22.0-DE3.30-PREP'])assert.equal(packagePresentation(entry,{connected:true,firmwareVersion}).newer,false);
 const bytes=bootPacket();new DataView(bytes.buffer).setUint32(60,626,true);
 assert.equal(packagePresentation(entry,{connected:true,firmwareVersion:'2.22.0-DE3.52'},parseBootDiagnostics(bytes)).newer,true);
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
