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
        assert.match(section, /de3\.84-oled-t4\/Allmiibo_OLED_DE3_84_Test4_APP\.zip"/);
        assert.match(section, /releases\/tag\/de3\.84-oled-t4"/);
        assert.doesNotMatch(section, /Allmiibo_LCD_/);
        assert.match(section, page === 'en.html' ? /Test 4 awaits a report from a physical OLED/ : /Für Test 4 steht die Rückmeldung von einem echten OLED aus/);
        assert.match(section, /releases\/tag\/de3\.81-oled-t1"/);
    }
    assert.equal(openGuide('#oled', ['en']).next, base + 'en.html#oled');
});

test('both guides offer the current LCD app, full package and aligned storage target', () => {
    const release = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.81/';
    const app = release + 'Allmiibo_LCD_DE3_81_654_NUR_APP.zip';
    const combo = release + 'Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip';
    for (const file of ['index.html', 'en.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../public/guide', file), 'utf8');
        const section = id => html.split('<section id="' + id + '">')[1].split('</section>')[0];
        assert.ok(section('flash').includes(app));
        assert.match(section('flash'), /Z19, Z20 (?:oder|or) Z21/);
        assert.ok(section('bootloader').includes(combo));
        assert.match(section('bootloader'), /(?:unter|below) 21/);
        assert.match(section('littlefs'), /DE3\.81 \/ 654/);
        const lcdDownloads = [...section('programme').matchAll(/href="([^"]*Allmiibo_LCD_[^"]*\.zip)"/g)].map(match => match[1]);
        assert.deepEqual(lcdDownloads, [app, combo]);
    }
});
