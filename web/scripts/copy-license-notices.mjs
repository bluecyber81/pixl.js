import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  const release = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.56/'
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Allmiibo ${escape(version)} – Quellen und Lizenzen</title></head><body>
<main><a href="../">Zurück zum Dateimanager</a><h1>Quellen und Lizenzen · ${escape(version)}</h1>
<p>Diese Seite verteilt den Dateimanager mit seinen Bibliotheken und sieben gebundenen Speicher-Simulatoren. Die jeweiligen Lizenztexte bleiben erhalten.</p>
<ul><li><a href="${release}Allmiibo_Dateimanager_3_34_0_Quellcode.zip">Dateimanager: vollständiger Quellcode, Simulatorquellen und Build-Anleitungen</a></li>
<li><a href="${release}Allmiibo_DE3_56_Quellcode.zip">Exakter Quellstand der mitgelieferten Firmware DE3.56/628</a></li></ul>
<p>Der Firmware-Quellstand im Hauptzweig des Repositorys kann davon abweichen. Das Anwendungs-ZIP ist auf unser LCD/PFS1-Gerät mit BL8/S112 7.3.0 beschränkt.</p>
<p>Die aktuelle Bibliothekszuordnung steht in <a href="third-party/npm/SOURCES.json">npm/SOURCES.json</a>. Weitere alte Lizenzkopien bleiben als historische, nicht mehr zugeordnete Hinweise erhalten. Bereits mitgelieferte <a href="../dfu/LICENSE.txt">DFU-Lizenz</a> und <a href="../dfu/vendor/SOURCES.json">DFU-Bibliotheksnachweise</a> liegen daneben unverändert vor.</p>
<h2>Mitgelieferte Lizenz- und Quellenhinweise</h2><ul>${files.map(file => `<li><a href="${escape(file)}">${escape(file)}</a></li>`).join('\n')}</ul></main></body></html>\n`
  fs.writeFileSync(path.join(output, 'licenses/index.html'), html, 'utf8')
  return files
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Expected one build mode')
  console.log(JSON.stringify({ mode: process.argv[2], copiedNotices: copyNotices(process.argv[2]).length }))
}
