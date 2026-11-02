import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const sourceRoot = process.env.ALLMIIBO_LINK_SOURCE_ROOT || fileURLToPath(new URL('../src', import.meta.url))
const { publicFigureLink } = await import(pathToFileURL(resolve(sourceRoot, 'lib/figure-info.js')))
const { amiiboDeepLink } = await import(pathToFileURL(resolve(sourceRoot, 'deep-link.js')))
const directPages = [
  ['0000000404431c02', 'mario-melody-car'],
  ['000a000404451c02', 'toad']
]

for (const [id, slug] of directPages) test(`${slug}: figure information and local QR routes use the verified direct page`, () => {
  const expected = `https://amiibo.life/amiibo/my-mario-wood-blocks/${slug}`
  assert.equal(publicFigureLink(id), expected)
  assert.equal(publicFigureLink(id.toUpperCase()), expected)
  assert.equal(amiiboDeepLink(`/a/${id.slice(0, 8)}-${id.slice(8)}`), expected)
  assert.equal(amiiboDeepLink(`/a/${id.slice(0, 8)}-${id.slice(8)}/`.toUpperCase().replace('/A/', '/a/')), expected)
})

test('direct-page exceptions do not redirect adjacent IDs or weaken path validation', () => {
  assert.equal(publicFigureLink('0000000404441c02'), 'https://amiibo.life/nfc/00000004-04441C02')
  assert.equal(publicFigureLink('01010000000e0002'), 'https://amiibo.life/nfc/01010000-000E0002')
  for (const path of ['/a/00000004-04431c02/extra', '/a/00000004-04431c02?url=evil', '/a/000a0004-04451c0g']) {
    assert.equal(amiiboDeepLink(path), null)
  }
})
