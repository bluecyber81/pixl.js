export function projectDownloads(buildVersion) {
  const version = buildVersion.includes('-') ? '3.45.0' : buildVersion;
  const directory = 'https://bluecyber81.github.io/pixl.js/downloads/web' + version + '/';
  const fileVersion = version.replaceAll('.', '_');
  return {
    version,
    labelSuffix: version === buildVersion ? '' : ' · ' + version,
    source: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Quellcode.zip',
    testKit: directory + 'Allmiibo_DE3_68_Z19_Web' + fileVersion + '_ChatGPT_Pruefpaket.zip',
  };
}
