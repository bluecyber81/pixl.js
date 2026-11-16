const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const base = 'https://example.test/pixl.js/guide/';
const sharedScript = fs.readFileSync(path.join(__dirname, '../public/language-preference.js'), 'utf8');
const guideScript = fs.readFileSync(path.join(__dirname, '../public/guide/language.js'), 'utf8');
function openGuide(link, languages, saved) {
    const location = new URL(link, base);
    let next;
    location.replace = url => { next = url; };
    const events = {}, clicks = {};
    const en = location.pathname.endsWith('/en.html');
    const alternate = { href: new URL(en ? 'index.html' : 'en.html', base).href,
        hreflang: en ? 'de' : 'en', addEventListener: (name, fn) => { clicks[name] = fn; } };
    const context = { URL, location, navigator: { languages },
        localStorage: { getItem: () => saved, setItem: (key, value) => { saved = value; } },
        addEventListener: (name, fn) => { events[name] = fn; }, document: { querySelector: () => alternate } };
    context.window = context;
    vm.runInNewContext(sharedScript, context);
    vm.runInNewContext(guideScript, context);
    return { next, location, alternate, events, clicks, get saved() { return saved; } };
}
test('neutral guide selects a supported language, preserving query and chapter', () => {
    assert.equal(openGuide('?source=true#littlefs', ['es', 'en-GB']).next, base + 'en.html?source=true#littlefs');
    assert.equal(openGuide('', ['es', 'de-AT']).next, undefined);
    assert.equal(openGuide('', ['de-AT'], 'en').next, base + 'en.html');
});
test('named guide pages remain addressable and manual switching retains the current chapter', () => {
    const page = openGuide('en.html?q=1#flash', ['de']);
    assert.equal(page.next, undefined);
    assert.equal(page.alternate.href, base + 'index.html?q=1#flash');
    page.location.hash = '#bootloader';
    page.events.hashchange();
    assert.equal(page.alternate.href, base + 'index.html?q=1#bootloader');
    page.clicks.click();
    assert.equal(page.saved, 'de_DE');
    assert.equal(openGuide('index.html#littlefs', ['en']).next, undefined);
});

test('both guide languages link to a dedicated OLED chapter with the published phone package', () => {
    for (const page of ['index.html', 'en.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../public/guide', page), 'utf8');
        assert.match(html, /href="#oled"/);
        const section = html.match(/<section id="oled">([\s\S]*?)<\/section>/)?.[1];
        assert.ok(section);
        assert.match(section, /de3\.81-oled-t1\/Allmiibo_OLED_DE3_81_Test1_APP\.zip"/);
        assert.match(section, /de3\.81-oled-t1\/Allmiibo_OLED_Test1_Deutsch_English\.txt"/);
        assert.doesNotMatch(section, /Allmiibo_LCD_/);
        assert.match(section, page === 'en.html' ? /reports that the preview works on their OLED/ : /auf seinem OLED funktioniert/);
    }
    assert.equal(openGuide('#oled', ['en']).next, base + 'en.html#oled');
});
