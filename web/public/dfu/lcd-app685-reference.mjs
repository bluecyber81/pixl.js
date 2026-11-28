// Signed public LCD prerelease. Physical acceptance is tracked separately.
export const lcdTest685 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE4.3-b4",
  "applicationCounter": 685,
  "chipPart": 337970,
  "sourceId": "b4606497ecd38809b56e1c4df24a79cf4e518f58be686065150559097a413d2e",
  "releaseTag": "de4.3-b4-lcd-test1",
  "sourceCommit": "a319dc5ce536bb7c1a0d809763844738e918b6e5",
  "applicationBytes": 360304,
  "applicationBinSha256": "d646c9f2d91aa6218707996c803e92019d9d2ed063e9bb8e57f315690dfdf798",
  "otaBytes": 255383,
  "otaSha256": "c1173f4260c020c94359105591a9b6ef1f6bbd9c24e73e3956f802472156db38",
  "engineSha256": "31ed856ea31124372012bbdf26bda98db4855783cfe9f4325911cc307de375ae",
  "wasmSha256": "f0746c06cf8c82578460335737eb54a7a5b8f4f14832155bea03ab7661e71607",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "dfu-and-short-upload-content-raw128-and-stack-readback-on-one-lcd"
});
export const lcdTest685Package = Object.freeze({
  id:'de4.3-b4-lcd-app-test', version:lcdTest685.firmwareVersion, counter:lcdTest685.applicationCounter,
  file:'Allmiibo_LCD_DE4_3_b4_App685_NUR_APP_TEST.zip', bytes:lcdTest685.otaBytes, sha256:lcdTest685.otaSha256,
  board:'LCD', storage:'PFS1', bootloader:'Z21', softDevice:'S112 7.3.0',
  applicationOnly:true, migrationRequired:false, channel:'prerelease'
});
