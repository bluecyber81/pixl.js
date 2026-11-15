import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { installReadOnlyPeripheral } from './check-device-search-csv-browser.mjs';

const [buildDirectory] = process.argv.slice(2);
assert.ok(buildDirectory, 'Supply the built Pages directory.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await preview({ base: '/pixl.js/', build: { outDir: path.resolve(buildDirectory) },
  preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE });
const fixture = await mkdtemp(path.join(os.tmpdir(), 'allmiibo-copy-focus-'));
const folder = path.join(fixture, 'folder');
const id = '0000000000000002';
try {
  await mkdir(folder);
  await writeFile(path.join(folder, 'note.txt'), 'test');
  for (const [locale, width] of [['de-DE', 390], ['en-GB', 1440]]) {
    const de = locale.startsWith('de');
    const context = await browser.newContext({ locale, viewport: { width, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block' });
    try {
      await context.addInitScript(installReadOnlyPeripheral, { capacity: {total: 2097152, free: 1138688},
        files: {}, directories: {'E:/': [['Mario.bin',540,0,[3,0,0,0,0,2,0,0,0]]]},
        firmwareVersion: '2.22.0-DE3.75' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      await page.goto(origin+'/pixl.js/');
      await page.locator('.header-tools').getByRole('button',{ name:de?'Verbinden':'Connect', exact:true }).click();
      await page.locator('.workspace-nav [aria-controls="file-workspace"]').click();
      const files = page.locator('#file-workspace');
      await files.locator('[data-file-name^="E:/"]').click();
      const mario = files.locator('[data-file-name="Mario.bin"]');
      await mario.press('Enter');
      const panel = files.locator('.selection-context.has-selection');
      assert.ok(await panel.evaluate(node => node === document.activeElement));
      const copy = panel.locator('.figure-id-copy');
      await copy.getByRole('button').press('Enter');
      await copy.getByText(de ? 'ID kopiert.' : 'ID copied.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), id);
      await copy.getByRole('button').press('Escape');
      assert.equal(await panel.count(), 0);
      assert.ok(await mario.evaluate(node => node === document.activeElement));
      const row = mario.locator('xpath=ancestor::tr[1]');
      const renameButton = row.locator(width < 600 ? '.row-menu' : '.file-rename');
      await renameButton.press('Enter');
      if (width < 600) await page.getByRole('menuitem', {name: /^Umbenennen/}).press('Enter');
      const rename = page.locator('.el-message-box:visible');
      await rename.getByRole('textbox').press('Escape');
      await rename.waitFor({state:'hidden'});
      await page.waitForFunction(button => button === document.activeElement, await renameButton.elementHandle());
      const menuButton = row.locator('.row-menu');
      await menuButton.press('Enter');
      await page.getByRole('menuitem', {name:de ? /Eigenschaften/ : /Properties/i}).press('Enter');
      const properties = page.getByRole('dialog').filter({has:page.locator('.el-form')});
      await properties.waitFor();
      await properties.press('Escape');
      await properties.waitFor({state:'hidden'});
      await page.waitForFunction(button => button === document.activeElement, await menuButton.elementHandle());
      const upload = files.locator('.file-toolbar').getByRole('button',{ name:de?'Hochladen':'Upload', exact:true });
      await upload.press('Enter');
      const folderPicker = page.locator('.upload-choice input[webkitdirectory]');
      await folderPicker.focus();
      await folderPicker.setInputFiles(folder);
      const sync = page.getByRole('dialog').filter({ has: page.locator('.sync-picker') });
      await sync.locator('.sync-name-review, .sync-picker').first().waitFor();
      await sync.press('Escape');
      await sync.waitFor({state:'hidden'});
      await page.waitForFunction(button => button === document.activeElement, await upload.elementHandle());
      await page.locator('.workspace-nav [aria-controls="catalogue-workspace"]').click();
      const toggle = page.locator('.catalogue-toggle');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      const card = page.locator('.entries li').first().locator('.figure-id-copy');
      const catalogueId = await card.locator('code').innerText();
      await card.getByRole('button').press('Enter');
      await card.getByText(de?'ID kopiert.':'ID copied.', {exact:true}).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), catalogueId);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable:true,
        value:{ writeText: async () => { throw new DOMException('Denied','NotAllowedError'); } } }));
      await card.getByRole('button').press('Enter');
      await card.getByText(de ? /Kopieren fehlgeschlagen/ : /Copy failed/).waitFor();
      assert.equal(await card.locator('code').innerText(), catalogueId);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {value:undefined}));
      await card.getByRole('button').press('Enter');
      await card.getByText(de ? /Kopieren fehlgeschlagen/ : /Copy failed/).waitFor();
      assert.deepEqual(await page.evaluate(()=>window.testPeripheral.violations), []);
      console.log(locale, width, 'preview/catalogue clipboard success, denial, missing API; preview, rename, properties and upload focus passed');
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await server.close();
  await rm(fixture, { recursive: true, force: true });
}
