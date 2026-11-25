// Signed experimental LCD transfer candidate. Hardware acceptance is independent of package identity.
export const lcdTest680 = Object.freeze({
  "board": "LCD",
  "firmwareVersion": "2.22.0-DE4.2-b2",
  "applicationCounter": 680,
  "chipPart": 337970,
  "sourceId": "16425b76fc84dc65bd9893d1d8337741abbf0fa8e4fc1aa3545183fb57fe600e",
  "sourceCommit": "e6dc031f206ce0d545111ad9f952bc3da4aaaee9",
  "engineSha256": "15db90c7d572bfc3043664a90ed077125a9645bca46055ae2fe0dafe0cb055c0",
  "applicationBytes": 364464,
  "applicationBinSha256": "b1b560b945f6a4b4cb66d1d67580695c732ec460950fbe1b903b6d94baab3f08",
  "otaBytes": 257040,
  "otaSha256": "4348e1757224b076064039feda58b86329b4db0d84681f15fcb22918f148f7ca",
  "artifactStatus": "experimental-signed-application",
  "hardwareAcceptance": "dfu-and-short-upload-sha-readback-on-one-lcd",
  "releaseTag": "de4.2-b2-lcd-transfer-test"
});
export const lcdTest680Package = Object.freeze({
  "id": "de4.2-b2-lcd-app-test",
  "version": "2.22.0-DE4.2-b2",
  "counter": 680,
  "file": "Allmiibo_LCD_DE4_2_b2_App680_NUR_APP_TEST.zip",
  "bytes": 257040,
  "sha256": "4348e1757224b076064039feda58b86329b4db0d84681f15fcb22918f148f7ca",
  "board": "LCD",
  "storage": "PFS1",
  "bootloader": "Z21",
  "softDevice": "S112 7.3.0",
  "applicationOnly": true,
  "migrationRequired": false,
  "channel": "prerelease"
});
