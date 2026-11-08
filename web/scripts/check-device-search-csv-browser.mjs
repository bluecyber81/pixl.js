import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Install only the browser peripheral boundary. The production BLE, protocol, VFS,
// catalogue, download and Vue code run unchanged in an isolated browser context.
function installReadOnlyPeripheral({files, capacity, firmwareVersion = '2.22.0-DE3.66'}) {
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const commands = [], violations = [];
  window.testPeripheral = { commands, violations, connections: 0 };
  const device = new EventTarget(), rx = new EventTarget();
  const uuid = suffix => '6e40000' + suffix + '-b5a3-f393-e0a9-e50e24dcca9e';
  const word = n => [n & 255, (n >>> 8) & 255];
  const dword = n => [...word(n), ...word(n >>> 16)];
  const string = s => { const bytes = encoder.encode(s); return [...word(bytes.length), ...bytes]; };
  const entry = (name, size, type) => [...string(name), ...dword(size), type, 0];
  let open;
  function payload(cmd, frame, record) {
    if (cmd === 3) return [80, 88, 68, 70, 1, 3, ...word(243), ...word(247)];
    if (cmd === 1) return string(firmwareVersion);
    if (cmd === 0x10) return [1, 0, 69, ...string('Test'), ...dword(capacity.total), ...dword(capacity.free)];
    if (cmd === 0x12 || cmd === 0x16) {
      const length = frame[4] | frame[5] << 8;
      record.path = decoder.decode(frame.subarray(6, 6 + length));
      if (cmd === 0x12 && frame[6 + length] === 8 && files[record.path] && !open) {
        open = record.path;
        return [1];
      }
      if (cmd === 0x16) {
        if (record.path === 'E:/') return [...entry('A', 0, 1), ...entry('B', 0, 1)];
        const file = files[record.path + '/Twin.bin'];
        if (file) return entry('Twin.bin', file.length, 0);
      }
    }
    if (cmd === 0x14 && frame[4] === 1 && open) return files[open];
    if (cmd === 0x13 && frame[4] === 1 && open) { open = null; return []; }
    violations.push(record);
    throw Error('Unexpected synthetic device operation: ' + JSON.stringify(record));
  }
  Object.assign(rx, {uuid:uuid(3), properties:{notify:true}, startNotifications:async () => rx, stopNotifications:async () => rx});
  const tx = {uuid:uuid(2), properties:{write:true}, async writeValueWithResponse(data) {
    const frame = new Uint8Array(data), cmd = frame[0], record = {cmd};
    commands.push(record);
    const bytes = payload(cmd, frame, record);
    for (let offset = 0, sequence = 0; offset < bytes.length || sequence === 0; offset += 243, sequence++) {
      const more = offset + 243 < bytes.length;
      rx.value = new DataView(Uint8Array.from([cmd, 0, ...word(sequence | (more ? 0x8000 : 0)), ...bytes.slice(offset, offset + 243)]).buffer);
      rx.dispatchEvent(new Event('characteristicvaluechanged'));
    }
  }};
  const service = {uuid:uuid(1), getCharacteristics:async () => [rx, tx]};
  Object.assign(device, {name:'Pixl.js', id:'synthetic-browser', gatt:{
    connected:false, async connect() { this.connected = true; return this; },
    getPrimaryServices:async () => [service],
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); }
  }});
  Object.defineProperty(navigator, 'bluetooth', {configurable:true, value:{requestDevice:async () => {
    window.testPeripheral.connections++;
    return device;
  }}});
  // Exercise real downloaded bytes via the Android-style save path without opening an OS picker.
  Object.defineProperty(window, 'showSaveFilePicker', {configurable:true, value:undefined});
}

async function checkDeviceCard(page, capacity, check, shot) {
  const card = page.locator('.sidebar-device');
  const notification = page.locator('.el-notification');
  if (await notification.isVisible()) {
    await notification.locator('.el-notification__closeBtn').click();
    await notification.waitFor({ state:'hidden' });
  }
  const sizes = [
    {name:'Desktop', width:1440, height:1000, suffix:''},
    {name:'Handyformat', width:390, height:844, suffix:'-Handy'}
  ];
  await page.locator('.workspace-nav [aria-controls="file-workspace"]').click();
  await page.locator('.file-name-action[data-file-name^="E:/"]').click();
  await page.locator('.file-name-action[data-file-name="A"]').waitFor();
  check('device card changes to the root listing from GATT', (await card.locator('.device-location').innerText()).trim() === 'E:/' &&
    (await card.locator('.device-count').innerText()).trim() === '2 Einträge');
  await page.locator('.file-name-action[data-file-name="A"]').click();
  await page.locator('.file-name-action[data-file-name="Twin.bin"]').waitFor();

  for (const size of sizes) {
    await page.setViewportSize({width:size.width, height:size.height});
    const meter = card.getByRole('meter', {name: /\S/});
    await meter.waitFor();
    const measured = await meter.evaluate(element => ({
      native:element instanceof HTMLMeterElement && element.matches('.device-used-meter'),
      min:element.min, used:element.value, total:element.max
    }));
    check(size.name + ' native accessible meter shows the used bytes out of total bytes',
      measured.native && measured.min === 0 && measured.used === capacity.total - capacity.free && measured.total === capacity.total);
    const freeText = await card.locator('.device-free').innerText();
    const percent = Math.round(100 * (capacity.total - capacity.free) / capacity.total);
    check(size.name + ' free capacity and used percentage match the synthetic drive', /976,56\s*KiB\s*frei/.test(freeText) &&
      new RegExp(percent + '\\s*%\\s*belegt').test(await card.locator('.device-used-label').innerText()));
    check(size.name + ' card displays the actual selected folder and its single entry',
      (await card.locator('.device-location').innerText()).trim() === 'E:/A' &&
      (await card.locator('.device-count').innerText()).trim() === '1 Eintrag' && /von 2\s*MiB/.test(await card.locator('.device-footnote').innerText()));
    const bounds = await card.boundingBox();
    check(size.name + ' card fits the viewport', bounds && bounds.x >= 0 && bounds.x + bounds.width <= size.width + 1);
    await shot(page, 'Geraetekarte-verbunden' + size.suffix, card, 'element');
    await page.evaluate(() => window.scrollTo({ top:0, behavior:'instant' }));
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'Dateimanager-verbunden' + size.suffix, card, 'viewport');
  }
  await page.locator('.header-tools').getByRole('button', {name:'Trennen', exact:true}).click();
  await page.locator('.header-tools').getByRole('button', {name:'Verbinden', exact:true}).waitFor();
  for (const size of sizes) {
    await page.setViewportSize({width:size.width, height:size.height});
    const contents = await card.innerText();
    check(size.name + ' discards previous device capacity, path and entry count on disconnect',
      !await card.getByRole('meter').count() && !await card.locator('.device-free, .device-used-label, .device-location, .device-count').count() &&
      !/976[,.]56|E:\/A|\b1\s+(Datei|Eintrag)/i.test(contents));
  }
}

export async function checkDeviceSearchAndCsv({browser, url, check, shot}) {
  const context = await browser.newContext({locale:'de-DE', deviceScaleFactor:2, acceptDownloads:true, serviceWorkers:'block'});
  const capacity = {total:2097152, free:1000000};
  const files = {};
  for (const [folder, id] of [['A','0000000000000002'], ['B','0000000000340102']]) {
    const figure = Buffer.alloc(540);
    figure.set([4, 1, 2, 0x8f, 3, 4, 5, 6, 4]);
    figure.set(Buffer.from(id, 'hex'), 84);
    files['E:/' + folder + '/Twin.bin'] = [...figure];
  }
  try {
    const runtimeErrors = [], external = [];
    await context.addInitScript(installReadOnlyPeripheral, {files, capacity});
    await context.route('**/*', route => {
      const target = new URL(route.request().url());
      if (target.origin === new URL(url).origin || ['data:', 'blob:'].includes(target.protocol)) return route.continue();
      external.push(target.origin);
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto(url);
    await page.locator('.header-tools').getByRole('button', {name:'Verbinden', exact:true}).click();
    await page.locator('.version-context').getByText('2.22.0-DE3.66', {exact:true}).waitFor();
    const search = page.locator('.device-search');
    await search.locator('summary').click();
    const query = search.getByRole('searchbox');
    await query.fill('Twin');
    await search.getByRole('button', {name:'Suchen', exact:true}).click();
    await search.getByText('Suche abgeschlossen.', {exact:false}).waitFor();
    const selected = 'E:/B/Twin.bin';
    const fileAction = search.getByRole('button', {name:'Vom Gerät herunterladen · ' + selected, exact:true});
    const [bin] = await Promise.all([page.waitForEvent('download'), fileAction.click()]);
    check('search click downloads the exact selected remote file bytes', bin.suggestedFilename() === 'Twin.bin' &&
      (await readFile(await bin.path())).equals(Buffer.from(files[selected])));
    check('direct download preserves the search, both duplicate names and current folder', await query.inputValue() === 'Twin' &&
      await search.locator('.search-results li').count() === 2 && await fileAction.isVisible() &&
      (await page.locator('.quick-location').innerText()).includes('Laufwerk auswählen'));
    const history = () => page.evaluate(() => window.testPeripheral.commands);
    const afterDownload = await history();
    assert.deepEqual(afterDownload.filter(call => call.cmd === 0x12).map(call => call.path), [selected]);
    await page.locator('.workspace-nav button[aria-controls="catalogue-workspace"]').click();
    const collection = page.locator('.collection-assistant');
    await collection.getByRole('button', {name:'Sammlung prüfen', exact:true}).click();
    const csvAction = collection.getByRole('button', {name:'Bestand als CSV speichern'});
    await csvAction.waitFor();
    const afterAudit = await history();
    check('full inventory read both synthetic files through the BLE protocol',
      JSON.stringify(afterAudit.slice(afterDownload.length).filter(call => call.cmd === 0x12).map(call => call.path).sort()) ===
      JSON.stringify(Object.keys(files).sort()));
    const [csv] = await Promise.all([page.waitForEvent('download'), csvAction.click()]);
    const bytes = await readFile(await csv.path()), rows = bytes.toString('utf8').split('\r\n');
    check('CSV downloads as UTF-8 with both distinct confirmed catalogue IDs and device paths', csv.suggestedFilename() === 'Allmiibo-Figurenbestand.csv' &&
      bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) &&
      rows.some(row => row.includes('"0x0000000000000002";"Vorhanden · ID bestätigt";"E:/A/Twin.bin"')) &&
      rows.some(row => row.includes('"0x0000000000340102";"Vorhanden · ID bestätigt";"E:/B/Twin.bin"')));
    assert.deepEqual(await history(), afterAudit);
    const state = await page.evaluate(() => ({connections:window.testPeripheral.connections, violations:window.testPeripheral.violations}));
    check('CSV export uses the completed result with zero further device calls and a single connection', state.connections === 1 && !state.violations.length);
    const cardPage = await context.newPage();
    cardPage.on('pageerror', error => runtimeErrors.push(error.message));
    await cardPage.goto(url);
    await cardPage.locator('.header-tools').getByRole('button', {name:'Verbinden', exact:true}).click();
    await cardPage.locator('.version-context').getByText('2.22.0-DE3.66', {exact:true}).waitFor();
    await checkDeviceCard(cardPage, capacity, check, shot);
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(external, []);
  } finally { await context.close(); }
  await checkStoredBackupControls({browser, url, check});
}

export async function checkStoredBackupControls({browser, url, check}) {
  const context = await browser.newContext({locale:'de-DE', acceptDownloads:true, serviceWorkers:'block'});
  try {
    await context.addInitScript(installReadOnlyPeripheral, {files:{'E:/A/Twin.bin':[1,2,3],'E:/B/Twin.bin':[4]},
      capacity:{total:2097152,free:1000000}, firmwareVersion:'2.22.0-DE3.65'});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const workspace = page.locator('#backup-workspace');
    const tab = page.locator('.workspace-nav').getByRole('button', {name:/Sicherung/});
    const option = workspace.getByRole('checkbox', {name:/Schließen des Browsers/});
    const resume = workspace.getByRole('button', {name:'Sicherung fortsetzen', exact:true});
    const ready = workspace.getByText('ZIP erstellt.', {exact:false});
    async function connect() {
      await page.locator('.header-tools').getByRole('button', {name:'Verbinden', exact:true}).click();
      await page.locator('.version-context').getByText('2.22.0-DE3.65', {exact:true}).waitFor();
      await tab.click();
      await workspace.getByRole('button', {name:'Laufwerk E: öffnen', exact:true}).click();
      await workspace.locator('.workspace-location strong').filter({hasText:'E:/'}).waitFor();
    }
    await page.goto(url);
    await connect();
    check('ordinary backup starts without a persistent checkpoint database',
      !await option.isChecked() && !await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'allmiibo-folder-backup')));
    await option.check();
    await workspace.getByRole('button', {name:'Ordner sichern (ZIP)',exact:true}).click();
    await ready.waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button',{name:'Sicherungs-ZIP speichern',exact:true}).click()]);
    check('opt-in folder backup creates a downloadable ZIP', /^allmiibo-backup-E-.*\.zip$/.test(download.suggestedFilename()) && !(await download.failure()));
    await page.reload();
    await tab.click();
    await ready.waitFor();
    check('saved checkpoint is visible after reload and needs a fresh connection', await option.isChecked() && await resume.isDisabled());
    await connect();
    await resume.click();
    await page.getByRole('button',{name:'Sicherungs-ZIP speichern',exact:true}).waitFor();
    await workspace.getByRole('button',{name:'Zwischenstand verwerfen',exact:true}).click();
    await page.locator('.el-message-box').getByRole('button',{name:'OK',exact:true}).click();
    await ready.waitFor({state:'detached'});
    check('resuming and discarding work through the built UI', !await resume.count() &&
      (await page.evaluate(() => testPeripheral.violations)).length === 0 && !errors.length);
  } finally { await context.close(); }
}
