// Check a served build in Chromium using simulated browser capabilities and no physical device.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const target = new URL(process.argv[2]);
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE });
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)';
const profiles = [
    {name:'iPhone Safari', ua:iphone + ' Version/18.0 Mobile Safari/604.1', locale:'de-DE', platform:'iPhone', touch:5, appleHelp:true},
    {name:'iPhone Chrome', ua:iphone + ' CriOS/142.0 Mobile Safari/604.1', locale:'en-US', platform:'iPhone', touch:5, appleHelp:true},
    {name:'iPad desktop', ua:mac + ' Version/18.0 Safari/605.1.15', locale:'de-DE', platform:'MacIntel', touch:5, appleHelp:true},
    {name:'Bluefy-style API', ua:iphone, locale:'en-US', platform:'iPhone', touch:5, bluetooth:true},
    {name:'Mac desktop', ua:mac, locale:'en-US', platform:'MacIntel', touch:0},
];
try {
    for (const profile of profiles) {
        const context = await browser.newContext({ userAgent: profile.ua, locale: profile.locale, viewport: {width:390, height:844} });
        try {
            await context.addInitScript(({platform, touch, bluetooth}) => {
                Object.defineProperties(navigator, {
                    platform:{value:platform}, maxTouchPoints:{value:touch},
                    bluetooth:{value:bluetooth ? {requestDevice(){throw Error('Unexpected device selection');}} : undefined}
                });
            }, profile);
            const page = await context.newPage(), errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(target.href);
            const connect = page.locator('.header-tools > button');
            await connect.waitFor();
            assert.equal(await connect.isEnabled(), !!profile.bluetooth);
            const help = page.locator('.notice a[href$="#iphone"]');
            assert.equal(await help.isVisible(), !!profile.appleHelp);
            if (profile.appleHelp) {
                await help.click();
                const heading = page.locator('h3#iphone');
                await heading.waitFor();
                assert.equal(await heading.textContent(), profile.locale === 'de-DE' ? 'iPhone und iPad' : 'iPhone and iPad');
                assert.match(await page.getByRole('link', {name:/Bluefy/}).getAttribute('href'), /apps\.apple\.com\/.*id1492822055$/);
                await page.goto(target.href);
            }
            await page.locator('.workspace-nav [aria-controls="catalogue-workspace"]').click();
            const toggle = page.locator('.catalogue-toggle');
            if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
            const catalogue = page.locator('.catalogue');
            await catalogue.locator('.game-filter select').selectOption('kirby-air-riders');
            await catalogue.locator('.entries li code').filter({hasText:'1f02010004c81e03'}).waitFor();
            await page.goto(new URL('dfu/web.html', target).href);
            assert.equal(await page.locator('#apple-guide').isVisible(), !!profile.appleHelp);
            assert.equal(await page.locator('#file').isEnabled(), true);
            assert.deepEqual(errors, []);
            console.log(profile.name + ' · catalogue, guidance and DFU package inspection passed');
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
