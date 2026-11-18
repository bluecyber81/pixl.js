export function projectDownloads(buildVersion) {
  const version = '3.58.0';
  const directory = 'https://github.com/bluecyber81/pixl.js/releases/download/web' + version + '/';
  const fileVersion = version.replaceAll('.', '_');
  return {
    version,
    labelSuffix: version === buildVersion ? '' : ' · ' + version,
    portable: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Portable.zip',
    source: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Quellcode.zip',
    previewTestKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-lcd-test1/Allmiibo_LCD_DE3_87_App660_Pruefpaket.zip',
    testKit: directory + 'Allmiibo_DE3_87_App660_Z21_Web3_58_0_ChatGPT_Pruefpaket.zip',
    archivedTestKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip',
  };
}
