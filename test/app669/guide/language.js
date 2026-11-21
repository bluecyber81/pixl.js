// A directory link follows preferences. Named German and English pages remain shareable.
(() => {
    const preference = globalThis.AllmiiboLanguage;
    const location = window.location;
    const url = new URL(location.href);
    if (url.pathname.endsWith('/') && preference.getLocale(['de_DE', 'en']) === 'en') {
        url.pathname += 'en.html';
        location.replace(url.href);
        return;
    }

    const alternate = document.querySelector('nav a[hreflang]');
    const target = new URL(alternate.href);
    function updateLink() {
        target.search = location.search;
        target.hash = location.hash;
        alternate.href = target.href;
    }
    updateLink();
    window.addEventListener('hashchange', updateLink);
    alternate.addEventListener('click', () => {
        preference.setMode(alternate.hreflang === 'de' ? 'de_DE' : 'en');
    });
})();
