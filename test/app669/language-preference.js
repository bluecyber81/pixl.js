// Shared by the Vue file manager and the standalone guide and DFU pages.
(function (browser) {
  'use strict';

  const key = 'allmiibo.language';
  const languages = ['de_DE', 'en', 'es', 'ja_JP', 'ru_RU', 'sv_SE', 'zh_CN', 'zh_TW'];
  const listeners = new Set();

  function readMode() {
    try {
      const saved = browser.localStorage.getItem(key);
      if (languages.includes(saved)) return saved;
    } catch { /* Language selection also works when storage is blocked. */ }
    return 'auto';
  }

  let mode = readMode();

  function matchLanguage(tag) {
    if (typeof tag !== 'string') return;
    try {
      const { language, script, region } = new Intl.Locale(tag.replace(/_/g, '-'));
      if (language === 'zh') {
        if (script) return script === 'Hant' ? 'zh_TW' : script === 'Hans' ? 'zh_CN' : undefined;
        return ['TW', 'HK', 'MO'].includes(region) ? 'zh_TW' : 'zh_CN';
      }
      return languages.find(locale => locale.split('_')[0] === language);
    } catch { /* Skip invalid entries and try the next browser preference. */ }
  }

  function getLocale(supported = languages) {
    if (mode !== 'auto') return supported.includes(mode) ? mode : 'en';
    const navigator = browser.navigator;
    const preferred = navigator?.languages || [];
    for (const tag of [...preferred, navigator?.language]) {
      const locale = matchLanguage(tag);
      if (locale && supported.includes(locale)) return locale;
    }
    return 'en';
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function setMode(selection) {
    if (selection !== 'auto' && !languages.includes(selection)) return false;
    mode = selection;
    try {
      if (mode === 'auto') browser.localStorage.removeItem(key);
      else browser.localStorage.setItem(key, mode);
    } catch { /* Keep the choice in this tab. */ }
    notify();
    return true;
  }

  function subscribe(callback, supported = languages) {
    let lastMode, lastLocale;
    function update() {
      const locale = getLocale(supported);
      if (lastMode === mode && lastLocale === locale) return;
      lastMode = mode;
      lastLocale = locale;
      callback({ mode, locale });
    }
    listeners.add(update);
    update();
    return () => listeners.delete(update);
  }

  browser.addEventListener('languagechange', notify);
  browser.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    // sessionStorage may emit events with the same key in a sibling frame.
    try {
      if (event.storageArea && event.storageArea !== browser.localStorage) return;
    } catch { return; }
    mode = readMode();
    notify();
  });
  browser.AllmiiboLanguage = Object.freeze({ getMode: () => mode, getLocale, setMode, subscribe });
})(window);
