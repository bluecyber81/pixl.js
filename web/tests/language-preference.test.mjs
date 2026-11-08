import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../public/language-preference.js', import.meta.url), 'utf8')
const key = 'allmiibo.language'

function page({ languages = [], language, saved, blocked = false } = {}) {
  const listeners = new Map()
  const values = new Map(saved ? [[key, saved]] : [])
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }
  const window = {
    navigator: { languages, language },
    addEventListener: (name, fn) => listeners.set(name, fn),
    get localStorage() { if (blocked) throw Error('SecurityError'); return storage }
  }
  runInNewContext(source, { window })
  return { api: window.AllmiiboLanguage, values, listeners }
}

test('automatic language follows ordered supported preferences and distinguishes Chinese scripts and regions', () => {
  for (const [tag, expected] of [
    ['de-DE', 'de_DE'], ['de_CH', 'de_DE'], ['DE-at', 'de_DE'], ['en-AU', 'en'], ['es-419', 'es'],
    ['ru', 'ru_RU'], ['sv-FI', 'sv_SE'], ['ja', 'ja_JP'], ['zh', 'zh_CN'], ['zh-CN', 'zh_CN'],
    ['zh-TW', 'zh_TW'], ['zh-HK', 'zh_TW'], ['zh-Hans-HK', 'zh_CN'], ['zh-Hant-CN', 'zh_TW']
  ]) {
    assert.equal(page({ languages: ['xx', null, 'bad tag', tag, 'ja'] }).api.getLocale(), expected, tag)
  }
  const multilingual = page({ languages: ['ja', 'de-AT', 'en-US'] })
  assert.equal(multilingual.api.getLocale(), 'ja_JP')
  assert.equal(multilingual.api.getLocale(['de_DE', 'en']), 'de_DE')
  assert.equal(page({ language: 'sv' }).api.getLocale(), 'sv_SE')
  assert.equal(page({ languages: ['fr', 'pl'] }).api.getLocale(), 'en')
  assert.equal(page().api.getLocale(), 'en')
})

test('old saved choices continue across pages, unsupported saved values follow the browser', () => {
  const { api, values, listeners } = page({ saved: 'ja_JP', languages: ['de'] })
  assert.equal(api.getMode(), 'ja_JP')
  assert.equal(api.getLocale(), 'ja_JP')
  assert.equal(api.getLocale(['de_DE', 'en']), 'en')
  const seen = []
  const unsubscribe = api.subscribe(({ mode, locale }) => seen.push(mode + '/' + locale))
  values.set(key, 'en')
  listeners.get('storage')({ key: 'some-other-setting' })
  assert.equal(api.getMode(), 'ja_JP')
  listeners.get('storage')({ key })
  assert.equal(api.getMode(), 'en')
  values.clear()
  listeners.get('storage')({ key: null })
  assert.deepEqual(seen, ['ja_JP/ja_JP', 'en/en', 'auto/de_DE'])
  unsubscribe()
  assert.equal(api.setMode('__proto__'), false)
  api.setMode('es')
  assert.equal(values.get(key), 'es')
  api.setMode('auto')
  assert.equal(values.has(key), false)
  assert.equal(seen.length, 3)
  for (const saved of ['unknown', 'de', '__proto__', 'auto']) {
    assert.equal(page({ saved, language: 'sv' }).api.getLocale(), 'sv_SE')
  }
})

test('blocked storage still permits automatic detection and manual changes for this tab', () => {
  const { api } = page({ blocked: true, language: 'de-CH' })
  assert.equal(api.getLocale(), 'de_DE')
  assert.equal(api.setMode('en'), true)
  assert.equal(api.getLocale(), 'en')
  api.setMode('auto')
  assert.equal(api.getLocale(), 'de_DE')
})
