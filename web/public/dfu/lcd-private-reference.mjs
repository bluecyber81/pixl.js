import {lcdTest683, lcdTest683Package} from './lcd-app683-reference.mjs';
import {lcdTest684, lcdTest684Package} from './lcd-app684-reference.mjs';
// Private LCD packages supplied with this build. No public release is implied.
export const lcdPreviousPreview = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE3.91",
  "applicationCounter": 664,
  "chipPart": 337970,
  "sourceId": "73b80ccea74e28ee846034481edf28262b574187eb5af52f32e41b51aa3203f3",
  "sourceCommit": "6c2167e0444b887b6dcc5d391160dc93e0ba9dc2",
  "validationCommit": "faaff684ef54578db6ddb47e089a6fc3375149cb",
  "applicationBytes": 364128,
  "applicationBinSha256": "1e26b814eabf0789c0903e284a0bbd24bb885a3b2af01e09a25e5ce297073b7a",
  "otaSha256": "b3b0c8f967d3b3886680cfb5049635b5297591c16495dd74e1779654cfd0687e",
  "otaBytes": 253238,
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending"
});
export const lcdPreview665 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE3.92",
  "applicationCounter": 665,
  "chipPart": 337970,
  "sourceId": "49ed45a809f197c9d3b072bf1cb243fd8cf0b62fa55826d2cfeda841afe767b9",
  "sourceCommit": "73df4e3d16f0e51b3bbd3e9bf10387010ed32934",
  "validationCommit": "05028b679591e3d228f2b43c6057e3905f5cca88",
  "otaSha256": "65e9321309dc059b88adc490963c787fdbc01e35e201765b7cbb8d3ecd66e3a0",
  "otaBytes": 365125,
  "applicationBytes": 364524,
  "applicationBinSha256": "10442542d2dd714cfb785d633890c91fd00709bcb1e4dbcf5531cfa3513ba776",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending"
});
// Signed LCD App667 test package; hardware acceptance remains pending.
export const lcdPreview667 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE3.94",
  "applicationCounter": 667,
  "chipPart": 337970,
  "sourceId": "1f5864e1279b7378d3cc685b73d80a3257aad8f6a29db27d1c880800b30c4e90",
  "sourceCommit": "22d5c92cc566fb7da9d43a538f2818d28bfb72a6",
  "validationCommit": "6f7b9c720f640f8487fe009509bb65cb56b5a79a",
  "otaSha256": "f00ddc2c86225d86e5c9ef50bad9d45b84250b287a4f3df4d2f169357a9688c4",
  "otaBytes": 361633,
  "applicationBytes": 361032,
  "applicationBinSha256": "99aa4dbe6f2bba9771b8b51d9e80cc26b4f38a96ad09ee3391ab13ed5fdf676f",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending"
});
// Runtime-only choice for the private updater; the stable release catalogue stays unchanged.
export const lcdPreviewPackage667 = Object.freeze({
  id: 'de3.94-lcd-app',
  version: lcdPreview667.firmwareVersion,
  counter: lcdPreview667.applicationCounter,
  file: 'Allmiibo_LCD_DE3_94_667_NUR_APP.zip',
  bytes: lcdPreview667.otaBytes,
  sha256: lcdPreview667.otaSha256,
  board: lcdPreview667.board,
  storage: 'PFS1',
  bootloader: 'Z21',
  softDevice: 'S112 7.3.0',
  applicationOnly: true,
  migrationRequired: false,
  channel: 'prerelease'
});

// Retained signed App668 application and its exact historical provenance.
export const lcdPreview668 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE3.95",
  "applicationCounter": 668,
  "chipPart": 337970,
  "sourceId": "75dafc809b6e2c883062f7c52d6e418bbabb83d404fde562d057bfab5acf7fec",
  "productionCommit": "2bcb743180e645bdf0d84fa0dc0148a15bd07f00",
  "sourceCommit": "805e445aa072281d8db8645ec80ccae4023c90ba",
  "validationCommit": "08a266ee8072bc75878cdfe533e2dc5b5c22e7ad",
  "otaSha256": "ce2bfa724cec1a7f8a6004c95434ac7fd016af68c7f0bf1f63de280bea47651b",
  "otaBytes": 362593,
  "applicationBytes": 361992,
  "applicationBinSha256": "cf1a310059338da51bc4acdcfc2cb4dd97ddbe6fb63491db6ea7d0de41b59bc9",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending"
});
export const lcdPreviewPackage668 = Object.freeze({
  id: 'de3.95-lcd-app',
  version: lcdPreview668.firmwareVersion,
  counter: lcdPreview668.applicationCounter,
  file: 'Allmiibo_LCD_DE3_95_668_NUR_APP.zip',
  bytes: lcdPreview668.otaBytes,
  sha256: lcdPreview668.otaSha256,
  board: lcdPreview668.board,
  storage: 'PFS1',
  bootloader: 'Z21',
  softDevice: 'S112 7.3.0',
  applicationOnly: true,
  migrationRequired: false,
  channel: 'prerelease'
});

// Retained LCD TEST1: exact signed App669 application and historical provenance.
export const lcdPreview669 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE3.96",
  "applicationCounter": 669,
  "testLabel": "TEST1",
  "chipPart": 337970,
  "sourceId": "dea06409b9ff20a12f446a7baed683b6442573ed427c5dc87cd4bed2885df858",
  "productionCommit": "feb6c58ad14998f31aef07dc84d8dc0732e32ede",
  "sourceCommit": "feb6c58ad14998f31aef07dc84d8dc0732e32ede",
  "localProductionCommit": "6243a79875e8e84e2d24cd7de07111b718dd6131",
  "validationCommit": "de9f457fac652153f71dc08243368f6283e1159c",
  "otaSha256": "021d1a35b00b6cb344702c48df609060e51b55bcecaa9781071d1bcd87829b1f",
  "otaBytes": 363913,
  "applicationBytes": 363312,
  "applicationBinSha256": "32d3a83b0692ea06b65af48c236bcffa4eb3469c0e98e9bb6840965cc1dabb80",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending"
});
export const lcdPreviewPackage669 = Object.freeze({
  id: 'de3.96-lcd-app-test1',
  version: lcdPreview669.firmwareVersion,
  counter: lcdPreview669.applicationCounter,
  file: 'Allmiibo_LCD_DE3_96_669_TEST1_NUR_APP.zip',
  bytes: lcdPreview669.otaBytes,
  sha256: lcdPreview669.otaSha256,
  board: lcdPreview669.board,
  storage: 'PFS1',
  bootloader: 'Z21',
  softDevice: 'S112 7.3.0',
  applicationOnly: true,
  migrationRequired: false,
  channel: 'prerelease'
});
// Current signed LCD TEST1 application. Physical device acceptance is pending.
export const lcdPreview670 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE3.97",
  "applicationCounter": 670,
  "testLabel": "TEST1",
  "chipPart": 337970,
  "sourceId": "b5da931da1f22110ed60d36af7cfdfda090f5191a070acb6e8c550b8b77eddbe",
  "productionCommit": "d34ecb44fa058a149b58de2dcbffbb751c015864",
  "sourceCommit": "d34ecb44fa058a149b58de2dcbffbb751c015864",
  "localProductionCommit": "91364b0b349905bc09351b5b151bf271b03ab850",
  "validationCommit": "898ba1bb46db2e67e3cc6a0216aefa3db4368f70",
  "otaSha256": "ff2c056d66f423afade03a47b730f92033645f0db9d74f946cbafd65734d7786",
  "otaBytes": 364489,
  "applicationBytes": 363888,
  "applicationBinSha256": "2e0db2e1303730d1042bb88619c0f6364f2824d59e306b69fb244b6fc8cbe9b9",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending"
});
export const lcdPreview = lcdPreview670;
export const lcdPreviewPackage670 = Object.freeze({
  id: 'de3.97-lcd-app-test1',
  version: lcdPreview670.firmwareVersion,
  counter: lcdPreview670.applicationCounter,
  file: 'Allmiibo_LCD_DE3_97_670_TEST1_NUR_APP.zip',
  bytes: lcdPreview670.otaBytes,
  sha256: lcdPreview670.otaSha256,
  board: lcdPreview670.board,
  storage: 'PFS1',
  bootloader: 'Z21',
  softDevice: 'S112 7.3.0',
  applicationOnly: true,
  migrationRequired: false,
  channel: 'prerelease'
});
export const lcdPreviewPackage = lcdPreviewPackage670;
export const lcdPreviewPackages = Object.freeze([lcdTest684Package, lcdTest683Package, lcdPreviewPackage670, lcdPreviewPackage669, lcdPreviewPackage668, lcdPreviewPackage667]);
export const lcdPreviews = Object.freeze([lcdTest684, lcdTest683, lcdPreview670, lcdPreview669, lcdPreview668, lcdPreview667, lcdPreview665, lcdPreviousPreview]);
