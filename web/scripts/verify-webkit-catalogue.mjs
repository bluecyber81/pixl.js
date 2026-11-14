// Run from web/ with an existing Pages build and the Playwright WebKit browser.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';

const runtime = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { devices, webkit } = await import(runtime);
const base = '/pixl.js/';
const server = await preview({
    base, build: { outDir: path.resolve(process.argv[2] || 'dist-pages') },
    preview: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error'
});
const url = server.resolvedUrls.local[0];
let browser;
try {
    browser = await webkit.launch();
    for (const [locale, guide] of [['de-DE', 'index'], ['en-US', 'en']]) {
        const context = await browser.newContext({ ...devices['iPhone 13'], locale });
        try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(url);
            assert.equal(await page.evaluate(() => typeof navigator.bluetooth?.requestDevice), 'undefined');
            const help = page.getByRole('link', { name: /Bluefy/i }).first();
            await help.waitFor();
            assert.equal(new URL(await help.getAttribute('href'), page.url()).hash, '#iphone');
            await page.locator('.workspace-nav [aria-controls="catalogue-workspace"]').click();
            const toggle = page.locator('.catalogue-toggle');
            if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
            const catalogue = page.locator('.catalogue');
            await catalogue.locator('.game-filter select').selectOption('kirby-air-riders');
            const cards = catalogue.locator('.entries > li');
            await cards.first().waitFor();
            assert.equal(await cards.count(), 7);
            await catalogue.locator('.search-field input').fill('1f02010004c81e03');
            assert.equal(await cards.count(), 1);
            await page.goto(new URL('guide/' + guide + '.html#iphone', url).href);
            await page.locator('#iphone').waitFor();
            await page.locator('a[href*="apps.apple.com"][href*="1492822055"]').waitFor();
            assert.deepEqual(errors, []);
            console.log(locale + ': offline catalogue, game filter, exact ID and iPhone guide passed (WebKit ' + browser.version() + ').');
        } finally { await context.close(); }
    }
} finally {
    await browser?.close();
    await server.close();
}
