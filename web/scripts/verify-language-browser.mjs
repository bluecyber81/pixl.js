import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [directory, base, report] = process.argv.slice(2);
assert.ok(directory && report && ['/', '/pixl.js/'].includes(base),
  'Usage: node scripts/verify-language-browser.mjs <dist> </ or /pixl.js/> <output.json>');
const root = path.resolve(directory);
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    assert.ok(pathname.startsWith(base));
    const file = path.resolve(root, pathname.slice(base.length) + (pathname.endsWith('/') ? 'index.html' : ''));
    assert.ok(file.startsWith(root + path.sep));
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch { response.writeHead(404).end(); }
});
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const checks = [];
const pageErrors = [];
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const site = origin + base;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE });

  async function open(locale, languages) {
    const context = await browser.newContext({ locale, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    if (languages) {
      await context.addInitScript(preferences => {
        Object.defineProperty(navigator, 'languages', { configurable: true, get: () => preferences });
      }, languages);
    }
    const page = await context.newPage();
    page.on('pageerror', err => pageErrors.push(err.message));
    page.setDefaultTimeout(8000);
    await page.goto(site);
    return page;
  }

  async function screen(page, lang, heading) {
    await page.locator('html[lang="' + lang + '"]').waitFor({ state: 'attached' });
    await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
  }
  async function choose(page, label) {
    await page.locator('.header-language button').click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
  }
  const preference = page => page.evaluate(() => localStorage.getItem('allmiibo.language'));

  const german = await open('de-AT');
  await screen(german, 'de-DE', 'Dateimanager');
  assert.equal(await preference(german), null);
  checks.push('de-AT starts in German without saving a manual choice');
  await choose(german, 'English');
  await screen(german, 'en', 'File manager');
  await german.reload();
  await screen(german, 'en', 'File manager');
  assert.equal(await preference(german), 'en');
  checks.push('manual English selection persists after reload');
  await german.goto(site + 'dfu/web.html');
  await screen(german, 'en', 'Update firmware');
  await german.goto(site + 'guide/#littlefs');
  await screen(german, 'en', 'Update your Allmiibo');
  assert.equal(new URL(german.url()).hash, '#littlefs');
  checks.push('DFU and guide share the selected language and the guide keeps the chapter');
  await german.goto(site);
  await choose(german, 'Automatic (browser language)');
  await screen(german, 'de-DE', 'Dateimanager');
  assert.equal(await preference(german), null);
  await german.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['en-GB'] });
    window.dispatchEvent(new Event('languagechange'));
  });
  await screen(german, 'en', 'File manager');
  checks.push('returning to automatic clears the override and follows languagechange');
  await german.context().close();

  const ordered = await open('fr-FR', ['fr-FR', 'es-MX', 'de-CH', 'en-GB']);
  await ordered.locator('html[lang="es"] .header-language button').getByText('Idioma / Language', { exact: true }).waitFor();
  await ordered.goto(site + 'dfu/web.html');
  await screen(ordered, 'de', 'Firmware übertragen');
  await ordered.goto(site + 'guide/#diagnose');
  await screen(ordered, 'de', 'Allmiibo aktualisieren');
  assert.equal(new URL(ordered.url()).hash, '#diagnose');
  checks.push('ordered preferences choose Spanish in the file manager and German on bilingual pages');
  await ordered.context().close();

  const unsupported = await open('fr-FR');
  await screen(unsupported, 'en', 'File manager');
  await unsupported.goto(site + 'dfu/web.html');
  await screen(unsupported, 'en', 'Update firmware');
  await unsupported.goto(site + 'guide/');
  await screen(unsupported, 'en', 'Update your Allmiibo');
  checks.push('unsupported browser language falls back to English on all three surfaces');
  assert.deepEqual(pageErrors, []);
  await writeFile(report, JSON.stringify({ base, checks }, null, 2) + '\n');
  console.log(checks.length + ' language checks passed for ' + base);
} finally {
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
