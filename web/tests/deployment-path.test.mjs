import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { deploymentBase, deploymentPath } from '../src/lib/deployment-path.js'
import { amiiboDeepLink } from '../src/deep-link.js'
import { getMigrationCapacityTarget } from '../src/lib/migration-capacity.js'
import { simulateCapacity } from '../src/lib/migration-capacity-engine.js'
import { packagePresentation } from '../src/lib/release-packages.js'

for (const base of ['/', '/pixl.js/']) {
  test(`${base}: resources stay under the explicit build base, independent of page and worker paths`, () => {
    assert.equal(deploymentBase(base), base)
    for (const name of ['dfu/web.html', 'firmware/releases.json', 'firmware/Allmiibo_LCD_DE3_55_627_TESTSTAND.zip', 'lfs-capacity-de355.wasm']) {
      const result = deploymentPath(name, base)
      assert.equal(result, base + name)
      for (const page of [base, base + 'index.html', base + 'assets/worker.js']) {
        const url = new URL(result, 'https://example.test' + page)
        assert.equal(url.origin, 'https://example.test'); assert.equal(url.pathname, base + name)
      }
    }
  })
  test(`${base}: query and fragment figure links work without server rewrites and retain fixed destinations`, () => {
    const expected = 'https://amiibo.life/nfc/01010000-000E0002'
    for (const home of [base, base + 'index.html']) {
      assert.equal(amiiboDeepLink(home, { basePath: base, search: '?amiibo=01010000000e0002' }), expected)
      assert.equal(amiiboDeepLink(home, { basePath: base, hash: '#/a/01010000-000E0002' }), expected)
      assert.equal(amiiboDeepLink(home, { basePath: base, search: '?amiibo=0000000404431c02' }), 'https://amiibo.life/amiibo/my-mario-wood-blocks/mario-melody-car')
      for (const search of ['?amiibo=', '?amiibo=https://evil.test', '?amiibo=01010000000e0002&amiibo=0000000404431c02', '?amiibo=01010000000e0002%00', '?amiibo=01010000-000e0002', '?amiibo=../../evil']) {
        assert.equal(amiiboDeepLink(home, { basePath: base, search }), null)
      }
      assert.equal(amiiboDeepLink(home, { basePath: base, search: '?amiibo=01010000000e0002', hash: '#/a/01010000-000E0002' }), null)
      assert.equal(amiiboDeepLink(home, { basePath: base, hash: '#/a/01010000-000E0002/extra' }), null)
    }
    assert.equal(amiiboDeepLink(base + 'a/01010000-000e0002', { basePath: base }), expected)
    assert.equal(amiiboDeepLink(base + 'dfu/web.html', { basePath: base, search: '?amiibo=01010000000e0002' }), null)
    assert.equal(amiiboDeepLink('/different/', { basePath: base, search: '?amiibo=01010000000e0002' }), null)
  })
}
test('deployment helpers reject external roots, traversal, query injection and encoded separators', () => {
  for (const base of ['https://evil.test/', '//evil.test/', './', '../', '/a/../', '/a//', '/%2e%2e/', '/a?b/', '/a#b/', '/a\\b/', '/pixl.js', null]) assert.throws(() => deploymentBase(base))
  for (const asset of ['../a', '/a', '//evil.test/a', 'https://evil.test/a', 'a/../b', 'a//b', 'a?b', 'a#b', 'a%2fb', 'a\\b', '', null]) assert.throws(() => deploymentPath(asset, '/pixl.js/'))
})
test('capacity URL validation stays exact and precedes fetching for every base-looking injection', async () => {
  const target = getMigrationCapacityTarget('current')
  for (const url of ['/pixl.js/lfs-capacity-de355.wasm', '//evil.test/lfs-capacity-de355.wasm', 'https://evil.test/lfs-capacity-de355.wasm', '/lfs-capacity-de355.wasm?x', '/lfs-capacity-de355.wasm#x', '/../lfs-capacity-de355.wasm']) {
    let fetched = false
    await assert.rejects(simulateCapacity([], { ...target, url }, { archiveSha256: 'ab'.repeat(32), fetchImpl: async () => { fetched = true } }), { code: 'MIGRATION_CAPACITY' })
    assert.equal(fetched, false)
  }
})
test('firmware presentation rejects filenames that could escape the build location', () => {
  for (const file of ['../x.zip', '/x.zip', 'https://evil.test/x.zip', 'x.zip?x', 'x%2f.zip']) assert.throws(() => packagePresentation({ version: '2.22.0-DE3.55', file }))
})
test('production entry points use the common resolver and pass query/hash to the fixed-ID router', () => {
  const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8')
  assert.match(read('src/App.vue'), /:href="dfuPageUrl"/)
  assert.match(read('src/App.vue'), /dfuPageUrl\(\) \{ return deploymentPath\('dfu\/web.html'\)/)
  assert.match(read('index.html'), /src="%BASE_URL%dfu\/vendor\/jszip-3.10.2.min.js"/)
  assert.match(read('src/main.js'), /search: window.location.search, hash: window.location.hash/)
  for (const name of ['src/components/FirmwarePackages.vue', 'public/dfu/web.html']) assert.match(read(name), /https:\/\/github.com\/bluecyber81\/pixl.js\/releases\/download\/de3.62\/Allmiibo_DE3_62_Quellcode.zip/)
})
