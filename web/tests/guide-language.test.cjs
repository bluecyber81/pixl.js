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
        const browserLink = section.match(/href="([^"\s]*dfu\/web\.html[^"\s]*)"/)?.[1];
        assert.ok(browserLink, 'OLED chapter includes the browser updater');
        const updater = new URL(browserLink, base);
        assert.equal(updater.pathname, '/pixl.js/dfu/web.html');
        assert.equal(updater.searchParams.get('package'), 'de3.87-oled-t6-app');
        assert.equal(new URLSearchParams(updater.hash.slice(1)).get('board'), 'OLED');
        assert.match(section, /de3\.87-oled-t6\/Allmiibo_OLED_DE3_87_Test6_APP\.zip"/);
        assert.match(section, /releases\/tag\/de3\.87-oled-t6"/);
        assert.doesNotMatch(section, /Allmiibo_LCD_/);
        assert.match(section, page === 'en.html' ? /Test 6 awaits a report from a physical OLED/ : /Für Test 6 steht die Rückmeldung von einem echten OLED aus/);
        assert.match(section, /releases\/tag\/de3\.81-oled-t1"/);
    }
    assert.equal(openGuide('#oled', ['en']).next, base + 'en.html#oled');
});

test('both guides offer the current LCD app, full package and aligned storage target', () => {
    const release = 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89/';
    const app = 'https://github.com/bluecyber81/pixl.js/raw/a39d43c7dea2681be1981695837b2cb8473db926/fw/releases/Allmiibo_LCD_DE3_101_674_NUR_APP.zip';
    const combo = release + 'Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip';
    for (const file of ['index.html', 'en.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../public/guide', file), 'utf8');
        const section = id => html.split('<section id="' + id + '">')[1].split('</section>')[0];
        assert.ok(section('flash').includes(app));
        assert.match(section('flash'), /Z21/);
        assert.ok(section('bootloader').includes(combo));
        assert.match(section('bootloader'), /(?:unter|below) 21/);
        assert.match(section('littlefs'), /DE3\.101 \/ 674/);
        const lcdDownloads = [...section('programme').matchAll(/href="([^"]*Allmiibo_LCD_[^"]*\.zip)"/g)].map(match => match[1]);
        assert.deepEqual(lcdDownloads, [app, combo]);
    }
});


test('guides separate the pending local App659 from the owner-tested App658 and its reversible PWM instructions', () => {
    for (const file of ['index.html', 'en.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../public/guide', file), 'utf8');
        const candidate = html.split('<h3 id="lcd-de386">')[1].split('<h3 id="lcd-de385">')[0];
        assert.match(candidate, /href="\.\.\/firmware\/Allmiibo_LCD_DE3_86_659_NUR_APP\.zip" download/);
        assert.match(candidate, /LCD\/ST7567.*PFS1.*Z21.*S112 7\.3\.0/);
        assert.match(candidate, file === 'en.html' ? /first physical check of this build is pending/ : /erste Prüfung dieser Version am Gerät steht aus/);
        assert.doesNotMatch(candidate, /_KOMPLETT|Allmiibo_OLED_|658_NUR_APP/);
        const trial = html.split('<h3 id="lcd-de385">')[1].split('<p><b>' + (file === 'en.html' ? 'Earlier' : 'Frühere'))[0];
        assert.ok(trial);
        assert.match(trial, /de3\.85-lcd-test1\/Allmiibo_LCD_DE3_85_658_NUR_APP\.zip/);
        assert.match(trial, /de3\.85-lcd-test1\/Allmiibo_LCD_DE3_85_App658_Pruefpaket\.zip/);
        assert.match(trial, /ST7567/); assert.match(trial, /PFS1/); assert.match(trial, /Z21/); assert.match(trial, /S112 7\.3\.0/);
        assert.doesNotMatch(trial, /_KOMPLETT|Allmiibo_OLED_/);
        assert.match(trial, /5% PWM/); assert.match(trial, /100%/);
        assert.match(trial, file === 'en.html' ? /owner reported successful use of App658 with file manager 3\.56\.0 on one LCD/ : /Besitzer meldete den erfolgreichen Praxistest von App658 mit Dateimanager 3\.56\.0 auf einem LCD/);
        assert.match(trial, file === 'en.html' ? /not measured physical brightness/ : /keine optisch gemessene Helligkeit/);
        assert.match(trial, file === 'en.html' ? /optional and starts off/ : /optional und anfangs aus/);
    }
    assert.equal(openGuide('#lcd-de386', ['en']).next, base + 'en.html#lcd-de386');
    assert.equal(openGuide('#lcd-de385', ['en']).next, base + 'en.html#lcd-de385');
});

test('the App660 device guide links the signed LCD application and its published source kit', () => {
    for (const file of ['index.html','en.html']) {
        const guide = fs.readFileSync(path.join(__dirname,'../public/guide',file),'utf8');
        const section = guide.split('<h3 id="lcd-de387">')[1].split('<h3 id="lcd-de386">')[0];
        assert.match(section,/Allmiibo_LCD_DE3_87_660_NUR_APP\.zip/);
        assert.ok(section.includes('https://github.com/bluecyber81/pixl.js/releases/download/de3.87-lcd-test1/Allmiibo_LCD_DE3_87_App660_Pruefpaket.zip'));
        assert.match(section,/LCD\/ST7567.*PFS1.*Z21.*S112 7\.3\.0/);
        assert.doesNotMatch(section,/KOMPLETT|Allmiibo_OLED_/);
    }
});


test('current App674 guide keeps the App673 chapter and package addressable as history', () => {
    for (const file of ['index.html', 'en.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../public/guide', file), 'utf8');
        const current = html.split('<h3 id="lcd-de3101">')[1].split('<h3 id="lcd-de3100">')[0];
        const history = html.split('<h3 id="lcd-de3100">')[1].split('<h3 id="lcd-de399">')[0];
        assert.match(current, /DE3\.101 \/ App674/);
        assert.match(current, /Allmiibo_LCD_DE3_101_674_NUR_APP\.zip/);
        assert.match(current, /package=de3\.101-lcd-app#board=LCD/);
        assert.doesNotMatch(current, /Allmiibo_LCD_DE3_100_673_NUR_APP\.zip/);
        assert.match(history, /Archi(?:v|ve): LCD DE3\.100 \/ App673/);
        assert.match(history, /Allmiibo_LCD_DE3_100_673_NUR_APP\.zip/);
        assert.match(history, /release\/lcd-de3100-app673/);
        assert.equal(openGuide('en.html#lcd-de3100', ['de']).alternate.href, base + 'index.html#lcd-de3100');
    }
});

test('both guides open the browser sender without connecting and explain its App673 compatibility and separate stop', () => {
    for (const file of ['index.html', 'en.html']) {
        const html = fs.readFileSync(path.join(__dirname, '../public/guide', file), 'utf8');
        const chapter = html.split('<section id="bild-video">')[1].split('</section>')[0];
        const direct = chapter.match(/href="([^"]*workspace=stream)"/)?.[1];
        const target = new URL(direct, base);
        assert.equal(target.pathname, '/pixl.js/');
        assert.deepEqual([...target.searchParams], [['workspace', 'stream']]);
        assert.match(chapter, /DE3\.100\/App673/);
        assert.match(chapter, /128 × 64/);
        assert.match(chapter, file === 'en.html' ? /Selecting a file and connecting alone do not send images/ : /Auswahl und das Verbinden allein senden keine Bilder/);
        assert.match(chapter, file === 'en.html' ? /Center exits the receiver/ : /Mitte beendet den Bildempfang/);
        assert.match(chapter, file === 'en.html' ? /file stays.*not uploaded/ : /Datei bleibt.*nicht hochgeladen/);
        assert.match(chapter, file === 'en.html' ? /Actual rate depends/ : /tatsächliche Rate hängt/);
        assert.match(chapter, file === 'en.html' ? /OLED does not support/ : /OLED unterstützt.*nicht/);
    }
});
