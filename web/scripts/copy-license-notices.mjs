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
  if (!['root', 'pages'].includes(mode)) throw new Error('Expected root or pages')
  const output = path.join(webRoot, mode === 'pages' ? 'dist-pages' : 'dist')
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
<p><a href="https://github.com/bluecyber81/pixl.js/blob/main/docs/VERSIONEN_WEB.md">${label('Versionsgeschichte des Dateimanagers', 'File manager version history')}</a> · <a href="https://github.com/bluecyber81/pixl.js/blob/main/docs/VERSIONEN_FIRMWARE.md">${label('LCD-Firmware, Bootloader und SoftDevice', 'LCD firmware, bootloader and SoftDevice')}</a></p>
<p>${label('Der Dateimanager enthält die hier aufgeführten Bibliotheken und sieben Speicher-Simulatoren.', 'The file manager includes the libraries listed here and seven storage simulators.')}</p>
<ul><li><a href="${archives.source}" download>${label(`Quellcode des Dateimanagers ${archives.version} mit Simulatorquellen und Build-Anleitungen (ZIP)`, `File manager ${archives.version} source code, simulator sources and build instructions (ZIP)`)}</a></li>
<li><a href="${archives.testKit}" download>${label(`ChatGPT-Prüfpaket für ${archives.version} mit App- und Bootloader-Artefakten (ZIP)`, `ChatGPT test kit for ${archives.version} with application and bootloader build artifacts (ZIP)`)}</a></li>
<li><a href="${sourceUrl}">${label('Exakter Quellstand der mitgelieferten Firmware DE3.65/637', 'Source code for the bundled DE3.65/637 firmware')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.66">${label('Quellstand der früheren LCD-Testversion DE3.66/638', 'Source code for the earlier DE3.66/638 LCD test release')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.72">${label('Quellstand der LCD-Testversion DE3.72/645 mit App-Fortsetzung', 'Source code for the DE3.72/645 LCD test release with app resume')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.73-test646">${label('Quellstand der LCD-Testversion DE3.73/646', 'Source code for the DE3.73/646 LCD test release')}</a></li>
<li><a href="https://github.com/bluecyber81/pixl.js/tree/de3.74">${label('Quellstand der LCD-Testversion DE3.74/647', 'Source code for the DE3.74/647 LCD test release')}</a></li></ul>
<p>${label('Der Firmware-Quellstand im Hauptzweig des Repositorys kann davon abweichen. Das Anwendungs-ZIP DE3.65 ist der öffentliche Download für Allmiibo LCD mit PFS1 und S112 7.3.0.', 'The main branch can contain a different firmware revision. The DE3.65 application ZIP is the public download for Allmiibo LCD with PFS1 and S112 7.3.0.')}</p>
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
