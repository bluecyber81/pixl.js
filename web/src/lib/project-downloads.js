export function projectDownloads(buildVersion) {
  const version = buildVersion.includes('-') ? '3.48.1' : buildVersion;
  const directory = 'https://bluecyber81.github.io/pixl.js/downloads/web' + version + '/';
  const fileVersion = version.replaceAll('.', '_');
  return {
    version,
    labelSuffix: version === buildVersion ? '' : ' · ' + version,
    portable: 'https://github.com/bluecyber81/pixl.js/releases/download/web' + version + '/Allmiibo_Dateimanager_' + fileVersion + '_Portable.zip',
    source: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Quellcode.zip',
    testKit: directory + 'Allmiibo_DE3_72_Z19_Web' + fileVersion + '_ChatGPT_Pruefpaket.zip',
  };
}
