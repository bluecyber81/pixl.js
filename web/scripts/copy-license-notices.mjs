import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { projectDownloads } from '../src/lib/project-downloads.js'

export const webRoot = fileURLToPath(new URL('../', import.meta.url))
export function noticeFiles(root = webRoot) {
  const result = ['LICENSE']
  function visit(relative) {
    for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (item.isSymbolicLink()) throw new Error('Notice tree cannot contain symlinks')
      const name = relative + '/' + item.name
      if (item.isDirectory()) visit(name)
      else if (item.isFile() && (/license|notice|copying/i.test(item.name) || ['SOURCE.txt', 'SOURCES.json'].includes(item.name))) result.push(name)
    }
  }
  visit('third-party')
  return result.sort()
}

export function copyNotices(mode) {
  const targets = {root: 'dist', pages: 'dist-pages', 'test-app670': 'dist-test-app670'}
  if (!Object.hasOwn(targets, mode)) throw new Error('Expected root, pages or test-app670')
  const output = path.join(webRoot, targets[mode])
  if (!fs.statSync(path.join(output, 'index.html')).isFile()) throw new Error('Build is missing')
  const files = noticeFiles()
  for (const file of files) {
    const target = path.join(output, 'licenses', file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(webRoot, file), target)
  }
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const version = JSON.parse(fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8')).version
  const sourceUrl = 'https://github.com/bluecyber81/pixl.js/archive/3a5ea8a3662a942cb4ed9ea56a9a68939c07b5a9.zip'
  const archives = projectDownloads(version)
  const label = (de, en) => `<span data-en="${escape(en)}">${escape(de)}</span>`
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title data-en="Allmiibo ${escape(version)} – Sources and licenses">Allmiibo ${escape(version)} – Quellen und Lizenzen</title>
<script defer src="../language-preference.js"></script><script defer src="language.js"></script></head><body>
<main><a href="../">${label('Zurück zum Dateimanager', 'Back to the file manager')}</a><h1>${label('Quellen und Lizenzen', 'Sources and licenses')} · ${escape(version)}</h1>
<p><a href="https://github.com/bluecyber81/pixl.js/blob/web3.68.0-beta.5/docs/VERSIONEN_WEB.md">${label('Versionsgeschichte des Dateimanagers', 'File manager version history')}</a> · <a href="https://github.com/bluecyber81/pixl.js/blob/web3.68.0-beta.5/docs/VERSIONEN_FIRMWARE.md">${label('LCD- und OLED-Firmware', 'LCD and OLED firmware')}</a></p>
<p>${label('Der Dateimanager enthält die hier aufgeführten Bibliotheken und die Speicher-Simulatoren.', 'The file manager includes the libraries listed here and storage simulators.')}</p>
<ul><li><a href="../sources/LCD_DE4_3_b4_App685_Simulatorquellen.zip" download>${label('Simulatorquellen und Buildskript für den LCD-Test App685', 'Simulator sources and build script for the LCD App685 test release')}</a></li><li><a href="../sources/LCD_DE4_3_b3_App684_Simulatorquellen.zip" download>${label('Simulatorquellen und Buildskript für den LCD-Test App684', 'Simulator sources and build script for the LCD App684 test release')}</a></li><li><a href="../sources/LCD_DE4_3_b2_App683_Simulatorquellen.zip" download>${label('Simulatorquellen und Buildskript für den LCD-Test App683', 'Simulator sources and build script for the LCD App683 test release')}</a></li><li><a href="../sources/LCD_DE4_2_App680_Simulatorquellen.zip" download>${label('Simulatorquellen und Firmwarebindung für LCD DE4.2 / App680', 'Simulator sources and firmware binding for LCD DE4.2 / App680')}</a></li><li><a href="../sources/LCD_DE4_1_App678_Simulatorquellen.zip" download>${label('Simulatorquellen und Firmwarebindung für LCD DE4.1 / App678', 'Simulator sources and firmware binding for LCD DE4.1 / App678')}</a></li><li><a href="https://github.com/bluecyber81/pixl.js/tree/release/lcd-de41-app678">${label('Quellstand der normalen LCD-Firmware DE4.1 / App678', 'Source for normal LCD firmware DE4.1 / App678')}</a></li><li><a href="../sources/LCD_DE3_102_App675_Simulatorquellen.zip" download>${label('Archiv: Simulatorquellen und Firmwarebindung für LCD DE3.102 / App675', 'Archive: simulator sources and firmware binding for LCD DE3.102 / App675')}</a></li><li><a href="https://github.com/bluecyber81/pixl.js/tree/release/lcd-de3102-app675">${label('Archiv: Quellstand der normalen LCD-Firmware DE3.102 / App675', 'Archive: source for LCD firmware DE3.102 / App675')}</a></li><li><a href="../sources/LCD_DE3_101_App674_Simulatorquellen.zip" download>${label('Archiv: Simulatorquellen und Firmwarebindung für LCD DE3.101 / App674', 'Archive: simulator sources and firmware binding for LCD DE3.101 / App674')}</a></li><li><a href="https://github.com/bluecyber81/pixl.js/tree/release/lcd-de3101-app674">${label('Archiv: Quellstand der LCD-Firmware DE3.101 / App674', 'Archive: source for LCD firmware DE3.101 / App674')}</a></li><li><a href="../sources/LCD_DE3_100_App673_Simulatorquellen.zip" download>${label('Archiv: Simulatorquellen und Firmwarebindung für LCD DE3.100 / App673', 'Archive: simulator sources and firmware binding for LCD DE3.100 / App673')}</a></li><li><a href="https://github.com/bluecyber81/pixl.js/tree/release/lcd-de3100-app673">${label('Archiv: Quellstand der LCD-Firmware DE3.100 / App673', 'Archive: source for LCD firmware DE3.100 / App673')}</a></li><li><a href="https://github.com/bluecyber81/pixl.js/tree/web3.68.0-beta.5">${label('Quellstand des Dateimanagers 3.68.0-beta.5', 'File manager 3.68.0-beta.5 source')}</a></li><li><a href="../sources/LCD_DE3_99_App672_Simulatorquellen.zip" download>${label('Archiv: Simulatorquellen für LCD DE3.99 / App672', 'Archive: simulator sources for LCD DE3.99 / App672')}</a></li><li><a href="../sources/LCD_DE3_98_App671_Simulatorquellen.zip" download>${label('Archiv: Simulatorquellen für LCD DE3.98 / App671', 'Archive: simulator sources for LCD DE3.98 / App671')}</a></li><li><a href="../sources/LCD_DE3_97_App670_TEST1_Simulatorquellen.zip" download>${label('Simulatorquellen, gepinntes Buildskript und Firmwarebindung für LCD DE3.97 / App670 Test 1', 'Simulator sources, pinned build script and firmware binding for LCD DE3.97 / App670 Test 1')}</a></li><li><a href="../sources/LCD_DE3_96_App669_TEST1_Simulatorquellen.zip" download>${label('Simulatorquellen, gepinntes Buildskript und Firmwarebindung für LCD DE3.96 / App669 Test 1', 'Simulator sources, pinned build script and firmware binding for LCD DE3.96 / App669 Test 1')}</a></li><li><a href="../sources/LCD_DE3_95_App668_Simulatorquellen.zip" download>${label('Simulatorquellen, gepinntes Buildskript und Firmwarebindung für LCD DE3.95 / App668', 'Simulator sources, pinned build script and firmware binding for LCD DE3.95 / App668')}</a></li><li><a href="../sources/LCD_DE3_94_App667_Simulatorquellen.zip" download>${label('Simulatorquellen, gepinntes Buildskript und Firmwarebindung für LCD DE3.94 / App667', 'Simulator sources, pinned build script and firmware binding for LCD DE3.94 / App667')}</a></li><li><a href="../sources/LCD_DE3_92_App665_Simulatorquellen.zip" download>${label('Simulatorquellen und gepinntes Buildskript der privaten LCD-App665-Vorschau', 'Simulator sources and pinned build script for the private LCD App665 preview')}</a></li><li><a href="../sources/LCD_DE3_91_App664_Simulatorquellen.zip" download>${label('Simulatorquellen und Buildskript der privaten LCD-App664-Vorschau', 'Simulator sources and build script for the private LCD App664 preview')}</a></li><li><a href="${archives.source}" download>${label(`Quellcode der Version ${archives.version} mit Simulatorquellen und Build-Anleitungen (ZIP)`, `Release ${archives.version} source code, simulator sources and build instructions (ZIP)`)}</a></li>
<li><a href="${archives.candidateSource}" download>${label('Quellcode des Dateimanagers 3.58.2 für App662 Test 1', 'File manager 3.58.2 source for App662 Test 1')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/archive/refs/tags/de3.88-lcd-test1.zip" download>${label('Quellcode des Dateimanagers für App661 Test 1 (GitHub-Tag, ZIP)', 'App661 Test 1 file manager source (GitHub tag, ZIP)')}</a></li>
<li><a href="${archives.lcdKit}" download>${label('Prüfpaket mit BIN, HEX und Prüfnachweisen für DE3.89 / App662 (ZIP)', 'DE3.89 / App662 test kit with BIN, HEX and test results (ZIP)')}</a></li>
<li><a href="${archives.testKit}" download>${label('Prüfpaket für OLED DE3.87 Test 6 / App86 (ZIP)', 'OLED DE3.87 Test 6 / App86 test kit (ZIP)')}</a></li>
<li><a href="${archives.archivedTestKit}" download>${label('Archiviertes ChatGPT-Prüfpaket für DE3.75 / App648, Z19 und Web 3.52.1 (ZIP)', 'Archived ChatGPT test kit for DE3.75 / App648, Z19 and Web 3.52.1 (ZIP)')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/d34ecb44fa058a149b58de2dcbffbb751c015864">${label('Quellstand der signierten LCD-Testfirmware DE3.97 / App670 Test 1', 'Source code for the signed DE3.97 / App670 Test 1 LCD firmware')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/feb6c58ad14998f31aef07dc84d8dc0732e32ede">${label('Quellstand der LCD-Testfirmware DE3.96 / App669 Test 1', 'Source code for the DE3.96 / App669 Test 1 LCD firmware')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/805e445aa072281d8db8645ec80ccae4023c90ba">${label('Quellstand der privaten LCD-Firmware DE3.95 / App668', 'Source code for the private DE3.95 / App668 LCD firmware')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.89">${label('Archiv: Quellstand der LCD-Firmware DE3.89 / App662 und des Bootloaders Z21', 'Archive: source code for the DE3.89 / App662 LCD firmware and Z21 bootloader')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de4.2">${label('Quellcode der finalen LCD-App680', 'Source code for the final App680 LCD firmware')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de4.2-b1-lcd-transfer-test">${label('Quellcode der LCD-Testfirmware App679', 'Source code for the App679 LCD test firmware')}</a></li>
<li><a href="${sourceUrl}">${label('Exakter Quellstand der mitgelieferten Firmware DE3.65/637', 'Source code for the bundled DE3.65/637 firmware')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.66">${label('Quellstand der früheren LCD-Testversion DE3.66/638', 'Source code for the earlier DE3.66/638 LCD test release')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.72">${label('Quellstand der LCD-Testversion DE3.72/645 mit App-Fortsetzung', 'Source code for the DE3.72/645 LCD test release with app resume')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.73-test646">${label('Quellstand der LCD-Testversion DE3.73/646', 'Source code for the DE3.73/646 LCD test release')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.87-oled-t6">${label('Quellcode der OLED-Testversion 6', 'OLED Test 6 source')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.85-oled-t5">OLED Test 5</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.84-oled-t4">${label('Quellstand der OLED-Testfirmware DE3.84 Test 4', 'Source code for the DE3.84 OLED Test 4 firmware')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.75">${label('Archivierter Quellstand der LCD-Firmware DE3.75/648', 'Archived source code for LCD release DE3.75/648')}</a></li></ul>
<p>${label('Die LCD-App DE3.89 setzt PFS1, Z21 und S112 7.3.0 voraus. Das Android-Komplettpaket enthält DE3.89, Z21 und S112 7.3.0.', 'The DE3.89 LCD app requires PFS1, Z21, and S112 7.3.0. The Android full package contains DE3.89, Z21 and S112 7.3.0.')}</p>
<p>${label('Aktuelle Bibliotheken und Quellen', 'Current libraries and sources')} · <a href="third-party/npm/SOURCES.json">npm/SOURCES.json</a>.
${label('Die Liste unten enthält auch historische Lizenzhinweise.', 'The list below also includes historical notices.')}
<a href="../dfu/LICENSE.txt">${label('DFU-Lizenz', 'DFU license')}</a> · <a href="../dfu/vendor/SOURCES.json">${label('DFU-Bibliotheksnachweise', 'DFU library sources')}</a></p>
<h2>${label('Mitgelieferte Lizenz- und Quellenhinweise', 'Bundled license and source notices')}</h2><ul>${files.map(file => `<li><a href="${escape(file)}">${escape(file)}</a></li>`).join('\n')}</ul></main></body></html>\n`
  fs.writeFileSync(path.join(output, 'licenses/index.html'), html, 'utf8')
  return files
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Expected one build mode')
  console.log(JSON.stringify({ mode: process.argv[2], copiedNotices: copyNotices(process.argv[2]).length }))
}
