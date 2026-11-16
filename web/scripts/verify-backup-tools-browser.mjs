// Production UI, read-only synthetic Bluetooth peripheral, generated ZIP, no device access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {createBackup} from '../src/lib/backup.js';
import {loadBackupZip, readBackupArchiveFile} from '../src/lib/zip-import.js';
import {createRequire} from 'node:module';
import {memoryVfs, metadata} from '../tests/helpers/memory-vfs.mjs';
import {syntheticConfig, syntheticMini} from '../tests/fixtures/chameleon-slot-synthetic.mjs';
import {installReadOnlyPeripheral} from './check-device-search-csv-browser.mjs';

const [dist, output, base = '/'] = process.argv.slice(2);
const JSZip = createRequire(import.meta.url)('../public/dfu/vendor/jszip-3.10.2.min.js');
assert.ok(dist && output, 'Supply the production build and evidence directory.');
assert.match(base, /^\/(?:[\w.-]+\/)*$/);
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const longFolder = 'SyntheticCards', longName = 'A'.repeat(42) + '.bin';
assert.equal(longFolder.length, 14);
const source = memoryVfs();
source.nodes.delete('E:/tags');
for (const folder of ['E:/Sortiert', 'E:/' + longFolder, 'E:/amiibolink']) source.nodes.set(folder, {type:1, meta:metadata()});
const sample = new Uint8Array(540);
sample.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4]); sample[91] = 2;
const meta = {...metadata(), amiibo:{head:0, tail:2}};
for (const name of ['Mario.bin','Mario copy.bin']) source.put('E:/Sortiert/' + name, sample, meta);
const variant = sample.slice(); variant[150] = 1;
source.put('E:/Sortiert/Mario variant.bin', variant, meta);
source.put('E:/amiibolink/00.bin', sample, meta);
source.put('E:/' + longFolder + '/' + longName, new Uint8Array([1, 3]), metadata());
const {blob} = await createBackup({rootPath:'E:/', ...source.api, firmwareVersion:'2.22.0-DE3.75'});
const inputZip = {name:'collection.zip', mimeType:'application/zip', buffer:Buffer.from(await blob.arrayBuffer())};
const file = (name, bytes) => ({name, mimeType:'application/octet-stream', buffer:Buffer.from(bytes)});
const previous = memoryVfs();
previous.nodes.delete('E:/tags');
const root = 'E:/' + longFolder;
previous.nodes.set(root,{type:1, meta:metadata()});
const unchanged = root + '/' + longName, changed = root + '/changed.bin';
const current = {[unchanged]:Array(192).fill(8), [changed]:Array(120).fill(3)};
for (const [name,bytes] of Object.entries(current)) {
  previous.put(name, Uint8Array.from(name === changed ? Array(120).fill(1) : bytes), metadata());
}
const baseline = await createBackup({rootPath:'E:/', ...previous.api, firmwareVersion:'2.22.0-DE3.75'});
const previousZip = {...inputZip, name:'previous.zip', buffer:Buffer.from(await baseline.blob.arrayBuffer())};
const digests = Object.fromEntries(Object.entries(current).map(([key,bytes])=>[key,
  [...createHash('sha256').update(Buffer.from(bytes)).digest()]]));
const peripheral = {capacity:{total:2097152,free:1138688}, files:current, digests, firmwareVersion:'2.22.0-DE3.75',
  directories:{'E:/':[[longFolder,0,1]], [root]:[[longName,192,0],['changed.bin',120,0]]}};
const result = [];
await fs.mkdir(output,{recursive:true});
const server = await preview({base, build:{outDir:path.resolve(dist)}, preview:{host:'127.0.0.1',port:0,open:false}, logLevel:'error'});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
let browser;
async function assertLayout(panel, page) {
  const sizes = await panel.evaluate(el=>({width:el.clientWidth, scroll:el.scrollWidth, document:document.documentElement.scrollWidth}));
  assert.ok(sizes.width > 0 && sizes.scroll <= sizes.width + 1 && sizes.document <= page.viewportSize().width + 1,JSON.stringify(sizes));
}
async function run(context, locale, width) {
  const de = locale === 'de-DE', label = (german,english) => de ? german : english;
  await context.addInitScript(installReadOnlyPeripheral,peripheral);
  await context.route('**/*', route=>route.request().url().startsWith(origin+'/') || route.request().url().startsWith('blob:') ?route.continue():route.abort());
  const page=await context.newPage(), errors=[];
  page.setDefaultTimeout(9000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+base);
  const workspace = target => page.locator('.workspace-nav [aria-controls="'+target+'"]').click();

  await workspace('catalogue-workspace');
  const offline=page.locator('details.zip-collection');
  await offline.locator(':scope > summary').click();
  const picker=offline.locator('input[type=file]');
  await picker.setInputFiles(inputZip);
  const area = offline.locator('section[aria-label]');
  await area.getByRole('status').getByText(label('Prüfung abgeschlossen','Check complete')).waitFor();
  assert.match(await area.textContent(), /1 \/ 956/);
  assert.match(await area.textContent(), de ? /3 Figurendateien gelesen/ : /3 figure files read/);
  await area.locator('select').selectOption('duplicates');
  const duplicate = area.locator('li').first();
  await duplicate.waitFor();
  assert.match(await duplicate.textContent(), de ? /3 Dateien/ : /3 files/);
  assert.match(await duplicate.textContent(), de ? /2 (verschiedene|unterschiedliche)/ : /2 distinct file contents/);
  await assertLayout(offline,page);
  await offline.locator('select').first().selectOption('E:/amiibolink');
  await area.getByText(de ? /Slots werden separat gezählt/ : /Slots are counted separately/).waitFor();
  await picker.setInputFiles(file('broken.zip',[4,5,6]));
  await offline.getByRole('alert').waitFor();
  assert.equal(await area.count(),0);
  await picker.setInputFiles(inputZip);
  await area.getByRole('status').waitFor();

  await workspace('device-overview');
  const mini=page.locator('.card-slot-inspection');
  await mini.locator(':scope > summary').click();
  await mini.locator('input').first().setInputFiles(file('config.bin',syntheticConfig(1000)));
  await mini.locator('select').selectOption('0');
  await mini.locator('input').nth(1).setInputFiles(file('00.bin',syntheticMini()));
  await mini.getByText(label('Die Dateistruktur passt zu MIFARE Mini.','The file layout matches MIFARE Mini.'),{exact:true}).waitFor();
  assert.match(await mini.innerText(),de ? /Werksdaten von DE3.75 verglichen: abweichend/ : /DE3.75 factory data: different/);
  assert.equal(await mini.getByRole('button',{name:label('Korrigierte Kopie herunterladen','Download corrected copy')}).count(),0);
  await assertLayout(mini,page);
  assert.equal(await page.evaluate(()=>window.testPeripheral.connections),0,'Local ZIP/slot checks must work before connecting.');

  await workspace('backup-workspace');
  const backup=page.locator('#backup-workspace');
  const migration = backup.locator('details.migration-panel');
  await migration.locator(':scope > summary').click();
  const targetProfile = migration.getByLabel(label('Ziel-Firmware für die lokale Platzprüfung','Target firmware for the local capacity check'));
  assert.equal(await targetProfile.inputValue(), 'current');
  assert.equal(await targetProfile.locator('option:checked').innerText(), 'DE3.75 / 648');
  await migration.getByText(/DE3\.72–DE3\.77 \/ 645–650 \+ DE3\.79–DE3\.80 \/ 652–653/).waitFor();
  await migration.locator(':scope > summary').click();
  const options=backup.locator('details.backup-export-options').first();
  await options.locator(':scope > summary').click();
  const compress=options.getByRole('checkbox');
  assert.equal(await compress.isChecked(),false);
  await compress.check();
  const previousPicker=options.locator('input[type=file]');
  await previousPicker.setInputFiles(file('damaged.zip',[1,2,3]));
  await options.getByText(de?/konnte nicht als Allmiibo-Sicherung/:/could not be verified/).waitFor();
  await previousPicker.setInputFiles(previousZip);
  await options.getByText('previous.zip',{exact:false}).waitFor();
  await options.getByRole('button',{name:label('Auswahl entfernen','Clear selection')}).click();
  await previousPicker.setInputFiles(previousZip);
  await options.getByText('previous.zip',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.testPeripheral.connections),0);
  await assertLayout(options,page);
  await page.locator('.header-tools').getByRole('button',{name:label('Verbinden','Connect'),exact:true}).click();
  await backup.getByRole('button',{name:de?/Laufwerk E: öffnen/:/Open drive E:/}).click();
  await options.getByText(de?/ZIP geprüft/:/ZIP verified/).waitFor();
  await backup.getByRole('button',{name:label('Ordner sichern (ZIP)','Back up folder (ZIP)'),exact:true}).click();
  const save=page.getByRole('button',{name:label('Sicherungs-ZIP speichern','Save backup ZIP'),exact:true});
  const [download]=await Promise.all([page.waitForEvent('download'),save.click()]);
  const bytes=await fs.readFile(await download.path());
  const verified=await loadBackupZip(bytes,{JSZip});
  for(const [key,expected] of Object.entries(current)) {
    assert.deepEqual([...await readBackupArchiveFile(verified,key)],expected);
  }
  const resultZip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  const manifest=JSON.parse(await resultZip.file('manifest.json').async('string'));
  assert.equal(manifest.performance.compressionRequested,'deflate');
  for(const item of manifest.entries.filter(entry=>entry.type==='file')) {
    assert.equal(resultZip.file(item.archivePath)._data.compression.magic.charCodeAt(0),8);
  }
  assert.equal(manifest.performance.operations.previousZipFiles,1);
  assert.equal(manifest.performance.operations.fileReads,1);
  const commands=await page.evaluate(()=>window.testPeripheral.commands);
  assert.deepEqual(commands.filter(row=>row.cmd===0x21).map(row=>row.path).sort(),Object.keys(current).sort());
  assert.deepEqual(commands.filter(row=>row.cmd===0x12).map(row=>row.path),[changed]);
  const measurements=backup.locator('details.backup-export-options').nth(1);
  await measurements.locator(':scope > summary').click();
  await measurements.getByText(label('Bestätigte Dateien aus der früheren ZIP','Verified files reused from previous ZIP')).waitFor();
  await assertLayout(measurements,page);
  await workspace('file-workspace');
  const files=page.locator('#file-workspace');
  await files.locator('[data-file-name="'+longFolder+'"]').click();
  const row=files.locator('[data-file-name="'+longName+'"]').locator('xpath=ancestor::tr[1]');
  if (width>=1000) await row.locator('.file-rename').click();
  else {
    await row.locator('.row-menu').click();
    await page.getByRole('menuitem',{name:de?/^Umbenennen/:/^Rename/i}).click();
  }
  const prompt=page.locator('.el-message-box:visible');
  await prompt.getByText(de?/Pfad 1, Name 1/:/path 1, name 1/).waitFor();
  const input=prompt.getByRole('textbox');
  await input.fill(longName+'ö');
  await prompt.getByText(de?/Um 1 Byte zu lang/:/1 bytes? over the limit/).waitFor();
  await prompt.getByText(de?/Pfad -1, Name -1/:/path -1, name -1/).waitFor();
  const invalid=prompt.getByText(de?/unter Windows sicherbaren Namen/:/name that can also be backed up on Windows/i);
  await input.fill('a/b');
  await invalid.waitFor();
  await input.fill('');
  await prompt.getByRole('button',{name:'OK',exact:true}).click();
  await invalid.waitFor();
  await input.fill(longName);
  await invalid.waitFor({state:'hidden'});
  await prompt.getByText(de?/Pfad 1, Name 1/:/path 1, name 1/).waitFor();
  await prompt.getByRole('button',{name:label('Abbrechen','Cancel'),exact:true}).click();

  await workspace('backup-workspace');
  await page.locator('#backup-workspace').getByRole('button',{name:label('ZIP importieren','Import ZIP'),exact:true}).click();
  const dialog=page.getByRole('dialog'), advice=dialog.locator('.zip-path-advice');
  await dialog.locator('input[type=file]').setInputFiles(inputZip);
  await advice.locator(':scope > summary').click();
  // External root prefix maps the same near-limit path into a deeper folder.
  const warning=advice.locator('li').filter({hasText:longName});
  assert.match(await warning.innerText(),de?/Um 14 Byte zu lang/:/14 bytes over the limit/);
  await assertLayout(advice,page);
  assert.deepEqual(await page.evaluate(()=>window.testPeripheral.violations),[]);
  assert.deepEqual(errors,[]);
  return {locale,width,capacityReference:648,capacityRangeEnd:653,offlineDistinctIds:1,offlineFiles:3,variants:2,slotReadOnly:true,repeatBackupDigests:2,verifiedFilesReused:1,changedFileRead:1,deflateFiles:2,initialNameAndPathRemaining:1,remappedPathExcess:14,deviceWrites:0};
}
try {
  browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.CHROME_EXECUTABLE});
  for(const locale of ['de-DE','en-GB']) for (const width of [320,1280]) {
    const context=await browser.newContext({locale, viewport:{width,height:900},serviceWorkers:'block'});
    try { result.push(await run(context,locale,width)); } finally { await context.close(); }
  }
  const report={browser:browser.version(), results:result};
  await fs.writeFile(path.join(output,'backup-tools-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  if(browser) await browser.close();
  await server.close();
}
