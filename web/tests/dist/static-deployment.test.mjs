import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { noticeFiles, webRoot } from '../../scripts/copy-license-notices.mjs'
import { lcdPreview, lcdPreview669, lcdPreview668, lcdPreview667, lcdPreviewPackages } from '../../public/dfu/lcd-private-reference.mjs'
import { lcdRelease } from '../../public/dfu/lcd-release-reference.mjs'
import { lcdRelease as app675 } from '../../public/dfu/lcd-app675-reference.mjs';
import { lcdRelease as app674 } from '../../public/dfu/lcd-app674-reference.mjs'
import { lcdRelease as app673 } from '../../public/dfu/lcd-app673-reference.mjs'
import { lcdRelease as app672 } from '../../public/dfu/lcd-app672-reference.mjs'
import { lcdRelease as app671 } from '../../public/dfu/lcd-app671-reference.mjs'

const dist = path.resolve(process.env.ALLMIIBO_DIST_DIR || fileURLToPath(new URL('../../dist', import.meta.url)))
const base = process.env.ALLMIIBO_TEST_BASE_PATH || '/'
assert.ok(['/', '/pixl.js/', '/pixl.js/test/app670/'].includes(base))
const origin = 'https://bluecyber81.github.io'
const read = relative => fs.readFileSync(path.join(dist, relative), 'utf8')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

test(`${base}: both setup guides have working anchors and bundled destinations`, () => {
  for (const [filename, lang] of [['index.html', 'de'], ['en.html', 'en']]) {
    const here = new URL(base + 'guide/' + filename, origin)
    const guide = read('guide/' + filename)
    assert.ok(guide.includes('<html lang="' + lang + '"'))
    for (const id of ['diagnose', 'programme', 'flash', 'lcd-de42', 'lcd-de41', 'lcd-de3102', 'lcd-de3101', 'lcd-de3100', 'bild-video', 'littlefs', 'bootloader', 'hilfe']) {
      assert.ok(guide.includes('id="' + id + '"'), id)
    }
    for (const [, href] of guide.matchAll(/\shref="([^"]+)"/g)) {
      const target = new URL(href, here)
      if (target.origin !== origin) continue
      assert.ok(target.pathname.startsWith(base), href)
      const rel = target.pathname.slice(base.length)
      const contents = fs.readFileSync(path.join(dist, rel.endsWith('/') || !rel ? rel + 'index.html' : rel))
      if (target.pathname.endsWith('/dfu/web.html') && ['#board=LCD','#board=OLED'].includes(target.hash)) {
        const packages = JSON.parse(read('firmware/releases.json')).packages
        assert.deepEqual([...target.searchParams.keys()], ['package'], href)
        assert.ok(packages.some(entry => '#board=' + entry.board === target.hash && entry.id === target.searchParams.get('package')), href)
      } else if (target.searchParams.has('workspace')) {
        assert.equal(target.pathname, base, href)
        assert.deepEqual([...target.searchParams], [['workspace', 'stream']], href)
        assert.equal(target.hash, '', href)
      } else if (target.hash) assert.ok(contents.includes(Buffer.from('id="' + target.hash.slice(1) + '"')), href)
    }
  }
})
function localFile(url) {
  assert.equal(url.origin, origin)
  assert.ok(url.pathname.startsWith(base), `Escapes ${base}: ${url}`)
  const relative = decodeURIComponent(url.pathname.slice(base.length))
  assert.ok(!relative.split('/').includes('..'))
  const file = path.join(dist, relative || 'index.html')
  assert.ok(fs.statSync(file).isFile(), file)
  return file
}

test(`${base}: production index, lazy chunks and DFU assets resolve to real files inside this deployment`, () => {
  for (const name of ['index.html', 'dfu/web.html']) {
    const page = new URL(base + name, origin)
    for (const match of read(name).matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) localFile(new URL(match[1], page))
  }
  const assets = fs.readdirSync(path.join(dist, 'assets'))
  const main = read('index.html').match(/type="module"[^>]*src="([^"]+)"/)
  assert.ok(main); assert.equal(new URL(main[1], origin).pathname.startsWith(base + 'assets/'), true)
  const mainSource = fs.readFileSync(localFile(new URL(main[1], origin)), 'utf8')
  // Rollup/Vite imports are file-relative; verify every emitted chunk reference.
  for (const name of assets.filter(name => name.endsWith('.js'))) {
    const source = read('assets/' + name)
    for (const match of source.matchAll(/(?:from\s*|import\s*\()(["'])(\.\/[^"']+\.js)\1/g)) {
      localFile(new URL(match[2], origin + base + 'assets/' + name))
    }
  }
  const worker = assets.find(name => /^migration-capacity-worker-.*\.js$/.test(name))
  assert.ok(worker)
  assert.ok(assets.filter(name => name.endsWith('.js')).some(name => read('assets/' + name).includes(base + 'assets/' + worker)))
  assert.ok(mainSource.includes(base), 'main bundle carries its build base')
  assert.equal(read('index.html').includes('%BASE_URL%'), false)
  assert.equal(new URL('../', origin + base + 'dfu/web.html').pathname, base)
})

for (const privateId of [null,...lcdPreviewPackages.map(entry=>entry.id)])
test(`${base}: real ${privateId || 'stable'} firmware loader hashes and parses deployed ZIP without starting Bluetooth`, async () => {
  const require = createRequire(import.meta.url)
  const { Loader } = require(path.join(dist, 'dfu/bundled-packages.js'))
  const Package = require(path.join(dist, 'dfu/package.js'))
  const stable = JSON.parse(read('firmware/releases.json'))
  const catalog = {...stable,packages:[...stable.packages,...lcdPreviewPackages]}
  const entry = privateId ? catalog.packages.find(item=>item.id === privateId) : catalog.packages[0]
  let parsed, requests = 0, status = []
  const updater = { busy: false, package: null, async setPackage(file) {
    if (!file) { this.package = null; return false }
    parsed = new Package(file); await parsed.load(); this.package = parsed; return true
  } }
  const loader = new Loader({ catalog, updater, onStatus: message => status.push(message), pageUrl: origin + base + 'dfu/web.html', fetchImpl: async (url, options) => {
    requests++; assert.equal(url, origin + base + 'firmware/' + entry.file)
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'same-origin')
    const bytes = fs.readFileSync(localFile(new URL(url)))
    assert.equal(bytes.length, entry.bytes); assert.equal(sha(bytes), entry.sha256)
    const response = new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } })
    Object.defineProperty(response, 'url', { value: url })
    return response
  } })
  assert.equal(await loader.load(entry.id), true, status.join('\n'))
  assert.equal(requests, 1); assert.ok(parsed)
  const app = await parsed.getAppImage(); assert.ok(app.imageData.byteLength > 0)
  assert.equal(loader.loading, false)
})

test(`${base}: public notices preserve all selected license bytes and explicit matching source downloads`, () => {
  const index = read('licenses/index.html')
  for (const file of noticeFiles()) {
    assert.deepEqual(fs.readFileSync(path.join(dist, 'licenses', file)), fs.readFileSync(path.join(webRoot, file)), file)
    assert.ok(index.includes(`href="${file}"`), file)
  }
  assert.ok(index.includes('href="https://github.com/bluecyber81/pixl.js/archive/refs/tags/web3.68.0-beta.2.zip" download'))
  assert.ok(index.includes('pixl.js/blob/web3.68.0-beta.2/docs/VERSIONEN_WEB.md'))
  assert.ok(index.includes('pixl.js/blob/web3.68.0-beta.2/docs/VERSIONEN_FIRMWARE.md'))
  for (const tag of ['de4.2-b1-lcd-transfer-test','de4.2']) assert.ok(index.includes('pixl.js/tree/' + tag))
  for (const releaseFile of [
    'de3.89/Allmiibo_LCD_DE3_89_App662_Pruefpaket.zip',
    'de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_Pruefpaket.zip',
    'de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip'
  ]) {
    assert.ok(index.includes('href="https://github.com/bluecyber81/pixl.js/releases/download/' + releaseFile + '" download'), releaseFile)
  }
  assert.ok(index.includes('https://github.com/bluecyber81/pixl.js/archive/3a5ea8a3662a942cb4ed9ea56a9a68939c07b5a9.zip'))
  assert.ok(index.includes('https://github.com/bluecyber81/pixl.js/archive/refs/tags/de3.88-lcd-test1.zip'))
  assert.ok(index.includes('https://github.com/bluecyber81/pixl.js/archive/refs/tags/de3.89-lcd-test1.zip'))
  assert.ok(index.includes('Prüfpaket mit BIN, HEX und Prüfnachweisen für DE3.89 / App662'))
  localFile(new URL('../dfu/LICENSE.txt', origin + base + 'licenses/index.html'))
  localFile(new URL('../dfu/vendor/SOURCES.json', origin + base + 'licenses/index.html'))
  assert.match(index, /historische/)
})

for (const [reference,profile,name] of [[lcdRelease,'de41','LCD_DE4_1_App678_Simulatorquellen.zip'],[app675,'de3102','LCD_DE3_102_App675_Simulatorquellen.zip'],[app674,'de3101','LCD_DE3_101_App674_Simulatorquellen.zip'],[app673,'de3100','LCD_DE3_100_App673_Simulatorquellen.zip'],[app672,'de399','LCD_DE3_99_App672_Simulatorquellen.zip'],[app671,'de398','LCD_DE3_98_App671_Simulatorquellen.zip'],[lcdPreview,'de397','LCD_DE3_97_App670_TEST1_Simulatorquellen.zip'],[lcdPreview669,'de396','LCD_DE3_96_App669_TEST1_Simulatorquellen.zip'],[lcdPreview668,'de395','LCD_DE3_95_App668_Simulatorquellen.zip'],[lcdPreview667,'de394','LCD_DE3_94_App667_Simulatorquellen.zip']])
test(`${base}: the App${reference.applicationCounter} source download resolves to its complete archive and exact firmware binding`, async () => {
  const index = read('licenses/index.html')
  const links = [...index.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].filter(match => match[1].endsWith(name))
  assert.equal(links.length, 1)
  assert.match(links[0][0], /\bdownload\b/)
  const file = localFile(new URL(links[0][1], origin + base + 'licenses/index.html'))
  const bytes = fs.readFileSync(file)
  assert.deepEqual(bytes, fs.readFileSync(path.join(webRoot, 'public/sources', name)))
  const referenceFile = reference === lcdRelease ? 'lcd-release-reference.mjs' : reference === app675 ? 'lcd-app675-reference.mjs' : reference === app674 ? 'lcd-app674-reference.mjs' : reference === app673 ? 'lcd-app673-reference.mjs' : reference === app672 ? 'lcd-app672-reference.mjs' : reference === app671 ? 'lcd-app671-reference.mjs' : 'lcd-private-reference.mjs'
  assert.deepEqual(fs.readFileSync(path.join(dist, 'dfu', referenceFile)),
    fs.readFileSync(path.join(webRoot, 'public/dfu', referenceFile)))
  const require = createRequire(import.meta.url)
  const JSZip = require(path.join(dist, 'dfu/vendor/jszip-3.10.2.min.js'))
  const archive = await JSZip.loadAsync(bytes, {checkCRC32:true})
  const binding = JSON.parse(await archive.file(`APP${reference.applicationCounter}_BINDING.json`).async('string'))
  assert.equal(binding.sourceId, reference.sourceId)
  assert.equal(binding.applicationCounter, reference.applicationCounter)
  assert.equal(binding.applicationBinSha256, reference.applicationBinSha256)
  assert.equal(binding.applicationBytes, reference.applicationBytes)
  if ([lcdRelease, app675, app674, app673, app672, app671].includes(reference)) {
    assert.equal(binding.firmwareChannel, 'normal')
    assert.equal(binding.hardwareAcceptance, reference === lcdRelease ? reference.hardwareAcceptance : 'pending-for-this-build')
    assert.equal(binding.productionCommit, reference.productionCommit)
    assert.equal(binding.wasm.path, 'web/public/lfs-capacity-' + (['de41', 'de3102', 'de3101', 'de3100'].includes(profile) ? 'de399' : profile) + '.wasm')
  } else assert.equal(binding.capacityProfile, profile)
  const qualification = await archive.file(binding.qualification.path).async('uint8array')
  assert.equal(sha(qualification), binding.qualification.sha256)
  assert.equal(JSON.parse(new TextDecoder().decode(qualification)).sourceId, reference.sourceId)
  assert.equal(sha(fs.readFileSync(path.join(dist, binding.wasm.path.slice('web/public/'.length)))), binding.wasm.sha256)
})

test(`${base}: static build contains no local server, state, test, dependency tree or collection backup`, () => {
  const paths = []
  const walk = folder => { for (const item of fs.readdirSync(path.join(dist, folder), { withFileTypes: true })) {
    const relative = folder + item.name
    if (item.isDirectory()) walk(relative + '/'); else paths.push(relative)
  } }
  walk('')
  for (const file of paths) {
    assert.doesNotMatch(file, /(?:^|\/)(?:node_modules|src|tests|\.git|server-state[^/]*|.*\.pem|.*\.key|allmiibo-backup[^/]*)(?:\/|$)/i, file)
    assert.doesNotMatch(file, /\.(?:py|ps1|cmd|map)$/i, file)
  }
  assert.ok(paths.includes('licenses/index.html'))
  assert.ok(paths.includes('.nojekyll'))
})
