// Inspect the deployed UI with the real VFS protocol and a read-only synthetic peripheral.
// node scripts/verify-file-workspace-browser.mjs <dist-pages> <evidence-folder> [--before]
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { installReadOnlyPeripheral } from './check-device-search-csv-browser.mjs';
import { publicFigureImage } from '../src/lib/figure-info.js';

const [buildDirectory, evidenceDirectory] = process.argv.slice(2);
assert.ok(buildDirectory && evidenceDirectory, 'Supply both the distribution and the output directory.');
const baseline = process.argv.includes('--before');
const expectedVersion = baseline ? '3.50.1' : JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version;
const output = path.resolve(evidenceDirectory);
await mkdir(output, {recursive:true});
const catalogue = JSON.parse(await readFile(new URL('../src/data/catalogue.json', import.meta.url)));
const imageUrl = publicFigureImage('0000000000000002', catalogue.commit);
const api = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(api);
const server = await preview({base:'/pixl.js/',build:{outDir:path.resolve(buildDirectory)},
  preview:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const browser = await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true});
const longFolder = 'Historische Sammlung Super Smash Bros Figuren Sonderedition';
const longFile = 'Super Mario in besonderer Ausgabe mit sehr langem Dateinamen.bin';
const secondFile = 'Mario in einer weiteren Ausgabe mit einem langen Dateinamen.bin';
const tmp = await mkdtemp(path.join(os.tmpdir(), 'allmiibo-file-workspace-'));
const local = path.join(tmp, 'Sammlung');
const note = Array.from(new TextEncoder().encode('Super Smash Bros.'));
const names = ['Animal Crossing','Kirby','The Legend of Zelda','Luigi.bin','Mario.bin','Peach.bin','Yoshi.bin'];
const dirs = {
  'E:/':[['amiibo',0,1]], 'E:/amiibo':[
    ['Peach.bin',540,0], ['Animal Crossing',0,1], ['Yoshi.bin',540,0], ['Mario.bin',540,0,[1,note.length,...note,3,0,0,0,0,2,0,0,0]],
    ['The Legend of Zelda',0,1], ['Kirby',0,1], ['Luigi.bin',540,0]
  ], 'E:/amiibo/Animal Crossing':[], 'E:/amiibo/The Legend of Zelda':[], 'E:/amiibo/Kirby':[]
};
const peripheral = {capacity:{total:2097152,free:1138688},files:{},directories:dirs,firmwareVersion:'2.22.0-DE3.74'};
const results = [];
try {
  await mkdir(path.join(local,longFolder), {recursive:true});
  await writeFile(path.join(local,longFolder,longFile),Buffer.from([1,2,3]));
  await writeFile(path.join(local,longFolder,secondFile),Buffer.from([4,5]));
  for (const locale of (baseline ? ['de-DE'] : ['de-DE','en-GB'])) {
    for (const [format,width,height] of [['Laptop',1440,1000],['Handy',390,844]]) {
      const de = locale === 'de-DE';
      const context = await browser.newContext({locale,viewport:{width,height},serviceWorkers:'block'});
      try {
        await context.addInitScript(installReadOnlyPeripheral,peripheral);
        // Allow only the selected public catalogue image out of this isolated context.
        await context.route('**/*', route => {
          const url = route.request().url();
          return (new URL(url).origin===origin || url===imageUrl) ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        page.setDefaultTimeout(8000);
        await page.goto(origin+'/pixl.js/');
        assert.equal(await page.title(),(de?'Allmiibo Dateimanager ':'Allmiibo File manager ')+expectedVersion);
        await page.locator('.header-tools').getByRole('button',{name:de?'Verbinden':'Connect',exact:true}).click();
        const section = page.locator('#file-workspace');
        await page.locator('.workspace-nav [aria-controls="file-workspace"]').click();
        await section.locator('[data-file-name^="E:/"]').click();
        await section.locator('[data-file-name="amiibo"]').click();
        const mario = section.locator('[data-file-name="Mario.bin"]');
        await mario.waitFor();
        const rowNames = () => section.locator('[data-file-name]').evaluateAll(nodes=>nodes.map(node=>node.dataset.fileName));
        const actualNames = await rowNames();
        assert.deepEqual([...actualNames].sort(),[...names].sort());
        if (!baseline) assert.deepEqual(actualNames,names);
        const notification = page.locator('.el-notification__closeBtn');
        if (await notification.isVisible()) await notification.click();
        const table = section.locator(baseline ? '.el-table' : '.directory-list').first();
        await table.scrollIntoViewIfNeeded();
        if (!baseline) {
          const dims=await table.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,available:el.clientWidth}));
          assert.ok(dims.width<=width && dims.scroll<=dims.available+2,JSON.stringify(dims));
        }
        if (de) await table.screenshot({path:path.join(output,'Dateiliste-'+expectedVersion+'-'+format+'.png'),animations:'disabled'});
        await mario.click();
        const panel = page.locator('.selection-context.has-selection');
        const photo = panel.getByRole('img',{name:'Mario',exact:true});
        await photo.waitFor();
        const picture = await photo.evaluate(async img=>{
          await img.decode();
          const box=img.getBoundingClientRect();
          return {src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,drawWidth:box.width,drawHeight:box.height};
        });
        assert.equal(picture.src,imageUrl);
        assert.ok(picture.width>1 && picture.height>1 && picture.drawWidth>1 && picture.drawHeight>1);
        if (!baseline && de) {
          if (format==='Laptop') {
            await table.scrollIntoViewIfNeeded();
            const region=await page.evaluate(()=>{
              const t=document.querySelector('.directory-list').getBoundingClientRect();
              const header=document.querySelector('.collection-main .section-heading').getBoundingClientRect();
              const p=document.querySelector('.selection-preview .preview-picture').getBoundingClientRect();
              const x=Math.max(0,Math.floor(scrollX+Math.min(t.left,header.left,p.left)-8));
              const y=Math.max(0,Math.floor(scrollY+Math.min(header.top,p.top)-14));
              return {x,y,width:Math.min(document.documentElement.scrollWidth-x,Math.ceil(scrollX+Math.max(t.right,p.right)-x+8)),
                height:Math.ceil(scrollY+Math.max(t.bottom,p.bottom)-y+8)};
            });
            await page.screenshot({path:path.join(output,'Figurenvorschau-Laptop.png'),fullPage:true,clip:region,animations:'disabled'});
          } else await page.screenshot({path:path.join(output,'Figurenvorschau-Handy.png'),animations:'disabled'});
        }
        if (format==='Handy') {
          await panel.locator('.mobile-preview-close').click();
          assert.equal(await panel.count(),0);
          assert.deepEqual(await rowNames(),actualNames);
        }
        if (!baseline) {
          const row=mario.locator('xpath=ancestor::tr[1]');
          if(format==='Laptop') await row.locator('.file-rename').click();
          else {
            await row.locator('.row-menu').click();
            await page.getByRole('menuitem',{name:de?/^Umbenennen/:/^Rename/i}).click();
          }
          const prompt=page.locator('.el-message-box:visible');
          assert.equal(await prompt.getByRole('textbox').inputValue(),'Mario.bin');
          await prompt.getByRole('button',{name:de?'Abbrechen':'Cancel',exact:true}).click();
          await prompt.waitFor({state:'hidden'});
          await checkNamePreflight(page,section,de);
        }
        assert.deepEqual(errors,[]);
        assert.deepEqual(await page.evaluate(()=>window.testPeripheral.violations),[]);
        results.push({locale,format,width,files:actualNames,picture,renameDialog:!baseline,targetNamePreflight:!baseline,deviceWrites:0});
        console.log(expectedVersion,locale,format,'passed');
      } finally { await context.close(); }
    }
  }
  await writeFile(path.join(output,'browser-file-workspace-'+expectedVersion+'.json'),JSON.stringify(results,null,2)+'\n');
} finally {
  await browser.close();
  await server.close();
  await rm(tmp,{recursive:true,force:true});
}

async function checkNamePreflight(page,section,de) {
  await section.locator('.file-toolbar').getByRole('button',{name:de?'Hochladen':'Upload',exact:true}).click();
  await page.locator('.upload-choice input[webkitdirectory]').setInputFiles(local);
  const dlg=page.getByRole('dialog').filter({has:page.locator('.sync-picker')});
  const editor=dlg.locator('.sync-name-review');
  await editor.waitFor();
  const compare=dlg.getByRole('button',{name:de?/Vergleich nur lesend erstellen/:/read.only comparison/i});
  const folderRow=editor.locator('[data-source="Sammlung/'+longFolder+'"]');
  const source=longFolder+'/';
  const rowFor=file=>editor.locator('[data-source="Sammlung/'+source+file+'"]');
  assert.equal(await compare.isDisabled(),true);
  const priorReadCount=await page.evaluate(()=>window.testPeripheral.commands.length);
  await folderRow.locator('input[type=text]').fill('Figuren');
  await rowFor(longFile).locator('input[type=text]').fill('Mario.bin');
  await rowFor(secondFile).locator('input[type=text]').fill('Mario.bin');
  assert.equal(await compare.isDisabled(),true);
  await rowFor(secondFile).getByRole('checkbox').check();
  assert.equal(await compare.isEnabled(),true);
  assert.equal(await page.evaluate(()=>window.testPeripheral.commands.length),priorReadCount);
  await compare.click();
  const planned=dlg.locator('.sync-plan');
  await planned.waitFor();
  await planned.getByText('Sammlung/Figuren/Mario.bin',{exact:false}).waitFor();
  assert.equal(await planned.locator('input[value="E:/amiibo/Sammlung/Figuren/Mario.bin"]').isChecked(),true);
  assert.ok(!(await planned.innerText()).includes(secondFile));
  assert.deepEqual(Array.from(await readFile(path.join(local,longFolder,longFile))),[1,2,3]);
}
