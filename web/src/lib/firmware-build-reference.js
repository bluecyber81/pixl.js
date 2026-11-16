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
const references = [TEST_FIRMWARE_REFERENCE, app645, app646, app647, app648, app649, app650];
const word = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function diagnosticBuildIdentity({ firmwareVersion, boot } = {}) {
  const version = typeof firmwareVersion === 'string' && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,48})?$/.test(firmwareVersion) ? firmwareVersion : null;
  const observed = { firmwareVersion: version,
    applicationCounter: boot?.settingsCrcValid === true && word(boot.applicationCounter) ? boot.applicationCounter : null,
    chipPart: boot?.geometryValid === true && word(boot.chipPart) ? boot.chipPart : null,
    chipVariantRaw: boot?.geometryValid === true && word(boot.chipVariantRaw) ? boot.chipVariantRaw : null,
    flashBytes: boot?.geometryValid === true && word(boot.flashBytes) ? boot.flashBytes : null,
    ramBytes: boot?.geometryValid === true && word(boot.ramBytes) ? boot.ramBytes : null,
    bootRegionSha256: boot?.bootHashValid === true && /^[a-f0-9]{64}$/.test(boot.bootRegionSha256 || '') ? boot.bootRegionSha256 : null,
    sourceId: null, applicationBinSha256: null, uniqueDeviceId: null };
  const reference = references.find(item => item.firmwareVersion === version) ?? app648;
  const relation = version === null ? 'unknown' : version !== reference.firmwareVersion ? 'different-version'
    : observed.applicationCounter === null ? 'version-only' : observed.applicationCounter === reference.applicationCounter ? 'version-and-counter' : 'different-counter';
  return { schemaVersion: 1, observed, packageReference: reference, referenceRelation: relation,
    applicationHashVerified: false, samePhysicalDeviceVerified: false };
}
