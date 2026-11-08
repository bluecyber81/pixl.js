import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from 'vue'
import { readFileSync } from 'node:fs'
import i18n, { getElementLocale, getLanguage } from '../src/i18n/index.js'
import { amiiboDeepLink } from '../src/deep-link.js'
import { installUiComponents } from '../src/ui-components.js'

test('English covers every German file manager message and preserves its named placeholders', () => {
  function collect(messages, prefix = '') {
    return Object.entries(messages).flatMap(([key, value]) => {
      const path = prefix + key
      if (typeof value !== 'string') return collect(value, path + '.')
      assert.ok(value.trim(), path)
      return [[path, [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()]]
    }).sort(([a], [b]) => a.localeCompare(b))
  }
  const english = i18n.global.getLocaleMessage('en')
  assert.deepEqual(collect(english), collect(i18n.global.getLocaleMessage('de_DE')))
  assert.equal(english.format.title, 'Format drive')
  assert.match(english.format.messrow2, /erases all data on this drive/)
  assert.match(english.rename.nametoolong, /63 UTF-8 bytes/)
  assert.match(english.rename.pathtoolong, /47 UTF-8 bytes/)
})

test('focused Element Plus bootstrap registers every production template tag and required service', () => {
  const app = createApp({})
  installUiComponents(app)
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  const tags = new Set([...source.matchAll(/<el-([a-z-]+)/g)].map(match =>
    'El' + match[1].split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')))
  for (const name of tags) assert.ok(app.component(name), name)
  assert.equal(Object.keys(app._context.components).length, tags.size)
  for (const method of ['$message', '$notify', '$confirm', '$prompt', '$alert', '$loading']) {
    assert.equal(typeof app.config.globalProperties[method], 'function', method)
  }
  assert.ok(app.directive('loading'))
  assert.equal(app.config.globalProperties.$message._context, app._context)
  assert.equal(app.config.globalProperties.$notify._context, app._context)
})

test('Vue 3 composition i18n preserves injected Options API locale access and translation', () => {
  const app = createApp({})
  app.use(i18n)
  assert.equal(i18n.mode, 'composition')
  assert.equal(getLanguage(), 'en')
  const global = app.config.globalProperties
  assert.equal(global.$i18n.locale, 'en')
  global.$i18n.locale = 'de_DE'
  assert.equal(global.$t('transfer.cancelled'), 'Übertragung abgebrochen')
  global.$i18n.locale = 'en'
  assert.equal(i18n.global.locale.value, 'en')
  assert.equal(global.$t('transfer.cancelled'), 'Transfer cancelled')
  assert.ok(global.$i18n.availableLocales.includes('de_DE'))
  global.$i18n.locale = 'de_DE'
})

test('Element Plus locale follows each supported app language and rejects unknown selection', () => {
  const expected = { de_DE: 'de', en: 'en', zh_CN: 'zh-cn', zh_TW: 'zh-tw',
    es: 'es', ru_RU: 'ru', sv_SE: 'sv', ja_JP: 'ja' }
  for (const [appLocale, componentLocale] of Object.entries(expected)) {
    assert.equal(getElementLocale(appLocale).name, componentLocale)
  }
  assert.equal(getElementLocale('invalid').name, 'en')
  assert.equal(getElementLocale('__proto__').name, 'en')
  assert.equal(getElementLocale('constructor').name, 'en')
})

test('initial Vue locale reads the same preference as the standalone pages', () => {
  const original = globalThis.window
  try {
    globalThis.window = { AllmiiboLanguage: { getLocale: () => 'es' } }
    assert.equal(getLanguage(), 'es')
  } finally {
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
})

test('amiibo QR deep links retain uppercase external route only for complete hexadecimal IDs', () => {
  assert.equal(amiiboDeepLink('/a/01010000-000e0002'), 'https://amiibo.life/nfc/01010000-000E0002')
  assert.equal(amiiboDeepLink('/a/00000004-04431c02/'), 'https://amiibo.life/amiibo/my-mario-wood-blocks/mario-melody-car')
  for (const path of ['/', '', null, '/a/x-y', '/a/01010000-000E0002/extra',
    '/a/01010000-000E0002?url=evil', '/a/01010000-000E000G', '//evil.test/a/01010000-000E0002']) {
    assert.equal(amiiboDeepLink(path), null)
  }
})
