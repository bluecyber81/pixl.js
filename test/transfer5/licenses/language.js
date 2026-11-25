const labels = [...document.querySelectorAll('[data-en]')].map(element => ({
    element, de: element.textContent, en: element.dataset.en
}));
globalThis.AllmiiboLanguage.subscribe(({locale}) => {
    const lang = locale === 'de_DE' ? 'de' : 'en';
    document.documentElement.lang = lang;
    for (const label of labels) label.element.textContent = label[lang];
}, ['de_DE', 'en']);
