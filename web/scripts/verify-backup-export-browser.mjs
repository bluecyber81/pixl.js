// Exercise the release bundle from the connect button to the downloaded ZIP.
// Only the Web Bluetooth peripheral and native save picker are replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {createBackup} from '../src/lib/backup.js';
import {loadBackupZip, readBackupArchiveFile} from '../src/lib/zip-import.js';
import {memoryVfs} from '../tests/helpers/memory-vfs.mjs';
import {installReadOnlyPeripheral} from './check-device-search-csv-browser.mjs';

const [dist, output, base = '/'] = process.argv.slice(2);
assert.ok(dist && output, 'Supply the production build and evidence directory.');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const JSZip = createRequire(import.meta.url)('../public/dfu/vendor/jszip-3.10.2.min.js');
const {version} = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url)));
const files = { 'E:/common.bin': Array(540).fill(3), 'E:/changed.bin': Array(540).fill(7), 'E:/large.bin': Array(600).fill(11) };
const previous = memoryVfs();
previous.nodes.delete('E:/tags');
for (const [name, bytes] of Object.entries(files)) previous.put(name, bytes);
previous.put('E:/changed.bin', Array(540).fill(5));
const original = await createBackup({rootPath:'E:/', firmwareVersion:'2.22.0-DE3.75', ...previous.api});
const input = {name:'previous.zip', mimeType:'application/zip', buffer:Buffer.from(await original.blob.arrayBuffer())};
const directories = { 'E:/': Object.entries(files).map(([p, data]) => [p.slice(3), data.length, 0]) };
const digests = Object.fromEntries(Object.entries(files).map(([p,data]) => [p, Array.from(createHash('sha256').update(Buffer.from(data)).digest())]));
await fs.mkdir(output, {recursive:true});
const server = await preview({base, build:{outDir:path.resolve(dist)}, preview:{host:'127.0.0.1', port:0, open:false}, logLevel:'error'});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
let browser;
async function run(firmwareVersion, width) {
  const context = await browser.newContext({locale:'de-DE', viewport:{width,height:850}, acceptDownloads:true, serviceWorkers:'block'});
  try {
    await context.addInitScript(installReadOnlyPeripheral,{files,directories,digests,capacity:{total:2097152,free:1048576},firmwareVersion});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === origin || ['data:','blob:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(9000);
    page.on('pageerror',e => errors.push(e.message));
    await page.goto(origin + base);
    await page.locator('.header-tools').getByRole('button',{name:'Verbinden',exact:true}).click();
    await page.locator('.version-context').getByText(firmwareVersion,{exact:true}).waitFor();
    await page.locator('.workspace-nav [aria-controls="backup-workspace"]').click();
    const panel = page.locator('#backup-workspace');
    await panel.getByRole('button',{name:'Laufwerk E: öffnen',exact:true}).click();
    await panel.locator('.workspace-location strong').getByText('E:/',{exact:true}).waitFor();
    const options = panel.locator('.backup-export-options').first();
    await options.locator('summary').click();
    await options.getByRole('checkbox').check();
    await options.locator('input[type=file]').setInputFiles(input);
    await options.getByText(/ZIP geprüft/).waitFor();
    const start = await page.evaluate(() => window.testPeripheral.commands.length);
    await panel.getByRole('button',{name:'Ordner sichern (ZIP)',exact:true}).click();
    const ready = page.locator('.backup-ready');
    const save = ready.getByRole('button',{name:'Sicherungs-ZIP speichern',exact:true});
    await save.waitFor();
    const download = page.waitForEvent('download');
    await save.click();
    const bytes = await fs.readFile(await (await download).path());
    const archive = await loadBackupZip(bytes,{JSZip});
    for (const [name, data] of Object.entries(files)) assert.deepEqual([...readBackupArchiveFile(archive,name)],data);
    const parsed = await JSZip.loadAsync(bytes);
    assert.equal(parsed.file('manifest.json')._data.compression.magic,'\x08\x00','Manifest uses DEFLATE.');
    const manifest = JSON.parse(await parsed.file('manifest.json').async('string'));
    assert.equal(manifest.exporter.version,version);
    assert.equal(manifest.firmwareVersion,firmwareVersion);
    const supported = firmwareVersion === '2.22.0-DE3.75';
    const expectedFull = supported ? 2 : 3, expectedReuse = supported ? 1 : 0;
    assert.equal(manifest.performance.operations.fileReads,expectedFull);
    assert.equal(manifest.performance.operations.previousZipFiles,expectedReuse);
    assert.equal(manifest.performance.operations.digestReplies,supported ? 2 : 0);
    assert.equal(manifest.performance.compressionRequested,'deflate');
    const trace = await page.evaluate(start => window.testPeripheral.commands.slice(start), start);
    assert.deepEqual(trace.filter(r=>r.cmd===0x12).map(r=>r.path).sort(),
      Object.keys(files).filter(p=>!(supported && p==='E:/common.bin')).sort());
    assert.equal(trace.filter(r=>r.cmd===0x16).length,2);
    assert.equal(trace.filter(r=>r.cmd===0x21).length,supported ? 2 : 0);
    assert.equal(trace.length,manifest.performance.transport.completedCommands);
    assert.equal(trace.length,manifest.performance.transport.txFrames);
    assert(manifest.performance.transport.rxFrames>trace.length,'Large notifications are counted separately.');
    await panel.getByText('Messwerte der letzten Sicherung',{exact:true}).click();
    const metrics = panel.locator('details').filter({has:page.locator('summary',{hasText:'Messwerte der letzten Sicherung'})});
    const metric = async text => (await metrics.locator('dt').getByText(text,{exact:true}).locator('xpath=following-sibling::dd[1]').textContent()).trim();
    assert.equal(await metric('Abgeschlossene Protokollbefehle'),String(trace.length));
    assert.equal(await metric('Vollständige Dateilesungen'),String(expectedFull));
    assert.equal(await metric('Bestätigte Dateien aus der früheren ZIP'),String(expectedReuse));
    assert.match(await ready.innerText(),new RegExp(expectedFull+' Dateien frisch vom Gerät gelesen'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.deepEqual(await page.evaluate(()=>window.testPeripheral.violations),[]);
    assert.deepEqual(errors,[]);
    return {firmwareVersion,width,zipBytes:bytes.length,fullReads:expectedFull,previousZipFiles:expectedReuse,transport:manifest.performance.transport};
  } finally { await context.close(); }
}
try {
  browser = await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.CHROME_EXECUTABLE});
  const results = [await run('2.22.0-DE3.75',390), await run('2.22.0-DE3.65',1280)];
  const report = {browser:browser.version(),results};
  await fs.writeFile(path.join(output,'backup-export-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  await server.close();
}
