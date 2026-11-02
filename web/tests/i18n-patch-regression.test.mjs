// Dependency-level regression for GHSA-473g-cvf6-mfxj. The production UI uses
// Vue text interpolation, not translated HTML; these checks do not assert an
// exploitable Dateimanager path. Set ALLMIIBO_DEPENDENCY_ROOT for a baseline run.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dependencyRoot = process.env.ALLMIIBO_DEPENDENCY_ROOT || fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(resolve(dependencyRoot, 'package.json'))
const { createI18n } = require('vue-i18n')

function translated(message, parameters = {}) {
  const i18n = createI18n({ legacy: false, locale: 'en', escapeParameter: true,
    warnHtmlMessage: false, messages: { en: { fixture: message } } })
  return i18n.global.t('fixture', parameters)
}

test('i18n patch disables script schemes in quoted and unquoted SVG xlink targets', () => {
  for (const attribute of ['xlink:href="{url}"', 'xlink:href={url}']) {
    const html = translated(`<svg><a ${attribute}>example</a></svg>`, { url: 'javascript:void(0)' })
    assert.ok(html.includes('about:blank'), html)
    assert.ok(!html.includes('javascript:'), html)
  }
})

test('i18n patch turns SVG animation elements into text instead of live link mutators', () => {
  for (const tag of ['animate', 'set']) {
    const html = translated(`<svg><a><${tag} attributeName="href" to="javascript:void(0)" /></a></svg>`)
    assert.ok(!new RegExp(`<${tag}\\b`, 'i').test(html), html)
    assert.ok(html.includes(`&lt;${tag}`), html)
  }
})

test('i18n patch neutralizes translated base elements without altering regular links', () => {
  const html = translated('<base href="https://example.invalid/">')
  assert.ok(!/<base\b/i.test(html), html)
  assert.ok(html.includes('&lt;base'), html)
  assert.equal(translated('<a href="{url}">{caption}</a>', {
    url: 'https://example.invalid/figure', caption: '<Figure & details>'
  }), '<a href="https:&#x2F;&#x2F;example.invalid&#x2F;figure">&lt;Figure &amp; details&gt;</a>')
})
