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
const latestReference = Object.freeze({
  ...TEST_FIRMWARE_REFERENCE, firmwareVersion: '2.22.0-DE3.72', applicationCounter: 645,
  applicationBytes: 363340, applicationBinSha256: '000651a423e35821e529815a87930137f2d56277941b1b900fccb699d51ecb88',
  sourceId: 'd1a80a8a13b9e0bd8f1513216e268bb0694e9a74ff52986aaa65a1ee7f893b6d', otaSha256: 'e002d6c7952be898bdaafc691e9e92b40ad1c34681b93f5029b85358a3a57adc', hardwareAcceptance: 'pending',
});
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
  const reference = version === TEST_FIRMWARE_REFERENCE.firmwareVersion ? TEST_FIRMWARE_REFERENCE : latestReference;
  const relation = version === null ? 'unknown' : version !== reference.firmwareVersion ? 'different-version'
    : observed.applicationCounter === null ? 'version-only' : observed.applicationCounter === reference.applicationCounter ? 'version-and-counter' : 'different-counter';
  return { schemaVersion: 1, observed, packageReference: reference, referenceRelation: relation,
    applicationHashVerified: false, samePhysicalDeviceVerified: false };
}
