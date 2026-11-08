export function projectDownloads(version) {
  const directory = 'https://bluecyber81.github.io/pixl.js/downloads/web' + version + '/';
  const fileVersion = version.replaceAll('.', '_');
  return {
    source: directory + 'Allmiibo_Dateimanager_' + fileVersion + '_Quellcode.zip',
    testKit: directory + 'Allmiibo_DE3_66_Z19_Web' + fileVersion + '_ChatGPT_Pruefpaket.zip',
  };
}
