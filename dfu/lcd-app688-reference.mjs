// Signed public LCD prerelease. Physical acceptance is tracked separately.
export const lcdTest688 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE4.3-b7",
  "applicationCounter": 688,
  "chipPart": 337970,
  "sourceId": "c9a228d7ebfc56211e6e827b2ce324a2754063b97e595b1a94d47dddf1b37c5f",
  "releaseTag": "de4.3-b7-lcd-test1",
  "sourceCommit": "d98d717418f452cc857e62547e33f1f1dee47625",
  "applicationBytes": 360300,
  "applicationBinSha256": "da40664743ac6565ed237bae876555b5bf68a886c9f7ea29a3ffcea89c4b2986",
  "otaBytes": 255250,
  "otaSha256": "60bc4a8f4af9fda3cb5ab5622f0fe2c95fd454a957a7b716b3dafbaa36a4f31b",
  "engineSha256": "2265f1d8817d3f9b616d9920588154046dbeae8796c11944b40af688ef8638ac",
  "wasmSha256": "b29a4dffedcd33462d64233e05a9c009a8c96b2e2bdd18e86158cb041a7fe359",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "dfu-and-short-upload-content-raw128-and-stack-readback-on-one-lcd"
});
export const lcdTest688Package = Object.freeze({
  id:'de4.3-b7-lcd-app-test', version:lcdTest688.firmwareVersion, counter:lcdTest688.applicationCounter,
  file:'Allmiibo_LCD_DE4_3_b7_App688_NUR_APP_TEST.zip', bytes:lcdTest688.otaBytes, sha256:lcdTest688.otaSha256,
  board:'LCD', storage:'PFS1', bootloader:'Z21', softDevice:'S112 7.3.0',
  applicationOnly:true, migrationRequired:false, channel:'prerelease'
});
