// Signed public LCD prerelease. Physical acceptance is tracked separately.
export const lcdTest683 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE4.3-b2",
  "applicationCounter": 683,
  "chipPart": 337970,
  "sourceId": "c84218c83bd51f0b7683e81e62e438067b0ede49f512441db24a6d6a803838f5",
  "releaseTag": "de4.3-b2-lcd-test1",
  "sourceCommit": "177b95773f2379eb0af2deac57d6b3fee5ac224e",
  "applicationBytes": 360176,
  "applicationBinSha256": "5fb6acbf67fafadce590c71174d9aec8bf1aeaeecb5037c0d08eb09d22bba80c",
  "otaBytes": 255217,
  "otaSha256": "6ca4c5c7184ebe303812185026969f69b704b88171e320fb2ac08c19f6e6a36b",
  "engineSha256": "9eef0104dc2603b0933e0174b8a12443bafc7353f884cc9f84cca23c90a595b1",
  "wasmSha256": "0ef1d368a648f325d70001a079e733250445777be29d1e470237b8762c96cf3b",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "pending"
});
export const lcdTest683Package = Object.freeze({
  id:'de4.3-b2-lcd-app-test', version:lcdTest683.firmwareVersion, counter:lcdTest683.applicationCounter,
  file:'Allmiibo_LCD_DE4_3_b2_App683_NUR_APP_TEST.zip', bytes:lcdTest683.otaBytes, sha256:lcdTest683.otaSha256,
  board:'LCD', storage:'PFS1', bootloader:'Z21', softDevice:'S112 7.3.0',
  applicationOnly:true, migrationRequired:false, channel:'prerelease'
});
