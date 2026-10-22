import { createI18n } from 'vue-i18n'
import elementEn from 'element-plus/es/locale/lang/en.mjs'
import elementZhCn from 'element-plus/es/locale/lang/zh-cn.mjs'
import elementZhTw from 'element-plus/es/locale/lang/zh-tw.mjs'
import elementEs from 'element-plus/es/locale/lang/es.mjs'
import elementRu from 'element-plus/es/locale/lang/ru.mjs'
import elementDe from 'element-plus/es/locale/lang/de.mjs'
import elementSv from 'element-plus/es/locale/lang/sv.mjs'
import elementJa from 'element-plus/es/locale/lang/ja.mjs'
import enLocale from './en_US.js'
import zhTWLocale from './zh_TW.js'
import zhCNLocale from './zh_Hans.js'
import esLocale from './es_ES.js'
import ruLocale from './ru_RU.js'
import deLocale from './de_DE.js'
import svLocale from './sv_SE.js'
import jaLocale from './ja_JP.js'
import { read_saved_language } from '../lib/locale.js'

const messages = {
  en: enLocale, zh_TW: zhTWLocale, zh_CN: zhCNLocale, es: esLocale,
  ru_RU: ruLocale, de_DE: deLocale, sv_SE: svLocale, ja_JP: jaLocale
}
const elementLocales = {
  en: elementEn, zh_TW: elementZhTw, zh_CN: elementZhCn, es: elementEs,
  ru_RU: elementRu, de_DE: elementDe, sv_SE: elementSv, ja_JP: elementJa
}
export function getElementLocale(language) {
  return Object.hasOwn(elementLocales, language) ? elementLocales[language] : elementDe
}
export function getLanguage() {
  let storage
  try {
    if (typeof window !== 'undefined') storage = window.localStorage
  } catch (_) { /* Privacy settings can also block the localStorage getter. */ }
  return read_saved_language(storage, Object.keys(messages), 'de_DE')
}
export default createI18n({
  legacy: false,
  globalInjection: true,
  locale: getLanguage(),
  fallbackLocale: 'en',
  messages
})

