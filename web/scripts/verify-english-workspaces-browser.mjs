// Browser-only English smoke test. Fixture values come from the host test suite.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { diagnosticSnapshot } from '../tests/fixtures/diagnostic-overview-data.mjs';

const [directory, base, report] = process.argv.slice(2);
assert.ok(directory && report && ['/', '/pixl.js/'].includes(base),
  'Usage: node scripts/verify-english-workspaces-browser.mjs <dist> </ or /pixl.js/> <report.json>');
const root = path.resolve(directory);
const origin = 'http://127.0.0.1:8765';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const checks = [], errors = [];
const germanUi = /(?<![\p{L}\p{N}_])(?:Dateimanager|Datei(?:en)?|Sicherung|Wiederherstellung|Ordner|Gerät(?:e|es)?|Speicher|Prüfung|Einstellungen|Fernbedienung|Gesperrt|Abbrechen|Auswählen|Laufwerk|Übertragung|Übertragen|Figurenkatalog|Verbunden|Trennen|Herunterladen|Auslesen|Vorschau|Berechtigungen|Aktualisieren|Öffnen|Geöffnet|Wählen|Fehler|Neuheiten|Hinweise|Versionen|Warten|bereitgestellt|Unbekannt|Verbindung)(?![\p{L}\p{N}_])/iu;
const views = [
  ['file-workspace', 'Files', ['Search names and notes', 'Upload', 'Refresh']],
  ['backup-workspace', 'Backup', ['Backup & restore', 'Back up folder (ZIP)', 'Open folder:']],
  ['update-workspace', 'Update', ['Update device', 'Check firmware and open DFU']],
  ['remote-workspace', 'Remote control', ['Remote control · menu and files', 'Enable BLE remote']],
  ['device-overview', 'Device & diagnostics', ['Device, storage and connection', 'Firmware']],
  ['catalogue-workspace', 'Figure catalogue', ['Explore figures', 'Name, series or public ID']],
];
const expandedPanels = {
  'backup-workspace': [['.migration-panel', 'Choose backup']],
  'remote-workspace': [['.remote-help', 'The remote cannot wake a sleeping Allmiibo']],
  'catalogue-workspace': [['.filter-details.saved-filters', 'Save new filter']],
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE });
try {
  const context = await browser.newContext({ locale: 'en-GB', serviceWorkers: 'block' });
  // Fulfil all requests from the tested directory. Even an unexpected link cannot access the network.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith(base)) return route.abort();
    const pathname = decodeURIComponent(url.pathname.slice(base.length));
    const file = path.resolve(root, pathname || 'index.html');
    if (!file.startsWith(root + path.sep)) return route.abort();
    try {
      const body = await readFile(file);
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body });
    } catch {
      return route.fulfill({ status: 404, body: 'Missing test asset' });
    }
  });
  await context.addInitScript(() => {
    window.bluetoothRequests = 0;
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
      requestDevice() { window.bluetoothRequests++; throw Error('Hardware requests are blocked in this test'); }
    } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(7000);
  await page.goto(origin + base);
  await page.getByRole('heading', { name: 'File manager', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.evaluate(data => {
    const app = document.querySelector('#app')._vnode.component.proxy;
    Object.assign(app, { connected: true, firmwareVersion: '2.22.0-DE3.67',
      current_dir: 'E:/', driveInfo: [{ label: 'E', status: 0, totalBytes: 2097152, freeBytes: 1048576 }],
      fullDiagnosticSnapshot: data });
  }, diagnosticSnapshot());

  for (const [id, navigation, expected] of views) {
    const tab = page.locator('.workspace-nav [aria-controls="' + id + '"]');
    assert.equal(await tab.locator('strong').innerText(), navigation);
    await tab.click();
    assert.equal(await tab.getAttribute('aria-current'), 'page');
    const section = page.locator('#' + id);
    for (const text of expected) {
      await page.waitForFunction(({ id, text }) => document.getElementById(id)?.innerText.includes(text), { id, text });
    }
    checks.push(navigation + ' opens with English labels and actions');
    for (const [selector, text] of expandedPanels[id] || []) {
      const panel = section.locator(selector);
      await panel.locator(':scope > summary').click();
      await panel.getByText(text, { exact: false }).first().waitFor();
      checks.push(navigation + ' expanded controls and help show English text');
    }
    const visible = await page.locator('main').evaluate(main => {
      const labels = [...main.querySelectorAll('[aria-label],[placeholder],[title],[alt]')]
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible')
        .flatMap(el => ['aria-label', 'placeholder', 'title', 'alt'].map(attr => el.getAttribute(attr) || ''));
      return [main.innerText, ...labels].join('\n');
    });
    const leaks = visible.split('\n').filter(text => germanUi.test(text));
    assert.deepEqual(leaks, [], navigation + ' shows German UI text: ' + leaks.join(' | '));
    checks.push(navigation + ' visible text and control attributes contain no common German interface labels');
  }
  assert.equal(await page.evaluate(() => window.bluetoothRequests), 0);
  assert.deepEqual(errors, []);
  checks.push('All six workspaces visited without a Bluetooth request or browser runtime error');
  await writeFile(report, JSON.stringify({ base, checks, browser: browser.version(), errors,
    scope: 'English desktop browser with synthetic connected-device state. Six workspace views and their visible control labels.' }, null, 2) + '\n');
  console.log(checks.length + ' English workspace checks passed for ' + base);
} finally {
  await browser.close();
}
