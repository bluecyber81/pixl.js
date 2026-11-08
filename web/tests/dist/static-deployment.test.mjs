import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { noticeFiles, webRoot } from '../../scripts/copy-license-notices.mjs'

const dist = path.resolve(process.env.ALLMIIBO_DIST_DIR || fileURLToPath(new URL('../../dist', import.meta.url)))
const base = process.env.ALLMIIBO_TEST_BASE_PATH || '/'
assert.ok(['/', '/pixl.js/'].includes(base))
const origin = 'https://bluecyber81.github.io'
const read = relative => fs.readFileSync(path.join(dist, relative), 'utf8')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

test(`${base}: both setup guides have working anchors and bundled destinations`, () => {
  for (const [filename, lang] of [['index.html', 'de'], ['en.html', 'en']]) {
    const here = new URL(base + 'guide/' + filename, origin)
    const guide = read('guide/' + filename)
    assert.ok(guide.includes('<html lang="' + lang + '"'))
    for (const id of ['diagnose', 'programme', 'flash', 'littlefs', 'bootloader', 'hilfe']) {
      assert.ok(guide.includes('id="' + id + '"'), id)
    }
    for (const [, href] of guide.matchAll(/\shref="([^"]+)"/g)) {
      const target = new URL(href, here)
      if (target.origin !== origin) continue
      assert.ok(target.pathname.startsWith(base), href)
      const rel = target.pathname.slice(base.length)
      const contents = fs.readFileSync(path.join(dist, rel.endsWith('/') || !rel ? rel + 'index.html' : rel))
      if (target.hash) assert.ok(contents.includes(Buffer.from('id="' + target.hash.slice(1) + '"')), href)
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

test(`${base}: real bundled firmware loader hashes and parses deployed ZIP without starting Bluetooth`, async () => {
  const require = createRequire(import.meta.url)
  const { Loader } = require(path.join(dist, 'dfu/bundled-packages.js'))
  const Package = require(path.join(dist, 'dfu/package.js'))
  const catalog = JSON.parse(read('firmware/releases.json'))
  const entry = catalog.packages[0]
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
  const buildVersion = JSON.parse(fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8')).version
  const version = buildVersion.includes('-') ? '3.42.2' : buildVersion
  const fileVersion = version.replaceAll('.', '_')
  for (const name of [
    'Allmiibo_Dateimanager_' + fileVersion + '_Quellcode.zip',
    'Allmiibo_DE3_66_Z19_Web' + fileVersion + '_ChatGPT_Pruefpaket.zip'
  ]) {
    assert.ok(index.includes('href="https://bluecyber81.github.io/pixl.js/downloads/web' + version + '/' + name + '" download'), name)
  }
  assert.ok(index.includes('https://github.com/bluecyber81/pixl.js/archive/3a5ea8a3662a942cb4ed9ea56a9a68939c07b5a9.zip'))
  localFile(new URL('../dfu/LICENSE.txt', origin + base + 'licenses/index.html'))
  localFile(new URL('../dfu/vendor/SOURCES.json', origin + base + 'licenses/index.html'))
  assert.match(index, /historische/)
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
