// Exact production bundle in isolated installed Chrome, with real DOM actions.
// No component harness, Vue state injection, device connection or private files.
// All input files are synthetic. Two HTTPS fixtures are fulfilled in memory.
// Every other nonlocal page request is blocked.
// Existing runtime only: PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs
// node scripts/verify-collection-tools-browser.mjs <dist> <evidence> [base-path]
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { syntheticConfig, syntheticSlot } from '../tests/fixtures/chameleon-slot-synthetic.mjs';
import { figureUsage } from '../src/lib/figure-usage.js';
import { checkDeviceSearchAndCsv } from './check-device-search-csv-browser.mjs';

const root = path.resolve(process.argv[2] || 'dist'), output = path.resolve(process.argv[3] || 'browser-collection-evidence');
const base = process.argv[4] || '/';
assert.match(base, /^\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*$/);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const usage = JSON.parse(await fs.readFile(new URL('../src/data/figure-usage.json', import.meta.url)));
const catalogue = JSON.parse(await fs.readFile(new URL('../src/data/catalogue.json', import.meta.url)));
const notes = new Map(usage.notes.map(note => [note.id, note]));
const available = figure => catalogue.entries.some(entry => entry.id === figure.id);
const german = usage.figures.find(figure => available(figure) && figure.associations.some(row => notes.get(row.noteId)?.de));
const wolfLink = usage.figures.find(figure => available(figure) && figure.associations.some(row => notes.get(row.noteId)?.en === 'Wolf Link (hearts depend on save data)'));
const empty = usage.figures.find(figure => available(figure) && figure.associations.every(row => !notes.get(row.noteId)?.en));
assert.ok(german && wolfLink && empty, 'real bundled catalogue test cases exist');
const germanNote = figureUsage(german.id, usage, 'de_DE').find(row => row.translated);
const config = Buffer.from(syntheticConfig(1103, 1, 2)), slot = Buffer.from(syntheticSlot()), original = Buffer.from(slot);
const unknownFigure = Buffer.alloc(540);
unknownFigure.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4]);
unknownFigure.set(Buffer.from('f1234567f1234502', 'hex'), 84);
const marioId = '0000000000000002', siblingId = '0000000000340102';
const marioUrl = 'https://fixtures.example.org/mario.bin', siblingUrl = 'https://fixtures.example.org/sibling.bin';
function syntheticFigure(id) {
  const bytes = Buffer.from(unknownFigure);
  bytes.set(Buffer.from(id, 'hex'), 84);
  bytes.write('synthetic browser fixture', 180, 'ascii');
  return bytes;
}
const figureFixtures = new Map([[marioUrl, syntheticFigure(marioId)], [siblingUrl, syntheticFigure(siblingId)]]);
const fixtureRequests = [];
const blockedUrl = 'https://fixtures.example.org/blocked.bin';
await fs.mkdir(output, { recursive: true });
const hashes = {}, checks = [], screenshots = [], layouts = [], errors = [], externalAttempts = [], downloads = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
async function hashTree(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) await hashTree(filename);
    else if (entry.isFile()) hashes[path.relative(root, filename).replaceAll('\\', '/')] = sha256(await fs.readFile(filename));
  }
}
await hashTree(root);
const mime = { '.html': 'text/html', '.js': 'text/javascript','.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(base)) throw Error('outside base');
    const suffix = pathname.slice(base.length), filename = path.resolve(root, suffix.endsWith('/') ? suffix + 'index.html' : suffix || 'index.html');
    if (!filename.startsWith(root + path.sep)) throw Error('outside root');
    const bytes = await fs.readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
async function shot(page, name, locator, frame = 'clip') {
  const file = name + '.png', filename = path.join(output, file);
  if (frame === 'element') {
    await locator.screenshot({ path: filename, animations: 'disabled' });
  } else if (frame === 'viewport') {
    await page.screenshot({ path: filename, animations: 'disabled' });
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
    const clip = await locator.boundingBox(); assert.ok(clip, name + ' visible screenshot target');
    await page.screenshot({ path: filename, fullPage: true, clip, animations: 'disabled' });
  }
  screenshots.push({ file, sha256: sha256(await fs.readFile(filename)) });
}
async function textScale(page, factor) {
  // Explicit text-only zoom simulation: double every computed font size,
  // preserving viewport, images, dimensions and control geometry. Compute the
  // original sizes together to avoid recursively multiplying inherited fonts.
  await page.evaluate(factor => {
    for (const [element, original] of window.__fontScaleOriginals || []) {
      if (original.value) element.style.setProperty('font-size', original.value, original.priority);
      else element.style.removeProperty('font-size');
    }
    window.__fontScaleOriginals = [];
    if (factor === 1) return;
    const measured = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize), { value: element.style.getPropertyValue('font-size'), priority: element.style.getPropertyPriority('font-size') }]);
    for (const [element, size, original] of measured) {
      if (size > 0 && Number.isFinite(size)) { window.__fontScaleOriginals.push([element, original]); element.style.setProperty('font-size', `${size * factor}px`, 'important'); }
    }
  }, factor);
}
async function fits(page, name, selector, factor) {
  await textScale(page, factor);
  const measured = await page.evaluate(selector => {
    const target = document.querySelector(selector), box = target.getBoundingClientRect();
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, panel: { width: box.width, scroll: target.scrollWidth, client: target.clientWidth },
      textZoom: window.__fontScaleOriginals?.length ? 2 : 1,
      visibleOverflow: [...target.querySelectorAll('*')].filter(el => {
        const rect = el.getBoundingClientRect(); return rect.width && rect.height && (rect.right > innerWidth + 1 || rect.left < -1);
      }).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })),
      globalOverflow: [...document.querySelectorAll('body *')].filter(el => {
        const rect = el.getBoundingClientRect(); return rect.width && rect.height && (rect.right > innerWidth + 1 || rect.left < -1);
      }).slice(0, 16).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })),
      internalOverflow: [target, ...target.querySelectorAll('*')].filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, scroll: el.scrollWidth, client: el.clientWidth })) };
  }, selector);
  layouts.push({ name, ...measured });
  if (measured.document > measured.viewport + 1 || measured.panel.scroll > measured.panel.client + 1 || measured.visibleOverflow.length) {
    await page.screenshot({ path: path.join(output, 'overflow-' + name.replaceAll(' ', '-') + '.png'), fullPage: true, animations: 'disabled' });
  }
  check(name + ' document fits viewport', measured.document <= measured.viewport + 1);
  check(name + ' panel has no horizontal overflow', measured.panel.scroll <= measured.panel.client + 1);
  check(name + ' controls and text remain inside viewport', measured.visibleOverflow.length === 0);
}
async function chooseLanguage(page, language) {
  await textScale(page, 1);
  await page.locator('.header-language button').click();
  await page.getByRole('menuitem', { name: language === 'en' ? 'English' : 'Deutsch', exact: true }).click();
  await page.waitForFunction(language => document.querySelector('.workspace-nav button[aria-controls="catalogue-workspace"] strong')?.textContent === (language === 'en' ? 'Figure catalogue' : 'Figurenkatalog'), language);
}
async function selectFigure(page, id) {
  await textScale(page, 1);
  const search = page.locator('.catalogue .search-field input');
  await search.fill(id);
  const entry = page.locator('.catalogue .entries > li').filter({ has: page.locator('code', { hasText: id }) });
  await entry.waitFor();
  const details = entry.getByRole('button', { name: /^Details (zu|for) / }); await details.focus(); await page.keyboard.press('Enter');
  const panel = page.locator('.catalogue .selected-detail'); await panel.waitFor();
  await page.waitForFunction(id => document.querySelector('.catalogue .selected-detail')?.textContent.includes(id), id);
  return panel.locator('.figure-usage');
}
async function checkFigureDownloads(page, kind, zoom, touch) {
  const requests = () => fixtureRequests.filter(row => row.kind === kind);
  const seenDownloads = [];
  page.on('download', file => seenDownloads.push(file.suggestedFilename()));
  const search = page.locator('.catalogue .search-field input');
  const card = page.locator('.catalogue .entries > li').filter({ has: page.getByText(marioId, { exact: true }) });
  const sibling = page.locator('.catalogue .entries > li').filter({ has: page.getByText(siblingId, { exact: true }) });
  const editor = card.locator('.figure-download-link');
  const summary = editor.locator('summary');
  const input = editor.locator('input[type="url"]');
  const save = editor.getByRole('button', { name: 'Link speichern', exact: true });
  const remove = editor.getByRole('button', { name: 'Link entfernen', exact: true });
  const importSource = page.locator('.figure-import input[type="url"]');
  const download = card.getByRole('button', { name: 'Mario herunterladen', exact: true });
  const activateDownload = () => touch ? download.tap() : download.press('Enter');

  await textScale(page, 1);
  await search.fill(marioId);
  await card.waitFor();
  check(kind + ' new figure has link editor and no download action',
    (await summary.innerText()) === 'Downloadlink eintragen' && !await download.count());
  await summary.click();
  await input.fill(siblingUrl);
  await save.click(); await input.waitFor({ state: 'hidden' });
  await download.waitFor();
  await search.fill(siblingId);
  await sibling.waitFor();
  check(kind + ' same-name Mario variant has its own link setting',
    !await sibling.getByRole('button', { name: 'Mario herunterladen', exact: true }).count() &&
    (await sibling.locator('.figure-download-link summary').innerText()) === 'Downloadlink eintragen');
  check(kind + ' no Bluetooth request before catalogue reload', await page.evaluate(() => window.__testBleRequests === 0));
  await page.reload();
  await page.locator('.workspace-nav button[aria-controls="catalogue-workspace"]').click();
  await search.fill(marioId);
  await download.waitFor();
  check(kind + ' download link survives page reload', (await summary.innerText()) === 'Downloadlink bearbeiten');
  await summary.click();
  check(kind + ' saved address shown for the selected ID', await input.inputValue() === siblingUrl);
  await summary.click();
  await card.getByRole('button', { name: 'Details zu Mario', exact: true }).click();
  await page.locator('.catalogue .selected-detail').getByRole('button', { name: 'Details schließen' }).click();
  check(kind + ' import form uses the selected variant’s saved link', await importSource.inputValue() === siblingUrl);
  check(kind + ' saving, switching figures and reloading make zero file requests and zero downloads',
    !requests().length && !seenDownloads.length);

  await activateDownload();
  const mismatch = card.getByRole('status').filter({ hasText: 'Die Datei gehört zu einer anderen Figuren-ID' });
  await mismatch.waitFor();
  check(kind + ' wrong ID produces figure mismatch message', await mismatch.isVisible());
  assert.deepEqual(requests().map(({ method, url }) => [method, url]), [['GET', siblingUrl]]);
  check(kind + ' wrong variant requested once without creating a download', seenDownloads.length === 0);

  await summary.click();
  await input.fill(marioUrl);
  await save.click(); await input.waitFor({ state: 'hidden' });
  await download.waitFor();
  check(kind + ' editing a stored link updates the selected import source in the same tab', await importSource.inputValue() === marioUrl);
  check(kind + ' editing a source makes no file request', requests().length === 1);
  await fits(page, kind + ' saved catalogue download', '.catalogue .entries > li', zoom);
  await shot(page, kind + '-figure-download', card);
  const downloadEvent = page.waitForEvent('download');
  await activateDownload();
  const file = await downloadEvent, filename = 'Mario_' + marioId + '.bin';
  const bytes = await fs.readFile(await file.path());
  assert.deepEqual(bytes, figureFixtures.get(marioUrl));
  assert.deepEqual(requests().map(({ method, url }) => [method, url]), [['GET', siblingUrl], ['GET', marioUrl]]);
  assert.deepEqual(seenDownloads, [filename]);
  check(kind + ' explicit action downloads exactly one byte-identical 540-byte BIN for the selected ID',
    bytes.length === 540 && file.suggestedFilename() === filename);
  downloads.push({ kind, filename, size: bytes.length, sha256: sha256(bytes), synthetic: true });
  await file.saveAs(path.join(output, kind + '-' + filename));
  await textScale(page, 1);
  await summary.click();
  await remove.click();
  await download.waitFor({ state: 'detached' });
  check(kind + ' removing the link restores setup without fetching',
    (await summary.innerText()) === 'Downloadlink eintragen' && await importSource.inputValue() === '' && requests().length === 2);
  const manualUrl = 'https://fixtures.example.org/manual.bin';
  await importSource.fill(manualUrl);
  await summary.click();
  await input.fill(marioUrl);
  await save.click(); await input.waitFor({ state: 'hidden' });
  await download.waitFor();
  check(kind + ' storing another link preserves a manually entered import address without fetching',
    await importSource.inputValue() === manualUrl && requests().length === 2 && seenDownloads.length === 1);
  await summary.click();
  await input.fill(blockedUrl);
  await save.click(); await input.waitFor({ state: 'hidden' });
  await activateDownload();
  const fallback = card.locator('.manual-download');
  const source = fallback.getByRole('link', { name: 'Quelle im Browser öffnen' });
  await source.waitFor();
  check(kind + ' blocked source opens only by user action and without a referrer',
    await source.getAttribute('href') === blockedUrl && await source.getAttribute('referrerpolicy') === 'no-referrer');
  const local = fallback.locator('input[type=file]');
  await local.setInputFiles({ name: 'Mario.bin', mimeType: 'application/octet-stream', buffer: figureFixtures.get(siblingUrl) });
  await card.getByRole('status').filter({ hasText: 'Diese BIN gehört zu einer anderen Figur' }).waitFor();
  check(kind + ' same filename with another ID is rejected after manual download',
    !await fallback.getByRole('button', { name: 'Im Geräteimport öffnen' }).count());
  await local.setInputFiles({ name: 'Mario.bin', mimeType: 'application/octet-stream', buffer: figureFixtures.get(marioUrl) });
  await fallback.getByRole('button', { name: 'Im Geräteimport öffnen' }).click();
  const prepared = page.locator('.figure-import .prepared');
  await prepared.waitFor();
  check(kind + ' locally verified bytes reach the import for the same figure',
    (await prepared.innerText()).includes(sha256(figureFixtures.get(marioUrl))) &&
    (await page.locator('.figure-import .chosen').innerText()).includes(marioId));
  check(kind + ' checking locally does not start another download or write', seenDownloads.length === 1 &&
    await prepared.getByRole('button', { name: 'Auf Gerät übertragen' }).isDisabled());
}
async function checkColdImportShortcut(action) {
  const context = await browser.newContext({ locale: 'de-DE', serviceWorkers: 'block' });
  const chunk = /\/CollectionAssistant-[^/]+\.js$/;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await context.addInitScript(() => {
      window.importFocusCount = 0;
      document.addEventListener('focusin', event => {
        if (event.target.matches('.figure-import')) window.importFocusCount++;
      });
      Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {} });
    });
    await context.route('**/*', async route => {
      const resource = new URL(route.request().url());
      if (resource.origin !== origin) return route.abort();
      if (chunk.test(resource.pathname)) await gate;
      return route.continue();
    });
    const page = await context.newPage();
    const pendingRequest = page.waitForRequest(request => chunk.test(new URL(request.url()).pathname));
    await page.goto(origin + base, { waitUntil: 'domcontentloaded' });
    await page.locator('.start-figure').click();
    await pendingRequest;
    await page.waitForFunction(() => document.activeElement?.id === 'catalogue-workspace');
    assert.equal(await page.locator('.figure-import').count(), 0);

    if (action === 'leave' || action === 'return') {
      await page.locator('.workspace-nav [aria-controls="update-workspace"]').click();
      if (action === 'return') await page.locator('.workspace-nav [aria-controls="catalogue-workspace"]').click();
    } else if (action === 'continue-in-catalogue') {
      await page.locator('.catalogue-toggle').click();
    }
    const expected = { open: '.figure-import', leave: '#update-workspace summary',
      return: '#catalogue-workspace', 'continue-in-catalogue': '.catalogue-toggle' }[action];
    if (action !== 'open') await page.waitForFunction(selector => document.activeElement?.matches(selector), expected);
    release();
    await page.locator('.figure-import').waitFor({ state: 'attached' });
    await page.waitForFunction(selector => document.activeElement?.matches(selector), expected);
    check('delayed collection chunk: ' + action + ' preserves the requested focus', await page.evaluate(() => window.importFocusCount) === (action === 'open' ? 1 : 0));
  } finally { release(); await context.close(); }
}

let failure = null;
try {
  for (const action of ['open', 'leave', 'return', 'continue-in-catalogue']) await checkColdImportShortcut(action);
  await checkDeviceSearchAndCsv({ browser, url: origin + base, check, shot });
  for (const [kind, viewport, zoom] of [
    ['desktop', { width: 1440, height: 1000 }, 1], ['mobile', { width: 390, height: 844 }, 1],
    ['desktop-text200', { width: 1440, height: 1000 }, 2], ['mobile-text200', { width: 390, height: 844 }, 2],
  ]) {
    const touch = kind.startsWith('mobile');
    const context = await browser.newContext({ viewport, hasTouch: touch, locale: 'de-DE', deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => {
      window.__testBleRequests = 0;
      Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => { window.__testBleRequests++; throw Error('No hardware in browser tests'); } } });
    });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      if (url === blockedUrl) return route.abort('accessdenied');
      if (figureFixtures.has(url)) {
        const bytes = figureFixtures.get(url);
        fixtureRequests.push({ kind, method: route.request().method(), url });
        return route.fulfill({ status: 200, headers: {
          'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length), 'Access-Control-Allow-Origin': origin
        }, body: bytes });
      }
      externalAttempts.push({ kind, url }); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ kind, message: error.message }));
    await page.goto(origin + base);
    await page.locator('.version-context').waitFor();
    check(kind + ' exact web version 3.45.0', (await page.locator('.version-context').innerText()).includes('3.45.0'));
    const starts = page.locator('.start-actions');
    await fits(page, kind + ' start actions', '.start-actions', zoom);
    await starts.getByRole('button', { name: /Ich möchte eine Figur hinzufügen/ }).click();
    await page.waitForFunction(() => document.activeElement?.matches('.figure-import'));
    check(kind + ' figure shortcut goes directly to the import even offline', await page.locator('.figure-import input[type=search]').isVisible());
    await page.locator('.workspace-nav button[aria-controls="file-workspace"]').click();
    await starts.getByRole('button', { name: /Ich möchte die Firmware aktualisieren/ }).click();
    check(kind + ' firmware shortcut opens the package overview and keeps DFU idle',
      await page.locator('#update-workspace .firmware-packages').isVisible() && context.pages().length === 1 &&
      await page.evaluate(() => window.__testBleRequests === 0));
    const diagnosticNavigation = page.locator('.workspace-nav button[aria-controls="device-overview"]');
    await diagnosticNavigation.focus(); await page.keyboard.press('Enter');
    const card = page.locator('.card-slot-inspection'); await card.waitFor();
    await card.locator('summary').focus(); await page.keyboard.press('Enter');
    check(kind + ' card details open by keyboard', await card.evaluate(el => el.open));
    await page.keyboard.press('Tab');
    check(kind + ' keyboard reaches local config file input', await card.locator('input').evaluate(el => el === document.activeElement));
    await card.locator('input').setInputFiles({ name: 'config.bin', mimeType: 'application/octet-stream', buffer: config });
    await card.locator('select').waitFor();
    check(kind + ' no slot selected implicitly', await card.locator('select').inputValue() === '');
    await card.locator('select').selectOption('1');
    const slotInput = card.locator('input').nth(1); await slotInput.waitFor();
    await slotInput.setInputFiles({ name: '00.bin', mimeType: 'application/octet-stream', buffer: slot });
    await card.getByRole('alert').waitFor();
    check(kind + ' mismatched slot filename rejected', (await card.getByRole('alert').innerText()).includes('01.bin'));
    check(kind + ' mismatch exposes no repair action', await card.getByRole('button', { name: 'Korrigierte Kopie herunterladen' }).count() === 0);
    await shot(page, kind + '-slot-wrong-name', card);
    await slotInput.setInputFiles({ name: '01.bin', mimeType: 'application/octet-stream', buffer: slot });
    await card.getByRole('button', { name: 'Korrigierte Kopie herunterladen' }).waitFor();
    check(kind + ' known defect with valid BCC', (await card.innerText()).includes('BCC0: ja · BCC1: ja'));
    await fits(page, kind + ' card diagnosis', '.card-slot-inspection', zoom);
    await shot(page, kind + '-slot-diagnosis', card);
    const downloadPromise = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Korrigierte Kopie herunterladen' }).focus(); await page.keyboard.press('Enter');
    const download = await downloadPromise, corrected = await fs.readFile(await download.path());
    check(kind + ' corrected copy filename', download.suggestedFilename() === '01.uid-corrected.bin');
    const changedOffsets = [...slot.keys()].filter(index => slot[index] !== corrected[index]);
    assert.deepEqual(changedOffsets, [7, 8, 9, 10]); assert.deepEqual(slot, original); assert.equal(corrected.length, slot.length);
    check(kind + ' only UID bytes 7..10 changed and source preserved', true);
    downloads.push({ kind, filename: download.suggestedFilename(), size: corrected.length, changedOffsets, sha256: sha256(corrected), synthetic: true });
    await download.saveAs(path.join(output, kind + '-01.uid-corrected.bin'));
    await textScale(page, 1);
    await page.locator('.workspace-nav button[aria-controls="catalogue-workspace"]').click();
    await page.locator('.catalogue .search-field input').waitFor();
    const announced = page.locator('.catalogue .announcements');
    await announced.locator('summary').focus(); await page.keyboard.press('Enter');
    check(kind + ' official announcements list contains nine linked figures', await announced.locator('li > a').count() === 9 && await announced.evaluate(el => el.open));
    check(kind + ' exactly two Zelda community ID proposals', await announced.locator('.proposed-id').count() === 2);
    await fits(page, kind + ' nine announcements', '.catalogue .announcements', zoom);
    await shot(page, kind + '-announcements-de', announced);
    await textScale(page, 1);
    await announced.locator('summary').click();
    const seriesFilters = page.locator('.catalogue details').filter({ has: page.locator('.filters select') });
    await seriesFilters.locator('summary').click();
    const series = seriesFilters.locator('label').filter({ hasText: /^Serie/ }).getByRole('combobox');
    await series.selectOption({ label: 'Metroid Ravenous' });
    await announced.locator('li').first().waitFor();
    check(kind + ' selected announcement-only series opens with its own title and count',
      await announced.evaluate(el => el.open) && await announced.locator('.group-title strong').innerText() === 'Metroid Ravenous' &&
      await announced.locator('summary').innerText() === 'Angekündigte Figuren (3)');
    check(kind + ' three Metroid announcements remain separate from catalogue ID and device counts',
      await announced.locator('li > a').count() === 3 && await page.locator('.catalogue .entries > li').count() === 0 &&
      (await page.locator('.catalogue .result-bar').innerText()).includes('0 Treffer mit Katalog-ID'));
    await page.locator('.catalogue .presence-filter select').selectOption('missing');
    check(kind + ' missing inventory excludes the announcement-only series',
      await announced.count() === 0 && await page.locator('.catalogue .entries > li').count() === 0);
    await page.locator('.catalogue .reset-filters').click();
    await seriesFilters.locator('summary').click();
    await page.locator('.catalogue .search-field input').fill('0101000004ff0902');
    check(kind + ' proposed Zelda ID outside main inventory', await announced.locator('li').count() === 1 && await page.locator('.catalogue .entries > li').count() === 0);
    await chooseLanguage(page, 'en');
    check(kind + ' English Nintendo guide and proposed ID', (await announced.innerText()).includes('Unconfirmed community ID') && await announced.getByRole('link', { name: 'Nintendo game guide' }).count() === 1);
    await chooseLanguage(page, 'de_DE');
    let usagePanel = await selectFigure(page, german.id);
    check(kind + ' German catalogue version is visible', await usagePanel.locator('.usage-version').innerText() === `Katalogstand: ${usage.dataVersion}`);
    check(kind + ' exact German editorial translation', (await usagePanel.innerText()).includes(germanNote.text));
    check(kind + ' translation visibly labelled', (await usagePanel.innerText()).includes('Redaktionelle Übersetzung aus dem Englischen'));
    const originalSummary = usagePanel.locator('.usage-original summary').first();
    await originalSummary.focus(); await page.keyboard.press('Enter');
    check(kind + ' English source expands by keyboard', (await usagePanel.locator('.usage-original[open]').innerText()).includes(germanNote.original));
    check(kind + ' source link has exact pinned source line', (await usagePanel.locator('a').first().getAttribute('href')) === germanNote.sourceUrl);
    await fits(page, kind + ' German catalogue usage', '.selected-detail .figure-usage', zoom);
    await shot(page, kind + '-usage-de', usagePanel);
    await chooseLanguage(page, 'en');
    usagePanel = page.locator('.catalogue .selected-detail .figure-usage');
    check(kind + ' English catalogue version is visible', await usagePanel.locator('.usage-version').innerText() === `Catalogue version: ${usage.dataVersion}`);
    check(kind + ' English source rendered in English locale', (await usagePanel.innerText()).includes(germanNote.original));
    check(kind + ' English does not claim German translation', await usagePanel.locator('.usage-language').count() === 0);
    await fits(page, kind + ' English catalogue usage', '.selected-detail .figure-usage', zoom);
    await shot(page, kind + '-usage-en', usagePanel);
    await chooseLanguage(page, 'de_DE');
    usagePanel = await selectFigure(page, wolfLink.id);
    check(kind + ' Wolf Link shows its German save-data condition', (await usagePanel.innerText()).includes('Herzen hängen von den Speicherdaten ab'));
    check(kind + ' translation keeps its English source available', await usagePanel.locator('.usage-original').count() > 0);
    await fits(page, kind + ' translated catalogue usage', '.selected-detail .figure-usage', zoom);
    await shot(page, kind + '-usage-wolf-link', usagePanel);
    usagePanel = await selectFigure(page, empty.id);
    check(kind + ' note-free association is labelled', (await usagePanel.innerText()).includes('Katalogzuordnung ohne deutschen oder englischen Nutzungshinweis'));
    check(kind + ' no unearned compatibility claim', (await usagePanel.innerText()).includes('Keine Bestätigung der Spielkompatibilität oder Belohnungen'));
    await fits(page, kind + ' catalogue association without note', '.selected-detail .figure-usage', zoom);
    await shot(page, kind + '-usage-empty', usagePanel);
    await textScale(page, 1);
    const localInspector = page.locator('.catalogue .local-inspector');
    await localInspector.locator('summary').focus(); await page.keyboard.press('Enter');
    const syntheticRider = Buffer.alloc(2048);
    syntheticRider.set(Buffer.from('1f00000004c41e03', 'hex'), 84);
    syntheticRider.set([2, 0], 960);
    syntheticRider.set(Buffer.from('PC6V28', 'ascii'), 979);
    syntheticRider.set([0x20, 1, 1, 4], 985);
    await localInspector.locator('input').setInputFiles({ name: 'synthetic-rider.bin', mimeType: 'application/octet-stream', buffer: syntheticRider });
    await localInspector.getByText('Tank Star oder Hop Star', { exact: true }).waitFor();
    check(kind + ' local file reports ambiguous vehicle with source without exposing board code', (await localInspector.getByRole('link', { name: 'Messungen ansehen' }).count()) === 1 && !(await localInspector.innerText()).includes('PC6V28'));
    await localInspector.locator('input').setInputFiles({ name: 'synthetic-unknown-figure.bin', mimeType: 'application/octet-stream', buffer: unknownFigure });
    const unknownUsage = localInspector.locator('.figure-usage'); await unknownUsage.waitFor();
    check(kind + ' unknown synthetic public ID has no invented note', (await unknownUsage.innerText()).includes('Für diese ID ist hier kein Kataloghinweis hinterlegt'));
    await fits(page, kind + ' unknown synthetic figure', '.local-inspector .figure-usage', zoom);
    await shot(page, kind + '-usage-unknown', unknownUsage);
    await checkFigureDownloads(page, kind, zoom, touch);
    check(kind + ' no real Bluetooth request', await page.evaluate(() => window.__testBleRequests === 0));
    await context.close();
  }
  check('no browser runtime errors', errors.length === 0);
  check('no attempted external page requests', externalAttempts.length === 0);
} catch (error) { failure = { message: error.message, stack: error.stack }; throw error; }
finally {
  await fs.writeFile(path.join(output, 'collection-tools-browser-evidence.json'), JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(),
    scope: 'Exact production bundle, real DOM navigation/file inputs/keyboard/touch/download. Synthetic files only, no Vue state injection. A read-only synthetic GATT session checks device search and CSV. Real Bluetooth disabled. Two HTTPS fixtures fulfilled in memory, all other external requests blocked. Text zoom is explicit computed-font doubling, not browser optical zoom.',
    browser: browser.version(), buildRoot: root, deploymentBase: base, filesSha256: hashes, checks, layouts, downloads, screenshots, errors, fixtureRequests, externalAttempts, failure }, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify({ checks: checks.length, screenshots: screenshots.length, downloads: downloads.length, errors: errors.length, output }));
