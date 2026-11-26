// Inspect the deployed UI with the real VFS protocol and a read-only synthetic peripheral.
// node scripts/verify-file-workspace-browser.mjs <dist-pages> <evidence-folder> [--before | --sticky] [--version=x.y.z]
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
const checkSticky = process.argv.includes('--sticky');
assert.ok(!(baseline && checkSticky), 'The historical comparison predates the sticky selection.');
const versionOverride = process.argv.find(arg=>arg.startsWith('--version='))?.slice('--version='.length);
const expectedVersion = versionOverride || (baseline ? '3.50.1' : JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version);
const output = path.resolve(evidenceDirectory);
await mkdir(output, {recursive:true});
const catalogue = JSON.parse(await readFile(new URL('../src/data/catalogue.json', import.meta.url)));
const imageUrl = publicFigureImage('0000000000000002', catalogue.commit);
const luigiImageUrl = publicFigureImage('00010000000c0002', catalogue.commit);
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
if (checkSticky) {
  const entries = Array.from({length:80}, (_,i) => ['Figur '+String(i+1).padStart(2,'0')+'.bin',540,0]);
  entries[0] = ['01 - Mario.bin',540,0,[3,0,0,0,0,2,0,0,0]];
  entries[64] = ['Figur 65 - Luigi.bin',540,0,[3,0,0,1,0,2,0,12,0]];
  dirs['E:/amiibo/Kirby'] = entries;
}
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
        // Allow only the public images actually selected during this test.
        await context.route('**/*', route => {
          const url = route.request().url();
          return (new URL(url).origin===origin || url===imageUrl || (checkSticky && url===luigiImageUrl)) ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        const errors = [], requested = new Set();
        page.on('request', request => requested.add(new URL(request.url()).pathname));
        page.on('pageerror', err => errors.push(err.message));
        page.setDefaultTimeout(8000);
        await page.goto(origin+'/pixl.js/');
        assert.equal(await page.title(),(de?'Allmiibo Dateimanager ':'Allmiibo File manager ')+expectedVersion);
        if (!baseline) {
          await page.waitForLoadState('networkidle');
          assert.ok(![...requested].some(p => /\/(?:catalogue|figure-usage)-[^/]+\.js$/i.test(p)), 'The cold start must defer both offline catalogues');
        }
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
        if (!baseline) assert.equal([...requested].filter(p => /\/catalogue-[^/]+\.js$/.test(p)).length, 1, 'One shared offline catalogue chunk for the preview');
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
        let stickySelection;
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
          if (checkSticky) stickySelection = await verifyScrollingSelection(page,section,format,de);
          await checkNamePreflight(page,section,de);
        }
        assert.deepEqual(errors,[]);
        assert.deepEqual(await page.evaluate(()=>window.testPeripheral.violations),[]);
        results.push({locale,format,width,files:actualNames,picture,renameDialog:!baseline,targetNamePreflight:!baseline,stickySelection,deviceWrites:0});
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

async function verifyScrollingSelection(page, section, format, de) {
  const file = name => section.locator('[data-file-name="'+name+'"]');
  const panel = section.locator('.selection-context.has-selection');
  await file('Kirby').click();
  await file('01 - Mario.bin').click();
  assert.equal(await section.locator('[data-file-name]').count(),80);
  const mario = panel.getByRole('img',{name:'Mario',exact:true});
  const luigi = panel.getByRole('img',{name:'Luigi',exact:true});
  const positionRow = row => row.evaluate(el => {
    // Leave the target clear of both the mobile navigation and the bottom sheet.
    const sheet=document.querySelector('.selection-context.has-selection');
    const bottomSheet=getComputedStyle(sheet).position==='fixed';
    const upper=bottomSheet?document.querySelector('.workspace-nav').getBoundingClientRect().bottom:0;
    const lower=bottomSheet?sheet.getBoundingClientRect().top:innerHeight;
    const rect=el.getBoundingClientRect();
    window.scrollBy({top:rect.top+rect.height/2-(upper+lower)/2,behavior:'instant'});
  });
  const imagePosition = image => image.evaluate(async el => {
    await el.decode();
    const box = el.getBoundingClientRect();
    return {top:box.top, pageY:scrollY, visible:box.top>=0 && box.bottom<=innerHeight &&
      document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===el};
  });
  await positionRow(file('Figur 30.bin'));
  const first = await imagePosition(mario);
  const next = file('Figur 65 - Luigi.bin');
  await positionRow(next);
  const second = await imagePosition(mario);
  assert.ok(second.pageY-first.pageY>500,'The long listing must actually scroll');
  assert.ok(first.visible && second.visible && Math.abs(second.top-first.top)<2,
    'Selected picture must stay visible while scrolling: '+JSON.stringify({first,second}));
  if (de) await page.screenshot({path:path.join(output,'Figur-beim-Scrollen-'+format+'.png'),animations:'disabled'});
  // Read to the end of the selected figure, independently of the file listing.
  const action = panel.locator('.preview-actions button').last();
  const scrollRange = await action.evaluate(el => {
    for (let parent=el.parentElement;parent && parent.closest('.selection-context');parent=parent.parentElement) {
      if (!['auto','scroll'].includes(getComputedStyle(parent).overflowY) || parent.scrollHeight<=parent.clientHeight) continue;
      parent.scrollTop=parent.scrollHeight;
      return parent.scrollTop;
    }
    return 0;
  });
  assert.ok(scrollRange>0,'The long figure information must be independently scrollable.');
  const actionVisible = await action.evaluate(el => {
    const box=el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
  });
  assert.ok(actionVisible,'The final action must be reachable in the panel.');
  assert.equal(await page.evaluate(()=>scrollY),second.pageY);
  await next.click();
  await luigi.waitFor();
  assert.equal(await luigi.getAttribute('src'),luigiImageUrl);
  assert.ok((await imagePosition(luigi)).visible,'The new selection must show its picture immediately.');
  if (format==='Handy') {
    await panel.locator('.mobile-preview-close').click();
    assert.equal(await panel.count(),0);
    assert.equal(await page.evaluate(()=>scrollY),second.pageY);
  }
  await section.locator('.folder-breadcrumbs').getByRole('button',{name:'amiibo',exact:true}).click();
  await file('Mario.bin').waitFor();
  return {entries:80,documentScroll:second.pageY-first.pageY,pictureTop:first.top,detailsScroll:scrollRange,
    nextPicture:'Luigi',returnToList:true};
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
  const folderSuggestion=folderRow.getByRole('button',{name:de?/Vorschlag übernehmen/:/Use suggested name/});
  await folderSuggestion.click();
  assert.notEqual(await folderRow.locator('input[type=text]').inputValue(),longFolder);
  await folderRow.locator('input[type=text]').fill('Figuren');
  const fileRow=rowFor(longFile);
  await fileRow.getByRole('button',{name:de?/Vorschlag übernehmen/:/Use suggested name/}).click();
  assert.match(await fileRow.locator('input[type=text]').inputValue(),/\.bin$/);
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
