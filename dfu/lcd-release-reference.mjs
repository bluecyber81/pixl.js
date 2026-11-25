// Signed normal LCD release. The App677 field report and App678 software validation have separate scopes.
export const lcdRelease = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE4.1",
  "applicationCounter": 678,
  "firmwareChannel": "normal",
  "chipPart": 337970,
  "sourceId": "e8b24c067a7ead279a12720b0ffe6ef4f4678e1f0c8b329859c883a53f007f6c",
  "productionCommit": "2437a3a4cf15afbc108ae66b28cec03f29da8602",
  "sourceCommit": "2437a3a4cf15afbc108ae66b28cec03f29da8602",
  "productionTree": "125d9ad4d63a5f8cb8ef78ae4fa09127ec3c5bf7",
  "localProductionCommit": "2437a3a4cf15afbc108ae66b28cec03f29da8602",
  "otaSha256": "beb7cf682084a40776f85e29bba228590e02a8a5ebb94fd648b03800db0e03e0",
  "otaBytes": 255266,
  "applicationBytes": 362724,
  "applicationBinSha256": "2cc4a74619996d8c569223085b858515681c99810e623196519338fcdcb6f888",
  "artifactStatus": "stable-signed-application",
  "hardwareAcceptance": "app677-owner-confirmed-on-one-lcd-app678-device-test-pending",
  "releaseTag": "de4.1"
});
export const lcdReleasePackage = Object.freeze({
  "id": "de4.1-lcd-app",
  "version": "2.22.0-DE4.1",
  "counter": 678,
  "file": "Allmiibo_LCD_DE4_1_678_NUR_APP.zip",
  "bytes": 255266,
  "sha256": "beb7cf682084a40776f85e29bba228590e02a8a5ebb94fd648b03800db0e03e0",
  "board": "LCD",
  "storage": "PFS1",
  "bootloader": "Z21",
  "softDevice": "S112 7.3.0",
  "applicationOnly": true,
  "migrationRequired": false
});
