import { buildDiagnosticBoard, normalizeBuildDiagnostics } from './lcd-build-diagnostics.js';
import { firmwareBoard } from './hardware-profile.js';

// Reference for the signed T1 application package. This is not a
// hash read from the connected device and does not qualify a storage layout.
export const TEST_FIRMWARE_REFERENCE = Object.freeze({
  firmwareVersion: '2.22.0-DE3.71t1', applicationCounter: 644,
  board: 'LCD', chipPart: 0x52832, applicationBytes: 363292,
  applicationBinSha256: 'fbade80d03a44a3bb3bb7e76df422b24a879d2ff81b433e6bf4f6d6e1b955273',
  sourceId: '3c62a24a8aecab7a81af6b73cb86642d4a248755d739c5e37b1fcdeea7451d02',
  artifactStatus: 'experimental-signed-application', hardwareAcceptance: 'first-device-run-reported',
  otaSha256: 'e3ff29fa751333a2acaec9a94f24455c0d7105d337b41f17d430d1021b065fcb',
});
const app645 = Object.freeze({
  ...TEST_FIRMWARE_REFERENCE, firmwareVersion: '2.22.0-DE3.72', applicationCounter: 645,
  applicationBytes: 363340, applicationBinSha256: '000651a423e35821e529815a87930137f2d56277941b1b900fccb699d51ecb88',
  sourceId: 'd1a80a8a13b9e0bd8f1513216e268bb0694e9a74ff52986aaa65a1ee7f893b6d', otaSha256: 'e002d6c7952be898bdaafc691e9e92b40ad1c34681b93f5029b85358a3a57adc', hardwareAcceptance: 'pending',
});
const app646 = Object.freeze({
  ...app645, firmwareVersion: '2.22.0-DE3.73', applicationCounter: 646,
  applicationBytes: 364092, applicationBinSha256: '5d8937db3482c777cd9f768bf15ecedf909adff9dd094446809faa0a3a045ddb',
  sourceId: '53e1fb72f45fdd0b8ed8bef3c11752c90c4198ae15bf79fc5ca3d97071ea05d0', otaSha256: 'e23432be1eafff9e9bb0626fc3facd3c797b9840934094e8b4e7fff48dfb42fe',
});
const app647 = Object.freeze({
  ...app646, firmwareVersion: '2.22.0-DE3.74', applicationCounter: 647,
  applicationBytes: 364460, applicationBinSha256: '71d1771919c6db0589c37f6a0568bfb445ecb776e993e2034fc10be4c7b7eead',
  sourceId: 'b5793142353e600e8511ecc62a54ff9da5d568a650d5de680adeef5c1fb6654e', otaSha256: '58c07409e502ae13934da8b1ba4b788514e5d6a99f2040f47b8b2c396d35bdc6',
  artifactStatus: 'stable-signed-application', hardwareAcceptance: 'remote-display-photo-confirmed-on-one-lcd',
});
const app648 = Object.freeze({...app647, firmwareVersion:'2.22.0-DE3.75', applicationCounter:648,
  applicationBytes:358304, applicationBinSha256:'3593cfc6e2dfc517a14e76f1802adf580148818cb41ba86a5739fc3c9ca41867',
  sourceId:'9bc7578a46f27d54088ddd222198ce582f9cc3fdcf45a8e9a7da6d596b47c62c', otaSha256:'603d99133331fdb425647e27106b043f9f7f3347e889475153bfe7e828f1dafd',
  artifactStatus:'stable-signed-application', hardwareAcceptance:'list-return-wake-and-known-figure-on-switch-confirmed-on-one-lcd',
});
const app649 = Object.freeze({
  ...app648, firmwareVersion: '2.22.0-DE3.76', applicationCounter: 649,
  applicationBytes: 362188, applicationBinSha256: '3e3899226d773b9f664400efdf536eb6bc1cea1fe61277218b63e730d29aed2a',
  sourceId: '3f52580f386f753be828ca86437b98adbba3c9b609954e8c04fa90194eb3b497', otaSha256: '41d07d2b4d4ca6092432beb5573a5c43e801cfa69f26499aadbae284991bd585',
  artifactStatus: 'experimental-signed-application', hardwareAcceptance: 'pending',
});
const app650 = Object.freeze({
  ...app649, firmwareVersion: '2.22.0-DE3.77', applicationCounter: 650,
  applicationBytes: 362588, applicationBinSha256: 'e8ff7f50571c988f2ade44fad601b00edd7f0e6c90fd880711fed0cb7d9cf055',
  sourceId: 'f848da982334f0f8a8e634b85efa521388475e8801a6746617288546f2e26219', otaSha256: '72e30a092424e4414014b508c39f143f5896d11362719cd53ffb66c2b12f73f3',
  artifactStatus: 'experimental-signed-application', hardwareAcceptance: 'pending',
});
const app652 = Object.freeze({
  ...app650, firmwareVersion: '2.22.0-DE3.79', applicationCounter: 652,
  applicationBytes: 362652, applicationBinSha256: 'd7d09513ae197c27ffce76707f8f764bf08568b1abd1372beaaa85e26d1eff0f',
  sourceId: 'd2c476908399374779b2666bdf07e4907f19680f50d466bccc8080ecd73c2a94', otaSha256: '161b568441db51b7579e5966a9b839d621cb5f9d9af22b6ed95811c5f84e4d14',
  artifactStatus: 'experimental-signed-application', hardwareAcceptance: 'pending',
});
const app653 = Object.freeze({
  ...app652, firmwareVersion: '2.22.0-DE3.80', applicationCounter: 653,
  hardwareAcceptance: 'startup-and-system-readback-on-one-lcd',
  applicationBytes: 362652, applicationBinSha256: '34bb85efbf2fc1e5429ce09361aa2b39831d252f9fad80de425c6a992b78cfb8',
  sourceId: 'ca55c5555307609be7ab5e7e202b0af00a2609d69df7e7a1f6d5f35a2d46bf13', otaSha256: 'caea5f63c47d47b18fdd6484ecc8adc7d0bd0dcd392f83db290185e4f0c73342',
});

const app654 = Object.freeze({
  ...app653, firmwareVersion: '2.22.0-DE3.81', applicationCounter: 654, artifactStatus: 'stable-signed-application',
  hardwareAcceptance: 'startup-and-system-readback-on-one-lcd',
  applicationBytes: 362892, applicationBinSha256: '632c29cb9408bcd390d887db36f81b350b2d514b4252f00e674ceb972293e918',
  sourceId: '85f0947a00471b74b45c86ccdd7ade4f7ba8269fc75e56974481fd61fd6e109a', otaSha256: '6a7aa822329e5e703e120234e0161f7d0f49576255aba38e601bd8f5fadc5719',
});

const app655 = Object.freeze({
  ...app654, firmwareVersion: '2.22.0-DE3.82', applicationCounter: 655,
  applicationBytes: 362904, applicationBinSha256: 'e08ec6c3f343750bde9689f0ba70f0d679a734a69dc8a426dd354183ea5c163e',
  sourceId: '15ad6fabb547dec243cc4e5cbc6079bbfc7ba178ca9746203068b113da8042da', otaSha256: '8694f0b45298b8c8b8dbb1f3b3a713753e91d12507eab759fb120f1bee030c51',
  artifactStatus: 'experimental-signed-application', hardwareAcceptance: 'pending',
});

const app656 = Object.freeze({
  ...app655, firmwareVersion: '2.22.0-DE3.83', applicationCounter: 656,
  applicationBytes: 355312, applicationBinSha256: 'dc4a1440b20a0ddff202ee6739490ca5faf3bf1f6dcb245039b6d773b0665183',
  sourceId: '7a51f763495dc22382b6b5f0f5714a5c36baf4d0d274917abc58ec7314d7a9e8', otaSha256: 'de436078c20dd402c7ffa821f31a74a14fdbd28d5c861cecac6cdc74892a1516',
});

const app657 = Object.freeze({
  ...app656, firmwareVersion: '2.22.0-DE3.84', applicationCounter: 657,
  releaseTag: 'de3.84-lcd-test1', sourceCommit: '55e3c42836452830421b559b6fc3659b826dc43b',
  ownerReport: Object.freeze({ date: '2026-11-17', result: 'user-reported-passed', reportedBootloaderCounter: 21,
    scope: 'general-practical-use-on-one-lcd', interruptedDfuResume: 'not-individually-reported' }),
  applicationBytes: 356216, applicationBinSha256: 'b98eb45868a5bb80e6b770569a8402678d4a326b927820341ab728cf78e8f323',
  sourceId: 'f9bda1ff3428d344eb7cb5de2052158d40f5474e08c03f4597b67ba229e30221', otaSha256: '6ad764feacd8f2a3b411f7606f24cdb414a5b659057d4072b1357195975accc4',
});

const oledTest1 = Object.freeze({
  firmwareVersion: '2.22.0-DE3.81-OLEDt1', applicationCounter: 81, board: 'OLED', chipPart: 0x52832,
  applicationBytes: 363240, applicationBinSha256: '5e556b10359ad4815f150b22ac7f045412df99d3b0cd0cebfa8b114843314df8',
  sourceId: 'b678f9812f7e9de4f971a9adf712e3b74242b2b00e9f03f5ed14869d73f27658',
  artifactStatus: 'experimental-signed-application', hardwareAcceptance: 'first-device-run-reported',
  otaSha256: '2806b64ff5a8c0f1342abaf33ca1a79a1773b6101d410ccc97e498f1c9f37d33',
});

const oledTest2 = Object.freeze({
  ...oledTest1, firmwareVersion: '2.22.0-DE3.81-OLEDt2', applicationCounter: 82, hardwareAcceptance: 'pending',
  applicationBinSha256: 'd4b4a7693beb9c98dfac406c46d2eaebf4fb3c31743b0d7ebedc8971c16decee',
  sourceId: '3d03b5ef8b785f6e4550fd2d569c9cd77bd6b1108421e09888483a8a368b7a61', otaSha256: 'ab3278830f2896d4a51cbe3235bb78bfeb20cda16a83cbfac983d8f15bc29b8f',
});
const oledTest3 = Object.freeze({
  ...oledTest2, firmwareVersion: '2.22.0-DE3.81-OLEDt3', applicationCounter: 83, applicationBytes: 357144,
  applicationBinSha256: '7fdfb63158015b1b914679cb07644691926136a46bebd2882d7d0f177394cd0e',
  sourceId: 'b283257873690dd40845d6ba4628a88f8066a7b45f682b6190cd0c152b295a22', otaSha256: 'fd0418d4d503d1ac168909af66912c0e97cf98aef8936d29542c95d396378820',
});

const oledTest4 = Object.freeze({
  ...oledTest3, firmwareVersion: '2.22.0-DE3.84-OLEDt4', applicationCounter: 84, applicationBytes: 359456,
  releaseTag: 'de3.84-oled-t4', sourceCommit: 'cb784c14f96570f6c677b6a6edff2dd66990403c',
  applicationBinSha256: '2ae048eab497e1e0dda54192b054fd2afd2628367a886b73cb8e09a9711e83a6',
  sourceId: '611c8702693cdb276036f5b1e15403dd64b8cdfeb9ce05f5b57e6ad28392b359',
  otaSha256: '8a4addb91ddf95e37493ab624ebd0c414187bb56ec9d9886a216a1d18b54b5f7',
});

const oledTest5 = Object.freeze({
  ...oledTest4, firmwareVersion: '2.22.0-DE3.85-OLEDt5', applicationCounter: 85, applicationBytes: 360652,
  releaseTag: 'de3.85-oled-t5', sourceCommit: '605aa6c6cb2eb0a61dbd8385004181f2aeae75e7',
  applicationBinSha256: 'e403e5afe50e9dc47e27ef2c1292144f905481f20f2ddfbab639b38707a1c050',
  sourceId: 'fe3647d69c2c418da2eec528bd09812916fbd3a6d0157be27a515941b6962a13',
  otaSha256: '16e019fde2cd5283a462bba31fe4ee65fafc7dcddaa7c4bccd200f334af26a1f',
});

const oledTest6 = Object.freeze({
  firmwareVersion: '2.22.0-DE3.87-OLEDt6', applicationCounter: 86, board: 'OLED', chipPart: 0x52832,
  artifactStatus: 'experimental-signed-application', hardwareAcceptance: 'pending',
  releaseTag: 'de3.87-oled-t6', applicationBytes: 363412, sourceCommit: 'ca383d3474893c13abc607d5a59084c7e8769e99',
  applicationBinSha256: '0db0ac96e8b58170f630b1ecbede44fed5b750db19eaee195ac49cbfc2227c3a',
  sourceId: '8003b29ac91fdf213ace90b5fc74274ce04cf84661d7d3c5f53bb0ed9a8115f0',
  otaSha256: 'eaf4e645a04521268d4e39f03f5448048d43c7b66a5a5b9f48bcee91db2abaa8',
});

const app658 = Object.freeze({
  "firmwareVersion": "2.22.0-DE3.85",
  "applicationCounter": 658,
  "board": "LCD",
  "chipPart": 337970,
  "applicationBytes": 358160,
  "applicationBinSha256": "46ea9df4be00107f967d751ceffe0679bd74fa7315caf46cc566938cf868a9bb",
  "sourceId": "eff9ff254509ccacef1650fbbf51d595f82df1d094c912dbf2655d76e5bee08f",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "owner-reported-on-one-lcd",
  ownerReport: Object.freeze({ date: "2026-11-18", result: "user-reported-passed", reportedBootloaderCounter: 21, scope: "general-practical-use-on-one-lcd" }),
  "otaSha256": "a7f8b4aa6e01469c88433e40437618f199a47421e6a602e92c72eac0862fb411",
  "releaseTag": "de3.85-lcd-test1",
  "sourceCommit": "083e024864cf7099f31e964c0d25d4819b0c440d"
});

const app659 = Object.freeze({
  "firmwareVersion": "2.22.0-DE3.86",
  "applicationCounter": 659,
  "board": "LCD",
  "chipPart": 337970,
  "applicationBytes": 359336,
  "applicationBinSha256": "431f211ff87825fb6df6bc5f6d2ae4a23f3ad275126d91d579b16fc717d17a65",
  "sourceId": "2ed6d92c59935cafa916843b579743fabd501a3ef8dcb929e47cd2692abf9f52",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending",
  "otaSha256": "af7c277a7cd6ac9935b747ff08496d61b5e7335f8c9601bbbc51f0c720f3aa58",
  "sourceCommit": "4111937e432ecec6adc989c9a51fa0fd37e960bf"
});

const app660 = Object.freeze({
  "firmwareVersion": "2.22.0-DE3.87",
  "applicationCounter": 660,
  "board": "LCD",
  "chipPart": 337970,
  "applicationBytes": 360728,
  "applicationBinSha256": "2d9f35be88f6d5c258743a9c832c4993476bbdd6095d2c9fb4f741e20ec1290e",
  "sourceId": "0c497705163e238ac7dce5fb1ff299daa10cacf223ced3e9f19a1d0a7c2ae0ac",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending",
  "otaSha256": "8095ffe24d75dae91ba0b1dbb81dcc974cd6cdc73807d329002866d7393e82a0",
  "sourceCommit": "bda84eedd040d81b7362bf0cb5df19d14dbcd05b"
});

const app661 = Object.freeze({
  "firmwareVersion": "2.22.0-DE3.88",
  "applicationCounter": 661,
  "board": "LCD",
  "chipPart": 337970,
  "applicationBytes": 363608,
  "applicationBinSha256": "65ad4ae6946b2b9b1bb7ce025d4f8c6b035ec58016a05870bb1bf7639cfc7f47",
  "sourceId": "109484b3d03f25b4578010b0b9e22b3829287d3edc6aacfbcac2aa0f1ebdf6d8",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "folder-transfer-and-resume-on-one-lcd",
  "hardwareEvidence": {"files":128,"zipContentsByteVerified":true},
  "otaSha256": "75543dc92ca18d55a81f8070a5ac72f58195419510bba893d7540b343b8fe2c0",
  "sourceCommit": "2729ec3929fd12b4477bf6bd4e3b50f8eb30f315",
  "releaseTag": "de3.88-lcd-test1"
});

const app662 = Object.freeze({
  "firmwareVersion": "2.22.0-DE3.89",
  "applicationCounter": 662,
  "board": "LCD",
  "chipPart": 337970,
  "applicationBytes": 363752,
  "applicationBinSha256": "401e9517ad3c199b48122caadcec86a72e15bb3ada491cea1b3d1342b34983ec",
  "sourceId": "9596188378370a23812bb16e914dd7b47847e375cfd63e56279d8ffa9bbdf2e7",
  "artifactStatus": "stable-signed-application",
  "hardwareAcceptance": "owner-reported-general-use-and-system-readback-on-one-lcd",
  "otaSha256": "366686156e8b8c369018082e3a6e4743c0f3f4a416e416229b7b520308d6a4ab",
  "sourceCommit": "fecc8b750288f1028f109067dad9694c9f2c3628",
  "releaseTag": "de3.89"
});

const references = [app662, app661, app660, app659, app658, TEST_FIRMWARE_REFERENCE, app645, app646, app647, app648, app649, app650, app652, app653, app654, app655, app656, app657, oledTest1, oledTest2, oledTest3, oledTest4, oledTest5, oledTest6];
const word = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function diagnosticBuildIdentity({ firmwareVersion, boot, build } = {}) {
  const version = typeof firmwareVersion === 'string' && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,48})?$/.test(firmwareVersion) ? firmwareVersion : null;
  const board = buildDiagnosticBoard(version);
  const reported = board ? normalizeBuildDiagnostics(build, board) : null;
  const observed = { firmwareVersion: version,
    applicationCounter: boot?.settingsCrcValid === true && word(boot.applicationCounter) ? boot.applicationCounter : null,
    chipPart: boot?.geometryValid === true && word(boot.chipPart) ? boot.chipPart : null,
    chipVariantRaw: boot?.geometryValid === true && word(boot.chipVariantRaw) ? boot.chipVariantRaw : null,
    flashBytes: boot?.geometryValid === true && word(boot.flashBytes) ? boot.flashBytes : null,
    ramBytes: boot?.geometryValid === true && word(boot.ramBytes) ? boot.ramBytes : null,
    bootRegionSha256: boot?.bootHashValid === true && /^[a-f0-9]{64}$/.test(boot.bootRegionSha256 || '') ? boot.bootRegionSha256 : null,
    sourceId: reported?.sourceId ?? null, ...(reported ? {compiledBoard:reported.board} : {}), applicationBinSha256: null, uniqueDeviceId: null };
  const reference = references.find(item => item.firmwareVersion === version) ?? (firmwareBoard(version) === 'OLED' ? null : app662);
  const relation = !reference ? 'no-package-reference' : version === null ? 'unknown' : version !== reference.firmwareVersion ? 'different-version'
    : observed.applicationCounter === null ? 'version-only' : observed.applicationCounter === reference.applicationCounter ? 'version-and-counter' : 'different-counter';
  const sourceRelation = reported && reference?.firmwareVersion === version
    ? reported.sourceId === reference.sourceId && reported.board === reference.board ? 'matches-package' : 'differs-from-package'
    : null;
  return { schemaVersion: 1, ...(reported ? {firmwareReportedSourceRelation:sourceRelation} : {}), observed, packageReference: reference, referenceRelation: relation,
    applicationHashVerified: false, samePhysicalDeviceVerified: false };
}
