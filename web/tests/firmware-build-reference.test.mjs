import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticBuildIdentity } from '../src/lib/firmware-build-reference.js';

const releases = [
  {version:'2.22.0-DE4.2-b2', counter:680,
    sourceId:'16425b76fc84dc65bd9893d1d8337741abbf0fa8e4fc1aa3545183fb57fe600e',
    binSha256:'b1b560b945f6a4b4cb66d1d67580695c732ec460950fbe1b903b6d94baab3f08'},
  {version:'2.22.0-DE4.2-b1', counter:679,
    sourceId:'4765a2b88d7a9e4af396ab1d83318f1124423df69d13fd3e3ca2326b93d774c6',
    binSha256:'320863d4a3d140cc6082ec827cee2ddbfd1ec55ec37509305d195ecb9183a93e'},
  {version:'2.22.0-DE3.100', counter:673,
    sourceId:'33d41ccf675ff8b359cd616fbc66376de9df76d73f0896a61ab9ea0ce7a50778',
    binSha256:'ef1f80f943a07aabd5770ad1f5eb09f93d16051dcc6238368e6c4719d69ef52e'},
  {version:'2.22.0-DE3.101', counter:674,
    sourceId:'894ab79ff45ee5c342d4fed11b6970fa0a60f21697216d4e876f488b4ba320f6',
    binSha256:'95161b30161e803275afe58b8f13193fe0421f6d2d34e5685840b15075a50052'},
  {version:'2.22.0-DE3.102', counter:675,
    sourceId:'9f60aa974f975a552762605d68d0f0e32ad6676f392b12173856177535a5ba46',
    binSha256:'28050b4e64400586f1a9d9aff94266887291c7be07c65ba32c390fec60ea2c06'},
];

for (const reference of releases) test(`App${reference.counter} diagnostics keep the correct package reference without claiming a measured device BIN`, () => {
  const request = {firmwareVersion:reference.version,
    boot:{settingsCrcValid:true, applicationCounter:reference.counter},
    build:{schemaVersion:1, board:'LCD', sourceId:reference.sourceId, previousFault:null}};
  const identity = diagnosticBuildIdentity(request);
  assert.equal(identity.packageReference.firmwareVersion, reference.version);
  assert.equal(identity.packageReference.applicationCounter, reference.counter);
  assert.equal(identity.packageReference.applicationBinSha256, reference.binSha256);
  assert.equal(identity.referenceRelation, 'version-and-counter');
  assert.equal(identity.firmwareReportedSourceRelation, 'matches-package');
  assert.equal(identity.observed.applicationBinSha256, null);
  assert.equal(identity.applicationHashVerified, false);
  assert.equal(identity.samePhysicalDeviceVerified, false);
  assert.equal(diagnosticBuildIdentity({...request, boot:{settingsCrcValid:false, applicationCounter:reference.counter}}).referenceRelation, 'version-only');
  assert.equal(diagnosticBuildIdentity({...request, boot:{settingsCrcValid:true, applicationCounter:reference.counter+1}}).referenceRelation, 'different-counter');
  assert.equal(diagnosticBuildIdentity({...request, build:{...request.build, sourceId:'f'.repeat(64)}}).firmwareReportedSourceRelation, 'differs-from-package');
  assert.equal(diagnosticBuildIdentity({...request, build:{...request.build, board:'OLED'}}).observed.sourceId, null);
});

test('future and OLED versions never inherit the App675 package or its declared source match', () => {
  for (const version of ['2.22.0-DE3.105', '2.22.0-DE3.101-OLEDt7']) {
    const identity = diagnosticBuildIdentity({firmwareVersion:version, boot:{settingsCrcValid:true, applicationCounter:675},
      build:{schemaVersion:1, board:'LCD', sourceId:releases[2].sourceId, previousFault:null}});
    assert.notEqual(identity.packageReference?.applicationCounter, 675);
    assert.equal(identity.observed.sourceId, null);
    assert.notEqual(identity.firmwareReportedSourceRelation, 'matches-package');
  }
});
