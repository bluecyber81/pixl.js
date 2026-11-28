// Signed public LCD prerelease. Physical acceptance is tracked separately.
export const lcdTest684 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE4.3-b3",
  "applicationCounter": 684,
  "chipPart": 337970,
  "sourceId": "34fd944f230d602740b34928d6f52be3e73c8fc2895bc7c002691ea8d36d6576",
  "releaseTag": "de4.3-b3-lcd-test1",
  "sourceCommit": "07f6e49259a720df140348aba49d47c523c8faa2",
  "applicationBytes": 360432,
  "applicationBinSha256": "8e361c6baafc79af23c02c9155e3ca80f1796c502206c5fe364612d71fa6221c",
  "otaBytes": 265216,
  "otaSha256": "30978b023a7f55f8f36a3885a00e761edc003ff8a0d444274c8aac924166654b",
  "engineSha256": "1dcaa2112e4bc09c3080da8aeba61e65a559ebb4bc8466b02d766c98a6e304bf",
  "wasmSha256": "ed5cfc06ee287cfc746c6730192db4a2466734d2fccc9d3d36d555b1c47f2bbd",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "dfu-and-short-upload-content-and-raw128-readback-on-one-lcd"
});
export const lcdTest684Package = Object.freeze({
  id:'de4.3-b3-lcd-app-test', version:lcdTest684.firmwareVersion, counter:lcdTest684.applicationCounter,
  file:'Allmiibo_LCD_DE4_3_b3_App684_NUR_APP_TEST.zip', bytes:lcdTest684.otaBytes, sha256:lcdTest684.otaSha256,
  board:'LCD', storage:'PFS1', bootloader:'Z21', softDevice:'S112 7.3.0',
  applicationOnly:true, migrationRequired:false, channel:'prerelease'
});
