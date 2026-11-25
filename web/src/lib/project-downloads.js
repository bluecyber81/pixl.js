import release from '../../package.json' with { type: 'json' };

export const transferTestLabel = 'Transfer Test 6';
export const transferBaseTag = 'de4.2-b1-lcd-transfer-test';
export const transferTestTag = 'de4.2-b2-lcd-transfer-test';

export function projectDownloads(buildVersion, label = import.meta.env?.VITE_BUILD_LABEL) {
  const version = release.version;
  const directory = 'https://bluecyber81.github.io/pixl.js/downloads/web' + version + '/';
  const fileVersion = version.replaceAll('.', '_');
  const transferTest = label === transferTestLabel && version === '3.66.1';
  const tag = transferTest ? transferBaseTag : 'web' + version;
  return {
    version,
    localTest: transferTest,
    labelSuffix: transferTest ? ' · ' + transferTestLabel : version === buildVersion ? '' : ' · ' + version,
    transferBeta680: transferTest ? 'firmware/Allmiibo_LCD_DE4_2_b2_App680_NUR_APP_TEST.zip' : null,
    transferBeta: transferTest ? 'firmware/Allmiibo_LCD_DE4_2_b1_App679_NUR_APP_TEST.zip' : null,
    portable: transferTest ? null
      : directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Portable.zip',
    source: 'https://github.com/bluecyber81/pixl.js/archive/refs/tags/' + tag + '.zip',
    sourceTree: 'https://github.com/bluecyber81/pixl.js/tree/' + tag,
    candidatePortable: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89-lcd-test1/Allmiibo_Dateimanager_3_58_2_App662_Test1_Windows.zip',
    candidateSource: 'https://github.com/bluecyber81/pixl.js/archive/refs/tags/de3.89-lcd-test1.zip',
    lcdKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_DE3_89_App662_Pruefpaket.zip',
    testKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_Pruefpaket.zip',
    archivedTestKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip',
  };
}
