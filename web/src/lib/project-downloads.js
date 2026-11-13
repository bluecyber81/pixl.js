export function projectDownloads(buildVersion) {
  // The source and review assets on GitHub belong to this published release.
  const version = '3.48.1';
  const directory = 'https://github.com/bluecyber81/pixl.js/releases/download/web' + version + '/';
  const fileVersion = version.replaceAll('.', '_');
  return {
    version,
    labelSuffix: version === buildVersion ? '' : ' · ' + version,
    portable: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Portable.zip',
    source: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Quellcode.zip',
    testKit: directory + 'Allmiibo_DE3_72_Z19_Web' + fileVersion + '_ChatGPT_Pruefpaket.zip',
  };
}
