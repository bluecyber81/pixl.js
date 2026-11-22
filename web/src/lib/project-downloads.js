import release from '../../package.json' with { type: 'json' };

export function projectDownloads(buildVersion) {
  const version = release.version;
  const directory = 'https://github.com/bluecyber81/pixl.js/releases/download/web' + version + '/';
  const fileVersion = version.replaceAll('.', '_');
  return {
    version,
    labelSuffix: version === buildVersion ? '' : ' · ' + version,
    portable: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Portable.zip',
    source: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Quellcode.zip',
    candidatePortable: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89-lcd-test1/Allmiibo_Dateimanager_3_58_2_App662_Test1_Windows.zip',
    candidateSource: 'https://github.com/bluecyber81/pixl.js/archive/refs/tags/de3.89-lcd-test1.zip',
    lcdKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_DE3_89_App662_Pruefpaket.zip',
    testKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_Pruefpaket.zip',
    archivedTestKit: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip',
  };
}
